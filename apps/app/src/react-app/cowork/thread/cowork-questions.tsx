import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { PlanQuestionData } from "./cowork-blocks";
import type { CustomAnswers, PlanAnswers } from "./thread-logic";

/** What one tap on an option does to a question's answer. Pure, so a test can read it. */
export function toggleOption(question: PlanQuestionData, current: number | number[] | null | undefined, index: number): number | number[] | null {
  if (question.multi) {
    const picked = Array.isArray(current) ? current : typeof current === "number" ? [current] : [];
    return picked.includes(index) ? picked.filter((value) => value !== index) : [...picked, index].sort((a, b) => a - b);
  }
  return current === index ? null : index;
}

/** Whether option `index` is picked in a question's answer. Pure. */
export function isPicked(current: number | number[] | null | undefined, index: number): boolean {
  return Array.isArray(current) ? current.includes(index) : current === index;
}

/** The answers each question starts from: its own default, else nothing picked. Pure. */
export function initialAnswers(questions: readonly PlanQuestionData[]): PlanAnswers {
  return Object.fromEntries(questions.map((question) => [question.id, question.defaultValue ?? null]));
}

/**
 * The "Something else" chip: clicked, the chip itself turns into a pill-shaped field in place, focused. Typing there
 * replaces the options picked for this question; emptying it and leaving (or Escape) turns it back
 * into the chip. Enter sends the whole card.
 */
function OtherChip(props: { questionText: string; value: string; onChange: (text: string) => void; onSubmit: () => void }) {
  const [editing, setEditing] = useState(Boolean(props.value));
  const input = useRef<HTMLInputElement>(null);
  const filled = Boolean(props.value.trim());
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button type="button" className="cowork-questions__opt cowork-questions__opt--other" aria-pressed={false} onClick={() => setEditing(true)}>
        {icons.edit({ width: 13, height: 13, "aria-hidden": true })}
        {t("cowork.thread_questions_custom")}
      </button>
    );
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      props.onSubmit();
    } else if (event.key === "Escape") {
      props.onChange("");
      setEditing(false);
    }
  };
  return (
    <span className="cowork-questions__opt cowork-questions__opt--input" data-filled={filled ? "" : undefined}>
      <input
        ref={input}
        type="text"
        value={props.value}
        aria-label={`${props.questionText} ${t("cowork.thread_questions_custom")}`}
        placeholder={t("cowork.thread_questions_custom_placeholder")}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!props.value.trim()) setEditing(false);
        }}
      />
    </span>
  );
}

/**
 * Plan's questions as the Cowork thread's own card (the DS PlanQuestions 1.7.0 has no
 * way to type an answer). Slightly smaller type than the DS card, a "Something else" chip under
 * each question that turns into a text field, and one "Execute" button (no "or reply in your own
 * words" hint). Sending posts every answer at once; the plan that comes back runs on its own.
 */
export function CoworkQuestionsCard(props: {
  questions: PlanQuestionData[];
  onSubmit: (value: PlanAnswers, custom: CustomAnswers) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<PlanAnswers>(() => initialAnswers(props.questions));
  const [custom, setCustom] = useState<CustomAnswers>({});
  const submit = () => {
    if (!props.disabled) props.onSubmit(value, custom);
  };
  return (
    <section className="cowork-questions" aria-label={t("cowork.thread_questions_label")}>
      <ol className="cowork-questions__list">
        {props.questions.map((question) => {
          const typed = custom[question.id] ?? "";
          const typing = Boolean(typed.trim());
          return (
            <li key={question.id} className="cowork-questions__item">
              <p className="cowork-questions__ask">
                {question.question}
                {question.multi ? <span className="cowork-questions__any"> {t("cowork.thread_questions_any")}</span> : null}
              </p>
              <div className="cowork-questions__opts" role="group" aria-label={question.question}>
                {question.options.map((option, index) => {
                  // A typed answer replaces the options, so none reads as picked while it is there.
                  const picked = !typing && isPicked(value[question.id], index);
                  return (
                    <button
                      key={index}
                      type="button"
                      className="cowork-questions__opt"
                      aria-pressed={picked}
                      onClick={() => {
                        setValue((prev) => ({ ...prev, [question.id]: toggleOption(question, prev[question.id], index) }));
                        if (typing) setCustom((prev) => ({ ...prev, [question.id]: "" }));
                      }}
                    >
                      {picked ? icons.check({ width: 13, height: 13, "aria-hidden": true }) : null}
                      {option}
                    </button>
                  );
                })}
                <OtherChip
                  questionText={question.question}
                  value={typed}
                  onChange={(text) => setCustom((prev) => ({ ...prev, [question.id]: text }))}
                  onSubmit={submit}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="cowork-questions__act">
        <Button onClick={submit} disabled={props.disabled}>
          {t("cowork.thread_questions_submit")}
        </Button>
      </div>
    </section>
  );
}
