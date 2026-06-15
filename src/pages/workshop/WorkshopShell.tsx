import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { deleteWorkshopDraft } from '../../features/workshop/model/draftStore';
import { createWorkshopProject, markWorkshopProjectOpened, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternResult } from '../../features/workshop/model/types';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import {
  COMMON_IMAGE_FILE_ACCEPT,
  COMMON_IMAGE_FILE_LABEL,
  isCommonImageFile,
  readUploadedImageFile,
  waitForLoadingPaint,
} from '../../lib/imageFile';
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
  const latestPatternResultRef = useRef<PatternResult | null>(state.patternResult);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState<null | 'editor' | 'focus'>(null);

  useEffect(() => {
    latestPatternResultRef.current = state.patternResult;
  }, [state.patternResult]);

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

  const persistResultPattern = async (patternResult: PatternResult) => {
    if (!projectId) return;

    await deleteWorkshopDraft(projectId);
    removeLocalEditorDraft(projectId);
    await saveWorkshopProject(projectId, {
      uploadedImage: state.uploadedImage,
      cropTransform: state.cropTransform,
      config: state.config,
      patternResult,
      viewMode: 'pattern',
      kind: 'pattern',
      status: 'ready',
      beadingState: 'idle',
      beadingProgress: null,
      editorState: null,
      lastOpenedAt: new Date().toISOString(),
    });
  };

  const handlePatternResultChange = (patternResult: PatternResult) => {
    latestPatternResultRef.current = patternResult;
    actions.setPatternResult(patternResult);
    void persistResultPattern(patternResult);
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
      latestPatternResultRef.current = result;
      actions.setPatternResult(result);
      await persistResultPattern(result);
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
    latestPatternResultRef.current = result.newPatternResult;
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
    latestPatternResultRef.current = result.newPatternResult;
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
    latestPatternResultRef.current = mirroredPattern;
    actions.setPatternResult(mirroredPattern);
    showBackgroundRemovalNotice('已水平镜像');
  };

  const handleUploadSelected = async (file: File) => {
    if (!isCommonImageFile(file)) {
      showBackgroundRemovalNotice(`图纸导入仅支持 ${COMMON_IMAGE_FILE_LABEL}`);
      return;
    }

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
    } catch {
      showBackgroundRemovalNotice(`图片读取失败，请选择 ${COMMON_IMAGE_FILE_LABEL}`);
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

  const handleOpenEditor = async () => {
    const nextProjectId = projectId ?? createProjectId();
    setNavigationLoading('editor');
    await waitForLoadingPaint();
    if (projectId && latestPatternResultRef.current) {
      await persistResultPattern(latestPatternResultRef.current);
    }
    navigate(`/workshop/editor/${nextProjectId}`);
  };

  const handleOpenFocusMode = async () => {
    const nextProjectId = projectId ?? createProjectId();
    setNavigationLoading('focus');
    await waitForLoadingPaint();
    navigate(`/workshop/focus/${nextProjectId}`, { state: { returnTo: `/workshop/result/${nextProjectId}` } });
  };

  const loadingTitle = isUploadingImage
    ? '正在上传图片'
    : navigationLoading === 'editor'
      ? '正在进入编辑'
      : '正在进入拼豆';
  const loadingMessage = isUploadingImage
    ? '正在读取大图并创建新项目...'
    : navigationLoading === 'editor'
      ? '正在载入图纸编辑器，请稍候...'
      : '正在载入拼豆画布，请稍候...';

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept={COMMON_IMAGE_FILE_ACCEPT}
        onChange={handleUploadInputChange}
      />
      <LoadingOverlay
        open={isUploadingImage || Boolean(navigationLoading)}
        title={loadingTitle}
        message={loadingMessage}
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
        onOpenEditor={handleOpenEditor}
        onOpenFocusMode={handleOpenFocusMode}
        onOpenInventory={() => navigate('/workshop/inventory')}
        onPatternResultChange={handlePatternResultChange}
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
