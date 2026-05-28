import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/model/AuthProvider';
import * as authApi from '../../features/auth/model/authApi';
import { resolveAuthRedirect } from '../../features/auth/model/redirect';

type AuthMode = 'login' | 'register' | 'reset';
type AuthCodePurpose = 'register' | 'password-reset';

const AUTH_CODE_COOLDOWN_STORAGE_PREFIX = 'dodoudou:auth-code-cooldown';

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

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.75 7.25h12.5v9.5H5.75z" />
      <path d="M8.75 10.25h.01" />
      <path d="M12 10.25h.01" />
      <path d="M15.25 10.25h.01" />
      <path d="M8.75 13.75h.01" />
      <path d="M12 13.75h.01" />
      <path d="M15.25 13.75h.01" />
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

function isValidEmailInput(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeAuthMode(value: string | null): AuthMode {
  return value === 'register' || value === 'reset' ? value : 'login';
}

function getAuthCodeCooldownKey(purpose: AuthCodePurpose, email: string) {
  return `${AUTH_CODE_COOLDOWN_STORAGE_PREFIX}:${purpose}:${email.trim().toLowerCase()}`;
}

function readAuthCodeCooldown(purpose: AuthCodePurpose, email: string) {
  if (typeof window === 'undefined') return 0;
  const cooldownUntil = Number(window.localStorage.getItem(getAuthCodeCooldownKey(purpose, email)));
  if (!Number.isFinite(cooldownUntil)) return 0;
  const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function writeAuthCodeCooldown(purpose: AuthCodePurpose, email: string, seconds: number) {
  if (typeof window === 'undefined' || seconds <= 0) return;
  window.localStorage.setItem(getAuthCodeCooldownKey(purpose, email), String(Date.now() + seconds * 1000));
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>(() => normalizeAuthMode(searchParams.get('mode')));
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const redirectTo = useMemo(() => resolveAuthRedirect(searchParams.get('redirect')), [searchParams]);
  const guestRedirectTo = redirectTo;
  const isLoginMode = mode === 'login';
  const isRegisterMode = mode === 'register';
  const isResetMode = mode === 'reset';
  const isEmailCodeMode = isRegisterMode || isResetMode;
  const emailCodePurpose: AuthCodePurpose = isResetMode ? 'password-reset' : 'register';
  const hasValidEmail = isValidEmailInput(account);
  const needsVerificationCode = isEmailCodeMode;
  const hasValidPassword = password.length >= 6 && !/^\d+$/.test(password);
  const canSendVerificationCode = isEmailCodeMode && hasValidEmail && codeCooldown <= 0 && !isSendingCode && !isSubmitting;
  const authTitle = isLoginMode ? '欢迎回来' : isRegisterMode ? '创建嘟豆豆账号' : '重置密码';
  const authSubtitle = isLoginMode
    ? '继续你的创意拼豆之旅吧！'
    : isRegisterMode
      ? '登录后可同步图纸与配色'
      : '使用邮箱验证码设置新密码';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  useEffect(() => {
    if (codeCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCodeCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  useEffect(() => {
    if (!isEmailCodeMode || !hasValidEmail) {
      setCodeCooldown(0);
      return;
    }

    setCodeCooldown(readAuthCodeCooldown(emailCodePurpose, account));
  }, [account, emailCodePurpose, hasValidEmail, isEmailCodeMode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextMode === 'login') {
      nextSearchParams.delete('mode');
    } else {
      nextSearchParams.set('mode', nextMode);
    }
    setSearchParams(nextSearchParams, { replace: true });
    setMessage('');
    setPassword('');
    setPasswordConfirm('');
    setVerificationCode('');
    setCodeCooldown(0);
    setIsSendingCode(false);
  };

  const handleSendVerificationCode = async () => {
    setMessage('');
    if (!hasValidEmail) {
      setMessage('请输入有效邮箱后再获取验证码');
      return;
    }

    setIsSendingCode(true);
    try {
      const response = isResetMode
        ? await authApi.sendPasswordResetCode({ account: account.trim() })
        : await authApi.sendRegisterCode({ account: account.trim() });
      const retryAfterSeconds = response.retryAfterSeconds || 60;
      setCodeCooldown(retryAfterSeconds);
      writeAuthCodeCooldown(emailCodePurpose, account, retryAfterSeconds);
      setMessage(
        isResetMode
          ? `如果该邮箱已注册，验证码会发送至 ${account.trim()}，${Math.ceil(response.expiresInSeconds / 60)} 分钟内有效`
          : `验证码已发送至 ${account.trim()}，${Math.ceil(response.expiresInSeconds / 60)} 分钟内有效`,
      );
    } catch (error) {
      if (error instanceof authApi.AuthApiError && error.retryAfterSeconds) {
        setCodeCooldown(error.retryAfterSeconds);
        writeAuthCodeCooldown(emailCodePurpose, account, error.retryAfterSeconds);
      }
      setMessage(error instanceof Error ? error.message : '验证码发送失败，请稍后再试');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      if (isLoginMode) {
        await login({ account, password });
        navigate(redirectTo, { replace: true });
      } else if (isRegisterMode) {
        if (!hasValidEmail) {
          setMessage('请输入有效邮箱');
          return;
        }
        if (!hasValidPassword) {
          setMessage('密码需至少 6 位，且不能为纯数字');
          return;
        }
        if (password !== passwordConfirm) {
          setMessage('两次输入的密码不一致');
          return;
        }
        if (needsVerificationCode && !/^\d{6}$/.test(verificationCode.trim())) {
          setMessage('请输入 6 位邮箱验证码');
          return;
        }
        await register({ account, password, passwordConfirm, verificationCode: verificationCode.trim() });
        navigate(redirectTo, { replace: true });
      } else {
        if (!hasValidEmail) {
          setMessage('请输入注册邮箱');
          return;
        }
        if (!hasValidPassword) {
          setMessage('新密码需至少 6 位，且不能为纯数字');
          return;
        }
        if (password !== passwordConfirm) {
          setMessage('两次输入的密码不一致');
          return;
        }
        if (!/^\d{6}$/.test(verificationCode.trim())) {
          setMessage('请输入 6 位邮箱验证码');
          return;
        }
        await authApi.resetPassword({
          account: account.trim(),
          password,
          passwordConfirm,
          verificationCode: verificationCode.trim(),
        });
        switchMode('login');
        setMessage('密码已重置，请使用新密码登录');
      }
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
        <header className="auth-brand">
          <img className="auth-logo" src="/assets/logos/logo_base.png" alt="DoDouDou 嘟豆豆" />
          <h1>
            {isLoginMode ? (
              <>
                <span className="auth-title-mobile">欢迎回来</span>
                <span className="auth-title-tablet">欢迎回到嘟豆豆</span>
              </>
            ) : (
              authTitle
            )}
          </h1>
          <p>{authSubtitle}</p>
        </header>

        <header className="auth-panel-heading" aria-label="嘟豆豆拼豆助手">
          <span aria-hidden="true">✦</span>
          <span className="auth-panel-heading__mark" aria-hidden="true" />
          <strong>嘟豆豆拼豆助手</strong>
          <span aria-hidden="true">✦</span>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-field__icon">
              <MailIcon />
            </span>
            <span className="auth-field__label">账号</span>
            <input
              value={account}
              type="text"
              autoComplete={isEmailCodeMode ? 'email' : 'username'}
              placeholder={isEmailCodeMode ? '请输入邮箱' : '邮箱 / 用户名'}
              onChange={(event) => setAccount(event.target.value)}
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
              minLength={6}
              maxLength={128}
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
              placeholder={isResetMode ? '新密码' : '密码'}
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

          {!isLoginMode ? (
            <>
              <label className="auth-field">
                <span className="auth-field__icon">
                  <LockIcon />
                </span>
                <span className="auth-field__label">{isResetMode ? '确认新密码' : '确认密码'}</span>
                <input
                  value={passwordConfirm}
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder={isResetMode ? '再次输入新密码' : '再次输入密码'}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  required
                />
              </label>

              <div className="auth-code-row">
                <label className="auth-field">
                  <span className="auth-field__icon">
                    <CodeIcon />
                  </span>
                  <span className="auth-field__label">邮箱验证码</span>
                  <input
                    value={verificationCode}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder={hasValidEmail ? '6 位验证码' : '邮箱验证码'}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={!hasValidEmail}
                    required={needsVerificationCode}
                  />
                </label>
                <button
                  type="button"
                  className="auth-code-button"
                  onClick={handleSendVerificationCode}
                  disabled={!canSendVerificationCode}
                >
                  {isSendingCode ? '发送中' : codeCooldown > 0 ? `${codeCooldown}s` : '获取验证码'}
                </button>
              </div>
            </>
          ) : null}

          {isLoginMode ? (
            <div className="auth-options">
              <label className="auth-remember">
                <input type="checkbox" />
                <span>记住我</span>
              </label>
              <button
                type="button"
                className="auth-options__forgot"
                onClick={() => switchMode('reset')}
              >
                忘记密码？
              </button>
            </div>
          ) : null}

          {message ? <p className="auth-message">{message}</p> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting || status === 'loading'}>
            {isSubmitting ? '处理中...' : isLoginMode ? '登录' : isRegisterMode ? '创建并登录' : '重置密码'}
          </button>

          <button
            type="button"
            className="auth-secondary"
            onClick={() => switchMode(isLoginMode ? 'register' : 'login')}
          >
            {isLoginMode ? '注册新账号' : '返回登录'}
          </button>

          {isLoginMode ? (
            <button
              type="button"
              className="auth-forgot"
              onClick={() => switchMode('reset')}
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
