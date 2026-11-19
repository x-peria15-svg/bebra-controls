# Deployment

## Prerequisites and order

1. Install/configure Pterodactyl and Wings separately, with HTTPS and a working client API.
2. Clone this repository. For only standard console/files functionality, connect the Windows app immediately.
3. For graphs, scoped keys and resource management, back up the panel, install the extension and enable the collector.
4. Build/run the web container behind your existing HTTPS nginx virtual host.
5. Sign in with an existing client key. Administrators can then issue limited keys to recipients.

The extension's installer makes timestamped backups of changed route/kernel files. Database additions are `bebra_resource_samples` and `bebra_access_keys`. Middleware `BebraKeyGuard` applies to the panel client API and blocks service principals from account administration or replacement-key issuance. Expired keys are denied immediately on API calls; collector cleanup also requests active sockets to disconnect.

## Extension compatibility

Tested with PHP 8.3 and a traditional Pterodactyl `app/Http/Kernel.php` installation on Ubuntu 24.04, MariaDB and a single local node. Other layouts require review. The installer does not install the panel, reconfigure SSH/firewall, modify game worlds, accept game EULAs, or start created environments automatically.

After upgrading the panel, check route/middleware compatibility and reinstall the extension. Review timestamped backups before restoring files; do not overwrite newer panel code blindly. To disable, remove the Bebra route include and middleware entry after revoking all issued service keys, disable `bebra-history.timer`, and keep data tables until retention needs are understood. Removing only the middleware while service principals remain would weaken credential restrictions.

## Web environment

`deploy/.env` contains only instance settings, not user credentials:

```dotenv
PANEL_URL=https://panel.example.com
PUBLIC_URL=https://control.example.com/bebra/
```

The nginx example assumes the `/bebra/` path. If a dedicated hostname serves the app at `/`, adjust the nginx location and `PUBLIC_URL` together. Only the configured panel origin is accepted. HTTPS is mandatory in production; use explicit loopback HTTP only inside automated tests.

The web service is non-root, has a read-only root filesystem, dropped capabilities, a 512 MiB memory limit and no Docker socket or host filesystem mount. It does not need port 3100 exposed beyond loopback. Native client API credentials are stored only in session memory. Docker restart logs users out. Sessions have an absolute 12-hour lifetime; the application intentionally has no persistent “remember my root key” browser store.

Configure certificate renewal and your normal reverse-proxy request limits. Sign-in attempts are bounded and the service limits active sessions. This does not replace upstream anti-DDoS filtering. Use native panel backups and OS monitoring.

## Runtimes and files

`docker build -t bebra/apps:1.1.0 deploy/runtime` builds a local Pterodactyl-compatible Node.js/Python runtime. Existing compatible eggs take precedence. Minecraft Java uses an installed upload-JAR/Paper egg. Pumpkin requires a compatible uploaded Linux executable; binary libc/runtime requirements are the operator's responsibility.

Node.js projects use `index.js`, Python projects `main.py`; edit `start.sh` to install dependencies or change the launch command. Bind websites to `0.0.0.0` and use `PORT`. Uploads stream without whole-file buffering in Bebra, but panel/Wings limits and disk quotas remain in force. Use trusted release artifacts; no uploaded code is automatically considered safe.

Resource capacity is still enforced server-side. Reserve settings are budgets, not hard Linux limits. Memory/CPU/disk edits require a stopped environment. A selected public allocation does not modify firewall or upstream game-filter policy.

## Monitoring

```sh
docker compose -f deploy/compose.yaml logs --tail=50 web
systemctl status bebra-history.timer bebra-history.service
journalctl -u bebra-history.service --since today
```

History keeps 14 days. Hour/day/week views aggregate 1/5/30-minute buckets. Collection failures leave gaps, not fabricated zeroes. Some server types do not expose a Minecraft player count.
