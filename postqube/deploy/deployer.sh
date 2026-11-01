#!/usr/bin/env bash
# Postqube pull-based deployer. Run by postqube-deployer@<env>.timer.
# Follows a moving image tag (normally :production) in GHCR. When its digest
# changes: optional backup -> pin digest in compose.override.yaml -> recreate the
# app container -> health check -> automatic rollback to the previous digest.
# No inbound credentials: GitHub never connects to the server.
#
# Config: /etc/postqube/deploy-<env>.conf (shell syntax)
#   COMPOSE_DIR=/opt/postiz             compose project directory
#   SERVICE=postiz                      app service name
#   CHANNEL=production                  image tag to follow
#   IMAGE_REPO=ghcr.io/drdrey7/postqube
#   HEALTH_URL=https://host/api/auth/can-register
#   BACKUP_CMD=                         optional, runs before each deploy; failure aborts
#   HEALTH_TIMEOUT=300                  seconds
set -euo pipefail
ENV_NAME=${1:?usage: deployer.sh <env> [--dry-run]}
DRY=${2:-}
CONF=/etc/postqube/deploy-$ENV_NAME.conf
# shellcheck source=/dev/null
source "$CONF"
: "${COMPOSE_DIR:?}" "${SERVICE:?}" "${CHANNEL:?}" "${IMAGE_REPO:?}" "${HEALTH_URL:?}"
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-300}
STATE=/var/lib/postqube-deployer/$ENV_NAME
mkdir -p "$STATE"
exec 9>"$STATE/lock"; flock -n 9 || { echo "another deploy is running"; exit 0; }
log(){ echo "$(date -u +%FT%TZ) [$ENV_NAME] $*" | tee -a "$STATE/history.log"; }
cd "$COMPOSE_DIR"

docker pull -q "$IMAGE_REPO:$CHANNEL" >/dev/null
target=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$IMAGE_REPO:$CHANNEL" | grep -m1 "^$IMAGE_REPO@")
current=$(cat "$STATE/current" 2>/dev/null || true)
[ "$target" = "$current" ] && exit 0
[ "$target" = "$(cat "$STATE/rejected" 2>/dev/null)" ] && exit 0   # failed before; wait for a newer image
log "new image $target (running: ${current:-none})"
[ "$DRY" = --dry-run ] && { log "dry run: stopping here"; exit 0; }

pin(){ printf 'services:\n  %s:\n    image: %s\n' "$SERVICE" "$1" > compose.override.yaml; docker compose up -d --no-deps "$SERVICE"; }
healthy(){
  local end=$((SECONDS+HEALTH_TIMEOUT))
  while [ $SECONDS -lt $end ]; do
    curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" && return 0
    sleep 10
  done; return 1
}

if [ -n "${BACKUP_CMD:-}" ]; then log "backup: $BACKUP_CMD"; $BACKUP_CMD; fi
[ -f compose.override.yaml ] && cp compose.override.yaml "$STATE/override.previous"
pin "$target"
if healthy; then
  echo "$current" > "$STATE/previous"; echo "$target" > "$STATE/current"
  log "deployed OK"
  docker image prune -f >/dev/null
  exit 0
fi
log "HEALTH CHECK FAILED for $target; rolling back"
docker compose logs --tail 80 "$SERVICE" > "$STATE/failed-$(date -u +%Y%m%dT%H%M%SZ).log" 2>&1 || true
if [ -f "$STATE/override.previous" ]; then cp "$STATE/override.previous" compose.override.yaml; else rm -f compose.override.yaml; fi
docker compose up -d --no-deps "$SERVICE"
echo "$target" > "$STATE/rejected"
healthy && log "rollback OK" || log "ROLLBACK ALSO UNHEALTHY - manual action needed (backup was taken first if BACKUP_CMD is set)"
exit 1
