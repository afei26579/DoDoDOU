import { useEffect, useMemo, useState } from 'react';
import { defaultCropTransform, defaultWorkshopConfig, defaultWorkshopFlowState } from './defaults';
import { getWorkshopProject, saveWorkshopProject, type WorkshopProjectRecord } from './projectStore';
import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopFlowState } from './types';

function toFlowState(record: WorkshopProjectRecord | null): WorkshopFlowState {
  if (!record) return defaultWorkshopFlowState;

  return {
    uploadedImage: record.uploadedImage,
    cropTransform: record.cropTransform,
    config: record.config,
    patternResult: record.patternResult,
    viewMode: record.viewMode,
    isGenerating: false,
  };
}

export function useWorkshopFlow(projectId: string | null) {
  const [state, setState] = useState<WorkshopFlowState>(defaultWorkshopFlowState);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!projectId) {
        if (alive) {
          setState(defaultWorkshopFlowState);
          setIsHydrating(false);
        }
        return;
      }

      if (alive) setIsHydrating(true);
      const record = await getWorkshopProject(projectId);
      if (!alive) return;
      setState(toFlowState(record));
      setIsHydrating(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const persist = (patch: Partial<WorkshopFlowState>) => {
    if (!projectId) return;
    void saveWorkshopProject(projectId, {
      uploadedImage: patch.uploadedImage,
      cropTransform: patch.cropTransform,
      config: patch.config,
      patternResult: patch.patternResult,
      viewMode: patch.viewMode,
    });
  };

  const actions = useMemo(
    () => ({
      replaceState(nextState: WorkshopFlowState) {
        setState(nextState);
        persist(nextState);
      },
      setUploadedImage(image: UploadedImage) {
        setState((current) => {
          const nextState = {
            ...current,
            uploadedImage: image,
            cropTransform: defaultCropTransform,
            patternResult: null,
            viewMode: 'image' as const,
          };
          persist(nextState);
          return nextState;
        });
      },
      setCropTransform(transform: CropTransform | ((current: CropTransform) => CropTransform)) {
        setState((current) => {
          const nextState = {
            ...current,
            cropTransform: typeof transform === 'function' ? transform(current.cropTransform) : transform,
          };
          persist(nextState);
          return nextState;
        });
      },
      setConfig(patch: Partial<WorkshopConfig>) {
        setState((current) => {
          const nextState = {
            ...current,
            config: {
              ...current.config,
              ...patch,
            },
          };
          persist(nextState);
          return nextState;
        });
      },
      resetConfig() {
        setState((current) => {
          const nextState = {
            ...current,
            config: defaultWorkshopConfig,
          };
          persist(nextState);
          return nextState;
        });
      },
      setPatternResult(result: PatternResult | null) {
        setState((current) => {
          const nextState = {
            ...current,
            patternResult: result,
            viewMode: result ? ('pattern' as const) : current.viewMode,
          };
          persist(nextState);
          return nextState;
        });
      },
      setViewMode(mode: WorkshopFlowState['viewMode']) {
        setState((current) => {
          const nextState = {
            ...current,
            viewMode: mode,
          };
          persist(nextState);
          return nextState;
        });
      },
      setGenerating(isGenerating: boolean) {
        setState((current) => ({
          ...current,
          isGenerating,
        }));
      },
    }),
    [projectId],
  );

  return {
    state,
    actions,
    isHydrating,
  };
}
