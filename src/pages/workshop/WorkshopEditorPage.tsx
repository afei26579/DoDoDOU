import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getWorkshopProject, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternCell, PatternResult, WorkshopConfig } from '../../features/workshop/model/types';

type Tool = 'brush' | 'eraser' | 'fill' | 'picker' | 'pan';

type EditorProjectData = {
  title: string;
  imageUrl: string | null;
  pattern: PatternResult;
  activeColor: string;
  config: WorkshopConfig;
};

type LoadedPatternGrid = {
  grid: string[][];
  width: number;
  height: number;
};

type GridPoint = { row: number; col: number };

type HistorySnapshot = {
  cells: string[][];
  activeColor: string;
  config: WorkshopConfig;
};

type PreviewState = {
  open: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

const TITLEBAR_H = 56;
const CANVAS_BG = '#FDFBF7';
const DEFAULT_COLOR = '#cfa7e8';
const TOOL_ITEMS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'brush', label: '画笔', icon: '✏️' },
  { id: 'eraser', label: '橡皮', icon: '🧹' },
  { id: 'fill', label: '填充', icon: '🪣' },
  { id: 'picker', label: '取色', icon: '💉' },
  { id: 'pan', label: '平移', icon: '✋' },
];

const QUICK_COLORS = [
  '#cfa7e8', '#ffd3b0', '#b7ead7', '#ffb8c4', '#f7e69a', '#9cc4f5',
  '#5d534a', '#ffffff', '#f7a8a8', '#9db2f8', '#d6e6b8', '#f7cf8f',
  '#e6dffd', '#d9f4eb', '#f8e7b4', '#fff2d8', '#d7f0fb', '#f4d6ea',
  '#d1d1d1', '#f2c6c6', '#c9d7f0', '#dbe8b9', '#f2d2a1', '#f8f3ee',
] as const;

function buildFallbackPattern(): PatternResult {
  const cells: PatternCell[] = [];
  for (let y = 0; y < 30; y += 1) {
    for (let x = 0; x < 30; x += 1) {
      const hex = '#ffffff';
      cells.push({
        x,
        y,
        colorId: 'white',
        vendorCode: 'white',
        hex,
      });
    }
  }

  return {
    width: 30,
    height: 30,
    cells,
    palette: [
      { colorId: 'white', vendorCode: 'white', hex: '#ffffff', count: 900 },
    ],
    stats: { totalCells: 900, colorCount: 1 },
  };
}

function patternToGrid(pattern: PatternResult): LoadedPatternGrid {
  const cells = Array.isArray(pattern.cells) ? pattern.cells : [];
  const width = Math.max(1, pattern.width || (cells.length ? Math.max(...cells.map((cell) => Number(cell.x)).filter(Number.isFinite)) + 1 : 1));
  const height = Math.max(1, pattern.height || (cells.length ? Math.max(...cells.map((cell) => Number(cell.y)).filter(Number.isFinite)) + 1 : 1));
  const grid = Array.from({ length: height }, () => Array(width).fill(''));

  cells.forEach((cell) => {
    const x = Number(cell.x);
    const y = Number(cell.y);
    const hex = typeof cell.hex === 'string' ? cell.hex.trim() : '';
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (y >= 0 && y < height && x >= 0 && x < width) {
      grid[y][x] = hex;
    }
  });

  return { grid, width, height };
}

function rebuildPatternFromGrid(base: PatternResult, grid: string[][]): PatternResult {
  const cells: PatternCell[] = [];
  const counts = new Map<string, number>();

  grid.forEach((row, y) => {
    row.forEach((hex, x) => {
      const color = hex || '';
      cells.push({
        x,
        y,
        colorId: color || 'empty',
        vendorCode: color || 'empty',
        hex: color,
      });
      if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    });
  });

  const palette = Array.from(counts.entries()).map(([hex, count]) => ({
    colorId: hex,
    vendorCode: hex,
    hex,
    count,
  }));

  return {
    ...base,
    width: grid[0]?.length ?? base.width,
    height: grid.length,
    cells,
    palette,
    stats: {
      totalCells: grid.length * (grid[0]?.length ?? 0),
      colorCount: palette.length,
    },
  };
}

function copyGrid(grid: string[][]) {
  return grid.map((row) => [...row]);
}

function inBounds(grid: string[][], row: number, col: number) {
  return row >= 0 && row < grid.length && col >= 0 && col < (grid[0]?.length ?? 0);
}

function floodFill(grid: string[][], row: number, col: number, fillColor: string) {
  const target = grid[row][col] ?? '';
  if (target === fillColor) return grid;

  const next = copyGrid(grid);
  const stack: GridPoint[] = [{ row, col }];
  const visited = new Set<string>();

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const key = `${current.row},${current.col}`;
    if (visited.has(key) || !inBounds(next, current.row, current.col)) continue;
    if ((next[current.row][current.col] ?? '') !== target) continue;
    visited.add(key);
    next[current.row][current.col] = fillColor;
    stack.push(
      { row: current.row - 1, col: current.col },
      { row: current.row + 1, col: current.col },
      { row: current.row, col: current.col - 1 },
      { row: current.row, col: current.col + 1 },
    );
  }

  return next;
}

export function WorkshopEditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    kind: 'draw' | 'pan' | 'preview-move' | 'preview-resize' | 'toolbar';
    pointerId: number;
    startX: number;
    startY: number;
    lastCell?: GridPoint;
    originOffsetX: number;
    originOffsetY: number;
    originScale: number;
    originWidth?: number;
    originHeight?: number;
    originLeft?: number;
    originTop?: number;
  } | null>(null);
  const initialFallbackPattern = useMemo(() => buildFallbackPattern(), []);
  const initialFallbackGrid = useMemo(() => patternToGrid(initialFallbackPattern).grid, [initialFallbackPattern]);
  const [projectData, setProjectData] = useState<EditorProjectData | null>({
    title: '未命名图纸',
    imageUrl: null,
    pattern: initialFallbackPattern,
    activeColor: '#ffffff',
    config: { canvasSize: 30, brand: 'MARD', style: '动漫', colorMergeThreshold: 30 },
  });
  const [tool, setTool] = useState<Tool>('brush');
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [grid, setGrid] = useState<string[][]>(initialFallbackGrid);
  const [gridReady, setGridReady] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ open: true, width: 180, height: 180, x: 0, y: 0 });
  const [patternName, setPatternName] = useState('');
  const [canvasMetrics, setCanvasMetrics] = useState({ cellSize: 1, width: 1, height: 1, renderWidth: 1, renderHeight: 1 });
  const [bgColor, setBgColor] = useState(CANVAS_BG);
  const [rows, setRows] = useState(24);
  const [cols, setCols] = useState(24);

  const pattern = useMemo(() => projectData?.pattern ?? buildFallbackPattern(), [projectData?.pattern]);

  const saveSnapshot = (nextGrid: string[][], nextColor = selectedColor, nextConfig?: Partial<WorkshopConfig>) => {
    const snapshot: HistorySnapshot = {
      cells: copyGrid(nextGrid),
      activeColor: nextColor,
      config: {
        canvasSize: nextConfig?.canvasSize ?? projectData?.config.canvasSize ?? 24,
        brand: nextConfig?.brand ?? projectData?.config.brand ?? 'MARD',
        style: nextConfig?.style ?? projectData?.config.style ?? '动漫',
        colorMergeThreshold: nextConfig?.colorMergeThreshold ?? projectData?.config.colorMergeThreshold ?? 30,
      },
    };
    const nextHistory = history.slice(0, historyIndex + 1).concat(snapshot).slice(-80);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  useEffect(() => {
    let alive = true;
    console.debug('[workshop-editor] load start', { projectId });
    if (!projectId) {
      console.debug('[workshop-editor] no project id, use fallback');
      return;
    }

    getWorkshopProject(projectId)
      .then((record) => {
        console.debug('[workshop-editor] loaded record', {
          hasRecord: Boolean(record),
          hasPatternResult: Boolean(record?.patternResult),
          hasUploadedImage: Boolean(record?.uploadedImage),
          patternSize: record?.patternResult ? `${record.patternResult.width}x${record.patternResult.height}` : null,
          cellCount: record?.patternResult?.cells?.length ?? 0,
          paletteCount: record?.patternResult?.palette?.length ?? 0,
          viewMode: record?.viewMode,
        });
        if (!alive) return;
        const loadedPattern = record?.patternResult ?? buildFallbackPattern();
        const loadedGridInfo = patternToGrid(loadedPattern);
        const loadedColor = record?.patternResult?.palette?.[0]?.hex ?? '#ffffff';
        const loadedConfig = record?.config ?? {
          canvasSize: loadedPattern.width,
          brand: 'MARD',
          style: '动漫',
          colorMergeThreshold: 30,
        };

        console.debug('[workshop-editor] pattern to grid', {
          patternSize: `${loadedPattern.width}x${loadedPattern.height}`,
          gridSize: `${loadedGridInfo.width}x${loadedGridInfo.height}`,
          firstRowLength: loadedGridInfo.grid[0]?.length ?? 0,
          firstCell: loadedGridInfo.grid[0]?.[0] ?? null,
          loadedColor,
          sampleRow: loadedGridInfo.grid[0]?.slice(0, 10) ?? [],
        });

        setProjectData({
          title: record?.uploadedImage?.name ?? '未命名图纸',
          imageUrl: record?.uploadedImage?.dataUrl ?? null,
          pattern: loadedPattern,
          activeColor: loadedColor,
          config: loadedConfig,
        });
        setPatternName(record?.uploadedImage?.name ?? '未命名图纸');
        setGrid(loadedGridInfo.grid);
        setSelectedColor(loadedColor);
        setRows(loadedGridInfo.height);
        setCols(loadedGridInfo.width);
        setBgColor('#ffffff');
        setShowGrid(true);
        setGridReady(true);
        setIsHydrated(true);
        setHistory([{ cells: copyGrid(loadedGridInfo.grid), activeColor: loadedColor, config: loadedConfig }]);
        setHistoryIndex(0);
      })
      .catch((error) => {
        console.debug('[workshop-editor] load failed, use fallback', error);
        if (!alive) return;
        const fallback = buildFallbackPattern();
        const loadedGridInfo = patternToGrid(fallback);
        console.debug('[workshop-editor] fallback pattern', {
          patternSize: `${fallback.width}x${fallback.height}`,
          gridSize: `${loadedGridInfo.width}x${loadedGridInfo.height}`,
          firstCell: loadedGridInfo.grid[0]?.[0] ?? null,
        });
        setProjectData({
          title: '未命名图纸',
          imageUrl: null,
          pattern: fallback,
          activeColor: '#ffffff',
          config: { canvasSize: fallback.width, brand: 'MARD', style: '动漫', colorMergeThreshold: 30 },
        });
        setPatternName('未命名图纸');
        setGrid(loadedGridInfo.grid);
        setSelectedColor('#ffffff');
        setRows(loadedGridInfo.height);
        setCols(loadedGridInfo.width);
        setBgColor('#ffffff');
        setShowGrid(true);
        setGridReady(true);
        setIsHydrated(true);
        setHistory([{ cells: copyGrid(loadedGridInfo.grid), activeColor: '#ffffff', config: { canvasSize: fallback.width, brand: 'MARD', style: '动漫', colorMergeThreshold: 30 } }]);
        setHistoryIndex(0);
      });

    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !isHydrated || !projectData || !gridReady) return;
    void saveWorkshopProject(projectId, {
      uploadedImage: projectData.imageUrl
        ? {
            name: projectData.title,
            type: 'image/png',
            size: 0,
            dataUrl: projectData.imageUrl,
          }
        : undefined,
      config: projectData.config,
      patternResult: grid.length ? rebuildPatternFromGrid(projectData.pattern, grid) : projectData.pattern,
      viewMode: 'pattern',
    });
  }, [grid, isHydrated, projectData, projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const bubbleCanvas = bubbleCanvasRef.current;
    if (!canvas || !previewCanvas || !grid.length) {
      console.debug('[workshop-editor] draw skipped', {
        hasCanvas: Boolean(canvas),
        hasPreviewCanvas: Boolean(previewCanvas),
        hasBubbleCanvas: Boolean(bubbleCanvas),
        gridLength: grid.length,
      });
      return;
    }

    const ctx = canvas.getContext('2d');
    const pCtx = previewCanvas.getContext('2d');
    const bCtx = bubbleCanvas?.getContext('2d');
    if (!ctx || !pCtx) {
      console.debug('[workshop-editor] context missing', { hasCtx: Boolean(ctx), hasPCtx: Boolean(pCtx), hasBCtx: Boolean(bCtx) });
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const availableWidth = Math.max(240, rect?.width ?? window.innerWidth);
    const availableHeight = Math.max(240, (rect?.height ?? window.innerHeight) - 24);
    const cellSize = Math.max(1, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
    const width = cols * cellSize;
    const height = rows * cellSize;
    console.debug('[workshop-editor] draw canvas', {
      availableWidth,
      availableHeight,
      cols,
      rows,
      cellSize,
      width,
      height,
      bgColor,
      showGrid,
      sampleRow: grid[0]?.slice(0, 5) ?? [],
    });
    setCanvasMetrics({ cellSize, width, height, renderWidth: cols, renderHeight: rows });

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.zIndex = '2';
    canvas.style.position = 'relative';
    canvas.style.display = 'block';

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    grid.forEach((row, r) => {
      row.forEach((hex, c) => {
        if (!hex) return;
        ctx.fillStyle = hex;
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      });
    });
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(140,130,120,0.28)';
      ctx.lineWidth = 0.5;
      for (let c = 0; c <= cols; c += 1) {
        ctx.beginPath();
        ctx.moveTo(c * cellSize + 0.25, 0);
        ctx.lineTo(c * cellSize + 0.25, height);
        ctx.stroke();
      }
      for (let r = 0; r <= rows; r += 1) {
        ctx.beginPath();
        ctx.moveTo(0, r * cellSize + 0.25);
        ctx.lineTo(width, r * cellSize + 0.25);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(93,83,74,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.restore();

    previewCanvas.width = cols;
    previewCanvas.height = rows;
    previewCanvas.style.width = '100%';
    previewCanvas.style.height = '100%';
    pCtx.fillStyle = bgColor;
    pCtx.fillRect(0, 0, cols, rows);
    grid.forEach((row, r) => row.forEach((hex, c) => {
      if (!hex) return;
      pCtx.fillStyle = hex;
      pCtx.fillRect(c, r, 1, 1);
    }));

    if (bubbleCanvas && bCtx) {
      bubbleCanvas.width = 32;
      bubbleCanvas.height = 32;
      bCtx.fillStyle = bgColor;
      bCtx.fillRect(0, 0, 32, 32);
      const sx = 32 / cols;
      const sy = 32 / rows;
      grid.forEach((row, r) => row.forEach((hex, c) => {
        if (!hex) return;
        bCtx.fillStyle = hex;
        bCtx.fillRect(Math.floor(c * sx), Math.floor(r * sy), Math.max(1, Math.ceil(sx)), Math.max(1, Math.ceil(sy)));
      }));
    }
  }, [bgColor, cols, grid, rows, showGrid]);

  const commitGrid = (nextGrid: string[][], nextColor = selectedColor) => {
    setGrid(nextGrid);
    setSelectedColor(nextColor);
    saveSnapshot(nextGrid, nextColor);
  };

  const handleCellEdit = (row: number, col: number, nextTool = tool) => {
    if (!inBounds(grid, row, col)) return;
    const current = grid[row][col] ?? '';
    if (nextTool === 'picker') {
      if (current) setSelectedColor(current);
      setTool('brush');
      return;
    }
    if (nextTool === 'pan') return;

    let nextGrid = copyGrid(grid);
    if (nextTool === 'eraser') {
      nextGrid[row][col] = '';
    } else if (nextTool === 'fill') {
      nextGrid = floodFill(nextGrid, row, col, selectedColor);
    } else {
      nextGrid[row][col] = selectedColor;
    }
    commitGrid(nextGrid, nextTool === 'picker' ? current || selectedColor : selectedColor);
  };

  const cellFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.floor((x - offset.x) / (canvasMetrics.cellSize * scale));
    const row = Math.floor((y - offset.y) / (canvasMetrics.cellSize * scale));
    if (!inBounds(grid, row, col)) return null;
    return { row, col };
  };

  const persistNow = async () => {
    if (!projectId || !projectData) return;
    const nextPattern = grid.length ? rebuildPatternFromGrid(projectData.pattern, grid) : projectData.pattern;
    console.debug('[workshop-editor] persist', {
      projectId,
      patternSize: `${nextPattern.width}x${nextPattern.height}`,
      cellCount: nextPattern.cells.length,
      paletteCount: nextPattern.palette.length,
    });
    await saveWorkshopProject(projectId, {
      config: projectData.config,
      patternResult: nextPattern,
      viewMode: 'pattern',
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;
    if (!grid.length) return;

    const previewPanel = previewPanelRef.current;
    const toolbar = toolbarRef.current;
    const isOnResizeHandle = Boolean(target.closest('[data-resize-handle]'));
    const isOnPreview = Boolean(previewPanel?.contains(target));
    const isOnToolbar = Boolean(toolbar?.contains(target));

    if (isOnPreview) {
      dragStateRef.current = {
        kind: isOnResizeHandle ? 'preview-resize' : 'preview-move',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffsetX: 0,
        originOffsetY: 0,
        originScale: 1,
        originWidth: preview.width,
        originHeight: preview.height,
        originLeft: preview.x,
        originTop: preview.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (isOnToolbar) {
      dragStateRef.current = {
        kind: 'toolbar',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffsetX: 0,
        originOffsetY: 0,
        originScale: 1,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const point = cellFromPointer(event.clientX, event.clientY);
    if (!point) return;

    if (tool === 'pan') {
      dragStateRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffsetX: offset.x,
        originOffsetY: offset.y,
        originScale: scale,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    dragStateRef.current = {
      kind: 'draw',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastCell: point,
      originOffsetX: 0,
      originOffsetY: 0,
      originScale: 1,
    };
    handleCellEdit(point.row, point.col, tool);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.kind === 'draw') {
      const point = cellFromPointer(event.clientX, event.clientY);
      if (!point) return;
      const key = `${point.row},${point.col}`;
      const lastKey = drag.lastCell ? `${drag.lastCell.row},${drag.lastCell.col}` : '';
      if (key !== lastKey) {
        drag.lastCell = point;
        handleCellEdit(point.row, point.col, tool);
      }
      return;
    }

    if (drag.kind === 'pan') {
      setOffset({
        x: drag.originOffsetX + (event.clientX - drag.startX),
        y: drag.originOffsetY + (event.clientY - drag.startY),
      });
      return;
    }

    if (drag.kind === 'preview-move') {
      setPreview((current) => ({
        ...current,
        x: Math.max(-120, Math.min(window.innerWidth - 80, (drag.originLeft ?? current.x) + (event.clientX - drag.startX))),
        y: Math.max(TITLEBAR_H, Math.min(window.innerHeight - 80, (drag.originTop ?? current.y) + (event.clientY - drag.startY))),
      }));
      return;
    }

    if (drag.kind === 'preview-resize') {
      setPreview((current) => ({
        ...current,
        width: Math.max(280, (drag.originWidth ?? current.width) + (event.clientX - drag.startX)),
        height: Math.max(220, (drag.originHeight ?? current.height) + (event.clientY - drag.startY)),
      }));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const snapshot = history[historyIndex - 1];
    setGrid(copyGrid(snapshot.cells));
    setSelectedColor(snapshot.activeColor);
    setHistoryIndex((current) => current - 1);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const snapshot = history[historyIndex + 1];
    setGrid(copyGrid(snapshot.cells));
    setSelectedColor(snapshot.activeColor);
    setHistoryIndex((current) => current + 1);
  };

  const exportPattern = () => {
    if (!grid.length) return;
    const exportCanvas = document.createElement('canvas');
    const cellSize = 16;
    exportCanvas.width = cols * cellSize;
    exportCanvas.height = rows * cellSize;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    grid.forEach((row, r) => row.forEach((hex, c) => {
      if (!hex) return;
      ctx.fillStyle = hex;
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }));
    const link = document.createElement('a');
    link.download = `pindoudou_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setScale(1);
  };

  const handlePreviewToggle = () => setPreview((current) => ({ ...current, open: !current.open }));

  const currentPattern = useMemo(() => (grid.length ? rebuildPatternFromGrid(pattern, grid) : pattern), [grid, pattern]);

  return (
    <main className="workshop-editor" aria-label="图纸手动编辑页">
      <header className="workshop-editor__titlebar">
        <div className="workshop-editor__titlebar-left">
          <button type="button" className="workshop-editor__top-btn workshop-editor__top-btn--icon" onClick={() => navigate(`/workshop/result/${projectId ?? ''}`)} aria-label="返回">
            ←
          </button>
          <div className="workshop-editor__titlebar-text">
            <h1>{projectData?.title ?? '图纸编辑'}</h1>
          </div>
        </div>
        <div className="workshop-editor__titlebar-actions">
          <button type="button" className="workshop-editor__top-btn workshop-editor__top-btn--icon" onClick={undo} disabled={historyIndex <= 0} aria-label="撤销">↶</button>
          <button type="button" className="workshop-editor__top-btn workshop-editor__top-btn--icon" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="重做">↷</button>
          <button type="button" className="workshop-editor__top-btn workshop-editor__top-btn--icon" onClick={() => setGrid(Array.from({ length: rows }, () => Array(cols).fill('')))} aria-label="清空">⌫</button>
          <button type="button" className="workshop-editor__top-btn workshop-editor__top-btn--icon workshop-editor__top-btn--primary" onClick={exportPattern} aria-label="导出">⭳</button>
        </div>
      </header>

      <div className="workshop-editor__layout" ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <div className="workshop-editor__canvas-stage">
          {projectData?.imageUrl ? <img className="workshop-editor__source-image" src={projectData.imageUrl} alt="来源图" /> : null}
          <canvas ref={canvasRef} className="workshop-editor__canvas" />
          <div className="workshop-editor__zoom-bar">
            <button type="button" className="workshop-editor__mini-btn" onClick={() => setScale((current) => Math.max(0.2, +(current - 0.1).toFixed(2)))}>−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" className="workshop-editor__mini-btn" onClick={() => setScale((current) => Math.min(12, +(current + 0.1).toFixed(2)))}>+</button>
            <button type="button" className="workshop-editor__mini-btn" onClick={resetView}>↺</button>
          </div>
        </div>

        <div className={`workshop-editor__preview-panel ${preview.open ? '' : 'is-collapsed'}`} ref={previewPanelRef} style={{ width: preview.width, height: preview.height, left: preview.x, top: preview.y }}>
          <div className="workshop-editor__preview-header">
            <button type="button" className="workshop-editor__preview-close" onClick={handlePreviewToggle}>{preview.open ? '–' : '+'}</button>
          </div>
          <div className="workshop-editor__preview-body">
            <canvas ref={previewCanvasRef} className="workshop-editor__preview-canvas" />
          </div>
          <button type="button" className="workshop-editor__preview-resize" data-resize-handle aria-label="调整预览大小" />
        </div>

        {!preview.open ? (
          <button type="button" className="workshop-editor__bubble" onClick={handlePreviewToggle} aria-label="展开预览">
            <canvas ref={bubbleCanvasRef} className="workshop-editor__bubble-canvas" />
          </button>
        ) : null}

        <section className="workshop-editor__toolbar" ref={toolbarRef} aria-label="工具栏">
          <div className="workshop-editor__toolbar-drag" aria-hidden="true" />
          <div className="workshop-editor__toolbar-row workshop-editor__toolbar-row--tools">
            {TOOL_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`workshop-editor__tool-btn ${tool === item.id ? 'is-active' : ''}`}
                onClick={() => setTool(item.id)}
                title={item.label}
              >
                <span>{item.icon}</span>
              </button>
            ))}
          </div>
          <div className="workshop-editor__toolbar-row workshop-editor__toolbar-row--content">
            <div className="workshop-editor__toolbar-group">
              <span className="workshop-editor__label">当前颜色</span>
              <button type="button" className="workshop-editor__color-chip" style={{ backgroundColor: selectedColor }} onClick={() => setShowPalette(true)} />
            </div>
            <div className="workshop-editor__toolbar-group">
              <span className="workshop-editor__label">最近使用</span>
              <div className="workshop-editor__recent-row">
                {[selectedColor, ...currentPattern.palette.map((item) => item.hex)]
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((hex, index) => (
                    <button
                      key={`${hex}-${index}`}
                      type="button"
                      className="workshop-editor__recent-dot"
                      style={{ backgroundColor: hex }}
                      onClick={() => setSelectedColor(hex)}
                    />
                  ))}
              </div>
            </div>
            <div className="workshop-editor__toolbar-group workshop-editor__toolbar-group--flex">
              <span className="workshop-editor__label">网格</span>
              <button type="button" className={`workshop-editor__switch ${showGrid ? 'is-on' : ''}`} onClick={() => setShowGrid((current) => !current)} />
            </div>
          </div>
        </section>
      </div>

      {showPalette ? (
        <div className="workshop-editor__modal-backdrop" role="presentation" onClick={() => setShowPalette(false)}>
          <section className="workshop-editor__modal" role="dialog" aria-modal="true" aria-label="调色板" onClick={(event) => event.stopPropagation()}>
            <header className="workshop-editor__modal-header">
              <h3>调色板</h3>
              <button type="button" className="workshop-editor__modal-close" onClick={() => setShowPalette(false)}>×</button>
            </header>
            <div className="workshop-editor__palette-grid">
              {QUICK_COLORS.map((hex) => (
                <button key={hex} type="button" className={`workshop-editor__palette-swatch ${selectedColor === hex ? 'is-active' : ''}`} style={{ backgroundColor: hex }} onClick={() => { setSelectedColor(hex); setShowPalette(false); }} />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {showSettings ? (
        <div className="workshop-editor__modal-backdrop" role="presentation" onClick={() => setShowSettings(false)}>
          <section className="workshop-editor__modal workshop-editor__modal--settings" role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => event.stopPropagation()}>
            <header className="workshop-editor__modal-header">
              <h3>设置</h3>
              <button type="button" className="workshop-editor__modal-close" onClick={() => setShowSettings(false)}>×</button>
            </header>
            <label className="workshop-editor__field">
              <span>画布列数</span>
              <input type="number" min={8} max={128} value={cols} onChange={(event) => setCols(Number(event.target.value) || 24)} />
            </label>
            <label className="workshop-editor__field">
              <span>画布行数</span>
              <input type="number" min={8} max={128} value={rows} onChange={(event) => setRows(Number(event.target.value) || 24)} />
            </label>
            <label className="workshop-editor__field">
              <span>背景色</span>
              <input type="color" value={bgColor} onChange={(event) => setBgColor(event.target.value)} />
            </label>
            <label className="workshop-editor__field">
              <span>图纸名称</span>
              <input value={patternName} onChange={(event) => setPatternName(event.target.value)} />
            </label>
            <div className="workshop-editor__modal-actions">
              <button type="button" onClick={() => setShowSettings(false)}>取消</button>
              <button type="button" onClick={() => { setShowSettings(false); setGrid(Array.from({ length: rows }, () => Array(cols).fill(''))); }}>应用并清空</button>
            </div>
          </section>
        </div>
      ) : null}

      <style>{`
        .workshop-editor { min-height: 100vh; background: var(--bg, #fdfbf7); overflow: hidden; color: #5d534a; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .workshop-editor__titlebar { position: fixed; top: 0; left: 0; right: 0; height: ${TITLEBAR_H}px; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; background: linear-gradient(135deg, #f0e6f8 0%, #eaf4f0 50%, #fef3ec 100%); border-bottom: 1px solid #e8d5f0; box-sizing: border-box; overflow: hidden; }
        .workshop-editor__titlebar-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; overflow: hidden; }
        .workshop-editor__titlebar-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .workshop-editor__titlebar-text h1 { font-size: 16px; line-height: 1.1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .workshop-editor__titlebar-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; flex-wrap: nowrap; justify-content: flex-end; min-width: 0; }
        .workshop-editor__top-btn { height: 28px; min-width: 28px; padding: 0 8px; border-radius: 10px; border: 1px solid rgba(216,180,226,.35); background: rgba(255,255,255,.78); color: #5d534a; font-size: 12px; font-weight: 700; cursor: pointer; flex: 0 0 auto; white-space: nowrap; }
        .workshop-editor__top-btn:disabled { opacity: .4; cursor: not-allowed; }
        .workshop-editor__top-btn--icon { width: 28px; padding: 0; display: grid; place-items: center; }
        .workshop-editor__top-btn--primary { background: #d8b4e2; color: #fff; }
        .workshop-editor__layout { position: fixed; inset: ${TITLEBAR_H}px 0 0 0; overflow: hidden; background: repeating-conic-gradient(#e8e4de 0% 25%, #fdfbf7 0% 50%) 0 0 / 18px 18px; touch-action: none; }
        .workshop-editor__canvas-stage { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; justify-content: center; }
        .workshop-editor__canvas { image-rendering: pixelated; box-shadow: 0 6px 40px rgba(93,83,74,.16); transform-origin: 0 0; z-index: 2; pointer-events: auto; background: transparent; }
        .workshop-editor__source-image { position: absolute; inset: 24px; width: calc(100% - 48px); height: calc(100% - 48px); object-fit: contain; opacity: .12; pointer-events: none; z-index: 1; }
        .workshop-editor__coords { position: absolute; left: 14px; top: 14px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.8); font-size: 12px; font-weight: 700; }
        .workshop-editor__zoom-bar { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 16px; background: rgba(255,255,255,.86); box-shadow: 0 8px 18px rgba(93,83,74,.08); }
        .workshop-editor__mini-btn { width: 30px; height: 30px; border: 0; border-radius: 10px; background: rgba(216,180,226,.18); font-weight: 800; cursor: pointer; }
        .workshop-editor__preview-panel { position: absolute; top: 70px; right: 14px; background: #fff; border: 1px solid rgba(216,180,226,.35); border-radius: 20px; box-shadow: 0 8px 28px rgba(93,83,74,.14); overflow: hidden; display: grid; grid-template-rows: auto 1fr; touch-action: none; user-select: none; }
        .workshop-editor__preview-panel.is-collapsed { opacity: 0; pointer-events: none; transform: scale(.85); }
        .workshop-editor__preview-header { height: 18px; display: flex; align-items: center; justify-content: flex-end; padding: 6px 8px 0; background: linear-gradient(180deg, rgba(247,241,237,.92), #fff); cursor: move; }
        .workshop-editor__preview-close { width: 18px; height: 18px; border: 0; border-radius: 999px; background: rgba(93,83,74,.08); cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
        .workshop-editor__preview-body { padding: 10px; background: #f4efe9; display: grid; place-items: center; }
        .workshop-editor__preview-canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; border-radius: 14px; background: #fff; }
        .workshop-editor__preview-resize { position: absolute; right: 4px; bottom: 4px; width: 18px; height: 18px; border: 0; padding: 0; cursor: nwse-resize; background: linear-gradient(135deg, transparent 0 40%, rgba(93,83,74,.32) 40% 50%, transparent 50% 65%, rgba(93,83,74,.32) 65% 75%, transparent 75% 100%); border-bottom-right-radius: 16px; }
        .workshop-editor__bubble { position: absolute; top: 70px; right: 14px; width: 52px; height: 52px; border: 2px solid rgba(255,255,255,.6); border-radius: 16px; background: linear-gradient(145deg, #e8ccf5 0%, #d0a8e8 50%, #b880d4 100%); box-shadow: 0 4px 18px rgba(168,126,192,.45); display: grid; place-items: center; cursor: pointer; }
        .workshop-editor__bubble-canvas { width: 32px; height: 32px; border-radius: 8px; }
        .workshop-editor__toolbar { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 20; display: grid; gap: 0; touch-action: none; width: min(100vw - 24px, 760px); filter: drop-shadow(0 6px 28px rgba(93,83,74,.16)); }
        .workshop-editor__toolbar-drag { height: 10px; background: #fff; border: 1px solid rgba(216,180,226,.35); border-bottom: none; border-radius: 18px 18px 0 0; cursor: move; }
        .workshop-editor__toolbar-row { background: #fff; border: 1px solid rgba(216,180,226,.35); padding: 10px 12px; }
        .workshop-editor__toolbar-row--tools { display: flex; gap: 8px; overflow-x: auto; border-bottom: none; }
        .workshop-editor__toolbar-row--content { display: flex; align-items: center; gap: 12px; border-radius: 0 0 18px 18px; background: linear-gradient(135deg,#faf7fd,#f8f5ff); overflow-x: auto; }
        .workshop-editor__tool-btn { width: 40px; height: 40px; border: 2px solid transparent; border-radius: 14px; background: rgba(216,180,226,.08); cursor: pointer; flex: 0 0 auto; }
        .workshop-editor__tool-btn.is-active { background: #d8b4e2; color: #fff; border-color: #b894cc; }
        .workshop-editor__toolbar-group { display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; }
        .workshop-editor__toolbar-group--flex { flex-direction: row; align-items: center; }
        .workshop-editor__label { font-size: 10px; font-weight: 800; letter-spacing: .08em; color: rgba(93,83,74,.58); text-transform: uppercase; }
        .workshop-editor__color-chip { width: 36px; height: 36px; border: 2px solid #d8b4e2; border-radius: 12px; cursor: pointer; }
        .workshop-editor__recent-row { display: flex; gap: 6px; overflow-x: auto; }
        .workshop-editor__recent-dot { width: 24px; height: 24px; border: 2px solid rgba(93,83,74,.08); border-radius: 8px; cursor: pointer; }
        .workshop-editor__switch { width: 42px; height: 24px; border: 0; border-radius: 999px; background: rgba(93,83,74,.18); position: relative; cursor: pointer; }
        .workshop-editor__switch::after { content: ''; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
        .workshop-editor__switch.is-on { background: #d8b4e2; }
        .workshop-editor__switch.is-on::after { transform: translateX(18px); }
        .workshop-editor__modal-backdrop { position: fixed; inset: 0; background: rgba(93,83,74,.22); backdrop-filter: blur(6px); z-index: 100; display: grid; place-items: center; padding: 16px; }
        .workshop-editor__modal { width: min(380px, 100%); background: #fff; border-radius: 24px; border: 1px solid rgba(216,180,226,.35); box-shadow: 0 16px 48px rgba(93,83,74,.16); padding: 16px; display: grid; gap: 12px; }
        .workshop-editor__modal--settings { width: min(340px, 100%); }
        .workshop-editor__modal-header { display: flex; justify-content: space-between; align-items: center; }
        .workshop-editor__modal-header h3 { margin: 0; }
        .workshop-editor__modal-close { width: 32px; height: 32px; border: 0; border-radius: 10px; background: rgba(93,83,74,.08); cursor: pointer; }
        .workshop-editor__palette-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
        .workshop-editor__palette-swatch { aspect-ratio: 1; border: 0; border-radius: 14px; box-shadow: inset 0 0 0 1px rgba(93,83,74,.08); }
        .workshop-editor__palette-swatch.is-active { box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px #b894cc; }
        .workshop-editor__field { display: grid; gap: 6px; }
        .workshop-editor__field span { font-size: 11px; font-weight: 800; color: rgba(93,83,74,.58); text-transform: uppercase; }
        .workshop-editor__field input { height: 40px; border: 1px solid rgba(216,180,226,.45); border-radius: 12px; padding: 0 12px; }
        .workshop-editor__modal-actions { display: flex; gap: 10px; }
        .workshop-editor__modal-actions button { flex: 1; height: 40px; border: 0; border-radius: 12px; background: rgba(216,180,226,.16); cursor: pointer; font-weight: 700; }
        @media (max-width: 520px) { .workshop-editor__toolbar-row--content { flex-wrap: wrap; } .workshop-editor__palette-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
      `}</style>
    </main>
  );
}
