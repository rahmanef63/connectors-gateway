#!/usr/bin/env bash
set -euo pipefail

SERVICE="${GATEWAY_SWARM_SERVICE:-connect-gateway-s3ngfg}"
REVISION="${1:-$(git rev-parse HEAD)}"
case "$REVISION" in (*[!0-9a-f]*|'') echo "revision must be a lowercase git SHA" >&2; exit 2;; esac
if [ "$(git rev-parse "$REVISION^{commit}")" != "$REVISION" ] 2>/dev/null; then
  # Accept abbreviated input, but always promote the canonical full commit id.
  REVISION="$(git rev-parse "$REVISION^{commit}")"
fi
if [ -n "$(git status --porcelain)" ]; then echo "refusing release from a dirty worktree" >&2; exit 2; fi
if ! git merge-base --is-ancestor "$REVISION" origin/main; then echo "revision is not on origin/main" >&2; exit 2; fi

IMAGE="${GATEWAY_IMAGE_REPOSITORY:-connectors-gateway/gateway}:git-${REVISION}"
echo "building immutable gateway image for ${REVISION:0:12}"
docker build --pull -f apps/gateway/Dockerfile \
  --build-arg "GATEWAY_REVISION=$REVISION" \
  -t "$IMAGE" . >/dev/null

# Singleton lease + start-first are incompatible: the replacement is supposed to
# be rejected while the old process still owns the lease. Stop-first gives one
# bounded hand-off instead of a failed task followed by an implicit retry.
echo "updating $SERVICE with singleton-safe stop-first hand-off"
docker service update \
  --image "$IMAGE" \
  --update-order stop-first \
  --update-parallelism 1 \
  --force "$SERVICE" >/dev/null

for _ in $(seq 1 30); do
  replicas="$(docker service ls --filter "name=$SERVICE" --format '{{.Replicas}}' | head -n1)"
  if [ "$replicas" = "1/1" ]; then
    running="$(docker service ps "$SERVICE" --filter desired-state=running --format '{{.CurrentState}}' | head -n1)"
    case "$running" in Running*) break;; esac
  fi
  sleep 1
done

actual="$(docker service inspect "$SERVICE" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')"
[ "$actual" = "$IMAGE" ] || { echo "service did not retain immutable image" >&2; exit 1; }
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://connect.rahmanef.com/healthz)"
[ "$status" = "200" ] || { echo "health check failed after rollout" >&2; exit 1; }
echo "gateway release verified: ${REVISION:0:12}"
