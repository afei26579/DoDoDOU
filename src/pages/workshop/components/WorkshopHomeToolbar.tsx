type WorkshopHomeToolbarProps = {
  isGenerating: boolean;
  onAiInspiration: () => void;
  onCreateCanvas: () => void;
};

export function WorkshopHomeToolbar({ isGenerating, onAiInspiration, onCreateCanvas }: WorkshopHomeToolbarProps) {
  return (
    <div className="workshop-canvas__toolbar">
      <button
        type="button"
        className="workshop-canvas__tool workshop-canvas__tool--icon"
        aria-label="AI 灵感"
        onClick={onAiInspiration}
        disabled={isGenerating}
      >
        ✦
      </button>
      <button
        type="button"
        className="workshop-canvas__tool workshop-canvas__tool--icon"
        aria-label="新建画布"
        onClick={onCreateCanvas}
        disabled={isGenerating}
      >
        ◫
      </button>
    </div>
  );
}
