import { getApiErrorMessage, type ApiErrorPayload } from '../../../lib/api/errorMessage';
import type {
  GalleryDetailResponse,
  GalleryFavoriteResponse,
  GalleryFavoritesResponse,
  GalleryListQuery,
  GalleryListResponse,
  PublishGalleryPayload,
  PublishGalleryResponse,
} from './types';
import { getMockGalleryDetail, getMockGalleryList, makePublishedResponse } from './mock';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || 'auto';
  const normalized = configured.replace(/\/+$/, '').toLowerCase();
  if (normalized === 'same-origin') return '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();
const GALLERY_WRITE_TOKEN = import.meta.env.VITE_GALLERY_WRITE_TOKEN?.trim() || '';
const USE_MOCK = import.meta.env.VITE_USE_MOCK_GALLERY?.trim().toLowerCase() === 'true';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, response.status));
  }

  return payload as T;
}

function shouldUseMockFallback(error: unknown) {
  if (USE_MOCK) return true;
  return error instanceof TypeError;
}

function getPagedMockGalleryList(query: GalleryListQuery = {}): GalleryListResponse {
  const list = getMockGalleryList();
  const pageSize = query.pageSize ?? 12;
  const page = query.page ?? 1;
  const start = Math.max(0, (page - 1) * pageSize);
  return {
    items: list.items.slice(start, start + pageSize),
    nextPage: start + pageSize < list.items.length ? page + 1 : null,
    total: list.items.length,
  };
}

export async function fetchGalleryList(query: GalleryListQuery = {}): Promise<GalleryListResponse> {
  if (USE_MOCK) return getPagedMockGalleryList(query);

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  try {
    return await requestJson<GalleryListResponse>(`/api/gallery/items${suffix}`);
  } catch (error) {
    if (!shouldUseMockFallback(error)) throw error;
    return getPagedMockGalleryList(query);
  }
}

export async function fetchGalleryDetail(itemId: string): Promise<GalleryDetailResponse> {
  if (USE_MOCK) {
    const item = getMockGalleryDetail(itemId);
    if (!item) throw new Error('没有找到这张作品，可能已被删除或下架。');
    return { item };
  }

  try {
    return await requestJson<GalleryDetailResponse>(`/api/gallery/items/${encodeURIComponent(itemId)}`);
  } catch (error) {
    if (!shouldUseMockFallback(error)) throw error;

    const item = getMockGalleryDetail(itemId);
    if (!item) throw error;
    return { item };
  }
}

export async function publishGalleryItem(payload: PublishGalleryPayload): Promise<PublishGalleryResponse> {
  if (USE_MOCK) return makePublishedResponse(payload);

  return requestJson<PublishGalleryResponse>(`/api/gallery/publish`, {
    method: 'POST',
    headers: GALLERY_WRITE_TOKEN ? { 'X-Internal-Token': GALLERY_WRITE_TOKEN } : undefined,
    body: JSON.stringify(payload),
  });
}

export async function fetchMyGalleryItems(): Promise<GalleryListResponse> {
  if (USE_MOCK) {
    return { items: [], nextPage: null, total: 0 };
  }

  return requestJson<GalleryListResponse>('/api/gallery/my-items');
}

export async function fetchFavoriteGalleryItems(): Promise<GalleryFavoritesResponse> {
  if (USE_MOCK) {
    return { itemIds: [], items: [] };
  }

  return requestJson<GalleryFavoritesResponse>('/api/gallery/favorites');
}

export async function syncFavoriteGalleryItems(itemIds: string[]): Promise<GalleryFavoritesResponse> {
  if (USE_MOCK) {
    return { itemIds, items: [] };
  }

  return requestJson<GalleryFavoritesResponse>('/api/gallery/favorites/sync', {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}

export async function addGalleryFavorite(itemId: string): Promise<GalleryFavoriteResponse> {
  if (USE_MOCK) {
    const item = getMockGalleryDetail(itemId);
    if (!item) throw new Error('没有找到这张作品，可能已被删除或下架。');
    return { item };
  }

  return requestJson<GalleryFavoriteResponse>(`/api/gallery/items/${encodeURIComponent(itemId)}/favorite`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function removeGalleryFavorite(itemId: string): Promise<GalleryFavoriteResponse> {
  if (USE_MOCK) {
    const item = getMockGalleryDetail(itemId);
    if (!item) throw new Error('没有找到这张作品，可能已被删除或下架。');
    return { item };
  }

  return requestJson<GalleryFavoriteResponse>(`/api/gallery/items/${encodeURIComponent(itemId)}/favorite`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
