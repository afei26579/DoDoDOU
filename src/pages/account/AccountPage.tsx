import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ADMIN_ENTRY_PATH } from '../../features/admin/model/adminConfig';
import { useAuth } from '../../features/auth/model/AuthProvider';
import { useEntitlements } from '../../features/subscription/model/EntitlementProvider';

function getAccountLabel(user: { email: string | null; username: string | null }) {
  if (user.email) return user.email;
  if (user.username) return `@${user.username}`;
  return null;
}

function getInitial(name: string | null, accountLabel: string | null) {
  const value = (name || accountLabel || 'D').trim();
  return value.slice(0, 1).toUpperCase();
}

export function AccountPage() {
  const navigate = useNavigate();
  const { status, user, logout } = useAuth();
  const { entitlements } = useEntitlements();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (status === 'loading') {
    return (
      <main className="account-page">
        <section className="account-panel">
          <p className="account-loading">正在读取账号...</p>
        </section>
      </main>
    );
  }

  if (!user && !isLoggingOut) {
    return <Navigate to="/login?redirect=/account" replace />;
  }

  if (!user) return null;
  const accountLabel = getAccountLabel(user);

  return (
    <main className="account-page">
      <section className="account-panel" aria-label="账号信息">
        <button type="button" className="account-page__back" onClick={() => navigate(-1)} aria-label="返回">
          ←
        </button>

        <div className="account-profile">
          <div className="account-avatar" aria-hidden="true">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : getInitial(user.name, accountLabel)}
          </div>
          <div>
            <p>当前账号</p>
            <h1>{user.name || accountLabel || 'Dodoudou 用户'}</h1>
            {accountLabel ? <span>{accountLabel}</span> : null}
          </div>
        </div>

        <div className="account-actions" aria-label="权益状态">
          <button type="button" disabled>
            当前方案：{entitlements.planLabel}
          </button>
          <button type="button" disabled>
            云端作品：{entitlements.limits.cloudProjects ?? '不限'}
          </button>
        </div>

        <div className="account-actions">
          {user.role === 'admin' ? (
            <button type="button" onClick={() => navigate(ADMIN_ENTRY_PATH)}>
              后台管理
            </button>
          ) : null}
          <button type="button" onClick={() => navigate('/collection?tab=my')}>
            我的作品
          </button>
          <button type="button" onClick={() => navigate('/workshop/inventory')}>
            我的库存
          </button>
          <button
            type="button"
            className="account-actions__danger"
            onClick={async () => {
              setIsLoggingOut(true);
              await logout();
              navigate('/', { replace: true });
            }}
          >
            退出登录
          </button>
        </div>
      </section>
    </main>
  );
}
