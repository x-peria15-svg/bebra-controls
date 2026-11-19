# Security

Report vulnerabilities using this repository's **Security → Report a vulnerability** page. Do not put credentials, live tokens, server addresses, databases, screenshots of secrets, or exploit details against a live installation in public issues. If private reporting is unavailable, open an issue requesting a private contact without disclosing the vulnerability.

The web service must run behind HTTPS, bound to loopback or a private reverse-proxy network. It only connects to the operator-configured HTTPS Pterodactyl origin. Never expose its raw HTTP development endpoint publicly. Keep the panel, Wings, Docker and this application updated.

Browser credentials are retained in expiring, server-memory-only HTTP-only sessions; restarting the web service logs users out. Windows credentials use Electron safeStorage. Scoped credentials use dedicated non-administrator Pterodactyl service principals. They cannot create replacement keys or manage accounts. Revocation deletes their credentials and server memberships and requests active Wings sessions to disconnect. Expired grants are also cleaned up by the minute collector; a disconnected node may delay active socket termination. Operators should monitor collector and queue failures.

Anyone granted files, backups, console commands or startup-image permissions can read application secrets or execute code inside that server. Do not treat those permissions as read-only. Never share an administrator's personal panel API key. The application does not provide network DDoS protection.

Backend extensions modify an existing Pterodactyl installation. Back it up first. They target a Linux, single-node, MariaDB/MySQL panel with the traditional client-api middleware group. The installer stops on incompatible layouts. Panel upgrades may require reinstallation and compatibility testing. No independent security audit has been performed; 1.1 is a public beta.
