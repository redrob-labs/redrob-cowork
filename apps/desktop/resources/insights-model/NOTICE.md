# Work classifier encoder

`model_int8.onnx` and `tokenizer.json` are unchanged copies of `onnx/model_int8.onnx` and `tokenizer.json` from
[Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) at revision
`761b726dd34fb83930e26aab4e9ac3899aa1fa78`, an ONNX export of
[intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small), licensed under the MIT License.

`manifest.json` pins both files by SHA-256, and redrob-server pins `manifest.json` itself. The classifier head trained on
top of it is `apps/server/src/insights/work-head.json`. Measurements: `docs/features/ai-work-insights/model-evaluation.md`.
