#!/bin/bash
set -euo pipefail

KIOSK=0
TEST_MODE=0
while getopts "kt" opt; do
  case "$opt" in
    k) KIOSK=1 ;;
    t) TEST_MODE=1 ;;
    *) echo "Usage: $0 [-k] [-t]" >&2; exit 2 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
URL="http://localhost:5173"
VITE_BIN="$CLIENT_DIR/node_modules/.bin/vite"

if [[ ! -x "$VITE_BIN" ]]; then
  echo "Client dependencies are missing. Run 'npm ci --prefix client' first." >&2
  exit 1
fi

if [[ "$KIOSK" -eq 1 ]] && ! open -Ra "Google Chrome" >/dev/null 2>&1; then
  echo "Google Chrome was not found. Install Chrome before launching the kiosk." >&2
  exit 1
fi

VITE_PRINT_WIDTH_MM="${VITE_PRINT_WIDTH_MM:-25}"
if [[ "$VITE_PRINT_WIDTH_MM" != "25" && "$VITE_PRINT_WIDTH_MM" != "50" ]]; then
  echo "VITE_PRINT_WIDTH_MM must be 25 or 50 (got '$VITE_PRINT_WIDTH_MM')." >&2
  exit 1
fi
export VITE_PRINT_WIDTH_MM
export VITE_PRINT_TEST_MODE=0
if [[ "$TEST_MODE" -eq 1 ]]; then
  export VITE_PRINT_TEST_MODE=1
  export PRINTER_DRY_RUN=1
  echo "Test mode enabled: print jobs will be simulated."
fi

# Set PRINTER_HOST to the VC-500W's IP to print directly with auto cut
# (bypasses the macOS print driver; falls back to it if the direct job fails).
PRINTER_HOST="192.168.8.228"
if [[ -n "${PRINTER_HOST:-}" ]]; then
  export PRINTER_HOST
  export VITE_DIRECT_PRINT=1
  echo "Direct printing with auto cut enabled -> $PRINTER_HOST"
fi

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

if [[ "$KIOSK" -eq 1 ]]; then
  echo "Opening Chrome in kiosk-printing mode. Press Ctrl-C here to stop the server."
  open -na "Google Chrome" --args --kiosk --kiosk-printing "$URL"
else
  echo "Guestbook ready at $URL. Pass -k to open Chrome in kiosk-printing mode. Press Ctrl-C here to stop the server."
fi
wait "$SERVER_PID"
