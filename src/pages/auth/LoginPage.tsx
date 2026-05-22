import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/model/AuthProvider';

type AuthMode = 'login' | 'register';

function resolveRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = useMemo(() => resolveRedirect(searchParams.get('redirect')), [searchParams]);

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password, name });
      }
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '请求失败，请稍后再试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="账号登录">
        <button type="button" className="auth-page__back" onClick={() => navigate(-1)} aria-label="返回">
          ←
        </button>

        <div className="auth-panel__header">
          <p>Dodoudou Account</p>
          <h1>{mode === 'login' ? '登录账号' : '创建账号'}</h1>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="登录模式">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => {
              setMode('login');
              setMessage('');
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => {
              setMode('register');
              setMessage('');
            }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <label className="auth-field">
              <span>昵称</span>
              <input
                value={name}
                maxLength={40}
                autoComplete="nickname"
                placeholder="豆豆"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>邮箱</span>
            <input
              value={email}
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <input
              value={password}
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="至少 8 位"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {message ? <p className="auth-message">{message}</p> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting || status === 'loading'}>
            {isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '创建并登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
