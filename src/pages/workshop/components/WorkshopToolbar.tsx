type WorkshopToolbarProps = {
  mode: 'create' | 'result';
  hasImage: boolean;
  patternResultExists: boolean;
  isGenerating: boolean;
  onCropZoomIn: () => void;
  onCropZoomOut: () => void;
  onCropReset: () => void;
  onViewPattern: () => void;
  onBackToOriginal: () => void;
  onRegenerate: () => void;
  onRemoveBackground: () => void;
};

export function WorkshopToolbar({
  mode,
  hasImage,
  patternResultExists,
  isGenerating,
  onCropZoomIn,
  onCropZoomOut,
  onCropReset,
  onViewPattern,
  onBackToOriginal,
  onRegenerate,
  onRemoveBackground,
}: WorkshopToolbarProps) {
  if (!hasImage) return null;

  return (
    <div className="workshop-canvas__toolbar">
      {mode === 'create' ? (
        <>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="放大" onClick={onCropZoomIn} disabled={isGenerating}>＋</button>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="缩小" onClick={onCropZoomOut} disabled={isGenerating}>－</button>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="重置" onClick={onCropReset} disabled={isGenerating}>⟲</button>
          {patternResultExists ? <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="查看图纸" onClick={onViewPattern} disabled={isGenerating}>▣</button> : null}
        </>
      ) : (
        <>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="返回原图" onClick={onBackToOriginal} disabled={isGenerating}>◀</button>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="重新生成" onClick={onRegenerate} disabled={isGenerating}>↻</button>
          <button type="button" className="workshop-canvas__tool workshop-canvas__tool--icon" aria-label="去背景" onClick={onRemoveBackground} disabled={isGenerating}>⌗</button>
        </>
      )}
    </div>
  );
}
