"""
Trains the work classifier's head and measures it on the evaluation set.

Reproduce:
    uv pip install -r apps/server/scripts/insights-model/requirements.txt
    cd apps/server
    bun scripts/insights-model/export.ts > .insights-models/eval-data.json
    python scripts/insights-model/train.py .insights-models/eval-data.json

The head is softmax regression on a frozen encoder's sentence embeddings, at two levels: the work
family (write, sheet, code, design, or not work) and the kind of work. Training uses the training set
and the prototypes; the confidence floors come from 5-fold cross-validation on that same data. The
evaluation set is embedded once, at the end, and only scored. Writes the head of the best candidate
that passes to .insights-models/head.json.
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import evaluate as ev  # noqa: E402

FAMILY = {
    "reply": "write", "summ": "write", "email": "write", "research": "write", "spec": "write",
    "copy": "write", "translate": "write", "policy": "write", "hr": "write",
    "analyze": "sheet", "finance": "sheet",
    "code": "code", "fix": "code", "review": "code", "test": "code",
    "design": "design",
}
FOLDS = 5
SCALE = 20.0


def fit(x, labels, epochs=600, lr=0.5, l2=1e-3):
    classes = sorted({l for l in labels if l is not None}) + [None]
    y = np.array([classes.index(l) for l in labels])
    onehot = np.eye(len(classes))[y]
    xs = x * SCALE
    w = np.zeros((x.shape[1], len(classes)))
    b = np.zeros(len(classes))
    for _ in range(epochs):
        logits = xs @ w + b
        logits -= logits.max(axis=1, keepdims=True)
        p = np.exp(logits)
        p /= p.sum(axis=1, keepdims=True)
        grad = p - onehot
        w -= lr * (xs.T @ grad / len(y) + l2 * w)
        b -= lr * grad.mean(axis=0)
    return classes, w, b


def predict(model, x):
    classes, w, b = model
    logits = (x * SCALE) @ w + b
    logits -= logits.max(axis=1, keepdims=True)
    p = np.exp(logits)
    p /= p.sum(axis=1, keepdims=True)
    k = p.argmax(axis=1)
    return [classes[i] for i in k], p[np.arange(len(k)), k]


def floor_for(x, labels, target):
    """The lowest confidence at which cross-validated precision on named labels reaches the target."""
    rng = np.random.default_rng(7)
    order = rng.permutation(len(labels))
    held = []
    for f in range(FOLDS):
        test = order[f::FOLDS]
        train = np.setdiff1d(order, test)
        model = fit(x[train], [labels[i] for i in train])
        names, conf = predict(model, x[test])
        held += [(n, c, labels[i]) for n, c, i in zip(names, conf, test)]
    for floor in np.arange(0.05, 0.96, 0.01):
        named = [(n, l) for n, c, l in held if n is not None and c >= floor]
        if named and sum(n == l for n, l in named) / len(named) >= ev.BAR["precision"]:
            return float(floor)
    return 0.96


def answer(model, floor, x):
    names, conf = predict(model, x)
    return [n if n is not None and c >= floor else None for n, c in zip(names, conf)]


def score(answers, truths, samples):
    def rates(keep):
        rows = [(a, t, s) for a, t, s in zip(answers, truths, samples) if keep(s)]
        named = [(a, t) for a, t, _ in rows if a is not None]
        work = [(a, t) for a, t, _ in rows if t is not None]
        none = [a for a, t, _ in rows if t is None]
        return {
            "precision": sum(a == t for a, t in named) / len(named) if named else None,
            "coverage": sum(a is not None for a, _ in work) / len(work) if work else None,
            "abstain": sum(a is None for a in none) / len(none) if none else None,
        }

    return {
        "all": rates(lambda s: True),
        "en": rates(lambda s: s["lang"] == "en"),
        "ko": rates(lambda s: s["lang"] == "ko"),
        "hard": rates(lambda s: s["source"] == "hard"),
    }


def bar(result, size_mb, ms):
    a = result["all"]
    fails = []
    if (a["precision"] or 0) < ev.BAR["precision"]:
        fails.append("precision")
    if (a["coverage"] or 0) < ev.BAR["coverage"]:
        fails.append("coverage")
    if (a["abstain"] or 0) < ev.BAR["abstain"]:
        fails.append("abstain")
    if (result["en"]["precision"] or 0) - (result["ko"]["precision"] or 0) > ev.BAR["ko_gap"]:
        fails.append("korean")
    if size_mb > ev.BAR["size_mb"]:
        fails.append("size")
    if ms > ev.BAR["ms"]:
        fails.append("latency")
    return "pass" if not fails else "fail: " + ", ".join(fails)


def main():
    data = json.loads(Path(sys.argv[1]).read_text())
    train = [{"text": p["text"], "action": None if p["learn"] else p["action"]} for p in data["prototypes"]] + [
        {"text": t["text"], "action": None if t["learn"] else t["action"]} for t in data["training"]
    ]
    samples = data["samples"]
    reports = []
    best = None
    for cid, repo, revision, onnx_file, prefix, _ in ev.CANDIDATES:
        session, tokenizer, size_mb, _, full = ev.load(repo, revision, onnx_file)
        x, _ = ev.embed(session, tokenizer, [t["text"] for t in train], prefix)
        actions = [t["action"] for t in train]
        families = [FAMILY[a] if a else None for a in actions]
        action_model, family_model = fit(x, actions), fit(x, families)
        action_floor, family_floor = floor_for(x, actions, ev.BAR["precision"]), floor_for(x, families, ev.BAR["precision"])
        sx, times = ev.embed(session, tokenizer, [s["text"] for s in samples], prefix)
        ms = float(np.median(times))
        result = {}
        for level, model, floor, truth in (
            ("action", action_model, action_floor, [s["action"] for s in samples]),
            ("family", family_model, family_floor, [FAMILY[s["action"]] if s["action"] else None for s in samples]),
        ):
            r = score(answer(model, floor, sx), truth, samples)
            r["floor"] = round(floor, 2)
            r["bar"] = bar(r, size_mb, ms)
            result[level] = r
        report = {"id": cid, "repo": repo, "revision": full, "file": onnx_file, "size_mb": round(size_mb, 1), "ms": round(ms, 1), **result}
        reports.append(report)
        if best is None and (result["action"]["bar"] == "pass" or result["family"]["bar"] == "pass"):
            best = (report, action_model, action_floor, family_model, family_floor, prefix)
    print(json.dumps({"bar": ev.BAR, "training": len(train), "samples": len(samples), "reports": reports}, indent=1))
    if best:
        report, am, af, fm, ff, prefix = best

        def dump(model, floor):
            classes, w, b = model
            return {"classes": classes, "scale": SCALE, "floor": floor, "w": np.round(w, 5).tolist(), "b": np.round(b, 5).tolist()}

        head = {
            "encoder": {k: report[k] for k in ("repo", "revision", "file")},
            "prefix": prefix,
            "action": dump(am, af) if report["action"]["bar"] == "pass" else None,
            "family": dump(fm, ff),
        }
        Path(sys.argv[1]).with_name("head.json").write_text(json.dumps(head))


if __name__ == "__main__":
    main()
