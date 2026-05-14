import type { BeadBrandKey } from '../../../lib/pattern/brand';
import { getBeadBrandLabel } from '../../../lib/pattern/brand';
import { getColorByBrandCode } from '../../../lib/pattern/color-system';
import type { PatternColorRequirement } from '../../../lib/pattern/color-requirements';

const DB_NAME = 'dodoudou-beads';
const DB_VERSION = 1;
const INVENTORY_STORE_NAME = 'inventory-items';
const MEMORY_CACHE = new Map<string, BeadInventoryItem>();

export type BeadInventoryItem = {
  id: string;
  brandKey: BeadBrandKey;
  code: string;
  hex: string;
  quantity: number;
  lowStockThreshold?: number;
  location?: string;
  favorite?: boolean;
  note?: string;
  updatedAt: string;
};

export type BeadInventoryQuery = {
  search?: string;
  brandKey?: BeadBrandKey | 'ALL';
  favoriteOnly?: boolean;
};

export type SaveBeadInventoryItemInput = {
  brandKey: BeadBrandKey;
  code: string;
  quantity: number;
  hex?: string;
  lowStockThreshold?: number;
  location?: string;
  favorite?: boolean;
  note?: string;
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeOptionalNumber(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

export function createInventoryItemId(brandKey: BeadBrandKey, code: string) {
  return `${brandKey}:${normalizeCode(code)}`;
}

function resolveHex(input: SaveBeadInventoryItemInput) {
  const hex = input.hex?.trim().toUpperCase();
  if (hex && /^#[0-9A-F]{6}$/.test(hex)) return hex;

  return getColorByBrandCode(input.brandKey, input.code)?.hex ?? null;
}

function normalizeInventoryItem(item: BeadInventoryItem): BeadInventoryItem {
  const code = normalizeCode(item.code);
  return {
    ...item,
    id: item.id || createInventoryItemId(item.brandKey, code),
    code,
    hex: item.hex.trim().toUpperCase(),
    quantity: normalizeQuantity(item.quantity),
    lowStockThreshold: normalizeOptionalNumber(item.lowStockThreshold),
    location: item.location?.trim() || undefined,
    favorite: Boolean(item.favorite),
    note: item.note?.trim() || undefined,
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INVENTORY_STORE_NAME)) {
        db.createObjectStore(INVENTORY_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readAllRecords() {
  const db = await openDb();
  return new Promise<BeadInventoryItem[]>((resolve, reject) => {
    const tx = db.transaction(INVENTORY_STORE_NAME, 'readonly');
    const store = tx.objectStore(INVENTORY_STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as BeadInventoryItem[]).map(normalizeInventoryItem));
  });
}

async function writeRecord(record: BeadInventoryItem) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INVENTORY_STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(INVENTORY_STORE_NAME).put(record);
  });
}

async function deleteRecord(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INVENTORY_STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(INVENTORY_STORE_NAME).delete(id);
  });
}

function sortInventoryItems(items: BeadInventoryItem[]) {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (a.brandKey !== b.brandKey) return a.brandKey.localeCompare(b.brandKey);
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

function matchesInventoryQuery(item: BeadInventoryItem, query: BeadInventoryQuery) {
  if (query.brandKey && query.brandKey !== 'ALL' && item.brandKey !== query.brandKey) return false;
  if (query.favoriteOnly && !item.favorite) return false;

  const keyword = query.search?.trim().toLowerCase();
  if (!keyword) return true;

  const haystack = [
    item.code,
    item.hex,
    getBeadBrandLabel(item.brandKey),
    item.brandKey,
    item.location,
    item.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword);
}

export async function listInventoryItems(query: BeadInventoryQuery = {}) {
  const records = await readAllRecords().catch(() => [...MEMORY_CACHE.values()]);
  MEMORY_CACHE.clear();
  records.forEach((record) => MEMORY_CACHE.set(record.id, record));
  return sortInventoryItems(records.filter((item) => matchesInventoryQuery(item, query)));
}

export async function getInventoryItem(id: string) {
  if (MEMORY_CACHE.has(id)) return MEMORY_CACHE.get(id) ?? null;
  const items = await listInventoryItems();
  return items.find((item) => item.id === id) ?? null;
}

export async function saveInventoryItem(input: SaveBeadInventoryItemInput) {
  const code = normalizeCode(input.code);
  const hex = resolveHex({ ...input, code });
  if (!hex) {
    throw new Error(`未找到 ${getBeadBrandLabel(input.brandKey)} ${code} 对应的色号`);
  }

  const record: BeadInventoryItem = normalizeInventoryItem({
    id: createInventoryItemId(input.brandKey, code),
    brandKey: input.brandKey,
    code,
    hex,
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    location: input.location,
    favorite: input.favorite,
    note: input.note,
    updatedAt: new Date().toISOString(),
  });

  MEMORY_CACHE.set(record.id, record);
  await writeRecord(record);
  return record;
}

export async function deleteInventoryItem(id: string) {
  MEMORY_CACHE.delete(id);
  await deleteRecord(id).catch(() => undefined);
}

export function mergeInventoryWithRequirements(
  requirements: PatternColorRequirement[],
  inventoryItems: BeadInventoryItem[],
): PatternColorRequirement[] {
  if (!inventoryItems.length) {
    return requirements.map((requirement) => ({
      ...requirement,
      ownedQuantity: undefined,
      missingQuantity: undefined,
      status: 'unknown',
    }));
  }

  const inventoryByCode = new Map(inventoryItems.map((item) => [createInventoryItemId(item.brandKey, item.code), item]));
  const remainingQuantityByCode = new Map(inventoryItems.map((item) => [createInventoryItemId(item.brandKey, item.code), item.quantity]));

  return requirements.map((requirement) => {
    if (!requirement.code || requirement.code === '?') {
      return {
        ...requirement,
        ownedQuantity: undefined,
        missingQuantity: undefined,
        status: 'unknown',
      };
    }

    const inventoryKey = createInventoryItemId(requirement.brandKey, requirement.code);
    const inventoryItem = inventoryByCode.get(inventoryKey);
    const ownedQuantity = remainingQuantityByCode.get(inventoryKey) ?? inventoryItem?.quantity ?? 0;
    const missingQuantity = Math.max(0, requirement.requiredQuantity - ownedQuantity);

    if (inventoryItem) {
      remainingQuantityByCode.set(inventoryKey, Math.max(0, ownedQuantity - requirement.requiredQuantity));
    }

    return {
      ...requirement,
      ownedQuantity,
      missingQuantity,
      status: missingQuantity > 0 ? 'missing' : 'enough',
    };
  });
}
