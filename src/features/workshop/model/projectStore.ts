import type {
  CropTransform,
  PatternResult,
  UploadedImage,
  WorkshopBeadingProgress,
  WorkshopConfig,
  WorkshopEditorState,
  WorkshopViewMode,
} from './types';
import { normalizeBeadBrandKey } from '../../../lib/pattern/brand';
import { generatePatternCover } from '../../../lib/pattern/cover';

const DB_NAME = 'dodoudou-workshop';
const DB_VERSION = 3;
const STORE_NAME = 'projects';
const DRAFT_STORE_NAME = 'editor-drafts';
const MEMORY_CACHE = new Map<string, WorkshopProjectRecord>();

export type WorkshopProjectKind = 'upload' | 'pattern' | 'progress';
export type WorkshopProjectStatus = 'editing' | 'ready' | 'paused' | 'completed';
export type WorkshopBeadingState = 'idle' | 'progressing' | 'completed';
export type WorkshopProjectSourceType = 'blank' | 'upload' | 'gallery';

export type WorkshopProjectProgress = {
  percent: number;
  step?: string;
  updatedAt?: string;
};

export type WorkshopProjectRecord = {
  projectId: string;
  title: string;
  kind: WorkshopProjectKind;
  status: WorkshopProjectStatus;
  beadingState: WorkshopBeadingState;
  sourceType: WorkshopProjectSourceType;
  sourceItemId: string | null;
  uploadedImage: UploadedImage | null;
  cropTransform: CropTransform;
  config: WorkshopConfig;
  patternResult: PatternResult | null;
  viewMode: WorkshopViewMode;
  editorState: WorkshopEditorState | null;
  progress: WorkshopProjectProgress | null;
  beadingProgress: WorkshopBeadingProgress | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkshopProjectPatch = Partial<Omit<WorkshopProjectRecord, 'projectId' | 'createdAt' | 'updatedAt'>>;

export type WorkshopProjectCard = {
  id: string;
  title: string;
  kind: WorkshopProjectKind;
  status: WorkshopProjectStatus;
  beadingState: WorkshopBeadingState;
  sourceType: WorkshopProjectSourceType;
  sourceItemId: string | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  progress: WorkshopProjectProgress | null;
  pattern: {
    width: number;
    height: number;
    beadCount: number;
    paletteCount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type WorkshopProjectGroups = {
  recent: WorkshopProjectCard[];
  patterns: WorkshopProjectCard[];
  progressing: WorkshopProjectCard[];
};

function getDefaultConfig(): WorkshopConfig {
  return {
    canvasSize: 100,
    brand: 'MARD',
    style: '动漫',
    colorMergeThreshold: 30,
    algorithm: 'legacy',
  };
}

function createDefaultRecord(projectId: string): WorkshopProjectRecord {
  const now = new Date().toISOString();
  return {
    projectId,
    title: '未命名作品',
    kind: 'upload',
    status: 'editing',
    beadingState: 'idle',
    sourceType: 'blank',
    sourceItemId: null,
    uploadedImage: null,
    cropTransform: { scale: 1, x: 0, y: 0 },
    config: getDefaultConfig(),
    patternResult: null,
    viewMode: 'image',
    editorState: null,
    progress: null,
    beadingProgress: null,
    coverUrl: null,
    previewUrl: null,
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function createPatternCoverDataUrl(patternResult: PatternResult | null) {
  if (!patternResult || typeof document === 'undefined') return null;

  try {
    return generatePatternCover(patternResult).dataUrl || null;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? fallback : new Date(time).toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }

  return fallback;
}

function normalizeNullableTimestamp(value: unknown, fallback: string | null): string | null {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? fallback : new Date(time).toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }

  return fallback;
}

function normalizeRecord(record: WorkshopProjectRecord): WorkshopProjectRecord {
  const defaultRecord = createDefaultRecord(record.projectId);
  const createdAt = normalizeTimestamp(record.createdAt, defaultRecord.createdAt);
  const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);
  const patternResult = record.patternResult ?? null;
  const fallbackPatternCoverUrl = !record.coverUrl && !record.previewUrl
    ? createPatternCoverDataUrl(patternResult)
    : null;
  const legacyKind = (record as Omit<WorkshopProjectRecord, 'kind'> & { kind?: string }).kind;
  const kind: WorkshopProjectKind =
    legacyKind === 'progress'
      ? 'progress'
      : patternResult || record.editorState || legacyKind === 'pattern' || legacyKind === 'draft'
        ? 'pattern'
        : 'upload';
  const config = {
    ...defaultRecord.config,
    ...record.config,
    brand: normalizeBeadBrandKey(record.config?.brand),
  };

  return {
    ...defaultRecord,
    ...record,
    config,
    kind,
    beadingState: record.beadingState ?? defaultRecord.beadingState,
    sourceType: record.sourceType ?? defaultRecord.sourceType,
    sourceItemId: record.sourceItemId ?? null,
    uploadedImage: record.uploadedImage ?? null,
    patternResult,
    viewMode: record.viewMode ?? defaultRecord.viewMode,
    editorState: record.editorState ?? null,
    progress: record.progress ?? null,
    beadingProgress: record.beadingProgress ?? null,
    coverUrl: record.coverUrl ?? fallbackPatternCoverUrl ?? null,
    previewUrl: record.previewUrl ?? null,
    lastOpenedAt: normalizeNullableTimestamp(record.lastOpenedAt, null),
    createdAt,
    updatedAt,
  };
}

function withSyncedPatternCover(record: WorkshopProjectRecord, shouldSync: boolean): WorkshopProjectRecord {
  if (!shouldSync) return record;
  const coverUrl = createPatternCoverDataUrl(record.patternResult);
  if (!coverUrl) return record;

  return {
    ...record,
    coverUrl,
    previewUrl: coverUrl,
  };
}

function logPatternSave(projectId: string, record: WorkshopProjectRecord) {
  const pattern = record.patternResult;
  console.debug('[workshop-project] save pattern', {
    projectId,
    title: record.title,
    kind: record.kind,
    status: record.status,
    beadingState: record.beadingState,
    sourceType: record.sourceType,
    pattern: pattern
      ? {
          width: pattern.width,
          height: pattern.height,
          beadCount: pattern.stats.totalCells,
          colorCount: pattern.stats.colorCount,
          paletteCount: pattern.palette.length,
        }
      : null,
    hasCoverUrl: Boolean(record.coverUrl),
    hasPreviewUrl: Boolean(record.previewUrl),
    updatedAt: record.updatedAt,
  });
}

function getPatternSummary(patternResult: PatternResult | null) {
  return patternResult
    ? {
        width: patternResult.width,
        height: patternResult.height,
        beadCount: patternResult.stats.totalCells,
        paletteCount: patternResult.stats.colorCount,
      }
    : null;
}

function getProjectTimestamp(record: Pick<WorkshopProjectRecord | WorkshopProjectCard, 'lastOpenedAt' | 'updatedAt' | 'createdAt'>) {
  return normalizeNullableTimestamp(record.lastOpenedAt, null) ?? normalizeTimestamp(record.updatedAt, normalizeTimestamp(record.createdAt, new Date(0).toISOString()));
}

export function toProjectCard(record: WorkshopProjectRecord): WorkshopProjectCard {
  const progress = record.beadingProgress
    ? {
        percent: record.beadingProgress.percent,
        step: record.beadingProgress.mode,
        updatedAt: record.beadingProgress.updatedAt,
      }
    : record.progress;

  return {
    id: record.projectId,
    title: record.title,
    kind: record.kind,
    status: record.status,
    beadingState: record.beadingState,
    sourceType: record.sourceType,
    sourceItemId: record.sourceItemId,
    coverUrl: record.coverUrl ?? record.uploadedImage?.dataUrl ?? null,
    previewUrl: record.previewUrl ?? null,
    progress,
    pattern: getPatternSummary(record.patternResult),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
  };
}

export function groupWorkshopProjects(records: WorkshopProjectRecord[]): WorkshopProjectGroups {
  const cards = records.map(toProjectCard);
  const byOpened = [...cards].sort((a, b) => getProjectTimestamp(b).localeCompare(getProjectTimestamp(a)));

  return {
    recent: byOpened,
    patterns: cards.filter((item) => Boolean(item.pattern) && item.beadingState !== 'progressing'),
    progressing: cards.filter((item) => item.beadingState === 'progressing'),
  };
}

function getDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'draftId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecord(projectId: string) {
  const db = await getDb();
  return new Promise<WorkshopProjectRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as WorkshopProjectRecord | undefined;
      resolve(result ? normalizeRecord(result) : null);
    };
  });
}

async function writeRecord(record: WorkshopProjectRecord) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(record);
  });
}

async function deleteRecord(projectId: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(projectId);
  });
}

export async function listWorkshopProjects() {
  const db = await getDb();
  return new Promise<WorkshopProjectRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = (request.result as WorkshopProjectRecord[]).map(normalizeRecord);
      records.sort((a, b) => getProjectTimestamp(b).localeCompare(getProjectTimestamp(a)));
      resolve(records);
    };
  });
}

export async function findWorkshopProjectBySource(sourceType: WorkshopProjectSourceType, sourceItemId: string) {
  const records = await listWorkshopProjects();
  const exactMatch = records.find((record) => record.sourceType === sourceType && record.sourceItemId === sourceItemId);
  if (exactMatch) return exactMatch;

  if (sourceType === 'gallery') {
    const stableProjectId = `gallery-${sourceItemId}`;
    return records.find((record) => record.projectId === stableProjectId || record.projectId.startsWith(`${stableProjectId}-`)) ?? null;
  }

  return null;
}

export async function getWorkshopProject(projectId: string) {
  if (MEMORY_CACHE.has(projectId)) return MEMORY_CACHE.get(projectId) ?? null;
  const record = await readRecord(projectId).catch(() => null);
  if (record) MEMORY_CACHE.set(projectId, record);
  return record;
}

export async function ensureWorkshopProject(projectId: string, patch: WorkshopProjectPatch = {}) {
  const current = (await getWorkshopProject(projectId)) ?? createDefaultRecord(projectId);
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as WorkshopProjectPatch;
  const shouldSyncPatternCover = definedPatch.patternResult !== undefined && Boolean(definedPatch.patternResult);
  const next: WorkshopProjectRecord = withSyncedPatternCover(normalizeRecord({
    ...current,
    ...definedPatch,
    projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }), shouldSyncPatternCover);
  if (definedPatch.patternResult !== undefined) {
    logPatternSave(projectId, next);
  }
  MEMORY_CACHE.set(projectId, next);
  await writeRecord(next);
  return next;
}

export async function saveWorkshopProject(projectId: string, patch: WorkshopProjectPatch) {
  return ensureWorkshopProject(projectId, patch);
}

export async function patchWorkshopProject(projectId: string, patch: WorkshopProjectPatch) {
  return ensureWorkshopProject(projectId, patch);
}

export async function markWorkshopProjectOpened(projectId: string) {
  return ensureWorkshopProject(projectId, { lastOpenedAt: new Date().toISOString() });
}

export async function deleteWorkshopProject(projectId: string) {
  MEMORY_CACHE.delete(projectId);
  await deleteRecord(projectId).catch(() => undefined);
}
