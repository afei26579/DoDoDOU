import type { CSSProperties } from 'react';
import type { BeadingPaletteItem } from '../../../lib/pattern/beadingPlan';
import styles from './FocusModePage.module.css';

export type FocusPaletteOption = BeadingPaletteItem & {
  colorKey: string;
  totalBlocks: number;
  completedBlocks: number;
  colorProgress: number;
  active: boolean;
};

type FocusToolbarProps = {
  currentColor: BeadingPaletteItem | null;
  paletteOptions: FocusPaletteOption[];
  paletteOpen: boolean;
  blockNumber: number;
  totalBlocks: number;
  currentBlockCount: number;
  totalColorCount: number;
  remainingColorCount: number;
  colorProgress: number;
  currentBlockCompleted: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOpenPalette: () => void;
  onClosePalette: () => void;
  onSelectPaletteColor: (colorKey: string) => void;
  onCenter: () => void;
  onToggleComplete: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
};

export function FocusToolbar({
  currentColor,
  paletteOptions,
  paletteOpen,
  blockNumber,
  totalBlocks,
  currentBlockCount,
  totalColorCount,
  remainingColorCount,
  colorProgress,
  currentBlockCompleted,
  onPrevious,
  onNext,
  onOpenPalette,
  onClosePalette,
  onSelectPaletteColor,
  onCenter,
  onToggleComplete,
  previousDisabled,
  nextDisabled,
}: FocusToolbarProps) {
  const hasPaletteOptions = paletteOptions.length > 0;
  const effectivePaletteOpen = paletteOpen && hasPaletteOptions;
  const colorCode = currentColor?.vendorCode ?? '--';
  const blockText = currentColor ? `${blockNumber}/${totalBlocks} 块` : '--/-- 块';
  const currentBeadText = currentColor ? `当前 ${currentBlockCount} 颗` : '点击色卡或图纸';
  const remainingBeadText = currentColor ? `剩余 ${remainingColorCount} 颗` : '选择高亮的色系';
  const swatchStyle = {
    '--swatch-color': currentColor?.hex ?? '#D8B4E2',
    '--swatch-progress': `${Math.max(0, Math.min(1, colorProgress)) * 360}deg`,
  } as CSSProperties;

  return (
    <>
      <section className={styles.bottomPanel} aria-label="底部工具栏">
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolButton} aria-label="上一块" onClick={onPrevious} disabled={previousDisabled}>
            <span className={styles.toolIcon} aria-hidden="true">←</span>
          </button>

          <div className={styles.colorFocus} aria-label="当前选中色号">
            <button type="button" className={styles.colorArea} aria-label="切换色号" onClick={onOpenPalette} disabled={!hasPaletteOptions}>
              <span className={styles.toolbarSwatch} style={swatchStyle}>
                <span className={styles.toolbarSwatchCode}>{colorCode}</span>
              </span>
            
            </button>

            <button type="button" className={styles.infoArea} aria-label="定位当前色块" onClick={onCenter} disabled={!currentColor}>
              <span className={styles.toolbarCode}>{blockText}</span>
              <span className={styles.toolbarRecord}>{currentBeadText}</span>
              <span className={`${styles.toolbarRecord} ${styles.toolbarRecordMuted}`}>{remainingBeadText}</span>
            </button>
          </div>

          <button
            type="button"
            className={`${styles.completeIconButton} ${currentBlockCompleted ? styles.completeIconButtonDone : ''}`}
            aria-label={currentBlockCompleted ? '取消完成标记' : '标记当前块完成'}
            aria-pressed={currentBlockCompleted}
            onClick={onToggleComplete}
            disabled={!currentColor}
          >
            <span aria-hidden="true">{currentBlockCompleted ? '✓' : '○'}</span>
          </button>

          <button type="button" className={styles.primaryButton} aria-label="下一块" onClick={onNext} disabled={nextDisabled}>
            <span className={styles.toolIcon} aria-hidden="true">→</span>
          </button>
        </div>

      </section>

      <div className={`${styles.sheetMask} ${effectivePaletteOpen ? styles.show : ''}`} role="presentation" onClick={onClosePalette} />
      <section className={`${styles.paletteSheet} ${effectivePaletteOpen ? styles.show : ''}`} aria-label="色号列表" aria-hidden={!effectivePaletteOpen}>
        <div className={styles.sheetHead}>
          <div className={styles.sheetTitle}>色号列表</div>
          <button type="button" className={styles.sheetClose} aria-label="关闭色号列表" onClick={onClosePalette}>×</button>
        </div>
        <div className={styles.paletteList}>
          {paletteOptions.map((item) => {
            const done = item.totalBlocks > 0 && item.completedBlocks >= item.totalBlocks;
            const paletteSwatchStyle = {
              '--palette-color': item.hex,
              '--palette-progress': `${Math.max(0, Math.min(1, item.colorProgress)) * 360}deg`,
            } as CSSProperties;
            return (
              <button
                type="button"
                key={item.colorKey}
                className={`${styles.paletteItem} ${item.active ? styles.paletteItemActive : ''}`}
                onClick={() => onSelectPaletteColor(item.colorKey)}
              >
                <span className={styles.paletteSwatch} style={paletteSwatchStyle} />
                <span className={styles.paletteMeta}>
                  <span className={styles.paletteCode}>{item.vendorCode}</span>
                  <span className={styles.paletteCount}>{item.count}颗 · {item.completedBlocks}/{item.totalBlocks}块</span>
                </span>
                <span className={`${styles.paletteStatus} ${done ? styles.paletteStatusDone : ''}`}>
                  {done ? '完成' : '未完成'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
