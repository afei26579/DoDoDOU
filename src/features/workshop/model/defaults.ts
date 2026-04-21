import type { CropTransform, WorkshopConfig, WorkshopFlowState } from './types';

export const defaultCropTransform: CropTransform = {
  scale: 1,
  x: 0,
  y: 0,
  rotate: 0,
};

export const defaultWorkshopConfig: WorkshopConfig = {
  canvasSize: 100,
  brand: 'MARD',
  style: '动漫',
  colorMergeThreshold: 30,
};

export const defaultWorkshopFlowState: WorkshopFlowState = {
  uploadedImage: null,
  cropTransform: defaultCropTransform,
  config: defaultWorkshopConfig,
  patternResult: null,
  viewMode: 'image',
  isGenerating: false,
};
