import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAdminAuditLogs,
  fetchAdminGalleryItems,
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminUsers,
  loginAdmin,
  logoutAdmin,
  moderateAdminGalleryItem,
  updateAdminGalleryItem,
  updateAdminUser,
} from '../../features/admin/model/api';
import type { AdminAuditLog, AdminGalleryItem, AdminOverview, AdminUser } from '../../features/admin/model/types';
import type { AuthUser } from '../../features/auth/model/types';
import type { GalleryItemStatus, GallerySourceType } from '../../features/gallery/model/types';

type AdminTab = 'overview' | 'gallery' | 'users' | 'audit';
type AdminAuthStatus = 'loading' | 'anonymous' | 'authenticated';

type GalleryDraft = {
  title: string;
  description: string;
  sourceType: GallerySourceType;
  status: GalleryItemStatus;
  tagsText: string;
  sortWeight: string;
  hotScore: string;
};

type UserDraft = {
  name: string;
  role: AdminUser['role'];
  status: AdminUser['status'];
  planKey: 'free' | 'pro';
};

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'gallery', label: '画册运营' },
  { id: 'users', label: '用户与权限' },
  { id: 'audit', label: '审计日志' },
];

const galleryStatusOptions: Array<{ value: GalleryItemStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_review', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '未通过' },
  { value: 'offline', label: '已下架' },
  { value: 'draft', label: '草稿' },
];

const userStatusOptions: Array<{ value: AdminUser['status'] | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已禁用' },
  { value: 'deleted', label: '已删除' },
];

const roleOptions: Array<{ value: AdminUser['role'] | 'all'; label: string }> = [
  { value: 'all', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'user', label: '普通用户' },
];

const statusLabel: Record<GalleryItemStatus, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '已发布',
  rejected: '未通过',
  offline: '已下架',
};

const userStatusLabel: Record<AdminUser['status'], string> = {
  active: '正常',
  disabled: '已禁用',
  deleted: '已删除',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAuditJson(value: unknown) {
  if (value === null || value === undefined) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getAccountLabel(user: Pick<AdminUser, 'email' | 'username' | 'name'>) {
  return user.email || (user.username ? `@${user.username}` : null) || user.name || '未命名用户';
}

function createGalleryDraft(item: AdminGalleryItem): GalleryDraft {
  return {
    title: item.title,
    description: item.description ?? '',
    sourceType: item.sourceType,
    status: item.status,
    tagsText: item.tags.join(', '),
    sortWeight: String(item.sortWeight),
    hotScore: String(item.stats.hotScore),
  };
}

function createUserDraft(user: AdminUser): UserDraft {
  return {
    name: user.name ?? '',
    role: user.role,
    status: user.status,
    planKey: user.planKey === 'pro' ? 'pro' : 'free',
  };
}

function splitTags(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [item, ...items];
  const next = [...items];
  next[index] = item;
  return next;
}

function getPatternMeta(item: AdminGalleryItem) {
  const summary = item.patternSummary;
  return summary
    ? `${summary.width}x${summary.height} · ${summary.paletteCount} 色 · ${summary.beadCount} 颗`
    : `${item.canvasSize} 尺寸 · ${item.brand}`;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [adminStatus, setAdminStatus] = useState<AdminAuthStatus>('loading');
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [loginAccount, setLoginAccount] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [galleryStatus, setGalleryStatus] = useState<GalleryItemStatus | 'all'>('pending_review');
  const [gallerySourceType, setGallerySourceType] = useState<GallerySourceType | 'all'>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryItems, setGalleryItems] = useState<AdminGalleryItem[]>([]);
  const [galleryTotal, setGalleryTotal] = useState(0);
  const [galleryDrafts, setGalleryDrafts] = useState<Record<string, GalleryDraft>>({});
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const [userStatus, setUserStatus] = useState<AdminUser['status'] | 'all'>('all');
  const [userRole, setUserRole] = useState<AdminUser['role'] | 'all'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActor, setAuditActor] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditResourceType, setAuditResourceType] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isAdmin = adminUser?.role === 'admin';

  const pendingCount = overview?.gallery.byStatus.pending_review ?? 0;
  const publishedCount = overview?.gallery.byStatus.published ?? 0;
  const activeUserCount = overview?.users.byStatus.active ?? 0;

  const loadOverview = () => {
    setOverviewLoading(true);
    setOverviewError(null);
    fetchAdminOverview()
      .then(setOverview)
      .catch((error) => setOverviewError(error instanceof Error ? error.message : '后台总览加载失败'))
      .finally(() => setOverviewLoading(false));
  };

  const loadGallery = () => {
    setGalleryLoading(true);
    setGalleryError(null);
    fetchAdminGalleryItems({
      status: galleryStatus,
      sourceType: gallerySourceType,
      search: gallerySearch,
      pageSize: 30,
    })
      .then((response) => {
        setGalleryItems(response.items);
        setGalleryTotal(response.total);
        setGalleryDrafts(Object.fromEntries(response.items.map((item) => [item.id, createGalleryDraft(item)])));
      })
      .catch((error) => setGalleryError(error instanceof Error ? error.message : '画册列表加载失败'))
      .finally(() => setGalleryLoading(false));
  };

  const loadUsers = () => {
    setUsersLoading(true);
    setUsersError(null);
    fetchAdminUsers({
      role: userRole,
      status: userStatus,
      search: userSearch,
      pageSize: 30,
    })
      .then((response) => {
        setUsers(response.users);
        setUsersTotal(response.total);
        setUserDrafts(Object.fromEntries(response.users.map((item) => [item.id, createUserDraft(item)])));
      })
      .catch((error) => setUsersError(error instanceof Error ? error.message : '用户列表加载失败'))
      .finally(() => setUsersLoading(false));
  };

  const loadAuditLogs = () => {
    setAuditLoading(true);
    setAuditError(null);
    fetchAdminAuditLogs({
      actor: auditActor,
      action: auditAction,
      resourceType: auditResourceType,
      pageSize: 40,
    })
      .then((response) => {
        setAuditLogs(response.logs);
        setAuditTotal(response.total);
      })
      .catch((error) => setAuditError(error instanceof Error ? error.message : '审计日志加载失败'))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    let alive = true;
    fetchAdminMe()
      .then((response) => {
        if (!alive) return;
        setAdminUser(response.user);
        setAdminStatus('authenticated');
        setLoginError(null);
      })
      .catch(() => {
        if (!alive) return;
        setAdminUser(null);
        setAdminStatus('anonymous');
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isAdmin) loadOverview();
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'gallery') loadGallery();
  }, [activeTab, gallerySourceType, galleryStatus, isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'users') loadUsers();
  }, [activeTab, isAdmin, userRole, userStatus]);

  useEffect(() => {
    if (isAdmin && activeTab === 'audit') loadAuditLogs();
  }, [activeTab, isAdmin]);

  const overviewCards = useMemo(() => ([
    { label: '待审核作品', value: pendingCount, hint: '需要人工处理' },
    { label: '已发布作品', value: publishedCount, hint: '公共画册可见' },
    { label: '活跃用户', value: activeUserCount, hint: `${overview?.users.admins ?? 0} 个管理员` },
    { label: '云端项目', value: overview?.projects.total ?? 0, hint: `${overview?.usage.events ?? 0} 条用量记录` },
  ]), [activeUserCount, overview?.projects.total, overview?.usage.events, overview?.users.admins, pendingCount, publishedCount]);

  const handleAdminLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsAdminLoggingIn(true);
    setLoginError(null);
    try {
      const response = await loginAdmin({ account: loginAccount, password: loginPassword });
      setAdminUser(response.user);
      setAdminStatus('authenticated');
      setLoginPassword('');
      setLoginError(null);
    } catch (error) {
      setAdminUser(null);
      setAdminStatus('anonymous');
      setLoginError(error instanceof Error ? error.message : '管理员登录失败');
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    setBusyKey('admin:logout');
    try {
      await logoutAdmin();
    } catch {
      // Logging out should clear local admin state even if the server session has already expired.
    } finally {
      setAdminUser(null);
      setAdminStatus('anonymous');
      setBusyKey(null);
    }
  };

  if (adminStatus === 'loading') {
    return (
      <main className="admin-page">
        <section className="admin-state">正在读取账号状态...</section>
      </main>
    );
  }

  if (!adminUser || !isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-login-panel" aria-label="管理员登录">
          <button type="button" className="admin-header__back" onClick={() => navigate('/account')} aria-label="返回账号页">
            ←
          </button>
          <div>
            <span>Admin Console</span>
            <h1>管理员登录</h1>
            <p>后台使用独立会话。普通账号即使已登录主站，也不能进入后台。</p>
          </div>
          <form className="admin-login-form" onSubmit={handleAdminLogin}>
            <label>
              <span>管理员账号</span>
              <input
                value={loginAccount}
                onChange={(event) => setLoginAccount(event.target.value)}
                autoComplete="username"
                placeholder="邮箱 / 用户名"
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                type="password"
                placeholder="管理员密码"
                required
              />
            </label>
            {loginError ? <p className="admin-error">{loginError}</p> : null}
            <button type="submit" disabled={isAdminLoggingIn}>
              {isAdminLoggingIn ? '验证中...' : '登录后台'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const updateGalleryDraft = (itemId: string, patch: Partial<GalleryDraft>) => {
    setGalleryDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...patch,
      },
    }));
  };

  const updateUserDraft = (userId: string, patch: Partial<UserDraft>) => {
    setUserDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  };

  const handleModerateGalleryItem = async (item: AdminGalleryItem, action: 'approve' | 'reject' | 'offline') => {
    setBusyKey(`gallery:${item.id}:${action}`);
    setGalleryError(null);
    try {
      const response = await moderateAdminGalleryItem(item.id, action);
      setGalleryItems((current) => upsertById(current, response.item));
      setGalleryDrafts((current) => ({ ...current, [response.item.id]: createGalleryDraft(response.item) }));
      loadOverview();
    } catch (error) {
      setGalleryError(error instanceof Error ? error.message : '画册状态更新失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveGalleryItem = async (item: AdminGalleryItem) => {
    const draft = galleryDrafts[item.id];
    if (!draft) return;
    setBusyKey(`gallery:${item.id}:save`);
    setGalleryError(null);
    try {
      const response = await updateAdminGalleryItem(item.id, {
        title: draft.title,
        description: draft.description || null,
        sourceType: draft.sourceType,
        status: draft.status,
        tags: splitTags(draft.tagsText),
        sortWeight: Number(draft.sortWeight),
        hotScore: Number(draft.hotScore),
      });
      setGalleryItems((current) => upsertById(current, response.item));
      setGalleryDrafts((current) => ({ ...current, [response.item.id]: createGalleryDraft(response.item) }));
      loadOverview();
    } catch (error) {
      setGalleryError(error instanceof Error ? error.message : '画册内容保存失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveUser = async (targetUser: AdminUser) => {
    const draft = userDrafts[targetUser.id];
    if (!draft) return;
    setBusyKey(`user:${targetUser.id}:save`);
    setUsersError(null);
    try {
      const response = await updateAdminUser(targetUser.id, {
        name: draft.name || null,
        role: draft.role,
        status: draft.status,
        planKey: draft.planKey,
        subscriptionStatus: 'active',
      });
      setUsers((current) => upsertById(current, response.user));
      setUserDrafts((current) => ({ ...current, [response.user.id]: createUserDraft(response.user) }));
      loadOverview();
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : '用户权限保存失败');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button type="button" className="admin-header__back" onClick={() => navigate('/account')} aria-label="返回账号页">
          ←
        </button>
        <div>
          <span>Admin Console</span>
          <h1>后台管理</h1>
        </div>
        <div className="admin-header__actions">
          <button type="button" className="admin-header__refresh" onClick={() => {
            loadOverview();
            if (activeTab === 'gallery') loadGallery();
            if (activeTab === 'users') loadUsers();
            if (activeTab === 'audit') loadAuditLogs();
          }}>
            刷新
          </button>
          <button type="button" className="admin-header__logout" onClick={handleAdminLogout} disabled={busyKey === 'admin:logout'}>
            退出后台
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="后台管理导航">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className="admin-section" aria-label="后台总览">
          {overviewLoading ? <div className="admin-state">正在加载总览...</div> : null}
          {overviewError ? <div className="admin-error">{overviewError}</div> : null}
          <div className="admin-metrics">
            {overviewCards.map((card) => (
              <article key={card.label} className="admin-metric">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.hint}</p>
              </article>
            ))}
          </div>
          <div className="admin-overview-grid">
            <section className="admin-panel">
              <h2>审核队列</h2>
              <p>普通用户发布后默认进入待审核，只有已发布作品会出现在公共画册。</p>
              <button type="button" onClick={() => setActiveTab('gallery')}>处理作品</button>
            </section>
            <section className="admin-panel">
              <h2>权限模型</h2>
              <p>管理员角色拥有审核、用户管理和全部产品能力；普通用户按 Free / Pro 方案获得能力。</p>
              <button type="button" onClick={() => setActiveTab('users')}>管理权限</button>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === 'gallery' ? (
        <section className="admin-section" aria-label="画册运营">
          <div className="admin-filters">
            <select value={galleryStatus} onChange={(event) => setGalleryStatus(event.target.value as GalleryItemStatus | 'all')} aria-label="作品状态">
              {galleryStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={gallerySourceType} onChange={(event) => setGallerySourceType(event.target.value as GallerySourceType | 'all')} aria-label="作品来源">
              <option value="all">全部来源</option>
              <option value="official">官方</option>
              <option value="community">社区</option>
            </select>
            <input
              value={gallerySearch}
              onChange={(event) => setGallerySearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadGallery();
              }}
              placeholder="搜索标题、简介或作者"
            />
            <button type="button" onClick={loadGallery}>搜索</button>
          </div>

          <div className="admin-list-head">
            <strong>作品列表</strong>
            <span>{galleryLoading ? '读取中...' : `${galleryItems.length} / ${galleryTotal}`}</span>
          </div>
          {galleryError ? <div className="admin-error">{galleryError}</div> : null}
          {!galleryLoading && galleryItems.length === 0 ? <div className="admin-state">没有符合条件的作品。</div> : null}
          <div className="admin-gallery-list">
            {galleryItems.map((item) => {
              const draft = galleryDrafts[item.id] ?? createGalleryDraft(item);
              const isBusy = busyKey?.startsWith(`gallery:${item.id}:`);
              return (
                <article key={item.id} className="admin-gallery-card">
                  <div className="admin-gallery-card__media">
                    {item.coverUrl ? <img src={item.coverUrl} alt="" /> : null}
                    <span className={`admin-badge is-${item.status}`}>{statusLabel[item.status]}</span>
                  </div>
                  <div className="admin-gallery-card__body">
                    <div className="admin-gallery-card__title-row">
                      <input
                        value={draft.title}
                        onChange={(event) => updateGalleryDraft(item.id, { title: event.target.value })}
                        aria-label="作品标题"
                      />
                      <button type="button" onClick={() => navigate(`/collection/${encodeURIComponent(item.id)}`)}>查看</button>
                    </div>
                    <textarea
                      value={draft.description}
                      onChange={(event) => updateGalleryDraft(item.id, { description: event.target.value })}
                      rows={2}
                      aria-label="作品简介"
                    />
                    <div className="admin-gallery-card__meta">
                      <span>{item.author.name}</span>
                      <span>{getPatternMeta(item)}</span>
                      <span>更新 {formatDate(item.updatedAt)}</span>
                    </div>
                    <div className="admin-edit-grid">
                      <label>
                        <span>状态</span>
                        <select value={draft.status} onChange={(event) => updateGalleryDraft(item.id, { status: event.target.value as GalleryItemStatus })}>
                          {galleryStatusOptions.filter((option) => option.value !== 'all').map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>来源</span>
                        <select value={draft.sourceType} onChange={(event) => updateGalleryDraft(item.id, { sourceType: event.target.value as GallerySourceType })}>
                          <option value="community">社区</option>
                          <option value="official">官方</option>
                        </select>
                      </label>
                      <label>
                        <span>排序权重</span>
                        <input value={draft.sortWeight} inputMode="numeric" onChange={(event) => updateGalleryDraft(item.id, { sortWeight: event.target.value })} />
                      </label>
                      <label>
                        <span>热度</span>
                        <input value={draft.hotScore} inputMode="numeric" onChange={(event) => updateGalleryDraft(item.id, { hotScore: event.target.value })} />
                      </label>
                    </div>
                    <label className="admin-wide-field">
                      <span>标签</span>
                      <input value={draft.tagsText} onChange={(event) => updateGalleryDraft(item.id, { tagsText: event.target.value })} />
                    </label>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleSaveGalleryItem(item)} disabled={isBusy}>保存</button>
                      <button type="button" onClick={() => handleModerateGalleryItem(item, 'approve')} disabled={isBusy || item.status === 'published'}>通过</button>
                      <button type="button" onClick={() => handleModerateGalleryItem(item, 'reject')} disabled={isBusy || item.status === 'rejected'}>拒绝</button>
                      <button type="button" className="is-danger" onClick={() => handleModerateGalleryItem(item, 'offline')} disabled={isBusy || item.status === 'offline'}>下架</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'users' ? (
        <section className="admin-section" aria-label="用户与权限">
          <div className="admin-filters">
            <select value={userStatus} onChange={(event) => setUserStatus(event.target.value as AdminUser['status'] | 'all')} aria-label="用户状态">
              {userStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={userRole} onChange={(event) => setUserRole(event.target.value as AdminUser['role'] | 'all')} aria-label="用户角色">
              {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadUsers();
              }}
              placeholder="搜索邮箱、用户名或昵称"
            />
            <button type="button" onClick={loadUsers}>搜索</button>
          </div>

          <div className="admin-list-head">
            <strong>用户列表</strong>
            <span>{usersLoading ? '读取中...' : `${users.length} / ${usersTotal}`}</span>
          </div>
          {usersError ? <div className="admin-error">{usersError}</div> : null}
          {!usersLoading && users.length === 0 ? <div className="admin-state">没有符合条件的用户。</div> : null}
          <div className="admin-user-list">
            {users.map((targetUser) => {
              const draft = userDrafts[targetUser.id] ?? createUserDraft(targetUser);
              const isSelf = targetUser.id === adminUser.id;
              const isBusy = busyKey?.startsWith(`user:${targetUser.id}:`);
              return (
                <article key={targetUser.id} className="admin-user-card">
                  <div className="admin-user-card__avatar" aria-hidden="true">
                    {targetUser.avatarUrl ? <img src={targetUser.avatarUrl} alt="" /> : getAccountLabel(targetUser).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="admin-user-card__body">
                    <div className="admin-user-card__head">
                      <div>
                        <strong>{getAccountLabel(targetUser)}</strong>
                        <span>{targetUser.id}</span>
                      </div>
                      <span className={`admin-badge is-user-${targetUser.status}`}>{userStatusLabel[targetUser.status]}</span>
                    </div>
                    <div className="admin-edit-grid admin-edit-grid--users">
                      <label>
                        <span>昵称</span>
                        <input value={draft.name} onChange={(event) => updateUserDraft(targetUser.id, { name: event.target.value })} />
                      </label>
                      <label>
                        <span>角色</span>
                        <select value={draft.role} disabled={isSelf} onChange={(event) => updateUserDraft(targetUser.id, { role: event.target.value as AdminUser['role'] })}>
                          <option value="user">普通用户</option>
                          <option value="admin">管理员</option>
                        </select>
                      </label>
                      <label>
                        <span>状态</span>
                        <select value={draft.status} disabled={isSelf} onChange={(event) => updateUserDraft(targetUser.id, { status: event.target.value as AdminUser['status'] })}>
                          <option value="active">正常</option>
                          <option value="disabled">禁用</option>
                          <option value="deleted">删除标记</option>
                        </select>
                      </label>
                      <label>
                        <span>方案</span>
                        <select value={draft.planKey} onChange={(event) => updateUserDraft(targetUser.id, { planKey: event.target.value as UserDraft['planKey'] })}>
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                        </select>
                      </label>
                    </div>
                    <div className="admin-user-card__stats">
                      <span>{targetUser.counts.projects} 项目</span>
                      <span>{targetUser.counts.galleryItems} 发布</span>
                      <span>{targetUser.counts.favorites} 收藏</span>
                      <span>{targetUser.counts.usageEvents} 用量记录</span>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => handleSaveUser(targetUser)} disabled={isBusy}>保存用户</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'audit' ? (
        <section className="admin-section" aria-label="审计日志">
          <div className="admin-filters admin-filters--audit">
            <input
              value={auditActor}
              onChange={(event) => setAuditActor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadAuditLogs();
              }}
              placeholder="管理员邮箱或用户 ID"
            />
            <input
              value={auditAction}
              onChange={(event) => setAuditAction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadAuditLogs();
              }}
              placeholder="操作，如 user.update"
            />
            <input
              value={auditResourceType}
              onChange={(event) => setAuditResourceType(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') loadAuditLogs();
              }}
              placeholder="资源，如 gallery_item"
            />
            <button type="button" onClick={loadAuditLogs}>筛选</button>
          </div>

          <div className="admin-list-head">
            <strong>审计日志</strong>
            <span>{auditLoading ? '读取中...' : `${auditLogs.length} / ${auditTotal}`}</span>
          </div>
          {auditError ? <div className="admin-error">{auditError}</div> : null}
          {!auditLoading && auditLogs.length === 0 ? <div className="admin-state">没有符合条件的审计日志。</div> : null}
          <div className="admin-audit-list">
            {auditLogs.map((log) => (
              <article key={log.id} className="admin-audit-card">
                <div className="admin-audit-card__head">
                  <div>
                    <strong>{log.action}</strong>
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  <span className={`admin-badge is-audit-${log.outcome}`}>{log.outcome}</span>
                </div>
                <div className="admin-audit-card__meta">
                  <span>操作者：{log.actorEmail || log.actorUserId || '未识别'}</span>
                  <span>资源：{log.resourceType}{log.resourceId ? ` / ${log.resourceId}` : ''}</span>
                  {log.ipAddress ? <span>IP：{log.ipAddress}</span> : null}
                  {log.requestId ? <span>请求：{log.requestId}</span> : null}
                </div>
                <details className="admin-audit-card__details">
                  <summary>查看变更详情</summary>
                  <pre>{formatAuditJson({
                    before: log.beforeJson,
                    after: log.afterJson,
                    metadata: log.metadataJson,
                    userAgent: log.userAgent,
                  })}</pre>
                </details>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
