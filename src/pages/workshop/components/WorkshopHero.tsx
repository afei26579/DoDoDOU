import type { PatternAlgorithm } from '../../../features/workshop/model/types';

type WorkshopHeroProps = {
  projectId: string | null;
  mode?: 'create' | 'result';
  algorithm?: PatternAlgorithm;
  onOpenSettings?: () => void;
};

function getAlgorithmLabel(algorithm: PatternAlgorithm | undefined) {
  return algorithm === 'perceptual-p0' ? 'P0' : '当前';
}

export function WorkshopHero({ projectId, mode = 'create', algorithm = 'legacy', onOpenSettings }: WorkshopHeroProps) {
  return (
    <section className="page-hero" aria-label="工坊引导">
      <h2>灵感在这里碰撞成画</h2>
      {onOpenSettings ? (
        <button type="button" className="workshop-create-settings-button" aria-label="打开生成设置" title="设置" onClick={onOpenSettings}>
          <span className="workshop-create-settings-button__badge">{getAlgorithmLabel(algorithm)}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65-2-3.46-2.49 1a7.62 7.62 0 0 0-1.69-.98L15 3.25h-4l-.36 2.68c-.6.24-1.16.57-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65 2 3.46 2.49-1c.52.41 1.09.74 1.69.98L11 20.75h4l.36-2.68c.6-.24 1.16-.57 1.69-.98l2.49 1 2-3.46-2.11-1.65Z" />
          </svg>
        </button>
      ) : null}
    </section>
  );
}
