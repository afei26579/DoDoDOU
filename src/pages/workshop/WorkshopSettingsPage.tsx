type WorkshopSettingsPageProps = {
  onGeneratePreview: () => void;
};

const canvasSizes = ['15×15', '24×24', '32×32', '48×48'] as const;

const paletteOptions = [
  { name: 'Perler', active: true },
  { name: 'Hama', active: false },
  { name: 'Nabbi', active: false },
] as const;

const styleOptions = [
  { name: '写实', active: true },
  { name: '卡通', active: false },
  { name: '精简', active: false },
] as const;

const stats = [
  { label: '颜色数', value: '12' },
  { label: '总豆豆', value: '1,824' },
  { label: '图纸密度', value: '中等' },
] as const;

export function WorkshopSettingsPage({ onGeneratePreview }: WorkshopSettingsPageProps) {
  return (
    <main className="workshop-settings-page">
      <section className="workshop-settings-hero card-surface" aria-label="预览图">
        <div className="workshop-settings-hero__image" aria-hidden="true">
          <span className="workshop-settings-hero__tag">Settings</span>
        </div>
      </section>

      <section className="workshop-settings-panel card-surface" aria-label="工坊参数设置">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">工坊</p>
            <h2>参数设置</h2>
          </div>
          <span className="workshop-settings-panel__hint">图纸生成前的关键配置</span>
        </div>

        <div className="workshop-settings-group">
          <div className="workshop-settings-group__label">
            <strong>画布尺寸</strong>
            <span>选择图纸规格</span>
          </div>
          <div className="size-toggle">
            {canvasSizes.map((size, index) => (
              <button key={size} className={`size-toggle__item ${index === 0 ? 'is-active' : ''}`} type="button">
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="workshop-settings-group">
          <div className="workshop-settings-group__label">
            <strong>品牌色板</strong>
            <span>Perler / Hama / Nabbi</span>
          </div>
          <div className="choice-row">
            {paletteOptions.map((item) => (
              <button key={item.name} className={`choice-pill ${item.active ? 'is-active' : ''}`} type="button">
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="workshop-settings-group">
          <div className="workshop-settings-group__label">
            <strong>风格选择</strong>
            <span>切换图纸表现方式</span>
          </div>
          <div className="choice-row">
            {styleOptions.map((item) => (
              <button key={item.name} className={`choice-pill ${item.active ? 'is-active' : ''}`} type="button">
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="workshop-settings-group">
          <div className="workshop-settings-group__label">
            <strong>颜色合并阈值</strong>
            <span>让相近颜色更统一</span>
          </div>
          <div className="range-meter" aria-hidden="true">
            <div className="range-meter__track" />
            <div className="range-meter__fill" />
            <div className="range-meter__thumb" />
          </div>
        </div>
      </section>

      <section className="workshop-stats" aria-label="生成统计">
        {stats.map((stat) => (
          <article key={stat.label} className="stat-card card-surface">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <button className="workshop-settings-next" type="button" onClick={onGeneratePreview}>
        生成预览
      </button>
    </main>
  );
}
