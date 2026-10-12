/**
 * Paint editor minimal (vektor + bitmap) untuk costume terpilih. Area kerja 480x360 dengan pusat
 * rotasi di tengah, seperti paint editor Scratch. Setiap perubahan disimpan ke host (debounce),
 * sama seperti scratch-gui yang memperbarui VM setelah setiap goresan.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { costumeToPixels, pixelsToCostume } from "../costume-media";
import { sanitizeSvgText } from "../costume-upload";
import { IconRedo, IconUndo } from "../icons";
import { makeCostume } from "../new-asset";
import type { TabStrings } from "../strings";
import type { CostumeView, NewCostume, NotifyFn } from "../types";
import { BITMAP_H, BITMAP_W, clonePixels, createPixels, cropForSave, type Pixels } from "./bitmap-ops";
import { drawTextOnPixels, paintPixels, pixelsToVectorDoc, previewSvg, vectorToPixels } from "./paint-render";
import { BitmapToolSession, DEFAULT_SETTINGS, PaintHistory, VectorToolSession, addText, type BitmapSelection, type PaintMode, type PaintSettings, type PaintTool, type Point } from "./paint-tools";
import { PaintSettingsBar, PaintTools } from "./PaintToolbar";
import "./paint.css";
import { CANVAS_H, CANVAS_W, CENTER_X, CENTER_Y, docFromSvg, emptyDoc, removeShape, serializeDoc, shapeBounds, type VectorDoc, type VectorShape } from "./vector-doc";

export interface PaintEditorProps {
  costume: CostumeView;
  costumeIndex: number;
  strings: TabStrings;
  onSave(index: number, costume: NewCostume): Promise<void> | void;
  onRename(index: number, name: string): void;
  notify?: NotifyFn;
}

const SAVE_DELAY_MS = 350;

function DraftShape({ s }: { s: VectorShape }) {
  const common = { pointerEvents: "none" as const };
  switch (s.type) {
    case "path":
      return <polyline points={s.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" style={common} />;
    case "line":
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.width} strokeLinecap="round" style={common} />;
    case "rect":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} stroke={s.stroke} strokeWidth={s.width} style={common} />;
    case "ellipse":
      return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} stroke={s.stroke} strokeWidth={s.width} style={common} />;
    default:
      return null;
  }
}

export function PaintEditor({ costume, costumeIndex, strings: t, onSave, onRename, notify }: PaintEditorProps) {
  const [mode, setMode] = useState<PaintMode>(costume.dataFormat === "svg" ? "vector" : "bitmap");
  const [tool, setTool] = useState<PaintTool>("brush");
  const [settings, setSettings] = useState<PaintSettings>(DEFAULT_SETTINGS);
  const [doc, setDoc] = useState<VectorDoc>(emptyDoc);
  const [pixels, setPixels] = useState<Pixels>(() => createPixels());
  const [pixVer, setPixVer] = useState(0);
  const [draft, setDraft] = useState<VectorShape | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selection, setSelection] = useState<BitmapSelection | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [, forceHistory] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef(doc);
  const pixRef = useRef(pixels);
  docRef.current = doc;
  pixRef.current = pixels;
  const vHistory = useRef(new PaintHistory<VectorDoc>((d) => d));
  const bHistory = useRef(new PaintHistory<Pixels>(clonePixels));
  const vSession = useRef<VectorToolSession | null>(null);
  const bSession = useRef<BitmapToolSession | null>(null);
  const atDown = useRef<VectorDoc | Pixels | null>(null);
  const savedAssetId = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingSave = useRef<(() => Promise<void>) | null>(null);
  /** Satu jari/pensil sekaligus: jari kedua (atau telapak tangan saat memakai Apple Pencil) diabaikan. */
  const activePointer = useRef<number | null>(null);

  // ---- simpan (debounce) ----
  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const job = pendingSave.current;
    pendingSave.current = null;
    if (job) job().catch((e: unknown) => notify?.("error", e instanceof Error ? e.message : String(e)));
  }, [notify]);

  const scheduleSave = useCallback(
    (m: PaintMode, data: VectorDoc | Pixels) => {
      const index = costumeIndex;
      const name = costume.name;
      pendingSave.current = async () => {
        let nc: NewCostume;
        if (m === "vector") {
          const s = serializeDoc(data as VectorDoc);
          nc = makeCostume(name, "svg", new TextEncoder().encode(s.svg), 1, s.rotationCenterX, s.rotationCenterY);
        } else {
          const c = cropForSave(data as Pixels);
          nc = await pixelsToCostume(name, c.pixels, c.rotationCenterX, c.rotationCenterY);
        }
        savedAssetId.current = nc.state.assetId;
        await onSave(index, nc);
      };
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, SAVE_DELAY_MS);
    },
    [costumeIndex, costume.name, onSave, flushSave],
  );

  // Simpan yang tertunda sebelum berpindah costume / unmount.
  useEffect(() => () => flushSave(), [costumeIndex, flushSave]);

  // ---- muat costume ----
  useEffect(() => {
    if (costume.assetId === savedAssetId.current) return;
    let cancelled = false;
    setSelectedId(null);
    setSelection(null);
    setTextAt(null);
    setDraft(null);
    vHistory.current = new PaintHistory<VectorDoc>((d) => d);
    bHistory.current = new PaintHistory<Pixels>(clonePixels);
    if (costume.dataFormat === "svg") {
      const text = costume.asset ? sanitizeSvgText(new TextDecoder().decode(costume.asset.data)) : "";
      setMode("vector");
      setDoc(text ? docFromSvg(text, costume.rotationCenterX, costume.rotationCenterY) : emptyDoc());
    } else {
      setMode("bitmap");
      costumeToPixels(costume)
        .then((p) => {
          if (!cancelled) {
            setPixels(p);
            setPixVer((v) => v + 1);
          }
        })
        .catch(() => notify?.("error", t.importError));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muat ulang hanya saat isi costume berganti
  }, [costume.assetId, costumeIndex]);

  useEffect(() => {
    if (mode === "bitmap" && canvasRef.current) paintPixels(canvasRef.current, pixels);
  }, [mode, pixels, pixVer]);

  // data: URL (bukan blob:) supaya tidak ada URL yang dicabut saat <img> masih memuat (StrictMode / goresan cepat).
  const previewUrl = useMemo(
    () => (mode === "vector" ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(doc))}` : null),
    [doc, mode],
  );

  // ---- riwayat ----
  const commitVector = (before: VectorDoc, after: VectorDoc): void => {
    vHistory.current.push(before);
    setDoc(after);
    scheduleSave("vector", after);
    forceHistory((n) => n + 1);
  };
  const commitBitmap = (before: Pixels, after: Pixels): void => {
    bHistory.current.push(before);
    setPixels(after);
    setPixVer((v) => v + 1);
    scheduleSave("bitmap", after);
    forceHistory((n) => n + 1);
  };
  const undoRedo = (redo: boolean): void => {
    if (mode === "vector") {
      const h = vHistory.current;
      const next = redo ? h.redo(docRef.current) : h.undo(docRef.current);
      if (next) {
        setDoc(next);
        setSelectedId(null);
        scheduleSave("vector", next);
      }
    } else {
      const h = bHistory.current;
      const next = redo ? h.redo(pixRef.current) : h.undo(pixRef.current);
      if (next) {
        setPixels(next);
        setPixVer((v) => v + 1);
        setSelection(null);
        scheduleSave("bitmap", next);
      }
    }
    forceHistory((n) => n + 1);
  };

  // ---- pointer ----
  const toCanvas = (e: RPointerEvent): Point => {
    const r = stageRef.current?.getBoundingClientRect();
    const w = mode === "vector" ? CANVAS_W : BITMAP_W;
    const h = mode === "vector" ? CANVAS_H : BITMAP_H;
    if (!r || r.width === 0) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || textAt) return;
    if (activePointer.current !== null && activePointer.current !== e.pointerId) return;
    activePointer.current = e.pointerId;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer sudah dilepas (Safari bisa melempar InvalidPointerId)
    }
    const p = toCanvas(e);
    if (mode === "vector") {
      const s = new VectorToolSession(tool, settings);
      vSession.current = s;
      atDown.current = docRef.current;
      const r = s.down(docRef.current, p, selectedId);
      setSelectedId(r.selectedId);
      setDraft(r.draft);
      if (r.textRequest) setTextAt(r.textRequest);
      if (r.committed) {
        commitVector(docRef.current, r.doc);
        vSession.current = null;
      }
    } else {
      const s = new BitmapToolSession(tool, settings);
      bSession.current = s;
      atDown.current = clonePixels(pixRef.current);
      const r = s.down(pixRef.current, p, selection);
      setSelection(r.selection);
      if (r.textRequest) setTextAt(r.textRequest);
      if (r.committed) {
        commitBitmap(atDown.current, r.pixels);
        bSession.current = null;
      } else if (r.pixels !== pixRef.current) {
        setPixels(r.pixels);
        setPixVer((v) => v + 1);
      }
    }
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>): void => {
    if (activePointer.current !== e.pointerId) return;
    const p = toCanvas(e);
    const mods = { shift: e.shiftKey };
    if (mode === "vector" && vSession.current) {
      const r = vSession.current.move(docRef.current, p, mods, selectedId);
      if (r.doc !== docRef.current) setDoc(r.doc);
      setDraft(r.draft);
      setSelectedId(r.selectedId);
    } else if (mode === "bitmap" && bSession.current) {
      const r = bSession.current.move(pixRef.current, p, mods, selection);
      setSelection(r.selection);
      setPixels(r.pixels);
      setPixVer((v) => v + 1);
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>): void => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    const p = toCanvas(e);
    const mods = { shift: e.shiftKey };
    if (mode === "vector" && vSession.current) {
      const r = vSession.current.up(docRef.current, p, mods, selectedId);
      vSession.current = null;
      setDraft(null);
      setSelectedId(r.selectedId);
      if (r.committed) commitVector(atDown.current as VectorDoc, r.doc);
      else setDoc(r.doc);
    } else if (mode === "bitmap" && bSession.current) {
      const r = bSession.current.up(pixRef.current, p, mods, selection);
      bSession.current = null;
      setSelection(r.selection);
      if (r.committed) commitBitmap(atDown.current as Pixels, r.pixels);
      else {
        setPixels(r.pixels);
        setPixVer((v) => v + 1);
      }
    }
    atDown.current = null;
  };

  const submitText = (text: string): void => {
    const at = textAt;
    setTextAt(null);
    if (!at || !text.trim()) return;
    if (mode === "vector") {
      const next = addText(docRef.current, at, text, settings);
      if (next !== docRef.current) commitVector(docRef.current, next);
    } else {
      const before = clonePixels(pixRef.current);
      commitBitmap(before, drawTextOnPixels(pixRef.current, at.x, at.y, text.slice(0, 200), settings.fontSize * 2, settings.fill));
    }
  };

  const deleteSelected = (): void => {
    if (mode === "vector" && selectedId !== null) {
      commitVector(docRef.current, removeShape(docRef.current, selectedId));
      setSelectedId(null);
    } else if (mode === "bitmap" && selection) {
      const before = clonePixels(pixRef.current);
      const after = clonePixels(pixRef.current);
      for (let y = Math.max(0, selection.y); y < Math.min(after.height, selection.y + selection.h); y++) {
        after.data.fill(0, (y * after.width + Math.max(0, selection.x)) * 4, (y * after.width + Math.min(after.width, selection.x + selection.w)) * 4);
      }
      setSelection(null);
      commitBitmap(before, after);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoRedo(e.shiftKey);
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      undoRedo(true);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    }
  };

  const convert = async (): Promise<void> => {
    flushSave();
    if (mode === "vector") {
      const p = await vectorToPixels(docRef.current);
      setMode("bitmap");
      setPixels(p);
      setPixVer((v) => v + 1);
      bHistory.current = new PaintHistory<Pixels>(clonePixels);
      scheduleSave("bitmap", p);
    } else {
      const d = await pixelsToVectorDoc(pixRef.current);
      setMode("vector");
      setDoc(d);
      vHistory.current = new PaintHistory<VectorDoc>((x) => x);
      scheduleSave("vector", d);
    }
    setSelectedId(null);
    setSelection(null);
  };

  const selectedShape = selectedId !== null ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  const selBox = selectedShape ? shapeBounds(selectedShape) : null;
  const history = mode === "vector" ? vHistory.current : bHistory.current;
  const k = mode === "vector" ? 1 : 0.5; // skala overlay (bitmap 960 -> 480)

  return (
    <div className="kb-paint" onKeyDown={onKeyDown}>
      <div className="kb-paint__top">
        <label className="kb-paint__name">
          <span>{t.costume}</span>
          <input
            value={nameDraft ?? costume.name}
            onChange={(e) => setNameDraft(e.currentTarget.value)}
            onBlur={() => {
              if (nameDraft !== null && nameDraft !== costume.name) onRename(costumeIndex, nameDraft);
              setNameDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <button type="button" className="kb-iconbtn" aria-label={t.undo} title={t.undo} disabled={!history.canUndo} onClick={() => undoRedo(false)}>
          <IconUndo />
        </button>
        <button type="button" className="kb-iconbtn" aria-label={t.redo} title={t.redo} disabled={!history.canRedo} onClick={() => undoRedo(true)}>
          <IconRedo />
        </button>
        <PaintSettingsBar tool={tool} settings={settings} strings={t} onSettings={(p) => setSettings((s) => ({ ...s, ...p }))} />
      </div>
      <div className="kb-paint__body">
        <PaintTools mode={mode} tool={tool} strings={t} onTool={(tl) => (setTool(tl), setSelectedId(null), setSelection(null))} />
        <div className="kb-paint__stagewrap">
          <div
            ref={stageRef}
            className={`kb-paint__stage kb-paint__stage--${tool}`}
            tabIndex={0}
            aria-label={mode === "vector" ? t.vectorMode : t.bitmapMode}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {mode === "vector" ? (
              previewUrl ? <img className="kb-paint__layer" src={previewUrl} alt="" draggable={false} /> : null
            ) : (
              <canvas ref={canvasRef} className="kb-paint__layer kb-paint__layer--pixel" width={BITMAP_W} height={BITMAP_H} />
            )}
            <svg className="kb-paint__layer kb-paint__overlay" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
              <path d={`M${CENTER_X - 8} ${CENTER_Y}H${CENTER_X + 8}M${CENTER_X} ${CENTER_Y - 8}V${CENTER_Y + 8}`} stroke="#855cd6" strokeWidth="1" opacity="0.6" />
              {draft ? <DraftShape s={draft} /> : null}
              {selBox ? <rect x={selBox.x - 2} y={selBox.y - 2} width={selBox.w + 4} height={selBox.h + 4} fill="none" stroke="#4c97ff" strokeDasharray="4 3" /> : null}
              {selection ? <rect x={selection.x * k} y={selection.y * k} width={selection.w * k} height={selection.h * k} fill="none" stroke="#4c97ff" strokeDasharray="4 3" /> : null}
            </svg>
            {textAt ? (
              <input
                className="kb-paint__textinput"
                autoFocus
                aria-label={t.textPrompt}
                placeholder={t.textPrompt}
                maxLength={200}
                style={{ left: `${(textAt.x * k * 100) / CANVAS_W}%`, top: `${(textAt.y * k * 100) / CANVAS_H}%` }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitText(e.currentTarget.value);
                  if (e.key === "Escape") setTextAt(null);
                }}
                onBlur={(e) => submitText(e.currentTarget.value)}
              />
            ) : null}
          </div>
          <div className="kb-paint__footer">
            <button type="button" className="kb-btn" onClick={() => void convert()}>
              {mode === "vector" ? t.convertToBitmap : t.convertToVector}
            </button>
            {(mode === "vector" && selectedId !== null) || (mode === "bitmap" && selection) ? (
              // Tablet tidak punya tombol Delete: hapus pilihan lewat tombol.
              <button type="button" className="kb-btn" onClick={deleteSelected}>
                {t.deleteSelection}
              </button>
            ) : null}
            <span className="kb-paint__mode">{mode === "vector" ? t.vectorMode : t.bitmapMode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
