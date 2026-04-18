const focusLayers = [
  { name: '当前层', count: '324', active: true },
  { name: '上一层', count: '280', active: false },
  { name: '下一层', count: '256', active: false },
] as const;

const beadList = [
  { color: '奶白', count: 128 },
  { color: '薄荷', count: 96 },
  { color: '草莓', count: 72 },
  { color: '杏橙', count: 44 },
] as const;

const strategies = ['边缘优先', '大块优先', '距离优先'] as const;

export function FocusModePage() {
  return (
    <main className="focus-mode-page" aria-label="拼豆模式页面">
      <section className="focus-mode-stage card-surface">
        <div className="focus-mode-stage__canvas" aria-hidden="true">
          <div className="focus-mode-stage__grid" />
          <div className="focus-mode-stage__art">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="focus-mode-summary card-surface">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">沉浸拼豆</p>
            <h2>当前层高亮</h2>
          </div>
          <span className="focus-mode-summary__hint">深色背景专注模式</span>
        </div>

        <div className="focus-mode-layers">
          {focusLayers.map((layer) => (
            <article key={layer.name} className={`focus-layer ${layer.active ? 'is-active' : ''}`}>
              <strong>{layer.name}</strong>
              <span>{layer.count} 颗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="focus-mode-grid">
        <article className="focus-mode-card card-surface">
          <p className="eyebrow">物料看板</p>
          <h3>当前需要的色号</h3>
          <div className="bead-list">
            {beadList.map((item) => (
              <div key={item.color} className="bead-item">
                <span className="bead-item__dot" aria-hidden="true" />
                <strong>{item.color}</strong>
                <span>{item.count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="focus-mode-card card-surface">
          <p className="eyebrow">拼豆策略</p>
          <h3>选择跟做方式</h3>
          <div className="strategy-row">
            {strategies.map((item, index) => (
              <button key={item} className={`strategy-pill ${index === 0 ? 'is-active' : ''}`} type="button">
                {item}
              </button>
            ))}
          </div>
        </article>
      </section>

      <div className="focus-mode-actions">
        <button className="focus-mode-actions__secondary" type="button">
          返回预览
        </button>
        <button className="focus-mode-actions__primary" type="button">
          开始拼豆
        </button>
      </div>
    </main>
  );
}
