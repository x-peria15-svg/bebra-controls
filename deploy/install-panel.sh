#!/bin/bash
set -euo pipefail
PANEL_ROOT="${1:-/var/www/pterodactyl}"
PANEL_ROOT="$(realpath "$PANEL_ROOT")"
test -f "$PANEL_ROOT/artisan"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
php "$PROJECT_ROOT/panel/install.php" "$PANEL_ROOT"
PHP_BIN="$(command -v php)"
cat > /etc/systemd/system/bebra-history.service <<UNIT
[Unit]
Description=Bebra Control resource history and access expiry
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=$PHP_BIN $PANEL_ROOT/bebra/collect.php
TimeoutStartSec=55
UNIT
cat > /etc/systemd/system/bebra-history.timer <<'UNIT'
[Unit]
Description=Collect Bebra resource samples every minute
[Timer]
OnBootSec=20
OnUnitActiveSec=60
AccuracySec=2
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now bebra-history.timer
systemctl start bebra-history.service
echo 'Optional application runtime: docker build -t bebra/apps:1.1.0 deploy/runtime'
