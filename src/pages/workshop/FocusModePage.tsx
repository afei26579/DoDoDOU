import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { WorkshopBeadingProgress } from '../../features/workshop/model/types';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import { drawPatternFocusZoomView, getFocusPanBounds, getFocusWindowBounds, getQuadrant } from '../../lib/pattern/focusZoom';
import { drawPatternPreview } from '../../lib/pattern/preview';
import styles from './FocusModePage.module.css';

type PatternMode = 'smart' | 'color-block' | 'edge-first' | 'region-first' | 'row-by-row';

type ToggleKey = 'label' | 'separator';

type SeparatorColorOption = {
  label: string;
  value: string;
};

type PaletteItem = {
  colorId: string;
  vendorCode: string;
  hex: string;
  count: number;
};

type PatternCell = {
  x: number;
  y: number;
  colorId: string;
  vendorCode: string;
  hex: string;
  isExternal?: boolean;
};

type OrderedBlock = {
  key: string;
  cells: PatternCell[];
  anchorX: number;
  anchorY: number;
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

function getCellKey(cell: { colorId: string; vendorCode: string; hex: string }) {
  return `${cell.colorId}-${cell.vendorCode}-${cell.hex}`;
}

function isTransparentCellHex(hex: string) {
  return hex === 'transparent';
}

function isPatternMode(value: string): value is PatternMode {
  return patternModes.includes(value as PatternMode);
}

type CellCoordinate = {
  x: number;
  y: number;
};

function sortCellsByHandedness<T extends CellCoordinate>(cells: T[], handedness: 'left' | 'right') {
  return [...cells].sort((a, b) => {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== b.x) {
      return handedness === 'left' ? b.x - a.x : a.x - b.x;
    }
    return 0;
  });
}

function getNeighborKey(x: number, y: number, dx: number, dy: number) {
  return `${x + dx},${y + dy}`;
}

function buildConnectedBlocks(cells: PatternCell[], handedness: 'left' | 'right') {
  const cellMap = new Map<string, PatternCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.x},${cell.y}`, cell);
  }

  const visited = new Set<string>();
  const blocks: OrderedBlock[] = [];

  for (const cell of cells) {
    const seedKey = `${cell.x},${cell.y}`;
    if (visited.has(seedKey)) continue;

    const queue: PatternCell[] = [cell];
    const connected: PatternCell[] = [];
    visited.add(seedKey);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      connected.push(current);

      const neighbors = [
        cellMap.get(getNeighborKey(current.x, current.y, 0, -1)),
        cellMap.get(getNeighborKey(current.x, current.y, 1, 0)),
        cellMap.get(getNeighborKey(current.x, current.y, 0, 1)),
        cellMap.get(getNeighborKey(current.x, current.y, -1, 0)),
      ];

      for (const neighbor of neighbors) {
        if (!neighbor) continue;
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (visited.has(neighborKey)) continue;
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }

    const orderedConnected = sortCellsByHandedness(connected, handedness);
    const anchor = orderedConnected[0] ?? cell;
    blocks.push({
      key: `${cell.colorId}-${cell.vendorCode}-${cell.hex}-${anchor.x},${anchor.y}`,
      cells: orderedConnected,
      anchorX: anchor.x,
      anchorY: anchor.y,
    });
  }

  return blocks.sort((a, b) => {
    if (a.anchorX !== b.anchorX) return handedness === 'left' ? b.anchorX - a.anchorX : a.anchorX - b.anchorX;
    if (a.anchorY !== b.anchorY) return a.anchorY - b.anchorY;
    return 0;
  });
}

export function FocusModePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [patternMode, setPatternMode] = useState<PatternMode>('smart');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    label: false,
    separator: true,
  });
  const [separatorInterval, setSeparatorInterval] = useState(10);
  const [separatorColor, setSeparatorColor] = useState(separatorColorOptions[0].value);
  const [handedness, setHandedness] = useState<'left' | 'right'>('left');
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
      paperState: state.paperState,
      beadingState: state.beadingState,
      hasPatternResult: Boolean(patternResult),
      viewMode: state.viewMode,
    });
  }, [patternResult, projectId, state.beadingState, state.paperState, state.viewMode]);
  const hasPattern = Boolean(patternResult && patternResult.cells.length > 0);
  const palette = useMemo(() => {
    if (!patternResult) return [];

    const paletteByKey = new Map<string, PaletteItem>();

    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || isTransparentCellHex(cell.hex)) continue;
      const normalizedHex = cell.hex.startsWith('#') ? cell.hex : `#${cell.hex}`;
      const key = `${cell.colorId}-${cell.vendorCode}-${normalizedHex}`;
      const next = paletteByKey.get(key) ?? {
        colorId: cell.colorId,
        vendorCode: cell.vendorCode,
        hex: normalizedHex,
        count: 0,
      };
      next.count += 1;
      paletteByKey.set(key, next);
    }

    return Array.from(paletteByKey.values()).sort((a, b) => b.count - a.count);
  }, [patternResult]);

  const totalPatternCells = useMemo(() => {
    if (!patternResult) return 0;
    return patternResult.cells.filter((cell) => !cell.isExternal && cell.vendorCode && cell.hex && !isTransparentCellHex(cell.hex)).length;
  }, [patternResult]);

  const patternCellKeySet = useMemo(() => {
    const keys = new Set<string>();
    if (!patternResult) return keys;
    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || isTransparentCellHex(cell.hex)) continue;
      keys.add(`${cell.x},${cell.y}`);
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
  const completedColorCount = completedColorKeys.length;
  const totalColorCount = palette.length;

  const orderedColorEntries = useMemo(() => {
    if (!patternResult) return [] as { colorKey: string; blocks: OrderedBlock[]; cells: PatternCell[] }[];

    const cellsByColor = new Map<string, PatternCell[]>();
    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || isTransparentCellHex(cell.hex)) continue;
      const colorKey = getCellKey(cell);
      const bucket = cellsByColor.get(colorKey) ?? [];
      bucket.push(cell);
      cellsByColor.set(colorKey, bucket);
    }

    const colorOrder = [...palette].sort((a, b) => b.count - a.count);
    return colorOrder.map((item) => {
      const colorKey = `${item.colorId}-${item.vendorCode}-${item.hex}`;
      const cells = sortCellsByHandedness(cellsByColor.get(colorKey) ?? [], handedness);
      const blocks = buildConnectedBlocks(cells as PatternCell[], handedness);
      return { colorKey, blocks, cells: cells as PatternCell[] };
    });
  }, [handedness, palette, patternResult]);

  useEffect(() => {
    if (!patternResult || palette.length === 0) {
      setActiveColorKey(null);
      setActiveCellKey(null);
      setCompletedColorKeys([]);
      setCompletedCellKeys([]);
      return;
    }

    const validColorKeys = new Set(orderedColorEntries.map((item) => item.colorKey));
    setCompletedColorKeys((current) => current.filter((key) => validColorKeys.has(key)));
    setCompletedCellKeys((current) => current.filter((key) => patternCellKeySet.has(key)));

    if (activeColorKey && !validColorKeys.has(activeColorKey)) {
      setActiveColorKey(null);
      setActiveCellKey(null);
    }
  }, [activeColorKey, orderedColorEntries, palette, patternCellKeySet, patternResult]);

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
    const validColorKeys = new Set(orderedColorEntries.map((item) => item.colorKey));
    setPatternMode(isPatternMode(progress.mode) ? progress.mode : 'smart');
    setHandedness(progress.handedness === 'right' ? 'right' : 'left');
    setActiveColorKey(progress.activeColorKey && validColorKeys.has(progress.activeColorKey) ? progress.activeColorKey : null);
    setActiveCellKey(progress.activeCellKey && patternCellKeySet.has(progress.activeCellKey) ? progress.activeCellKey : null);
    setCompletedColorKeys(progress.completedColorKeys.filter((key) => validColorKeys.has(key)));
    setCompletedCellKeys(progress.completedCellKeys.filter((key) => patternCellKeySet.has(key)));
  }, [isHydrating, orderedColorEntries, patternCellKeySet, patternResult, projectId, state.beadingProgress]);

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
        completedColorKeys: Array.from(new Set(completedColorKeys)),
        completedCellKeys: normalizedCompletedCellKeys,
        percent: overallProgressPercent,
        mode: patternMode,
        handedness,
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
    completedColorKeys,
    handedness,
    isHydrating,
    normalizedCompletedCellKeys,
    overallProgressPercent,
    patternMode,
    patternResult,
    projectId,
    totalPatternCells,
  ]);

  const currentColor = useMemo(
    () => palette.find((item) => `${item.colorId}-${item.vendorCode}-${item.hex}` === activeColorKey) ?? null,
    [activeColorKey, palette],
  );

  const activeColorEntry = useMemo(
    () => orderedColorEntries.find((item) => item.colorKey === activeColorKey) ?? null,
    [orderedColorEntries, activeColorKey],
  );

  const currentBlockIndex = useMemo(() => {
    if (!activeColorEntry || !activeCellKey) return -1;
    return activeColorEntry.blocks.findIndex((block) => block.cells.some((cell) => `${cell.x},${cell.y}` === activeCellKey));
  }, [activeCellKey, activeColorEntry]);

  const activeBlockCount = activeColorEntry?.blocks.length ?? 0;
  const currentBlock = currentBlockIndex >= 0 ? activeColorEntry?.blocks[currentBlockIndex] ?? null : null;
  const activeBlockCells = currentBlock?.cells ?? [];
  const focusWindowAnchor = handedness === 'left' ? 'top-right' : 'top-left';
  const focusWindowBounds = useMemo(() => {
    if (!patternResult || activeBlockCells.length === 0) return null;
    return getFocusWindowBounds(patternResult, activeBlockCells, 10, focusWindowAnchor);
  }, [activeBlockCells, focusWindowAnchor, patternResult]);
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

    if (!activeColorKey || !activeBlockCells.length || !effectiveFocusWindowBounds || !focusRulerPosition) {
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
      activeColorKey,
      windowBounds: effectiveFocusWindowBounds,
      rulerPosition: focusRulerPosition,
      completedCellKeys,
      tileSize: 28,
      rulerThickness: 18,
    });
  }, [activeBlockCells, activeColorKey, completedCellKeys, effectiveFocusWindowBounds, focusRulerPosition, patternResult, separatorColor, separatorInterval, toggles.separator]);

  const completedCellsBeforeCurrentBlock = useMemo(() => {
    if (!activeColorEntry || currentBlockIndex < 0) return 0;
    if (activeCellKey && currentBlock) {
      const currentBlockCellIndex = currentBlock.cells.findIndex((cell) => `${cell.x},${cell.y}` === activeCellKey);
      if (currentBlockCellIndex >= 0) {
        return activeColorEntry.blocks.slice(0, currentBlockIndex).reduce((sum, block) => sum + block.cells.length, 0) + currentBlockCellIndex;
      }
    }
    return activeColorEntry.blocks.slice(0, currentBlockIndex).reduce((sum, block) => sum + block.cells.length, 0);
  }, [activeCellKey, activeColorEntry, currentBlock, currentBlockIndex]);
  const activeBlockProgress = activeColorEntry && activeColorEntry.cells.length > 0 ? completedCellsBeforeCurrentBlock / activeColorEntry.cells.length : 0;
  const remainingCellsCount = activeColorEntry ? Math.max(activeColorEntry.cells.length - completedCellsBeforeCurrentBlock, 0) : 0;

  const activeColorIndex = activeColorKey ? orderedColorEntries.findIndex((item) => item.colorKey === activeColorKey) : -1;
  const isCurrentColorCompleted = activeColorKey ? completedColorKeys.includes(activeColorKey) : false;

  const currentStepLabel = useMemo(() => {
    if (!activeColorEntry) return '请选择一个色号';
    if (!activeCellKey || currentBlockIndex < 0) return `当前色号，共 ${activeBlockCount} 块`;
    return `第 ${currentBlockIndex + 1} / ${activeBlockCount} 块`;
  }, [activeBlockCount, activeCellKey, activeColorEntry, currentBlockIndex]);

  const activateColor = (colorKey: string) => {
    const nextEntry = orderedColorEntries.find((item) => item.colorKey === colorKey) ?? null;
    const firstBlock = nextEntry?.blocks[0] ?? null;
    setFocusWindowOverride(null);
    setActiveColorKey(colorKey);
    setActiveCellKey(firstBlock ? `${firstBlock.cells[0]?.x},${firstBlock.cells[0]?.y}` : null);
  };

  const markBlockCompleted = (block: OrderedBlock | null) => {
    if (!activeColorEntry || !block) return;
    const blockCellKeys = block.cells.map((cell) => `${cell.x},${cell.y}`);
    setCompletedCellKeys((current) => {
      const next = new Set(current);
      for (const key of blockCellKeys) next.add(key);
      return Array.from(next);
    });
  };

  const gotoBlock = (direction: 'prev' | 'next') => {
    if (!activeColorEntry || activeColorEntry.blocks.length === 0) return;

    const currentIndex = currentBlockIndex >= 0 ? currentBlockIndex : -1;
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (direction === 'next') {
      markBlockCompleted(currentBlock);
    }

    if (nextIndex >= 0 && nextIndex < activeColorEntry.blocks.length) {
      const nextBlock = activeColorEntry.blocks[nextIndex];
      setFocusWindowOverride(null);
      setActiveCellKey(`${nextBlock.cells[0]?.x},${nextBlock.cells[0]?.y}`);
      return;
    }

    const currentColorIndex = activeColorKey
      ? orderedColorEntries.findIndex((item) => item.colorKey === activeColorKey)
      : -1;

    if (direction === 'next') {
      if (currentColorIndex >= 0) {
        const currentColorKey = orderedColorEntries[currentColorIndex]?.colorKey;
        if (currentColorKey) {
          setCompletedColorKeys((current) => (current.includes(currentColorKey) ? current : [...current, currentColorKey]));
        }
      }
      const nextColor = orderedColorEntries[currentColorIndex + 1];
      if (nextColor) {
        const firstBlock = nextColor.blocks[0] ?? null;
        setFocusWindowOverride(null);
        setActiveColorKey(nextColor.colorKey);
        setActiveCellKey(firstBlock ? `${firstBlock.cells[0]?.x},${firstBlock.cells[0]?.y}` : null);
      }
      return;
    }

    const prevColor = orderedColorEntries[currentColorIndex - 1];
    if (prevColor) {
      const prevBlock = prevColor.blocks[prevColor.blocks.length - 1] ?? null;
      setFocusWindowOverride(null);
      setActiveColorKey(prevColor.colorKey);
      setActiveCellKey(prevBlock ? `${prevBlock.cells[0]?.x},${prevBlock.cells[0]?.y}` : null);
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
      activeColorKey,
      activeBlockCellKeys: currentBlock?.cells.map((cell) => `${cell.x},${cell.y}`) ?? [],
      completedCellKeys,
      activeOpacity: 0.5,
      completedOverlayColor: '#86EFAC',
      separator: {
        visible: toggles.separator,
        interval: separatorInterval,
        color: separatorColor,
      },
      viewport: activeColorKey ? effectiveFocusWindowBounds : null,
    });
    const dataUrl = canvas.toDataURL('image/png');
    previewImageDataUrlRef.current = dataUrl;
    setFloatPreviewDataUrl(dataUrl);
  }, [activeCellKey, activeColorEntry, activeColorKey, completedCellKeys, currentBlock, effectiveFocusWindowBounds, patternResult, separatorColor, separatorInterval, toggles.separator]);

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
    if (!activeColorKey || !effectiveFocusWindowBounds) return;
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
    if (!activeColorKey || !focusPan || !effectiveFocusWindowBounds || !panBounds || !mainCanvasRef.current || !patternResult) return;
    const canvas = mainCanvasRef.current;
    const tileSize = 28;
    const deltaX = Math.round((event.clientX - focusPan.startClientX) / tileSize);
    const deltaY = Math.round((event.clientY - focusPan.startClientY) / tileSize);
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
      activeColorKey,
      windowBounds: nextWindowBounds,
      rulerPosition: focusRulerPosition ?? undefined,
      completedCellKeys,
      tileSize,
      rulerThickness: 18,
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
    if (!activeColorKey || !effectiveFocusWindowBounds || !panBounds) return;
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

  const canMoveFocusX = Boolean(activeColorKey && panBounds && panBounds.maxX > panBounds.minX);
  const canMoveFocusY = Boolean(activeColorKey && panBounds && panBounds.maxY > panBounds.minY);
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
            ←
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
            {activeColorEntry ? <div className={styles.currentColorCount}>当前色块剩余 {remainingCellsCount} 颗</div> : null}
          </div>
          <div className={styles.currentColorArrow}>→</div>
          <div className={styles.nextColorCard}>
            <div className={styles.nextColorLabel}>NEXT</div>
            <div className={styles.nextColorDot} style={{ background: palette[activeColorIndex + 1]?.hex ?? currentColor?.hex ?? '#D8B4E2' }} />
            <div className={styles.nextColorCode}>{palette[activeColorIndex + 1]?.vendorCode ?? '完成'}</div>
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
              const isActive = activeColorKey === colorKey;
              const isCompleted = activeColorKey === colorKey ? isCurrentColorCompleted : completedColorKeys.includes(colorKey);
              const ringProgress = isCompleted ? 1 : isActive ? Math.max(0, Math.min(1, activeBlockProgress)) : 0;
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
              <div className={styles.settingsSectionTitle}>🖼️ 显示设置</div>
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
