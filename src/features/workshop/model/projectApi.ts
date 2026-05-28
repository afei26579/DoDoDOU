import type { WorkshopProjectRecord } from './projectStore';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

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
  payloadJson: unknown;
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

function isProjectErrorPayload(payload: unknown): payload is {
  message?: string;
  code?: string;
  capability?: string;
  current?: number;
  limit?: number;
} {
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
    throw new ProjectApiError(errorPayload?.message || `Request failed: ${response.status}`, response.status, {
      code: typeof errorPayload?.code === 'string' ? errorPayload.code : undefined,
      capability: typeof errorPayload?.capability === 'string' ? errorPayload.capability : undefined,
      current: typeof errorPayload?.current === 'number' ? errorPayload.current : undefined,
      limit: typeof errorPayload?.limit === 'number' ? errorPayload.limit : undefined,
    });
  }

  return payload as T;
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

function toRemotePayload(record: WorkshopProjectRecord) {
  const summary = getPatternSummary(record);
  return {
    clientProjectId: record.projectId,
    title: record.title,
    status: record.status,
    sourceType: record.sourceType,
    sourceItemId: record.sourceItemId ?? null,
    coverUrl: record.coverUrl ?? record.uploadedImage?.dataUrl ?? null,
    previewUrl: record.previewUrl ?? null,
    ...summary,
    payloadJson: record,
    lastOpenedAt: record.lastOpenedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromRemoteItem(item: RemoteProjectItem): WorkshopProjectRecord {
  const payload = isPlainObject(item.payloadJson) ? item.payloadJson : {};
  return {
    ...payload,
    projectId: item.clientProjectId || String(payload.projectId ?? item.id),
    title: item.title || String(payload.title ?? '未命名作品'),
    status: item.status || (payload.status as WorkshopProjectRecord['status']) || 'editing',
    sourceType: item.sourceType || (payload.sourceType as WorkshopProjectRecord['sourceType']) || 'blank',
    sourceItemId: item.sourceItemId ?? (payload.sourceItemId as string | null | undefined) ?? null,
    coverUrl: item.coverUrl ?? (payload.coverUrl as string | null | undefined) ?? null,
    previewUrl: item.previewUrl ?? (payload.previewUrl as string | null | undefined) ?? null,
    lastOpenedAt: toNullableDate(item.lastOpenedAt) ?? (payload.lastOpenedAt as string | null | undefined) ?? null,
    createdAt: item.createdAt || String(payload.createdAt ?? new Date().toISOString()),
    updatedAt: item.updatedAt || String(payload.updatedAt ?? new Date().toISOString()),
  } as WorkshopProjectRecord;
}

export async function listRemoteWorkshopProjects() {
  const response = await requestProject<ProjectListResponse>('/api/projects');
  return response.items.map(fromRemoteItem);
}

export async function getRemoteWorkshopProject(projectId: string) {
  const response = await requestProject<ProjectItemResponse>(`/api/projects/${encodeURIComponent(projectId)}`);
  return fromRemoteItem(response.item);
}

export async function saveRemoteWorkshopProject(record: WorkshopProjectRecord) {
  const response = await requestProject<ProjectItemResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(toRemotePayload(record)),
  });
  return fromRemoteItem(response.item);
}

export async function deleteRemoteWorkshopProject(projectId: string) {
  await requestProject<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function syncRemoteWorkshopProjects(records: WorkshopProjectRecord[]) {
  const response = await requestProject<ProjectSyncResponse>('/api/projects/sync', {
    method: 'POST',
    body: JSON.stringify({
      items: records.map(toRemotePayload),
    }),
  });

  return {
    ...response,
    items: response.items.map(fromRemoteItem),
  };
}
