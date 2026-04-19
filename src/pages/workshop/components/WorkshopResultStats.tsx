import type { PatternResult } from '../../../features/workshop/model/types';

type WorkshopResultStatsProps = {
  patternResult: PatternResult;
};

export function WorkshopResultStats({ patternResult }: WorkshopResultStatsProps) {
  return (
    <div className="workshop-result-grid workshop-result-grid--fade-in">
      <div className="workshop-result-card">
        <div className="workshop-result-card__icon workshop-result-card__icon--color" aria-hidden="true"><span>🎨</span></div>
        <div className="workshop-result-card__body"><strong>{patternResult.stats.colorCount}种颜色</strong></div>
      </div>
      <div className="workshop-result-card">
        <div className="workshop-result-card__icon workshop-result-card__icon--beads" aria-hidden="true"><span>#</span></div>
        <div className="workshop-result-card__body"><strong>{patternResult.stats.totalCells.toLocaleString()}颗</strong></div>
      </div>
    </div>
  );
}
