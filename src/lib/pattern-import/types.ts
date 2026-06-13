import type { ColorSystem, PatternResult, WorkshopConfig } from '../../features/workshop/model/types';

export type PatternImportSourceType = 'dodoudou-json' | 'csv' | 'image' | 'pdf';

export type PatternImportIssueSeverity = 'error' | 'warning' | 'info';

export type PatternImportIssueCode =
  | 'unsupportedFileType'
  | 'unsupportedVersion'
  | 'invalidJson'
  | 'invalidSchema'
  | 'invalidDimensions'
  | 'invalidCell'
  | 'duplicateCell'
  | 'missingCell'
  | 'paletteMismatch'
  | 'emptyPattern'
  | 'unresolvedColor'
  | 'lowConfidenceCell';

export type PatternImportIssue = {
  severity: PatternImportIssueSeverity;
  code: PatternImportIssueCode;
  message: string;
  path?: string;
};

export type PatternImportDocument = {
  sourceType: PatternImportSourceType;
  fileName: string;
  pages: PatternImportPage[];
};

export type PatternImportPage = {
  pageIndex: number;
  width: number;
  height: number;
  imageData?: ImageData;
  textItems?: PatternImportTextItem[];
};

export type PatternImportTextItem = {
  text: string;
  bounds?: { x: number; y: number; width: number; height: number };
};

export type PatternImportGridCandidate = {
  pageIndex: number;
  bounds: { x: number; y: number; width: number; height: number };
  transform?: DOMMatrix;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  score: number;
};

export type PatternImportCellEvidence =
  | { type: 'json'; value: string }
  | { type: 'csv-token'; value: string }
  | { type: 'sampled-color'; value: string };

export type ImportedPaletteEntry = {
  importColorKey: string;
  symbol?: string;
  rawCode?: string;
  rawName?: string;
  rawCount?: number;
  swatchHex?: string;
  resolvedBrand?: ColorSystem;
  resolvedCode?: string;
  resolvedHex?: string;
  resolution: 'exact' | 'alias' | 'nearest' | 'external' | 'unresolved';
  confidence: number;
  issues: PatternImportIssue[];
};

export type ImportedCell = {
  x: number;
  y: number;
  sampledHex?: string;
  symbolText?: string;
  rawCodeText?: string;
  importColorKey?: string;
  resolvedHex?: string;
  resolvedCode?: string;
  isExternal?: boolean;
  confidence: number;
  evidence: PatternImportCellEvidence[];
};

export type PatternImportAnalysis = {
  document: PatternImportDocument;
  selectedGrid: PatternImportGridCandidate | null;
  detectedBrand: ColorSystem | 'external' | null;
  brandConfidence: number;
  palette: ImportedPaletteEntry[];
  cells: ImportedCell[];
  issues: PatternImportIssue[];
};

export type PatternImportValidationReport = {
  ok: boolean;
  width: number;
  height: number;
  totalCells: number;
  colorCount: number;
  emptyCellCount: number;
  unresolvedColorCount: number;
  lowConfidenceCellCount: number;
  countMismatches: Array<{
    importColorKey: string;
    legendCount: number;
    reconstructedCount: number;
  }>;
  issues: PatternImportIssue[];
};

export type PatternImportProjectMeta = {
  sourceType: PatternImportSourceType;
  fileName: string;
  detectedBrand: ColorSystem | 'external' | null;
  brandConfidence: number;
  unresolvedColorCount: number;
  lowConfidenceCellCount: number;
  importedAt: string;
};

export type PatternImportResult = {
  patternResult: PatternResult;
  config?: WorkshopConfig;
  analysis: PatternImportAnalysis;
  validation: PatternImportValidationReport;
};

export class PatternImportError extends Error {
  issues: PatternImportIssue[];

  constructor(message: string, issues: PatternImportIssue[] = []) {
    super(message);
    this.name = 'PatternImportError';
    this.issues = issues.length ? issues : [{ severity: 'error', code: 'invalidSchema', message }];
  }
}
