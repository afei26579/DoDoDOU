import express from 'express';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

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

const authConfig = {
  cookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'dodoudou_session',
  sessionDays: parseInteger(process.env.AUTH_SESSION_DAYS, 30, { min: 1, max: 365 }),
  cookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  passwordMinLength: parseInteger(process.env.AUTH_PASSWORD_MIN_LENGTH, 6, { min: 6, max: 128 }),
  usernameMinLength: parseInteger(process.env.AUTH_USERNAME_MIN_LENGTH, 8, { min: 8, max: 32 }),
  usernameMaxLength: parseInteger(process.env.AUTH_USERNAME_MAX_LENGTH, 32, { min: 8, max: 64 }),
  loginRateLimitMax: parseInteger(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10, { min: 1, max: 10_000 }),
  registerRateLimitMax: parseInteger(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
  rateLimitWindowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
  wechatAppId: process.env.WECHAT_MINIPROGRAM_APP_ID?.trim() || '',
  wechatAppSecret: process.env.WECHAT_MINIPROGRAM_APP_SECRET?.trim() || '',
  wechatDevLoginEnabled: parseBoolean(process.env.WECHAT_MINIPROGRAM_DEV_LOGIN_ENABLED, process.env.NODE_ENV !== 'production'),
};

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

  router.use(express.json({ limit: '64kb', strict: true }));

  router.get('/me', async (req, res, next) => {
    try {
      const user = await resolveAuthUser(prisma, req);
      res.json({ user: mapSafeUser(user) });
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

      if (!identity.ok) {
        return res.status(400).json({ message: identity.message, requestId: req.id });
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
