export { MUSIC_EXTENSION_ID, createMusicExtension, createMusicExtensionWithOptions } from "./music";
export type { MusicExtensionModule, MusicExtensionOptions } from "./music";
export {
  BEAT_RANGE,
  CONCURRENCY_LIMIT,
  DRUM_INFO,
  INSTRUMENT_INFO,
  MIDI_DRUMS,
  MIDI_INSTRUMENTS,
  MIDI_NOTE_RANGE,
  MUSIC_STATE_KEY,
  TEMPO_RANGE,
  getMusicInfo,
} from "./music-info";
export type { DrumInfo, InstrumentInfo, MusicLocale, MusicState } from "./music-info";
export { DECAY_DURATION, WebAudioMusicOutput, ratioForPitchInterval, selectSampleIndexForNote } from "./music-audio";
export type { MusicAudioContext, MusicBufferSource, MusicSoundOutput } from "./music-audio";
export { MusicSampleBank, defaultMusicSampleUrls, musicSampleUrlsFromBase } from "./music-samples";
export type { MusicSampleBankOptions, MusicSampleUrls } from "./music-samples";
