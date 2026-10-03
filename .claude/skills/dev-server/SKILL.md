---
name: dev-server
description: Restart the Vite dev server (bun run dev --host) and report the port and addresses it serves on. Use when the dev server is down, unreachable, or needs a restart, especially during remote control sessions.
allowed-tools: Bash(.claude/skills/dev-server/restart.sh)
---

Run `.claude/skills/dev-server/restart.sh`. It stops the server it previously started (if any), starts `bun run dev --host` in `web/` detached, and waits until Vite reports its URLs.

Reply with the Local and Network URLs from the script output, including the port. If the output says the port is in use, mention that Vite picked a different port. If the script fails, show the log tail it prints.
