import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGalleryList } from '../../features/gallery/model/api';
import type { GalleryItemCard } from '../../features/gallery/model/types';

type DiscoveryPageProps = {
  onUploadImage: (image: { name: string; type: string; size: number; dataUrl: string }) => void;
  onOpenWorkshop: () => void;
  onCreateCanvas: () => void;
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
    title: '新的开始',
    subtitle: '创建空白画布',
    accent: 'lavender',
    icon: '✦',
    route: 'blank',
  },
] as const;

const inspirationTones = ['rose', 'mint', 'amber', 'mauve', 'rose'] as const;

const beginnerSteps = [
  { step: '1', title: '上传照片', description: '挑选你喜欢的照片或灵感图' },
  { step: '2', title: '转换图纸', description: 'AI 自动为你生成像素拼豆图纸' },
  { step: '3', title: '沉浸拼豆', description: '对照图纸，开启你的手工时光' },
] as const;

export function DiscoveryPage({ onUploadImage, onOpenWorkshop, onCreateCanvas }: DiscoveryPageProps) {
  const navigate = useNavigate();
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [inspirationItems, setInspirationItems] = useState<GalleryItemCard[]>([]);

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
    let alive = true;

    fetchGalleryList({ pageSize: 5, sort: 'latest' })
      .then((response) => {
        if (!alive) return;
        setInspirationItems(response.items.slice(0, 5));
      })
      .catch((error) => {
        console.debug('[discovery] inspiration gallery load failed', error);
      });

    return () => {
      alive = false;
    };
  }, []);

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
      </section>

      <section className="quick-actions" aria-label="主要入口">
        {quickActions.map((action) => (
          <button
            key={action.title}
            className={`quick-card quick-card--${action.accent}`}
            data-route={action.route}
            onClick={action.route === 'upload' ? () => fileInputRef.current?.click() : action.route === 'blank' ? onCreateCanvas : onOpenWorkshop}
          >
            <span className="quick-card__icon" aria-hidden="true">{action.icon}</span>
            <strong>{action.title}</strong>
            <p>{action.subtitle}</p>
          </button>
        ))}
      </section>
      <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={handleImageSelected} />

      

      <section className="section-block" aria-label="新手入门">
        <div className="section-heading-row">
          <h3>新手入门</h3>
        </div>

        <div className="beginner-guide">
          {beginnerSteps.map((item) => (
            <div key={item.step} className="beginner-guide__item">
              <span className="beginner-guide__badge">{item.step}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </div>
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
              inspirationItems.map((item, index) => (
                <article
                  key={`${repeatIndex}-${item.id}`}
                  className={`inspiration-card inspiration-card--${inspirationTones[index % inspirationTones.length]}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    navigate(`/collection/${encodeURIComponent(item.id)}`);
                  }}
                >
                  <div className="inspiration-card__art">
                    <img src={item.previewUrl ?? item.coverUrl} alt={item.title} />
                  </div>
                  <div>
                    <strong>{item.title}</strong>
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
