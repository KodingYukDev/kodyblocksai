/**
 * Tombol panah + spasi di layar untuk tablet tanpa keyboard, supaya game dengan blok
 * "ketika tombol ... ditekan" / "tombol ... ditekan?" tetap bisa dimainkan.
 * Setiap tombol mengirim keydown saat disentuh dan keyup saat dilepas (multi-sentuh didukung).
 */
import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useT, type MessageKey } from "../shell/i18n";
import { ArrowIcon } from "../shell/icons";
import type { ShellController } from "../shell/types";

/** Nilai event.key DOM yang dikirim ke IO keyboard (dipetakan engine ke "left arrow", "space", ...). */
export const KEYPAD_KEYS = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  space: " ",
} as const;
export type KeyPadKey = keyof typeof KEYPAD_KEYS;

interface KeyPadProps {
  controller: Pick<ShellController, "postKeyboard">;
  width: number;
}

const LABELS: Record<KeyPadKey, MessageKey> = {
  up: "keypad.up",
  down: "keypad.down",
  left: "keypad.left",
  right: "keypad.right",
  space: "keypad.space",
};

export function KeyPad({ controller, width }: KeyPadProps) {
  const t = useT();
  /** pointerId -> tombol yang sedang ditekan. */
  const held = useRef(new Map<number, KeyPadKey>());

  const press = (key: KeyPadKey, isDown: boolean): void => controller.postKeyboard({ key: KEYPAD_KEYS[key], isDown });

  // Lepas semua tombol saat keypad ditutup agar sprite tidak terus bergerak.
  useEffect(() => {
    const map = held.current;
    return () => {
      for (const k of new Set(map.values())) controller.postKeyboard({ key: KEYPAD_KEYS[k], isDown: false });
      map.clear();
    };
  }, [controller]);

  const handlers = (key: KeyPadKey) => ({
    onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Beberapa browser lama tidak mendukung capture; tetap jalan tanpa itu.
      }
      held.current.set(e.pointerId, key);
      press(key, true);
    },
    onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
      if (held.current.delete(e.pointerId)) press(key, false);
    },
    onPointerCancel(e: ReactPointerEvent<HTMLButtonElement>) {
      if (held.current.delete(e.pointerId)) press(key, false);
    },
    onLostPointerCapture(e: ReactPointerEvent<HTMLButtonElement>) {
      if (held.current.delete(e.pointerId)) press(key, false);
    },
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
    },
  });

  const btn = (key: Exclude<KeyPadKey, "space">) => (
    <button type="button" className={`kb-keypad__key kb-keypad__key--${key}`} aria-label={t(LABELS[key])} {...handlers(key)}>
      <ArrowIcon dir={key} size={22} />
    </button>
  );

  return (
    <div className="kb-keypad" style={{ width }} role="group" aria-label={t("stage.keypad")}>
      <div className="kb-keypad__arrows">
        {btn("left")}
        {btn("up")}
        {btn("down")}
        {btn("right")}
      </div>
      <button type="button" className="kb-keypad__key kb-keypad__key--space" aria-label={t("keypad.space")} {...handlers("space")}>
        {t("keypad.space")}
      </button>
    </div>
  );
}
