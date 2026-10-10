/**
 * Editor suara sederhana ala scratch-gui sound-editor: gelombang dengan seleksi seret, putar,
 * potong/hapus, salin/tempel, efek (cepat, lambat, keras, pelan, bisu, muncul/hilang perlahan,
 * balik, robot, gema), undo/redo. Setiap edit disimpan ke host sebagai WAV 16-bit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlay, IconRedo, IconStop, IconUndo } from "../costume-tab/icons";
import type { TabLocale, TabStrings } from "../costume-tab/strings";
import type { NewSound, NotifyFn, SoundView } from "../costume-tab/types";
import { EFFECT_TYPES, applyEffect, type EffectName } from "./sound-effects";
import { SoundHistory, SoundTooLargeError, computeChunkedRMS, copySelection, cropToSelection, deleteSelection, isTooLoud, pasteBuffer, type EditResult, type Selection } from "./sound-edit";
import { PreviewPlayer, encodeSamples, pcmFromView, soundFromSamples } from "./sound-media";
import { formatDuration, selectionFromDrag, waveformPath } from "./waveform";
import type { PcmSound } from "./wav";
import "./sound-tab.css";

export interface SoundEditorProps {
  sound: SoundView;
  index: number;
  strings: TabStrings;
  locale: TabLocale;
  clipboard: PcmSound | null;
  onClipboard(pcm: PcmSound): void;
  onSave(index: number, sound: NewSound): Promise<void> | void;
  onRename(index: number, name: string): void;
  onCopyToNew(sound: NewSound): void;
  notify?: NotifyFn;
}

const W = 600;
const H = 160;

export function SoundEditor(props: SoundEditorProps) {
  const { sound, index, strings: t, locale, clipboard, notify } = props;
  const [pcm, setPcm] = useState<PcmSound | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [, bump] = useState(0);
  const history = useRef(new SoundHistory());
  const player = useRef(new PreviewPlayer());
  const savedAssetId = useRef<string | null>(null);
  const drag = useRef<{ x0: number; width: number } | null>(null);
  const [dragSel, setDragSel] = useState<Selection | null>(null);

  useEffect(() => {
    if (sound.assetId === savedAssetId.current) return;
    let alive = true;
    player.current.stop();
    setPlayhead(null);
    setSelection(null);
    history.current.clear();
    pcmFromView(sound)
      .then((p) => alive && setPcm(p))
      .catch(() => alive && notify?.("error", t.importError));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muat ulang hanya saat isi suara berganti
  }, [sound.assetId, index]);

  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);

  useEffect(() => {
    if (playhead === null) return;
    let raf = 0;
    const tick = (): void => {
      setPlayhead(player.current.position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playhead === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const levels = useMemo(() => (pcm ? computeChunkedRMS(pcm.samples) : []), [pcm]);
  const path = useMemo(() => waveformPath(levels, W, H), [levels]);
  const tooLoud = isTooLoud(levels, selection);

  const play = (p: PcmSound | null = pcm, sel: Selection | null = selection): void => {
    if (!p) return;
    player.current.play(p, sel?.trimStart ?? 0, sel?.trimEnd ?? 1, () => setPlayhead(null));
    setPlayhead(sel?.trimStart ?? 0);
  };
  const stop = (): void => {
    player.current.stop();
    setPlayhead(null);
  };

  const submit = (result: EditResult, keepSelection: boolean, skipUndo = false): boolean => {
    if (!pcm) return false;
    let nc: NewSound;
    let finalPcm: PcmSound;
    try {
      ({ sound: nc, pcm: finalPcm } = encodeSamples(sound.name, result));
    } catch (e) {
      notify?.("error", e instanceof SoundTooLargeError ? t.soundTooLarge : String(e));
      return false;
    }
    if (!skipUndo) history.current.push({ ...pcm, selection });
    savedAssetId.current = nc.state.assetId;
    setPcm(finalPcm);
    const sel = keepSelection ? result.selection : null;
    setSelection(sel);
    bump((n) => n + 1);
    void Promise.resolve(props.onSave(index, nc)).catch((e: unknown) => notify?.("error", String(e)));
    play(finalPcm, sel);
    return true;
  };

  const effect = (name: EffectName): void => {
    if (!pcm) return;
    const r = applyEffect(pcm, name, selection?.trimStart ?? null, selection?.trimEnd ?? null);
    if (!r) return;
    submit({ samples: r.samples, sampleRate: r.sampleRate, selection: { trimStart: r.trimStart, trimEnd: r.trimEnd } }, selection !== null);
  };

  const undoRedo = (redo: boolean): void => {
    if (!pcm) return;
    const cur = { ...pcm, selection };
    const item = redo ? history.current.redo(cur) : history.current.undo(cur);
    if (item) submit(item, true, true);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === "INPUT" || !pcm) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === "Delete" || e.key === "Backspace") && selection) {
      e.preventDefault();
      submit(e.shiftKey ? cropToSelection(pcm, selection) : deleteSelection(pcm, selection), false);
    } else if (e.key === "Escape") {
      setSelection(null);
      stop();
    } else if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoRedo(e.shiftKey);
    } else if (mod && e.key === "c") {
      e.preventDefault();
      props.onClipboard(copySelection(pcm, selection));
    } else if (mod && e.key === "v" && clipboard) {
      e.preventDefault();
      submit(pasteBuffer(pcm, clipboard, selection), true);
    } else if (mod && e.key === "a") {
      e.preventDefault();
      setSelection({ trimStart: 0, trimEnd: 1 });
    } else if (e.key === " ") {
      e.preventDefault();
      if (playhead !== null) stop();
      else play();
    }
  };

  const shownSel = dragSel ?? selection;
  const effects: [EffectName, string][] = [
    [EFFECT_TYPES.FASTER, t.faster],
    [EFFECT_TYPES.SLOWER, t.slower],
    [EFFECT_TYPES.LOUDER, t.louder],
    [EFFECT_TYPES.SOFTER, t.softer],
    [EFFECT_TYPES.MUTE, t.mute],
    [EFFECT_TYPES.FADEIN, t.fadeIn],
    [EFFECT_TYPES.FADEOUT, t.fadeOut],
    [EFFECT_TYPES.REVERSE, t.reverse],
    [EFFECT_TYPES.ROBOT, t.robot],
    [EFFECT_TYPES.ECHO, t.echo],
  ];

  return (
    <div className="kb-sound" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="kb-sound__top">
        <label className="kb-paint__name">
          <span>{t.sound}</span>
          <input
            value={nameDraft ?? sound.name}
            onChange={(e) => setNameDraft(e.currentTarget.value)}
            onBlur={() => {
              if (nameDraft !== null && nameDraft !== sound.name) props.onRename(index, nameDraft);
              setNameDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <button type="button" className="kb-iconbtn" aria-label={t.undo} title={t.undo} disabled={!history.current.canUndo} onClick={() => undoRedo(false)}>
          <IconUndo />
        </button>
        <button type="button" className="kb-iconbtn" aria-label={t.redo} title={t.redo} disabled={!history.current.canRedo} onClick={() => undoRedo(true)}>
          <IconRedo />
        </button>
        <span className="kb-sound__spacer" />
        <button type="button" className="kb-btn" disabled={!pcm} onClick={() => pcm && props.onClipboard(copySelection(pcm, selection))}>
          {t.copy}
        </button>
        <button type="button" className="kb-btn" disabled={!pcm || !clipboard} onClick={() => pcm && clipboard && submit(pasteBuffer(pcm, clipboard, selection), true)}>
          {t.paste}
        </button>
        <button type="button" className="kb-btn" disabled={!pcm} onClick={() => pcm && props.onCopyToNew(soundFromSamples(sound.name, copySelection(pcm, selection)))}>
          {t.copyToNew}
        </button>
        {selection ? (
          <>
            <button type="button" className="kb-btn" onClick={() => pcm && submit(cropToSelection(pcm, selection), false)}>
              {t.crop}
            </button>
            <button type="button" className="kb-btn kb-btn--danger" onClick={() => pcm && submit(deleteSelection(pcm, selection), false)}>
              {t.trimDelete}
            </button>
          </>
        ) : null}
      </div>
      <div
        className="kb-sound__wave"
        role="slider"
        tabIndex={0}
        aria-label={t.selectAll}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((selection?.trimStart ?? 0) * 100)}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { x0: e.clientX - r.left, width: r.width };
          setDragSel(null);
          stop();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const r = e.currentTarget.getBoundingClientRect();
          setDragSel(selectionFromDrag(d.x0, e.clientX - r.left, d.width));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const r = e.currentTarget.getBoundingClientRect();
          const sel = selectionFromDrag(d.x0, e.clientX - r.left, d.width);
          setDragSel(null);
          setSelection(sel);
          if (sel) play(pcm, sel);
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} className="kb-sound__path" />
          {shownSel ? <rect x={shownSel.trimStart * W} y={0} width={(shownSel.trimEnd - shownSel.trimStart) * W} height={H} className="kb-sound__sel" /> : null}
          {playhead !== null ? <line x1={playhead * W} x2={playhead * W} y1={0} y2={H} className="kb-sound__playhead" /> : null}
        </svg>
        {tooLoud ? <span className="kb-sound__warn">{t.tooLoud}</span> : null}
      </div>
      <div className="kb-sound__row">
        <button type="button" className="kb-sound__play" aria-label={playhead !== null ? t.stop : t.play} onClick={() => (playhead !== null ? stop() : play())} disabled={!pcm}>
          {playhead !== null ? <IconStop /> : <IconPlay />}
        </button>
        <span className="kb-sound__duration">{pcm ? formatDuration(pcm.samples.length, pcm.sampleRate, locale) : t.loading}</span>
      </div>
      <div className="kb-sound__effects" role="group" aria-label="Efek">
        {effects.map(([name, label]) => (
          <button key={name} type="button" className="kb-sound__effect" disabled={!pcm || pcm.samples.length < 2} onClick={() => effect(name)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
