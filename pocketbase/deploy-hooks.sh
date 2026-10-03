#!/usr/bin/env bash
# Copy every file in pocketbase/pb_hooks/ into the PocketBase container on the server
# (Coolify mounts the pocketbase-hooks volume at /app/pb_hooks), then restart it.
#
# Usage: pocketbase/deploy-hooks.sh
# Needs in the root .env:
#   DEPLOY_SSH=user@server              SSH target with docker access
#   DEPLOY_CONTAINER=pocketbase         optional: name filter for the container (default "pocketbase")
#   DEPLOY_SUDO=1                       optional: run docker with sudo
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
set -a
# shellcheck disable=SC1091
. "$root/.env"
set +a

: "${DEPLOY_SSH:?Set DEPLOY_SSH=user@server in .env}"
filter="${DEPLOY_CONTAINER:-pocketbase}"
docker="docker"
[[ "${DEPLOY_SUDO:-}" == 1 ]] && docker="sudo docker"

containers="$(ssh "$DEPLOY_SSH" "$docker ps --format '{{.Names}}' --filter name=$filter")"
count="$(printf '%s\n' "$containers" | grep -c . || true)"
if [[ "$count" != 1 ]]; then
  echo "Expected exactly one running container matching '$filter', found $count:" >&2
  printf '%s\n' "$containers" >&2
  echo "Set DEPLOY_CONTAINER in .env to a more specific name." >&2
  exit 1
fi
container="$containers"

echo "Copying hooks to $container:/app/pb_hooks ..."
# COPYFILE_DISABLE keeps macOS from adding ._ metadata files to the archive.
COPYFILE_DISABLE=1 tar -C "$root/pocketbase/pb_hooks" -cf - . | ssh "$DEPLOY_SSH" "$docker cp - $container:/app/pb_hooks"
ssh "$DEPLOY_SSH" "$docker exec $container ls -la /app/pb_hooks"

echo "Restarting $container ..."
ssh "$DEPLOY_SSH" "$docker restart $container" >/dev/null

# The import route answers 401 (needs login) once the hook is loaded, 404 if it is missing.
for _ in $(seq 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$POCKETBASE_URL/api/foodshare/import-recipe" || true)"
  [[ "$code" == 401 ]] && { echo "Hook loaded: import route answers 401 without login."; exit 0; }
  sleep 2
done
echo "PocketBase restarted, but the import route answered $code (expected 401)." >&2
exit 1
