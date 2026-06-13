import type { BeadBrandKey } from '../../../lib/pattern/brand';
import { getBeadBrandLabel, normalizeBeadBrandKey } from '../../../lib/pattern/brand';
import { getColorByBrandCode } from '../../../lib/pattern/color-system';
import type { PatternColorRequirement } from '../../../lib/pattern/color-requirements';

const DB_NAME = 'dodoudou-beads';
const DB_VERSION = 2;
const INVENTORY_STORE_NAME = 'inventory-items';
const INVENTORIES_STORE_NAME = 'inventories';
const DEFAULT_INVENTORY_ID = 'inventory-default';
const MEMORY_ITEM_CACHE = new Map<string, BeadInventoryItem>();
const MEMORY_INVENTORY_CACHE = new Map<string, BeadInventory>();

export type BeadInventoryMode = 'palette' | 'custom';
export type BeadInventoryPaletteSource = 'official' | 'custom';

export type BeadInventory = {
  id: string;
  name: string;
  mode: BeadInventoryMode;
  baseBrand: BeadBrandKey;
  sourcePaletteId?: string;
  sourcePaletteName?: string;
  sourcePaletteType?: BeadInventoryPaletteSource;
  colorCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BeadInventoryItem = {
  id: string;
  inventoryId: string;
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

export type BeadInventoryRecords = {
  inventories: BeadInventory[];
  items: BeadInventoryItem[];
};

export type BeadInventoryQuery = {
  search?: string;
  brandKey?: BeadBrandKey | 'ALL';
  favoriteOnly?: boolean;
};

export type SaveBeadInventoryItemInput = {
  inventoryId?: string;
  brandKey: BeadBrandKey;
  code: string;
  quantity: number;
  hex?: string;
  lowStockThreshold?: number;
  location?: string;
  favorite?: boolean;
  note?: string;
};

export type CreateBeadInventoryInput = {
  name: string;
  mode: BeadInventoryMode;
  baseBrand: BeadBrandKey;
  sourcePaletteId?: string;
  sourcePaletteName?: string;
  sourcePaletteType?: BeadInventoryPaletteSource;
  colorCount?: number;
};

export type UpdateBeadInventoryInput = Partial<CreateBeadInventoryInput>;

type StoredBeadInventory = Partial<BeadInventory>;
type StoredBeadInventoryItem = Partial<BeadInventoryItem>;

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createLegacyInventoryItemId(brandKey: BeadBrandKey, code: string) {
  return `${brandKey}:${normalizeCode(code)}`;
}

export function createInventoryItemId(brandKey: BeadBrandKey, code: string): string;
export function createInventoryItemId(inventoryId: string, brandKey: BeadBrandKey, code: string): string;
export function createInventoryItemId(first: string, second: string, third?: string) {
  if (third === undefined) {
    return `${DEFAULT_INVENTORY_ID}:${first}:${normalizeCode(second)}`;
  }

  return `${first}:${second}:${normalizeCode(third)}`;
}

export function getDefaultInventoryId() {
  return DEFAULT_INVENTORY_ID;
}

function resolveHex(input: SaveBeadInventoryItemInput) {
  const hex = input.hex?.trim().toUpperCase();
  if (hex && /^#[0-9A-F]{6}$/.test(hex)) return hex;

  return getColorByBrandCode(input.brandKey, input.code)?.hex ?? null;
}

function normalizeInventory(record: StoredBeadInventory): BeadInventory {
  const now = new Date().toISOString();
  const mode: BeadInventoryMode = record.mode === 'palette' ? 'palette' : 'custom';
  const sourcePaletteType = record.sourcePaletteType === 'official' || record.sourcePaletteType === 'custom'
    ? record.sourcePaletteType
    : undefined;

  return {
    id: normalizeText(record.id, DEFAULT_INVENTORY_ID),
    name: normalizeText(record.name, '我的库存'),
    mode,
    baseBrand: normalizeBeadBrandKey(record.baseBrand, 'MARD'),
    sourcePaletteId: normalizeText(record.sourcePaletteId) || undefined,
    sourcePaletteName: normalizeText(record.sourcePaletteName) || undefined,
    sourcePaletteType,
    colorCount: normalizeQuantity(Number(record.colorCount ?? 0)),
    createdAt: normalizeTimestamp(record.createdAt, now),
    updatedAt: normalizeTimestamp(record.updatedAt, now),
  };
}

function normalizeInventoryItem(record: StoredBeadInventoryItem): BeadInventoryItem | null {
  const code = normalizeText(record.code);
  if (!code) return null;

  const brandKey = normalizeBeadBrandKey(record.brandKey, 'MARD');
  const normalizedCode = normalizeCode(code);
  const inventoryId = normalizeText(record.inventoryId, DEFAULT_INVENTORY_ID);
  const fallbackHex = getColorByBrandCode(brandKey, normalizedCode)?.hex ?? '#000000';
  const hex = normalizeText(record.hex, fallbackHex).toUpperCase();

  return {
    id: normalizeText(record.id, createInventoryItemId(inventoryId, brandKey, normalizedCode)),
    inventoryId,
    brandKey,
    code: normalizedCode,
    hex: /^#[0-9A-F]{6}$/.test(hex) ? hex : fallbackHex,
    quantity: normalizeQuantity(Number(record.quantity ?? 0)),
    lowStockThreshold: normalizeOptionalNumber(record.lowStockThreshold),
    location: record.location?.trim() || undefined,
    favorite: Boolean(record.favorite),
    note: record.note?.trim() || undefined,
    updatedAt: normalizeTimestamp(record.updatedAt, new Date().toISOString()),
  };
}

function dedupeInventoryItems(items: Array<BeadInventoryItem | null>) {
  const itemMap = new Map<string, BeadInventoryItem>();
  items.forEach((item) => {
    if (!item) return;

    const nextId = createInventoryItemId(item.inventoryId, item.brandKey, item.code);
    const normalized = { ...item, id: nextId };
    const current = itemMap.get(nextId);
    if (!current || normalized.updatedAt.localeCompare(current.updatedAt) >= 0) {
      itemMap.set(nextId, normalized);
    }
  });

  return [...itemMap.values()];
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const itemStore = db.objectStoreNames.contains(INVENTORY_STORE_NAME)
        ? request.transaction?.objectStore(INVENTORY_STORE_NAME)
        : db.createObjectStore(INVENTORY_STORE_NAME, { keyPath: 'id' });

      if (itemStore && !itemStore.indexNames.contains('inventoryId')) {
        itemStore.createIndex('inventoryId', 'inventoryId', { unique: false });
      }

      if (!db.objectStoreNames.contains(INVENTORIES_STORE_NAME)) {
        db.createObjectStore(INVENTORIES_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readAllRecords<T>(storeName: string) {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T[]);
  });
}

async function writeRecord<T>(storeName: string, record: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).put(record);
  });
}

async function writeRecords<T>(storeName: string, records: T[]) {
  if (!records.length) return;

  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(storeName);
    records.forEach((record) => store.put(record));
  });
}

async function deleteRecord(storeName: string, id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).delete(id);
  });
}

async function deleteRecords(storeName: string, ids: string[]) {
  if (!ids.length) return;

  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(storeName);
    ids.forEach((id) => store.delete(id));
  });
}

function sortInventoryItems(items: BeadInventoryItem[]) {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (a.brandKey !== b.brandKey) return a.brandKey.localeCompare(b.brandKey);
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

function sortInventories(items: BeadInventory[]) {
  return [...items].sort((a, b) => {
    if (a.id === DEFAULT_INVENTORY_ID) return -1;
    if (b.id === DEFAULT_INVENTORY_ID) return 1;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
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

function rememberRecords(records: BeadInventoryRecords) {
  MEMORY_ITEM_CACHE.clear();
  MEMORY_INVENTORY_CACHE.clear();
  records.items.forEach((record) => MEMORY_ITEM_CACHE.set(record.id, record));
  records.inventories.forEach((record) => MEMORY_INVENTORY_CACHE.set(record.id, record));
}

async function ensureDefaultInventory(inventories: BeadInventory[], items: BeadInventoryItem[]) {
  if (inventories.length) return sortInventories(inventories);

  const defaultInventory = normalizeInventory({
    id: DEFAULT_INVENTORY_ID,
    name: '我的库存',
    mode: 'custom',
    baseBrand: items[0]?.brandKey ?? 'MARD',
    colorCount: new Set(items.map((item) => `${item.brandKey}:${item.code}`)).size,
  });

  MEMORY_INVENTORY_CACHE.set(defaultInventory.id, defaultInventory);
  await writeRecord(INVENTORIES_STORE_NAME, defaultInventory).catch(() => undefined);
  return [defaultInventory];
}

async function updateInventoryColorCount(inventoryId: string) {
  const records = await listInventoryRecords();
  const inventory = records.inventories.find((item) => item.id === inventoryId);
  if (!inventory) return;

  const colorCount = records.items.filter((item) => item.inventoryId === inventoryId).length;
  const nextInventory: BeadInventory = {
    ...inventory,
    colorCount,
    updatedAt: new Date().toISOString(),
  };

  MEMORY_INVENTORY_CACHE.set(nextInventory.id, nextInventory);
  await writeRecord(INVENTORIES_STORE_NAME, nextInventory).catch(() => undefined);
}

export async function listInventoryRecords(): Promise<BeadInventoryRecords> {
  const rawItems = await readAllRecords<StoredBeadInventoryItem>(INVENTORY_STORE_NAME)
    .catch(() => [...MEMORY_ITEM_CACHE.values()]);
  const items = dedupeInventoryItems(rawItems.map(normalizeInventoryItem));
  const rawInventories = await readAllRecords<StoredBeadInventory>(INVENTORIES_STORE_NAME)
    .catch(() => [...MEMORY_INVENTORY_CACHE.values()]);
  const inventoryMap = new Map(rawInventories.map((record) => {
    const inventory = normalizeInventory(record);
    return [inventory.id, inventory] as const;
  }));

  items.forEach((item) => {
    if (!inventoryMap.has(item.inventoryId)) {
      inventoryMap.set(item.inventoryId, normalizeInventory({
        id: item.inventoryId,
        name: item.inventoryId === DEFAULT_INVENTORY_ID ? '我的库存' : '未命名库存',
        mode: 'custom',
        baseBrand: item.brandKey,
      }));
    }
  });

  const inventoriesWithCounts = [...inventoryMap.values()].map((inventory) => ({
    ...inventory,
    colorCount: items.filter((item) => item.inventoryId === inventory.id).length,
  }));
  const inventories = await ensureDefaultInventory(inventoriesWithCounts, items);
  const records = { inventories, items: sortInventoryItems(items) };
  rememberRecords(records);
  return records;
}

export async function listInventories() {
  return (await listInventoryRecords()).inventories;
}

export async function listInventoryItems(query: BeadInventoryQuery = {}) {
  const { items } = await listInventoryRecords();
  return filterInventoryItems(items, query);
}

export async function listInventoryItemsForInventory(inventoryId: string, query: BeadInventoryQuery = {}) {
  const { items } = await listInventoryRecords();
  return filterInventoryItems(items.filter((item) => item.inventoryId === inventoryId), query);
}

export function filterInventoryItems(items: BeadInventoryItem[], query: BeadInventoryQuery = {}) {
  return sortInventoryItems(items.filter((item) => matchesInventoryQuery(item, query)));
}

export async function getInventoryItem(id: string) {
  if (MEMORY_ITEM_CACHE.has(id)) return MEMORY_ITEM_CACHE.get(id) ?? null;
  const { items } = await listInventoryRecords();
  return items.find((item) => item.id === id) ?? null;
}

export async function createInventory(input: CreateBeadInventoryInput) {
  const now = new Date().toISOString();
  const record: BeadInventory = normalizeInventory({
    id: createId('inventory'),
    name: input.name,
    mode: input.mode,
    baseBrand: input.baseBrand,
    sourcePaletteId: input.sourcePaletteId,
    sourcePaletteName: input.sourcePaletteName,
    sourcePaletteType: input.sourcePaletteType,
    colorCount: input.colorCount ?? 0,
    createdAt: now,
    updatedAt: now,
  });

  MEMORY_INVENTORY_CACHE.set(record.id, record);
  await writeRecord(INVENTORIES_STORE_NAME, record).catch(() => undefined);
  return record;
}

export async function updateInventory(inventoryId: string, input: UpdateBeadInventoryInput) {
  const records = await listInventoryRecords();
  const current = records.inventories.find((item) => item.id === inventoryId);
  if (!current) {
    throw new Error('库存不存在或已被删除');
  }

  const record: BeadInventory = normalizeInventory({
    ...current,
    ...input,
    id: current.id,
    colorCount: input.colorCount ?? current.colorCount,
    updatedAt: new Date().toISOString(),
  });

  MEMORY_INVENTORY_CACHE.set(record.id, record);
  await writeRecord(INVENTORIES_STORE_NAME, record).catch(() => undefined);
  return record;
}

export async function deleteInventory(inventoryId: string) {
  const records = await listInventoryRecords();
  const itemIds = records.items
    .filter((item) => item.inventoryId === inventoryId)
    .flatMap((item) => [item.id, createLegacyInventoryItemId(item.brandKey, item.code)]);

  MEMORY_INVENTORY_CACHE.delete(inventoryId);
  itemIds.forEach((id) => MEMORY_ITEM_CACHE.delete(id));
  await deleteRecords(INVENTORY_STORE_NAME, itemIds).catch(() => undefined);
  await deleteRecord(INVENTORIES_STORE_NAME, inventoryId).catch(() => undefined);
}

function createInventoryItemRecord(inventoryId: string, input: SaveBeadInventoryItemInput) {
  const code = normalizeCode(input.code);
  const hex = resolveHex({ ...input, code });
  if (!hex) {
    throw new Error(`未找到 ${getBeadBrandLabel(input.brandKey)} ${code} 对应的色号`);
  }

  return normalizeInventoryItem({
    id: createInventoryItemId(inventoryId, input.brandKey, code),
    inventoryId,
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
}

export async function saveInventoryItem(input: SaveBeadInventoryItemInput) {
  return saveInventoryItemToInventory(input.inventoryId ?? DEFAULT_INVENTORY_ID, input);
}

export async function saveInventoryItemToInventory(inventoryId: string, input: SaveBeadInventoryItemInput) {
  const record = createInventoryItemRecord(inventoryId, input);
  if (!record) throw new Error('库存记录无效');

  MEMORY_ITEM_CACHE.set(record.id, record);
  await writeRecord(INVENTORY_STORE_NAME, record);
  await updateInventoryColorCount(inventoryId).catch(() => undefined);
  return record;
}

export async function bulkSaveInventoryItems(inventoryId: string, inputs: SaveBeadInventoryItemInput[]) {
  const records = inputs.map((input) => createInventoryItemRecord(inventoryId, input));
  const validRecords = records.filter((record): record is BeadInventoryItem => Boolean(record));

  validRecords.forEach((record) => MEMORY_ITEM_CACHE.set(record.id, record));
  await writeRecords(INVENTORY_STORE_NAME, validRecords);
  await updateInventoryColorCount(inventoryId).catch(() => undefined);
  return validRecords;
}

export async function deleteInventoryItem(id: string) {
  const item = await getInventoryItem(id);
  MEMORY_ITEM_CACHE.delete(id);
  await deleteRecord(INVENTORY_STORE_NAME, id).catch(() => undefined);

  if (item) {
    await deleteRecord(INVENTORY_STORE_NAME, createLegacyInventoryItemId(item.brandKey, item.code)).catch(() => undefined);
    await updateInventoryColorCount(item.inventoryId).catch(() => undefined);
  }
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

  const remainingQuantityByCode = new Map<string, number>();
  inventoryItems.forEach((item) => {
    const key = createLegacyInventoryItemId(item.brandKey, item.code);
    remainingQuantityByCode.set(key, (remainingQuantityByCode.get(key) ?? 0) + item.quantity);
  });

  return requirements.map((requirement) => {
    if (!requirement.code || requirement.code === '?') {
      return {
        ...requirement,
        ownedQuantity: undefined,
        missingQuantity: undefined,
        status: 'unknown',
      };
    }

    const inventoryKey = createLegacyInventoryItemId(requirement.brandKey, requirement.code);
    const ownedQuantity = remainingQuantityByCode.get(inventoryKey) ?? 0;
    const missingQuantity = Math.max(0, requirement.requiredQuantity - ownedQuantity);
    remainingQuantityByCode.set(inventoryKey, Math.max(0, ownedQuantity - requirement.requiredQuantity));

    return {
      ...requirement,
      ownedQuantity,
      missingQuantity,
      status: missingQuantity > 0 ? 'missing' : 'enough',
    };
  });
}
