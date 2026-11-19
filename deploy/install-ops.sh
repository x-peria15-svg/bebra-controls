#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
test "$(id -u)" = 0
command -v python3 >/dev/null
command -v nginx >/dev/null
command -v certbot >/dev/null
test -s /etc/bebra-ops.json || { echo 'Create /etc/bebra-ops.json from deploy/ops.example.json first.'; exit 1; }
install -d -m 755 /opt/bebra-ops
install -m 644 "$PROJECT_ROOT/deploy/ops.py" /opt/bebra-ops/ops.py
install -d -m 755 /var/lib/bebra/acme
chmod 600 /etc/bebra-ops.json
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/bebra-nginx <<'HOOK'
#!/bin/sh
/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/bebra-nginx
cat > /etc/systemd/system/bebra-ops.service <<'UNIT'
[Unit]
Description=Bebra Control local file and HTTPS operations
After=network-online.target nginx.service docker.service
[Service]
ExecStart=/usr/bin/python3 /opt/bebra-ops/ops.py
Restart=on-failure
RuntimeDirectory=bebra-ops
RuntimeDirectoryMode=0750
Group=www-data
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now bebra-ops.service
systemctl restart bebra-ops.service
echo 'Operations enabled. HTTPS issuance requires an existing administrator-configured certbot ACME account.'
