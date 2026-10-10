/**
 * Pembuat id blok/variabel. Alfabet dan panjang (20) sama dengan Blockly.utils.genUid scratch-blocks,
 * supaya id yang kita hasilkan berbentuk sama dengan project buatan Scratch.
 */
const SOUP = "!#$%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export type RandomFn = () => number;

export function genUid(random: RandomFn = Math.random): string {
  let id = "";
  for (let i = 0; i < 20; i++) {
    id += SOUP.charAt(Math.floor(random() * SOUP.length));
  }
  return id;
}

/** Pembuat id deterministik untuk tes. */
export function sequentialIds(prefix = "b"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
