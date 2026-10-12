/** Panggung: header, kanvas renderer, monitor, kotak jawaban, input mouse/keyboard ke runtime. */
import { useEffect, useRef } from "react";
import type { MonitorRecord } from "@kody/engine";
import type { StageSizeMode } from "../app-events";
import type { ShellController } from "../shell/types";
import type { ExtensionLabelResolver } from "./monitors/monitor-adapter";
import { MonitorOverlay } from "./monitors/MonitorOverlay";
import { QuestionPrompt } from "./QuestionPrompt";
import { canvasToStagePoint, type StageDimensions } from "./stage-geometry";
import { KeyPad } from "./KeyPad";
import { StageHeader } from "./StageHeader";
import { createStagePointer, keyForIO, shouldPreventKeyScroll } from "./stage-pointer";

export interface StagePaneProps {
  controller: ShellController;
  dims: StageDimensions;
  sizeMode: StageSizeMode;
  showSizeToggle: boolean;
  running: boolean;
  turbo: boolean;
  monitors: readonly MonitorRecord[];
  question: string | null;
  /** Mode editor: semua sprite bisa diseret di panggung. */
  editorDragStyle?: boolean;
  onSizeMode(mode: StageSizeMode): void;
  extensionLabel?: ExtensionLabelResolver;
  onAlert?(message: string): void;
  /** Tombol panah/spasi di layar tampil di bawah panggung. */
  keypad?: boolean;
  /** Ada = tombol toggle keypad tampil di header panggung. */
  onToggleKeypad?(): void;
}

/** Keyboard dokumen -> runtime (lib/vm-listener-hoc.jsx scratch-gui). */
function useStageKeyboard(controller: ShellController): void {
  useEffect(() => {
    const isDocTarget = (e: KeyboardEvent): boolean => e.target === document || e.target === document.body;
    const down = (e: KeyboardEvent): void => {
      // Jangan tangkap tombol untuk input teks/blok.
      if (!isDocTarget(e)) return;
      const key = keyForIO(e);
      if (key !== null) controller.postKeyboard({ key, isDown: true });
      if (shouldPreventKeyScroll(e.keyCode)) e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      // Selalu tangkap key up walau fokus sudah pindah.
      const key = keyForIO(e);
      if (key !== null) controller.postKeyboard({ key, isDown: false });
      if (!isDocTarget(e)) e.preventDefault();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, [controller]);
}

export function StagePane(props: StagePaneProps) {
  const { controller, dims } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const full = props.sizeMode === "fullscreen";
  // useEditorDragStyle scratch-gui: mati di layar penuh / mode pemutar.
  const editorDrag = (props.editorDragStyle ?? true) && !full;
  useStageKeyboard(controller);

  useEffect(() => {
    const canvas = canvasRef.current;
    controller.attachStageCanvas(canvas);
    return () => controller.attachStageCanvas(null);
  }, [controller]);

  useEffect(() => {
    controller.resizeStage(dims.width, dims.height);
  }, [controller, dims.width, dims.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointer = createStagePointer({
      controller,
      editorDragStyle: editorDrag,
      getRect: () => {
        const r = canvas.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width || dims.width, height: r.height || dims.height };
      },
    });
    const onMouseDown = (e: MouseEvent): void => {
      pointer.down(e.clientX, e.clientY, e.button === 0);
      e.preventDefault();
      // Input yang sedang aktif tetap dilepas fokusnya (scratch-gui).
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    const onTouchStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (!t) return;
      pointer.down(t.clientX, t.clientY, true);
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    const onMouseMove = (e: MouseEvent): void => pointer.move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (t) pointer.move(t.clientX, t.clientY);
    };
    const onMouseUp = (e: MouseEvent): void => pointer.up(e.clientX, e.clientY);
    const onTouchEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      if (t) pointer.up(t.clientX, t.clientY);
    };
    const onWheel = (e: WheelEvent): void => pointer.wheel(e.deltaY);
    const onDoubleClick = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      const [sx, sy] = canvasToStagePoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      const id = controller.pickTarget(sx, sy);
      if (id !== null) controller.selectTarget(id);
    };
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("wheel", onWheel, { passive: true });
    canvas.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      pointer.dispose();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [controller, editorDrag, dims.width, dims.height]);

  return (
    <section
      className={`kb-stage-pane${full ? " kb-stage-pane--fullscreen" : ""}`}
      aria-label="Panggung"
      style={full ? undefined : { width: dims.width + 2 }}
    >
      <StageHeader
        running={props.running}
        turbo={props.turbo}
        sizeMode={props.sizeMode}
        showSizeToggle={props.showSizeToggle}
        onGreenFlag={() => controller.greenFlag()}
        onStop={() => controller.stopAll()}
        onSizeMode={props.onSizeMode}
        keypadOpen={!!props.keypad}
        onToggleKeypad={props.onToggleKeypad}
      />
      <div className="kb-stage-wrapper">
        <div className="kb-stage" style={{ width: dims.width, height: dims.height }}>
          <canvas
            ref={canvasRef}
            className="kb-stage__canvas"
            style={{ width: dims.width, height: dims.height }}
            aria-label="Kanvas panggung"
          />
          <MonitorOverlay
            monitors={props.monitors}
            scale={dims.scale}
            draggable={editorDrag}
            controller={controller}
            extensionLabel={props.extensionLabel}
            onAlert={props.onAlert}
          />
          {props.question !== null && (
            <QuestionPrompt key={props.question} question={props.question} onSubmit={(a) => controller.answerQuestion(a)} />
          )}
        </div>
      </div>
      {props.keypad && <KeyPad controller={controller} width={dims.width + 2} />}
    </section>
  );
}
