import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import styles from './FocusModePage.module.css';

type PatternMode = 'smart' | 'color-block' | 'edge-first' | 'region-first' | 'row-by-row';

type ToggleKey = 'highlight' | 'grid' | 'dim' | 'label';

export function FocusModePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [patternMode, setPatternMode] = useState<PatternMode>('smart');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    highlight: true,
    grid: true,
    dim: true,
    label: false,
  });
  const [handedness, setHandedness] = useState<'left' | 'right'>('left');
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const currentColor = useMemo(() => state.patternResult?.palette[0] ?? null, [state.patternResult]);
  const palette = state.patternResult?.palette ?? [];

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: previewPos.x,
      originY: previewPos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    setPreviewPos({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <main className={styles.page} aria-label="专注模式页面">
      <header className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(`/workshop/result/${projectId ?? ''}`)}
            aria-label="返回结果页"
          >
            ←
          </button>
          <div className={styles.titlebarText}>
            <h1>专注模式</h1>
          </div>
        </div>

        <div className={styles.titlebarRight}>
          <button type="button" className={styles.settingsButton} onClick={() => setSettingsOpen(true)} aria-label="打开设置">
            ⚙
          </button>
          {isHydrating ? <div className={styles.loadingBadge}>加载中...</div> : null}
        </div>
      </header>

      <section className={styles.currentColorSection} aria-label="当前正在拼的颜色">
        <div className={styles.currentColorCard}>
          <div className={styles.currentColorBadge}>当前</div>
          <div className={styles.currentColorDotWrap}>
            <div
              className={`${styles.currentColorDot} ${currentColor ? styles.currentColorDotPulse : ''}`}
              style={{ background: currentColor?.hex ?? '#D8B4E2' }}
            />
          </div>
          <div className={styles.currentColorInfo}>
            <div className={styles.currentColorCode}>{currentColor?.vendorCode ?? '等待图纸'}</div>
            <div className={styles.currentColorName}>{currentColor ? `#${currentColor.hex.replace('#', '')}` : '图纸加载后显示当前颜色'}</div>
            <div className={styles.currentColorCount}>{currentColor ? `${currentColor.count} 粒` : '—'}</div>
          </div>
          <div className={styles.currentColorArrow}>→</div>
          <div className={styles.nextColorCard}>
            <div className={styles.nextColorLabel}>NEXT</div>
            <div className={styles.nextColorDot} style={{ background: palette[1]?.hex ?? currentColor?.hex ?? '#D8B4E2' }} />
            <div className={styles.nextColorCode}>{palette[1]?.vendorCode ?? '完成'}</div>
          </div>
        </div>
      </section>

      <section className={styles.canvasSection} aria-label="图纸区域">
        <div className={styles.canvasPlaceholder}>
          <div className={styles.placeholderCard}>
            <p className={styles.placeholderLabel}>图纸区域</p>
            <h2>这里先作为中间图纸占位区</h2>
            <p className={styles.placeholderHint}>
              后续会基于当前项目的图纸内容，放置专注编辑所需的画布与操作反馈。
            </p>
          </div>
        </div>
      </section>

      <section className={styles.paletteSection} aria-label="色块区域">
        <div className={styles.paletteStrip}>
          {palette.length > 0 ? (
            palette.map((item) => (
              <button
                key={`${item.vendorCode}-${item.hex}`}
                type="button"
                className={styles.paletteDotButton}
                aria-label={item.vendorCode}
                title={item.vendorCode}
              >
                <span className={styles.paletteDot} style={{ background: item.hex }}>
                  <span className={styles.paletteDotLabel}>{item.vendorCode}</span>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.paletteEmpty}>图纸加载后，这里会展示当前图纸使用的全部颜色。</div>
          )}
        </div>
      </section>

      <div
        className={styles.previewFloat}
        aria-label="图纸预览浮层"
        style={{ transform: `translate(${previewPos.x}px, ${previewPos.y}px)` }}
      >
        <div
          className={styles.previewFrame}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerUp}
          onPointerCancel={handlePreviewPointerUp}
        >
          <div className={styles.previewFrame__header}>
            <div>
              <p className={styles.placeholderLabel}>图纸预览</p>
              <h2>专注拼豆预览框</h2>
            </div>
            <div className={styles.previewFrame__badge}>{state.patternResult ? '已载入' : '等待图纸'}</div>
          </div>

          <div className={styles.previewFrame__canvas}>
            <div className={styles.previewFrame__grid} />
            <div className={styles.previewFrame__art} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className={`${styles.previewFrame__corner} ${styles['previewFrame__corner--tl']}`} />
            <div className={`${styles.previewFrame__corner} ${styles['previewFrame__corner--tr']}`} />
            <div className={`${styles.previewFrame__corner} ${styles['previewFrame__corner--bl']}`} />
            <div className={`${styles.previewFrame__corner} ${styles['previewFrame__corner--br']}`} />
          </div>

          <div className={styles.previewFrame__footer}>
            <span>预览框</span>
            <span>当前图纸内容将显示在这里</span>
          </div>
        </div>
      </div>

      <footer className={styles.toolbarSection} aria-label="操作面板">
        <div className={styles.gamepadPanel}>
          <div className={styles.gamepadPanel__cluster}>
            <button type="button" className={styles.gamepadPanel__action} aria-label="缩小图纸">
              −
            </button>
            <button type="button" className={styles.gamepadPanel__action} aria-label="放大图纸">
              +
            </button>
          </div>

          <div className={styles.gamepadPanel__mainGroup}>
            <button type="button" className={styles.gamepadPanel__secondaryButton}>
              次按钮
            </button>
            <button type="button" className={styles.gamepadPanel__primaryButton}>
              主按钮
            </button>
          </div>
        </div>
      </footer>

      <div
        className={`${styles.settingsOverlay} ${settingsOpen ? styles.settingsOverlayOpen : ''}`}
        role="presentation"
        onClick={() => setSettingsOpen(false)}
      >
        <aside
          className={`${styles.settingsPanel} ${settingsOpen ? styles.settingsPanelOpen : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="设置"
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.settingsHeader}>
              <div className={styles.settingsTitle}>
                <div className={styles.settingsTitleIcon} aria-hidden="true">⚙</div>
                拼豆设置
              </div>
              <button type="button" className={styles.settingsCloseButton} onClick={() => setSettingsOpen(false)} aria-label="关闭设置">
                ×
              </button>
            </div>

            <div className={styles.settingsBody}>
              <section>
                <div className={styles.settingsSectionTitle}>📋 拼豆方案</div>
                <div className={styles.modeOptions}>
                  {[
                    { id: 'smart', icon: '✨', name: '智能模式', desc: '根据图纸自动推荐拼豆方案', color: '#EEF0FF' },
                    { id: 'color-block', icon: '🎨', name: '色块优先', desc: '按颜色分组，一次拼完一种颜色', color: '#F5E6FA' },
                    { id: 'edge-first', icon: '🔲', name: '边缘优先', desc: '先完成图案边缘，再填充内部', color: '#E8F8F3' },
                    { id: 'region-first', icon: '📍', name: '区域优先', desc: '按区块划分，逐区域完成', color: '#FFF3EC' },
                    { id: 'row-by-row', icon: '↕', name: '逐行、逐列模式', desc: '按行或按列顺序进行拼豆', color: '#F2F7EA' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.modeOption} ${patternMode === item.id ? styles.modeOptionActive : ''}`}
                      onClick={() => setPatternMode(item.id as PatternMode)}
                    >
                      <div className={styles.modeOptionIcon} style={{ background: item.color }}>{item.icon}</div>
                      <div className={styles.modeOptionText}>
                        <div className={styles.modeOptionName}>{item.name}</div>
                        <div className={styles.modeOptionDesc}>{item.desc}</div>
                      </div>
                      <div className={styles.modeRadio} />
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className={styles.settingsSectionTitle}>🎮 操作模式</div>
                <div className={styles.handednessRow}>
                  <div className={styles.toggleInfo}>
                    <div className={styles.toggleName}>操作习惯</div>
                    <div className={styles.toggleDesc}>根据你的握持习惯切换面板布局</div>
                  </div>
                  <div className={styles.handednessSwitch} role="group" aria-label="操作习惯">
                    <button type="button" className={`${styles.handednessOption} ${handedness === 'left' ? styles.isOn : ''}`} onClick={() => setHandedness('left')} aria-label="左手模式">
                      左手
                    </button>
                    <button type="button" className={`${styles.handednessOption} ${handedness === 'right' ? styles.isOn : ''}`} onClick={() => setHandedness('right')} aria-label="右手模式">
                      右手
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <div className={styles.settingsSectionTitle}>🖼️ 显示设置</div>
                {([
                  ['highlight', '高亮当前色块', '当前颜色的豆粒闪烁高亮'],
                  ['grid', '显示格线', '在豆豆之间显示网格线'],
                  ['dim', '暗化已完成色块', '已拼完的颜色半透明显示'],
                  ['label', '显示色号标记', '在豆粒上显示色号文字'],
                ] as Array<[ToggleKey, string, string]>).map(([key, name, desc]) => (
                  <div key={key} className={styles.toggleRow}>
                    <div className={styles.toggleInfo}>
                      <div className={styles.toggleName}>{name}</div>
                      <div className={styles.toggleDesc}>{desc}</div>
                    </div>
                    <button
                      className={`${styles.toggleSwitch} ${toggles[key] ? styles.isOn : ''}`}
                      type="button"
                      aria-label={name}
                      aria-pressed={toggles[key]}
                      onClick={() => setToggles((current) => ({ ...current, [key]: !current[key] }))}
                    />
                  </div>
                ))}
              </section>

          </div>
        </aside>
      </div>
    </main>
  );
}
