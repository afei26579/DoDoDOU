const editorTools = [
  { label: '铅笔', icon: '✎', active: true },
  { label: '橡皮', icon: '⌫', active: false },
  { label: '油漆桶', icon: '▣', active: false },
  { label: '吸色器', icon: '◌', active: false },
] as const;

const colorPalette = [
  '#cfa7e8',
  '#ffd3b0',
  '#b7ead7',
  '#ffb8c4',
  '#f7e69a',
  '#9cc4f5',
  '#5d534a',
  '#ffffff',
  '#f7a8a8',
  '#9db2f8',
  '#d6e6b8',
  '#f7cf8f',
  '#e6dffd',
  '#d9f4eb',
  '#f8e7b4',
  '#fff2d8',
  '#d7f0fb',
  '#f4d6ea',
  '#d1d1d1',
  '#f2c6c6',
  '#c9d7f0',
  '#dbe8b9',
  '#f2d2a1',
  '#f8f3ee',
] as const;

export function WorkshopEditorPage() {
  return (
    <main className="editor-page" aria-label="图纸编辑页面">
      <header className="editor-header">
        <button type="button" className="editor-header__back" aria-label="返回">
          ←
        </button>
        <h1>图纸编辑</h1>
        <div className="editor-header__actions">
          <button type="button" className="editor-header__save">
            保存
          </button>
          <button type="button" className="editor-header__download">
            下载
          </button>
        </div>
      </header>

      <section className="editor-stage card-surface" aria-label="编辑画布">
        <div className="editor-stage__canvas" aria-hidden="true">
          <div className="editor-stage__grid" />
          <div className="editor-stage__art">
            {Array.from({ length: 17 }).map((_, row) =>
              Array.from({ length: 17 }).map((__, col) => {
                const cx = col - 8;
                const cy = row - 8;
                const distance = Math.sqrt(cx * cx + cy * cy);
                const isPurple = distance < 4.4;
                const isPeach = distance >= 1.2 && distance < 2.8;
                const isActive = isPurple || isPeach;
                const color = isPurple ? '#caa3e8' : isPeach ? '#ffd0aa' : '#f4efe8';

                return (
                  <span
                    key={`${row}-${col}`}
                    className={`editor-stage__pixel ${isActive ? 'is-active' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                );
              }),
            )}
          </div>
        </div>

        <div className="editor-preview-card">
          <div className="editor-preview-card__label">
            <span className="editor-preview-card__icon">▦</span>
            <span>PREVIEW</span>
          </div>
          <div className="editor-preview-card__mini" aria-hidden="true">
            <div className="editor-preview-card__mini-grid" />
            <div className="editor-preview-card__mini-art">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <div className="editor-zoom" aria-label="缩放控制">
          <button type="button">+</button>
          <span>100%</span>
          <button type="button">−</button>
        </div>
      </section>

      <section className="editor-bottom card-surface" aria-label="编辑工具与色板">
        <aside className="editor-tool-rail" aria-label="工具栏">
          {editorTools.map((tool) => (
            <button key={tool.label} type="button" className={`editor-tool ${tool.active ? 'is-active' : ''}`}>
              <span className="editor-tool__icon" aria-hidden="true">
                {tool.icon}
              </span>
              <span>{tool.label}</span>
            </button>
          ))}
        </aside>

        <div className="editor-palette-panel">
          <div className="editor-palette-panel__header">
            <p className="eyebrow">COLOR PALETTE</p>
            <span>24 Colors</span>
          </div>
          <div className="editor-palette-grid">
            {colorPalette.map((color, index) => (
              <button
                key={`${color}-${index}`}
                type="button"
                className={`editor-color ${index === 0 ? 'is-active' : ''}`}
                style={{ backgroundColor: color }}
                aria-label={`颜色 ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="editor-footer">
        <button type="button" className="editor-footer__secondary">
          一键去背景
        </button>
        <button type="button" className="editor-footer__primary">
          立即拼豆
        </button>
      </footer>
    </main>
  );
}
