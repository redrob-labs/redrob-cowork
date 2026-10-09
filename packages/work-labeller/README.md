# @redrob-labs/work-labeller

Labels an AI work session on the person's machine, for the Redrob Console's insights: the kind of work and its family, the mode (Look up to Orchestrate), the outcome, and the agent figures. Only the labels leave the machine; message text never does. Redrob Cowork, Office and Design all use it, so a session labels the same way in each.

## Pieces

- **The work classifier.** A pinned multilingual-e5-base encoder (int8 ONNX, 278 MB) and two trained heads. It reads a session's first message and names the kind of work and family, or nothing. On the evaluation set: 88.6% precision on the kind of work, 93.8% on the family ([model-evaluation.md](https://github.com/redrob-labs/redrob-cowork/blob/develop/docs/features/ai-work-insights/model-evaluation.md)).
- **`SessionRecorder`.** Folds an app's facts (turns, tool calls, aborts, busy time) into one tally per session, and labels each session that has finished.
- **`syncOutbox`.** Sends finished sessions to `POST /v1/insights/sessions` with the person's Redrob Key.

Each app reduces its own agent events to `Fact`s and keeps its own outbox.

## Getting started

```ts
import { SessionRecorder, syncOutbox, type LabelingApp } from "@redrob-labs/work-labeller";
import { WorkClassifierSource } from "@redrob-labs/work-labeller/node";

const app: LabelingApp = { toolKey: "office", idPrefix: "of_", labelerId: "office", labelerVersion: "1" };
const classifier = new WorkClassifierSource({ directory: "/path/to/model" });
const recorder = new SessionRecorder(app, (session) => outbox.add(session));

recorder.observe({ kind: "user-turn", sessionID, messageID, at: Date.now(), attachedSource: false });
await recorder.observeFirstMessage(sessionID, messageID, text, (value) => classifier.label(value));
await recorder.sweep(Date.now());
await syncOutbox(outbox, { readKey, fetch, baseUrl: "https://console.redrob.ai/api/backend/v1" });
```

In a webview, use `createWorkClassifier({ model, tokenizer }, ort)` from the runtime-neutral entry, with `onnxruntime-web` and bytes your app read. The files must hash to `MANIFEST`.

## Development

| Command | What it does |
| --- | --- |
| `pnpm test` | Tokenizer parity with Hugging Face `tokenizers`, the heads, the labels |
| `pnpm typecheck`, `pnpm build` | Types; the ESM build in `dist/` |

## License

MIT. The model is intfloat/multilingual-e5-base (MIT); see `NOTICE.md`.
