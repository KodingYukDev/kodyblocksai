/** Satu monitor di panggung: mode normal/besar/penggeser/list, bisa diseret, menu konteks. */
import { memo, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { MonitorRecord } from "@kody/engine";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@kody/engine";
import { ContextMenu, type ContextMenuItem, useContextMenuTrigger } from "../../shell/ContextMenu";
import { useT } from "../../shell/i18n";
import { downloadBytes, pickFiles, readPickedFile } from "../../shell/project-file";
import type { ShellController } from "../../shell/types";
import { csvColumn, CSV_IMPORT_LIMITS, exportListText, parseCsv } from "./list-monitor-logic";
import { ListMonitor } from "./ListMonitor";
import {
  adaptMonitor,
  availableModes,
  type ExtensionLabelResolver,
  getCategoryColor,
  nextMonitorMode,
  normalizeSliderRange,
  sliderStep,
} from "./monitor-adapter";
import type { MonitorRect } from "./monitor-layout";
import { SliderPrompt } from "./SliderPrompt";

/** API tata letak yang disediakan MonitorOverlay. */
export interface MonitorLayoutApi {
  place(record: MonitorRecord, width: number, height: number): MonitorRect;
  move(id: string, x: number, y: number): void;
  resize(id: string, width: number, height: number): void;
  remove(id: string): void;
}

export interface MonitorProps {
  record: MonitorRecord;
  draggable: boolean;
  scale: number;
  layout: MonitorLayoutApi;
  controller: Pick<
    ShellController,
    "updateMonitor" | "getVariableValue" | "setVariableValue" | "getVariableName"
  >;
  extensionLabel?: ExtensionLabelResolver;
  onAlert?(message: string): void;
}

function MonitorImpl({ record, draggable, scale, layout, controller, extensionLabel, onAlert }: MonitorProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sliderPrompt, setSliderPrompt] = useState(false);
  const { label, category, value } = adaptMonitor(record, t, extensionLabel);
  const color = getCategoryColor(category);
  const isList = record.mode === "list";
  const menu = useContextMenuTrigger(draggable, record.mode === "slider" ? -1 : 1000);

  // Penempatan awal (componentDidMount scratch-gui).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = layout.place(record, el.offsetWidth || 1, el.offsetHeight || 1);
    setPos({ x: rect.upperStart.x, y: rect.upperStart.y });
    return () => layout.remove(record.id);
  }, [record.id]);

  // componentDidUpdate: catat ukuran baru.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pos) layout.resize(record.id, el.offsetWidth, el.offsetHeight);
  });

  const update = (partial: Partial<MonitorRecord>): void => controller.updateMonitor({ id: record.id, ...partial });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggable || e.button !== 0 || !pos) return;
    if (e.target instanceof Element && e.target.closest(".no-drag")) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = pos;
    const s = scale || 1;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let latest = start;
    const clampPos = (x: number, y: number) => ({
      x: Math.round(Math.max(0, Math.min(STAGE_WIDTH - w, x))),
      y: Math.round(Math.max(0, Math.min(STAGE_HEIGHT - h, y))),
    });
    const move = (ev: globalThis.PointerEvent): void => {
      latest = clampPos(start.x + (ev.clientX - sx) / s, start.y + (ev.clientY - sy) / s);
      setDragging(true);
      setPos(latest);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (latest.x !== start.x || latest.y !== start.y) {
        layout.move(record.id, latest.x, latest.y);
        update({ x: latest.x, y: latest.y });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const importList = async (): Promise<void> => {
    const [file] = await pickFiles(".csv,.tsv,.txt", false);
    if (!file) return;
    if (file.size > CSV_IMPORT_LIMITS.maxBytes) {
      onAlert?.(t("alert.actionFailed"));
      return;
    }
    const picked = await readPickedFile(file);
    const rows = parseCsv(new TextDecoder().decode(picked.bytes));
    const cols = rows[0]?.length ?? 0;
    let column = 1;
    if (cols > 1) {
      column = parseInt(window.prompt(t("monitor.columnPrompt", { n: cols })) ?? "", 10);
    }
    controller.setVariableValue(record.targetId, record.id, csvColumn(rows, column));
  };
  const exportList = (): void => {
    const v = controller.getVariableValue(record.targetId, record.id);
    const list = Array.isArray(v) ? v : [];
    const name = controller.getVariableName(record.targetId, record.id) ?? label;
    downloadBytes(`${name}.txt`, exportListText(list), "text/plain;charset=utf-8");
  };

  const showSlider = availableModes(record.opcode).includes("slider");
  const items: ContextMenuItem[] = [];
  if (!isList) {
    items.push({ key: "default", label: t("monitor.default"), onSelect: () => update({ mode: "default" }) });
    items.push({ key: "large", label: t("monitor.large"), onSelect: () => update({ mode: "large" }) });
  }
  if (showSlider) items.push({ key: "slider", label: t("monitor.slider"), onSelect: () => update({ mode: "slider" }) });
  if (record.mode === "slider") {
    items.push({ key: "range", label: t("monitor.sliderRange"), bordered: true, onSelect: () => setSliderPrompt(true) });
  }
  if (isList) {
    items.push({ key: "import", label: t("monitor.import"), onSelect: () => void importList() });
    items.push({ key: "export", label: t("monitor.export"), onSelect: exportList });
  }
  items.push({ key: "hide", label: t("monitor.hide"), bordered: true, onSelect: () => update({ visible: false }) });

  let body;
  if (isList) {
    body = (
      <ListMonitor
        id={record.id}
        targetId={record.targetId}
        label={label}
        values={Array.isArray(value) ? value : []}
        width={record.width}
        height={record.height}
        draggable={draggable}
        scale={scale}
        color={color}
        controller={controller}
      />
    );
  } else if (record.mode === "large") {
    body = (
      <div className="kb-monitor-large" style={{ background: color.background, color: color.text }}>
        {value}
      </div>
    );
  } else {
    body = (
      <div className="kb-monitor-default">
        <div className="kb-monitor-row">
          <div className="kb-monitor-label">{label}</div>
          <div className="kb-monitor-value" style={{ background: color.background, color: color.text }}>
            {value}
          </div>
        </div>
        {record.mode === "slider" && (
          <div className="kb-monitor-row">
            <input
              className="kb-monitor-slider no-drag"
              type="range"
              aria-label={label}
              min={record.sliderMin}
              max={record.sliderMax}
              step={sliderStep(record.isDiscrete)}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => controller.setVariableValue(record.targetId, record.id, Number(e.target.value))}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        ref={ref}
        className={`kb-monitor${dragging ? " kb-monitor--dragging" : ""}${draggable ? " kb-monitor--draggable" : ""}`}
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? "visible" : "hidden" }}
        data-monitor-id={record.id}
        onPointerDown={onPointerDown}
        onDoubleClick={isList || !draggable ? undefined : () => update({ mode: nextMonitorMode(record.opcode, record.mode) })}
        {...menu.triggerProps}
      >
        {body}
      </div>
      <ContextMenu state={menu.state} items={items} onClose={menu.close} label={label} />
      {sliderPrompt && (
        <SliderPrompt
          min={record.sliderMin}
          max={record.sliderMax}
          isDiscrete={record.isDiscrete}
          onCancel={() => setSliderPrompt(false)}
          onOk={(min, max, isDiscrete) => {
            update({ ...normalizeSliderRange(min, max), isDiscrete });
            setSliderPrompt(false);
          }}
        />
      )}
    </>
  );
}

export const Monitor = memo(MonitorImpl);
