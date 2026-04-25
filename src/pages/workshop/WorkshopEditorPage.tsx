import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './WorkshopEditorPage.module.css';
import { WorkshopPreviewPanel } from './components/WorkshopPreviewPanel';
import {
  getWorkshopProject,
  saveWorkshopProject,
} from '../../features/workshop/model/projectStore';
import type { PatternResult } from '../../features/workshop/model/types';
import {
  PALETTE,
  createEmptyGrid,
  exportGridAsImage,
  floodFill,
  paintGridToCanvas,
  toCellPoint,
} from './editor/WorkshopEditor.utils';

type Tool = 'brush' | 'eraser' | 'fill' | 'picker' | 'pan';

type DragState = {
  kind: 'paint' | 'pan' | 'toolbar';
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originOffsetX: number;
  originOffsetY: number;
  moved?: boolean;
  lastCell?: string;
};

type HistoryState = {
  index: number;
  length: number;
};

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'brush', label: '画笔', icon: '✏️' },
  { id: 'eraser', label: '橡皮', icon: '🧹' },
  { id: 'fill', label: '填充', icon: '🪣' },
  { id: 'picker', label: '取色', icon: '💉' },
  { id: 'pan', label: '平移', icon: '✋' },
];

const DEFAULT_COLORS = ['#000000', '#FFFFFF', '#FF6600', '#FFDAC1', '#D8B4E2'];
const HISTORY_LIMIT = 80;
const WORKSHOP_EDITOR_DRAFT_PREFIX = 'dodoudou:workshop-editor-draft:';

function getDraftKey(projectId: string) {
  return `${WORKSHOP_EDITOR_DRAFT_PREFIX}${projectId}`;
}

function readEditorDraft(projectId: string) {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getDraftKey(projectId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as {
      grid: string[][];
      history: string[][][];
      historyIndex: number;
    };
  } catch {
    return null;
  }
}

function writeEditorDraft(projectId: string, payload: { grid: string[][]; history: string[][][]; historyIndex: number }) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getDraftKey(projectId), JSON.stringify(payload));
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') {
      throw error;
    }

    const slimPayload = {
      grid: payload.grid,
      history: [payload.grid],
      historyIndex: 0,
    };

    try {
      window.localStorage.setItem(getDraftKey(projectId), JSON.stringify(slimPayload));
    } catch {
      // Ignore storage quota issues; IndexedDB persistence still handles the full state.
    }
  }
}

function clearEditorDraft(projectId: string) {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(getDraftKey(projectId));
}

function makeRecentColors(currentColor: string, recentColors: string[]) {
  return [currentColor, ...recentColors.filter((item) => item !== currentColor)].slice(0, 8);
}

function buildGridFromPattern(patternResult: PatternResult) {
  const nextGrid = createEmptyGrid(patternResult.width, patternResult.height);

  for (const cell of patternResult.cells) {
    if (cell.isExternal || cell.hex === 'transparent') continue;
    if (
      cell.y < 0 ||
      cell.y >= patternResult.height ||
      cell.x < 0 ||
      cell.x >= patternResult.width
    ) {
      continue;
    }

    nextGrid[cell.y][cell.x] = cell.hex;
  }

  return nextGrid;
}

function cloneGrid(grid: string[][]) {
  return grid.map((row) => [...row]);
}

function cloneHistory(history: string[][][]) {
  return history.map((snap) => snap.map((row) => [...row]));
}

export function WorkshopEditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const historyRef = useRef<string[][][]>([]);
  const historyIndexRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const [grid, setGrid] = useState(() => createEmptyGrid(32, 32));
  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const [bgColor, setBgColor] = useState('#f5f0eb');
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const [currentColor, setCurrentColor] = useState('#D8B4E2');
  const [recentColors, setRecentColors] = useState(DEFAULT_COLORS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnSet, setDrawnSet] = useState<Set<string>>(new Set());
  const [sourcePatternResult, setSourcePatternResult] = useState<PatternResult | null>(null);
  const [projectReady, setProjectReady] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>({ index: 0, length: 1 });

  const currentRecentColors = makeRecentColors(currentColor, recentColors);

  useEffect(() => {
    let alive = true;

    async function loadProjectPattern() {
      if (!projectId) {
        if (alive) setProjectReady(true);
        return;
      }

      const draft = readEditorDraft(projectId);
      if (draft?.grid?.length) {
        setGrid(cloneGrid(draft.grid));
        historyRef.current = cloneHistory(draft.history?.length ? draft.history : [draft.grid]);
        historyIndexRef.current = Math.min(
          draft.historyIndex ?? draft.history.length - 1,
          historyRef.current.length - 1,
        );
        setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
      }

      const project = await getWorkshopProject(projectId).catch(() => null);
      if (!alive) return;

      if (project?.patternResult) {
        const { patternResult } = project;
        const nextGrid = draft?.grid?.length ? cloneGrid(draft.grid) : buildGridFromPattern(patternResult);

        setSourcePatternResult(patternResult);
        setCols(patternResult.width);
        setRows(patternResult.height);
        setGrid(nextGrid);

        if (!draft?.grid?.length) {
          if (project.editorState?.history?.length) {
            const nextHistory = cloneHistory(project.editorState.history);
            const nextIndex = Math.min(
              project.editorState.historyIndex ?? nextHistory.length - 1,
              nextHistory.length - 1,
            );

            historyRef.current = nextHistory;
            historyIndexRef.current = nextIndex;
            setHistoryState({ index: nextIndex, length: nextHistory.length });
          } else {
            historyRef.current = [cloneGrid(nextGrid)];
            historyIndexRef.current = 0;
            setHistoryState({ index: 0, length: 1 });
          }
        }
      } else if (!draft?.grid?.length) {
        const initialGrid = cloneGrid(grid);
        historyRef.current = [initialGrid];
        historyIndexRef.current = 0;
        setHistoryState({ index: 0, length: 1 });
      }

      setProjectReady(true);

      if (projectId) {
        clearEditorDraft(projectId);
      }
    }

    void loadProjectPattern();

    return () => {
      alive = false;
    };
  }, [projectId]);


  useEffect(() => {
    if (!canvasRef.current || !previewCanvasRef.current) return;

    paintGridToCanvas({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      bubbleCanvas: bubbleCanvasRef.current,
      grid,
      cols,
      rows,
      bgColor,
      showGrid,
    });
  }, [bgColor, cols, grid, rows, showGrid]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
    }, 2200);
  };

  const applyColor = (hex: string) => {
    setCurrentColor(hex);
    setRecentColors((current) => [hex, ...current.filter((item) => item !== hex)].slice(0, 8));
  };

  const persistEditorState = (nextGrid: string[][], nextHistory: string[][][], nextIndex: number) => {
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    setHistoryState({ index: nextIndex, length: nextHistory.length });
    setGrid(nextGrid);

    if (!projectId) return;

    const gridSnapshot = cloneGrid(nextGrid);
    const historySnapshot = cloneHistory(nextHistory);

    writeEditorDraft(projectId, {
      grid: gridSnapshot,
      history: historySnapshot,
      historyIndex: nextIndex,
    });

    if (!projectReady) return;

    void saveWorkshopProject(projectId, {
      editorState: {
        grid: gridSnapshot,
        history: historySnapshot,
        historyIndex: nextIndex,
      },
    });
  };

  const commitGrid = (nextGrid: string[][]) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(cloneGrid(nextGrid));

    const trimmedHistory = nextHistory.slice(-HISTORY_LIMIT);
    const nextIndex = trimmedHistory.length - 1;

    persistEditorState(nextGrid, trimmedHistory, nextIndex);
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;

    const nextIndex = historyIndexRef.current - 1;
    const nextGrid = cloneGrid(historyRef.current[nextIndex]);

    persistEditorState(nextGrid, historyRef.current, nextIndex);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    const nextIndex = historyIndexRef.current + 1;
    const nextGrid = cloneGrid(historyRef.current[nextIndex]);

    persistEditorState(nextGrid, historyRef.current, nextIndex);
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    kind: DragState['kind'],
    originX = 0,
    originY = 0,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      originOffsetX: originX,
      originOffsetY: originY,
      moved: false,
      lastCell: '',
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors.
    }
  };

  const renderToolRow2 = () => {
    if (tool === 'brush') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <span className={styles.tagIcon}>✏️</span>
            <span className={styles.tagText}>画笔</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>粗细</div>
            <div className={styles.sizeDots}>
              {[1, 2, 3, 4, 5].map((size) => {
                const active = brushSize === size;
                const dotSize = 7 + size * 4;

                return (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.sizeDotBtn} ${active ? styles.isActive : ''}`}
                    onClick={() => setBrushSize(size)}
                  >
                    <span
                      style={{
                        width: dotSize,
                        height: dotSize,
                        borderRadius: '50%',
                        background: currentColor,
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>颜色</div>
            <div className={styles.miniPalette}>
              {currentRecentColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`${styles.miniColor} ${currentColor === hex ? styles.selected : ''}`}
                  style={{ background: hex }}
                  onClick={() => applyColor(hex)}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    applyColor(hex);
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className={styles.openPaletteBtn}
            onClick={() => setPaletteOpen(true)}
          >
            🎨
          </button>
        </>
      );
    }

    if (tool === 'eraser') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <span className={styles.tagIcon}>🧹</span>
            <span className={styles.tagText}>橡皮</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>大小</div>
            <div className={styles.sizeDots}>
              {[1, 2, 3, 4, 5].map((size) => {
                const active = eraserSize === size;
                const dotSize = 7 + size * 4;

                return (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.sizeDotBtn} ${active ? styles.isActive : ''}`}
                    onClick={() => setEraserSize(size)}
                  >
                    <span
                      style={{
                        width: dotSize,
                        height: dotSize,
                        borderRadius: '50%',
                        background: '#9B8E84',
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.eraserPreviewWrap}>
            <div className={styles.paramLabel}>预览</div>
            <div
              className={styles.eraserPreview}
              style={{
                width: Math.min(56, eraserSize * 14 + 6),
                height: Math.min(56, eraserSize * 14 + 6),
              }}
            />
          </div>
        </>
      );
    }

    if (tool === 'fill') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <span className={styles.tagIcon}>🪣</span>
            <span className={styles.tagText}>填充</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>填充色</div>
            <div className={styles.miniPalette}>
              {currentRecentColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`${styles.miniColor} ${currentColor === hex ? styles.selected : ''}`}
                  style={{ background: hex }}
                  onClick={() => applyColor(hex)}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    applyColor(hex);
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className={styles.openPaletteBtn}
            onClick={() => setPaletteOpen(true)}
          >
            🎨
          </button>
          <span className={styles.fillTip}>点击格子泛洪填色</span>
        </>
      );
    }

    if (tool === 'picker') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <span className={styles.tagIcon}>💉</span>
            <span className={styles.tagText}>取色</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.pickerTip}>
            点击画布格子
            <br />
            <span>自动吸取颜色并切回画笔</span>
          </div>
        </>
      );
    }

    return (
      <>
        <div className={styles.toolInfoTag}>
          <span className={styles.tagIcon}>✋</span>
          <span className={styles.tagText}>平移</span>
        </div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}>
          <div className={styles.paramLabel}>视图缩放</div>
          <div className={styles.zoomTools}>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => setScale((current) => Math.max(0.2, +(current - 0.1).toFixed(2)))}
            >
              －
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => setScale((current) => Math.min(12, +(current + 0.1).toFixed(2)))}
            >
              ＋
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => {
                setOffset({ x: 0, y: 0 });
                setScale(1);
                showToast('↺ 视图已重置');
              }}
            >
              ↺
            </button>
          </div>
        </div>
      </>
    );
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isToolbar = Boolean(toolbarRef.current?.contains(target));

    if (isToolbar) {
      beginDrag(event, 'toolbar', toolbarPos.x, toolbarPos.y);
      return;
    }

    const cell = toCellPoint(event.clientX, event.clientY, canvasRef.current, cols, rows);
    if (!cell) return;

    if (tool === 'picker') {
      const picked = grid[cell.row]?.[cell.col];
      if (picked) applyColor(picked);
      setTool('brush');
      showToast('已取色');
      return;
    }

    if (tool === 'fill') {
      commitGrid(floodFill(grid, cell.row, cell.col, currentColor));
      showToast('已执行填充');
      return;
    }

    if (tool === 'pan') {
      beginDrag(event, 'pan', offset.x, offset.y);
      return;
    }

    const nextGrid = cloneGrid(grid);
    const size = tool === 'eraser' ? eraserSize : brushSize;
    const half = Math.floor(size / 2);

    for (let dr = -half; dr < size - half; dr += 1) {
      for (let dc = -half; dc < size - half; dc += 1) {
        const r = cell.row + dr;
        const c = cell.col + dc;

        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;

        nextGrid[r][c] = tool === 'eraser' ? '' : currentColor;
      }
    }

    commitGrid(nextGrid);
    setIsDrawing(true);
    setDrawnSet(new Set([`${cell.row},${cell.col}`]));
    beginDrag(event, 'paint');
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.kind === 'pan') {
      drag.moved = true;
      setOffset({
        x: drag.originOffsetX + dx,
        y: drag.originOffsetY + dy,
      });
      return;
    }

    if (drag.kind === 'toolbar') {
      drag.moved = true;
      setToolbarPos({
        x: drag.originOffsetX + dx,
        y: drag.originOffsetY + dy,
      });
      return;
    }

    if (!isDrawing) return;

    const cell = toCellPoint(event.clientX, event.clientY, canvasRef.current, cols, rows);
    if (!cell) return;

    const key = `${cell.row},${cell.col}`;
    if (drag.lastCell === key || drawnSet.has(key)) return;

    drag.lastCell = key;
    setDrawnSet((current) => new Set(current).add(key));

    const nextGrid = cloneGrid(grid);
    nextGrid[cell.row][cell.col] = tool === 'eraser' ? '' : currentColor;
    commitGrid(nextGrid);
    drag.moved = true;
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDrawing(false);
    setDrawnSet(new Set());

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors.
    }
  };

  const handleToolbarPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;

    beginDrag(event, 'toolbar', toolbarPos.x, toolbarPos.y);
  };

  const handleToolbarPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.kind !== 'toolbar') return;

    drag.moved = true;
    setToolbarPos({
      x: drag.originOffsetX + (event.clientX - drag.startX),
      y: drag.originOffsetY + (event.clientY - drag.startY),
    });
  };

  const handleToolbarPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    finishDrag(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }

    if (
      (event.ctrlKey || event.metaKey)
      && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))
    ) {
      event.preventDefault();
      redo();
    }
  };

  const clearCanvas = () => {
    const clearedGrid = createEmptyGrid(cols, rows);
    commitGrid(clearedGrid);
    showToast('已清空画布');
  };


  return (
    <main className={styles.page}>
      <header className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <button
            type="button"
            className={styles.titlebarLogo}
            onClick={() => navigate(-1)}
            title="返回上一页"
            aria-label="返回上一页"
          >
            ←
          </button>
          <div className={styles.titlebarText}>
            <h1>拼豆豆编辑器</h1>
            <p>PIXEL BEAD PATTERN EDITOR</p>
          </div>
        </div>
        <div className={styles.titlebarActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={undo}
            disabled={historyState.index <= 0}
            title="撤销"
          >
            ↩
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={redo}
            disabled={historyState.index >= historyState.length - 1}
            title="重做"
          >
            ↪
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={clearCanvas}
            title="清空画布"
          >
            🗑
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => exportGridAsImage({ grid, bgColor, cols, rows })}
            disabled={!grid.length}
            title="导出"
          >
            💾 导出
          </button>
        </div>
      </header>

      <div
        className={styles.layout}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div className={styles.canvasStage}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
          <div className={styles.zoomBar}>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => setScale((current) => Math.max(0.2, +(current - 0.1).toFixed(2)))}
            >
              －
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => setScale((current) => Math.min(12, +(current + 0.1).toFixed(2)))}
            >
              ＋
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => {
                setOffset({ x: 0, y: 0 });
                setScale(1);
                showToast('↺ 视图已重置');
              }}
            >
              ↺
            </button>
          </div>
        </div>

        <WorkshopPreviewPanel
          previewCanvasRef={previewCanvasRef}
          bubbleCanvasRef={bubbleCanvasRef}
        />

        <section
          ref={toolbarRef}
          className={styles.toolbar}
          onPointerDown={handleToolbarPointerDown}
          onPointerMove={handleToolbarPointerMove}
          onPointerUp={handleToolbarPointerUp}
          onPointerCancel={handleToolbarPointerUp}
        >
          <div className={styles.toolbarDrag} />
          <div className={styles.toolRow}>
            {TOOL_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.toolBtn} ${tool === item.id ? styles.toolActive : ''}`}
                onClick={() => setTool(item.id)}
                title={item.label}
              >
                {item.icon}
              </button>
            ))}
            <div className={styles.toolSep} />
            <label className={styles.colorSwatch} title="当前颜色">
              <input
                type="color"
                value={currentColor}
                onChange={(event) => applyColor(event.target.value)}
              />
            </label>
            <div className={styles.toolSep} />
            <div className={styles.recentRow}>
              {currentRecentColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={styles.recentDot}
                  style={{ background: hex }}
                  onClick={() => applyColor(hex)}
                  title={hex}
                />
              ))}
            </div>
          </div>
          <div className={styles.toolbarContent}>{renderToolRow2()}</div>
        </section>
      </div>

      {paletteOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setPaletteOpen(false)}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3>拼豆色卡</h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setPaletteOpen(false)}
              >
                ×
              </button>
            </header>
            <div className={styles.paletteGrid}>
              {PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={styles.paletteSwatch}
                  style={{ background: hex }}
                  onClick={() => {
                    applyColor(hex);
                    setPaletteOpen(false);
                  }}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    applyColor(hex);
                    setPaletteOpen(false);
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </main>
  );
}
