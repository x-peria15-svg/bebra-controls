# Bebra Control

**A Windows desktop app and self-hosted browser dashboard for Pterodactyl servers.** Manage Minecraft servers, bots and websites in one dark interface, with server-side permissions and scoped access credentials.

> Public beta. **Pterodactyl and Wings must already be installed.** This project does not turn an empty VPS into a hosting panel by itself. It is not affiliated with Pterodactyl, Minecraft, Microsoft, PaperMC or Nitrolaunch.

## Features

- Console, start/stop/restart and live resource statistics.
- CPU, RAM, disk and player-count graphs for the last hour, day and week.
- File editor, streamed uploads with progress and drag-and-drop, plugin files, backups and schedules.
- Resource budgets, system reserve and creation of separate project environments.
- Per-server people/permissions management.
- Scoped, expiring access keys with selected servers and permissions; one-time display and revocation.
- The same interface in a browser and in the Windows application.

Core console/file/backups features use the standard client API. **History, scoped keys, resource budgets and environment creation require the included panel extension.** Unsupported optional features fail closed; no administrator Application API key is embedded in the client.

## Windows

Download the Windows x64 ZIP from **Releases**, extract the **whole folder** and launch `Bebra Control.exe`. The app is not code-signed. Do not run it as administrator.

Connect with your HTTPS Pterodactyl origin and a client key beginning with `ptlc_`. Existing panel users can use their own client keys. An operator can also issue a scoped Bebra key: the recipient does not manually create a panel account. The extension automatically creates a dedicated non-admin service principal behind the scenes.

Your connection is stored only on your computer using Electron safeStorage. No connection profile, password or API key is shipped in the ZIP or repository. Scoped credentials do not grant VPS administration or the ability to create more credentials.

## Browser deployment

Requirements: an existing HTTPS Pterodactyl installation, Docker Compose and a domain/certificate you control. The web service only connects to the `PANEL_URL` configured by its operator.

```sh
git clone https://github.com/x-peria15-svg/bebra-controls.git
cd bebra-controls
cp deploy/.env.example deploy/.env
# Edit PANEL_URL and PUBLIC_URL. Never commit this file.
docker compose -f deploy/compose.yaml up -d --build
```

The container listens on **127.0.0.1:3100** on the host. Add the contents of `deploy/nginx-location.conf` inside your existing HTTPS virtual host, verify with `nginx -t`, then reload nginx. The example serves the app at `/bebra/`. Set `PUBLIC_URL` to that exact external URL. Do not expose the raw HTTP port publicly.

Sign in using a client API key or scoped key. The browser receives an HttpOnly, Secure, SameSite session cookie; upstream credentials stay in server memory, not localStorage. Sessions expire after 12 hours and are lost when the web service restarts. No cross-origin panel proxy is provided. Use a separate instance for each configured panel.

See [deployment details](docs/DEPLOYMENT.md) and [security notes](SECURITY.md).

## Optional panel extension

**Back up your panel database and files first.** Initial support targets Linux, MariaDB/MySQL, a single local node, and the traditional `app/Http/Kernel.php` Pterodactyl layout. The installer checks the middleware layout, creates Bebra tables and copies its routes/middleware with timestamped backups. Test compatibility again after a panel upgrade.

```sh
sudo bash deploy/install-panel.sh /var/www/pterodactyl
# Optional Node.js/Python project runtime:
docker build -t bebra/apps:1.1.0 deploy/runtime
```

The collector runs once per minute and retains 14 days of samples. Graphs **start accumulating after installation**; the app does not invent historical data. Player counts are queried for supported Java Minecraft environments. Other environments show no player data.

The operator issues scoped keys in **Overview → Access keys**: choose servers, permissions and lifetime. Keys are shown once; only metadata is listed afterward. Revocation removes all principal credentials and server memberships and requests active Wings consoles/SFTP sessions to disconnect. Expired grants are also cleaned up by the collector.

Environment templates use locally installed eggs, not fixed egg IDs. Public/internal allocation addresses can be configured using `BEBRA_PUBLIC_IP` and `BEBRA_INTERNAL_IP` in the panel environment. Creating an allocation **does not bypass your firewall**. New public ports must be explicitly permitted by your network policy. Uploaded JARs/binaries and custom Docker images remain the operator's responsibility; custom images must follow Pterodactyl startup conventions. This is not a core/plugin marketplace.

## Build from source

Node.js **24+** is required. npm is included with a normal Node.js installation.

```sh
npm ci
npm test
npm run check
npm start          # desktop development
npm run package   # Windows x64 directory under dist/
```

To develop the browser service locally:

```sh
# Production requires HTTPS. HTTP is allowed only for explicit loopback test fixtures.
PANEL_URL=https://panel.example.com PUBLIC_URL=https://control.example.com/bebra/ npm run web
```

The Windows app uses Electron; the browser gateway uses Node's HTTP/stream APIs and `ws`. The panel extension uses existing Pterodactyl/Laravel services. See [API/architecture](docs/API.md).

## Limits and status

- Pterodactyl is required; automatic empty-VPS provisioning is not included.
- The backend extension is a beta compatibility layer, not a replacement for panel updates or security review.
- Large files are streamed, but disk quotas, free space, upstream node limits and network interruptions still apply. Interrupted uploads are not resumable.
- Node/Python templates expect an uploaded project. Pumpkin/Java templates require compatible binaries/JARs; game EULAs and third-party licenses remain applicable.
- Resource edits require the selected server to be stopped. CPU is a quota, not a dedicated physical core. System reserve is a budget, not a Linux memory cgroup limit.
- Custom Docker images do not gain privileged mode, host mounts or Docker-socket access from this UI.
- No DDoS immunity, paid-service bypass or guaranteed ad blocking is provided.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Licensed under [Apache-2.0](LICENSE). Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
