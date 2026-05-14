import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { saveWorkshopProject } from '../../features/workshop/model/projectStore';
import { WorkshopPage } from './WorkshopPage';
import type { PatternResult, WorkshopFlowState } from '../../features/workshop/model/types';
import type { CropTransform } from '../../features/workshop/model/types';

type WorkshopHomePageProps = {
  flowState: WorkshopFlowState;
  projectId: string | null;
  isHydrating: boolean;
  onUploadImage: () => void;
  onConfigChange: (patch: Partial<WorkshopFlowState['config']>) => void;
  onCropTransformChange: (transform: CropTransform | ((current: CropTransform) => CropTransform)) => void;
  onGeneratePattern: () => void;
  onSwitchViewMode: (mode: WorkshopFlowState['viewMode']) => void;
};

function createProjectId() {
  return String(Date.now());
}

function readPatternResult(value: unknown): PatternResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PatternResult> & { patternResult?: unknown };
  if (candidate.patternResult) return readPatternResult(candidate.patternResult);
  if (
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    Array.isArray(candidate.cells) &&
    Array.isArray(candidate.palette) &&
    candidate.stats &&
    typeof candidate.stats.totalCells === 'number' &&
    typeof candidate.stats.colorCount === 'number'
  ) {
    return candidate as PatternResult;
  }
  return null;
}

export function WorkshopHomePage({
  flowState,
  projectId,
  isHydrating,
  onUploadImage,
  onConfigChange,
  onCropTransformChange,
  onGeneratePattern,
  onSwitchViewMode,
}: WorkshopHomePageProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const patternInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadImage = async () => {
    console.debug('[workshop] home upload trigger', { hasInput: Boolean(fileInputRef.current) });
    fileInputRef.current?.click();
  };

  const handleCreateCanvas = () => {
    navigate(`/workshop/editor/${createProjectId()}`);
  };

  const handleImportPattern = () => {
    patternInputRef.current?.click();
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

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });

          const nextProjectId = projectId ?? createProjectId();
          const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const previewImage = new Image();
            previewImage.onload = () => resolve({ width: previewImage.naturalWidth || previewImage.width, height: previewImage.naturalHeight || previewImage.height });
            previewImage.onerror = () => reject(new Error('图片加载失败'));
            previewImage.src = dataUrl;
          });

          await saveWorkshopProject(nextProjectId, {
            uploadedImage: {
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl,
              ...imageSize,
            },
            cropTransform: defaultCropTransform,
            config: flowState.config,
            patternResult: null,
            viewMode: 'image',
            beadingState: 'idle',
            sourceType: 'upload',
            sourceItemId: null,
          });

          await onUploadImage();
          navigate(`/workshop/create/${nextProjectId}`);
        }}
      />
      <input
        ref={patternInputRef}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;

          const raw = await file.text();
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return;
          }
          const patternResult = readPatternResult(parsed);
          if (!patternResult) return;

          const nextProjectId = createProjectId();
          await saveWorkshopProject(nextProjectId, {
            title: file.name.replace(/\.[^.]+$/, '') || '导入图纸',
            uploadedImage: null,
            cropTransform: defaultCropTransform,
            config: defaultWorkshopConfig,
            patternResult,
            viewMode: 'pattern',
            kind: 'pattern',
            status: 'ready',
            beadingState: 'idle',
            sourceType: 'upload',
            sourceItemId: null,
            lastOpenedAt: new Date().toISOString(),
          });

          navigate(`/workshop/result/${nextProjectId}`);
        }}
      />
      <WorkshopPage
        flowState={flowState}
        projectId={projectId}
        mode="create"
        isHydrating={isHydrating}
        isHome
        onConfigChange={onConfigChange}
        onCropTransformChange={onCropTransformChange}
        onGeneratePattern={onGeneratePattern}
        onSwitchViewMode={onSwitchViewMode}
        onBackToOriginal={() => navigate('/workshop')}
        onRegenerate={onGeneratePattern}
        onAutoCropPattern={() => {}}
        onRemoveBackground={() => {}}
        onUploadImage={handleUploadImage}
        onReuploadImage={handleUploadImage}
        onViewPattern={() => {}}
        onCreateCanvas={handleCreateCanvas}
        onImportPattern={handleImportPattern}
      />
    </>
  );
}
