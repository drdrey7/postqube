#!/usr/bin/env bash
# Postqube FAST LANE: build a pushed branch/commit on this server and put it live
# in a few minutes, with a database snapshot first and automatic rollback.
#
#   postqube-quick <branch|commit>                build and put live
#   postqube-quick <branch|commit> --branding     only sync postqube/branding (instant, no restart)
#   postqube-quick <branch|commit> --build-only   build and stop (nothing goes live)
#   postqube-quick <branch|commit> --allow-schema also allow a schema.prisma change (prefer a release)
#   postqube-quick --rollback                     undo the last fast-lane deploy (image or branding)
#
# For small UI/text changes. Database changes, Postiz upgrades and big features
# go through the release workflow (docs/postqube/RELEASING.md). The next release
# replaces whatever the fast lane put live, so open a PR for every quick change.
set -euo pipefail
REPO_URL=${POSTQUBE_REPO_URL:-https://github.com/drdrey7/postqube.git}
SRC=${POSTQUBE_SRC:-/opt/postqube/src}
COMPOSE_DIR=${POSTQUBE_COMPOSE_DIR:-/opt/postiz}
BRANDING_DIR=${POSTQUBE_BRANDING_DIR:-/opt/postqube/branding}
SERVICE=postiz
HEALTH_URL=${POSTQUBE_HEALTH_URL:-http://127.0.0.1:4007/api/auth/can-register}
SNAPSHOTS=/var/backups/postiz/quick
STATE=/var/lib/postqube-deployer/production
SCHEMA=libraries/nestjs-libraries/src/database/prisma/schema.prisma
HERE=$(dirname "$(readlink -f "$0")")
mkdir -p "$STATE" "$SNAPSHOTS"; chmod 700 "$SNAPSHOTS"
exec 9>"$STATE/lock"; flock -n 9 || { echo "A deploy is already running."; exit 1; }
log(){ echo "$(date -u +%FT%TZ) [quick] $*" | tee -a "$STATE/history.log"; }
cd "$COMPOSE_DIR"

# Only the image of $SERVICE is changed; other override settings are preserved.
pin(){ python3 "$HERE/pin-image.py" "$COMPOSE_DIR" "$SERVICE" "$1" && docker compose up -d --no-deps "$SERVICE" >/dev/null; }
healthy(){
  local end=$((SECONDS+300))
  while [ $SECONDS -lt $end ]; do
    curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" && return 0; sleep 3
  done; return 1
}
restore_override(){ if [ -f "$1" ]; then cp "$1" compose.override.yaml; else rm -f compose.override.yaml; fi; }
# $STATE/last-quick records what the last fast-lane deploy changed, so --rollback undoes exactly that.
#   kind=image  override=<saved compose.override.yaml or none>
#   kind=branding backup=<saved branding directory>

if [ "${1:-}" = --rollback ]; then
  [ -f "$STATE/last-quick" ] || { echo "Nothing to roll back."; exit 1; }
  # shellcheck source=/dev/null
  source "$STATE/last-quick"
  case "$kind" in
    branding)
      rsync -a --delete "$backup/" "$BRANDING_DIR/"
      log "rollback: branding restored from $backup";;
    image)
      restore_override "$override"
      docker compose up -d --no-deps "$SERVICE" >/dev/null
      healthy || { log "ROLLBACK UNHEALTHY - manual action needed"; exit 1; }
      log "rollback: image restored to $(docker inspect -f '{{.Config.Image}}' "$SERVICE")";;
  esac
  rm -f "$STATE/last-quick"; echo "✅ Rolled back."; exit 0
fi
REF=${1:?usage: postqube-quick <branch|commit> [--branding|--build-only|--allow-schema] | --rollback}
OPT=${2:-}
case "$OPT" in ''|--branding|--build-only|--allow-schema) ;; *) echo "Unknown option $OPT"; exit 1;; esac

# 1. Exact source of the pushed ref (local edits are never deployed).
[ -d "$SRC/.git" ] || git clone -q --filter=blob:none "$REPO_URL" "$SRC"
git -C "$SRC" fetch -q --prune origin "+refs/heads/*:refs/remotes/origin/*"
sha=$(git -C "$SRC" rev-parse --verify -q "origin/$REF^{commit}" || git -C "$SRC" rev-parse --verify "$REF^{commit}")
git -C "$SRC" -c advice.detachedHead=false checkout -q --force "$sha"
git -C "$SRC" clean -qfdx
short=${sha:0:12}; image="postqube:quick-$short"

# 2. Branding only: served by host nginx from $BRANDING_DIR, no build or restart.
if [ "$OPT" = --branding ]; then
  bk="$STATE/branding-$(date -u +%Y%m%dT%H%M%SZ)"; cp -a "$BRANDING_DIR" "$bk"
  rsync -a --delete --exclude '._*' "$SRC/postqube/branding/" "$BRANDING_DIR/"
  printf 'kind=branding\nbackup=%q\n' "$bk" > "$STATE/last-quick"
  ls -1dt "$STATE"/branding-* | tail -n +11 | xargs -r rm -rf
  log "BRANDING LIVE from $REF @ $short (no restart) - previous copy: $bk"
  echo "✅ Branding live (refresh the page). Undo with: postqube-quick --rollback"; exit 0
fi

# 3. Schema guard against the schema inside the RUNNING container (always known).
if [ "$OPT" != --allow-schema ] && [ "$OPT" != --build-only ]; then
  docker exec "$SERVICE" cat "/app/$SCHEMA" > "$STATE/running-schema.prisma" \
    || { echo "Cannot read the running schema; refusing. Use a release or --allow-schema."; exit 1; }
  cmp -s "$STATE/running-schema.prisma" "$SRC/$SCHEMA" \
    || { echo "schema.prisma differs from the running app. Use a release, or add --allow-schema."; exit 1; }
fi

# 4. Build with the local BuildKit cache (only changed layers are rebuilt).
log "building $REF @ $short"
DOCKER_BUILDKIT=1 docker build -q --target dist -f "$SRC/postqube/native/Dockerfile" \
  --label org.opencontainers.image.revision="$sha" -t "$image" "$SRC" >/dev/null
[ "$OPT" = --build-only ] && { echo "Built $image (not deployed)."; exit 0; }

# 5. Database snapshot (no downtime), keep the latest 10.
snap="$SNAPSHOTS/$(date -u +%Y%m%dT%H%M%SZ)-$short.dump"
docker compose exec -T postiz-postgres pg_dump -U postiz-user -d postiz-db-local -Fc > "$snap"
docker compose exec -T postiz-postgres pg_restore --list < "$snap" >/dev/null
ls -1t "$SNAPSHOTS"/*.dump | tail -n +11 | xargs -r rm -f

# 6. Swap, health check, automatic rollback (also when recreation itself fails).
prev=$(docker inspect -f '{{.Config.Image}}' "$SERVICE")
saved="$STATE/override.before-quick-$short"; rm -f "$saved"
[ -f compose.override.yaml ] && cp compose.override.yaml "$saved"
if pin "$image" && healthy; then
  printf 'kind=image\noverride=%q\n' "$( [ -f "$saved" ] && echo "$saved" || echo none )" > "$STATE/last-quick"
  log "LIVE $image ($REF) - previous: $prev - snapshot: $snap"
  docker images --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' postqube | grep ':quick-' | sort -r | tail -n +4 | cut -f2 \
    | grep -vx "$prev" | xargs -r docker rmi >/dev/null 2>&1 || true
  echo "✅ Live: $image. Undo with: postqube-quick --rollback"
  exit 0
fi
log "DEPLOY OR HEALTH CHECK FAILED for $image; rolling back to $prev"
docker compose logs --tail 80 "$SERVICE" > "$STATE/quick-failed-$short.log" 2>&1 || true
restore_override "$saved"
docker compose up -d --no-deps "$SERVICE" >/dev/null && healthy && log "rollback OK" \
  || log "ROLLBACK UNHEALTHY - manual action needed; snapshot $snap"
echo "❌ $image failed and was rolled back. Logs: $STATE/quick-failed-$short.log"
exit 1
