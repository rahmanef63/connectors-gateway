#!/usr/bin/env bash
set -euo pipefail

SERVICE="${GATEWAY_SWARM_SERVICE:-connect-gateway-s3ngfg}"
TARGET_REPLICAS="${GATEWAY_REPLICAS:-2}"
REVISION="${1:-$(git rev-parse HEAD)}"
case "$TARGET_REPLICAS" in (*[!0-9]*|'') echo "GATEWAY_REPLICAS must be a positive integer" >&2; exit 2;; esac
[ "$TARGET_REPLICAS" -ge 2 ] || { echo "multi-instance gateway release requires at least 2 replicas" >&2; exit 2; }
case "$REVISION" in (*[!0-9a-f]*|'') echo "revision must be a lowercase git SHA" >&2; exit 2;; esac
if [ "$(git rev-parse "$REVISION^{commit}")" != "$REVISION" ] 2>/dev/null; then
  REVISION="$(git rev-parse "$REVISION^{commit}")"
fi
if [ -n "$(git status --porcelain)" ]; then echo "refusing release from a dirty worktree" >&2; exit 2; fi
if ! git merge-base --is-ancestor "$REVISION" origin/main; then echo "revision is not on origin/main" >&2; exit 2; fi

IMAGE="${GATEWAY_IMAGE_REPOSITORY:-connectors-gateway/gateway}:git-${REVISION}"
echo "building immutable gateway image for ${REVISION:0:12}"
docker build --pull -f apps/gateway/Dockerfile \
  --build-arg "GATEWAY_REVISION=$REVISION" \
  --build-arg "APP_VERSION=$VERSION" \
  -t "$IMAGE" . >/dev/null

# Relay ownership and rate budgets are shared, so old and new replicas can
# overlap safely. Start-first turns release hand-off into a real zero-downtime
# rolling update instead of the former singleton stop-first gap.
echo "updating $SERVICE to $TARGET_REPLICAS replicas with start-first rollout"
docker service update \
  --image "$IMAGE" \
  --replicas "$TARGET_REPLICAS" \
  --update-order start-first \
  --update-parallelism 1 \
  --update-failure-action rollback \
  --update-monitor 15s \
  --force "$SERVICE" >/dev/null

wanted="${TARGET_REPLICAS}/${TARGET_REPLICAS}"
for _ in $(seq 1 90); do
  replicas="$(docker service ls --filter "name=$SERVICE" --format '{{.Replicas}}' | head -n1)"
  if [ "$replicas" = "$wanted" ]; then
    running="$(docker service ps "$SERVICE" --filter desired-state=running --format '{{.CurrentState}}' | grep -c '^Running' || true)"
    [ "$running" -ge "$TARGET_REPLICAS" ] && break
  fi
  sleep 1
done

replicas="$(docker service ls --filter "name=$SERVICE" --format '{{.Replicas}}' | head -n1)"
[ "$replicas" = "$wanted" ] || { echo "gateway replicas did not converge: $replicas" >&2; exit 1; }
actual="$(docker service inspect "$SERVICE" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')"
[ "$actual" = "$IMAGE" ] || { echo "service did not retain immutable image" >&2; exit 1; }
image_version="$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
image_revision="$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[ "$image_version" = "$VERSION" ] || { echo "gateway image version label mismatch" >&2; exit 1; }
[ "$image_revision" = "$REVISION" ] || { echo "gateway image revision label mismatch" >&2; exit 1; }
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://connect.rahmanef.com/healthz)"
[ "$status" = "200" ] || { echo "health check failed after rollout" >&2; exit 1; }
echo "gateway release verified: ${REVISION:0:12} (${replicas})"
