export type CapabilityKey =
  | 'gallery.read_public'
  | 'gallery.favorite_sync'
  | 'gallery.publish'
  | 'gallery.publish_official'
  | 'project.cloud_sync'
  | 'inventory.local'
  | 'inventory.cloud_sync'
  | 'workshop.local_create'
  | 'pattern.local_generate'
  | 'pattern.server_generate'
  | 'asset.upload'
  | 'export.basic'
  | 'export.hd'
  | 'export.no_watermark'
  | 'ai.inspiration'
  | 'admin.moderate_gallery'
  | 'admin.manage_users';

export type SubscriptionInfo = {
  id: string;
  planKey: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type EntitlementLimits = {
  cloudProjects: number | null;
  cloudInventoryItems: number | null;
  monthlyUsage: Partial<Record<CapabilityKey, number | null>>;
};

export type EntitlementSnapshot = {
  identity: 'anonymous' | 'user' | 'admin';
  planKey: string;
  planLabel: string;
  subscription: SubscriptionInfo | null;
  capabilities: CapabilityKey[];
  capabilityMap: Partial<Record<CapabilityKey, boolean>>;
  limits: EntitlementLimits;
  usage: Partial<Record<CapabilityKey, number>>;
  periodKey: string;
};
