import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { deleteWorkshopDraft } from '../../features/workshop/model/draftStore';
import { createWorkshopProject, markWorkshopProjectOpened, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternResult } from '../../features/workshop/model/types';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import { readUploadedImageFile, waitForLoadingPaint } from '../../lib/imageFile';
import { cropPatternToEffectiveBounds } from '../../lib/pattern/effectiveCrop';
import { generatePatternFromImage } from '../../lib/pattern/generator';
import { removePatternBackground } from '../../lib/pattern/remove-background';
import { LoadingOverlay } from '../../shared/ui/LoadingOverlay';
import { WorkshopPage } from './WorkshopPage';
import { GalleryPublishSheet } from './components/GalleryPublishSheet';

type WorkshopShellProps = {
  mode: 'create' | 'result';
};

function createProjectId() {
  return String(Date.now());
}

const WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX = 'dodoudou:workshop-editor-local-draft:';
const galleryPublishFlag = import.meta.env.VITE_ENABLE_GALLERY_PUBLISH;
const ENABLE_GALLERY_PUBLISH =
  galleryPublishFlag === 'true' ||
  (galleryPublishFlag === undefined && import.meta.env.DEV);

function removeLocalEditorDraft(projectId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`${WORKSHOP_EDITOR_LOCAL_DRAFT_PREFIX}${projectId}`);
}

function mirrorPatternHorizontally(pattern: PatternResult): PatternResult {
  const cells = pattern.cells
    .map((cell) => ({
      ...cell,
      x: pattern.width - 1 - cell.x,
    }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return {
    ...pattern,
    cells,
    palette: pattern.palette.map((entry) => ({ ...entry })),
    stats: { ...pattern.stats },
  };
}

export function WorkshopShell({ mode }: WorkshopShellProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const { state, actions, isHydrating } = useWorkshopFlow(projectId ?? null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void markWorkshopProjectOpened(projectId);
  }, [projectId]);

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

  const handleMirrorPattern = async () => {
    if (!state.patternResult || !projectId) return;

    const mirroredPattern = mirrorPatternHorizontally(state.patternResult);

    await deleteWorkshopDraft(projectId);
    removeLocalEditorDraft(projectId);
    await saveWorkshopProject(projectId, {
      uploadedImage: state.uploadedImage,
      cropTransform: state.cropTransform,
      config: state.config,
      patternResult: mirroredPattern,
      viewMode: 'pattern',
      kind: 'pattern',
      status: 'ready',
      beadingState: 'idle',
      beadingProgress: null,
      editorState: null,
      lastOpenedAt: new Date().toISOString(),
    });
    actions.setPatternResult(mirroredPattern);
    showBackgroundRemovalNotice('已水平镜像');
  };

  const handleUploadSelected = async (file: File) => {
    setIsUploadingImage(true);
    try {
      await waitForLoadingPaint();
      const uploadedImage = await readUploadedImageFile(file);
      const nextProjectId = createProjectId();

      await createWorkshopProject(nextProjectId, {
        title: file.name.replace(/\.[^.]+$/, '') || '未命名作品',
        uploadedImage,
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
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUploadInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await handleUploadSelected(file);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={handleUploadInputChange}
      />
      <LoadingOverlay
        open={isUploadingImage}
        title="正在上传图片"
        message="正在读取大图并创建新项目..."
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
        onMirrorPattern={handleMirrorPattern}
        onRemoveBackground={handleRemoveBackground}
        onUploadImage={() => {
          fileInputRef.current?.click();
        }}
        onReuploadImage={() => {
          fileInputRef.current?.click();
        }}
        onViewPattern={() => navigate(`/workshop/result/${projectId ?? createProjectId()}`)}
        onOpenEditor={() => navigate(`/workshop/editor/${projectId ?? createProjectId()}`)}
        onOpenFocusMode={() => {
          const nextProjectId = projectId ?? createProjectId();
          navigate(`/workshop/focus/${nextProjectId}`, { state: { returnTo: `/workshop/result/${nextProjectId}` } });
        }}
        onOpenInventory={() => navigate('/workshop/inventory')}
        onPatternResultChange={actions.setPatternResult}
        onUploadToGallery={ENABLE_GALLERY_PUBLISH ? () => setIsPublishOpen(true) : undefined}
        backgroundRemovalNotice={backgroundRemovalNotice}
      />
      <GalleryPublishSheet
        open={ENABLE_GALLERY_PUBLISH && isPublishOpen && mode === 'result'}
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
