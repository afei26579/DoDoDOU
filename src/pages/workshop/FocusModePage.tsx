import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import { drawPatternPreview } from '../../lib/pattern/preview';
import styles from './FocusModePage.module.css';

type PatternMode = 'smart' | 'color-block' | 'edge-first' | 'region-first' | 'row-by-row';

type ToggleKey = 'label';

export function FocusModePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [patternMode, setPatternMode] = useState<PatternMode>('smart');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    label: false,
  });
  const [handedness, setHandedness] = useState<'left' | 'right'>('left');
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [floatPreviewDataUrl, setFloatPreviewDataUrl] = useState<string | null>(null);

  const patternResult = state.patternResult;
  const hasPattern = Boolean(patternResult && patternResult.cells.length > 0);
  const palette = useMemo(() => {
    if (!patternResult) return [];

    const paletteByKey = new Map<
      string,
      {
        colorId: string;
        vendorCode: string;
        hex: string;
        count: number;
      }
    >();

    for (const cell of patternResult.cells) {
      if (cell.isExternal || !cell.vendorCode || !cell.hex || cell.hex === 'transparent') continue;
      const normalizedHex = cell.hex.startsWith('#') ? cell.hex : `#${cell.hex}`;
      const key = `${cell.colorId}-${cell.vendorCode}-${normalizedHex}`;
      const next = paletteByKey.get(key) ?? {
        colorId: cell.colorId,
        vendorCode: cell.vendorCode,
        hex: normalizedHex,
        count: 0,
      };
      next.count += 1;
      paletteByKey.set(key, next);
    }

    return Array.from(paletteByKey.values()).sort((a, b) => b.count - a.count);
  }, [patternResult]);
  const currentColor = palette[0] ?? null;

  useEffect(() => {
    console.debug('[FocusModePage] patternResult', patternResult);
  }, [patternResult]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!patternResult || !canvas) {
      setFloatPreviewDataUrl(null);
      return;
    }

    const width = Math.max(240, Math.min(720, patternResult.width * 18));
    const height = Math.max(240, Math.min(720, patternResult.height * 18));
    canvas.width = width;
    canvas.height = height;
    drawPatternPreview({ canvas, pattern: patternResult });
    setFloatPreviewDataUrl(canvas.toDataURL('image/png'));
  }, [patternResult]);

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
            <p className={styles.titlebarSubtitle}>{hasPattern ? `图纸已载入 · ${patternResult?.stats.colorCount ?? 0} 种颜色` : '等待当前项目图纸数据'}</p>
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
          {hasPattern ? (
            <div className={styles.canvasPreviewWrap}>
              <canvas ref={previewCanvasRef} className={styles.canvasPreview} aria-label="图纸预览画布" />
            </div>
          ) : (
            <div className={styles.placeholderCard}>
              <p className={styles.placeholderLabel}>{isHydrating ? '正在加载' : '图纸区域'}</p>
              <h2>{isHydrating ? '正在载入图纸数据…' : '还没有可显示的图纸'}</h2>
              <p className={styles.placeholderHint}>
                {isHydrating
                  ? '系统正在从当前拼豆项目中读取图纸数据。'
                  : '请先在工坊中生成图纸结果，再进入专注模式。'}
              </p>
            </div>
          )}
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
                  {toggles.label ? <span className={styles.paletteDotLabel}>{item.vendorCode}</span> : null}
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
          <div className={styles.previewFrame__canvas}>
            {floatPreviewDataUrl ? (
              <img className={styles.previewFrame__canvasImg} src={floatPreviewDataUrl} alt="图纸预览" />
            ) : null}
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
                <div className={styles.toggleRow}>
                  <div className={styles.toggleInfo}>
                    <div className={styles.toggleName}>显示色号标记</div>
                    <div className={styles.toggleDesc}>在豆粒上显示色号文字</div>
                  </div>
                  <button
                    className={`${styles.toggleSwitch} ${toggles.label ? styles.isOn : ''}`}
                    type="button"
                    aria-label="显示色号标记"
                    aria-pressed={toggles.label}
                    onClick={() => setToggles((current) => ({ ...current, label: !current.label }))}
                  />
                </div>
              </section>

          </div>
        </aside>
      </div>
    </main>
  );
}
