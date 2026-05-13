import type { WorkshopEditorState } from './types';

const DB_NAME = 'dodoudou-workshop';
const DB_VERSION = 3;
const PROJECT_STORE_NAME = 'projects';
const STORE_NAME = 'editor-drafts';
const MEMORY_CACHE = new Map<string, WorkshopDraftRecord>();

export type WorkshopDraftRecord = {
  draftId: string;
  projectId: string;
  state: WorkshopEditorState;
  updatedAt: number;
  schemaVersion: number;
};

type WorkshopDraftPatch = {
  state: WorkshopEditorState;
  updatedAt?: number;
};

function getDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'draftId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecord(draftId: string) {
  const db = await getDb();
  return new Promise<WorkshopDraftRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(draftId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as WorkshopDraftRecord | undefined) ?? null);
  });
}

async function writeRecord(record: WorkshopDraftRecord) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(record);
  });
}

async function deleteRecord(draftId: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(draftId);
  });
}

export function createDraftId(projectId: string) {
  return `draft:${projectId}`;
}

export async function getWorkshopDraft(projectId: string) {
  const draftId = createDraftId(projectId);
  if (MEMORY_CACHE.has(draftId)) return MEMORY_CACHE.get(draftId) ?? null;
  const record = await readRecord(draftId).catch(() => null);
  if (record) MEMORY_CACHE.set(draftId, record);
  return record;
}

export async function saveWorkshopDraft(projectId: string, patch: WorkshopDraftPatch) {
  const draftId = createDraftId(projectId);
  const current = (await getWorkshopDraft(projectId)) ?? null;
  const record: WorkshopDraftRecord = {
    draftId,
    projectId,
    state: patch.state,
    updatedAt: patch.updatedAt ?? Date.now(),
    schemaVersion: 1,
  };
  MEMORY_CACHE.set(draftId, record);
  await writeRecord(record);
}

export async function deleteWorkshopDraft(projectId: string) {
  const draftId = createDraftId(projectId);
  MEMORY_CACHE.delete(draftId);
  await deleteRecord(draftId).catch(() => undefined);
}
