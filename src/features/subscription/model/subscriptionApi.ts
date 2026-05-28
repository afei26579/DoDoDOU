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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getPayloadMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null;
}

function isEntitlementSnapshot(payload: unknown): payload is EntitlementSnapshot {
  if (!isRecord(payload)) return false;
  if (!isRecord(payload.limits)) return false;

  return (
    typeof payload.identity === 'string' &&
    typeof payload.planKey === 'string' &&
    typeof payload.planLabel === 'string' &&
    Array.isArray(payload.capabilities) &&
    isRecord(payload.capabilityMap) &&
    isRecord(payload.limits.monthlyUsage) &&
    isRecord(payload.usage) &&
    typeof payload.periodKey === 'string'
  );
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

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new SubscriptionApiError(getPayloadMessage(payload) || `Request failed: ${response.status}`, response.status);
  }

  return payload as T;
}

export async function fetchMyEntitlements() {
  const payload = await requestSubscription<unknown>('/api/subscription/me');
  if (!isEntitlementSnapshot(payload)) {
    throw new SubscriptionApiError('Invalid entitlement response', 502);
  }
  return payload;
}
