# Redrob inference provider

Redrob Work ships a built-in [Redrob](https://console.redrob.ai) inference
provider. Redrob exposes an OpenAI-compatible API, so it is wired through the
same `@ai-sdk/openai-compatible` driver used by the other OpenAI-compatible
providers in the app.

## Configuration

| Setting | Value |
| --- | --- |
| Provider id | `redrob` |
| Base URL | `https://console.redrob.ai/api/backend/v1` |
| API key env var | `REDROB_API_KEY` |
| Model id | `redrob-ai` |

Supply your Redrob API key through the `REDROB_API_KEY` environment variable
before connecting the provider. The key is never stored in the repository; only
the environment variable name is referenced in configuration.

## Request options

The `redrob-ai` model sends two Redrob-specific request options (the
OpenAI `extra_body` equivalent) through the provider's per-model `options`
passthrough:

- `indicAssist: true`
- `detectLanguage: true`

Redrob returns a top-level `redrob` object alongside the standard response
(`detectedLanguage`, `translationUsed`, `latencyMs`) plus usual usage tokens.
This is informational and requires no client-side parsing.

## Connecting

Use the **Connect Redrob** workspace starter or the connect-provider modal and
select **Redrob**. The provider config is produced by
`buildRedrobProviderConfig()` in
`apps/app/src/react-app/domains/settings/redrob-provider.ts`, the single source
of truth for the Redrob provider id, base URL, model id, env var, and request
options.
