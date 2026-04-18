type DownloadSettingsModalProps = {
  onClose: () => void;
};

const gridLineOptions = ['关闭', '细线', '中线', '粗线'] as const;
const gridSpacingOptions = ['每 2 格', '每 4 格', '每 8 格'] as const;

export function DownloadSettingsModal({ onClose }: DownloadSettingsModalProps) {
  return (
    <div className="download-modal__backdrop" role="presentation" onClick={onClose}>
      <section className="download-modal" role="dialog" aria-modal="true" aria-label="下载设置弹窗" onClick={(event) => event.stopPropagation()}>
        <header className="download-modal__header">
          <div>
            <p className="eyebrow">下载设置</p>
            <h2>导出图纸</h2>
          </div>
          <button className="download-modal__close" type="button" aria-label="关闭弹窗" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="download-modal__body">
          <div className="download-modal__group">
            <strong>作者署名</strong>
            <div className="download-modal__field">温馨手工坊</div>
          </div>

          <div className="download-modal__group">
            <strong>分享码</strong>
            <div className="download-modal__field">COZY-2026</div>
          </div>

          <div className="download-modal__group">
            <strong>网格线</strong>
            <div className="choice-row">
              {gridLineOptions.map((item, index) => (
                <button key={item} className={`choice-pill ${index === 1 ? 'is-active' : ''}`} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="download-modal__group">
            <strong>网格间隔</strong>
            <div className="choice-row">
              {gridSpacingOptions.map((item, index) => (
                <button key={item} className={`choice-pill ${index === 1 ? 'is-active' : ''}`} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="download-modal__group download-modal__group--row">
            <strong>网格颜色</strong>
            <div className="download-modal__swatches" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="download-modal__checks">
            <label><input type="checkbox" defaultChecked /> 色号统计</label>
            <label><input type="checkbox" defaultChecked /> 水印添加</label>
            <label><input type="checkbox" /> 坐标数字</label>
          </div>
        </div>

        <footer className="download-modal__footer">
          <button type="button" className="download-modal__ghost" onClick={onClose}>取消</button>
          <button type="button" className="download-modal__primary">确认下载</button>
        </footer>
      </section>
    </div>
  );
}
