type WorkshopPreviewPageProps = {
  onOpenDownloadSettings: () => void;
  onOpenEditor: () => void;
  onOpenFocusMode: () => void;
};

type PreviewAction = {
  title: string;
  active: boolean;
  action?: 'download' | 'edit' | 'focus';
};

const previewStats = [
  { label: '颜色数', value: '12' },
  { label: '总豆豆', value: '1,824' },
  { label: '推荐时长', value: '2.5h' },
] as const;

const actions: PreviewAction[] = [
  { title: '去背景', active: true },
  { title: '下载图纸', active: false, action: 'download' },
  { title: '手动编辑', active: false, action: 'edit' },
  { title: '立即拼豆', active: false, action: 'focus' },
];

export function WorkshopPreviewPage({ onOpenDownloadSettings, onOpenEditor, onOpenFocusMode }: WorkshopPreviewPageProps) {
  const handleActionClick = (action?: PreviewAction['action']) => {
    if (action === 'download') {
      onOpenDownloadSettings();
      return;
    }

    if (action === 'edit') {
      onOpenEditor();
      return;
    }

    if (action === 'focus') {
      onOpenFocusMode();
    }
  };

  return (
    <main className="workshop-preview-page">
      <section className="workshop-preview-hero card-surface" aria-label="图纸预览">
        <div className="workshop-preview-hero__image" aria-hidden="true">
          <div className="workshop-preview-hero__grid" />
          <div className="workshop-preview-hero__art">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="workshop-preview-panel card-surface" aria-label="预览信息">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">工坊</p>
            <h2>图纸预览</h2>
          </div>
          <span className="workshop-preview-panel__hint">参数设置已完成</span>
        </div>

        <div className="workshop-preview-stats">
          {previewStats.map((stat) => (
            <article key={stat.label} className="workshop-preview-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>

        <div className="workshop-preview-actions">
          {actions.map((actionItem) => (
            <button
              key={actionItem.title}
              type="button"
              className={`preview-action ${actionItem.active ? 'is-active' : ''}`}
              onClick={() => handleActionClick(actionItem.action)}
            >
              {actionItem.title}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
