type WorkshopGenerateButtonProps = {
  mode: 'create' | 'result';
  isGenerating: boolean;
  disabled: boolean;
  onClick: () => void;
  onViewPattern?: () => void;
  onRemoveBackground?: () => void;
  onOpenEditor?: () => void;
  onRegenerate?: () => void;
  onOpenDownloadSettings?: () => void;
};

export function WorkshopGenerateButton({
  mode,
  isGenerating,
  disabled,
  onClick,
  onViewPattern,
  onRemoveBackground,
  onOpenEditor,
  onRegenerate,
  onOpenDownloadSettings,
}: WorkshopGenerateButtonProps) {
  if (mode === 'result') {
    return (
      <div className="workshop-result-actions" aria-label="图纸操作">
        <div className="workshop-result-actions__grid">
          <button type="button" className="workshop-result-actions__tile workshop-result-actions__tile--mint" onClick={onRemoveBackground} disabled={isGenerating}>
            <span className="workshop-result-actions__icon workshop-result-actions__icon--mint">✦</span>
            <span className="workshop-result-actions__label">一键去背景</span>
          </button>
          <button type="button" className="workshop-result-actions__tile workshop-result-actions__tile--lavender" onClick={onOpenDownloadSettings ?? onViewPattern} disabled={isGenerating}>
            <span className="workshop-result-actions__icon workshop-result-actions__icon--lavender">↓</span>
            <span className="workshop-result-actions__label">下载图纸</span>
          </button>
          <button type="button" className="workshop-result-actions__tile workshop-result-actions__tile--amber" onClick={onOpenEditor} disabled={isGenerating}>
            <span className="workshop-result-actions__icon workshop-result-actions__icon--amber">✎</span>
            <span className="workshop-result-actions__label">手动编辑</span>
          </button>
        </div>
        <button type="button" className="workshop-generate-button workshop-generate-button--result" onClick={onRegenerate ?? onClick} disabled={disabled}>
          {isGenerating ? '拼豆准备中...' : '立即拼豆'}
        </button>
      </div>
    );
  }

  return (
    <button className="workshop-generate-button" type="button" onClick={onClick} disabled={disabled}>
      {isGenerating ? '图纸生成中...' : '生成图纸'}
    </button>
  );
}
