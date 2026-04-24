import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './WorkshopEditorPage.module.css';
import { WorkshopPreviewPanel } from './components/WorkshopPreviewPanel';
import { PALETTE, createEmptyGrid, exportGridAsImage, floodFill, paintGridToCanvas, toCellPoint } from './editor/WorkshopEditor.utils';

type Tool = 'brush' | 'eraser' | 'fill' | 'picker' | 'pan';
type DragState = { kind: 'paint' | 'pan' | 'toolbar'; pointerId: number; startX: number; startY: number; originX: number; originY: number; originOffsetX: number; originOffsetY: number; moved?: boolean; lastCell?: string };

const TOOL_ITEMS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'brush', label: '画笔', icon: '✏️' },
  { id: 'eraser', label: '橡皮', icon: '🧹' },
  { id: 'fill', label: '填充', icon: '🪣' },
  { id: 'picker', label: '取色', icon: '💉' },
  { id: 'pan', label: '平移', icon: '✋' },
];

const TITLEBAR_H = 56;
const PREVIEW_MIN_SIZE = 90;
const PREVIEW_MOVE_THRESHOLD = 4;

function makeRecentColors(currentColor: string, recentColors: string[]) {
  return [currentColor, ...recentColors.filter((item) => item !== currentColor)].slice(0, 8);
}

export function WorkshopEditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const historyRef = useRef<string[][][]>([]);
  const historyIndexRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const [grid, setGrid] = useState(() => createEmptyGrid(32, 32));
  const [cols, setCols] = useState(32);
  const [rows, setRows] = useState(32);
  const [bgColor, setBgColor] = useState('#f5f0eb');
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const [currentColor, setCurrentColor] = useState('#D8B4E2');
  const [recentColors, setRecentColors] = useState(['#000000', '#FFFFFF', '#FF6600', '#FFDAC1', '#D8B4E2']);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnSet, setDrawnSet] = useState<Set<string>>(new Set());

  const currentRecentColors = makeRecentColors(currentColor, recentColors);

  useEffect(() => {
    historyRef.current = [grid.map((row) => [...row])];
    historyIndexRef.current = 0;
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !previewCanvasRef.current) return;
    paintGridToCanvas({ canvas: canvasRef.current, previewCanvas: previewCanvasRef.current, bubbleCanvas: bubbleCanvasRef.current, grid, cols, rows, bgColor, showGrid });
  }, [bgColor, cols, grid, rows, showGrid]);

  useEffect(() => () => { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current); }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2200);
  };

  const applyColor = (hex: string) => {
    setCurrentColor(hex);
    setRecentColors((current) => [hex, ...current.filter((item) => item !== hex)].slice(0, 8));
  };

  const commitGrid = (nextGrid: string[][]) => {
    setGrid(nextGrid);
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(nextGrid.map((row) => [...row]));
    historyRef.current = nextHistory.slice(-80);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  const undo = () => { if (historyIndexRef.current <= 0) return; historyIndexRef.current -= 1; setGrid(historyRef.current[historyIndexRef.current].map((row) => [...row])); };
  const redo = () => { if (historyIndexRef.current >= historyRef.current.length - 1) return; historyIndexRef.current += 1; setGrid(historyRef.current[historyIndexRef.current].map((row) => [...row])); };

  const beginDrag = (event: React.PointerEvent<HTMLElement>, kind: DragState['kind'], originX = 0, originY = 0) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX, originY, originOffsetX: originX, originOffsetY: originY, moved: false, lastCell: '' };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };

  const renderToolRow2 = () => {
    if (tool === 'brush') return (
      <>
        <div className={styles.toolInfoTag}><span className={styles.tagIcon}>✏️</span><span className={styles.tagText}>画笔</span></div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}><div className={styles.paramLabel}>粗细</div><div className={styles.sizeDots}>{[1,2,3,4,5].map((size) => { const active = brushSize === size; const dotSize = 7 + size * 4; return (<button key={size} type="button" className={`${styles.sizeDotBtn} ${active ? styles.isActive : ''}`} onClick={() => setBrushSize(size)}><span style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: currentColor, display: 'block', pointerEvents: 'none' }} /></button>); })}</div></div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}><div className={styles.paramLabel}>颜色</div><div className={styles.miniPalette}>{currentRecentColors.map((hex) => (<button key={hex} type="button" className={`${styles.miniColor} ${currentColor === hex ? styles.selected : ''}`} style={{ background: hex }} onClick={() => applyColor(hex)} onTouchEnd={(e) => { e.preventDefault(); applyColor(hex); }} />))}</div></div>
        <button type="button" className={styles.openPaletteBtn} onClick={() => setPaletteOpen(true)}>🎨</button>
      </>
    );
    if (tool === 'eraser') return (
      <>
        <div className={styles.toolInfoTag}><span className={styles.tagIcon}>🧹</span><span className={styles.tagText}>橡皮</span></div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}><div className={styles.paramLabel}>大小</div><div className={styles.sizeDots}>{[1,2,3,4,5].map((size) => { const active = eraserSize === size; const dotSize = 7 + size * 4; return (<button key={size} type="button" className={`${styles.sizeDotBtn} ${active ? styles.isActive : ''}`} onClick={() => setEraserSize(size)}><span style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: '#9B8E84', display: 'block', pointerEvents: 'none' }} /></button>); })}</div></div>
        <div className={styles.toolSep} />
        <div className={styles.eraserPreviewWrap}><div className={styles.paramLabel}>预览</div><div className={styles.eraserPreview} style={{ width: Math.min(56, eraserSize * 14 + 6), height: Math.min(56, eraserSize * 14 + 6) }} /></div>
      </>
    );
    if (tool === 'fill') return (
      <>
        <div className={styles.toolInfoTag}><span className={styles.tagIcon}>🪣</span><span className={styles.tagText}>填充</span></div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}><div className={styles.paramLabel}>填充色</div><div className={styles.miniPalette}>{currentRecentColors.map((hex) => (<button key={hex} type="button" className={`${styles.miniColor} ${currentColor === hex ? styles.selected : ''}`} style={{ background: hex }} onClick={() => applyColor(hex)} onTouchEnd={(e) => { e.preventDefault(); applyColor(hex); }} />))}</div></div>
        <button type="button" className={styles.openPaletteBtn} onClick={() => setPaletteOpen(true)}>🎨</button>
        <span className={styles.fillTip}>点击格子泛洪填色</span>
      </>
    );
    if (tool === 'picker') return (
      <>
        <div className={styles.toolInfoTag}><span className={styles.tagIcon}>💉</span><span className={styles.tagText}>取色</span></div>
        <div className={styles.toolSep} />
        <div className={styles.pickerTip}>点击画布格子<br /><span>自动吸取颜色并切回画笔</span></div>
      </>
    );
    return (
      <>
        <div className={styles.toolInfoTag}><span className={styles.tagIcon}>✋</span><span className={styles.tagText}>平移</span></div>
        <div className={styles.toolSep} />
        <div className={styles.paramGroup}><div className={styles.paramLabel}>视图缩放</div><div className={styles.zoomTools}><button type="button" className={styles.smallActionBtn} onClick={() => setScale((current) => Math.max(0.2, +(current - 0.1).toFixed(2)))}>－</button><button type="button" className={styles.smallActionBtn} onClick={() => setScale((current) => Math.min(12, +(current + 0.1).toFixed(2)))}>＋</button><button type="button" className={styles.smallActionBtn} onClick={() => { setOffset({ x: 0, y: 0 }); setScale(1); showToast('↺ 视图已重置'); }}>↺</button></div></div>
      </>
    );
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const previewNode = previewRef.current;
    const toolbarNode = toolbarRef.current;
    const isPreview = Boolean(previewNode?.contains(target));
    const isToolbar = Boolean(toolbarNode?.contains(target));
    if (isToolbar) { beginDrag(event, 'toolbar', toolbarPos.x, toolbarPos.y); return; }
    if (isPreview) return;
    const cell = toCellPoint(event.clientX, event.clientY, canvasRef.current, cols, rows);
    if (!cell) return;
    if (tool === 'picker') { const picked = grid[cell.row]?.[cell.col]; if (picked) applyColor(picked); setTool('brush'); showToast('已取色'); return; }
    if (tool === 'fill') { commitGrid(floodFill(grid, cell.row, cell.col, currentColor)); showToast('已执行填充'); return; }
    if (tool === 'pan') { beginDrag(event, 'pan', offset.x, offset.y); return; }
    const next = grid.map((row) => [...row]);
    const size = tool === 'eraser' ? eraserSize : brushSize;
    const half = Math.floor(size / 2);
    for (let dr = -half; dr < size - half; dr += 1) {
      for (let dc = -half; dc < size - half; dc += 1) {
        const r = cell.row + dr;
        const c = cell.col + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        next[r][c] = tool === 'eraser' ? '' : currentColor;
      }
    }
    commitGrid(next);
    setIsDrawing(true);
    setDrawnSet(new Set([`${cell.row},${cell.col}`]));
    beginDrag(event, 'paint');
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.kind === 'pan') { drag.moved = true; setOffset({ x: drag.originOffsetX + dx, y: drag.originOffsetY + dy }); return; }
    if (drag.kind === 'toolbar') { drag.moved = true; setToolbarPos({ x: drag.originOffsetX + dx, y: drag.originOffsetY + dy }); return; }
    if (!isDrawing) return;
    const cell = toCellPoint(event.clientX, event.clientY, canvasRef.current, cols, rows);
    if (!cell) return;
    const key = `${cell.row},${cell.col}`;
    if (drag.lastCell === key || drawnSet.has(key)) return;
    drag.lastCell = key;
    setDrawnSet((current) => new Set(current).add(key));
    const next = grid.map((row) => [...row]);
    next[cell.row][cell.col] = tool === 'eraser' ? '' : currentColor;
    commitGrid(next);
    drag.moved = true;
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointerId !== event.pointerId) return; dragRef.current = null; setIsDrawing(false); setDrawnSet(new Set()); try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} };
  const handleToolbarPointerDown = (event: React.PointerEvent<HTMLElement>) => { const target = event.target as HTMLElement; if (target.closest('button') || target.closest('input') || target.closest('select')) return; beginDrag(event, 'toolbar', toolbarPos.x, toolbarPos.y); };
  const handleToolbarPointerMove = (event: React.PointerEvent<HTMLElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId || drag.kind !== 'toolbar') return; drag.moved = true; setToolbarPos({ x: drag.originOffsetX + (event.clientX - drag.startX), y: drag.originOffsetY + (event.clientY - drag.startY) }); };
  const handleToolbarPointerUp = (event: React.PointerEvent<HTMLElement>) => finishDrag(event);

  return (
    <main className={styles.page}>
      <header className={styles.titlebar}>
        <button type="button" className={styles.iconBtn} onClick={() => navigate(`/workshop/result/${projectId ?? ''}`)}>←</button>
        <h1>图纸编辑</h1>
        <div className={styles.titlebarActions}>
          <button type="button" className={styles.iconBtn} onClick={undo}>↶</button>
          <button type="button" className={styles.iconBtn} onClick={redo}>↷</button>
          <button type="button" className={styles.iconBtn} onClick={() => setSettingsOpen(true)}>⚙</button>
          <button type="button" className={styles.iconBtn} onClick={() => setPaletteOpen(true)}>🎨</button>
          <button type="button" className={styles.primaryBtn} onClick={() => exportGridAsImage(grid, cols, rows, bgColor)}>导出</button>
        </div>
      </header>
      <div className={styles.layout} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp}>
        <div className={styles.canvasStage}>
          <canvas ref={canvasRef} className={styles.canvas} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }} />
          <div className={styles.zoomBar}>...</div>
        </div>
        <WorkshopPreviewPanel previewCanvasRef={previewCanvasRef} bubbleCanvasRef={bubbleCanvasRef} />
        <section ref={toolbarRef} className={styles.toolbar} onPointerDown={handleToolbarPointerDown} onPointerMove={handleToolbarPointerMove} onPointerUp={handleToolbarPointerUp} onPointerCancel={handleToolbarPointerUp}>
          <div className={styles.toolbarDrag} />
          <div className={styles.toolRow}>
            {TOOL_ITEMS.map((item) => <button key={item.id} type="button" className={`${styles.toolBtn} ${tool === item.id ? styles.toolActive : ''}`} onClick={() => setTool(item.id)}>{item.icon}</button>)}
            <div className={styles.toolSep} />
            <div className={styles.colorSwatch}><input type="color" value={currentColor} onChange={(e) => applyColor(e.target.value)} /></div>
            <div className={styles.toolSep} />
            <div className={styles.recentRow}>{currentRecentColors.map((hex) => <button key={hex} type="button" className={styles.recentDot} style={{ background: hex }} onClick={() => applyColor(hex)} onTouchEnd={(event) => { event.preventDefault(); applyColor(hex); }} />)}</div>
          </div>
          <div className={styles.toolbarContent}>{renderToolRow2()}</div>
        </section>
      </div>
      {paletteOpen ? <div className={styles.modalBackdrop} onClick={() => setPaletteOpen(false)}><section className={styles.modal} onClick={(e) => e.stopPropagation()}><header className={styles.modalHeader}><h3>拼豆色卡</h3><button type="button" className={styles.closeBtn} onClick={() => setPaletteOpen(false)}>×</button></header><div className={styles.paletteGrid}>{PALETTE.map((hex) => <button key={hex} type="button" className={styles.paletteSwatch} style={{ background: hex }} onClick={() => { applyColor(hex); setPaletteOpen(false); }} onTouchEnd={(event) => { event.preventDefault(); applyColor(hex); setPaletteOpen(false); }} />)}</div></section></div> : null}
      {settingsOpen ? <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}><section className={styles.modal} onClick={(e) => e.stopPropagation()}><header className={styles.modalHeader}><h3>画布设置</h3><button type="button" className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>×</button></header><label className={styles.field}><span>列数</span><input type="number" min={8} max={128} value={cols} onChange={(e) => setCols(Number(e.target.value) || 32)} /></label><label className={styles.field}><span>行数</span><input type="number" min={8} max={128} value={rows} onChange={(e) => setRows(Number(e.target.value) || 32)} /></label><label className={styles.field}><span>背景颜色</span><input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} /></label><div className={styles.modalActions}><button type="button" onClick={() => setSettingsOpen(false)}>取消</button><button type="button" onClick={() => { setGrid(createEmptyGrid(cols, rows)); setSettingsOpen(false); showToast('已清空画布'); }}>应用并清空</button></div></section></div> : null}
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </main>
  );
}
