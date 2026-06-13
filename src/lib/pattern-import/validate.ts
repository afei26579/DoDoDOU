import type { PatternCell, PatternResult } from '../../features/workshop/model/types';
import { rebuildPatternPaletteFromCells, reconstructPatternResult } from './reconstruct';
import type { PatternImportIssue, PatternImportValidationReport } from './types';

function issue(
  severity: PatternImportIssue['severity'],
  code: PatternImportIssue['code'],
  message: string,
  path?: string,
): PatternImportIssue {
  return { severity, code, message, path };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function isPatternCell(value: unknown): value is PatternCell {
  return isPlainObject(value)
    && Number.isInteger(value.x)
    && Number.isInteger(value.y)
    && typeof value.colorId === 'string'
    && typeof value.vendorCode === 'string'
    && typeof value.hex === 'string';
}

function createEmptyReport(pattern: Pick<PatternResult, 'width' | 'height'> | null, issues: PatternImportIssue[]): PatternImportValidationReport {
  return {
    ok: !issues.some((item) => item.severity === 'error'),
    width: pattern?.width ?? 0,
    height: pattern?.height ?? 0,
    totalCells: 0,
    colorCount: 0,
    emptyCellCount: 0,
    unresolvedColorCount: 0,
    lowConfidenceCellCount: 0,
    countMismatches: [],
    issues,
  };
}

export function validatePatternResult(value: unknown): PatternImportValidationReport {
  const issues: PatternImportIssue[] = [];
  if (!isPlainObject(value)) {
    return createEmptyReport(null, [
      issue('error', 'invalidSchema', '文件内容不是有效的图纸对象'),
    ]);
  }

  const width = value.width;
  const height = value.height;

  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    issues.push(issue('error', 'invalidDimensions', '图纸宽高必须是正整数'));
  }

  if (Number(width) > 1000 || Number(height) > 1000) {
    issues.push(issue('error', 'invalidDimensions', '图纸尺寸过大，当前导入上限为 1000 × 1000'));
  }

  if (!Array.isArray(value.cells)) {
    issues.push(issue('error', 'invalidSchema', '图纸缺少 cells 数组', 'cells'));
    return createEmptyReport({ width: Number(width) || 0, height: Number(height) || 0 }, issues);
  }

  const coordinateSet = new Set<string>();
  const validCells: PatternCell[] = [];
  let emptyCellCount = 0;
  let unresolvedColorCount = 0;

  value.cells.forEach((cell, index) => {
    if (!isPatternCell(cell)) {
      issues.push(issue('error', 'invalidCell', `第 ${index + 1} 个格子格式无效`, `cells.${index}`));
      return;
    }

    if (cell.x < 0 || cell.y < 0 || cell.x >= Number(width) || cell.y >= Number(height)) {
      issues.push(issue('error', 'invalidCell', `格子 (${cell.x}, ${cell.y}) 超出图纸范围`, `cells.${index}`));
      return;
    }

    const coordinateKey = `${cell.x},${cell.y}`;
    if (coordinateSet.has(coordinateKey)) {
      issues.push(issue('error', 'duplicateCell', `格子 (${cell.x}, ${cell.y}) 重复出现`, `cells.${index}`));
      return;
    }

    coordinateSet.add(coordinateKey);
    validCells.push(cell);

    if (cell.isExternal || cell.hex === 'transparent') emptyCellCount += 1;
    if (!cell.isExternal && cell.hex !== 'transparent' && (!cell.vendorCode || cell.vendorCode === '?')) {
      unresolvedColorCount += 1;
      issues.push(issue('warning', 'unresolvedColor', `格子 (${cell.x}, ${cell.y}) 缺少明确色号`, `cells.${index}.vendorCode`));
    }
  });

  if (isPositiveInteger(width) && isPositiveInteger(height)) {
    const expectedCellCount = Number(width) * Number(height);
    if (coordinateSet.size !== expectedCellCount) {
      issues.push(issue('error', 'missingCell', `图纸应有 ${expectedCellCount} 个格子，当前有效格子为 ${coordinateSet.size}`));
    }
  }

  const rebuiltPalette = rebuildPatternPaletteFromCells(validCells);
  const expectedCounts = new Map(rebuiltPalette.map((entry) => [entry.colorId, entry.count]));
  const countMismatches: PatternImportValidationReport['countMismatches'] = [];

  if (Array.isArray(value.palette)) {
    value.palette.forEach((entry, index) => {
      if (!isPlainObject(entry) || typeof entry.colorId !== 'string' || typeof entry.count !== 'number') return;
      const reconstructedCount = expectedCounts.get(entry.colorId) ?? 0;
      if (entry.count !== reconstructedCount) {
        countMismatches.push({
          importColorKey: entry.colorId,
          legendCount: entry.count,
          reconstructedCount,
        });
        issues.push(issue(
          'warning',
          'paletteMismatch',
          `色号 ${entry.colorId} 的 palette 数量为 ${entry.count}，按格子重建为 ${reconstructedCount}`,
          `palette.${index}.count`,
        ));
      }
    });
  }

  if (validCells.length > 0 && rebuiltPalette.length === 0) {
    issues.push(issue('warning', 'emptyPattern', '图纸没有可用颜色格，导入后将是一张空白图纸'));
  }

  return {
    ok: !issues.some((item) => item.severity === 'error'),
    width: Number(width) || 0,
    height: Number(height) || 0,
    totalCells: rebuiltPalette.reduce((sum, entry) => sum + entry.count, 0),
    colorCount: rebuiltPalette.length,
    emptyCellCount,
    unresolvedColorCount,
    lowConfidenceCellCount: 0,
    countMismatches,
    issues,
  };
}

export function normalizeValidatedPatternResult(patternResult: PatternResult): PatternResult {
  const report = validatePatternResult(patternResult);
  if (!report.ok) {
    throw new Error(report.issues.find((item) => item.severity === 'error')?.message ?? '图纸校验失败');
  }

  return reconstructPatternResult({
    width: patternResult.width,
    height: patternResult.height,
    cells: patternResult.cells,
  });
}
