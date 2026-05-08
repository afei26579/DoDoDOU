import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGalleryList } from '../../features/gallery/model/api';
import type { GalleryItemCard } from '../../features/gallery/model/types';
import { listLocalProjects, type LocalProjectRecord } from '../../features/projects/model/localProjectStore';

const collectionFilters = ['全部', '最新', '最热', '我的'] as const;

function formatPatternSummary(item: GalleryItemCard) {
  const summary = item.patternSummary;
  const sizeText = summary ? `${summary.width}×${summary.height}` : `${item.coverWidth ?? '-'}×${item.coverHeight ?? '-'}`;
  const colorCount = summary?.paletteCount ?? item.tags.length;
  const beadCount = summary?.beadCount ?? null;
  return `${sizeText} · ${colorCount} 色${beadCount ? ` · ${beadCount} 颗` : ''}`;
}

function formatMyProjectSummary(project: LocalProjectRecord) {
  const progressText = project.progress ? `${project.progress.percent}%` : null;
  const detail = project.kind === 'pattern' && project.pattern
    ? `${project.pattern.width}×${project.pattern.height} · ${project.pattern.paletteCount} 色`
    : project.kind === 'progress'
      ? '拼豆进度'
      : '本地保存';
  return progressText ? `${detail} · ${progressText}` : detail;
}

export function CollectionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItemCard[]>([]);
  const [myItems, setMyItems] = useState<LocalProjectRecord[]>([]);
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
    listLocalProjects()
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

  const columns = useMemo(
    () => [items.filter((_, index) => index % 2 === 0), items.filter((_, index) => index % 2 === 1)],
    [items],
  );

  const myRecentItems = myItems.slice(0, 4);
  const myDrafts = myItems.filter((item) => item.kind === 'draft' || item.kind === 'upload').slice(0, 4);
  const myPatterns = myItems.filter((item) => item.kind === 'pattern').slice(0, 4);

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
                  <h4>草稿</h4>
                  <span>{myDrafts.length} 项</span>
                </div>
                <div className="collection-my-list">
                  {myDrafts.length > 0 ? myDrafts.map((item) => (
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
                        <p>{item.status === 'editing' ? '编辑中' : item.status === 'ready' ? '可继续编辑' : '草稿'}</p>
                      </div>
                    </article>
                  )) : <div className="collection-empty collection-empty--inline">暂无草稿，上传一张图片即可开始创作。</div>}
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
                  <h4>拼豆进度</h4>
                  <span>占位</span>
                </div>
                <div className="collection-empty collection-empty--inline">当前版本暂不保存专注拼豆进度，后续会自动记录。</div>
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
            columns.map((column, columnIndex) => (
              <div key={columnIndex} className="collection-masonry__column">
                {column.map((item) => (
                  <article
                    key={item.id}
                    className="collection-card collection-card--mauve"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
                  >
                    <div className="collection-card__topbar" aria-hidden="true">
                      <span className="collection-card__title">{item.title}</span>
                      <span className="collection-card__status">{item.sourceType === 'official' ? '官方' : '社区'}</span>
                    </div>
                    <div className="collection-card__media collection-card__media--tall" aria-hidden="true">
                      {item.coverUrl ? <img className="collection-card__image" src={item.coverUrl} alt="" /> : null}
                    </div>
                    <div className="collection-card__body">
                      <p>{formatPatternSummary(item)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ))
          ) : null}
        </section>
      ) : null}

      <button className="collection-fab" aria-label="新建作品">
        ＋
      </button>
    </main>
  );
}
