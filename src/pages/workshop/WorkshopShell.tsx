import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { deleteWorkshopDraft } from '../../features/workshop/model/draftStore';
import { ensureWorkshopProject, markWorkshopProjectOpened, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import { cropPatternToEffectiveBounds } from '../../lib/pattern/effectiveCrop';
import { generatePatternFromImage } from '../../lib/pattern/generator';
import { removePatternBackground } from '../../lib/pattern/remove-background';
import { WorkshopPage } from './WorkshopPage';
import { GalleryPublishSheet } from './components/GalleryPublishSheet';

type WorkshopShellProps = {
  mode: 'create' | 'result';
};

function createProjectId() {
  return String(Date.now());
}

const WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX = 'dodoudou:workshop-editor-local-draft:';

function removeLocalEditorDraft(projectId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`${WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX}${projectId}`);
}

export function WorkshopShell({ mode }: WorkshopShellProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const { state, actions, isHydrating } = useWorkshopFlow(projectId ?? null);

  useEffect(() => {
    if (!projectId) return;
    void markWorkshopProjectOpened(projectId);
  }, [projectId]);

  useEffect(() => {
    console.debug('[WorkshopShell] current project snapshot', {
      projectId,
      beadingState: state.beadingState,
      hasPatternResult: Boolean(state.patternResult),
      viewMode: state.viewMode,
      mode,
    });
  }, [mode, projectId, state.beadingState, state.patternResult, state.viewMode]);

  const [isPublishOpen, setIsPublishOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const [backgroundRemovalNotice, setBackgroundRemovalNotice] = useState<string | null>(null);

  const showBackgroundRemovalNotice = (message: string) => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setBackgroundRemovalNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setBackgroundRemovalNotice(null);
      noticeTimerRef.current = null;
    }, 2400);
  };

  const handleGeneratePattern = async () => {
    if (!state.uploadedImage || !projectId) return;

    actions.setGenerating(true);
    try {
      const result = await generatePatternFromImage({
        imageUrl: state.uploadedImage.dataUrl,
        config: state.config,
        cropTransform: state.cropTransform,
        cropFrameSize: 1200,
      });
      actions.setPatternResult(result);
      await saveWorkshopProject(projectId, {
        uploadedImage: state.uploadedImage,
        cropTransform: state.cropTransform,
        config: state.config,
        patternResult: result,
        viewMode: 'pattern',
        beadingState: 'idle',
      });
      navigate(`/workshop/result/${projectId}`);
    } finally {
      actions.setGenerating(false);
    }
  };

  const handleAutoCropPattern = async () => {
    if (!state.patternResult || !projectId) return;

    const result = cropPatternToEffectiveBounds(state.patternResult);
    if (!result) {
      showBackgroundRemovalNotice('当前图纸没有可裁剪的有效格子');
      return;
    }

    if (!result.cropped) {
      showBackgroundRemovalNotice('图纸已经是有效尺寸');
      return;
    }

    await deleteWorkshopDraft(projectId);
    removeLocalEditorDraft(projectId);
    await saveWorkshopProject(projectId, {
      uploadedImage: state.uploadedImage,
      cropTransform: state.cropTransform,
      config: state.config,
      patternResult: result.newPatternResult,
      viewMode: 'pattern',
      kind: 'pattern',
      status: 'ready',
      beadingState: 'idle',
      beadingProgress: null,
      editorState: null,
      lastOpenedAt: new Date().toISOString(),
    });
    actions.setPatternResult(result.newPatternResult);
    showBackgroundRemovalNotice(`已裁剪为 ${result.newPatternResult.width}×${result.newPatternResult.height}`);
  };

  const handleRemoveBackground = async () => {
    if (!state.patternResult || !projectId) return;

    const result = removePatternBackground(state.patternResult);
    if (!result || result.removedCount <= 0) {
      showBackgroundRemovalNotice('未检测到可去除背景');
      return;
    }

    await deleteWorkshopDraft(projectId);
    removeLocalEditorDraft(projectId);
    await saveWorkshopProject(projectId, {
      uploadedImage: state.uploadedImage,
      cropTransform: state.cropTransform,
      config: state.config,
      patternResult: result.newPatternResult,
      viewMode: 'pattern',
      kind: 'pattern',
      status: 'ready',
      beadingState: 'idle',
      beadingProgress: null,
      editorState: null,
      lastOpenedAt: new Date().toISOString(),
    });
    actions.setPatternResult(result.newPatternResult);
    showBackgroundRemovalNotice(`完成，共去除${result.removedCount.toLocaleString()}颗`);
  };

  const handleUploadSelected = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => reject(new Error('图片加载失败'));
      image.src = dataUrl;
    });

    const nextProjectId = createProjectId();
    await ensureWorkshopProject(nextProjectId, {
      title: file.name.replace(/\.[^.]+$/, '') || '未命名作品',
      uploadedImage: {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        width: imageSize.width,
        height: imageSize.height,
      },
      cropTransform: defaultCropTransform,
      config: defaultWorkshopConfig,
      patternResult: null,
      viewMode: 'image',
      kind: 'upload',
      status: 'editing',
      beadingState: 'idle',
      sourceType: 'upload',
      sourceItemId: null,
      lastOpenedAt: new Date().toISOString(),
    });

    navigate(`/workshop/create/${nextProjectId}`);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          await handleUploadSelected(file);
        }}
      />
      <WorkshopPage
        flowState={state}
        projectId={projectId ?? null}
        mode={mode}
        isHydrating={isHydrating}
        isHome={false}
        onConfigChange={actions.setConfig}
        onCropTransformChange={actions.setCropTransform}
        onGeneratePattern={handleGeneratePattern}
        onSwitchViewMode={actions.setViewMode}
        onBackToOriginal={() => navigate(`/workshop/create/${projectId ?? createProjectId()}`)}
        onRegenerate={handleGeneratePattern}
        onAutoCropPattern={handleAutoCropPattern}
        onRemoveBackground={handleRemoveBackground}
        onUploadImage={() => {
          console.debug('[workshop] file input click requested', { projectId, hasInput: Boolean(fileInputRef.current) });
          fileInputRef.current?.click();
          window.setTimeout(() => {
            console.debug('[workshop] file input click finished', { activeElement: document.activeElement?.tagName });
          }, 0);
        }}
        onReuploadImage={() => {
          console.debug('[workshop] reupload requested', { projectId });
          fileInputRef.current?.click();
        }}
        onViewPattern={() => navigate(`/workshop/result/${projectId ?? createProjectId()}`)}
        onOpenEditor={() => navigate(`/workshop/editor/${projectId ?? createProjectId()}`)}
        onOpenFocusMode={() => navigate(`/workshop/focus/${projectId ?? createProjectId()}`)}
        onOpenInventory={() => navigate('/workshop/inventory')}
        onPatternResultChange={actions.setPatternResult}
        onUploadToGallery={() => setIsPublishOpen(true)}
        backgroundRemovalNotice={backgroundRemovalNotice}
      />
      <GalleryPublishSheet
        open={isPublishOpen && mode === 'result'}
        titleSeed={state.uploadedImage?.name?.replace(/\.[^.]+$/, '')}
        uploadedImage={state.uploadedImage}
        patternResult={state.patternResult}
        config={state.config}
        projectId={projectId ?? null}
        onClose={() => setIsPublishOpen(false)}
        onPublished={() => setIsPublishOpen(false)}
      />
    </>
  );
}
