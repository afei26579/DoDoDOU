import type { PatternAlgorithm, WorkshopConfig } from '../../../features/workshop/model/types';

type WorkshopCreateSettingsSheetProps = {
  open: boolean;
  config: WorkshopConfig;
  onConfigChange: (patch: Partial<WorkshopConfig>) => void;
  onClose: () => void;
};

const algorithmOptions: Array<{ id: PatternAlgorithm; label: string }> = [
  { id: 'legacy', label: '当前算法' },
  { id: 'perceptual-p0', label: 'P0 感知色彩' },
];

export function WorkshopCreateSettingsSheet({ open, config, onConfigChange, onClose }: WorkshopCreateSettingsSheetProps) {
  const algorithm = config.algorithm ?? 'legacy';

  return (
    <>
      <div className={`workshop-create-settings-mask ${open ? 'show' : ''}`} role="presentation" onClick={onClose} />
      <section className={`workshop-create-settings-sheet ${open ? 'show' : ''}`} role="dialog" aria-modal="true" aria-label="生成设置" aria-hidden={!open}>
        <div className="workshop-create-settings-sheet__head">
          <h3>生成设置</h3>
          <button type="button" className="workshop-create-settings-sheet__close" aria-label="关闭生成设置" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="workshop-create-settings-sheet__section">
          <div className="workshop-create-settings-sheet__label">算法</div>
          <div className="workshop-create-settings-sheet__segmented" role="group" aria-label="算法选择">
            {algorithmOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={algorithm === option.id ? 'is-active' : ''}
                aria-pressed={algorithm === option.id}
                onClick={() => onConfigChange({ algorithm: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
