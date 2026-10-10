/** Kotak jawaban "tanya dan tunggu" di bawah panggung (scratch-gui components/question). */
import { useEffect, useRef, useState } from "react";
import { useT } from "../shell/i18n";

interface QuestionPromptProps {
  question: string;
  onSubmit(answer: string): void;
}

export function QuestionPrompt({ question, onSubmit }: QuestionPromptProps) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (): void => onSubmit(answer);
  return (
    <div className="kb-question">
      <div className="kb-question__box">
        {question ? <div className="kb-question__label">{question}</div> : null}
        <div className="kb-question__row">
          <input
            ref={input}
            className="kb-question__input"
            type="text"
            aria-label={question || t("stage.answer")}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button type="button" className="kb-question__submit" aria-label={t("stage.submitAnswer")} onClick={submit}>
            {"✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
