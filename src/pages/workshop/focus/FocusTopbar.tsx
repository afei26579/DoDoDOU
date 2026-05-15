import styles from './FocusModePage.module.css';

type FocusTopbarProps = {
  title: string;
  meta: string;
  locked: boolean;
  showRuler: boolean;
  wakeActive: boolean;
  isHydrating: boolean;
  onBack: () => void;
  onToggleWake: () => void;
  onToggleRuler: () => void;
  onToggleLock: () => void;
  onOpenSettings: () => void;
};

export function FocusTopbar({
  title,
  meta,
  locked,
  showRuler,
  wakeActive,
  isHydrating,
  onBack,
  onToggleWake,
  onToggleRuler,
  onToggleLock,
  onOpenSettings,
}: FocusTopbarProps) {
  return (
    <section className={styles.topbar} aria-label="顶部设置">
      <button type="button" className={styles.projectPill} onClick={onBack} aria-label="返回图纸结果页">
        <span className={styles.projectIcon} aria-hidden="true">‹</span>
        <span className={styles.projectMain}>{title}</span>
        <span className={styles.projectSub}>{isHydrating ? '加载中' : meta}</span>
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
          className={`${styles.iconButton} ${showRuler ? styles.active : ''}`}
          aria-label="显示坐标尺"
          title="显示坐标尺"
          onClick={onToggleRuler}
        >
          ⌗
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${locked ? styles.active : ''}`}
          aria-label="防误触锁定"
          title="防误触锁定"
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
