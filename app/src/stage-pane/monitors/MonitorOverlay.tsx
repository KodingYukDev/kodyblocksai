/** Lapisan monitor di atas kanvas panggung (scratch-gui monitor-list), diskalakan bersama panggung. */
import { useMemo, useRef } from "react";
import type { MonitorRecord } from "@kody/engine";
import { STAGE_HEIGHT, STAGE_WIDTH } from "@kody/engine";
import type { ShellController } from "../../shell/types";
import type { ExtensionLabelResolver } from "./monitor-adapter";
import { Monitor, type MonitorLayoutApi } from "./Monitor";
import {
  addMonitorRect,
  getInitialPosition,
  initialMonitorLayout,
  type MonitorLayoutState,
  moveMonitorRect,
  removeMonitorRect,
  resizeMonitorRect,
} from "./monitor-layout";

interface MonitorOverlayProps {
  monitors: readonly MonitorRecord[];
  scale: number;
  draggable: boolean;
  controller: Pick<ShellController, "updateMonitor" | "getVariableValue" | "setVariableValue" | "getVariableName">;
  extensionLabel?: ExtensionLabelResolver;
  onAlert?(message: string): void;
}

const isNum = (n: unknown): n is number => typeof n === "number" && !Number.isNaN(n);

/** Buat API tata letak di atas state yang bisa diganti (dipakai juga oleh tes). */
export function createLayoutApi(
  state: { current: MonitorLayoutState },
  updateMonitor: ShellController["updateMonitor"],
  random?: () => number,
): MonitorLayoutApi {
  return {
    place(record, width, height) {
      let rect;
      if (isNum(record.x) && isNum(record.y) && !state.current.savedMonitorPositions[record.id]) {
        rect = { upperStart: { x: record.x, y: record.y }, lowerEnd: { x: record.x + width, y: record.y + height } };
        state.current = addMonitorRect(state.current, record.id, rect, true);
      } else {
        rect = getInitialPosition(state.current, record.id, width, height, random);
        state.current = addMonitorRect(state.current, record.id, rect);
        updateMonitor({ id: record.id, x: rect.upperStart.x, y: rect.upperStart.y });
      }
      return rect;
    },
    move(id, x, y) {
      state.current = moveMonitorRect(state.current, id, x, y);
    },
    resize(id, w, h) {
      state.current = resizeMonitorRect(state.current, id, w, h);
    },
    remove(id) {
      state.current = removeMonitorRect(state.current, id);
    },
  };
}

export function MonitorOverlay(props: MonitorOverlayProps) {
  const state = useRef<MonitorLayoutState>(initialMonitorLayout);
  const { updateMonitor } = props.controller;
  const layout = useMemo(() => createLayoutApi(state, updateMonitor), [updateMonitor]);
  const transform = props.scale === 1 ? undefined : `scale(${props.scale})`;
  return (
    <div
      className="kb-monitor-overlay monitor-overlay"
      style={{ width: STAGE_WIDTH * props.scale, height: STAGE_HEIGHT * props.scale }}
    >
      <div className="kb-monitor-scaler" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform }}>
        {props.monitors
          .filter((m) => m.visible)
          .map((m) => (
            <Monitor
              key={m.id}
              record={m}
              draggable={props.draggable}
              scale={props.scale}
              layout={layout}
              controller={props.controller}
              extensionLabel={props.extensionLabel}
              onAlert={props.onAlert}
            />
          ))}
      </div>
    </div>
  );
}
