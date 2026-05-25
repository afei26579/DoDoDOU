import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../server/db.mjs';

const args = process.argv.slice(2);

function readOption(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  const npmValue = process.env[`npm_config_${name.replaceAll('-', '_')}`];
  return match ? match.slice(prefix.length) : npmValue ?? fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`) || process.env[`npm_config_${name.replaceAll('-', '_')}`] === 'true';
}

function usage() {
  console.log(`Usage:
  npm run gallery:import -- --file=exports/gallery-data-all.json
  npm run gallery:import -- --file=exports/gallery-official.json --mode=replace

Options:
  --file=<path>  Required JSON file from gallery:export.
  --mode=upsert|replace
                 upsert updates/adds exported rows without deleting target rows.
                 replace also deletes target items from the exported source that are not present
                 in the file. Use replace for official data syncs, not community/user uploads.
  --dry-run      Validate and show planned counts without writing.
  --help         Show this help message.`);
}

function parseDate(value) {
  return value ? new Date(value) : null;
}

function assertArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`Invalid export file: data.${name} must be an array`);
  return value;
}

function getExportSource(payload) {
  if (!['all', 'official', 'community'].includes(payload.source)) {
    throw new Error(`Invalid export file: unsupported source "${payload.source}"`);
  }
  return payload.source;
}

function itemData(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    sourceType: item.sourceType,
    visibility: item.visibility,
    status: item.status,
    authorId: item.authorId,
    coverAssetId: item.coverAssetId,
    previewAssetId: item.previewAssetId,
    sourceAssetId: item.sourceAssetId ?? null,
    exportAssetId: item.exportAssetId ?? null,
    style: item.style,
    brand: item.brand,
    canvasSize: item.canvasSize,
    tagsJson: item.tagsJson,
    viewCount: item.viewCount ?? 0,
    likeCount: item.likeCount ?? 0,
    favoriteCount: item.favoriteCount ?? 0,
    downloadCount: item.downloadCount ?? 0,
    shareCount: item.shareCount ?? 0,
    hotScore: item.hotScore ?? 0,
    coverWidth: item.coverWidth ?? null,
    coverHeight: item.coverHeight ?? null,
    sortWeight: item.sortWeight ?? 0,
    createdAt: parseDate(item.createdAt) ?? new Date(),
    updatedAt: parseDate(item.updatedAt) ?? new Date(),
    publishedAt: parseDate(item.publishedAt),
  };
}

function authorData(author) {
  return {
    id: author.id,
    name: author.name,
    avatarUrl: author.avatarUrl ?? null,
    createdAt: parseDate(author.createdAt) ?? new Date(),
    updatedAt: parseDate(author.updatedAt) ?? new Date(),
  };
}

function assetData(asset) {
  return {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    thumbUrl: asset.thumbUrl ?? null,
    mimeType: asset.mimeType,
    width: asset.width ?? null,
    height: asset.height ?? null,
    size: asset.size ?? null,
    checksum: asset.checksum ?? null,
    createdAt: parseDate(asset.createdAt) ?? new Date(),
    updatedAt: parseDate(asset.updatedAt) ?? new Date(),
  };
}

function patternDetailData(detail) {
  return {
    id: detail.id,
    itemId: detail.itemId,
    width: detail.width,
    height: detail.height,
    beadCount: detail.beadCount,
    paletteCount: detail.paletteCount,
    colorStatsJson: detail.colorStatsJson,
    configJson: detail.configJson,
    patternPayloadJson: detail.patternPayloadJson,
    sourceMetadataJson: detail.sourceMetadataJson ?? null,
    createdAt: parseDate(detail.createdAt) ?? new Date(),
    updatedAt: parseDate(detail.updatedAt) ?? new Date(),
  };
}

async function cleanupOrphanGalleryAssets(tx) {
  await tx.$executeRaw`
    DELETE FROM "GalleryAsset"
    WHERE "id" NOT IN (
      SELECT "coverAssetId" FROM "GalleryItem"
      UNION
      SELECT "previewAssetId" FROM "GalleryItem"
      UNION
      SELECT "sourceAssetId" FROM "GalleryItem" WHERE "sourceAssetId" IS NOT NULL
      UNION
      SELECT "exportAssetId" FROM "GalleryItem" WHERE "exportAssetId" IS NOT NULL
    )
  `;
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    usage();
    return;
  }

  const file = readOption('file');
  if (!file) {
    usage();
    throw new Error('Missing required --file option');
  }

  const payload = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  if (payload.schemaVersion !== 1) throw new Error(`Unsupported gallery export schemaVersion: ${payload.schemaVersion}`);

  const source = getExportSource(payload);
  const mode = readOption('mode', hasFlag('replace') ? 'replace' : 'upsert');
  if (!['upsert', 'replace'].includes(mode)) throw new Error(`Unsupported --mode value: ${mode}`);
  const replace = mode === 'replace';
  const dryRun = hasFlag('dry-run');
  const authors = assertArray(payload.data?.authors, 'authors');
  const assets = assertArray(payload.data?.assets, 'assets');
  const items = assertArray(payload.data?.items, 'items');
  const patternDetails = assertArray(payload.data?.patternDetails, 'patternDetails');
  const itemIds = items.map((item) => item.id);

  console.log('Gallery import plan:');
  console.log(`- file: ${path.resolve(file)}`);
  console.log(`- source: ${source}`);
  console.log(`- replace: ${replace ? 'yes' : 'no'}`);
  console.log(`- dryRun: ${dryRun ? 'yes' : 'no'}`);
  console.log(`- authors: ${authors.length}`);
  console.log(`- assets: ${assets.length}`);
  console.log(`- items: ${items.length}`);
  console.log(`- patternDetails: ${patternDetails.length}`);

  if (replace && source === 'all') {
    throw new Error('--replace with source=all would delete target gallery items that are not in the export. Export official/community separately for controlled syncs.');
  }

  if (dryRun) {
    console.log('\nNo data imported. Re-run without --dry-run to write changes.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (replace) {
      await tx.galleryItem.deleteMany({
        where: {
          sourceType: source,
          id: { notIn: itemIds },
        },
      });
    }

    for (const author of authors) {
      const data = authorData(author);
      await tx.galleryAuthor.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    }

    for (const asset of assets) {
      const data = assetData(asset);
      await tx.galleryAsset.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    }

    for (const item of items) {
      const data = itemData(item);
      await tx.galleryItem.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    }

    for (const detail of patternDetails) {
      const data = patternDetailData(detail);
      await tx.galleryPatternDetail.upsert({
        where: { itemId: data.itemId },
        create: data,
        update: data,
      });
    }

    if (replace) {
      await cleanupOrphanGalleryAssets(tx);
    }
  });

  console.log('\nImported gallery data.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
