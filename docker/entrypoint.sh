#!/bin/sh
set -e

# Ensure data directory exists and is writable by the runtime user (node, uid 1000).
DATA_DIR="${DATA_DIR:-/data}"
if [ -d "$DATA_DIR" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

if [ "$#" -gt 0 ]; then
  exec dumb-init -- "$@"
else
  exec dumb-init -- npx --no-install tsx src/index.ts
fi