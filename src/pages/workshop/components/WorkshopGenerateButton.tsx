type WorkshopGenerateButtonProps = {
  isGenerating: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function WorkshopGenerateButton({ isGenerating, disabled, onClick }: WorkshopGenerateButtonProps) {
  return (
    <button className="workshop-generate-button" type="button" onClick={onClick} disabled={disabled}>
      {isGenerating ? '图纸生成中...' : '生成图纸'}
    </button>
  );
}
