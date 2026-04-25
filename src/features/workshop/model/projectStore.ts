import type { CropTransform, PatternResult, UploadedImage, WorkshopConfig, WorkshopEditorState } from './types';

const DB_NAME = 'dodoudou-workshop';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const MEMORY_CACHE = new Map<string, WorkshopProjectRecord>();

export type WorkshopProjectRecord = {
  projectId: string;
  uploadedImage: UploadedImage | null;
  cropTransform: CropTransform;
  config: WorkshopConfig;
  patternResult: PatternResult | null;
  viewMode: 'image' | 'pattern';
  editorState?: WorkshopEditorState;
  updatedAt: number;
};

type WorkshopProjectPatch = Partial<Omit<WorkshopProjectRecord, 'projectId' | 'updatedAt'>>;

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
    request.onsuccess = () => resolve((request.result as WorkshopProjectRecord | undefined) ?? null);
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

export async function getWorkshopProject(projectId: string) {
  if (MEMORY_CACHE.has(projectId)) return MEMORY_CACHE.get(projectId) ?? null;
  const record = await readRecord(projectId).catch(() => null);
  if (record) MEMORY_CACHE.set(projectId, record);
  return record;
}

export async function saveWorkshopProject(projectId: string, patch: WorkshopProjectPatch) {
  const current = (await getWorkshopProject(projectId)) ?? null;
  const record: WorkshopProjectRecord = {
    projectId,
    uploadedImage: patch.uploadedImage ?? current?.uploadedImage ?? null,
    cropTransform: patch.cropTransform ?? current?.cropTransform ?? { scale: 1, x: 0, y: 0 },
    config: patch.config ?? current?.config ?? {
      canvasSize: 100,
      brand: 'MARD',
      style: '动漫',
      colorMergeThreshold: 30,
    },
    patternResult: patch.patternResult ?? current?.patternResult ?? null,
    viewMode: patch.viewMode ?? current?.viewMode ?? 'image',
    editorState: patch.editorState ?? current?.editorState,
    updatedAt: Date.now(),
  };
  MEMORY_CACHE.set(projectId, record);
  await writeRecord(record);
}

export async function deleteWorkshopProject(projectId: string) {
  MEMORY_CACHE.delete(projectId);
  await deleteRecord(projectId).catch(() => undefined);
}
