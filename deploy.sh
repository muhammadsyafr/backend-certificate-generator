#!/usr/bin/env bash
set -euo pipefail

# Redeploy backend with podman on repo update
# Usage:
#   ./deploy.sh                    # port 4000
#   ./deploy.sh --port 8080        # custom host port
#   ./deploy.sh --skip-git         # rebuild+restart only (no git pull)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTAINER_NAME="certificate-generator-backend"
IMAGE_NAME="certificate-generator-backend"
ENV_FILE="$SCRIPT_DIR/.env.production"
DATA_DIR="$HOME/data/backend-certificate-generator"
CERTS_DIR="$HOME/certs/backend-certificate-generator"
HOST_PORT="4000"
SSL_PORT="4443"
SKIP_GIT=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) HOST_PORT="$2"; shift 2 ;;
        --ssl-port) SSL_PORT="$2"; shift 2 ;;
        --skip-git) SKIP_GIT=true; shift ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
done

echo "=== Redeploy: $CONTAINER_NAME ==="

# 1. Git pull (skip if not a git repo)
if [ "$SKIP_GIT" = false ] && git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    echo "[1/4] Pulling latest from git..."
    cd "$REPO_DIR"
    git fetch origin
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "$LOCAL")
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "  Already up-to-date. Force rebuild."
    else
        git pull origin "$(git rev-parse --abbrev-ref HEAD)"
    fi
elif [ "$SKIP_GIT" = false ]; then
    echo "[1/4] Not a git repo. Skipping pull."
fi

# 2. Build
echo "[2/4] Building podman image..."
podman build --no-cache --network=host -t "$IMAGE_NAME" "$SCRIPT_DIR"

# 3. Stop old
echo "[3/4] Stopping old container..."
podman stop "$CONTAINER_NAME" 2>/dev/null || true
podman rm "$CONTAINER_NAME" 2>/dev/null || true

# 4. Start new
echo "[4/4] Starting new container..."
mkdir -p "$DATA_DIR" "$CERTS_DIR"
podman run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "$HOST_PORT:4000" \
    -p "$SSL_PORT:4443" \
    --env-file "$ENV_FILE" \
    -e NODE_ENV=production \
    -v "$DATA_DIR:/app/data" \
    -v "$CERTS_DIR:/app/certs" \
    "$IMAGE_NAME"

echo "=== Done ==="
podman ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
