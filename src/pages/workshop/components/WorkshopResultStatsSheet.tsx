import type { PatternResult } from '../../../features/workshop/model/types';

type WorkshopResultStatsSheetProps = {
  patternResult: PatternResult;
  onClose: () => void;
};

function formatBeads(count: number) {
  return `${count.toLocaleString()} 颗`;
}

export function WorkshopResultStatsSheet({ patternResult, onClose }: WorkshopResultStatsSheetProps) {
  const gridSize = `${patternResult.width}x${patternResult.height}网格`;
  const totalBeads = patternResult.stats.totalCells.toLocaleString();
  const totalColors = patternResult.stats.colorCount;
  const paletteItems = [...patternResult.palette].sort((a, b) => b.count - a.count);

  return (
    <div className="workshop-stats-sheet__backdrop" role="presentation" onClick={onClose}>
      <section
        className="workshop-stats-sheet card-surface"
        role="dialog"
        aria-modal="true"
        aria-label="物料统计"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workshop-stats-sheet__handle" aria-hidden="true" />

        <header className="workshop-stats-sheet__header">
          <div>
            <h3>物料清单</h3>
            <p>
              {gridSize}，共 {totalColors} 种颜色，{totalBeads} 颗豆子
            </p>
          </div>
          <button type="button" className="workshop-stats-sheet__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="workshop-stats-sheet__list">
          {paletteItems.map((entry) => (
            <div key={`${entry.colorId}-${entry.vendorCode}`} className="workshop-stats-sheet__item">
              <span className="workshop-stats-sheet__swatch" style={{ backgroundColor: entry.hex }} aria-hidden="true" />
              <div className="workshop-stats-sheet__meta">
                <strong> {entry.vendorCode || '未匹配'}</strong>
             
              </div>
              <div className="workshop-stats-sheet__count">{formatBeads(entry.count)}</div>
            </div>
          ))}
        </div>

        <button type="button" className="workshop-stats-sheet__action" onClick={onClose}>
          收起
        </button>
      </section>
    </div>
  );
}
