type WorkshopHomeToolbarProps = {
  isGenerating: boolean;
  onImportDrawingImage: () => void;
  onCreateCanvas: () => void;
  onImportPattern: () => void;
  onOpenInventory: () => void;
};

export function WorkshopHomeToolbar({
  isGenerating,
  onImportDrawingImage,
  onCreateCanvas,
  onImportPattern,
  onOpenInventory,
}: WorkshopHomeToolbarProps) {
  return (
    <section className="workshop-home-entry" aria-label="创作入口">
      <div className="workshop-home-entry__cards">
        <button
          type="button"
          className="workshop-home-entry-card workshop-home-entry-card--drawing"
          onClick={onImportDrawingImage}
          disabled={isGenerating}
        >
          <span className="workshop-home-entry-card__icon" aria-hidden="true">
            <img src="/assets/system_icons/up_drawing.png" alt="" />
          </span>
          <span className="workshop-home-entry-card__copy">
            <strong>图纸导入</strong>
            <span>上传图纸识别色号</span>
          </span>
          <span className="workshop-home-entry-card__arrow" aria-hidden="true">›</span>
        </button>

        <button
          type="button"
          className="workshop-home-entry-card workshop-home-entry-card--canvas"
          onClick={onCreateCanvas}
          disabled={isGenerating}
        >
          <span className="workshop-home-entry-card__icon" aria-hidden="true">
            <img src="/assets/system_icons/blank%20_canvas.png" alt="" />
          </span>
          <span className="workshop-home-entry-card__copy">
            <strong>空白画布</strong>
           
          </span>
          <span className="workshop-home-entry-card__arrow" aria-hidden="true">›</span>
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
          <strong>数据导入</strong>
          <span>支持 JSON / MD / CSV / TSV</span>
        </span>
        <span className="workshop-home-import__arrow" aria-hidden="true">›</span>
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
