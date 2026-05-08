import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopEditorState } from './types';

const DB_NAME = 'dodoudou-workshop';
const DB_VERSION = 2;
const STORE_NAME = 'projects';
const MEMORY_CACHE = new Map<string, WorkshopProjectRecord>();

export type WorkshopProjectKind = 'upload' | 'draft' | 'pattern' | 'progress';
export type WorkshopProjectStatus = 'editing' | 'ready' | 'paused' | 'completed';
export type WorkshopPaperState = 'draft' | 'completed';
export type WorkshopBeadingState = 'idle' | 'progressing' | 'completed';

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
  paperState: WorkshopPaperState | null;
  beadingState: WorkshopBeadingState | null;
  uploadedImage: UploadedImage | null;
  cropTransform: CropTransform;
  config: WorkshopConfig;
  patternResult: PatternResult | null;
  editorState: WorkshopEditorState | null;
  progress: WorkshopProjectProgress | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkshopProjectPatch = Partial<Omit<WorkshopProjectRecord, 'projectId' | 'createdAt' | 'updatedAt'>>;

function getDefaultConfig(): WorkshopConfig {
  return {
    canvasSize: 100,
    brand: 'MARD',
    style: '动漫',
    colorMergeThreshold: 30,
  };
}

function createDefaultRecord(projectId: string): WorkshopProjectRecord {
  const now = new Date().toISOString();
  return {
    projectId,
    title: '未命名作品',
    kind: 'upload',
    status: 'editing',
    paperState: null,
    beadingState: null,
    uploadedImage: null,
    cropTransform: { scale: 1, x: 0, y: 0 },
    config: getDefaultConfig(),
    patternResult: null,
    editorState: null,
    progress: null,
    coverUrl: null,
    previewUrl: null,
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeRecord(record: WorkshopProjectRecord): WorkshopProjectRecord {
  return {
    ...createDefaultRecord(record.projectId),
    ...record,
    paperState: record.paperState ?? null,
    beadingState: record.beadingState ?? null,
    uploadedImage: record.uploadedImage ?? null,
    patternResult: record.patternResult ?? null,
    editorState: record.editorState ?? null,
    progress: record.progress ?? null,
    coverUrl: record.coverUrl ?? null,
    previewUrl: record.previewUrl ?? null,
    lastOpenedAt: record.lastOpenedAt ?? null,
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
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(records);
    };
  });
}

export async function getWorkshopProject(projectId: string) {
  if (MEMORY_CACHE.has(projectId)) return MEMORY_CACHE.get(projectId) ?? null;
  const record = await readRecord(projectId).catch(() => null);
  if (record) MEMORY_CACHE.set(projectId, record);
  return record;
}

export async function ensureWorkshopProject(projectId: string, patch: WorkshopProjectPatch = {}) {
  const current = (await getWorkshopProject(projectId)) ?? createDefaultRecord(projectId);
  const next: WorkshopProjectRecord = normalizeRecord({
    ...current,
    ...patch,
    projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
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
