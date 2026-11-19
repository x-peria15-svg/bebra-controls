# API and architecture

The Electron main process and web gateway both use `lib/panel-client.cjs`, which accepts an HTTPS origin and a client API credential. A method/path allowlist bounds all forwarded operations; renderer input cannot choose an arbitrary host or an Application API endpoint.

## Browser boundary

- `GET /api/config`: connection status and a per-session CSRF token; never the upstream credential.
- `POST /api/connect`: operator-configured panel URL plus client credential. Exact Origin validation, bounded sign-in attempts and capacity. Creates a Secure/HttpOnly/SameSite cookie.
- `POST /api/request`: bounded JSON containing allowlisted `PanelClient` options. Requires session, Origin and CSRF.
- `POST /api/upload`: authenticated streaming multipart upload to a fresh signed Wings URL.
- `GET /api/download`: authenticated streaming download from a validated signed panel/Wings origin.
- WebSocket `/api/console`: same-origin session-bound bridge; Wings credentials remain server-side. Commands use permission-checked REST, not arbitrary client WebSocket forwarding.
- `POST /api/disconnect`: destroys the session and its sockets.

All paths above are relative to the configured public base path (for example `/bebra`). The gateway is not a public multi-destination proxy.

## Optional authenticated panel routes

Under `/api/client/bebra`:

| Route | Access | Purpose |
|---|---|---|
| `GET /account` | Client | Resource-administrator capability |
| `GET /host` | Root admin | Local host memory overview |
| `GET/POST /system-reserve` | Root admin | Capacity budget |
| `GET/POST /servers/{id}/limits` | Root admin | Stopped-server resource limits |
| `GET /templates`, `POST /environments` | Root admin | Environment creation |
| `GET /servers/{id}/history?range=1h` | Owner/admin/assigned subuser | Aggregated resource samples; also `24h`, `7d` |
| `GET/POST /keys`, `DELETE /keys/{id}` | Root admin | Scoped service credentials |

Native user/file/power/backup operations keep Pterodactyl's existing authorization. History additionally checks membership before returning any rows. Issued-key service principals are non-admin and are limited to their assigned subusers/permissions. Service principals cannot manage their own account or mint replacement API credentials. The server, not UI visibility, is the authorization boundary.

## Scoped-key creation example

An authenticated root administrator submits:

```json
{
  "name": "Read-only helper",
  "servers": [1],
  "permissions": ["websocket.connect", "file.read"],
  "expires_days": 30
}
```

Server IDs are taken from the current panel, not hardcoded in the client. The full token is returned once. Never put real tokens into issues, examples, logs or screenshots. Revocation deletes every credential on the dedicated principal, removes memberships and calls Wings deauthorization; failed node contact is retried through the panel queue.

## Storage

Windows: encrypted local connection store. Browser: expiring sessions in memory. Panel: native encrypted API-key storage and Bebra metadata/resource tables. No telemetry endpoint, advertising integration, external script CDN or embedded host credential is included.
