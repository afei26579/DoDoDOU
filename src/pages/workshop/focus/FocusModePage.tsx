import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { saveWorkshopProject } from '../../../features/workshop/model/projectStore';
import type {
  PatternResult,
  WorkshopBeadingHorizontalDirection,
  WorkshopBeadingProgress,
  WorkshopBeadingStrategy,
  WorkshopBeadingVerticalDirection,
  WorkshopBoardLayout,
} from '../../../features/workshop/model/types';
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

type PatternDragStart = PointerPoint & {
  offsetX: number;
  offsetY: number;
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
const MAX_BOARD_SIDE = 200;
const VIEWPORT_ANIMATION_MS = 520;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

function getBlockAnchorCell(block: BeadingBlock, handedness: 'left' | 'right') {
  const cells = [...block.cells];
  cells.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return handedness === 'left' ? b.x - a.x : a.x - b.x;
  });
  return cells[0] ?? null;
}

function getLargestBlockForColor(blocks: BeadingBlock[], colorKey: string | null) {
  if (!colorKey) return null;
  return [...blocks]
    .filter((block) => block.colorKey === colorKey)
    .sort((a, b) => b.cells.length - a.cells.length)[0] ?? null;
}

function isBeadingStrategy(value: unknown): value is WorkshopBeadingStrategy {
  return value === 'smart' || value === 'nearest' || value === 'largest';
}

function isHorizontalDirection(value: unknown): value is WorkshopBeadingHorizontalDirection {
  return value === 'smart' || value === 'left-to-right' || value === 'right-to-left';
}

function isVerticalDirection(value: unknown): value is WorkshopBeadingVerticalDirection {
  return value === 'smart' || value === 'top-to-bottom' || value === 'bottom-to-top';
}

function resolveHorizontalDirection(handedness: 'left' | 'right', direction: WorkshopBeadingHorizontalDirection) {
  if (direction !== 'smart') return direction;
  return handedness === 'left' ? 'right-to-left' : 'left-to-right';
}

function resolveVerticalDirection(direction: WorkshopBeadingVerticalDirection) {
  return direction === 'smart' ? 'top-to-bottom' : direction;
}

function getBlockBounds(block: BeadingBlock) {
  const xs = block.cells.map((cell) => cell.x);
  const ys = block.cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX + 1) / 2,
    centerY: (minY + maxY + 1) / 2,
  };
}

function getBlockExitPoint(
  block: BeadingBlock,
  handedness: 'left' | 'right',
  horizontalDirection: WorkshopBeadingHorizontalDirection,
  verticalDirection: WorkshopBeadingVerticalDirection,
) {
  const bounds = getBlockBounds(block);
  const horizontal = resolveHorizontalDirection(handedness, horizontalDirection);
  const vertical = resolveVerticalDirection(verticalDirection);
  return {
    x: horizontal === 'left-to-right' ? bounds.maxX + 1 : bounds.minX,
    y: vertical === 'top-to-bottom' ? bounds.maxY + 1 : bounds.minY,
  };
}

function getDistanceToBlockBoundary(point: PointerPoint, block: BeadingBlock) {
  const bounds = getBlockBounds(block);
  const dx = point.x < bounds.minX ? bounds.minX - point.x : point.x > bounds.maxX + 1 ? point.x - (bounds.maxX + 1) : 0;
  const dy = point.y < bounds.minY ? bounds.minY - point.y : point.y > bounds.maxY + 1 ? point.y - (bounds.maxY + 1) : 0;
  return Math.hypot(dx, dy);
}

function getDirectionPenalty(
  from: PointerPoint,
  block: BeadingBlock,
  handedness: 'left' | 'right',
  horizontalDirection: WorkshopBeadingHorizontalDirection,
  verticalDirection: WorkshopBeadingVerticalDirection,
) {
  const bounds = getBlockBounds(block);
  const horizontal = resolveHorizontalDirection(handedness, horizontalDirection);
  const vertical = resolveVerticalDirection(verticalDirection);
  let penalty = 0;
  if (horizontal === 'left-to-right' && bounds.centerX < from.x) penalty += 1;
  if (horizontal === 'right-to-left' && bounds.centerX > from.x) penalty += 1;
  if (vertical === 'top-to-bottom' && bounds.centerY < from.y) penalty += 1;
  if (vertical === 'bottom-to-top' && bounds.centerY > from.y) penalty += 1;
  return penalty;
}

function isBlockCompleted(block: BeadingBlock, completedCellKeys: Set<string>) {
  return block.cells.every((cell) => completedCellKeys.has(getCellCoordKey(cell)));
}

function pickNextBlock(params: {
  currentBlock: BeadingBlock | null;
  candidates: BeadingBlock[];
  completedCellKeys: Set<string>;
  handedness: 'left' | 'right';
  strategy: WorkshopBeadingStrategy;
  horizontalDirection: WorkshopBeadingHorizontalDirection;
  verticalDirection: WorkshopBeadingVerticalDirection;
}) {
  const { currentBlock, candidates, completedCellKeys, handedness, strategy, horizontalDirection, verticalDirection } = params;
  if (!currentBlock) return null;
  const exitPoint = getBlockExitPoint(currentBlock, handedness, horizontalDirection, verticalDirection);
  const available = candidates.filter((block) => block.key !== currentBlock.key && !isBlockCompleted(block, completedCellKeys));
  if (available.length === 0) return null;

  const scored = available.map((block) => ({
    block,
    distance: getDistanceToBlockBoundary(exitPoint, block),
    directionPenalty: getDirectionPenalty(exitPoint, block, handedness, horizontalDirection, verticalDirection),
  }));

  scored.sort((a, b) => {
    if (strategy === 'largest') {
      if (b.block.cells.length !== a.block.cells.length) return b.block.cells.length - a.block.cells.length;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.directionPenalty - b.directionPenalty;
    }

    if (strategy === 'nearest') {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.directionPenalty !== b.directionPenalty) return a.directionPenalty - b.directionPenalty;
      return b.block.cells.length - a.block.cells.length;
    }

    const distanceTolerance = 5;
    if (Math.abs(a.distance - b.distance) > distanceTolerance) return a.distance - b.distance;
    if (a.directionPenalty !== b.directionPenalty) return a.directionPenalty - b.directionPenalty;
    if (Math.abs(a.distance - b.distance) > 1) return a.distance - b.distance;
    return b.block.cells.length - a.block.cells.length;
  });

  return scored[0]?.block ?? null;
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

function normalizeBoardLayout(pattern: PatternResult, layout?: Partial<WorkshopBoardLayout> | null): WorkshopBoardLayout {
  const minSide = Math.max(pattern.width, pattern.height);
  const requestedSide = Math.max(layout?.boardWidth ?? minSide, layout?.boardHeight ?? minSide);
  const boardSide = Math.round(clamp(requestedSide, minSide, MAX_BOARD_SIDE));
  const boardWidth = boardSide;
  const boardHeight = boardSide;
  const patternOffsetX = Math.round(clamp(layout?.patternOffsetX ?? 0, 0, boardWidth - pattern.width));
  const patternOffsetY = Math.round(clamp(layout?.patternOffsetY ?? 0, 0, boardHeight - pattern.height));

  return {
    boardWidth,
    boardHeight,
    patternOffsetX,
    patternOffsetY,
  };
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
  const patternDragStartRef = useRef<PatternDragStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const tapStartRef = useRef<TapStart | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const restoredProjectRef = useRef<string | null>(null);
  const skipNextProgressSaveRef = useRef(false);
  const boardLayoutRef = useRef<WorkshopBoardLayout | null>(null);
  const viewportAnimationRef = useRef<number | null>(null);
  const progressFlowFrameRef = useRef<number | null>(null);

  const [boardSize, setBoardSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [viewport, setViewport] = useState<FocusViewport | null>(null);
  const [handedness, setHandedness] = useState<'left' | 'right'>('right');
  const [showRuler, setShowRuler] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [zoomLocked, setZoomLocked] = useState(false);
  const [wakeActive, setWakeActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [patternMode, setPatternMode] = useState<PatternMode>('color-block');
  const [connectivity, setConnectivity] = useState<BeadingConnectivity>('8');
  const [rowAxis, setRowAxis] = useState<BeadingAxis>('row');
  const [beadingStrategy, setBeadingStrategy] = useState<WorkshopBeadingStrategy>('smart');
  const [horizontalDirection, setHorizontalDirection] = useState<WorkshopBeadingHorizontalDirection>('smart');
  const [verticalDirection, setVerticalDirection] = useState<WorkshopBeadingVerticalDirection>('top-to-bottom');
  const [activeColorKey, setActiveColorKey] = useState<string | null>(null);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [completedCellKeys, setCompletedCellKeys] = useState<string[]>([]);
  const [lockShaking, setLockShaking] = useState(false);
  const [boardLayout, setBoardLayout] = useState<WorkshopBoardLayout | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [progressFlowOffset, setProgressFlowOffset] = useState(0);

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
      mode: 'color-block',
      handedness,
      connectivity: '8',
      axis: rowAxis,
      regionSize: 10,
    });
  }, [handedness, patternResult, rowAxis]);

  const planBlocks = beadingPlan?.blocks ?? [];
  const activeColorBlocks = useMemo(() => {
    if (!activeColorKey) return planBlocks;
    return planBlocks
      .filter((block) => block.colorKey === activeColorKey)
      .sort((a, b) => {
        if (b.cells.length !== a.cells.length) return b.cells.length - a.cells.length;
        const anchorA = getBlockAnchorCell(a, handedness);
        const anchorB = getBlockAnchorCell(b, handedness);
        if (!anchorA || !anchorB) return 0;
        if (anchorA.y !== anchorB.y) return anchorA.y - anchorB.y;
        return handedness === 'left' ? anchorB.x - anchorA.x : anchorA.x - anchorB.x;
      });
  }, [activeColorKey, handedness, planBlocks]);
  const currentBlockIndex = useMemo(() => {
    if (!activeCellKey) return -1;
    return activeColorBlocks.findIndex((block) => block.cells.some((cell) => getCellCoordKey(cell) === activeCellKey));
  }, [activeCellKey, activeColorBlocks]);
  const currentBlock = currentBlockIndex >= 0 ? activeColorBlocks[currentBlockIndex] ?? null : null;
  const currentBlockCellKeys = useMemo(
    () => new Set((currentBlock?.cells ?? []).map(getCellCoordKey)),
    [currentBlock],
  );
  const currentBlockCompleted = currentBlock ? isBlockCompleted(currentBlock, completedCellKeySet) : false;
  const completedBlockCellKeyGroups = useMemo(
    () => planBlocks
      .filter((block) => isBlockCompleted(block, completedCellKeySet))
      .map((block) => new Set(block.cells.map(getCellCoordKey))),
    [completedCellKeySet, planBlocks],
  );
  useEffect(() => {
    if (!currentBlock) return;
    const exitPoint = getBlockExitPoint(currentBlock, handedness, horizontalDirection, verticalDirection);
    console.debug('[FocusModePage] selected block exit point', {
      blockKey: currentBlock.key,
      colorKey: currentBlock.colorKey,
      label: currentBlock.label,
      cellCount: currentBlock.cells.length,
      handedness,
      horizontalDirection,
      verticalDirection,
      resolvedHorizontalDirection: resolveHorizontalDirection(handedness, horizontalDirection),
      resolvedVerticalDirection: resolveVerticalDirection(verticalDirection),
      exitPoint,
    });
  }, [currentBlock, handedness, horizontalDirection, verticalDirection]);
  const recommendedNextBlock = useMemo(
    () => pickNextBlock({
      currentBlock,
      candidates: activeColorBlocks,
      completedCellKeys: completedCellKeySet,
      handedness,
      strategy: beadingStrategy,
      horizontalDirection,
      verticalDirection,
    }),
    [activeColorBlocks, beadingStrategy, completedCellKeySet, currentBlock, handedness, horizontalDirection, verticalDirection],
  );

  const effectiveActiveColorKey = currentBlock?.colorKey ?? activeColorKey;
  const currentColor = useMemo(
    () => palette.find((item) => getColorKey(item) === effectiveActiveColorKey) ?? null,
    [effectiveActiveColorKey, palette],
  );
  const currentColorCellKeys = useMemo(
    () => cells
      .filter((cell) => cell.colorKey === effectiveActiveColorKey && validCellKeys.has(cell.coordKey))
      .map((cell) => cell.coordKey),
    [cells, effectiveActiveColorKey, validCellKeys],
  );
  const completedCurrentColorCellCount = useMemo(
    () => currentColorCellKeys.filter((key) => completedCellKeySet.has(key)).length,
    [completedCellKeySet, currentColorCellKeys],
  );
  const completedCurrentColorBlockCount = useMemo(
    () => activeColorBlocks.filter((block) => isBlockCompleted(block, completedCellKeySet)).length,
    [activeColorBlocks, completedCellKeySet],
  );
  const toolbarTotalBlocks = currentColor ? Math.max(activeColorBlocks.length, 1) : 0;
  const toolbarBlockNumber = currentColor ? clamp(currentBlockIndex + 1, 1, toolbarTotalBlocks) : 0;
  const toolbarTotalColorCount = currentColorCellKeys.length;
  const toolbarRemainingColorCount = Math.max(0, toolbarTotalColorCount - completedCurrentColorCellCount);
  const toolbarColorProgress = toolbarTotalColorCount > 0 ? completedCurrentColorCellCount / toolbarTotalColorCount : 0;
  const totalCompletionProgress = totalPatternCells > 0 ? normalizedCompletedCellKeys.length / totalPatternCells : 0;
  const paletteOptions = useMemo(() => palette.map((item) => {
    const colorKey = getColorKey(item);
    const blocks = planBlocks.filter((block) => block.colorKey === colorKey);
    return {
      ...item,
      colorKey,
      totalBlocks: blocks.length,
      completedBlocks: blocks.filter((block) => isBlockCompleted(block, completedCellKeySet)).length,
      active: colorKey === effectiveActiveColorKey,
    };
  }), [completedCellKeySet, effectiveActiveColorKey, palette, planBlocks]);

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
  const legacyCurrentPosition = currentCell && patternResult
    ? `R${currentCell.y + 1} · C${getDisplayColumn(patternResult.width, handedness, currentCell.x)}`
    : '等待定位';

  void legacyCurrentPosition;
  const effectiveBoardLayout = patternResult ? normalizeBoardLayout(patternResult, boardLayout) : null;
  const currentBoardCell = currentCell && effectiveBoardLayout
    ? {
        x: effectiveBoardLayout.patternOffsetX + currentCell.x,
        y: effectiveBoardLayout.patternOffsetY + currentCell.y,
      }
    : null;
  const currentPosition = currentBoardCell && effectiveBoardLayout
    ? `R${currentBoardCell.y + 1} · C${getDisplayColumn(effectiveBoardLayout.boardWidth, handedness, currentBoardCell.x)}`
    : '等待定位';

  void currentPosition;

  useEffect(() => {
    boardLayoutRef.current = effectiveBoardLayout;
  }, [effectiveBoardLayout]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? '' : current));
    }, 1400);
  }, []);

  const cancelViewportAnimation = useCallback(() => {
    if (viewportAnimationRef.current === null) return;
    window.cancelAnimationFrame(viewportAnimationRef.current);
    viewportAnimationRef.current = null;
  }, []);

  const animateViewportTo = useCallback((from: FocusViewport, to: FocusViewport) => {
    cancelViewportAnimation();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setViewport(to);
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = clamp((now - startedAt) / VIEWPORT_ANIMATION_MS, 0, 1);
      const eased = easeInOutCubic(progress);
      setViewport({
        ...to,
        cellPx: from.cellPx + (to.cellPx - from.cellPx) * eased,
        tx: from.tx + (to.tx - from.tx) * eased,
        ty: from.ty + (to.ty - from.ty) * eased,
      });

      if (progress < 1) {
        viewportAnimationRef.current = window.requestAnimationFrame(tick);
      } else {
        viewportAnimationRef.current = null;
      }
    };

    viewportAnimationRef.current = window.requestAnimationFrame(tick);
  }, [cancelViewportAnimation]);

  const centerCell = useCallback((cell: FocusBoardCell | null, targetCellPx?: number, options: { animated?: boolean } = {}) => {
    if (!cell || !patternResult || boardSize.width <= 0 || boardSize.height <= 0) return;
    const layout = effectiveBoardLayout ?? normalizeBoardLayout(patternResult, boardLayout);
    const clip = getCanvasClipArea(boardSize.height);
    const base = viewport ?? getFitViewport(patternResult, boardSize.width, boardSize.height, layout);
    const cellPx = clamp(targetCellPx ?? Math.max(base.cellPx, 22), base.minCellPx, base.maxCellPx);
    const boardX = layout.patternOffsetX + cell.x;
    const boardY = layout.patternOffsetY + cell.y;
    const nextViewport = {
      ...base,
      cellPx,
      tx: boardSize.width / 2 - (boardX + 0.5) * cellPx,
      ty: (clip.top + clip.bottom) / 2 - (boardY + 0.5) * cellPx,
    };

    if (options.animated && viewport) {
      animateViewportTo(base, nextViewport);
    } else {
      cancelViewportAnimation();
      setViewport(nextViewport);
    }
  }, [animateViewportTo, boardLayout, boardSize.height, boardSize.width, cancelViewportAnimation, effectiveBoardLayout, patternResult, viewport]);

  useEffect(() => () => cancelViewportAnimation(), [cancelViewportAnimation]);

  useEffect(() => {
    if (placementMode || totalCompletionProgress <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      if (progressFlowFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFlowFrameRef.current);
        progressFlowFrameRef.current = null;
      }
      return;
    }

    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      setProgressFlowOffset((now - startedAt) / 1000);
      progressFlowFrameRef.current = window.requestAnimationFrame(tick);
    };
    progressFlowFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (progressFlowFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFlowFrameRef.current);
        progressFlowFrameRef.current = null;
      }
    };
  }, [placementMode, totalCompletionProgress]);

  useEffect(() => {
    if (!patternResult) {
      setViewport(null);
      setBoardLayout(null);
      return;
    }

    setBoardLayout((current) => normalizeBoardLayout(patternResult, current));

    const resize = () => {
      cancelViewportAnimation();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      setBoardSize({ width, height, dpr });
      setViewport(getFitViewport(patternResult, width, height, boardLayoutRef.current));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [cancelViewportAnimation, patternResult]);

  const updateBoardLayout = useCallback((patch: Partial<WorkshopBoardLayout>) => {
    if (!patternResult) return;
    const next = normalizeBoardLayout(patternResult, { ...boardLayout, ...patch });
    setBoardLayout(next);
    if (
      boardSize.width > 0 &&
      boardSize.height > 0 &&
      (patch.boardWidth !== undefined || patch.boardHeight !== undefined)
    ) {
      cancelViewportAnimation();
      setViewport(getFitViewport(patternResult, boardSize.width, boardSize.height, next));
    }
  }, [boardLayout, boardSize.height, boardSize.width, cancelViewportAnimation, patternResult]);

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
      const largestBlock = getLargestBlockForColor(planBlocks, colorKey);
      const anchorCell = largestBlock ? getBlockAnchorCell(largestBlock, handedness) : null;
      return anchorCell ? getCellCoordKey(anchorCell) : getFirstCellForColor(cells, colorKey, handedness)?.coordKey ?? null;
    });
  }, [cells, handedness, palette, patternResult, planBlocks, validCellKeys]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult || restoredProjectRef.current === projectId) return;

    restoredProjectRef.current = projectId;
    const progress = state.beadingProgress;
    if (!progress) return;

    skipNextProgressSaveRef.current = true;
    const validColorKeys = new Set(palette.map(getColorKey));
    setPatternMode('color-block');
    setConnectivity('8');
    setRowAxis(progress.axis === 'column' ? 'column' : 'row');
    setHandedness(progress.handedness === 'left' ? 'left' : 'right');
    setBeadingStrategy(isBeadingStrategy(progress.beadingStrategy) ? progress.beadingStrategy : 'smart');
    setHorizontalDirection(isHorizontalDirection(progress.horizontalDirection) ? progress.horizontalDirection : 'smart');
    setVerticalDirection(isVerticalDirection(progress.verticalDirection) ? progress.verticalDirection : 'top-to-bottom');
    const restoredLayout = normalizeBoardLayout(patternResult, progress.boardLayout);
    setBoardLayout(restoredLayout);
    if (boardSize.width > 0 && boardSize.height > 0) {
      setViewport(getFitViewport(patternResult, boardSize.width, boardSize.height, restoredLayout));
    }
    const fallbackColorKey = palette[0] ? getColorKey(palette[0]) : null;
    const restoredColorKey = progress.activeColorKey && validColorKeys.has(progress.activeColorKey) ? progress.activeColorKey : fallbackColorKey;
    setActiveColorKey(restoredColorKey);
    setActiveCellKey(progress.activeCellKey && validCellKeys.has(progress.activeCellKey)
      ? progress.activeCellKey
      : restoredColorKey
        ? (() => {
            const restoredHandedness = progress.handedness === 'left' ? 'left' : 'right';
            const largestBlock = getLargestBlockForColor(planBlocks, restoredColorKey);
            const anchorCell = largestBlock ? getBlockAnchorCell(largestBlock, restoredHandedness) : null;
            return anchorCell ? getCellCoordKey(anchorCell) : getFirstCellForColor(cells, restoredColorKey, restoredHandedness)?.coordKey ?? null;
          })()
        : null);
    setCompletedCellKeys(progress.completedCellKeys.filter((key) => validCellKeys.has(key)));
  }, [boardSize.height, boardSize.width, cells, isHydrating, palette, patternResult, planBlocks, projectId, state.beadingProgress, validCellKeys]);

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
        boardLayout: patternResult ? normalizeBoardLayout(patternResult, boardLayout) : undefined,
        beadingStrategy,
        horizontalDirection,
        verticalDirection,
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
    beadingStrategy,
    effectiveActiveColorKey,
    handedness,
    horizontalDirection,
    isHydrating,
    normalizedCompletedCellKeys,
    patternMode,
    patternResult,
    progressPercent,
    projectId,
    rowAxis,
    boardLayout,
    totalPatternCells,
    verticalDirection,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !patternResult || !viewport || !effectiveBoardLayout || boardSize.width <= 0 || boardSize.height <= 0) return;
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
      boardLayout: effectiveBoardLayout,
      activeColorKey: effectiveActiveColorKey,
      currentCellKey: activeCellKey,
      completedCellKeys: completedCellKeySet,
      completedBlockCellKeyGroups,
      selectedBlockCellKeys: currentBlockCellKeys,
      completionProgress: totalCompletionProgress,
      progressFlowOffset,
      showGuide,
      placementMode,
      handedness,
      width: boardSize.width,
      height: boardSize.height,
      clip: getCanvasClipArea(boardSize.height),
    });
  }, [activeCellKey, boardSize, cells, completedBlockCellKeyGroups, completedCellKeySet, currentBlockCellKeys, effectiveActiveColorKey, effectiveBoardLayout, patternResult, placementMode, progressFlowOffset, showGuide, totalCompletionProgress, viewport]);

  const rulerData = useMemo(() => {
    if (!patternResult || !viewport || !effectiveBoardLayout || boardSize.width <= 0) return { columns: [], rows: [] };
    const sideRect = sideRulerRef.current?.getBoundingClientRect();
    return buildRulerData({
      pattern: patternResult,
      boardLayout: effectiveBoardLayout,
      viewport,
      width: boardSize.width,
      clip: getCanvasClipArea(boardSize.height),
      sideRulerTop: sideRect?.top ?? 98,
      sideRulerHeight: sideRect?.height ?? Math.max(80, boardSize.height - 202),
      currentCell: currentBoardCell,
      handedness,
    });
  }, [boardSize.height, boardSize.width, currentBoardCell, effectiveBoardLayout, handedness, patternResult, viewport]);

  const selectCell = useCallback((cell: FocusBoardCell, options: { center?: boolean } = {}) => {
    if (!cell.vendorCode || cell.isExternal || cell.hex === 'transparent') return;
    const largestBlock = planBlocks
      .filter((block) => block.colorKey === cell.colorKey)
      .sort((a, b) => b.cells.length - a.cells.length)[0] ?? null;
    const anchorCell = largestBlock ? getBlockAnchorCell(largestBlock, handedness) : cell;
    setActiveColorKey(cell.colorKey);
    setActiveCellKey(anchorCell ? getCellCoordKey(anchorCell) : cell.coordKey);
    if (options.center) centerCell(anchorCell ? cellByCoordKey.get(getCellCoordKey(anchorCell)) ?? cell : cell);
  }, [cellByCoordKey, centerCell, handedness, planBlocks]);

  const selectExactCell = useCallback((cell: FocusBoardCell, options: { center?: boolean } = {}) => {
    if (!cell.vendorCode || cell.isExternal || cell.hex === 'transparent') return;
    setActiveColorKey(cell.colorKey);
    setActiveCellKey(cell.coordKey);
    if (options.center) centerCell(cell);
  }, [centerCell]);

  const selectBlock = useCallback((block: BeadingBlock | null, options: { center?: boolean; animated?: boolean } = {}) => {
    if (!block) return;
    const anchorCell = getBlockAnchorCell(block, handedness);
    if (!anchorCell) return;
    const coordKey = getCellCoordKey(anchorCell);
    setActiveColorKey(block.colorKey);
    setActiveCellKey(coordKey);
    if (options.center) centerCell(cellByCoordKey.get(coordKey) ?? null, undefined, { animated: options.animated });
  }, [cellByCoordKey, centerCell, handedness]);

  const findBlockForCell = useCallback((cell: FocusBoardCell) => {
    return planBlocks.find((block) => block.colorKey === cell.colorKey && block.cells.some((blockCell) => getCellCoordKey(blockCell) === cell.coordKey)) ?? null;
  }, [planBlocks]);

  const selectColorFromPalette = useCallback((colorKey: string) => {
    const colorBlocks = planBlocks.filter((block) => block.colorKey === colorKey);
    const nextBlock =
      colorBlocks.find((block) => !isBlockCompleted(block, completedCellKeySet)) ??
      [...colorBlocks].sort((a, b) => b.cells.length - a.cells.length)[0] ??
      null;
    if (nextBlock) {
      selectBlock(nextBlock, { center: true, animated: true });
    } else {
      setActiveColorKey(colorKey);
      setActiveCellKey(null);
    }
    setPaletteOpen(false);
    const item = palette.find((paletteItem) => getColorKey(paletteItem) === colorKey);
    if (item) showToast(`已切换到色号 ${item.vendorCode}`);
  }, [completedCellKeySet, palette, planBlocks, selectBlock, showToast]);

  const toggleCurrentBlockCompletion = useCallback(() => {
    if (!currentBlock) return;
    const blockKeys = currentBlock.cells.map(getCellCoordKey);
    const completed = isBlockCompleted(currentBlock, completedCellKeySet);
    setCompletedCellKeys((current) => {
      if (completed) {
        const removeKeys = new Set(blockKeys);
        return current.filter((key) => !removeKeys.has(key));
      }
      return Array.from(new Set([...current, ...blockKeys]));
    });
    showToast(completed ? '已取消当前块完成' : '已标记当前块完成');
  }, [completedCellKeySet, currentBlock, showToast]);

  const handleBoardTap = useCallback((clientX: number, clientY: number) => {
    if (!patternResult || !viewport || !effectiveBoardLayout || placementMode) return;
    const clip = getCanvasClipArea(boardSize.height);
    if (clientY < clip.top || clientY > clip.bottom) return;
    const boardCoord = screenToCell(viewport, clientX, clientY);
    const patternCoord = {
      x: boardCoord.x - effectiveBoardLayout.patternOffsetX,
      y: boardCoord.y - effectiveBoardLayout.patternOffsetY,
    };
    if (patternCoord.x < 0 || patternCoord.x >= patternResult.width || patternCoord.y < 0 || patternCoord.y >= patternResult.height) return;
    const cell = cellByCoordKey.get(`${patternCoord.x},${patternCoord.y}`);
    if (!cell) return;
    const block = findBlockForCell(cell);
    if (currentBlockCellKeys.has(cell.coordKey)) {
      selectExactCell(cell);
      return;
    }

    if (block) {
      selectBlock(block);
    } else {
      selectExactCell(cell);
    }
    showToast(`已切换到色号 ${cell.vendorCode}`);
  }, [boardSize.height, cellByCoordKey, currentBlockCellKeys, effectiveBoardLayout, findBlockForCell, patternResult, placementMode, selectBlock, selectExactCell, showToast, viewport]);

  const zoomAt = useCallback((factor: number, clientX = boardSize.width / 2, clientY = boardSize.height / 2) => {
    cancelViewportAnimation();
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
  }, [boardSize.height, boardSize.width, cancelViewportAnimation]);

  // 触发锁定按钮震动
  const triggerLockShake = useCallback(() => {
    setLockShaking(true);
    setTimeout(() => setLockShaking(false), 400);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    cancelViewportAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!viewport) return;

    // 单指拖动始终允许
    if (pointersRef.current.size === 1) {
      tapStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      if (placementMode && effectiveBoardLayout) {
        patternDragStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          offsetX: effectiveBoardLayout.patternOffsetX,
          offsetY: effectiveBoardLayout.patternOffsetY,
        };
        dragStartRef.current = null;
      } else {
        dragStartRef.current = { x: event.clientX, y: event.clientY, tx: viewport.tx, ty: viewport.ty };
        patternDragStartRef.current = null;
      }
      event.currentTarget.classList.add(styles.dragging);
      return;
    }

    // 双指缩放：锁定时触发震动并阻止
    if (pointersRef.current.size === 2) {
      tapStartRef.current = null;
      if (zoomLocked) {
        triggerLockShake();
        dragStartRef.current = null;
        patternDragStartRef.current = null;
        return;
      }
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
      patternDragStartRef.current = null;
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

    // 单指拖动始终允许
    if (pointersRef.current.size === 1 && patternDragStartRef.current && viewport) {
      const start = patternDragStartRef.current;
      const deltaX = Math.round((event.clientX - start.x) / viewport.cellPx);
      const deltaY = Math.round((event.clientY - start.y) / viewport.cellPx);
      updateBoardLayout({
        patternOffsetX: start.offsetX + deltaX,
        patternOffsetY: start.offsetY + deltaY,
      });
      return;
    }

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      const start = dragStartRef.current;
      setViewport((current) => current ? { ...current, tx: start.tx + event.clientX - start.x, ty: start.ty + event.clientY - start.y } : current);
      return;
    }

    // 双指缩放：锁定时触发震动并阻止
    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      if (zoomLocked) {
        triggerLockShake();
        return;
      }
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
    const tapCandidate = wasSinglePointer && tapStart?.id === event.pointerId && !tapStart.moved;
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      patternDragStartRef.current = null;
      pinchStartRef.current = null;
      tapStartRef.current = null;
      event.currentTarget.classList.remove(styles.dragging);
    } else if (pointersRef.current.size === 1) {
      const point = Array.from(pointersRef.current.values())[0];
      if (placementMode && effectiveBoardLayout) {
        patternDragStartRef.current = {
          ...point,
          offsetX: effectiveBoardLayout.patternOffsetX,
          offsetY: effectiveBoardLayout.patternOffsetY,
        };
        dragStartRef.current = null;
      } else {
        dragStartRef.current = viewport ? { ...point, tx: viewport.tx, ty: viewport.ty } : null;
        patternDragStartRef.current = null;
      }
      pinchStartRef.current = null;
    }

    if (tapCandidate) handleBoardTap(event.clientX, event.clientY);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelViewportAnimation();
      // 锁定缩放时触发震动
      if (zoomLocked) {
        triggerLockShake();
        return;
      }
      zoomAt(event.deltaY < 0 ? 1.12 : 0.9, event.clientX, event.clientY);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [cancelViewportAnimation, zoomAt, zoomLocked]);

  const goToBlock = (direction: 'previous' | 'next') => {
    if (activeColorBlocks.length === 0) return;
    const currentIndex = currentBlockIndex >= 0 ? currentBlockIndex : 0;

    if (direction === 'next') {
      if (currentBlock) {
        setCompletedCellKeys((current) => Array.from(new Set([...current, ...currentBlock.cells.map(getCellCoordKey)])));
      }
      const nextBlock = recommendedNextBlock;
      if (nextBlock) {
        selectBlock(nextBlock, { center: true, animated: true });
        showToast(`已切换到色号 ${nextBlock.label}`);
      } else {
        showToast('最后一块已完成');
      }
      return;
    }

    const previousBlock = activeColorBlocks[Math.max(0, currentIndex - 1)] ?? null;
    if (previousBlock && previousBlock.key !== currentBlock?.key) {
      selectBlock(previousBlock, { center: true });
      showToast(`已回到色号 ${previousBlock.label}`);
    }
  };

  const toggleWakeLock = async () => {
    const wakeNavigator = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
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
    <main className={styles.page} aria-label="拼豆专注模式">
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
        zoomLocked={zoomLocked}
        wakeActive={wakeActive}
        placementMode={placementMode}
        onBack={handleBack}
        onToggleWake={toggleWakeLock}
        onTogglePlacementMode={() => {
          setPlacementMode((current) => !current);
          showToast(placementMode ? '已关闭图纸摆放' : '已开启图纸摆放');
        }}
        onToggleLock={() => {
          setZoomLocked((current) => !current);
          showToast(zoomLocked ? '已关闭缩放锁定' : '已开启缩放锁定');
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        shaking={lockShaking}
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
        paletteOptions={paletteOptions}
        paletteOpen={paletteOpen}
        blockNumber={toolbarBlockNumber}
        totalBlocks={toolbarTotalBlocks}
        currentBlockCount={currentBlock?.cells.length ?? 0}
        totalColorCount={toolbarTotalColorCount}
        remainingColorCount={toolbarRemainingColorCount}
        colorProgress={toolbarColorProgress}
        currentBlockCompleted={currentBlockCompleted}
        onPrevious={() => goToBlock('previous')}
        onNext={() => goToBlock('next')}
        onOpenPalette={() => setPaletteOpen(true)}
        onClosePalette={() => setPaletteOpen(false)}
        onSelectPaletteColor={selectColorFromPalette}
        onCenter={() => {
          if (currentCell) selectCell(currentCell, { center: true });
          if (currentColor) showToast(`当前聚焦 ${currentColor.vendorCode}`);
        }}
        onToggleComplete={toggleCurrentBlockCompletion}
        previousDisabled={!currentBlock || currentBlockIndex <= 0}
        nextDisabled={!currentBlock || (!recommendedNextBlock && currentBlockIndex >= activeColorBlocks.length - 1)}
      />

      <FocusSettingsSheet
        open={settingsOpen}
        handedness={handedness}
        showRuler={showRuler}
        showGuide={showGuide}
        beadingStrategy={beadingStrategy}
        horizontalDirection={horizontalDirection}
        verticalDirection={verticalDirection}
        patternWidth={patternResult?.width ?? 0}
        patternHeight={patternResult?.height ?? 0}
        boardLayout={effectiveBoardLayout}
        onClose={() => setSettingsOpen(false)}
        onHandednessChange={(value) => {
          setHandedness(value);
          showToast(value === 'right' ? '已切换为右手模式' : '已切换为左手模式');
        }}
        onBeadingStrategyChange={setBeadingStrategy}
        onHorizontalDirectionChange={setHorizontalDirection}
        onVerticalDirectionChange={setVerticalDirection}
        onToggleRuler={() => setShowRuler((current) => !current)}
        onToggleGuide={() => setShowGuide((current) => !current)}
        onTogglePlacementMode={() => {
          setPlacementMode((current) => !current);
          showToast(placementMode ? '已关闭图纸摆放' : '已开启图纸摆放');
        }}
        onNotice={showToast}
        onBoardLayoutChange={updateBoardLayout}
      />

      <div className={`${styles.toast} ${toast ? styles.show : ''}`} role="status" aria-live="polite">
        {toast || '已定位当前格'}
      </div>
    </main>
  );
}
