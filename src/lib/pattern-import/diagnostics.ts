import type { PatternResult } from '../../features/workshop/model/types';
import type {
  PatternImportAnalysis,
  PatternImportIssue,
  PatternImportProjectMeta,
  PatternImportSourceType,
  PatternImportValidationReport,
} from './types';

export function createPatternImportAnalysis(params: {
  sourceType: PatternImportSourceType;
  fileName: string;
  patternResult: PatternResult;
  validation: PatternImportValidationReport;
  issues?: PatternImportIssue[];
}): PatternImportAnalysis {
  const issues = [...params.validation.issues, ...(params.issues ?? [])];

  return {
    document: {
      sourceType: params.sourceType,
      fileName: params.fileName,
      pages: [{
        pageIndex: 0,
        width: params.patternResult.width,
        height: params.patternResult.height,
      }],
    },
    selectedGrid: {
      pageIndex: 0,
      bounds: {
        x: 0,
        y: 0,
        width: params.patternResult.width,
        height: params.patternResult.height,
      },
      columns: params.patternResult.width,
      rows: params.patternResult.height,
      cellWidth: 1,
      cellHeight: 1,
      score: 1,
    },
    detectedBrand: null,
    brandConfidence: 0,
    palette: params.patternResult.palette.map((entry) => ({
      importColorKey: entry.colorId,
      rawCode: entry.vendorCode,
      rawCount: entry.count,
      swatchHex: entry.hex,
      resolvedCode: entry.vendorCode,
      resolvedHex: entry.hex,
      resolution: 'external',
      confidence: 1,
      issues: [],
    })),
    cells: params.patternResult.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      sampledHex: cell.hex === 'transparent' ? undefined : cell.hex,
      rawCodeText: cell.vendorCode || undefined,
      importColorKey: cell.colorId,
      resolvedHex: cell.hex === 'transparent' ? undefined : cell.hex,
      resolvedCode: cell.vendorCode || undefined,
      isExternal: cell.isExternal,
      confidence: 1,
      evidence: [{ type: params.sourceType === 'dodoudou-json' ? 'json' : 'csv-token', value: cell.vendorCode || cell.hex }],
    })),
    issues,
  };
}

export function createPatternImportProjectMeta(params: {
  sourceType: PatternImportSourceType;
  fileName: string;
  analysis: PatternImportAnalysis;
  validation: PatternImportValidationReport;
}): PatternImportProjectMeta {
  return {
    sourceType: params.sourceType,
    fileName: params.fileName,
    detectedBrand: params.analysis.detectedBrand,
    brandConfidence: params.analysis.brandConfidence,
    unresolvedColorCount: params.validation.unresolvedColorCount,
    lowConfidenceCellCount: params.validation.lowConfidenceCellCount,
    importedAt: new Date().toISOString(),
  };
}
