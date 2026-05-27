import type { EntitlementSnapshot } from './types';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim() || '';
  if (configured !== 'auto') return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const apiPort = import.meta.env.VITE_API_PORT || '3001';
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
}

const API_BASE_URL = resolveApiBaseUrl();

export class SubscriptionApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SubscriptionApiError';
    this.status = status;
  }
}

async function requestSubscription<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new SubscriptionApiError(payload?.message || `Request failed: ${response.status}`, response.status);
  }

  return payload as T;
}

export function fetchMyEntitlements() {
  return requestSubscription<EntitlementSnapshot>('/api/subscription/me');
}
