import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../../features/workshop/model/defaults';
import { createWorkshopProject } from '../../../features/workshop/model/projectStore';
import type { PatternCell, PatternResult } from '../../../features/workshop/model/types';
import { COMMON_IMAGE_FILE_ACCEPT, COMMON_IMAGE_FILE_LABEL, isCommonImageFile, waitForLoadingPaint } from '../../../lib/imageFile';
import { reconstructPatternFromImageGrid } from '../../../lib/pattern-import/cell-read';
import { createPatternImportProjectMeta } from '../../../lib/pattern-import/diagnostics';
import { decodePatternImportImageFile, type DecodedPatternImage } from '../../../lib/pattern-import/image-decode';
import {
  createLegendCropPreview,
  createManualLegendEntry,
  recognizeLegendFromCrop,
  type LegendOcrEntry,
} from '../../../lib/pattern-import/legend-ocr';
import { reconstructPatternResult } from '../../../lib/pattern-import/reconstruct';
import type { PatternImportResult } from '../../../lib/pattern-import/types';
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
};

type GridCropRect = {
  col: number;
  row: number;
  columns: number;
  rows: number;
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
  { id: 5, label: '画布' },
];

const DEFAULT_LEGEND_RECT: PercentRect = { x: 12, y: 76, width: 76, height: 16 };
const DEFAULT_PATTERN_RECT: PercentRect = { x: 8, y: 12, width: 84, height: 74 };
const CROP_RESIZE_HANDLES: ResizeDragKind[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CALIBRATION_GRID_SIZES: CalibrationGridSize[] = [3, 4];
const MIN_CALIBRATION_CELL_SIZE_PX = 4;
const MIN_ZOOM = 1;
const MAX_ZOOM = 15;
const ZOOM_STEP = 0.05;
const WHEEL_ZOOM_SENSITIVITY = 0.0006;

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
  const pattern = rectToPixels(DEFAULT_PATTERN_RECT, image);
  const estimatedCell = Math.max(5, Math.round(Math.max(pattern.width, pattern.height) / 72));
  return {
    columns: clamp(Math.round(pattern.width / estimatedCell), 12, 180),
    rows: clamp(Math.round(pattern.height / estimatedCell), 12, 180),
  };
}

function getInitialCalibrationGrid(image: DecodedPatternImage, columns: number): CalibrationGridModel {
  const pattern = rectToPixels(DEFAULT_PATTERN_RECT, image);
  return {
    originX: pattern.x,
    originY: pattern.y,
    cellSizePx: clamp(
      pattern.width / Math.max(1, columns),
      MIN_CALIBRATION_CELL_SIZE_PX,
      Math.max(MIN_CALIBRATION_CELL_SIZE_PX, image.width, image.height),
    ),
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

function getDefaultGridCropRect(columns: number, rows: number): GridCropRect {
  return clampGridCropRect({
    col: 0,
    row: 0,
    columns: Math.max(1, Math.round(columns)),
    rows: Math.max(1, Math.round(rows)),
  }, columns, rows);
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
    return {
      ...cell,
      colorId: nearest.hex,
      vendorCode: nearest.code,
      hex: nearest.hex,
    };
  });
  return reconstructPatternResult({ width: patternResult.width, height: patternResult.height, cells });
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
  const [isBusy, setIsBusy] = useState(false);
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
    return applyLegendToPattern(recognitionResult.patternResult, legendEntries);
  }, [legendEntries, recognitionResult]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
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

    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const image = await decodePatternImportImageFile(file);
      const grid = getInitialGrid(image);
      const initialCalibrationGrid = getInitialCalibrationGrid(image, grid.columns);
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

  const startCalibrationGridDrag = (kind: CalibrationDragKind, event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    calibrationDragRef.current = {
      kind,
      pointerId: event.pointerId,
      capturedElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startGrid: calibrationGrid,
      startOperationRect: getCalibrationOperationRect(),
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
    const fixedCol = drag.startGrid.cellSizePx > 0 ? (drag.startOperationRect.x - drag.startGrid.originX) / drag.startGrid.cellSizePx : 0;
    const fixedRow = drag.startGrid.cellSizePx > 0 ? (drag.startOperationRect.y - drag.startGrid.originY) / drag.startGrid.cellSizePx : 0;
    setCalibrationGrid(normalizeCalibrationGrid({
      originX: drag.startOperationRect.x - fixedCol * nextCellSizePx,
      originY: drag.startOperationRect.y - fixedRow * nextCellSizePx,
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
      startRect: clampGridCropRect(gridCropRect, columns, rows),
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

    setGridCropRect(clampGridCropRect(next, columns, rows));
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

  const scaleCalibrationGrid = (scale: number, anchorPoint?: { x: number; y: number }) => {
    setCalibrationGrid((current) => {
      const metrics = getSquareGridMetrics(current);
      const anchor = clampCalibrationAnchor(calibrationAnchor, columns, rows, calibrationGridSize);
      const fallbackAnchor = {
        x: metrics.originX + (anchor.col + calibrationGridSize / 2) * metrics.cellSizePx,
        y: metrics.originY + (anchor.row + calibrationGridSize / 2) * metrics.cellSizePx,
      };
      const fixedPoint = anchorPoint ?? fallbackAnchor;
      const fixedCol = metrics.cellSizePx > 0 ? (fixedPoint.x - metrics.originX) / metrics.cellSizePx : 0;
      const fixedRow = metrics.cellSizePx > 0 ? (fixedPoint.y - metrics.originY) / metrics.cellSizePx : 0;
      const imageWidth = Math.max(1, decodedImage?.width ?? 1);
      const imageHeight = Math.max(1, decodedImage?.height ?? 1);
      const nextCellSizePx = clamp(
        metrics.cellSizePx * scale,
        MIN_CALIBRATION_CELL_SIZE_PX,
        Math.max(MIN_CALIBRATION_CELL_SIZE_PX, imageWidth, imageHeight),
      );

      return normalizeCalibrationGrid({
        originX: fixedPoint.x - fixedCol * nextCellSizePx,
        originY: fixedPoint.y - fixedRow * nextCellSizePx,
        cellSizePx: nextCellSizePx,
      }, decodedImage);
    });
  };

  const nudgeCalibrationGrid = (directionX: number, directionY: number) => {
    setCalibrationGrid((current) => {
      const stepPx = Math.max(1, current.cellSizePx * 0.05);
      return normalizeCalibrationGrid({
        ...current,
        originX: current.originX + directionX * stepPx,
        originY: current.originY + directionY * stepPx,
      }, decodedImage);
    });
  };

  const handleCalibrationGridSizeChange = (size: CalibrationGridSize) => {
    setCalibrationGridSize(size);
    setCalibrationAnchor((current) => clampCalibrationAnchor(current, columns, rows, size));
  };

  const handleCenterCalibrationGrid = () => {
    setCalibrationAnchor(getDefaultCalibrationAnchor(columns, rows, calibrationGridSize));
  };

  const handleRecognizeLegend = async () => {
    if (!decodedImage) {
      showNotice('请先上传图纸文件');
      return;
    }

    setIsBusy(true);
    try {
      await waitForLoadingPaint();
      const result = await recognizeLegendFromCrop(decodedImage, legendRect);
      setLegendEntries(result.entries);
      setLegendOcrText(result.ocrText);
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
    setLegendEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
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
    setLegendMode('crop');
    setStep(3);
  };

  const handleContinueToGrid = () => {
    setStep(3);
  };

  const handleConfirmAlignment = () => {
    setGridCropRect((current) => clampGridCropRect(current, columns, rows));
    setStep(4);
  };

  const handleRecognizePattern = async () => {
    if (!decodedImage) {
      showNotice('请先上传图纸文件');
      return;
    }

    const gridMetrics = getSquareGridMetrics();
    const cropRect = clampGridCropRect(gridCropRect, columns, rows);
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
      setStep(5);
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
  const calibrationStageWidth = patternAlignFitSize ? patternAlignFitSize.width * patternAlignZoom : (decodedImage?.width ?? 1);
  const calibrationStageHeight = patternAlignFitSize ? patternAlignFitSize.height * patternAlignZoom : (decodedImage?.height ?? 1);
  const calibrationScaleX = calibrationStageWidth / Math.max(1, decodedImage?.width ?? 1);
  const calibrationScaleY = calibrationStageHeight / Math.max(1, decodedImage?.height ?? 1);
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
  const clampedGridCropRect = clampGridCropRect(gridCropRect, columns, rows);
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
    '--stage-width': legendCropFitSize ? `${legendCropFitSize.width * legendCropZoom}px` : '100%',
    '--stage-height': legendCropFitSize ? `${legendCropFitSize.height * legendCropZoom}px` : '100%',
  } as CSSProperties;

  const patternAlignStageStyle = {
    '--stage-width': patternAlignFitSize ? `${patternAlignFitSize.width * patternAlignZoom}px` : '100%',
    '--stage-height': patternAlignFitSize ? `${patternAlignFitSize.height * patternAlignZoom}px` : '100%',
  } as CSSProperties;

  const legendPreviewImageStyle = {
    '--preview-zoom': legendPreviewZoom,
  } as CSSProperties;

  return (
    <main ref={pageRef} className={styles.page}>
      <LoadingOverlay
        open={isBusy}
        title={step === 5 ? '正在进入画布' : '正在识别图纸'}
        message={step === 2 ? '正在 OCR 识别图例...' : step === 4 ? '正在按裁剪范围识别色号...' : '正在处理图纸文件...'}
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
                    <button type="button" onClick={handleSkipLegend}>没有图例，跳过</button>
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
                  <button type="button" onClick={handleRecognizeLegend}>重新识别</button>
                  <button type="button" onClick={() => setLegendMode('crop')}>重新框选</button>
                </div>
                {legendOcrText.trim() ? (
                  <details className={styles.ocrDetails}>
                    <summary>OCR 原文</summary>
                    <p>{legendOcrText.trim()}</p>
                  </details>
                ) : null}
                <div className={styles.legendKeyboardHint}>
                  <span>键盘快捷：回车 色号→数量→下一项</span>
                  <button type="button" onClick={handleAddLegendEntry}>＋ 插入新行</button>
                </div>
                <div className={styles.legendEditorList} aria-label="图例色号和数量">
                  {legendEntries.map((entry, index) => (
                    <div key={entry.id} className={styles.legendEditorRow}>
                      <span className={styles.rowDragHandle} aria-hidden="true">⋮⋮</span>
                      <span className={styles.rowIndex}>{index + 1}</span>
                      <input
                        className={styles.swatchInput}
                        type="color"
                        value={entry.hex}
                        onChange={(event) => handleLegendEntryChange(entry.id, { hex: event.target.value.toUpperCase() })}
                        aria-label={`第 ${index + 1} 项颜色`}
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
                    不要图例了
                  </button>
                  <button type="button" className={styles.footerPrimaryButton} onClick={handleContinueToGrid}>
                    开始识别 ›
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
                    <span className={styles.calibrationGridLabel}>{calibrationGridSize}x{calibrationGridSize}</span>
                    <button
                      type="button"
                      className={`${styles.calibrationHandle} ${styles.calibrationMoveHandle}`}
                      aria-label="移动校准网格"
                      onPointerDown={(event) => startCalibrationGridDrag('move', event)}
                    >
                      移动
                    </button>
                    <button
                      type="button"
                      className={`${styles.calibrationHandle} ${styles.calibrationScaleHandle}`}
                      aria-label="缩放校准网格"
                      onPointerDown={(event) => startCalibrationGridDrag('scale', event)}
                    >
                      缩放
                    </button>
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
                <button type="button" onClick={() => scaleCalibrationGrid(0.98)} aria-label="缩小校准网格单元格">-</button>
                <button type="button" onClick={() => scaleCalibrationGrid(1.02)} aria-label="放大校准网格单元格">+</button>
              </div>
            </div>
            <div className={styles.alignControls}>
              <div className={styles.alignControlLayout}>
                <section className={styles.nudgeControlPanel} aria-label="微移">
                  <span>微移</span>
                  <div className={styles.nudgeControlGrid}>
                    <button type="button" className={styles.nudgeUpButton} onClick={() => nudgeCalibrationGrid(0, -1)} aria-label="向上微移">⌃</button>
                    <button type="button" className={styles.nudgeLeftButton} onClick={() => nudgeCalibrationGrid(-1, 0)} aria-label="向左微移">‹</button>
                    <strong className={styles.nudgeValue}>
                      <em>{squareGridMetrics.originX.toFixed(1)}</em>
                      <em>{squareGridMetrics.originY.toFixed(1)}</em>
                    </strong>
                    <button type="button" className={styles.nudgeRightButton} onClick={() => nudgeCalibrationGrid(1, 0)} aria-label="向右微移">›</button>
                    <button type="button" className={styles.nudgeDownButton} onClick={() => nudgeCalibrationGrid(0, 1)} aria-label="向下微移">⌄</button>
                  </div>
                </section>
                <section className={styles.cellSizeControlPanel} aria-label="调整格子大小">
                  <span>调整格子大小</span>
                  <div className={styles.cellSizeControls}>
                    <button type="button" onClick={() => scaleCalibrationGrid(0.98)} aria-label="缩小校准网格单元格">−</button>
                    <strong>
                      {squareGridMetrics.cellSizePx.toFixed(2)}
                      <small>格/PX</small>
                    </strong>
                    <button type="button" onClick={() => scaleCalibrationGrid(1.02)} aria-label="放大校准网格单元格">+</button>
                  </div>
                  <p>调整网格线间距<br />使其与图纸格线对齐</p>
                </section>
              </div>
              <section className={styles.nudgePad} aria-label="微移">
                <span>微移</span>
                <button type="button" onClick={() => nudgeCalibrationGrid(0, -1)}>⌃</button>
                <button type="button" onClick={() => nudgeCalibrationGrid(-1, 0)}>‹</button>
                <strong>{columns.toFixed(0)} × {rows.toFixed(0)}</strong>
                <button type="button" onClick={() => nudgeCalibrationGrid(1, 0)}>›</button>
                <button type="button" onClick={() => nudgeCalibrationGrid(0, 1)}>⌄</button>
              </section>
              <section className={styles.gridSizePanel} aria-label="调整格子大小">
                <span>调整格子大小</span>
                <div>
                  <button type="button" onClick={() => setColumns((current) => Math.max(4, current - 1))}>−</button>
                  <strong>{columns.toFixed(0)} 列</strong>
                  <button type="button" onClick={() => setColumns((current) => Math.min(240, current + 1))}>＋</button>
                </div>
                <div>
                  <button type="button" onClick={() => setRows((current) => Math.max(4, current - 1))}>−</button>
                  <strong>{rows.toFixed(0)} 行</strong>
                  <button type="button" onClick={() => setRows((current) => Math.min(240, current + 1))}>＋</button>
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
              <button type="button" onClick={() => setGridCropRect(getDefaultGridCropRect(columns, rows))}>重置</button>
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
