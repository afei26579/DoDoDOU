import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const databaseUrl = process.env.DATABASE_URL || `file:${path.join(rootDir, 'dev.db')}`;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

export const prisma = new PrismaClient({ adapter });
