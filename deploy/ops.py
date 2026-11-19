#!/usr/bin/env python3
"""Local privileged worker. Only the panel's administrator routes can reach its Unix socket."""
import concurrent.futures
import hashlib
import http.server
import ipaddress
import json
import os
import pathlib
import re
import shutil
import socket
import socketserver
import stat
import subprocess
import threading
import time
import uuid

BASE = pathlib.Path('/var/lib/bebra/ops')
SHARED = BASE / 'shared'
CONFIG = pathlib.Path('/etc/bebra-ops.json')
LOCK = threading.Lock()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=1)

def run(args, timeout=30):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Служба не выполнила операцию. Проверьте журнал администратора.')
    return result.stdout

def relative(value):
    if not isinstance(value, str) or len(value) > 1024 or '\\' in value or '\x00' in value:
        raise ValueError('Некорректный путь.')
    parts = pathlib.PurePosixPath(value.lstrip('/')).parts
    if not parts or any(p in ('.', '..') for p in parts):
        raise ValueError('Некорректный путь.')
    return parts

def root_for(endpoint, config):
    if endpoint.get('kind') == 'shared':
        return SHARED
    name = endpoint.get('uuid', '')
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', name):
        raise ValueError('Некорректный сервер.')
    return pathlib.Path(config['volumes']) / name

def open_parent(root, parts):
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        return fd
    except Exception:
        os.close(fd)
        raise

def transfer(data, config):
    src, dst = data['source'], data['target']
    sp, dp = relative(src['path']), relative(dst['path'])
    sr, dr = root_for(src, config), root_for(dst, config)
    if sr == dr and sp == dp:
        raise ValueError('Исходник и назначение совпадают.')
    sf = open_parent(sr, sp)
    try:
        df = open_parent(dr, dp)
    except Exception:
        os.close(sf)
        raise
    tmp = '.bebra-copy-' + uuid.uuid4().hex
    try:
        fd = os.open(sp[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=sf)
        with os.fdopen(fd, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise ValueError('Поддерживаются только обычные файлы. Папку сначала упакуйте в архив.')
            if shutil.disk_usage(dr).free < info.st_size + 512 * 1024**2:
                raise ValueError('Недостаточно свободного места на VPS.')
            limit = int(dst.get('limit_bytes', 0))
            if dst.get('kind') != 'shared':
                # du does not follow symlinks. Writes by the running application can race
                # this check, so Wings remains responsible for continuous quota enforcement.
                used = int(run(['du', '-sb', '--', str(dr)]).split()[0])
                if limit > 0 and used + info.st_size > limit:
                    raise ValueError('Недостаточно квоты диска назначения.')
            else:
                used = int(run(['du', '-sb', '--', str(SHARED)]).split()[0])
                if used + info.st_size > int(config.get('shared_limit_bytes', 20 * 1024**3)):
                    raise ValueError('Общее хранилище заполнено.')
            out = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=df)
            digest = hashlib.sha256()
            with os.fdopen(out, 'wb') as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
                    digest.update(chunk)
                target.flush()
                os.fsync(target.fileno())
                if dst.get('kind') != 'shared':
                    os.fchown(target.fileno(), dr.stat().st_uid, dr.stat().st_gid)
                os.fchmod(target.fileno(), stat.S_IMODE(info.st_mode) & 0o755)
            now = os.fstat(source.fileno())
            if (now.st_size, now.st_mtime_ns) != (info.st_size, info.st_mtime_ns):
                raise ValueError('Исходный файл изменился во время копирования. Повторите после остановки записи.')
            check = hashlib.sha256()
            with os.fdopen(os.open(tmp, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=df), 'rb') as verify:
                while chunk := verify.read(1024 * 1024):
                    check.update(chunk)
            if check.digest() != digest.digest():
                raise ValueError('Проверка копии не пройдена.')
            # Hard-link publication is atomic and never replaces an existing file.
            os.link(tmp, dp[-1], src_dir_fd=df, dst_dir_fd=df, follow_symlinks=False)
            os.unlink(tmp, dir_fd=df)
            if data.get('move'):
                current = os.stat(sp[-1], dir_fd=sf, follow_symlinks=False)
                if (current.st_ino, current.st_size, current.st_mtime_ns) != (info.st_ino, info.st_size, info.st_mtime_ns):
                    return {'message': 'Копия создана; исходник изменился и сохранён.', 'bytes': info.st_size}
                os.unlink(sp[-1], dir_fd=sf)
            return {'message': 'Перенос завершён.' if data.get('move') else 'Копия создана.', 'bytes': info.st_size}
    finally:
        try:
            os.unlink(tmp, dir_fd=df)
        except FileNotFoundError:
            pass
        os.close(sf)
        os.close(df)

def domain_name(value):
    value = str(value).strip().lower().encode('idna').decode('ascii')
    if len(value) > 253 or '.' not in value or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', s) for s in value.split('.')):
        raise ValueError('Укажите доменное имя без протокола, пути и порта.')
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return value
    raise ValueError('Нужен домен, а не IP-адрес.')

def domain(data, config):
    name = domain_name(data['domain'])
    answers = {r[4][0] for r in socket.getaddrinfo(name, 80, type=socket.SOCK_STREAM)}
    expected = set(config['public_ips'])
    if not answers or not answers.issubset(expected):
        raise ValueError('DNS домена должен указывать только на IP этого VPS. Отключите проксирование DNS на время проверки.')
    address = ipaddress.ip_address(data['ip'])
    allowed = set(config.get('target_ips', ['127.0.0.1', '172.18.0.1'])) | expected
    if str(address) not in allowed or address.version != 4 or not 1024 <= int(data['port']) <= 65535:
        raise ValueError('Недопустимый адрес сайта.')
    target = f'{address}:{int(data["port"])}'
    sites = pathlib.Path('/etc/nginx/conf.d')
    output = sites / ('bebra-site-' + name + '.conf')
    # Never claim a hostname already managed by another nginx configuration.
    dump = run(['nginx', '-T'])
    if not output.exists() and re.search(r'\bserver_name\s+[^;]*\b' + re.escape(name) + r'\b', dump):
        raise ValueError('Этот домен уже используется конфигурацией nginx.')
    old = output.read_bytes() if output.exists() else None
    common = f'location / {{ proxy_pass http://{target}; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }}'
    http = f'server {{ listen 80; server_name {name}; location ^~ /.well-known/acme-challenge/ {{ root /var/lib/bebra/acme; }} {common} }}\n'
    try:
        output.write_text(http)
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
        # ACME account/terms are configured by the administrator outside this API.
        run(['certbot', 'certonly', '--webroot', '-w', '/var/lib/bebra/acme', '-d', name, '--non-interactive', '--keep-until-expiring'], 180)
        cert = '/etc/letsencrypt/live/' + name
        output.write_text(f'server {{ listen 80; server_name {name}; location ^~ /.well-known/acme-challenge/ {{ root /var/lib/bebra/acme; }} location / {{ return 301 https://$host$request_uri; }} }}\nserver {{ listen 443 ssl; server_name {name}; ssl_certificate {cert}/fullchain.pem; ssl_certificate_key {cert}/privkey.pem; ssl_protocols TLSv1.2 TLSv1.3; client_max_body_size 0; {common} }}\n')
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
    except Exception:
        if old is None:
            output.unlink(missing_ok=True)
        else:
            output.write_bytes(old)
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
        raise
    record = {'domain': name, 'uuid': data['uuid'], 'https': True, 'created_at': int(time.time())}
    (BASE / ('domain-' + name + '.json')).write_text(json.dumps(record))
    return {'message': 'HTTPS подключён: https://' + name, **record}

def job(job_id, data):
    location = BASE / ('job-' + job_id + '.json')
    def save(value):
        temp = location.with_suffix('.tmp')
        temp.write_text(json.dumps(value, ensure_ascii=False))
        temp.replace(location)
    save({'id': job_id, 'status': 'running'})
    try:
        config = json.loads(CONFIG.read_text())
        result = transfer(data, config) if data['action'] == 'transfer' else domain(data, config)
        save({'id': job_id, 'status': 'done', 'result': result})
    except Exception as error:
        message = 'Файл назначения уже существует. Выберите другое имя.' if isinstance(error, FileExistsError) else 'Файл или папка не найдены.' if isinstance(error, FileNotFoundError) else str(error) if isinstance(error, ValueError) else 'Ошибка операции. Проверьте пути и доступность служб.'
        save({'id': job_id, 'status': 'failed', 'error': message[:300]})

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                raise ValueError('Некорректный запрос.')
            data = json.loads(self.rfile.read(size))
            action = data.get('action')
            if action == 'status':
                jid = data.get('id', '')
                if not re.fullmatch(r'[a-f0-9]{32}', jid):
                    raise ValueError('Некорректная задача.')
                result = json.loads((BASE / ('job-' + jid + '.json')).read_text())
            elif action == 'list':
                result = {'files': [{'name': f.name, 'size': f.stat().st_size} for f in SHARED.iterdir() if f.is_file() and not f.is_symlink() and not f.name.startswith('.bebra-')], 'domains': [json.loads(f.read_text()) for f in BASE.glob('domain-*.json')], 'jobs': [json.loads(f.read_text()) for f in sorted(BASE.glob('job-*.json'), key=lambda p:p.stat().st_mtime, reverse=True)[:20]]}
            elif action in ('transfer', 'domain'):
                with LOCK:
                    active = [f for f in BASE.glob('job-*.json') if json.loads(f.read_text()).get('status') in ('queued', 'running')]
                    if len(active) >= 8:
                        raise ValueError('Очередь заполнена. Дождитесь завершения задач.')
                    jid = uuid.uuid4().hex
                    (BASE / ('job-' + jid + '.json')).write_text(json.dumps({'id': jid, 'status': 'queued'}))
                    POOL.submit(job, jid, data)
                result = {'id': jid, 'status': 'queued'}
            else:
                raise ValueError('Неизвестная операция.')
            status_code = 200
        except Exception as error:
            result, status_code = {'error': str(error)[:300]}, 400
        body = json.dumps(result, ensure_ascii=False).encode()
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

if __name__ == '__main__':
    import grp
    BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
    SHARED.mkdir(exist_ok=True, mode=0o700)
    for f in BASE.glob('job-*.json'):
        value = json.loads(f.read_text())
        if value.get('status') in ('queued', 'running'):
            f.write_text(json.dumps({'id': value['id'], 'status': 'failed', 'error': 'Служба перезапущена. Проверьте назначение перед повтором.'}))
    sock = '/run/bebra-ops/control.sock'
    pathlib.Path(sock).unlink(missing_ok=True)
    with Server(sock, Handler) as server:
        os.chown(sock, 0, grp.getgrnam('www-data').gr_gid)
        os.chmod(sock, 0o660)
        server.serve_forever()
