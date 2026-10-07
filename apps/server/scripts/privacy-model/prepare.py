"""Prepare the privacy-model candidates for `pnpm privacy:eval`.

For each candidate in src/privacy/eval/candidates.json: download the pinned revision from Hugging
Face, use its shipped int8 ONNX file or export and dynamically int8-quantize the checkpoint, and write
manifest.json (labels, category map, SHA-256 of the model and tokenizer) beside it.

Measurement tooling only: nothing here is trained, and nothing it writes is committed. The output
directory defaults to apps/server/.privacy-models (gitignored).

    uv venv && uv pip install -r scripts/privacy-model/requirements.txt
    .venv/bin/python scripts/privacy-model/prepare.py [--out DIR] [--only KEY ...]
"""

import argparse
import hashlib
import json
import os
import shutil
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(os.path.dirname(HERE))
CANDIDATES = os.path.join(SERVER, "src", "privacy", "eval", "candidates.json")


def fetch(repo, revision, path, dest):
    if os.path.exists(dest):
        return dest
    url = f"https://huggingface.co/{repo}/resolve/{revision}/{path}"
    tmp = dest + ".part"
    with urllib.request.urlopen(url) as response, open(tmp, "wb") as out:
        shutil.copyfileobj(response, out)
    os.replace(tmp, dest)
    return dest


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def export_int8(directory):
    """Export to ONNX (input_ids/attention_mask/token_type_ids -> logits), then quantize weights only.

    Weight-only: MatMul weights become 8-bit blocks (MatMulNBits) and the word embeddings 4-bit blocks
    (GatherBlockQuantized), while activations stay float. Dynamic int8 (quantize_dynamic) also
    quantizes activations, and on these models it cost about 15 points of name recall; see the
    measurement doc. The result is about 100 MB for a base-size model.
    """
    import onnx
    import torch
    from onnxruntime.quantization import matmul_nbits_quantizer as nbits
    from transformers import AutoModelForTokenClassification

    out = os.path.join(directory, "model.int8.onnx")
    if os.path.exists(out):
        return out
    model = AutoModelForTokenClassification.from_pretrained(directory).eval()
    ids = torch.ones(1, 16, dtype=torch.long)
    fp32 = os.path.join(directory, "model.fp32.onnx")
    names = ["input_ids", "attention_mask", "token_type_ids"]
    torch.onnx.export(
        model,
        (ids, torch.ones_like(ids), torch.zeros_like(ids)),
        fp32,
        input_names=names,
        output_names=["logits"],
        dynamic_axes={name: {0: "batch", 1: "sequence"} for name in names + ["logits"]},
        opset_version=17,
        dynamo=False,
    )
    graph = onnx.load(fp32)
    for bits, ops in ((8, ("MatMul",)), (4, ("Gather",))):
        config = nbits.DefaultWeightOnlyQuantConfig(
            block_size=128,
            is_symmetric=True,
            accuracy_level=4,
            bits=bits,
            op_types_to_quantize=ops,
            quant_axes=(("MatMul", 0), ("Gather", 1)),
        )
        quantizer = nbits.MatMulNBitsQuantizer(graph, algo_config=config)
        quantizer.process()
        graph = quantizer.model.model
    onnx.save(graph, out)
    os.remove(fp32)
    return out


def prepare(candidate, root):
    directory = os.path.join(root, candidate["key"])
    os.makedirs(directory, exist_ok=True)
    repo, revision = candidate["id"], candidate["revision"]
    config = json.load(open(fetch(repo, revision, "config.json", os.path.join(directory, "config.json"))))
    labels = [config["id2label"][str(index)] for index in range(len(config["id2label"]))]

    if "onnx" in candidate:
        model = fetch(repo, revision, candidate["onnx"], os.path.join(directory, "model.int8.onnx"))
    else:
        for name in ("model.safetensors", "pytorch_model.bin"):
            try:
                fetch(repo, revision, name, os.path.join(directory, name))
                break
            except urllib.error.HTTPError:
                continue
        model = export_int8(directory)

    source = candidate.get("tokenizerFrom", {"id": repo, "revision": revision, "file": candidate.get("tokenizer", "tokenizer.json")})
    tokenizer = fetch(source["id"], source["revision"], source["file"], os.path.join(directory, "tokenizer.json"))

    manifest = {
        "id": repo,
        "revision": revision,
        "license": candidate["license"],
        "model": {"file": os.path.basename(model), "sha256": sha256(model)},
        "tokenizer": {"file": "tokenizer.json", "sha256": sha256(tokenizer)},
        "labels": labels,
        "categories": candidate["categories"],
    }
    with open(os.path.join(directory, "manifest.json"), "w") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"{candidate['key']}: {os.path.getsize(model) / 1e6:.1f} MB, {len(labels)} labels")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(SERVER, ".privacy-models"))
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    for candidate in json.load(open(CANDIDATES))["candidates"]:
        if args.only and candidate["key"] not in args.only:
            continue
        prepare(candidate, args.out)


if __name__ == "__main__":
    main()
