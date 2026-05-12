import { useEffect, useMemo, useState } from 'react';
import { defaultCropTransform, defaultWorkshopConfig, defaultWorkshopFlowState } from './defaults';
import {
  ensureWorkshopProject,
  getWorkshopProject,
  saveWorkshopProject,
  type WorkshopProjectRecord,
} from './projectStore';
import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopFlowState } from './types';

const UNTITLED_PROJECT_NAME = '未命名作品';

function getProjectTitle(image: UploadedImage | null | undefined) {
  return image?.name?.replace(/\.[^.]+$/, '') || UNTITLED_PROJECT_NAME;
}

function toFlowState(record: WorkshopProjectRecord | null): WorkshopFlowState {
  if (!record) return defaultWorkshopFlowState;

  return {
    uploadedImage: record.uploadedImage,
    cropTransform: record.cropTransform,
    config: record.config,
    patternResult: record.patternResult,
    viewMode: record.viewMode,
    paperState: record.paperState,
    beadingState: record.beadingState,
    beadingProgress: record.beadingProgress,
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
      const record = await ensureWorkshopProject(projectId);
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
    const lastOpenedAt = new Date().toISOString();
    const nextPaperState = patch.paperState ?? (patch.patternResult ? 'completed' : defaultWorkshopFlowState.paperState);
    const nextBeadingState = patch.beadingState ?? (patch.patternResult ? 'idle' : defaultWorkshopFlowState.beadingState);
    const nextKind = patch.patternResult ? 'pattern' : nextPaperState === 'draft' ? 'draft' : patch.uploadedImage ? 'upload' : 'upload';
    const nextStatus = nextPaperState === 'draft' ? 'editing' : patch.patternResult ? 'ready' : patch.uploadedImage ? 'editing' : 'editing';
    void saveWorkshopProject(projectId, {
      title: patch.uploadedImage ? getProjectTitle(patch.uploadedImage) : undefined,
      uploadedImage: patch.uploadedImage,
      cropTransform: patch.cropTransform,
      config: patch.config,
      patternResult: patch.patternResult,
      viewMode: patch.viewMode,
      beadingProgress: patch.beadingProgress,
      kind: nextKind,
      status: nextStatus,
      paperState: nextPaperState,
      beadingState: nextBeadingState,
      coverUrl: patch.uploadedImage?.dataUrl,
      previewUrl: patch.patternResult ? null : patch.uploadedImage?.dataUrl,
      lastOpenedAt,
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
            paperState: 'completed' as const,
            beadingState: 'idle' as const,
            beadingProgress: null,
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
            paperState: result ? ('completed' as const) : current.paperState,
            beadingState: 'idle' as const,
            beadingProgress: null,
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
