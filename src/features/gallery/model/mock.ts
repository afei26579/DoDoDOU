import type { GalleryDetailResponse, GalleryItemCard, GalleryItemDetail, PublishGalleryPayload, PublishGalleryResponse } from './types';

const now = '2026-05-07T00:00:00.000Z';

const mockItems: GalleryItemDetail[] = [
  {
    id: 'forest-house',
    title: '森林小屋',
    description: '温暖安静的森林主题图纸，适合做成桌面摆件。',
    coverUrl: '/data/gallery/images/forest-house-cover.png',
    coverWidth: 960,
    coverHeight: 1280,
    author: { id: 'official', name: '官方推荐' },
    sourceType: 'official',
    style: '写实',
    brand: 'MARD',
    tags: ['自然', '治愈', '小屋'],
    stats: {
      viewCount: 1200,
      likeCount: 340,
      favoriteCount: 211,
      downloadCount: 76,
      shareCount: 24,
      hotScore: 92,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    visibility: 'public',
    status: 'published',
    previewUrl: '/data/gallery/images/forest-house-preview.png',
    sourceUrl: null,
    exportUrl: null,
    pattern: {
      id: 'pattern-forest-house',
      width: 24,
      height: 24,
      beadCount: 576,
      paletteCount: 8,
      colorStats: [
        { colorId: 'mard-brown', vendorCode: 'M01', hex: '#8b5a2b', count: 132 },
        { colorId: 'mard-green', vendorCode: 'M02', hex: '#5a8b4a', count: 88 },
      ],
      config: {
        canvasSize: 24,
        brand: 'MARD',
        style: '写实',
        colorMergeThreshold: 30,
      },
      patternPayload: {
        cells: [],
        palette: [],
        stats: { totalCells: 576, colorCount: 8 },
      },
    },
  },
  {
    id: 'cat-tea',
    title: '猫咪下午茶',
    description: '甜点与猫咪组合，偏可爱风格。',
    coverUrl: '/data/gallery/images/cat-tea-cover.png',
    coverWidth: 1024,
    coverHeight: 1024,
    author: { id: 'official', name: '官方推荐' },
    sourceType: 'official',
    style: '动漫',
    brand: 'COCO',
    tags: ['猫咪', '甜品', '可爱'],
    stats: {
      viewCount: 940,
      likeCount: 260,
      favoriteCount: 190,
      downloadCount: 54,
      shareCount: 19,
      hotScore: 84,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    visibility: 'public',
    status: 'published',
    previewUrl: '/data/gallery/images/cat-tea-preview.png',
    sourceUrl: null,
    exportUrl: null,
    pattern: {
      id: 'pattern-cat-tea',
      width: 32,
      height: 32,
      beadCount: 1024,
      paletteCount: 10,
      colorStats: [
        { colorId: 'coco-pink', vendorCode: 'C03', hex: '#f4b6c2', count: 210 },
      ],
      config: {
        canvasSize: 32,
        brand: 'COCO',
        style: '动漫',
        colorMergeThreshold: 28,
      },
      patternPayload: {
        cells: [],
        palette: [],
        stats: { totalCells: 1024, colorCount: 10 },
      },
    },
  },
];

export function getMockGalleryList(): { items: GalleryItemCard[]; total: number; nextPage: null } {
  return {
    total: mockItems.length,
    nextPage: null,
    items: mockItems.map(({ pattern, previewUrl: _previewUrl, sourceUrl: _sourceUrl, exportUrl: _exportUrl, visibility: _visibility, status: _status, updatedAt: _updatedAt, ...item }) => ({
      ...item,
      coverUrl: item.coverUrl,
      previewUrl: _previewUrl,
      stats: {
        viewCount: item.stats.viewCount,
        likeCount: item.stats.likeCount,
        favoriteCount: item.stats.favoriteCount,
        hotScore: item.stats.hotScore,
      },
    })),
  };
}

export function getMockGalleryDetail(itemId: string): GalleryItemDetail | null {
  return mockItems.find((item) => item.id === itemId) ?? null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'gallery-item';
}

export function makePublishedResponse(payload: PublishGalleryPayload): PublishGalleryResponse {
  return {
    itemId: payload.itemId ?? `${slugify(payload.title)}-${Date.now()}`,
    status: 'published',
    publishedAt: new Date().toISOString(),
  };
}
