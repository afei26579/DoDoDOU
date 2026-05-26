import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/model/AuthProvider';

type AuthMode = 'login' | 'register';

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.75 6.75h14.5v10.5H4.75z" />
      <path d="m5.25 7.25 6.75 5.5 6.75-5.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.75 10.25h10.5v8H6.75z" />
      <path d="M8.75 10.25V8a3.25 3.25 0 0 1 6.5 0v2.25" />
      <path d="M12 14.15v1.75" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.75 12s2.9-5.25 8.25-5.25S20.25 12 20.25 12s-2.9 5.25-8.25 5.25S3.75 12 3.75 12Z" />
      <path d="M12 9.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z" />
      {hidden ? <path d="M4.5 19.5 19.5 4.5" /> : null}
    </svg>
  );
}

function GuestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 12.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5.25 20.25c1-3.25 3.35-5 6.75-5s5.75 1.75 6.75 5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.75 18.25h9.65a3.35 3.35 0 0 0 .55-6.65 5.75 5.75 0 0 0-11.2-1.45 4.05 4.05 0 0 0 1 8.1Z" />
    </svg>
  );
}

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
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = useMemo(() => resolveRedirect(searchParams.get('redirect')), [searchParams]);
  const guestRedirectTo = redirectTo === '/account' ? '/' : redirectTo;
  const isLoginMode = mode === 'login';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      if (isLoginMode) {
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
      <section className="auth-showcase" aria-label="嘟豆豆欢迎区">
        <img className="auth-showcase__logo" src="/assets/logos/logo_base.png" alt="DoDouDou 嘟豆豆" />
        <h2>欢迎回来</h2>
        <p>继续你的创意拼豆之旅吧！</p>
        <p className="auth-showcase__tablet-tagline">用创意串起快乐时光</p>
      </section>

      <section className="auth-panel" aria-label="账号登录">
        <button type="button" className="auth-page__back" onClick={() => navigate(-1)} aria-label="返回">
          ←
        </button>

        <header className="auth-brand">
          <img className="auth-logo" src="/assets/logos/logo_base.png" alt="DoDouDou 嘟豆豆" />
          <h1>
            {isLoginMode ? (
              <>
                <span className="auth-title-mobile">欢迎回来</span>
                <span className="auth-title-tablet">欢迎回到嘟豆豆</span>
              </>
            ) : (
              '创建嘟豆豆账号'
            )}
          </h1>
          <p>{isLoginMode ? '继续你的创意拼豆之旅吧！' : '登录后可同步图纸与配色'}</p>
        </header>

        <header className="auth-panel-heading" aria-label="嘟豆豆拼豆助手">
          <span aria-hidden="true">✦</span>
          <span className="auth-panel-heading__mark" aria-hidden="true" />
          <strong>嘟豆豆拼豆助手</strong>
          <span aria-hidden="true">✦</span>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLoginMode ? (
            <label className="auth-field">
              <span className="auth-field__icon auth-field__icon--text" aria-hidden="true">
                昵称
              </span>
              <span className="auth-field__label">昵称</span>
              <input
                value={name}
                maxLength={40}
                autoComplete="nickname"
                placeholder="你的昵称"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span className="auth-field__icon">
              <MailIcon />
            </span>
            <span className="auth-field__label">邮箱</span>
            <input
              value={email}
              type="email"
              autoComplete="email"
              placeholder="邮箱 / 用户名"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span className="auth-field__icon">
              <LockIcon />
            </span>
            <span className="auth-field__label">密码</span>
            <input
              value={password}
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              maxLength={128}
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
              placeholder="密码"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              <EyeIcon hidden={!showPassword} />
            </button>
          </label>

          {isLoginMode ? (
            <div className="auth-options">
              <label className="auth-remember">
                <input type="checkbox" />
                <span>记住我</span>
              </label>
              <button
                type="button"
                className="auth-options__forgot"
                onClick={() => setMessage('忘记密码功能即将开放')}
              >
                忘记密码？
              </button>
            </div>
          ) : null}

          {message ? <p className="auth-message">{message}</p> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting || status === 'loading'}>
            {isSubmitting ? '处理中...' : isLoginMode ? '登录' : '创建并登录'}
          </button>

          <button
            type="button"
            className="auth-secondary"
            onClick={() => {
              setMode(isLoginMode ? 'register' : 'login');
              setMessage('');
            }}
          >
            {isLoginMode ? '注册新账号' : '返回登录'}
          </button>

          {isLoginMode ? (
            <button
              type="button"
              className="auth-forgot"
              onClick={() => setMessage('忘记密码功能即将开放')}
            >
              忘记密码？
            </button>
          ) : null}

          <div className="auth-divider" aria-hidden="true">
            <span />
            <em>或</em>
            <span />
          </div>

          <button
            type="button"
            className="auth-guest auth-guest--mobile"
            onClick={() => navigate(guestRedirectTo, { replace: true })}
          >
            <GuestIcon />
            游客登录
          </button>

          <button
            type="button"
            className="auth-guest auth-guest--desktop"
            onClick={() => navigate(guestRedirectTo, { replace: true })}
          >
            <GuestIcon />
            游客登录
          </button>

          <p className="auth-sync-note">
            <CloudIcon />
            登录后可同步图纸与配色
          </p>
        </form>
      </section>
    </main>
  );
}
