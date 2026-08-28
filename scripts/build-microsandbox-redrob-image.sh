#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE="$ROOT_DIR/packaging/docker/Dockerfile.microsandbox"

IMAGE_REF="${1:-redrob-microsandbox:dev}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-}"
REDROB_CODE_VERSION="${REDROB_CODE_VERSION:-$(node -e 'const fs=require("fs"); const parsed=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(parsed.redrobCodeVersion || "").trim().replace(/^v/, ""));' "$ROOT_DIR/constants.json")}"
REDROB_SERVER_VERSION="${REDROB_SERVER_VERSION:-$(node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(pkg.version));' "$ROOT_DIR/apps/server/package.json")}"

# redrob-labs/redrob-code is private, so the image build resolves the release
# asset through the authenticated GitHub API. The token is passed as a BuildKit
# secret and never becomes an image layer or build arg.
REDROB_GITHUB_TOKEN="${REDROB_GITHUB_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
REDROB_CODE_DOWNLOAD_URL="${REDROB_CODE_DOWNLOAD_URL:-}"

if [ -z "$REDROB_GITHUB_TOKEN" ] && [ -z "$REDROB_CODE_DOWNLOAD_URL" ]; then
  echo "Set REDROB_GITHUB_TOKEN (or GH_TOKEN / GITHUB_TOKEN) with read access to redrob-labs/redrob-code," >&2
  echo "or set REDROB_CODE_DOWNLOAD_URL to a reachable redrob-linux-*.tar.gz." >&2
  exit 1
fi

args=(
  build
  -t "$IMAGE_REF"
  -f "$DOCKERFILE"
  --build-arg "REDROB_SERVER_VERSION=$REDROB_SERVER_VERSION"
  --build-arg "REDROB_CODE_VERSION=$REDROB_CODE_VERSION"
)

if [ -n "$REDROB_CODE_DOWNLOAD_URL" ]; then
  args+=(--build-arg "REDROB_CODE_DOWNLOAD_URL=$REDROB_CODE_DOWNLOAD_URL")
fi

if [ -n "$REDROB_GITHUB_TOKEN" ]; then
  export REDROB_GITHUB_TOKEN
  args+=(--secret "id=redrob_github_token,env=REDROB_GITHUB_TOKEN")
fi

if [ -n "$DOCKER_PLATFORM" ]; then
  args+=(--platform "$DOCKER_PLATFORM")
fi

args+=("$ROOT_DIR")

printf 'Building micro-sandbox image %s\n' "$IMAGE_REF"
printf '  redrob-server@%s\n' "$REDROB_SERVER_VERSION"
printf '  redrob-code@%s\n' "$REDROB_CODE_VERSION"

docker "${args[@]}"

printf '\nBuilt micro-sandbox image: %s\n' "$IMAGE_REF"
printf 'Run example:\n'
printf '  docker run --rm -p 8787:8787 -e REDROB_CONNECT_HOST=127.0.0.1 %s\n' "$IMAGE_REF"
printf 'Verify:\n'
printf '  curl http://127.0.0.1:8787/health\n'
printf '  curl -H "Authorization: Bearer microsandbox-token" http://127.0.0.1:8787/workspaces\n'
