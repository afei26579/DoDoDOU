import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/model/AuthProvider';
import { fetchMyEntitlements } from './subscriptionApi';
import type { CapabilityKey, EntitlementSnapshot } from './types';

type EntitlementStatus = 'loading' | 'ready' | 'error';

type EntitlementContextValue = {
  status: EntitlementStatus;
  entitlements: EntitlementSnapshot;
  error: string | null;
  hasCapability: (capability: CapabilityKey) => boolean;
  refreshEntitlements: () => Promise<EntitlementSnapshot>;
};

const anonymousCapabilities: CapabilityKey[] = [
  'gallery.read_public',
  'inventory.local',
  'workshop.local_create',
  'pattern.local_generate',
  'export.basic',
];

const freeCapabilities: CapabilityKey[] = [
  ...anonymousCapabilities,
  'gallery.favorite_sync',
  'gallery.publish',
  'project.cloud_sync',
  'inventory.cloud_sync',
  'asset.upload',
  'pattern.server_generate',
];

const adminCapabilities: CapabilityKey[] = [
  ...freeCapabilities,
  'gallery.publish_official',
  'export.hd',
  'export.no_watermark',
  'ai.inspiration',
  'admin.moderate_gallery',
  'admin.manage_users',
];

function toCapabilityMap(capabilities: CapabilityKey[]) {
  return Object.fromEntries(capabilities.map((capability) => [capability, true])) as Partial<Record<CapabilityKey, boolean>>;
}

function createFallbackSnapshot(kind: 'anonymous' | 'free' | 'admin'): EntitlementSnapshot {
  const capabilities = kind === 'admin'
    ? adminCapabilities
    : kind === 'free'
      ? freeCapabilities
      : anonymousCapabilities;

  return {
    identity: kind === 'admin' ? 'admin' : kind === 'free' ? 'user' : 'anonymous',
    planKey: kind,
    planLabel: kind === 'admin' ? 'Admin' : kind === 'free' ? 'Free' : 'Guest',
    subscription: null,
    capabilities,
    capabilityMap: toCapabilityMap(capabilities),
    limits: {
      cloudProjects: kind === 'anonymous' ? 0 : kind === 'admin' ? null : 20,
      cloudInventoryItems: kind === 'anonymous' ? 0 : kind === 'admin' ? null : 300,
      monthlyUsage: {},
    },
    usage: {},
    periodKey: '',
  };
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const fallbackKind = user?.role === 'admin' ? 'admin' : authStatus === 'authenticated' ? 'free' : 'anonymous';
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot>(() => createFallbackSnapshot('anonymous'));
  const [error, setError] = useState<string | null>(null);

  const refreshEntitlements = useCallback(async () => {
    const response = await fetchMyEntitlements();
    setEntitlements(response);
    setStatus('ready');
    setError(null);
    return response;
  }, []);

  useEffect(() => {
    if (authStatus === 'loading') {
      setStatus('loading');
      return;
    }

    let alive = true;
    setStatus('loading');
    fetchMyEntitlements()
      .then((response) => {
        if (!alive) return;
        setEntitlements(response);
        setStatus('ready');
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setEntitlements(createFallbackSnapshot(fallbackKind));
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to load entitlement state');
      });

    return () => {
      alive = false;
    };
  }, [authStatus, fallbackKind, user?.id]);

  const hasCapability = useCallback(
    (capability: CapabilityKey) => Boolean(entitlements?.capabilityMap?.[capability]),
    [entitlements?.capabilityMap],
  );

  const value = useMemo<EntitlementContextValue>(() => ({
    status,
    entitlements,
    error,
    hasCapability,
    refreshEntitlements,
  }), [entitlements, error, hasCapability, refreshEntitlements, status]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements() {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlements must be used within EntitlementProvider');
  return context;
}

export function useCapability(capability: CapabilityKey) {
  const { hasCapability } = useEntitlements();
  return hasCapability(capability);
}
