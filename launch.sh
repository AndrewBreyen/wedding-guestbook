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
URL="https://localhost:5173"
VITE_BIN="$CLIENT_DIR/node_modules/.bin/vite"

if [[ ! -x "$VITE_BIN" ]]; then
  echo "Client dependencies are missing. Run 'npm ci --prefix client' first." >&2
  exit 1
fi

"$ROOT_DIR/setup-lan-https.sh"

if [[ "$KIOSK" -eq 1 ]] && ! open -Ra "Google Chrome" >/dev/null 2>&1; then
  echo "Google Chrome was not found. Install Chrome before launching the kiosk." >&2
  exit 1
fi

VITE_PRINT_WIDTH_MM="${VITE_PRINT_WIDTH_MM:-50}"
if [[ "$VITE_PRINT_WIDTH_MM" != "25" && "$VITE_PRINT_WIDTH_MM" != "50" ]]; then
  echo "VITE_PRINT_WIDTH_MM must be 25 or 50 (got '$VITE_PRINT_WIDTH_MM')." >&2
  exit 1
fi
export VITE_PRINT_WIDTH_MM
export VITE_PRINT_TEST_MODE=0
if [[ "$TEST_MODE" -eq 1 ]]; then
  export VITE_PRINT_TEST_MODE=1
  export PRINTER_DRY_RUN=1
  PRINT_MODE="TEST MODE (nothing will be saved or printed)"
else
  PRINT_MODE="LIVE NETWORK PRINTING"
fi

# Set PRINTER_HOST to the VC-500W's IP to print directly with auto cut.
PRINTER_HOST="${PRINTER_HOST:-192.168.8.228}"
PRINTER_PORT="${PRINTER_PORT:-9100}"
PRINTER_MAC="${PRINTER_MAC:-28:7b:11:4d:a3:b4}"
PRINTER_INTERFACE="${PRINTER_INTERFACE:-en9}"
if [[ -n "${PRINTER_HOST:-}" ]]; then
  export PRINTER_HOST
  export PRINTER_PORT
  export VITE_DIRECT_PRINT=1
fi

cd "$CLIENT_DIR"
LOCAL_HTTPS=1 "$VITE_BIN" --host 0.0.0.0 --port 5173 --strictPort &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for attempt in {1..30}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The Vite server exited before becoming ready." >&2
    exit 1
  fi
  if curl --silent --insecure --fail "$URL" >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "The guestbook did not become ready at $URL within 30 seconds." >&2
    exit 1
  fi
  sleep 1
done

if [[ -n "$PRINTER_HOST" ]]; then
  echo "Direct printing with auto cut enabled -> $PRINTER_HOST"
fi
echo "----------------------------------------------------------------"
echo "Starting guestbook on $URL."
echo "Print configuration: ${VITE_PRINT_WIDTH_MM} mm labels."
echo "Print mode: ${PRINT_MODE}."
if [[ "$TEST_MODE" -ne 1 && -n "$PRINTER_HOST" ]]; then
  echo "Network printer: $PRINTER_HOST:$PRINTER_PORT"
fi

# Ping is not a reliable printer health check: some printers ignore ICMP.
# A TCP connection to the raw-print port verifies the service the app uses.
if [[ "$TEST_MODE" -ne 1 && -n "$PRINTER_HOST" ]]; then
  printer_ready=0
  for attempt in {1..3}; do
    if nc -z -G 3 "$PRINTER_HOST" "$PRINTER_PORT" >/dev/null 2>&1; then
      echo "Printer reachable at $PRINTER_HOST:$PRINTER_PORT."
      printer_ready=1
      break
    fi
    if [[ "$attempt" -lt 3 ]]; then
      echo "Printer not reachable yet at $PRINTER_HOST:$PRINTER_PORT (attempt $attempt/3); retrying..."
      sleep 2
    fi
  done

  if [[ "$printer_ready" -eq 0 ]]; then
    echo "Printer did not respond; trying the scoped ARP repair on $PRINTER_INTERFACE (sudo may ask for your Mac password)."
    if ! sudo -v || ! sudo arp -S "$PRINTER_HOST" "$PRINTER_MAC" ifscope "$PRINTER_INTERFACE"; then
      echo "ERROR: could not set interface-scoped ARP mapping for $PRINTER_HOST on $PRINTER_INTERFACE." >&2
      exit 1
    fi
    for attempt in {1..3}; do
      if nc -z -G 3 "$PRINTER_HOST" "$PRINTER_PORT" >/dev/null 2>&1; then
        echo "Printer reachable after ARP repair at $PRINTER_HOST:$PRINTER_PORT."
        printer_ready=1
        break
      fi
      if [[ "$attempt" -lt 3 ]]; then
        echo "Printer still unavailable after ARP repair (attempt $attempt/3); retrying..."
        sleep 2
      fi
    done
  fi

  if [[ "$printer_ready" -eq 0 ]]; then
    echo "ERROR: cannot connect to printer at $PRINTER_HOST:$PRINTER_PORT. Stopping the guestbook server." >&2
    exit 1
  fi
fi

if [[ "$KIOSK" -eq 1 ]]; then
  echo "Opening Chrome in kiosk mode at $URL. Press Ctrl-C here to stop the server."
  open -na "Google Chrome" --args --kiosk "$URL"
else
  echo "Guestbook ready at $URL. Pass -k to open Chrome in kiosk mode."
fi
DEFAULT_INTERFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
LAN_IP=""
if [[ -n "$DEFAULT_INTERFACE" ]]; then
  LAN_IP="$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null || true)"
fi
if [[ -n "$LAN_IP" ]]; then
  echo "On the same network, open https://$LAN_IP:5173 on another device."
else
  echo "To connect another device, find this Mac's LAN IP and open https://<LAN-IP>:5173."
fi
echo "If it cannot connect, check that both devices are on the same Wi-Fi and allow incoming connections through the Mac firewall."
wait "$SERVER_PID"
