import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prisma } from '../server/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const galleryUploadDir = path.join(rootDir, 'public', 'uploads', 'gallery');
const thumbnailSize = Number.parseInt(process.env.GALLERY_THUMBNAIL_SIZE || '360', 10);
const dryRun = process.argv.includes('--dry-run');

function parseDataImage(value) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i.exec(value);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function safeAssetFileBase(assetId) {
  return assetId
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `asset-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function materializeAsset(asset) {
  const dataImage = parseDataImage(asset.url);
  if (!dataImage) return null;

  const fileBase = safeAssetFileBase(asset.id);
  const sourceFileName = `${fileBase}.png`;
  const thumbFileName = `${fileBase}-thumb.webp`;
  const sourcePath = path.join(galleryUploadDir, sourceFileName);
  const thumbPath = path.join(galleryUploadDir, thumbFileName);
  const sourceImage = sharp(dataImage.buffer, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await sourceImage.metadata();
  const sourceBuffer = await sourceImage.clone().png().toBuffer();
  const thumbBuffer = await sourceImage
    .clone()
    .resize({ width: thumbnailSize, height: thumbnailSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (!dryRun) {
    await Promise.all([
      writeFile(sourcePath, sourceBuffer),
      writeFile(thumbPath, thumbBuffer),
    ]);
  }

  return {
    url: `/uploads/gallery/${sourceFileName}`,
    thumbUrl: `/uploads/gallery/${thumbFileName}`,
    mimeType: 'image/png',
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    size: sourceBuffer.length,
  };
}

async function main() {
  const assets = await prisma.galleryAsset.findMany({
    where: {
      url: {
        startsWith: 'data:image/',
      },
    },
    orderBy: [{ updatedAt: 'asc' }],
  });

  console.log(`Found ${assets.length} embedded gallery assets.`);
  if (!assets.length) return;

  await mkdir(galleryUploadDir, { recursive: true });

  let converted = 0;
  let sourceBytes = 0;
  for (const asset of assets) {
    sourceBytes += Buffer.byteLength(asset.url);
    const next = await materializeAsset(asset);
    if (!next) continue;
    converted += 1;

    if (!dryRun) {
      await prisma.galleryAsset.update({
        where: { id: asset.id },
        data: next,
      });
    }
  }

  console.log(`${dryRun ? 'Would convert' : 'Converted'} ${converted} assets.`);
  console.log(`Embedded URL payload removed: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
