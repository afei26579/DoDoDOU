import { useEffect, useMemo, useRef, useState } from 'react';
import type { CropTransform, WorkshopFlowState } from '../../features/workshop/model/types';
import { createCropCanvas, loadImage } from '../../lib/pattern/crop';
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
  onUploadToGallery?: () => void;
  isHydrating: boolean;
  onViewPattern: () => void;
  onOpenDownloadSettings?: () => void;
  onOpenEditor?: () => void;
  onOpenFocusMode?: () => void;
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
  onUploadToGallery,
  isHydrating,
  onViewPattern,
  onOpenDownloadSettings,
  onOpenEditor,
  onOpenFocusMode,
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
  const [cropPreviewSize, setCropPreviewSize] = useState({ width: 420, height: 300 });
  const [cropPreviewPosition, setCropPreviewPosition] = useState({ x: 0, y: 0 });
  const { uploadedImage, cropTransform, config, patternResult, isGenerating } = flowState;
  const cropPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const cropPreviewDragRef = useRef<{ kind: 'move' | 'resize'; startX: number; startY: number; startWidth: number; startHeight: number; startLeft: number; startTop: number } | null>(null);

  const tagLabel = useMemo(() => {
    if (activeTag === 'size') return `${config.canvasSize} × ${config.canvasSize}`;
    if (activeTag === 'brand') return config.brand;
    if (activeTag === 'style') return config.style;
    return `${config.colorMergeThreshold}`;
  }, [activeTag, config.brand, config.canvasSize, config.colorMergeThreshold, config.style]);

  useEffect(() => {
    if (!uploadedImage?.dataUrl) return;
    let alive = true;
    loadImage(uploadedImage.dataUrl)
      .then((image) => {
        if (!alive) return;
        cropPreviewImageRef.current = image;
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [uploadedImage?.dataUrl]);

  useEffect(() => {
    if (!isCropPreviewOpen || !uploadedImage) return;

    let alive = true;
    const ensureImage = cropPreviewImageRef.current ? Promise.resolve(cropPreviewImageRef.current) : loadImage(uploadedImage.dataUrl);

    ensureImage.then((image) => {
      if (!alive) return;
      cropPreviewImageRef.current = image;
      const previewCanvas = createCropCanvas({
        image,
        cropTransform,
        frameSize: 360,
        outputSize: 360,
      });
      setCropPreviewDataUrl(previewCanvas.toDataURL('image/png'));
    });

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
      cropPreviewImageRef.current = await loadImage(uploadedImage.dataUrl);
    }
    const previewCanvas = createCropCanvas({
      image: cropPreviewImageRef.current,
      cropTransform,
      frameSize: 1200,
      outputSize: 1200,
    });
    const dataUrl = previewCanvas.toDataURL('image/png');
    setCropPreviewDataUrl(dataUrl);
    setCropPreviewSize({ width: 420, height: 300 });
    setCropPreviewPosition({ x: 0, y: 0 });
    setIsCropPreviewOpen(true);
  };

  const handleCropPreviewPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const kind = target.closest('[data-resize-handle]') ? 'resize' : 'move';
    cropPreviewDragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: cropPreviewSize.width,
      startHeight: cropPreviewSize.height,
      startLeft: cropPreviewPosition.x,
      startTop: cropPreviewPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPreviewPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = cropPreviewDragRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (drag.kind === 'move') {
      setCropPreviewPosition({
        x: drag.startLeft + deltaX,
        y: drag.startTop + deltaY,
      });
      return;
    }

    setCropPreviewSize({
      width: Math.max(280, drag.startWidth + deltaX),
      height: Math.max(220, drag.startHeight + deltaY),
    });
  };

  const handleCropPreviewPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (cropPreviewDragRef.current) {
      cropPreviewDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
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
            onViewCropPreview={handleOpenCropPreview}
            onViewPattern={onViewPattern}
            onBackToOriginal={onBackToOriginal}
            onRegenerate={onRegenerate}
            onRemoveBackground={onRemoveBackground}
            onReuploadImage={onReuploadImage}
            onUploadToGallery={onUploadToGallery}
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
              onOpenEditor={onOpenEditor}
              onRegenerate={onGeneratePattern}
              onOpenDownloadSettings={() => setIsDownloadModalOpen(true)}
              onManualEditNavigate={onOpenEditor}
              onOpenFocusMode={onOpenFocusMode}
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

            <WorkshopGenerateButton
              mode={mode}
              isGenerating={isGenerating}
              disabled={!uploadedImage || isGenerating}
              onClick={onGeneratePattern}
              onOpenEditor={onOpenEditor}
              onManualEditNavigate={onOpenEditor}
            />
          </>
        )}
      </section>

      {mode === 'result' && patternResult && isStatsSheetOpen ? (
        <WorkshopResultStatsSheet patternResult={patternResult} onClose={() => setIsStatsSheetOpen(false)} />
      ) : null}


      {isCropPreviewOpen ? (
        <div className="crop-preview-modal__backdrop" role="presentation" onClick={() => setIsCropPreviewOpen(false)}>
          <section
            className="crop-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="裁剪后的图片预览"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handleCropPreviewPointerDown}
            onPointerMove={handleCropPreviewPointerMove}
            onPointerUp={handleCropPreviewPointerUp}
            style={{
              width: cropPreviewSize.width,
              height: cropPreviewSize.height,
              transform: `translate(${cropPreviewPosition.x}px, ${cropPreviewPosition.y}px)`,
            }}
          >
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
              {cropPreviewDataUrl ? (
                <img className="crop-preview-modal__image" src={cropPreviewDataUrl} alt="裁剪后的图片预览" />
              ) : (
                <div className="crop-preview-modal__loading">正在生成预览...</div>
              )}
            </div>

            <button type="button" className="crop-preview-modal__resize-handle" data-resize-handle="true" aria-label="调整预览窗口大小" />
          </section>
        </div>
      ) : null}

      <DownloadSettingsModal
        open={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        brand={config.brand}
        patternResult={patternResult}
      />

      <style>{`
        .crop-preview-modal__backdrop {
          position: fixed;
          inset: 0;
          background: rgba(18, 16, 20, 0.42);
          backdrop-filter: blur(3px);
          display: grid;
          place-items: center;
          z-index: 40;
          padding: 16px;
        }
        .crop-preview-modal {
          position: relative;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(93, 83, 74, 0.08);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr;
          user-select: none;
          touch-action: none;
        }
        .crop-preview-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 14px 10px;
          cursor: move;
          background: linear-gradient(180deg, rgba(247, 241, 237, 0.9), rgba(255, 255, 255, 1));
        }
        .crop-preview-modal__header p {
          margin: 0 0 4px;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: var(--accent-strong);
          font-weight: 800;
          text-transform: uppercase;
        }
        .crop-preview-modal__header h3 {
          margin: 0;
          font-size: 16px;
        }
        .crop-preview-modal__close {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 12px;
          background: rgba(93, 83, 74, 0.08);
          color: var(--ink);
          font-size: 20px;
          cursor: pointer;
        }
        .crop-preview-modal__body {
          background: #f4efe9;
          padding: 12px;
          overflow: hidden;
        }
        .crop-preview-modal__image,
        .crop-preview-modal__loading {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          border-radius: 16px;
          background: #fff;
        }
        .crop-preview-modal__loading {
          display: grid;
          place-items: center;
          color: rgba(93, 83, 74, 0.65);
        }
        .crop-preview-modal__resize-handle {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 18px;
          height: 18px;
          border: 0;
          padding: 0;
          cursor: nwse-resize;
          background:
            linear-gradient(135deg, transparent 0 40%, rgba(93, 83, 74, 0.32) 40% 50%, transparent 50% 65%, rgba(93, 83, 74, 0.32) 65% 75%, transparent 75% 100%);
          border-bottom-right-radius: 16px;
        }
      `}</style>
    </main>
  );
}
