import { prisma } from '../server/db.mjs';

const args = new Set(process.argv.slice(2));
const shouldDelete = args.has('--yes') || process.env.npm_config_yes === 'true';
const shouldShowHelp = args.has('--help') || args.has('-h');

const tables = [
  'GalleryFavorite',
  'GalleryPatternDetail',
  'GalleryItem',
  'GalleryAsset',
  'GalleryAuthor',
];

function usage() {
  console.log(`Usage:
  npm run gallery:clear -- --dry-run
  npm run gallery:clear -- --yes

Options:
  --dry-run  Show row counts only. This is also the default.
  --yes      Delete gallery-related SQLite data.
  --help     Show this help message.`);
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    tableName,
  );
  return rows.length > 0;
}

async function countRows(tableName) {
  if (!(await tableExists(tableName))) return null;
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${tableName}"`);
  return Number(rows[0]?.count ?? 0);
}

async function deleteRows(tableName) {
  if (!(await tableExists(tableName))) return null;
  const result = await prisma.$executeRawUnsafe(`DELETE FROM "${tableName}"`);
  return Number(result ?? 0);
}

async function collectCounts() {
  const counts = new Map();
  for (const tableName of tables) {
    counts.set(tableName, await countRows(tableName));
  }
  return counts;
}

function printCounts(title, counts) {
  console.log(title);
  for (const tableName of tables) {
    const count = counts.get(tableName);
    const value = count === null ? 'table not found' : `${count} row(s)`;
    console.log(`- ${tableName}: ${value}`);
  }
}

async function main() {
  if (shouldShowHelp) {
    usage();
    return;
  }

  const before = await collectCounts();
  printCounts(shouldDelete ? 'Gallery data before cleanup:' : 'Gallery data dry run:', before);

  if (!shouldDelete) {
    console.log('\nNo data deleted. Re-run with --yes to clear these tables.');
    return;
  }

  console.log('\nDeleting gallery data...');

  for (const tableName of tables) {
    const deleted = await deleteRows(tableName);
    if (deleted === null) {
      console.log(`- ${tableName}: skipped, table not found`);
    } else {
      console.log(`- ${tableName}: deleted ${deleted} row(s)`);
    }
  }

  const after = await collectCounts();
  console.log('');
  printCounts('Gallery data after cleanup:', after);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
