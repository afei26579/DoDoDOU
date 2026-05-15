import styles from './FocusModePage.module.css';

type FocusSettingsSheetProps = {
  open: boolean;
  handedness: 'left' | 'right';
  showRuler: boolean;
  showGuide: boolean;
  onClose: () => void;
  onHandednessChange: (value: 'left' | 'right') => void;
  onToggleRuler: () => void;
  onToggleGuide: () => void;
};

export function FocusSettingsSheet({
  open,
  handedness,
  showRuler,
  showGuide,
  onClose,
  onHandednessChange,
  onToggleRuler,
  onToggleGuide,
}: FocusSettingsSheetProps) {
  return (
    <>
      <div className={`${styles.sheetMask} ${open ? styles.show : ''}`} role="presentation" onClick={onClose} />
      <section className={`${styles.settingsSheet} ${open ? styles.show : ''}`} aria-label="拼豆设置面板" aria-hidden={!open}>
        <div className={styles.sheetHead}>
          <div className={styles.sheetTitle}>拼豆设置 ✦</div>
          <button type="button" className={styles.sheetClose} aria-label="关闭设置" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingName}>操作习惯</div>
            <div className={styles.settingDesc}>
              {handedness === 'right' ? '右手模式：坐标从左上角开始，行坐标尺在左侧。' : '左手模式：坐标从右上角开始，列号从右向左递增。'}
            </div>
          </div>
          <div className={styles.segmented} role="group" aria-label="操作习惯">
            <button
              type="button"
              className={handedness === 'right' ? styles.active : ''}
              aria-pressed={handedness === 'right'}
              onClick={() => onHandednessChange('right')}
            >
              右手
            </button>
            <button
              type="button"
              className={handedness === 'left' ? styles.active : ''}
              aria-pressed={handedness === 'left'}
              onClick={() => onHandednessChange('left')}
            >
              左手
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingName}>固定坐标尺</div>
            <div className={styles.settingDesc}>标尺固定在屏幕边缘，放大拖动时仍显示当前可见行列。</div>
          </div>
          <button
            type="button"
            className={`${styles.switch} ${showRuler ? styles.active : ''}`}
            aria-label="开关坐标尺"
            aria-pressed={showRuler}
            onClick={onToggleRuler}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingName}>行列辅助线</div>
            <div className={styles.settingDesc}>高亮当前行和当前列，减少找错位置。</div>
          </div>
          <button
            type="button"
            className={`${styles.switch} ${showGuide ? styles.active : ''}`}
            aria-label="开关行列辅助线"
            aria-pressed={showGuide}
            onClick={onToggleGuide}
          />
        </div>
      </section>
    </>
  );
}
