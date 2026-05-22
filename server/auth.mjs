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
  passwordMinLength: parseInteger(process.env.AUTH_PASSWORD_MIN_LENGTH, 8, { min: 6, max: 128 }),
  loginRateLimitMax: parseInteger(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10, { min: 1, max: 10_000 }),
  registerRateLimitMax: parseInteger(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
  rateLimitWindowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
};

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

function normalizeName(value, email) {
  if (typeof value === 'string') {
    const name = value.trim();
    if (name) return name.slice(0, 40);
  }
  return email.split('@')[0].slice(0, 40) || '新用户';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
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

export async function resolveAuthUser(prisma, req) {
  const token = getSessionToken(req);
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
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: '请输入有效邮箱', requestId: req.id });
      }

      if (password.length < authConfig.passwordMinLength || password.length > 128) {
        return res.status(400).json({
          message: `密码长度需要在 ${authConfig.passwordMinLength} 到 128 位之间`,
          requestId: req.id,
        });
      }

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return res.status(409).json({ message: '该邮箱已注册', requestId: req.id });
      }

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          name: normalizeName(req.body?.name, email),
        },
      });
      const token = await createSession(prisma, req, user.id);
      setSessionCookie(res, token);
      res.status(201).json({ user: mapSafeUser(user) });
    } catch (error) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: '该邮箱已注册', requestId: req.id });
      }
      next(error);
    }
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!isValidEmail(email) || !password) {
        return res.status(400).json({ message: '邮箱或密码不正确', requestId: req.id });
      }

      const user = await prisma.user.findUnique({ where: { email } });
      const verified = user ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !verified) {
        return res.status(401).json({ message: '邮箱或密码不正确', requestId: req.id });
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
