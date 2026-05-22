import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './auth.mjs';
import { prisma } from './db.mjs';
import { createInventoryRouter } from './inventory.mjs';
import { createProjectsRouter } from './projects.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'public', 'data', 'gallery');
const itemsDir = path.join(dataDir, 'items');

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

const config = {
  host: process.env.GALLERY_SERVER_HOST || '127.0.0.1',
  port: parseInteger(process.env.GALLERY_SERVER_PORT, 3001, { min: 1, max: 65535 }),
  allowedOrigins: parseList(process.env.GALLERY_ALLOWED_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']),
  jsonBodyLimit: process.env.GALLERY_JSON_BODY_LIMIT || '5mb',
  publishEnabled: parseBoolean(process.env.GALLERY_PUBLISH_ENABLED, false),
  requireWriteToken: parseBoolean(process.env.GALLERY_REQUIRE_WRITE_TOKEN, true),
  writeToken: process.env.GALLERY_WRITE_TOKEN?.trim() || '',
  rateLimitWindowMs: parseInteger(process.env.GALLERY_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
  rateLimitMax: parseInteger(process.env.GALLERY_RATE_LIMIT_MAX, 120, { min: 1, max: 100_000 }),
  publishRateLimitMax: parseInteger(process.env.GALLERY_PUBLISH_RATE_LIMIT_MAX, 5, { min: 1, max: 10_000 }),
  maxPatternCells: parseInteger(process.env.GALLERY_MAX_PATTERN_CELLS, 10_000, { min: 1, max: 200_000 }),
  maxDataUrlChars: parseInteger(process.env.GALLERY_MAX_DATA_URL_CHARS, 1_500_000, { min: 1_000, max: 20_000_000 }),
  trustProxy: parseBoolean(process.env.GALLERY_TRUST_PROXY, false),
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

app.use(applyCors);
app.use(globalRateLimiter);
app.use('/api/auth', createAuthRouter(prisma));
app.use('/api/inventory', createInventoryRouter(prisma));
app.use('/api/projects', createProjectsRouter(prisma));

async function ensureDirs() {
  await mkdir(itemsDir, { recursive: true });
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'gallery-item';
}

function resolveGalleryItemFilePath(itemId) {
  const filePath = path.resolve(itemsDir, `${itemId}.json`);
  const relativePath = path.relative(itemsDir, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Resolved gallery item path escaped target directory');
  }
  return filePath;
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

  const value = {
    title: normalizeRequiredText(input.title, 'title', 40, errors),
    description: normalizeOptionalText(input.description, 'description', 500, errors),
    authorId: normalizeSafeId(input.authorId, 'authorId', 'official', errors),
    authorName: normalizeOptionalText(input.authorName, 'authorName', 40, errors) || 'Anonymous',
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

function mapItem(item, assets = {}) {
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
    coverUrl: assets.coverAsset?.url ?? item.coverAsset?.url ?? '',
    coverWidth: item.coverWidth,
    coverHeight: item.coverHeight,
    author: {
      id: item.author.id,
      name: item.author.name,
      avatarUrl: item.author.avatarUrl,
    },
    sourceType: item.sourceType,
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
    createdAt: item.createdAt.toISOString(),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    detailPath: `/data/gallery/items/${item.id}.json`,
  };
}

app.get('/api/gallery/items', async (_req, res) => {
  const items = await prisma.galleryItem.findMany({
    where: { visibility: 'public', status: 'published' },
    include: { author: true, coverAsset: true, patternDetail: true },
    orderBy: [{ sortWeight: 'desc' }, { publishedAt: 'desc' }],
  });
  res.json({
    items: items.map((item) => mapItem(item)),
    total: items.length,
    nextPage: null,
  });
});

app.get('/api/gallery/items/:id', async (req, res) => {
  if (!isSafeLookupId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid gallery item id', requestId: req.id });
  }

  const item = await prisma.galleryItem.findUnique({
    where: { id: req.params.id },
    include: { author: true, patternDetail: true, coverAsset: true, previewAsset: true, sourceAsset: true, exportAsset: true },
  });

  if (!item) {
    return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
  }

  const detail = {
    ...mapItem(item),
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

app.post('/api/gallery/publish', requirePublishAccess, publishRateLimiter, express.json({ limit: config.jsonBodyLimit, strict: true }), async (req, res) => {
  const normalized = normalizePublishPayload(req.body);
  if (!normalized.ok) {
    return res.status(400).json({
      message: 'Invalid publish payload',
      errors: normalized.errors,
      requestId: req.id,
    });
  }

  const payload = normalized.value;
  const id = `${toSlug(payload.title)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const coverAssetId = `cover-${id}`;
  const previewAssetId = `preview-${id}`;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.galleryAuthor.upsert({
      where: { id: payload.authorId },
      update: { name: payload.authorName },
      create: { id: payload.authorId, name: payload.authorName },
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
        sourceType: payload.sourceType,
        visibility: 'public',
        status: 'published',
        authorId: payload.authorId,
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
        publishedAt: now,
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
  await ensureDirs();
  await writeJsonFile(detailPath, {
    itemId: result.id,
    title: result.title,
    sourceType: result.sourceType,
    publishedAt: now.toISOString(),
  });

  res.json({
    itemId: result.id,
    status: 'published',
    publishedAt: now.toISOString(),
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status === 413 || err.type === 'entity.too.large' ? 413 : 500;
  console.error(
    JSON.stringify({
      requestId: req.id,
      status,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    }),
  );

  res.status(status).json({
    message: status === 413 ? 'Request body is too large' : 'Internal server error',
    requestId: req.id,
  });
});

await ensureDirs();
app.listen(config.port, config.host, () => {
  console.log(`Gallery server listening on http://${config.host}:${config.port}`);
  console.log(`SQLite database via Prisma`);
  console.log(`Writing gallery JSON to ${dataDir}`);
  console.log(`Gallery publish enabled: ${config.publishEnabled ? 'yes' : 'no'}`);
  console.log(`Allowed origins: ${allowAnyOrigin ? '*' : config.allowedOrigins.join(', ')}`);
});
