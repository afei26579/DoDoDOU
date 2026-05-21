import type { LabColor } from './color-convert';
import { labDistance, rgbToLab } from './color-convert';
import type { PatternRgb } from './color-system';
import type { WorkingCell } from './algo-types';
import type { PatternSizeTier } from './pattern-size';
import type { WorkshopStyle } from '../../features/workshop/model/types';

const ALPHA_THRESHOLD = 128;

type PixelSample = {
  rgb: PatternRgb;
  lab: LabColor;
};

type GridSamplingParams = {
  imageData: ImageData;
  width: number;
  height: number;
  sizeTier: PatternSizeTier;
  style: WorkshopStyle;
};

function getTrimRatio(sizeTier: PatternSizeTier) {
  if (sizeTier === 'small') return 0.06;
  if (sizeTier === 'medium') return 0.1;
  return 0.14;
}

function getMinAlphaRatio(sizeTier: PatternSizeTier) {
  if (sizeTier === 'small') return 0.18;
  if (sizeTier === 'medium') return 0.14;
  return 0.14;
}

function getDarkPreserveThreshold(sizeTier: PatternSizeTier, style: WorkshopStyle) {
  const base = sizeTier === 'small' ? 0.2 : sizeTier === 'medium' ? 0.14 : 0.18;
  return style === '写实' ? base + 0.06 : base;
}

function getDominantBucketSize(sizeTier: PatternSizeTier) {
  if (sizeTier === 'small') return 32;
  if (sizeTier === 'medium') return 24;
  return 20;
}

function getDominantRatioThreshold(sizeTier: PatternSizeTier) {
  if (sizeTier === 'small') return 0.16;
  if (sizeTier === 'medium') return 0.18;
  return 0.22;
}

function getLuminance(rgb: PatternRgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

function isNearBlack(rgb: PatternRgb) {
  return getLuminance(rgb) <= 58 && Math.max(rgb.r, rgb.g, rgb.b) <= 92;
}

function quantizeChannel(value: number, bucketSize: number) {
  return Math.max(0, Math.min(255, Math.round(value / bucketSize) * bucketSize));
}

function getBucketKey(rgb: PatternRgb, bucketSize: number) {
  return [
    quantizeChannel(rgb.r, bucketSize),
    quantizeChannel(rgb.g, bucketSize),
    quantizeChannel(rgb.b, bucketSize),
  ].join(',');
}

function averageLab(samples: PixelSample[]): LabColor {
  let l = 0;
  let a = 0;
  let b = 0;

  for (const sample of samples) {
    l += sample.lab.l;
    a += sample.lab.a;
    b += sample.lab.b;
  }

  const count = Math.max(1, samples.length);
  return {
    l: l / count,
    a: a / count,
    b: b / count,
  };
}

function averageRgb(samples: PixelSample[]): PatternRgb {
  let r = 0;
  let g = 0;
  let b = 0;

  for (const sample of samples) {
    r += sample.rgb.r;
    g += sample.rgb.g;
    b += sample.rgb.b;
  }

  const count = Math.max(1, samples.length);
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function getRepresentativeFromSamples(samples: PixelSample[]) {
  const sourceLab = averageLab(samples);
  const sourceRgb = averageRgb(samples);
  const variance = samples.reduce((sum, sample) => sum + labDistance(sample.lab, sourceLab), 0) / Math.max(1, samples.length);

  return {
    sourceLab,
    sourceRgb,
    variance,
  };
}

function getDominantBucketSamples(samples: PixelSample[], bucketSize: number) {
  const buckets = new Map<string, PixelSample[]>();

  for (const sample of samples) {
    const key = getBucketKey(sample.rgb, bucketSize);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(sample);
    } else {
      buckets.set(key, [sample]);
    }
  }

  let best: PixelSample[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length > best.length) best = bucket;
  }

  return best;
}

function createTransparentWorkingCell(x: number, y: number, index: number, alphaRatio: number): WorkingCell {
  return {
    x,
    y,
    index,
    sourceRgb: null,
    sourceLab: null,
    variance: 0,
    alphaRatio,
    isTransparent: true,
    matchedColorId: 'transparent',
    matchedVendorCode: '',
    matchedHex: 'transparent',
    matchedLab: null,
    bestDeltaE: 0,
    secondBestDeltaE: 0,
    deltaGap: 0,
    matchConfidence: 0,
    cellConfidence: 0,
    cleanupAction: 'none',
  };
}

function sampleCell(params: GridSamplingParams, x: number, y: number): WorkingCell {
  const { imageData, width, height, sizeTier } = params;
  const { data, width: imageWidth, height: imageHeight } = imageData;
  const cellWidth = imageWidth / width;
  const cellHeight = imageHeight / height;
  const startX = Math.floor(x * cellWidth);
  const startY = Math.floor(y * cellHeight);
  const endX = Math.min(imageWidth, Math.ceil((x + 1) * cellWidth));
  const endY = Math.min(imageHeight, Math.ceil((y + 1) * cellHeight));
  const totalPixels = Math.max(1, (endX - startX) * (endY - startY));
  const samples: PixelSample[] = [];

  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      const dataIndex = (py * imageWidth + px) * 4;
      if (data[dataIndex + 3] < ALPHA_THRESHOLD) continue;

      const rgb = {
        r: data[dataIndex],
        g: data[dataIndex + 1],
        b: data[dataIndex + 2],
      };
      samples.push({ rgb, lab: rgbToLab(rgb) });
    }
  }

  const index = y * width + x;
  const alphaRatio = samples.length / totalPixels;
  if (samples.length === 0 || alphaRatio < getMinAlphaRatio(sizeTier)) {
    return createTransparentWorkingCell(x, y, index, alphaRatio);
  }

  const preliminaryLab = averageLab(samples);
  const sorted = [...samples].sort((a, b) => labDistance(a.lab, preliminaryLab) - labDistance(b.lab, preliminaryLab));
  const keepCount = Math.max(1, Math.ceil(sorted.length * (1 - getTrimRatio(sizeTier))));
  const kept = sorted.slice(0, keepCount);
  const sourceLab = averageLab(kept);
  const sourceRgb = averageRgb(kept);
  const variance = kept.reduce((sum, sample) => sum + labDistance(sample.lab, sourceLab), 0) / kept.length;
  let representative = { sourceLab, sourceRgb, variance };

  const darkSamples = samples.filter((sample) => isNearBlack(sample.rgb));
  if (darkSamples.length / samples.length >= getDarkPreserveThreshold(sizeTier, params.style)) {
    representative = getRepresentativeFromSamples(darkSamples);
  } else if (params.style !== '写实') {
    const dominantSamples = getDominantBucketSamples(samples, getDominantBucketSize(sizeTier));
    if (dominantSamples.length / samples.length >= getDominantRatioThreshold(sizeTier)) {
      representative = getRepresentativeFromSamples(dominantSamples);
    }
  }

  return {
    x,
    y,
    index,
    sourceRgb: representative.sourceRgb,
    sourceLab: representative.sourceLab,
    variance: representative.variance,
    alphaRatio,
    isTransparent: false,
    matchedColorId: '',
    matchedVendorCode: '',
    matchedHex: '',
    matchedLab: null,
    bestDeltaE: Number.POSITIVE_INFINITY,
    secondBestDeltaE: Number.POSITIVE_INFINITY,
    deltaGap: 0,
    matchConfidence: 0,
    cellConfidence: 0,
    cleanupAction: 'none',
  };
}

export function sampleGridCells(params: GridSamplingParams): WorkingCell[] {
  const cells: WorkingCell[] = [];

  for (let y = 0; y < params.height; y++) {
    for (let x = 0; x < params.width; x++) {
      cells.push(sampleCell(params, x, y));
    }
  }

  return cells;
}
