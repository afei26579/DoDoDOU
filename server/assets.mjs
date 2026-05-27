import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from './auth.mjs';
import { ensureMonthlyUsageAvailable, recordUsageEvent, requireCapability, sendUsageLimitExceeded } from './entitlements.mjs';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

const config = {
  maxFileSizeBytes: parseInteger(process.env.ASSET_UPLOAD_MAX_BYTES, 8 * 1024 * 1024, { min: 1, max: 50 * 1024 * 1024 }),
  uploadDir: process.env.ASSET_UPLOAD_DIR?.trim() || path.join('public', 'uploads', 'assets'),
  publicBaseUrl: process.env.ASSET_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || '',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG and WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

function getAssetUploadDir(rootDir) {
  return path.resolve(rootDir, config.uploadDir);
}

function getPublicUrl(req, pathname) {
  if (config.publicBaseUrl) return `${config.publicBaseUrl}${pathname}`;
  return `${req.protocol}://${req.get('host')}${pathname}`;
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

function createUploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const isSizeError = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    res.status(isSizeError ? 413 : 400).json({
      message: isSizeError ? 'Uploaded image is too large' : error.message,
      requestId: req.id,
    });
  });
}

export function createAssetsRouter(prisma, { rootDir }) {
  const router = express.Router();
  const uploadDir = getAssetUploadDir(rootDir);

  router.post('/upload', requireAuth(prisma), requireCapability(prisma, 'asset.upload'), createUploadMiddleware, async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Image file is required', requestId: req.id });
      }

      const usageLimit = await ensureMonthlyUsageAvailable(prisma, req.user, req.entitlements, 'asset.upload');
      if (!usageLimit.ok) {
        return sendUsageLimitExceeded(res, req, { capability: 'asset.upload', ...usageLimit });
      }

      const checksum = createHash('sha256').update(req.file.buffer).digest('hex');
      const existing = await prisma.galleryAsset.findFirst({
        where: {
          checksum,
          type: `source:${req.user.id}`,
        },
      });
      if (existing) {
        return res.json({ asset: mapAsset(existing) });
      }

      const id = `asset-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const sourceFileName = `${id}.png`;
      const thumbFileName = `${id}-thumb.png`;
      const sourcePath = path.join(uploadDir, sourceFileName);
      const thumbPath = path.join(uploadDir, thumbFileName);

      const sourceImage = sharp(req.file.buffer, { limitInputPixels: 40_000_000 }).rotate();
      const metadata = await sourceImage.metadata();
      const sourceBuffer = await sourceImage.png().toBuffer();
      const thumbBuffer = await sharp(sourceBuffer)
        .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();

      await mkdir(uploadDir, { recursive: true });
      await Promise.all([
        writeFile(sourcePath, sourceBuffer),
        writeFile(thumbPath, thumbBuffer),
      ]);

      const sourceUrlPath = `/uploads/assets/${sourceFileName}`;
      const thumbUrlPath = `/uploads/assets/${thumbFileName}`;
      const asset = await prisma.galleryAsset.create({
        data: {
          id,
          type: `source:${req.user.id}`,
          url: getPublicUrl(req, sourceUrlPath),
          thumbUrl: getPublicUrl(req, thumbUrlPath),
          mimeType: 'image/png',
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          size: sourceBuffer.length,
          checksum,
        },
      });

      await recordUsageEvent(prisma, {
        userId: req.user.id,
        capability: 'asset.upload',
        source: 'asset.upload',
        metadataJson: {
          assetId: asset.id,
          size: asset.size,
          mimeType: asset.mimeType,
        },
      });

      res.status(201).json({ asset: mapAsset(asset) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
