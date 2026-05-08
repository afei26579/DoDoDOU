import type { ColorSystem, WorkshopStyle } from '../../workshop/model/types';

export type GallerySourceType = 'official' | 'community';
export type GalleryVisibility = 'public';
export type GalleryItemStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'offline';
export type GallerySortKey = 'recommended' | 'hot' | 'latest' | 'most_favorite';
export type GalleryActionType = 'view' | 'like' | 'favorite' | 'download' | 'share';

export type GalleryMediaType = 'cover' | 'preview' | 'source' | 'export' | 'avatar';

export type GalleryMediaAsset = {
  id: string;
  type: GalleryMediaType;
  url: string;
  thumbUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
  checksum?: string;
  createdAt: string;
};

export type GalleryAuthor = {
  id: string;
  name: string;
  avatarAssetId?: string | null;
};

export type GalleryStats = {
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  downloadCount: number;
  shareCount: number;
  hotScore: number;
  updatedAt: string;
};

export type GalleryPatternDetail = {
  id: string;
  itemId: string;
  width: number;
  height: number;
  beadCount: number;
  paletteCount: number;
  colorStats: Array<{
    colorId: string;
    vendorCode: string;
    hex: string;
    count: number;
  }>;
  config: {
    canvasSize: number;
    brand: ColorSystem;
    style: WorkshopStyle;
    colorMergeThreshold: number;
  };
  patternPayload: {
    cells: Array<{
      x: number;
      y: number;
      colorId: string;
      vendorCode: string;
      hex: string;
      isExternal?: boolean;
    }>;
    palette: Array<{
      colorId: string;
      vendorCode: string;
      hex: string;
      count: number;
    }>;
    stats: {
      totalCells: number;
      colorCount: number;
    };
  };
  sourceMetadata?: {
    projectId?: string;
    uploadedImageName?: string;
    uploadedImageType?: string;
    uploadedImageSize?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type GalleryItem = {
  id: string;
  title: string;
  description?: string;
  sourceType: GallerySourceType;
  visibility: GalleryVisibility;
  status: GalleryItemStatus;
  authorId: string;
  coverAssetId: string;
  previewAssetId: string;
  sourceAssetId?: string | null;
  exportAssetId?: string | null;
  patternDetailId: string;
  style: WorkshopStyle;
  brand: ColorSystem;
  canvasSize: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};

export type GalleryItemCard = {
  id: string;
  title: string;
  coverUrl: string;
  coverWidth?: number;
  coverHeight?: number;
  author: GalleryAuthor;
  sourceType: GallerySourceType;
  style: WorkshopStyle;
  brand: ColorSystem;
  tags: string[];
  patternSummary?: {
    width: number;
    height: number;
    beadCount: number;
    paletteCount: number;
  };
  stats: Pick<GalleryStats, 'viewCount' | 'likeCount' | 'favoriteCount' | 'hotScore'>;
  createdAt: string;
  publishedAt?: string | null;
};

export type GalleryItemDetail = GalleryItemCard & {
  description?: string;
  visibility: GalleryVisibility;
  status: GalleryItemStatus;
  previewUrl: string;
  sourceUrl?: string | null;
  exportUrl?: string | null;
  pattern: Omit<GalleryPatternDetail, 'itemId' | 'sourceMetadata' | 'createdAt' | 'updatedAt'>;
  stats: GalleryStats;
  updatedAt: string;
};

export type GalleryActionRecord = {
  id: string;
  userId?: string | null;
  itemId: string;
  actionType: GalleryActionType;
  createdAt: string;
  deviceId?: string | null;
  ipHash?: string | null;
};

export type GalleryListQuery = {
  page?: number;
  pageSize?: number;
  sort?: GallerySortKey;
  tag?: string;
  style?: WorkshopStyle;
  brand?: ColorSystem;
  sourceType?: GallerySourceType;
  search?: string;
};

export type GalleryListResponse = {
  items: GalleryItemCard[];
  nextPage?: number | null;
  total?: number;
};

export type GalleryDetailResponse = {
  item: GalleryItemDetail;
};

export type PublishGalleryPayload = {
  title: string;
  description?: string;
  authorId: string;
  sourceType?: GallerySourceType;
  tags?: string[];
  coverAssetId: string;
  previewAssetId: string;
  coverUrl?: string;
  previewUrl?: string;
  coverWidth?: number;
  coverHeight?: number;
  sourceAssetId?: string | null;
  exportAssetId?: string | null;
  patternDetail: Omit<GalleryPatternDetail, 'id' | 'itemId' | 'createdAt' | 'updatedAt'>;
};

export type PublishGalleryResponse = {
  itemId: string;
  status: GalleryItemStatus;
  publishedAt?: string | null;
};
