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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed: ${response.status}`);
  }

  return payload as T;
}

function shouldUseMockFallback(error: unknown) {
  if (USE_MOCK) return true;
  if (!API_BASE_URL) return true;
  return error instanceof TypeError;
}

export async function fetchGalleryList(query: GalleryListQuery = {}): Promise<GalleryListResponse> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson<GalleryListResponse>(`/api/gallery/items${suffix}`);
}

export async function fetchGalleryDetail(itemId: string): Promise<GalleryDetailResponse> {
  return requestJson<GalleryDetailResponse>(`/api/gallery/items/${encodeURIComponent(itemId)}`);
}

export async function publishGalleryItem(payload: PublishGalleryPayload): Promise<PublishGalleryResponse> {
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
    if (!item) throw new Error('Gallery item not found');
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
    if (!item) throw new Error('Gallery item not found');
    return { item };
  }

  return requestJson<GalleryFavoriteResponse>(`/api/gallery/items/${encodeURIComponent(itemId)}/favorite`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
