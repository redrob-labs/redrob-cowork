# Redrob Work Model Catalog

This directory is the static publish root for the generated Redrob Work model catalog.

Cloudflare Pages can deploy this directory directly:

- Build command: `pnpm --dir ee/apps/inference models:build`
- Build output directory: `ee/apps/inference/models-site`
- Catalog URL: `/models/api.json`

The generated `models/api.json` file is ignored by git. It is rebuilt from `src/models/base.json` and the active Redrob Work overlay by `scripts/build-models.mjs`.

Redrob Work-specific models live in `src/models/redrob-models.json`. `scripts/build-models.mjs` turns that list into the Redrob Work provider overlay at build time and switches the provider API URL based on `REDROB_DEV_MODE`.

Local development still serves the generated catalog from the inference Hono app at `/models/api.json` so one local service can provide both the proxy API and model catalog during dev.
