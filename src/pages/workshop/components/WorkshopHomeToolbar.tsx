type WorkshopHomeToolbarProps = {
  isGenerating: boolean;
  onAiInspiration: () => void;
  onCreateCanvas: () => void;
  onImportPattern: () => void;
};

export function WorkshopHomeToolbar({
  isGenerating,
  onAiInspiration,
  onCreateCanvas,
  onImportPattern,
}: WorkshopHomeToolbarProps) {
  return (
    <section className="workshop-home-entry" aria-label="创作入口">
      <div className="workshop-home-entry__cards">
        <button
          type="button"
          className="workshop-home-entry-card workshop-home-entry-card--ai"
          onClick={onAiInspiration}
          disabled={isGenerating}
        >
          <span className="workshop-home-entry-card__icon" aria-hidden="true">✨</span>
          <span className="workshop-home-entry-card__copy">
            <strong>AI 灵感</strong>
            <span>描述你的想象</span>
          </span>
        </button>

        <button
          type="button"
          className="workshop-home-entry-card workshop-home-entry-card--canvas"
          onClick={onCreateCanvas}
          disabled={isGenerating}
        >
          <span className="workshop-home-entry-card__icon" aria-hidden="true">🎨</span>
          <span className="workshop-home-entry-card__copy">
            <strong>空白画布</strong>
            <span>自由创作</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        className="workshop-home-import"
        onClick={onImportPattern}
        disabled={isGenerating}
      >
        <span className="workshop-home-import__icon" aria-hidden="true">⬇</span>
        <span className="workshop-home-import__copy">
          <strong>导入图纸</strong>
          <span>分享码 · 文件导入</span>
        </span>
        <span className="workshop-home-import__arrow" aria-hidden="true">›</span>
      </button>
    </section>
  );
}
