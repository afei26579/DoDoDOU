import type {
  WorkshopBeadingHorizontalDirection,
  WorkshopBeadingStrategy,
  WorkshopBeadingVerticalDirection,
  WorkshopBoardLayout,
} from '../../../features/workshop/model/types';
import styles from './FocusModePage.module.css';

type FocusSettingsSheetProps = {
  open: boolean;
  handedness: 'left' | 'right';
  showRuler: boolean;
  showGuide: boolean;
  beadingStrategy: WorkshopBeadingStrategy;
  horizontalDirection: WorkshopBeadingHorizontalDirection;
  verticalDirection: WorkshopBeadingVerticalDirection;
  patternWidth: number;
  patternHeight: number;
  boardLayout: WorkshopBoardLayout | null;
  onClose: () => void;
  onHandednessChange: (value: 'left' | 'right') => void;
  onBeadingStrategyChange: (value: WorkshopBeadingStrategy) => void;
  onHorizontalDirectionChange: (value: WorkshopBeadingHorizontalDirection) => void;
  onVerticalDirectionChange: (value: WorkshopBeadingVerticalDirection) => void;
  onToggleRuler: () => void;
  onToggleGuide: () => void;
  onTogglePlacementMode?: () => void;
  onBoardLayoutChange: (patch: Partial<WorkshopBoardLayout>) => void;
};

const MAX_BOARD_SIDE = 200;

function readBoardSide(value: string, min: number) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(MAX_BOARD_SIDE, numeric));
}

export function FocusSettingsSheet({
  open,
  handedness,
  showRuler,
  showGuide,
  beadingStrategy,
  horizontalDirection,
  verticalDirection,
  patternWidth,
  patternHeight,
  boardLayout,
  onClose,
  onHandednessChange,
  onBeadingStrategyChange,
  onHorizontalDirectionChange,
  onVerticalDirectionChange,
  onToggleRuler,
  onToggleGuide,
  onBoardLayoutChange,
}: FocusSettingsSheetProps) {
  const minBoardSide = Math.max(1, patternWidth, patternHeight);
  const boardSide = Math.max(boardLayout?.boardWidth ?? minBoardSide, boardLayout?.boardHeight ?? minBoardSide);
  const canEditBoard = patternWidth > 0 && patternHeight > 0;

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
            <div className={styles.settingName}>拼豆方向</div>
            <div className={styles.settingDesc}>可同时选择一个横向和一个纵向方向；智能推荐会按左右手习惯决定。</div>
          </div>
          <div className={styles.directionGrid} role="group" aria-label="拼豆方向">
            <button
              type="button"
              className={horizontalDirection === 'smart' && verticalDirection === 'smart' ? styles.active : ''}
              aria-pressed={horizontalDirection === 'smart' && verticalDirection === 'smart'}
              onClick={() => {
                onHorizontalDirectionChange('smart');
                onVerticalDirectionChange('smart');
              }}
            >
              智能推荐
            </button>
            <button type="button" className={horizontalDirection === 'left-to-right' ? styles.active : ''} aria-pressed={horizontalDirection === 'left-to-right'} onClick={() => onHorizontalDirectionChange('left-to-right')}>
              左→右
            </button>
            <button type="button" className={horizontalDirection === 'right-to-left' ? styles.active : ''} aria-pressed={horizontalDirection === 'right-to-left'} onClick={() => onHorizontalDirectionChange('right-to-left')}>
              右→左
            </button>
            <button type="button" className={verticalDirection === 'top-to-bottom' ? styles.active : ''} aria-pressed={verticalDirection === 'top-to-bottom'} onClick={() => onVerticalDirectionChange('top-to-bottom')}>
              上→下
            </button>
            <button type="button" className={verticalDirection === 'bottom-to-top' ? styles.active : ''} aria-pressed={verticalDirection === 'bottom-to-top'} onClick={() => onVerticalDirectionChange('bottom-to-top')}>
              下→上
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingName}>拼豆策略</div>
            <div className={styles.settingDesc}>控制下一块色块的推荐顺序。</div>
          </div>
          <div className={`${styles.segmented} ${styles.segmentedThree}`} role="group" aria-label="拼豆策略">
            <button type="button" className={beadingStrategy === 'smart' ? styles.active : ''} aria-pressed={beadingStrategy === 'smart'} onClick={() => onBeadingStrategyChange('smart')}>
              智能推荐
            </button>
            <button type="button" className={beadingStrategy === 'nearest' ? styles.active : ''} aria-pressed={beadingStrategy === 'nearest'} onClick={() => onBeadingStrategyChange('nearest')}>
              就近优先
            </button>
            <button type="button" className={beadingStrategy === 'largest' ? styles.active : ''} aria-pressed={beadingStrategy === 'largest'} onClick={() => onBeadingStrategyChange('largest')}>
              大块优先
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingName}>实体板尺寸</div>
            <div className={styles.settingDesc}>
              当前图纸 {patternWidth || '-'} × {patternHeight || '-'}，正方形板子不能小于图纸最长边。
            </div>
          </div>
          <div className={styles.boardSizeControl} aria-label="实体板尺寸设置">
            <label className={styles.boardSizeSingle}>
              <span>边长</span>
              <input
                type="number"
                inputMode="numeric"
                min={minBoardSide}
                max={MAX_BOARD_SIDE}
                value={boardSide}
                disabled={!canEditBoard}
                onChange={(event) => {
                  const nextSide = readBoardSide(event.target.value, minBoardSide);
                  onBoardLayoutChange({ boardWidth: nextSide, boardHeight: nextSide });
                }}
              />
            </label>
            <div className={styles.boardPresetRow}>
              <button
                type="button"
                disabled={!canEditBoard}
                onClick={() => onBoardLayoutChange({ boardWidth: minBoardSide, boardHeight: minBoardSide })}
              >
                图纸
              </button>
              <button
                type="button"
                disabled={!canEditBoard || minBoardSide > 78}
                onClick={() => onBoardLayoutChange({ boardWidth: 78, boardHeight: 78 })}
              >
                78
              </button>
            </div>
          </div>
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
