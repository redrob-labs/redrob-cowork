/**
 * The agents behind the composer's Plan and Run, and behind Cross-check.
 *
 *   redrob-plan   asks what it needs, then writes the plan out and waits. Changes nothing.
 *   redrob-run    does the work (the redrob agent's behavior).
 *   redrob-check  reads an answer back and returns a Fact check and a Challenge. Hidden from pickers.
 *
 * Plan and check talk to the app in fenced JSON blocks whose language tag names the shape. The
 * renderer parses them into the design system's PlanQuestions, PlanDocument, FactCheckReport and
 * ChallengeReport; anything outside a block is ordinary prose. The shapes follow those components'
 * props so the parser maps rather than translates.
 */

export const DESK_PLAN_AGENT = "redrob-plan";
export const DESK_RUN_AGENT = "redrob-run";
export const DESK_CHECK_AGENT = "redrob-check";

/** Fence language tags. Shared with the renderer's parser; change both together. */
export const DESK_BLOCKS = {
  questions: "redrob-questions",
  plan: "redrob-plan",
  check: "redrob-check",
} as const;

const PLAN_PROMPT = `## Plan mode

You are in Plan mode. You do not change, send, post, sign, pay for or delete anything, and you do not run commands that change files. You may read files and the web to plan.

1. If you need answers before you can plan, ask at most four short questions, each with two to four options, in ONE fenced block tagged ${DESK_BLOCKS.questions}, then stop:

\`\`\`${DESK_BLOCKS.questions}
[{"id":"q1","question":"What do you need at the end?","options":["A yes or no, with the reason","A short memo","Something ready to send"],"defaultValue":0},
 {"id":"q2","question":"What should I read?","options":["This chat","The project's files","The web"],"multi":true,"defaultValue":[0,1]}]
\`\`\`

2. Once you have what you need, write the plan in ONE fenced block tagged ${DESK_BLOCKS.plan}, then stop and wait. The person runs it, edits it, or keeps it:

\`\`\`${DESK_BLOCKS.plan}
{"title":"A short update for the client, ready to send",
 "summary":"Written from this project's files and your answers. Nothing is read, sent or changed until you run it.",
 "sections":[{"heading":"How I will do it","ordered":true,"items":[{"lead":"Read where things stand.","text":"The latest draft and this project's chats."}]},
             {"heading":"What you will get","items":[{"text":"An answer in this chat, with anything to send as a Word document."}]}],
 "todo":[{"id":"s1","label":"Read the latest draft"},{"id":"s2","label":"Write the update"}],
 "note":"Fact check runs after, because you will send it."}
\`\`\`

Give each todo step a short id ("s1", "s2", ...) so a teammate can comment on it. Write for a professional who is not technical: plain words, no file paths, no code. Use valid JSON.`;

const RUN_PROMPT = `## Run mode

You are in Run mode: do the work. If the message carries a plan, follow it step by step. Anything that sends, posts, signs, pays or deletes must ask the person first.`;

const CHECK_PROMPT = `You check another AI's answer before a professional relies on it. You change nothing and run no commands that change anything.

You are given the question and the answer. Do one or both of:
- Fact check: test each factual claim against the sources the answer relied on and anything you can read. Verdict per claim: "holds", "partly" or "wrong", with a short note and the source.
- Challenge: argue against the answer's main conclusion for up to three rounds (for, against), then say whether it broke, held or changed, and what is still unsettled.

Reply with ONE fenced block tagged ${DESK_BLOCKS.check} and nothing else:

\`\`\`${DESK_BLOCKS.check}
{"fact":{"summary":"2 of 3 claims hold.","claims":[{"id":"c1","verdict":"holds","claim":"...","source":"...","note":"..."}],"missed":[{"text":"..."}]},
 "challenge":{"claim":"...","rounds":[{"for":"...","against":"..."}],"verdict":[{"kind":"held","text":"..."}],"unsettled":"..."}}
\`\`\`

Give each claim a short id ("c1", "c2", ...). Leave out "fact" or "challenge" when you were not asked for it. Plain words, no file paths, valid JSON.`;

type Permission = Record<string, unknown>;

/** What the check agent is refused rather than asked about. */
export const CHECK_NEVER_ASKS = {
  edit: "deny",
  bash: "deny",
  external_directory: "deny",
  doom_loop: "deny",
  webfetch: "allow",
} as const;

/** The three Desk agents, sharing the redrob agent's prompt and skill rules. */
export function deskAgents(base: { prompt: string; permission: Permission }): Record<string, Record<string, unknown>> {
  return {
    [DESK_PLAN_AGENT]: {
      description: "Plans the work and waits for the person to run it",
      mode: "primary",
      temperature: 0.2,
      prompt: `${base.prompt}\n\n${PLAN_PROMPT}`,
      permission: { ...base.permission, edit: "deny", bash: "deny" },
    },
    [DESK_RUN_AGENT]: {
      description: "Does the work, asking before anything with consequences",
      mode: "primary",
      temperature: 0.2,
      prompt: `${base.prompt}\n\n${RUN_PROMPT}`,
      permission: { ...base.permission },
    },
    [DESK_CHECK_AGENT]: {
      description: "Fact checks and challenges an answer",
      mode: "primary",
      hidden: true,
      temperature: 0,
      prompt: CHECK_PROMPT,
      // The check runs in a hidden session with no one to answer a question, so nothing may
      // ask: the engine's ask-by-default keys are denied, and reading and the web stay open.
      permission: { ...base.permission, ...CHECK_NEVER_ASKS },
    },
  };
}
