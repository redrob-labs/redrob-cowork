FROM node:22-bookworm-slim

ARG REDROB_SERVER_VERSION=0.18.4
ARG REDROB_CODE_VERSION=0.0.1
ARG REDROB_CODE_GITHUB_REPO=redrob-labs/redrob-code
ARG REDROB_CODE_DOWNLOAD_URL=

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tar \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g "redrob-server@${REDROB_SERVER_VERSION}"

# redrob-labs/redrob-code is a private repository: anonymous release downloads
# 404, so the archive is resolved through the authenticated Releases API by asset
# id. Pass the token as a BuildKit secret so it never lands in an image layer:
#   docker build --secret id=redrob_github_token,env=REDROB_GITHUB_TOKEN .
# REDROB_CODE_DOWNLOAD_URL takes precedence for mirrors or pre-signed URLs.
RUN --mount=type=secret,id=redrob_github_token \
  set -eu; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) asset="redrob-linux-x64-baseline.tar.gz" ;; \
    arm64) asset="redrob-linux-arm64.tar.gz" ;; \
    *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
  esac; \
  tmpdir="$(mktemp -d)"; \
  if [ -n "$REDROB_CODE_DOWNLOAD_URL" ]; then \
    curl -fsSL "$REDROB_CODE_DOWNLOAD_URL" -o "$tmpdir/$asset"; \
  else \
    if [ ! -s /run/secrets/redrob_github_token ]; then \
      echo "Cannot download the Redrob Code engine: ${REDROB_CODE_GITHUB_REPO} is private and no token was mounted." >&2; \
      echo "Build with --secret id=redrob_github_token,env=REDROB_GITHUB_TOKEN or set REDROB_CODE_DOWNLOAD_URL." >&2; \
      exit 1; \
    fi; \
    api="https://api.github.com/repos/${REDROB_CODE_GITHUB_REPO}/releases"; \
    curl -fsSL -H "Authorization: Bearer $(cat /run/secrets/redrob_github_token)" \
      -H "Accept: application/vnd.github+json" \
      "$api/tags/v${REDROB_CODE_VERSION}" -o "$tmpdir/release.json"; \
    asset_id="$(node -e 'const r=require(process.argv[1]);const a=(r.assets||[]).find((x)=>x.name===process.argv[2]);if(!a){console.error(`${process.argv[2]} is not attached to the release`);process.exit(1);}process.stdout.write(String(a.id));' "$tmpdir/release.json" "$asset")"; \
    curl -fsSL -H "Authorization: Bearer $(cat /run/secrets/redrob_github_token)" \
      -H "Accept: application/octet-stream" \
      "$api/assets/${asset_id}" -o "$tmpdir/$asset"; \
  fi; \
  tar -xzf "$tmpdir/$asset" -C "$tmpdir"; \
  binary="$(find "$tmpdir" -type f -name redrob | head -n 1)"; \
  test -n "$binary"; \
  install -m 0755 "$binary" /usr/local/bin/redrob; \
  rm -rf "$tmpdir"

# Persistent directories (mount volumes here on PaaS/SSH).
# The data path deliberately keeps its historical name: existing deployments
# have volumes mounted at /data/openwork-orchestrator, and renaming it here
# would silently orphan their state. The orchestrator CLI itself is gone; this
# is only a directory name kept for compatibility.
ENV REDROB_DATA_DIR=/data/openwork-orchestrator
ENV REDROB_SIDECAR_DIR=/data/sidecars

# The workspace is mounted from the host/volume.
ENV REDROB_WORKSPACE=/workspace

# Redrob Work host contract surface.
EXPOSE 8787

VOLUME ["/workspace", "/data"]

# Defaults:
# - Redrob Work server is published intentionally via --host 0.0.0.0
# - The Redrob Code engine is managed by redrob-server and stays internal
CMD ["/bin/sh", "-lc", "plugin_dir=\"$(npm root -g)/redrob-server/dist/opencode-plugins\"; test -d \"$plugin_dir\"; export REDROB_MANAGE_OPENCODE=1 REDROB_CODE_BIN=/usr/local/bin/redrob REDROB_EXTENSIONS_PLUGIN_DIR=\"$plugin_dir\"; exec redrob-server --workspace \"${REDROB_WORKSPACE:-/workspace}\" --host 0.0.0.0 --port \"${REDROB_PORT:-8787}\" --cors \"${REDROB_CORS_ORIGINS:-*}\" --approval \"${REDROB_APPROVAL_MODE:-manual}\""]
