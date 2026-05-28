import express from 'express';
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Resend } from 'resend';

const scrypt = promisify(scryptCallback);
const emailVerificationCodes = new Map();
const emailVerificationSendBuckets = new Map();
const emailVerificationPepper = randomBytes(32).toString('base64url');
const EMAIL_VERIFICATION_CODE_PATTERN = /^\d{6}$/;
const EMAIL_CODE_PURPOSES = {
  register: 'register',
  passwordReset: 'password-reset',
};

let resendClient = null;
let resendApiKey = '';

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function readAuthConfig() {
  return {
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'dodoudou_session',
    sessionDays: parseInteger(process.env.AUTH_SESSION_DAYS, 30, { min: 1, max: 365 }),
    cookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    passwordMinLength: parseInteger(process.env.AUTH_PASSWORD_MIN_LENGTH, 6, { min: 6, max: 128 }),
    usernameMinLength: parseInteger(process.env.AUTH_USERNAME_MIN_LENGTH, 8, { min: 8, max: 32 }),
    usernameMaxLength: parseInteger(process.env.AUTH_USERNAME_MAX_LENGTH, 32, { min: 8, max: 64 }),
    loginRateLimitMax: parseInteger(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10, { min: 1, max: 10_000 }),
    registerRateLimitMax: parseInteger(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
    passwordResetRateLimitMax: parseInteger(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
    emailCodeRateLimitMax: parseInteger(process.env.AUTH_EMAIL_CODE_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
    emailCodeTtlMinutes: parseInteger(process.env.AUTH_EMAIL_CODE_TTL_MINUTES, 5, { min: 1, max: 60 }),
    emailCodeCooldownSeconds: parseInteger(process.env.AUTH_EMAIL_CODE_COOLDOWN_SECONDS, 60, { min: 10, max: 600 }),
    emailCodeMaxAttempts: parseInteger(process.env.AUTH_EMAIL_CODE_MAX_ATTEMPTS, 5, { min: 1, max: 20 }),
    emailCodeEmailRateLimitMax: parseInteger(process.env.AUTH_EMAIL_CODE_EMAIL_RATE_LIMIT_MAX, 3, { min: 1, max: 100 }),
    emailCodeEmailRateLimitWindowMs: parseInteger(process.env.AUTH_EMAIL_CODE_EMAIL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, { min: 60_000, max: 24 * 60 * 60 * 1000 }),
    emailFrom: process.env.AUTH_EMAIL_FROM?.trim() || '嘟豆豆 <noreply@dodoudou.xyz>',
    emailSubject: process.env.AUTH_EMAIL_SUBJECT?.trim() || '注册验证',
    passwordResetEmailSubject: process.env.AUTH_PASSWORD_RESET_EMAIL_SUBJECT?.trim() || '重置密码验证',
    emailLogoUrl: process.env.AUTH_EMAIL_LOGO_URL?.trim() || 'https://dodoudou.xyz/assets/logos/logo_base.png',
    rateLimitWindowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
    wechatAppId: process.env.WECHAT_MINIPROGRAM_APP_ID?.trim() || '',
    wechatAppSecret: process.env.WECHAT_MINIPROGRAM_APP_SECRET?.trim() || '',
    wechatDevLoginEnabled: parseBoolean(process.env.WECHAT_MINIPROGRAM_DEV_LOGIN_ENABLED, process.env.NODE_ENV !== 'production'),
  };
}

let authConfig = readAuthConfig();

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

function createRateLimiter({ windowMs, max, name }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.method}:${req.path}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message: `${name} rate limit exceeded`,
        requestId: req.id,
        retryAfterSeconds,
      });
    }

    next();
  };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return (
    username.length >= authConfig.usernameMinLength &&
    username.length <= authConfig.usernameMaxLength &&
    !/^\d+$/.test(username) &&
    USERNAME_PATTERN.test(username)
  );
}

function validateRegisterPassword(password) {
  if (password.length < authConfig.passwordMinLength || password.length > 128) {
    return `密码长度需要在 ${authConfig.passwordMinLength} 到 128 位之间`;
  }

  if (/^\d+$/.test(password)) {
    return '密码不能为纯数字';
  }

  return null;
}

function readAccountInput(body) {
  if (typeof body?.account === 'string') return body.account;
  if (typeof body?.email === 'string') return body.email;
  if (typeof body?.username === 'string') return body.username;
  return '';
}

function normalizeIdentity(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { ok: false, message: '请输入邮箱或用户名' };

  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    return isValidEmail(email)
      ? { ok: true, kind: 'email', value: email }
      : { ok: false, message: '请输入有效邮箱' };
  }

  const username = normalizeUsername(raw);
  return isValidUsername(username)
    ? { ok: true, kind: 'username', value: username }
    : {
        ok: false,
        message: `用户名需为 ${authConfig.usernameMinLength}-${authConfig.usernameMaxLength} 位字母、数字或下划线，且不能为纯数字`,
      };
}

function getIdentityCreateData(identity) {
  return identity.kind === 'email'
    ? { email: identity.value, username: null }
    : { email: null, username: identity.value };
}

async function findUserByIdentity(prisma, identity) {
  if (identity.kind === 'email') {
    return prisma.user.findUnique({ where: { email: identity.value } });
  }
  return prisma.user.findUnique({ where: { username: identity.value } });
}

function getIdentityConflictMessage(identity) {
  return identity.kind === 'email' ? '该邮箱已注册' : '该用户名已注册';
}

function getUniqueConstraintMessage(error) {
  const target = error?.meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  if (fields.some((field) => String(field).includes('username'))) return '该用户名已注册';
  if (fields.some((field) => String(field).includes('email'))) return '该邮箱已注册';
  return '该账号已注册';
}

function createAuthError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  if (!apiKey) return null;
  if (!resendClient || resendApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendApiKey = apiKey;
  }
  return resendClient;
}

function generateEmailVerificationCode() {
  return randomInt(100000, 1000000).toString();
}

function getEmailVerificationKey(purpose, email) {
  return `${purpose}:${email}`;
}

function hashEmailVerificationCode(purpose, email, code) {
  return createHash('sha256')
    .update(`${purpose}:${email}:${code}:${emailVerificationPepper}`)
    .digest('hex');
}

function safeStringEquals(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function pruneExpiredEmailVerificationCodes(now = Date.now()) {
  for (const [email, record] of emailVerificationCodes.entries()) {
    if (record.expiresAt <= now) {
      emailVerificationCodes.delete(email);
    }
  }
}

function pruneEmailVerificationSendBuckets(now = Date.now()) {
  for (const [key, bucket] of emailVerificationSendBuckets.entries()) {
    if (bucket.resetAt <= now) {
      emailVerificationSendBuckets.delete(key);
    }
  }
}

function checkEmailVerificationSendLimit(purpose, email, now = Date.now()) {
  pruneEmailVerificationSendBuckets(now);
  const key = getEmailVerificationKey(purpose, email);
  const current = emailVerificationSendBuckets.get(key);

  if (!current || current.resetAt <= now) {
    emailVerificationSendBuckets.set(key, {
      count: 1,
      resetAt: now + authConfig.emailCodeEmailRateLimitWindowMs,
    });
    return { ok: true };
  }

  current.count += 1;
  if (current.count > authConfig.emailCodeEmailRateLimitMax) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  return { ok: true };
}

function storeEmailVerificationCode(purpose, email, code, now = Date.now()) {
  pruneExpiredEmailVerificationCodes(now);
  emailVerificationCodes.set(getEmailVerificationKey(purpose, email), {
    codeHash: hashEmailVerificationCode(purpose, email, code),
    expiresAt: now + authConfig.emailCodeTtlMinutes * 60 * 1000,
    nextSendAt: now + authConfig.emailCodeCooldownSeconds * 1000,
    attempts: 0,
  });
}

function clearEmailVerificationCode(purpose, email) {
  emailVerificationCodes.delete(getEmailVerificationKey(purpose, email));
}

function consumeEmailVerificationCode(purpose, email, code) {
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  if (!EMAIL_VERIFICATION_CODE_PATTERN.test(normalizedCode)) {
    return { ok: false, message: '请输入 6 位邮箱验证码' };
  }

  const now = Date.now();
  pruneExpiredEmailVerificationCodes(now);
  const key = getEmailVerificationKey(purpose, email);
  const record = emailVerificationCodes.get(key);
  if (!record) {
    return { ok: false, message: '验证码已过期，请重新获取' };
  }

  const actualHash = hashEmailVerificationCode(purpose, email, normalizedCode);
  if (!safeStringEquals(actualHash, record.codeHash)) {
    record.attempts += 1;
    if (record.attempts >= authConfig.emailCodeMaxAttempts) {
      emailVerificationCodes.delete(key);
      return { ok: false, message: '验证码错误次数过多，请重新获取' };
    }
    return { ok: false, message: '验证码不正确' };
  }

  emailVerificationCodes.delete(key);
  return { ok: true };
}

function getEmailVerificationRetryAfter(purpose, email) {
  const record = emailVerificationCodes.get(getEmailVerificationKey(purpose, email));
  if (!record) return 0;
  return Math.max(0, Math.ceil((record.nextSendAt - Date.now()) / 1000));
}

function getVerificationEmailContent(purpose) {
  if (purpose === EMAIL_CODE_PURPOSES.passwordReset) {
    return {
      subject: authConfig.passwordResetEmailSubject,
      title: '重置密码验证码',
      lead: '把这串小珠子填回找回密码页面，就可以设置新的登录密码。',
      scope: '验证码只用于本次密码重置。',
      ignored: '如果不是你本人操作，可以直接忽略这封邮件，你的密码不会被修改。',
      textTitle: '嘟豆豆重置密码验证码',
    };
  }

  return {
    subject: authConfig.emailSubject,
    title: '邮箱验证码',
    lead: '把这串小珠子填回注册页面，就能继续保存你的拼豆创作。',
    scope: '验证码只用于本次邮箱注册。',
    ignored: '如果不是你本人操作，可以直接忽略这封邮件，你的账号不会被创建。',
    textTitle: '嘟豆豆验证码',
  };
}

function renderVerificationEmailText(code, purpose) {
  const content = getVerificationEmailContent(purpose);
  return [
    `${content.textTitle}：${code}`,
    `验证码 ${authConfig.emailCodeTtlMinutes} 分钟内有效。`,
    '如果不是你本人操作，请忽略这封邮件。',
  ].join('\n');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderVerificationEmailHtml(code, purpose) {
  const content = getVerificationEmailContent(purpose);
  const ttlText = `${authConfig.emailCodeTtlMinutes} 分钟内有效`;
  const logoHtml = authConfig.emailLogoUrl
    ? `<img src="${escapeHtmlAttribute(authConfig.emailLogoUrl)}" width="210" alt="嘟豆豆 DoDouDou" style="display:block;width:210px;max-width:78%;height:auto;margin:0 auto 4px;border:0;outline:none;text-decoration:none;">`
    : '<div style="font-size:24px;font-weight:bold;color:#5D534A;margin-bottom:10px;">DoDouDou 嘟豆豆</div>';

  return `
    <div style="font-family:'PingFang SC','Microsoft YaHei',Arial,sans-serif;background:#FDFBF7;margin:0;padding:28px 12px;color:#5D534A;">
      <div style="max-width:500px;margin:0 auto;padding:24px 24px 22px;background:#FFFFFF;border:1px solid rgba(93,83,74,0.12);border-radius:24px;box-shadow:0 4px 24px rgba(216,180,226,0.18),0 1px 4px rgba(93,83,74,0.06);">
        <div style="text-align:center;padding:2px 0 14px;">
          ${logoHtml}
          <div style="font-size:0;line-height:0;margin-top:4px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D8B4E2;margin:0 4px;"></span>
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B5EAD7;margin:0 4px;"></span>
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FFDAC1;margin:0 4px;"></span>
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D8B4E2;margin:0 4px;"></span>
          </div>
        </div>
        <div style="border-radius:20px;background:#FDFBF7;border:1px solid #F0E7F4;padding:22px 20px;text-align:center;">
          <div style="display:inline-block;color:#B48FCC;background:#F7ECFB;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:bold;margin-bottom:12px;">${ttlText}</div>
          <h2 style="color:#5D534A;margin:0 0 8px;font-size:24px;line-height:1.35;">${content.title}</h2>
          <p style="color:#7B6F66;font-size:14px;line-height:1.7;margin:0 auto;max-width:360px;">${content.lead}</p>
          <div style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#5D534A;background:#FFFFFF;border:1px solid rgba(216,180,226,0.55);padding:18px 22px 18px 32px;border-radius:16px;display:inline-block;margin:20px 0 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.9);">${code}</div>
          <p style="color:#6DC4A8;font-size:13px;font-weight:bold;margin:0;">请在 ${authConfig.emailCodeTtlMinutes} 分钟内完成验证</p>
        </div>
        <div style="padding:18px 4px 0;">
          <p style="color:#9C9188;font-size:13px;line-height:1.7;margin:0;">为了账号安全，请不要把验证码告诉其他人。${content.scope}</p>
          <div style="height:1px;background:#F0E7F4;margin:16px 0 12px;"></div>
          <p style="color:#C4BAB2;font-size:12px;line-height:1.6;margin:0;">${content.ignored}</p>
        </div>
      </div>
    </div>
  `;
}

async function sendEmailVerificationCode(email, code, purpose) {
  const resend = getResendClient();
  if (!resend) {
    throw createAuthError('邮件服务未配置，请稍后再试', 503);
  }

  const content = getVerificationEmailContent(purpose);
  const { data, error } = await resend.emails.send({
    from: authConfig.emailFrom,
    to: email,
    subject: content.subject,
    html: renderVerificationEmailHtml(code, purpose),
    text: renderVerificationEmailText(code, purpose),
  });

  if (error) {
    console.error(JSON.stringify({ message: 'Resend email verification failed', error }));
    throw createAuthError('验证码邮件发送失败，请稍后再试', 502);
  }

  console.info(JSON.stringify({
    message: 'Resend email verification queued',
    purpose,
    to: email,
    from: authConfig.emailFrom,
    messageId: data?.id ?? null,
  }));
}

function mapSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string') return false;
  const [scheme, salt, stored] = passwordHash.split('$');
  if (scheme !== 'scrypt' || !salt || !stored) return false;

  const derived = await scrypt(password, salt, 64);
  const actualBuffer = Buffer.from(derived);
  const expectedBuffer = Buffer.from(stored, 'base64url');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return [];
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!key) return [];
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [[key, value]];
      }
    }),
  );
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies[authConfig.cookieName] || '';
}

function getBearerToken(req) {
  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getCookieOptions({ maxAgeSeconds }) {
  const parts = [
    `${authConfig.cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (authConfig.cookieSecure) parts.push('Secure');
  return parts;
}

function setSessionCookie(res, token) {
  const maxAgeSeconds = authConfig.sessionDays * 24 * 60 * 60;
  const parts = getCookieOptions({ maxAgeSeconds });
  parts[0] = `${authConfig.cookieName}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', getCookieOptions({ maxAgeSeconds: 0 }).join('; '));
}

async function createSession(prisma, req, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + authConfig.sessionDays * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: req.get('User-Agent')?.slice(0, 500) || null,
      ipAddress: req.ip || null,
      expiresAt,
    },
  });
  return token;
}

async function findSessionUser(prisma, token) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (session.user.status !== 'active') return null;
  return session.user;
}

export async function resolveAuthUser(prisma, req) {
  const bearerUser = await findSessionUser(prisma, getBearerToken(req));
  if (bearerUser) return bearerUser;
  return findSessionUser(prisma, getSessionToken(req));
}

export function optionalAuth(prisma) {
  return async (req, _res, next) => {
    try {
      req.user = await resolveAuthUser(prisma, req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(prisma) {
  return async (req, res, next) => {
    try {
      const user = await resolveAuthUser(prisma, req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required', requestId: req.id });
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'Permission denied', requestId: req.id });
    }
    next();
  };
}

export function createAuthRouter(prisma) {
  authConfig = readAuthConfig();
  const router = express.Router();
  const loginLimiter = createRateLimiter({
    windowMs: authConfig.rateLimitWindowMs,
    max: authConfig.loginRateLimitMax,
    name: 'Login',
  });
  const registerLimiter = createRateLimiter({
    windowMs: authConfig.rateLimitWindowMs,
    max: authConfig.registerRateLimitMax,
    name: 'Register',
  });
  const passwordResetLimiter = createRateLimiter({
    windowMs: authConfig.rateLimitWindowMs,
    max: authConfig.passwordResetRateLimitMax,
    name: 'Password reset',
  });
  const emailCodeLimiter = createRateLimiter({
    windowMs: authConfig.rateLimitWindowMs,
    max: authConfig.emailCodeRateLimitMax,
    name: 'Email verification',
  });

  router.use(express.json({ limit: '64kb', strict: true }));

  router.get('/me', async (req, res, next) => {
    try {
      const user = await resolveAuthUser(prisma, req);
      res.json({ user: mapSafeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/register-code', emailCodeLimiter, async (req, res, next) => {
    try {
      const identity = normalizeIdentity(readAccountInput(req.body));
      if (!identity.ok || identity.kind !== 'email') {
        return res.status(400).json({ message: '请输入有效邮箱', requestId: req.id });
      }

      const exists = await findUserByIdentity(prisma, identity);
      if (exists) {
        return res.status(409).json({ message: '该邮箱已注册', requestId: req.id });
      }

      const retryAfterSeconds = getEmailVerificationRetryAfter(EMAIL_CODE_PURPOSES.register, identity.value);
      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: '验证码已发送，请稍后再试',
          requestId: req.id,
          retryAfterSeconds,
        });
      }

      const emailSendLimit = checkEmailVerificationSendLimit(EMAIL_CODE_PURPOSES.register, identity.value);
      if (!emailSendLimit.ok) {
        res.setHeader('Retry-After', String(emailSendLimit.retryAfterSeconds));
        return res.status(429).json({
          message: '验证码请求过于频繁，请稍后再试',
          requestId: req.id,
          retryAfterSeconds: emailSendLimit.retryAfterSeconds,
        });
      }

      const code = generateEmailVerificationCode();
      storeEmailVerificationCode(EMAIL_CODE_PURPOSES.register, identity.value, code);
      try {
        await sendEmailVerificationCode(identity.value, code, EMAIL_CODE_PURPOSES.register);
      } catch (error) {
        clearEmailVerificationCode(EMAIL_CODE_PURPOSES.register, identity.value);
        throw error;
      }

      res.json({
        ok: true,
        expiresInSeconds: authConfig.emailCodeTtlMinutes * 60,
        retryAfterSeconds: authConfig.emailCodeCooldownSeconds,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/register', registerLimiter, async (req, res, next) => {
    try {
      const identity = normalizeIdentity(readAccountInput(req.body));
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const passwordConfirm = typeof req.body?.passwordConfirm === 'string'
        ? req.body.passwordConfirm
        : typeof req.body?.confirmPassword === 'string'
          ? req.body.confirmPassword
          : '';
      const verificationCode = typeof req.body?.verificationCode === 'string' ? req.body.verificationCode : '';

      if (!identity.ok) {
        return res.status(400).json({ message: identity.message, requestId: req.id });
      }

      if (identity.kind !== 'email') {
        return res.status(400).json({ message: '注册请使用邮箱', requestId: req.id });
      }

      if (!passwordConfirm || password !== passwordConfirm) {
        return res.status(400).json({ message: '两次输入的密码不一致', requestId: req.id });
      }

      const passwordError = validateRegisterPassword(password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError, requestId: req.id });
      }

      const exists = await findUserByIdentity(prisma, identity);
      if (exists) {
        return res.status(409).json({ message: getIdentityConflictMessage(identity), requestId: req.id });
      }

      const verification = consumeEmailVerificationCode(EMAIL_CODE_PURPOSES.register, identity.value, verificationCode);
      if (!verification.ok) {
        return res.status(400).json({ message: verification.message, requestId: req.id });
      }

      const user = await prisma.user.create({
        data: {
          ...getIdentityCreateData(identity),
          passwordHash: await hashPassword(password),
        },
      });
      const token = await createSession(prisma, req, user.id);
      setSessionCookie(res, token);
      res.status(201).json({ user: mapSafeUser(user) });
    } catch (error) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: getUniqueConstraintMessage(error), requestId: req.id });
      }
      next(error);
    }
  });

  router.post('/password-reset-code', emailCodeLimiter, async (req, res, next) => {
    try {
      const identity = normalizeIdentity(readAccountInput(req.body));
      if (!identity.ok || identity.kind !== 'email') {
        return res.status(400).json({ message: '请输入有效邮箱', requestId: req.id });
      }

      const retryAfterSeconds = getEmailVerificationRetryAfter(EMAIL_CODE_PURPOSES.passwordReset, identity.value);
      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: '验证码已发送，请稍后再试',
          requestId: req.id,
          retryAfterSeconds,
        });
      }

      const emailSendLimit = checkEmailVerificationSendLimit(EMAIL_CODE_PURPOSES.passwordReset, identity.value);
      if (!emailSendLimit.ok) {
        res.setHeader('Retry-After', String(emailSendLimit.retryAfterSeconds));
        return res.status(429).json({
          message: '验证码请求过于频繁，请稍后再试',
          requestId: req.id,
          retryAfterSeconds: emailSendLimit.retryAfterSeconds,
        });
      }

      const user = await prisma.user.findUnique({ where: { email: identity.value } });
      const code = generateEmailVerificationCode();
      storeEmailVerificationCode(EMAIL_CODE_PURPOSES.passwordReset, identity.value, code);
      if (user?.status === 'active') {
        try {
          await sendEmailVerificationCode(identity.value, code, EMAIL_CODE_PURPOSES.passwordReset);
        } catch (error) {
          clearEmailVerificationCode(EMAIL_CODE_PURPOSES.passwordReset, identity.value);
          throw error;
        }
      }

      res.json({
        ok: true,
        expiresInSeconds: authConfig.emailCodeTtlMinutes * 60,
        retryAfterSeconds: authConfig.emailCodeCooldownSeconds,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset', passwordResetLimiter, async (req, res, next) => {
    try {
      const identity = normalizeIdentity(readAccountInput(req.body));
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const passwordConfirm = typeof req.body?.passwordConfirm === 'string'
        ? req.body.passwordConfirm
        : typeof req.body?.confirmPassword === 'string'
          ? req.body.confirmPassword
          : '';
      const verificationCode = typeof req.body?.verificationCode === 'string' ? req.body.verificationCode : '';

      if (!identity.ok || identity.kind !== 'email') {
        return res.status(400).json({ message: '请输入有效邮箱', requestId: req.id });
      }

      if (!passwordConfirm || password !== passwordConfirm) {
        return res.status(400).json({ message: '两次输入的密码不一致', requestId: req.id });
      }

      const passwordError = validateRegisterPassword(password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError, requestId: req.id });
      }

      const verification = consumeEmailVerificationCode(EMAIL_CODE_PURPOSES.passwordReset, identity.value, verificationCode);
      if (!verification.ok) {
        return res.status(400).json({ message: verification.message, requestId: req.id });
      }

      const user = await prisma.user.findUnique({ where: { email: identity.value } });
      if (!user || user.status !== 'active') {
        return res.status(400).json({ message: '验证码已过期，请重新获取', requestId: req.id });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(password) },
        }),
        prisma.session.deleteMany({ where: { userId: user.id } }),
      ]);
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/wechat-login', loginLimiter, async (req, res, next) => {
    try {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!code) {
        return res.status(400).json({ message: 'wx.login code is required', requestId: req.id });
      }

      const wechatSession = await exchangeWechatLoginCode(code);
      const provider = 'wechat_miniprogram';
      const account = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId: wechatSession.openid,
          },
        },
        include: { user: true },
      });

      let user = account?.user ?? null;
      if (user?.status && user.status !== 'active') {
        return res.status(403).json({ message: '账号当前不可用', requestId: req.id });
      }

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: '微信用户',
            oauthAccounts: {
              create: {
                provider,
                providerAccountId: wechatSession.openid,
              },
            },
          },
        });
      }

      const token = await createSession(prisma, req, user.id);
      res.json({
        token,
        user: mapSafeUser(user),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const identity = normalizeIdentity(readAccountInput(req.body));
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!identity.ok || !password) {
        return res.status(400).json({ message: '账号或密码不正确', requestId: req.id });
      }

      const user = await findUserByIdentity(prisma, identity);
      const verified = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !verified) {
        return res.status(401).json({ message: '账号或密码不正确', requestId: req.id });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ message: '账号当前不可用', requestId: req.id });
      }

      const token = await createSession(prisma, req, user.id);
      setSessionCookie(res, token);
      res.json({ user: mapSafeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const token = getSessionToken(req);
      if (token) {
        await prisma.session.delete({ where: { tokenHash: hashSessionToken(token) } }).catch(() => undefined);
      }
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function exchangeWechatLoginCode(code) {
  if (authConfig.wechatAppId && authConfig.wechatAppSecret) {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', authConfig.wechatAppId);
    url.searchParams.set('secret', authConfig.wechatAppSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const response = await fetch(url);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.errcode) {
      const message = payload?.errmsg || `WeChat login failed: ${response.status}`;
      const error = new Error(message);
      error.status = 502;
      throw error;
    }

    if (typeof payload.openid !== 'string' || !payload.openid) {
      const error = new Error('WeChat login did not return openid');
      error.status = 502;
      throw error;
    }

    return {
      openid: payload.openid,
      unionid: typeof payload.unionid === 'string' ? payload.unionid : null,
    };
  }

  if (!authConfig.wechatDevLoginEnabled) {
    const error = new Error('WeChat mini program credentials are not configured');
    error.status = 503;
    throw error;
  }

  return {
    openid: `dev_${createHash('sha256').update(code).digest('hex').slice(0, 32)}`,
    unionid: null,
  };
}
