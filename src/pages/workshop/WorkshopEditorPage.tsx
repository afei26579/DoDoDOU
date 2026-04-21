import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternCell, PatternResult } from '../../features/workshop/model/types';

const editorTools = [
  { label: '铅笔', icon: '✎', active: true },
  { label: '橡皮', icon: '⌫', active: false },
  { label: '填充', icon: '◩', active: false },
  { label: '取色', icon: '◌', active: false },
] as const;

const colorPalette = [
  '#cfa7e8', '#ffd3b0', '#b7ead7', '#ffb8c4', '#f7e69a', '#9cc4f5',
  '#5d534a', '#ffffff', '#f7a8a8', '#9db2f8', '#d6e6b8', '#f7cf8f',
  '#e6dffd', '#d9f4eb', '#f8e7b4', '#fff2d8', '#d7f0fb', '#f4d6ea',
  '#d1d1d1', '#f2c6c6', '#c9d7f0', '#dbe8b9', '#f2d2a1', '#f8f3ee',
] as const;

type EditorProjectData = {
  title: string;
  imageUrl: string | null;
  pattern: PatternResult | null;
  cellSize: number;
  activeColor: string;
};

function buildFallbackPattern(): PatternResult {
  const cells: PatternCell[] = [];
  for (let y = 0; y < 18; y += 1) {
    for (let x = 0; x < 18; x += 1) {
      const dx = x - 8.5;
      const dy = y - 8.5;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isCore = distance < 4.1;
      const isAccent = distance >= 2.1 && distance < 5.1 && (x + y) % 2 === 0;
      cells.push({
        x,
        y,
        colorId: isCore ? 'lavender' : isAccent ? 'peach' : 'canvas',
        vendorCode: isCore ? 'C-01' : isAccent ? 'C-02' : 'C-00',
        hex: isCore ? '#cda3ea' : isAccent ? '#ffd2ad' : '#f6efe8',
      });
    }
  }

  return {
    width: 18,
    height: 18,
    cells,
    palette: [
      { colorId: 'lavender', vendorCode: 'C-01', hex: '#cda3ea', count: 64 },
      { colorId: 'peach', vendorCode: 'C-02', hex: '#ffd2ad', count: 32 },
      { colorId: 'canvas', vendorCode: 'C-00', hex: '#f6efe8', count: 228 },
    ],
    stats: { totalCells: 324, colorCount: 3 },
  };
}

export function WorkshopEditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projectData, setProjectData] = useState<EditorProjectData | null>(null);

  useEffect(() => {
    let alive = true;
    if (!projectId) return;

    getWorkshopProject(projectId)
      .then((record) => {
        if (!alive) return;
        setProjectData({
          title: record?.uploadedImage?.name ? record.uploadedImage.name : '未命名图纸',
          imageUrl: record?.patternResult ? null : record?.uploadedImage?.dataUrl ?? null,
          pattern: record?.patternResult ?? buildFallbackPattern(),
          cellSize: record?.config.canvasSize ?? 18,
          activeColor: record?.patternResult?.palette?.[0]?.hex ?? '#CFA7E8',
        });
      })
      .catch(() => {
        if (!alive) return;
        setProjectData({
          title: '未命名图纸',
          imageUrl: null,
          pattern: buildFallbackPattern(),
          cellSize: 18,
          activeColor: '#CFA7E8',
        });
      });

    return () => {
      alive = false;
    };
  }, [projectId]);

  const pattern = projectData?.pattern ?? buildFallbackPattern();
  const cells = useMemo(() => pattern.cells, [pattern]);

  return (
    <main className="workshop-editor" aria-label="图纸手动编辑页">
      <div className="workshop-editor__shell">
        <header className="workshop-editor__topbar">
          <button type="button" className="workshop-editor__icon-btn" aria-label="返回" onClick={() => navigate(`/workshop/result/${projectId ?? ''}`)}>
            ←
          </button>
          <div className="workshop-editor__title-group">
            <p>Manual Edit</p>
            <h1>{projectData?.title ?? '图纸编辑'}</h1>
          </div>
          <div className="workshop-editor__top-actions">
            <button type="button" className="workshop-editor__ghost-btn">保存</button>
            <button type="button" className="workshop-editor__solid-btn">导出</button>
          </div>
        </header>

        <section className="workshop-editor__canvas-panel" aria-label="编辑画板">
          <div className="workshop-editor__canvas-stage">
            <div className="workshop-editor__canvas-frame">
              {projectData?.imageUrl ? <img className="workshop-editor__source-image" src={projectData.imageUrl} alt="当前图纸来源" /> : null}
              <div className="workshop-editor__canvas-grid" aria-hidden="true" />
              <div className="workshop-editor__canvas-art" aria-hidden="true">
                {cells.map((cell) => (
                  <span key={`${cell.x}-${cell.y}`} className="workshop-editor__cell" style={{ backgroundColor: cell.hex }} />
                ))}
              </div>
            </div>

            <div className="workshop-editor__preview-card">
              <div className="workshop-editor__preview-badge">PREVIEW</div>
              <div className="workshop-editor__preview-mini" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="workshop-editor__zoom">
              <button type="button" aria-label="放大">+</button>
              <span>100%</span>
              <button type="button" aria-label="缩小">−</button>
            </div>
          </div>

          <div className="workshop-editor__legend">
            <div>
              <strong>{pattern.width} × {pattern.height}</strong>
              <p>可直接涂改当前项目图纸</p>
            </div>
            <div className="workshop-editor__legend-pill">当前色：{projectData?.activeColor ?? '#CFA7E8'}</div>
          </div>
        </section>

        <section className="workshop-editor__tools-panel" aria-label="编辑工具与色板">
          <div className="workshop-editor__tool-rail" aria-label="工具栏">
            {editorTools.map((tool) => (
              <button key={tool.label} type="button" className={`workshop-editor__tool ${tool.active ? 'is-active' : ''}`}>
                <span aria-hidden="true" className="workshop-editor__tool-icon">{tool.icon}</span>
                <span>{tool.label}</span>
              </button>
            ))}
          </div>

          <div className="workshop-editor__palette-card">
            <div className="workshop-editor__palette-head">
              <div>
                <p className="workshop-editor__eyebrow">COLOR PALETTE</p>
                <h2>颜色板</h2>
              </div>
              <span>{pattern.palette.length} Colors</span>
            </div>
            <div className="workshop-editor__palette-grid">
              {colorPalette.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  className={`workshop-editor__swatch ${index === 0 ? 'is-active' : ''}`}
                  style={{ backgroundColor: color }}
                  aria-label={`颜色 ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        <footer className="workshop-editor__footer">
          <button type="button" className="workshop-editor__secondary">一键去背景</button>
          <button type="button" className="workshop-editor__primary">立即拼豆</button>
        </footer>
      </div>

      <style>{`
        .workshop-editor {
          min-height: 100vh;
          padding: 16px;
          background:
            radial-gradient(circle at top, rgba(216,180,226,0.18), transparent 32%),
            linear-gradient(180deg, #fdfbf7 0%, #fff 100%);
        }
        .workshop-editor__shell {
          display: grid;
          gap: 14px;
          max-width: 390px;
          margin: 0 auto;
          animation: workshop-fade-in 180ms ease-out;
        }
        .workshop-editor__topbar,
        .workshop-editor__legend,
        .workshop-editor__palette-head,
        .workshop-editor__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .workshop-editor__topbar { padding: 2px 2px 0; }
        .workshop-editor__icon-btn,
        .workshop-editor__ghost-btn,
        .workshop-editor__solid-btn,
        .workshop-editor__tool,
        .workshop-editor__swatch,
        .workshop-editor__secondary,
        .workshop-editor__primary,
        .workshop-editor__zoom button {
          border: 0;
          cursor: pointer;
        }
        .workshop-editor__title-group { flex: 1; min-width: 0; }
        .workshop-editor__title-group p { margin: 0 0 3px; font-size: 11px; letter-spacing: .14em; color: var(--accent-strong); text-transform: uppercase; }
        .workshop-editor__title-group h1 { margin: 0; font-size: 24px; line-height: 1.1; }
        .workshop-editor__top-actions { display: flex; gap: 8px; }
        .workshop-editor__icon-btn,
        .workshop-editor__ghost-btn,
        .workshop-editor__zoom button,
        .workshop-editor__secondary {
          background: rgba(255,255,255,0.86);
          color: var(--ink);
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .workshop-editor__icon-btn { width: 42px; height: 42px; border-radius: 14px; font-size: 18px; }
        .workshop-editor__ghost-btn,
        .workshop-editor__solid-btn,
        .workshop-editor__secondary,
        .workshop-editor__primary { height: 42px; padding: 0 14px; border-radius: 16px; font-weight: 700; }
        .workshop-editor__solid-btn,
        .workshop-editor__primary { background: linear-gradient(180deg, var(--accent), var(--accent-strong)); color: #fff; box-shadow: 0 10px 18px rgba(197,147,212,.22); }
        .workshop-editor__canvas-panel,
        .workshop-editor__tools-panel {
          display: grid;
          gap: 12px;
        }
        .workshop-editor__canvas-stage {
          position: relative;
          border-radius: 28px;
          overflow: hidden;
          background: #f3f1ec;
          border: 1px solid rgba(93,83,74,.06);
          box-shadow: 0 10px 24px rgba(93,83,74,.07);
          aspect-ratio: 1 / 1;
        }
        .workshop-editor__canvas-frame {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(93,83,74,.11) 1px, transparent 0);
          background-size: 18px 18px;
          display: grid;
          place-items: center;
          padding: 22px;
        }
        .workshop-editor__source-image {
          position: absolute;
          inset: 18px;
          width: calc(100% - 36px);
          height: calc(100% - 36px);
          object-fit: cover;
          border-radius: 20px;
          opacity: 0.18;
        }
        .workshop-editor__canvas-grid,
        .workshop-editor__canvas-art {
          position: absolute;
          inset: 22px;
        }
        .workshop-editor__canvas-grid {
          border-radius: 20px;
          background:
            linear-gradient(rgba(93,83,74,.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(93,83,74,.10) 1px, transparent 1px);
          background-size: calc(100% / 18) calc(100% / 18);
          opacity: .55;
        }
        .workshop-editor__canvas-art {
          display: grid;
          grid-template-columns: repeat(18, 1fr);
          border-radius: 20px;
          overflow: hidden;
        }
        .workshop-editor__cell { aspect-ratio: 1; }
        .workshop-editor__preview-card {
          position: absolute;
          right: 14px;
          top: 14px;
          width: 98px;
          border-radius: 20px;
          padding: 12px;
          background: rgba(255,255,255,.8);
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 22px rgba(93,83,74,.08);
          border: 1px solid rgba(93,83,74,.06);
        }
        .workshop-editor__preview-badge {
          font-size: 10px;
          letter-spacing: .16em;
          color: var(--accent-strong);
          font-weight: 800;
          margin-bottom: 10px;
        }
        .workshop-editor__preview-mini { height: 62px; border-radius: 16px; background: linear-gradient(180deg, #f6eee5, #efdfd1); position: relative; overflow: hidden; }
        .workshop-editor__preview-mini span { position: absolute; border-radius: 999px; background: rgba(197,147,212,.58); }
        .workshop-editor__preview-mini span:nth-child(1) { width: 32px; height: 16px; left: 12px; top: 12px; }
        .workshop-editor__preview-mini span:nth-child(2) { width: 42px; height: 12px; right: 10px; top: 28px; background: rgba(255,208,173,.78); }
        .workshop-editor__preview-mini span:nth-child(3) { width: 16px; height: 24px; left: 36px; bottom: 8px; }
        .workshop-editor__zoom {
          position: absolute;
          left: 50%;
          bottom: 14px;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 16px;
          background: rgba(255,255,255,.82);
          box-shadow: 0 8px 18px rgba(93,83,74,.08);
        }
        .workshop-editor__zoom button { width: 32px; height: 32px; border-radius: 12px; font-size: 18px; }
        .workshop-editor__zoom span { min-width: 54px; text-align: center; font-weight: 800; font-size: 13px; }
        .workshop-editor__legend { padding: 0 4px; }
        .workshop-editor__legend strong { display: block; font-size: 15px; }
        .workshop-editor__legend p { font-size: 12px; color: rgba(93,83,74,.62); }
        .workshop-editor__legend-pill { padding: 8px 12px; border-radius: 999px; background: rgba(216,180,226,.16); color: var(--accent-strong); font-size: 12px; font-weight: 800; }
        .workshop-editor__tools-panel { grid-template-columns: 76px minmax(0, 1fr); align-items: stretch; }
        .workshop-editor__tool-rail { display: grid; gap: 10px; align-content: start; }
        .workshop-editor__tool {
          min-height: 76px;
          border-radius: 22px;
          background: #fff;
          border: 1px solid rgba(93,83,74,.06);
          box-shadow: 0 1px 2px rgba(0,0,0,.04);
          display: grid;
          place-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(93,83,74,.76);
          padding: 10px 8px;
        }
        .workshop-editor__tool-icon { font-size: 18px; }
        .workshop-editor__tool.is-active {
          background: linear-gradient(180deg, rgba(216,180,226,.24), rgba(255,255,255,.92));
          color: var(--accent-strong);
          border-color: rgba(197,147,212,.24);
        }
        .workshop-editor__palette-card {
          border-radius: 24px;
          background: #fff;
          border: 1px solid rgba(93,83,74,.06);
          padding: 14px;
          box-shadow: 0 1px 2px rgba(0,0,0,.04);
          display: grid;
          gap: 12px;
        }
        .workshop-editor__eyebrow {
          margin: 0 0 4px;
          font-size: 11px;
          letter-spacing: .14em;
          color: var(--accent-strong);
          font-weight: 800;
        }
        .workshop-editor__palette-head h2 { margin: 0; font-size: 18px; }
        .workshop-editor__palette-head span { font-size: 12px; color: rgba(93,83,74,.58); font-weight: 700; }
        .workshop-editor__palette-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }
        .workshop-editor__swatch {
          aspect-ratio: 1;
          border-radius: 14px;
          box-shadow: inset 0 0 0 1px rgba(93,83,74,.08);
        }
        .workshop-editor__swatch.is-active { box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px var(--accent-strong); }
        .workshop-editor__footer { padding-top: 2px; }
        .workshop-editor__secondary,
        .workshop-editor__primary { flex: 1; }
        @media (max-width: 360px) {
          .workshop-editor__tools-panel { grid-template-columns: 68px minmax(0, 1fr); }
          .workshop-editor__palette-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }
      `}</style>
    </main>
  );
}
