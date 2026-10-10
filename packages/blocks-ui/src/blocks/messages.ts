/**
 * Tabel pesan blok (Blockly.Msg) per bahasa. Bahasa Indonesia memakai terjemahan resmi Scratch
 * (scratch-blocks msg/scratch_msgs.js locale "id"); kunci yang belum diterjemahkan jatuh ke Inggris,
 * sama seperti scratch-blocks (ScratchMsgs.setLocale menimpa Blockly.Msg en).
 */
import { MESSAGES_EN } from "./generated/messages-en";
import { MESSAGES_ID } from "./generated/messages-id";

export type BlockLocale = "id" | "en";

const merged: Record<BlockLocale, Record<string, string>> = {
  en: MESSAGES_EN,
  id: { ...MESSAGES_EN, ...MESSAGES_ID },
};

export function getMessages(locale: BlockLocale): Readonly<Record<string, string>> {
  return merged[locale];
}

/** Satu pesan; kunci tak dikenal dikembalikan apa adanya (seperti Blockly.utils.replaceMessageReferences). */
export function msg(key: string, locale: BlockLocale): string {
  return merged[locale][key] ?? key;
}

const TOKEN_RE = /%\{BKY_([A-Za-z0-9_]+)\}/g;

/** Ganti semua token "%{BKY_KEY}" di teks dengan pesan bahasa terpilih. */
export function resolveMessage(text: string, locale: BlockLocale): string {
  const table = merged[locale];
  return text.replace(TOKEN_RE, (whole, key: string) => table[key] ?? table[key.toUpperCase()] ?? whole);
}

export type InterpolationToken = string | number;

/**
 * Port Blockly.utils.tokenizeInterpolation_ (scratch-blocks core/utils.js): pecah pesan menjadi
 * teks dan indeks argumen (%1, %2 ...). "%%" menjadi "%" literal.
 */
export function tokenizeInterpolation(message: string): InterpolationToken[] {
  const tokens: InterpolationToken[] = [];
  const chars = message.split("");
  chars.push("");
  let state = 0; // 0 = teks, 1 = setelah '%', 2 = membaca angka
  let buffer: string[] = [];
  let number: string | null = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    if (state === 0) {
      if (c === "%") {
        const text = buffer.join("");
        if (text) tokens.push(text);
        buffer = [];
        state = 1;
      } else {
        buffer.push(c);
      }
    } else if (state === 1) {
      if (c === "%") {
        buffer.push(c);
        state = 0;
      } else if (c >= "0" && c <= "9") {
        state = 2;
        number = c;
        const text = buffer.join("");
        if (text) tokens.push(text);
        buffer = [];
      } else {
        buffer.push("%", c);
        state = 0;
      }
    } else if (state === 2) {
      if (c >= "0" && c <= "9") {
        number += c;
      } else {
        tokens.push(parseInt(number ?? "0", 10));
        i--;
        state = 0;
      }
    }
  }
  const text = buffer.join("");
  if (text) tokens.push(text);
  // Gabungkan string bersebelahan.
  const merged2: InterpolationToken[] = [];
  for (const t of tokens) {
    const last = merged2[merged2.length - 1];
    if (typeof t === "string" && typeof last === "string") merged2[merged2.length - 1] = last + t;
    else merged2.push(t);
  }
  return merged2;
}
