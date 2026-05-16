import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { saveWorkshopProject } from '../../../features/workshop/model/projectStore';
import type { PatternResult, WorkshopBeadingProgress } from '../../../features/workshop/model/types';
import { useWorkshopFlow } from '../../../features/workshop/model/useWorkshopFlow';
import {
  buildBeadingPlan,
  buildPalette,
  getCellCoordKey,
  getCellKey,
  type BeadingBlock,
  type BeadingPaletteItem,
  type PatternMode,
  type BeadingConnectivity,
  type BeadingAxis,
} from '../../../lib/pattern/beadingPlan';
import { FocusRulers } from './FocusRulers';
import { FocusSettingsSheet } from './FocusSettingsSheet';
import { FocusToolbar } from './FocusToolbar';
import { FocusTopbar } from './FocusTopbar';
import {
  buildRulerData,
  clamp,
  drawFocusCanvas,
  getCanvasClipArea,
  getDisplayColumn,
  getFitViewport,
  normalizeCells,
  screenToCell,
  type FocusBoardCell,
  type FocusViewport,
} from './focusCanvas';
import styles from './FocusModePage.module.css';

type PointerPoint = {
  x: number;
  y: number;
};

type DragStart = PointerPoint & {
  tx: number;
  ty: number;
};

type PinchStart = {
  distance: number;
  cellPx: number;
  tx: number;
  ty: number;
  mid: PointerPoint;
};

type TapStart = PointerPoint & {
  id: number;
  moved: boolean;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

const PATTERN_MODES: PatternMode[] = ['smart', 'color-block', 'edge-first', 'region-first', 'row-by-row'];
const CONNECTIVITY_OPTIONS: BeadingConnectivity[] = ['4', '8', 'smart'];

function isPatternMode(value: string): value is PatternMode {
  return PATTERN_MODES.includes(value as PatternMode);
}

function isConnectivity(value: unknown): value is BeadingConnectivity {
  return typeof value === 'string' && CONNECTIVITY_OPTIONS.includes(value as BeadingConnectivity);
}

function isUsablePattern(pattern: PatternResult | null): pattern is PatternResult {
  return Boolean(pattern && pattern.cells.length > 0);
}

function getProjectTitle(name: string | undefined | null) {
  return name?.replace(/\.[^.]+$/, '') || '未命名作品';
}

function getColorKey(item: BeadingPaletteItem) {
  return `${item.colorId}-${item.vendorCode}-${item.hex}`;
}

function getFirstCellForColor(cells: FocusBoardCell[], colorKey: string, handedness: 'left' | 'right') {
  const matches = cells.filter((cell) => cell.colorKey === colorKey);
  matches.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return handedness === 'left' ? b.x - a.x : a.x - b.x;
  });
  return matches[0] ?? null;
}

function getValidCellKeys(pattern: PatternResult | null) {
  const keys = new Set<string>();
  if (!pattern) return keys;
  for (const cell of pattern.cells) {
    if (cell.isExternal || !cell.vendorCode || !cell.hex || cell.hex === 'transparent') continue;
    keys.add(getCellCoordKey(cell));
  }
  return keys;
}

export function FocusModePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const patternResult = state.patternResult;
  const hasPattern = isUsablePattern(patternResult);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sideRulerRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const dragStartRef = useRef<DragStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const tapStartRef = useRef<TapStart | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const restoredProjectRef = useRef<string | null>(null);
  const skipNextProgressSaveRef = useRef(false);

  const [boardSize, setBoardSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [viewport, setViewport] = useState<FocusViewport | null>(null);
  const [handedness, setHandedness] = useState<'left' | 'right'>('right');
  const [showRuler, setShowRuler] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [locked, setLocked] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [patternMode, setPatternMode] = useState<PatternMode>('smart');
  const [connectivity, setConnectivity] = useState<BeadingConnectivity>('smart');
  const [rowAxis, setRowAxis] = useState<BeadingAxis>('row');
  const [activeColorKey, setActiveColorKey] = useState<string | null>(null);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [completedCellKeys, setCompletedCellKeys] = useState<string[]>([]);

  const cells = useMemo(() => (patternResult ? normalizeCells(patternResult) : []), [patternResult]);
  const cellByCoordKey = useMemo(() => new Map(cells.map((cell) => [cell.coordKey, cell])), [cells]);
  const palette = useMemo(() => (patternResult ? buildPalette(patternResult) : []), [patternResult]);
  const validCellKeys = useMemo(() => getValidCellKeys(patternResult), [patternResult]);

  const normalizedCompletedCellKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const key of completedCellKeys) {
      if (validCellKeys.has(key)) keys.add(key);
    }
    return Array.from(keys);
  }, [completedCellKeys, validCellKeys]);

  const completedCellKeySet = useMemo(() => new Set(normalizedCompletedCellKeys), [normalizedCompletedCellKeys]);
  const totalPatternCells = validCellKeys.size;
  const progressPercent = totalPatternCells > 0 ? Math.min(100, Math.round((normalizedCompletedCellKeys.length / totalPatternCells) * 100)) : 0;

  const beadingPlan = useMemo(() => {
    if (!patternResult) return null;
    return buildBeadingPlan(patternResult, {
      mode: patternMode,
      handedness,
      connectivity,
      axis: rowAxis,
      regionSize: 10,
    });
  }, [connectivity, handedness, patternMode, patternResult, rowAxis]);

  const planBlocks = beadingPlan?.blocks ?? [];
  const currentBlockIndex = useMemo(() => {
    if (!activeCellKey) return -1;
    return planBlocks.findIndex((block) => block.cells.some((cell) => getCellCoordKey(cell) === activeCellKey));
  }, [activeCellKey, planBlocks]);
  const currentBlock = currentBlockIndex >= 0 ? planBlocks[currentBlockIndex] ?? null : null;

  const effectiveActiveColorKey = currentBlock?.colorKey ?? activeColorKey;
  const currentColor = useMemo(
    () => palette.find((item) => getColorKey(item) === effectiveActiveColorKey) ?? null,
    [effectiveActiveColorKey, palette],
  );

  const computedCompletedColorKeys = useMemo(() => {
    if (!patternResult) return [];
    const completed = new Set(normalizedCompletedCellKeys);
    return palette
      .map(getColorKey)
      .filter((colorKey) => {
        const colorCells = cells.filter((cell) => cell.colorKey === colorKey && validCellKeys.has(cell.coordKey));
        return colorCells.length > 0 && colorCells.every((cell) => completed.has(cell.coordKey));
      });
  }, [cells, normalizedCompletedCellKeys, palette, patternResult, validCellKeys]);

  const currentCell = activeCellKey ? cellByCoordKey.get(activeCellKey) ?? null : null;
  const currentPosition = currentCell && patternResult
    ? `R${currentCell.y + 1} · C${getDisplayColumn(patternResult, handedness, currentCell.x)}`
    : '等待定位';
  const projectTitle = getProjectTitle(state.uploadedImage?.name);
  const projectMeta = patternResult ? `${patternResult.width}×${patternResult.height} · ${progressPercent}%` : '等待图纸';

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? '' : current));
    }, 1400);
  }, []);

  const centerCell = useCallback((cell: FocusBoardCell | null, targetCellPx?: number) => {
    if (!cell || !patternResult || boardSize.width <= 0 || boardSize.height <= 0) return;
    const clip = getCanvasClipArea(boardSize.height);
    setViewport((current) => {
      const base = current ?? getFitViewport(patternResult, boardSize.width, boardSize.height);
      const cellPx = clamp(targetCellPx ?? Math.max(base.cellPx, 22), base.minCellPx, base.maxCellPx);
      return {
        ...base,
        cellPx,
        tx: boardSize.width / 2 - (cell.x + 0.5) * cellPx,
        ty: (clip.top + clip.bottom) / 2 - (cell.y + 0.5) * cellPx,
      };
    });
  }, [boardSize.height, boardSize.width, patternResult]);

  useEffect(() => {
    if (!patternResult) {
      setViewport(null);
      return;
    }

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      setBoardSize({ width, height, dpr });
      setViewport(getFitViewport(patternResult, width, height));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [patternResult]);

  useEffect(() => {
    restoredProjectRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (!patternResult || palette.length === 0) {
      setActiveColorKey(null);
      setActiveCellKey(null);
      setCompletedCellKeys([]);
      return;
    }

    const validColorKeys = new Set(palette.map(getColorKey));
    setCompletedCellKeys((current) => current.filter((key) => validCellKeys.has(key)));
    setActiveColorKey((current) => (current && validColorKeys.has(current) ? current : getColorKey(palette[0])));
    setActiveCellKey((current) => {
      if (current && validCellKeys.has(current)) return current;
      const colorKey = getColorKey(palette[0]);
      return getFirstCellForColor(cells, colorKey, handedness)?.coordKey ?? null;
    });
  }, [cells, handedness, palette, patternResult, validCellKeys]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult || restoredProjectRef.current === projectId) return;

    restoredProjectRef.current = projectId;
    const progress = state.beadingProgress;
    if (!progress) return;

    skipNextProgressSaveRef.current = true;
    const validColorKeys = new Set(palette.map(getColorKey));
    setPatternMode(isPatternMode(progress.mode) ? progress.mode : 'smart');
    setConnectivity(isConnectivity(progress.connectivity) ? progress.connectivity : 'smart');
    setRowAxis(progress.axis === 'column' ? 'column' : 'row');
    setHandedness(progress.handedness === 'left' ? 'left' : 'right');
    const fallbackColorKey = palette[0] ? getColorKey(palette[0]) : null;
    const restoredColorKey = progress.activeColorKey && validColorKeys.has(progress.activeColorKey) ? progress.activeColorKey : fallbackColorKey;
    setActiveColorKey(restoredColorKey);
    setActiveCellKey(progress.activeCellKey && validCellKeys.has(progress.activeCellKey)
      ? progress.activeCellKey
      : restoredColorKey
        ? getFirstCellForColor(cells, restoredColorKey, progress.handedness === 'left' ? 'left' : 'right')?.coordKey ?? null
        : null);
    setCompletedCellKeys(progress.completedCellKeys.filter((key) => validCellKeys.has(key)));
  }, [isHydrating, palette, patternResult, projectId, state.beadingProgress, validCellKeys]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult || totalPatternCells === 0) return;
    if (skipNextProgressSaveRef.current) {
      skipNextProgressSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const completed = progressPercent >= 100;
      const progress: WorkshopBeadingProgress = {
        activeColorKey: effectiveActiveColorKey,
        activeCellKey,
        completedColorKeys: computedCompletedColorKeys,
        completedCellKeys: normalizedCompletedCellKeys,
        percent: progressPercent,
        mode: patternMode,
        handedness,
        connectivity,
        axis: rowAxis,
        updatedAt,
      };

      void saveWorkshopProject(projectId, {
        kind: 'progress',
        status: completed ? 'completed' : 'paused',
        beadingState: completed ? 'completed' : 'progressing',
        beadingProgress: progress,
        progress: {
          percent: progressPercent,
          step: patternMode,
          updatedAt,
        },
        lastOpenedAt: updatedAt,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    activeCellKey,
    computedCompletedColorKeys,
    connectivity,
    effectiveActiveColorKey,
    handedness,
    isHydrating,
    normalizedCompletedCellKeys,
    patternMode,
    patternResult,
    progressPercent,
    projectId,
    rowAxis,
    totalPatternCells,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !patternResult || !viewport || boardSize.width <= 0 || boardSize.height <= 0) return;
    canvas.width = Math.floor(boardSize.width * boardSize.dpr);
    canvas.height = Math.floor(boardSize.height * boardSize.dpr);
    canvas.style.width = `${boardSize.width}px`;
    canvas.style.height = `${boardSize.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(boardSize.dpr, 0, 0, boardSize.dpr, 0, 0);

    drawFocusCanvas({
      canvas,
      pattern: patternResult,
      cells,
      viewport,
      activeColorKey: effectiveActiveColorKey,
      currentCellKey: activeCellKey,
      completedCellKeys: completedCellKeySet,
      showGuide,
      width: boardSize.width,
      height: boardSize.height,
      clip: getCanvasClipArea(boardSize.height),
    });
  }, [activeCellKey, boardSize, cells, completedCellKeySet, effectiveActiveColorKey, patternResult, showGuide, viewport]);

  const rulerData = useMemo(() => {
    if (!patternResult || !viewport || boardSize.width <= 0) return { columns: [], rows: [] };
    const sideRect = sideRulerRef.current?.getBoundingClientRect();
    return buildRulerData({
      pattern: patternResult,
      viewport,
      width: boardSize.width,
      clip: getCanvasClipArea(boardSize.height),
      sideRulerTop: sideRect?.top ?? 98,
      sideRulerHeight: sideRect?.height ?? Math.max(80, boardSize.height - 202),
      currentCell,
      handedness,
    });
  }, [boardSize.height, boardSize.width, currentCell, handedness, patternResult, viewport]);

  const selectCell = useCallback((cell: FocusBoardCell, options: { center?: boolean } = {}) => {
    if (!cell.vendorCode || cell.isExternal || cell.hex === 'transparent') return;
    setActiveColorKey(cell.colorKey);
    setActiveCellKey(cell.coordKey);
    if (options.center) centerCell(cell);
  }, [centerCell]);

  const selectBlock = useCallback((block: BeadingBlock | null, options: { center?: boolean } = {}) => {
    if (!block) return;
    const firstCell = block.cells[0];
    if (!firstCell) return;
    const coordKey = getCellCoordKey(firstCell);
    setActiveColorKey(block.colorKey);
    setActiveCellKey(coordKey);
    if (options.center) centerCell(cellByCoordKey.get(coordKey) ?? null);
  }, [cellByCoordKey, centerCell]);

  const handleBoardTap = useCallback((clientX: number, clientY: number) => {
    if (!patternResult || !viewport) return;
    const clip = getCanvasClipArea(boardSize.height);
    if (clientY < clip.top || clientY > clip.bottom) return;
    const coord = screenToCell(viewport, clientX, clientY);
    if (coord.x < 0 || coord.x >= patternResult.width || coord.y < 0 || coord.y >= patternResult.height) return;
    const cell = cellByCoordKey.get(`${coord.x},${coord.y}`);
    if (!cell) return;
    selectCell(cell);
    showToast(`已切换到色号 ${cell.vendorCode}`);
  }, [boardSize.height, cellByCoordKey, patternResult, selectCell, showToast, viewport]);

  const zoomAt = useCallback((factor: number, clientX = boardSize.width / 2, clientY = boardSize.height / 2) => {
    setViewport((current) => {
      if (!current) return current;
      const nextCellPx = clamp(current.cellPx * factor, current.minCellPx, current.maxCellPx);
      if (Math.abs(nextCellPx - current.cellPx) < 0.001) return current;
      const ratio = nextCellPx / current.cellPx;
      return {
        ...current,
        cellPx: nextCellPx,
        tx: clientX - (clientX - current.tx) * ratio,
        ty: clientY - (clientY - current.ty) * ratio,
      };
    });
  }, [boardSize.height, boardSize.width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (locked || !viewport) return;

    if (pointersRef.current.size === 1) {
      tapStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      dragStartRef.current = { x: event.clientX, y: event.clientY, tx: viewport.tx, ty: viewport.ty };
      event.currentTarget.classList.add(styles.dragging);
      return;
    }

    if (pointersRef.current.size === 2) {
      tapStartRef.current = null;
      const points = Array.from(pointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartRef.current = {
        distance,
        cellPx: viewport.cellPx,
        tx: viewport.tx,
        ty: viewport.ty,
        mid: {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        },
      };
      dragStartRef.current = null;
      event.currentTarget.classList.remove(styles.dragging);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const tapStart = tapStartRef.current;
    if (tapStart && tapStart.id === event.pointerId && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 8) {
      tapStart.moved = true;
    }
    if (locked) return;

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      const start = dragStartRef.current;
      setViewport((current) => current ? { ...current, tx: start.tx + event.clientX - start.x, ty: start.ty + event.clientY - start.y } : current);
      return;
    }

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const points = Array.from(pointersRef.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const mid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      const start = pinchStartRef.current;
      const nextCellPx = clamp(start.cellPx * (distance / start.distance), viewport?.minCellPx ?? 0.7, viewport?.maxCellPx ?? 72);
      const ratio = nextCellPx / start.cellPx;
      setViewport((current) => current ? {
        ...current,
        cellPx: nextCellPx,
        tx: mid.x - (start.mid.x - start.tx) * ratio,
        ty: mid.y - (start.mid.y - start.ty) * ratio,
      } : current);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const wasSinglePointer = pointersRef.current.size === 1;
    const tapStart = tapStartRef.current;
    const tapCandidate = !locked && wasSinglePointer && tapStart?.id === event.pointerId && !tapStart.moved;
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      pinchStartRef.current = null;
      tapStartRef.current = null;
      event.currentTarget.classList.remove(styles.dragging);
    } else if (pointersRef.current.size === 1) {
      const point = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = viewport ? { ...point, tx: viewport.tx, ty: viewport.ty } : null;
      pinchStartRef.current = null;
    }

    if (tapCandidate) handleBoardTap(event.clientX, event.clientY);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (locked) return;
      zoomAt(event.deltaY < 0 ? 1.12 : 0.9, event.clientX, event.clientY);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [locked, zoomAt]);

  const goToBlock = (direction: 'previous' | 'next') => {
    if (planBlocks.length === 0) return;
    const currentIndex = currentBlockIndex >= 0 ? currentBlockIndex : 0;

    if (direction === 'next') {
      if (currentBlock) {
        setCompletedCellKeys((current) => Array.from(new Set([...current, ...currentBlock.cells.map(getCellCoordKey)])));
      }
      const nextBlock = planBlocks[currentIndex + 1] ?? null;
      if (nextBlock) {
        selectBlock(nextBlock, { center: true });
        showToast(`已切换到色号 ${nextBlock.label}`);
      } else {
        showToast('最后一块已完成');
      }
      return;
    }

    const previousBlock = planBlocks[Math.max(0, currentIndex - 1)] ?? null;
    if (previousBlock && previousBlock.key !== currentBlock?.key) {
      selectBlock(previousBlock, { center: true });
      showToast(`已回到色号 ${previousBlock.label}`);
    }
  };

  const toggleWakeLock = async () => {
    const wakeNavigator = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    };

    try {
      if (!wakeNavigator.wakeLock) {
        setWakeActive((current) => !current);
        showToast('当前浏览器不支持常亮 API，已仅标记状态');
        return;
      }

      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeActive(false);
        showToast('已关闭屏幕常亮');
        return;
      }

      wakeLockRef.current = await wakeNavigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeActive(false);
      });
      setWakeActive(true);
      showToast('已开启屏幕常亮');
    } catch {
      setWakeActive((current) => !current);
      showToast('无法调用系统常亮，已仅标记状态');
    }
  };

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, []);

  const returnTo =
    typeof location.state === 'object' &&
    location.state &&
    'returnTo' in location.state &&
    typeof location.state.returnTo === 'string'
      ? location.state.returnTo
      : null;

  const handleBack = () => {
    navigate(returnTo ?? `/workshop/result/${projectId ?? ''}`);
  };

  return (
    <main className={`${styles.page} ${locked ? styles.locked : ''}`} aria-label="拼豆专注模式">
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.boardCanvas}
          aria-label="拼豆图纸画布，支持拖动与双指缩放"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <FocusTopbar
        title={projectTitle}
        meta={projectMeta}
        locked={locked}
        showRuler={showRuler}
        wakeActive={wakeActive}
        isHydrating={isHydrating}
        onBack={handleBack}
        onToggleWake={toggleWakeLock}
        onToggleRuler={() => setShowRuler((current) => !current)}
        onToggleLock={() => {
          setLocked((current) => !current);
          showToast(locked ? '已关闭防误触' : '已开启防误触');
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <FocusRulers data={rulerData} handedness={handedness} visible={showRuler && hasPattern} sideRulerRef={sideRulerRef} />

      {!hasPattern ? (
        <section className={styles.emptyState} aria-live="polite">
          <p>{isHydrating ? '正在加载' : '暂无图纸'}</p>
          <h1>{isHydrating ? '正在载入图纸数据' : '还没有可拼的图纸'}</h1>
          <span>{isHydrating ? '项目数据读取完成后会自动进入拼豆画布。' : '请先在工坊生成图纸，再进入专注模式。'}</span>
        </section>
      ) : null}

      <FocusToolbar
        currentColor={currentColor}
        currentBlockCount={currentBlock?.cells.length ?? 0}
        currentPosition={currentPosition}
        onPrevious={() => goToBlock('previous')}
        onNext={() => goToBlock('next')}
        onCenter={() => {
          centerCell(currentCell, 22);
          if (currentColor) showToast(`当前聚焦 ${currentColor.vendorCode}`);
        }}
        previousDisabled={!currentBlock || currentBlockIndex <= 0}
        nextDisabled={!currentBlock}
      />

      <FocusSettingsSheet
        open={settingsOpen}
        handedness={handedness}
        showRuler={showRuler}
        showGuide={showGuide}
        onClose={() => setSettingsOpen(false)}
        onHandednessChange={(value) => {
          setHandedness(value);
          showToast(value === 'right' ? '已切换为右手模式' : '已切换为左手模式');
        }}
        onToggleRuler={() => setShowRuler((current) => !current)}
        onToggleGuide={() => setShowGuide((current) => !current)}
      />

      <div className={`${styles.toast} ${toast ? styles.show : ''}`} role="status" aria-live="polite">
        {toast || '已定位当前格'}
      </div>
    </main>
  );
}
