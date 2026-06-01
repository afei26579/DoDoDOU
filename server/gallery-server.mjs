import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminRouter } from './admin.mjs';
import { createAuthRouter, optionalAuth, requireAuth } from './auth.mjs';
import { createAssetsRouter } from './assets.mjs';
import { prisma } from './db.mjs';
import { createInventoryRouter } from './inventory.mjs';
import { createPatternRouter } from './pattern.mjs';
import { createProjectsRouter } from './projects.mjs';
import { createSubscriptionRouter } from './subscription.mjs';
import { ensureMonthlyUsageAvailable, recordUsageEvent, requireCapability, sendUsageLimitExceeded } from './entitlements.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const galleryItemDataDir = path.join(rootDir, 'public', 'data', 'gallery', 'items');
const initialEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(filePath, { override = false } = {}) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      if (initialEnvKeys.has(key)) continue;
      if (!override && process.env[key] !== undefined) continue;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Optional local env files are allowed to be missing.
  }
}

loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(rootDir, '.env.local'), { override: true });

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

function parseList(value, fallback) {
  if (!value) return fallback;
  const items = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function normalizeHostname(value) {
  return String(value || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

function parseHostList(value, fallback) {
  return parseList(value, fallback)
    .map(normalizeHostname)
    .filter(Boolean);
}

function resolveExistingFile(paths) {
  return paths.find((filePath) => existsSync(filePath)) || paths[0];
}

function getDisplayHost(value) {
  try {
    return new URL(value).hostname || value;
  } catch {
    return String(value || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '') || 'dodoudou.xyz';
  }
}

function normalizeMountPath(value, fallback) {
  const input = typeof value === 'string' ? value.trim() : '';
  const pathValue = input || fallback;
  const withSlash = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  const normalized = withSlash.replace(/\/+$/, '') || fallback;
  return /^\/[A-Za-z0-9/_-]+$/.test(normalized) ? normalized : fallback;
}

function appendOrigin(origins, origin) {
  if (!origin) return origins;
  return origins.includes(origin) ? origins : [...origins, origin];
}

async function ensureDirs() {
  await mkdir(galleryItemDataDir, { recursive: true });
}

function resolveGalleryItemFilePath(itemId) {
  return path.join(galleryItemDataDir, `${itemId}.json`);
}

async function writeJsonFile(filePath, payload) {
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function getAllowedOrigins() {
  const origins = parseList(process.env.GALLERY_ALLOWED_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  if (!parseBoolean(process.env.GALLERY_DEV_LAN_ENABLED, false)) return origins;

  const lanHost = process.env.GALLERY_DEV_LAN_HOST?.trim();
  if (!lanHost) return origins;

  const frontendPort = process.env.VITE_DEV_SERVER_PORT || '5173';
  return appendOrigin(origins, `http://${lanHost}:${frontendPort}`);
}

function getServerHost() {
  if (parseBoolean(process.env.GALLERY_DEV_LAN_ENABLED, false)) return '0.0.0.0';
  return process.env.GALLERY_SERVER_HOST || '127.0.0.1';
}

const publicBetaUrl = process.env.PUBLIC_BETA_URL?.trim() || 'https://dodoudou.xyz';

const config = {
  host: getServerHost(),
  port: parseInteger(process.env.GALLERY_SERVER_PORT, 3001, { min: 1, max: 65535 }),
  allowedOrigins: getAllowedOrigins(),
  jsonBodyLimit: process.env.GALLERY_JSON_BODY_LIMIT || '5mb',
  publishEnabled: parseBoolean(process.env.GALLERY_PUBLISH_ENABLED, true),
  requireWriteToken: parseBoolean(process.env.GALLERY_REQUIRE_WRITE_TOKEN, true),
  writeToken: process.env.GALLERY_WRITE_TOKEN?.trim() || '',
  rateLimitWindowMs: parseInteger(process.env.GALLERY_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
  rateLimitMax: parseInteger(process.env.GALLERY_RATE_LIMIT_MAX, 120, { min: 1, max: 100_000 }),
  publishRateLimitMax: parseInteger(process.env.GALLERY_PUBLISH_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
  adminApiPrefix: normalizeMountPath(process.env.ADMIN_API_PREFIX, '/api/_ops_dodoudou_9c41f7'),
  maxPatternCells: parseInteger(process.env.GALLERY_MAX_PATTERN_CELLS, 10_000, { min: 1, max: 200_000 }),
  maxDataUrlChars: parseInteger(process.env.GALLERY_MAX_DATA_URL_CHARS, 1_500_000, { min: 1_000, max: 20_000_000 }),
  trustProxy: parseBoolean(process.env.GALLERY_TRUST_PROXY, false),
  productionClosedHosts: parseHostList(process.env.PRODUCTION_CLOSED_HOSTS, ['dodoudou.com', 'www.dodoudou.com']),
  productionClosedPagePath: resolveExistingFile([
    path.join(distDir, 'official-login.html'),
    path.join(publicDir, 'official-login.html'),
  ]),
  publicBetaUrl,
  publicBetaHost: getDisplayHost(publicBetaUrl),
};

const allowAnyOrigin = config.allowedOrigins.includes('*');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (req.method !== 'GET' || res.statusCode >= 400) {
      console.info(
        JSON.stringify({
          requestId: req.id,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ip: req.ip,
          origin: req.headers.origin ?? null,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    }
  });
  next();
});

function isProductionClosedHost(req) {
  return config.productionClosedHosts.includes(normalizeHostname(req.headers.host));
}

function sendProductionClosedResponse(req, res) {
  const message = `正式服未开放。内测进行中。网址是 ${config.publicBetaHost}`;
  res.setHeader('Cache-Control', 'no-store');

  if (req.path.startsWith('/api/')) {
    return res.status(403).json({
      message,
      betaUrl: config.publicBetaUrl,
      requestId: req.id,
    });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.sendFile(config.productionClosedPagePath);
  }

  return res.status(403).json({
    message,
    betaUrl: config.publicBetaUrl,
    requestId: req.id,
  });
}

function productionClosedGate(req, res, next) {
  if (!isProductionClosedHost(req)) return next();
  if (req.path.startsWith('/assets/') || req.path.startsWith('/uploads/')) return next();
  if (req.path.startsWith('/.well-known/acme-challenge/')) return next();
  return sendProductionClosedResponse(req, res);
}

function applyCors(req, res, next) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (origin && (allowAnyOrigin || config.allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Token');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    return origin && !allowAnyOrigin && !config.allowedOrigins.includes(origin)
      ? res.sendStatus(403)
      : res.sendStatus(204);
  }

  if (origin && !allowAnyOrigin && !config.allowedOrigins.includes(origin)) {
    return res.status(403).json({ message: 'Origin is not allowed', requestId: req.id });
  }

  next();
}

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

const globalRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  name: 'API',
});

const publishRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.publishRateLimitMax,
  name: 'Publish',
});

app.use('/assets', express.static(path.join(distDir, 'assets'), {
  index: false,
  maxAge: '7d',
}));
app.use('/assets', express.static(path.join(publicDir, 'assets'), {
  index: false,
  maxAge: '7d',
}));
app.use(productionClosedGate);
app.use(applyCors);
app.use(globalRateLimiter);
app.use('/uploads', express.static(path.join(rootDir, 'public', 'uploads'), {
  index: false,
  maxAge: '7d',
}));
app.use('/api/auth', createAuthRouter(prisma));
app.use('/api/assets', createAssetsRouter(prisma, { rootDir }));
app.use('/api/inventory', createInventoryRouter(prisma));
app.use('/api/pattern', createPatternRouter(prisma, { rootDir }));
app.use('/api/projects', createProjectsRouter(prisma));
app.use('/api/subscription', createSubscriptionRouter(prisma));
app.use(config.adminApiPrefix, createAdminRouter(prisma));

function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'gallery-item';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addValidationError(errors, message) {
  if (errors.length < 20) errors.push(message);
}

function normalizeRequiredText(value, field, maxLength, errors) {
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return '';
  }

  const normalized = value.trim();
  if (!normalized) addValidationError(errors, `${field} is required`);
  if (normalized.length > maxLength) addValidationError(errors, `${field} is too long`);
  return normalized.slice(0, maxLength);
}

function normalizeOptionalText(value, field, maxLength, errors) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return '';
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) addValidationError(errors, `${field} is too long`);
  return normalized.slice(0, maxLength);
}

function normalizeSafeId(value, field, fallback, errors) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return fallback;
  }

  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(normalized)) {
    addValidationError(errors, `${field} contains unsupported characters`);
    return fallback;
  }
  return normalized;
}

function normalizeInteger(value, field, min, max, errors) {
  if (!Number.isInteger(value) || value < min || value > max) {
    addValidationError(errors, `${field} must be an integer between ${min} and ${max}`);
    return min;
  }
  return value;
}

function normalizeImageUrl(value, field, required, errors) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, `${field} is required`);
    return '';
  }

  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return '';
  }

  const normalized = value.trim();
  if (normalized.length > config.maxDataUrlChars) {
    addValidationError(errors, `${field} is too large`);
    return '';
  }

  if (normalized.startsWith('data:image/png;base64,')) return normalized;
  if (normalized.startsWith('/assets/') || normalized.startsWith('/data/')) return normalized;

  try {
    const url = new URL(normalized);
    if (url.protocol === 'https:' || url.protocol === 'http:') return normalized;
  } catch {
    // Handled by the validation error below.
  }

  addValidationError(errors, `${field} must be a png data URL, http(s) URL, or local asset path`);
  return '';
}

function normalizeTags(value, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    addValidationError(errors, 'tags must be an array');
    return [];
  }

  if (value.length > 10) addValidationError(errors, 'tags cannot contain more than 10 items');
  return value.slice(0, 10).flatMap((tag, index) => {
    if (typeof tag !== 'string') {
      addValidationError(errors, `tags[${index}] must be a string`);
      return [];
    }
    const normalized = tag.trim();
    if (!normalized) return [];
    if (normalized.length > 24) addValidationError(errors, `tags[${index}] is too long`);
    return [normalized.slice(0, 24)];
  });
}

function normalizePatternPayload(value, width, height, errors) {
  if (!isPlainObject(value)) {
    addValidationError(errors, 'patternDetail.patternPayload must be an object');
    return { cells: [], palette: [], stats: { totalCells: 0, colorCount: 0 } };
  }

  const cells = Array.isArray(value.cells) ? value.cells : [];
  const palette = Array.isArray(value.palette) ? value.palette : [];
  if (!Array.isArray(value.cells)) addValidationError(errors, 'patternDetail.patternPayload.cells must be an array');
  if (cells.length > config.maxPatternCells) addValidationError(errors, 'patternDetail.patternPayload.cells is too large');
  if (palette.length > 512) addValidationError(errors, 'patternDetail.patternPayload.palette is too large');

  for (let index = 0; index < Math.min(cells.length, config.maxPatternCells); index += 1) {
    const cell = cells[index];
    if (!isPlainObject(cell)) {
      addValidationError(errors, `cells[${index}] must be an object`);
      continue;
    }
    if (!Number.isInteger(cell.x) || cell.x < 0 || cell.x >= width) addValidationError(errors, `cells[${index}].x is out of range`);
    if (!Number.isInteger(cell.y) || cell.y < 0 || cell.y >= height) addValidationError(errors, `cells[${index}].y is out of range`);
  }

  return {
    cells: cells.slice(0, config.maxPatternCells),
    palette: palette.slice(0, 512),
    stats: isPlainObject(value.stats) ? value.stats : { totalCells: cells.length, colorCount: palette.length },
  };
}

function normalizePatternDetail(value, errors) {
  if (!isPlainObject(value)) {
    addValidationError(errors, 'patternDetail must be an object');
    return null;
  }

  const width = normalizeInteger(value.width, 'patternDetail.width', 1, 256, errors);
  const height = normalizeInteger(value.height, 'patternDetail.height', 1, 256, errors);
  const beadCount = normalizeInteger(value.beadCount, 'patternDetail.beadCount', 0, config.maxPatternCells, errors);
  const paletteCount = normalizeInteger(value.paletteCount, 'patternDetail.paletteCount', 0, 512, errors);
  const colorStats = Array.isArray(value.colorStats) ? value.colorStats.slice(0, 512) : [];
  if (!Array.isArray(value.colorStats)) addValidationError(errors, 'patternDetail.colorStats must be an array');
  if (value.colorStats?.length > 512) addValidationError(errors, 'patternDetail.colorStats is too large');
  if (!isPlainObject(value.config)) addValidationError(errors, 'patternDetail.config must be an object');

  return {
    width,
    height,
    beadCount,
    paletteCount,
    colorStats,
    config: isPlainObject(value.config) ? value.config : {},
    patternPayload: normalizePatternPayload(value.patternPayload, width, height, errors),
    sourceMetadata: isPlainObject(value.sourceMetadata) ? value.sourceMetadata : null,
  };
}

function normalizePublishPayload(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }

  if (input.itemId !== undefined) {
    addValidationError(errors, 'itemId is generated by the server and must not be supplied');
  }

  if (input.sourceAssetId !== undefined && input.sourceAssetId !== null) {
    addValidationError(errors, 'sourceAssetId is not supported by this publish endpoint yet');
  }

  if (input.exportAssetId !== undefined && input.exportAssetId !== null) {
    addValidationError(errors, 'exportAssetId is not supported by this publish endpoint yet');
  }

  if (input.authorId !== undefined) {
    addValidationError(errors, 'authorId is resolved from the current session and must not be supplied');
  }

  if (input.authorName !== undefined) {
    addValidationError(errors, 'authorName is resolved from the current session and must not be supplied');
  }

  const value = {
    title: normalizeRequiredText(input.title, 'title', 40, errors),
    description: normalizeOptionalText(input.description, 'description', 500, errors),
    sourceType: input.sourceType === 'official' ? 'official' : 'community',
    tags: normalizeTags(input.tags, errors),
    coverUrl: normalizeImageUrl(input.coverUrl, 'coverUrl', true, errors),
    previewUrl: normalizeImageUrl(input.previewUrl, 'previewUrl', true, errors),
    coverWidth: input.coverWidth === undefined || input.coverWidth === null ? null : normalizeInteger(input.coverWidth, 'coverWidth', 1, 4096, errors),
    coverHeight: input.coverHeight === undefined || input.coverHeight === null ? null : normalizeInteger(input.coverHeight, 'coverHeight', 1, 4096, errors),
    sortWeight: input.sortWeight === undefined || input.sortWeight === null ? 0 : normalizeInteger(input.sortWeight, 'sortWeight', -1000, 1000, errors),
    patternDetail: normalizePatternDetail(input.patternDetail, errors),
  };

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

function isSafeLookupId(value) {
  return typeof value === 'string' && /^[\w\u4e00-\u9fa5-]{1,96}$/u.test(value);
}

function getWriteToken(req) {
  const directToken = req.get('X-Internal-Token');
  if (directToken) return directToken.trim();

  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function safeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function requirePublishAccess(req, res, next) {
  if (!config.publishEnabled) {
    return res.status(403).json({
      message: 'Gallery publish is disabled in this environment',
      requestId: req.id,
    });
  }

  if (req.user) return next();

  if (!config.requireWriteToken) return next();

  if (!config.writeToken) {
    return res.status(503).json({
      message: 'Gallery publish token is not configured',
      requestId: req.id,
    });
  }

  if (!safeTokenEquals(getWriteToken(req), config.writeToken)) {
    return res.status(401).json({
      message: 'Invalid publish token',
      requestId: req.id,
    });
  }

  next();
}

function getUserDisplayName(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name) return name.slice(0, 40);
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  if (email) return email.split('@')[0].slice(0, 40) || '用户';
  const username = typeof user?.username === 'string' ? user.username.trim() : '';
  if (username) return username.slice(0, 40) || '用户';
  return '用户';
}

function getGalleryAuthorId(userId) {
  return `user-${userId}`;
}

async function findFavoriteItemIds(userId, itemIds) {
  if (!userId || !itemIds.length) return new Set();
  const favorites = await prisma.galleryFavorite.findMany({
    where: {
      userId,
      itemId: { in: itemIds },
    },
    select: { itemId: true },
  });
  return new Set(favorites.map((favorite) => favorite.itemId));
}

function mapItem(item, { favoriteItemIds = new Set() } = {}) {
  const patternSummary = item.patternDetail
    ? {
        width: item.patternDetail.width,
        height: item.patternDetail.height,
        beadCount: item.patternDetail.beadCount,
        paletteCount: item.patternDetail.paletteCount,
      }
    : undefined;

  return {
    id: item.id,
    title: item.title,
    coverUrl: item.coverAsset?.url ?? '',
    coverWidth: item.coverWidth,
    coverHeight: item.coverHeight,
    author: {
      id: item.author.id,
      name: item.author.name,
      avatarUrl: item.author.avatarUrl,
    },
    sourceType: item.sourceType,
    visibility: item.visibility,
    status: item.status,
    style: item.style,
    brand: item.brand,
    tags: item.tagsJson,
    patternSummary,
    stats: {
      viewCount: item.viewCount,
      likeCount: item.likeCount,
      favoriteCount: item.favoriteCount,
      hotScore: item.hotScore,
    },
    isFavorite: favoriteItemIds.has(item.id),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    publishedAt: item.publishedAt?.toISOString() ?? null,
  };
}

function canReadGalleryItem(user, item) {
  if (item.status === 'published') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return item.author?.userId === user.id;
}

function normalizeFavoriteItemIdList(value) {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['itemIds must be an array'] };
  }
  if (value.length > 1000) {
    return { ok: false, errors: ['itemIds cannot contain more than 1000 records'] };
  }

  const errors = [];
  const itemIds = [];
  const seen = new Set();
  value.forEach((itemId, index) => {
    if (!isSafeLookupId(itemId)) {
      addValidationError(errors, `itemIds[${index}] is invalid`);
      return;
    }
    if (!seen.has(itemId)) {
      seen.add(itemId);
      itemIds.push(itemId);
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, itemIds };
}

async function getFavoriteListForUser(userId) {
  const favorites = await prisma.galleryFavorite.findMany({
    where: {
      userId,
      item: {
        visibility: 'public',
        status: 'published',
      },
    },
    include: {
      item: {
        include: { author: true, coverAsset: true, patternDetail: true },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  const favoriteItemIds = new Set(favorites.map((favorite) => favorite.itemId));
  return {
    itemIds: favorites.map((favorite) => favorite.itemId),
    items: favorites.map((favorite) => mapItem(favorite.item, { favoriteItemIds })),
  };
}

app.get('/api/gallery/items', optionalAuth(prisma), async (req, res) => {
  const items = await prisma.galleryItem.findMany({
    where: { visibility: 'public', status: 'published' },
    include: { author: true, coverAsset: true, patternDetail: true },
    orderBy: [{ sortWeight: 'desc' }, { publishedAt: 'desc' }],
  });
  const favoriteItemIds = await findFavoriteItemIds(req.user?.id, items.map((item) => item.id));
  res.json({
    items: items.map((item) => mapItem(item, { favoriteItemIds })),
    total: items.length,
    nextPage: null,
  });
});

app.get('/api/gallery/my-items', requireAuth(prisma), async (req, res) => {
  const items = await prisma.galleryItem.findMany({
    where: { author: { userId: req.user.id } },
    include: { author: true, coverAsset: true, patternDetail: true },
    orderBy: [{ updatedAt: 'desc' }],
  });
  const favoriteItemIds = await findFavoriteItemIds(req.user.id, items.map((item) => item.id));
  res.json({
    items: items.map((item) => mapItem(item, { favoriteItemIds })),
    total: items.length,
  });
});

app.get('/api/gallery/favorites', requireAuth(prisma), requireCapability(prisma, 'gallery.favorite_sync'), async (req, res) => {
  res.json(await getFavoriteListForUser(req.user.id));
});

app.post('/api/gallery/favorites/sync', requireAuth(prisma), requireCapability(prisma, 'gallery.favorite_sync'), express.json({ limit: '128kb', strict: true }), async (req, res, next) => {
  try {
    const normalized = normalizeFavoriteItemIdList(req.body?.itemIds);
    if (!normalized.ok) {
      return res.status(400).json({
        message: 'Invalid favorite sync payload',
        errors: normalized.errors,
        requestId: req.id,
      });
    }

    if (normalized.itemIds.length) {
      const publishedItems = await prisma.galleryItem.findMany({
        where: {
          id: { in: normalized.itemIds },
          visibility: 'public',
          status: 'published',
        },
        select: { id: true },
      });
      const publishedItemIds = publishedItems.map((item) => item.id);

      await prisma.$transaction(async (tx) => {
        for (const itemId of publishedItemIds) {
          const existing = await tx.galleryFavorite.findUnique({
            where: {
              userId_itemId: {
                userId: req.user.id,
                itemId,
              },
            },
          });
          if (existing) continue;

          await tx.galleryFavorite.create({
            data: {
              userId: req.user.id,
              itemId,
            },
          });
          await tx.galleryItem.update({
            where: { id: itemId },
            data: { favoriteCount: { increment: 1 } },
          });
        }
      });
    }

    res.json(await getFavoriteListForUser(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/gallery/items/:id', optionalAuth(prisma), async (req, res) => {
  if (!isSafeLookupId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid gallery item id', requestId: req.id });
  }

  const item = await prisma.galleryItem.findUnique({
    where: { id: req.params.id },
    include: { author: true, patternDetail: true, coverAsset: true, previewAsset: true, sourceAsset: true, exportAsset: true },
  });

  if (!item || !canReadGalleryItem(req.user, item)) {
    return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
  }

  const favoriteItemIds = await findFavoriteItemIds(req.user?.id, [item.id]);
  const detail = {
    ...mapItem(item, { favoriteItemIds }),
    description: item.description,
    visibility: item.visibility,
    status: item.status,
    previewUrl: item.previewAsset?.url ?? '',
    sourceUrl: item.sourceAsset?.url ?? null,
    exportUrl: item.exportAsset?.url ?? null,
    pattern: item.patternDetail
      ? {
          width: item.patternDetail.width,
          height: item.patternDetail.height,
          beadCount: item.patternDetail.beadCount,
          paletteCount: item.patternDetail.paletteCount,
          colorStats: item.patternDetail.colorStatsJson,
          config: item.patternDetail.configJson,
          patternPayload: item.patternDetail.patternPayloadJson,
        }
      : null,
    stats: {
      viewCount: item.viewCount,
      likeCount: item.likeCount,
      favoriteCount: item.favoriteCount,
      downloadCount: item.downloadCount,
      shareCount: item.shareCount,
      hotScore: item.hotScore,
      updatedAt: item.updatedAt.toISOString(),
    },
    updatedAt: item.updatedAt.toISOString(),
  };

  res.json({ item: detail });
});

app.post('/api/gallery/items/:id/favorite', requireAuth(prisma), requireCapability(prisma, 'gallery.favorite_sync'), async (req, res, next) => {
  try {
    if (!isSafeLookupId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid gallery item id', requestId: req.id });
    }

    const item = await prisma.galleryItem.findFirst({
      where: {
        id: req.params.id,
        visibility: 'public',
        status: 'published',
      },
      include: { author: true, coverAsset: true, patternDetail: true },
    });
    if (!item) {
      return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.galleryFavorite.findUnique({
        where: {
          userId_itemId: {
            userId: req.user.id,
            itemId: item.id,
          },
        },
      });
      if (existing) return;

      await tx.galleryFavorite.create({
        data: {
          userId: req.user.id,
          itemId: item.id,
        },
      });
      await tx.galleryItem.update({
        where: { id: item.id },
        data: { favoriteCount: { increment: 1 } },
      });
    });

    const updatedItem = await prisma.galleryItem.findUnique({
      where: { id: item.id },
      include: { author: true, coverAsset: true, patternDetail: true },
    });

    res.json({ item: mapItem(updatedItem, { favoriteItemIds: new Set([item.id]) }) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/gallery/items/:id/favorite', requireAuth(prisma), requireCapability(prisma, 'gallery.favorite_sync'), async (req, res, next) => {
  try {
    if (!isSafeLookupId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid gallery item id', requestId: req.id });
    }

    const item = await prisma.galleryItem.findUnique({
      where: { id: req.params.id },
      include: { author: true, coverAsset: true, patternDetail: true },
    });
    if (!item || item.status !== 'published' || item.visibility !== 'public') {
      return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
    }

    await prisma.$transaction(async (tx) => {
      const result = await tx.galleryFavorite.deleteMany({
        where: {
          userId: req.user.id,
          itemId: item.id,
        },
      });
      if (result.count === 0) return;

      await tx.galleryItem.update({
        where: { id: item.id },
        data: { favoriteCount: Math.max(0, item.favoriteCount - 1) },
      });
    });

    const updatedItem = await prisma.galleryItem.findUnique({
      where: { id: item.id },
      include: { author: true, coverAsset: true, patternDetail: true },
    });

    res.json({ item: mapItem(updatedItem) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/gallery/publish', requireAuth(prisma), requireCapability(prisma, 'gallery.publish'), requirePublishAccess, publishRateLimiter, express.json({ limit: config.jsonBodyLimit, strict: true }), async (req, res) => {
  const normalized = normalizePublishPayload(req.body);
  if (!normalized.ok) {
    return res.status(400).json({
      message: 'Invalid publish payload',
      errors: normalized.errors,
      requestId: req.id,
    });
  }

  const payload = normalized.value;
  const usageLimit = await ensureMonthlyUsageAvailable(prisma, req.user, req.entitlements, 'gallery.publish');
  if (!usageLimit.ok) {
    return sendUsageLimitExceeded(res, req, { capability: 'gallery.publish', ...usageLimit });
  }

  const id = `${toSlug(payload.title)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const coverAssetId = `cover-${id}`;
  const previewAssetId = `preview-${id}`;
  const now = new Date();
  const isPrivilegedPublisher = req.user.role === 'admin';
  const sourceType = isPrivilegedPublisher && payload.sourceType === 'official' ? 'official' : 'community';
  const status = isPrivilegedPublisher ? 'published' : 'pending_review';
  const publishedAt = status === 'published' ? now : null;

  const result = await prisma.$transaction(async (tx) => {
    const author = await tx.galleryAuthor.upsert({
      where: { userId: req.user.id },
      update: {
        name: getUserDisplayName(req.user),
        avatarUrl: req.user.avatarUrl,
      },
      create: {
        id: getGalleryAuthorId(req.user.id),
        userId: req.user.id,
        name: getUserDisplayName(req.user),
        avatarUrl: req.user.avatarUrl,
      },
    });

    await tx.galleryAsset.upsert({
      where: { id: coverAssetId },
      update: { url: payload.coverUrl, mimeType: 'image/png', type: 'cover' },
      create: { id: coverAssetId, type: 'cover', url: payload.coverUrl, mimeType: 'image/png' },
    });

    await tx.galleryAsset.upsert({
      where: { id: previewAssetId },
      update: { url: payload.previewUrl, mimeType: 'image/png', type: 'preview' },
      create: { id: previewAssetId, type: 'preview', url: payload.previewUrl, mimeType: 'image/png' },
    });

    await tx.galleryItem.create({
      data: {
        id,
        title: payload.title,
        description: payload.description,
        sourceType,
        visibility: 'public',
        status,
        authorId: author.id,
        coverAssetId,
        previewAssetId,
        sourceAssetId: null,
        exportAssetId: null,
        style: payload.patternDetail.config?.style || 'cartoon',
        brand: payload.patternDetail.config?.brand || 'MARD',
        canvasSize: payload.patternDetail.config?.canvasSize ?? 24,
        tagsJson: payload.tags,
        viewCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        downloadCount: 0,
        shareCount: 0,
        hotScore: 0,
        coverWidth: payload.coverWidth,
        coverHeight: payload.coverHeight,
        sortWeight: payload.sortWeight,
        publishedAt,
        patternDetail: {
          create: {
            width: payload.patternDetail.width,
            height: payload.patternDetail.height,
            beadCount: payload.patternDetail.beadCount,
            paletteCount: payload.patternDetail.paletteCount,
            colorStatsJson: payload.patternDetail.colorStats,
            configJson: payload.patternDetail.config,
            patternPayloadJson: payload.patternDetail.patternPayload,
            sourceMetadataJson: payload.patternDetail.sourceMetadata,
          },
        },
      },
      include: { author: true, coverAsset: true, previewAsset: true },
    });

    return await tx.galleryItem.findUnique({
      where: { id },
      include: { author: true, coverAsset: true, previewAsset: true, sourceAsset: true, exportAsset: true },
    });
  });

  const detailPath = resolveGalleryItemFilePath(id);
  if (status === 'published') {
    await ensureDirs();
    await writeJsonFile(detailPath, {
      itemId: result.id,
      title: result.title,
      sourceType: result.sourceType,
      publishedAt: now.toISOString(),
    });
  }

  await recordUsageEvent(prisma, {
    userId: req.user.id,
    capability: 'gallery.publish',
    source: 'gallery.publish',
    metadataJson: {
      itemId: result.id,
      status,
      sourceType,
    },
  });

  res.json({
    itemId: result.id,
    status,
    publishedAt: publishedAt?.toISOString() ?? null,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status === 413 || err.type === 'entity.too.large'
    ? 413
    : Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  console.error(
    JSON.stringify({
      requestId: req.id,
      status,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    }),
  );

  res.status(status).json({
    message: status === 413 ? '提交内容过大，请减少数量或压缩图片后再试' : status >= 500 && !err.expose ? '服务器暂时不可用，请稍后再试' : err.message,
    requestId: req.id,
  });
});

app.listen(config.port, config.host, () => {
  console.log(`Gallery server listening on http://${config.host}:${config.port}`);
  console.log(`SQLite database via Prisma`);
  console.log(`Gallery publish enabled: ${config.publishEnabled ? 'yes' : 'no'}`);
  console.log(`Allowed origins: ${allowAnyOrigin ? '*' : config.allowedOrigins.join(', ')}`);
  console.log(`Production closed hosts: ${config.productionClosedHosts.join(', ') || '(none)'}`);
});
