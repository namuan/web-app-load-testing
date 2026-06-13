#!/usr/bin/env bash
# One-command tmux orchestrator.
#
# Creates (or reattaches to) a tmux session named "acme" with four panes:
#
#   ┌────────────────────┬────────────────────┐
#   │  API (Fastify)     │  SPA (Vite)        │
#   ├────────────────────┼────────────────────┤
#   │  Playwright        │  Locust            │
#   └────────────────────┴────────────────────┘
#
# The Playwright and Locust panes wait until both services are healthy.
#
# Every pane is launched with an absolute path to the project root so the
# session is robust to being reattached from any working directory and to
# shells losing CWD state across invocations.
#
# tmux pane indices are renumbered after each `split-window`, so we
# perform all splits first, then `select-layout tiled` to get a stable
# 2x2 grid, and only then send commands to indices 0.0/0.1/0.2/0.3.

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SESSION="${SESSION:-acme}"

# Load .env (best effort)
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

API_PORT="${API_PORT:-3000}"
APP_PORT="${APP_PORT:-5173}"
LOCUST_WEB_PORT="${LOCUST_WEB_PORT:-8089}"

API_URL="http://localhost:${API_PORT}"
APP_URL="http://localhost:${APP_PORT}"

# Validate that the project path doesn't contain characters that would
# break the single-quoted strings we splice into pane commands.
case "$ROOT_DIR" in
  *"'"*)
    echo "[tmux-run] ERROR: project path contains a single quote: $ROOT_DIR" >&2
    exit 1
    ;;
esac

has_tmux=0
if command -v tmux >/dev/null 2>&1; then
  has_tmux=1
fi

# Fallback: no tmux available — run everything in the foreground.
run_foreground() {
  echo "[tmux-run] tmux not found. Starting services in the foreground."
  echo "[tmux-run] Tip: install tmux for the multi-pane experience."

  if ! curl -fsS -o /dev/null --max-time 2 "$API_URL/health"; then
    (cd "$ROOT_DIR/api" && npm run dev) &
    API_PID=$!
  fi
  if ! curl -fsS -o /dev/null --max-time 2 "$APP_URL"; then
    (cd "$ROOT_DIR/app" && npm run dev) &
    APP_PID=$!
  fi

  bash "$ROOT_DIR/scripts/wait-for-services.sh"

  echo "[tmux-run] Running Playwright once…"
  (cd "$ROOT_DIR/app" && npm run test:e2e) || echo "[tmux-run] Playwright exited with errors."

  echo "[tmux-run] Starting Locust web UI on http://localhost:${LOCUST_WEB_PORT}"
  echo "[tmux-run] Open that URL in your browser to start/stop load tests."
  echo "[tmux-run] Press Ctrl-C here to stop Locust and the dev services."
  echo "[tmux-run] Using the real-browser load test (one Chromium per user)."
  (cd "$ROOT_DIR" && locust -f loadtest/locustfile_browser.py --host="$APP_URL" -P "$LOCUST_WEB_PORT") || true

  echo "[tmux-run] Done. Killing services…"
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null || true
}

if [ $has_tmux -eq 0 ]; then
  run_foreground
  exit 0
fi

# If a session already exists, attach to it.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "[tmux-run] Reattaching to tmux session '$SESSION'."
  exec tmux attach -t "$SESSION"
fi

echo "[tmux-run] Creating tmux session '$SESSION' at $ROOT_DIR"

# Create the session and split into 4 panes.
# Order: start with one pane, then split right, then split left-bottom,
# then split right-bottom. Pane indices get renumbered after each
# split, but we'll apply `select-layout tiled` at the end so the final
# indices 0.0/0.1/0.2/0.3 correspond to top-left/top-right/bot-left/bot-right.
tmux new-session -d -s "$SESSION" -n "stack" -c "$ROOT_DIR" -x 220 -y 50
tmux split-window -h -t "$SESSION:0.0" -c "$ROOT_DIR"
tmux split-window -v -t "$SESSION:0.0" -c "$ROOT_DIR"
tmux split-window -v -t "$SESSION:0.1" -c "$ROOT_DIR"
tmux select-layout -t "$SESSION:0" tiled

# After select-layout tiled, the four pane indices are stable:
#   0.0 → top-left      (API)
#   0.1 → top-right     (SPA)
#   0.2 → bottom-left   (Playwright)
#   0.3 → bottom-right  (Locust)
API_PANE="$SESSION:0.0"
APP_PANE="$SESSION:0.1"
E2E_PANE="$SESSION:0.2"
LOCUST_PANE="$SESSION:0.3"

echo "[tmux-run] Pane assignment:"
echo "  API:        $API_PANE  (top-left)"
echo "  SPA:        $APP_PANE  (top-right)"
echo "  Playwright: $E2E_PANE  (bottom-left)"
echo "  Locust:     $LOCUST_PANE  (bottom-right, real-browser test)"

# ---------- Pane commands ----------
# Every command starts with `cd "$ROOT_DIR"` to guarantee the working
# directory is correct, even if the user reattaches and shells get reset.
# All script paths are absolute so we never depend on a relative lookup.

API_CMD="cd '$ROOT_DIR/api' && echo '[api] starting…' && npm run dev"
APP_CMD="cd '$ROOT_DIR/app' && echo '[app] starting…' && npm run dev"
E2E_CMD="cd '$ROOT_DIR' && echo '[playwright] waiting for services…' && bash '$ROOT_DIR/scripts/wait-for-services.sh' && echo '[playwright] running…' && cd '$ROOT_DIR/app' && npm run test:e2e"
LOCUST_CMD="cd '$ROOT_DIR' && echo '[locust] waiting for services…' && bash '$ROOT_DIR/scripts/wait-for-services.sh' && echo '[locust] starting web UI on http://localhost:${LOCUST_WEB_PORT} — open that URL in your browser to start/stop the test.' && echo '[locust] using real-browser load test (one Chromium per user).' && locust -f '$ROOT_DIR/loadtest/locustfile_browser.py' --host='$APP_URL' -P ${LOCUST_WEB_PORT}"

# Give the shells a moment to come up so the first C-m isn't lost.
sleep 1

tmux send-keys -t "$API_PANE" "$API_CMD" C-m
tmux send-keys -t "$APP_PANE" "$APP_CMD" C-m
tmux send-keys -t "$E2E_PANE" "$E2E_CMD" C-m
tmux send-keys -t "$LOCUST_PANE" "$LOCUST_CMD" C-m

# Focus the top-left pane so the user's attention starts there.
tmux select-pane -t "$API_PANE"

echo "[tmux-run] Attaching to tmux session."
exec tmux attach -t "$SESSION"
