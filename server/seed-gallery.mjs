import { prisma } from './db.mjs';

async function main() {
  await prisma.galleryPatternDetail.deleteMany();
  await prisma.galleryItem.deleteMany();
  await prisma.galleryAsset.deleteMany();
  await prisma.galleryAuthor.deleteMany();

  await prisma.galleryAuthor.createMany({
    data: [
      { id: 'official', name: '官方推荐' },
      { id: 'community-a', name: '拼豆小筑' },
    ],
  });

  await prisma.galleryAsset.createMany({
    data: [
      { id: 'cover-forest', type: 'cover', url: '/data/gallery/images/forest-house-cover.png', mimeType: 'image/png' },
      { id: 'preview-forest', type: 'preview', url: '/data/gallery/images/forest-house-preview.png', mimeType: 'image/png' },
      { id: 'cover-cat', type: 'cover', url: '/data/gallery/images/cat-tea-cover.png', mimeType: 'image/png' },
      { id: 'preview-cat', type: 'preview', url: '/data/gallery/images/cat-tea-preview.png', mimeType: 'image/png' },
    ],
  });

  await prisma.galleryItem.create({
    data: {
      id: 'forest-house',
      title: '森林小屋',
      description: '温暖安静的森林主题图纸，适合做成桌面摆件。',
      sourceType: 'official',
      visibility: 'public',
      status: 'published',
      authorId: 'official',
      coverAssetId: 'cover-forest',
      previewAssetId: 'preview-forest',
      style: '写实',
      brand: 'MARD',
      canvasSize: 24,
      tagsJson: ['自然', '治愈', '小屋'],
      coverWidth: 960,
      coverHeight: 1280,
      sortWeight: 100,
      publishedAt: new Date('2026-05-07T00:00:00.000Z'),
      patternDetail: {
        create: {
          width: 24,
          height: 24,
          beadCount: 576,
          paletteCount: 8,
          colorStatsJson: [
            { colorId: 'mard-brown', vendorCode: 'M01', hex: '#8b5a2b', count: 132 },
            { colorId: 'mard-green', vendorCode: 'M02', hex: '#5a8b4a', count: 88 },
          ],
          configJson: { canvasSize: 24, brand: 'MARD', style: '写实', colorMergeThreshold: 30 },
          patternPayloadJson: { cells: [], palette: [], stats: { totalCells: 576, colorCount: 8 } },
        },
      },
    },
  });

  await prisma.galleryItem.create({
    data: {
      id: 'cat-tea',
      title: '猫咪下午茶',
      description: '甜点与猫咪组合，偏可爱风格。',
      sourceType: 'official',
      visibility: 'public',
      status: 'published',
      authorId: 'official',
      coverAssetId: 'cover-cat',
      previewAssetId: 'preview-cat',
      style: '动漫',
      brand: 'COCO',
      canvasSize: 32,
      tagsJson: ['猫咪', '甜品', '可爱'],
      coverWidth: 1024,
      coverHeight: 1024,
      sortWeight: 90,
      publishedAt: new Date('2026-05-07T00:00:00.000Z'),
      patternDetail: {
        create: {
          width: 32,
          height: 32,
          beadCount: 1024,
          paletteCount: 10,
          colorStatsJson: [{ colorId: 'coco-pink', vendorCode: 'C03', hex: '#f4b6c2', count: 210 }],
          configJson: { canvasSize: 32, brand: 'COCO', style: '动漫', colorMergeThreshold: 28 },
          patternPayloadJson: { cells: [], palette: [], stats: { totalCells: 1024, colorCount: 10 } },
        },
      },
    },
  });

  console.log('Seeded gallery data.');
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
