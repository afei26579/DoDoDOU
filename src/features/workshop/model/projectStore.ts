import type {
  CropTransform,
  PatternResult,
  UploadedImage,
  WorkshopBeadingProgress,
  WorkshopColorPaletteSelection,
  WorkshopConfig,
  WorkshopEditorState,
  WorkshopViewMode,
} from './types';
import type { PatternImportProjectMeta } from '../../../lib/pattern-import/types';
import { defaultWorkshopConfig } from './defaults';
import { normalizeBeadBrandKey } from '../../../lib/pattern/brand';
import { normalizePatternAdvancedConfig } from '../../../lib/pattern/advanced-config';
import { generatePatternCover } from '../../../lib/pattern/cover';
import { fetchMyEntitlements } from '../../subscription/model/subscriptionApi';
import {
  deleteRemoteWorkshopProject,
  hasLoadedRemoteProjectPayload,
  getRemoteWorkshopProject,
  isProjectCloudLimitError,
  listRemoteWorkshopProjects,
  saveRemoteWorkshopProject,
} from './projectApi';

const DB_NAME = 'dodoudou-workshop';
const DB_VERSION = 4;
const STORE_NAME = 'projects';
const DRAFT_STORE_NAME = 'editor-drafts';
const ASSET_STORE_NAME = 'workshop-assets';
const MEMORY_CACHE = new Map<string, WorkshopProjectRecord>();
const ASSET_OBJECT_URL_CACHE = new Map<string, { updatedAt: string; url: string }>();
const REMOTE_SAVE_BLOCKED_PROJECT_IDS = new Set<string>();
const REMOTE_SAVE_IN_FLIGHT_PROJECT_IDS = new Set<string>();
const REMOTE_SAVE_QUEUED_RECORDS = new Map<string, WorkshopProjectRecord>();
const REMOTE_PROJECT_IDS = new Set<string>();
let remoteProjectsEnabled = false;
let remoteProjectsUserId: string | null = null;
let remoteProjectCount: number | null = null;
let remoteProjectLimit: number | null = null;
let remoteProjectLimitLoaded = false;

export function configureWorkshopProjectStore(options: { enabled: boolean; userId?: string | null; cloudProjectLimit?: number | null }) {
  const nextUserId = options.enabled ? options.userId ?? null : null;
  const nextEnabled = Boolean(options.enabled && nextUserId);
  if (remoteProjectsEnabled !== nextEnabled || remoteProjectsUserId !== nextUserId) {
    MEMORY_CACHE.clear();
    REMOTE_SAVE_BLOCKED_PROJECT_IDS.clear();
    REMOTE_SAVE_IN_FLIGHT_PROJECT_IDS.clear();
    REMOTE_SAVE_QUEUED_RECORDS.clear();
    REMOTE_PROJECT_IDS.clear();
    remoteProjectCount = null;
    remoteProjectLimit = null;
    remoteProjectLimitLoaded = false;
  }
  remoteProjectsEnabled = nextEnabled;
  remoteProjectsUserId = nextUserId;
  if (options.cloudProjectLimit !== undefined) {
    remoteProjectLimit = options.cloudProjectLimit;
    remoteProjectLimitLoaded = true;
  }
}

function shouldUseRemoteProjects() {
  return remoteProjectsEnabled;
}

export type WorkshopProjectKind = 'upload' | 'pattern' | 'progress';
export type WorkshopProjectStatus = 'editing' | 'ready' | 'paused' | 'completed';
export type WorkshopBeadingState = 'idle' | 'progressing' | 'completed';
export type WorkshopProjectSourceType = 'blank' | 'upload' | 'gallery' | 'import';

export type WorkshopProjectProgress = {
  percent: number;
  step?: string;
  updatedAt?: string;
};

type WorkshopAssetSlot = 'uploadedImage' | 'cover' | 'preview';

type WorkshopProjectAssetRecord = {
  assetId: string;
  projectId: string;
  slot: WorkshopAssetSlot;
  blob: Blob;
  mimeType: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
};

type StoredUploadedImage = Omit<UploadedImage, 'dataUrl'> & {
  dataUrl?: string;
};

type StoredWorkshopProjectRecord = Omit<WorkshopProjectRecord, 'uploadedImage'> & {
  uploadedImage: StoredUploadedImage | null;
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
  importMeta?: PatternImportProjectMeta | null;
  uploadedImageAssetId?: string | null;
  coverAssetId?: string | null;
  previewAssetId?: string | null;
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
    ...defaultWorkshopConfig,
    advanced: normalizePatternAdvancedConfig(defaultWorkshopConfig.advanced),
  };
}

function normalizeColorIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)));
}

function normalizeColorPaletteSelection(value: unknown, fallbackBrand: WorkshopConfig['brand']): WorkshopColorPaletteSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<WorkshopColorPaletteSelection>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '';
  const source = record.source === 'official' || record.source === 'custom' ? record.source : null;
  const colorIds = normalizeColorIds(record.colorIds);
  if (!id || !name || !source || !colorIds.length) return null;

  return {
    id,
    name,
    source,
    baseBrand: normalizeBeadBrandKey(record.baseBrand, fallbackBrand),
    colorIds,
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
    importMeta: null,
    uploadedImageAssetId: null,
    coverAssetId: null,
    previewAssetId: null,
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

function createProjectAssetId(projectId: string, slot: WorkshopAssetSlot) {
  return `project:${projectId}:${slot}`;
}

function isEmbeddedImageUrl(value: string | null | undefined) {
  return Boolean(value?.startsWith('data:image/') || value?.startsWith('blob:'));
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64 = ''] = dataUrl.split(',');
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function imageSourceToBlob(src: string, fallbackType: string) {
  if (src.startsWith('data:')) return dataUrlToBlob(src);
  const response = await fetch(src);
  return response.blob().then((blob) => blob.type ? blob : blob.slice(0, blob.size, fallbackType || 'image/png'));
}

function createAssetObjectUrl(asset: WorkshopProjectAssetRecord) {
  const cached = ASSET_OBJECT_URL_CACHE.get(asset.assetId);
  if (cached?.updatedAt === asset.updatedAt) return cached.url;

  if (cached && typeof URL !== 'undefined') {
    URL.revokeObjectURL(cached.url);
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  const url = URL.createObjectURL(asset.blob);
  ASSET_OBJECT_URL_CACHE.set(asset.assetId, { updatedAt: asset.updatedAt, url });
  return url;
}

function omitUploadedImageDataUrl(image: UploadedImage, assetId: string): StoredUploadedImage {
  const { dataUrl: _dataUrl, ...metadata } = image;
  return {
    ...metadata,
    assetId,
  };
}

async function createAssetRecord(params: {
  assetId: string;
  projectId: string;
  slot: WorkshopAssetSlot;
  src: string;
  name?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}) {
  const now = new Date().toISOString();
  const blob = await imageSourceToBlob(params.src, params.mimeType || 'image/png');
  return {
    assetId: params.assetId,
    projectId: params.projectId,
    slot: params.slot,
    blob,
    mimeType: blob.type || params.mimeType || 'image/png',
    name: params.name,
    size: blob.size,
    width: params.width,
    height: params.height,
    createdAt: now,
    updatedAt: now,
  } satisfies WorkshopProjectAssetRecord;
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
    colorPalette: normalizeColorPaletteSelection(record.config?.colorPalette, normalizeBeadBrandKey(record.config?.brand)),
    advanced: normalizePatternAdvancedConfig(record.config?.advanced),
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
    importMeta: record.importMeta ?? null,
    uploadedImageAssetId: record.uploadedImageAssetId ?? record.uploadedImage?.assetId ?? null,
    coverAssetId: record.coverAssetId ?? null,
    previewAssetId: record.previewAssetId ?? null,
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

function sortWorkshopProjectRecords(records: WorkshopProjectRecord[]) {
  return [...records].sort((a, b) => getProjectTimestamp(b).localeCompare(getProjectTimestamp(a)));
}

function rememberRemoteProjectRecords(records: WorkshopProjectRecord[]) {
  REMOTE_PROJECT_IDS.clear();
  records.forEach((record) => REMOTE_PROJECT_IDS.add(record.projectId));
  remoteProjectCount = REMOTE_PROJECT_IDS.size;
}

function mergeWorkshopProjectRecords(remoteRecords: WorkshopProjectRecord[], localRecords: WorkshopProjectRecord[]) {
  const merged = new Map<string, WorkshopProjectRecord>();
  remoteRecords.forEach((record) => merged.set(record.projectId, record));

  localRecords.forEach((record) => {
    const current = merged.get(record.projectId);
    if (!current || getProjectTimestamp(record).localeCompare(getProjectTimestamp(current)) > 0) {
      merged.set(record.projectId, record);
    }
  });

  return sortWorkshopProjectRecords([...merged.values()]);
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
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'assetId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readAssetRecord(assetId: string) {
  const db = await getDb();
  return new Promise<WorkshopProjectAssetRecord | null>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
    const store = tx.objectStore(ASSET_STORE_NAME);
    const request = store.get(assetId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve((request.result as WorkshopProjectAssetRecord | undefined) ?? null);
    };
  });
}

async function readAssetDataUrl(assetId: string | null | undefined) {
  if (!assetId) return null;
  const asset = await readAssetRecord(assetId).catch(() => null);
  return asset ? blobToDataUrl(asset.blob) : null;
}

async function getRemoteSaveImageUrl(url: string | null | undefined, assetId: string | null | undefined) {
  if (assetId) {
    const assetDataUrl = await readAssetDataUrl(assetId);
    if (assetDataUrl) return assetDataUrl;
  }
  return url ?? null;
}

async function prepareRecordForRemoteSave(record: WorkshopProjectRecord) {
  const uploadedImageAssetId = record.uploadedImageAssetId ?? record.uploadedImage?.assetId ?? null;
  const uploadedImageUrl = await getRemoteSaveImageUrl(record.uploadedImage?.dataUrl, uploadedImageAssetId);
  const coverUrl = await getRemoteSaveImageUrl(record.coverUrl, record.coverAssetId);
  const previewUrl = await getRemoteSaveImageUrl(record.previewUrl, record.previewAssetId);

  return {
    ...record,
    uploadedImage: record.uploadedImage && uploadedImageUrl
      ? {
          ...record.uploadedImage,
          dataUrl: uploadedImageUrl,
        }
      : record.uploadedImage,
    coverUrl,
    previewUrl,
  };
}

async function hydrateImageUrl(url: string | null | undefined, assetId: string | null | undefined) {
  if (url) return url;
  if (!assetId) return url ?? null;
  const cached = ASSET_OBJECT_URL_CACHE.get(assetId);
  if (cached) return cached.url;
  const asset = await readAssetRecord(assetId).catch(() => null);
  return asset ? createAssetObjectUrl(asset) : null;
}

async function hydrateStoredRecord(storedRecord: StoredWorkshopProjectRecord) {
  const uploadedImageAssetId = storedRecord.uploadedImageAssetId ?? storedRecord.uploadedImage?.assetId ?? null;
  const uploadedImageUrl = storedRecord.uploadedImage
    ? await hydrateImageUrl(storedRecord.uploadedImage.dataUrl, uploadedImageAssetId)
    : null;
  const coverUrl = await hydrateImageUrl(storedRecord.coverUrl, storedRecord.coverAssetId);
  const previewUrl = await hydrateImageUrl(storedRecord.previewUrl, storedRecord.previewAssetId);

  const record = {
    ...storedRecord,
    uploadedImage: storedRecord.uploadedImage && uploadedImageUrl
      ? {
          ...storedRecord.uploadedImage,
          assetId: uploadedImageAssetId ?? storedRecord.uploadedImage.assetId,
          dataUrl: uploadedImageUrl,
        }
      : storedRecord.uploadedImage,
    coverUrl,
    previewUrl,
  } as WorkshopProjectRecord;

  return normalizeRecord(record);
}

async function createStoredRecord(record: WorkshopProjectRecord) {
  const assets: WorkshopProjectAssetRecord[] = [];
  const storedRecord: StoredWorkshopProjectRecord = {
    ...record,
    uploadedImage: record.uploadedImage,
  };

  const uploadedImage = record.uploadedImage;
  const existingUploadedImageAssetId = record.uploadedImageAssetId ?? uploadedImage?.assetId ?? null;
  let uploadedImageAssetId = existingUploadedImageAssetId;

  if (uploadedImage?.dataUrl && isEmbeddedImageUrl(uploadedImage.dataUrl)) {
    uploadedImageAssetId = uploadedImageAssetId || createProjectAssetId(record.projectId, 'uploadedImage');
    if (!(uploadedImage.dataUrl.startsWith('blob:') && existingUploadedImageAssetId)) {
      assets.push(await createAssetRecord({
        assetId: uploadedImageAssetId,
        projectId: record.projectId,
        slot: 'uploadedImage',
        src: uploadedImage.dataUrl,
        name: uploadedImage.name,
        mimeType: uploadedImage.type,
        width: uploadedImage.width,
        height: uploadedImage.height,
      }));
    }
    storedRecord.uploadedImage = omitUploadedImageDataUrl(uploadedImage, uploadedImageAssetId);
    storedRecord.uploadedImageAssetId = uploadedImageAssetId;
  } else if (uploadedImage) {
    storedRecord.uploadedImage = uploadedImage;
    storedRecord.uploadedImageAssetId = uploadedImageAssetId;
  } else {
    storedRecord.uploadedImage = null;
    storedRecord.uploadedImageAssetId = null;
  }

  const resolveAssetBackedUrl = async (
    value: string | null | undefined,
    slot: WorkshopAssetSlot,
    existingAssetId: string | null | undefined,
  ) => {
    if (!value) return { url: value ?? null, assetId: existingAssetId ?? null };
    if (!isEmbeddedImageUrl(value)) return { url: value, assetId: null };

    if (uploadedImage?.dataUrl === value && uploadedImageAssetId) {
      return { url: null, assetId: uploadedImageAssetId };
    }

    const assetId = existingAssetId && existingAssetId !== uploadedImageAssetId
      ? existingAssetId
      : createProjectAssetId(record.projectId, slot);
    const canReuseExistingBlobAsset = value.startsWith('blob:') && existingAssetId === assetId;
    if (!canReuseExistingBlobAsset) {
      assets.push(await createAssetRecord({
        assetId,
        projectId: record.projectId,
        slot,
        src: value,
        name: `${record.title}-${slot}.png`,
        mimeType: 'image/png',
      }));
    }
    return { url: null, assetId };
  };

  const cover = await resolveAssetBackedUrl(record.coverUrl, 'cover', record.coverAssetId);
  storedRecord.coverUrl = cover.url;
  storedRecord.coverAssetId = cover.assetId;

  const preview = await resolveAssetBackedUrl(record.previewUrl, 'preview', record.previewAssetId);
  storedRecord.previewUrl = preview.url;
  storedRecord.previewAssetId = preview.assetId;

  return { storedRecord, assets };
}

async function readRecord(projectId: string) {
  const db = await getDb();
  return new Promise<WorkshopProjectRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as StoredWorkshopProjectRecord | undefined;
      if (!result) {
        resolve(null);
        return;
      }
      hydrateStoredRecord(result).then(resolve, reject);
    };
  });
}

async function writeRecord(record: WorkshopProjectRecord) {
  const { storedRecord, assets } = await createStoredRecord(record);
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const assetStore = tx.objectStore(ASSET_STORE_NAME);
    assets.forEach((asset) => assetStore.put(asset));
    tx.objectStore(STORE_NAME).put(storedRecord);
  });
  assets.forEach(createAssetObjectUrl);
  return storedRecord;
}

async function deleteRecord(projectId: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
    const projectStore = tx.objectStore(STORE_NAME);
    const assetStore = tx.objectStore(ASSET_STORE_NAME);
    const request = projectStore.get(projectId);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    request.onsuccess = () => {
      const record = request.result as StoredWorkshopProjectRecord | undefined;
      const assetIds = new Set([
        record?.uploadedImageAssetId ?? record?.uploadedImage?.assetId,
        record?.coverAssetId,
        record?.previewAssetId,
        createProjectAssetId(projectId, 'uploadedImage'),
        createProjectAssetId(projectId, 'cover'),
        createProjectAssetId(projectId, 'preview'),
      ].filter(Boolean) as string[]);
      assetIds.forEach((assetId) => {
        const cached = ASSET_OBJECT_URL_CACHE.get(assetId);
        if (cached && typeof URL !== 'undefined') URL.revokeObjectURL(cached.url);
        ASSET_OBJECT_URL_CACHE.delete(assetId);
        assetStore.delete(assetId);
      });
      projectStore.delete(projectId);
    };
  });
}

export async function listLocalWorkshopProjects() {
  const db = await getDb();
  return new Promise<WorkshopProjectRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      Promise
        .all((request.result as StoredWorkshopProjectRecord[]).map(hydrateStoredRecord))
        .then((records) => resolve(sortWorkshopProjectRecords(records)), reject);
    };
  });
}

export async function listWorkshopProjects() {
  if (shouldUseRemoteProjects()) {
    try {
      const remoteRecords = sortWorkshopProjectRecords((await listRemoteWorkshopProjects()).map(normalizeRecord));
      rememberRemoteProjectRecords(remoteRecords);
      const localRecords = await listLocalWorkshopProjects().catch(() => []);
      const records = mergeWorkshopProjectRecords(remoteRecords, localRecords);
      MEMORY_CACHE.clear();
      records.forEach((record) => {
        if (hasLoadedRemoteProjectPayload(record) || localRecords.some((localRecord) => localRecord.projectId === record.projectId)) {
          MEMORY_CACHE.set(record.projectId, record);
        }
      });
      const localRecordMap = new Map(localRecords.map((record) => [record.projectId, record]));
      void Promise.all(remoteRecords.map((record) => {
        if (!hasLoadedRemoteProjectPayload(record)) return undefined;
        const localRecord = localRecordMap.get(record.projectId);
        if (localRecord && getProjectTimestamp(localRecord).localeCompare(getProjectTimestamp(record)) > 0) {
          return undefined;
        }
        return writeRecord(record);
      })).catch(() => undefined);
      return records;
    } catch {
      return listLocalWorkshopProjects();
    }
  }

  return listLocalWorkshopProjects();
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
  const cachedRecord = MEMORY_CACHE.get(projectId);
  if (cachedRecord && (!shouldUseRemoteProjects() || hasLoadedRemoteProjectPayload(cachedRecord))) {
    return cachedRecord;
  }

  const localRecord = await readRecord(projectId).catch(() => null);
  if (localRecord) {
    MEMORY_CACHE.set(projectId, localRecord);
    return localRecord;
  }

  if (shouldUseRemoteProjects()) {
    try {
      const record = normalizeRecord(await getRemoteWorkshopProject(projectId));
      MEMORY_CACHE.set(projectId, record);
      void writeRecord(record).catch(() => undefined);
      return record;
    } catch {
      // Fall through to the local cache when the account project API is unavailable.
    }
  }

  return null;
}

async function loadRemoteProjectLimit() {
  if (remoteProjectLimitLoaded) return;
  const entitlements = await fetchMyEntitlements();
  remoteProjectLimit = entitlements.limits.cloudProjects;
  remoteProjectLimitLoaded = true;
}

async function canSaveNewRemoteProject(projectId: string) {
  if (REMOTE_PROJECT_IDS.has(projectId)) return true;

  try {
    await loadRemoteProjectLimit();
  } catch {
    return true;
  }

  if (remoteProjectLimit === null) return true;

  if (REMOTE_PROJECT_IDS.has(projectId)) return true;

  if (remoteProjectCount === null) return true;

  if (remoteProjectCount !== null && remoteProjectCount >= remoteProjectLimit) {
    REMOTE_SAVE_BLOCKED_PROJECT_IDS.add(projectId);
    return false;
  }

  return true;
}

async function runRemoteProjectSave(record: WorkshopProjectRecord) {
  const projectId = record.projectId;

  try {
    if (!(await canSaveNewRemoteProject(projectId))) return;

    const remoteSaveRecord = await prepareRecordForRemoteSave(record);
    const remoteRecord = await saveRemoteWorkshopProject(remoteSaveRecord);
    const normalizedRemoteRecord = normalizeRecord(remoteRecord);
    const currentRecord = MEMORY_CACHE.get(normalizedRemoteRecord.projectId);
    if (currentRecord && getProjectTimestamp(currentRecord).localeCompare(getProjectTimestamp(normalizedRemoteRecord)) > 0) {
      return;
    }
    const wasKnownRemoteProject = REMOTE_PROJECT_IDS.has(normalizedRemoteRecord.projectId);
    MEMORY_CACHE.set(normalizedRemoteRecord.projectId, normalizedRemoteRecord);
    REMOTE_PROJECT_IDS.add(normalizedRemoteRecord.projectId);
    if (!wasKnownRemoteProject && remoteProjectCount !== null) {
      remoteProjectCount += 1;
    }
    REMOTE_SAVE_BLOCKED_PROJECT_IDS.delete(normalizedRemoteRecord.projectId);
    await writeRecord(normalizedRemoteRecord);
  } catch (error) {
    if (isProjectCloudLimitError(error)) {
      REMOTE_SAVE_BLOCKED_PROJECT_IDS.add(projectId);
    }
  } finally {
    REMOTE_SAVE_IN_FLIGHT_PROJECT_IDS.delete(projectId);
    const queuedRecord = REMOTE_SAVE_QUEUED_RECORDS.get(projectId);
    REMOTE_SAVE_QUEUED_RECORDS.delete(projectId);
    if (queuedRecord && !REMOTE_SAVE_BLOCKED_PROJECT_IDS.has(projectId)) {
      scheduleRemoteProjectSave(queuedRecord);
    }
  }
}

function scheduleRemoteProjectSave(record: WorkshopProjectRecord) {
  const projectId = record.projectId;
  if (!shouldUseRemoteProjects() || REMOTE_SAVE_BLOCKED_PROJECT_IDS.has(projectId)) return;

  if (REMOTE_SAVE_IN_FLIGHT_PROJECT_IDS.has(projectId)) {
    REMOTE_SAVE_QUEUED_RECORDS.set(projectId, record);
    return;
  }

  REMOTE_SAVE_IN_FLIGHT_PROJECT_IDS.add(projectId);
  void runRemoteProjectSave(record);
}

async function persistWorkshopProject(record: WorkshopProjectRecord) {
  const storedRecord = await writeRecord(record);
  const hydratedRecord = await hydrateStoredRecord(storedRecord);
  MEMORY_CACHE.set(record.projectId, hydratedRecord);

  scheduleRemoteProjectSave(hydratedRecord);

  return hydratedRecord;
}

function getDefinedProjectPatch(patch: WorkshopProjectPatch) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as WorkshopProjectPatch;
}

function buildWorkshopProjectRecord(projectId: string, current: WorkshopProjectRecord, patch: WorkshopProjectPatch) {
  const definedPatch = getDefinedProjectPatch(patch);
  const shouldSyncPatternCover = definedPatch.patternResult !== undefined && Boolean(definedPatch.patternResult);
  return withSyncedPatternCover(normalizeRecord({
    ...current,
    ...definedPatch,
    projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }), shouldSyncPatternCover);
}

export async function createWorkshopProject(projectId: string, patch: WorkshopProjectPatch) {
  return persistWorkshopProject(buildWorkshopProjectRecord(projectId, createDefaultRecord(projectId), patch));
}

export async function ensureWorkshopProject(projectId: string, patch: WorkshopProjectPatch = {}) {
  const current = (await getWorkshopProject(projectId)) ?? createDefaultRecord(projectId);
  return persistWorkshopProject(buildWorkshopProjectRecord(projectId, current, patch));
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
  if (shouldUseRemoteProjects()) {
    await deleteRemoteWorkshopProject(projectId).catch(() => undefined);
  }
  await deleteRecord(projectId).catch(() => undefined);
}
