# Privacy detection model

`model.int8.onnx` and `tokenizer.json` are derived from [1T/veil-pii-ko-lite](https://huggingface.co/1T/veil-pii-ko-lite)
at revision `dd26d2b1ca189f9c819a783f75e944e4baf22050`, licensed under the Apache License 2.0
(https://www.apache.org/licenses/LICENSE-2.0).

Modification: the weights were exported to ONNX and quantised (8-bit matmul weights, 4-bit embeddings) by
`apps/server/scripts/privacy-model/prepare.py`. The tokenizer is unchanged. `manifest.json` pins both files by SHA-256,
and redrob-server pins `manifest.json` itself. Measurements: `docs/features/team-and-privacy-service/model-evaluation.md`.
