/**
 * Pembungkus teks balon (padanan scratch-render util/text-wrapper.js, BSD-3-Clause): baris maksimum
 * `maxWidth`, kata yang terlalu panjang dipecah per grapheme, `\n` memaksa baris baru.
 * Peluang patah baris memakai aturan sederhana (setelah spasi / tanda hubung / CJK) sebagai pengganti
 * pustaka linebreak (UAX #14) yang dipakai scratch-render.
 */

export type MeasureText = (text: string) => number;

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
/** Spasi selain pemisah baris. */
const INLINE_SPACE = new RegExp(`[^\\S\\n\\r${LS}${PS}]`);

interface Break {
  position: number;
  required: boolean;
}

const isCJK = (cp: number): boolean =>
  (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff);

/** Posisi patah (indeks UTF-16, eksklusif) sampai akhir teks. */
export function lineBreaks(text: string): Break[] {
  const breaks: Break[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) as number;
    const len = cp > 0xffff ? 2 : 1;
    const ch = text.slice(i, i + len);
    let j = i + len;
    if (ch === "\r" && text[j] === "\n") j++;
    if (ch === "\n" || ch === "\r" || ch === LS || ch === PS) {
      breaks.push({ position: j, required: true });
    } else if (/\s/.test(ch)) {
      // Spasi berurutan menempel ke kata sebelumnya.
      while (j < text.length && INLINE_SPACE.test(text[j] as string)) j++;
      if (j < text.length) breaks.push({ position: j, required: false });
    } else if ((ch === "-" || isCJK(cp)) && j < text.length) {
      breaks.push({ position: j, required: false });
    }
    i = j;
  }
  if (breaks.length === 0 || (breaks[breaks.length - 1] as Break).position !== text.length) {
    breaks.push({ position: text.length, required: false });
  }
  return breaks;
}

function graphemes(word: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(word), (s) => s.segment);
  return Array.from(word);
}

export class TextWrapper {
  private readonly cache = new Map<string, string[]>();

  constructor(private readonly measure: MeasureText) {}

  wrapText(maxWidth: number, input: string): string[] {
    const text = input.normalize();
    const key = `${maxWidth}-${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let lastPosition = 0;
    let currentLine: string | null = null;
    const lines: string[] = [];
    for (const nextBreak of lineBreaks(text)) {
      const word = text.slice(lastPosition, nextBreak.position).replace(/\n+$/, "");
      let proposedLine: string = (currentLine || "").concat(word);
      let proposedWidth: number = this.measure(proposedLine);
      if (proposedWidth > maxWidth) {
        const wordWidth = this.measure(word);
        if (wordWidth > maxWidth) {
          for (const cluster of graphemes(word)) {
            proposedLine = (currentLine || "").concat(cluster);
            proposedWidth = this.measure(proposedLine);
            if (currentLine === null || proposedWidth <= maxWidth) {
              currentLine = proposedLine;
            } else {
              lines.push(currentLine);
              currentLine = cluster;
            }
          }
        } else {
          if (currentLine !== null) lines.push(currentLine);
          currentLine = word;
        }
      } else {
        currentLine = proposedLine;
      }
      if (nextBreak.required) {
        if (currentLine !== null) lines.push(currentLine);
        currentLine = null;
      }
      lastPosition = nextBreak.position;
    }
    const last = currentLine || "";
    if (last.length > 0 || lines.length === 0) lines.push(last);
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, lines);
    return lines;
  }
}
