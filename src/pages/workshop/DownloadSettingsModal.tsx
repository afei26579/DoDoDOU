type DownloadSettingsModalProps = {
  onClose: () => void;
};

const gridLineColors = ['#6a6665', '#ff3b2f', '#1d2cff', '#178f17', '#8a0f8e', '#f6a400'];

function Toggle({ checked }: { checked: boolean }) {
  return <span className={`download-switch ${checked ? 'is-on' : ''}`} aria-hidden="true" />;
}

function Field({ placeholder }: { placeholder: string }) {
  return <input className="download-modal__input" type="text" placeholder={placeholder} />;
}

export function DownloadSettingsModal({ onClose }: DownloadSettingsModalProps) {
  return (
    <div className="download-modal__backdrop" role="presentation" onClick={onClose}>
      <section className="download-modal" role="dialog" aria-modal="true" aria-label="下载图纸设置" onClick={(event) => event.stopPropagation()}>
        <header className="download-modal__header">
          <div>
            <p className="download-modal__eyebrow">下载图纸</p>
            <h2>下载设置</h2>
          </div>
          <button className="download-modal__close" type="button" aria-label="关闭弹窗" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="download-modal__handle" aria-hidden="true" />

        <div className="download-modal__body">
          <label className="download-modal__field-group">
            <span>作者署名</span>
            <Field placeholder="@你的社交账号（留空则不显示）" />
          </label>

          <label className="download-modal__field-group">
            <span>画廊分享码</span>
            <Field placeholder="发布到画廊后获得的分享码（留空则不显示）" />
          </label>

          <div className="download-modal__setting-row">
            <span>显示网格线</span>
            <Toggle checked />
          </div>

          <label className="download-modal__field-group download-modal__field-group--compact">
            <span>网格线间隔（每 N 格画一条线）</span>
            <div className="download-modal__slider-row">
              <input className="download-modal__range" type="range" min="2" max="20" defaultValue="10" />
              <strong>10</strong>
            </div>
          </label>

          <div className="download-modal__field-group">
            <span>网格线颜色</span>
            <div className="download-modal__swatch-row" aria-label="网格线颜色选择">
              {gridLineColors.map((color, index) => (
                <button key={color} type="button" className={`download-modal__swatch ${index === 0 ? 'is-active' : ''}`} style={{ background: color }} aria-label={`选择颜色 ${color}`} />
              ))}
            </div>
          </div>

          <div className="download-modal__toggle-list">
            <div className="download-modal__setting-row">
              <span>显示坐标数字</span>
              <Toggle checked />
            </div>
            <div className="download-modal__setting-row">
              <span>隐藏格内色号</span>
              <Toggle checked={false} />
            </div>
            <div className="download-modal__setting-row">
              <span>包含色号统计</span>
              <Toggle checked />
            </div>
            <div className="download-modal__setting-row">
              <span>水平镜像</span>
              <Toggle checked={false} />
            </div>
            <div className="download-modal__setting-row">
              <span>添加水印</span>
              <Toggle checked={false} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
