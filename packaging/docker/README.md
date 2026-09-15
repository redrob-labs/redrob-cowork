# Redrob Cowork Host (Docker)

## Pre-baked Micro-Sandbox Image

For micro-sandbox work, use the pre-baked image that compiles `redrob-server` from source and downloads the pinned Redrob Code engine during `docker build`. `redrob-labs/redrob-code` is private, so the build needs `REDROB_GITHUB_TOKEN` (or `GH_TOKEN` / `GITHUB_TOKEN`) with read access to it, or `REDROB_CODE_DOWNLOAD_URL` pointing at a reachable archive.

Build it from the repo root:

```bash
./scripts/build-microsandbox-redrob-image.sh
```

Run it locally:

```bash
docker run --rm -p 8787:8787 \
  -e REDROB_CONNECT_HOST=127.0.0.1 \
  redrob-microsandbox:dev
```

Defaults:
- `REDROB_TOKEN=microsandbox-token`
- `REDROB_HOST_TOKEN=microsandbox-host-token`
- `REDROB_APPROVAL_MODE=auto`

Verification:
- Health: `curl http://127.0.0.1:8787/health`
- Authenticated API call: `curl -H "Authorization: Bearer microsandbox-token" http://127.0.0.1:8787/workspaces`
- Docker health: `docker inspect --format '{{json .State.Health}}' <container>`

Useful overrides:
- `REDROB_TOKEN` — set your own client bearer token
- `REDROB_HOST_TOKEN` — set your own host/admin token
- `REDROB_CONNECT_HOST` — host name embedded in the printed connect URL
- `DOCKER_PLATFORM` — optional platform passed to `docker build`

---

## Production container

This is a minimal packaging template to run the Redrob Cowork Host contract in a single container.

It runs:

- `redrob-server` published on `0.0.0.0:8787` (the only published surface)
- Managed Redrob Code engine (`redrob`) launched internally by `redrob-server`

### Local run (compose)

From this directory:

```bash
docker compose up --build
```

Then open:

- `http://127.0.0.1:8787/health`

### Config

Recommended env vars:

- `REDROB_TOKEN` (client token)
- `REDROB_HOST_TOKEN` (host/owner token)

Optional:

- `REDROB_APPROVAL_MODE=auto|manual`
- `REDROB_APPROVAL_TIMEOUT_MS=30000`

Persistence:

- Workspace is mounted at `/workspace`
- Host data dir is mounted at `/data` (Redrob Code caches + Redrob Cowork server config/tokens)

### Notes

- The Redrob Code engine is not exposed directly; access it via the Redrob Cowork proxy (`/opencode/*`).
- For PaaS, replace `./workspace:/workspace` with a volume or a checkout strategy (git clone on boot).
