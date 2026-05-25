import { mkdir, writeFile } from 'node:fs/promises';
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
  npm run gallery:export
  npm run gallery:export -- --source=official
  npm run gallery:export -- --source=all --out=exports/gallery-dev.json

Options:
  --source=all|official|community  Which gallery items to export. Default: all.
  --out=<path>                     Output JSON path. Default: exports/gallery-data-<source>-<timestamp>.json
  --pretty                         Pretty-print JSON. Enabled by default.
  --compact                        Write compact JSON.
  --help                           Show this help message.`);
}

function normalizeSource(source) {
  if (['all', 'official', 'community'].includes(source)) return source;
  throw new Error(`Unsupported --source value: ${source}`);
}

function toJsonDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, toJsonDate(value)]),
  );
}

function defaultOutputPath(source) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('exports', `gallery-data-${source}-${timestamp}.json`);
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    usage();
    return;
  }

  const source = normalizeSource(readOption('source', 'all'));
  const outputPath = path.resolve(readOption('out', defaultOutputPath(source)));
  const pretty = !hasFlag('compact');
  const where = source === 'all' ? {} : { sourceType: source };

  const items = await prisma.galleryItem.findMany({
    where,
    orderBy: [{ sortWeight: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const itemIds = items.map((item) => item.id);
  const authorIds = [...new Set(items.map((item) => item.authorId))];
  const assetIds = [
    ...new Set(items.flatMap((item) => [
      item.coverAssetId,
      item.previewAssetId,
      item.sourceAssetId,
      item.exportAssetId,
    ].filter(Boolean))),
  ];

  const [authors, assets, patternDetails] = await Promise.all([
    prisma.galleryAuthor.findMany({
      where: { id: { in: authorIds } },
      orderBy: { id: 'asc' },
    }),
    prisma.galleryAsset.findMany({
      where: { id: { in: assetIds } },
      orderBy: { id: 'asc' },
    }),
    prisma.galleryPatternDetail.findMany({
      where: { itemId: { in: itemIds } },
      orderBy: { itemId: 'asc' },
    }),
  ]);

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source,
    counts: {
      authors: authors.length,
      assets: assets.length,
      items: items.length,
      patternDetails: patternDetails.length,
    },
    data: {
      authors: authors.map(normalizeRecord),
      assets: assets.map(normalizeRecord),
      items: items.map(normalizeRecord),
      patternDetails: patternDetails.map(normalizeRecord),
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, pretty ? 2 : 0), 'utf8');

  console.log(`Exported gallery data to ${outputPath}`);
  console.log(`- source: ${source}`);
  console.log(`- authors: ${authors.length}`);
  console.log(`- assets: ${assets.length}`);
  console.log(`- items: ${items.length}`);
  console.log(`- patternDetails: ${patternDetails.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
