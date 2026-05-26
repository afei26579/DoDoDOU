import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/model/AuthProvider';
import {
  addGalleryFavorite,
  fetchGalleryList,
  fetchMyGalleryItems,
  removeGalleryFavorite,
  syncFavoriteGalleryItems,
} from '../../features/gallery/model/api';
import type { GalleryItemCard, GallerySortKey } from '../../features/gallery/model/types';
import {
  groupWorkshopProjects,
  listLocalWorkshopProjects,
  listWorkshopProjects,
  type WorkshopProjectCard,
  type WorkshopProjectRecord,
} from '../../features/workshop/model/projectStore';
import { syncRemoteWorkshopProjects } from '../../features/workshop/model/projectApi';

const collectionFilters = [
  { label: '全部', tab: 'all', iconSrc: '/assets/system_icons/all.png', activeIconSrc: '/assets/system_icons/all_active.png' },
  { label: '最新', tab: 'latest', iconSrc: '/assets/system_icons/latest.png', activeIconSrc: '/assets/system_icons/latest_active.png' },
  { label: '最热', tab: 'hot', iconSrc: '/assets/system_icons/hot.png', activeIconSrc: '/assets/system_icons/hot_active.png' },
  { label: '我的', tab: 'my', iconSrc: '/assets/system_icons/my.png', activeIconSrc: '/assets/system_icons/my_active.png' },
] as const;
const collectionCardBackgrounds = ['#F9F0FF', '#F0FBF6', '#FFF8F0', '#FFF0F6', '#EDF2FF'];
const FAVORITE_GALLERY_ITEM_IDS_KEY = 'dodoudou.favoriteGalleryItemIds';

type CollectionFilter = (typeof collectionFilters)[number]['label'];

function getFilterFromParams(searchParams: URLSearchParams): CollectionFilter {
  const tab = searchParams.get('tab');
  const order = searchParams.get('order');
  if (tab === 'my') return '我的';
  if (tab === 'latest') return '最新';
  if (tab === 'hot') return '最热';
  if (tab === 'all') return '全部';
  if (order === 'latest' || order === 'lastest') return '最新';
  if (order === 'hot') return '最热';
  return '全部';
}

function getSortFromFilter(filter: CollectionFilter): GallerySortKey {
  if (filter === '我的') return 'recommended';
  return 'latest';
}

function getGalleryTimestamp(item: GalleryItemCard) {
  return item.publishedAt ?? item.createdAt;
}

function sortGalleryItems(items: GalleryItemCard[], filter: CollectionFilter, favoriteItemIds: Set<string>) {
  return [...items].sort((a, b) => {
    if (filter === '全部' || filter === '最热') {
      const favoriteDiff = Number(favoriteItemIds.has(b.id)) - Number(favoriteItemIds.has(a.id));
      if (favoriteDiff !== 0) return favoriteDiff;
    }

    return getGalleryTimestamp(b).localeCompare(getGalleryTimestamp(a));
  });
}

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

function getGalleryStatusLabel(status: GalleryItemCard['status']) {
  if (status === 'pending_review') return '待审核';
  if (status === 'published') return '已发布';
  if (status === 'rejected') return '未通过';
  if (status === 'offline') return '已下架';
  return '草稿';
}

function upsertGalleryItem(items: GalleryItemCard[], item: GalleryItemCard) {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [item, ...items];
  const next = [...items];
  next[index] = { ...next[index], ...item };
  return next;
}

function applyFavoriteState(items: GalleryItemCard[], favoriteIds: Set<string>) {
  return items.map((item) => ({
    ...item,
    isFavorite: favoriteIds.has(item.id),
  }));
}

function readFavoriteGalleryItemIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITE_GALLERY_ITEM_IDS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavoriteGalleryItemIds(ids: string[]) {
  window.localStorage.setItem(FAVORITE_GALLERY_ITEM_IDS_KEY, JSON.stringify(ids));
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { status: authStatus, user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<GalleryItemCard[]>([]);
  const [myItems, setMyItems] = useState<WorkshopProjectRecord[]>([]);
  const [myPublishedItems, setMyPublishedItems] = useState<GalleryItemCard[]>([]);
  const [favoriteGalleryItems, setFavoriteGalleryItems] = useState<GalleryItemCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [myLoading, setMyLoading] = useState(true);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteItemIds, setFavoriteItemIds] = useState<string[]>(() => readFavoriteGalleryItemIds());
  const [favoriteSyncMessage, setFavoriteSyncMessage] = useState('');
  const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<string[]>([]);
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [beadingExpanded, setBeadingExpanded] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [isSyncingProjects, setIsSyncingProjects] = useState(false);
  const [projectSyncMessage, setProjectSyncMessage] = useState('');
  const activeFilter = useMemo(() => getFilterFromParams(searchParams), [searchParams]);
  const gallerySort = useMemo(() => getSortFromFilter(activeFilter), [activeFilter]);
  const migrationStorageKey = user ? `dodoudou.projects.migration.completed.${user.id}` : '';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGalleryList({ pageSize: 24, sort: gallerySort })
      .then((response) => {
        if (!alive) return;
        const favoriteIds = new Set(favoriteItemIds);
        setItems(applyFavoriteState(response.items, favoriteIds));
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
  }, [favoriteItemIds, gallerySort]);

  useEffect(() => {
    if (authStatus === 'loading') return;
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
  }, [authStatus, isAuthenticated, user?.id]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!isAuthenticated) {
      setMyPublishedItems([]);
      setPublishedLoading(false);
      return;
    }

    let alive = true;
    setPublishedLoading(true);
    fetchMyGalleryItems()
      .then((response) => {
        if (!alive) return;
        setMyPublishedItems(response.items);
      })
      .catch(() => {
        if (!alive) return;
        setMyPublishedItems([]);
      })
      .finally(() => {
        if (!alive) return;
        setPublishedLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authStatus, isAuthenticated, user?.id]);

  useEffect(() => {
    if (authStatus === 'loading') return;

    if (!isAuthenticated) {
      const localFavoriteIds = readFavoriteGalleryItemIds();
      setFavoriteItemIds(localFavoriteIds);
      setFavoriteGalleryItems([]);
      setFavoriteSyncMessage('');
      return;
    }

    let alive = true;
    const localFavoriteIds = readFavoriteGalleryItemIds();
    setFavoriteSyncMessage('正在同步收藏');
    syncFavoriteGalleryItems(localFavoriteIds)
      .then((response) => {
        if (!alive) return;
        writeFavoriteGalleryItemIds(response.itemIds);
        setFavoriteItemIds(response.itemIds);
        setFavoriteGalleryItems(response.items);
        const favoriteIds = new Set(response.itemIds);
        setItems((current) => applyFavoriteState(current, favoriteIds));
        setFavoriteSyncMessage(response.itemIds.length ? `已同步 ${response.itemIds.length} 个收藏` : '收藏已与账号同步');
      })
      .catch((err) => {
        if (!alive) return;
        setFavoriteSyncMessage(err instanceof Error ? err.message : '收藏同步失败');
      });

    return () => {
      alive = false;
    };
  }, [authStatus, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !migrationStorageKey) {
      setLocalProjectCount(0);
      return;
    }

    if (localStorage.getItem(migrationStorageKey) === 'true') {
      setLocalProjectCount(0);
      return;
    }

    let alive = true;
    void listLocalWorkshopProjects()
      .then((projects) => {
        if (!alive) return;
        setLocalProjectCount(projects.length);
      })
      .catch(() => {
        if (!alive) return;
        setLocalProjectCount(0);
      });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, migrationStorageKey]);

  const handleSyncLocalProjects = async () => {
    if (!migrationStorageKey || isSyncingProjects) return;

    setIsSyncingProjects(true);
    setProjectSyncMessage('');
    try {
      const localProjects = await listLocalWorkshopProjects();
      if (!localProjects.length) {
        localStorage.setItem(migrationStorageKey, 'true');
        setLocalProjectCount(0);
        return;
      }

      const response = await syncRemoteWorkshopProjects(localProjects);
      localStorage.setItem(migrationStorageKey, 'true');
      setLocalProjectCount(0);
      setMyItems(response.items);
      setProjectSyncMessage(`已同步 ${response.stats.created + response.stats.updated + response.stats.conflicted} 个作品`);
    } catch (err) {
      setProjectSyncMessage(err instanceof Error ? err.message : '作品同步失败，请稍后再试');
    } finally {
      setIsSyncingProjects(false);
    }
  };

  const dismissLocalProjectSync = () => {
    if (!migrationStorageKey) return;
    localStorage.setItem(migrationStorageKey, 'true');
    setLocalProjectCount(0);
    setProjectSyncMessage('');
  };

  const myGroups = useMemo(() => groupWorkshopProjects(myItems), [myItems]);
  const myRecentItems = myGroups.recent.slice(0, 5);
  const myPatterns = myGroups.patterns;
  const myProgressing = myGroups.progressing;
  const favoriteItemIdSet = useMemo(() => new Set(favoriteItemIds), [favoriteItemIds]);
  const visibleGalleryItems = useMemo(() => sortGalleryItems(items, activeFilter, favoriteItemIdSet), [activeFilter, favoriteItemIdSet, items]);
  const favoriteItems = useMemo(() => {
    const byId = new Map<string, GalleryItemCard>();
    [...items, ...favoriteGalleryItems].forEach((item) => byId.set(item.id, item));
    return favoriteItemIds.flatMap((itemId) => {
      const item = byId.get(itemId);
      return item ? [{ ...item, isFavorite: true }] : [];
    });
  }, [favoriteGalleryItems, favoriteItemIds, items]);
  const myPatternCards = useMemo(() => [
    ...favoriteItems.map((item, index) => ({
      id: `favorite-${item.id}`,
      title: item.title,
      summary: formatPatternSummary(item),
      meta: getPatternMeta(item),
      imageUrl: item.coverUrl,
      href: `/collection/${encodeURIComponent(item.id)}`,
      badge: '收藏',
      background: collectionCardBackgrounds[index % collectionCardBackgrounds.length],
    })),
    ...myPatterns.map((item, index) => ({
      id: `pattern-${item.id}`,
      title: item.title,
      summary: formatMyProjectSummary(item),
      meta: {
        size: item.pattern ? `${item.pattern.width}×${item.pattern.height}` : '图纸',
        colors: item.pattern ? `${item.pattern.paletteCount}色` : '',
        beads: item.pattern ? `${item.pattern.beadCount}颗` : '',
      },
      imageUrl: item.previewUrl ?? item.coverUrl ?? '',
      href: `/workshop/result/${encodeURIComponent(item.id)}`,
      badge: '我的',
      background: collectionCardBackgrounds[(favoriteItems.length + index) % collectionCardBackgrounds.length],
    })),
  ], [favoriteItems, myPatterns]);
  const visiblePatternCards = patternsExpanded ? myPatternCards : myPatternCards.slice(0, 2);
  const visibleBeadingItems = beadingExpanded ? myProgressing : myProgressing.slice(0, 3);

  const toggleFavorite = async (item: GalleryItemCard) => {
    const itemId = item.id;
    const wasFavorite = favoriteItemIdSet.has(itemId);
    const nextFavoriteIds = wasFavorite ? favoriteItemIds.filter((id) => id !== itemId) : [...favoriteItemIds, itemId];
    const previousFavoriteIds = favoriteItemIds;
    const nextFavoriteIdSet = new Set(nextFavoriteIds);

    writeFavoriteGalleryItemIds(nextFavoriteIds);
    setFavoriteItemIds(nextFavoriteIds);
    setItems((current) => applyFavoriteState(current, nextFavoriteIdSet));

    if (!isAuthenticated) return;

    setFavoriteUpdatingIds((current) => [...current, itemId]);
    setFavoriteSyncMessage('');
    try {
      const response = wasFavorite
        ? await removeGalleryFavorite(itemId)
        : await addGalleryFavorite(itemId);
      const updatedItem = { ...response.item, isFavorite: !wasFavorite };
      setItems((current) => current.map((currentItem) => currentItem.id === itemId ? { ...currentItem, ...updatedItem } : currentItem));
      setFavoriteGalleryItems((current) => wasFavorite
        ? current.filter((currentItem) => currentItem.id !== itemId)
        : upsertGalleryItem(current, updatedItem));
      setFavoriteSyncMessage(wasFavorite ? '已取消收藏' : '已同步收藏');
    } catch (err) {
      const previousFavoriteIdSet = new Set(previousFavoriteIds);
      writeFavoriteGalleryItemIds(previousFavoriteIds);
      setFavoriteItemIds(previousFavoriteIds);
      setItems((current) => applyFavoriteState(current, previousFavoriteIdSet));
      setFavoriteSyncMessage(err instanceof Error ? err.message : '收藏操作失败');
    } finally {
      setFavoriteUpdatingIds((current) => current.filter((id) => id !== itemId));
    }
  };

  const renderGalleryCard = (item: GalleryItemCard, index: number) => {
    const meta = getPatternMeta(item);
    const isFavorite = favoriteItemIdSet.has(item.id);
    const isUpdatingFavorite = favoriteUpdatingIds.includes(item.id);
    return (
      <article
        key={item.id}
        className="collection-card"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
      >
        <div className="collection-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }}>
          {item.coverUrl ? (
            <img
              className="collection-card__image"
              src={item.coverUrl}
              alt=""
              width={item.coverWidth}
              height={item.coverHeight}
            />
          ) : null}
          <button
            type="button"
            className={`collection-card__favorite ${isFavorite ? 'is-active' : ''}`}
            aria-label={isFavorite ? '取消收藏图纸' : '收藏图纸'}
            aria-pressed={isFavorite}
            disabled={isUpdatingFavorite}
            onClick={(event) => {
              event.stopPropagation();
              void toggleFavorite(item);
            }}
          >
            <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
  };

  return (
    <main className="collection-page">
      <section className="page-hero" aria-label="画册问候">
        <h2>记录每一份创作的温暖</h2>
      </section>

      <section className="collection-filters" aria-label="作品筛选">
        {collectionFilters.map((filter) => (
          <button
            key={filter.tab}
            type="button"
            aria-label={filter.label}
            className={`filter-chip ${activeFilter === filter.label ? 'is-active' : ''}`}
            onClick={() => {
              setSearchParams({ tab: filter.tab });
            }}
          >
            <img
              className="filter-chip__icon"
              src={activeFilter === filter.label ? filter.activeIconSrc : filter.iconSrc}
              alt=""
              aria-hidden="true"
            />
          </button>
        ))}
      </section>

      {activeFilter === '我的' ? (
        <section className="collection-my-library" aria-label="我的作品">
          <section className={`inventory-sync-panel ${isAuthenticated ? 'is-remote' : ''}`} aria-label="作品同步状态">
            <div>
              <strong>{isAuthenticated ? '云端作品' : '本地作品'}</strong>
              <span>
                {authStatus === 'loading'
                  ? '正在读取账号状态'
                  : isAuthenticated
                    ? projectSyncMessage || favoriteSyncMessage || user?.email || user?.username || user?.name || '当前账号'
                    : '登录后可同步图纸、草稿和拼豆进度'}
              </span>
            </div>
            {isAuthenticated && localProjectCount > 0 ? (
              <div className="inventory-sync-panel__actions">
                <button type="button" onClick={handleSyncLocalProjects} disabled={isSyncingProjects}>
                  {isSyncingProjects ? '同步中...' : `同步本地 ${localProjectCount} 个`}
                </button>
                <button type="button" onClick={dismissLocalProjectSync}>
                  暂不处理
                </button>
              </div>
            ) : !isAuthenticated && authStatus !== 'loading' ? (
              <button type="button" onClick={() => navigate('/login?redirect=/collection?tab=my')}>
                登录
              </button>
            ) : null}
          </section>

          {isAuthenticated ? (
            <section>
              <div className="collection-my-section__header">
                <h4>我的发布</h4>
                <span>{publishedLoading ? '读取中' : `${myPublishedItems.length} 项`}</span>
              </div>
              <div className="collection-my-list">
                {publishedLoading ? <div className="collection-empty collection-empty--inline">正在读取发布记录…</div> : null}
                {!publishedLoading && myPublishedItems.length > 0 ? myPublishedItems.slice(0, 6).map((item, index) => {
                  const meta = getPatternMeta(item);
                  return (
                    <article
                      key={item.id}
                      className="collection-my-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
                    >
                      <div className="collection-my-card__media" style={{ background: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }} aria-hidden="true">
                        {item.coverUrl ? <img src={item.coverUrl} alt="" /> : null}
                        <span className="collection-my-card__badge is-mine">{getGalleryStatusLabel(item.status)}</span>
                      </div>
                      <div className="collection-my-card__body">
                        <strong>{item.title}</strong>
                        <div className="collection-card__meta" aria-label={formatPatternSummary(item)}>
                          <span className="collection-card__pill collection-card__pill--size">{meta.size}</span>
                          <span className="collection-card__pill collection-card__pill--color">{meta.colors}</span>
                          <span className="collection-card__pill collection-card__pill--count">{meta.beads}</span>
                        </div>
                      </div>
                    </article>
                  );
                }) : null}
                {!publishedLoading && myPublishedItems.length === 0 ? (
                  <div className="collection-empty collection-empty--inline">发布到画册后会显示在这里。</div>
                ) : null}
              </div>
            </section>
          ) : null}

          {myLoading ? <div className="collection-empty">正在读取作品…</div> : null}

          {!myLoading && myItems.length === 0 && favoriteItems.length === 0 && myPublishedItems.length === 0 ? (
            <div className="collection-empty">这里会显示你保存的图纸、草稿、收藏和最近进度。</div>
          ) : null}

          {!myLoading && (myItems.length > 0 || favoriteItems.length > 0) ? (
            <div className="collection-my-sections">
              <section>
                <div className="collection-my-section__header">
                  <h4>最近打开</h4>
                  <span>{myRecentItems.length} 项</span>
                </div>
                <div className="collection-recent-row">
                  {myRecentItems.length > 0 ? myRecentItems.map((item, index) => {
                    const isBeading = item.beadingState === 'progressing';
                    const progress = item.progress?.percent ?? 0;
                    return (
                      <article
                        key={item.id}
                        className={`collection-recent-card ${isBeading ? 'collection-recent-card--beading' : 'collection-recent-card--pattern'}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(
                          isBeading ? `/workshop/focus/${encodeURIComponent(item.id)}` : `/workshop/editor/${encodeURIComponent(item.id)}`,
                          isBeading ? { state: { returnTo: '/collection' } } : undefined,
                        )}
                      >
                        <div className="collection-recent-card__media" aria-hidden="true">
                          {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                          <span className={`collection-recent-card__badge ${isBeading ? 'is-beading' : 'is-pattern'}`}>{isBeading ? '拼豆' : '图纸'}</span>
                        </div>
                        <div className="collection-recent-card__body">
                          <strong>{item.title}</strong>
                          {isBeading ? (
                            <>
                              <div className="collection-progress-track" aria-hidden="true">
                                <span style={{ width: `${progress}%` }} />
                              </div>
                              <p>{progress >= 100 ? '已完成' : `${progress}%`}</p>
                            </>
                          ) : null}
                        </div>
                      </article>
                    );
                  }) : <div className="collection-empty collection-empty--inline">最近打开的图纸会出现在这里。</div>}
                </div>
              </section>

              <section>
                <div className="collection-my-section__header">
                  <h4>我的图纸</h4>
                  {myPatternCards.length > 2 ? (
                    <button type="button" className="collection-my-section__more" onClick={() => setPatternsExpanded((value) => !value)}>
                      {patternsExpanded ? '收起' : '更多'}
                    </button>
                  ) : <span>{myPatternCards.length} 项</span>}
                </div>
                <div className="collection-my-list">
                  {visiblePatternCards.length > 0 ? visiblePatternCards.map((item) => (
                    <article
                      key={item.id}
                      className="collection-my-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(item.href)}
                    >
                      <div className="collection-my-card__media" style={{ background: item.background }} aria-hidden="true">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
                        <span className={`collection-my-card__badge ${item.badge === '收藏' ? 'is-saved' : 'is-mine'}`}>{item.badge}</span>
                      </div>
                      <div className="collection-my-card__body">
                        <strong>{item.title}</strong>
                        <div className="collection-card__meta" aria-label={item.summary}>
                          <span className="collection-card__pill collection-card__pill--size">{item.meta.size}</span>
                          {item.meta.colors ? <span className="collection-card__pill collection-card__pill--color">{item.meta.colors}</span> : null}
                          {item.meta.beads ? <span className="collection-card__pill collection-card__pill--count">{item.meta.beads}</span> : null}
                        </div>
                      </div>
                    </article>
                  )) : <div className="collection-empty collection-empty--inline">收藏或生成图纸后，它会出现在这里。</div>}
                </div>
              </section>

              <section>
                <div className="collection-my-section__header">
                  <h4>我的拼豆</h4>
                  {myProgressing.length > 3 ? (
                    <button type="button" className="collection-my-section__more" onClick={() => setBeadingExpanded((value) => !value)}>
                      {beadingExpanded ? '收起' : '更多'}
                    </button>
                  ) : <span>{myProgressing.length} 项</span>}
                </div>
                <div className="collection-progress-list">
                  {visibleBeadingItems.length > 0 ? visibleBeadingItems.map((item, index) => {
                    const progress = item.progress?.percent ?? 0;
                    return (
                    <article
                      key={item.id}
                      className="collection-progress-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/workshop/focus/${encodeURIComponent(item.id)}`, { state: { returnTo: '/collection' } })}
                    >
                      <div className="collection-progress-item__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }} aria-hidden="true">
                        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                      </div>
                      <div className="collection-progress-item__body">
                        <strong>{item.title}</strong>
                        <p>{formatMyProjectSummary(item)}</p>
                        <div className="collection-progress-track" aria-hidden="true">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <span className="collection-progress-item__percent">{progress}%</span>
                    </article>
                    );
                  }) : <div className="collection-empty collection-empty--inline">开始专注拼豆后，这里会显示进行中的项目。</div>}
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
            visibleGalleryItems.length > 0 ? (
              visibleGalleryItems.map((item, index) => renderGalleryCard(item, index))
            ) : (
              <div className="collection-empty">暂时没有符合条件的作品</div>
            )
          ) : null}
        </section>
      ) : null}

    </main>
  );
}
