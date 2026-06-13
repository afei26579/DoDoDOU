import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { waitForLoadingPaint } from '../../lib/imageFile';
import { buildPalette, getVendorCode, hexToRgb, type PatternPaletteColor } from '../../lib/pattern/color-system';
import { getBeadBrandLabel } from '../../lib/pattern/brand';
import { ALL_PALETTE_GROUP, buildPaletteGroups, getPaletteGroupForCode } from '../../lib/pattern/palette-groups';
import { removePatternBackground } from '../../lib/pattern/remove-background';
import { LoadingOverlay } from '../../shared/ui/LoadingOverlay';
import {
  createEmptyGrid,
  floodFill,
  paintGridCellsToCanvas,
  paintGridToCanvas,
  TRANSPARENT_GRID_LIGHT,
  toCellPoint,
  type EditorCanvasRenderMeta,
  type EditorBackgroundMode,
  type EditorBeadShape,
} from './editor/WorkshopEditor.utils';

type Tool = 'brush' | 'eraser' | 'fill' | 'picker' | 'pan' | 'select';
type EraserMode = 'brush' | 'area';
type SelectionOperation = 'copy' | 'move';

type SelectionRect = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

type SelectionClipboard = {
  rect: SelectionRect;
  cells: string[][];
};

type SelectionGesture =
  | {
      kind: 'draw';
      pointerId: number;
      startCell: { row: number; col: number };
      currentCell: { row: number; col: number };
    }
  | {
      kind: 'place';
      pointerId: number;
      startCell: { row: number; col: number };
      originRect: SelectionRect;
      currentRect: SelectionRect;
      sourceRect: SelectionRect;
      cells: string[][];
      operation: SelectionOperation;
    };

type DragState = {
  kind: 'paint' | 'pan' | 'toolbar';
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originOffsetX: number;
  originOffsetY: number;
  currentOffsetX?: number;
  currentOffsetY?: number;
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
  tool: Exclude<Tool, 'pan' | 'select'>;
  cell: { row: number; col: number };
  clientX: number;
  clientY: number;
};

type EditorRulerLabel = {
  key: string;
  value: number;
  x: number;
  y: number;
  major: boolean;
  current: boolean;
};

type EditorRulerData = {
  columns: EditorRulerLabel[];
  rows: EditorRulerLabel[];
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
  removeBg: '/assets/pngs/remove_bg.png',
  stroke: '/assets/pngs/Stroke.png',
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

function SelectionToolIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 5h14v14H5z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EditTitleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 16.8V20h3.2L18.7 8.5l-3.2-3.2L4 16.8Z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m14.6 6.2 3.2 3.2" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon?: ReactNode; iconSrc?: string }> = [
  { id: 'brush', label: '画笔', iconSrc: ICONS.brush },
  { id: 'eraser', label: '橡皮', iconSrc: ICONS.eraser },
  { id: 'fill', label: '填充', iconSrc: ICONS.fill },
  { id: 'picker', label: '取色', iconSrc: ICONS.picker },
  { id: 'select', label: '框选', icon: <SelectionToolIcon /> },
  { id: 'pan', label: '平移', iconSrc: ICONS.pan },
];

const DEFAULT_COLORS = ['#000000', '#FFFFFF', '#FF6600', '#FFDAC1', '#D8B4E2'];
const HISTORY_LIMIT = 80;
const SAVE_DEBOUNCE_MS = 800;
const EDITOR_CANVAS_MAX_SIDE = 200;
const EDITOR_RULER_HEIGHT = 30;
const EDITOR_RULER_OVERSCAN = 40;
const WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX = 'dodoudou:workshop-editor-local-draft:';
const DEFAULT_UNTITLED_PROJECT_TITLE = '未命名作品';

function getEditorRulerStep(cellPx: number) {
  if (cellPx >= 24) return 1;
  if (cellPx >= 15) return 2;
  if (cellPx >= 9) return 5;
  if (cellPx >= 5) return 10;
  return 20;
}

function shouldShowEditorRulerLabel(index: number, step: number, currentIndex: number | null) {
  return index === currentIndex || index === 0 || (index + 1) % step === 0;
}

function buildEditorRulerData(params: {
  cols: number;
  rows: number;
  canvasLayout: { width: number; height: number };
  viewport: { width: number; height: number };
  offset: { x: number; y: number };
  scale: number;
  currentCell: { row: number; col: number } | null;
}): EditorRulerData {
  const { cols, rows, canvasLayout, viewport, offset, scale, currentCell } = params;
  if (cols <= 0 || rows <= 0 || canvasLayout.width <= 0 || canvasLayout.height <= 0 || viewport.width <= 0 || viewport.height <= 0 || scale <= 0) {
    return { columns: [], rows: [] };
  }

  const cellWidth = (canvasLayout.width / cols) * scale;
  const cellHeight = (canvasLayout.height / rows) * scale;
  if (cellWidth <= 0 || cellHeight <= 0) return { columns: [], rows: [] };

  const step = getEditorRulerStep(Math.min(cellWidth, cellHeight));
  const currentCol = currentCell?.col ?? null;
  const currentRow = currentCell?.row ?? null;
  const startCol = Math.max(0, Math.floor((-offset.x) / cellWidth) - 1);
  const endCol = Math.min(cols - 1, Math.ceil((viewport.width - offset.x) / cellWidth) + 1);
  const startRow = Math.max(0, Math.floor((EDITOR_RULER_HEIGHT - offset.y) / cellHeight) - 1);
  const endRow = Math.min(rows - 1, Math.ceil((viewport.height - offset.y) / cellHeight) + 1);
  const sideHeight = Math.max(0, viewport.height - EDITOR_RULER_HEIGHT);
  const columns: EditorRulerLabel[] = [];
  const rowsData: EditorRulerLabel[] = [];

  for (let col = startCol; col <= endCol; col += 1) {
    const screenX = offset.x + (col + 0.5) * cellWidth;
    if (screenX < -EDITOR_RULER_OVERSCAN || screenX > viewport.width + EDITOR_RULER_OVERSCAN) continue;
    const value = col + 1;
    const current = currentCol === col;
    if (!shouldShowEditorRulerLabel(col, step, currentCol)) continue;

    columns.push({
      key: `c-${col}`,
      value,
      x: screenX,
      y: EDITOR_RULER_HEIGHT / 2,
      major: value === 1 || value % 10 === 0,
      current,
    });
  }

  for (let row = startRow; row <= endRow; row += 1) {
    const screenY = offset.y + (row + 0.5) * cellHeight;
    const localY = screenY - EDITOR_RULER_HEIGHT;
    if (localY < -EDITOR_RULER_OVERSCAN || localY > sideHeight + EDITOR_RULER_OVERSCAN) continue;
    const value = row + 1;
    const current = currentRow === row;
    if (!shouldShowEditorRulerLabel(row, step, currentRow)) continue;

    rowsData.push({
      key: `r-${row}`,
      value,
      x: 17,
      y: localY,
      major: value === 1 || value % 10 === 0,
      current,
    });
  }

  return { columns, rows: rowsData };
}

function WorkshopEditorRulers({
  data,
  toolbarHeight,
  visible,
}: {
  data: EditorRulerData;
  toolbarHeight: number;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <section className={styles.rulerLayer} aria-label="editor coordinate ruler">
      <div className={styles.topRuler}>
        {data.columns.map((label) => (
          <span
            key={label.key}
            className={`${styles.rulerTick} ${label.current ? styles.rulerCurrent : ''}`}
            style={{ left: `${Math.round(label.x)}px` }}
            aria-hidden="true"
          />
        ))}
        {data.columns.map((label) => (
          <span
            key={`${label.key}-label`}
            className={`${styles.rulerLabel} ${label.major ? styles.rulerMajor : ''} ${label.current ? styles.rulerCurrent : ''}`}
            style={{ left: `${Math.round(label.x)}px`, top: `${Math.round(label.y)}px` }}
          >
            {label.value}
          </span>
        ))}
      </div>

      <div className={styles.sideRuler} style={{ bottom: `${Math.max(0, toolbarHeight + 32)}px` }}>
        {data.rows.map((label) => (
          <span
            key={label.key}
            className={`${styles.rulerTick} ${styles.sideTick} ${label.current ? styles.rulerCurrent : ''}`}
            style={{ top: `${Math.round(label.y)}px` }}
            aria-hidden="true"
          />
        ))}
        {data.rows.map((label) => (
          <span
            key={`${label.key}-label`}
            className={`${styles.rulerLabel} ${styles.sideLabel} ${label.major ? styles.rulerMajor : ''} ${label.current ? styles.rulerCurrent : ''}`}
            style={{ left: `${Math.round(label.x)}px`, top: `${Math.round(label.y)}px` }}
          >
            {label.value}
          </span>
        ))}
      </div>
    </section>
  );
}

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

function getNearestPaletteColor(hex: string, palette: PatternPaletteColor[]) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let nearest: PatternPaletteColor | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const distance =
      ((rgb.r - color.rgb.r) ** 2) +
      ((rgb.g - color.rgb.g) ** 2) +
      ((rgb.b - color.rgb.b) ** 2);

    if (distance >= nearestDistance) continue;
    nearest = color;
    nearestDistance = distance;
  }

  return nearest;
}

function getDisplayVendorCodeForColor(hex: string, brand: WorkshopConfig['brand'], palette: PatternPaletteColor[]) {
  const exactCode = getVendorCode(hex, brand);
  if (exactCode && exactCode !== '?') return exactCode;

  return getNearestPaletteColor(hex, palette)?.vendorCode ?? '?';
}

function getRelativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;

  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getCurrentSwatchTextStyle(hex: string) {
  const darkText = '#5D534A';
  const lightText = '#FFFFFF';
  const luminance = getRelativeLuminance(hex);
  const color = luminance > 0.52 ? darkText : lightText;

  return {
    color,
    textShadow: color === lightText
      ? '0 1px 2px rgba(93, 83, 74, 0.38)'
      : '0 1px 2px rgba(255, 255, 255, 0.72)',
  };
}

function isUntitledProjectTitle(title: string | null | undefined) {
  const normalized = title?.trim() ?? '';
  return !normalized || normalized === DEFAULT_UNTITLED_PROJECT_TITLE;
}

function getTitleTimestamp(createdAt: string | null) {
  const time = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isNaN(time) ? Date.now().toString() : String(time);
}

function getDisplayProjectTitle(title: string | null | undefined, createdAt: string | null) {
  const normalized = title?.trim() ?? '';
  if (!isUntitledProjectTitle(normalized)) return normalized;
  return `未命名-${getTitleTimestamp(createdAt)}`;
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

function normalizeSelectionRect(
  startCell: { row: number; col: number },
  endCell: { row: number; col: number },
): SelectionRect {
  return {
    startRow: Math.min(startCell.row, endCell.row),
    startCol: Math.min(startCell.col, endCell.col),
    endRow: Math.max(startCell.row, endCell.row),
    endCol: Math.max(startCell.col, endCell.col),
  };
}

function getSelectionDimensions(rect: SelectionRect) {
  return {
    rows: rect.endRow - rect.startRow + 1,
    cols: rect.endCol - rect.startCol + 1,
  };
}

function isSameSelectionRect(a: SelectionRect, b: SelectionRect) {
  return (
    a.startRow === b.startRow
    && a.startCol === b.startCol
    && a.endRow === b.endRow
    && a.endCol === b.endCol
  );
}

function copyGridRect(grid: string[][], rect: SelectionRect) {
  const dimensions = getSelectionDimensions(rect);

  return Array.from({ length: dimensions.rows }, (_, rowOffset) => (
    Array.from({ length: dimensions.cols }, (_, colOffset) => (
      grid[rect.startRow + rowOffset]?.[rect.startCol + colOffset] ?? ''
    ))
  ));
}

function shiftSelectionRectWithinGrid(
  rect: SelectionRect,
  rowDelta: number,
  colDelta: number,
  rowCount: number,
  colCount: number,
) {
  const dimensions = getSelectionDimensions(rect);
  const nextStartRow = Math.max(0, Math.min(rowCount - dimensions.rows, rect.startRow + rowDelta));
  const nextStartCol = Math.max(0, Math.min(colCount - dimensions.cols, rect.startCol + colDelta));

  return {
    startRow: nextStartRow,
    startCol: nextStartCol,
    endRow: nextStartRow + dimensions.rows - 1,
    endCol: nextStartCol + dimensions.cols - 1,
  };
}

function toClampedCellPoint(clientX: number, clientY: number, canvas: HTMLCanvasElement | null, cols: number, rows: number) {
  if (!canvas || cols <= 0 || rows <= 0) return null;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = Math.max(0, Math.min(rect.width - 0.01, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height - 0.01, clientY - rect.top));

  return {
    row: Math.max(0, Math.min(rows - 1, Math.floor((y / rect.height) * rows))),
    col: Math.max(0, Math.min(cols - 1, Math.floor((x / rect.width) * cols))),
  };
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

function isFilledGridCell(hex: string | undefined) {
  return Boolean(hex && hex !== 'transparent');
}

function normalizeHexColorInput(value: string) {
  const match = value.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  const raw = match[1];
  const expanded = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;

  return `#${expanded.toUpperCase()}`;
}

function getPaletteColorForHex(hex: string, palette: PatternPaletteColor[]) {
  const normalizedHex = normalizeHexColorInput(hex);
  if (!normalizedHex) return null;

  return palette.find((color) => color.hex === normalizedHex) ?? getNearestPaletteColor(normalizedHex, palette);
}

function findExteriorOutlineCells(grid: string[][]) {
  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;
  const outlineCells: Array<{ row: number; col: number }> = [];
  if (!rowCount || !colCount) return outlineCells;

  const paddedRows = rowCount + 2;
  const paddedCols = colCount + 2;
  const keyOf = (row: number, col: number) => `${row},${col}`;
  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  const isPaddedFilled = (row: number, col: number) => {
    if (row <= 0 || col <= 0 || row > rowCount || col > colCount) return false;
    return isFilledGridCell(grid[row - 1]?.[col - 1]);
  };

  const exterior = new Set<string>();
  const queue: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
  exterior.add(keyOf(0, 0));

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of directions) {
      const next = {
        row: current.row + direction.row,
        col: current.col + direction.col,
      };
      if (next.row < 0 || next.row >= paddedRows || next.col < 0 || next.col >= paddedCols) continue;
      if (isPaddedFilled(next.row, next.col)) continue;

      const key = keyOf(next.row, next.col);
      if (exterior.has(key)) continue;
      exterior.add(key);
      queue.push(next);
    }
  }

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      if (!isFilledGridCell(grid[row]?.[col])) continue;

      const paddedRow = row + 1;
      const paddedCol = col + 1;
      const touchesExterior = directions.some((direction) => (
        exterior.has(keyOf(paddedRow + direction.row, paddedCol + direction.col))
      ));

      if (touchesExterior) outlineCells.push({ row, col });
    }
  }

  return outlineCells;
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
  changedCells?: Array<{ row: number; col: number }>,
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
      changedCells?.push({ row: r, col: c });
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
  const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 });
  const historyRef = useRef<string[][][]>([]);
  const historyIndexRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const renderScaleTimerRef = useRef<number | null>(null);
  const transformFrameRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<{ offset: { x: number; y: number }; scale: number } | null>(null);
  const projectReadyRef = useRef(false);
  const pendingPersistRef = useRef<WorkshopEditorState | null>(null);
  const canvasRenderMetaRef = useRef<EditorCanvasRenderMeta | null>(null);

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
  const [eraserMode, setEraserMode] = useState<EraserMode>('brush');
  const [currentColor, setCurrentColor] = useState('#D8B4E2');
  const [recentColors, setRecentColors] = useState(DEFAULT_COLORS);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [isPickingOutlineColor, setIsPickingOutlineColor] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [renderScale, setRenderScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rulerTransform, setRulerTransform] = useState({ offset: { x: 0, y: 0 }, scale: 1 });
  const [rulerCurrentCell, setRulerCurrentCell] = useState<{ row: number; col: number } | null>(null);
  const offsetRef = useRef(offset);
  const scaleRef = useRef(scale);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
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
  const [isOpeningFocusMode, setIsOpeningFocusMode] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>({ index: 0, length: 1 });
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadBrand, setDownloadBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);
  const [editorBrand, setEditorBrand] = useState<WorkshopConfig['brand']>(defaultWorkshopConfig.brand);
  const [activePaletteGroup, setActivePaletteGroup] = useState(ALL_PALETTE_GROUP);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [draftSelectionRect, setDraftSelectionRect] = useState<SelectionRect | null>(null);
  const [selectionOperation, setSelectionOperation] = useState<SelectionOperation | null>(null);
  const [selectionPreviewCells, setSelectionPreviewCells] = useState<string[][] | null>(null);
  const selectionClipboardRef = useRef<SelectionClipboard | null>(null);
  const selectionGestureRef = useRef<SelectionGesture | null>(null);
  const selectionPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentRecentColors = makeRecentColors(currentColor, recentColors);
  const displayProjectTitle = useMemo(
    () => getDisplayProjectTitle(projectTitle, projectCreatedAt),
    [projectCreatedAt, projectTitle],
  );
  const downloadPatternResult = useMemo(
    () => (downloadModalOpen ? gridToPatternResult(grid, downloadBrand) : null),
    [downloadBrand, downloadModalOpen, grid],
  );
  const editorPalette = useMemo(() => buildPalette(editorBrand), [editorBrand]);
  const currentColorCode = useMemo(
    () => getDisplayVendorCodeForColor(currentColor, editorBrand, editorPalette),
    [currentColor, editorBrand, editorPalette],
  );
  const currentColorCodeTextStyle = useMemo(
    () => getCurrentSwatchTextStyle(currentColor),
    [currentColor],
  );
  const paletteGroups = useMemo(
    () => buildPaletteGroups(editorBrand, editorPalette, (color) => color.vendorCode),
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
    await persistEditorSnapshot().catch(() => undefined);
    navigate(-1);
  };

  const openRenameDialog = () => {
    setDraftTitle(isUntitledProjectTitle(projectTitle) ? '' : projectTitle.trim());
    setRenameOpen(true);
  };

  const closeRenameDialog = () => {
    if (titleSaving) return;
    setRenameOpen(false);
  };

  const saveProjectTitle = async () => {
    const nextTitle = draftTitle.trim();

    if (!projectId) {
      setProjectTitle(nextTitle);
      setRenameOpen(false);
      return;
    }

    setTitleSaving(true);
    try {
      await saveWorkshopProject(projectId, {
        title: nextTitle,
        lastOpenedAt: new Date().toISOString(),
      });
      setProjectTitle(nextTitle);
      setRenameOpen(false);
      showToast('图纸名称已更新');
    } catch {
      showToast('名称保存失败，请稍后再试');
    } finally {
      setTitleSaving(false);
    }
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveProjectTitle();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeRenameDialog();
    }
  };

  const handleOpenFocusMode = async () => {
    if (!projectId || isOpeningFocusMode) return;

    let didNavigate = false;
    setIsOpeningFocusMode(true);
    try {
      await waitForLoadingPaint();
      await persistEditorSnapshot();
      didNavigate = true;
      navigate(`/workshop/focus/${projectId}`, { state: { returnTo: `/workshop/editor/${projectId}` } });
    } catch {
      showToast('保存失败，请稍后再试');
    } finally {
      if (!didNavigate) setIsOpeningFocusMode(false);
    }
  };

  const isDownloadModalOpen = downloadModalOpen;

  const syncRulerTransform = (nextOffset: { x: number; y: number }, nextScale: number) => {
    setRulerTransform((current) => (
      current.scale === nextScale && current.offset.x === nextOffset.x && current.offset.y === nextOffset.y
        ? current
        : { offset: { ...nextOffset }, scale: nextScale }
    ));
  };

  const writeCanvasTransform = (nextOffset = offsetRef.current, nextScale = scaleRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0) scale(${nextScale})`;
  };

  const scheduleCanvasTransform = (nextOffset: { x: number; y: number }, nextScale = scaleRef.current) => {
    offsetRef.current = nextOffset;
    scaleRef.current = nextScale;
    pendingTransformRef.current = { offset: nextOffset, scale: nextScale };

    if (transformFrameRef.current !== null) return;

    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = null;
      const pendingTransform = pendingTransformRef.current;
      if (!pendingTransform) return;
      pendingTransformRef.current = null;
      writeCanvasTransform(pendingTransform.offset, pendingTransform.scale);
      syncRulerTransform(pendingTransform.offset, pendingTransform.scale);
    });
  };

  useEffect(() => {
    projectReadyRef.current = projectReady;
  }, [projectReady]);

  useEffect(() => {
    offsetRef.current = offset;
    scaleRef.current = scale;
    writeCanvasTransform(offset, scale);
    syncRulerTransform(offset, scale);
  }, [offset, scale]);

  useEffect(() => {
    if (renderScaleTimerRef.current) {
      window.clearTimeout(renderScaleTimerRef.current);
    }

    renderScaleTimerRef.current = window.setTimeout(() => {
      renderScaleTimerRef.current = null;
      if (dragRef.current?.kind === 'pan') return;
      setRenderScale(scaleRef.current);
    }, 180);

    return () => {
      if (renderScaleTimerRef.current) {
        window.clearTimeout(renderScaleTimerRef.current);
        renderScaleTimerRef.current = null;
      }
    };
  }, [scale]);

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
    const updateCanvasViewport = () => {
      const stage = canvasStageRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const nextViewport = {
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      };

      setCanvasViewport((current) => (
        current.width === nextViewport.width && current.height === nextViewport.height
          ? current
          : nextViewport
      ));
    };

    updateCanvasViewport();
    window.addEventListener('resize', updateCanvasViewport);

    const observer = canvasStageRef.current ? new ResizeObserver(updateCanvasViewport) : null;
    if (observer && canvasStageRef.current) observer.observe(canvasStageRef.current);

    return () => {
      window.removeEventListener('resize', updateCanvasViewport);
      observer?.disconnect();
    };
  }, [toolbarHeight]);

  useEffect(() => {
    let alive = true;

    async function loadProjectPattern() {
      if (alive) setProjectReady(false);

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
      setProjectTitle(project?.title ?? '');
      setProjectCreatedAt(project?.createdAt ?? new Date().toISOString());
      setEditorBrand(projectBrand);
      setDownloadBrand(projectBrand);

      let loadedGridForPersistence: string[][] | null = null;

      if (project?.patternResult) {
        const { patternResult } = project;
        const nextGrid = restoredGrid ? cloneGrid(restoredGrid) : buildGridFromPattern(patternResult);
        const isBlankSource = project.sourceType === 'blank';
        setBaseCanvasSize(isBlankSource ? { cols: 1, rows: 1 } : { cols: patternResult.width, rows: patternResult.height });

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

    const frame = window.requestAnimationFrame(() => {
      if (!canvasRef.current || !previewCanvasRef.current) return;

      const stage = canvasStageRef.current;
      const stageRect = stage?.getBoundingClientRect();
      const availableWidth = Math.max(1, canvasViewport.width || Math.round(stageRect?.width ?? window.innerWidth));
      const availableHeight = Math.max(1, canvasViewport.height || Math.round(stageRect?.height ?? window.innerHeight));
      const cellSize = Math.max(1, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
      const displayWidth = cols * cellSize;
      const displayHeight = rows * cellSize;
      const fitScale = Math.min(1, availableWidth / displayWidth, availableHeight / displayHeight);
      const xOffset = Math.max(0, (availableWidth - displayWidth * fitScale) / 2);
      const yOffset = Math.max(0, (availableHeight - displayHeight * fitScale) / 2);

      setCanvasLayout((current) => ({
        ...current,
        width: displayWidth,
        height: displayHeight,
        scale: fitScale,
        offsetY: yOffset,
        scaleOffsetX: xOffset,
        scaleOffsetY: yOffset,
      }));

      if (!hasUserAdjustedViewRef.current) {
        if (Math.abs(scale - fitScale) > 0.001) setScale(fitScale);
        setOffset({ x: xOffset, y: yOffset });
      }

      canvasRenderMetaRef.current = paintGridToCanvas({
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
        visibleCellSize: cellSize * (hasUserAdjustedViewRef.current ? renderScale : fitScale),
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [backgroundMode, beadShape, bgColor, canvasViewport.height, canvasViewport.width, cols, editorBrand, grid, renderScale, rows, showColorCodes, showDividers, showGrid]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (renderScaleTimerRef.current) window.clearTimeout(renderScaleTimerRef.current);
      if (transformFrameRef.current !== null) window.cancelAnimationFrame(transformFrameRef.current);
      globalPaintCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const canvas = selectionPreviewCanvasRef.current;
    if (!canvas || !selectionOperation || !selectionPreviewCells?.length) return;

    const previewRows = selectionPreviewCells.length;
    const previewCols = selectionPreviewCells[0]?.length ?? 0;
    if (!previewRows || !previewCols) return;

    canvas.width = previewCols;
    canvas.height = previewRows;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, previewCols, previewRows);
    selectionPreviewCells.forEach((row, rowIndex) => {
      row.forEach((hex, colIndex) => {
        if (!hex || hex === 'transparent') return;
        ctx.fillStyle = hex;
        ctx.fillRect(colIndex, rowIndex, 1, 1);
      });
    });
  }, [selectionOperation, selectionPreviewCells]);

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
      grid: nextGrid,
      history: nextHistory,
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

  const clearActiveSelection = () => {
    selectionGestureRef.current = null;
    selectionClipboardRef.current = null;
    setSelectionRect(null);
    setDraftSelectionRect(null);
    setSelectionOperation(null);
    setSelectionPreviewCells(null);
  };

  const activateTool = (nextTool: Tool) => {
    setTool(nextTool);
    setIsPickingOutlineColor(false);
    if (nextTool !== 'select') clearActiveSelection();
  };

  const releasePointerCapture = (target: HTMLElement, pointerId: number) => {
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Ignore release errors.
    }
  };

  const capturePointer = (target: HTMLElement, pointerId: number) => {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Ignore capture errors.
    }
  };

  const updateRulerCurrentCell = (clientX: number, clientY: number) => {
    const cell = toCellPoint(clientX, clientY, canvasRef.current, cols, rows);
    setRulerCurrentCell((current) => (
      current?.row === cell?.row && current?.col === cell?.col ? current : cell
    ));
    return cell;
  };

  const clampScale = (nextScale: number) => Math.min(12, Math.max(0.2, +nextScale.toFixed(2)));

  const getCenteredOffset = (nextScale = 1) => ({
    x: Math.max(0, ((canvasStageRef.current?.getBoundingClientRect().width ?? window.innerWidth) - canvasLayout.width * nextScale) / 2),
    y: Math.max(0, ((canvasStageRef.current?.getBoundingClientRect().height ?? window.innerHeight) - canvasLayout.height * nextScale) / 2),
  });

  const applyZoom = (nextScale: number, focalPoint?: PointerPoint) => {
    const canvas = canvasRef.current;
    const stage = canvasStageRef.current;
    if (!canvas || !stage) return;

    const currentScale = scaleRef.current;
    const clampedScale = clampScale(nextScale);
    if (clampedScale === currentScale) return;

    const stageRect = stage.getBoundingClientRect();
    const scaleRatio = clampedScale / currentScale;
    const currentOffset = offsetRef.current;
    const nextOffset = !focalPoint
      ? getCenteredOffset(clampedScale)
      : {
          x: (focalPoint.clientX - stageRect.left) - ((focalPoint.clientX - stageRect.left) - currentOffset.x) * scaleRatio,
          y: (focalPoint.clientY - stageRect.top) - ((focalPoint.clientY - stageRect.top) - currentOffset.y) * scaleRatio,
        };

    hasUserAdjustedViewRef.current = true;
    scheduleCanvasTransform(nextOffset, clampedScale);
    setOffset(nextOffset);
    setScale(clampedScale);
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    applyZoom(scaleRef.current * factor, { clientX, clientY });
  };

  const getClampedPointerCell = (clientX: number, clientY: number) => (
    toClampedCellPoint(clientX, clientY, canvasRef.current, cols, rows)
  );

  const updateSelectionGesture = (pointerId: number, clientX: number, clientY: number) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;

    const cell = getClampedPointerCell(clientX, clientY);
    if (!cell) return true;

    if (gesture.kind === 'draw') {
      gesture.currentCell = cell;
      setDraftSelectionRect(normalizeSelectionRect(gesture.startCell, cell));
      return true;
    }

    const rowDelta = cell.row - gesture.startCell.row;
    const colDelta = cell.col - gesture.startCell.col;
    const nextRect = shiftSelectionRectWithinGrid(gesture.originRect, rowDelta, colDelta, rows, cols);
    gesture.currentRect = nextRect;
    setSelectionRect((current) => (current && isSameSelectionRect(current, nextRect) ? current : nextRect));
    return true;
  };

  const applySelectionPlacement = (
    operation: SelectionOperation,
    sourceRect: SelectionRect,
    targetRect: SelectionRect,
    cells: string[][],
  ) => {
    if (operation === 'move' && isSameSelectionRect(sourceRect, targetRect)) {
      showToast('移动位置未变化');
      return;
    }

    const nextGrid = cloneGrid(grid);
    let changed = false;
    const writeCell = (row: number, col: number, value: string) => {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return;
      if (nextGrid[row][col] === value) return;
      nextGrid[row][col] = value;
      changed = true;
    };

    if (operation === 'move') {
      for (let row = sourceRect.startRow; row <= sourceRect.endRow; row += 1) {
        for (let col = sourceRect.startCol; col <= sourceRect.endCol; col += 1) {
          writeCell(row, col, '');
        }
      }
    }

    cells.forEach((line, rowOffset) => {
      line.forEach((hex, colOffset) => {
        writeCell(targetRect.startRow + rowOffset, targetRect.startCol + colOffset, hex ?? '');
      });
    });

    if (!changed) {
      showToast('目标区域没有变化');
      return;
    }

    commitGrid(nextGrid);
    clearActiveSelection();
    showToast(operation === 'copy' ? '已复制并覆盖目标区域' : '已移动并覆盖目标区域');
  };

  const finishSelectionGesture = (pointerId: number, target: HTMLElement) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;

    selectionGestureRef.current = null;
    releasePointerCapture(target, pointerId);

    if (gesture.kind === 'draw') {
      const rect = normalizeSelectionRect(gesture.startCell, gesture.currentCell);
      const dimensions = getSelectionDimensions(rect);
      selectionClipboardRef.current = {
        rect,
        cells: copyGridRect(grid, rect),
      };
      setDraftSelectionRect(null);
      setSelectionRect(rect);
      setSelectionOperation(null);
      setSelectionPreviewCells(null);
      showToast(`已框选 ${dimensions.cols} x ${dimensions.rows}`);
      return true;
    }

    applySelectionPlacement(gesture.operation, gesture.sourceRect, gesture.currentRect, gesture.cells);
    return true;
  };

  const cancelSelectionGesture = () => {
    const gesture = selectionGestureRef.current;
    if (!gesture) return;

    selectionGestureRef.current = null;
    if (gesture.kind === 'draw') {
      setDraftSelectionRect(null);
      return;
    }

    setSelectionRect(gesture.originRect);
  };

  const beginSelectionDraw = (event: React.PointerEvent<HTMLElement>, startCell: { row: number; col: number }) => {
    event.preventDefault();
    event.stopPropagation();
    clearActiveSelection();

    const rect = normalizeSelectionRect(startCell, startCell);
    selectionGestureRef.current = {
      kind: 'draw',
      pointerId: event.pointerId,
      startCell,
      currentCell: startCell,
    };
    selectionClipboardRef.current = null;
    setDraftSelectionRect(rect);
    setSelectionRect(null);
    setSelectionOperation(null);
    setSelectionPreviewCells(null);
    capturePointer(event.currentTarget, event.pointerId);
  };

  const beginSelectionPlacement = (event: React.PointerEvent<HTMLElement>) => {
    if (!selectionRect || !selectionOperation) return;
    const clipboard = selectionClipboardRef.current;
    if (!clipboard) return;

    const startCell = getClampedPointerCell(event.clientX, event.clientY);
    if (!startCell) return;

    event.preventDefault();
    event.stopPropagation();
    selectionGestureRef.current = {
      kind: 'place',
      pointerId: event.pointerId,
      startCell,
      originRect: selectionRect,
      currentRect: selectionRect,
      sourceRect: clipboard.rect,
      cells: clipboard.cells.map((line) => [...line]),
      operation: selectionOperation,
    };
    capturePointer(event.currentTarget, event.pointerId);
  };

  const handleSelectionBoxPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!updateSelectionGesture(event.pointerId, event.clientX, event.clientY)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSelectionBoxPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!finishSelectionGesture(event.pointerId, event.currentTarget)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const startSelectionOperation = (operation: SelectionOperation) => {
    if (!selectionRect) return;
    const cells = copyGridRect(grid, selectionRect);
    selectionClipboardRef.current = {
      rect: selectionRect,
      cells,
    };
    setSelectionOperation(operation);
    setSelectionPreviewCells(cells);
    showToast(operation === 'copy' ? '拖动选框复制到目标位置' : '拖动选框移动到目标位置');
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
    clearActiveSelection();
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(cloneGrid(nextGrid));

    const trimmedHistory = nextHistory.slice(-HISTORY_LIMIT);
    const nextIndex = trimmedHistory.length - 1;

    persistEditorState(nextGrid, trimmedHistory, nextIndex);
  };

  const paintChangedCellsImmediately = (nextGrid: string[][], changedCells: Array<{ row: number; col: number }>) => {
    if (!changedCells.length || !canvasRef.current || !previewCanvasRef.current) return;
    const renderMeta = canvasRenderMetaRef.current;
    if (!renderMeta) return;

    paintGridCellsToCanvas({
      canvas: canvasRef.current,
      previewCanvas: previewCanvasRef.current,
      bubbleCanvas: bubbleCanvasRef.current,
      grid: nextGrid,
      changedCells,
      cols,
      rows,
      showGrid,
      showDividers,
      showColorCodes,
      beadShape,
      backgroundMode,
      colorSystem: editorBrand,
      visibleCellSize: renderMeta.visibleCellSize,
    });
  };

  const continuePaintStroke = (pointerId: number, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const paintSession = paintSessionRef.current;
    if (!drag || drag.pointerId !== pointerId || drag.kind !== 'paint' || !paintSession) return;

    const cell = updateRulerCurrentCell(clientX, clientY);
    if (!cell) return;

    const key = `${cell.row},${cell.col}`;
    if (drag.lastCell === key) return;

    drag.lastCell = key;

    let changed = false;
    const changedCells: Array<{ row: number; col: number }> = [];
    for (const nextCell of getInterpolatedCells(paintSession.lastCell, cell)) {
      changed = paintCellBlock(
        paintSession.grid,
        nextCell.row,
        nextCell.col,
        paintSession.tool,
        paintSession.color,
        paintSession.size,
        changedCells,
      ) || changed;
    }

    paintSession.lastCell = cell;
    paintSession.changed = paintSession.changed || changed;
    if (changed) paintChangedCellsImmediately(paintSession.grid, changedCells);
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
    const changedCells: Array<{ row: number; col: number }> = [];
    const changed = paintCellBlock(nextGrid, cell.row, cell.col, tool, currentColor, size, changedCells);

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

    if (changed) paintChangedCellsImmediately(nextGrid, changedCells);
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

    clearActiveSelection();
    persistEditorState(nextGrid, historyRef.current, nextIndex);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;

    const nextIndex = historyIndexRef.current + 1;
    const nextGrid = cloneGrid(historyRef.current[nextIndex]);

    clearActiveSelection();
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
      currentOffsetX: originX,
      currentOffsetY: originY,
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
      setOffset({
        x: drag.currentOffsetX ?? drag.originOffsetX,
        y: drag.currentOffsetY ?? drag.originOffsetY,
      });
      setRenderScale(scaleRef.current);
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
           
            <div className={styles.sizeDots}>
              {[1, 2, 3].map((size) => {
                const active = brushSize === size;
                const dotSize = 7 + size * 3;

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
            <span className={styles.paramLabel}>模式</span>
            <div className={styles.modeToggle} role="group" aria-label="橡皮模式">
              {[
                { id: 'brush' as const, label: '点擦' },
                { id: 'area' as const, label: '区域' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`${styles.modeToggleBtn} ${eraserMode === mode.id ? styles.isActive : ''}`}
                  aria-pressed={eraserMode === mode.id}
                  onClick={() => setEraserMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.paramGroup}>
            <span className={styles.paramLabel}>大小</span>
            <div className={styles.sizeDots}>
              {[1, 2, 3].map((size) => {
                const active = eraserSize === size;
                const dotSize = 7 + size * 3;

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
          {eraserMode === 'area' ? <span className={styles.fillTip}>点击同色区域删除</span> : null}
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

    if (tool === 'picker') {
      return (
        <>
          <div className={styles.toolInfoTag}>
            <img className={styles.tagIcon} src={ICONS.picker} alt="" />
            <span className={styles.tagText}>取色</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.pickerTip}>
            点击画布格子取色
            <br />
            <span>自动吸取颜色并切回画笔</span>
          </div>
        </>
      );
    }

    if (tool === 'select') {
      const dimensions = selectionRect ? getSelectionDimensions(selectionRect) : null;
      const operationLabel = selectionOperation === 'copy'
        ? '复制'
        : selectionOperation === 'move'
          ? '移动'
          : '待选择';

      return (
        <>
          <div className={styles.toolInfoTag}>
            <span className={styles.tagSvgIcon}><SelectionToolIcon /></span>
            <span className={styles.tagText}>框选</span>
          </div>
          <div className={styles.toolSep} />
          <div className={styles.selectionToolTip}>
            {dimensions ? (
              <>
                <strong>{dimensions.cols} x {dimensions.rows}</strong>
                <span>{operationLabel}，拖动选框到目标位置后覆盖</span>
              </>
            ) : (
              <>
                <strong>拖拽画框</strong>
                <span>框旁选择复制或移动</span>
              </>
            )}
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
        
          <div className={styles.zoomTools}>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => applyZoom(scaleRef.current - 0.1)}
            >
              -
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => applyZoom(scaleRef.current + 0.1)}
            >
              +
            </button>
            <button
              type="button"
              className={styles.smallActionBtn}
              onClick={() => {
                const nextOffset = getCenteredOffset(1);
                scheduleCanvasTransform(nextOffset, 1);
                setOffset(nextOffset);
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
      return;
    }

    const pointerCell = updateRulerCurrentCell(event.clientX, event.clientY);

    if (isPickingOutlineColor) {
      event.preventDefault();
      event.stopPropagation();

      const cell = pointerCell;
      const picked = cell ? grid[cell.row]?.[cell.col] : null;

      if (!isFilledGridCell(picked)) {
        showToast('请点击已有豆豆取色');
        return;
      }

      const pickedColor = getPaletteColorForHex(picked, editorPalette);
      if (!pickedColor) {
        showToast('这个颜色不在当前品牌色卡中');
        return;
      }

      applyOutlineColor(pickedColor);
      return;
    }

    if (event.pointerType === 'touch') {
      touchZoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (touchZoomPointersRef.current.size >= 2) {
        pendingTouchActionRef.current = null;
        cancelSelectionGesture();
        cancelActivePaintStroke();
        dragRef.current = null;
        const [a, b] = Array.from(touchZoomPointersRef.current.values());
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        pinchRef.current = {
          startDistance: Math.hypot(dx, dy),
          startScale: scaleRef.current,
          startOffset: { ...offsetRef.current },
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
      beginDrag(event, 'pan', offsetRef.current.x, offsetRef.current.y);
      return;
    }

    if (tool === 'select') {
      const cell = pointerCell ?? getClampedPointerCell(event.clientX, event.clientY);
      if (!cell) return;
      beginSelectionDraw(event, cell);
      return;
    }

    const cell = pointerCell;
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
      activateTool('brush');
      showToast('已取色');
      return;
    }

    if (tool === 'fill') {
      commitGrid(floodFill(grid, cell.row, cell.col, currentColor));
      showToast('已执行填充');
      return;
    }

    if (tool === 'eraser' && eraserMode === 'area') {
      eraseConnectedArea(cell);
      return;
    }

    startPaintStroke(event.pointerId, cell, event.clientX, event.clientY);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    updateRulerCurrentCell(event.clientX, event.clientY);

    if (updateSelectionGesture(event.pointerId, event.clientX, event.clientY)) {
      event.preventDefault();
      return;
    }

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
        const nextOffset = {
          x: centerX - (centerX - pinchRef.current.startOffset.x) * scaleRatio,
          y: centerY - (centerY - pinchRef.current.startOffset.y) * scaleRatio,
        };

        scheduleCanvasTransform(nextOffset, nextScale);
        setOffset(nextOffset);
        setScale(nextScale);
        return;
      }

      const pendingTouchAction = pendingTouchActionRef.current;
      if (
        pendingTouchAction
        && pendingTouchAction.pointerId === event.pointerId
        && (
          pendingTouchAction.tool === 'brush'
          || (pendingTouchAction.tool === 'eraser' && eraserMode === 'brush')
        )
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
      const nextOffset = {
        x: drag.originOffsetX + dx,
        y: drag.originOffsetY + dy,
      };
      drag.moved = true;
      drag.currentOffsetX = nextOffset.x;
      drag.currentOffsetY = nextOffset.y;
      hasUserAdjustedViewRef.current = true;
      scheduleCanvasTransform(nextOffset);
      return;
    }

    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.kind === 'pan') {
      const nextOffset = {
        x: drag.originOffsetX + dx,
        y: drag.originOffsetY + dy,
      };
      drag.moved = true;
      drag.currentOffsetX = nextOffset.x;
      drag.currentOffsetY = nextOffset.y;
      scheduleCanvasTransform(nextOffset);
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
            activateTool('brush');
            showToast('已取色');
            return;
          }

          if (pendingTouchAction.tool === 'fill') {
            commitGrid(floodFill(grid, pendingTouchAction.cell.row, pendingTouchAction.cell.col, currentColor));
            showToast('已执行填充');
            return;
          }

          if (pendingTouchAction.tool === 'eraser' && eraserMode === 'area') {
            eraseConnectedArea(pendingTouchAction.cell);
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

    if (finishSelectionGesture(event.pointerId, event.currentTarget)) {
      event.preventDefault();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.kind === 'paint') finishPaintStroke(event.pointerId);
    if (drag.kind === 'pan') {
      hasUserAdjustedViewRef.current = true;
      setOffset({
        x: drag.currentOffsetX ?? drag.originOffsetX,
        y: drag.currentOffsetY ?? drag.originOffsetY,
      });
      setRenderScale(scaleRef.current);
    }

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
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      event.stopPropagation();
      return;
    }

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

    if (event.key === 'Escape' && (selectionRect || draftSelectionRect || selectionOperation)) {
      event.preventDefault();
      clearActiveSelection();
      return;
    }

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
    clearActiveSelection();
    setClearConfirmOpen(true);
  };

  const removeEditorBackground = () => {
    const result = removePatternBackground(gridToPatternResult(grid, editorBrand));
    if (!result || result.removedCount <= 0) {
      showToast('未检测到可去除背景');
      return;
    }

    commitGrid(buildGridFromPattern(result.newPatternResult));
    setIsPickingOutlineColor(false);
    showToast(`完成，共去除${result.removedCount.toLocaleString()}颗，可撤回`);
  };

  const eraseConnectedArea = (cell: { row: number; col: number }) => {
    const target = grid[cell.row]?.[cell.col] ?? '';
    if (!isFilledGridCell(target)) {
      showToast('这里已经是透明区域');
      return;
    }

    const nextGrid = floodFill(grid, cell.row, cell.col, '');
    if (nextGrid === grid) {
      showToast('这里已经是透明区域');
      return;
    }

    commitGrid(nextGrid);
    showToast('已删除这片区域');
  };

  const toggleOutlineColorPick = () => {
    if (isPickingOutlineColor) {
      setIsPickingOutlineColor(false);
      return;
    }

    clearActiveSelection();
    setPaletteOpen(false);
    setIsPickingOutlineColor(true);
  };

  const applyOutlineColor = (outlineColor: PatternPaletteColor) => {
    const outlineCells = findExteriorOutlineCells(grid);
    if (!outlineCells.length) {
      setIsPickingOutlineColor(false);
      showToast('当前图纸没有可描边的豆豆');
      return;
    }

    const nextGrid = cloneGrid(grid);
    let changedCount = 0;
    for (const cell of outlineCells) {
      if (nextGrid[cell.row][cell.col] === outlineColor.hex) continue;
      nextGrid[cell.row][cell.col] = outlineColor.hex;
      changedCount += 1;
    }

    setIsPickingOutlineColor(false);
    if (!changedCount) {
      showToast('轮廓已经是这个颜色');
      return;
    }

    commitGrid(nextGrid);
    applyColor(outlineColor.hex);
    showToast(`已使用 ${outlineColor.vendorCode} 描边 ${changedCount} 颗豆豆`);
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

    const safeCols = Math.max(minimumCanvasSize.cols, Math.min(EDITOR_CANVAS_MAX_SIDE, requestedCols));
    const safeRows = Math.max(minimumCanvasSize.rows, Math.min(EDITOR_CANVAS_MAX_SIDE, requestedRows));
    const didClamp = safeCols !== requestedCols || safeRows !== requestedRows;

    if (safeCols === cols && safeRows === rows) {
      if (didClamp) {
        showToast(`画布不能小于已编辑范围，最小 ${minimumCanvasSize.cols} × ${minimumCanvasSize.rows}`);
      }
      return;
    }

    clearActiveSelection();
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

  const canvasStageStyle = {
    top: 0,
    bottom: `${Math.max(0, toolbarHeight + 32)}px`,
  };

  const rulerData = useMemo(() => buildEditorRulerData({
    cols,
    rows,
    canvasLayout,
    viewport: canvasViewport,
    offset: rulerTransform.offset,
    scale: rulerTransform.scale,
    currentCell: rulerCurrentCell,
  }), [canvasLayout, canvasViewport, cols, rows, rulerCurrentCell, rulerTransform]);

  const canvasTransformStyle = {
    width: `${canvasLayout.width}px`,
    height: `${canvasLayout.height}px`,
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
  };

  const selectionDisplayRect = draftSelectionRect ?? selectionRect;
  const selectionBoxStyle = useMemo(() => {
    if (!selectionDisplayRect || cols <= 0 || rows <= 0 || canvasLayout.width <= 0 || canvasLayout.height <= 0) {
      return null;
    }

    const cellWidth = (canvasLayout.width / cols) * rulerTransform.scale;
    const cellHeight = (canvasLayout.height / rows) * rulerTransform.scale;

    return {
      left: `${rulerTransform.offset.x + selectionDisplayRect.startCol * cellWidth}px`,
      top: `${rulerTransform.offset.y + selectionDisplayRect.startRow * cellHeight}px`,
      width: `${Math.max(1, (selectionDisplayRect.endCol - selectionDisplayRect.startCol + 1) * cellWidth)}px`,
      height: `${Math.max(1, (selectionDisplayRect.endRow - selectionDisplayRect.startRow + 1) * cellHeight)}px`,
    };
  }, [canvasLayout.height, canvasLayout.width, cols, rows, rulerTransform, selectionDisplayRect]);

  const selectionMenuStyle = useMemo(() => {
    if (!selectionRect || !selectionBoxStyle) return null;

    const boxLeft = Number.parseFloat(selectionBoxStyle.left);
    const boxTop = Number.parseFloat(selectionBoxStyle.top);
    const boxWidth = Number.parseFloat(selectionBoxStyle.width);
    const viewportWidth = Math.max(1, canvasViewport.width);
    const viewportHeight = Math.max(1, canvasViewport.height);
    const menuWidth = 190;
    const menuHeight = 112;
    const gap = 10;
    const sideLeft = boxLeft + boxWidth + gap;
    const left = sideLeft + menuWidth <= viewportWidth - gap
      ? sideLeft
      : Math.max(gap, boxLeft - menuWidth - gap);
    const top = Math.max(gap, Math.min(viewportHeight - menuHeight - gap, boxTop));

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [canvasViewport.height, canvasViewport.width, selectionBoxStyle, selectionRect]);

  return (
    <>
      <LoadingOverlay
        open={!projectReady || isOpeningFocusMode}
        title={isOpeningFocusMode ? '正在进入拼豆' : '正在载入图纸'}
        message={isOpeningFocusMode ? '正在保存当前编辑内容并打开拼豆画布...' : '正在恢复图纸数据，画布较大时请稍候...'}
      />
      <main className={styles.page} aria-busy={!projectReady || isOpeningFocusMode}>
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
            <h1 title={displayProjectTitle}>{displayProjectTitle}</h1>
            <button
              type="button"
              className={styles.titleEditBtn}
              onClick={openRenameDialog}
              title="修改图纸名称"
              aria-label="修改图纸名称"
            >
              <EditTitleIcon />
            </button>
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
          applyZoom(scaleRef.current * factor, { clientX: event.clientX, clientY: event.clientY });
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

        <WorkshopEditorRulers
          data={rulerData}
          toolbarHeight={toolbarHeight}
          visible={projectReady && grid.length > 0}
        />

        {selectionBoxStyle ? (
          <div
            className={`${styles.selectionBox} ${draftSelectionRect ? styles.selectionDraftBox : ''} ${selectionOperation ? styles.selectionBoxDraggable : ''}`}
            style={{
              ...selectionBoxStyle,
              pointerEvents: selectionOperation ? 'auto' : 'none',
            }}
            aria-hidden={!selectionRect && !draftSelectionRect}
            onPointerDown={beginSelectionPlacement}
            onPointerMove={handleSelectionBoxPointerMove}
            onPointerUp={handleSelectionBoxPointerUp}
            onPointerCancel={handleSelectionBoxPointerUp}
          >
            {selectionOperation && selectionPreviewCells ? (
              <canvas
                ref={selectionPreviewCanvasRef}
                className={styles.selectionPreviewCanvas}
                aria-hidden="true"
              />
            ) : null}
          </div>
        ) : null}

        {selectionRect && selectionMenuStyle ? (
          <div
            className={styles.selectionMenu}
            style={selectionMenuStyle}
            role="status"
            aria-live="polite"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <strong>{selectionOperation ? (selectionOperation === 'copy' ? '复制中' : '移动中') : '已框选'}</strong>
            <span>{selectionOperation ? '拖动选框到目标位置，松手后覆盖' : '选择复制或移动，再拖动选框'}</span>
            <div className={styles.selectionMenuActions}>
              <button
                type="button"
                className={`${styles.selectionMenuBtn} ${selectionOperation === 'copy' ? styles.selectionMenuBtnActive : ''}`}
                onClick={() => startSelectionOperation('copy')}
              >
                复制
              </button>
              <button
                type="button"
                className={`${styles.selectionMenuBtn} ${selectionOperation === 'move' ? styles.selectionMenuBtnActive : ''}`}
                onClick={() => startSelectionOperation('move')}
              >
                移动
              </button>
              <button
                type="button"
                className={styles.selectionMenuBtn}
                onClick={clearActiveSelection}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

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
          <button
            type="button"
            className={styles.canvasActionBtn}
            onClick={removeEditorBackground}
            disabled={!grid.length}
            title="去背景"
            aria-label="去背景"
          >
            <img src={ICONS.removeBg} alt="" />
          </button>
          <button
            type="button"
            className={`${styles.canvasActionBtn} ${isPickingOutlineColor ? styles.isActive : ''}`}
            onClick={toggleOutlineColorPick}
            disabled={!grid.length}
            title={isPickingOutlineColor ? '退出描边' : '描边'}
            aria-label={isPickingOutlineColor ? '退出描边' : '描边'}
            aria-pressed={isPickingOutlineColor}
          >
            <img src={ICONS.stroke} alt="" />
          </button>
        </div>

        {isPickingOutlineColor ? (
          <div className={styles.outlineNotice} role="status" aria-live="polite">
            <strong>选择描边色开始描边</strong>
            <span>点击图纸上的任意豆豆取色。再次点击描边可退出。</span>
          </div>
        ) : null}

        <WorkshopPreviewPanel
          previewCanvasRef={previewCanvasRef}
          bubbleCanvasRef={bubbleCanvasRef}
        />

        <DownloadSettingsModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          brand={downloadBrand}
          patternResult={downloadPatternResult}
          config={{
            ...defaultWorkshopConfig,
            brand: downloadBrand,
            canvasSize: downloadPatternResult
              ? Math.max(downloadPatternResult.width, downloadPatternResult.height)
              : Math.max(rows, cols),
          }}
          defaultPatternName={displayProjectTitle}
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
                onClick={() => activateTool(item.id)}
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
              style={{ background: currentColor, ...currentColorCodeTextStyle }}
              onClick={() => setPaletteOpen(true)}
              title={`当前色号 ${currentColorCode}`}
              aria-label={`打开色卡，当前色号 ${currentColorCode}`}
            >
              <span className={styles.colorSwatchCode}>{currentColorCode}</span>
            </button>
          </div>
          <div className={styles.toolbarContent}>{renderToolRow2()}</div>
        </section>
      </div>

      {paletteOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setPaletteOpen(false)}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3>拼豆色卡 · {getBeadBrandLabel(editorBrand)}</h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setPaletteOpen(false)}
              >
                x
              </button>
            </header>
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

      {renameOpen ? (
        <div className={styles.modalBackdrop} onClick={closeRenameDialog}>
          <section className={`${styles.modal} ${styles.renameModal}`} onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3>修改图纸名称</h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={closeRenameDialog}
                aria-label="关闭弹窗"
                disabled={titleSaving}
              >
                x
              </button>
            </header>
            <div className={styles.renameBody}>
              <input
                className={styles.renameInput}
                value={draftTitle}
                placeholder={displayProjectTitle}
                autoFocus
                maxLength={40}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={handleRenameKeyDown}
              />
              <p>留空后会继续显示自动生成的未命名标题。</p>
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={closeRenameDialog} disabled={titleSaving}>
                取消
              </button>
              <button type="button" className={styles.primaryBtn} onClick={saveProjectTitle} disabled={titleSaving}>
                {titleSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <EditorSettingsSheet
        open={settingsOpen}
        brand={editorBrand}
        cols={cols}
        rows={rows}
        minCols={minimumCanvasSize.cols}
        minRows={minimumCanvasSize.rows}
        maxCols={Math.max(minimumCanvasSize.cols, EDITOR_CANVAS_MAX_SIDE)}
        maxRows={Math.max(minimumCanvasSize.rows, EDITOR_CANVAS_MAX_SIDE)}
        showDividers={showDividers}
        showColorCodes={showColorCodes}
        beadShape={beadShape}
        backgroundMode={backgroundMode}
        onClose={() => setSettingsOpen(false)}
        onBrandChange={(newBrand) => {
          setEditorBrand(newBrand);
          setDownloadBrand(newBrand);
          setActivePaletteGroup(ALL_PALETTE_GROUP);
        }}
        onResizeCanvas={handleResizeCanvas}
        onShowDividersChange={setShowDividers}
        onShowColorCodesChange={setShowColorCodes}
        onBeadShapeChange={setBeadShape}
        onBackgroundModeChange={setBackgroundMode}
      />
      </main>
    </>
  );
}
