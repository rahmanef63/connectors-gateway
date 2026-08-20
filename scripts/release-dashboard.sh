#!/usr/bin/env bash
set -euo pipefail

SERVICE="${DASHBOARD_SWARM_SERVICE:-connectors-gateway-qlyseb}"
VERSION="$(tr -d '\r\n ' < VERSION)"
REVISION="${1:-$(git rev-parse HEAD)}"
case "$REVISION" in (*[!0-9a-f]*|'') echo "revision must be a lowercase git SHA" >&2; exit 2;; esac
if [ "$(git rev-parse "$REVISION^{commit}")" != "$REVISION" ] 2>/dev/null; then
  REVISION="$(git rev-parse "$REVISION^{commit}")"
fi
if [ -n "$(git status --porcelain)" ]; then echo "refusing release from a dirty worktree" >&2; exit 2; fi
if ! git merge-base --is-ancestor "$REVISION" origin/main; then echo "revision is not on origin/main" >&2; exit 2; fi

# Both values are public browser configuration. Reuse the currently deployed
# Convex URL by default; the gateway public origin is the stable production URL.
CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-$(docker service inspect "$SERVICE" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | sed -n 's/^NEXT_PUBLIC_CONVEX_URL=//p' | head -n1)}"
GATEWAY_URL="${NEXT_PUBLIC_GATEWAY_URL:-https://connect.rahmanef.com}"
[ -n "$CONVEX_URL" ] || { echo "NEXT_PUBLIC_CONVEX_URL is unavailable" >&2; exit 2; }

IMAGE="${DASHBOARD_IMAGE_REPOSITORY:-connectors-gateway/dashboard}:git-${REVISION}"
echo "building immutable dashboard image for ${REVISION:0:12} (v$VERSION)"
docker build --pull -f Dockerfile \
  --build-arg "NEXT_PUBLIC_CONVEX_URL=$CONVEX_URL" \
  --build-arg "NEXT_PUBLIC_GATEWAY_URL=$GATEWAY_URL" \
  --build-arg "APP_REVISION=$REVISION" \
  --build-arg "APP_VERSION=$VERSION" \
  -t "$IMAGE" . >/dev/null

docker service update \
  --image "$IMAGE" \
  --update-order start-first \
  --update-parallelism 1 \
  --update-failure-action rollback \
  --force "$SERVICE" >/dev/null

for _ in $(seq 1 40); do
  replicas="$(docker service ls --filter "name=$SERVICE" --format '{{.Replicas}}' | head -n1)"
  if [ "$replicas" = "1/1" ]; then
    running="$(docker service ps "$SERVICE" --filter desired-state=running --format '{{.CurrentState}}' | head -n1)"
    case "$running" in Running*) break;; esac
  fi
  sleep 1
done

actual="$(docker service inspect "$SERVICE" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')"
[ "$actual" = "$IMAGE" ] || { echo "dashboard did not retain immutable image" >&2; exit 1; }
image_version="$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
image_revision="$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[ "$image_version" = "$VERSION" ] || { echo "dashboard image version label mismatch" >&2; exit 1; }
[ "$image_revision" = "$REVISION" ] || { echo "dashboard image revision label mismatch" >&2; exit 1; }
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://connectors.rahmanef.com/sign-in)"
[ "$status" = "200" ] || { echo "dashboard health check failed after rollout" >&2; exit 1; }
echo "dashboard release verified: ${REVISION:0:12} (v$VERSION)"
