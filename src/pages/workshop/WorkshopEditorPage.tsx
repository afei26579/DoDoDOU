import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './WorkshopEditorPage.module.css';
import { WorkshopPreviewPanel } from './components/WorkshopPreviewPanel';
import { DownloadSettingsModal } from './DownloadSettingsModal';
import { EditorSettingsSheet } from './editor/EditorSettingsSheet';
import { ensureWorkshopProject, getWorkshopProject, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import {
  getWorkshopDraft,
  saveWorkshopDraft,
} from '../../features/workshop/model/draftStore';
import type { PatternResult, WorkshopEditorState, WorkshopConfig } from '../../features/workshop/model/types';
import { defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { buildPalette, getVendorCode, type PatternPaletteColor } from '../../lib/pattern/color-system';
import { beadBrandKeys, getBeadBrandLabel, type BeadBrandKey } from '../../lib/pattern/brand';
import {
  createEmptyGrid,
  floodFill,
  paintGridToCanvas,
  TRANSPARENT_GRID_LIGHT,
  toCellPoint,
  type EditorBackgroundMode,
  type EditorBeadShape,
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

type PendingTouchAction = {
  pointerId: number;
  tool: Exclude<Tool, 'pan'>;
  cell: { row: number; col: number };
  clientX: number;
  clientY: number;
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17.5v1.2c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-1.2" fill="none" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function BeadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="7.5" cy="7.5" r="2.4" fill="none" strokeWidth="2" />
      <circle cx="16.5" cy="7.5" r="2.4" fill="none" strokeWidth="2" />
      <circle cx="7.5" cy="16.5" r="2.4" fill="none" strokeWidth="2" />
      <circle cx="16.5" cy="16.5" r="2.4" fill="none" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z" fill="none" strokeWidth="2" />
      <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A8.2 8.2 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a8.4 8.4 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8.2 8.2 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8.2 8.2 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon?: string; iconSrc?: string }> = [
  { id: 'brush', label: '画笔', iconSrc: ICONS.brush },
  { id: 'eraser', label: '橡皮', iconSrc: ICONS.eraser },
  { id: 'fill', label: '填充', iconSrc: ICONS.fill },
  { id: 'picker', label: '取色', iconSrc: ICONS.picker },
  { id: 'pan', label: '平移', iconSrc: ICONS.pan },
];

const DEFAULT_COLORS = ['#000000', '#FFFFFF', '#FF6600', '#FFDAC1', '#D8B4E2'];
const HISTORY_LIMIT = 80;
const SAVE_DEBOUNCE_MS = 800;
const WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX = 'dodoudou:workshop-editor-local-draft:';
const ALL_PALETTE_GROUP = 'all';

type PaletteGroupType = 'all' | 'letter' | 'number';

type PaletteGroup = {
  key: string;
  label: string;
  type: PaletteGroupType;
  sortValue: number;
};

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

function getNumberPaletteGroup(code: string): PaletteGroup | null {
  const numberMatch = code.match(/\d+/);
  if (!numberMatch) return null;

  const value = Number(numberMatch[0]);
  if (!Number.isFinite(value)) return null;

  const start = Math.floor(value / 10) * 10;
  const label = start === 0 ? '0-9' : `${start}-${start + 9}`;

  return {
    key: `number:${start}`,
    label,
    type: 'number',
    sortValue: start,
  };
}

function getPaletteGroupForCode(brandKey: BeadBrandKey, vendorCode: string): PaletteGroup {
  const code = vendorCode.trim().toUpperCase();
  const letterMatch = code.match(/^[A-Z]+/);

  if (brandKey !== 'PANPAN' && letterMatch) {
    const label = letterMatch[0];
    return {
      key: `letter:${label}`,
      label,
      type: 'letter',
      sortValue: label.charCodeAt(0),
    };
  }

  return getNumberPaletteGroup(code) ?? {
    key: `letter:${code || "?"}`,
    label: code || '?',
    type: 'letter',
    sortValue: Number.MAX_SAFE_INTEGER,
  };
}

function buildPaletteGroups(brandKey: BeadBrandKey, palette: PatternPaletteColor[]) {
  const groupMap = new Map<string, PaletteGroup>();

  for (const color of palette) {
    const group = getPaletteGroupForCode(brandKey, color.vendorCode);
    if (!groupMap.has(group.key)) groupMap.set(group.key, group);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === 'letter') return -1;
      if (b.type === 'letter') return 1;
    }

    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
    return a.label.localeCompare(b.label);
  });

  return [
    {
      key: ALL_PALETTE_GROUP,
      label: '全部',
      type: 'all',
      sortValue: -1,
    },
    ...groups,
  ] satisfies PaletteGroup[];
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

function getMinimumCanvasSize(grid: string[][]) {
  let minCols = 1;
  let minRows = 1;

  grid.forEach((row, rowIndex) => {
    row.forEach((hex, colIndex) => {
      if (!hex || hex === 'transparent') return;
      minCols = Math.max(minCols, colIndex + 1);
      minRows = Math.max(minRows, rowIndex + 1);
    });
  });

  return { cols: minCols, rows: minRows };
}

function resizeGridCanvas(grid: string[][], nextCols: number, nextRows: number) {
  return Array.from({ length: nextRows }, (_, rowIndex) => {
    const currentRow = grid[rowIndex] ?? [];
    return Array.from({ length: nextCols }, (_, colIndex) => currentRow[colIndex] ?? '');
  });
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
  const [baseCanvasSize, setBaseCanvasSize] = useState({ cols: 1, rows: 1 });
  const [bgColor, setBgColor] = useState(TRANSPARENT_GRID_LIGHT);
  const [showGrid, setShowGrid] = useState(true);
  const [showDividers, setShowDividers] = useState(true);
  const [showColorCodes, setShowColorCodes] = useState(false);
  const [beadShape, setBeadShape] = useState<EditorBeadShape>('circle');
  const [backgroundMode, setBackgroundMode] = useState<EditorBackgroundMode>('checker');
  const [tool, setTool] = useState<Tool>('pan');
  const [brushSize, setBrushSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const [currentColor, setCurrentColor] = useState('#D8B4E2');
  const [recentColors, setRecentColors] = useState(DEFAULT_COLORS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const hasUserAdjustedViewRef = useRef(false);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startOffset: { x: number; y: number };
    center: ZoomPoint;
  } | null>(null);
  const pendingTouchActionRef = useRef<PendingTouchAction | null>(null);
  const touchZoomPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [projectReady, setProjectReady] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>({ index: 0, length: 1 });
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadBrand, setDownloadBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);
  const [editorBrand, setEditorBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);
  const [activePaletteGroup, setActivePaletteGroup] = useState(ALL_PALETTE_GROUP);

  const currentRecentColors = makeRecentColors(currentColor, recentColors);
  const downloadPatternResult = gridToPatternResult(grid, downloadBrand);
  const editorPalette = useMemo(() => buildPalette(editorBrand), [editorBrand]);
  const paletteGroups = useMemo(
    () => buildPaletteGroups(editorBrand, editorPalette),
    [editorBrand, editorPalette],
  );
  const visibleEditorPalette = useMemo(
    () => editorPalette.filter((color) => {
      if (activePaletteGroup === ALL_PALETTE_GROUP) return true;
      return getPaletteGroupForCode(editorBrand, color.vendorCode).key === activePaletteGroup;
    }),
    [activePaletteGroup, editorBrand, editorPalette],
  );
  const minimumCanvasSize = useMemo(() => {
    const contentSize = getMinimumCanvasSize(grid);
    return {
      cols: Math.max(baseCanvasSize.cols, contentSize.cols),
      rows: Math.max(baseCanvasSize.rows, contentSize.rows),
    };
  }, [baseCanvasSize.cols, baseCanvasSize.rows, grid]);

  useEffect(() => {
    if (!paletteGroups.some((group) => group.key === activePaletteGroup)) {
      setActivePaletteGroup(ALL_PALETTE_GROUP);
    }
  }, [activePaletteGroup, paletteGroups]);

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
      navigate(`/workshop/focus/${projectId}`, { state: { returnTo: `/workshop/editor/${projectId}` } });
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
        const isBlankSource = project.sourceType === 'blank';
        setBaseCanvasSize(isBlankSource ? { cols: 1, rows: 1 } : { cols: patternResult.width, rows: patternResult.height });

        console.log('[WorkshopEditorPage] patternResult', patternResult);
        console.log('[WorkshopEditorPage] gridFromPatternResult', nextGrid);

        setCols(nextGrid[0]?.length ?? patternResult.width);
        setRows(nextGrid.length || patternResult.height);
        setGrid(nextGrid);
        loadedGridForPersistence = cloneGrid(nextGrid);
      } else if (restoredGrid) {
        setBaseCanvasSize({ cols: 1, rows: 1 });
        setCols(restoredGrid[0]?.length ?? 32);
        setRows(restoredGrid.length);
        setGrid(restoredGrid);
        loadedGridForPersistence = cloneGrid(restoredGrid);
      } else {
        setBaseCanvasSize({ cols: 1, rows: 1 });
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
      showDividers,
      showColorCodes,
      beadShape,
      backgroundMode,
      colorSystem: editorBrand,
      displayWidth,
      displayHeight,
      visibleCellSize: cellSize * scale,
    });
  }, [backgroundMode, beadShape, bgColor, cols, editorBrand, grid, rows, scale, showColorCodes, showDividers, showGrid, toolbarHeight]);

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
    setCols(nextGrid[0]?.length ?? 0);
    setRows(nextGrid.length);
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

  const cancelActivePaintStroke = () => {
    if (paintSessionRef.current) {
      const currentGrid = historyRef.current[historyIndexRef.current];
      if (currentGrid) setGrid(cloneGrid(currentGrid));
    }

    paintSessionRef.current = null;
    globalPaintCleanupRef.current?.();
    globalPaintCleanupRef.current = null;

    if (dragRef.current?.kind === 'paint') {
      dragRef.current = null;
    }
  };

  const startPaintStroke = (
    pointerId: number,
    cell: { row: number; col: number },
    clientX: number,
    clientY: number,
  ) => {
    if (tool !== 'brush' && tool !== 'eraser') return;

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
    dragRef.current = {
      kind: 'paint',
      pointerId,
      startX: clientX,
      startY: clientY,
      originX: 0,
      originY: 0,
      originOffsetX: 0,
      originOffsetY: 0,
      moved: false,
      lastCell: `${cell.row},${cell.col}`,
    };

    if (changed) setGrid(nextGrid);
    bindGlobalPaintEvents(pointerId);
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
              -
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => applyZoom(scale + 0.1)}
            >
              +
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => {
                setOffset(getCenteredOffset(1));
                setScale(1);
                showToast('视图已重置');
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

    if (event.pointerType === 'touch') {
      touchZoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (touchZoomPointersRef.current.size >= 2) {
        pendingTouchActionRef.current = null;
        cancelActivePaintStroke();
        dragRef.current = null;
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

    if (tool === 'pan') {
      if (isDownloadModalOpen) return;
      beginDrag(event, 'pan', offset.x, offset.y);
      return;
    }

    const cell = toCellPoint(event.clientX, event.clientY, canvasRef.current, cols, rows);
    if (!cell) return;

    if (event.pointerType === 'touch') {
      pendingTouchActionRef.current = {
        pointerId: event.pointerId,
        tool,
        cell,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      return;
    }

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

    startPaintStroke(event.pointerId, cell, event.clientX, event.clientY);
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

      const pendingTouchAction = pendingTouchActionRef.current;
      if (
        pendingTouchAction
        && pendingTouchAction.pointerId === event.pointerId
        && (pendingTouchAction.tool === 'brush' || pendingTouchAction.tool === 'eraser')
      ) {
        const moveDistance = Math.hypot(
          event.clientX - pendingTouchAction.clientX,
          event.clientY - pendingTouchAction.clientY,
        );

        if (moveDistance > 4) {
          pendingTouchActionRef.current = null;
          startPaintStroke(
            pendingTouchAction.pointerId,
            pendingTouchAction.cell,
            pendingTouchAction.clientX,
            pendingTouchAction.clientY,
          );
          continuePaintStroke(event.pointerId, event.clientX, event.clientY);
          return;
        }
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
    const wasPinching = event.pointerType === 'touch' && (
      Boolean(pinchRef.current) || touchZoomPointersRef.current.size >= 2
    );

    if (event.pointerType === 'touch') {
      touchZoomPointersRef.current.delete(event.pointerId);
      if (touchZoomPointersRef.current.size < 2) {
        pinchRef.current = null;
      }

      const pendingTouchAction = pendingTouchActionRef.current;
      if (pendingTouchAction?.pointerId === event.pointerId) {
        pendingTouchActionRef.current = null;

        if (!wasPinching) {
          if (pendingTouchAction.tool === 'picker') {
            const picked = grid[pendingTouchAction.cell.row]?.[pendingTouchAction.cell.col];
            if (picked) applyColor(picked);
            setTool('brush');
            showToast('已取色');
            return;
          }

          if (pendingTouchAction.tool === 'fill') {
            commitGrid(floodFill(grid, pendingTouchAction.cell.row, pendingTouchAction.cell.col, currentColor));
            showToast('已执行填充');
            return;
          }

          startPaintStroke(
            pendingTouchAction.pointerId,
            pendingTouchAction.cell,
            pendingTouchAction.clientX,
            pendingTouchAction.clientY,
          );
          finishPaintStroke(pendingTouchAction.pointerId);
          dragRef.current = null;
          return;
        }
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

  const handleResizeCanvas = (nextCols: number, nextRows: number) => {
    const requestedCols = Math.floor(nextCols);
    const requestedRows = Math.floor(nextRows);
    if (!Number.isFinite(requestedCols) || !Number.isFinite(requestedRows)) return;

    const safeCols = Math.max(minimumCanvasSize.cols, requestedCols);
    const safeRows = Math.max(minimumCanvasSize.rows, requestedRows);
    const didClamp = safeCols !== requestedCols || safeRows !== requestedRows;

    if (safeCols === cols && safeRows === rows) {
      if (didClamp) {
        showToast(`画布不能小于已编辑范围，最小 ${minimumCanvasSize.cols} × ${minimumCanvasSize.rows}`);
      }
      return;
    }

    commitGrid(resizeGridCanvas(grid, safeCols, safeRows));
    showToast(didClamp
      ? `画布不能小于已编辑范围，已调整为 ${safeCols} × ${safeRows}`
      : `画布尺寸已调整为 ${safeCols} × ${safeRows}`);
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
            className={styles.iconButton}
            onClick={() => {
              setDownloadBrand(editorBrand);
              setDownloadModalOpen(true);
            }}
            disabled={!grid.length}
            title="下载"
            aria-label="下载"
          >
            <DownloadIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleOpenFocusMode}
            disabled={!projectId || !grid.length}
            title="拼豆"
            aria-label="进入拼豆模式"
          >
            <BeadIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSettingsOpen(true)}
            title="设置"
            aria-label="打开设置"
          >
            <SettingsIcon />
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
            <button
              type="button"
              className={styles.colorSwatch}
              style={{ background: currentColor }}
              onClick={() => setPaletteOpen(true)}
              title="当前颜色"
              aria-label="打开色卡"
            />
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
                x
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
                    setActivePaletteGroup(ALL_PALETTE_GROUP);
                  }}
                >
                  {getBeadBrandLabel(brandKey)}
                </button>
              ))}
            </div>
            <div className={styles.paletteBody}>
              <nav className={styles.paletteNav} aria-label="色号系列">
                {paletteGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    className={`${styles.paletteNavBtn} ${activePaletteGroup === group.key ? styles.paletteNavBtnActive : ''}`}
                    onClick={() => setActivePaletteGroup(group.key)}
                  >
                    {group.label}
                  </button>
                ))}
              </nav>
              <div className={styles.paletteGrid}>
                {visibleEditorPalette.map((color) => (
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

      <EditorSettingsSheet
        open={settingsOpen}
        brand={editorBrand}
        cols={cols}
        rows={rows}
        minCols={minimumCanvasSize.cols}
        minRows={minimumCanvasSize.rows}
        showDividers={showDividers}
        showColorCodes={showColorCodes}
        beadShape={beadShape}
        backgroundMode={backgroundMode}
        onClose={() => setSettingsOpen(false)}
        onBrandChange={(newBrand) => {
          setEditorBrand(newBrand);
          setDownloadBrand(newBrand);
        }}
        onResizeCanvas={handleResizeCanvas}
        onShowDividersChange={setShowDividers}
        onShowColorCodesChange={setShowColorCodes}
        onBeadShapeChange={setBeadShape}
        onBackgroundModeChange={setBackgroundMode}
      />
    </main>
  );
}
