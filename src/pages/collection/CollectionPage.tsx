import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGalleryList } from '../../features/gallery/model/api';
import type { GalleryItemCard } from '../../features/gallery/model/types';
import {
  groupWorkshopProjects,
  listWorkshopProjects,
  type WorkshopProjectCard,
  type WorkshopProjectRecord,
} from '../../features/workshop/model/projectStore';

const collectionFilters = ['全部', '最新', '最热', '我的'] as const;
const collectionCardBackgrounds = ['#F9F0FF', '#F0FBF6', '#FFF8F0', '#FFF0F6', '#EDF2FF'];

function formatPatternSummary(item: GalleryItemCard) {
  const summary = item.patternSummary;
  const sizeText = summary ? `${summary.width}×${summary.height}` : `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'}`;
  const colorCount = summary?.paletteCount ?? item.tags.length;
  const beadCount = summary?.beadCount ?? null;
  return `${sizeText} · ${colorCount} 色${beadCount ? ` · ${beadCount} 颗` : ''}`;
}

function getPatternMeta(item: GalleryItemCard) {
  const summary = item.patternSummary;
  return {
    size: summary ? `${summary.width}×${summary.height}` : `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'}`,
    colors: `${summary?.paletteCount ?? item.tags.length}色`,
    beads: summary?.beadCount ? `${summary.beadCount}颗` : '图纸',
  };
}

function formatMyProjectSummary(project: WorkshopProjectCard) {
  const progressText = project.progress ? `${project.progress.percent}%` : null;
  const detail = project.beadingState === 'progressing'
    ? '拼豆进行中'
    : project.pattern
      ? `${project.pattern.width}×${project.pattern.height} · ${project.pattern.paletteCount} 色`
      : '图纸';
  return progressText ? `${detail} · ${progressText}` : detail;
}

export function CollectionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItemCard[]>([]);
  const [myItems, setMyItems] = useState<WorkshopProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [myLoading, setMyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<(typeof collectionFilters)[number]>('全部');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGalleryList({ pageSize: 24, sort: 'latest' })
      .then((response) => {
        if (!alive) return;
        setItems(response.items);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '加载画册失败');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setMyLoading(true);
    listWorkshopProjects()
      .then((projects) => {
        if (!alive) return;
        setMyItems(projects);
      })
      .catch(() => {
        if (!alive) return;
        setMyItems([]);
      })
      .finally(() => {
        if (!alive) return;
        setMyLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const myGroups = useMemo(() => groupWorkshopProjects(myItems), [myItems]);
  const myRecentItems = myGroups.recent.slice(0, 4);
  const myPatterns = myGroups.patterns.slice(0, 4);
  const myProgressing = myGroups.progressing.slice(0, 4);

  return (
    <main className="collection-page">
      <section className="collection-hero" aria-label="画册问候">
        <h2>记录每一份创作的温暖</h2>
        <div className="collection-hero__avatar" aria-hidden="true">
          <span>☁</span>
        </div>
      </section>

      <section className="collection-filters" aria-label="作品筛选">
        {collectionFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`filter-chip ${activeFilter === filter ? 'is-active' : ''}`}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </section>

      {activeFilter === '我的' ? (
        <section className="collection-my-library" aria-label="我的作品">
          <div className="section-heading-row">
            <h3>我的</h3>
          </div>

          {myLoading ? <div className="collection-empty">正在读取本地作品…</div> : null}

          {!myLoading && myItems.length === 0 ? (
            <div className="collection-empty">这里会显示你保存的图纸、草稿和最近进度。</div>
          ) : null}

          {!myLoading && myItems.length > 0 ? (
            <div className="collection-my-sections">
              <section>
                <div className="collection-my-section__header">
                  <h4>最近打开</h4>
                  <span>{myRecentItems.length} 项</span>
                </div>
                <div className="collection-my-list">
                  {myRecentItems.map((item) => (
                    <article
                      key={item.id}
                      className="collection-my-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/workshop/editor/${encodeURIComponent(item.id)}`)}
                    >
                      <div className="collection-my-card__media" aria-hidden="true">
                        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                      </div>
                      <div className="collection-my-card__body">
                        <strong>{item.title}</strong>
                        <p>{formatMyProjectSummary(item)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <div className="collection-my-section__header">
                  <h4>图纸</h4>
                  <span>{myPatterns.length} 项</span>
                </div>
                <div className="collection-my-list">
                  {myPatterns.length > 0 ? myPatterns.map((item) => (
                    <article
                      key={item.id}
                      className="collection-my-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/workshop/result/${encodeURIComponent(item.id)}`)}
                    >
                      <div className="collection-my-card__media" aria-hidden="true">
                        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                      </div>
                      <div className="collection-my-card__body">
                        <strong>{item.title}</strong>
                        <p>{formatMyProjectSummary(item)}</p>
                      </div>
                    </article>
                  )) : <div className="collection-empty collection-empty--inline">完成图纸生成后，它会出现在这里。</div>}
                </div>
              </section>

              <section>
                <div className="collection-my-section__header">
                  <h4>拼豆进行中</h4>
                  <span>{myProgressing.length} 项</span>
                </div>
                <div className="collection-my-list">
                  {myProgressing.length > 0 ? myProgressing.map((item) => (
                    <article
                      key={item.id}
                      className="collection-my-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/workshop/focus/${encodeURIComponent(item.id)}`)}
                    >
                      <div className="collection-my-card__media" aria-hidden="true">
                        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                      </div>
                      <div className="collection-my-card__body">
                        <strong>{item.title}</strong>
                        <p>{formatMyProjectSummary(item)}</p>
                      </div>
                    </article>
                  )) : <div className="collection-empty collection-empty--inline">开始专注拼豆后，这里会显示进行中的项目。</div>}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeFilter !== '我的' ? (
        <section className="collection-masonry" aria-label="作品列表">
          {loading ? <div className="collection-empty">正在加载画册…</div> : null}
          {error ? <div className="collection-empty">{error}</div> : null}
          {!loading && !error ? (
            items.map((item, index) => {
              const meta = getPatternMeta(item);
              return (
                <article
                  key={item.id}
                  className="collection-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
                >
                  <div className="collection-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }} aria-hidden="true">
                    {item.coverUrl ? (
                      <img
                        className="collection-card__image"
                        src={item.coverUrl}
                        alt=""
                        width={item.coverWidth}
                        height={item.coverHeight}
                      />
                    ) : null}
                    <button type="button" className="collection-card__favorite" aria-label="收藏图纸" tabIndex={-1}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 21s-8.5-6.7-8.5-12.2C3.5 6.2 5.5 4 8 4c1.7 0 3.1.9 4 2.2C12.9 4.9 14.3 4 16 4c2.5 0 4.5 2.2 4.5 4.8C20.5 14.3 12 21 12 21Z" />
                      </svg>
                    </button>
                    <span className="collection-card__status">{item.sourceType === 'official' ? '官方' : '社区'}</span>
                  </div>
                  <div className="collection-card__body">
                    <h3 className="collection-card__title">{item.title}</h3>
                    <div className="collection-card__meta" aria-label={formatPatternSummary(item)}>
                      <span className="collection-card__pill collection-card__pill--size">{meta.size}</span>
                      <span className="collection-card__pill collection-card__pill--color">{meta.colors}</span>
                      <span className="collection-card__pill collection-card__pill--count">{meta.beads}</span>
                    </div>
                  </div>
                </article>
              );
            })
          ) : null}
        </section>
      ) : null}

      <button className="collection-fab" aria-label="新建作品">
        ＋
      </button>
    </main>
  );
}
