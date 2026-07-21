import type Tesseract from 'tesseract.js';
import type { PatternCell } from '../../features/workshop/model/types';
import type { PatternImportGridCandidate } from './types';
import type { DecodedPatternImage } from './image-decode';

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

type SheetSample = {
  groupKey: string;
  title: string;
  cell: PatternCell;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SampleRecognition = {
  cellKey: string;
  rawText: string;
  code: string;
  confidence: number;
};

export type GridOcrGroupInput = {
  key: string;
  title: string;
  cells: PatternCell[];
};

export type GridOcrGroupSuggestion = {
  groupKey: string;
  title: string;
  code: string;
  confidence: number;
  rawText: string;
  sampleCount: number;
  ambiguous: boolean;
  samples: SampleRecognition[];
};

export type GridOcrResult = {
  suggestions: GridOcrGroupSuggestion[];
  processedGroupCount: number;
  skippedGroupCount: number;
  rawText: string;
};

const TILE_SIZE = 88;
const TILE_GAP = 12;
const MAX_GROUPS = 120;
const MAX_SAMPLES_PER_GROUP = 3;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getCellKey(cell: Pick<PatternCell, 'x' | 'y'>) {
  return `${cell.x},${cell.y}`;
}

function luminance(pixel: { r: number; g: number; b: number }) {
  return pixel.r * 0.299 + pixel.g * 0.587 + pixel.b * 0.114;
}

function getTesseractModule(module: unknown) {
  const maybeDefault = module as { default?: typeof Tesseract };
  return maybeDefault.default ?? (module as typeof Tesseract);
}

export function normalizeGridOcrCode(value: string) {
  const compact = value
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9]/g, '');
  const candidates: Array<{ start: number; value: string; letters: string }> = [];

  for (let start = 0; start < compact.length; start += 1) {
    const match = compact.slice(start).match(/^([A-Z]{1,3})(\d{1,4})/);
    if (match) {
      candidates.push({
        start,
        value: `${match[1]}${match[2]}`,
        letters: match[1],
      });
    }
  }

  if (!candidates.length) return '';
  const preferred = candidates.filter((candidate) => candidate.letters.length <= 2);
  const sorted = (preferred.length ? preferred : candidates).sort((a, b) => (
    a.start - b.start || a.letters.length - b.letters.length
  ));
  return sorted[0]?.value ?? '';
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

function pickRepresentativeCells(cells: PatternCell[]) {
  if (cells.length <= MAX_SAMPLES_PER_GROUP) return cells;
  const indexes = [
    0,
    Math.floor((cells.length - 1) / 2),
    cells.length - 1,
  ];
  return indexes
    .map((index) => cells[index])
    .filter((cell, index, list): cell is PatternCell => Boolean(cell) && list.findIndex((item) => item === cell) === index);
}

function preprocessTile(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const imageData = ctx.getImageData(x, y, width, height);
  let totalLum = 0;
  let count = 0;

  for (let index = 0; index < imageData.data.length; index += 4) {
    if (imageData.data[index + 3] < 24) continue;
    totalLum += luminance({
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2],
    });
    count += 1;
  }

  const averageLum = count ? totalLum / count : 255;
  const invert = averageLum < 145;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const pixel = {
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2],
    };
    const lum = invert ? 255 - luminance(pixel) : luminance(pixel);
    const contrasted = clamp((lum - 118) * 2.1 + 138, 0, 255);
    imageData.data[index] = contrasted;
    imageData.data[index + 1] = contrasted;
    imageData.data[index + 2] = contrasted;
    imageData.data[index + 3] = 255;
  }

  ctx.putImageData(imageData, x, y);
}

function buildContactSheet(params: {
  image: DecodedPatternImage;
  grid: PatternImportGridCandidate;
  groups: GridOcrGroupInput[];
}) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = params.image.width;
  sourceCanvas.height = params.image.height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('当前浏览器无法创建网格 OCR 源画布');
  sourceCtx.putImageData(params.image.imageData, 0, 0);

  const groupSamples = params.groups.flatMap((group) => (
    pickRepresentativeCells(group.cells).map((cell) => ({ group, cell }))
  ));
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(groupSamples.length))));
  const rows = Math.max(1, Math.ceil(groupSamples.length / columns));
  const canvas = document.createElement('canvas');
  canvas.width = TILE_GAP + columns * (TILE_SIZE + TILE_GAP);
  canvas.height = TILE_GAP + rows * (TILE_SIZE + TILE_GAP);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器无法创建网格 OCR 画布');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const samples: SheetSample[] = [];
  groupSamples.forEach(({ group, cell }, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = TILE_GAP + col * (TILE_SIZE + TILE_GAP);
    const y = TILE_GAP + row * (TILE_SIZE + TILE_GAP);
    const cellWidth = Math.max(1, params.grid.cellWidth);
    const cellHeight = Math.max(1, params.grid.cellHeight);
    const insetX = cellWidth * 0.08;
    const insetY = cellHeight * 0.08;
    const sourceX = params.grid.bounds.x + cell.x * cellWidth + insetX;
    const sourceY = params.grid.bounds.y + cell.y * cellHeight + insetY;
    const sourceWidth = Math.max(1, cellWidth - insetX * 2);
    const sourceHeight = Math.max(1, cellHeight - insetY * 2);
    const sx = clampInteger(sourceX, 0, params.image.width - 1);
    const sy = clampInteger(sourceY, 0, params.image.height - 1);
    const sw = clampInteger(sourceWidth, 1, params.image.width - sx);
    const sh = clampInteger(sourceHeight, 1, params.image.height - sy);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, x, y, TILE_SIZE, TILE_SIZE);
    preprocessTile(ctx, x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    samples.push({
      groupKey: group.key,
      title: group.title,
      cell,
      x,
      y,
      width: TILE_SIZE,
      height: TILE_SIZE,
    });
  });

  return { canvas, samples };
}

function recognizeSamples(samples: SheetSample[], words: OcrWord[]) {
  return samples.map((sample) => {
    const sampleWords = words
      .filter((word) => {
        const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
        const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
        return centerX >= sample.x
          && centerX <= sample.x + sample.width
          && centerY >= sample.y
          && centerY <= sample.y + sample.height;
      })
      .sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));
    const rawText = sampleWords.map((word) => word.text).join(' ').trim();
    const confidence = sampleWords.length
      ? sampleWords.reduce((sum, word) => sum + word.confidence, 0) / sampleWords.length / 100
      : 0;

    return {
      groupKey: sample.groupKey,
      title: sample.title,
      result: {
        cellKey: getCellKey(sample.cell),
        rawText,
        code: normalizeGridOcrCode(rawText),
        confidence,
      },
    };
  });
}

function summarizeGroupSuggestions(sampleResults: ReturnType<typeof recognizeSamples>) {
  const byGroup = new Map<string, Array<{ title: string; result: SampleRecognition }>>();
  sampleResults.forEach((sample) => {
    const current = byGroup.get(sample.groupKey) ?? [];
    current.push({ title: sample.title, result: sample.result });
    byGroup.set(sample.groupKey, current);
  });

  const suggestions: GridOcrGroupSuggestion[] = [];
  byGroup.forEach((samples, groupKey) => {
    const validSamples = samples.filter((sample) => sample.result.code);
    if (!validSamples.length) return;

    const codeStats = new Map<string, { count: number; confidenceSum: number; rawText: string[] }>();
    validSamples.forEach((sample) => {
      const current = codeStats.get(sample.result.code) ?? { count: 0, confidenceSum: 0, rawText: [] };
      current.count += 1;
      current.confidenceSum += sample.result.confidence;
      if (sample.result.rawText) current.rawText.push(sample.result.rawText);
      codeStats.set(sample.result.code, current);
    });
    const rankedCodes = [...codeStats.entries()].sort((a, b) => (
      b[1].count - a[1].count
      || (b[1].confidenceSum / b[1].count) - (a[1].confidenceSum / a[1].count)
    ));
    const [code, stats] = rankedCodes[0] ?? [];
    if (!code || !stats) return;

    suggestions.push({
      groupKey,
      title: samples[0]?.title ?? groupKey,
      code,
      confidence: clamp(stats.confidenceSum / stats.count, 0, 1),
      rawText: stats.rawText.join(' / '),
      sampleCount: samples.length,
      ambiguous: codeStats.size > 1,
      samples: samples.map((sample) => sample.result),
    });
  });

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export async function recognizeGridGroupCodes(params: {
  image: DecodedPatternImage;
  grid: PatternImportGridCandidate;
  groups: GridOcrGroupInput[];
  maxGroups?: number;
}): Promise<GridOcrResult> {
  const eligibleGroups = params.groups
    .filter((group) => group.cells.length > 0)
    .slice(0, params.maxGroups ?? MAX_GROUPS);
  if (!eligibleGroups.length) {
    return {
      suggestions: [],
      processedGroupCount: 0,
      skippedGroupCount: params.groups.length,
      rawText: '',
    };
  }

  const { canvas, samples } = buildContactSheet({
    image: params.image,
    grid: params.grid,
    groups: eligibleGroups,
  });
  const tesseract = getTesseractModule(await import('tesseract.js'));
  const worker = await tesseract.createWorker('eng');

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words = collectWords(data);
    const sampleResults = recognizeSamples(samples, words);

    return {
      suggestions: summarizeGroupSuggestions(sampleResults),
      processedGroupCount: eligibleGroups.length,
      skippedGroupCount: Math.max(0, params.groups.length - eligibleGroups.length),
      rawText: data.text ?? '',
    };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
