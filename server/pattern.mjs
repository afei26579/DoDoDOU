import express from 'express';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { requireAuth } from './auth.mjs';
import { ensureMonthlyUsageAvailable, recordUsageEvent, requireCapability, sendUsageLimitExceeded } from './entitlements.mjs';

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

const config = {
  jsonBodyLimit: process.env.PATTERN_JSON_BODY_LIMIT || '256kb',
  maxCanvasSize: parseInteger(process.env.PATTERN_MAX_CANVAS_SIZE, 120, { min: 16, max: 256 }),
  uploadDir: process.env.ASSET_UPLOAD_DIR?.trim() || path.join('public', 'uploads', 'assets'),
  publicBaseUrl: process.env.ASSET_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || '',
};

const brandKeys = ['MARD', 'COCO', 'MANMAN', 'PANPAN', 'MIXIAOWO'];

function loadColorMapping(rootDir) {
  const filePath = path.join(rootDir, 'src', 'lib', 'pattern', 'colorSystemMapping.json');
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeBrand(value) {
  return brandKeys.includes(value) ? value : 'MARD';
}

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, '');
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function buildPalette(colorMapping, brand) {
  const brandKey = normalizeBrand(brand);
  return Object.entries(colorMapping).flatMap(([hex, vendorCodes]) => {
    const vendorCode = vendorCodes?.[brandKey];
    if (!vendorCode) return [];
    return [{
      colorId: hex.toUpperCase(),
      vendorCode,
      hex: hex.toUpperCase(),
      rgb: hexToRgb(hex),
    }];
  });
}

function getPublicUrl(req, pathname) {
  if (config.publicBaseUrl) return `${config.publicBaseUrl}${pathname}`;
  return `${req.protocol}://${req.get('host')}${pathname}`;
}

function getUploadDir(rootDir) {
  return path.resolve(rootDir, config.uploadDir);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeGeneratePayload(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['Request body must be a JSON object'] };

  const sourceAssetId = typeof input.sourceAssetId === 'string' ? input.sourceAssetId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(sourceAssetId)) errors.push('sourceAssetId is invalid');

  const cropTransform = isPlainObject(input.cropTransform) ? input.cropTransform : {};
  const configInput = isPlainObject(input.config) ? input.config : {};
  const canvasSize = Number(configInput.canvasSize);
  if (!Number.isInteger(canvasSize) || canvasSize < 16 || canvasSize > config.maxCanvasSize) {
    errors.push(`config.canvasSize must be an integer between 16 and ${config.maxCanvasSize}`);
  }

  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          sourceAssetId,
          cropTransform: {
            scale: sanitizeNumber(cropTransform.scale, 1, { min: 0.5, max: 4 }),
            x: sanitizeNumber(cropTransform.x, 0, { min: -2000, max: 2000 }),
            y: sanitizeNumber(cropTransform.y, 0, { min: -2000, max: 2000 }),
            rotate: sanitizeNumber(cropTransform.rotate, 0, { min: -180, max: 180 }),
            frameSize: sanitizeNumber(cropTransform.frameSize, 1200, { min: 1, max: 4096 }),
          },
          config: {
            canvasSize,
            brand: normalizeBrand(configInput.brand),
            style: typeof configInput.style === 'string' ? configInput.style : '动漫',
            colorMergeThreshold: sanitizeNumber(configInput.colorMergeThreshold, 30, { min: 0, max: 100 }),
            algorithm: typeof configInput.algorithm === 'string' ? configInput.algorithm : 'server-mvp',
          },
        },
      };
}

function sanitizeNumber(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveLocalAssetPath(rootDir, assetUrl) {
  if (typeof assetUrl !== 'string' || !assetUrl) return null;
  const pathname = assetUrl.startsWith('http://') || assetUrl.startsWith('https://')
    ? new URL(assetUrl).pathname
    : assetUrl;

  if (!pathname.startsWith('/uploads/assets/')) return null;
  const resolved = path.resolve(rootDir, 'public', pathname.replace(/^\/+/, ''));
  const uploadRoot = path.resolve(rootDir, 'public', 'uploads', 'assets');
  return resolved.startsWith(uploadRoot) ? resolved : null;
}

async function readAssetBuffer(rootDir, asset) {
  const localPath = resolveLocalAssetPath(rootDir, asset.url);
  if (localPath) return readFile(localPath);

  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Failed to read asset: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function findClosestColor(r, g, b, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const dr = r - color.rgb.r;
    const dg = g - color.rgb.g;
    const db = b - color.rgb.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

async function rasterizeSource(buffer, cropTransform, canvasSize) {
  const scale = Math.max(1, cropTransform.scale || 1);
  const fittedSize = Math.max(canvasSize, Math.round(canvasSize * scale));
  const transformed = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate(cropTransform.rotate || 0, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .resize(fittedSize, fittedSize, { fit: 'cover' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const maxOffset = Math.max(0, fittedSize - canvasSize);
  const offsetScale = canvasSize / (cropTransform.frameSize || 1200);
  const left = clamp(Math.round(maxOffset / 2 - cropTransform.x * offsetScale), 0, maxOffset);
  const top = clamp(Math.round(maxOffset / 2 - cropTransform.y * offsetScale), 0, maxOffset);

  return sharp(transformed)
    .extract({ left, top, width: canvasSize, height: canvasSize })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createPattern(raw, width, height, palette) {
  const counts = new Map();
  const cells = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = raw[offset + 3];
      if (alpha < 12) {
        cells.push({ x, y, colorId: 'transparent', vendorCode: '', hex: 'transparent', isExternal: true });
        continue;
      }

      const color = findClosestColor(raw[offset], raw[offset + 1], raw[offset + 2], palette);
      cells.push({
        x,
        y,
        colorId: color.colorId,
        vendorCode: color.vendorCode,
        hex: color.hex,
      });
      counts.set(color.colorId, {
        colorId: color.colorId,
        vendorCode: color.vendorCode,
        hex: color.hex,
        count: (counts.get(color.colorId)?.count ?? 0) + 1,
      });
    }
  }

  const paletteEntries = [...counts.values()].sort((a, b) => b.count - a.count);
  return {
    width,
    height,
    cells,
    palette: paletteEntries,
    stats: {
      totalCells: paletteEntries.reduce((sum, item) => sum + item.count, 0),
      colorCount: paletteEntries.length,
    },
  };
}

function parseHexColor(hex) {
  if (hex === 'transparent') return { r: 243, g: 241, b: 236, a: 255 };
  const { r, g, b } = hexToRgb(hex);
  return { r, g, b, a: 255 };
}

function createPreviewBuffer(pattern) {
  const cellSize = Math.max(3, Math.floor(720 / pattern.width));
  const width = pattern.width * cellSize;
  const height = pattern.height * cellSize;
  const buffer = Buffer.alloc(width * height * 4);

  for (const cell of pattern.cells) {
    const color = parseHexColor(cell.hex);
    for (let py = 0; py < cellSize; py += 1) {
      for (let px = 0; px < cellSize; px += 1) {
        const targetX = cell.x * cellSize + px;
        const targetY = cell.y * cellSize + py;
        const offset = (targetY * width + targetX) * 4;
        const isGridLine = px === cellSize - 1 || py === cellSize - 1;
        buffer[offset] = isGridLine ? 220 : color.r;
        buffer[offset + 1] = isGridLine ? 224 : color.g;
        buffer[offset + 2] = isGridLine ? 216 : color.b;
        buffer[offset + 3] = color.a;
      }
    }
  }

  return sharp(buffer, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function mapAsset(asset) {
  return {
    id: asset.id,
    url: asset.url,
    thumbUrl: asset.thumbUrl,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    size: asset.size,
    checksum: asset.checksum,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function createPatternRouter(prisma, { rootDir }) {
  const router = express.Router();
  const colorMapping = loadColorMapping(rootDir);
  const uploadDir = getUploadDir(rootDir);

  router.use(requireAuth(prisma));
  router.use(requireCapability(prisma, 'pattern.server_generate'));
  router.use(express.json({ limit: config.jsonBodyLimit, strict: true }));

  router.post('/generate', async (req, res, next) => {
    try {
      const normalized = normalizeGeneratePayload(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid pattern generate payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const payload = normalized.value;
      const usageLimit = await ensureMonthlyUsageAvailable(prisma, req.user, req.entitlements, 'pattern.server_generate');
      if (!usageLimit.ok) {
        return sendUsageLimitExceeded(res, req, { capability: 'pattern.server_generate', ...usageLimit });
      }

      const sourceAsset = await prisma.galleryAsset.findUnique({ where: { id: payload.sourceAssetId } });
      if (!sourceAsset || sourceAsset.type !== `source:${req.user.id}`) {
        return res.status(404).json({ message: 'Source asset not found', requestId: req.id });
      }

      const palette = buildPalette(colorMapping, payload.config.brand);
      const sourceBuffer = await readAssetBuffer(rootDir, sourceAsset);
      const raw = await rasterizeSource(sourceBuffer, payload.cropTransform, payload.config.canvasSize);
      const patternResult = createPattern(raw, payload.config.canvasSize, payload.config.canvasSize, palette);
      const previewBuffer = await createPreviewBuffer(patternResult);

      const previewId = `preview-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const previewFileName = `${previewId}.png`;
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, previewFileName), previewBuffer);

      const checksum = createHash('sha256').update(previewBuffer).digest('hex');
      const previewAsset = await prisma.galleryAsset.create({
        data: {
          id: previewId,
          type: `preview:${req.user.id}`,
          url: getPublicUrl(req, `/uploads/assets/${previewFileName}`),
          mimeType: 'image/png',
          width: patternResult.width,
          height: patternResult.height,
          size: previewBuffer.length,
          checksum,
        },
      });

      await recordUsageEvent(prisma, {
        userId: req.user.id,
        capability: 'pattern.server_generate',
        source: 'pattern.generate',
        metadataJson: {
          sourceAssetId: sourceAsset.id,
          previewAssetId: previewAsset.id,
          canvasSize: payload.config.canvasSize,
          brand: payload.config.brand,
        },
      });

      res.json({
        patternResult,
        previewAsset: mapAsset(previewAsset),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
