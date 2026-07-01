#!/bin/sh
# Generate SSL certs for local dev or Cloudflare Origin.
# Usage: ./scripts/generate-ssl.sh [cloudflare|selfsigned]
# Output: certs/server.crt, certs/server.key

set -e

METHOD="${1:-selfsigned}"
CERT_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERT_DIR"

if [ "$METHOD" = "cloudflare" ]; then
  echo ""
  echo "=== Cloudflare Origin CA ==="
  echo "1. Open Cloudflare Dashboard > SSL/TLS > Origin Server"
  echo "2. Click 'Create Certificate'"
  echo "3. Choose 'Let Cloudflare generate a private key and a CSR'"
  echo "4. Set validity (15 years recommended)"
  echo "5. Copy the 'Origin Certificate' (PEM) and 'Private Key'"
  echo ""
  echo "Paste Origin Certificate (PEM), then Ctrl+D:"
  cat > "$CERT_DIR/server.crt"
  echo "Paste Private Key (PEM), then Ctrl+D:"
  cat > "$CERT_DIR/server.key"
  chmod 600 "$CERT_DIR/server.key"
  echo "✓ Cloudflare Origin certs saved to $CERT_DIR/"
  echo "  Set Cloudflare SSL/TLS mode to 'Full (strict)'"

elif [ "$METHOD" = "selfsigned" ]; then
  DAYS="${2:-3650}"
  openssl req -x509 -nodes -days "$DAYS" -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=localhost"
  chmod 600 "$CERT_DIR/server.key"
  echo "✓ Self-signed cert generated (${DAYS} days)"
  echo "  WARNING: browser will show untrusted. Use behind Cloudflare or for dev only."
  echo "  Certs: $CERT_DIR/server.{crt,key}"

else
  echo "Usage: $0 [cloudflare|selfsigned] [days]"
  exit 1
fi
