import { getApiErrorMessage, type ApiErrorPayload } from '../../../lib/api/errorMessage';
import type {
  AdminAuditLogListResponse,
  AdminAuthResponse,
  AdminGalleryItem,
  AdminGalleryListResponse,
  AdminGalleryPatch,
  AdminOverview,
  AdminUser,
  AdminUserListResponse,
  AdminUserPatch,
} from './types';
import { ADMIN_API_PREFIX } from './adminConfig';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || 'auto';
  const normalized = configured.replace(/\/+$/, '').toLowerCase();
  if (normalized === 'same-origin') return '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

async function requestAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, response.status));
  }

  return payload as T;
}

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const output = params.toString();
  return output ? `?${output}` : '';
}

export function fetchAdminOverview() {
  return requestAdminJson<AdminOverview>(`${ADMIN_API_PREFIX}/overview`);
}

export function fetchAdminMe() {
  return requestAdminJson<AdminAuthResponse>(`${ADMIN_API_PREFIX}/auth/me`);
}

export function loginAdmin(input: { account: string; password: string }) {
  return requestAdminJson<AdminAuthResponse>(`${ADMIN_API_PREFIX}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutAdmin() {
  return requestAdminJson<{ ok: true }>(`${ADMIN_API_PREFIX}/auth/logout`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchAdminGalleryItems(query: {
  status?: string;
  sourceType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  return requestAdminJson<AdminGalleryListResponse>(`${ADMIN_API_PREFIX}/gallery/items${toQueryString(query)}`);
}

export function updateAdminGalleryItem(itemId: string, payload: AdminGalleryPatch) {
  return requestAdminJson<{ item: AdminGalleryItem }>(`${ADMIN_API_PREFIX}/gallery/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function moderateAdminGalleryItem(itemId: string, action: 'approve' | 'reject' | 'offline') {
  return requestAdminJson<{ item: AdminGalleryItem }>(`${ADMIN_API_PREFIX}/gallery/items/${encodeURIComponent(itemId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchAdminUsers(query: {
  role?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  return requestAdminJson<AdminUserListResponse>(`${ADMIN_API_PREFIX}/users${toQueryString(query)}`);
}

export function fetchAdminAuditLogs(query: {
  action?: string;
  resourceType?: string;
  actor?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  return requestAdminJson<AdminAuditLogListResponse>(`${ADMIN_API_PREFIX}/audit-logs${toQueryString(query)}`);
}

export function updateAdminUser(userId: string, payload: AdminUserPatch) {
  return requestAdminJson<{ user: AdminUser }>(`${ADMIN_API_PREFIX}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
