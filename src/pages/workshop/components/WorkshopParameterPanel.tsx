import type { WorkshopFlowState } from '../../../features/workshop/model/types';
import type { ParameterTagId } from './WorkshopParameterTabs';

const brandOptions = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'] as const;
const styleOptions = ['写实', '动漫', '极简'] as const;
const SIZE_MIN = 24;
const SIZE_MAX = 200;
const COLOR_MERGE_MIN = 0;
const COLOR_MERGE_MAX = 50;

type WorkshopParameterPanelProps = {
  activeTag: ParameterTagId;
  config: WorkshopFlowState['config'];
  onConfigChange: (patch: Partial<WorkshopFlowState['config']>) => void;
};

export function WorkshopParameterPanel({ activeTag, config, onConfigChange }: WorkshopParameterPanelProps) {
  if (activeTag === 'size') {
    const sizeValue = Math.max(SIZE_MIN, Math.min(SIZE_MAX, config.canvasSize));

    return (
      <div className="workshop-control">
        <div className="workshop-control__range-labels" aria-hidden="true">
          <span>{SIZE_MIN}</span>
          <span>{SIZE_MAX}</span>
        </div>
        <input className="workshop-range" type="range" min={SIZE_MIN} max={SIZE_MAX} value={sizeValue} onChange={(event) => onConfigChange({ canvasSize: Number(event.target.value) })} aria-label="尺寸范围，最低 24，最高 200" />
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

  const colorMergeValue = Math.max(COLOR_MERGE_MIN, Math.min(COLOR_MERGE_MAX, config.colorMergeThreshold));

  return (
    <div className="workshop-control">
      <div className="workshop-control__range-labels" aria-hidden="true">
        <span>{COLOR_MERGE_MIN}</span>
        <span>{COLOR_MERGE_MAX}</span>
      </div>
      <input className="workshop-range" type="range" min={COLOR_MERGE_MIN} max={COLOR_MERGE_MAX} value={colorMergeValue} onChange={(event) => onConfigChange({ colorMergeThreshold: Number(event.target.value) })} aria-label="容色范围，最低 0，最高 50" />
    </div>
  );
}
