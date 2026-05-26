import type { BeadInventoryItem, SaveBeadInventoryItemInput } from './inventoryStore';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

type InventoryListResponse = {
  items: BeadInventoryItem[];
};

type InventoryItemResponse = {
  item: BeadInventoryItem;
};

type InventorySyncResponse = InventoryListResponse & {
  stats: {
    created: number;
    updated: number;
    skipped: number;
  };
};

export class InventoryApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'InventoryApiError';
    this.status = status;
  }
}

async function requestInventory<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new InventoryApiError(payload?.message || `Request failed: ${response.status}`, response.status);
  }

  return payload as T;
}

function toInventoryPayload(input: SaveBeadInventoryItemInput) {
  return {
    brandKey: input.brandKey,
    code: input.code,
    hex: input.hex,
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold ?? null,
    location: input.location?.trim() || null,
    favorite: Boolean(input.favorite),
    note: input.note?.trim() || null,
  };
}

export async function listRemoteInventoryItems() {
  const response = await requestInventory<InventoryListResponse>('/api/inventory');
  return response.items;
}

export async function createRemoteInventoryItem(input: SaveBeadInventoryItemInput) {
  const response = await requestInventory<InventoryItemResponse>('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(toInventoryPayload(input)),
  });
  return response.item;
}

export async function updateRemoteInventoryItem(id: string, input: SaveBeadInventoryItemInput) {
  const response = await requestInventory<InventoryItemResponse>(`/api/inventory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(toInventoryPayload(input)),
  });
  return response.item;
}

export async function deleteRemoteInventoryItem(id: string) {
  await requestInventory<{ ok: true }>(`/api/inventory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function syncRemoteInventoryItems(items: BeadInventoryItem[]) {
  return requestInventory<InventorySyncResponse>('/api/inventory/sync', {
    method: 'POST',
    body: JSON.stringify({
      items: items.map((item) => ({
        brandKey: item.brandKey,
        code: item.code,
        hex: item.hex,
        quantity: item.quantity,
        lowStockThreshold: item.lowStockThreshold ?? null,
        location: item.location ?? null,
        favorite: Boolean(item.favorite),
        note: item.note ?? null,
        updatedAt: item.updatedAt,
      })),
    }),
  });
}
