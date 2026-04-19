import type { PatternResult } from '../../../features/workshop/model/types';

type WorkshopResultStatsSheetProps = {
  patternResult: PatternResult;
  onClose: () => void;
};

function formatBeads(count: number) {
  return `${count.toLocaleString()} beads`;
}

export function WorkshopResultStatsSheet({ patternResult, onClose }: WorkshopResultStatsSheetProps) {
  const totalBeads = patternResult.stats.totalCells.toLocaleString();
  const totalColors = patternResult.stats.colorCount;

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
            <h3>物料统计</h3>
            <p>
              Total: {totalColors} Colors, {totalBeads} Beads
            </p>
          </div>
          <button type="button" className="workshop-stats-sheet__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="workshop-stats-sheet__list">
          {patternResult.palette.map((entry) => (
            <div key={`${entry.colorId}-${entry.vendorCode}`} className="workshop-stats-sheet__item">
              <span className="workshop-stats-sheet__swatch" style={{ backgroundColor: entry.hex }} aria-hidden="true" />
              <div className="workshop-stats-sheet__meta">
                <strong>{entry.colorId}</strong>
                <span>{entry.vendorCode}</span>
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
