import { getApiErrorMessage, type ApiErrorPayload } from '../../../lib/api/errorMessage';
import type { WorkshopProjectRecord } from './projectStore';

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
const PROJECT_SYNC_MAX_ITEMS_PER_BATCH = 100;
const PROJECT_SYNC_MAX_BATCH_BYTES = 8 * 1024 * 1024;
const REMOTE_ASSET_URL_CACHE = new Map<string, string>();

type UploadedAsset = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  checksum?: string | null;
  createdAt: string;
};

type RemoteProjectItem = {
  id: string;
  clientProjectId: string;
  title: string;
  status: WorkshopProjectRecord['status'];
  sourceType: WorkshopProjectRecord['sourceType'];
  sourceItemId: string | null;
  coverUrl: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  beadCount: number | null;
  paletteCount: number | null;
  payloadJson?: unknown;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectListResponse = {
  items: RemoteProjectItem[];
};

type ProjectItemResponse = {
  item: RemoteProjectItem;
};

export type ProjectSyncResponse = ProjectListResponse & {
  stats: {
    created: number;
    updated: number;
    conflicted: number;
  };
  conflicts: Array<{
    clientProjectId: string;
    keptProjectId: string;
    conflictProjectId: string;
    conflictClientProjectId: string;
  }>;
};

export type ProjectSyncProgress = {
  synced: number;
  total: number;
  batchIndex: number;
  batchCount: number;
};

type ProjectSyncOptions = {
  onProgress?: (progress: ProjectSyncProgress) => void;
};

export class ProjectApiError extends Error {
  status: number;
  code?: string;
  capability?: string;
  current?: number;
  limit?: number;

  constructor(message: string, status: number, details: {
    code?: string;
    capability?: string;
    current?: number;
    limit?: number;
  } = {}) {
    super(message);
    this.name = 'ProjectApiError';
    this.status = status;
    this.code = details.code;
    this.capability = details.capability;
    this.current = details.current;
    this.limit = details.limit;
  }
}

function isProjectErrorPayload(payload: unknown): payload is ApiErrorPayload {
  return isPlainObject(payload);
}

async function requestProject<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const errorPayload = isProjectErrorPayload(payload) ? payload : null;
    throw new ProjectApiError(getApiErrorMessage(errorPayload, response.status), response.status, {
      code: typeof errorPayload?.code === 'string' ? errorPayload.code : undefined,
      capability: typeof errorPayload?.capability === 'string' ? errorPayload.capability : undefined,
      current: typeof errorPayload?.current === 'number' ? errorPayload.current : undefined,
      limit: typeof errorPayload?.limit === 'number' ? errorPayload.limit : undefined,
    });
  }

  return payload as T;
}

async function requestAssetUpload(src: string, fileName: string, mimeType?: string) {
  if (src.startsWith('blob:')) return null;
  const response = src.startsWith('data:') || src.startsWith('blob:')
    ? await fetch(src)
    : null;
  if (!response && /^https?:\/\//i.test(src)) return null;

  const blob = response ? await response.blob() : null;
  if (!blob) return null;

  const formData = new FormData();
  formData.append('file', new File([blob], fileName, { type: blob.type || mimeType || 'image/png' }));

  const uploadResponse = await fetch(`${API_BASE_URL}/api/assets/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const payload = await uploadResponse.json().catch(() => null) as { asset?: UploadedAsset } | null;
  if (!uploadResponse.ok || !payload?.asset?.url) {
    const errorPayload = isProjectErrorPayload(payload) ? payload : null;
    throw new ProjectApiError(getApiErrorMessage(errorPayload, uploadResponse.status), uploadResponse.status);
  }
  return payload.asset;
}

export function isProjectCloudLimitError(error: unknown) {
  return error instanceof ProjectApiError
    && error.status === 402
    && error.code === 'PLAN_LIMIT_EXCEEDED'
    && error.capability === 'project.cloud_sync';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNullableDate(value: string | null | undefined) {
  if (!value) return null;
  return value;
}

function getPatternSummary(record: WorkshopProjectRecord) {
  const pattern = record.patternResult;
  return {
    width: pattern?.width ?? null,
    height: pattern?.height ?? null,
    beadCount: pattern?.stats.totalCells ?? null,
    paletteCount: pattern?.stats.colorCount ?? null,
  };
}

function isEmbeddedImageReference(value: string | null | undefined) {
  return Boolean(value?.startsWith('data:image/') || value?.startsWith('blob:'));
}

async function resolveRemoteImageReference(src: string | null | undefined, fileName: string, mimeType?: string, cacheKey?: string | null) {
  if (!src) return null;
  if (!isEmbeddedImageReference(src)) return src;
  if (src.startsWith('blob:')) return null;
  if (cacheKey && REMOTE_ASSET_URL_CACHE.has(cacheKey)) return REMOTE_ASSET_URL_CACHE.get(cacheKey) ?? null;
  const asset = await requestAssetUpload(src, fileName, mimeType);
  if (asset?.url && cacheKey) REMOTE_ASSET_URL_CACHE.set(cacheKey, asset.url);
  return asset?.url ?? null;
}

function createRemotePayloadJson(record: WorkshopProjectRecord, sourceUrl: string | null) {
  const payloadJson: Record<string, unknown> = {
    ...record,
    coverUrl: undefined,
    previewUrl: undefined,
    coverAssetId: undefined,
    previewAssetId: undefined,
    uploadedImageAssetId: undefined,
  };

  if (record.uploadedImage) {
    const { dataUrl: _dataUrl, assetId: _assetId, ...uploadedImageMetadata } = record.uploadedImage;
    payloadJson.uploadedImage = sourceUrl
      ? {
          ...uploadedImageMetadata,
          dataUrl: sourceUrl,
        }
      : uploadedImageMetadata;
  }

  return payloadJson;
}

async function toRemotePayload(record: WorkshopProjectRecord) {
  const summary = getPatternSummary(record);
  const uploadedImageCacheKey = record.uploadedImageAssetId ?? record.uploadedImage?.assetId ?? null;
  const uploadedImageUrl = await resolveRemoteImageReference(
    record.uploadedImage?.dataUrl,
    record.uploadedImage?.name || `${record.projectId}-source.png`,
    record.uploadedImage?.type,
    uploadedImageCacheKey,
  );
  const coverInput = record.coverUrl ?? uploadedImageUrl ?? record.uploadedImage?.dataUrl ?? null;
  const coverCacheKey = record.coverAssetId ?? (coverInput === record.uploadedImage?.dataUrl ? uploadedImageCacheKey : null);
  const coverUrl = coverInput === record.uploadedImage?.dataUrl && uploadedImageUrl
    ? uploadedImageUrl
    : await resolveRemoteImageReference(coverInput, `${record.projectId}-cover.png`, 'image/png', coverCacheKey);
  const previewCacheKey = record.previewAssetId ?? (record.previewUrl === record.uploadedImage?.dataUrl ? uploadedImageCacheKey : null);
  const previewUrl = record.previewUrl === record.uploadedImage?.dataUrl && uploadedImageUrl
    ? uploadedImageUrl
    : await resolveRemoteImageReference(record.previewUrl ?? null, `${record.projectId}-preview.png`, 'image/png', previewCacheKey);
  return {
    clientProjectId: record.projectId,
    title: record.title,
    status: record.status,
    sourceType: record.sourceType,
    sourceItemId: record.sourceItemId ?? null,
    coverUrl,
    previewUrl,
    ...summary,
    payloadJson: createRemotePayloadJson(record, uploadedImageUrl),
    lastOpenedAt: record.lastOpenedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

type RemoteProjectPayload = Awaited<ReturnType<typeof toRemotePayload>>;

function getUtf8ByteLength(value: string) {
  if (typeof TextEncoder === 'undefined') return value.length;
  return new TextEncoder().encode(value).length;
}

function createProjectSyncBatches(payloads: RemoteProjectPayload[]) {
  const batches: RemoteProjectPayload[][] = [];
  const emptyBodyBytes = getUtf8ByteLength(JSON.stringify({ items: [] }));
  let currentBatch: RemoteProjectPayload[] = [];
  let currentBytes = emptyBodyBytes;

  for (const payload of payloads) {
    const itemBytes = getUtf8ByteLength(JSON.stringify(payload));
    const separatorBytes = currentBatch.length ? 1 : 0;
    const nextBytes = currentBytes + separatorBytes + itemBytes;

    if (
      currentBatch.length > 0
      && (currentBatch.length >= PROJECT_SYNC_MAX_ITEMS_PER_BATCH || nextBytes > PROJECT_SYNC_MAX_BATCH_BYTES)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = emptyBodyBytes;
    }

    currentBytes += (currentBatch.length ? 1 : 0) + itemBytes;
    currentBatch.push(payload);
  }

  if (currentBatch.length) batches.push(currentBatch);
  return batches;
}

function restoreRemoteUploadedImage(payload: Record<string, unknown>, coverUrl: string | null) {
  const uploadedImage = payload.uploadedImage;
  if (!isPlainObject(uploadedImage)) return null;
  if (typeof uploadedImage.dataUrl === 'string' && uploadedImage.dataUrl) return uploadedImage;
  if (!coverUrl) return uploadedImage;
  return {
    ...uploadedImage,
    dataUrl: coverUrl,
  };
}

function createSummaryPatternResult(item: RemoteProjectItem): WorkshopProjectRecord['patternResult'] {
  if (!item.width || !item.height || item.beadCount === null || item.paletteCount === null) return null;
  return {
    width: item.width,
    height: item.height,
    cells: [],
    palette: [],
    stats: {
      totalCells: item.beadCount,
      colorCount: item.paletteCount,
    },
  };
}

function fromRemoteItem(item: RemoteProjectItem): WorkshopProjectRecord {
  const payload = isPlainObject(item.payloadJson) ? item.payloadJson : {};
  const hasPayload = isPlainObject(item.payloadJson);
  const coverUrl = item.coverUrl ?? (payload.coverUrl as string | null | undefined) ?? null;
  const previewUrl = item.previewUrl ?? (payload.previewUrl as string | null | undefined) ?? null;
  const patternResult = (payload.patternResult as WorkshopProjectRecord['patternResult'] | undefined) ?? createSummaryPatternResult(item);
  return {
    ...payload,
    uploadedImage: restoreRemoteUploadedImage(payload, coverUrl),
    projectId: item.clientProjectId || String(payload.projectId ?? item.id),
    title: item.title || String(payload.title ?? '未命名作品'),
    kind: (payload.kind as WorkshopProjectRecord['kind'] | undefined) ?? (patternResult ? 'pattern' : 'upload'),
    status: item.status || (payload.status as WorkshopProjectRecord['status']) || 'editing',
    beadingState: (payload.beadingState as WorkshopProjectRecord['beadingState'] | undefined) ?? 'idle',
    sourceType: item.sourceType || (payload.sourceType as WorkshopProjectRecord['sourceType']) || 'blank',
    sourceItemId: item.sourceItemId ?? (payload.sourceItemId as string | null | undefined) ?? null,
    coverUrl,
    previewUrl,
    patternResult,
    lastOpenedAt: toNullableDate(item.lastOpenedAt) ?? (payload.lastOpenedAt as string | null | undefined) ?? null,
    createdAt: item.createdAt || String(payload.createdAt ?? new Date().toISOString()),
    updatedAt: item.updatedAt || String(payload.updatedAt ?? new Date().toISOString()),
    remotePayloadLoaded: hasPayload,
  } as unknown as WorkshopProjectRecord;
}

export function hasLoadedRemoteProjectPayload(record: WorkshopProjectRecord) {
  return (record as WorkshopProjectRecord & { remotePayloadLoaded?: boolean }).remotePayloadLoaded !== false;
}

export async function listRemoteWorkshopProjects() {
  const response = await requestProject<ProjectListResponse>('/api/projects?summary=1');
  return response.items.map(fromRemoteItem);
}

export async function getRemoteWorkshopProject(projectId: string) {
  const response = await requestProject<ProjectItemResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
  return fromRemoteItem(response.item);
}

export async function saveRemoteWorkshopProject(record: WorkshopProjectRecord) {
  const payload = await toRemotePayload(record);
  const response = await requestProject<ProjectItemResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return fromRemoteItem(response.item);
}

export async function deleteRemoteWorkshopProject(projectId: string) {
  await requestProject<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

async function syncRemoteProjectPayloads(payloads: RemoteProjectPayload[]) {
  return requestProject<ProjectSyncResponse>('/api/projects/sync', {
    method: 'POST',
    body: JSON.stringify({ items: payloads }),
  });
}

export async function syncRemoteWorkshopProjects(records: WorkshopProjectRecord[], options: ProjectSyncOptions = {}) {
  const payloads = await Promise.all(records.map(toRemotePayload));
  const batches = payloads.length ? createProjectSyncBatches(payloads) : [[]];
  const stats = { created: 0, updated: 0, conflicted: 0 };
  const conflicts: ProjectSyncResponse['conflicts'] = [];
  let response: ProjectSyncResponse | null = null;
  let synced = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    response = await syncRemoteProjectPayloads(batch);
    stats.created += response.stats.created;
    stats.updated += response.stats.updated;
    stats.conflicted += response.stats.conflicted;
    conflicts.push(...response.conflicts);
    synced += batch.length;
    options.onProgress?.({
      synced,
      total: payloads.length,
      batchIndex: index + 1,
      batchCount: batches.length,
    });
  }

  return {
    ...response!,
    stats,
    conflicts,
    items: response!.items.map(fromRemoteItem),
  };
}
