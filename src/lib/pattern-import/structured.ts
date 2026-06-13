import type { ColorSystem, PatternCell, PatternResult, WorkshopConfig } from '../../features/workshop/model/types';
import { beadBrandKeys, isBeadBrandKey, normalizeBeadBrandKey } from '../pattern/brand';
import { getColorByBrandCode, getVendorCode } from '../pattern/color-system';
import {
  DODOUDOU_PATTERN_EXPORT_VERSION,
  getDodoudouPatternExportVersion,
  isDodoudouPatternExportLike,
  normalizeDodoudouPatternExportConfig,
} from './dodoudou-json';
import { createPatternImportAnalysis } from './diagnostics';
import {
  createTransparentPatternCell,
  normalizeImportHex,
  reconstructPatternResult,
} from './reconstruct';
import { validatePatternResult } from './validate';
import {
  PatternImportError,
  type PatternImportIssue,
  type PatternImportResult,
  type PatternImportSourceType,
} from './types';

type ParseStructuredImportOptions = {
  brand?: ColorSystem;
};

const TRANSPARENT_TOKENS = new Set(['', '-', '.', '_', 'transparent', '透明', '空', 'none', 'null']);

const BASIC_COLOR_HEX: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#E53935',
  green: '#43A047',
  blue: '#1E88E5',
  yellow: '#FDD835',
  orange: '#FB8C00',
  purple: '#8E24AA',
  pink: '#EC407A',
  brown: '#795548',
  gray: '#9E9E9E',
  grey: '#9E9E9E',
  cyan: '#00ACC1',
  magenta: '#D81B60',
  黑: '#000000',
  白: '#FFFFFF',
  红: '#E53935',
  绿: '#43A047',
  蓝: '#1E88E5',
  黄: '#FDD835',
  橙: '#FB8C00',
  紫: '#8E24AA',
  粉: '#EC407A',
  棕: '#795548',
  灰: '#9E9E9E',
  青: '#00ACC1',
};

function createIssue(
  severity: PatternImportIssue['severity'],
  code: PatternImportIssue['code'],
  message: string,
  path?: string,
): PatternImportIssue {
  return { severity, code, message, path };
}

function getFileExtension(fileName: string) {
  const match = /\.([^.]+)$/.exec(fileName.trim().toLowerCase());
  return match?.[1] ?? '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractPatternResultFromJson(value: unknown): PatternResult | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.width === 'number' && typeof value.height === 'number' && Array.isArray(value.cells)) {
    return value as PatternResult;
  }

  if (isPlainObject(value.patternResult)) {
    return value.patternResult as PatternResult;
  }

  if (isPlainObject(value.pattern)) {
    return value.pattern as PatternResult;
  }

  return null;
}

function assertValidPatternResult(patternResult: PatternResult) {
  const validation = validatePatternResult(patternResult);
  if (!validation.ok) {
    throw new PatternImportError(
      validation.issues.find((item) => item.severity === 'error')?.message ?? '图纸校验失败',
      validation.issues,
    );
  }

  return validation;
}

function createResult(params: {
  sourceType: PatternImportSourceType;
  fileName: string;
  patternResult: PatternResult;
  config?: WorkshopConfig | null;
  issues?: PatternImportIssue[];
}): PatternImportResult {
  const validation = assertValidPatternResult(params.patternResult);
  const normalizedPatternResult = reconstructPatternResult({
    width: params.patternResult.width,
    height: params.patternResult.height,
    cells: params.patternResult.cells,
  });
  const analysis = createPatternImportAnalysis({
    sourceType: params.sourceType,
    fileName: params.fileName,
    patternResult: normalizedPatternResult,
    validation,
    issues: params.issues,
  });

  return {
    patternResult: normalizedPatternResult,
    config: params.config ?? undefined,
    analysis,
    validation,
  };
}

function parseJsonPatternImport(text: string, fileName: string): PatternImportResult {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new PatternImportError('JSON 格式无法解析', [
      createIssue('error', 'invalidJson', 'JSON 格式无法解析'),
    ]);
  }

  let config: WorkshopConfig | null = null;
  if (isDodoudouPatternExportLike(payload)) {
    const version = getDodoudouPatternExportVersion(payload);
    if (version !== DODOUDOU_PATTERN_EXPORT_VERSION) {
      throw new PatternImportError('Dodoudou 图纸导出版本不受支持', [
        createIssue(
          'error',
          'unsupportedVersion',
          `Dodoudou 图纸导出版本 ${version ?? '未知'} 不受支持，当前支持版本为 ${DODOUDOU_PATTERN_EXPORT_VERSION}`,
        ),
      ]);
    }
    config = normalizeDodoudouPatternExportConfig(payload.config);
  }

  const patternResult = extractPatternResultFromJson(payload);
  if (!patternResult) {
    throw new PatternImportError('JSON 中没有找到 patternResult', [
      createIssue('error', 'invalidSchema', 'JSON 中没有找到 patternResult'),
    ]);
  }

  return createResult({
    sourceType: 'dodoudou-json',
    fileName,
    patternResult,
    config,
  });
}

function detectDelimiter(text: string) {
  const sampleLine = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? '';
  const candidates = ['\t', ',', ';'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: sampleLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char !== '\r') field += char;
  }

  row.push(field.trim());
  rows.push(row);

  return rows;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - c / 2;
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0] :
      hue < 120 ? [x, c, 0] :
        hue < 180 ? [0, c, x] :
          hue < 240 ? [0, x, c] :
            hue < 300 ? [x, 0, c] :
              [c, 0, x];

  const toHex = (channel: number) => Math.round((channel + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function getDeterministicTokenHex(token: string) {
  const hash = hashString(token);
  const hue = hash % 360;
  const saturation = 0.58 + ((hash >>> 8) % 18) / 100;
  const lightness = 0.42 + ((hash >>> 16) % 18) / 100;
  return hslToHex(hue, saturation, lightness);
}

function normalizeColorToken(token: string) {
  return token.trim().replace(/^['"]|['"]$/g, '').trim();
}

function parseBrandCodeToken(token: string, fallbackBrand: ColorSystem) {
  const match = /^([A-Za-z_]+)\s*[:：/-]\s*([A-Za-z0-9-]+)$/.exec(token);
  if (!match) return null;

  const rawBrand = match[1].toUpperCase();
  const brand = isBeadBrandKey(rawBrand) ? rawBrand : normalizeBeadBrandKey(rawBrand, fallbackBrand);
  const code = match[2].trim();
  return getColorByBrandCode(brand, code);
}

function resolveTokenColor(token: string, brand: ColorSystem) {
  const normalizedToken = normalizeColorToken(token);
  const lowerToken = normalizedToken.toLowerCase();
  const normalizedHex = normalizeImportHex(normalizedToken);

  if (normalizedHex === 'transparent' || TRANSPARENT_TOKENS.has(lowerToken) || TRANSPARENT_TOKENS.has(normalizedToken)) {
    return null;
  }

  if (/^#[0-9A-F]{6}$/.test(normalizedHex)) {
    return {
      colorId: normalizedHex,
      vendorCode: getVendorCode(normalizedHex, brand),
      hex: normalizedHex,
    };
  }

  const prefixedBrandColor = parseBrandCodeToken(normalizedToken, brand);
  if (prefixedBrandColor) {
    return {
      colorId: prefixedBrandColor.hex,
      vendorCode: prefixedBrandColor.code,
      hex: prefixedBrandColor.hex,
    };
  }

  const currentBrandColor = getColorByBrandCode(brand, normalizedToken);
  if (currentBrandColor) {
    return {
      colorId: currentBrandColor.hex,
      vendorCode: currentBrandColor.code,
      hex: currentBrandColor.hex,
    };
  }

  for (const brandKey of beadBrandKeys) {
    const brandColor = getColorByBrandCode(brandKey, normalizedToken);
    if (brandColor) {
      return {
        colorId: brandColor.hex,
        vendorCode: brandColor.code,
        hex: brandColor.hex,
      };
    }
  }

  const basicHex = BASIC_COLOR_HEX[lowerToken] ?? BASIC_COLOR_HEX[normalizedToken];
  if (basicHex) {
    return {
      colorId: basicHex,
      vendorCode: normalizedToken,
      hex: basicHex,
    };
  }

  const externalHex = getDeterministicTokenHex(normalizedToken);
  return {
    colorId: externalHex,
    vendorCode: normalizedToken,
    hex: externalHex,
  };
}

function parseCsvPatternImport(text: string, fileName: string, options: ParseStructuredImportOptions = {}): PatternImportResult {
  const brand = options.brand ?? 'MARD';
  const delimiter = detectDelimiter(text);
  const rows = parseDelimitedRows(text, delimiter)
    .map((row) => row.map(normalizeColorToken))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length === 0) {
    throw new PatternImportError('CSV/TSV 没有可导入的矩阵内容', [
      createIssue('error', 'invalidSchema', 'CSV/TSV 没有可导入的矩阵内容'),
    ]);
  }

  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const cells: PatternCell[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const token = rows[y]?.[x] ?? '';
      const resolved = resolveTokenColor(token, brand);
      if (!resolved) {
        cells.push(createTransparentPatternCell(x, y));
        continue;
      }

      cells.push({
        x,
        y,
        colorId: resolved.colorId,
        vendorCode: resolved.vendorCode,
        hex: resolved.hex,
      });
    }
  }

  const patternResult = reconstructPatternResult({ width, height, cells });
  return createResult({
    sourceType: 'csv',
    fileName,
    patternResult,
  });
}

export function parseStructuredPatternImport(
  text: string,
  fileName: string,
  options: ParseStructuredImportOptions = {},
): PatternImportResult {
  const extension = getFileExtension(fileName);
  if (extension === 'json') return parseJsonPatternImport(text, fileName);
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') return parseCsvPatternImport(text, fileName, options);

  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return parseJsonPatternImport(text, fileName);
  return parseCsvPatternImport(text, fileName, options);
}

export async function parsePatternImportFile(file: File, options: ParseStructuredImportOptions = {}) {
  const extension = getFileExtension(file.name);
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    throw new PatternImportError('图片识别会在 P2 阶段开放，当前请导入 JSON 或 CSV/TSV', [
      createIssue('error', 'unsupportedFileType', '图片识别会在 P2 阶段开放，当前请导入 JSON 或 CSV/TSV'),
    ]);
  }

  if (extension === 'pdf') {
    throw new PatternImportError('PDF 导入会在 P4 阶段开放，当前请导入 JSON 或 CSV/TSV', [
      createIssue('error', 'unsupportedFileType', 'PDF 导入会在 P4 阶段开放，当前请导入 JSON 或 CSV/TSV'),
    ]);
  }

  if (!['json', 'csv', 'tsv', 'txt'].includes(extension)) {
    throw new PatternImportError('当前仅支持 JSON、CSV、TSV 文件', [
      createIssue('error', 'unsupportedFileType', '当前仅支持 JSON、CSV、TSV 文件'),
    ]);
  }

  return parseStructuredPatternImport(await file.text(), file.name, options);
}
