#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
URL="http://localhost:5173"
VITE_BIN="$CLIENT_DIR/node_modules/.bin/vite"

if [[ ! -x "$VITE_BIN" ]]; then
  echo "Client dependencies are missing. Run 'npm ci --prefix client' first." >&2
  exit 1
fi

if ! open -Ra "Google Chrome" >/dev/null 2>&1; then
  echo "Google Chrome was not found. Install Chrome before launching the kiosk." >&2
  exit 1
fi

VITE_PRINT_WIDTH_MM="${VITE_PRINT_WIDTH_MM:-25}"
if [[ "$VITE_PRINT_WIDTH_MM" != "25" && "$VITE_PRINT_WIDTH_MM" != "50" ]]; then
  echo "VITE_PRINT_WIDTH_MM must be 25 or 50 (got '$VITE_PRINT_WIDTH_MM')." >&2
  exit 1
fi
export VITE_PRINT_WIDTH_MM

cd "$CLIENT_DIR"
"$VITE_BIN" --host 127.0.0.1 --port 5173 --strictPort &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting guestbook on $URL with ${VITE_PRINT_WIDTH_MM} mm labels..."
for attempt in {1..30}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The Vite server exited before becoming ready." >&2
    exit 1
  fi
  if curl --silent --fail "$URL" >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "The guestbook did not become ready at $URL within 30 seconds." >&2
    exit 1
  fi
  sleep 1
done

echo "Opening Chrome in kiosk-printing mode. Press Ctrl-C here to stop the server."
open -na "Google Chrome" --args --kiosk --kiosk-printing "$URL"
wait "$SERVER_PID"
