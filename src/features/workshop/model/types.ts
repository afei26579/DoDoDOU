import type { BeadBrandKey } from '../../../lib/pattern/brand';

export type ColorSystem = BeadBrandKey;

export type WorkshopStyle = '写实' | '动漫' | '极简';
export type PatternAlgorithm = 'legacy' | 'perceptual-p0';

export type UploadedImage = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  width?: number;
  height?: number;
};

export type CropTransform = {
  scale: number;
  x: number;
  y: number;
  rotate?: number;
  frameSize?: number;
};

export type WorkshopConfig = {
  canvasSize: number;
  brand: ColorSystem;
  style: WorkshopStyle;
  colorMergeThreshold: number;
  algorithm?: PatternAlgorithm;
};

export type PatternCell = {
  x: number;
  y: number;
  colorId: string;
  vendorCode: string;
  hex: string;
  isExternal?: boolean;
};

export type PatternPaletteEntry = {
  colorId: string;
  vendorCode: string;
  hex: string;
  count: number;
};

export type PatternResult = {
  width: number;
  height: number;
  cells: PatternCell[];
  palette: PatternPaletteEntry[];
  stats: {
    totalCells: number;
    colorCount: number;
  };
};

export type WorkshopViewMode = 'image' | 'pattern';
export type WorkshopBeadingState = 'idle' | 'progressing' | 'completed';

export type WorkshopBoardLayout = {
  boardWidth: number;
  boardHeight: number;
  patternOffsetX: number;
  patternOffsetY: number;
};

export type WorkshopBeadingStrategy = 'smart' | 'nearest' | 'largest';
export type WorkshopBeadingHorizontalDirection = 'smart' | 'left-to-right' | 'right-to-left';
export type WorkshopBeadingVerticalDirection = 'smart' | 'top-to-bottom' | 'bottom-to-top';

export type WorkshopEditorState = {
  grid: string[][];
  history: string[][][];
  historyIndex: number;
};

export type WorkshopBeadingProgress = {
  activeColorKey: string | null;
  activeCellKey: string | null;
  completedColorKeys: string[];
  completedCellKeys: string[];
  percent: number;
  mode: string;
  handedness: 'left' | 'right';
  connectivity?: '4' | '8' | 'smart';
  axis?: 'row' | 'column';
  focusGridSize?: 10 | 20 | 25 | 30;
  boardLayout?: WorkshopBoardLayout;
  beadingStrategy?: WorkshopBeadingStrategy;
  horizontalDirection?: WorkshopBeadingHorizontalDirection;
  verticalDirection?: WorkshopBeadingVerticalDirection;
  updatedAt: string;
};

export type WorkshopFlowState = {
  uploadedImage: UploadedImage | null;
  cropTransform: CropTransform;
  config: WorkshopConfig;
  patternResult: PatternResult | null;
  viewMode: WorkshopViewMode;
  beadingState: WorkshopBeadingState;
  beadingProgress: WorkshopBeadingProgress | null;
  isGenerating: boolean;
};
