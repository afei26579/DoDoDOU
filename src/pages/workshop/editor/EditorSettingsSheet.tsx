import styles from './EditorSettingsSheet.module.css';
import { beadBrandKeys, getBeadBrandLabel, type BeadBrandKey } from '../../../lib/pattern/brand';

export type EditorSettingsSheetProps = {
  open: boolean;
  brand: BeadBrandKey;
  cols: number;
  rows: number;
  onClose: () => void;
  onBrandChange: (brand: BeadBrandKey) => void;
  onResizeGrid: (direction: 'top' | 'bottom' | 'left' | 'right', count: string) => void;
};

export function EditorSettingsSheet({
  open,
  brand,
  cols,
  rows,
  onClose,
  onBrandChange,
  onResizeGrid,
}: EditorSettingsSheetProps) {
  if (!open) return null;

  const handleResize = (direction: 'top' | 'bottom' | 'left' | 'right', countStr: string) => {
    onResizeGrid(direction, countStr);
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="编辑设置">
        <header className={styles.header}>
          <h2 className={styles.title}>编辑设置</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="关闭设置"
          >
            ×
          </button>
        </header>

        <div className={styles.content}>
          {/* 品牌选择 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>拼豆品牌</h3>
            <div className={styles.brandGrid}>
              {beadBrandKeys.map((brandKey) => (
                <button
                  key={brandKey}
                  type="button"
                  className={`${styles.brandBtn} ${brand === brandKey ? styles.brandBtnActive : ''}`}
                  onClick={() => onBrandChange(brandKey)}
                >
                  {getBeadBrandLabel(brandKey)}
                </button>
              ))}
            </div>
          </section>

          {/* 尺寸调整 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>尺寸调整</h3>
            <div className={styles.sizeInfo}>
              当前尺寸：{cols} x {rows}
            </div>

            <div className={styles.resizeGrid}>
              {/* 顶部 */}
              <div className={styles.resizeRow}>
                <span className={styles.directionLabel}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3L12 8H9V13H7V8H4L8 3Z" fill="currentColor"/>
                  </svg>
                  上方
                </span>
                <input
                  id="resize-top"
                  type="number"
                  className={styles.input}
                  defaultValue="1"
                  min="1"
                  max="50"
                />
                <span className={styles.unit}>行</span>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => handleResize('top', (document.getElementById('resize-top') as HTMLInputElement)?.value || '1')}
                >
                  添加
                </button>
              </div>

              {/* 底部 */}
              <div className={styles.resizeRow}>
                <span className={styles.directionLabel}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13L4 8H7V3H9V8H12L8 13Z" fill="currentColor"/>
                  </svg>
                  下方
                </span>
                <input
                  id="resize-bottom"
                  type="number"
                  className={styles.input}
                  defaultValue="1"
                  min="1"
                  max="50"
                />
                <span className={styles.unit}>行</span>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => handleResize('bottom', (document.getElementById('resize-bottom') as HTMLInputElement)?.value || '1')}
                >
                  添加
                </button>
              </div>

              {/* 左侧 */}
              <div className={styles.resizeRow}>
                <span className={styles.directionLabel}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L8 4V7H13V9H8V12L3 8Z" fill="currentColor"/>
                  </svg>
                  左侧
                </span>
                <input
                  id="resize-left"
                  type="number"
                  className={styles.input}
                  defaultValue="1"
                  min="1"
                  max="50"
                />
                <span className={styles.unit}>列</span>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => handleResize('left', (document.getElementById('resize-left') as HTMLInputElement)?.value || '1')}
                >
                  添加
                </button>
              </div>

              {/* 右侧 */}
              <div className={styles.resizeRow}>
                <span className={styles.directionLabel}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13 8L8 12V9H3V7H8V4L13 8Z" fill="currentColor"/>
                  </svg>
                  右侧
                </span>
                <input
                  id="resize-right"
                  type="number"
                  className={styles.input}
                  defaultValue="1"
                  min="1"
                  max="50"
                />
                <span className={styles.unit}>列</span>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => handleResize('right', (document.getElementById('resize-right') as HTMLInputElement)?.value || '1')}
                >
                  添加
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
