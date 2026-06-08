import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prisma } from '../server/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const projectUploadDir = path.join(rootDir, 'public', 'uploads', 'projects');
const thumbnailSize = Number.parseInt(process.env.PROJECT_CARD_THUMBNAIL_SIZE || '360', 10);
const dryRun = process.argv.includes('--dry-run');

function parseDataImage(value) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i.exec(value);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function safeFileBase(value) {
  return value
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `project-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function materializeProjectImage(project, slot, value) {
  const inputBuffer = parseDataImage(value);
  if (!inputBuffer) return null;

  const fileBase = safeFileBase(`${project.clientProjectId}-${slot}`);
  const sourceFileName = `${fileBase}.png`;
  const thumbFileName = `${fileBase}-thumb.webp`;
  const sourcePath = path.join(projectUploadDir, sourceFileName);
  const thumbPath = path.join(projectUploadDir, thumbFileName);
  const sourceImage = sharp(inputBuffer, { limitInputPixels: 40_000_000 }).rotate();
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

  return `/uploads/projects/${thumbFileName}`;
}

function isEmbeddedImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

async function main() {
  const projects = await prisma.workshopProject.findMany({
    where: {
      OR: [
        { coverUrl: { startsWith: 'data:image/' } },
        { previewUrl: { startsWith: 'data:image/' } },
      ],
    },
    select: {
      id: true,
      clientProjectId: true,
      coverUrl: true,
      previewUrl: true,
    },
    orderBy: [{ updatedAt: 'asc' }],
  });

  console.log(`Found ${projects.length} projects with embedded card images.`);
  if (!projects.length) return;

  await mkdir(projectUploadDir, { recursive: true });

  let converted = 0;
  let sourceBytes = 0;
  for (const project of projects) {
    const data = {};
    if (isEmbeddedImage(project.coverUrl)) {
      sourceBytes += Buffer.byteLength(project.coverUrl);
      data.coverUrl = await materializeProjectImage(project, 'cover', project.coverUrl);
      converted += 1;
    }
    if (isEmbeddedImage(project.previewUrl)) {
      sourceBytes += Buffer.byteLength(project.previewUrl);
      data.previewUrl = await materializeProjectImage(project, 'preview', project.previewUrl);
      converted += 1;
    }

    if (!dryRun && Object.keys(data).length) {
      await prisma.workshopProject.update({
        where: { id: project.id },
        data,
      });
    }
  }

  console.log(`${dryRun ? 'Would convert' : 'Converted'} ${converted} card images.`);
  console.log(`Embedded card payload removed: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
