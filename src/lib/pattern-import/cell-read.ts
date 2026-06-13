import type { PatternCell, PatternResult } from '../../features/workshop/model/types';
import { reconstructPatternResult } from './reconstruct';
import { validatePatternResult } from './validate';
import type {
  ImportedCell,
  ImportedPaletteEntry,
  PatternImportAnalysis,
  PatternImportGridCandidate,
  PatternImportIssue,
  PatternImportResult,
} from './types';

export type ImageGridSamplingParams = {
  imageData: ImageData;
  fileName: string;
  columns: number;
  rows: number;
  originX: number;
  originY: number;
  cellSize?: number;
  cellWidth?: number;
  cellHeight?: number;
  sampleRatio?: number;
  clusterThreshold?: number;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type SampledCell = {
  x: number;
  y: number;
  rgb: Rgb | null;
  confidence: number;
  variance: number;
};

type ColorCluster = {
  id: number;
  r: number;
  g: number;
  b: number;
  count: number;
  maxDistance: number;
};

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function rgbToHex(rgb: Rgb) {
  const toHex = (value: number) => clampInteger(value, 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function colorDistance(a: Rgb, b: Rgb) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function bucketKey(r: number, g: number, b: number) {
  return `${r >> 4},${g >> 4},${b >> 4}`;
}

function getPixel(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3],
  };
}

function sampleDominantColor(params: {
  imageData: ImageData;
  left: number;
  top: number;
  right: number;
  bottom: number;
}): Pick<SampledCell, 'rgb' | 'confidence' | 'variance'> {
  const { imageData } = params;
  const left = clampInteger(params.left, 0, imageData.width - 1);
  const top = clampInteger(params.top, 0, imageData.height - 1);
  const right = clampInteger(params.right, 0, imageData.width);
  const bottom = clampInteger(params.bottom, 0, imageData.height);
  if (right <= left || bottom <= top) return { rgb: null, confidence: 0, variance: 999 };

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let visibleCount = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = getPixel(imageData, x, y);
      if (pixel.a < 16) continue;
      visibleCount += 1;
      const key = bucketKey(pixel.r, pixel.g, pixel.b);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += pixel.r;
        bucket.g += pixel.g;
        bucket.b += pixel.b;
      } else {
        buckets.set(key, { count: 1, r: pixel.r, g: pixel.g, b: pixel.b });
      }
    }
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || visibleCount === 0) return { rgb: null, confidence: 0, variance: 999 };

  const rgb = {
    r: dominant.r / dominant.count,
    g: dominant.g / dominant.count,
    b: dominant.b / dominant.count,
  };

  let varianceSum = 0;
  let varianceCount = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = getPixel(imageData, x, y);
      if (pixel.a < 16) continue;
      varianceSum += colorDistance(rgb, pixel);
      varianceCount += 1;
    }
  }

  const dominance = dominant.count / visibleCount;
  const variance = varianceCount ? varianceSum / varianceCount : 999;
  const confidence = Math.max(0, Math.min(1, dominance * 0.7 + Math.max(0, 1 - variance / 96) * 0.3));
  return { rgb, confidence, variance };
}

function sampleGridCells(params: ImageGridSamplingParams): SampledCell[] {
  const sampleRatio = Math.max(0.35, Math.min(0.8, params.sampleRatio ?? 0.6));
  const cellWidth = Math.max(1, params.cellWidth ?? params.cellSize ?? 1);
  const cellHeight = Math.max(1, params.cellHeight ?? params.cellSize ?? 1);
  const sampleInsetX = cellWidth * (1 - sampleRatio) / 2;
  const sampleInsetY = cellHeight * (1 - sampleRatio) / 2;
  const cells: SampledCell[] = [];

  for (let y = 0; y < params.rows; y += 1) {
    for (let x = 0; x < params.columns; x += 1) {
      const cellLeft = params.originX + x * cellWidth;
      const cellTop = params.originY + y * cellHeight;
      const left = cellLeft + sampleInsetX;
      const top = cellTop + sampleInsetY;
      const right = cellLeft + cellWidth - sampleInsetX;
      const bottom = cellTop + cellHeight - sampleInsetY;
      const isOutside = right <= 0 || bottom <= 0 || left >= params.imageData.width || top >= params.imageData.height;
      if (isOutside) {
        cells.push({ x, y, rgb: null, confidence: 0, variance: 999 });
        continue;
      }

      cells.push({
        x,
        y,
        ...sampleDominantColor({ imageData: params.imageData, left, top, right, bottom }),
      });
    }
  }

  return cells;
}

function findNearestCluster(clusters: ColorCluster[], rgb: Rgb) {
  let nearest: ColorCluster | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cluster of clusters) {
    const distance = colorDistance(rgb, cluster);
    if (distance < nearestDistance) {
      nearest = cluster;
      nearestDistance = distance;
    }
  }
  return { cluster: nearest, distance: nearestDistance };
}

function clusterSampledCells(samples: SampledCell[], threshold: number) {
  const clusters: ColorCluster[] = [];
  const sampleClusterIds = new Map<string, number>();

  for (const sample of samples) {
    if (!sample.rgb) continue;
    const { cluster, distance } = findNearestCluster(clusters, sample.rgb);
    if (!cluster || distance > threshold) {
      const id = clusters.length;
      clusters.push({
        id,
        r: sample.rgb.r,
        g: sample.rgb.g,
        b: sample.rgb.b,
        count: 1,
        maxDistance: 0,
      });
      sampleClusterIds.set(`${sample.x},${sample.y}`, id);
      continue;
    }

    cluster.r = (cluster.r * cluster.count + sample.rgb.r) / (cluster.count + 1);
    cluster.g = (cluster.g * cluster.count + sample.rgb.g) / (cluster.count + 1);
    cluster.b = (cluster.b * cluster.count + sample.rgb.b) / (cluster.count + 1);
    cluster.count += 1;
    cluster.maxDistance = Math.max(cluster.maxDistance, distance);
    sampleClusterIds.set(`${sample.x},${sample.y}`, cluster.id);
  }

  return { clusters, sampleClusterIds };
}

function createImageIssue(message: string, path?: string): PatternImportIssue {
  return { severity: 'warning', code: 'lowConfidenceCell', message, path };
}

function buildAnalysis(params: {
  fileName: string;
  patternResult: PatternResult;
  validation: PatternImportResult['validation'];
  grid: PatternImportGridCandidate;
  importedCells: ImportedCell[];
  importedPalette: ImportedPaletteEntry[];
  issues: PatternImportIssue[];
}): PatternImportAnalysis {
  return {
    document: {
      sourceType: 'image',
      fileName: params.fileName,
      pages: [{
        pageIndex: 0,
        width: params.grid.bounds.width,
        height: params.grid.bounds.height,
      }],
    },
    selectedGrid: params.grid,
    detectedBrand: 'external',
    brandConfidence: 0,
    palette: params.importedPalette,
    cells: params.importedCells,
    issues: params.validation.issues,
  };
}

export function reconstructPatternFromImageGrid(params: ImageGridSamplingParams): PatternImportResult {
  const columns = clampInteger(params.columns, 1, 1000);
  const rows = clampInteger(params.rows, 1, 1000);
  const cellWidth = Math.max(1, params.cellWidth ?? params.cellSize ?? 1);
  const cellHeight = Math.max(1, params.cellHeight ?? params.cellSize ?? 1);
  const samples = sampleGridCells({ ...params, columns, rows, cellWidth, cellHeight });
  const { clusters, sampleClusterIds } = clusterSampledCells(samples, params.clusterThreshold ?? 34);
  const sortedClusters = [...clusters].sort((a, b) => b.count - a.count);
  const clusterCodeById = new Map<number, string>();
  const clusterHexById = new Map<number, string>();

  sortedClusters.forEach((cluster, index) => {
    const code = `IMG${String(index + 1).padStart(2, '0')}`;
    clusterCodeById.set(cluster.id, code);
    clusterHexById.set(cluster.id, rgbToHex(cluster));
  });

  const patternCells: PatternCell[] = samples.map((sample) => {
    const clusterId = sampleClusterIds.get(`${sample.x},${sample.y}`);
    const hex = clusterId === undefined ? 'transparent' : clusterHexById.get(clusterId) ?? 'transparent';
    if (clusterId === undefined || hex === 'transparent') {
      return {
        x: sample.x,
        y: sample.y,
        colorId: '__TRANSPARENT__',
        vendorCode: '',
        hex,
        isExternal: true,
      };
    }

    const vendorCode = clusterCodeById.get(clusterId) ?? 'IMG??';
    return {
      x: sample.x,
      y: sample.y,
      colorId: hex,
      vendorCode,
      hex,
    };
  });

  const patternResult = reconstructPatternResult({ width: columns, height: rows, cells: patternCells });
  const baseValidation = validatePatternResult(patternResult);
  const lowConfidenceSamples = samples.filter((sample) => sample.confidence < 0.54 || sample.variance > 58);
  const imageIssues = lowConfidenceSamples.slice(0, 20).map((sample) => (
    createImageIssue(`格子 (${sample.x + 1}, ${sample.y + 1}) 采样置信度较低`, `cells.${sample.y}.${sample.x}`)
  ));
  if (lowConfidenceSamples.length > imageIssues.length) {
    imageIssues.push(createImageIssue(`还有 ${lowConfidenceSamples.length - imageIssues.length} 个低置信度格子未展开显示`));
  }

  const validation = {
    ...baseValidation,
    lowConfidenceCellCount: lowConfidenceSamples.length,
    issues: [...baseValidation.issues, ...imageIssues],
  };

  const importedCells: ImportedCell[] = samples.map((sample) => {
    const clusterId = sampleClusterIds.get(`${sample.x},${sample.y}`);
    const hex = clusterId === undefined ? undefined : clusterHexById.get(clusterId);
    const code = clusterId === undefined ? undefined : clusterCodeById.get(clusterId);
    return {
      x: sample.x,
      y: sample.y,
      sampledHex: hex,
      rawCodeText: code,
      importColorKey: hex,
      resolvedHex: hex,
      resolvedCode: code,
      confidence: sample.confidence,
      evidence: sample.rgb ? [{ type: 'sampled-color', value: rgbToHex(sample.rgb) }] : [],
    };
  });

  const importedPalette: ImportedPaletteEntry[] = sortedClusters.map((cluster) => {
    const hex = clusterHexById.get(cluster.id) ?? rgbToHex(cluster);
    const code = clusterCodeById.get(cluster.id) ?? '';
    return {
      importColorKey: hex,
      rawCode: code,
      rawCount: cluster.count,
      swatchHex: hex,
      resolvedCode: code,
      resolvedHex: hex,
      resolution: 'external',
      confidence: Math.max(0, Math.min(1, 1 - cluster.maxDistance / 80)),
      issues: [],
    };
  });

  const grid: PatternImportGridCandidate = {
    pageIndex: 0,
    bounds: {
      x: params.originX,
      y: params.originY,
      width: columns * cellWidth,
      height: rows * cellHeight,
    },
    columns,
    rows,
    cellWidth,
    cellHeight,
    score: Math.max(0, Math.min(1, 1 - lowConfidenceSamples.length / Math.max(1, samples.length))),
  };

  return {
    patternResult,
    analysis: buildAnalysis({
      fileName: params.fileName,
      patternResult,
      validation,
      grid,
      importedCells,
      importedPalette,
      issues: imageIssues,
    }),
    validation,
  };
}
