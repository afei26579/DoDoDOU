import type Tesseract from 'tesseract.js';
import type { DecodedPatternImage } from './image-decode';

export type LegendCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LegendOcrEntry = {
  id: string;
  code: string;
  hex: string;
  count: number | null;
  confidence: number;
  source: 'ocr' | 'paddleocr' | 'color' | 'manual';
  rawText?: string;
};

export type LegendOcrResult = {
  entries: LegendOcrEntry[];
  previewDataUrl: string;
  ocrText: string;
  usedOcr: boolean;
  warnings: string[];
};

type Pixel = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LegendItemBox = PixelRect & {
  hex: string;
};

type OcrWord = {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

const OCR_SCALE = 4;
const MAX_OCR_ITEMS = 80;
const BACKEND_OCR_TIMEOUT_MS = 60_000;

type BackendLegendOcrEntry = {
  code?: unknown;
  hex?: unknown;
  count?: unknown;
  confidence?: unknown;
  rawText?: unknown;
};

type BackendLegendOcrResponse = {
  entries?: unknown;
  ocrText?: unknown;
  warnings?: unknown;
};

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || 'auto';
  const normalized = configured.replace(/\/+$/, '').toLowerCase();
  if (normalized === 'same-origin') return '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function rectToPixels(rect: LegendCropRect, image: DecodedPatternImage): PixelRect {
  const widthPercent = clamp(rect.width, 4, 100);
  const heightPercent = clamp(rect.height, 4, 100);
  const xPercent = clamp(rect.x, 0, 100 - widthPercent);
  const yPercent = clamp(rect.y, 0, 100 - heightPercent);
  const x = Math.round((xPercent / 100) * image.width);
  const y = Math.round((yPercent / 100) * image.height);
  const width = Math.max(1, Math.round((widthPercent / 100) * image.width));
  const height = Math.max(1, Math.round((heightPercent / 100) * image.height));

  return {
    x: clampInteger(x, 0, image.width - 1),
    y: clampInteger(y, 0, image.height - 1),
    width: clampInteger(width, 1, image.width - x),
    height: clampInteger(height, 1, image.height - y),
  };
}

function getPixel(imageData: ImageData, x: number, y: number): Pixel {
  const safeX = clampInteger(x, 0, imageData.width - 1);
  const safeY = clampInteger(y, 0, imageData.height - 1);
  const index = (safeY * imageData.width + safeX) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3],
  };
}

function luminance(pixel: Pick<Pixel, 'r' | 'g' | 'b'>) {
  return pixel.r * 0.299 + pixel.g * 0.587 + pixel.b * 0.114;
}

function saturation(pixel: Pick<Pixel, 'r' | 'g' | 'b'>) {
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  return max <= 0 ? 0 : (max - min) / max;
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (value: number) => clampInteger(value, 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeBackendHex(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^#[0-9A-F]{6}$/.test(text) ? text : '#D8DEE6';
}

function normalizeBackendEntry(entry: BackendLegendOcrEntry, index: number): LegendOcrEntry | null {
  const code = typeof entry.code === 'string' ? normalizeCode(entry.code).slice(0, 24) : '';
  const rawCount = Number(entry.count);
  const count = Number.isInteger(rawCount) && rawCount >= 0 && rawCount <= 999_999 ? rawCount : null;
  if (!code && count === null) return null;

  const rawConfidence = Number(entry.confidence);
  const confidence = Number.isFinite(rawConfidence) ? clamp(rawConfidence, 0, 1) : 0.65;
  const rawText = typeof entry.rawText === 'string' ? entry.rawText.trim().slice(0, 240) : '';

  return {
    id: `legend-paddle-${index + 1}`,
    code,
    hex: normalizeBackendHex(entry.hex),
    count,
    confidence,
    source: 'paddleocr',
    ...(rawText ? { rawText } : {}),
  };
}

function normalizeBackendWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
    : [];
}

async function requestPaddleLegendOcr(imageDataUrl: string): Promise<{
  entries: LegendOcrEntry[];
  ocrText: string;
  warnings: string[];
}> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? globalThis.setTimeout(() => controller.abort(), BACKEND_OCR_TIMEOUT_MS)
    : 0;

  try {
    const response = await fetch(`${API_BASE_URL}/api/pattern-import/legend-ocr`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, maxItems: MAX_OCR_ITEMS }),
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => null) as BackendLegendOcrResponse | null;

    if (!response.ok) {
      throw new Error(typeof (payload as { message?: unknown } | null)?.message === 'string'
        ? String((payload as { message: string }).message)
        : `PaddleOCR request failed with ${response.status}`);
    }

    const entries = Array.isArray(payload?.entries)
      ? payload.entries
        .map((entry, index) => normalizeBackendEntry(entry as BackendLegendOcrEntry, index))
        .filter((entry): entry is LegendOcrEntry => Boolean(entry))
      : [];

    return {
      entries,
      ocrText: typeof payload?.ocrText === 'string' ? payload.ocrText : '',
      warnings: normalizeBackendWarnings(payload?.warnings),
    };
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

function getImageRegion(source: ImageData, rect: PixelRect) {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器无法创建图例识别画布');

  const target = ctx.createImageData(rect.width, rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const sourceIndex = ((rect.y + y) * source.width + rect.x + x) * 4;
      const targetIndex = (y * rect.width + x) * 4;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  ctx.putImageData(target, 0, 0);

  return {
    canvas,
    imageData: target,
  };
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png');
}

export function createLegendCropPreview(image: DecodedPatternImage, rect: LegendCropRect) {
  const box = rectToPixels(rect, image);
  return canvasToDataUrl(getImageRegion(image.imageData, box).canvas);
}

function isLegendForeground(pixel: Pixel) {
  if (pixel.a < 24) return false;
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  const sat = max <= 0 ? 0 : (max - min) / max;
  const lum = luminance(pixel);
  const delta = max - min;
  const isLightPaper = lum > 190 && sat < 0.14 && delta < 44;
  if (isLightPaper) return false;
  return sat > 0.08 || lum < 150 || delta > 52;
}

function mergeRuns(runs: Array<{ start: number; end: number }>, maxGap: number) {
  const merged: Array<{ start: number; end: number }> = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.start - previous.end <= maxGap) {
      previous.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function findRuns(values: number[], threshold: number, minLength: number, mergeGap: number) {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  values.forEach((value, index) => {
    if (value >= threshold && start < 0) {
      start = index;
      return;
    }
    if (value < threshold && start >= 0) {
      if (index - start >= minLength) runs.push({ start, end: index });
      start = -1;
    }
  });
  if (start >= 0 && values.length - start >= minLength) {
    runs.push({ start, end: values.length });
  }
  return mergeRuns(runs, mergeGap);
}

function sampleDominantHex(imageData: ImageData, bounds: PixelRect) {
  const x0 = clampInteger(bounds.x + bounds.width * 0.06, 0, imageData.width - 1);
  const x1 = clampInteger(bounds.x + bounds.width * 0.94, x0 + 1, imageData.width);
  const y0 = clampInteger(bounds.y + bounds.height * 0.08, 0, imageData.height - 1);
  const y1 = clampInteger(bounds.y + bounds.height * 0.54, y0 + 1, imageData.height);
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const pixel = getPixel(imageData, x, y);
      if (pixel.a < 24) continue;
      const key = `${pixel.r >> 4},${pixel.g >> 4},${pixel.b >> 4}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += pixel.r;
        bucket.g += pixel.g;
        bucket.b += pixel.b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r: pixel.r, g: pixel.g, b: pixel.b, count: 1 });
      }
    }
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return '#D8DEE6';
  return rgbToHex(dominant.r / dominant.count, dominant.g / dominant.count, dominant.b / dominant.count);
}

function detectLegendItemBoxes(crop: ImageData): LegendItemBox[] {
  const rowDensity = Array.from({ length: crop.height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < crop.width; x += 1) {
      if (isLegendForeground(getPixel(crop, x, y))) count += 1;
    }
    return count;
  });
  const rowRuns = findRuns(
    rowDensity,
    Math.max(3, Math.round(crop.width * 0.035)),
    Math.max(8, Math.round(crop.height * 0.035)),
    Math.max(2, Math.round(crop.height * 0.018)),
  );
  const boxes: LegendItemBox[] = [];

  for (const row of rowRuns) {
    const rowTop = clampInteger(row.start - 2, 0, crop.height - 1);
    const rowBottom = clampInteger(row.end + 2, rowTop + 1, crop.height);
    const rowHeight = rowBottom - rowTop;
    const colDensity = Array.from({ length: crop.width }, (_, x) => {
      let count = 0;
      for (let y = rowTop; y < rowBottom; y += 1) {
        if (isLegendForeground(getPixel(crop, x, y))) count += 1;
      }
      return count;
    });
    const colRuns = findRuns(
      colDensity,
      Math.max(2, Math.round(rowHeight * 0.12)),
      Math.max(20, Math.round(crop.width * 0.035)),
      Math.max(3, Math.round(crop.width * 0.012)),
    );

    for (const col of colRuns) {
      const x = clampInteger(col.start - 2, 0, crop.width - 1);
      const y = rowTop;
      const width = clampInteger(col.end - col.start + 4, 1, crop.width - x);
      const height = clampInteger(Math.max(rowHeight, width * 0.42), 1, crop.height - y);
      const aspect = width / Math.max(1, height);
      if (width < 20 || height < 10 || aspect < 1.1 || aspect > 8.5) continue;
      boxes.push({
        x,
        y,
        width,
        height,
        hex: sampleDominantHex(crop, { x, y, width, height }),
      });
    }
  }

  return boxes
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .slice(0, MAX_OCR_ITEMS);
}

function createFallbackColorEntries(crop: ImageData, maxEntries = 12): LegendOcrEntry[] {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const step = Math.max(1, Math.round(Math.min(crop.width, crop.height) / 120));

  for (let y = 0; y < crop.height; y += step) {
    for (let x = 0; x < crop.width; x += step) {
      const pixel = getPixel(crop, x, y);
      if (!isLegendForeground(pixel)) continue;
      const key = `${pixel.r >> 4},${pixel.g >> 4},${pixel.b >> 4}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += pixel.r;
        bucket.g += pixel.g;
        bucket.b += pixel.b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r: pixel.r, g: pixel.g, b: pixel.b, count: 1 });
      }
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= 8)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxEntries)
    .map((bucket, index) => ({
      id: `legend-color-${index + 1}`,
      code: `IMG${String(index + 1).padStart(2, '0')}`,
      hex: rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count),
      count: null,
      confidence: 0.45,
      source: 'color',
    }));
}

function averageLuminance(imageData: ImageData, bounds: PixelRect) {
  let total = 0;
  let count = 0;
  const x0 = clampInteger(bounds.x, 0, imageData.width - 1);
  const y0 = clampInteger(bounds.y, 0, imageData.height - 1);
  const x1 = clampInteger(bounds.x + bounds.width, x0 + 1, imageData.width);
  const y1 = clampInteger(bounds.y + bounds.height, y0 + 1, imageData.height);

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const pixel = getPixel(imageData, x, y);
      if (pixel.a < 24) continue;
      total += luminance(pixel);
      count += 1;
    }
  }

  return count ? total / count : 255;
}

function createOcrCanvas(cropCanvas: HTMLCanvasElement, items: LegendItemBox[]) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, cropCanvas.width * OCR_SCALE);
  canvas.height = Math.max(1, cropCanvas.height * OCR_SCALE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器无法创建 OCR 画布');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cropCanvas, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scaledItems = items.map((item) => ({
    x: item.x * OCR_SCALE,
    y: item.y * OCR_SCALE,
    width: item.width * OCR_SCALE,
    height: item.height * OCR_SCALE,
  }));

  for (const item of scaledItems) {
    const topBounds = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height * 0.58,
    };
    const bottomBounds = {
      x: item.x,
      y: item.y + item.height * 0.58,
      width: item.width,
      height: item.height * 0.42,
    };
    const topIsDark = averageLuminance(imageData, topBounds) < 185;
    const bottomIsDark = averageLuminance(imageData, bottomBounds) < 150;
    const x0 = clampInteger(item.x, 0, imageData.width - 1);
    const y0 = clampInteger(item.y, 0, imageData.height - 1);
    const x1 = clampInteger(item.x + item.width, x0 + 1, imageData.width);
    const y1 = clampInteger(item.y + item.height, y0 + 1, imageData.height);
    const splitY = item.y + item.height * 0.58;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * imageData.width + x) * 4;
        const pixel = {
          r: imageData.data[index],
          g: imageData.data[index + 1],
          b: imageData.data[index + 2],
          a: imageData.data[index + 3],
        };
        const invert = y < splitY ? topIsDark : bottomIsDark;
        const lum = invert ? 255 - luminance(pixel) : luminance(pixel);
        const contrasted = clamp((lum - 118) * 1.85 + 136, 0, 255);
        imageData.data[index] = contrasted;
        imageData.data[index + 1] = contrasted;
        imageData.data[index + 2] = contrasted;
        imageData.data[index + 3] = 255;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function getTesseractModule(module: unknown) {
  const maybeDefault = module as { default?: typeof Tesseract };
  return maybeDefault.default ?? (module as typeof Tesseract);
}

function collectWords(page: Tesseract.Page): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text) continue;
          words.push({
            text,
            confidence: word.confidence,
            bbox: word.bbox,
          });
        }
      }
    }
  }
  return words;
}

function normalizeCode(value: string) {
  const text = value
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9]/g, '');
  const match = text.match(/[A-Z]{1,3}0?\d{1,4}/);
  if (!match) return '';
  const code = match[0];
  const parts = code.match(/^([A-Z]{1,3})0*(\d{1,4})$/);
  if (!parts) return code;
  return `${parts[1]}${Number.parseInt(parts[2], 10)}`;
}

function normalizeCount(value: string) {
  const text = value
    .toUpperCase()
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/[^0-9]/g, '');
  if (!text || text.length > 6) return null;
  const count = Number.parseInt(text, 10);
  return Number.isFinite(count) && count <= 999_999 ? count : null;
}

function findCountInText(value: string, code: string) {
  const tokens = value.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  for (const token of tokens) {
    if (normalizeCode(token) === code) continue;
    const cleaned = token.replace(/[^A-Z0-9|]/gi, '');
    if (!/^[0-9OQDIL|SB]+$/i.test(cleaned)) continue;
    const count = normalizeCount(cleaned);
    if (count !== null) return count;
  }
  return null;
}

function mapWordsToEntries(items: LegendItemBox[], words: OcrWord[], fullText: string): LegendOcrEntry[] {
  const fallbackCodes = fullText
    .split(/\s+/)
    .map(normalizeCode)
    .filter(Boolean);
  const fallbackCounts = fullText
    .split(/\s+/)
    .map((token) => (/^[0-9OQDIL|SB]+$/i.test(token) ? normalizeCount(token) : null))
    .filter((value): value is number => value !== null);

  return items.map((item, index) => {
    const bounds = {
      x0: item.x * OCR_SCALE,
      y0: item.y * OCR_SCALE,
      x1: (item.x + item.width) * OCR_SCALE,
      y1: (item.y + item.height) * OCR_SCALE,
    };
    const splitY = bounds.y0 + (bounds.y1 - bounds.y0) * 0.58;
    const itemWords = words
      .filter((word) => {
        const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
        const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
        return centerX >= bounds.x0 - 6
          && centerX <= bounds.x1 + 6
          && centerY >= bounds.y0 - 6
          && centerY <= bounds.y1 + 6;
      })
      .sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2) || (a.bbox.x0 - b.bbox.x0));
    const topText = itemWords
      .filter((word) => (word.bbox.y0 + word.bbox.y1) / 2 < splitY)
      .map((word) => word.text)
      .join(' ');
    const bottomText = itemWords
      .filter((word) => (word.bbox.y0 + word.bbox.y1) / 2 >= splitY)
      .map((word) => word.text)
      .join(' ');
    const rawText = itemWords.map((word) => word.text).join(' ');
    const code = normalizeCode(topText) || normalizeCode(rawText) || fallbackCodes[index] || `IMG${String(index + 1).padStart(2, '0')}`;
    const count = normalizeCount(bottomText) ?? findCountInText(rawText, code) ?? fallbackCounts[index] ?? null;
    const confidence = itemWords.length
      ? itemWords.reduce((sum, word) => sum + word.confidence, 0) / itemWords.length / 100
      : 0.55;

    return {
      id: `legend-ocr-${index + 1}`,
      code,
      hex: item.hex,
      count,
      confidence: clamp(confidence, 0, 1),
      source: code.startsWith('IMG') && count === null ? 'color' : 'ocr',
      rawText,
    };
  });
}

export function createManualLegendEntry(index: number): LegendOcrEntry {
  return {
    id: `legend-manual-${Date.now()}-${index}`,
    code: '',
    hex: '#D8DEE6',
    count: null,
    confidence: 1,
    source: 'manual',
  };
}

export async function recognizeLegendFromCrop(image: DecodedPatternImage, rect: LegendCropRect): Promise<LegendOcrResult> {
  const box = rectToPixels(rect, image);
  const { canvas: cropCanvas, imageData: cropImageData } = getImageRegion(image.imageData, box);
  const previewDataUrl = canvasToDataUrl(cropCanvas);
  const warnings: string[] = [];

  try {
    const paddleResult = await requestPaddleLegendOcr(previewDataUrl);
    warnings.push(...paddleResult.warnings);
    if (paddleResult.entries.length) {
      return {
        entries: paddleResult.entries,
        previewDataUrl,
        ocrText: paddleResult.ocrText,
        usedOcr: true,
        warnings,
      };
    }
    warnings.push('PaddleOCR 未识别到有效图例项，已切换到本地 OCR 兜底。');
  } catch {
    warnings.push('PaddleOCR 后端不可用，已切换到本地 OCR 兜底。');
  }

  const items = detectLegendItemBoxes(cropImageData);

  if (items.length === 0) {
    return {
      entries: createFallbackColorEntries(cropImageData),
      previewDataUrl,
      ocrText: '',
      usedOcr: false,
      warnings: [...warnings, '未能切分图例项，已按颜色生成可编辑项。'],
    };
  }

  try {
    const tesseract = getTesseractModule(await import('tesseract.js'));
    const worker = await tesseract.createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const ocrCanvas = createOcrCanvas(cropCanvas, items);
      const { data } = await worker.recognize(ocrCanvas, {}, { text: true, blocks: true });
      const words = collectWords(data);
      const entries = mapWordsToEntries(items, words, data.text ?? '');
      const usefulEntries = entries.filter((entry) => entry.code.trim() || entry.count !== null);

      if (usefulEntries.length === 0) {
        warnings.push('OCR 未读到有效文字，已保留色块供手动填写。');
      }

      return {
        entries: usefulEntries.length ? entries : items.map((item, index) => ({
          id: `legend-color-${index + 1}`,
          code: `IMG${String(index + 1).padStart(2, '0')}`,
          hex: item.hex,
          count: null,
          confidence: 0.45,
          source: 'color',
        })),
        previewDataUrl,
        ocrText: data.text ?? '',
        usedOcr: true,
        warnings,
      };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch {
    return {
      entries: items.map((item, index) => ({
        id: `legend-color-${index + 1}`,
        code: `IMG${String(index + 1).padStart(2, '0')}`,
        hex: item.hex,
        count: null,
        confidence: 0.45,
        source: 'color',
      })),
      previewDataUrl,
      ocrText: '',
      usedOcr: false,
      warnings: [...warnings, 'OCR 引擎加载失败，已保留色块供手动填写。'],
    };
  }
}
