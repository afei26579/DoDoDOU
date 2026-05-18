import { useEffect, useState } from 'react';
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
  onNotice?: (message: string) => void;
  onBoardLayoutChange: (patch: Partial<WorkshopBoardLayout>) => void;
};

const MAX_BOARD_SIDE = 200;
type SettingHelpKey = 'direction' | 'strategy' | 'board' | 'handedness' | 'ruler' | 'guide';
type DirectionPreset = 'horizontal' | 'vertical';

function getHelpButtonLabel(label: string) {
  return `查看${label}说明`;
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
  onNotice,
  onBoardLayoutChange,
}: FocusSettingsSheetProps) {
  const minBoardSide = Math.max(1, patternWidth, patternHeight);
  const boardSide = Math.max(boardLayout?.boardWidth ?? minBoardSide, boardLayout?.boardHeight ?? minBoardSide);
  const canEditBoard = patternWidth > 0 && patternHeight > 0;
  const directionPreset: DirectionPreset = horizontalDirection !== 'smart' && verticalDirection === 'smart'
    ? 'horizontal'
    : horizontalDirection === 'smart' && verticalDirection !== 'smart'
      ? 'vertical'
      : 'vertical';
  const [activeHelp, setActiveHelp] = useState<SettingHelpKey | null>(null);
  const [boardSideDraft, setBoardSideDraft] = useState(() => String(boardSide));

  useEffect(() => {
    setBoardSideDraft(String(boardSide));
  }, [boardSide]);

  useEffect(() => {
    if (!activeHelp) return;

    const closeHelpOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-setting-help="${activeHelp}"]`)) return;
      setActiveHelp(null);
    };

    document.addEventListener('pointerdown', closeHelpOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeHelpOnOutsidePointer);
  }, [activeHelp]);

  const commitBoardSideDraft = () => {
    const numeric = Number.parseInt(boardSideDraft, 10);
    if (!Number.isFinite(numeric)) {
      setBoardSideDraft(String(boardSide));
      return;
    }

    if (numeric < minBoardSide) {
      setBoardSideDraft(String(minBoardSide));
      onBoardLayoutChange({ boardWidth: minBoardSide, boardHeight: minBoardSide });
      onNotice?.('实体板不能小于图纸尺寸');
      return;
    }

    const nextSide = Math.max(minBoardSide, Math.min(MAX_BOARD_SIDE, numeric));
    setBoardSideDraft(String(nextSide));
    if (nextSide !== boardSide) {
      onBoardLayoutChange({ boardWidth: nextSide, boardHeight: nextSide });
    }
  };

  const renderSettingLabel = (key: SettingHelpKey, label: string, description: string) => (
    <div>
      <div className={styles.settingNameRow}>
        <div className={styles.settingName}>{label}</div>
        <span className={`${styles.settingHelp} ${activeHelp === key ? styles.settingHelpActive : ''}`} data-setting-help={key}>
          <button
            type="button"
            className={`${styles.settingHelpButton} ${activeHelp === key ? styles.active : ''}`}
            aria-label={getHelpButtonLabel(label)}
            aria-describedby={`setting-help-${key}`}
            aria-expanded={activeHelp === key}
            onClick={() => setActiveHelp((current) => (current === key ? null : key))}
          >
            ?
          </button>
          <span id={`setting-help-${key}`} className={styles.settingHelpText} role="tooltip">
            {description}
          </span>
        </span>
      </div>
    </div>
  );

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
          {renderSettingLabel('direction', '拼豆方向', '选择色块推进方向，横向会按左右手习惯决定默认左右走向。')}
          <div className={styles.segmented} role="group" aria-label="拼豆方向">
            <button
              type="button"
              className={directionPreset === 'vertical' ? styles.active : ''}
              aria-pressed={directionPreset === 'vertical'}
              onClick={() => {
                onHorizontalDirectionChange('smart');
                onVerticalDirectionChange('top-to-bottom');
              }}
            >
              纵向
            </button>
            <button
              type="button"
              className={directionPreset === 'horizontal' ? styles.active : ''}
              aria-pressed={directionPreset === 'horizontal'}
              onClick={() => {
                onHorizontalDirectionChange(handedness === 'left' ? 'right-to-left' : 'left-to-right');
                onVerticalDirectionChange('smart');
              }}
            >
              横向
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          {renderSettingLabel('strategy', '拼豆策略', '控制下一块色块的推荐顺序。')}
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
          {renderSettingLabel('board', '实体板尺寸', `当前图纸 ${patternWidth || '-'} × ${patternHeight || '-'}，正方形板子不能小于图纸最长边。`)}
          <div className={styles.boardSizeControl} aria-label="实体板尺寸设置">
            <label className={styles.boardSizeSingle}>
            
              <input
                type="number"
                inputMode="numeric"
                min={minBoardSide}
                max={MAX_BOARD_SIDE}
                value={boardSideDraft}
                disabled={!canEditBoard}
                onChange={(event) => setBoardSideDraft(event.target.value)}
                onBlur={commitBoardSideDraft}
              />
            </label>
          </div>
        </div>

        <div className={styles.settingRow}>
          {renderSettingLabel('handedness', '操作习惯', handedness === 'right' ? '右手模式：坐标从左上角开始，行坐标尺在左侧。' : '左手模式：坐标从右上角开始，列号从右向左递增。')}
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
          {renderSettingLabel('ruler', '固定坐标尺', '标尺固定在屏幕边缘，放大拖动时仍显示当前可见行列。')}
          <button
            type="button"
            className={`${styles.switch} ${showRuler ? styles.active : ''}`}
            aria-label="开关坐标尺"
            aria-pressed={showRuler}
            onClick={onToggleRuler}
          />
        </div>

        <div className={styles.settingRow}>
          {renderSettingLabel('guide', '行列辅助线', '高亮当前行和当前列，减少找错位置。')}
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
