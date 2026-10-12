/** Komponen kecil AI Lab: bar kepercayaan, progres, thumbnail contoh, ikon, tombol tahan-untuk-merekam. */
import { useEffect, useReducer, useRef, useState } from "react";
import { AUDIO_BANDS } from "../../classifier/audio-features";
import { HAND_EDGES, POSE_EDGES, featurePoints } from "../../classifier/landmark-features";
import type { ClassificationResult } from "../../types";
import type { LabKind, LabSample, LabSession } from "../lab-session";
import { CLASS_COLOURS } from "./styles";

/** Render ulang saat sesi berubah. */
export function useSession(session: LabSession): LabSession {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(force), [session]);
  return session;
}

export const colourOf = (index: number): string => CLASS_COLOURS[index % CLASS_COLOURS.length] as string;

export function ConfidenceBars({ labels, result }: { labels: readonly string[]; result: ClassificationResult | null }): React.JSX.Element {
  return (
    <div className="kal-bars" aria-live="polite">
      <div className="kal-top">{result ? result.label : "-"}</div>
      {labels.map((label, i) => {
        const pct = Math.round((result?.scores[label] ?? 0) * 100);
        return (
          <div className="kal-bar" key={label}>
            <span className="kal-bar__name" title={label}>
              {label}
            </span>
            <div className="kal-bar__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="kal-bar__fill" style={{ width: `${pct}%`, background: colourOf(i) }} />
            </div>
            <span className="kal-bar__pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }): React.JSX.Element {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="kal-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function Skeleton({ kind, features }: { kind: "pose" | "hand"; features: Float32Array }): React.JSX.Element {
  const pts = featurePoints(kind, features);
  const edges = kind === "hand" ? HAND_EDGES : POSE_EDGES;
  const r = kind === "hand" ? 1.15 : 0.75;
  return (
    <svg viewBox={`${-r} ${-r} ${r * 2} ${r * 2}`} aria-hidden="true">
      <rect x={-r} y={-r} width={r * 2} height={r * 2} fill="#F2F7FD" />
      {edges.map(([a, b]) => {
        const p = pts[a];
        const q = pts[b];
        return p && q ? <line key={`${a}-${b}`} x1={p.x} y1={-p.y} x2={q.x} y2={-q.y} stroke="#0B9A72" strokeWidth={r * 0.05} strokeLinecap="round" /> : null;
      })}
      {pts.map((p, i) => (p ? <circle key={i} cx={p.x} cy={-p.y} r={r * 0.04} fill="#15364c" /> : null))}
    </svg>
  );
}

function AudioBars({ features }: { features: Float32Array }): React.JSX.Element {
  return (
    <svg viewBox={`0 0 ${AUDIO_BANDS} 10`} preserveAspectRatio="none" aria-hidden="true">
      <rect x={0} y={0} width={AUDIO_BANDS} height={10} fill="#F2F7FD" />
      {Array.from({ length: AUDIO_BANDS }, (_, i) => {
        const h = Math.max(0.3, Math.min(10, (features[i] ?? 0) * 10));
        return <rect key={i} x={i + 0.1} y={10 - h} width={0.8} height={h} fill="#FF8C1A" />;
      })}
    </svg>
  );
}

export function SampleThumb({ kind, sample, onRemove }: { kind: LabKind; sample: LabSample; onRemove: () => void }): React.JSX.Element {
  let body: React.ReactNode;
  if (sample.thumb) body = <img src={sample.thumb} alt="" draggable={false} />;
  else if ((kind === "pose" || kind === "hand") && sample.features) body = <Skeleton kind={kind} features={sample.features} />;
  else if (kind === "audio" && sample.features) body = <AudioBars features={sample.features} />;
  else body = <span>contoh</span>;
  return (
    <div className={sample.thumb || kind !== "image" ? "kal-sample" : "kal-sample kal-sample--saved"}>
      {body}
      <button type="button" aria-label="Hapus contoh ini" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/**
 * Tombol "tahan untuk merekam": selama ditekan (mouse/jari), `action` dijalankan berulang.
 * Ketukan singkat = satu contoh. Keyboard (Enter/Spasi) = satu contoh per tekan.
 */
export function HoldButton({
  label,
  activeLabel,
  disabled,
  action,
  intervalMs = 150,
}: {
  label: string;
  activeLabel: string;
  disabled?: boolean;
  action: () => Promise<boolean>;
  intervalMs?: number;
}): React.JSX.Element {
  const [active, setActive] = useState(false);
  const holding = useRef(false);
  const running = useRef(false);
  useEffect(() => () => void (holding.current = false), []);
  const loop = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    try {
      do {
        const ok = await action();
        if (!ok) break;
        if (holding.current) await new Promise((r) => setTimeout(r, intervalMs));
      } while (holding.current);
    } finally {
      running.current = false;
      holding.current = false;
      setActive(false);
    }
  };
  const stop = (): void => {
    holding.current = false;
  };
  return (
    <button
      type="button"
      className="kal-btn kal-btn--main kal-btn--hold"
      data-active={active}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        holding.current = true;
        setActive(true);
        void loop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Klik dari keyboard (detail 0): satu contoh. Klik pointer sudah ditangani pointerdown.
        if (e.detail === 0 && !disabled) void loop();
      }}
    >
      {active ? activeLabel : label}
    </button>
  );
}

const ICON_PATHS: Record<LabKind, React.ReactNode> = {
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="2" fill="currentColor" />
      <path d="M5 17l5-5 3 3 2-2 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  pose: (
    <>
      <circle cx="12" cy="4.5" r="2.2" fill="currentColor" />
      <path d="M4 8l8 1.5L20 8M12 9.5V15m0 0l-4 6m4-6l4 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  hand: (
    <path
      d="M8 12V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-3 0-4.5-1.6-6-4L3.7 13a1.5 1.5 0 012.5-1.6L8 13.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  audio: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 11a6 6 0 0012 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  text: (
    <path d="M4 6h16M4 11h16M4 16h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  ),
};

export function KindIcon({ kind }: { kind: LabKind }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[kind]}
    </svg>
  );
}

/** Unduh teks sebagai file (lokal, lewat blob URL; tidak ada jaringan). */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
