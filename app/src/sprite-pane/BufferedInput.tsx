/** Input yang mengirim nilai saat blur / Enter (scratch-gui BufferedInputHOC). */
import { useState, type InputHTMLAttributes } from "react";
import { flushBufferedValue } from "./sprite-logic";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onSubmit" | "onChange" | "onBlur" | "onKeyDown">;

export interface BufferedInputProps extends BaseProps {
  value: string | number;
  onSubmit(value: string | number): void;
  small?: boolean;
}

export function BufferedInput({ value, onSubmit, small, className, ...rest }: BufferedInputProps) {
  const [buffer, setBuffer] = useState<string | null>(null);
  const flush = (): void => {
    const out = flushBufferedValue(value, buffer);
    if (out !== undefined) onSubmit(out);
    setBuffer(null);
  };
  return (
    <input
      {...rest}
      type="text"
      className={["kb-input", small ? "kb-input--small" : "", className ?? ""].join(" ").trim()}
      value={buffer ?? String(value)}
      onChange={(e) => setBuffer(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          flush();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
