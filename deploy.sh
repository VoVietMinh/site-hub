#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  —  safe pull + rebuild for the panel
#
# Handles the recurring "data/app.db-shm / data/app.db-wal would be
# overwritten" problem:  SQLite WAL files are runtime artefacts and must
# never be committed, but if they ended up in the server's git index they
# block every pull.  This script removes them from the index (once, silently)
# and discards local modifications before merging.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo "▶  Cleaning runtime artefacts from git index…"
git rm --cached data/app.db-shm data/app.db-wal data/app.db 2>/dev/null || true
git checkout -- data/app.db-shm data/app.db-wal 2>/dev/null || true

echo "▶  Pulling latest…"
git pull

echo "▶  Rebuilding and restarting panel container…"
docker compose -f docker-compose.yml -f docker-compose.ee.yml \
  up -d --build panel

echo "✓  Done."
