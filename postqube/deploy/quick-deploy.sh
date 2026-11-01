#!/usr/bin/env bash
# Postqube FAST LANE: build a pushed branch/commit on this server and put it live
# in ~1-2 minutes, with a database snapshot first and automatic rollback.
#
#   postqube-quick <branch|commit>            e.g. postqube-quick fix/sidebar-colour
#   postqube-quick <ref> --allow-schema       also allow a schema.prisma change (prefer a release)
#   postqube-quick <ref> --branding           only sync postqube/branding (instant, no restart)
#   postqube-quick <ref> --build-only         build and stop (nothing goes live)
#   postqube-quick --rollback                 go back to the image that ran before the last quick deploy
#
# For small UI/text changes. Database changes, Postiz upgrades and big features
# go through the release workflow (docs/postqube/RELEASING.md). The next release
# replaces whatever the fast lane put live, so open a PR for every quick change.
set -euo pipefail
REPO_URL=${POSTQUBE_REPO_URL:-https://github.com/drdrey7/postqube.git}
SRC=${POSTQUBE_SRC:-/opt/postqube/src}
COMPOSE_DIR=${POSTQUBE_COMPOSE_DIR:-/opt/postiz}
SERVICE=postiz
HEALTH_URL=${POSTQUBE_HEALTH_URL:-http://127.0.0.1:4007/api/auth/can-register}
SNAPSHOTS=/var/backups/postiz/quick
STATE=/var/lib/postqube-deployer/production
SCHEMA=libraries/nestjs-libraries/src/database/prisma/schema.prisma
mkdir -p "$STATE" "$SNAPSHOTS"; chmod 700 "$SNAPSHOTS"
exec 9>"$STATE/lock"; flock -n 9 || { echo "A deploy is already running."; exit 1; }
log(){ echo "$(date -u +%FT%TZ) [quick] $*" | tee -a "$STATE/history.log"; }
cd "$COMPOSE_DIR"

pin(){ printf 'services:\n  %s:\n    image: %s\n' "$SERVICE" "$1" > compose.override.yaml; docker compose up -d --no-deps "$SERVICE" >/dev/null; }
healthy(){
  local end=$((SECONDS+300))
  while [ $SECONDS -lt $end ]; do
    curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" && return 0; sleep 3
  done; return 1
}
running_image(){ docker inspect -f '{{.Config.Image}}' "$SERVICE"; }

if [ "${1:-}" = --rollback ]; then
  prev=$(cat "$STATE/quick-previous" 2>/dev/null) || { echo "Nothing to roll back to."; exit 1; }
  log "rollback to $prev"; pin "$prev"; rm -f "$STATE/source-sha"
  healthy && { log "rollback OK"; exit 0; } || { log "ROLLBACK UNHEALTHY"; exit 1; }
fi
REF=${1:?usage: postqube-quick <branch|commit> [--allow-schema] | --rollback}
OPT=${2:-}; ALLOW_SCHEMA=$OPT

# 1. Exact source of the pushed ref (local edits are never deployed).
[ -d "$SRC/.git" ] || git clone -q --filter=blob:none "$REPO_URL" "$SRC"
git -C "$SRC" fetch -q --prune origin "+refs/heads/*:refs/remotes/origin/*"
sha=$(git -C "$SRC" rev-parse --verify -q "origin/$REF^{commit}" || git -C "$SRC" rev-parse --verify "$REF^{commit}")
git -C "$SRC" -c advice.detachedHead=false checkout -q --force "$sha"
git -C "$SRC" clean -qfdx
short=${sha:0:12}; image="postqube:quick-$short"
log "building $REF @ $short"

# 2. Schema guard: compare with the source of the running version, if known.
deployed_sha=$(cat "$STATE/source-sha" 2>/dev/null || true)
if [ -n "$deployed_sha" ] && [ "$ALLOW_SCHEMA" != --allow-schema ] && \
   ! git -C "$SRC" diff --quiet "$deployed_sha" "$sha" -- "$SCHEMA" 2>/dev/null; then
  echo "schema.prisma changed since the running version ($deployed_sha). Use a release, or add --allow-schema."; exit 1
fi

# 2b. Instant mode: logo/colour/branding files are served by host nginx from
#     /opt/postqube/branding, so they go live without a build or restart.
changed=""
[ -n "$deployed_sha" ] && changed=$(git -C "$SRC" diff --name-only "$deployed_sha" "$sha" 2>/dev/null || true)
if [ "$OPT" = --branding ] || { [ -n "$changed" ] && ! grep -qv '^postqube/branding/' <<<"$changed"; }; then
  bk="$STATE/branding-$(date -u +%Y%m%dT%H%M%SZ)"; cp -a /opt/postqube/branding "$bk"
  rsync -a --delete --exclude '._*' "$SRC/postqube/branding/" /opt/postqube/branding/
  [ -n "$changed" ] && echo "$sha" > "$STATE/source-sha"
  log "BRANDING LIVE from $REF @ $short (no restart) — previous copy: $bk"
  echo "✅ Branding live instantly (refresh the page). Previous files: $bk"; exit 0
fi

# 3. Build with the local BuildKit cache (only changed layers are rebuilt).
DOCKER_BUILDKIT=1 docker build -q --target dist -f "$SRC/postqube/native/Dockerfile" \
  --label org.opencontainers.image.revision="$sha" -t "$image" "$SRC" >/dev/null
[ "$OPT" = --build-only ] && { echo "Built $image (not deployed)."; exit 0; }

# 4. Database snapshot (no downtime), keep the latest 10.
snap="$SNAPSHOTS/$(date -u +%Y%m%dT%H%M%SZ)-$short.dump"
docker compose exec -T postiz-postgres pg_dump -U postiz-user -d postiz-db-local -Fc > "$snap"
docker compose exec -T postiz-postgres pg_restore --list < "$snap" >/dev/null
ls -1t "$SNAPSHOTS"/*.dump | tail -n +11 | xargs -r rm -f

# 5. Swap, health check, automatic rollback.
prev=$(running_image)
[ -f compose.override.yaml ] && cp compose.override.yaml "$STATE/override.before-quick"
pin "$image"
if healthy; then
  echo "$prev" > "$STATE/quick-previous"; echo "$sha" > "$STATE/source-sha"
  log "LIVE $image ($REF) — previous: $prev — snapshot: $snap"
  # keep the 3 newest quick images (+ whatever is running)
  docker images --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' postqube | grep ':quick-' | sort -r | tail -n +4 | cut -f2 \
    | grep -vx "$prev" | xargs -r docker rmi >/dev/null 2>&1 || true
  echo "✅ Live: $image. Undo with: postqube-quick --rollback"
  exit 0
fi
log "HEALTH CHECK FAILED for $image; rolling back to $prev"
docker compose logs --tail 80 "$SERVICE" > "$STATE/quick-failed-$short.log" 2>&1 || true
if [ -f "$STATE/override.before-quick" ]; then cp "$STATE/override.before-quick" compose.override.yaml; else rm -f compose.override.yaml; fi
docker compose up -d --no-deps "$SERVICE" >/dev/null
healthy && log "rollback OK" || log "ROLLBACK UNHEALTHY - manual action needed; snapshot $snap"
echo "❌ $image failed its health check and was rolled back. Logs: $STATE/quick-failed-$short.log"
exit 1
