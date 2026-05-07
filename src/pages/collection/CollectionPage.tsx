import { useEffect, useMemo, useState } from 'react';
import { fetchGalleryList } from '../../features/gallery/model/api';
import type { GalleryItemCard } from '../../features/gallery/model/types';

const collectionFilters = ['全部', '最新', '最热', '我的'] as const;

function formatPatternSummary(item: GalleryItemCard) {
  return `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'} · ${item.tags.length > 0 ? item.tags.length : item.stats.hotScore ? item.stats.hotScore : 0} 色`;
}

export function CollectionPage() {
  const [items, setItems] = useState<GalleryItemCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGalleryList({ pageSize: 24, sort: 'latest' })
      .then((response) => {
        if (!alive) return;
        setItems(response.items);
        setError(null);
        console.debug('[gallery] list response', response.items.map((item) => ({
          id: item.id,
          title: item.title,
          coverUrl: item.coverUrl,
          size: `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'}`,
          colorCount: item.tags.length,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
        })));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '加载画册失败');
        console.debug('[gallery] list load failed', err);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const columns = useMemo(
    () => [items.filter((_, index) => index % 2 === 0), items.filter((_, index) => index % 2 === 1)],
    [items],
  );

  return (
    <main className="collection-page">
      <section className="collection-hero" aria-label="画册问候">
        <h2>记录每一份创作的温暖</h2>
        <div className="collection-hero__avatar" aria-hidden="true">
          <span>☁</span>
        </div>
      </section>

      <section className="collection-filters" aria-label="作品筛选">
        {collectionFilters.map((filter, index) => (
          <button key={filter} className={`filter-chip ${index === 0 ? 'is-active' : ''}`}>
            {filter}
          </button>
        ))}
      </section>

      <section className="collection-masonry" aria-label="作品列表">
        {loading ? <div className="collection-empty">正在加载画册…</div> : null}
        {error ? <div className="collection-empty">{error}</div> : null}
        {!loading && !error ? (
          columns.map((column, columnIndex) => (
            <div key={columnIndex} className="collection-masonry__column">
              {column.map((item) => (
                <article
                  key={item.id}
                  className="collection-card collection-card--mauve"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    console.debug('[gallery] selected item', {
                      id: item.id,
                      title: item.title,
                      coverUrl: item.coverUrl,
                      previewSize: `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'}`,
                      colorCount: item.tags.length,
                      tags: item.tags,
                      sourceType: item.sourceType,
                      style: item.style,
                      brand: item.brand,
                      createdAt: item.createdAt,
                      publishedAt: item.publishedAt,
                      stats: item.stats,
                    });
                  }}
                >
                  <div className="collection-card__media collection-card__media--tall" aria-hidden="true">
                    {item.coverUrl ? <img className="collection-card__image" src={item.coverUrl} alt="" /> : null}
                    <span className="collection-card__status">{item.sourceType === 'official' ? '官方' : '社区'}</span>
                  </div>
                  <div className="collection-card__body">
                    <strong>{item.title}</strong>
                    <p>{formatPatternSummary(item)}</p>
                  </div>
                </article>
              ))}
            </div>
          ))
        ) : null}
      </section>

      <button className="collection-fab" aria-label="新建作品">
        ＋
      </button>
    </main>
  );
}
