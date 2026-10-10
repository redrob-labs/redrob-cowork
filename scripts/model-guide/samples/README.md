# Model Guide samples

One example task per profession and task, run on every model the guide ranks for it, so a reader can compare
real outputs side by side. Every model on a task gets the same prompt.

## Prompt files

`prompts/<language>/<profession>/<task>.md`, one per task:

```markdown
---
profession: marketer          # id from config/tasks.json
task: optimize-search         # id from config/tasks.json
language: en                  # en | ko | hi
deliverable: documents        # what the answer is shaped as; see below
---

## Prompt

The text sent to every model, verbatim. Self-contained: all data the task needs is inline.

## A strong answer

- 3 to 6 bullets a reviewer (or a later grader) checks the answer against. Never sent to the model.

## Card

brief: One sentence, at most 25 words: the situation and the ask, in plain words.
given:
- Bank statement: ending balance and 5 bank-side items
- 3 to 6 lines: each input the model was given, as "Name: what it holds", with counts where they help
asked:
- A reconciliation table, with the method for each line
- One line per deliverable the prompt asks for, in its order
limit: Up to about 1,200 words, in Markdown
hard: One sentence on what makes it hard, without giving away an answer

## Scorecard

- 3 to 6 checks, one line each (at most ~18 words), that an answer passes or fails
- Each names the figure or decision it checks, so a grader and a reader can verify it from the answer
```

`## Prompt` is the only part a model ever sees; changing it would leave every recorded answer answering a
different question, so the sections after it are where the page's copy lives.

- **Card** is the task as the guide shows it, above the scorecard. `given` lists only what is in the prompt,
  in the order it appears; `asked` mirrors the prompt's own deliverables; `hard` names the kinds of difficulty
  (a planted inconsistency, a policy to apply, a judgement call), never the specific trap, because the
  scorecard is where specifics belong.
- **Scorecard** is what each answer is graded on, pass / partial / miss per line, and what the guide shows
  beside each model. It covers the same ground as "A strong answer", which stays as the grader's fuller
  reference: every scorecard line must be checkable against it, and every bullet there must be covered by at
  least one scorecard line.
- Korean and Hindi files carry their own Card, written in their own language and matching their adapted data
  (won and K-IFRS, rupees and Ind AS). Card keys (`brief:`, `given:` ...) stay in English.
- Their `## Scorecard` stays in English, like "A strong answer", with their own figures, so one grader and one
  set of instructions serve all three languages. They add `## Scorecard, shown`: the same lines, in the same
  order and number, in their own language. That is what the guide displays; line n of each is the same check.

### Rules for a prompt

- **Difficulty: intermediate to high.** The work a capable professional would spend 1–3 hours on: several
  constraints, at least one trap or inconsistency in the data to notice, and a judgement call to make and
  justify. Not a trivia question, not a toy.
- **Self-contained.** The run has no tools: no web, no files. Every figure, document excerpt or record the task
  needs is in the prompt, as markdown tables, quoted excerpts or code blocks. A task that would normally search
  the web gives the search results inline ("Here is what the research turned up: ...").
- **Realistic and specific.** Real-world shapes (a trial balance, an NDA clause, a GA4 export, a stack trace),
  plausible numbers that add up unless the inconsistency is deliberate.
- **Fictional.** Placeholder people from the fixed set (John Doe, Jane Doe, Richard Roe, Mary Major, John Stiles,
  Richard Miles; in Korean 홍길동, 김철수, 이영희, 박영수), fictional companies, `example.com` addresses. No real
  person, client or internal domain.
- **Answer shape stated.** Say what to deliver and in what shape, rendered as markdown:
  - documents: headed sections, prose, tables where they help
  - spreadsheets: markdown tables, with the formula or method behind each computed column stated
  - presentations: slide by slide (`### Slide n: title`, bullets, a one-line speaker note)
  - graphics: the copy, layout and visual direction, plus an inline SVG or HTML mock-up in a code block
  - web: a single-file HTML/CSS prototype in a code block, plus the design rationale
  - none of these (engineering, email, chat tasks): the natural artifact (code, diff, email, message)
- **Bounded.** 250–700 words of prompt including data. Ask for an answer of at most ~1,200 words (code may run
  longer), so outputs stay comparable and readable.
- **Neutral.** Nothing that favours one model's style or vendor.

## Running them

`run.mjs` sends each task's prompt, unchanged, to every model the guide ranks for that task on Redrob Cowork. Each call uses the model's ranked thinking level, the language's system line, and up to 48,000 output tokens. Each run is written to `outputs/<language>/<profession>/<task>/<model>@<level>.json`, which holds the output, the token usage, the cost Redrob billed and the date.

- **Spend is capped at $150, the approved amount**, counted over every output already written, so a re-run continues instead of spending again.
  - Before each call, the runner reserves that call's worst case: its prompt plus 48,000 output tokens at list price, plus 25%. It won't start a call that could take the total past the cap.
  - A failed call that Redrob billed is recorded under `outputs/_failed/` so it still counts toward the total.
- **Order:** every task's #1 in all three languages, then every #2, and so on. If the cap is reached, the samples missing are for lower-ranked picks.
- **Running it:** the `model-guide-samples` workflow runs it with the repository's `REDROB_API_KEY`. Changing `capUsd` in `run-request.json` on `feat/guide-samples` starts it. It commits outputs every 30 runs. Locally: `REDROB_API_KEY=... node scripts/model-guide/samples/run.mjs --allow-data-share --deadline 540`.
  - `--allow-data-share` opts in for models Redrob serves only with `provider_data_share` (Claude Fable 5.1). That is the account holder's consent, so it is off by default.
  - `--deadline <s>` starts no new call after that many seconds, so a run in a time-limited shell ends cleanly.
  - `--exclude-models a,b` leaves models for a later run.
- **Timeouts:** Redrob ends an upstream call at 120 seconds and bills it nothing. An answer that needs longer (most Claude Fable 5.1 runs at Extra high, and some long Opus 5.5 ones) times out on every try. Such a run gets one retry and stays missing until the limit is raised.
- **Not shown:** a run that a provider's safety filter stopped (`finish_reason: content_filter`) is kept on file so its cost counts, but `build.mjs` leaves it out, since a half answer would misrepresent the model.

## Languages

English is written first and reviewed. Korean and Hindi are adapted, not translated: Korean accounting uses
K-IFRS and Korean tax, Korean law tasks use Korean law, amounts are in KRW or INR, names follow the fixed set.
