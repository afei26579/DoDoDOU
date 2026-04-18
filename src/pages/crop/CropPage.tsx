type CropPageProps = {
  onNext: () => void;
};

const cropToolbar = [
  { label: '旋转', icon: '↻' },
  { label: '水平镜像', icon: '⇋' },
  { label: '垂直镜像', icon: '⇅' },
  { label: '重置', icon: '↺' },
] as const;

const cropSteps = [
  { title: '上传图片', desc: '从本地选择一张图片开始' },
  { title: '拖动裁剪', desc: '调整显示区域与构图' },
  { title: '下一步', desc: '进入工坊参数设置' },
] as const;

export function CropPage({ onNext }: CropPageProps) {
  return (
    <main className="crop-page" aria-label="图片裁剪页面">
      <section className="crop-upload card-surface">
        <div className="crop-upload__dropzone">
          <div className="crop-upload__image" aria-hidden="true">
            <div className="crop-stage__frame">
              <span className="crop-stage__corner crop-stage__corner--tl" />
              <span className="crop-stage__corner crop-stage__corner--tr" />
              <span className="crop-stage__corner crop-stage__corner--bl" />
              <span className="crop-stage__corner crop-stage__corner--br" />
              <div className="crop-stage__image" />
              <div className="crop-stage__grid" />
            </div>
          </div>
          <div className="crop-upload__hint">
            <p className="eyebrow">上传本地图片</p>
            <h2>拖入图片或点击上传</h2>
            <p>支持 JPG、PNG、WEBP，先选择素材再进行裁剪。</p>
          </div>
          <button className="crop-upload__button" type="button">
            选择图片
          </button>
        </div>
      </section>

      <section className="crop-toolbar card-surface" aria-label="裁剪工具栏">
        {cropToolbar.map((tool, index) => (
          <button key={tool.label} className={`crop-tool ${index === 0 ? 'is-active' : ''}`} type="button">
            <span className="crop-tool__icon" aria-hidden="true">
              {tool.icon}
            </span>
            <span>{tool.label}</span>
          </button>
        ))}
      </section>

      <section className="crop-info" aria-label="裁剪提示">
        <div>
          <p className="eyebrow">图片裁剪</p>
          <h2>将图片拖到合适的构图区域</h2>
        </div>
        <p>支持旋转、镜像、重置，裁剪完成后进入参数设置页。</p>
      </section>

      <section className="crop-steps" aria-label="流程说明">
        {cropSteps.map((step, index) => (
          <article key={step.title} className="crop-step card-surface">
            <div className="crop-step__index">0{index + 1}</div>
            <div>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
            </div>
          </article>
        ))}
      </section>

      <button className="crop-next-button" type="button" onClick={onNext}>
        下一步
      </button>
    </main>
  );
}
