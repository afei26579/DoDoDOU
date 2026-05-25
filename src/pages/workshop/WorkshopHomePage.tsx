import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultCropTransform } from '../../features/workshop/model/defaults';
import { saveWorkshopProject } from '../../features/workshop/model/projectStore';
import { WorkshopPage } from './WorkshopPage';
import type { WorkshopFlowState } from '../../features/workshop/model/types';
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
  const noticeTimerRef = useRef<number | null>(null);
  const [developmentNotice, setDevelopmentNotice] = useState('');

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const showDevelopmentNotice = (message = '功能开发中，暂未开放') => {
    setDevelopmentNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setDevelopmentNotice('');
      noticeTimerRef.current = null;
    }, 1800);
  };

  const handleUploadImage = async () => {
    fileInputRef.current?.click();
  };

  const handleCreateCanvas = () => {
    navigate(`/workshop/editor/${createProjectId()}`);
  };

  const handleAiInspiration = () => {
    showDevelopmentNotice('内测中');
  };

  const handleImportPattern = () => {
    showDevelopmentNotice();
  };

  const handleOpenInventory = () => {
    showDevelopmentNotice();
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
        onAiInspiration={handleAiInspiration}
        onImportPattern={handleImportPattern}
        onOpenInventory={handleOpenInventory}
      />
      <div className={`workshop-home-dev-toast ${developmentNotice ? 'workshop-home-dev-toast--show' : ''}`} role="status" aria-live="polite">
        {developmentNotice || '功能开发中，暂未开放'}
      </div>
    </>
  );
}
