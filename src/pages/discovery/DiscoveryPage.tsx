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
    title: '图纸生成',
    subtitle: '一键生成像素图纸',
    badge: '智能生成',
    accent: 'mint',
    route: 'upload',
  },
  {
    title: '新的开始',
    subtitle: '空白画布',
    badge: '自由创作',
    accent: 'lavender',
    route: 'blank',
  },
] as const;

function QuickCardIcon({ route }: { route: (typeof quickActions)[number]['route'] }) {
  if (route === 'upload') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="2" y="5" width="24" height="18" rx="4" fill="rgba(255,255,255,0.9)" stroke="#4DBF8A" strokeWidth="1.5" />
        <circle cx="10" cy="12" r="3" fill="#7ED9B0" />
        <path d="M2 20 L8 14 L13 19 L18 13 L26 20" stroke="#4DBF8A" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M20 4 L23 7 L20 10" stroke="#4DBF8A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 7 L17 7" stroke="#4DBF8A" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      {[[5, 5], [13, 5], [21, 5], [5, 13], [13, 13], [21, 13], [5, 21], [13, 21], [21, 21]].map(([x, y], index) => (
        <rect
          key={`${x}-${y}`}
          x={x - 3.5}
          y={y - 3.5}
          width="7"
          height="7"
          rx="2.5"
          fill={index === 4 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)'}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
        />
      ))}
    </svg>
  );
}

const inspirationTones = ['rose', 'mint', 'amber', 'mauve', 'rose'] as const;

const beginnerSteps = [
  { step: '1', title: '上传照片', description: '挑选你喜欢的照片或灵感图' },
  { step: '2', title: '转换图纸', description: 'AI 自动为你生成像素拼豆图纸' },
  { step: '3', title: '沉浸拼豆', description: '对照图纸，开启你的手工时光' },
] as const;

export function DiscoveryPage({ onUploadImage, onOpenWorkshop, onCreateCanvas }: DiscoveryPageProps) {
  const navigate = useNavigate();
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
            <span className="quick-card__bead quick-card__bead--large" aria-hidden="true" />
            <span className="quick-card__bead quick-card__bead--medium" aria-hidden="true" />
            <span className="quick-card__bead quick-card__bead--small" aria-hidden="true" />
            <span className="quick-card__dot quick-card__dot--one" aria-hidden="true" />
            <span className="quick-card__dot quick-card__dot--two" aria-hidden="true" />
            <span className="quick-card__grid" aria-hidden="true" />
            <span className="quick-card__icon">
              <QuickCardIcon route={action.route} />
            </span>
            <strong>{action.title}</strong>
            <p>{action.subtitle}</p>
            <span className="quick-card__badge">{action.badge}</span>
            <span className="quick-card__arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
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

        <div
          className="inspiration-marquee"
          aria-label="灵感卡片列表"
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setIsPaused(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setIsPaused(false);
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== 'mouse') setIsPaused(true);
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== 'mouse') setIsPaused(false);
          }}
          onPointerCancel={(event) => {
            if (event.pointerType !== 'mouse') setIsPaused(false);
          }}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
        >
          <div className={`inspiration-track ${isPaused ? 'is-paused' : ''}`} style={{ animationPlayState: isPaused ? 'paused' : 'running' }}>
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
