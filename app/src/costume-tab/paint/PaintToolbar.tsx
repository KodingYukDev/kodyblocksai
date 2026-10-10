/** Bilah alat & pengaturan warna paint editor. */
import type { TabStrings } from "../strings";
import { TOOLS_BY_MODE, type PaintMode, type PaintSettings, type PaintTool } from "./paint-tools";

const TOOL_GLYPH: Record<PaintTool, string> = {
  select: "M5 3l12 9-6 1 4 7-2 1-4-7-4 4z",
  brush: "M14 4l6 6-8 8-6-6zM6 12l-2 6 6-2",
  eraser: "M4 15l8-8 7 7-6 6H8zM9 20h11",
  line: "M5 19L19 5",
  rect: "M4 6h16v12H4z",
  ellipse: "M12 5c5 0 8 3.1 8 7s-3 7-8 7-8-3.1-8-7 3-7 8-7z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  fill: "M5 11l7-7 7 7-7 7zM19 15c0 2 1 3 1 4a1 1 0 0 1-2 0c0-1 1-2 1-4z",
  center: "M12 3v18M3 12h18M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
};

function toolLabel(t: TabStrings, tool: PaintTool): string {
  const map: Record<PaintTool, string> = {
    select: t.toolSelect,
    brush: t.toolBrush,
    eraser: t.toolEraser,
    line: t.toolLine,
    rect: t.toolRect,
    ellipse: t.toolEllipse,
    text: t.toolText,
    fill: t.toolFill,
    center: t.toolCenter,
  };
  return map[tool];
}

export interface PaintToolbarProps {
  mode: PaintMode;
  tool: PaintTool;
  settings: PaintSettings;
  strings: TabStrings;
  onTool(tool: PaintTool): void;
  onSettings(patch: Partial<PaintSettings>): void;
}

export function PaintTools({ mode, tool, strings, onTool }: Omit<PaintToolbarProps, "settings" | "onSettings">) {
  return (
    <div className="kb-paint__tools" role="toolbar" aria-label="Alat gambar" aria-orientation="vertical">
      {TOOLS_BY_MODE[mode].map((tl) => (
        <button
          key={tl}
          type="button"
          className={`kb-paint__tool${tl === tool ? " kb-paint__tool--active" : ""}`}
          aria-pressed={tl === tool}
          title={toolLabel(strings, tl)}
          aria-label={toolLabel(strings, tl)}
          onClick={() => onTool(tl)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d={TOOL_GLYPH[tl]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function PaintSettingsBar({ settings, strings: t, onSettings, tool }: Omit<PaintToolbarProps, "mode" | "onTool">) {
  const showFilled = tool === "rect" || tool === "ellipse";
  return (
    <div className="kb-paint__settings">
      <label className="kb-paint__field">
        <span>{t.fill}</span>
        <input type="color" value={settings.fill} onChange={(e) => onSettings({ fill: e.currentTarget.value })} />
      </label>
      <label className="kb-paint__field">
        <span>{t.outline}</span>
        <input type="color" value={settings.stroke} onChange={(e) => onSettings({ stroke: e.currentTarget.value })} />
      </label>
      <label className="kb-paint__field">
        <span>{t.width}</span>
        <input
          type="number"
          min={1}
          max={100}
          value={settings.width}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if (Number.isFinite(v)) onSettings({ width: Math.min(100, Math.max(1, Math.round(v))) });
          }}
        />
      </label>
      {showFilled ? (
        <label className="kb-paint__field kb-paint__field--check">
          <input type="checkbox" checked={settings.filled} onChange={(e) => onSettings({ filled: e.currentTarget.checked })} />
          <span>{t.filled}</span>
        </label>
      ) : null}
      {tool === "text" ? (
        <label className="kb-paint__field">
          <span>Aa</span>
          <input
            type="number"
            min={8}
            max={200}
            value={settings.fontSize}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v)) onSettings({ fontSize: Math.min(200, Math.max(8, Math.round(v))) });
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
