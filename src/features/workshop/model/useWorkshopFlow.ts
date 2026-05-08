import { useEffect, useMemo, useState } from 'react';
import { defaultCropTransform, defaultWorkshopConfig, defaultWorkshopFlowState } from './defaults';
import {
  ensureWorkshopProject,
  getWorkshopProject,
  saveWorkshopProject,
  type WorkshopProjectRecord,
} from './projectStore';
import { ensureLocalProject, patchLocalProject } from '../../projects/model/localProjectStore';
import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopFlowState } from './types';

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
      if (record) {
        await ensureLocalProject({
          id: projectId,
          title: record.title,
          kind: record.kind,
          status: record.status,
          paperState: record.paperState,
          beadingState: record.beadingState,
          coverUrl: record.coverUrl ?? record.uploadedImage?.dataUrl ?? null,
          previewUrl: record.previewUrl ?? null,
          sourceImage: record.uploadedImage,
          pattern: record.patternResult
            ? {
                width: record.patternResult.width,
                height: record.patternResult.height,
                beadCount: record.patternResult.stats.totalCells,
                paletteCount: record.patternResult.stats.colorCount,
              }
            : null,
          progress: null,
          lastOpenedAt: record.lastOpenedAt,
        }).catch(() => undefined);
      }
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
    const nextKind = patch.patternResult ? 'pattern' : patch.uploadedImage ? 'draft' : undefined;
    const nextStatus = patch.patternResult ? 'ready' : patch.uploadedImage ? 'editing' : undefined;
    const nextPaperState = patch.paperState ?? (patch.patternResult ? 'completed' : undefined);
    const nextBeadingState = patch.beadingState ?? (patch.patternResult ? 'idle' : undefined);
    void Promise.all([
      saveWorkshopProject(projectId, {
        uploadedImage: patch.uploadedImage,
        cropTransform: patch.cropTransform,
        config: patch.config,
        patternResult: patch.patternResult,
        viewMode: patch.viewMode,
        kind: nextKind,
        status: nextStatus,
        paperState: nextPaperState ?? null,
        beadingState: nextBeadingState ?? null,
        lastOpenedAt,
      }),
      ensureLocalProject({
        id: projectId,
        title: patch.uploadedImage?.name?.replace(/\.[^.]+$/, '') || '未命名作品',
        kind: nextKind ?? 'upload',
        status: nextStatus ?? 'editing',
        paperState: nextPaperState ?? null,
        beadingState: nextBeadingState ?? null,
        coverUrl: patch.uploadedImage?.dataUrl ?? null,
        previewUrl: patch.patternResult ? null : patch.uploadedImage?.dataUrl ?? null,
        sourceImage: patch.uploadedImage
          ? {
              ...patch.uploadedImage,
              width: patch.uploadedImage.width ?? 0,
              height: patch.uploadedImage.height ?? 0,
            }
          : null,
        pattern: patch.patternResult
          ? {
              width: patch.patternResult.width,
              height: patch.patternResult.height,
              beadCount: patch.patternResult.stats.totalCells,
              paletteCount: patch.patternResult.stats.colorCount,
            }
          : null,
        progress: null,
        lastOpenedAt,
      }),
      patchLocalProject(projectId, {
        title: patch.uploadedImage?.name?.replace(/\.[^.]+$/, '') || undefined,
        kind: nextKind,
        status: nextStatus,
        paperState: nextPaperState,
        beadingState: nextBeadingState,
        coverUrl: patch.uploadedImage?.dataUrl ?? undefined,
        previewUrl: patch.patternResult ? null : patch.uploadedImage?.dataUrl ?? undefined,
        pattern: patch.patternResult
          ? {
              width: patch.patternResult.width,
              height: patch.patternResult.height,
              beadCount: patch.patternResult.stats.totalCells,
              paletteCount: patch.patternResult.stats.colorCount,
            }
          : undefined,
        lastOpenedAt,
      }).catch(() => null),
    ]);
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
            paperState: null,
            beadingState: null,
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
