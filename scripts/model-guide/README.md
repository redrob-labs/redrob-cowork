# Model Guide research

These scripts produce `apps/app/src/react-app/desk/guide/model-guide.json`, which holds the rankings behind the
guide's "By profession" view.

```bash
node scripts/model-guide/fetch.mjs         # reads every board into snapshots/<today>.json
node scripts/model-guide/fetch-redrob.mjs  # reads what Redrob serves into snapshots/redrob/<today>.json
node scripts/model-guide/build.mjs         # ranks from the newest snapshots and writes the app's JSON
```

`build.mjs --snapshot 2026-10-08` re-ranks from an older snapshot. The fetch writes nothing if any board fails,
because a ranking with one board missing would not show the gap.

## Files

| File | What it holds |
|---|---|
| `config/tasks.json` | Each profession's five tasks: monthly runs, tools, the outputs it makes, whether it ends in an image, the cost of one run, and the weight on each benchmark. |
| `config/models.json` | The models that can be ranked: their ranked effort, the efforts they offer, the harnesses they run on, Artificial Analysis names per effort, the price page, and any figures carried from the last edition. |
| `config/method.json` | The weights, the rules below, and the two benchmark picks. |
| `snapshots/*.json` | Each board as it was printed on the date in the file name. |

## How a pick is scored

The total is quality × 0.55 + reliability × 0.25 + speed × 0.05 + cost × 0.15. For each task and working language,
the guide shows the top five candidates by total, one candidate per model.

- **Quality** = 100 − Σ weight × gap. The gap measures how far a model falls below the best candidate on a
  benchmark.
  - Accuracy boards: the gap is in percent of the best score.
  - Elo boards: the gap is in percent of win probability.
  - Korean rankings: the Text Arena gap is the average of the overall gap and the Korean-slice gap.
  - When an output is chosen, half of quality comes from that output's own benchmark:
    - Documents, presentations and spreadsheets use AA-Briefcase pass rates by deliverable file type. Spreadsheets
      also use Vals Excel Modeling.
    - Graphics uses WebDev Brand & Marketing.
    - Web/UI uses WebDev (Overall) and Reference-Based Design.
  - A model with no figure on a benchmark takes its own average gap on the task's other benchmarks, and the pick
    is marked *partly estimated*.
- **Reliability** comes from the last edition for the models it covered.
  - A model with no carried value takes the lowest carried value and is marked *partly estimated*. This means a
    model nobody has measured never outranks one that has been measured.
  - On Redrob Cowork, reliability falls by 15% × the share of the task's tools that are email, CRM or calendar.
    These connectors run through MCP there.
- **Speed** comes from the last edition. A model with no carried value gets 41.68 × ln(Artificial Analysis output
  tokens/s) − 147.28, clamped to 0–100. This formula is fitted to the carried values.
- **Cost** = 100 × (ln max − ln c) / (ln max − ln min). Here c is the model's Artificial Analysis Intelligence Index
  cost per task at its ranked effort, and max and min are taken across that whole board. This formula reproduces
  the last edition's cost score for every model except Sonnet 5.5.
- **Monthly** = runs × the task's cost per run × the model's cost per run at its effort × a language factor
  (Korean 1.095, Hindi 1.186), plus images.
  - The per-task and per-model factors were fitted to the last edition.
  - A model with no fitted factor scales Opus 5.5's factor by the ratio of their Artificial Analysis costs per
    task.
  - The likely range shown is half to double the estimate.

The task weights in `config/tasks.json` were fitted to the 6 Oct 2026 edition, whose method was not recorded. The
fit reproduces that edition's #1 pick in 159 of 165 rankings. The accountant tasks have no past edition, so their
weights are set by hand from what each task is measured on. Their Korean rankings are marked *partly estimated*
because no public benchmark covers Korean tax or K-IFRS work.

## On Redrob Cowork

A pick on Redrob Cowork is ranked as it runs there. Redrob serves each model at its own set of thinking levels
(`thinkingLevels` in Console's public `GET /v1/pricing`, read by `fetch-redrob.mjs`). Each model's Redrob id is
`redrob` in `config/models.json`.

- A model is ranked at its configured level when Redrob serves it, else at the highest served level below it. For
  example, Claude Opus 5.5 is ranked at Max on Claude Cowork but at High on Redrob Cowork.
- "Try another effort" lists only the served levels.
- A level with no figures of its own (Muse Spark 1.3 at High) reads the nearest level that has some, and the pick
  is marked *partly estimated*.
- A model Redrob serves with no adjustable level (GPT-6 Astra) runs at its provider default, read as
  `redrob.providerDefault` in `config/method.json`.
- A model with no Redrob id (`"redrob": null`, Claude Haiku 5.5) is ranked as configured. The guide shows it, but
  cannot switch a chat to it.
- The research carries `catalogue`: guide model id to Redrob id, for the app's "Use this" and for Console's sync.

Nothing is marked "coming soon". A task lists the tools it needs, and that is all.

## Benchmark picks

GPT-6 Astra on ChatGPT Work and Claude Opus 5.5 on Claude Cowork are scored like every other candidate. When one of
them would make the top five, it appears greyed out directly after the same model's Redrob Cowork pick and takes no
slot in the five. Redrob Auto cannot route work to another company's product, which is why these picks cannot be
used from the guide.

## Who is ranked

Only models that are publicly available in the US. Gemini 4 Argon is excluded. Models that Artificial Analysis
lists as deprecated are dropped. Models from labs that host their service outside the US are marked *outside US*.
