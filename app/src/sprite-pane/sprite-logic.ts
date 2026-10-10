/**
 * Logika murni panel sprite. Port perilaku:
 * - scratch-vm util/string-util.js (unusedName) & virtual-machine.js (RESERVED_NAMES, renameSprite),
 * - scratch-gui components/forms/buffered-input-hoc.jsx (flush),
 * - scratch-gui components/direction-picker/dial.jsx (matematika dial).
 * Lihat THIRD_PARTY.md.
 */

export const RESERVED_NAMES: readonly string[] = ["_mouse_", "_stage_", "_edge_", "_myself_", "_random_"];

export function withoutTrailingDigits(s: string): string {
  let i = s.length - 1;
  while (i >= 0 && "0123456789".indexOf(s.charAt(i)) > -1) i--;
  return s.slice(0, i + 1);
}

export function unusedName(name: string, existingNames: readonly string[]): string {
  if (existingNames.indexOf(name) < 0) return name;
  const base = withoutTrailingDigits(name);
  let i = 2;
  while (existingNames.indexOf(base + i) >= 0) i++;
  return base + i;
}

/**
 * Nama baru sprite setelah rename (vm.renameSprite). null = rename diabaikan
 * (nama kosong atau nama khusus).
 */
export function resolveSpriteRename(newName: string, otherSpriteNames: readonly string[]): string | null {
  if (!newName || RESERVED_NAMES.indexOf(newName) !== -1) return null;
  return unusedName(newName, otherSpriteNames);
}

/**
 * BufferedInput.handleFlush: kalau nilai prop berupa angka, isian dikirim sebagai Number()
 * hanya bila !isNaN(isian) (perhatikan: "" -> 0, persis JS). undefined = tidak ada submit.
 */
export function flushBufferedValue(propValue: string | number, buffered: string | null): string | number | undefined {
  if (buffered === null) return undefined;
  const isNumeric = typeof propValue === "number";
  if (isNumeric) {
    const n = Number(buffered);
    if (Number.isNaN(n)) return undefined;
    return n;
  }
  return buffered;
}

/** Arah (derajat, searah jarum jam, 90 = kanan) dari pusat dial ke titik mouse. */
export function directionToPoint(mx: number, my: number, cx: number, cy: number): number {
  const angle = Math.atan2(my - cy, mx - cx);
  return angle * (180 / Math.PI) + 90;
}

/** Path SVG "gauge" dial (gaugePath scratch-gui). */
export function gaugePath(radius: number, direction: number): string {
  const rads = direction * (Math.PI / 180);
  return [
    `M ${radius} 0`,
    `L ${radius} ${radius}`,
    `L ${radius + radius * Math.sin(rads)} ${radius - radius * Math.cos(rads)}`,
    `A ${radius} ${radius} 0 0 ${direction < 0 ? 1 : 0} ${radius} 0`,
    "Z",
  ].join(" ");
}

/** Posisi pegangan dial (top/left px). */
export function dialHandlePosition(radius: number, direction: number): { top: number; left: number } {
  const rads = direction * (Math.PI / 180);
  return { top: radius - radius * Math.cos(rads), left: radius + radius * Math.sin(rads) };
}

/**
 * Nilai yang ditampilkan di kolom info sprite: dibulatkan (Math.round) seperti SpriteInfo;
 * kosong bila tidak ada sprite (disabled).
 */
export function displayNumber(value: number, disabled: boolean): string | number {
  return disabled ? "" : Math.round(value);
}
