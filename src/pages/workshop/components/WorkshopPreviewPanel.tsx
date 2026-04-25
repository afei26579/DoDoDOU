import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import styles from '../WorkshopEditorPage.module.css';

type PreviewPanelProps = {
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  bubbleCanvasRef: RefObject<HTMLCanvasElement | null>;
};

type DragKind = 'move' | 'resize' | 'bubble';

type DragState = {
  kind: DragKind;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  moved: boolean;
};

const TITLEBAR_H = 56;
const MOVE_THRESHOLD = 4;
const MIN_SIZE = 90;
const BUBBLE_SIZE = 52;
const DEFAULT_PANEL = { x: 14, y: TITLEBAR_H + 14, w: 150, h: 150 };
const DEFAULT_BUBBLE = { x: 14, y: TITLEBAR_H + 10 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function WorkshopPreviewPanel({ previewCanvasRef, bubbleCanvasRef }: PreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [open, setOpen] = useState(true);
  const [panel, setPanel] = useState(DEFAULT_PANEL);
  const [bubble, setBubble] = useState(DEFAULT_BUBBLE);

  useEffect(() => {
    if (open) return;
    setBubble((current) => ({
      x: clamp(current.x, 0, Math.max(0, window.innerWidth - BUBBLE_SIZE - 14)),
      y: clamp(current.y, TITLEBAR_H, Math.max(TITLEBAR_H, window.innerHeight - BUBBLE_SIZE - 14)),
    }));
  }, [open]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, kind: DragKind, originX: number, originY: number) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      originW: panel.w,
      originH: panel.h,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
    drag.moved = true;

    if (drag.kind === 'move') {
      setPanel((current) => ({
        ...current,
        x: clamp(drag.originX + dx, 0, Math.max(0, window.innerWidth - current.w - 14)),
        y: clamp(drag.originY + dy, TITLEBAR_H, Math.max(TITLEBAR_H, window.innerHeight - current.h - 14)),
      }));
      return;
    }

    if (drag.kind === 'resize') {
      setPanel((current) => ({
        ...current,
        w: Math.max(MIN_SIZE, drag.originW + dx),
        h: Math.max(MIN_SIZE, drag.originH + dy),
      }));
      return;
    }

    setBubble({
      x: clamp(drag.originX + dx, 0, Math.max(0, window.innerWidth - BUBBLE_SIZE - 14)),
      y: clamp(drag.originY + dy, TITLEBAR_H, Math.max(TITLEBAR_H, window.innerHeight - BUBBLE_SIZE - 14)),
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>, onTap?: () => void) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (!moved) onTap?.();
  };

  return (
    <>
      <section
        ref={panelRef}
        className={`${styles.previewPanel} ${open ? '' : styles.previewCollapsed}`}
        style={{ width: panel.w, height: panel.h, left: panel.x, top: panel.y }}
        onPointerDown={(e) => beginDrag(e, (e.target as HTMLElement).closest('[data-resize-handle]') ? 'resize' : 'move', panel.x, panel.y)}
        onPointerMove={updateDrag}
        onPointerUp={(e) => finishDrag(e)}
        onPointerCancel={(e) => finishDrag(e)}
      >
        <div id="preview-drag-layer" className={styles.previewDragLayer} aria-hidden="true" />
        <div id="preview-canvas-wrap" className={styles.previewCanvasWrap}>
          <canvas ref={previewCanvasRef} id="preview-canvas" className={styles.previewCanvas} />
          <button id="preview-toggle-btn" type="button" className={styles.previewToggle} onClick={() => setOpen(false)} title="折叠预览">✕</button>
        </div>
        <button id="preview-resize-handle" type="button" className={styles.resizeHandle} data-resize-handle aria-label="调整预览大小">⤡</button>
      </section>

      {!open ? (
        <button
          id="preview-bubble"
          type="button"
          className={styles.bubble}
          style={{ left: bubble.x, top: bubble.y, right: 'auto', display: 'flex' }}
          onPointerDown={(e) => beginDrag(e, 'bubble', bubble.x, bubble.y)}
          onPointerMove={updateDrag}
          onPointerUp={(e) => finishDrag(e)}
          onPointerCancel={(e) => finishDrag(e)}
          onClick={() => setOpen(true)}
          aria-label="展开预览"
          title="点击展开预览"
        >
          <canvas ref={bubbleCanvasRef} id="bubble-thumb" className={styles.bubbleCanvas} width={32} height={32} />
          <span id="bubble-label" className={styles.bubbleLabel}>预览</span>
        </button>
      ) : null}
    </>
  );
}
