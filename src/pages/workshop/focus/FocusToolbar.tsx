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

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(hex: string | undefined | null) {
  if (!hex || hex === 'transparent') return null;
  const clean = hex.replace('#', '').trim();
  const expanded = clean.length === 3
    ? clean.split('').map((part) => part + part).join('')
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function getColorTone(hex: string | undefined | null) {
  const rgb = parseHexColor(hex);
  if (!rgb) return { isDark: false, isLight: false };
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return {
    isDark: luminance < 0.22,
    isLight: luminance > 0.86,
  };
}

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
  const progress = clampProgress(colorProgress);
  const currentHex = currentColor?.hex ?? '#D8B4E2';
  const colorTone = getColorTone(currentHex);
  const swatchStyle = {
    '--swatch-color': currentHex,
    '--swatch-progress': `${progress * 360}deg`,
  } as CSSProperties;
  const flowStyle = {
    '--focus-flow-color': currentHex,
    '--focus-flow-progress': `${progress * 100}%`,
    '--focus-flow-text': colorTone.isDark ? '#ffffff' : '#4c433c',
    '--focus-flow-contrast': colorTone.isDark ? '#ffffff' : '#5d534a',
    '--focus-flow-border': colorTone.isLight ? 'rgba(93, 83, 74, 0.26)' : currentHex,
    '--focus-flow-highlight': colorTone.isDark
      ? 'rgba(255, 255, 255, 0.24)'
      : colorTone.isLight
        ? 'rgba(93, 83, 74, 0.12)'
        : 'rgba(255, 255, 255, 0.36)',
  } as CSSProperties;
  const focusToneClass = colorTone.isDark
    ? styles.colorFocusDark
    : colorTone.isLight
      ? styles.colorFocusLight
      : '';

  return (
    <>
      <section className={styles.bottomPanel} aria-label="底部工具栏">
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolButton} aria-label="上一块" onClick={onPrevious} disabled={previousDisabled}>
            <span className={styles.toolIcon} aria-hidden="true">←</span>
          </button>

          <div className={`${styles.colorFocus} ${focusToneClass}`} style={flowStyle} aria-label="当前选中色号">
            <button type="button" className={styles.colorArea} aria-label="切换色号" onClick={onOpenPalette} disabled={!hasPaletteOptions}>
              <span className={styles.toolbarSwatch} style={swatchStyle}>
                <span className={styles.toolbarSwatchCode}>{colorCode}</span>
              </span>
              <span className={styles.paletteChevron} aria-hidden="true">⌄</span>
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
