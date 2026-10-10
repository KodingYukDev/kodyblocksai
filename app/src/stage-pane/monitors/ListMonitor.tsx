/** Monitor list: header, isi bergulir tervirtualisasi, edit item, footer panjang + tambah + resize. */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { ScratchValue } from "@kody/engine";
import { useT } from "../../shell/i18n";
import type { ShellController } from "../../shell/types";
import {
  appendItem,
  clampListSize,
  commitEdit,
  handleListKey,
  initialListSize,
  LIST_CHROME_HEIGHT,
  LIST_EDIT_IDLE,
  LIST_ROW_HEIGHT,
  type ListEditState,
  removeActiveItem,
  scrollTopForIndex,
  visibleRowRange,
} from "./list-monitor-logic";

interface ListMonitorProps {
  id: string;
  targetId: string | null;
  label: string;
  values: readonly string[];
  width: number;
  height: number;
  draggable: boolean;
  /** Skala panggung (untuk konversi gerakan mouse saat resize). */
  scale: number;
  color: { background: string; text: string };
  controller: Pick<ShellController, "getVariableValue" | "setVariableValue" | "updateMonitor">;
}

export function ListMonitor(props: ListMonitorProps) {
  const t = useT();
  const { controller, id, targetId } = props;
  const [size, setSize] = useState(() => initialListSize(props.width, props.height));
  const [edit, setEdit] = useState<ListEditState>(LIST_EDIT_IDLE);
  const [scrollTop, setScrollTop] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const viewport = Math.max(0, size.height - LIST_CHROME_HEIGHT);

  useEffect(() => {
    setSize((s) => (props.width && props.height ? { width: props.width, height: props.height } : s));
  }, [props.width, props.height]);

  const readList = (): ScratchValue[] => {
    const v = controller.getVariableValue(targetId, id);
    return Array.isArray(v) ? v : [];
  };
  const write = (list: ScratchValue[]): void => controller.setVariableValue(targetId, id, list);

  useEffect(() => {
    if (edit.activeIndex === null || !bodyRef.current) return;
    const next = scrollTopForIndex(edit.activeIndex, bodyRef.current.scrollTop, viewport);
    if (next !== bodyRef.current.scrollTop) bodyRef.current.scrollTop = next;
  }, [edit.activeIndex, viewport]);

  const activate = (index: number): void => {
    if (edit.activeIndex === index) return;
    const v = props.values[index];
    setEdit({ activeIndex: index, activeValue: v ?? "" });
  };
  const deactivate = (): void => {
    const next = commitEdit(readList(), edit);
    if (next) write(next);
    setEdit(LIST_EDIT_IDLE);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    const res = handleListKey(readList(), edit, e.key, e.shiftKey);
    if (!res.handled) return;
    if (res.preventDefault) e.preventDefault();
    if (res.list) write(res.list);
    setEdit(res.edit);
  };
  const onRemove = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const res = removeActiveItem(readList(), edit);
    write(res.list);
    setEdit(res.edit);
  };
  const onAdd = (): void => {
    const res = appendItem(readList());
    write(res.list);
    setEdit(res.edit);
  };

  const onResizeDown = (e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = size;
    let latest = size;
    const scale = props.scale || 1;
    const move = (ev: globalThis.PointerEvent): void => {
      latest = clampListSize(start.width + (ev.clientX - startX) / scale, start.height + (ev.clientY - startY) / scale);
      setSize(latest);
    };
    const up = (ev: globalThis.PointerEvent): void => {
      move(ev);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      controller.updateMonitor({ id, width: latest.width, height: latest.height });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const { start, end } = visibleRowRange(scrollTop, viewport, props.values.length);
  const rows = [];
  for (let i = start; i < end; i++) {
    const active = props.draggable && edit.activeIndex === i;
    rows.push(
      <div key={i} className="kb-list-row" style={{ top: i * LIST_ROW_HEIGHT }} role="listitem">
        <div className="kb-list-index">{i + 1}</div>
        <div
          className="kb-list-value"
          style={{ background: props.color.background, color: props.color.text }}
          onClick={props.draggable ? () => activate(i) : undefined}
        >
          {active ? (
            <div className="kb-list-input-wrap">
              <input
                autoFocus
                className="kb-list-input no-drag"
                spellCheck={false}
                autoComplete="off"
                style={{ color: props.color.text }}
                type="text"
                value={edit.activeValue ?? ""}
                onBlur={deactivate}
                onChange={(e) => setEdit({ activeIndex: i, activeValue: e.target.value })}
                onFocus={(e) => e.target.select()}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="kb-list-remove no-drag" aria-label={t("monitor.remove")} onMouseDown={onRemove}>
                {"✖︎"}
              </button>
            </div>
          ) : (
            <div className="kb-list-value-inner">{props.values[i]}</div>
          )}
        </div>
      </div>,
    );
  }

  return (
    <div className="kb-list-monitor" style={{ width: size.width, height: size.height }}>
      <div className="kb-list-header">{props.label}</div>
      <div
        className="kb-list-body"
        ref={bodyRef}
        role="list"
        aria-label={props.label}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {props.values.length === 0 ? (
          <div className="kb-list-empty">{t("monitor.empty")}</div>
        ) : (
          <div className="kb-list-spacer" style={{ height: props.values.length * LIST_ROW_HEIGHT }}>
            {rows}
          </div>
        )}
      </div>
      <div className="kb-list-footer">
        <button
          type="button"
          className="kb-list-add no-drag"
          aria-label={t("monitor.add")}
          disabled={!props.draggable}
          onClick={props.draggable ? onAdd : undefined}
        >
          +
        </button>
        <div className="kb-list-length">{t("monitor.length", { n: props.values.length })}</div>
        <button
          type="button"
          className="kb-list-resize no-drag"
          aria-label={t("monitor.resize")}
          disabled={!props.draggable}
          onPointerDown={props.draggable ? onResizeDown : undefined}
        >
          =
        </button>
      </div>
    </div>
  );
}
