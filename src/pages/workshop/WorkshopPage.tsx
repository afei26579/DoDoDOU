import { useEffect, useMemo, useRef, useState } from 'react';
import type { CropTransform, WorkshopFlowState } from '../../features/workshop/model/types';
import { createCropCanvas } from '../../lib/pattern/crop';
import { WorkshopGenerateButton } from './components/WorkshopGenerateButton';
import { WorkshopHero } from './components/WorkshopHero';
import { WorkshopHomeToolbar } from './components/WorkshopHomeToolbar';
import { WorkshopParameterPanel } from './components/WorkshopParameterPanel';
import { WorkshopParameterTabs, type ParameterTagId } from './components/WorkshopParameterTabs';
import { WorkshopPreviewArea } from './components/WorkshopPreviewArea';
import { WorkshopResultStats } from './components/WorkshopResultStats';
import { WorkshopResultStatsSheet } from './components/WorkshopResultStatsSheet';
import { WorkshopToolbar } from './components/WorkshopToolbar';
import { DownloadSettingsModal } from './DownloadSettingsModal';

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
  onReuploadImage: () => void;
  isHydrating: boolean;
  onViewPattern: () => void;
  onOpenDownloadSettings?: () => void;
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
  onReuploadImage,
  isHydrating,
  onViewPattern,
  onOpenDownloadSettings,
  isHome,
}: WorkshopPageProps) {
  const [activeTag, setActiveTag] = useState<ParameterTagId>('size');
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    maxOffsetX: number;
    maxOffsetY: number;
  } | null>(null);
  const [isStatsSheetOpen, setIsStatsSheetOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isCropPreviewOpen, setIsCropPreviewOpen] = useState(false);
  const [cropPreviewDataUrl, setCropPreviewDataUrl] = useState<string | null>(null);
  const { uploadedImage, cropTransform, config, patternResult, isGenerating } = flowState;
  const cropPreviewImageRef = useRef<HTMLImageElement | null>(null);

  const tagLabel = useMemo(() => {
    if (activeTag === 'size') return `${config.canvasSize} × ${config.canvasSize}`;
    if (activeTag === 'brand') return config.brand;
    if (activeTag === 'style') return config.style;
    return `${config.colorMergeThreshold}`;
  }, [activeTag, config.brand, config.canvasSize, config.colorMergeThreshold, config.style]);

  useEffect(() => {
    if (!uploadedImage?.dataUrl) return;
    const image = new Image();
    image.onload = () => {
      cropPreviewImageRef.current = image;
    };
    image.src = uploadedImage.dataUrl;
  }, [uploadedImage?.dataUrl]);

  useEffect(() => {
    if (!isCropPreviewOpen || !uploadedImage) return;

    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      const previewCanvas = createCropCanvas({
        image,
        cropTransform,
        frameSize: 360,
        outputSize: 960,
      });
      setCropPreviewDataUrl(previewCanvas.toDataURL('image/png'));
    };
    image.src = uploadedImage.dataUrl;

    return () => {
      alive = false;
    };
  }, [cropTransform, isCropPreviewOpen, uploadedImage]);

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!uploadedImage || mode !== 'create') return;
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;

    const viewport = event.currentTarget;
    const frame = viewport.querySelector('.workshop-canvas__crop-frame') as HTMLElement | null;
    const image = viewport.querySelector('.workshop-canvas__image') as HTMLImageElement | null;

    if (!frame || !image) return;

    const frameRect = frame.getBoundingClientRect();
    const currentScale = cropTransform.scale || 1;
    const displayWidth = image.getBoundingClientRect().width;
    const displayHeight = image.getBoundingClientRect().height;
    const maxOffsetX = Math.max(0, (displayWidth * currentScale - frameRect.width) / 2);
    const maxOffsetY = Math.max(0, (displayHeight * currentScale - frameRect.height) / 2);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropTransform.x,
      originY: cropTransform.y,
      maxOffsetX,
      maxOffsetY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const nextX = Math.max(-dragState.maxOffsetX, Math.min(dragState.maxOffsetX, dragState.originX + deltaX));
    const nextY = Math.max(-dragState.maxOffsetY, Math.min(dragState.maxOffsetY, dragState.originY + deltaY));

    onCropTransformChange((current) => ({
      ...current,
      x: nextX,
      y: nextY,
    }));
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleOpenCropPreview = async () => {
    if (!uploadedImage?.dataUrl) return;
    if (!cropPreviewImageRef.current) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('图片加载失败'));
        image.src = uploadedImage.dataUrl;
      });
      cropPreviewImageRef.current = image;
    }

    const canvas = createCropCanvas({
      image: cropPreviewImageRef.current,
      cropTransform,
      frameSize: 1200,
      outputSize: 1200,
    });
    setCropPreviewDataUrl(canvas.toDataURL('image/png'));
    setIsCropPreviewOpen(true);
  };

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
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerUp}
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
            onCropReset={() => onCropTransformChange({ scale: 1, x: 0, y: 0, rotate: 0 })}
            onViewCropPreview={() => setIsCropPreviewOpen(true)}
            onViewPattern={onViewPattern}
            onBackToOriginal={onBackToOriginal}
            onRegenerate={onRegenerate}
            onRemoveBackground={onRemoveBackground}
            onReuploadImage={onReuploadImage}
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
              onOpenDownloadSettings={() => setIsDownloadModalOpen(true)}
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

      {isCropPreviewOpen ? (
        <div className="crop-preview-modal__backdrop" role="presentation" onClick={() => setIsCropPreviewOpen(false)}>
          <section className="crop-preview-modal" role="dialog" aria-modal="true" aria-label="裁剪后的图片预览" onClick={(event) => event.stopPropagation()}>
            <header className="crop-preview-modal__header">
              <div>
                <p>裁剪预览</p>
                <h3>查看当前裁剪后的图片</h3>
              </div>
              <button type="button" className="crop-preview-modal__close" aria-label="关闭预览" onClick={() => setIsCropPreviewOpen(false)}>
                ×
              </button>
            </header>

            <div className="crop-preview-modal__body">
              {cropPreviewDataUrl ? <img className="crop-preview-modal__image" src={cropPreviewDataUrl} alt="裁剪后的图片预览" /> : <div className="crop-preview-modal__loading">正在生成预览...</div>}
            </div>
          </section>
        </div>
      ) : null}

      <DownloadSettingsModal
        open={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        brand={config.brand}
        patternResult={patternResult}
      />
    </main>
  );
}
