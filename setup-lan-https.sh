#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$ROOT_DIR/client/.local-certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required. Install it with 'brew install mkcert', then run this script again." >&2
  exit 1
fi

LAN_IPS=()
LAN_IP_COUNT=0
for interface in $(ifconfig -l); do
  interface_ip="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
  if [[ -n "$interface_ip" && "$interface_ip" != 127.* ]]; then
    already_added=0
    if [[ "$LAN_IP_COUNT" -gt 0 ]]; then
      for lan_ip in "${LAN_IPS[@]}"; do
        if [[ "$lan_ip" == "$interface_ip" ]]; then
          already_added=1
          break
        fi
      done
    fi
    if [[ "$already_added" -eq 0 ]]; then
      LAN_IPS+=("$interface_ip")
      LAN_IP_COUNT=$((LAN_IP_COUNT + 1))
    fi
  fi
done
if [[ "$LAN_IP_COUNT" -eq 0 ]]; then
  echo "Could not determine this Mac's LAN IP. Connect to a network and try again." >&2
  exit 1
fi

mkcert -install

LOCAL_HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
mkdir -p "$CERT_DIR"
mkcert \
  -cert-file "$CERT_DIR/lan.pem" \
  -key-file "$CERT_DIR/lan-key.pem" \
  "${LAN_IPS[@]}" "$LOCAL_HOST" localhost 127.0.0.1 ::1

CAROOT="$(mkcert -CAROOT)"
if [[ ! -f "$CAROOT/rootCA.pem" ]]; then
  echo "mkcert did not create its local CA certificate at $CAROOT/rootCA.pem." >&2
  exit 1
fi
openssl x509 -in "$CAROOT/rootCA.pem" -outform DER -out "$CERT_DIR/rootCA.cer"

echo "Local HTTPS certificate ready for these IPv4 addresses:"
printf '  %s\n' "${LAN_IPS[@]}"
echo "For iPhone trust, transfer this CA certificate (not the private key):"
echo "$CERT_DIR/rootCA.cer"
