# Work classifier encoder

`model_int8.onnx` and `tokenizer.json` are unchanged copies of `onnx/model_int8.onnx` and `tokenizer.json` from
[Xenova/multilingual-e5-base](https://huggingface.co/Xenova/multilingual-e5-base) at revision
`1ec9243030a27d1a115d5c340572074c125b58b2`, an ONNX export of
[intfloat/multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base), licensed under the MIT License.

`manifest.json` pins both files by SHA-256, and redrob-server pins `manifest.json` itself. The classifier head trained on
top of it is `apps/server/src/insights/work-head.json`. Measurements: `docs/features/ai-work-insights/model-evaluation.md`.
