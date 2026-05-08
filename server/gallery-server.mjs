import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'public', 'data', 'gallery');
const itemsDir = path.join(dataDir, 'items');
const host = process.env.GALLERY_SERVER_HOST || '0.0.0.0';
const port = Number(process.env.GALLERY_SERVER_PORT || 3001);
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '20mb' }));

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
  const item = await prisma.galleryItem.findUnique({
    where: { id: req.params.id },
    include: { author: true, patternDetail: true, coverAsset: true, previewAsset: true, sourceAsset: true, exportAsset: true },
  });

  if (!item) {
    return res.status(404).json({ message: 'Gallery item not found' });
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

app.post('/api/gallery/publish', async (req, res) => {
  const payload = req.body;
  if (!payload?.title || !payload?.patternDetail || !payload?.coverAssetId || !payload?.previewAssetId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const id = `${toSlug(payload.title)}-${Date.now()}`;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.galleryAuthor.upsert({
      where: { id: payload.authorId || 'official' },
      update: { name: payload.authorName || '匿名作者' },
      create: { id: payload.authorId || 'official', name: payload.authorName || '匿名作者' },
    });

    await tx.galleryAsset.upsert({
      where: { id: payload.coverAssetId },
      update: { url: payload.coverUrl || '', mimeType: 'image/png', type: 'cover' },
      create: { id: payload.coverAssetId, type: 'cover', url: payload.coverUrl || '', mimeType: 'image/png' },
    });

    await tx.galleryAsset.upsert({
      where: { id: payload.previewAssetId },
      update: { url: payload.previewUrl || '', mimeType: 'image/png', type: 'preview' },
      create: { id: payload.previewAssetId, type: 'preview', url: payload.previewUrl || '', mimeType: 'image/png' },
    });

    await tx.galleryItem.create({
      data: {
        id,
        title: payload.title,
        description: payload.description || '',
        sourceType: payload.sourceType || 'community',
        visibility: 'public',
        status: 'published',
        authorId: payload.authorId || 'official',
        coverAssetId: payload.coverAssetId,
        previewAssetId: payload.previewAssetId,
        sourceAssetId: payload.sourceAssetId || null,
        exportAssetId: payload.exportAssetId || null,
        style: payload.patternDetail.config?.style || '动漫',
        brand: payload.patternDetail.config?.brand || 'MARD',
        canvasSize: payload.patternDetail.config?.canvasSize ?? 24,
        tagsJson: payload.tags || [],
        viewCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        downloadCount: 0,
        shareCount: 0,
        hotScore: 0,
        coverWidth: payload.coverWidth ?? null,
        coverHeight: payload.coverHeight ?? null,
        sortWeight: payload.sortWeight ?? 0,
        publishedAt: now,
        patternDetail: {
          create: {
            width: payload.patternDetail.width,
            height: payload.patternDetail.height,
            beadCount: payload.patternDetail.beadCount,
            paletteCount: payload.patternDetail.paletteCount,
            colorStatsJson: payload.patternDetail.colorStats || [],
            configJson: payload.patternDetail.config,
            patternPayloadJson: payload.patternDetail.patternPayload,
            sourceMetadataJson: payload.patternDetail.sourceMetadata || null,
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

  const detailPath = path.join(itemsDir, `${id}.json`);
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

await ensureDirs();
app.listen(port, host, () => {
  console.log(`Gallery server listening on http://${host}:${port}`);
  console.log(`SQLite database via Prisma`);
  console.log(`Writing gallery JSON to ${dataDir}`);
});
