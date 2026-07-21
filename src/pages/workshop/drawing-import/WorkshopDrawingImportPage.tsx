import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../../features/workshop/model/defaults';
import { createWorkshopProject } from '../../../features/workshop/model/projectStore';
import type { PatternCell, PatternResult } from '../../../features/workshop/model/types';
import { COMMON_IMAGE_FILE_ACCEPT, COMMON_IMAGE_FILE_LABEL, isCommonImageFile, waitForLoadingPaint } from '../../../lib/imageFile';
import { reconstructPatternFromImageGrid } from '../../../lib/pattern-import/cell-read';
import { createPatternImportProjectMeta } from '../../../lib/pattern-import/diagnostics';
import { decodePatternImportImageFile, type DecodedPatternImage } from '../../../lib/pattern-import/image-decode';
import { recognizeGridGroupCodes, type GridOcrGroupSuggestion } from '../../../lib/pattern-import/grid-ocr';
import {
  createLegendCropPreview,
  createManualLegendEntry,
  recognizeLegendFromCrop,
  type LegendOcrEntry,
} from '../../../lib/pattern-import/legend-ocr';
import { reconstructPatternResult } from '../../../lib/pattern-import/reconstruct';
import type { PatternImportResult } from '../../../lib/pattern-import/types';
import { getColorByBrandCode, normalizeBrandCodeInput } from '../../../lib/pattern/color-system';
import { drawPatternPreview } from '../../../lib/pattern/preview';
import { LoadingOverlay } from '../../../shared/ui/LoadingOverlay';
import styles from './WorkshopDrawingImportPage.module.css';

type StepId = 1 | 2 | 3 | 4 | 5;
type ResizeDragKind = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type DragKind = 'move' | ResizeDragKind;
type CalibrationGridSize = 3 | 4;
type CalibrationDragKind = 'move' | 'scale';

type PercentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LegendEntry = LegendOcrEntry;

type CropDragState = {
  target: 'legend';
  kind: DragKind;
  startX: number;
  startY: number;
  startRect: PercentRect;
};

type CalibrationGridAnchor = {
  col: number;
  row: number;
};

type CalibrationResizeAnchor = {
  point: {
    x: number;
    y: number;
  };
  gridPoint: CalibrationGridAnchor;
};

type CalibrationGridModel = {
  originX: number;
  originY: number;
  cellSizePx: number;
};

type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CalibrationDragState = {
  kind: CalibrationDragKind;
  pointerId: number;
  capturedElement: HTMLElement;
  startX: number;
  startY: number;
  startGrid: CalibrationGridModel;
  startOperationRect: PixelRect;
  startAnchor: CalibrationGridAnchor;
};

type GridCropRect = {
  col: number;
  row: number;
  columns: number;
  rows: number;
};

type GridCropBounds = {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
};

type ReviewCellAssignment = {
  colorId: string;
  vendorCode: string;
  hex: string;
  isExternal?: boolean;
};

type ReviewGroup = {
  key: string;
  title: string;
  hex: string;
  count: number;
  warning: boolean;
  expectedCount?: number;
  cells: PatternCell[];
};

type GridCropDragState = {
  kind: DragKind;
  pointerId: number;
  capturedElement: HTMLElement;
  startX: number;
  startY: number;
  startRect: GridCropRect;
  startCellSizePx: number;
};

type ZoomArea = 'legendCrop' | 'legendPreview' | 'patternAlign';
type BusyMode = 'file' | 'legend' | 'pattern' | 'gridOcr' | 'enter';

type Size = {
  width: number;
  height: number;
};

type ZoomGestureState = {
  pointers: Map<number, { x: number; y: number }>;
  startDistance: number;
  startZoom: number;
  startPanX: number;
  startPanY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type PendingZoomAdjustment = {
  area: ZoomArea;
  clientX: number;
  clientY: number;
  anchorX: number;
  anchorY: number;
};

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 1, label: '上传' },
  { id: 2, label: '图例' },
  { id: 3, label: '对齐' },
  { id: 4, label: '裁剪' },
  { id: 5, label: '检查' },
];

const DEFAULT_LEGEND_RECT: PercentRect = { x: 12, y: 76, width: 76, height: 16 };
const DEFAULT_PATTERN_RECT: PercentRect = { x: 8, y: 12, width: 84, height: 74 };
const CROP_RESIZE_HANDLES: ResizeDragKind[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CALIBRATION_GRID_SIZES: CalibrationGridSize[] = [3, 4];
const MIN_CALIBRATION_CELL_SIZE_PX = 4;
const DEFAULT_INITIAL_GRID_LONG_SIDE_CELLS = 72;
const MAX_INITIAL_GRID_CELLS = 240;
const CALIBRATION_NUDGE_STEP_PX = 0.1;
const CALIBRATION_CELL_SIZE_STEP_PX = 0.01;
const LONG_PRESS_REPEAT_DELAY_MS = 320;
const LONG_PRESS_REPEAT_INTERVAL_MS = 48;
const MIN_ZOOM = 1;
const MAX_ZOOM = 50;
const ZOOM_STEP = 0.05;
const WHEEL_ZOOM_SENSITIVITY = 0.0006;
const REVIEW_THUMB_SIZE = 42;
const GRID_OCR_MIN_CONFIDENCE = 0.25;

function createProjectId() {
  return `drawing-import-${Date.now()}`;
}

function getTitleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || '图纸识别作品';
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect: PercentRect): PercentRect {
  const width = clamp(rect.width, 6, 100);
  const height = clamp(rect.height, 6, 100);
  return {
    x: clamp(rect.x, 0, 100 - width),
    y: clamp(rect.y, 0, 100 - height),
    width,
    height,
  };
}

function normalizeZoom(value: number) {
  const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP;
  return clamp(stepped, MIN_ZOOM, MAX_ZOOM);
}

function getContainedSize(content: Size, bounds: Size): Size | null {
  if (!content.width || !content.height || !bounds.width || !bounds.height) return null;
  const scale = Math.min(bounds.width / content.width, bounds.height / content.height);
  return {
    width: Math.max(1, content.width * scale),
    height: Math.max(1, content.height * scale),
  };
}

function rectToPixels(rect: PercentRect, image: DecodedPatternImage) {
  const normalized = normalizeRect(rect);
  const x = Math.round((normalized.x / 100) * image.width);
  const y = Math.round((normalized.y / 100) * image.height);
  const width = Math.max(1, Math.round((normalized.width / 100) * image.width));
  const height = Math.max(1, Math.round((normalized.height / 100) * image.height));
  return {
    x: clamp(x, 0, image.width - 1),
    y: clamp(y, 0, image.height - 1),
    width: clamp(width, 1, image.width - x),
    height: clamp(height, 1, image.height - y),
  };
}

function getInitialGrid(image: DecodedPatternImage) {
  const estimatedCell = Math.max(
    MIN_CALIBRATION_CELL_SIZE_PX,
    Math.round(Math.max(image.width, image.height) / DEFAULT_INITIAL_GRID_LONG_SIDE_CELLS),
  );
  return {
    columns: clamp(Math.round(image.width / estimatedCell), 12, MAX_INITIAL_GRID_CELLS),
    rows: clamp(Math.round(image.height / estimatedCell), 12, MAX_INITIAL_GRID_CELLS),
  };
}

function getImageBasedCalibrationCellSize(
  image: DecodedPatternImage,
  columns: number,
  rows: number,
  preferredAxis?: 'columns' | 'rows',
) {
  const cellWidth = image.width / Math.max(1, Math.round(columns));
  const cellHeight = image.height / Math.max(1, Math.round(rows));
  const cellSize = preferredAxis === 'columns'
    ? cellWidth
    : preferredAxis === 'rows'
      ? cellHeight
      : (cellWidth + cellHeight) / 2;

  return clamp(
    cellSize,
    MIN_CALIBRATION_CELL_SIZE_PX,
    Math.max(MIN_CALIBRATION_CELL_SIZE_PX, image.width, image.height),
  );
}

function getInitialCalibrationGrid(image: DecodedPatternImage, columns: number, rows: number): CalibrationGridModel {
  return {
    originX: 0,
    originY: 0,
    cellSizePx: getImageBasedCalibrationCellSize(image, columns, rows),
  };
}

function normalizeCalibrationGrid(grid: CalibrationGridModel, image: DecodedPatternImage | null): CalibrationGridModel {
  const imageWidth = Math.max(1, image?.width ?? 1);
  const imageHeight = Math.max(1, image?.height ?? 1);
  const maxExtent = Math.max(imageWidth, imageHeight);
  const maxCellSize = Math.max(MIN_CALIBRATION_CELL_SIZE_PX, maxExtent);
  return {
    originX: clamp(grid.originX, -maxExtent, imageWidth + maxExtent),
    originY: clamp(grid.originY, -maxExtent, imageHeight + maxExtent),
    cellSizePx: clamp(grid.cellSizePx, MIN_CALIBRATION_CELL_SIZE_PX, maxCellSize),
  };
}

function clampCalibrationAnchor(
  anchor: CalibrationGridAnchor,
  columns: number,
  rows: number,
  size: CalibrationGridSize,
): CalibrationGridAnchor {
  const normalizedColumns = Math.max(1, Math.round(columns));
  const normalizedRows = Math.max(1, Math.round(rows));
  return {
    col: Math.round(clamp(anchor.col, 0, Math.max(0, normalizedColumns - size))),
    row: Math.round(clamp(anchor.row, 0, Math.max(0, normalizedRows - size))),
  };
}

function getDefaultCalibrationAnchor(columns: number, rows: number, size: CalibrationGridSize): CalibrationGridAnchor {
  return clampCalibrationAnchor({
    col: Math.floor((Math.max(1, Math.round(columns)) - size) / 2),
    row: Math.floor((Math.max(1, Math.round(rows)) - size) / 2),
  }, columns, rows, size);
}

function clampGridCropRect(rect: GridCropRect, columns: number, rows: number): GridCropRect {
  const normalizedColumns = Math.max(1, Math.round(columns));
  const normalizedRows = Math.max(1, Math.round(rows));
  const width = Math.round(clamp(rect.columns, 1, normalizedColumns));
  const height = Math.round(clamp(rect.rows, 1, normalizedRows));
  return {
    col: Math.round(clamp(rect.col, 0, normalizedColumns - width)),
    row: Math.round(clamp(rect.row, 0, normalizedRows - height)),
    columns: width,
    rows: height,
  };
}

function clampGridCropRectToBounds(rect: GridCropRect, bounds: GridCropBounds): GridCropRect {
  const minCol = Math.round(Math.min(bounds.minCol, bounds.maxCol - 1));
  const minRow = Math.round(Math.min(bounds.minRow, bounds.maxRow - 1));
  const maxCol = Math.round(Math.max(bounds.maxCol, minCol + 1));
  const maxRow = Math.round(Math.max(bounds.maxRow, minRow + 1));
  const maxWidth = maxCol - minCol;
  const maxHeight = maxRow - minRow;
  const width = Math.round(clamp(rect.columns, 1, maxWidth));
  const height = Math.round(clamp(rect.rows, 1, maxHeight));

  return {
    col: Math.round(clamp(rect.col, minCol, maxCol - width)),
    row: Math.round(clamp(rect.row, minRow, maxRow - height)),
    columns: width,
    rows: height,
  };
}

function getDefaultGridCropRect(columns: number, rows: number): GridCropRect {
  return clampGridCropRect({
    col: 0,
    row: 0,
    columns: Math.max(1, Math.round(columns)),
    rows: Math.max(1, Math.round(rows)),
  }, columns, rows);
}

function getCellKey(x: number, y: number) {
  return `${x},${y}`;
}

function createTransparentAssignment(): ReviewCellAssignment {
  return {
    colorId: '__TRANSPARENT__',
    vendorCode: '',
    hex: 'transparent',
    isExternal: true,
  };
}

function applyCellCorrectionsToPattern(
  patternResult: PatternResult,
  corrections: Record<string, ReviewCellAssignment>,
) {
  if (Object.keys(corrections).length === 0) return patternResult;
  return reconstructPatternResult({
    width: patternResult.width,
    height: patternResult.height,
    cells: patternResult.cells.map((cell) => {
      const correction = corrections[getCellKey(cell.x, cell.y)];
      if (!correction) return cell;
      return {
        ...cell,
        colorId: correction.colorId,
        vendorCode: correction.vendorCode,
        hex: correction.hex,
        isExternal: correction.isExternal,
      };
    }),
  });
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findNearestLegend(hex: string, legendEntries: LegendEntry[]) {
  const rgb = hexToRgb(hex);
  if (!rgb || legendEntries.length === 0) return null;
  let nearest: LegendEntry | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const entry of legendEntries) {
    const entryRgb = hexToRgb(entry.hex);
    if (!entryRgb) continue;
    const distance = colorDistance(rgb, entryRgb);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function applyLegendToPattern(patternResult: PatternResult, legendEntries: LegendEntry[]) {
  if (legendEntries.length === 0) return patternResult;
  const cells: PatternCell[] = patternResult.cells.map((cell) => {
    if (cell.hex === 'transparent') return cell;
    const nearest = findNearestLegend(cell.hex, legendEntries);
    if (!nearest) return cell;
    const mappedColor = getColorByBrandCode(defaultWorkshopConfig.brand, nearest.code);
    return {
      ...cell,
      colorId: mappedColor?.hex ?? nearest.hex,
      vendorCode: mappedColor?.code ?? normalizeBrandCodeInput(nearest.code),
      hex: mappedColor?.hex ?? nearest.hex,
    };
  });
  return reconstructPatternResult({ width: patternResult.width, height: patternResult.height, cells });
}

function mapLegendEntryToColorSystem(entry: LegendEntry): LegendEntry {
  const code = normalizeBrandCodeInput(entry.code);
  if (!code) return entry;
  const mappedColor = getColorByBrandCode(defaultWorkshopConfig.brand, code);
  return mappedColor ? { ...entry, code, hex: mappedColor.hex } : { ...entry, code };
}

function getCanonicalLegendCode(code: string) {
  return getColorByBrandCode(defaultWorkshopConfig.brand, code)?.code ?? normalizeBrandCodeInput(code);
}

function createAssignmentFromCode(code: string, fallbackHex: string): ReviewCellAssignment {
  const normalizedCode = normalizeBrandCodeInput(code);
  const mappedColor = getColorByBrandCode(defaultWorkshopConfig.brand, normalizedCode);
  return {
    colorId: mappedColor?.hex ?? fallbackHex,
    vendorCode: mappedColor?.code ?? normalizedCode,
    hex: mappedColor?.hex ?? fallbackHex,
  };
}

function isGeneratedImportCode(code: string) {
  const normalized = normalizeBrandCodeInput(code);
  return !normalized || normalized === '?' || /^IMG\d+$/i.test(normalized) || normalized.startsWith('#');
}

function PatternPreviewCanvas({ patternResult }: { patternResult: PatternResult }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const longestSide = Math.max(patternResult.width, patternResult.height, 1);
    const cellSize = Math.max(3, Math.min(12, Math.floor(340 / longestSide)));
    canvas.width = Math.max(1, patternResult.width * cellSize);
    canvas.height = Math.max(1, patternResult.height * cellSize);
    drawPatternPreview({ canvas, pattern: patternResult });
  }, [patternResult]);

  return <canvas ref={canvasRef} className={styles.patternCanvas} aria-label="识别后的图纸预览" />;
}

export function WorkshopDrawingImportPage() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const legendCropViewportRef = useRef<HTMLDivElement | null>(null);
  const legendPreviewViewportRef = useRef<HTMLDivElement | null>(null);
  const patternAlignViewportRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const calibrationDragRef = useRef<CalibrationDragState | null>(null);
  const gridCropDragRef = useRef<GridCropDragState | null>(null);
  const repeatActionRef = useRef<{
    delayTimer: number | null;
    intervalTimer: number | null;
    didRepeat: boolean;
  }>({
    delayTimer: null,
    intervalTimer: null,
    didRepeat: false,
  });
  const cropZoomGestureRef = useRef<ZoomGestureState>({
    pointers: new Map(),
    startDistance: 0,
    startZoom: 1,
    startPanX: 0,
    startPanY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const previewZoomGestureRef = useRef<ZoomGestureState>({
    pointers: new Map(),
    startDistance: 0,
    startZoom: 1,
    startPanX: 0,
    startPanY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const patternAlignZoomGestureRef = useRef<ZoomGestureState>({
    pointers: new Map(),
    startDistance: 0,
    startZoom: 1,
    startPanX: 0,
    startPanY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const latestZoomRef = useRef<Record<ZoomArea, number>>({
    legendCrop: 1,
    legendPreview: 1,
    patternAlign: 1,
  });
  const pendingZoomAdjustmentRef = useRef<PendingZoomAdjustment | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [step, setStep] = useState<StepId>(1);
  const [decodedImage, setDecodedImage] = useState<DecodedPatternImage | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [legendRect, setLegendRect] = useState<PercentRect>(DEFAULT_LEGEND_RECT);
  const [calibrationGrid, setCalibrationGrid] = useState<CalibrationGridModel>({
    originX: 0,
    originY: 0,
    cellSizePx: 10,
  });
  const [columns, setColumns] = useState(70);
  const [rows, setRows] = useState(70);
  const [gridCropRect, setGridCropRect] = useState<GridCropRect>(() => getDefaultGridCropRect(70, 70));
  const [legendEntries, setLegendEntries] = useState<LegendEntry[]>([]);
  const [legendMode, setLegendMode] = useState<'crop' | 'review'>('crop');
  const [legendOcrText, setLegendOcrText] = useState('');
  const [recognitionResult, setRecognitionResult] = useState<PatternImportResult | null>(null);
  const [cellCorrections, setCellCorrections] = useState<Record<string, ReviewCellAssignment>>({});
  const [selectedReviewCellKeys, setSelectedReviewCellKeys] = useState<string[]>([]);
  const [reviewTargetColorId, setReviewTargetColorId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<BusyMode>('file');
  const [gridOcrSuggestions, setGridOcrSuggestions] = useState<Record<string, GridOcrGroupSuggestion>>({});
  const [gridOcrSummary, setGridOcrSummary] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [notice, setNotice] = useState('');
  const [legendCropZoom, setLegendCropZoom] = useState(1);
  const [legendPreviewZoom, setLegendPreviewZoom] = useState(1);
  const [patternAlignZoom, setPatternAlignZoom] = useState(1);
  const [calibrationGridSize, setCalibrationGridSize] = useState<CalibrationGridSize>(3);
  const [calibrationAnchor, setCalibrationAnchor] = useState<CalibrationGridAnchor>(() => getDefaultCalibrationAnchor(70, 70, 3));
  const [activePanArea, setActivePanArea] = useState<ZoomArea | null>(null);
  const [legendCropViewportSize, setLegendCropViewportSize] = useState<Size>({ width: 0, height: 0 });
  const [patternAlignViewportSize, setPatternAlignViewportSize] = useState<Size>({ width: 0, height: 0 });

  const legendPreviewUrl = useMemo(() => {
    if (!decodedImage) return '';
    return createLegendCropPreview(decodedImage, legendRect);
  }, [decodedImage, legendRect]);

  const legendCropFitSize = useMemo(() => (
    decodedImage
      ? getContainedSize(
          { width: decodedImage.width, height: decodedImage.height },
          legendCropViewportSize,
        )
      : null
  ), [decodedImage, legendCropViewportSize]);

  const patternAlignFitSize = useMemo(() => (
    decodedImage
      ? getContainedSize(
          { width: decodedImage.width, height: decodedImage.height },
          patternAlignViewportSize,
        )
      : null
  ), [decodedImage, patternAlignViewportSize]);

  const legendTotalCount = useMemo(() => (
    legendEntries.reduce((sum, entry) => sum + (entry.count ?? 0), 0)
  ), [legendEntries]);

  const legendMissingCount = useMemo(() => (
    legendEntries.filter((entry) => !entry.code.trim() || entry.count === null).length
  ), [legendEntries]);

  const finalPatternResult = useMemo(() => {
    if (!recognitionResult?.patternResult) return null;
    const legendApplied = applyLegendToPattern(recognitionResult.patternResult, legendEntries);
    return applyCellCorrectionsToPattern(legendApplied, cellCorrections);
  }, [cellCorrections, legendEntries, recognitionResult]);

  const reviewColorOptions = useMemo(() => {
    const legendOptions = legendEntries
      .filter((entry) => entry.code.trim() && entry.hex.trim())
      .map((entry) => ({
        colorId: entry.hex,
        vendorCode: getCanonicalLegendCode(entry.code),
        hex: entry.hex,
      }));
    if (legendOptions.length > 0) return legendOptions;
    return finalPatternResult?.palette.map((entry) => ({
      colorId: entry.colorId,
      vendorCode: entry.vendorCode,
      hex: entry.hex,
    })) ?? [];
  }, [finalPatternResult, legendEntries]);

  const reviewGroups = useMemo(() => {
    if (!finalPatternResult) return [];
    const confidenceByCell = new Map(
      recognitionResult?.analysis.cells.map((cell) => [getCellKey(cell.x, cell.y), cell.confidence]) ?? [],
    );
    const groups = new Map<string, ReviewGroup>();

    const ensureGroup = (key: string, title: string, hex: string, warning = false) => {
      const current = groups.get(key);
      if (current) return current;
      const group: ReviewGroup = { key, title, hex, count: 0, warning, cells: [] };
      groups.set(key, group);
      return group;
    };

    finalPatternResult.cells.forEach((cell) => {
      const key = getCellKey(cell.x, cell.y);
      const confidence = confidenceByCell.get(key) ?? 1;
      const corrected = Boolean(cellCorrections[key]);
      const isEmpty = cell.isExternal || cell.hex === 'transparent';
      const group = !corrected && !isEmpty && confidence < 0.54
        ? ensureGroup('__unrecognized__', '未识别', '#FEE2E2', true)
        : isEmpty
          ? ensureGroup('__empty__', '空白', 'transparent')
          : ensureGroup(cell.colorId || cell.hex, cell.vendorCode || cell.colorId || cell.hex, cell.hex);
      group.count += 1;
      group.cells.push(cell);
    });

    return Array.from(groups.values()).map((group) => {
      const expectedCount = legendEntries.find((entry) => (
        getCanonicalLegendCode(entry.code) === getCanonicalLegendCode(group.title)
      ))?.count;
      const hasMismatch = typeof expectedCount === 'number' && expectedCount !== group.count;
      return {
        ...group,
        expectedCount: expectedCount ?? undefined,
        warning: group.warning || hasMismatch,
      };
    }).sort((a, b) => {
      if (a.key === '__unrecognized__') return -1;
      if (b.key === '__unrecognized__') return 1;
      if (a.key === '__empty__') return -1;
      if (b.key === '__empty__') return 1;
      return b.count - a.count;
    });
  }, [cellCorrections, finalPatternResult, legendEntries, recognitionResult]);

  const selectedReviewCellSet = useMemo(() => (
    new Set(selectedReviewCellKeys)
  ), [selectedReviewCellKeys]);

  const getReviewGroupSelectedCount = (cells: PatternCell[]) => (
    cells.reduce((sum, cell) => sum + (selectedReviewCellSet.has(getCellKey(cell.x, cell.y)) ? 1 : 0), 0)
  );

  const getReviewCellPreviewStyle = (cell: PatternCell): CSSProperties => {
    const grid = recognitionResult?.analysis.selectedGrid;
    const fallbackColor = cell.isExternal || cell.hex === 'transparent' ? '#F1F5F9' : cell.hex;
    if (!decodedImage || !grid) return { backgroundColor: fallbackColor };

    const cellWidth = Math.max(1, grid.cellWidth);
    const cellHeight = Math.max(1, grid.cellHeight);
    const scale = Math.max(REVIEW_THUMB_SIZE / cellWidth, REVIEW_THUMB_SIZE / cellHeight);
    const sourceX = grid.bounds.x + cell.x * cellWidth;
    const sourceY = grid.bounds.y + cell.y * cellHeight;
    const offsetX = (REVIEW_THUMB_SIZE - cellWidth * scale) / 2 - sourceX * scale;
    const offsetY = (REVIEW_THUMB_SIZE - cellHeight * scale) / 2 - sourceY * scale;

    return {
      backgroundColor: fallbackColor,
      backgroundImage: `url("${decodedImage.dataUrl}")`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${decodedImage.width * scale}px ${decodedImage.height * scale}px`,
    };
  };

  const isGridOcrSuggestionConflict = (group: ReviewGroup, suggestion?: GridOcrGroupSuggestion) => {
    if (!suggestion || group.key === '__empty__' || group.key === '__unrecognized__') return false;
    const currentCode = getCanonicalLegendCode(group.title);
    const suggestedCode = getCanonicalLegendCode(suggestion.code);
    if (!currentCode || !suggestedCode || isGeneratedImportCode(currentCode)) return false;
    return currentCode !== suggestedCode;
  };

  const canApplyGridOcrSuggestion = (group: ReviewGroup, suggestion?: GridOcrGroupSuggestion) => (
    Boolean(suggestion)
      && group.key !== '__empty__'
      && group.key !== '__unrecognized__'
      && !isGridOcrSuggestionConflict(group, suggestion)
      && (suggestion?.confidence ?? 0) >= GRID_OCR_MIN_CONFIDENCE
  );

  const applicableGridOcrSuggestionCount = useMemo(() => (
    reviewGroups.reduce((count, group) => (
      count + (canApplyGridOcrSuggestion(group, gridOcrSuggestions[group.key]) ? 1 : 0)
    ), 0)
  ), [gridOcrSuggestions, reviewGroups]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      stopRepeatAction(true);
    };
  }, []);

  useEffect(() => {
    latestZoomRef.current.legendCrop = legendCropZoom;
  }, [legendCropZoom]);

  useEffect(() => {
    latestZoomRef.current.legendPreview = legendPreviewZoom;
  }, [legendPreviewZoom]);

  useEffect(() => {
    latestZoomRef.current.patternAlign = patternAlignZoom;
  }, [patternAlignZoom]);

  useEffect(() => {
    setCalibrationAnchor((current) => clampCalibrationAnchor(current, columns, rows, calibrationGridSize));
  }, [calibrationGridSize, columns, rows]);

  useEffect(() => {
    if (!reviewTargetColorId && reviewColorOptions.length > 0) {
      setReviewTargetColorId(reviewColorOptions[0].colorId);
    }
  }, [reviewColorOptions, reviewTargetColorId]);

  useEffect(() => {
    setGridCropRect((current) => clampGridCropRect(current, columns, rows));
  }, [columns, rows]);

  const getZoomViewportElement = (area: ZoomArea) => (
    area === 'legendCrop'
      ? legendCropViewportRef.current
      : area === 'patternAlign'
        ? patternAlignViewportRef.current
        : legendPreviewViewportRef.current
  );

  const getZoomTargetElement = (area: ZoomArea, viewport: HTMLDivElement) => {
    if (area === 'legendPreview') return viewport.querySelector('img');
    return stageRef.current;
  };

  useLayoutEffect(() => {
    const adjustment = pendingZoomAdjustmentRef.current;
    if (!adjustment) return;
    pendingZoomAdjustmentRef.current = null;

    const viewport = getZoomViewportElement(adjustment.area);
    if (!viewport) return;

    const target = getZoomTargetElement(adjustment.area, viewport);
    const targetBounds = target?.getBoundingClientRect();
    if (!targetBounds?.width || !targetBounds.height) return;

    const anchoredClientX = targetBounds.left + adjustment.anchorX * targetBounds.width;
    const anchoredClientY = targetBounds.top + adjustment.anchorY * targetBounds.height;
    viewport.scrollLeft += anchoredClientX - adjustment.clientX;
    viewport.scrollTop += anchoredClientY - adjustment.clientY;
  }, [legendCropZoom, legendPreviewZoom, patternAlignZoom, legendCropFitSize, patternAlignFitSize]);

  useEffect(() => {
    const viewport = legendCropViewportRef.current;
    if (!viewport || step !== 2 || legendMode !== 'crop') return;

    const updateSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setLegendCropViewportSize((current) => {
        if (Math.abs(current.width - bounds.width) < 0.5 && Math.abs(current.height - bounds.height) < 0.5) {
          return current;
        }
        return {
          width: bounds.width,
          height: bounds.height,
        };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [legendMode, step]);

  useEffect(() => {
    const viewport = patternAlignViewportRef.current;
    if (!viewport || (step !== 3 && step !== 4)) return;

    const updateSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setPatternAlignViewportSize((current) => {
        if (Math.abs(current.width - bounds.width) < 0.5 && Math.abs(current.height - bounds.height) < 0.5) {
          return current;
        }
        return {
          width: bounds.width,
          height: bounds.height,
        };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [step]);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice('');
      noticeTimerRef.current = null;
    }, 2200);
  };

  function stopRepeatAction(resetDidRepeat = false) {
    const repeatAction = repeatActionRef.current;
    if (repeatAction.delayTimer) {
      window.clearTimeout(repeatAction.delayTimer);
      repeatAction.delayTimer = null;
    }
    if (repeatAction.intervalTimer) {
      window.clearInterval(repeatAction.intervalTimer);
      repeatAction.intervalTimer = null;
    }
    if (resetDidRepeat) repeatAction.didRepeat = false;
  }

  const startRepeatAction = (action: () => void, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stopRepeatAction(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers release capture automatically.
    }

    repeatActionRef.current.delayTimer = window.setTimeout(() => {
      repeatActionRef.current.didRepeat = true;
      action();
      repeatActionRef.current.intervalTimer = window.setInterval(action, LONG_PRESS_REPEAT_INTERVAL_MS);
    }, LONG_PRESS_REPEAT_DELAY_MS);
  };

  const getRepeatButtonProps = (action: () => void) => ({
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (repeatActionRef.current.didRepeat) {
        event.preventDefault();
        repeatActionRef.current.didRepeat = false;
        return;
      }
      action();
    },
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => startRepeatAction(action, event),
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      stopRepeatAction();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
    },
    onPointerCancel: () => stopRepeatAction(true),
    onPointerLeave: () => stopRepeatAction(),
    onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  const handleBack = () => {
    if (step > 1) {
      setStep((current) => Math.max(1, current - 1) as StepId);
      return;
    }
    navigate('/workshop');
  };

  const handleUploadFile = async (file: File) => {
    if (!isCommonImageFile(file)) {
      showNotice(`图纸导入仅支持 ${COMMON_IMAGE_FILE_LABEL}`);
      return;
    }

    setBusyMode('file');
    setBusyMode('pattern');
    setBusyMode('enter');
    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const image = await decodePatternImportImageFile(file);
      const grid = getInitialGrid(image);
      const initialCalibrationGrid = getInitialCalibrationGrid(image, grid.columns, grid.rows);
      setSelectedFileName(file.name);
      setDecodedImage(image);
      setLegendRect(DEFAULT_LEGEND_RECT);
      setCalibrationGrid(initialCalibrationGrid);
      setColumns(grid.columns);
      setRows(grid.rows);
      setGridCropRect(getDefaultGridCropRect(grid.columns, grid.rows));
      setCalibrationGridSize(3);
      setCalibrationAnchor(getDefaultCalibrationAnchor(grid.columns, grid.rows, 3));
      setLegendEntries([]);
      setLegendMode('crop');
      setLegendOcrText('');
      setRecognitionResult(null);
      setCellCorrections({});
      setSelectedReviewCellKeys([]);
      setReviewTargetColorId('');
      setGridOcrSuggestions({});
      setGridOcrSummary('');
      setLegendCropZoom(1);
      setLegendPreviewZoom(1);
      setPatternAlignZoom(1);
      setStep(2);
    } catch {
      showNotice(`图片读取失败，请选择 ${COMMON_IMAGE_FILE_LABEL}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await handleUploadFile(file);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleUploadFile(file);
  };

  const startCropDrag = (target: 'legend', kind: DragKind, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      target,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startRect: legendRect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;
    const start = drag.startRect;
    let next = { ...start };

    if (drag.kind === 'move') {
      next.x = start.x + deltaX;
      next.y = start.y + deltaY;
    } else {
      if (drag.kind.includes('w')) {
        next.x = start.x + deltaX;
        next.width = start.width - deltaX;
      }
      if (drag.kind.includes('e')) {
        next.width = start.width + deltaX;
      }
      if (drag.kind.includes('n')) {
        next.y = start.y + deltaY;
        next.height = start.height - deltaY;
      }
      if (drag.kind.includes('s')) {
        next.height = start.height + deltaY;
      }
    }

    const normalized = normalizeRect(next);
    if (drag.target === 'legend') setLegendRect(normalized);
  };

  const handleCropPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!cropDragRef.current) return;
    cropDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const getCalibrationOperationRect = (grid: CalibrationGridModel = calibrationGrid) => {
    const anchor = clampCalibrationAnchor(calibrationAnchor, columns, rows, calibrationGridSize);
    const metrics = getSquareGridMetrics(grid);
    return {
      x: metrics.originX + anchor.col * metrics.cellSizePx,
      y: metrics.originY + anchor.row * metrics.cellSizePx,
      width: metrics.cellSizePx * Math.min(calibrationGridSize, Math.max(1, Math.round(columns) - anchor.col)),
      height: metrics.cellSizePx * Math.min(calibrationGridSize, Math.max(1, Math.round(rows) - anchor.row)),
    };
  };

  const getStagePointImagePx = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const bounds = stage?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    const imageWidth = Math.max(1, decodedImage?.width ?? 1);
    const imageHeight = Math.max(1, decodedImage?.height ?? 1);
    return {
      x: ((clientX - bounds.left) / bounds.width) * imageWidth,
      y: ((clientY - bounds.top) / bounds.height) * imageHeight,
    };
  };

  const isPointInRect = (point: { x: number; y: number }, rect: PixelRect) => (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );

  const getSquareGridMetrics = (grid: CalibrationGridModel = calibrationGrid) => {
    const normalizedGrid = normalizeCalibrationGrid(grid, decodedImage);
    return {
      originX: normalizedGrid.originX,
      originY: normalizedGrid.originY,
      cellSizePx: normalizedGrid.cellSizePx,
    };
  };

  const getImageGridCropBounds = (grid: CalibrationGridModel = calibrationGrid): GridCropBounds => {
    const metrics = getSquareGridMetrics(grid);
    const imageWidth = Math.max(1, decodedImage?.width ?? 1);
    const imageHeight = Math.max(1, decodedImage?.height ?? 1);
    const minCol = Math.floor((0 - metrics.originX) / metrics.cellSizePx);
    const minRow = Math.floor((0 - metrics.originY) / metrics.cellSizePx);
    const maxCol = Math.ceil((imageWidth - metrics.originX) / metrics.cellSizePx);
    const maxRow = Math.ceil((imageHeight - metrics.originY) / metrics.cellSizePx);
    return {
      minCol,
      minRow,
      maxCol: Math.max(minCol + 1, maxCol),
      maxRow: Math.max(minRow + 1, maxRow),
    };
  };

  const clampGridCropRectToImage = (rect: GridCropRect, grid: CalibrationGridModel = calibrationGrid) => (
    clampGridCropRectToBounds(rect, getImageGridCropBounds(grid))
  );

  const getImageEdgeGridCropRect = (grid: CalibrationGridModel = calibrationGrid): GridCropRect => {
    const bounds = getImageGridCropBounds(grid);
    return clampGridCropRectToBounds({
      col: bounds.minCol,
      row: bounds.minRow,
      columns: bounds.maxCol - bounds.minCol,
      rows: bounds.maxRow - bounds.minRow,
    }, bounds);
  };

  const getCalibrationMoveAnchor = (grid: CalibrationGridModel = calibrationGrid): CalibrationResizeAnchor => {
    const metrics = getSquareGridMetrics(grid);
    const gridPoint = clampCalibrationAnchor(calibrationAnchor, columns, rows, calibrationGridSize);
    return {
      point: {
        x: metrics.originX + gridPoint.col * metrics.cellSizePx,
        y: metrics.originY + gridPoint.row * metrics.cellSizePx,
      },
      gridPoint,
    };
  };

  const startCalibrationGridDrag = (kind: CalibrationDragKind, event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startAnchor = getCalibrationMoveAnchor();
    calibrationDragRef.current = {
      kind,
      pointerId: event.pointerId,
      capturedElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startGrid: calibrationGrid,
      startOperationRect: getCalibrationOperationRect(),
      startAnchor: startAnchor.gridPoint,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for some nested controls.
    }
  };

  const startCalibrationGridAreaDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button')) return;
    const point = getStagePointImagePx(event.clientX, event.clientY);
    if (!point || !isPointInRect(point, getCalibrationOperationRect())) return;
    startCalibrationGridDrag('move', event);
  };

  const handleCalibrationPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = calibrationDragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const imageWidth = Math.max(1, decodedImage?.width ?? 1);
    const imageHeight = Math.max(1, decodedImage?.height ?? 1);
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * imageWidth;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * imageHeight;

    if (drag.kind === 'move') {
      setCalibrationGrid(normalizeCalibrationGrid({
        ...drag.startGrid,
        originX: drag.startGrid.originX + deltaX,
        originY: drag.startGrid.originY + deltaY,
      }, decodedImage));
      return;
    }

    const deltaPx = Math.max(deltaX, deltaY);
    const nextOperationWidthPx = Math.max(1, drag.startOperationRect.width + deltaPx);
    const nextCellSizePx = clamp(
      nextOperationWidthPx / calibrationGridSize,
      MIN_CALIBRATION_CELL_SIZE_PX,
      Math.max(MIN_CALIBRATION_CELL_SIZE_PX, imageWidth, imageHeight),
    );
    setCalibrationGrid(normalizeCalibrationGrid({
      originX: drag.startOperationRect.x - drag.startAnchor.col * nextCellSizePx,
      originY: drag.startOperationRect.y - drag.startAnchor.row * nextCellSizePx,
      cellSizePx: nextCellSizePx,
    }, decodedImage));
  };

  const handleCalibrationPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = calibrationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    calibrationDragRef.current = null;
    try {
      drag.capturedElement.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const startGridCropDrag = (kind: DragKind, event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    gridCropDragRef.current = {
      kind,
      pointerId: event.pointerId,
      capturedElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startRect: clampGridCropRectToImage(gridCropRect),
      startCellSizePx: getSquareGridMetrics().cellSizePx,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for nested controls.
    }
  };

  const handleGridCropPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = gridCropDragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const imageWidth = Math.max(1, decodedImage?.width ?? 1);
    const imageHeight = Math.max(1, decodedImage?.height ?? 1);
    const deltaPxX = ((event.clientX - drag.startX) / bounds.width) * imageWidth;
    const deltaPxY = ((event.clientY - drag.startY) / bounds.height) * imageHeight;
    const deltaCol = Math.round(deltaPxX / Math.max(1, drag.startCellSizePx));
    const deltaRow = Math.round(deltaPxY / Math.max(1, drag.startCellSizePx));
    const start = drag.startRect;
    let next = { ...start };

    if (drag.kind === 'move') {
      next.col = start.col + deltaCol;
      next.row = start.row + deltaRow;
    } else {
      if (drag.kind.includes('w')) {
        next.col = start.col + deltaCol;
        next.columns = start.columns - deltaCol;
      }
      if (drag.kind.includes('e')) next.columns = start.columns + deltaCol;
      if (drag.kind.includes('n')) {
        next.row = start.row + deltaRow;
        next.rows = start.rows - deltaRow;
      }
      if (drag.kind.includes('s')) next.rows = start.rows + deltaRow;
    }

    setGridCropRect(clampGridCropRectToImage(next));
  };

  const handleGridCropPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = gridCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gridCropDragRef.current = null;
    try {
      drag.capturedElement.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const adjustCalibrationCellSize = (deltaPx: number, fixedAnchor?: CalibrationResizeAnchor) => {
    setCalibrationGrid((current) => {
      const metrics = getSquareGridMetrics(current);
      const anchor = fixedAnchor ?? getCalibrationMoveAnchor(current);
      const { point: fixedPoint, gridPoint } = anchor;
      const imageWidth = Math.max(1, decodedImage?.width ?? 1);
      const imageHeight = Math.max(1, decodedImage?.height ?? 1);
      const nextCellSizePx = clamp(
        metrics.cellSizePx + deltaPx,
        MIN_CALIBRATION_CELL_SIZE_PX,
        Math.max(MIN_CALIBRATION_CELL_SIZE_PX, imageWidth, imageHeight),
      );

      return normalizeCalibrationGrid({
        originX: fixedPoint.x - gridPoint.col * nextCellSizePx,
        originY: fixedPoint.y - gridPoint.row * nextCellSizePx,
        cellSizePx: nextCellSizePx,
      }, decodedImage);
    });
  };

  const nudgeCalibrationGrid = (directionX: number, directionY: number) => {
    setCalibrationGrid((current) => {
      return normalizeCalibrationGrid({
        ...current,
        originX: current.originX + directionX * CALIBRATION_NUDGE_STEP_PX,
        originY: current.originY + directionY * CALIBRATION_NUDGE_STEP_PX,
      }, decodedImage);
    });
  };

  const handleCalibrationGridSizeChange = (size: CalibrationGridSize) => {
    setCalibrationGridSize(size);
    setCalibrationAnchor((current) => clampCalibrationAnchor(current, columns, rows, size));
  };

  const updateGridDimensionsFromImage = (nextColumns: number, nextRows: number, preferredAxis: 'columns' | 'rows') => {
    const normalizedColumns = Math.round(clamp(nextColumns, 4, MAX_INITIAL_GRID_CELLS));
    const normalizedRows = Math.round(clamp(nextRows, 4, MAX_INITIAL_GRID_CELLS));
    setColumns(normalizedColumns);
    setRows(normalizedRows);
    setCalibrationAnchor(getDefaultCalibrationAnchor(normalizedColumns, normalizedRows, calibrationGridSize));
    setGridCropRect((current) => clampGridCropRect(current, normalizedColumns, normalizedRows));
    if (!decodedImage) return;
    setCalibrationGrid(normalizeCalibrationGrid({
      originX: 0,
      originY: 0,
      cellSizePx: getImageBasedCalibrationCellSize(decodedImage, normalizedColumns, normalizedRows, preferredAxis),
    }, decodedImage));
  };

  const handleGridColumnStep = (delta: number) => {
    updateGridDimensionsFromImage(columns + delta, rows, 'columns');
  };

  const handleGridRowStep = (delta: number) => {
    updateGridDimensionsFromImage(columns, rows + delta, 'rows');
  };

  const handleCenterCalibrationGrid = () => {
    setCalibrationAnchor(getDefaultCalibrationAnchor(columns, rows, calibrationGridSize));
  };

  const handleRecognizeLegend = async () => {
    if (!decodedImage) {
      showNotice('请先上传图纸文件');
      return;
    }

    setBusyMode('legend');
    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const result = await recognizeLegendFromCrop(decodedImage, legendRect);
      setLegendEntries(result.entries.map(mapLegendEntryToColorSystem));
      setLegendOcrText(result.ocrText);
      setGridOcrSuggestions({});
      setGridOcrSummary('');
      setLegendMode('review');
      if (result.warnings.length > 0) {
        showNotice(result.warnings[0]);
        return;
      }
      showNotice(`已识别 ${result.entries.length} 项图例`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddLegendEntry = () => {
    const index = legendEntries.length + 1;
    setLegendMode('review');
    setLegendEntries((current) => [...current, createManualLegendEntry(index)]);
  };

  const handleLegendEntryChange = (id: string, patch: Partial<LegendEntry>) => {
    setLegendEntries((current) => current.map((entry) => {
      if (entry.id !== id) return entry;
      const next = { ...entry, ...patch };
      return typeof patch.code === 'string' && typeof patch.hex !== 'string'
        ? mapLegendEntryToColorSystem(next)
        : next;
    }));
  };

  const handleLegendCountChange = (id: string, value: string) => {
    const digits = value.replace(/\D/g, '');
    handleLegendEntryChange(id, { count: digits ? Number.parseInt(digits, 10) : null });
  };

  const handleLegendCountStep = (id: string, delta: number) => {
    setLegendEntries((current) => current.map((entry) => {
      if (entry.id !== id) return entry;
      return { ...entry, count: Math.max(0, (entry.count ?? 0) + delta) };
    }));
  };

  const handleRemoveLegendEntry = (id: string) => {
    setLegendEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const getZoomGesture = (area: ZoomArea) => (
    area === 'legendCrop'
      ? cropZoomGestureRef.current
      : area === 'patternAlign'
        ? patternAlignZoomGestureRef.current
        : previewZoomGestureRef.current
  );

  const setZoomValue = (area: ZoomArea, value: number) => {
    const nextZoom = normalizeZoom(value);
    latestZoomRef.current[area] = nextZoom;
    if (area === 'legendCrop') {
      setLegendCropZoom(nextZoom);
      return;
    }
    if (area === 'patternAlign') {
      setPatternAlignZoom(nextZoom);
      return;
    }
    setLegendPreviewZoom(nextZoom);
  };

  const zoomAtPoint = (area: ZoomArea, viewport: HTMLDivElement, nextValue: number, clientX: number, clientY: number) => {
    const previousZoom = latestZoomRef.current[area];
    const nextZoom = normalizeZoom(nextValue);
    if (Math.abs(nextZoom - previousZoom) < 0.001) return;

    const target = getZoomTargetElement(area, viewport);
    const targetBounds = target?.getBoundingClientRect();
    if (targetBounds?.width && targetBounds.height) {
      pendingZoomAdjustmentRef.current = {
        area,
        clientX,
        clientY,
        anchorX: clamp((clientX - targetBounds.left) / targetBounds.width, 0, 1),
        anchorY: clamp((clientY - targetBounds.top) / targetBounds.height, 0, 1),
      };
    }

    setZoomValue(area, nextZoom);
  };

  const getGesturePoints = (gesture: ZoomGestureState) => [...gesture.pointers.values()];

  const getPointerDistance = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };

  const getPointerCenter = (points: Array<{ x: number; y: number }>) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  });

  const resetPinchStart = (area: ZoomArea, viewport: HTMLDivElement) => {
    const gesture = getZoomGesture(area);
    const points = getGesturePoints(gesture);
    gesture.startZoom = latestZoomRef.current[area];
    gesture.startDistance = getPointerDistance(points);
    gesture.startScrollLeft = viewport.scrollLeft;
    gesture.startScrollTop = viewport.scrollTop;
    if (points.length === 1) {
      gesture.startPanX = points[0].x;
      gesture.startPanY = points[0].y;
    }
  };

  const handleZoomWheel = (area: ZoomArea, event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = event.currentTarget;
    const currentZoom = latestZoomRef.current[area];
    const nextZoom = currentZoom * (1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    zoomAtPoint(area, viewport, nextZoom, event.clientX, event.clientY);
  };

  const handleZoomPointerDown = (area: ZoomArea, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && (event.button !== 0 || latestZoomRef.current[area] <= 1)) return;
    const gesture = getZoomGesture(area);
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetPinchStart(area, event.currentTarget);
    if (gesture.pointers.size === 1 && latestZoomRef.current[area] > 1) {
      event.preventDefault();
      setActivePanArea(area);
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers release capture automatically during multi-touch gestures.
    }
  };

  const handleZoomPointerMove = (area: ZoomArea, event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = getZoomGesture(area);
    if (!gesture.pointers.has(event.pointerId)) return;
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = getGesturePoints(gesture);
    if (points.length >= 2 && gesture.startDistance > 0) {
      event.preventDefault();
      const center = getPointerCenter(points);
      const nextZoom = gesture.startZoom * (getPointerDistance(points) / gesture.startDistance);
      zoomAtPoint(area, event.currentTarget, nextZoom, center.x, center.y);
      return;
    }

    if (points.length === 1 && latestZoomRef.current[area] > 1) {
      event.preventDefault();
      event.currentTarget.scrollLeft = gesture.startScrollLeft - (points[0].x - gesture.startPanX);
      event.currentTarget.scrollTop = gesture.startScrollTop - (points[0].y - gesture.startPanY);
    }
  };

  const handleZoomPointerEnd = (area: ZoomArea, event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = getZoomGesture(area);
    if (!gesture.pointers.has(event.pointerId)) return;
    gesture.pointers.delete(event.pointerId);
    if (gesture.pointers.size === 0) setActivePanArea(null);
    resetPinchStart(area, event.currentTarget);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  useEffect(() => {
    const bindings: Array<[ZoomArea, HTMLElement | null]> = [
      ['legendCrop', step === 2 && legendMode === 'crop' ? legendCropViewportRef.current : null],
      ['legendPreview', step === 2 && legendMode === 'review' ? legendPreviewViewportRef.current : null],
      ['patternAlign', step === 3 || step === 4 ? pageRef.current : null],
    ];

    const cleanup = bindings.flatMap(([area, wheelElement]) => {
      if (!wheelElement) return [];
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (area === 'patternAlign') {
          const viewport = patternAlignViewportRef.current;
          if (!viewport) return;
          const stageBounds = stageRef.current?.getBoundingClientRect();
          const viewportBounds = viewport.getBoundingClientRect();
          const isOverStage = Boolean(
            stageBounds &&
            event.clientX >= stageBounds.left &&
            event.clientX <= stageBounds.right &&
            event.clientY >= stageBounds.top &&
            event.clientY <= stageBounds.bottom,
          );
          const zoomPoint = isOverStage || !viewportBounds.width || !viewportBounds.height
            ? { x: event.clientX, y: event.clientY }
            : {
                x: viewportBounds.left + viewportBounds.width / 2,
                y: viewportBounds.top + viewportBounds.height / 2,
              };
          const currentZoom = latestZoomRef.current.patternAlign;
          const nextZoom = currentZoom * (1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY);
          zoomAtPoint('patternAlign', viewport, nextZoom, zoomPoint.x, zoomPoint.y);
          return;
        }

        if (wheelElement instanceof HTMLDivElement) {
          const currentZoom = latestZoomRef.current[area];
          const nextZoom = currentZoom * (1 - event.deltaY * WHEEL_ZOOM_SENSITIVITY);
          zoomAtPoint(area, wheelElement, nextZoom, event.clientX, event.clientY);
        }
      };
      wheelElement.addEventListener('wheel', handleWheel, { passive: false });
      return [() => wheelElement.removeEventListener('wheel', handleWheel)];
    });

    return () => {
      cleanup.forEach((removeListener) => removeListener());
    };
  }, [legendMode, step]);

  const handleSkipLegend = () => {
    setLegendEntries([]);
    setLegendOcrText('');
    setGridOcrSuggestions({});
    setGridOcrSummary('');
    setLegendMode('crop');
    setStep(3);
  };

  const handleContinueToGrid = () => {
    setStep(3);
  };

  const handleConfirmAlignment = () => {
    setGridCropRect(getImageEdgeGridCropRect());
    setStep(4);
  };

  const handleRecognizePattern = async () => {
    if (!decodedImage) {
      showNotice('请先上传图纸文件');
      return;
    }

    const gridMetrics = getSquareGridMetrics();
    const cropRect = clampGridCropRectToImage(gridCropRect);
    setGridCropRect(cropRect);
    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const result = reconstructPatternFromImageGrid({
        imageData: decodedImage.imageData,
        fileName: selectedFileName || decodedImage.fileName,
        columns: cropRect.columns,
        rows: cropRect.rows,
        originX: gridMetrics.originX + cropRect.col * gridMetrics.cellSizePx,
        originY: gridMetrics.originY + cropRect.row * gridMetrics.cellSizePx,
        cellWidth: gridMetrics.cellSizePx,
        cellHeight: gridMetrics.cellSizePx,
        clusterThreshold: 32,
      });
      setRecognitionResult(result);
      setCellCorrections({});
      setSelectedReviewCellKeys([]);
      setReviewTargetColorId('');
      setGridOcrSuggestions({});
      setGridOcrSummary('');
      setStep(5);
    } finally {
      setIsBusy(false);
    }
  };

  const toggleReviewCell = (cell: PatternCell) => {
    const key = getCellKey(cell.x, cell.y);
    setSelectedReviewCellKeys((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };

  const selectReviewGroup = (cells: PatternCell[]) => {
    const keys = cells.map((cell) => getCellKey(cell.x, cell.y));
    setSelectedReviewCellKeys((current) => Array.from(new Set([...current, ...keys])));
  };

  const clearReviewGroupSelection = (cells: PatternCell[]) => {
    const keys = new Set(cells.map((cell) => getCellKey(cell.x, cell.y)));
    setSelectedReviewCellKeys((current) => current.filter((key) => !keys.has(key)));
  };

  const clearReviewSelection = () => {
    setSelectedReviewCellKeys([]);
  };

  const applyAssignmentToCells = (cells: PatternCell[], assignment: ReviewCellAssignment) => {
    if (cells.length === 0) return;
    setCellCorrections((current) => {
      const next = { ...current };
      cells.forEach((cell) => {
        next[getCellKey(cell.x, cell.y)] = assignment;
      });
      return next;
    });
  };

  const applyReviewAssignment = () => {
    if (selectedReviewCellKeys.length === 0) return;
    const target = reviewColorOptions.find((option) => option.colorId === reviewTargetColorId);
    if (!target) {
      showNotice('请选择要归类到的色号');
      return;
    }
    setCellCorrections((current) => {
      const next = { ...current };
      selectedReviewCellKeys.forEach((key) => {
        next[key] = {
          colorId: target.colorId,
          vendorCode: target.vendorCode,
          hex: target.hex,
        };
      });
      return next;
    });
    clearReviewSelection();
  };

  const markReviewSelectionEmpty = () => {
    if (selectedReviewCellKeys.length === 0) return;
    setCellCorrections((current) => {
      const next = { ...current };
      selectedReviewCellKeys.forEach((key) => {
        next[key] = createTransparentAssignment();
      });
      return next;
    });
    clearReviewSelection();
  };

  const applyGridOcrSuggestionToGroup = (group: ReviewGroup, suggestion?: GridOcrGroupSuggestion) => {
    if (!suggestion || !canApplyGridOcrSuggestion(group, suggestion)) return;
    const assignment = createAssignmentFromCode(suggestion.code, group.hex);
    applyAssignmentToCells(group.cells, assignment);
    setGridOcrSuggestions((current) => {
      const next = { ...current };
      delete next[group.key];
      return next;
    });
  };

  const applyAllGridOcrSuggestions = () => {
    const applicableGroups = reviewGroups.filter((group) => (
      canApplyGridOcrSuggestion(group, gridOcrSuggestions[group.key])
    ));
    if (applicableGroups.length === 0) {
      showNotice('暂无可应用的 OCR 建议');
      return;
    }

    setCellCorrections((current) => {
      const next = { ...current };
      applicableGroups.forEach((group) => {
        const suggestion = gridOcrSuggestions[group.key];
        if (!suggestion) return;
        const assignment = createAssignmentFromCode(suggestion.code, group.hex);
        group.cells.forEach((cell) => {
          next[getCellKey(cell.x, cell.y)] = assignment;
        });
      });
      return next;
    });
    setGridOcrSuggestions((current) => {
      const next = { ...current };
      applicableGroups.forEach((group) => {
        delete next[group.key];
      });
      return next;
    });
    showNotice(`已应用 ${applicableGroups.length} 个分组的 OCR 建议`);
  };

  const handleRecognizeReviewGroups = async () => {
    if (!decodedImage || !recognitionResult?.analysis.selectedGrid) {
      showNotice('请先完成图纸识别');
      return;
    }

    const groupsForOcr = reviewGroups
      .filter((group) => group.key !== '__empty__' && group.key !== '__unrecognized__' && group.cells.length > 0)
      .map((group) => ({
        key: group.key,
        title: group.title,
        cells: group.cells,
      }));
    if (groupsForOcr.length === 0) {
      showNotice('暂无可进行代表格 OCR 的分组');
      return;
    }

    setBusyMode('gridOcr');
    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const result = await recognizeGridGroupCodes({
        image: decodedImage,
        grid: recognitionResult.analysis.selectedGrid,
        groups: groupsForOcr,
      });
      const suggestions = Object.fromEntries(
        result.suggestions.map((suggestion) => [suggestion.groupKey, suggestion]),
      );
      setGridOcrSuggestions(suggestions);
      setGridOcrSummary(`已检查 ${result.processedGroupCount} 个分组，识别到 ${result.suggestions.length} 个建议`);
      showNotice(result.suggestions.length
        ? `代表格 OCR 识别到 ${result.suggestions.length} 个建议`
        : '代表格 OCR 未识别到可用色号');
    } catch {
      setGridOcrSummary('代表格 OCR 失败，请保留当前颜色分组或手动归类');
      showNotice('代表格 OCR 失败，请稍后重试');
    } finally {
      setIsBusy(false);
    }
  };

  const handleEnterCanvas = async () => {
    if (!decodedImage || !recognitionResult || !finalPatternResult) {
      showNotice('请先完成图纸识别');
      return;
    }

    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const projectId = createProjectId();
      const importMeta = createPatternImportProjectMeta({
        sourceType: recognitionResult.analysis.document.sourceType,
        fileName: selectedFileName || decodedImage.fileName,
        analysis: recognitionResult.analysis,
        validation: recognitionResult.validation,
      });

      await createWorkshopProject(projectId, {
        title: getTitleFromFileName(selectedFileName || decodedImage.fileName),
        kind: 'pattern',
        status: 'ready',
        beadingState: 'idle',
        sourceType: 'import',
        sourceItemId: null,
        uploadedImage: {
          name: decodedImage.fileName,
          type: 'image/png',
          size: decodedImage.dataUrl.length,
          dataUrl: decodedImage.dataUrl,
          width: decodedImage.originalWidth,
          height: decodedImage.originalHeight,
        },
        cropTransform: defaultCropTransform,
        config: {
          ...defaultWorkshopConfig,
          canvasSize: Math.max(finalPatternResult.width, finalPatternResult.height),
        },
        patternResult: finalPatternResult,
        viewMode: 'pattern',
        editorState: null,
        progress: null,
        beadingProgress: null,
        importMeta,
        lastOpenedAt: new Date().toISOString(),
      });

      navigate(`/workshop/editor/${projectId}`);
    } finally {
      setIsBusy(false);
    }
  };

  const cropStyle = (rect: PercentRect): CSSProperties => ({
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  });

  const squareGridMetrics = getSquareGridMetrics();
  const calibrationOperationRect = getCalibrationOperationRect();
  const calibrationMoveAnchor = getCalibrationMoveAnchor();
  const imagePixelWidth = Math.max(1, decodedImage?.width ?? 1);
  const imagePixelHeight = Math.max(1, decodedImage?.height ?? 1);
  const calibrationStageWidth = (patternAlignFitSize?.width ?? imagePixelWidth) * patternAlignZoom;
  const calibrationStageHeight = (patternAlignFitSize?.height ?? imagePixelHeight) * patternAlignZoom;
  const calibrationScaleX = calibrationStageWidth / imagePixelWidth;
  const calibrationScaleY = calibrationStageHeight / imagePixelHeight;
  const calibrationGridStyle = {
    '--calibration-cell-width': `${squareGridMetrics.cellSizePx * calibrationScaleX}px`,
    '--calibration-cell-height': `${squareGridMetrics.cellSizePx * calibrationScaleY}px`,
    '--calibration-origin-x': `${squareGridMetrics.originX * calibrationScaleX}px`,
    '--calibration-origin-y': `${squareGridMetrics.originY * calibrationScaleY}px`,
    '--calibration-area-left': `${calibrationOperationRect.x * calibrationScaleX}px`,
    '--calibration-area-top': `${calibrationOperationRect.y * calibrationScaleY}px`,
    '--calibration-area-width': `${calibrationOperationRect.width * calibrationScaleX}px`,
    '--calibration-area-height': `${calibrationOperationRect.height * calibrationScaleY}px`,
  } as CSSProperties;
  const clampedGridCropRect = clampGridCropRectToImage(gridCropRect);
  const gridCropPixelRect = {
    x: squareGridMetrics.originX + clampedGridCropRect.col * squareGridMetrics.cellSizePx,
    y: squareGridMetrics.originY + clampedGridCropRect.row * squareGridMetrics.cellSizePx,
    width: clampedGridCropRect.columns * squareGridMetrics.cellSizePx,
    height: clampedGridCropRect.rows * squareGridMetrics.cellSizePx,
  };
  const gridCropBoxStyle = {
    '--grid-crop-left': `${gridCropPixelRect.x * calibrationScaleX}px`,
    '--grid-crop-top': `${gridCropPixelRect.y * calibrationScaleY}px`,
    '--grid-crop-width': `${gridCropPixelRect.width * calibrationScaleX}px`,
    '--grid-crop-height': `${gridCropPixelRect.height * calibrationScaleY}px`,
  } as CSSProperties;

  const legendCropStageStyle = {
    '--stage-width': `${(legendCropFitSize?.width ?? imagePixelWidth) * legendCropZoom}px`,
    '--stage-height': `${(legendCropFitSize?.height ?? imagePixelHeight) * legendCropZoom}px`,
  } as CSSProperties;

  const patternAlignStageStyle = {
    '--stage-width': `${calibrationStageWidth}px`,
    '--stage-height': `${calibrationStageHeight}px`,
  } as CSSProperties;

  const legendPreviewImageStyle = {
    '--preview-zoom': legendPreviewZoom,
  } as CSSProperties;
  const loadingTitle = busyMode === 'enter'
    ? '正在进入画布'
    : busyMode === 'gridOcr'
      ? '正在识别代表格'
      : '正在识别图纸';
  const loadingMessage = busyMode === 'legend'
    ? '正在 OCR 识别图例...'
    : busyMode === 'pattern'
      ? '正在按裁剪范围识别色号...'
      : busyMode === 'gridOcr'
        ? '正在批量读取每组代表格，不会逐格调用 API...'
        : busyMode === 'enter'
          ? '正在创建画布项目...'
          : '正在处理图纸文件...';

  return (
    <main ref={pageRef} className={styles.page}>
      <LoadingOverlay
        open={isBusy}
        title={loadingTitle}
        message={loadingMessage}
      />

      <header className={styles.topbar}>
        <button type="button" className={styles.backButton} onClick={handleBack} aria-label={step > 1 ? '返回上一步' : '返回工坊'}>
          ‹
        </button>
        <nav className={styles.stepper} aria-label="图纸导入步骤">
          {STEPS.map((item) => (
            <div key={item.id} className={styles.stepItem} data-active={step === item.id} data-complete={step > item.id}>
              <span>{step > item.id ? '✓' : item.id}</span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </nav>
        {step === 3 || step === 4 ? (
          <button type="button" className={styles.topAction} onClick={step === 3 ? handleConfirmAlignment : handleRecognizePattern}>
            {step === 3 ? '确认对齐 →' : '确认裁剪 →'}
          </button>
        ) : <span className={styles.topSpacer} aria-hidden="true" />}
      </header>

      <section className={styles.content}>
        {step === 1 ? (
          <section className={styles.uploadStep} aria-label="上传图纸">
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept={COMMON_IMAGE_FILE_ACCEPT}
              onChange={handleFileInputChange}
            />
            <div
              className={`${styles.dropzone} ${isDraggingFile ? styles.dropzoneActive : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
            >
              <img className={styles.uploadIcon} src="/assets/system_icons/up_drawing.png" alt="" aria-hidden="true" />
              <h1>上传图纸文件</h1>
              <p>拖拽图片到此处，或点击选择文件</p>
              <button type="button" className={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
                选择图片
              </button>
              <div className={styles.fileTags} aria-label="支持格式">
                <span>JPG</span>
                <span>PNG</span>
                <span>WEBP</span>
                <span>GIF</span>
              </div>
            </div>
            <aside className={styles.tipPanel}>
              <strong>使用提示</strong>
              <p>图纸每个格子需有清晰的色号文字，例如 H7、A21。</p>
              <p>看不清的格子会进入「未识别」分组，可手动指定。</p>
              <p>准确率接近 100%，推荐使用高清扫描图。</p>
            </aside>
          </section>
        ) : null}

        {step === 2 && decodedImage ? (
          <section className={styles.recognitionStep} aria-label="图例裁剪与识别">
            {legendMode === 'crop' ? (
              <>
                <div
                  ref={legendCropViewportRef}
                  className={styles.cropViewport}
                  data-zoomed={legendCropZoom > 1}
                  data-panning={activePanArea === 'legendCrop'}
                  onWheel={(event) => handleZoomWheel('legendCrop', event)}
                  onPointerDown={(event) => handleZoomPointerDown('legendCrop', event)}
                  onPointerMove={(event) => handleZoomPointerMove('legendCrop', event)}
                  onPointerUp={(event) => handleZoomPointerEnd('legendCrop', event)}
                  onPointerCancel={(event) => handleZoomPointerEnd('legendCrop', event)}
                >
                  <span className={styles.zoomBadge}>{Math.round(legendCropZoom * 100)}%</span>
                  <div className={styles.fitCropCanvas} style={legendCropStageStyle}>
                    <div
                      ref={stageRef}
                      className={`${styles.cropStage} ${styles.fitCropStage}`}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={handleCropPointerUp}
                    >
                      <img src={decodedImage.dataUrl} alt="待识别图纸" />
                      <div className={styles.stageBadge}>拖拽蓝框调整图例区</div>
                      <div
                        className={`${styles.cropBox} ${styles.legendBox}`}
                        style={cropStyle(legendRect)}
                        onPointerDown={(event) => startCropDrag('legend', 'move', event)}
                      >
                        {CROP_RESIZE_HANDLES.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            className={`${styles.cropHandle} ${styles[`handle${kind.toUpperCase()}` as keyof typeof styles]}`}
                            aria-label="调整图例裁剪框"
                            onPointerDown={(event) => startCropDrag('legend', kind, event)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.stepPanel}>
                  <p><strong>提示：</strong>把图例那一行（或几行）包进蓝框里，不要包含图纸正文。框的大小不重要，包到就行。</p>
                  <div className={styles.quotaCard}>
                    <span>今日额度</span>
                    <strong>1 / 5</strong>
                    <em>ⓘ</em>
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={handleRecognizeLegend}>
                    开始识别图例
                  </button>
                  <div className={styles.secondaryActions}>
                    <button type="button" onClick={handleAddLegendEntry}>＋ 手动添加</button>
                    <button type="button" onClick={handleSkipLegend}>不使用图例</button>
                  </div>
                </div>
              </>
            ) : (
                <div className={styles.legendReview}>
                  <div className={styles.legendPreviewPanel}>
                  <div
                    ref={legendPreviewViewportRef}
                    className={styles.legendPreviewViewport}
                    data-zoomed={legendPreviewZoom > 1}
                    data-panning={activePanArea === 'legendPreview'}
                    onWheel={(event) => handleZoomWheel('legendPreview', event)}
                    onPointerDown={(event) => handleZoomPointerDown('legendPreview', event)}
                    onPointerMove={(event) => handleZoomPointerMove('legendPreview', event)}
                    onPointerUp={(event) => handleZoomPointerEnd('legendPreview', event)}
                    onPointerCancel={(event) => handleZoomPointerEnd('legendPreview', event)}
                  >
                    <span className={styles.zoomBadge}>{Math.round(legendPreviewZoom * 100)}%</span>
                    <img src={legendPreviewUrl} alt="已裁剪的图例预览" style={legendPreviewImageStyle} />
                  </div>
                </div>
                <div className={styles.legendSummaryBar}>
                  <span>共 <strong>{legendEntries.length}</strong> 项</span>
                  <span>总数 <strong>{legendTotalCount.toLocaleString()}</strong> 颗</span>
                  {legendMissingCount > 0 ? <em>{legendMissingCount} 项未填</em> : null}
                  <button type="button" onClick={() => setLegendMode('crop')}>重新框选</button>
                </div>
                {/*
                {legendOcrText.trim() ? (
                  <details className={styles.ocrDetails}>
                    <summary>OCR 原文</summary>
                    <p>{legendOcrText.trim()}</p>
                  </details>
                ) : null}
                */}
                <div className={styles.legendKeyboardHint}>
                  <span>键盘快捷：回车 色号→数量→下一项</span>
                  <button type="button" onClick={handleAddLegendEntry}>＋ 插入新行</button>
                </div>
                <div className={styles.legendEditorList} aria-label="图例色号和数量">
                  {legendEntries.map((entry, index) => (
                    <div key={entry.id} className={styles.legendEditorRow}>
                      <span className={styles.rowDragHandle} aria-hidden="true">⋮⋮</span>
                      <span className={styles.rowIndex}>{index + 1}</span>
                      <span
                        className={styles.swatchPreview}
                        style={{ backgroundColor: entry.hex }}
                        aria-label={`第 ${index + 1} 项颜色`}
                        role="img"
                      />
                      <input
                        className={styles.codeInput}
                        value={entry.code}
                        placeholder="色号"
                        onChange={(event) => handleLegendEntryChange(entry.id, { code: event.target.value.toUpperCase().replace(/\s/g, '') })}
                        aria-label={`第 ${index + 1} 项色号`}
                      />
                      <button
                        type="button"
                        className={styles.countButton}
                        onClick={() => handleLegendCountStep(entry.id, -1)}
                        aria-label={`减少第 ${index + 1} 项数量`}
                      >
                        −
                      </button>
                      <input
                        className={styles.countInput}
                        inputMode="numeric"
                        value={entry.count ?? ''}
                        placeholder="--"
                        onChange={(event) => handleLegendCountChange(entry.id, event.target.value)}
                        aria-label={`第 ${index + 1} 项数量`}
                      />
                      <button
                        type="button"
                        className={styles.countButton}
                        onClick={() => handleLegendCountStep(entry.id, 1)}
                        aria-label={`增加第 ${index + 1} 项数量`}
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        className={styles.moreButton}
                        onClick={() => handleRemoveLegendEntry(entry.id)}
                        aria-label={`删除第 ${index + 1} 项`}
                        title="删除"
                      >
                        ⋯
                      </button>
                    </div>
                  ))}
                  <button type="button" className={styles.addLegendRow} onClick={handleAddLegendEntry}>
                    ＋ 新增图例项
                  </button>
                </div>
                <div className={styles.legendFooter}>
                  <button type="button" className={styles.footerSecondaryButton} onClick={handleSkipLegend}>
                    不使用图例
                  </button>
                  <button type="button" className={styles.footerPrimaryButton} onClick={handleContinueToGrid}>
                    确认结果
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {step === 3 && decodedImage ? (
          <section className={styles.recognitionStep} aria-label="网格对齐与图纸裁剪">
            <div
              ref={patternAlignViewportRef}
              className={styles.cropViewport}
              data-zoomed={patternAlignZoom > 1}
              data-panning={activePanArea === 'patternAlign'}
              data-lock-scroll="true"
              onPointerDown={(event) => handleZoomPointerDown('patternAlign', event)}
              onPointerMove={(event) => handleZoomPointerMove('patternAlign', event)}
              onPointerUp={(event) => handleZoomPointerEnd('patternAlign', event)}
              onPointerCancel={(event) => handleZoomPointerEnd('patternAlign', event)}
            >
              <span className={styles.zoomBadge}>{Math.round(patternAlignZoom * 100)}%</span>
              <div className={styles.fitCropCanvas} style={patternAlignStageStyle}>
                <div
                  ref={stageRef}
                  className={`${styles.cropStage} ${styles.fitCropStage} ${styles.gridStage}`}
                  onPointerMove={(event) => {
                    handleCropPointerMove(event);
                    handleCalibrationPointerMove(event);
                  }}
                  onPointerUp={(event) => {
                    handleCropPointerUp(event);
                    handleCalibrationPointerUp(event);
                  }}
                  onPointerCancel={(event) => {
                    handleCropPointerUp(event);
                    handleCalibrationPointerUp(event);
                  }}
                >
                  <img src={decodedImage.dataUrl} alt="待网格对齐的图纸" />
                  <div
                    className={styles.calibrationGrid}
                    style={calibrationGridStyle}
                    role="group"
                    aria-label={`${calibrationGridSize}x${calibrationGridSize} 校准网格`}
                    data-calibration-grid="true"
                    onPointerDown={startCalibrationGridAreaDrag}
                  >
                    <button
                      type="button"
                      className={`${styles.calibrationHandle} ${styles.calibrationMoveHandle}`}
                      data-handle-label="移动"
                      aria-label="移动校准网格"
                      onPointerDown={(event) => startCalibrationGridDrag('move', event)}
                    />
                    <button
                      type="button"
                      className={`${styles.calibrationHandle} ${styles.calibrationScaleHandle}`}
                      data-handle-label="缩放"
                      aria-label="缩放校准网格"
                      onPointerDown={(event) => startCalibrationGridDrag('scale', event)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.alignHint}>请使用九宫格将网格与图纸格子对齐</div>
            <div className={styles.calibrationBar}>
              <span>校准网格</span>
              <div className={styles.calibrationMode} role="group" aria-label="校准网格大小">
                {CALIBRATION_GRID_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={calibrationGridSize === size ? styles.calibrationModeActive : ''}
                    onClick={() => handleCalibrationGridSizeChange(size)}
                  >
                    {size}x{size}
                  </button>
                ))}
              </div>
              <button type="button" className={styles.calibrationCenterButton} onClick={handleCenterCalibrationGrid}>
                居中
              </button>
              <div className={styles.calibrationScaleControls} role="group" aria-label="校准网格单元格大小">
                <button type="button" {...getRepeatButtonProps(() => adjustCalibrationCellSize(-CALIBRATION_CELL_SIZE_STEP_PX, calibrationMoveAnchor))} aria-label="缩小校准网格单元格">-</button>
                <button type="button" {...getRepeatButtonProps(() => adjustCalibrationCellSize(CALIBRATION_CELL_SIZE_STEP_PX, calibrationMoveAnchor))} aria-label="放大校准网格单元格">+</button>
              </div>
            </div>
            <div className={styles.alignControls}>
              <div className={styles.alignControlLayout}>
                <section className={styles.nudgeControlPanel} aria-label="微移">
                  <span>微移</span>
                  <div className={styles.nudgeControlGrid}>
                    <button type="button" className={styles.nudgeUpButton} {...getRepeatButtonProps(() => nudgeCalibrationGrid(0, -1))} aria-label="向上微移">⌃</button>
                    <button type="button" className={styles.nudgeLeftButton} {...getRepeatButtonProps(() => nudgeCalibrationGrid(-1, 0))} aria-label="向左微移">‹</button>
                    <strong className={styles.nudgeValue}>
                      <em>{squareGridMetrics.originX.toFixed(1)}</em>
                      <em>{squareGridMetrics.originY.toFixed(1)}</em>
                    </strong>
                    <button type="button" className={styles.nudgeRightButton} {...getRepeatButtonProps(() => nudgeCalibrationGrid(1, 0))} aria-label="向右微移">›</button>
                    <button type="button" className={styles.nudgeDownButton} {...getRepeatButtonProps(() => nudgeCalibrationGrid(0, 1))} aria-label="向下微移">⌄</button>
                  </div>
                </section>
                <section className={styles.cellSizeControlPanel} aria-label="调整格子大小">
                  <span>调整格子大小</span>
                  <div className={styles.cellSizeControls}>
                    <button type="button" {...getRepeatButtonProps(() => adjustCalibrationCellSize(-CALIBRATION_CELL_SIZE_STEP_PX, calibrationMoveAnchor))} aria-label="缩小校准网格单元格">−</button>
                    <strong>
                      {squareGridMetrics.cellSizePx.toFixed(2)}
                      <small>格/PX</small>
                    </strong>
                    <button type="button" {...getRepeatButtonProps(() => adjustCalibrationCellSize(CALIBRATION_CELL_SIZE_STEP_PX, calibrationMoveAnchor))} aria-label="放大校准网格单元格">+</button>
                  </div>
                  <p>调整网格线间距<br />使其与图纸格线对齐</p>
                </section>
              </div>
              <section className={styles.nudgePad} aria-label="微移">
                <span>微移</span>
                <button type="button" {...getRepeatButtonProps(() => nudgeCalibrationGrid(0, -1))}>⌃</button>
                <button type="button" {...getRepeatButtonProps(() => nudgeCalibrationGrid(-1, 0))}>‹</button>
                <strong>{columns.toFixed(0)} × {rows.toFixed(0)}</strong>
                <button type="button" {...getRepeatButtonProps(() => nudgeCalibrationGrid(1, 0))}>›</button>
                <button type="button" {...getRepeatButtonProps(() => nudgeCalibrationGrid(0, 1))}>⌄</button>
              </section>
              <section className={styles.gridSizePanel} aria-label="调整格子大小">
                <span>调整格子大小</span>
                <div>
                  <button type="button" onClick={() => handleGridColumnStep(-1)}>−</button>
                  <strong>{columns.toFixed(0)} 列</strong>
                  <button type="button" onClick={() => handleGridColumnStep(1)}>＋</button>
                </div>
                <div>
                  <button type="button" onClick={() => handleGridRowStep(-1)}>−</button>
                  <strong>{rows.toFixed(0)} 行</strong>
                  <button type="button" onClick={() => handleGridRowStep(1)}>＋</button>
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {step === 4 && decodedImage ? (
          <section className={styles.recognitionStep} aria-label="图纸裁剪">
            <div
              ref={patternAlignViewportRef}
              className={styles.cropViewport}
              data-zoomed={patternAlignZoom > 1}
              data-panning={activePanArea === 'patternAlign'}
              data-lock-scroll="true"
              onPointerDown={(event) => handleZoomPointerDown('patternAlign', event)}
              onPointerMove={(event) => handleZoomPointerMove('patternAlign', event)}
              onPointerUp={(event) => handleZoomPointerEnd('patternAlign', event)}
              onPointerCancel={(event) => handleZoomPointerEnd('patternAlign', event)}
            >
              <span className={styles.zoomBadge}>{Math.round(patternAlignZoom * 100)}%</span>
              <div className={styles.fitCropCanvas} style={patternAlignStageStyle}>
                <div
                  ref={stageRef}
                  className={`${styles.cropStage} ${styles.fitCropStage} ${styles.gridStage}`}
                  onPointerMove={handleGridCropPointerMove}
                  onPointerUp={handleGridCropPointerUp}
                  onPointerCancel={handleGridCropPointerUp}
                >
                  <img src={decodedImage.dataUrl} alt="待裁剪的图纸" />
                  <div className={styles.cropGridLayer} style={calibrationGridStyle} aria-hidden="true" />
                  <div
                    className={styles.gridCropBox}
                    style={gridCropBoxStyle}
                    onPointerDown={(event) => startGridCropDrag('move', event)}
                  >
                    <span className={styles.gridCropSizeBadge}>
                      {clampedGridCropRect.columns}列 × {clampedGridCropRect.rows}行
                    </span>
                    {CROP_RESIZE_HANDLES.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`${styles.gridCropHandle} ${styles[`gridCropHandle${kind.toUpperCase()}` as keyof typeof styles]}`}
                        aria-label="调整裁剪范围"
                        onPointerDown={(event) => startGridCropDrag(kind, event)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.cropAlignHint}>
              仅保留格子内容，裁剪框会按当前最小格子尺寸吸附到网格线。
            </div>
            <div className={styles.cropStepControls}>
              <button type="button" onClick={() => setGridCropRect(getImageEdgeGridCropRect())}>重置</button>
              <span>{clampedGridCropRect.col + 1}, {clampedGridCropRect.row + 1}</span>
              <strong>{clampedGridCropRect.columns} × {clampedGridCropRect.rows}</strong>
            </div>
          </section>
        ) : null}

        {step === 5 && finalPatternResult ? (
          <section className={styles.doneStep} aria-label="进入画布">
            <div className={styles.previewCard}>
              <PatternPreviewCanvas patternResult={finalPatternResult} />
            </div>
            <div className={styles.resultSummary}>
              <div>
                <span>尺寸</span>
                <strong>{finalPatternResult.width} × {finalPatternResult.height}</strong>
              </div>
              <div>
                <span>豆数</span>
                <strong>{finalPatternResult.stats.totalCells.toLocaleString()}</strong>
              </div>
              <div>
                <span>颜色</span>
                <strong>{finalPatternResult.stats.colorCount}</strong>
              </div>
              <div>
                <span>低置信度</span>
                <strong>{recognitionResult?.validation.lowConfidenceCellCount ?? 0}</strong>
              </div>
            </div>
            <p className={styles.doneCopy}>图纸已完成初步识别，进入画布后可以继续修正色号、补格和擦除背景。</p>
            <div className={styles.reviewTools}>
              <div>
                <strong>检查归类</strong>
                <span>{gridOcrSummary || '可先按颜色检查，也可以用代表格 OCR 辅助读取色号。'}</span>
              </div>
              <button type="button" onClick={handleRecognizeReviewGroups}>
                代表格 OCR
              </button>
              <button
                type="button"
                onClick={applyAllGridOcrSuggestions}
                disabled={applicableGridOcrSuggestionCount === 0}
              >
                应用建议
              </button>
            </div>
            <div className={styles.reviewList}>
              {reviewGroups.map((group) => {
                const groupSelectedCount = getReviewGroupSelectedCount(group.cells);
                const ocrSuggestion = gridOcrSuggestions[group.key];
                const ocrConflict = isGridOcrSuggestionConflict(group, ocrSuggestion);
                const canApplyOcrSuggestion = canApplyGridOcrSuggestion(group, ocrSuggestion);
                return (
                  <section
                    key={group.key}
                    className={`${styles.reviewGroup} ${group.warning || ocrConflict ? styles.reviewGroupWarning : ''}`}
                    aria-label={`${group.title} ${group.count} 个`}
                    data-selected={groupSelectedCount > 0}
                    data-ocr-conflict={ocrConflict}
                  >
                    <div className={styles.reviewGroupHeader}>
                      <div>
                        <span
                          className={styles.reviewSwatch}
                          style={{ backgroundColor: group.hex === 'transparent' ? '#F1F5F9' : group.hex }}
                          aria-hidden="true"
                        />
                        <strong>{group.title}</strong>
                        <em>{group.count.toLocaleString()} 个</em>
                        {group.expectedCount !== undefined ? <em>图例 {group.expectedCount.toLocaleString()} 个</em> : null}
                        {groupSelectedCount > 0 ? <em>已选 {groupSelectedCount.toLocaleString()}</em> : null}
                        {ocrSuggestion ? (
                          <em className={ocrConflict ? styles.reviewOcrConflict : styles.reviewOcrSuggestion}>
                            OCR {ocrSuggestion.code}
                            {ocrSuggestion.ambiguous ? ' ?' : ''}
                          </em>
                        ) : null}
                      </div>
                      <div className={styles.reviewGroupActions}>
                        {ocrSuggestion ? (
                          <button
                            type="button"
                            onClick={() => applyGridOcrSuggestionToGroup(group, ocrSuggestion)}
                            disabled={!canApplyOcrSuggestion}
                            title={ocrConflict ? 'OCR 与当前色号冲突，请手动确认' : undefined}
                          >
                            应用 OCR
                          </button>
                        ) : null}
                        <button type="button" onClick={() => selectReviewGroup(group.cells)}>
                          全选
                        </button>
                        <button
                          type="button"
                          onClick={() => clearReviewGroupSelection(group.cells)}
                          disabled={groupSelectedCount === 0}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                    <div className={styles.reviewCellStrip}>
                      {group.cells.slice(0, 36).map((cell) => {
                        const key = getCellKey(cell.x, cell.y);
                        const isEmpty = cell.isExternal || cell.hex === 'transparent';
                        const isSelected = selectedReviewCellSet.has(key);
                        const label = group.key === '__unrecognized__'
                          ? '?'
                          : isEmpty
                            ? ''
                            : cell.vendorCode || '?';
                        return (
                          <button
                            key={key}
                            type="button"
                            className={styles.reviewCell}
                            aria-label={`${cell.x + 1}, ${cell.y + 1}`}
                            aria-pressed={isSelected}
                            data-selected={isSelected}
                            onClick={() => toggleReviewCell(cell)}
                          >
                            <span className={styles.reviewCellImage} style={getReviewCellPreviewStyle(cell)} />
                            <strong>{label}</strong>
                          </button>
                        );
                      })}
                      {group.count > 36 ? (
                        <button type="button" className={styles.reviewMore} onClick={() => selectReviewGroup(group.cells)}>
                          +{group.count - 36}
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
            {selectedReviewCellKeys.length > 0 ? (
              <div className={styles.reviewActionBar} role="group" aria-label="检查归类操作">
                <strong>已选 {selectedReviewCellKeys.length.toLocaleString()} 个</strong>
                <select
                  value={reviewTargetColorId}
                  onChange={(event) => setReviewTargetColorId(event.target.value)}
                  aria-label="归类到色号"
                >
                  {reviewColorOptions.map((option) => (
                    <option key={`${option.colorId}-${option.vendorCode}`} value={option.colorId}>
                      {option.vendorCode || option.colorId}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyReviewAssignment}
                  disabled={!reviewTargetColorId || reviewColorOptions.length === 0}
                >
                  归类
                </button>
                <button type="button" onClick={markReviewSelectionEmpty}>
                  标记空白
                </button>
                <button type="button" onClick={clearReviewSelection}>
                  取消
                </button>
              </div>
            ) : null}
            <button type="button" className={styles.primaryButton} onClick={handleEnterCanvas}>
              进入画布
            </button>
            <button type="button" className={styles.textButton} onClick={() => setStep(4)}>
              返回裁剪
            </button>
          </section>
        ) : null}
      </section>

      <div className={`${styles.toast} ${notice ? styles.toastVisible : ''}`} role="status" aria-live="polite">
        {notice || ' '}
      </div>
    </main>
  );
}
