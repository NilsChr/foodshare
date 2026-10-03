#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
pid_file="${TMPDIR:-/tmp}/foodshare-dev.pid"
log_file="${TMPDIR:-/tmp}/foodshare-dev.log"

kill_tree() {
  local child
  for child in $(pgrep -P "$1" || true); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

clean_log() {
  sed $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$log_file"
}

if [[ -f $pid_file ]]; then
  old_pid="$(cat "$pid_file")"
  if ps -p "$old_pid" -o command= 2>/dev/null | grep -q bun; then
    kill_tree "$old_pid"
  fi
  rm -f "$pid_file"
fi

cd "$root/web"
nohup bun run dev --host </dev/null >"$log_file" 2>&1 &
pid=$!
echo "$pid" >"$pid_file"

for _ in $(seq 60); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "dev server exited on startup:"
    clean_log | tail -20
    exit 1
  fi
  clean_log | grep -q 'Local:' && break
  sleep 0.5
done

if ! clean_log | grep -q 'Local:'; then
  echo "dev server did not report a URL within 30s (pid $pid); log: $log_file"
  exit 1
fi

sleep 0.3
echo "dev server running (pid $pid, log $log_file)"
clean_log | grep -E 'is in use' || true
clean_log | grep -oE '(Local|Network): +http://[^ ]+'
