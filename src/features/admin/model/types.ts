import type { AuthUser } from '../../auth/model/types';
import type { GalleryItemStatus, GallerySourceType } from '../../gallery/model/types';
import type { SubscriptionInfo } from '../../subscription/model/types';
import type { ColorSystem, WorkshopStyle } from '../../workshop/model/types';

export type AdminOverview = {
  users: {
    total: number;
    admins: number;
    byStatus: Record<AuthUser['status'], number>;
  };
  gallery: {
    byStatus: Record<GalleryItemStatus, number>;
    sourceTypes: Record<GallerySourceType, number>;
  };
  projects: {
    total: number;
  };
  usage: {
    events: number;
  };
};

export type AdminGalleryItem = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string;
  previewUrl: string;
  coverWidth?: number | null;
  coverHeight?: number | null;
  author: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    userId?: string | null;
    account?: string | null;
  };
  sourceType: GallerySourceType;
  visibility: 'public';
  status: GalleryItemStatus;
  style: WorkshopStyle;
  brand: ColorSystem;
  canvasSize: number;
  tags: string[];
  patternSummary: {
    width: number;
    height: number;
    beadCount: number;
    paletteCount: number;
  } | null;
  stats: {
    viewCount: number;
    likeCount: number;
    favoriteCount: number;
    downloadCount: number;
    shareCount: number;
    hotScore: number;
  };
  sortWeight: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type AdminGalleryListResponse = {
  items: AdminGalleryItem[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<GalleryItemStatus, number>;
};

export type AdminUser = AuthUser & {
  planKey: 'free' | 'pro' | 'admin';
  subscription: SubscriptionInfo | null;
  counts: {
    projects: number;
    favorites: number;
    usageEvents: number;
    galleryItems: number;
  };
};

export type AdminUserListResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<AuthUser['status'], number>;
};

export type AdminAuditLog = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'success' | 'failure' | 'denied' | string;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  createdAt: string;
};

export type AdminAuditLogListResponse = {
  logs: AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminAuthResponse = {
  user: AuthUser;
};

export type AdminGalleryPatch = Partial<{
  title: string;
  description: string | null;
  sourceType: GallerySourceType;
  status: GalleryItemStatus;
  tags: string[];
  sortWeight: number;
  hotScore: number;
}>;

export type AdminUserPatch = Partial<{
  role: AuthUser['role'];
  status: AuthUser['status'];
  name: string | null;
  planKey: 'free' | 'pro';
  subscriptionStatus: SubscriptionInfo['status'];
}>;
