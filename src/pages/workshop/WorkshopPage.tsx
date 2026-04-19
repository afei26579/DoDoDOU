import { useMemo, useState } from 'react';
import type { CropTransform, WorkshopFlowState } from '../../features/workshop/model/types';
import { WorkshopGenerateButton } from './components/WorkshopGenerateButton';
import { WorkshopHero } from './components/WorkshopHero';
import { WorkshopHomeToolbar } from './components/WorkshopHomeToolbar';
import { WorkshopParameterPanel } from './components/WorkshopParameterPanel';
import { WorkshopParameterTabs, type ParameterTagId } from './components/WorkshopParameterTabs';
import { WorkshopPreviewArea } from './components/WorkshopPreviewArea';
import { WorkshopResultStats } from './components/WorkshopResultStats';
import { WorkshopResultStatsSheet } from './components/WorkshopResultStatsSheet';
import { WorkshopToolbar } from './components/WorkshopToolbar';

type WorkshopPageProps = {
  flowState: WorkshopFlowState;
  projectId: string | null;
  mode: 'create' | 'result';
  onConfigChange: (patch: Partial<WorkshopFlowState['config']>) => void;
  onCropTransformChange: (transform: CropTransform | ((current: CropTransform) => CropTransform)) => void;
  onGeneratePattern: () => void;
  onSwitchViewMode: (mode: WorkshopFlowState['viewMode']) => void;
  onBackToOriginal: () => void;
  onRegenerate: () => void;
  onRemoveBackground: () => void;
  onUploadImage: () => void;
  isHydrating: boolean;
  onViewPattern: () => void;
  isHome: boolean;
};

export function WorkshopPage({
  flowState,
  projectId,
  mode,
  onConfigChange,
  onCropTransformChange,
  onGeneratePattern,
  onSwitchViewMode,
  onBackToOriginal,
  onRegenerate,
  onRemoveBackground,
  onUploadImage,
  isHydrating,
  onViewPattern,
  isHome,
}: WorkshopPageProps) {
  const [activeTag, setActiveTag] = useState<ParameterTagId>('size');
  const [isStatsSheetOpen, setIsStatsSheetOpen] = useState(false);
  const { uploadedImage, cropTransform, config, patternResult, isGenerating } = flowState;

  const tagLabel = useMemo(() => {
    if (activeTag === 'size') return `${config.canvasSize} × ${config.canvasSize}`;
    if (activeTag === 'brand') return config.brand;
    if (activeTag === 'style') return config.style;
    return `${config.colorMergeThreshold}`;
  }, [activeTag, config.brand, config.canvasSize, config.colorMergeThreshold, config.style]);

  return (
    <main className="workshop-page">
      <WorkshopHero projectId={projectId} />
      <WorkshopPreviewArea
        mode={mode}
        uploadedImage={uploadedImage}
        patternResult={patternResult}
        cropTransform={cropTransform}
        isHydrating={isHydrating}
        isHome={isHome}
        onPointerDown={() => {}}
        onPointerMove={() => {}}
        onPointerUp={() => {}}
        onUploadImage={onUploadImage}
      />

      <section className="workshop-toolbar-surface card-surface" aria-label="工具栏">
        {isHome ? (
          <WorkshopHomeToolbar isGenerating={isGenerating} onAiInspiration={() => {}} onCreateCanvas={() => {}} />
        ) : (
          <WorkshopToolbar
            mode={mode}
            hasImage={Boolean(uploadedImage)}
            patternResultExists={Boolean(patternResult)}
            isGenerating={isGenerating}
            onCropZoomIn={() => onCropTransformChange((current) => ({ ...current, scale: Math.min(3, +(current.scale + 0.1).toFixed(2)) }))}
            onCropZoomOut={() => onCropTransformChange((current) => ({ ...current, scale: Math.max(0.5, +(current.scale - 0.1).toFixed(2)) }))}
            onCropReset={() => onCropTransformChange({ scale: 1, x: 0, y: 0 })}
            onViewPattern={onViewPattern}
            onBackToOriginal={onBackToOriginal}
            onRegenerate={onRegenerate}
            onRemoveBackground={onRemoveBackground}
          />
        )}
      </section>

      <section className="workshop-panel card-surface" aria-label="参数设置">
        {mode === 'result' ? (
          <>
            {patternResult ? <WorkshopResultStats patternResult={patternResult} onOpenStats={() => setIsStatsSheetOpen(true)} /> : null}
            <WorkshopGenerateButton
              mode={mode}
              isGenerating={isGenerating}
              disabled={!uploadedImage || isGenerating}
              onClick={onGeneratePattern}
              onRemoveBackground={onRemoveBackground}
              onViewPattern={onViewPattern}
              onOpenEditor={() => onSwitchViewMode('image')}
              onRegenerate={onGeneratePattern}
            />
          </>
        ) : (
          <>
            <div className="section-heading-row">
              <div><h3>参数设计</h3></div>
              <span className="workshop-panel__hint">当前：{tagLabel}</span>
            </div>

            <WorkshopParameterTabs activeTag={activeTag} onChange={setActiveTag} />

            <div className="workshop-settings" aria-label="参数内容">
              <WorkshopParameterPanel activeTag={activeTag} config={config} onConfigChange={onConfigChange} />
            </div>

            <WorkshopGenerateButton mode={mode} isGenerating={isGenerating} disabled={!uploadedImage || isGenerating} onClick={onGeneratePattern} />
          </>
        )}
      </section>

      {mode === 'result' && patternResult && isStatsSheetOpen ? (
        <WorkshopResultStatsSheet patternResult={patternResult} onClose={() => setIsStatsSheetOpen(false)} />
      ) : null}
    </main>
  );
}
