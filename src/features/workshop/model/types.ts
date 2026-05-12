export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

export type WorkshopStyle = '写实' | '动漫' | '极简';

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
};

export type WorkshopConfig = {
  canvasSize: number;
  brand: ColorSystem;
  style: WorkshopStyle;
  colorMergeThreshold: number;
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
export type WorkshopPaperState = 'draft' | 'completed';
export type WorkshopBeadingState = 'idle' | 'progressing' | 'completed';

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
  updatedAt: string;
};

export type WorkshopFlowState = {
  uploadedImage: UploadedImage | null;
  cropTransform: CropTransform;
  config: WorkshopConfig;
  patternResult: PatternResult | null;
  viewMode: WorkshopViewMode;
  paperState: WorkshopPaperState;
  beadingState: WorkshopBeadingState;
  beadingProgress: WorkshopBeadingProgress | null;
  isGenerating: boolean;
};
