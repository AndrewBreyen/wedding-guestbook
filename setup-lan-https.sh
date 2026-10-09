#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$ROOT_DIR/client/.local-certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required. Install it with 'brew install mkcert', then run this script again." >&2
  exit 1
fi

DEFAULT_INTERFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
LAN_IP=""
if [[ -n "$DEFAULT_INTERFACE" ]]; then
  LAN_IP="$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null || true)"
fi
if [[ -z "$LAN_IP" ]]; then
  echo "Could not determine this Mac's LAN IP. Connect it to Wi-Fi and try again." >&2
  exit 1
fi

mkcert -install

LOCAL_HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
mkdir -p "$CERT_DIR"
mkcert \
  -cert-file "$CERT_DIR/lan.pem" \
  -key-file "$CERT_DIR/lan-key.pem" \
  "$LAN_IP" "$LOCAL_HOST" localhost 127.0.0.1 ::1

CAROOT="$(mkcert -CAROOT)"
if [[ ! -f "$CAROOT/rootCA.pem" ]]; then
  echo "mkcert did not create its local CA certificate at $CAROOT/rootCA.pem." >&2
  exit 1
fi
openssl x509 -in "$CAROOT/rootCA.pem" -outform DER -out "$CERT_DIR/rootCA.cer"

echo "Local HTTPS certificate ready for $LAN_IP."
echo "For iPhone trust, transfer this CA certificate (not the private key):"
echo "$CERT_DIR/rootCA.cer"
