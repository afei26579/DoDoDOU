export type LocalProjectKind = 'upload' | 'draft' | 'pattern' | 'progress';
export type LocalProjectStatus = 'editing' | 'ready' | 'paused' | 'completed';

export type LocalProjectRecord = {
  id: string;
  title: string;
  kind: LocalProjectKind;
  status: LocalProjectStatus;
  coverUrl?: string | null;
  previewUrl?: string | null;
  sourceImage?: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
    width: number;
    height: number;
  } | null;
  pattern?: {
    width: number;
    height: number;
    beadCount: number;
    paletteCount: number;
  } | null;
  progress?: {
    percent: number;
    step?: string;
    updatedAt?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
};

const DB_NAME = 'dodoudou-local-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = handler(store);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listLocalProjects() {
  const db = await openDb();
  return new Promise<LocalProjectRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as LocalProjectRecord[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  });
}

export async function getLocalProject(id: string) {
  return withStore('readonly', (store) => store.get(id)).catch(() => null) as Promise<LocalProjectRecord | null>;
}

export async function upsertLocalProject(record: LocalProjectRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(record);
  });
}

export async function patchLocalProject(id: string, patch: Partial<Omit<LocalProjectRecord, 'id' | 'createdAt'>>) {
  const current = (await getLocalProject(id)) ?? null;
  if (!current) return null;
  const next: LocalProjectRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await upsertLocalProject(next);
  return next;
}

export async function ensureLocalProject(record: Omit<LocalProjectRecord, 'createdAt' | 'updatedAt'>) {
  const current = await getLocalProject(record.id);
  if (current) return current;
  const next: LocalProjectRecord = {
    ...record,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await upsertLocalProject(next);
  return next;
}
