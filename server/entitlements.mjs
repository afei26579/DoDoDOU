const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
const INTERNAL_BETA_PROVIDER = 'internal_beta';
const INTERNAL_BETA_PROVIDER_SUBSCRIPTION_PREFIX = 'internal-beta-pro-';

export const CAPABILITIES = [
  'gallery.read_public',
  'gallery.favorite_sync',
  'gallery.publish',
  'gallery.publish_official',
  'project.cloud_sync',
  'inventory.local',
  'inventory.cloud_sync',
  'workshop.local_create',
  'pattern.local_generate',
  'pattern.server_generate',
  'asset.upload',
  'export.download',
  'export.basic',
  'export.hd',
  'export.no_watermark',
  'ai.inspiration',
  'admin.moderate_gallery',
  'admin.manage_users',
];

const COMMON_LOCAL_CAPABILITIES = [
  'gallery.read_public',
  'inventory.local',
  'workshop.local_create',
  'pattern.local_generate',
];

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

export function isInternalBetaProGrantEnabled() {
  return parseBoolean(process.env.ENTITLEMENTS_INTERNAL_BETA_GRANT_PRO, false);
}

export const PLAN_DEFINITIONS = {
  anonymous: {
    label: 'Guest',
    capabilities: COMMON_LOCAL_CAPABILITIES,
    limits: {
      cloudProjects: 0,
      cloudInventoryItems: 0,
      monthlyUsage: {},
    },
  },
  free: {
    label: 'Free',
    capabilities: [
      ...COMMON_LOCAL_CAPABILITIES,
      'gallery.favorite_sync',
      'gallery.publish',
      'project.cloud_sync',
      'inventory.cloud_sync',
      'asset.upload',
      'pattern.server_generate',
      'export.download',
      'export.basic',
    ],
    limits: {
      cloudProjects: 20,
      cloudInventoryItems: 300,
      monthlyUsage: {
        'gallery.publish': 5,
        'pattern.server_generate': 20,
        'asset.upload': 100,
      },
    },
  },
  pro: {
    label: 'Pro',
    capabilities: [
      ...COMMON_LOCAL_CAPABILITIES,
      'gallery.favorite_sync',
      'gallery.publish',
      'project.cloud_sync',
      'inventory.cloud_sync',
      'asset.upload',
      'pattern.server_generate',
      'export.download',
      'export.basic',
      'export.hd',
      'export.no_watermark',
      'ai.inspiration',
    ],
    limits: {
      cloudProjects: 500,
      cloudInventoryItems: 5000,
      monthlyUsage: {
        'gallery.publish': 100,
        'pattern.server_generate': 500,
        'asset.upload': 2000,
      },
    },
  },
  admin: {
    label: 'Admin',
    capabilities: CAPABILITIES,
    limits: {
      cloudProjects: null,
      cloudInventoryItems: null,
      monthlyUsage: {
        'gallery.publish': null,
        'pattern.server_generate': null,
        'asset.upload': null,
      },
    },
  },
};

function getCurrentPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizePlanKey(planKey) {
  return PLAN_DEFINITIONS[planKey] ? planKey : 'free';
}

function mapSubscription(subscription) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    planKey: subscription.planKey,
    status: subscription.status,
    provider: subscription.provider,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

async function findActiveSubscription(prisma, userId) {
  if (!userId) return null;
  const now = new Date();
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: [
      { currentPeriodEnd: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function ensureInternalBetaProEntitlement(prisma, user) {
  if (!isInternalBetaProGrantEnabled() || !user?.id || user.role !== 'user') return null;

  const activeSubscription = await findActiveSubscription(prisma, user.id);
  if (activeSubscription?.planKey === 'pro') return activeSubscription;

  const now = new Date();

  // TODO: Remove this internal beta Pro grant before the production launch.
  if (activeSubscription) {
    return prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        planKey: 'pro',
        status: 'active',
        currentPeriodStart: activeSubscription.currentPeriodStart ?? now,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    });
  }

  return prisma.subscription.upsert({
    where: { providerSubscriptionId: `${INTERNAL_BETA_PROVIDER_SUBSCRIPTION_PREFIX}${user.id}` },
    update: {
      userId: user.id,
      planKey: 'pro',
      status: 'active',
      provider: INTERNAL_BETA_PROVIDER,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      metadataJson: { source: 'internal_beta_pro_grant' },
    },
    create: {
      userId: user.id,
      planKey: 'pro',
      status: 'active',
      provider: INTERNAL_BETA_PROVIDER,
      providerSubscriptionId: `${INTERNAL_BETA_PROVIDER_SUBSCRIPTION_PREFIX}${user.id}`,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      metadataJson: { source: 'internal_beta_pro_grant' },
    },
  });
}

async function getUsageTotals(prisma, userId, capabilities, periodKey) {
  if (!userId || !capabilities.length) return {};
  const totals = await Promise.all(capabilities.map(async (capability) => {
    const result = await prisma.usageEvent.aggregate({
      where: { userId, capability, periodKey },
      _sum: { amount: true },
    });
    return [capability, result._sum.amount ?? 0];
  }));
  return Object.fromEntries(totals);
}

export async function getEntitlementSnapshot(prisma, user) {
  const periodKey = getCurrentPeriodKey();
  if (!user) {
    const plan = PLAN_DEFINITIONS.anonymous;
    return {
      identity: 'anonymous',
      planKey: 'anonymous',
      planLabel: plan.label,
      subscription: null,
      capabilities: plan.capabilities,
      capabilityMap: Object.fromEntries(CAPABILITIES.map((capability) => [capability, plan.capabilities.includes(capability)])),
      limits: plan.limits,
      usage: {},
      periodKey,
    };
  }

  if (user.role === 'admin') {
    const plan = PLAN_DEFINITIONS.admin;
    return {
      identity: 'admin',
      planKey: 'admin',
      planLabel: plan.label,
      subscription: null,
      capabilities: plan.capabilities,
      capabilityMap: Object.fromEntries(CAPABILITIES.map((capability) => [capability, true])),
      limits: plan.limits,
      usage: {},
      periodKey,
    };
  }

  const subscription = await findActiveSubscription(prisma, user.id);
  const planKey = normalizePlanKey(subscription?.planKey ?? 'free');
  const plan = PLAN_DEFINITIONS[planKey];
  const usageCapabilities = Object.keys(plan.limits.monthlyUsage ?? {});
  const usage = await getUsageTotals(prisma, user.id, usageCapabilities, periodKey);

  return {
    identity: 'user',
    planKey,
    planLabel: plan.label,
    subscription: mapSubscription(subscription),
    capabilities: plan.capabilities,
    capabilityMap: Object.fromEntries(CAPABILITIES.map((capability) => [capability, plan.capabilities.includes(capability)])),
    limits: plan.limits,
    usage,
    periodKey,
  };
}

export function hasCapability(snapshot, capability) {
  return Boolean(snapshot?.capabilityMap?.[capability]);
}

export function requireCapability(prisma, capability) {
  return async (req, res, next) => {
    try {
      const snapshot = req.entitlements ?? await getEntitlementSnapshot(prisma, req.user ?? null);
      req.entitlements = snapshot;

      if (!hasCapability(snapshot, capability)) {
        return res.status(req.user ? 403 : 401).json({
          message: '当前套餐暂不支持该功能',
          code: 'CAPABILITY_REQUIRED',
          capability,
          planKey: snapshot.planKey,
          requestId: req.id,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getNumericLimit(snapshot, limitKey) {
  const value = snapshot?.limits?.[limitKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function ensureMonthlyUsageAvailable(prisma, user, snapshot, capability, amount = 1) {
  const limit = snapshot?.limits?.monthlyUsage?.[capability];
  if (limit === null || limit === undefined) return { ok: true, used: 0, limit: null };
  if (!user?.id) return { ok: false, used: 0, limit };

  const periodKey = snapshot.periodKey ?? getCurrentPeriodKey();
  const usage = await getUsageTotals(prisma, user.id, [capability], periodKey);
  const used = usage[capability] ?? 0;
  if (used + amount > limit) {
    return { ok: false, used, limit, periodKey };
  }
  return { ok: true, used, limit, periodKey };
}

export async function recordUsageEvent(prisma, { userId, capability, amount = 1, source, metadataJson, periodKey = getCurrentPeriodKey() }) {
  if (!userId) return null;
  return prisma.usageEvent.create({
    data: {
      userId,
      capability,
      amount,
      periodKey,
      source: source ?? null,
      metadataJson: metadataJson ?? null,
    },
  });
}

export function sendUsageLimitExceeded(res, req, { capability, used, limit, periodKey }) {
  return res.status(402).json({
    message: '本月使用次数已用完，请下月再试或升级套餐',
    code: 'USAGE_LIMIT_EXCEEDED',
    capability,
    used,
    limit,
    periodKey,
    requestId: req.id,
  });
}

export function sendPlanLimitExceeded(res, req, { capability, limit, current }) {
  return res.status(402).json({
    message: '当前套餐额度已用完',
    code: 'PLAN_LIMIT_EXCEEDED',
    capability,
    current,
    limit,
    requestId: req.id,
  });
}
