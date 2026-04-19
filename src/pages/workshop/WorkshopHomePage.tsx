import { useNavigate } from 'react-router-dom';
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

  return (
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
      onRemoveBackground={() => {}}
      onUploadImage={onUploadImage}
      onViewPattern={() => {}}
    />
  );
}
