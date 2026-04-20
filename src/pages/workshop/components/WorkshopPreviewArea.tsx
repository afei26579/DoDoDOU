import { useEffect, useRef } from 'react';
import { drawPatternPreview } from '../../../lib/pattern/preview';
import type { CropTransform, PatternResult, UploadedImage } from '../../../features/workshop/model/types';

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

function WorkshopPatternView({ patternResult }: { patternResult: PatternResult }) {
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!patternResult || !patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    canvas.width = 1200;
    canvas.height = 1200;
    drawPatternPreview({ canvas, pattern: patternResult });
  }, [patternResult]);

  return (
    <div className="workshop-canvas__panel workshop-canvas__panel--fade-in">
      <div className="workshop-canvas__pattern">
        <canvas ref={patternCanvasRef} className="workshop-canvas__pattern-canvas" />
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
