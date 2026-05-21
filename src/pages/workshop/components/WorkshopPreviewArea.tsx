import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPatternPreview } from '../../../lib/pattern/preview';
import { getCropOffsetForFrame } from '../../../lib/pattern/crop';
import type { CropTransform, PatternCell, PatternResult, UploadedImage } from '../../../features/workshop/model/types';

type WorkshopPreviewAreaProps = {
  mode: 'create' | 'result';
  uploadedImage: UploadedImage | null;
  patternResult: PatternResult | null;
  cropTransform: CropTransform;
  isHydrating: boolean;
  isHome: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onUploadImage: () => void;
  backgroundRemovalNotice?: string | null;
};

function WorkshopLoadingState() {
  return (
    <div className="workshop-canvas__loading-shell">
      <div className="workshop-canvas__loading">正在恢复项目数据...</div>
    </div>
  );
}

function WorkshopEmptyState({ onUploadImage }: { onUploadImage: () => void }) {
  return (
    <>
      <button className="workshop-canvas__camera" type="button" aria-label="上传图片" onClick={(event) => { event.stopPropagation(); onUploadImage(); }}>
        <span className="workshop-canvas__camera-icon" aria-hidden="true">📷</span>
      </button>
      <div className="workshop-canvas__label">唤醒灵感</div>
    </>
  );
}

function WorkshopImageView({
  cropTransform,
  uploadedImage,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Pick<WorkshopPreviewAreaProps, 'cropTransform' | 'uploadedImage' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp'>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number; frameSize: number }>({ width: 0, height: 0, frameSize: 0 });

  useEffect(() => {
    let alive = true;

    const updateBaseSize = () => {
      const viewport = viewportRef.current;
      const imageWidth = uploadedImage?.width;
      const imageHeight = uploadedImage?.height;
      if (!viewport || !imageWidth || !imageHeight) return;
      const frameRect = viewport.getBoundingClientRect();
      if (!frameRect.width || !frameRect.height) return;
      const frameSize = Math.min(frameRect.width, frameRect.height);
      const fitScale = Math.min(frameSize / imageWidth, frameSize / imageHeight);
      if (!alive) return;
      setBaseSize({
        width: imageWidth * fitScale,
        height: imageHeight * fitScale,
        frameSize,
      });
    };

    if (uploadedImage?.width && uploadedImage?.height) {
      updateBaseSize();
    } else if (uploadedImage?.dataUrl) {
      const image = new Image();
      image.onload = () => {
        if (!alive) return;
        const previewImageWidth = image.naturalWidth || image.width;
        const previewImageHeight = image.naturalHeight || image.height;
        const viewport = viewportRef.current;
        if (!viewport || !previewImageWidth || !previewImageHeight) return;
        const frameRect = viewport.getBoundingClientRect();
        if (!frameRect.width || !frameRect.height) return;
        const frameSize = Math.min(frameRect.width, frameRect.height);
        const fitScale = Math.min(frameSize / previewImageWidth, frameSize / previewImageHeight);
        setBaseSize({
          width: previewImageWidth * fitScale,
          height: previewImageHeight * fitScale,
          frameSize,
        });
      };
      image.src = uploadedImage.dataUrl;
    }

    window.addEventListener('resize', updateBaseSize);
    return () => {
      alive = false;
      window.removeEventListener('resize', updateBaseSize);
    };
  }, [uploadedImage]);

  const cropOffset = baseSize.frameSize
    ? getCropOffsetForFrame(cropTransform, baseSize.frameSize)
    : { x: cropTransform.x, y: cropTransform.y };

  const imageStyle = baseSize.width && baseSize.height
    ? {
        width: `${baseSize.width}px`,
        height: `${baseSize.height}px`,
        transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropTransform.scale})`,
      }
    : {
        transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropTransform.scale})`,
      };

  return (
    <div className="workshop-canvas__panel workshop-canvas__panel--fade-in">
      <div className="workshop-canvas__viewport-shell" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div ref={viewportRef} className="workshop-canvas__viewport">
          <img
            className="workshop-canvas__image"
            src={uploadedImage?.dataUrl}
            alt={uploadedImage?.name ?? ''}
            style={imageStyle}
          />
        </div>
        <div className="workshop-canvas__crop-frame">
          <div className="workshop-canvas__crop-grid" />
        </div>
      </div>
    </div>
  );
}

function getCanvasCellFromPoint(canvas: HTMLCanvasElement, pattern: PatternResult, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * pattern.width;
  const y = ((clientY - rect.top) / rect.height) * pattern.height;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= pattern.width || cellY >= pattern.height) return null;
  return pattern.cells.find((cell) => cell.x === cellX && cell.y === cellY) ?? null;
}

function WorkshopPatternView({ patternResult }: { patternResult: PatternResult }) {
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeCell, setActiveCell] = useState<PatternCell | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; placeBelow: boolean } | null>(null);
  const [isTooltipPinned, setIsTooltipPinned] = useState(false);

  useEffect(() => {
    if (!patternResult || !patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    const longestSide = Math.max(patternResult.width, patternResult.height, 1);
    const cellSize = Math.max(1, Math.floor(1200 / longestSide));
    canvas.width = Math.max(1, patternResult.width * cellSize);
    canvas.height = Math.max(1, patternResult.height * cellSize);
    drawPatternPreview({ canvas, pattern: patternResult });
  }, [patternResult]);

  const tooltipText = useMemo(() => {
    if (!activeCell) return '';
    return activeCell.vendorCode;
  }, [activeCell]);

  const shouldShowTooltip = Boolean(activeCell && activeCell.vendorCode.trim());

  const updateTooltipFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cell = getCanvasCellFromPoint(canvas, patternResult, event.clientX, event.clientY);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!cell || !cell.vendorCode.trim()) {
      setActiveCell(null);
      setTooltipPosition(null);
      return;
    }

    setActiveCell(cell);
    setTooltipPosition({
      x,
      y,
      placeBelow: y < 50,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    updateTooltipFromEvent(event);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    updateTooltipFromEvent(event);
    setIsTooltipPinned(event.pointerType !== 'mouse');
  };

  const handlePointerLeave = () => {
    if (!isTooltipPinned) {
      setActiveCell(null);
      setTooltipPosition(null);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse') return;
    setIsTooltipPinned(false);
  };

  return (
    <div className="workshop-canvas__panel workshop-canvas__panel--fade-in">
      <div className="workshop-canvas__pattern">
        <canvas
          ref={patternCanvasRef}
          className="workshop-canvas__pattern-canvas"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerLeave}
          onPointerUp={handlePointerUp}
        />
        {shouldShowTooltip && activeCell && tooltipPosition ? (
          <div
            className={`workshop-canvas__pattern-tooltip ${isTooltipPinned ? 'is-pinned' : ''} ${tooltipPosition.placeBelow ? 'is-below' : ''}`}
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            <span
              className="workshop-canvas__pattern-tooltip-swatch"
              aria-hidden="true"
              style={{ backgroundColor: activeCell.hex }}
            />
            <strong>{tooltipText}</strong>
          </div>
        ) : null}
       
      </div>
    </div>
  );
}

export function WorkshopPreviewArea({
  mode,
  uploadedImage,
  patternResult,
  cropTransform,
  isHydrating,
  isHome,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onUploadImage,
  backgroundRemovalNotice,
}: WorkshopPreviewAreaProps) {
  return (
    <section className="workshop-canvas card-surface" aria-label="画布预览">
      <div className="workshop-canvas__frame">
        {isHydrating ? (
          <WorkshopLoadingState />
        ) : uploadedImage ? (
          <div className="workshop-canvas__switcher workshop-canvas__switcher--fade" data-mode={mode}>
            {mode === 'result' && patternResult ? (
              <WorkshopPatternView patternResult={patternResult} />
            ) : (
              <WorkshopImageView
                uploadedImage={uploadedImage}
                cropTransform={cropTransform}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            )}
          </div>
        ) : isHome ? (
          <button className="workshop-canvas__camera workshop-canvas__camera--cta" type="button" aria-label="上传图片" onClick={(event) => { event.stopPropagation(); onUploadImage(); }}>
            <span className="workshop-canvas__camera-glow" aria-hidden="true" />
            <span className="workshop-canvas__camera-orb workshop-canvas__camera-orb--left" aria-hidden="true" />
            <span className="workshop-canvas__camera-orb workshop-canvas__camera-orb--right" aria-hidden="true" />
            <span className="workshop-canvas__camera-icon workshop-canvas__camera-icon--handdrawn" aria-hidden="true">
              <span className="workshop-canvas__camera-lens" />
              <span className="workshop-canvas__camera-flash" />
            </span>
            <span className="workshop-canvas__camera-copy">
              <span className="workshop-canvas__camera-copy-title">唤醒灵感</span>
              <span className="workshop-canvas__camera-copy-subtitle">点击上传图片，开始你的手作之旅</span>
            </span>
          </button>
        ) : (
          <WorkshopEmptyState onUploadImage={onUploadImage} />
        )}
        {mode === 'result' && backgroundRemovalNotice ? (
          <div className="workshop-canvas__center-notice" role="status" aria-live="polite">
            {backgroundRemovalNotice}
          </div>
        ) : null}
      </div>
    </section>
  );
}
