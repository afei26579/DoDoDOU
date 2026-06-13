import { normalizeBeadBrandKey, type BeadBrandKey } from '../../../lib/pattern/brand';
import { getColorByBrandCode } from '../../../lib/pattern/color-system';
import type { ColorPaletteSeries, OfficialColorPalettePreset } from './types';

const DB_NAME = 'dodoudou-palettes';
const DB_VERSION = 1;
const STORE_NAME = 'palette-series';
const COLOR_PALETTE_STORAGE_PREFIX = 'dodoudou.colorPalettes';
const MEMORY_CACHE = new Map<string, ColorPaletteSeries[]>();

type StoredColorPaletteSeries = Partial<ColorPaletteSeries> & {
  baseBrand?: unknown;
  colorIds?: unknown;
};

type DbColorPaletteSeries = ColorPaletteSeries & {
  storageId: string;
  ownerKey: string;
};

export type CreateBlankColorPaletteInput = {
  name: string;
  baseBrand: BeadBrandKey;
  colorIds?: string[];
  sourcePresetId?: string;
};

export type UpdateColorPaletteInput = {
  name: string;
  baseBrand: BeadBrandKey;
  colorIds: string[];
};

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `palette-${crypto.randomUUID()}`;
  }

  return `palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getColorPaletteOwnerKey(userId: string | null | undefined) {
  return userId ? `user:${userId}` : 'guest';
}

function getStorageKey(ownerKey: string) {
  return `${COLOR_PALETTE_STORAGE_PREFIX}.${ownerKey}`;
}

function getDbStorageId(ownerKey: string, paletteId: string) {
  return `${ownerKey}:${paletteId}`;
}

function normalizeColorIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)));
}

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? fallback : new Date(time).toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  return fallback;
}

function normalizePaletteSeries(record: StoredColorPaletteSeries): ColorPaletteSeries | null {
  const now = new Date().toISOString();
  const colorIds = normalizeColorIds(record.colorIds);
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : createId();
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '未命名色卡';
  const lastModified = typeof record.lastModified === 'number' && Number.isFinite(record.lastModified)
    ? record.lastModified
    : Date.now();

  return {
    id,
    name,
    baseBrand: normalizeBeadBrandKey(String(record.baseBrand ?? '').toUpperCase(), 'MARD'),
    colorIds,
    source: 'custom',
    sourcePresetId: typeof record.sourcePresetId === 'string' && record.sourcePresetId.trim()
      ? record.sourcePresetId.trim()
      : undefined,
    lastModified,
    createdAt: normalizeTimestamp(record.createdAt, now),
    updatedAt: normalizeTimestamp(record.updatedAt, now),
  };
}

function sortPalettes(items: ColorPaletteSeries[]) {
  return [...items].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

function readLegacyPalettes(ownerKey: string) {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getStorageKey(ownerKey)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return sortPalettes(parsed.flatMap((item) => {
      const normalized = normalizePaletteSeries(item as StoredColorPaletteSeries);
      return normalized ? [normalized] : [];
    }));
  } catch {
    return [];
  }
}

function clearLegacyPalettes(ownerKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getStorageKey(ownerKey));
  } catch {
    // Ignore cleanup failures. The IndexedDB copy remains the source of truth.
  }
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'storageId' });
        store.createIndex('ownerKey', 'ownerKey', { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open palettes database'));
    request.onsuccess = () => resolve(request.result);
  });
}

function toDbRecord(ownerKey: string, item: ColorPaletteSeries): DbColorPaletteSeries {
  return {
    ...item,
    ownerKey,
    storageId: getDbStorageId(ownerKey, item.id),
  };
}

function fromDbRecord(record: DbColorPaletteSeries): ColorPaletteSeries {
  const { ownerKey: _ownerKey, storageId: _storageId, ...item } = record;
  return item;
}

async function readDbPalettes(ownerKey: string) {
  const db = await openDb();
  return new Promise<ColorPaletteSeries[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result as DbColorPaletteSeries[];
      resolve(sortPalettes(records
        .filter((record) => record.ownerKey === ownerKey)
        .map(fromDbRecord)));
    };
  });
}

async function writeDbPalette(ownerKey: string, item: ColorPaletteSeries) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(toDbRecord(ownerKey, item));
  });
}

async function deleteDbPalette(ownerKey: string, paletteId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(getDbStorageId(ownerKey, paletteId));
  });
}

async function writeDbPalettes(ownerKey: string, items: ColorPaletteSeries[]) {
  if (!items.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_NAME);
    items.forEach((item) => store.put(toDbRecord(ownerKey, item)));
  });
}

function mergeUniquePalettes(items: ColorPaletteSeries[]) {
  const itemMap = new Map<string, ColorPaletteSeries>();
  items.forEach((item) => {
    const current = itemMap.get(item.id);
    if (!current || item.updatedAt.localeCompare(current.updatedAt) > 0) {
      itemMap.set(item.id, item);
    }
  });
  return sortPalettes([...itemMap.values()]);
}

function rememberPalettes(ownerKey: string, items: ColorPaletteSeries[]) {
  MEMORY_CACHE.set(ownerKey, sortPalettes(items));
}

function addPaletteToMemory(ownerKey: string, item: ColorPaletteSeries) {
  rememberPalettes(ownerKey, mergeUniquePalettes([item, ...(MEMORY_CACHE.get(ownerKey) ?? [])]));
}

function removePaletteFromMemory(ownerKey: string, paletteId: string) {
  rememberPalettes(ownerKey, (MEMORY_CACHE.get(ownerKey) ?? []).filter((item) => item.id !== paletteId));
}

function normalizePaletteColorIdsForBrand(brandKey: BeadBrandKey, colorIds: string[]) {
  return normalizeColorIds(colorIds).filter((code) => Boolean(getColorByBrandCode(brandKey, code)));
}

export async function listColorPaletteSeries(ownerKey: string) {
  const legacyPalettes = readLegacyPalettes(ownerKey);

  try {
    const dbPalettes = await readDbPalettes(ownerKey);
    const merged = mergeUniquePalettes([...dbPalettes, ...legacyPalettes]);
    if (legacyPalettes.length) {
      await writeDbPalettes(ownerKey, legacyPalettes).catch(() => undefined);
      clearLegacyPalettes(ownerKey);
    }
    rememberPalettes(ownerKey, merged);
    return merged;
  } catch {
    const cached = MEMORY_CACHE.get(ownerKey) ?? [];
    const merged = mergeUniquePalettes([...cached, ...legacyPalettes]);
    rememberPalettes(ownerKey, merged);
    return merged;
  }
}

export async function getColorPaletteSeries(ownerKey: string, paletteId: string) {
  const palettes = await listColorPaletteSeries(ownerKey);
  return palettes.find((item) => item.id === paletteId) ?? null;
}

export async function updateColorPaletteSeries(
  ownerKey: string,
  paletteId: string,
  input: UpdateColorPaletteInput,
) {
  const current = await getColorPaletteSeries(ownerKey, paletteId);
  if (!current) {
    throw new Error('色卡不存在或已被删除');
  }

  const now = new Date().toISOString();
  const baseBrand = normalizeBeadBrandKey(input.baseBrand, current.baseBrand);
  const item: ColorPaletteSeries = {
    ...current,
    name: input.name.trim() || current.name,
    baseBrand,
    colorIds: normalizePaletteColorIdsForBrand(baseBrand, input.colorIds),
    source: 'custom',
    lastModified: Date.now(),
    updatedAt: now,
  };

  addPaletteToMemory(ownerKey, item);
  await writeDbPalette(ownerKey, item).catch(() => undefined);
  return item;
}

export async function deleteColorPaletteSeries(ownerKey: string, paletteId: string) {
  removePaletteFromMemory(ownerKey, paletteId);
  await deleteDbPalette(ownerKey, paletteId).catch(() => undefined);
}

export async function createColorPaletteFromPreset(
  ownerKey: string,
  preset: OfficialColorPalettePreset,
  name = preset.name,
) {
  const now = new Date().toISOString();
  const item: ColorPaletteSeries = {
    id: createId(),
    name: name.trim() || preset.name,
    baseBrand: preset.baseBrand,
    colorIds: [...preset.colorIds],
    source: 'custom',
    sourcePresetId: preset.id,
    lastModified: Date.now(),
    createdAt: now,
    updatedAt: now,
  };

  addPaletteToMemory(ownerKey, item);
  await writeDbPalette(ownerKey, item).catch(() => undefined);
  return item;
}

export async function createBlankColorPalette(ownerKey: string, input: CreateBlankColorPaletteInput) {
  const now = new Date().toISOString();
  const colorIds = normalizePaletteColorIdsForBrand(input.baseBrand, input.colorIds ?? []);
  const item: ColorPaletteSeries = {
    id: createId(),
    name: input.name.trim() || '空白色卡',
    baseBrand: input.baseBrand,
    colorIds,
    source: 'custom',
    sourcePresetId: input.sourcePresetId,
    lastModified: Date.now(),
    createdAt: now,
    updatedAt: now,
  };

  addPaletteToMemory(ownerKey, item);
  await writeDbPalette(ownerKey, item).catch(() => undefined);
  return item;
}
