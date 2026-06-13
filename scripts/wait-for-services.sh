#!/usr/bin/env bash
# Wait for both the API and the SPA to be healthy before continuing.
# Used by tmux panes that depend on the services being up.

set -u

API_PORT="${API_PORT:-3000}"
APP_PORT="${APP_PORT:-5173}"
API_URL="http://localhost:${API_PORT}/health"
APP_URL="http://localhost:${APP_PORT}"

# Load .env if present (best effort)
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
  API_PORT="${API_PORT:-3000}"
  APP_PORT="${APP_PORT:-5173}"
  API_URL="http://localhost:${API_PORT}/health"
  APP_URL="http://localhost:${APP_PORT}"
fi

MAX_WAIT="${MAX_WAIT:-90}"
SLEEP_BETWEEN=1
elapsed=0

echo "[wait] Waiting up to ${MAX_WAIT}s for ${API_URL} and ${APP_URL}…"

while [ $elapsed -lt $MAX_WAIT ]; do
  api_ok=0
  app_ok=0

  if curl -fsS -o /dev/null --max-time 2 "$API_URL"; then
    api_ok=1
  fi
  if curl -fsS -o /dev/null --max-time 2 "$APP_URL"; then
    app_ok=1
  fi

  if [ $api_ok -eq 1 ] && [ $app_ok -eq 1 ]; then
    echo "[wait] API and SPA are healthy after ${elapsed}s."
    exit 0
  fi

  sleep $SLEEP_BETWEEN
  elapsed=$((elapsed + SLEEP_BETWEEN))
done

echo "[wait] Timed out waiting for services." >&2
echo "[wait]  API: $API_URL" >&2
echo "[wait]  APP: $APP_URL" >&2
exit 1
