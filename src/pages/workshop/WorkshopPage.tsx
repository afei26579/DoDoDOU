import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPatternPreview } from '../../lib/pattern/preview';
import type { CropTransform, WorkshopFlowState } from '../../features/workshop/model/types';

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
};

const parameterTags = [
  { id: 'size', icon: '◫', label: '尺寸' },
  { id: 'brand', icon: '◉', label: '品牌' },
  { id: 'style', icon: '✦', label: '风格' },
  { id: 'palette', icon: '◌', label: '容色' },
] as const;

const brandOptions = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'] as const;
const styleOptions = ['写实', '动漫', '极简'] as const;

type ParameterTagId = (typeof parameterTags)[number]['id'];

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
}: WorkshopPageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [activeTag, setActiveTag] = useState<ParameterTagId>('size');

  const { uploadedImage, cropTransform, config, patternResult, viewMode, isGenerating } = flowState;
  const effectiveViewMode = mode === 'result' ? 'pattern' : 'image';

  const tagLabel = useMemo(() => {
    if (activeTag === 'size') return `${config.canvasSize} × ${config.canvasSize}`;
    if (activeTag === 'brand') return config.brand;
    if (activeTag === 'style') return config.style;
    return `${config.colorMergeThreshold}`;
  }, [activeTag, config.brand, config.canvasSize, config.colorMergeThreshold, config.style]);

  useEffect(() => {
    if (!patternResult || !patternCanvasRef.current) return;
    const canvas = patternCanvasRef.current;
    canvas.width = 1200;
    canvas.height = 1200;
    drawPatternPreview({ canvas, pattern: patternResult });
  }, [patternResult]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!uploadedImage || effectiveViewMode !== 'image') return;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    dragStateRef.current = { startX: event.clientX, startY: event.clientY, originX: cropTransform.x, originY: cropTransform.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || effectiveViewMode !== 'image') return;
    const nextX = dragStateRef.current.originX + (event.clientX - dragStateRef.current.startX);
    const nextY = dragStateRef.current.originY + (event.clientY - dragStateRef.current.startY);
    onCropTransformChange((current) => ({ ...current, x: nextX, y: nextY }));
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
  };

  const renderParameterPanel = () => {
    if (activeTag === 'size') {
      return (
        <div className="workshop-control">
          <input className="workshop-range" type="range" min="24" max="160" value={config.canvasSize} onChange={(event) => onConfigChange({ canvasSize: Number(event.target.value) })} aria-label="尺寸范围" />
        </div>
      );
    }

    if (activeTag === 'brand') {
      return (
        <div className="workshop-control">
          <div className="workshop-pill-row">
            {brandOptions.map((brand) => (
              <button key={brand} className={`workshop-pill ${config.brand === brand ? 'is-active' : ''}`} type="button" onClick={() => onConfigChange({ brand })}>
                {brand}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeTag === 'style') {
      return (
        <div className="workshop-control">
          <div className="workshop-pill-row">
            {styleOptions.map((style) => (
              <button key={style} className={`workshop-pill ${config.style === style ? 'is-active' : ''}`} type="button" onClick={() => onConfigChange({ style })}>
                {style}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="workshop-control">
        <input className="workshop-range" type="range" min="1" max="100" value={config.colorMergeThreshold} onChange={(event) => onConfigChange({ colorMergeThreshold: Number(event.target.value) })} aria-label="容色范围" />
      </div>
    );
  };

  return (
    <main className="workshop-page">
      <section className="workshop-hero" aria-label="工坊引导">
        <div>
          <h2>灵感在这里碰撞成画</h2>
          {projectId ? <small>项目 ID：{projectId}</small> : null}
        </div>
        <div className="workshop-hero__avatar" aria-hidden="true">
          <span>☁</span>
        </div>
      </section>

      <section className="workshop-canvas card-surface" aria-label="画布预览">
        <div className="workshop-canvas__frame" aria-hidden="true">
          {uploadedImage ? (
            effectiveViewMode === 'pattern' && patternResult ? (
              <div className="workshop-canvas__pattern">
                <canvas ref={patternCanvasRef} className="workshop-canvas__pattern-canvas" />
                <div className="workshop-canvas__pattern-meta">
                  <span>{patternResult.width} × {patternResult.height}</span>
                  <span>{patternResult.stats.colorCount} 色</span>
                  <span>{patternResult.stats.totalCells} 颗豆豆</span>
                </div>
              </div>
            ) : (
              <div ref={viewportRef} className="workshop-canvas__viewport" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                <img ref={imageRef} className="workshop-canvas__image" src={uploadedImage.dataUrl} alt={uploadedImage.name} style={{ transform: `translate(${cropTransform.x}px, ${cropTransform.y}px) scale(${cropTransform.scale})` }} />
                <div className="workshop-canvas__crop-frame">
                  <div className="workshop-canvas__crop-grid" />
                </div>
              </div>
            )
          ) : (
            <>
              <button className="workshop-canvas__camera" type="button" aria-label="上传图片" onClick={(event) => { event.stopPropagation(); onUploadImage(); }}>
                <span className="workshop-canvas__camera-icon" aria-hidden="true">📷</span>
              </button>
              <div className="workshop-canvas__label">唤醒灵感</div>
              <div className="workshop-canvas__actions" aria-label="快捷操作">
                <button className="workshop-canvas__action" type="button" aria-label="AI 生图"><span aria-hidden="true">✦</span></button>
                <button className="workshop-canvas__action" type="button" aria-label="创建新画板"><span aria-hidden="true">◫</span></button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="workshop-panel card-surface" aria-label="参数设置">
        {mode === 'create' && uploadedImage ? (
          <div className="workshop-canvas__toolbar">
            <button type="button" className="workshop-canvas__tool" onClick={() => onCropTransformChange((current) => ({ ...current, scale: Math.min(3, +(current.scale + 0.1).toFixed(2)) }))}>放大</button>
            <button type="button" className="workshop-canvas__tool" onClick={() => onCropTransformChange((current) => ({ ...current, scale: Math.max(0.5, +(current.scale - 0.1).toFixed(2)) }))}>缩小</button>
            <button type="button" className="workshop-canvas__tool" onClick={() => onCropTransformChange({ scale: 1, x: 0, y: 0 })}>重置</button>
            {patternResult ? <button type="button" className="workshop-canvas__tool" onClick={() => onSwitchViewMode('pattern')}>查看图纸</button> : null}
          </div>
        ) : null}

        {mode === 'result' && patternResult ? (
          <div className="workshop-canvas__toolbar">
            <button type="button" className="workshop-canvas__tool" aria-label="返回原图" onClick={onBackToOriginal}>◀</button>
            <button type="button" className="workshop-canvas__tool" aria-label="重新生成" onClick={onRegenerate}>↻</button>
            <button type="button" className="workshop-canvas__tool" aria-label="去背景" onClick={onRemoveBackground}>⌗</button>
          </div>
        ) : null}

        <div className="section-heading-row">
          <div><h3>参数设计</h3></div>
          <span className="workshop-panel__hint">当前：{tagLabel}</span>
        </div>

        <div className="workshop-tags" role="tablist" aria-label="参数标签">
          {parameterTags.map((tag) => (
            <button key={tag.id} className={`workshop-tag ${activeTag === tag.id ? 'is-active' : ''}`} type="button" onClick={() => setActiveTag(tag.id)}>
              <span className="workshop-tag__icon" aria-hidden="true">{tag.icon}</span>
              <span className="workshop-tag__label">{tag.label}</span>
            </button>
          ))}
        </div>

        <div className="workshop-settings" aria-label="参数内容">{renderParameterPanel()}</div>

        {mode === 'result' && patternResult ? (
          <div className="workshop-result-grid">
            <div className="workshop-result-card">
              <div className="workshop-result-card__icon workshop-result-card__icon--color" aria-hidden="true"><span>🎨</span></div>
              <div className="workshop-result-card__body"><strong>{patternResult.stats.colorCount}种颜色</strong></div>
            </div>
            <div className="workshop-result-card">
              <div className="workshop-result-card__icon workshop-result-card__icon--beads" aria-hidden="true"><span>#</span></div>
              <div className="workshop-result-card__body"><strong>{patternResult.stats.totalCells.toLocaleString()}颗</strong></div>
            </div>
          </div>
        ) : null}

        <button className="workshop-generate-button" type="button" onClick={onGeneratePattern} disabled={!uploadedImage || isGenerating}>
          {isGenerating ? '图纸生成中...' : '生成图纸'}
        </button>
      </section>
    </main>
  );
}
