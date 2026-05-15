import type { BeadingPaletteItem } from '../../../lib/pattern/beadingPlan';
import styles from './FocusModePage.module.css';

type FocusToolbarProps = {
  currentColor: BeadingPaletteItem | null;
  currentBlockCount: number;
  currentPosition: string;
  onPrevious: () => void;
  onNext: () => void;
  onCenter: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
};

export function FocusToolbar({
  currentColor,
  currentBlockCount,
  currentPosition,
  onPrevious,
  onNext,
  onCenter,
  previousDisabled,
  nextDisabled,
}: FocusToolbarProps) {
  const colorCode = currentColor?.vendorCode ?? '等待图纸';
  const colorName = currentColor ? `#${currentColor.hex.replace('#', '')}` : '图纸加载后显示';
  const countText = currentColor ? `共 ${currentColor.count} 颗 · 当前块 ${currentBlockCount} 颗` : currentPosition;

  return (
    <section className={styles.bottomPanel} aria-label="底部工具栏">
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} aria-label="上一块色号" onClick={onPrevious} disabled={previousDisabled}>
          <span className={styles.toolIcon} aria-hidden="true">←</span>
          <span className={styles.toolText}>上一块</span>
        </button>

        <button type="button" className={styles.colorFocus} aria-label="当前选中色号" onClick={onCenter} disabled={!currentColor}>
          <span className={styles.toolbarSwatch} style={{ background: currentColor?.hex ?? '#D8B4E2' }} />
          <span className={styles.toolbarCopy}>
            <span className={styles.toolbarCode}>色号 {colorCode}</span>
            <span className={styles.toolbarName}>{colorName}</span>
            <span className={styles.toolbarCount}>{countText}</span>
          </span>
        </button>

        <button type="button" className={styles.primaryButton} aria-label="下一块色号" onClick={onNext} disabled={nextDisabled}>
          <span className={styles.toolIcon} aria-hidden="true">→</span>
          <span className={styles.toolText}>下一块</span>
        </button>
      </div>
    </section>
  );
}
