import { useEffect } from 'react';
import type { PatternAlgorithm, WorkshopConfig } from '../../../features/workshop/model/types';
import { DEFAULT_PATTERN_ADVANCED_CONFIG, normalizePatternAdvancedConfig } from '../../../lib/pattern/advanced-config';

type WorkshopCreateSettingsSheetProps = {
  open: boolean;
  config: WorkshopConfig;
  onConfigChange: (patch: Partial<WorkshopConfig>) => void;
  onClose: () => void;
};

const algorithmOptions: Array<{ id: PatternAlgorithm; label: string }> = [
  { id: 'legacy', label: '普通模式' },
  { id: 'perceptual-p0', label: '智能模式' },
];

const advancedOptions = [
  { key: 'detailPreserve', label: '细节保留' },
  { key: 'noiseReduction', label: '降噪强度' },
  { key: 'colorSimplify', label: '颜色简化' },
  { key: 'alphaSensitivity', label: '透明边缘' },
] as const;

function AdvancedRangeControl(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const { label, value, onChange } = props;

  return (
    <label className="workshop-create-settings-sheet__range">
      <span>
        <strong>{label}</strong>
        <output>{value}</output>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </label>
  );
}

export function WorkshopCreateSettingsSheet({
  open,
  config,
  onConfigChange,
  onClose,
}: WorkshopCreateSettingsSheetProps) {
  const algorithm = config.algorithm ?? 'legacy';
  const advanced = normalizePatternAdvancedConfig(config.advanced);

  const handleAdvancedChange = (key: keyof typeof advanced, value: number) => {
    onConfigChange({
      advanced: {
        ...advanced,
        [key]: value,
      },
    });
  };

  const handleAdvancedReset = () => {
    onConfigChange({
      advanced: { ...DEFAULT_PATTERN_ADVANCED_CONFIG },
    });
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="workshop-create-settings-mask show" role="presentation" onClick={onClose}>
      <section className="workshop-create-settings-sheet show" role="dialog" aria-modal="true" aria-label="生成设置" onClick={(event) => event.stopPropagation()}>
        <div className="workshop-create-settings-sheet__handle" aria-hidden="true" />
        <div className="workshop-create-settings-sheet__head">
          <h3>生成设置</h3>
          <button type="button" className="workshop-create-settings-sheet__close" aria-label="关闭生成设置" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="workshop-create-settings-sheet__body">
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

          {algorithm === 'perceptual-p0' ? (
            <div className="workshop-create-settings-sheet__section">
              <div className="workshop-create-settings-sheet__label-row">
                <div className="workshop-create-settings-sheet__label">P0 高级设置</div>
                <button type="button" className="workshop-create-settings-sheet__text-button" onClick={handleAdvancedReset}>
                  恢复默认
                </button>
              </div>
              <div className="workshop-create-settings-sheet__ranges">
                {advancedOptions.map((option) => (
                  <AdvancedRangeControl
                    key={option.key}
                    label={option.label}
                    value={advanced[option.key]}
                    onChange={(value) => handleAdvancedChange(option.key, value)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
