import express from 'express';
import {
  authenticatePasswordUser,
  clearAdminSessionCookie,
  createAdminSession,
  mapSafeUser,
  requireAdminAuth,
  setAdminSessionCookie,
} from './auth.mjs';
import { requireCapability } from './entitlements.mjs';

const galleryStatuses = new Set(['draft', 'pending_review', 'published', 'rejected', 'offline']);
const gallerySourceTypes = new Set(['official', 'community']);
const userRoles = new Set(['user', 'admin']);
const userStatuses = new Set(['active', 'disabled', 'deleted']);
const planKeys = new Set(['free', 'pro']);
const subscriptionStatuses = new Set(['trialing', 'active', 'past_due', 'canceled', 'expired']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addValidationError(errors, message) {
  if (errors.length < 20) errors.push(message);
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function createRateLimiter({ windowMs, max, name }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const account = typeof req.body?.account === 'string' ? req.body.account.trim().toLowerCase() : '';
    const key = `${req.ip}:${req.method}:${req.path}:${account}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message: `${name} rate limit exceeded`,
        requestId: req.id,
        retryAfterSeconds,
      });
    }

    next();
  };
}

function readAdminConfig() {
  return {
    loginRateLimitMax: parseInteger(process.env.ADMIN_AUTH_LOGIN_RATE_LIMIT_MAX, 5, { min: 1, max: 1000 }),
    rateLimitWindowMs: parseInteger(process.env.ADMIN_AUTH_RATE_LIMIT_WINDOW_MS, 60_000, { min: 1_000, max: 3_600_000 }),
  };
}

function normalizePageQuery(query) {
  return {
    page: parseInteger(Number(query.page), 1, { min: 1, max: 10000 }),
    pageSize: parseInteger(Number(query.pageSize), 24, { min: 1, max: 100 }),
  };
}

function normalizeOptionalText(value, field, maxLength, errors) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) addValidationError(errors, `${field} is too long`);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeIntegerField(value, field, min, max, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    addValidationError(errors, `${field} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return parsed;
}

function normalizeEnumField(value, field, allowed, errors) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.has(value)) {
    addValidationError(errors, `${field} is invalid`);
    return undefined;
  }
  return value;
}

function normalizeTags(value, errors) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    addValidationError(errors, 'tags must be an array');
    return undefined;
  }
  if (value.length > 10) addValidationError(errors, 'tags cannot contain more than 10 items');

  return value.slice(0, 10).flatMap((tag, index) => {
    if (typeof tag !== 'string') {
      addValidationError(errors, `tags[${index}] must be a string`);
      return [];
    }
    const normalized = tag.trim();
    if (!normalized) return [];
    if (normalized.length > 24) addValidationError(errors, `tags[${index}] is too long`);
    return [normalized.slice(0, 24)];
  });
}

function normalizeSafeLookupId(value) {
  return typeof value === 'string' && /^[\w\u4e00-\u9fa5:.-]{1,180}$/u.test(value);
}

function normalizeGalleryPatch(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['Request body must be a JSON object'] };

  const title = normalizeOptionalText(input.title, 'title', 40, errors);
  const description = normalizeOptionalText(input.description, 'description', 500, errors);
  const sourceType = normalizeEnumField(input.sourceType, 'sourceType', gallerySourceTypes, errors);
  const status = normalizeEnumField(input.status, 'status', galleryStatuses, errors);
  const tags = normalizeTags(input.tags, errors);
  const sortWeight = normalizeIntegerField(input.sortWeight, 'sortWeight', -1000, 1000, errors);
  const hotScore = normalizeIntegerField(input.hotScore, 'hotScore', 0, 1000000, errors);

  const data = {};
  if (title !== undefined) data.title = title || '';
  if (description !== undefined) data.description = description;
  if (sourceType !== undefined) data.sourceType = sourceType;
  if (status !== undefined) {
    data.status = status;
    if (status === 'published') data.publishedAt = new Date();
  }
  if (tags !== undefined) data.tagsJson = tags;
  if (sortWeight !== undefined && sortWeight !== null) data.sortWeight = sortWeight;
  if (hotScore !== undefined && hotScore !== null) data.hotScore = hotScore;

  if (!Object.keys(data).length) addValidationError(errors, 'No supported fields were provided');
  return errors.length ? { ok: false, errors } : { ok: true, data };
}

function normalizeUserPatch(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['Request body must be a JSON object'] };

  const role = normalizeEnumField(input.role, 'role', userRoles, errors);
  const status = normalizeEnumField(input.status, 'status', userStatuses, errors);
  const name = normalizeOptionalText(input.name, 'name', 40, errors);
  const planKey = normalizeEnumField(input.planKey, 'planKey', planKeys, errors);
  const subscriptionStatus = normalizeEnumField(input.subscriptionStatus, 'subscriptionStatus', subscriptionStatuses, errors);

  const userData = {};
  const subscriptionData = {};
  if (role !== undefined) userData.role = role;
  if (status !== undefined) userData.status = status;
  if (name !== undefined) userData.name = name;
  if (planKey !== undefined) subscriptionData.planKey = planKey;
  if (subscriptionStatus !== undefined) subscriptionData.status = subscriptionStatus;

  if (!Object.keys(userData).length && !Object.keys(subscriptionData).length) {
    addValidationError(errors, 'No supported fields were provided');
  }

  return errors.length ? { ok: false, errors } : { ok: true, userData, subscriptionData };
}

function getSearchQuery(value, maxLength = 80) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getDate(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function getLatestSubscription(user) {
  return Array.isArray(user.subscriptions) && user.subscriptions.length ? user.subscriptions[0] : null;
}

function mapGalleryItem(item) {
  const patternSummary = item.patternDetail
    ? {
        width: item.patternDetail.width,
        height: item.patternDetail.height,
        beadCount: item.patternDetail.beadCount,
        paletteCount: item.patternDetail.paletteCount,
      }
    : null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    coverUrl: item.coverAsset?.url ?? '',
    previewUrl: item.previewAsset?.url ?? '',
    coverWidth: item.coverWidth,
    coverHeight: item.coverHeight,
    author: {
      id: item.author.id,
      name: item.author.name,
      avatarUrl: item.author.avatarUrl,
      userId: item.author.userId ?? null,
      account: item.author.user?.email ?? item.author.user?.username ?? null,
    },
    sourceType: item.sourceType,
    visibility: item.visibility,
    status: item.status,
    style: item.style,
    brand: item.brand,
    canvasSize: item.canvasSize,
    tags: Array.isArray(item.tagsJson) ? item.tagsJson : [],
    patternSummary,
    stats: {
      viewCount: item.viewCount,
      likeCount: item.likeCount,
      favoriteCount: item.favoriteCount,
      downloadCount: item.downloadCount,
      shareCount: item.shareCount,
      hotScore: item.hotScore,
    },
    sortWeight: item.sortWeight,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    publishedAt: getDate(item.publishedAt),
  };
}

function mapSubscription(subscription) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    planKey: subscription.planKey,
    status: subscription.status,
    provider: subscription.provider,
    currentPeriodStart: getDate(subscription.currentPeriodStart),
    currentPeriodEnd: getDate(subscription.currentPeriodEnd),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

function mapUser(user) {
  const subscription = getLatestSubscription(user);
  const galleryItemCount = user.galleryAuthors?.reduce((sum, author) => sum + (author._count?.items ?? 0), 0) ?? 0;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    planKey: user.role === 'admin' ? 'admin' : subscription?.planKey ?? 'free',
    subscription: mapSubscription(subscription),
    counts: {
      projects: user._count?.projects ?? 0,
      favorites: user._count?.galleryFavorites ?? 0,
      usageEvents: user._count?.usageEvents ?? 0,
      galleryItems: galleryItemCount,
    },
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function mapStatusCounts(rows) {
  const counts = Object.fromEntries([...galleryStatuses].map((status) => [status, 0]));
  rows.forEach((row) => {
    counts[row.status] = row._count?._all ?? 0;
  });
  return counts;
}

function mapUserStatusCounts(rows) {
  const counts = Object.fromEntries([...userStatuses].map((status) => [status, 0]));
  rows.forEach((row) => {
    counts[row.status] = row._count?._all ?? 0;
  });
  return counts;
}

function getActorEmail(user) {
  return user?.email ?? user?.username ?? null;
}

function getRequestMetadata(req) {
  return {
    requestId: req.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get('User-Agent')?.slice(0, 500) || null,
  };
}

async function recordAdminAuditLog(prisma, req, {
  actorUser = req.user ?? null,
  action,
  resourceType,
  resourceId = null,
  outcome = 'success',
  beforeJson = null,
  afterJson = null,
  metadataJson = null,
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: actorUser?.id ?? null,
        actorEmail: getActorEmail(actorUser),
        action,
        resourceType,
        resourceId,
        outcome,
        ...getRequestMetadata(req),
        beforeJson,
        afterJson,
        metadataJson,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Failed to write admin audit log',
      requestId: req.id,
      action,
      resourceType,
      resourceId,
      error: error?.message,
    }));
  }
}

function pickGalleryAuditFields(item) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    sourceType: item.sourceType,
    status: item.status,
    tags: item.tagsJson,
    sortWeight: item.sortWeight,
    hotScore: item.hotScore,
    publishedAt: item.publishedAt?.toISOString?.() ?? null,
    updatedAt: item.updatedAt?.toISOString?.() ?? null,
  };
}

function pickUserAuditFields(user) {
  if (!user) return null;
  const subscription = getLatestSubscription(user);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    planKey: user.role === 'admin' ? 'admin' : subscription?.planKey ?? 'free',
    subscriptionStatus: subscription?.status ?? null,
    updatedAt: user.updatedAt?.toISOString?.() ?? null,
  };
}

function mapAuditLog(log) {
  return {
    id: log.id,
    actorUserId: log.actorUserId,
    actorEmail: log.actorEmail,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    outcome: log.outcome,
    requestId: log.requestId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    beforeJson: log.beforeJson,
    afterJson: log.afterJson,
    metadataJson: log.metadataJson,
    createdAt: log.createdAt.toISOString(),
  };
}

async function findGalleryItem(prisma, id) {
  if (!normalizeSafeLookupId(id)) return null;
  return prisma.galleryItem.findUnique({
    where: { id },
    include: {
      author: { include: { user: true } },
      coverAsset: true,
      previewAsset: true,
      patternDetail: true,
    },
  });
}

async function updateGalleryStatus(prisma, id, status) {
  const existing = await findGalleryItem(prisma, id);
  if (!existing) return null;
  const data = {
    status,
    ...(status === 'published' ? { publishedAt: existing.publishedAt ?? new Date() } : {}),
  };
  const item = await prisma.galleryItem.update({
    where: { id: existing.id },
    data,
    include: {
      author: { include: { user: true } },
      coverAsset: true,
      previewAsset: true,
      patternDetail: true,
    },
  });
  return { before: existing, item };
}

function getGalleryWhere(query) {
  const status = query.status === 'all' ? '' : getSearchQuery(query.status, 32);
  const sourceType = query.sourceType === 'all' ? '' : getSearchQuery(query.sourceType, 32);
  const search = getSearchQuery(query.search);
  const where = {};
  if (galleryStatuses.has(status)) where.status = status;
  if (gallerySourceTypes.has(sourceType)) where.sourceType = sourceType;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { author: { name: { contains: search } } },
    ];
  }
  return where;
}

function getUserWhere(query) {
  const role = query.role === 'all' ? '' : getSearchQuery(query.role, 32);
  const status = query.status === 'all' ? '' : getSearchQuery(query.status, 32);
  const search = getSearchQuery(query.search);
  const where = {};
  if (userRoles.has(role)) where.role = role;
  if (userStatuses.has(status)) where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { username: { contains: search } },
      { name: { contains: search } },
    ];
  }
  return where;
}

async function syncManualSubscription(tx, userId, input) {
  if (!Object.keys(input).length) return;

  const now = new Date();
  const providerSubscriptionId = `manual-${userId}`;
  await tx.subscription.upsert({
    where: { providerSubscriptionId },
    update: {
      planKey: input.planKey ?? undefined,
      status: input.status ?? 'active',
      provider: 'manual_admin',
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    create: {
      userId,
      planKey: input.planKey ?? 'free',
      status: input.status ?? 'active',
      provider: 'manual_admin',
      providerSubscriptionId,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });
}

export function createAdminRouter(prisma) {
  const router = express.Router();
  const adminConfig = readAdminConfig();
  const adminLoginLimiter = createRateLimiter({
    windowMs: adminConfig.rateLimitWindowMs,
    max: adminConfig.loginRateLimitMax,
    name: 'Admin login',
  });

  router.post('/auth/login', express.json({ limit: '32kb', strict: true }), adminLoginLimiter, async (req, res, next) => {
    try {
      const result = await authenticatePasswordUser(prisma, {
        account: req.body?.account,
        password: req.body?.password,
      });

      if (!result.ok) {
        await recordAdminAuditLog(prisma, req, {
          actorUser: result.user,
          action: 'admin.login',
          resourceType: 'admin_session',
          outcome: 'failure',
          metadataJson: {
            reason: result.message,
            account: typeof req.body?.account === 'string' ? req.body.account.trim().slice(0, 254) : null,
          },
        });
        return res.status(result.status).json({ message: 'Admin credentials are invalid', requestId: req.id });
      }

      if (result.user.role !== 'admin') {
        await recordAdminAuditLog(prisma, req, {
          actorUser: result.user,
          action: 'admin.login',
          resourceType: 'admin_session',
          outcome: 'denied',
          metadataJson: { reason: 'not_admin' },
        });
        return res.status(403).json({ message: 'Admin credentials are invalid', requestId: req.id });
      }

      const token = await createAdminSession(prisma, req, result.user.id);
      setAdminSessionCookie(res, token);
      await recordAdminAuditLog(prisma, req, {
        actorUser: result.user,
        action: 'admin.login',
        resourceType: 'admin_session',
        outcome: 'success',
      });
      res.json({ user: mapSafeUser(result.user) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/auth/me', requireAdminAuth(prisma), (req, res) => {
    res.json({ user: mapSafeUser(req.user) });
  });

  router.post('/auth/logout', requireAdminAuth(prisma), async (req, res, next) => {
    try {
      if (req.authSession?.id) {
        await prisma.session.delete({ where: { id: req.authSession.id } }).catch(() => undefined);
      }
      clearAdminSessionCookie(res);
      await recordAdminAuditLog(prisma, req, {
        action: 'admin.logout',
        resourceType: 'admin_session',
        outcome: 'success',
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAdminAuth(prisma));

  router.get('/overview', requireCapability(prisma, 'admin.moderate_gallery'), async (_req, res, next) => {
    try {
      const [
        totalUsers,
        userStatusRows,
        adminUsers,
        galleryStatusRows,
        officialItems,
        communityItems,
        totalProjects,
        usageEvents,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.user.count({ where: { role: 'admin' } }),
        prisma.galleryItem.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.galleryItem.count({ where: { sourceType: 'official' } }),
        prisma.galleryItem.count({ where: { sourceType: 'community' } }),
        prisma.workshopProject.count(),
        prisma.usageEvent.count(),
      ]);

      res.json({
        users: {
          total: totalUsers,
          admins: adminUsers,
          byStatus: mapUserStatusCounts(userStatusRows),
        },
        gallery: {
          byStatus: mapStatusCounts(galleryStatusRows),
          sourceTypes: {
            official: officialItems,
            community: communityItems,
          },
        },
        projects: {
          total: totalProjects,
        },
        usage: {
          events: usageEvents,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit-logs', requireCapability(prisma, 'admin.manage_users'), async (req, res, next) => {
    try {
      const { page, pageSize } = normalizePageQuery(req.query);
      const action = getSearchQuery(req.query.action, 80);
      const resourceType = getSearchQuery(req.query.resourceType, 80);
      const actor = getSearchQuery(req.query.actor, 120);
      const where = {};
      if (action) where.action = action;
      if (resourceType) where.resourceType = resourceType;
      if (actor) {
        where.OR = [
          { actorEmail: { contains: actor } },
          { actorUserId: { contains: actor } },
        ];
      }

      const [logs, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.adminAuditLog.count({ where }),
      ]);

      res.json({
        logs: logs.map(mapAuditLog),
        total,
        page,
        pageSize,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/gallery/items', requireCapability(prisma, 'admin.moderate_gallery'), async (req, res, next) => {
    try {
      const { page, pageSize } = normalizePageQuery(req.query);
      const where = getGalleryWhere(req.query);
      const [items, total, statusRows] = await Promise.all([
        prisma.galleryItem.findMany({
          where,
          include: {
            author: { include: { user: true } },
            coverAsset: true,
            previewAsset: true,
            patternDetail: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.galleryItem.count({ where }),
        prisma.galleryItem.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);

      res.json({
        items: items.map(mapGalleryItem),
        total,
        page,
        pageSize,
        statusCounts: mapStatusCounts(statusRows),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/gallery/items/:id', requireCapability(prisma, 'admin.moderate_gallery'), express.json({ limit: '128kb', strict: true }), async (req, res, next) => {
    try {
      if (!normalizeSafeLookupId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid gallery item id', requestId: req.id });
      }

      const normalized = normalizeGalleryPatch(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid gallery item payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const before = await findGalleryItem(prisma, req.params.id);
      if (!before) return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });

      const item = await prisma.galleryItem.update({
        where: { id: req.params.id },
        data: normalized.data,
        include: {
          author: { include: { user: true } },
          coverAsset: true,
          previewAsset: true,
          patternDetail: true,
        },
      }).catch((error) => {
        if (error?.code === 'P2025') return null;
        throw error;
      });

      if (!item) return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
      await recordAdminAuditLog(prisma, req, {
        action: 'gallery.item.update',
        resourceType: 'gallery_item',
        resourceId: item.id,
        beforeJson: pickGalleryAuditFields(before),
        afterJson: pickGalleryAuditFields(item),
      });
      res.json({ item: mapGalleryItem(item) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/gallery/items/:id/approve', requireCapability(prisma, 'admin.moderate_gallery'), async (req, res, next) => {
    try {
      const result = await updateGalleryStatus(prisma, req.params.id, 'published');
      if (!result) return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
      await recordAdminAuditLog(prisma, req, {
        action: 'gallery.item.approve',
        resourceType: 'gallery_item',
        resourceId: result.item.id,
        beforeJson: pickGalleryAuditFields(result.before),
        afterJson: pickGalleryAuditFields(result.item),
      });
      res.json({ item: mapGalleryItem(result.item) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/gallery/items/:id/reject', requireCapability(prisma, 'admin.moderate_gallery'), async (req, res, next) => {
    try {
      const result = await updateGalleryStatus(prisma, req.params.id, 'rejected');
      if (!result) return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
      await recordAdminAuditLog(prisma, req, {
        action: 'gallery.item.reject',
        resourceType: 'gallery_item',
        resourceId: result.item.id,
        beforeJson: pickGalleryAuditFields(result.before),
        afterJson: pickGalleryAuditFields(result.item),
      });
      res.json({ item: mapGalleryItem(result.item) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/gallery/items/:id/offline', requireCapability(prisma, 'admin.moderate_gallery'), async (req, res, next) => {
    try {
      const result = await updateGalleryStatus(prisma, req.params.id, 'offline');
      if (!result) return res.status(404).json({ message: 'Gallery item not found', requestId: req.id });
      await recordAdminAuditLog(prisma, req, {
        action: 'gallery.item.offline',
        resourceType: 'gallery_item',
        resourceId: result.item.id,
        beforeJson: pickGalleryAuditFields(result.before),
        afterJson: pickGalleryAuditFields(result.item),
      });
      res.json({ item: mapGalleryItem(result.item) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', requireCapability(prisma, 'admin.manage_users'), async (req, res, next) => {
    try {
      const { page, pageSize } = normalizePageQuery(req.query);
      const where = getUserWhere(req.query);
      const [users, total, statusRows] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            subscriptions: {
              orderBy: [{ updatedAt: 'desc' }],
              take: 1,
            },
            galleryAuthors: {
              include: {
                _count: { select: { items: true } },
              },
            },
            _count: {
              select: {
                projects: true,
                galleryFavorites: true,
                usageEvents: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count({ where }),
        prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);

      res.json({
        users: users.map(mapUser),
        total,
        page,
        pageSize,
        statusCounts: mapUserStatusCounts(statusRows),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id', requireCapability(prisma, 'admin.manage_users'), express.json({ limit: '64kb', strict: true }), async (req, res, next) => {
    try {
      if (!normalizeSafeLookupId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid user id', requestId: req.id });
      }

      const normalized = normalizeUserPatch(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid user payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      if (req.params.id === req.user.id) {
        if (normalized.userData.status && normalized.userData.status !== 'active') {
          return res.status(400).json({ message: 'You cannot disable your own admin account', requestId: req.id });
        }
        if (normalized.userData.role && normalized.userData.role !== 'admin') {
          return res.status(400).json({ message: 'You cannot remove your own admin role', requestId: req.id });
        }
      }

      const before = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          subscriptions: {
            orderBy: [{ updatedAt: 'desc' }],
            take: 1,
          },
          galleryAuthors: {
            include: {
              _count: { select: { items: true } },
            },
          },
          _count: {
            select: {
              projects: true,
              galleryFavorites: true,
              usageEvents: true,
            },
          },
        },
      });
      if (!before) return res.status(404).json({ message: 'User not found', requestId: req.id });

      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: req.params.id },
          data: normalized.userData,
        }).catch((error) => {
          if (error?.code === 'P2025') return null;
          throw error;
        });
        if (!updated) return null;
        await syncManualSubscription(tx, updated.id, normalized.subscriptionData);
        return tx.user.findUnique({
          where: { id: updated.id },
          include: {
            subscriptions: {
              orderBy: [{ updatedAt: 'desc' }],
              take: 1,
            },
            galleryAuthors: {
              include: {
                _count: { select: { items: true } },
              },
            },
            _count: {
              select: {
                projects: true,
                galleryFavorites: true,
                usageEvents: true,
              },
            },
          },
        });
      });

      if (!user) return res.status(404).json({ message: 'User not found', requestId: req.id });
      await recordAdminAuditLog(prisma, req, {
        action: 'user.update',
        resourceType: 'user',
        resourceId: user.id,
        beforeJson: pickUserAuditFields(before),
        afterJson: pickUserAuditFields(user),
      });
      res.json({ user: mapUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
