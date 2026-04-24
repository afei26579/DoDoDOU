import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import styles from './FocusModePage.module.css';

type ColorItem = { code: string; name: string; hex: string; count: number };

const DEFAULT_PALETTE: ColorItem[] = [
  { code: 'S-07', name: '樱花粉', hex: '#E8A4C8', count: 42 },
  { code: 'S-14', name: '天空蓝', hex: '#A8D8EA', count: 37 },
  { code: 'S-22', name: '薄荷绿', hex: '#B5EAD7', count: 58 },
  { code: 'S-31', name: '柠檬黄', hex: '#FFE566', count: 24 },
  { code: 'S-38', name: '珊瑚橙', hex: '#FFDAC1', count: 18 },
  { code: 'S-45', name: '丁香紫', hex: '#D8B4E2', count: 64 },
];

const DEMO_GRID_SIZE = 20;
const BEAD_SIZE = 16;

function generateDemoGrid() {
  const grid: number[][] = [];
  for (let r = 0; r < DEMO_GRID_SIZE; r += 1) {
    grid[r] = [];
    for (let c = 0; c < DEMO_GRID_SIZE; c += 1) {
      const dx = c - DEMO_GRID_SIZE / 2 + 0.5;
      const dy = r - DEMO_GRID_SIZE / 2 + 0.5;
      const hx = dx / (DEMO_GRID_SIZE * 0.5);
      const hy = dy / (DEMO_GRID_SIZE * 0.5);
      const isHeart = hx * hx + (hy - 0.3 * Math.sqrt(Math.abs(hx))) ** 2 < 0.55;
      if (isHeart) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        grid[r][c] = dist < 2.5 ? 0 : dist < 4.5 ? 3 : dist < 6.5 ? 1 : 5;
      } else {
        const bg = (r + c) % 6;
        grid[r][c] = bg < 1 ? 1 : bg < 2 ? 2 : bg < 3 ? 4 : 5;
      }
    }
  }
  return grid;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function FocusModePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { state, isHydrating } = useWorkshopFlow(projectId ?? null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [showToast, setShowToast] = useState('');

  const grid = useMemo(() => generateDemoGrid(), []);
  const palette = useMemo(() => DEFAULT_PALETTE, []);
  const currentColor = palette[currentIndex] ?? palette[0];
  const nextColor = palette.find((item, index) => index > currentIndex && !completed.has(index)) ?? null;
  const totalCount = palette.reduce((sum, item) => sum + item.count, 0);
  const doneCount = [...completed].reduce((sum, idx) => sum + (palette[idx]?.count ?? 0), 0);
  const percent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    if (!canvas || !minimap) return;

    const ctx = canvas.getContext('2d');
    const miniCtx = minimap.getContext('2d');
    if (!ctx || !miniCtx) return;

    canvas.width = DEMO_GRID_SIZE * BEAD_SIZE;
    canvas.height = DEMO_GRID_SIZE * BEAD_SIZE;
    minimap.width = 80;
    minimap.height = 80;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();

    for (let r = 0; r < DEMO_GRID_SIZE; r += 1) {
      for (let c = 0; c < DEMO_GRID_SIZE; c += 1) {
        const color = palette[grid[r][c]];
        const x = c * BEAD_SIZE;
        const y = r * BEAD_SIZE;
        const isCurrent = grid[r][c] === currentIndex;
        const isDone = completed.has(grid[r][c]);
        ctx.save();
        ctx.globalAlpha = isDone && !isCurrent ? 0.3 : isCurrent ? 1 : 0.6;
        roundRect(ctx, x + 1.5, y + 1.5, BEAD_SIZE - 3, BEAD_SIZE - 3, 5);
        if (isCurrent) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 400);
          ctx.fillStyle = color.hex;
          ctx.shadowColor = color.hex;
          ctx.shadowBlur = 6 + pulse * 5;
        } else {
          ctx.fillStyle = color.hex;
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    miniCtx.clearRect(0, 0, minimap.width, minimap.height);
    const cellW = minimap.width / DEMO_GRID_SIZE;
    const cellH = minimap.height / DEMO_GRID_SIZE;
    for (let r = 0; r < DEMO_GRID_SIZE; r += 1) {
      for (let c = 0; c < DEMO_GRID_SIZE; c += 1) {
        miniCtx.fillStyle = palette[grid[r][c]].hex;
        miniCtx.globalAlpha = completed.has(grid[r][c]) ? 0.35 : 1;
        miniCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    miniCtx.globalAlpha = 1;
  }, [completed, currentIndex, grid, palette]);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const handleNext = () => {
    setCompleted((current) => new Set(current).add(currentIndex));
    const next = palette.findIndex((_, idx) => idx > currentIndex && !completed.has(idx));
    if (next >= 0) {
      setCurrentIndex(next);
      setShowToast(`已切换至 ${palette[next].code} ${palette[next].name}`);
    } else {
      setShowToast('全部色块已完成');
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.x + (event.clientX - dragRef.current.startX), y: dragRef.current.y + (event.clientY - dragRef.current.startY) });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };

  return (
    <main className={styles.page} aria-label="专注模式页面">
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon} aria-hidden="true">▦</div>
          <div className={styles.headerTitle}>沉浸式<span>拼豆</span></div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.progressBadge}>{palette.filter((item) => item.count > 0).length - completed.size}/{palette.filter((item) => item.count > 0).length} 色</div>
          <button type="button" className={styles.iconBtn} onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <section className={styles.colorHint}>
        <div className={styles.currentCard}>
          <div className={styles.colorDotWrap}><div className={styles.colorDot} style={{ background: currentColor.hex }} /></div>
          <div className={styles.colorInfo}>
            <div className={styles.colorCode}>{currentColor.code}</div>
            <div className={styles.colorName}>{currentColor.name}</div>
            <div className={styles.colorCount}>{currentColor.count} 粒</div>
          </div>
        </div>
        <div className={styles.hintArrow}>→</div>
        <div className={styles.nextCard}>
          <div className={styles.nextLabel}>NEXT</div>
          <div className={styles.nextDot} style={{ background: nextColor?.hex ?? currentColor.hex }} />
          <div className={styles.nextCode}>{nextColor?.code ?? '完成'}</div>
        </div>
      </section>

      <main className={styles.canvasArea}>
        <div className={styles.canvasContainer} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
          <div className={styles.canvasWrapper} ref={wrapperRef} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>
          <div className={styles.canvasTip}><span className={styles.tipDot} />高亮显示当前色块</div>
          <div className={styles.zoomHint}>{Math.round(zoom * 100)}%</div>
          <div className={styles.zoomControls}>
            <button type="button" className={styles.zoomBtn} onClick={() => setZoom((current) => Math.min(current * 1.3, 6))}>+</button>
            <button type="button" className={styles.zoomBtn} onClick={() => setZoom((current) => Math.max(current / 1.3, 0.3))}>−</button>
            <button type="button" className={styles.zoomBtn} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⌂</button>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.minimapWrap}>
            <canvas ref={minimapRef} className={styles.minimapCanvas} width={80} height={80} />
          </div>
          <div className={styles.progressInfo}>
            <div className={styles.progressText}><span>整体进度</span><strong>{percent}%</strong></div>
            <div className={styles.progressBarWrap}><div className={styles.progressBar} style={{ width: `${percent}%` }} /></div>
            <div className={styles.progressCounts}>已完成 {completed.size} 色块 · 剩余 {palette.length - completed.size} 色块</div>
          </div>
          <button type="button" className={styles.nextBtn} onClick={handleNext}><span>→</span><small>下一色</small></button>
        </div>
      </footer>

      {settingsOpen ? (
        <div className={styles.overlay} role="presentation" onClick={() => setSettingsOpen(false)}>
          <aside className={styles.panel} role="dialog" aria-modal="true" aria-label="拼豆设置" onClick={(event) => event.stopPropagation()}>
            <div className={styles.panelHeader}>
              <strong>拼豆设置</strong>
              <button type="button" className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className={styles.panelBody}>
              <section><h4>拼豆方案</h4><p>色块优先 / 边缘优先 / 区域优先 / 逐行拼接</p></section>
              <section><h4>显示设置</h4><p>高亮当前色块 / 显示格线 / 暗化已完成色块 / 显示色号标记</p></section>
              <section><h4>色块清单</h4><p>{state.patternResult ? '来自当前项目的专注拼豆视图' : '示例心形图纸，保持与 demo 视觉一致'}</p></section>
            </div>
          </aside>
        </div>
      ) : null}

      {showToast ? <div className={styles.toast}>{showToast}</div> : null}
      {state.isGenerating || isHydrating ? <div className={styles.loadingBadge}>加载中...</div> : null}
      <button type="button" className={styles.floatingBack} onClick={() => navigate(`/workshop/result/${projectId ?? ''}`)}>返回预览</button>
    </main>
  );
}
