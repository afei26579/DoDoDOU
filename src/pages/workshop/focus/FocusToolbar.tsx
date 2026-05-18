import type { CSSProperties } from 'react';
import type { BeadingPaletteItem } from '../../../lib/pattern/beadingPlan';
import styles from './FocusModePage.module.css';

type FocusToolbarProps = {
  currentColor: BeadingPaletteItem | null;
  blockNumber: number;
  totalBlocks: number;
  currentBlockCount: number;
  totalColorCount: number;
  remainingColorCount: number;
  colorProgress: number;
  onPrevious: () => void;
  onNext: () => void;
  onCenter: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
};

export function FocusToolbar({
  currentColor,
  blockNumber,
  totalBlocks,
  currentBlockCount,
  totalColorCount,
  remainingColorCount,
  colorProgress,
  onPrevious,
  onNext,
  onCenter,
  previousDisabled,
  nextDisabled,
}: FocusToolbarProps) {
  const colorCode = currentColor?.vendorCode ?? '--';
  const blockText = currentColor ? `${blockNumber}/${totalBlocks} 块` : '--/-- 块';
  const stats = currentColor
    ? [
        `当前${currentBlockCount}颗`,
        `剩余${remainingColorCount}颗`,
      ]
    : ['等待图纸'];
  const swatchStyle = {
    '--swatch-color': currentColor?.hex ?? '#D8B4E2',
    '--swatch-progress': `${Math.max(0, Math.min(1, colorProgress)) * 360}deg`,
  } as CSSProperties;

  return (
    <section className={styles.bottomPanel} aria-label="底部工具栏">
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} aria-label="上一块色号" onClick={onPrevious} disabled={previousDisabled}>
          <span className={styles.toolIcon} aria-hidden="true">←</span>
          <span className={styles.toolText}>上一块</span>
        </button>

        <button type="button" className={styles.colorFocus} aria-label="当前选中色号" onClick={onCenter} disabled={!currentColor}>
          <span className={styles.toolbarSwatch} style={swatchStyle}>
            <span className={styles.toolbarSwatchCode}>{colorCode}</span>
          </span>
          <span className={styles.toolbarCopy}>
            <span className={styles.toolbarCode}>{blockText}</span>
            <span className={styles.toolbarStats}>
              {stats.map((item) => (
                <span className={styles.toolbarPill} key={item}>{item}</span>
              ))}
            </span>
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
