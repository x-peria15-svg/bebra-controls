#!/bin/bash
set -e
cd /home/container
export PORT="${SERVER_PORT:-3000}"
exec bash -c "${STARTUP:-bash start.sh}"
