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
| Model id | `auto` |

Supply your Redrob API key through the `REDROB_API_KEY` environment variable
before connecting the provider. The key is never stored in the repository; only
the environment variable name is referenced in configuration.

## Request options

None. `auto` is a plain OpenAI-compatible model: the console routes each request
to the right model in its catalog, and it rejects the retired language fields
(`indicAssist`, `detectLanguage`) that the removed `redrob-ai` alias accepted, so
no per-model `options` are sent.

## Connecting

Use the **Connect Redrob** workspace starter or the connect-provider modal and
select **Redrob**. The provider config is produced by
`buildRedrobProviderConfig()` in
`apps/app/src/react-app/domains/settings/redrob-provider.ts`, the single source
of truth for the Redrob provider id, base URL, model id, env var, and request
options.
