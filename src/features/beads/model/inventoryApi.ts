import { getApiErrorMessage, type ApiErrorPayload } from '../../../lib/api/errorMessage';
import type {
  BeadInventory,
  BeadInventoryRecords,
  CreateBeadInventoryInput,
  SaveBeadInventoryItemInput,
  UpdateBeadInventoryInput,
} from './inventoryStore';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || '';
  const normalized = configured.replace(/\/+$/, '').toLowerCase();
  if (normalized === 'same-origin') return '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

type InventoryListResponse = {
  inventories?: BeadInventory[];
  items: BeadInventoryRecords['items'];
};

type InventoryItemResponse = {
  item: BeadInventoryRecords['items'][number];
};

type InventoryRecordResponse = {
  inventory: BeadInventory;
};

type InventoryRecordsResponse = {
  inventories: BeadInventory[];
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

  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  if (!response.ok) {
    throw new InventoryApiError(getApiErrorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

function toInventoryPayload(input: SaveBeadInventoryItemInput) {
  return {
    inventoryId: input.inventoryId,
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

function toInventoryRecordPayload(input: CreateBeadInventoryInput | UpdateBeadInventoryInput) {
  return {
    name: input.name,
    mode: input.mode,
    baseBrand: input.baseBrand,
    sourcePaletteId: input.sourcePaletteId,
    sourcePaletteName: input.sourcePaletteName,
    sourcePaletteType: input.sourcePaletteType,
    colorCount: input.colorCount,
  };
}

export async function listRemoteInventoryRecords(): Promise<BeadInventoryRecords> {
  const response = await requestInventory<InventoryListResponse>('/api/inventory');
  return {
    inventories: response.inventories ?? [],
    items: response.items,
  };
}

export async function listRemoteInventoryItems() {
  return (await listRemoteInventoryRecords()).items;
}

export async function listRemoteInventories() {
  const response = await requestInventory<InventoryRecordsResponse>('/api/inventory/sets');
  return response.inventories;
}

export async function createRemoteInventory(input: CreateBeadInventoryInput) {
  const response = await requestInventory<InventoryRecordResponse>('/api/inventory/sets', {
    method: 'POST',
    body: JSON.stringify(toInventoryRecordPayload(input)),
  });
  return response.inventory;
}

export async function updateRemoteInventory(id: string, input: UpdateBeadInventoryInput) {
  const response = await requestInventory<InventoryRecordResponse>(`/api/inventory/sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(toInventoryRecordPayload(input)),
  });
  return response.inventory;
}

export async function deleteRemoteInventory(id: string) {
  await requestInventory<{ ok: true }>(`/api/inventory/sets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function listRemoteInventoryItemsForInventory(inventoryId: string) {
  const response = await requestInventory<InventoryListResponse>(`/api/inventory/sets/${encodeURIComponent(inventoryId)}/items`);
  return response.items;
}

export async function createRemoteInventoryItem(input: SaveBeadInventoryItemInput) {
  const response = await requestInventory<InventoryItemResponse>('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(toInventoryPayload(input)),
  });
  return response.item;
}

export async function createRemoteInventoryItemInInventory(inventoryId: string, input: SaveBeadInventoryItemInput) {
  const response = await requestInventory<InventoryItemResponse>(`/api/inventory/sets/${encodeURIComponent(inventoryId)}/items`, {
    method: 'POST',
    body: JSON.stringify(toInventoryPayload(input)),
  });
  return response.item;
}

export async function updateRemoteInventoryItem(id: string, input: SaveBeadInventoryItemInput) {
  const response = await requestInventory<InventoryItemResponse>(`/api/inventory/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(toInventoryPayload(input)),
  });
  return response.item;
}

export async function deleteRemoteInventoryItem(id: string) {
  await requestInventory<{ ok: true }>(`/api/inventory/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function bulkSaveRemoteInventoryItems(inventoryId: string, items: SaveBeadInventoryItemInput[]) {
  const response = await requestInventory<InventoryListResponse>(`/api/inventory/sets/${encodeURIComponent(inventoryId)}/items/bulk`, {
    method: 'POST',
    body: JSON.stringify({
      items: items.map(toInventoryPayload),
    }),
  });
  return response.items;
}

export async function syncRemoteInventoryItems(
  items: BeadInventoryRecords['items'],
  inventories?: BeadInventory[],
) {
  return requestInventory<InventorySyncResponse>('/api/inventory/sync', {
    method: 'POST',
    body: JSON.stringify({
      inventories: inventories?.map((inventory) => ({
        id: inventory.id,
        name: inventory.name,
        mode: inventory.mode,
        baseBrand: inventory.baseBrand,
        sourcePaletteId: inventory.sourcePaletteId ?? null,
        sourcePaletteName: inventory.sourcePaletteName ?? null,
        sourcePaletteType: inventory.sourcePaletteType ?? null,
        colorCount: inventory.colorCount,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
      })),
      items: items.map((item) => ({
        inventoryId: item.inventoryId,
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
