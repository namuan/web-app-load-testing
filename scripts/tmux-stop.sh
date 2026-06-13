#!/usr/bin/env bash
# Stop everything started by scripts/tmux-run.sh.
#
# 1. Kills the tmux session (which sends SIGTERM to every pane's child
#    process — the API, SPA, Playwright, Locust).
# 2. As a safety net, `pkill`s any stray `tsx server.ts` / `vite` /
#    `locust` processes and frees the API / SPA ports in case they were
#    launched outside tmux (e.g. via `nohup … &` in a separate shell).
#
# Usage:
#   ./scripts/tmux-stop.sh
#   SESSION=acme ./scripts/tmux-stop.sh   # custom session name
#
# Exit codes:
#   0  — everything stopped (or there was nothing to stop)
#   1  — a `pkill`/`lsof` step reported an error we couldn't recover from
#
# The script never refuses to run on partial state. If tmux isn't
# installed it skips the tmux kill and just cleans ports. If no session
# exists it reports and moves on. If no processes are bound to the
# ports, it says so and exits cleanly.

set -u

SESSION="${SESSION:-acme}"

# Load .env to honour the configured ports (best effort).
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

API_PORT="${API_PORT:-3000}"
APP_PORT="${APP_PORT:-5173}"
LOCUST_WEB_PORT="${LOCUST_WEB_PORT:-8089}"

# Pretty status helpers
say()  { printf '[stop] %s\n' "$*"; }
warn() { printf '[stop] WARN: %s\n' "$*" >&2; }
err()  { printf '[stop] ERROR: %s\n' "$*" >&2; }

# ---------- 1. Kill the tmux session ----------

if command -v tmux >/dev/null 2>&1; then
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    say "Killing tmux session '$SESSION'…"
    # `kill-session` sends SIGHUP to all pane processes (npm, tsx, vite,
    # node, locust, playwright) and then closes the session.
    tmux kill-session -t "$SESSION" || warn "tmux kill-session returned non-zero"
  else
    say "No tmux session named '$SESSION' was running."
  fi
else
  warn "tmux not installed; skipping session kill."
fi

# ---------- 2. Safety net: clean up processes & ports ----------

# Helper: kill anything bound to a port. Tries lsof first (most
# portable on macOS), then falls back to fuser.
free_port() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -v '[[:space:]]*$' || true)"
  fi

  if [ -n "$pids" ]; then
    say "Killing processes on port $port (PIDs: $(echo $pids | tr '\n' ' '))…"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
    # If still bound, report it.
    if command -v lsof >/dev/null 2>&1 && lsof -ti tcp:"$port" >/dev/null 2>&1; then
      warn "Port $port is still bound after kill."
      return 1
    fi
  else
    say "Port $port is free."
  fi
  return 0
}

# Helper: pkill a list of process-name patterns. Best-effort.
kill_patterns() {
  local pattern
  for pattern in "$@"; do
    if pgrep -fl "$pattern" >/dev/null 2>&1; then
      say "Killing processes matching: $pattern"
      # pkill returns 1 if no procs matched, which we treat as fine.
      pkill -f "$pattern" 2>/dev/null || true
    fi
  done
}

# 2a. Pattern-based kills (catches processes that may have escaped the
#     port check, e.g. orphaned locust workers, hung Playwright browsers).
kill_patterns \
  "tsx watch server.ts" \
  "tsx server.ts" \
  "vite" \
  "locust" \
  "playwright" \
  "chromium" \
  "headless_shell"

# 2b. Port-based kills (catches anything still bound to the configured
#     ports — duplicates with 2a are harmless; the second pass is a
#     no-op if the port is free).
free_port "$API_PORT" || true
free_port "$APP_PORT" || true
free_port "$LOCUST_WEB_PORT" || true

# 2c. The wait-for-services health checks are now expected to fail; do
#     one last health probe so the user can see clean state.
sleep 0.5
say "Final state:"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null --max-time 1 "http://localhost:${API_PORT}/health" 2>/dev/null; then
    warn "API at :${API_PORT} is still responding."
  else
    say "  API :${API_PORT}  — down ✓"
  fi
  if curl -fsS -o /dev/null --max-time 1 "http://localhost:${APP_PORT}" 2>/dev/null; then
    warn "SPA at :${APP_PORT} is still responding."
  else
    say "  SPA :${APP_PORT}  — down ✓"
  fi
  if curl -fsS -o /dev/null --max-time 1 "http://localhost:${LOCUST_WEB_PORT}" 2>/dev/null; then
    warn "Locust web UI at :${LOCUST_WEB_PORT} is still responding."
  else
    say "  Locust :${LOCUST_WEB_PORT}  — down ✓"
  fi
fi

if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$SESSION" 2>/dev/null; then
  warn "tmux session '$SESSION' is still alive."
  exit 1
fi

say "All clean."
exit 0
