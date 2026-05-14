import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { WorkshopBeadingProgress } from '../../features/workshop/model/types';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import {
  buildBeadingPlan,
  buildPalette,
  getCellCoordKey,
  getCellKey,
  isTransparentCellHex,
  type BeadingAxis,
  type BeadingBlock,
  type BeadingConnectivity,
  type BeadingPaletteItem,
  type PatternMode,
} from '../../lib/pattern/beadingPlan';
import { drawPatternFocusZoomView, getFocusPanBounds, getFocusWindowBounds, getQuadrant } from '../../lib/pattern/focusZoom';
import { drawPatternPreview } from '../../lib/pattern/preview';
import styles from './FocusModePage.module.css';

const GO_BACK_ICON = '/assets/system_icons/go_back.png';

type ToggleKey = 'label' | 'separator';

type SeparatorColorOption = {
  label: string;
  value: string;
};

type FocusPanState = {
  isDragging: boolean;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

const separatorColorOptions: SeparatorColorOption[] = [
  { label: '黑色', value: '#2D2A2F' },
  { label: '深灰', value: '#5D534A' },
  { label: '玫红', value: '#F46D7A' },
  { label: '蓝色', value: '#5FA5F7' },
  { label: '绿色', value: '#39C8A3' },
  { label: '紫色', value: '#B081F7' },
  { label: '黄色', value: '#FDBA28' },
];

const patternModes: PatternMode[] = ['smart', 'color-block', 'edge-first', 'region-first', 'row-by-row'];
const connectivityOptions: BeadingConnectivity[] = ['4', '8', 'smart'];
const focusGridSizeOptions = [10, 20, 25, 30] as const;
type FocusGridSize = (typeof focusGridSizeOptions)[number];

function isPatternMode(value: string): value is PatternMode {
  return patternModes.includes(value as PatternMode);
}

function isConnectivity(value: unknown): value is BeadingConnectivity {
  return typeof value === 'string' && connectivityOptions.includes(value as BeadingConnectivity);
}

function isFocusGridSize(value: unknown): value is FocusGridSize {
  return typeof value === 'number' && focusGridSizeOptions.includes(value as FocusGridSize);
}

export function FocusModePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [patternMode, setPatternMode] = useState<PatternMode>('smart');
  const [connectivity, setConnectivity] = useState<BeadingConnectivity>('smart');
  const [rowAxis, setRowAxis] = useState<BeadingAxis>('row');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    label: false,
    separator: true,
  });
  const [separatorInterval, setSeparatorInterval] = useState(10);
  const [separatorColor, setSeparatorColor] = useState(separatorColorOptions[0].value);
  const [handedness, setHandedness] = useState<'left' | 'right'>('left');
  const [focusGridSize, setFocusGridSize] = useState<FocusGridSize>(10);
  const [activeColorKey, setActiveColorKey] = useState<string | null>(null);
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const [completedColorKeys, setCompletedColorKeys] = useState<string[]>([]);
  const [completedCellKeys, setCompletedCellKeys] = useState<string[]>([]);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [floatPreviewDataUrl, setFloatPreviewDataUrl] = useState<string | null>(null);
  const previewImageDataUrlRef = useRef<string | null>(null);
  const [focusPan, setFocusPan] = useState<FocusPanState | null>(null);
  const [focusWindowOverride, setFocusWindowOverride] = useState<{ startX: number; startY: number } | null>(null);
  const restoredProgressProjectRef = useRef<string | null>(null);
  const skipNextProgressSaveRef = useRef(false);

  const patternResult = state.patternResult;

  useEffect(() => {
    console.debug('[FocusModePage] current project snapshot', {
      projectId,
      beadingState: state.beadingState,
      hasPatternResult: Boolean(patternResult),
      viewMode: state.viewMode,
    });
  }, [patternResult, projectId, state.beadingState, state.viewMode]);
  const hasPattern = Boolean(patternResult && patternResult.cells.length > 0);
  const palette = useMemo<BeadingPaletteItem[]>(() => (patternResult ? buildPalette(patternResult) : []), [patternResult]);

  const totalPatternCells = useMemo(() => {
    if (!patternResult) return 0;
    return patternResult.cells.filter((cell) => !cell.isExternal && cell.vendorCode && cell.hex && !isTransparentCellHex(cell.hex)).length;
  }, [patternResult]);

  const patternCellKeySet = useMemo(() => {
    const keys = new Set<string>();
    if (!patternResult) return keys;
    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || isTransparentCellHex(cell.hex)) continue;
      keys.add(getCellCoordKey(cell));
    }
    return keys;
  }, [patternResult]);

  const normalizedCompletedCellKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const key of completedCellKeys) {
      if (patternCellKeySet.has(key)) keys.add(key);
    }
    return Array.from(keys);
  }, [completedCellKeys, patternCellKeySet]);

  const completedPatternCells = normalizedCompletedCellKeys.length;
  const overallProgress = totalPatternCells > 0 ? completedPatternCells / totalPatternCells : 0;
  const overallProgressPercent = Math.min(100, Math.round(overallProgress * 100));
  const totalColorCount = palette.length;

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
  const colorCellsByKey = useMemo(() => {
    const cellsByKey = new Map<string, Set<string>>();
    if (!patternResult) return cellsByKey;
    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || isTransparentCellHex(cell.hex)) continue;
      const colorKey = getCellKey(cell);
      const bucket = cellsByKey.get(colorKey) ?? new Set<string>();
      bucket.add(getCellCoordKey(cell));
      cellsByKey.set(colorKey, bucket);
    }
    return cellsByKey;
  }, [patternResult]);

  const computedCompletedColorKeys = useMemo(() => {
    const completed = new Set(normalizedCompletedCellKeys);
    const keys: string[] = [];
    for (const [colorKey, cellKeys] of colorCellsByKey.entries()) {
      if (cellKeys.size > 0 && Array.from(cellKeys).every((key) => completed.has(key))) {
        keys.push(colorKey);
      }
    }
    return keys;
  }, [colorCellsByKey, normalizedCompletedCellKeys]);
  const completedColorCount = computedCompletedColorKeys.length;

  useEffect(() => {
    if (!patternResult || palette.length === 0) {
      setActiveColorKey(null);
      setActiveCellKey(null);
      setCompletedColorKeys([]);
      setCompletedCellKeys([]);
      return;
    }

    const validColorKeys = new Set(palette.map((item) => `${item.colorId}-${item.vendorCode}-${item.hex}`));
    setCompletedColorKeys((current) => current.filter((key) => validColorKeys.has(key)));
    setCompletedCellKeys((current) => current.filter((key) => patternCellKeySet.has(key)));

    if (activeColorKey && !validColorKeys.has(activeColorKey)) {
      setActiveColorKey(null);
      setActiveCellKey(null);
    }
  }, [activeColorKey, palette, patternCellKeySet, patternResult]);

  useEffect(() => {
    if (!patternResult || activeCellKey || planBlocks.length === 0) return;
    const firstBlock = planBlocks[0];
    setActiveColorKey(firstBlock.colorKey);
    setActiveCellKey(firstBlock.cells[0] ? getCellCoordKey(firstBlock.cells[0]) : null);
  }, [activeCellKey, patternResult, planBlocks]);

  useEffect(() => {
    restoredProgressProjectRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult) return;
    if (restoredProgressProjectRef.current === projectId) return;

    restoredProgressProjectRef.current = projectId;
    const progress = state.beadingProgress;
    if (!progress) return;

    skipNextProgressSaveRef.current = true;
    const validColorKeys = new Set(palette.map((item) => `${item.colorId}-${item.vendorCode}-${item.hex}`));
    setPatternMode(isPatternMode(progress.mode) ? progress.mode : 'smart');
    setConnectivity(isConnectivity(progress.connectivity) ? progress.connectivity : 'smart');
    setRowAxis(progress.axis === 'column' ? 'column' : 'row');
    setFocusGridSize(isFocusGridSize(progress.focusGridSize) ? progress.focusGridSize : 10);
    setHandedness(progress.handedness === 'right' ? 'right' : 'left');
    setActiveColorKey(progress.activeColorKey && validColorKeys.has(progress.activeColorKey) ? progress.activeColorKey : null);
    setActiveCellKey(progress.activeCellKey && patternCellKeySet.has(progress.activeCellKey) ? progress.activeCellKey : null);
    setCompletedColorKeys(progress.completedColorKeys.filter((key) => validColorKeys.has(key)));
    setCompletedCellKeys(progress.completedCellKeys.filter((key) => patternCellKeySet.has(key)));
  }, [isHydrating, palette, patternCellKeySet, patternResult, projectId, state.beadingProgress]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult || totalPatternCells === 0) return;
    const updatedAt = new Date().toISOString();
    const completed = state.beadingState === 'completed' || state.beadingProgress?.percent === 100;
    void saveWorkshopProject(projectId, {
      kind: 'progress',
      status: completed ? 'completed' : 'paused',
      beadingState: completed ? 'completed' : 'progressing',
      lastOpenedAt: updatedAt,
    });
  }, [isHydrating, patternResult, projectId, state.beadingProgress?.percent, state.beadingState, totalPatternCells]);

  useEffect(() => {
    if (!projectId || isHydrating || !patternResult || totalPatternCells === 0) return;
    if (skipNextProgressSaveRef.current) {
      skipNextProgressSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const completed = overallProgressPercent >= 100;
      const progress: WorkshopBeadingProgress = {
        activeColorKey,
        activeCellKey,
        completedColorKeys: computedCompletedColorKeys,
        completedCellKeys: normalizedCompletedCellKeys,
        percent: overallProgressPercent,
        mode: patternMode,
        handedness,
        connectivity,
        axis: rowAxis,
        focusGridSize,
        updatedAt,
      };

      void saveWorkshopProject(projectId, {
        kind: 'progress',
        status: completed ? 'completed' : 'paused',
        beadingState: completed ? 'completed' : 'progressing',
        beadingProgress: progress,
        progress: {
          percent: overallProgressPercent,
          step: patternMode,
          updatedAt,
        },
        lastOpenedAt: updatedAt,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    activeCellKey,
    activeColorKey,
    computedCompletedColorKeys,
    connectivity,
    handedness,
    focusGridSize,
    isHydrating,
    normalizedCompletedCellKeys,
    overallProgressPercent,
    patternMode,
    patternResult,
    projectId,
    rowAxis,
    totalPatternCells,
  ]);

  const currentBlockIndex = useMemo(() => {
    if (!activeCellKey) return -1;
    return planBlocks.findIndex((block) => block.cells.some((cell) => getCellCoordKey(cell) === activeCellKey));
  }, [activeCellKey, planBlocks]);

  const currentBlock = currentBlockIndex >= 0 ? planBlocks[currentBlockIndex] ?? null : null;
  const activeGroup = useMemo(
    () => beadingPlan?.groups.find((group) => group.key === currentBlock?.groupKey) ?? null,
    [beadingPlan, currentBlock],
  );
  const activeGroupBlockIndex = useMemo(() => {
    if (!activeGroup || !currentBlock) return -1;
    return activeGroup.blocks.findIndex((block) => block.key === currentBlock.key);
  }, [activeGroup, currentBlock]);
  const activeBlockCount = activeGroup?.blocks.length ?? planBlocks.length;
  const activeBlockCells = currentBlock?.cells ?? [];
  const effectiveActiveColorKey = currentBlock?.colorKey ?? activeColorKey;
  const currentColor = useMemo(
    () => palette.find((item) => `${item.colorId}-${item.vendorCode}-${item.hex}` === effectiveActiveColorKey) ?? null,
    [effectiveActiveColorKey, palette],
  );
  const nextBlock = currentBlockIndex >= 0 ? planBlocks[currentBlockIndex + 1] ?? null : null;
  const nextColor = useMemo(
    () => palette.find((item) => `${item.colorId}-${item.vendorCode}-${item.hex}` === nextBlock?.colorKey) ?? null,
    [nextBlock, palette],
  );
  const focusWindowAnchor = handedness === 'left' ? 'top-right' : 'top-left';
  const focusWindowBounds = useMemo(() => {
    if (!patternResult || activeBlockCells.length === 0) return null;
    return getFocusWindowBounds(patternResult, activeBlockCells, focusGridSize, focusWindowAnchor);
  }, [activeBlockCells, focusGridSize, focusWindowAnchor, patternResult]);
  const focusQuadrant = useMemo(() => {
    if (!patternResult || activeBlockCells.length === 0) return null;
    return getQuadrant(patternResult, activeBlockCells);
  }, [activeBlockCells, patternResult]);
  const focusRulerPosition = useMemo(() => {
    if (!focusQuadrant) return null;
    return {
      horizontal: 'top' as const,
      vertical: handedness === 'left' ? 'right' as const : 'left' as const,
    };
  }, [focusQuadrant, handedness]);

  const panBounds = useMemo(() => {
    if (!patternResult || !focusWindowBounds || activeBlockCells.length === 0) return null;
    return getFocusPanBounds(patternResult, activeBlockCells, focusWindowBounds, focusWindowAnchor);
  }, [activeBlockCells, focusWindowAnchor, focusWindowBounds, patternResult]);

  const effectiveFocusWindowBounds = useMemo(() => {
    if (!focusWindowBounds) return null;
    const base = focusWindowOverride ?? { startX: focusWindowBounds.startX, startY: focusWindowBounds.startY };
    if (!panBounds) return { ...base, size: focusWindowBounds.size };
    return {
      startX: Math.max(panBounds.minX, Math.min(panBounds.maxX, base.startX)),
      startY: Math.max(panBounds.minY, Math.min(panBounds.maxY, base.startY)),
      size: focusWindowBounds.size,
    };
  }, [focusWindowBounds, focusWindowOverride, panBounds]);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!patternResult || !canvas) return;

    if (!effectiveActiveColorKey || !activeBlockCells.length || !effectiveFocusWindowBounds || !focusRulerPosition) {
      const width = Math.max(240, Math.min(720, patternResult.width * 18));
      const height = Math.max(240, Math.min(720, patternResult.height * 18));
      canvas.width = width;
      canvas.height = height;
      drawPatternPreview({
        canvas,
        pattern: patternResult,
        activeColorKey: null,
        activeBlockCellKeys: [],
        completedCellKeys,
        activeOpacity: 1,
        completedOverlayColor: '#86EFAC',
        separator: {
          visible: toggles.separator,
          interval: separatorInterval,
          color: separatorColor,
        },
      });
      return;
    }

    drawPatternFocusZoomView({
      canvas,
      pattern: patternResult,
      blockCells: activeBlockCells,
      activeColorKey: effectiveActiveColorKey,
      windowBounds: effectiveFocusWindowBounds,
      rulerPosition: focusRulerPosition,
      completedCellKeys,
      tileSize: 28,
      rulerThickness: 18,
    });
  }, [activeBlockCells, completedCellKeys, effectiveActiveColorKey, effectiveFocusWindowBounds, focusRulerPosition, patternResult, separatorColor, separatorInterval, toggles.separator]);

  useEffect(() => {
    setFocusWindowOverride(null);
  }, [focusGridSize]);

  const completedCellsBeforeCurrentBlock = useMemo(() => {
    if (!activeGroup || currentBlockIndex < 0 || activeGroupBlockIndex < 0) return 0;
    if (activeCellKey && currentBlock) {
      const currentBlockCellIndex = currentBlock.cells.findIndex((cell) => getCellCoordKey(cell) === activeCellKey);
      if (currentBlockCellIndex >= 0) {
        return activeGroup.blocks.slice(0, activeGroupBlockIndex).reduce((sum, block) => sum + block.cells.length, 0) + currentBlockCellIndex;
      }
    }
    return activeGroup.blocks.slice(0, activeGroupBlockIndex).reduce((sum, block) => sum + block.cells.length, 0);
  }, [activeCellKey, activeGroup, activeGroupBlockIndex, currentBlock, currentBlockIndex]);
  const remainingCellsCount = activeGroup ? Math.max(activeGroup.cells.length - completedCellsBeforeCurrentBlock, 0) : 0;
  const completedCellSet = useMemo(() => new Set(normalizedCompletedCellKeys), [normalizedCompletedCellKeys]);

  const currentStepLabel = useMemo(() => {
    if (!activeGroup) return '请选择一个色号';
    if (!activeCellKey || activeGroupBlockIndex < 0) return `${activeGroup.label}，共 ${activeBlockCount} 块`;
    return `${activeGroup.label} · 第 ${activeGroupBlockIndex + 1} / ${activeBlockCount} 块`;
  }, [activeBlockCount, activeCellKey, activeGroup, activeGroupBlockIndex]);

  const activateColor = (colorKey: string) => {
    const firstPendingBlock = planBlocks.find((block) => block.colorKey === colorKey && block.cells.some((cell) => !completedCellSet.has(getCellCoordKey(cell))));
    const firstBlock = firstPendingBlock ?? planBlocks.find((block) => block.colorKey === colorKey) ?? null;
    setFocusWindowOverride(null);
    setActiveColorKey(colorKey);
    setActiveCellKey(firstBlock?.cells[0] ? getCellCoordKey(firstBlock.cells[0]) : null);
  };

  const markBlockCompleted = (block: BeadingBlock | null) => {
    if (!block) return;
    const blockCellKeys = block.cells.map(getCellCoordKey);
    setCompletedCellKeys((current) => {
      const next = new Set(current);
      for (const key of blockCellKeys) next.add(key);
      return Array.from(next);
    });
  };

  const gotoBlock = (direction: 'prev' | 'next') => {
    if (planBlocks.length === 0) return;

    const currentIndex = currentBlockIndex >= 0 ? currentBlockIndex : -1;
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (direction === 'next') {
      markBlockCompleted(currentBlock);
    }

    if (nextIndex >= 0 && nextIndex < planBlocks.length) {
      const nextBlock = planBlocks[nextIndex];
      setFocusWindowOverride(null);
      setActiveColorKey(nextBlock.colorKey);
      setActiveCellKey(nextBlock.cells[0] ? getCellCoordKey(nextBlock.cells[0]) : null);
    }
  };

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!patternResult || !canvas) {
      setFloatPreviewDataUrl(null);
      return;
    }

    const width = Math.max(240, Math.min(720, patternResult.width * 18));
    const height = Math.max(240, Math.min(720, patternResult.height * 18));
    canvas.width = width;
    canvas.height = height;
    drawPatternPreview({
      canvas,
      pattern: patternResult,
      activeColorKey: effectiveActiveColorKey,
      activeBlockCellKeys: currentBlock?.cells.map(getCellCoordKey) ?? [],
      completedCellKeys,
      activeOpacity: 0.5,
      completedOverlayColor: '#86EFAC',
      separator: {
        visible: toggles.separator,
        interval: separatorInterval,
        color: separatorColor,
      },
      viewport: effectiveActiveColorKey ? effectiveFocusWindowBounds : null,
    });
    const dataUrl = canvas.toDataURL('image/png');
    previewImageDataUrlRef.current = dataUrl;
    setFloatPreviewDataUrl(dataUrl);
  }, [activeCellKey, completedCellKeys, currentBlock, effectiveActiveColorKey, effectiveFocusWindowBounds, patternResult, separatorColor, separatorInterval, toggles.separator]);

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: previewPos.x,
      originY: previewPos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    setPreviewPos({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleFocusPanStart = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!effectiveActiveColorKey || !effectiveFocusWindowBounds) return;
    setFocusPan({
      isDragging: true,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: effectiveFocusWindowBounds.startX,
      originY: effectiveFocusWindowBounds.startY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFocusPanMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!effectiveActiveColorKey || !focusPan || !effectiveFocusWindowBounds || !panBounds || !mainCanvasRef.current || !patternResult) return;
    const canvas = mainCanvasRef.current;
    const tileSize = 28;
    const rulerThickness = 18;
    const rect = canvas.getBoundingClientRect();
    const visibleTileSize = Math.max(1, Math.min(rect.width, rect.height) / (effectiveFocusWindowBounds.size + rulerThickness / tileSize));
    const deltaX = Math.round((event.clientX - focusPan.startClientX) / visibleTileSize);
    const deltaY = Math.round((event.clientY - focusPan.startClientY) / visibleTileSize);
    const nextStartX = Math.max(panBounds.minX, Math.min(panBounds.maxX, focusPan.originX - deltaX));
    const nextStartY = Math.max(panBounds.minY, Math.min(panBounds.maxY, focusPan.originY - deltaY));
    const nextWindowBounds = {
      startX: nextStartX,
      startY: nextStartY,
      size: effectiveFocusWindowBounds.size,
    };
    setFocusWindowOverride({ startX: nextStartX, startY: nextStartY });
    drawPatternFocusZoomView({
      canvas,
      pattern: patternResult,
      blockCells: activeBlockCells,
      activeColorKey: effectiveActiveColorKey,
      windowBounds: nextWindowBounds,
      rulerPosition: focusRulerPosition ?? undefined,
      completedCellKeys,
      tileSize,
      rulerThickness,
    });
  };

  const handleFocusPanEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setFocusPan(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const moveFocusWindow = (axis: 'x' | 'y') => {
    if (!effectiveActiveColorKey || !effectiveFocusWindowBounds || !panBounds) return;
    const step = effectiveFocusWindowBounds.size;
    const currentStartX = effectiveFocusWindowBounds.startX;
    const currentStartY = effectiveFocusWindowBounds.startY;
    let nextStartX = currentStartX;
    let nextStartY = currentStartY;

    if (axis === 'x') {
      if (focusWindowAnchor === 'top-right') {
        nextStartX = currentStartX <= panBounds.minX ? panBounds.maxX : Math.max(panBounds.minX, currentStartX - step);
      } else {
        nextStartX = currentStartX >= panBounds.maxX ? panBounds.minX : Math.min(panBounds.maxX, currentStartX + step);
      }
    } else {
      nextStartY = currentStartY >= panBounds.maxY ? panBounds.minY : Math.min(panBounds.maxY, currentStartY + step);
    }

    setFocusWindowOverride({ startX: nextStartX, startY: nextStartY });
  };

  const canMoveFocusX = Boolean(effectiveActiveColorKey && panBounds && panBounds.maxX > panBounds.minX);
  const canMoveFocusY = Boolean(effectiveActiveColorKey && panBounds && panBounds.maxY > panBounds.minY);
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
    <main className={styles.page} aria-label="专注模式页面">
      <header className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <button type="button" className={styles.backButton} onClick={handleBack} aria-label="返回上一页">
            <img src={GO_BACK_ICON} alt="" />
          </button>
          <div className={styles.titlebarText}>
            <h1>专注模式</h1>
          </div>
        </div>

        <div className={styles.titlebarCenter} aria-label="图纸完成度">
          <div className={styles.progressMeta}>
            <span className={styles.progressPercent}>{overallProgressPercent}%</span>
            <span className={styles.progressLabel}>{hasPattern ? `总进度 ${completedPatternCells}/${totalPatternCells}` : '等待图纸载入'}</span>
          </div>
          <div className={styles.progressBarTrack} role="progressbar" aria-label="图纸完成度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgressPercent}>
            <div className={styles.progressBarFill} style={{ width: `${overallProgressPercent}%` }} />
          </div>
        </div>

        <div className={styles.titlebarRight}>
          <div className={styles.colorProgressChip} aria-label="颜色完成进度">
            <span>{completedColorCount}</span>
            <span>/</span>
            <span>{totalColorCount}</span>
            <span>色</span>
          </div>
          <button type="button" className={styles.settingsButton} onClick={() => setSettingsOpen(true)} aria-label="打开设置">
            ⚙
          </button>
          {isHydrating ? <div className={styles.loadingBadge}>加载中...</div> : null}
        </div>
      </header>

      <section className={styles.currentColorSection} aria-label="当前正在拼的颜色">
        <div className={styles.currentColorCard}>
          <div className={styles.currentColorBadge}>当前</div>
          <div className={styles.currentColorDotWrap}>
            <div className={`${styles.currentColorDot} ${currentColor ? styles.currentColorDotPulse : ''}`} style={{ background: currentColor?.hex ?? '#D8B4E2' }} />
          </div>
          <div className={styles.currentColorInfo}>
            <div className={styles.currentColorCode}>{currentColor?.vendorCode ?? '等待图纸'}</div>
            <div className={styles.currentColorName}>{currentColor ? `#${currentColor.hex.replace('#', '')}` : '图纸加载后显示当前颜色'}</div>
            <div className={styles.currentColorCount}>{currentColor ? `${currentColor.count} 粒` : '—'}</div>
            <div className={styles.currentColorCount}>{currentStepLabel}</div>
            {activeGroup ? <div className={styles.currentColorCount}>当前分组剩余 {remainingCellsCount} 颗</div> : null}
          </div>
          <div className={styles.currentColorArrow}>→</div>
          <div className={styles.nextColorCard}>
            <div className={styles.nextColorLabel}>NEXT</div>
            <div className={styles.nextColorDot} style={{ background: nextColor?.hex ?? currentColor?.hex ?? '#D8B4E2' }} />
            <div className={styles.nextColorCode}>{nextColor?.vendorCode ?? '完成'}</div>
          </div>
        </div>
      </section>

      <section className={styles.canvasSection} aria-label="图纸区域">
        <div className={styles.canvasPlaceholder}>
          {hasPattern ? (
            <div className={styles.canvasPreviewWrap}>
              <canvas
                ref={mainCanvasRef}
                className={styles.canvasPreview}
                aria-label="局部放大图纸画布"
                onPointerDown={handleFocusPanStart}
                onPointerMove={handleFocusPanMove}
                onPointerUp={handleFocusPanEnd}
                onPointerCancel={handleFocusPanEnd}
              />
              <canvas ref={previewCanvasRef} className={styles.previewCanvasHidden} aria-hidden="true" />
            </div>
          ) : (
            <div className={styles.placeholderCard}>
              <p className={styles.placeholderLabel}>{isHydrating ? '正在加载' : '图纸区域'}</p>
              <h2>{isHydrating ? '正在载入图纸数据…' : '还没有可显示的图纸'}</h2>
              <p className={styles.placeholderHint}>{isHydrating ? '系统正在从当前拼豆项目中读取图纸数据。' : '请先在工坊中生成图纸结果，再进入专注模式。'}</p>
            </div>
          )}
        </div>
      </section>

      <section className={styles.paletteSection} aria-label="色块区域">
        <div className={styles.paletteStrip}>
          {palette.length > 0 ? (
            palette.map((item) => {
              const colorKey = `${item.colorId}-${item.vendorCode}-${item.hex}`;
              const isActive = effectiveActiveColorKey === colorKey;
              const colorCellKeys = colorCellsByKey.get(colorKey);
              const completedCellsForColor = colorCellKeys ? Array.from(colorCellKeys).filter((key) => completedCellSet.has(key)).length : 0;
              const ringProgress = colorCellKeys && colorCellKeys.size > 0 ? completedCellsForColor / colorCellKeys.size : 0;
              const isCompleted = ringProgress >= 1;
              return (
                <button
                  key={`${item.vendorCode}-${item.hex}`}
                  type="button"
                  className={`${styles.paletteDotButton} ${isActive ? styles.paletteDotButtonActive : ''} ${isCompleted ? styles.paletteDotButtonCompleted : ''}`}
                  aria-label={item.vendorCode}
                  aria-pressed={isActive}
                  title={item.vendorCode}
                  onClick={() => activateColor(colorKey)}
                >
                  <span className={styles.paletteDotWrap}>
                    <svg className={styles.paletteDotRing} viewBox="0 0 48 48" aria-hidden="true">
                      <circle className={styles.paletteDotRingTrack} cx="24" cy="24" r="20" />
                      <circle
                        className={styles.paletteDotRingBar}
                        cx="24"
                        cy="24"
                        r="20"
                        style={{ strokeDashoffset: `${125.66 - ringProgress * 125.66}` }}
                      />
                    </svg>
                    <span className={styles.paletteDot} style={{ background: item.hex }}>
                      {toggles.label ? <span className={styles.paletteDotLabel}>{item.vendorCode}</span> : null}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className={styles.paletteEmpty}>图纸加载后，这里会展示当前图纸使用的全部颜色。</div>
          )}
        </div>
      </section>

      <div className={styles.previewFloat} aria-label="图纸预览浮层" style={{ transform: `translate(${previewPos.x}px, ${previewPos.y}px)` }}>
        <div className={styles.previewFrame} onPointerDown={handlePreviewPointerDown} onPointerMove={handlePreviewPointerMove} onPointerUp={handlePreviewPointerUp} onPointerCancel={handlePreviewPointerUp}>
          <div className={styles.previewFrame__canvas}>{floatPreviewDataUrl ? <img className={styles.previewFrame__canvasImg} src={floatPreviewDataUrl} alt="图纸预览" /> : null}</div>
        </div>
      </div>

      <footer className={styles.toolbarSection} aria-label="操作面板">
        <div className={styles.gamepadPanel}>
          <div className={styles.gamepadPanel__cluster}>
            <button type="button" className={styles.gamepadPanel__action} aria-label="横向移动图纸" disabled={!canMoveFocusX} onClick={() => moveFocusWindow('x')}>
              横
            </button>
            <button type="button" className={styles.gamepadPanel__action} aria-label="纵向移动图纸" disabled={!canMoveFocusY} onClick={() => moveFocusWindow('y')}>
              纵
            </button>
          </div>

          <div className={styles.gamepadPanel__mainGroup}>
            <button type="button" className={styles.gamepadPanel__secondaryButton} onClick={() => gotoBlock('prev')}>
              上一块
            </button>
            <button type="button" className={styles.gamepadPanel__primaryButton} onClick={() => gotoBlock('next')}>
              下一块
            </button>
          </div>
        </div>
      </footer>

      <div className={`${styles.settingsOverlay} ${settingsOpen ? styles.settingsOverlayOpen : ''}`} role="presentation" onClick={() => setSettingsOpen(false)}>
        <aside className={`${styles.settingsPanel} ${settingsOpen ? styles.settingsPanelOpen : ''}`} role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => event.stopPropagation()}>
          <div className={styles.settingsHeader}>
            <div className={styles.settingsTitle}>
              <div className={styles.settingsTitleIcon} aria-hidden="true">
                ⚙
              </div>
              拼豆设置
            </div>
            <button type="button" className={styles.settingsCloseButton} onClick={() => setSettingsOpen(false)} aria-label="关闭设置">
              ×
            </button>
          </div>

          <div className={styles.settingsBody}>
            <section>
              <div className={styles.settingsSectionTitle}>📋 拼豆方案</div>
              <div className={styles.modeOptions}>
                {[
                  { id: 'smart', icon: '✨', name: '智能模式', desc: '根据图纸自动推荐拼豆方案', color: '#EEF0FF' },
                  { id: 'color-block', icon: '🎨', name: '色块优先', desc: '按颜色分组，一次拼完一种颜色', color: '#F5E6FA' },
                  { id: 'edge-first', icon: '🔲', name: '边缘优先', desc: '先完成图案边缘，再填充内部', color: '#E8F8F3' },
                  { id: 'region-first', icon: '📍', name: '区域优先', desc: '按区块划分，逐区域完成', color: '#FFF3EC' },
                  { id: 'row-by-row', icon: '↕', name: '逐行、逐列模式', desc: '按行或按列顺序进行拼豆', color: '#F2F7EA' },
                ].map((item) => (
                  <button key={item.id} type="button" className={`${styles.modeOption} ${patternMode === item.id ? styles.modeOptionActive : ''}`} onClick={() => setPatternMode(item.id as PatternMode)}>
                    <div className={styles.modeOptionIcon} style={{ background: item.color }}>
                      {item.icon}
                    </div>
                    <div className={styles.modeOptionText}>
                      <div className={styles.modeOptionName}>{item.name}</div>
                      <div className={styles.modeOptionDesc}>{item.desc}</div>
                    </div>
                    <div className={styles.modeRadio} />
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className={styles.settingsSectionTitle}>🎮 操作模式</div>
              <div className={styles.handednessRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>操作习惯</div>
                  <div className={styles.toggleDesc}>根据你的握持习惯切换面板布局</div>
                </div>
                <div className={styles.handednessSwitch} role="group" aria-label="操作习惯">
                  <button type="button" className={`${styles.handednessOption} ${handedness === 'left' ? styles.isOn : ''}`} onClick={() => setHandedness('left')} aria-label="左手模式">
                    左手
                  </button>
                  <button type="button" className={`${styles.handednessOption} ${handedness === 'right' ? styles.isOn : ''}`} onClick={() => setHandedness('right')} aria-label="右手模式">
                    右手
                  </button>
                </div>
              </div>
            </section>

            <section>
              <div className={styles.settingsSectionTitle}>🧩 分块规则</div>
              <div className={styles.handednessRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>相邻连接</div>
                  <div className={styles.toggleDesc}>控制同色豆子如何合并成块</div>
                </div>
                <div className={styles.handednessSwitch} role="group" aria-label="相邻连接">
                  {(['smart', '4', '8'] as BeadingConnectivity[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.handednessOption} ${connectivity === item ? styles.isOn : ''}`}
                      onClick={() => setConnectivity(item)}
                      aria-label={`${item} 连通`}
                    >
                      {item === 'smart' ? '智能' : `${item}向`}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.handednessRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>逐行方向</div>
                  <div className={styles.toggleDesc}>逐行模式下按行或按列推进</div>
                </div>
                <div className={styles.handednessSwitch} role="group" aria-label="逐行方向">
                  <button type="button" className={`${styles.handednessOption} ${rowAxis === 'row' ? styles.isOn : ''}`} onClick={() => setRowAxis('row')} aria-label="按行">
                    按行
                  </button>
                  <button type="button" className={`${styles.handednessOption} ${rowAxis === 'column' ? styles.isOn : ''}`} onClick={() => setRowAxis('column')} aria-label="按列">
                    按列
                  </button>
                </div>
              </div>
            </section>

            <section>
              <div className={styles.settingsSectionTitle}>🖼️ 显示设置</div>
              <div className={styles.handednessRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>页面格数</div>
                  <div className={styles.toggleDesc}>控制主区域一次显示多少个格子</div>
                </div>
                <div className={`${styles.handednessSwitch} ${styles.gridSizeSwitch}`} role="group" aria-label="页面格数">
                  {focusGridSizeOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.handednessOption} ${styles.gridSizeOption} ${focusGridSize === item ? styles.isOn : ''}`}
                      onClick={() => setFocusGridSize(item)}
                      aria-label={`${item} x ${item}`}
                      aria-pressed={focusGridSize === item}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.toggleRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>显示色号标记</div>
                  <div className={styles.toggleDesc}>在豆粒上显示色号文字</div>
                </div>
                <button className={`${styles.toggleSwitch} ${toggles.label ? styles.isOn : ''}`} type="button" aria-label="显示色号标记" aria-pressed={toggles.label} onClick={() => setToggles((current) => ({ ...current, label: !current.label }))} />
              </div>
            </section>

            <section>
              <div className={styles.settingsSectionTitle}>▦ 分割线设置</div>
              <div className={styles.toggleRow}>
                <div className={styles.toggleInfo}>
                  <div className={styles.toggleName}>显示分割线</div>
                  <div className={styles.toggleDesc}>按固定网格间隔显示辅助分割线</div>
                </div>
                <button className={`${styles.toggleSwitch} ${toggles.separator ? styles.isOn : ''}`} type="button" aria-label="显示分割线" aria-pressed={toggles.separator} onClick={() => setToggles((current) => ({ ...current, separator: !current.separator }))} />
              </div>

              <div className={styles.sliderCard}>
                <div className={styles.sliderHeader}>
                  <div className={styles.toggleName}>每隔几个网格画一条</div>
                  <span className={styles.sliderValueChip}>{separatorInterval}</span>
                </div>
                <input className={styles.sliderInput} type="range" min={2} max={24} step={1} value={separatorInterval} onChange={(event) => setSeparatorInterval(Number(event.target.value))} aria-label="每隔几个网格画一条" disabled={!toggles.separator} />
              </div>

              <div className={styles.colorCard}>
                <div className={styles.toggleName}>分割线颜色</div>
                <div className={styles.colorRow} role="list" aria-label="分割线颜色预设">
                  {separatorColorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.colorPreset} ${separatorColor === option.value ? styles.colorPresetActive : ''}`}
                      style={{ backgroundColor: option.value }}
                      aria-label={option.label}
                      aria-pressed={separatorColor === option.value}
                      onClick={() => setSeparatorColor(option.value)}
                      disabled={!toggles.separator}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
