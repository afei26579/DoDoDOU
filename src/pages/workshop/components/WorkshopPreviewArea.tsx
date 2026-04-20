import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPatternPreview } from '../../../lib/pattern/preview';
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
  onPointerUp: () => void;
  onUploadImage: () => void;
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
  return (
    <div className="workshop-canvas__panel workshop-canvas__panel--fade-in">
      <div className="workshop-canvas__viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <img
          className="workshop-canvas__image"
          src={uploadedImage?.dataUrl}
          alt={uploadedImage?.name ?? ''}
          style={{ transform: `translate(${cropTransform.x}px, ${cropTransform.y}px) scale(${cropTransform.scale})` }}
        />
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
    canvas.width = 1200;
    canvas.height = 1200;
    drawPatternPreview({ canvas, pattern: patternResult });
  }, [patternResult]);

  const tooltipText = useMemo(() => {
    if (!activeCell) return '';
    return activeCell.vendorCode;
  }, [activeCell]);

  const updateTooltipFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cell = getCanvasCellFromPoint(canvas, patternResult, event.clientX, event.clientY);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
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
        {activeCell && tooltipPosition ? (
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
        <div className="workshop-canvas__pattern-meta">
          <span>{patternResult.width} × {patternResult.height}</span>
          <span>{patternResult.stats.colorCount} 色</span>
          <span>{patternResult.stats.totalCells} 颗豆豆</span>
        </div>
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
      </div>
    </section>
  );
}
