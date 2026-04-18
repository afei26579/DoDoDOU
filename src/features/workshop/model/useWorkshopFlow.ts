import { useMemo, useState } from 'react';
import { defaultCropTransform, defaultWorkshopConfig, defaultWorkshopFlowState } from './defaults';
import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopFlowState } from './types';

export function useWorkshopFlow() {
  const [state, setState] = useState<WorkshopFlowState>(defaultWorkshopFlowState);

  const actions = useMemo(
    () => ({
      setUploadedImage(image: UploadedImage) {
        setState((current) => ({
          ...current,
          uploadedImage: image,
          cropTransform: defaultCropTransform,
          patternResult: null,
          viewMode: 'image',
        }));
      },
      setCropTransform(transform: CropTransform | ((current: CropTransform) => CropTransform)) {
        setState((current) => ({
          ...current,
          cropTransform: typeof transform === 'function' ? transform(current.cropTransform) : transform,
        }));
      },
      setConfig(patch: Partial<WorkshopConfig>) {
        setState((current) => ({
          ...current,
          config: {
            ...current.config,
            ...patch,
          },
        }));
      },
      resetConfig() {
        setState((current) => ({
          ...current,
          config: defaultWorkshopConfig,
        }));
      },
      setPatternResult(result: PatternResult | null) {
        setState((current) => ({
          ...current,
          patternResult: result,
          viewMode: result ? 'pattern' : current.viewMode,
        }));
      },
      setViewMode(mode: WorkshopFlowState['viewMode']) {
        setState((current) => ({
          ...current,
          viewMode: mode,
        }));
      },
      setGenerating(isGenerating: boolean) {
        setState((current) => ({
          ...current,
          isGenerating,
        }));
      },
    }),
    [],
  );

  return {
    state,
    actions,
  };
}
