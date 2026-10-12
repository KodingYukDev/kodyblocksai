/**
 * Dialog rekam suara (padanan scratch-gui record-modal): meter level, rekam/berhenti, pratinjau
 * dengan seleksi potong otomatis, lalu simpan sebagai suara baru. Mikrofon mati saat dialog ditutup.
 */
import { useEffect, useRef, useState } from "react";
import type { TabStrings } from "../costume-tab/strings";
import type { DeviceActiveFn, NewSound } from "../costume-tab/types";
import { AudioRecorder, type RecordingResult } from "./recorder";
import { cropToSelection } from "./sound-edit";
import { PreviewPlayer, soundFromSamples } from "./sound-media";
import { waveformPath } from "./waveform";

export interface RecordModalProps {
  strings: TabStrings;
  onClose(): void;
  onSave(sound: NewSound): void;
  onDeviceActive?: DeviceActiveFn;
}

export function RecordModal({ strings: t, onClose, onSave, onDeviceActive }: RecordModalProps) {
  const rec = useRef<AudioRecorder | null>(null);
  const player = useRef(new PreviewPlayer());
  const deviceActive = useRef(onDeviceActive);
  deviceActive.current = onDeviceActive;
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<"starting" | "ready" | "recording" | "processing" | "done" | "error">("starting");
  const [result, setResult] = useState<RecordingResult | null>(null);

  useEffect(() => {
    const r = new AudioRecorder();
    rec.current = r;
    r.startListening(setLevel, () => finish())
      .then(() => {
        if (!r.active) return;
        deviceActive.current?.("microphone", true);
        setState("ready");
      })
      .catch(() => setState("error"));
    const p = player.current;
    return () => {
      const wasActive = r.active;
      r.dispose();
      p.stop();
      if (wasActive) deviceActive.current?.("microphone", false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mikrofon dinyalakan sekali per dialog
  }, []);

  function finish(): void {
    const r = rec.current;
    if (!r) return;
    setState("processing");
    r.stop()
      .then((res) => {
        if (rec.current !== r) return;
        if (res.samples.length === 0) {
          setState("ready");
          return;
        }
        setResult(res);
        setState("done");
      })
      .catch(() => setState("error"));
  }

  const selection = result ? { trimStart: result.trimStart, trimEnd: result.trimEnd } : null;

  return (
    <div className="kb-amodal" role="dialog" aria-modal="true" aria-label={t.recordSound} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="kb-amodal__box kb-record">
        <header className="kb-amodal__header">
          <h2>{t.recordSound}</h2>
          <button type="button" className="kb-amodal__close" onClick={onClose} aria-label={t.close}>
            {t.close}
          </button>
        </header>
        <div className="kb-record__body">
          {state === "error" ? <p className="kb-camera__error">{t.micDenied}</p> : null}
          {state === "ready" || state === "recording" ? (
            <>
              <span className="kb-device-badge">{t.micActive}</span>
              <div className="kb-record__meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, level * 100)}%` }} />
              </div>
            </>
          ) : null}
          {state === "done" && result ? (
            <svg className="kb-record__wave" viewBox="0 0 480 120" preserveAspectRatio="none" aria-hidden="true">
              <path d={waveformPath(result.levels, 480, 120)} className="kb-sound__path" />
              {selection ? <rect x={selection.trimStart * 480} width={(selection.trimEnd - selection.trimStart) * 480} y={0} height={120} className="kb-sound__sel" /> : null}
            </svg>
          ) : null}
        </div>
        <footer className="kb-amodal__footer">
          {state === "ready" ? (
            <button type="button" className="kb-btn kb-btn--record" onClick={() => (rec.current?.startRecording(), setState("recording"))}>
              {t.startRecording}
            </button>
          ) : null}
          {state === "recording" ? (
            <button type="button" className="kb-btn kb-btn--record" onClick={finish}>
              {t.stopRecording}
            </button>
          ) : null}
          {state === "done" && result && selection ? (
            <>
              <button type="button" className="kb-btn" onClick={() => player.current.play(result, selection.trimStart, selection.trimEnd)}>
                {t.play}
              </button>
              <button type="button" className="kb-btn" onClick={() => (setResult(null), rec.current?.startRecording(), setState("recording"))}>
                {t.retake}
              </button>
              <button
                type="button"
                className="kb-btn kb-btn--primary"
                onClick={() => {
                  const cropped = cropToSelection(result, selection);
                  onSave(soundFromSamples(t.recordingName, cropped));
                  onClose();
                }}
              >
                {t.save}
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
