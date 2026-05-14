import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './WorkshopEditorPage.module.css';
import { WorkshopPreviewPanel } from './components/WorkshopPreviewPanel';
import { DownloadSettingsModal } from './DownloadSettingsModal';
import { ensureWorkshopProject, getWorkshopProject, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import {
  getWorkshopDraft,
  saveWorkshopDraft,
} from '../../features/workshop/model/draftStore';
import type { PatternResult, WorkshopEditorState, WorkshopConfig } from '../../features/workshop/model/types';
import { defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { buildPalette, getVendorCode } from '../../lib/pattern/color-system';
import { beadBrandKeys, getBeadBrandLabel } from '../../lib/pattern/brand';
import {
  createEmptyGrid,
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

type ZoomPoint = {
  x: number;
  y: number;
};

type PointerPoint = {
  clientX: number;
  clientY: number;
};

type PaintSession = {
  grid: string[][];
  tool: 'brush' | 'eraser';
  color: string;
  size: number;
  changed: boolean;
  lastCell: { row: number; col: number };
};

const ICONS = {
  goback: '/assets/system_icons/go_back.png',
  undo: '/assets/pngs/01_undo_v2.png',
  redo: '/assets/pngs/02_redo_v2.png',
  clear: '/assets/pngs/03_clean_brush_v2.png',
  brush: '/assets/pngs/04_paintbrush_no_border.png',
  eraser: '/assets/pngs/05_eraser_no_border.png',
  fill: '/assets/pngs/06_paint_bucket_no_border.png',
  picker: '/assets/pngs/07_eyedropper_no_border.png',
  pan: '/assets/pngs/move_no_border.png',
} as const;

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon?: string; iconSrc?: string }> = [
  { id: 'brush', label: '画笔', iconSrc: ICONS.brush },
  { id: 'eraser', label: '橡皮', iconSrc: ICONS.eraser },
  { id: 'fill', label: '填充', iconSrc: ICONS.fill },
  { id: 'picker', label: '取色', iconSrc: ICONS.picker },
  { id: 'pan', label: '平移', iconSrc: ICONS.pan   },
];

const DEFAULT_COLORS = ['#000000', '#FFFFFF', '#FF6600', '#FFDAC1', '#D8B4E2'];
const HISTORY_LIMIT = 80;
const SAVE_DEBOUNCE_MS = 800;
const WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX = 'dodoudou:workshop-editor-local-draft:';

function getLocalDraftKey(projectId: string) {
  return `${WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX}${projectId}`;
}

function readLocalEditorDraft(projectId: string) {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getLocalDraftKey(projectId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WorkshopEditorState;
  } catch {
    return null;
  }
}

function writeLocalEditorDraft(projectId: string, state: WorkshopEditorState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getLocalDraftKey(projectId), JSON.stringify(state));
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') {
      throw error;
    }

    const slimState: WorkshopEditorState = {
      grid: state.grid,
      history: [state.grid],
      historyIndex: 0,
    };

    try {
      window.localStorage.setItem(getLocalDraftKey(projectId), JSON.stringify(slimState));
    } catch {
      // Ignore localStorage quota failures; IndexedDB draft persistence still handles the full state.
    }
  }
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

function paintCellBlock(
  targetGrid: string[][],
  row: number,
  col: number,
  paintTool: PaintSession['tool'],
  color: string,
  size: number,
) {
  const rowCount = targetGrid.length;
  const colCount = targetGrid[0]?.length ?? 0;
  const half = Math.floor(size / 2);
  let changed = false;

  for (let dr = -half; dr < size - half; dr += 1) {
    for (let dc = -half; dc < size - half; dc += 1) {
      const r = row + dr;
      const c = col + dc;

      if (r < 0 || r >= rowCount || c < 0 || c >= colCount) continue;

      const nextColor = paintTool === 'eraser' ? '' : color;
      if (targetGrid[r][c] === nextColor) continue;

      targetGrid[r][c] = nextColor;
      changed = true;
    }
  }

  return changed;
}

function getInterpolatedCells(from: { row: number; col: number }, to: { row: number; col: number }) {
  const rowDelta = to.row - from.row;
  const colDelta = to.col - from.col;
  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  const cells: Array<{ row: number; col: number }> = [];

  if (steps === 0) return [to];

  for (let step = 1; step <= steps; step += 1) {
    cells.push({
      row: Math.round(from.row + (rowDelta * step) / steps),
      col: Math.round(from.col + (colDelta * step) / steps),
    });
  }

  return cells;
}

function createFreshEditorState(grid: string[][]): WorkshopEditorState {
  const currentGrid = cloneGrid(grid);
  return {
    grid: currentGrid,
    history: [cloneGrid(currentGrid)],
    historyIndex: 0,
  };
}

function gridToPatternResult(grid: string[][], brand: WorkshopConfig['brand']): PatternResult {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const cells: PatternResult['cells'] = [];
  const paletteMap = new Map<string, { count: number; vendorCode: string }>();
  let totalCells = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const hex = grid[y]?.[x] ?? 'transparent';

      if (!hex || hex === 'transparent') {
        cells.push({
          x,
          y,
          colorId: '__TRANSPARENT__',
          vendorCode: '',
          hex: 'transparent',
        });
        continue;
      }

      const vendorCode = getVendorCode(hex, brand);
      totalCells += 1;
      cells.push({
        x,
        y,
        colorId: hex,
        vendorCode,
        hex,
      });

      const current = paletteMap.get(hex) ?? { count: 0, vendorCode };
      current.count += 1;
      current.vendorCode = vendorCode;
      paletteMap.set(hex, current);
    }
  }

  return {
    width,
    height,
    cells,
    palette: Array.from(paletteMap.entries()).map(([hex, value]) => ({
      colorId: hex,
      vendorCode: value.vendorCode,
      hex,
      count: value.count,
    })),
    stats: {
      totalCells,
      colorCount: paletteMap.size,
    },
  };
}

export function WorkshopEditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const paintSessionRef = useRef<PaintSession | null>(null);
  const globalPaintCleanupRef = useRef<(() => void) | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(120);
  const [canvasLayout, setCanvasLayout] = useState({
    width: 0,
    height: 0,
    scale: 1,
    offsetY: 0,
    scaleOffsetX: 0,
    scaleOffsetY: 0,
  });
  const historyRef = useRef<string[][][]>([]);
  const historyIndexRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const projectReadyRef = useRef(false);
  const pendingPersistRef = useRef<WorkshopEditorState | null>(null);

  const [grid, setGrid] = useState(() => createEmptyGrid(32, 32));
  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const [bgColor, setBgColor] = useState('#f5f0eb');
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<Tool>('pan');
  const [brushSize, setBrushSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const [currentColor, setCurrentColor] = useState('#D8B4E2');
  const [recentColors, setRecentColors] = useState(DEFAULT_COLORS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const hasUserAdjustedViewRef = useRef(false);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startOffset: { x: number; y: number };
    center: ZoomPoint;
  } | null>(null);
  const touchZoomPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [projectReady, setProjectReady] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>({ index: 0, length: 1 });
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadBrand, setDownloadBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);
  const [editorBrand, setEditorBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);

  const currentRecentColors = makeRecentColors(currentColor, recentColors);
  const downloadPatternResult = gridToPatternResult(grid, downloadBrand);
  const editorPalette = buildPalette(editorBrand);

  const persistEditorSnapshot = async () => {
    if (!projectId) {
      navigate(-1);
      return;
    }

    const editorState: WorkshopEditorState = {
      grid: cloneGrid(grid),
      history: cloneHistory(historyRef.current),
      historyIndex: historyIndexRef.current,
    };
    const patternResult = gridToPatternResult(editorState.grid, editorBrand);

    await Promise.all([
      saveWorkshopProject(projectId, {
        editorState,
        patternResult,
        config: {
          ...defaultWorkshopConfig,
          brand: editorBrand,
          canvasSize: Math.max(editorState.grid.length, editorState.grid[0]?.length ?? 0),
        },
        kind: 'pattern',
        status: 'ready',
        previewUrl: null,
        lastOpenedAt: new Date().toISOString(),
      }),
      saveWorkshopDraft(projectId, { state: editorState }),
    ]);
  };

  const handleBack = async () => {
    try {
      await persistEditorSnapshot();
    } catch (error) {
      console.error('[WorkshopEditorPage] back save failed', error);
    } finally {
      navigate(-1);
    }
  };

  const handleOpenFocusMode = async () => {
    if (!projectId) return;

    try {
      await persistEditorSnapshot();
      navigate(`/workshop/focus/${projectId}`);
    } catch (error) {
      console.error('[WorkshopEditorPage] open focus mode save failed', error);
      showToast('保存失败，请稍后再试');
    }
  };

  useEffect(() => {
    if (!downloadModalOpen) return;
    console.log('[WorkshopEditorPage] download grid', grid);
    console.log('[WorkshopEditorPage] download patternResult', downloadPatternResult);
  }, [downloadModalOpen, downloadPatternResult, grid]);
  const isDownloadModalOpen = downloadModalOpen;

  useEffect(() => {
    projectReadyRef.current = projectReady;
  }, [projectReady]);

  useEffect(() => {
    const updateToolbarHeight = () => {
      if (!toolbarRef.current) return;
      setToolbarHeight(toolbarRef.current.getBoundingClientRect().height);
    };

    updateToolbarHeight();
    window.addEventListener('resize', updateToolbarHeight);

    const observer = toolbarRef.current ? new ResizeObserver(updateToolbarHeight) : null;
    if (observer && toolbarRef.current) observer.observe(toolbarRef.current);

    return () => {
      window.removeEventListener('resize', updateToolbarHeight);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProjectPattern() {
      if (!projectId) {
        if (alive) setProjectReady(true);
        return;
      }

      const currentProject = await getWorkshopProject(projectId).catch(() => null);
      const draft = await getWorkshopDraft(projectId).catch(() => null);
      const localDraft = readLocalEditorDraft(projectId);
      const restoredState = currentProject?.editorState ?? draft?.state ?? localDraft;
      const restoredGrid = restoredState?.grid?.length ? cloneGrid(restoredState.grid) : null;
      await ensureWorkshopProject(projectId, {
        kind: 'pattern',
        status: 'editing',
        beadingState: 'idle',
        lastOpenedAt: new Date().toISOString(),
      });

      const project = await getWorkshopProject(projectId).catch(() => null);
      if (!alive) return;
      const projectBrand = project?.config?.brand ?? defaultWorkshopConfig.brand;
      setEditorBrand(projectBrand);
      setDownloadBrand(projectBrand);

      console.log('[WorkshopEditorPage] project status snapshot', {
        projectId,
        beadingState: project?.beadingState ?? null,
        status: project?.status ?? null,
        kind: project?.kind ?? null,
        hasPatternResult: Boolean(project?.patternResult),
        hasEditorState: Boolean(project?.editorState),
        hasDraftState: Boolean(restoredState),
      });

      let loadedGridForPersistence: string[][] | null = null;

      if (project?.patternResult) {
        const { patternResult } = project;
        const nextGrid = restoredGrid ? cloneGrid(restoredGrid) : buildGridFromPattern(patternResult);

        console.log('[WorkshopEditorPage] patternResult', patternResult);
        console.log('[WorkshopEditorPage] gridFromPatternResult', nextGrid);

        setCols(nextGrid[0]?.length ?? patternResult.width);
        setRows(nextGrid.length || patternResult.height);
        setGrid(nextGrid);
        loadedGridForPersistence = cloneGrid(nextGrid);
      } else if (restoredGrid) {
        setCols(restoredGrid[0]?.length ?? 32);
        setRows(restoredGrid.length);
        setGrid(restoredGrid);
        loadedGridForPersistence = cloneGrid(restoredGrid);
      } else {
        const initialGrid = cloneGrid(grid);
        loadedGridForPersistence = cloneGrid(initialGrid);
      }

      const freshEditorState = createFreshEditorState(loadedGridForPersistence);
      historyRef.current = cloneHistory(freshEditorState.history);
      historyIndexRef.current = freshEditorState.historyIndex;
      setHistoryState({ index: freshEditorState.historyIndex, length: freshEditorState.history.length });
      setProjectReady(true);

      if (projectId) {
        await saveWorkshopProject(projectId, {
          editorState: freshEditorState,
          patternResult: gridToPatternResult(freshEditorState.grid, projectBrand),
          config: {
            ...(project?.config ?? defaultWorkshopConfig),
            brand: projectBrand,
            canvasSize: Math.max(freshEditorState.grid.length, freshEditorState.grid[0]?.length ?? 0),
          },
          kind: 'pattern',
          status: 'ready',
          lastOpenedAt: new Date().toISOString(),
        });
        await saveWorkshopDraft(projectId, { state: freshEditorState });
        writeLocalEditorDraft(projectId, freshEditorState);
      }
    }

    void loadProjectPattern();

    return () => {
      alive = false;
    };
  }, [projectId]);


  useEffect(() => {
    if (!canvasRef.current || !previewCanvasRef.current) return;

    const headerHeight = 56;
    const availableHeight = Math.max(0, window.innerHeight - headerHeight - toolbarHeight);
    const availableWidth = window.innerWidth;
    const cellSize = Math.max(1, Math.floor(availableWidth / cols));
    const displayWidth = cols * cellSize;
    const displayHeight = rows * cellSize;
    const yOffset = Math.max(0, (availableHeight - displayHeight) / 2);
    const scaleOffsetX = Math.max(0, (availableWidth - displayWidth) / 2);

    setCanvasLayout((current) => ({
      ...current,
      width: displayWidth,
      height: displayHeight,
      offsetY: yOffset,
      scaleOffsetX,
      scaleOffsetY: yOffset,
    }));

    if (!hasUserAdjustedViewRef.current) {
      setOffset({ x: scaleOffsetX, y: yOffset });
    }

    paintGridToCanvas({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      bubbleCanvas: bubbleCanvasRef.current,
      grid,
      cols,
      rows,
      bgColor,
      showGrid,
      displayWidth,
      displayHeight,
    });
  }, [bgColor, cols, grid, rows, showGrid, toolbarHeight]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      globalPaintCleanupRef.current?.();
    };
  }, []);

  const flushPersistedState = async (payload = pendingPersistRef.current) => {
    if (!payload || !projectId) return;

    const editorState: WorkshopEditorState = {
      grid: cloneGrid(payload.grid),
      history: cloneHistory(payload.history),
      historyIndex: payload.historyIndex,
    };

    try {
      await Promise.all([
        saveWorkshopDraft(projectId, { state: editorState }),
        saveWorkshopProject(projectId, {
          editorState,
          patternResult: gridToPatternResult(editorState.grid, editorBrand),
          config: {
            ...defaultWorkshopConfig,
            brand: editorBrand,
            canvasSize: Math.max(editorState.grid.length, editorState.grid[0]?.length ?? 0),
          },
          kind: 'pattern',
          status: 'ready',
          lastOpenedAt: new Date().toISOString(),
        }),
      ]);
      writeLocalEditorDraft(projectId, editorState);
    } catch {
      writeLocalEditorDraft(projectId, editorState);
    }
  };

  const schedulePersistState = (nextGrid: string[][], nextHistory: string[][][], nextIndex: number) => {
    pendingPersistRef.current = {
      grid: cloneGrid(nextGrid),
      history: cloneHistory(nextHistory),
      historyIndex: nextIndex,
    };

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    if (!projectId) return;

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushPersistedState();
    }, SAVE_DEBOUNCE_MS);
  };

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

  const clampScale = (nextScale: number) => Math.min(12, Math.max(0.2, +nextScale.toFixed(2)));

  const getCenteredOffset = (nextScale = 1) => ({
    x: Math.max(0, (window.innerWidth - canvasLayout.width * nextScale) / 2),
    y: Math.max(0, (window.innerHeight - headerHeight - toolbarHeight - canvasLayout.height * nextScale) / 2),
  });

  const applyZoom = (nextScale: number, focalPoint?: PointerPoint) => {
    const canvas = canvasRef.current;
    const stage = canvasStageRef.current;
    if (!canvas || !stage) return;

    const currentScale = scale;
    const clampedScale = clampScale(nextScale);
    if (clampedScale === currentScale) return;

    const stageRect = stage.getBoundingClientRect();
    const scaleRatio = clampedScale / currentScale;

    hasUserAdjustedViewRef.current = true;
    setOffset((current) => {
      if (!focalPoint) {
        return getCenteredOffset(clampedScale);
      }

      const pointX = focalPoint.clientX - stageRect.left;
      const pointY = focalPoint.clientY - stageRect.top;

      return {
        x: pointX - (pointX - current.x) * scaleRatio,
        y: pointY - (pointY - current.y) * scaleRatio,
      };
    });

    setScale(clampedScale);
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    applyZoom(scale * factor, { clientX, clientY });
  };

  const persistEditorState = (nextGrid: string[][], nextHistory: string[][][], nextIndex: number) => {
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    setHistoryState({ index: nextIndex, length: nextHistory.length });
    setGrid(nextGrid);
    schedulePersistState(nextGrid, nextHistory, nextIndex);
  };

  const commitGrid = (nextGrid: string[][]) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(cloneGrid(nextGrid));

    const trimmedHistory = nextHistory.slice(-HISTORY_LIMIT);
    const nextIndex = trimmedHistory.length - 1;

    persistEditorState(nextGrid, trimmedHistory, nextIndex);
  };

  const continuePaintStroke = (pointerId: number, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const paintSession = paintSessionRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.kind !== 'paint' || !paintSession) return;

    const cell = toCellPoint(clientX, clientY, canvasRef.current, cols, rows);
    if (!cell) return;

    const key = `${cell.row},${cell.col}`;
    if (drag.lastCell === key) return;

    drag.lastCell = key;

    let changed = false;
    for (const nextCell of getInterpolatedCells(paintSession.lastCell, cell)) {
      changed = paintCellBlock(
        paintSession.grid,
        nextCell.row,
        nextCell.col,
        paintSession.tool,
        paintSession.color,
        paintSession.size,
      ) || changed;
    }

    paintSession.lastCell = cell;
    paintSession.changed = paintSession.changed || changed;
    if (changed) setGrid(cloneGrid(paintSession.grid));
    drag.moved = true;
  };

  const finishPaintStroke = (pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.kind !== 'paint') return;

    const paintSession = paintSessionRef.current;
    if (paintSession?.changed) {
      commitGrid(cloneGrid(paintSession.grid));
    }
    paintSessionRef.current = null;
    globalPaintCleanupRef.current?.();
    globalPaintCleanupRef.current = null;
  };

  const bindGlobalPaintEvents = (pointerId: number) => {
    globalPaintCleanupRef.current?.();

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      continuePaintStroke(event.pointerId, event.clientX, event.clientY);
    };

    const handleEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      finishPaintStroke(event.pointerId);
      dragRef.current = null;
      pinchRef.current = null;
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    globalPaintCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
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

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors.
    }
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.kind === 'pan') {
      hasUserAdjustedViewRef.current = true;
    }

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
            <img className={styles.tagIcon} src={ICONS.brush} alt="" />
            <span className={styles.tagText}>画笔</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>粗细</div>
            <div className={styles.sizeDots}>
              {[1, 2, 3].map((size) => {
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
            <img className={styles.tagIcon} src={ICONS.eraser} alt="" />
            <span className={styles.tagText}>橡皮</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <div className={styles.paramLabel}>大小</div>
            <div className={styles.sizeDots}>
              {[1, 2, 3].map((size) => {
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
        </>
      );
    }

    if (tool === 'fill') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <img className={styles.tagIcon} src={ICONS.fill} alt="" />
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
            <img className={styles.tagIcon} src={ICONS.picker} alt="" />
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
          <img className={styles.tagIcon} src={ICONS.pan} alt="" />
          <span className={styles.tagText}>平移</span>
        </div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}>
          <div className={styles.paramLabel}>视图缩放</div>
          <div className={styles.zoomTools}>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => applyZoom(scale - 0.1)}
            >
              －
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => applyZoom(scale + 0.1)}
            >
              ＋
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => {
                setOffset(getCenteredOffset(1));
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

    if (tool === 'pan') {
      if (isDownloadModalOpen) return;
      beginDrag(event, 'pan', offset.x, offset.y);
      return;
    }

    if (event.pointerType === 'touch') {
      touchZoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (touchZoomPointersRef.current.size >= 2) {
        const paintSession = paintSessionRef.current;
        if (paintSession?.changed) {
          commitGrid(cloneGrid(paintSession.grid));
        }
        globalPaintCleanupRef.current?.();
        globalPaintCleanupRef.current = null;
        const [a, b] = Array.from(touchZoomPointersRef.current.values());
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        pinchRef.current = {
          startDistance: Math.hypot(dx, dy),
          startScale: scale,
          startOffset: { ...offset },
          center: {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          },
        };
        paintSessionRef.current = null;
        dragRef.current = null;
        return;
      }
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

    const size = tool === 'eraser' ? eraserSize : brushSize;
    const nextGrid = cloneGrid(grid);
    const changed = paintCellBlock(nextGrid, cell.row, cell.col, tool, currentColor, size);
    paintSessionRef.current = {
      grid: nextGrid,
      tool,
      color: currentColor,
      size,
      changed,
      lastCell: cell,
    };
    setGrid(nextGrid);
    beginDrag(event, 'paint');
    bindGlobalPaintEvents(event.pointerId);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && touchZoomPointersRef.current.has(event.pointerId)) {
      touchZoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (touchZoomPointersRef.current.size >= 2 && pinchRef.current) {
        const [a, b] = Array.from(touchZoomPointersRef.current.values());
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const nextScale = clampScale(pinchRef.current.startScale * (distance / pinchRef.current.startDistance));
        const stage = canvasStageRef.current;
        if (!stage) return;

        const rect = stage.getBoundingClientRect();
        const centerX = pinchRef.current.center.x - rect.left;
        const centerY = pinchRef.current.center.y - rect.top;
        const scaleRatio = nextScale / pinchRef.current.startScale;

        setOffset({
          x: centerX - (centerX - pinchRef.current.startOffset.x) * scaleRatio,
          y: centerY - (centerY - pinchRef.current.startOffset.y) * scaleRatio,
        });
        setScale(nextScale);
        return;
      }
    }

    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId && drag.kind === 'pan') {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      drag.moved = true;
      hasUserAdjustedViewRef.current = true;
      setOffset({
        x: drag.originOffsetX + dx,
        y: drag.originOffsetY + dy,
      });
      return;
    }

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

    continuePaintStroke(event.pointerId, event.clientX, event.clientY);
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchZoomPointersRef.current.delete(event.pointerId);
      if (touchZoomPointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.kind === 'paint') finishPaintStroke(event.pointerId);

    dragRef.current = null;
    pinchRef.current = null;

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
    setClearConfirmOpen(true);
  };

  const confirmClearCanvas = () => {
    setClearConfirmOpen(false);
    const clearedGrid = createEmptyGrid(cols, rows);
    commitGrid(clearedGrid);
    showToast('已清空画布');
  };

  const cancelClearCanvas = () => {
    setClearConfirmOpen(false);
  };

  useEffect(() => {
    const handlePageFlush = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushPersistedState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handlePageFlush();
      }
    };

    window.addEventListener('pagehide', handlePageFlush);
    window.addEventListener('beforeunload', handlePageFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageFlush);
      window.removeEventListener('beforeunload', handlePageFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [projectId]);

  const headerHeight = 56;
  const canvasStageStyle = {
    top: `${headerHeight}px`,
    bottom: `${Math.max(0, toolbarHeight + 18)}px`,
  };

  const canvasTransformStyle = {
    width: `${canvasLayout.width}px`,
    height: `${canvasLayout.height}px`,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
  };

  return (
    <main className={styles.page}>
      <header className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <button
            type="button"
            className={styles.titlebarLogo}
            onClick={handleBack}
            title="返回上一页"
            aria-label="返回上一页"
          >
            <img src={ICONS.goback} alt="" />
          </button>
          <div className={styles.titlebarText}>
            <h1>图纸编辑</h1>
          </div>
        </div>
        <div className={styles.titlebarActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              setDownloadBrand(editorBrand);
              setDownloadModalOpen(true);
            }}
            disabled={!grid.length}
            title="导出"
          >
            下载
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleOpenFocusMode}
            disabled={!projectId || !grid.length}
            title="进入拼豆模式"
          >
            拼豆
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
        onWheel={(event) => {
          const factor = event.deltaY < 0 ? 1.12 : 0.9;
          applyZoom(scale * factor, { clientX: event.clientX, clientY: event.clientY });
        }}
        style={{ outline: 'none' }}
      >
        <div ref={canvasStageRef} className={styles.canvasStage} style={canvasStageStyle}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            style={canvasTransformStyle}
          />
        </div>

        <div
          className={styles.canvasActions}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={styles.canvasActionBtn}
            onClick={undo}
            disabled={historyState.index <= 0}
            title="撤销"
            aria-label="撤销"
          >
            <img src={ICONS.undo} alt="" />
          </button>
          <button
            type="button"
            className={styles.canvasActionBtn}
            onClick={redo}
            disabled={historyState.index >= historyState.length - 1}
            title="重做"
            aria-label="重做"
          >
            <img src={ICONS.redo} alt="" />
          </button>
          <button
            type="button"
            className={styles.canvasActionBtn}
            onClick={clearCanvas}
            title="清空画布"
            aria-label="清空画布"
          >
            <img src={ICONS.clear} alt="" />
          </button>
        </div>

        <WorkshopPreviewPanel
          previewCanvasRef={previewCanvasRef}
          bubbleCanvasRef={bubbleCanvasRef}
        />

        <DownloadSettingsModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          brand={downloadBrand}
          patternResult={downloadPatternResult}
          defaultPatternName=""
        />
        {downloadModalOpen && <div className={styles.modalShield} aria-hidden="true" />}

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
                aria-label={item.label}
              >
                {item.iconSrc ? <img src={item.iconSrc} alt="" /> : item.icon}
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
            <div className={styles.brandTabs} role="tablist" aria-label="品牌色卡">
              {beadBrandKeys.map((brandKey) => (
                <button
                  key={brandKey}
                  type="button"
                  className={`${styles.brandTab} ${editorBrand === brandKey ? styles.brandTabActive : ''}`}
                  onClick={() => {
                    setEditorBrand(brandKey);
                    setDownloadBrand(brandKey);
                  }}
                >
                  {getBeadBrandLabel(brandKey)}
                </button>
              ))}
            </div>
            <div className={styles.paletteGrid}>
              {editorPalette.map((color) => (
                <button
                  key={`${color.hex}-${color.vendorCode}`}
                  type="button"
                  className={styles.paletteSwatch}
                  style={{ background: color.hex }}
                  title={`${getBeadBrandLabel(editorBrand)} ${color.vendorCode}`}
                  aria-label={`${getBeadBrandLabel(editorBrand)} ${color.vendorCode}`}
                  onClick={() => {
                    applyColor(color.hex);
                    setPaletteOpen(false);
                  }}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    applyColor(color.hex);
                    setPaletteOpen(false);
                  }}
                >
                  <span>{color.vendorCode}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {clearConfirmOpen ? (
        <div className={styles.modalBackdrop} onClick={cancelClearCanvas}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3>清空画布</h3>
              <button type="button" className={styles.closeBtn} onClick={cancelClearCanvas} aria-label="关闭弹窗">
                ×
              </button>
            </header>
            <div style={{ color: 'rgba(93,83,74,.78)', lineHeight: 1.7, fontSize: 14 }}>
              确定要清空当前画布吗？此操作不可撤销。
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={cancelClearCanvas}>
                取消
              </button>
              <button type="button" className={styles.primaryBtn} onClick={confirmClearCanvas}>
                确认清空
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </main>
  );
}
