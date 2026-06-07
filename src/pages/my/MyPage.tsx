import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ADMIN_ENTRY_PATH } from '../../features/admin/model/adminConfig';
import { useAuth } from '../../features/auth/model/AuthProvider';
import {
  listRemoteInventoryItems,
  syncRemoteInventoryItems,
} from '../../features/beads/model/inventoryApi';
import {
  listInventoryItems,
  type BeadInventoryItem,
} from '../../features/beads/model/inventoryStore';
import {
  fetchGalleryList,
  fetchMyGalleryItems,
  syncFavoriteGalleryItems,
} from '../../features/gallery/model/api';
import type { GalleryItemCard } from '../../features/gallery/model/types';
import { useEntitlements } from '../../features/subscription/model/EntitlementProvider';
import {
  groupWorkshopProjects,
  listLocalWorkshopProjects,
  listWorkshopProjects,
  type WorkshopProjectCard,
  type WorkshopProjectRecord,
} from '../../features/workshop/model/projectStore';
import { syncRemoteWorkshopProjects } from '../../features/workshop/model/projectApi';

type LibraryTab = 'patterns' | 'beading' | 'published' | 'favorites';

const FAVORITE_GALLERY_ITEM_IDS_KEY = 'dodoudou.favoriteGalleryItemIds';
const collectionCardBackgrounds = ['#F9F0FF', '#F0FBF6', '#FFF8F0', '#FFF0F6', '#EDF2FF'];

const libraryTabs: Array<{ id: LibraryTab; label: string }> = [
  { id: 'patterns', label: '图纸' },
  { id: 'beading', label: '拼豆' },
  { id: 'published', label: '发布' },
  { id: 'favorites', label: '收藏' },
];

function readFavoriteGalleryItemIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITE_GALLERY_ITEM_IDS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function getAccountLabel(user: { email: string | null; username: string | null; name: string | null } | null) {
  if (!user) return '登录后同步图纸、库存与收藏';
  return user.email ?? (user.username ? `@${user.username}` : user.name ?? '当前账号');
}

function getProfileName(user: { email: string | null; username: string | null; name: string | null } | null) {
  if (!user) return '游客创作中';
  return user.name ?? user.username ?? user.email ?? '嘟豆豆用户';
}

function getProfileInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || 'D';
}

function getPatternSummary(item: WorkshopProjectCard) {
  if (!item.pattern) return '草稿';
  return `${item.pattern.width}×${item.pattern.height} · ${item.pattern.paletteCount} 色 · ${formatNumber(item.pattern.beadCount)} 颗`;
}

function getProjectOpenPath(item: WorkshopProjectCard) {
  if (item.beadingState === 'progressing') return `/workshop/focus/${encodeURIComponent(item.id)}`;
  if (item.pattern) return `/workshop/result/${encodeURIComponent(item.id)}`;
  return `/workshop/editor/${encodeURIComponent(item.id)}`;
}

function getGalleryStatusLabel(status: GalleryItemCard['status']) {
  if (status === 'pending_review') return '待审核';
  if (status === 'published') return '已发布';
  if (status === 'rejected') return '未通过';
  if (status === 'offline') return '已下架';
  return '草稿';
}

function getGallerySummary(item: GalleryItemCard) {
  const summary = item.patternSummary;
  if (!summary) return `${item.tags.length || 0} 个标签`;
  return `${summary.width}×${summary.height} · ${summary.paletteCount} 色 · ${formatNumber(summary.beadCount)} 颗`;
}

function getLimitText(current: number, limit: number | null) {
  if (limit === null) return `${formatNumber(current)} / 不限`;
  return `${formatNumber(current)} / ${formatNumber(limit)}`;
}

export function MyPage() {
  const navigate = useNavigate();
  const { status: authStatus, user, isAuthenticated, logout } = useAuth();
  const { status: entitlementStatus, entitlements } = useEntitlements();
  const [projects, setProjects] = useState<WorkshopProjectRecord[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectSyncMessage, setProjectSyncMessage] = useState('');
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [isSyncingProjects, setIsSyncingProjects] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<BeadInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventorySyncMessage, setInventorySyncMessage] = useState('');
  const [localInventoryCount, setLocalInventoryCount] = useState(0);
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [publishedItems, setPublishedItems] = useState<GalleryItemCard[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [favoriteItemIds, setFavoriteItemIds] = useState<string[]>(() => readFavoriteGalleryItemIds());
  const [favoriteItems, setFavoriteItems] = useState<GalleryItemCard[]>([]);
  const [favoriteSyncMessage, setFavoriteSyncMessage] = useState('');
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LibraryTab>('patterns');
  const [notice, setNotice] = useState('');

  const projectMigrationStorageKey = user ? `dodoudou.projects.migration.completed.${user.id}` : '';
  const inventoryMigrationStorageKey = user ? `dodoudou.inventory.migration.completed.${user.id}` : '';

  const loadProjects = useCallback(async () => {
    if (authStatus === 'loading') return;
    setProjectsLoading(true);
    try {
      setProjects(await listWorkshopProjects());
    } finally {
      setProjectsLoading(false);
    }
  }, [authStatus, isAuthenticated, user?.id]);

  const loadInventory = useCallback(async () => {
    if (authStatus === 'loading') return;
    setInventoryLoading(true);
    try {
      setInventoryItems(isAuthenticated ? await listRemoteInventoryItems() : await listInventoryItems());
    } catch (error) {
      setInventorySyncMessage(error instanceof Error ? error.message : '库存读取失败');
      setInventoryItems([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [authStatus, isAuthenticated, user?.id]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (!isAuthenticated || !projectMigrationStorageKey) {
      setLocalProjectCount(0);
      return;
    }

    if (window.localStorage.getItem(projectMigrationStorageKey) === 'true') {
      setLocalProjectCount(0);
      return;
    }

    let alive = true;
    void listLocalWorkshopProjects()
      .then((items) => {
        if (alive) setLocalProjectCount(items.length);
      })
      .catch(() => {
        if (alive) setLocalProjectCount(0);
      });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, projectMigrationStorageKey]);

  useEffect(() => {
    if (!isAuthenticated || !inventoryMigrationStorageKey) {
      setLocalInventoryCount(0);
      return;
    }

    if (window.localStorage.getItem(inventoryMigrationStorageKey) === 'true') {
      setLocalInventoryCount(0);
      return;
    }

    let alive = true;
    void listInventoryItems()
      .then((items) => {
        if (alive) setLocalInventoryCount(items.length);
      })
      .catch(() => {
        if (alive) setLocalInventoryCount(0);
      });

    return () => {
      alive = false;
    };
  }, [inventoryMigrationStorageKey, isAuthenticated]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!isAuthenticated) {
      setPublishedItems([]);
      setPublishedLoading(false);
      return;
    }

    let alive = true;
    setPublishedLoading(true);
    fetchMyGalleryItems()
      .then((response) => {
        if (alive) setPublishedItems(response.items);
      })
      .catch(() => {
        if (alive) setPublishedItems([]);
      })
      .finally(() => {
        if (alive) setPublishedLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authStatus, isAuthenticated, user?.id]);

  useEffect(() => {
    if (authStatus === 'loading') return;

    let alive = true;
    const localFavoriteIds = readFavoriteGalleryItemIds();
    setFavoriteItemIds(localFavoriteIds);
    setFavoritesLoading(true);
    setFavoriteSyncMessage('');

    if (isAuthenticated) {
      syncFavoriteGalleryItems(localFavoriteIds)
        .then((response) => {
          if (!alive) return;
          window.localStorage.setItem(FAVORITE_GALLERY_ITEM_IDS_KEY, JSON.stringify(response.itemIds));
          setFavoriteItemIds(response.itemIds);
          setFavoriteItems(response.items);
          setFavoriteSyncMessage(response.itemIds.length ? `已同步 ${response.itemIds.length} 个收藏` : '收藏已与账号同步');
        })
        .catch((error) => {
          if (!alive) return;
          setFavoriteItems([]);
          setFavoriteSyncMessage(error instanceof Error ? error.message : '收藏同步失败');
        })
        .finally(() => {
          if (alive) setFavoritesLoading(false);
        });
    } else if (localFavoriteIds.length) {
      fetchGalleryList({ pageSize: 48, sort: 'latest' })
        .then((response) => {
          if (!alive) return;
          const favoriteSet = new Set(localFavoriteIds);
          setFavoriteItems(response.items.filter((item) => favoriteSet.has(item.id)));
        })
        .catch(() => {
          if (alive) setFavoriteItems([]);
        })
        .finally(() => {
          if (alive) setFavoritesLoading(false);
        });
    } else {
      setFavoriteItems([]);
      setFavoritesLoading(false);
    }

    return () => {
      alive = false;
    };
  }, [authStatus, isAuthenticated, user?.id]);

  const projectGroups = useMemo(() => groupWorkshopProjects(projects), [projects]);
  const continueItems = useMemo(
    () => (projectGroups.progressing.length ? projectGroups.progressing : projectGroups.recent).slice(0, 2),
    [projectGroups.progressing, projectGroups.recent],
  );
  const lowStockCount = useMemo(
    () => inventoryItems.filter((item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold).length,
    [inventoryItems],
  );
  const totalInventoryQuantity = useMemo(
    () => inventoryItems.reduce((sum, item) => sum + item.quantity, 0),
    [inventoryItems],
  );
  const latestProjectDate = projectGroups.recent[0]?.lastOpenedAt ?? projectGroups.recent[0]?.updatedAt ?? null;
  const latestProgress = projectGroups.progressing[0]?.progress?.percent ?? null;
  const profileName = getProfileName(user);
  const accountLabel = getAccountLabel(user);
  const canShowAdmin = user?.role === 'admin';
  const syncMessage = authStatus === 'loading'
    ? '正在读取账号状态'
    : isAuthenticated
      ? localProjectCount + localInventoryCount > 0
        ? `有 ${localProjectCount + localInventoryCount} 项本地数据待同步`
        : projectSyncMessage || inventorySyncMessage || favoriteSyncMessage || '云端同步已准备好'
      : '本地保存，登录后可同步';

  const handleOpenProject = (item: WorkshopProjectCard) => {
    navigate(getProjectOpenPath(item), item.beadingState === 'progressing' ? { state: { returnTo: '/my' } } : undefined);
  };

  const handleSyncProjects = async () => {
    if (!projectMigrationStorageKey || isSyncingProjects) return;
    setIsSyncingProjects(true);
    setProjectSyncMessage('');

    try {
      const localProjects = await listLocalWorkshopProjects();
      if (!localProjects.length) {
        window.localStorage.setItem(projectMigrationStorageKey, 'true');
        setLocalProjectCount(0);
        setProjectSyncMessage('本地作品已同步');
        return;
      }

      const response = await syncRemoteWorkshopProjects(localProjects, {
        onProgress: ({ synced, total, batchCount }) => {
          if (batchCount > 1) setProjectSyncMessage(`正在同步作品 ${synced}/${total}`);
        },
      });
      window.localStorage.setItem(projectMigrationStorageKey, 'true');
      setLocalProjectCount(0);
      setProjects(response.items);
      setProjectSyncMessage(`已同步 ${response.stats.created + response.stats.updated + response.stats.conflicted} 个作品`);
    } catch (error) {
      setProjectSyncMessage(error instanceof Error ? error.message : '作品同步失败，请稍后再试');
    } finally {
      setIsSyncingProjects(false);
    }
  };

  const handleSyncInventory = async () => {
    if (!inventoryMigrationStorageKey || isSyncingInventory) return;
    setIsSyncingInventory(true);
    setInventorySyncMessage('');

    try {
      const localItems = await listInventoryItems();
      if (!localItems.length) {
        window.localStorage.setItem(inventoryMigrationStorageKey, 'true');
        setLocalInventoryCount(0);
        setInventorySyncMessage('本地库存已同步');
        return;
      }

      const response = await syncRemoteInventoryItems(localItems);
      window.localStorage.setItem(inventoryMigrationStorageKey, 'true');
      setLocalInventoryCount(0);
      setInventoryItems(response.items);
      setInventorySyncMessage(`已同步 ${response.stats.created + response.stats.updated} 条库存`);
    } catch (error) {
      setInventorySyncMessage(error instanceof Error ? error.message : '库存同步失败，请稍后再试');
    } finally {
      setIsSyncingInventory(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const showDevelopmentNotice = (message: string) => {
    setNotice(message);
  };

  const renderProjectCard = (item: WorkshopProjectCard, index: number) => (
    <button key={item.id} type="button" className="my-pattern-card" onClick={() => handleOpenProject(item)}>
      <span className="my-pattern-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }}>
        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : <span className="my-card-placeholder">图纸</span>}
        <span className={`my-status-badge ${item.beadingState === 'progressing' ? 'is-beading' : item.pattern ? 'is-pattern' : 'is-draft'}`}>
          {item.beadingState === 'progressing' ? '拼豆' : item.pattern ? '图纸' : '草稿'}
        </span>
      </span>
      <span className="my-pattern-card__body">
        <strong>{item.title}</strong>
        <span>{getPatternSummary(item)}</span>
      </span>
    </button>
  );

  const renderGalleryCard = (item: GalleryItemCard, index: number, badge: string) => (
    <button
      key={item.id}
      type="button"
      className="my-pattern-card"
      onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}
    >
      <span className="my-pattern-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }}>
        {item.coverUrl ? <img src={item.coverUrl} alt="" /> : <span className="my-card-placeholder">画册</span>}
        <span className={`my-status-badge ${badge === '收藏' ? 'is-saved' : 'is-published'}`}>{badge}</span>
      </span>
      <span className="my-pattern-card__body">
        <strong>{item.title}</strong>
        <span>{getGallerySummary(item)}</span>
      </span>
    </button>
  );

  const renderLibraryContent = () => {
    if (activeTab === 'patterns') {
      if (projectsLoading) return <div className="my-empty my-empty--inline">正在读取图纸...</div>;
      if (!projectGroups.patterns.length) {
        return (
          <div className="my-empty">
            <strong>还没有图纸哦</strong>
            <span>上传一张图片，或从画册收藏一个喜欢的图纸。</span>
            <button type="button" onClick={() => navigate('/workshop')}>开始创作</button>
          </div>
        );
      }
      return <div className="my-pattern-grid">{projectGroups.patterns.map(renderProjectCard)}</div>;
    }

    if (activeTab === 'beading') {
      if (projectsLoading) return <div className="my-empty my-empty--inline">正在读取拼豆进度...</div>;
      if (!projectGroups.progressing.length) {
        return (
          <div className="my-empty">
            <strong>还没有进行中的拼豆</strong>
            <span>从一张图纸进入专注拼豆后，进度会显示在这里。</span>
            <button type="button" onClick={() => setActiveTab('patterns')}>查看图纸</button>
          </div>
        );
      }
      return (
        <div className="my-progress-list">
          {projectGroups.progressing.map((item, index) => {
            const progress = item.progress?.percent ?? 0;
            return (
              <button key={item.id} type="button" className="my-progress-card" onClick={() => handleOpenProject(item)}>
                <span className="my-progress-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }}>
                  {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                </span>
                <span className="my-progress-card__body">
                  <strong>{item.title}</strong>
                  <span>{getPatternSummary(item)}</span>
                  <span className="my-progress-track" aria-label={`进度 ${progress}%`}>
                    <span style={{ width: `${progress}%` }} />
                  </span>
                </span>
                <span className="my-progress-card__percent">{progress}%</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'published') {
      if (!isAuthenticated && authStatus !== 'loading') {
        return (
          <div className="my-empty">
            <strong>登录后查看发布记录</strong>
            <span>完成图纸后，可以上传到公共画册并在这里跟踪状态。</span>
            <button type="button" onClick={() => navigate('/login?redirect=/my')}>登录</button>
          </div>
        );
      }
      if (publishedLoading) return <div className="my-empty my-empty--inline">正在读取发布记录...</div>;
      if (!publishedItems.length) {
        return (
          <div className="my-empty">
            <strong>还没有发布作品</strong>
            <span>完成图纸后，可以上传到公共画册。</span>
            <button type="button" onClick={() => navigate('/workshop')}>去工坊</button>
          </div>
        );
      }
      return (
        <div className="my-pattern-grid">
          {publishedItems.map((item, index) => renderGalleryCard(item, index, getGalleryStatusLabel(item.status)))}
        </div>
      );
    }

    if (favoritesLoading) return <div className="my-empty my-empty--inline">正在读取收藏...</div>;
    if (!favoriteItemIds.length) {
      return (
        <div className="my-empty">
          <strong>还没有收藏图纸</strong>
          <span>在画册里点亮喜欢的图纸，它们会显示在这里。</span>
          <button type="button" onClick={() => navigate('/collection')}>逛画册</button>
        </div>
      );
    }
    if (!favoriteItems.length) {
      return <div className="my-empty my-empty--inline">已收藏 {favoriteItemIds.length} 张图纸，打开画册可继续查看。</div>;
    }
    return <div className="my-pattern-grid">{favoriteItems.map((item, index) => renderGalleryCard(item, index, '收藏'))}</div>;
  };

  return (
    <main className="my-page">
      <section className="page-hero my-page__hero" aria-label="我的">
        <div>
          <p className="my-page__eyebrow">MY STUDIO</p>
          <h2>我的</h2>
        </div>
        <span className={`my-sync-chip ${isAuthenticated ? 'is-remote' : ''}`}>{syncMessage}</span>
      </section>

      <section className="my-layout">
        <aside className="my-sidebar">
          <section className="my-profile-card" aria-label="账号信息">
            <div className="my-profile-card__avatar" aria-hidden="true">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : getProfileInitial(profileName)}
            </div>
            <div className="my-profile-card__body">
              <span>{isAuthenticated ? '当前账号' : '游客模式'}</span>
              <h1>{profileName}</h1>
              <p>{accountLabel}</p>
            </div>
            <div className="my-profile-card__actions">
              {isAuthenticated ? (
                <button type="button" onClick={() => showDevelopmentNotice('编辑资料会在后续版本开放')}>
                  编辑资料
                </button>
              ) : (
                <button type="button" onClick={() => navigate('/login?redirect=/my')}>
                  登录并同步
                </button>
              )}
            </div>
          </section>

          <section className="my-quota-card" aria-label="权益额度">
            <div className="my-section-heading">
              <h3>权益与额度</h3>
              <span>{entitlementStatus === 'loading' ? '读取中' : entitlements.planLabel}</span>
            </div>
            <div className="my-quota-list">
              <div>
                <span>云端作品</span>
                <strong>{getLimitText(isAuthenticated ? projects.length : 0, entitlements.limits.cloudProjects)}</strong>
              </div>
              <div>
                <span>云端库存</span>
                <strong>{getLimitText(isAuthenticated ? inventoryItems.length : 0, entitlements.limits.cloudInventoryItems)}</strong>
              </div>
              <div>
                <span>当前身份</span>
                <strong>{entitlements.identity === 'anonymous' ? 'Guest' : entitlements.identity === 'admin' ? 'Admin' : 'User'}</strong>
              </div>
            </div>
          </section>

          <section className="my-settings-card" aria-label="设置与支持">
            <div className="my-section-heading">
              <h3>设置与支持</h3>
            </div>
            <div className="my-settings-list">
              <button type="button" onClick={() => showDevelopmentNotice('账号安全会在后续版本开放')}>
                <span>账号安全</span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => showDevelopmentNotice('创作偏好会在后续版本开放')}>
                <span>创作偏好</span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => navigate('/workshop/inventory')}>
                <span>我的库存</span>
                <em>›</em>
              </button>
              {canShowAdmin ? (
                <button type="button" onClick={() => navigate(ADMIN_ENTRY_PATH)}>
                  <span>后台管理</span>
                  <em>›</em>
                </button>
              ) : null}
              {isAuthenticated ? (
                <button type="button" className="is-danger" onClick={handleLogout}>
                  <span>退出登录</span>
                </button>
              ) : null}
            </div>
            {notice ? <p className="my-notice">{notice}</p> : null}
          </section>
        </aside>

        <section className="my-main">
          <section className="my-asset-grid" aria-label="快捷资产">
            <button type="button" className="my-asset-card is-pattern" onClick={() => setActiveTab('patterns')}>
              <span>我的图纸</span>
              <strong>{projectsLoading ? '...' : formatNumber(projectGroups.patterns.length)}</strong>
              <em>{formatDate(latestProjectDate)}</em>
            </button>
            <button type="button" className="my-asset-card is-beading" onClick={() => setActiveTab('beading')}>
              <span>我的拼豆</span>
              <strong>{projectsLoading ? '...' : formatNumber(projectGroups.progressing.length)}</strong>
              <em>{latestProgress == null ? '暂无进度' : `${latestProgress}% 进行中`}</em>
            </button>
            <button type="button" className="my-asset-card is-inventory" onClick={() => navigate('/workshop/inventory')}>
              <span>我的库存</span>
              <strong>{inventoryLoading ? '...' : `${formatNumber(inventoryItems.length)} 色`}</strong>
              <em>{lowStockCount ? `${lowStockCount} 个低库存` : `${formatNumber(totalInventoryQuantity)} 颗`}</em>
            </button>
            <button type="button" className="my-asset-card is-favorite" onClick={() => setActiveTab('favorites')}>
              <span>我的收藏</span>
              <strong>{favoritesLoading ? '...' : formatNumber(favoriteItemIds.length)}</strong>
              <em>{favoriteSyncMessage || (isAuthenticated ? '云端收藏' : '本地收藏')}</em>
            </button>
          </section>

          <section className="my-sync-panel" aria-label="同步状态">
            <div>
              <strong>{isAuthenticated ? '云端同步' : '本地创作'}</strong>
              <span>
                {isAuthenticated
                  ? localProjectCount + localInventoryCount > 0
                    ? `发现本地作品 ${localProjectCount} 个、库存 ${localInventoryCount} 条`
                    : projectSyncMessage || inventorySyncMessage || favoriteSyncMessage || '登录数据会自动与账号关联'
                  : '登录后可把本地作品、库存和收藏同步到账号'}
              </span>
            </div>
            {isAuthenticated && (localProjectCount > 0 || localInventoryCount > 0) ? (
              <div className="my-sync-panel__actions">
                {localProjectCount > 0 ? (
                  <button type="button" onClick={handleSyncProjects} disabled={isSyncingProjects}>
                    {isSyncingProjects ? '作品同步中...' : `同步作品 ${localProjectCount}`}
                  </button>
                ) : null}
                {localInventoryCount > 0 ? (
                  <button type="button" onClick={handleSyncInventory} disabled={isSyncingInventory}>
                    {isSyncingInventory ? '库存同步中...' : `同步库存 ${localInventoryCount}`}
                  </button>
                ) : null}
              </div>
            ) : !isAuthenticated && authStatus !== 'loading' ? (
              <button type="button" onClick={() => navigate('/login?redirect=/my')}>登录</button>
            ) : null}
          </section>

          <section className="my-continue-section" aria-label="继续创作">
            <div className="my-section-heading">
              <h3>继续创作</h3>
              <span>{continueItems.length ? `${continueItems.length} 项` : '空闲中'}</span>
            </div>
            {projectsLoading ? <div className="my-empty my-empty--inline">正在读取最近作品...</div> : null}
            {!projectsLoading && continueItems.length ? (
              <div className="my-continue-list">
                {continueItems.map((item, index) => {
                  const progress = item.progress?.percent ?? 0;
                  return (
                    <button key={item.id} type="button" className="my-continue-card" onClick={() => handleOpenProject(item)}>
                      <span className="my-continue-card__media" style={{ backgroundColor: collectionCardBackgrounds[index % collectionCardBackgrounds.length] }}>
                        {item.previewUrl || item.coverUrl ? <img src={item.previewUrl ?? item.coverUrl ?? ''} alt="" /> : null}
                      </span>
                      <span className="my-continue-card__body">
                        <strong>{item.title}</strong>
                        <span>{getPatternSummary(item)}</span>
                        {item.beadingState === 'progressing' ? (
                          <span className="my-progress-track" aria-label={`进度 ${progress}%`}>
                            <span style={{ width: `${progress}%` }} />
                          </span>
                        ) : null}
                      </span>
                      <span className={`my-status-badge ${item.beadingState === 'progressing' ? 'is-beading' : 'is-pattern'}`}>
                        {item.beadingState === 'progressing' ? `${progress}%` : '打开'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!projectsLoading && !continueItems.length ? (
              <div className="my-empty">
                <strong>还没有自己的图纸哦</strong>
                <span>上传一张图片，或从画册收藏一个图纸开始。</span>
                <div className="my-empty__actions">
                  <button type="button" onClick={() => navigate('/workshop')}>开始创作</button>
                  <button type="button" onClick={() => navigate('/collection')}>逛画册</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="my-library-section" aria-label="个人内容">
            <div className="my-library-tabs" role="tablist" aria-label="个人内容分类">
              {libraryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'is-active' : ''}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {renderLibraryContent()}
          </section>
        </section>
      </section>
    </main>
  );
}
