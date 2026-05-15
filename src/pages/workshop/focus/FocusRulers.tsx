import type { RefObject } from 'react';
import type { RulerData } from './focusCanvas';
import styles from './FocusModePage.module.css';

type FocusRulersProps = {
  data: RulerData;
  handedness: 'left' | 'right';
  visible: boolean;
  sideRulerRef: RefObject<HTMLDivElement | null>;
};

export function FocusRulers({ data, handedness, visible, sideRulerRef }: FocusRulersProps) {
  if (!visible) return null;

  return (
    <section className={styles.rulerLayer} aria-label="固定坐标标尺">
      <div className={`${styles.topRuler} ${handedness === 'left' ? styles.handLeft : styles.handRight}`}>
        {data.columns.map((label) => (
          <span
            key={label.key}
            className={`${styles.rulerTick} ${label.current ? styles.current : ''}`}
            style={{ left: `${Math.round(label.x)}px` }}
            aria-hidden="true"
          />
        ))}
        {data.columns.map((label) => (
          <span
            key={`${label.key}-label`}
            className={`${styles.rulerLabel} ${label.major ? styles.major : ''} ${label.current ? styles.current : ''}`}
            style={{ left: `${Math.round(label.x)}px`, top: `${Math.round(label.y)}px` }}
          >
            {label.value}
          </span>
        ))}
      </div>

      <div ref={sideRulerRef} className={`${styles.sideRuler} ${handedness === 'left' ? styles.handLeft : styles.handRight}`}>
        {data.rows.map((label) => (
          <span
            key={label.key}
            className={`${styles.rulerTick} ${styles.sideTick} ${label.current ? styles.current : ''}`}
            style={{ top: `${Math.round(label.y)}px` }}
            aria-hidden="true"
          />
        ))}
        {data.rows.map((label) => (
          <span
            key={`${label.key}-label`}
            className={`${styles.rulerLabel} ${styles.sideLabel} ${label.major ? styles.major : ''} ${label.current ? styles.current : ''}`}
            style={{ left: `${Math.round(label.x)}px`, top: `${Math.round(label.y)}px` }}
          >
            {label.value}
          </span>
        ))}
      </div>
    </section>
  );
}
