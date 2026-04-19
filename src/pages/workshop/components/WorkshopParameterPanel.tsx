import type { WorkshopFlowState } from '../../../features/workshop/model/types';
import type { ParameterTagId } from './WorkshopParameterTabs';

const brandOptions = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'] as const;
const styleOptions = ['写实', '动漫', '极简'] as const;

type WorkshopParameterPanelProps = {
  activeTag: ParameterTagId;
  config: WorkshopFlowState['config'];
  onConfigChange: (patch: Partial<WorkshopFlowState['config']>) => void;
};

export function WorkshopParameterPanel({ activeTag, config, onConfigChange }: WorkshopParameterPanelProps) {
  if (activeTag === 'size') {
    return (
      <div className="workshop-control">
        <input className="workshop-range" type="range" min="24" max="160" value={config.canvasSize} onChange={(event) => onConfigChange({ canvasSize: Number(event.target.value) })} aria-label="尺寸范围" />
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

  return (
    <div className="workshop-control">
      <input className="workshop-range" type="range" min="1" max="100" value={config.colorMergeThreshold} onChange={(event) => onConfigChange({ colorMergeThreshold: Number(event.target.value) })} aria-label="容色范围" />
    </div>
  );
}
