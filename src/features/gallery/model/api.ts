import type { GalleryDetailResponse, GalleryListQuery, GalleryListResponse, PublishGalleryPayload, PublishGalleryResponse } from './types';
import { getMockGalleryDetail, getMockGalleryList, makePublishedResponse } from './mock';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();
const USE_MOCK = import.meta.env.VITE_USE_MOCK_GALLERY !== 'false' && !API_BASE_URL;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function shouldUseMockFallback(error: unknown) {
  if (USE_MOCK) return true;
  if (!API_BASE_URL) return true;
  return error instanceof TypeError;
}

export async function fetchGalleryList(query: GalleryListQuery = {}): Promise<GalleryListResponse> {
  if (USE_MOCK) {
    const list = getMockGalleryList();
    const pageSize = query.pageSize ?? 12;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;
    const items = list.items.slice(start, start + pageSize);
    return {
      items,
      nextPage: start + pageSize < list.items.length ? page + 1 : null,
      total: list.items.length,
    };
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  try {
    return await requestJson<GalleryListResponse>(`/api/gallery/items${suffix}`);
  } catch (error) {
    if (!shouldUseMockFallback(error)) throw error;

    const list = getMockGalleryList();
    const pageSize = query.pageSize ?? 12;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;
    return {
      items: list.items.slice(start, start + pageSize),
      nextPage: start + pageSize < list.items.length ? page + 1 : null,
      total: list.items.length,
    };
  }
}

export async function fetchGalleryDetail(itemId: string): Promise<GalleryDetailResponse> {
  if (USE_MOCK) {
    const item = getMockGalleryDetail(itemId);
    if (!item) throw new Error('Gallery item not found');
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
  if (USE_MOCK) {
    return makePublishedResponse(payload);
  }

  return requestJson<PublishGalleryResponse>(`/api/gallery/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
