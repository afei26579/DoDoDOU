type WorkshopHomeToolbarProps = {
  isGenerating: boolean;
  onAiInspiration: () => void;
  onCreateCanvas: () => void;
  onImportPattern: () => void;
  onOpenInventory: () => void;
};

export function WorkshopHomeToolbar({
  isGenerating,
  onAiInspiration,
  onCreateCanvas,
  onImportPattern,
  onOpenInventory,
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
        className="workshop-home-import workshop-home-import--placeholder"
        onClick={onImportPattern}
        disabled={isGenerating}
      >
        <span className="workshop-home-import__icon" aria-hidden="true">⬇</span>
        <span className="workshop-home-import__copy">
          <strong>导入图纸</strong>
          <span>开发中 · 暂未开放</span>
        </span>
        <span className="workshop-home-import__arrow" aria-hidden="true">开发中</span>
      </button>

      <button
        type="button"
        className="workshop-home-import workshop-home-import--inventory workshop-home-import--placeholder"
        onClick={onOpenInventory}
        disabled={isGenerating}
      >
        <span className="workshop-home-import__icon" aria-hidden="true">▣</span>
        <span className="workshop-home-import__copy">
          <strong>我的库存</strong>
          <span>开发中 · 暂未开放</span>
        </span>
        <span className="workshop-home-import__arrow" aria-hidden="true">开发中</span>
      </button>
    </section>
  );
}
