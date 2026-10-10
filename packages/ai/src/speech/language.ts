/** Bahasa suara (TTS & pengenalan ucapan) dari argumen blok. */
import { Cast } from "@kody/engine";
import { TTS_LANGUAGES } from "./tts";

export const DEFAULT_SPEECH_LANGUAGE = "id-ID";

/** Normalisasi bahasa dari argumen: kode BCP-47 (id-ID) atau nama menu (Indonesia). */
export function parseLanguage(value: unknown): string {
  const s = Cast.toString(value).trim();
  const byText = TTS_LANGUAGES.find(([, text]) => text.toLowerCase() === s.toLowerCase());
  if (byText) return byText[0];
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s) ? s : DEFAULT_SPEECH_LANGUAGE;
}
