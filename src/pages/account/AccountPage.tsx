import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../features/auth/model/AuthProvider';

function getInitial(name: string | null, email: string | null) {
  const value = (name || email || 'D').trim();
  return value.slice(0, 1).toUpperCase();
}

export function AccountPage() {
  const navigate = useNavigate();
  const { status, user, logout } = useAuth();
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

  return (
    <main className="account-page">
      <section className="account-panel" aria-label="账号信息">
        <button type="button" className="account-page__back" onClick={() => navigate(-1)} aria-label="返回">
          ←
        </button>

        <div className="account-profile">
          <div className="account-avatar" aria-hidden="true">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : getInitial(user.name, user.email)}
          </div>
          <div>
            <p>当前账号</p>
            <h1>{user.name || user.email || 'Dodoudou 用户'}</h1>
            {user.email ? <span>{user.email}</span> : null}
          </div>
        </div>

        <div className="account-actions">
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
