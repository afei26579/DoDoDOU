import { useEffect, useState } from 'react';
import styles from './EditorSettingsSheet.module.css';
import { beadBrandKeys, getBeadBrandLabel, type BeadBrandKey } from '../../../lib/pattern/brand';
import type { EditorBackgroundMode, EditorBeadShape } from './WorkshopEditor.utils';

export type EditorSettingsSheetProps = {
  open: boolean;
  brand: BeadBrandKey;
  cols: number;
  rows: number;
  minCols: number;
  minRows: number;
  maxCols: number;
  maxRows: number;
  showDividers: boolean;
  showColorCodes: boolean;
  beadShape: EditorBeadShape;
  backgroundMode: EditorBackgroundMode;
  onClose: () => void;
  onBrandChange: (brand: BeadBrandKey) => void;
  onResizeCanvas: (cols: number, rows: number) => void;
  onShowDividersChange: (showDividers: boolean) => void;
  onShowColorCodesChange: (showColorCodes: boolean) => void;
  onBeadShapeChange: (beadShape: EditorBeadShape) => void;
  onBackgroundModeChange: (backgroundMode: EditorBackgroundMode) => void;
};

export function EditorSettingsSheet({
  open,
  brand,
  cols,
  rows,
  minCols,
  minRows,
  maxCols,
  maxRows,
  showDividers,
  showColorCodes,
  beadShape,
  backgroundMode,
  onClose,
  onBrandChange,
  onResizeCanvas,
  onShowDividersChange,
  onShowColorCodesChange,
  onBeadShapeChange,
  onBackgroundModeChange,
}: EditorSettingsSheetProps) {
  const [draftCols, setDraftCols] = useState(String(cols));
  const [draftRows, setDraftRows] = useState(String(rows));

  useEffect(() => {
    if (!open) return;
    setDraftCols(String(cols));
    setDraftRows(String(rows));
  }, [cols, open, rows]);

  if (!open) return null;

  const applyCanvasSize = () => {
    const nextCols = Number.parseInt(draftCols, 10);
    const nextRows = Number.parseInt(draftRows, 10);

    if (!Number.isFinite(nextCols) || !Number.isFinite(nextRows)) {
      setDraftCols(String(cols));
      setDraftRows(String(rows));
      return;
    }

    setDraftCols(String(Math.min(maxCols, Math.max(minCols, Math.floor(nextCols)))));
    setDraftRows(String(Math.min(maxRows, Math.max(minRows, Math.floor(nextRows)))));
    onResizeCanvas(nextCols, nextRows);
  };

  const handleSizeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.currentTarget.blur();
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
            x
          </button>
        </header>

        <div className={styles.content}>
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

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>画布尺寸</h3>
            <div className={styles.sizeEditor}>
              <label className={styles.sizeField}>
                <span>宽</span>
                <input
                  type="number"
                  className={styles.sizeInput}
                  value={draftCols}
                  min={minCols}
                  max={maxCols}
                  inputMode="numeric"
                  aria-label="画布宽度"
                  onChange={(event) => setDraftCols(event.target.value)}
                  onBlur={applyCanvasSize}
                  onKeyDown={handleSizeKeyDown}
                />
              </label>
              <span className={styles.sizeSeparator}>x</span>
              <label className={styles.sizeField}>
                <span>高</span>
                <input
                  type="number"
                  className={styles.sizeInput}
                  value={draftRows}
                  min={minRows}
                  max={maxRows}
                  inputMode="numeric"
                  aria-label="画布高度"
                  onChange={(event) => setDraftRows(event.target.value)}
                  onBlur={applyCanvasSize}
                  onKeyDown={handleSizeKeyDown}
                />
              </label>
            </div>
           
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>豆子设置</h3>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionBtn} ${beadShape === 'square' ? styles.optionBtnActive : ''}`}
                onClick={() => onBeadShapeChange('square')}
              >
                方形
              </button>
              <button
                type="button"
                className={`${styles.optionBtn} ${beadShape === 'circle' ? styles.optionBtnActive : ''}`}
                onClick={() => onBeadShapeChange('circle')}
              >
                圆形
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>背景设置</h3>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionBtn} ${backgroundMode === 'checker' ? styles.optionBtnActive : ''}`}
                onClick={() => onBackgroundModeChange('checker')}
              >
                棋盘格
              </button>
              <button
                type="button"
                className={`${styles.optionBtn} ${backgroundMode === 'white' ? styles.optionBtnActive : ''}`}
                onClick={() => onBackgroundModeChange('white')}
              >
                纯白色
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>辅助显示</h3>
            <div className={styles.switchList}>
              <div className={styles.switchRow}>
                <span className={styles.switchLabel}>显示分割线</span>
                <button
                  type="button"
                  className={`${styles.switchBtn} ${showDividers ? styles.switchBtnOn : ''}`}
                  role="switch"
                  aria-checked={showDividers}
                  aria-label="显示分割线"
                  onClick={() => onShowDividersChange(!showDividers)}
                >
                  <span />
                </button>
              </div>
              <div className={styles.switchRow}>
                <span className={styles.switchLabel}>显示色号</span>
                <button
                  type="button"
                  className={`${styles.switchBtn} ${showColorCodes ? styles.switchBtnOn : ''}`}
                  role="switch"
                  aria-checked={showColorCodes}
                  aria-label="显示色号"
                  onClick={() => onShowColorCodesChange(!showColorCodes)}
                >
                  <span />
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
