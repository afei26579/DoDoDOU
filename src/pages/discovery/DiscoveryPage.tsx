import { useEffect, useRef, useState, type ChangeEvent } from 'react';

type DiscoveryPageProps = {
  onUploadImage: (image: { name: string; type: string; size: number; dataUrl: string }) => void;
  onOpenWorkshop: () => void;
};

const quickActions = [
  {
    title: '照片变图纸',
    subtitle: '上传美好瞬间',
    accent: 'mint',
    icon: '◌',
    route: 'upload',
  },
  {
    title: 'AI 灵感生成',
    subtitle: '描述你的想象',
    accent: 'lavender',
    icon: '✦',
    route: 'workshop',
  },
] as const;

const continueProjects = [
  { title: '森林小屋', progress: '72%' },
  { title: '草莓兔兔', progress: '45%' },
  { title: '猫咪下午茶', progress: '91%' },
] as const;

const inspirationCards = [
  { title: '春日樱花', meta: '热度 1.2w', tone: 'rose' },
  { title: '薄荷海洋', meta: '热度 8.7k', tone: 'mint' },
  { title: '午后饼干', meta: '热度 6.4k', tone: 'amber' },
  { title: '星光兔子', meta: '热度 9.1k', tone: 'mauve' },
] as const;

export function DiscoveryPage({ onUploadImage, onOpenWorkshop }: DiscoveryPageProps) {
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    onUploadImage({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
    });
  };

  useEffect(() => {
    const marquee = marqueeRef.current;
    if (!marquee) return;

    let animationFrame = 0;

    const tick = () => {
      if (!isPaused) {
        const maxScrollLeft = marquee.scrollWidth - marquee.clientWidth;
        const nextScrollLeft = marquee.scrollLeft + 0.6;

        marquee.scrollLeft = nextScrollLeft >= maxScrollLeft ? 0 : nextScrollLeft;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isPaused]);

  return (
    <main className="discovery-page">
      <section className="home-hero" aria-label="首页问候">
        <h2>今天想拼点什么？</h2>
        <div className="home-hero__avatar" aria-hidden="true">
          <span>☁</span>
        </div>
      </section>

      <section className="quick-actions" aria-label="主要入口">
        {quickActions.map((action) => (
          <button
            key={action.title}
            className={`quick-card quick-card--${action.accent}`}
            data-route={action.route}
            onClick={action.route === 'upload' ? () => fileInputRef.current?.click() : onOpenWorkshop}
          >
            <span className="quick-card__icon" aria-hidden="true">{action.icon}</span>
            <strong>{action.title}</strong>
            <p>{action.subtitle}</p>
          </button>
        ))}
      </section>
      <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={handleImageSelected} />

      

      <section className="section-block" aria-label="继续拼豆">
        <div className="section-heading-row">
          <h3>继续拼豆</h3>
        </div>

        <div className="project-strip">
          {continueProjects.map((project) => (
            <article key={project.title} className="project-card">
              <div className="project-card__preview" aria-hidden="true">
                <span className="project-card__progress">{project.progress}</span>
              </div>
              <div className="project-card__body">
                <strong>{project.title}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block" aria-label="灵感画廊">
        <div className="section-heading-row">
          <h3>灵感画廊</h3>
        </div>

        <div className="inspiration-marquee" aria-label="灵感卡片列表">
          <div className="inspiration-track" ref={marqueeRef} onPointerEnter={() => setIsPaused(true)} onPointerLeave={() => setIsPaused(false)}>
            {Array.from({ length: 2 }).flatMap((_, repeatIndex) =>
              inspirationCards.map((card) => (
                <article
                  key={`${repeatIndex}-${card.title}`}
                  className={`inspiration-card inspiration-card--${card.tone}`}
                >
                  <div className="inspiration-card__art" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div>
                    <strong>{card.title}</strong>
                    <p>{card.meta}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
