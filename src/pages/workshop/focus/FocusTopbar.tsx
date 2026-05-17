import styles from './FocusModePage.module.css';

const GO_BACK_ICON = '/assets/system_icons/go_back.png';

type FocusTopbarProps = {
  zoomLocked: boolean;
  wakeActive: boolean;
  placementMode: boolean;
  onBack: () => void;
  onToggleWake: () => void;
  onTogglePlacementMode: () => void;
  onToggleLock: () => void;
  onOpenSettings: () => void;
  shaking: boolean;
};

export function FocusTopbar({
  zoomLocked,
  wakeActive,
  placementMode,
  onBack,
  onToggleWake,
  onTogglePlacementMode,
  onToggleLock,
  onOpenSettings,
  shaking,
}: FocusTopbarProps) {
  return (
    <section className={styles.topbar} aria-label="顶部设置">
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
        aria-label="返回"
        title="返回"
      >
        <img src={GO_BACK_ICON} alt="" />
      </button>

      <div className={styles.topActions}>
        <button
          type="button"
          className={`${styles.iconButton} ${wakeActive ? styles.active : ''}`}
          aria-label="屏幕常亮"
          title="屏幕常亮"
          onClick={onToggleWake}
        >
          ☀
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${placementMode ? styles.active : ''}`}
          aria-label="摆放图纸"
          title="摆放图纸"
          aria-pressed={placementMode}
          onClick={onTogglePlacementMode}
        >
          ⊕
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.lockButton} ${zoomLocked ? styles.active : ''} ${shaking ? styles.shake : ''}`}
          aria-label="锁定缩放"
          title="锁定缩放"
          onClick={onToggleLock}
        >
          🔒
        </button>
        <button type="button" className={styles.iconButton} aria-label="打开设置" title="设置" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </section>
  );
}
