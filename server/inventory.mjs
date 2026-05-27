import express from 'express';
import { requireAuth } from './auth.mjs';
import { getNumericLimit, requireCapability, sendPlanLimitExceeded } from './entitlements.mjs';

const brandKeys = new Set(['MARD', 'COCO', 'MANMAN', 'PANPAN', 'MIXIAOWO']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addValidationError(errors, message) {
  if (errors.length < 20) errors.push(message);
}

function normalizeBrandKey(value, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, 'brandKey is required');
    return undefined;
  }
  if (typeof value !== 'string' || !brandKeys.has(value)) {
    addValidationError(errors, 'brandKey is invalid');
    return undefined;
  }
  return value;
}

function normalizeCode(value, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, 'code is required');
    return undefined;
  }
  if (typeof value !== 'string') {
    addValidationError(errors, 'code must be a string');
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) addValidationError(errors, 'code is required');
  if (normalized.length > 40) addValidationError(errors, 'code is too long');
  return normalized.slice(0, 40);
}

function normalizeHex(value, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, 'hex is required');
    return undefined;
  }
  if (typeof value !== 'string') {
    addValidationError(errors, 'hex must be a string');
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    addValidationError(errors, 'hex must be a #RRGGBB color');
    return undefined;
  }
  return normalized;
}

function normalizeInteger(value, field, min, max, errors, { required = true } = {}) {
  if (value === undefined) {
    if (required) addValidationError(errors, `${field} is required`);
    return undefined;
  }
  if (value === null || value === '') {
    if (required) addValidationError(errors, `${field} is required`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    addValidationError(errors, `${field} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return parsed;
}

function normalizeOptionalText(value, field, maxLength, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) addValidationError(errors, `${field} is too long`);
  return normalized.slice(0, maxLength);
}

function normalizeBoolean(value, field, errors) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    addValidationError(errors, `${field} must be a boolean`);
    return undefined;
  }
  return value;
}

function normalizeDate(value, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    addValidationError(errors, 'updatedAt must be an ISO date string');
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    addValidationError(errors, 'updatedAt must be an ISO date string');
    return undefined;
  }
  return date;
}

function normalizeInventoryInput(input, { partial = false } = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }

  const data = {};
  const required = !partial;
  const brandKey = normalizeBrandKey(input.brandKey, errors, { required });
  const code = normalizeCode(input.code, errors, { required });
  const hex = normalizeHex(input.hex, errors, { required });
  const quantity = normalizeInteger(input.quantity, 'quantity', 0, 10_000_000, errors, { required });
  const lowStockThreshold = normalizeInteger(input.lowStockThreshold, 'lowStockThreshold', 0, 10_000_000, errors, { required: false });
  const location = normalizeOptionalText(input.location, 'location', 80, errors);
  const note = normalizeOptionalText(input.note, 'note', 500, errors);
  const favorite = normalizeBoolean(input.favorite, 'favorite', errors);
  const updatedAt = normalizeDate(input.updatedAt, errors);

  if (brandKey !== undefined) data.brandKey = brandKey;
  if (code !== undefined) data.code = code;
  if (hex !== undefined) data.hex = hex;
  if (quantity !== undefined) data.quantity = quantity;
  if (lowStockThreshold !== undefined) data.lowStockThreshold = lowStockThreshold;
  if (location !== undefined) data.location = location;
  if (note !== undefined) data.note = note;
  if (favorite !== undefined) data.favorite = favorite;
  if (updatedAt !== undefined) data.updatedAt = updatedAt;

  return errors.length ? { ok: false, errors } : { ok: true, data };
}

function isSafeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
}

function mapInventoryItem(item) {
  return {
    id: item.id,
    brandKey: item.brandKey,
    code: item.code,
    hex: item.hex,
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold,
    location: item.location,
    favorite: item.favorite,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function upsertInventoryItem(prisma, userId, data) {
  const existing = await prisma.beadInventoryItem.findUnique({
    where: {
      userId_brandKey_code: {
        userId,
        brandKey: data.brandKey,
        code: data.code,
      },
    },
  });

  const item = await prisma.beadInventoryItem.upsert({
    where: {
      userId_brandKey_code: {
        userId,
        brandKey: data.brandKey,
        code: data.code,
      },
    },
    update: data,
    create: {
      userId,
      ...data,
    },
  });

  return { item, created: !existing };
}

async function canCreateInventoryItemWithinPlan(prisma, req, res, data) {
  const limit = getNumericLimit(req.entitlements, 'cloudInventoryItems');
  if (limit === null) return true;

  const existing = await prisma.beadInventoryItem.findUnique({
    where: {
      userId_brandKey_code: {
        userId: req.user.id,
        brandKey: data.brandKey,
        code: data.code,
      },
    },
    select: { id: true },
  });
  if (existing) return true;

  const current = await prisma.beadInventoryItem.count({ where: { userId: req.user.id } });
  if (current >= limit) {
    sendPlanLimitExceeded(res, req, {
      capability: 'inventory.cloud_sync',
      current,
      limit,
    });
    return false;
  }

  return true;
}

async function ensureInventorySyncWithinPlan(prisma, req, normalizedItems, res) {
  const limit = getNumericLimit(req.entitlements, 'cloudInventoryItems');
  if (limit === null) return true;

  const keys = Array.from(new Set(normalizedItems.map((item) => `${item.brandKey}:${item.code}`)));
  const existing = await prisma.beadInventoryItem.findMany({
    where: { userId: req.user.id },
    select: { brandKey: true, code: true },
  });
  const existingKeys = new Set(existing.map((item) => `${item.brandKey}:${item.code}`));
  const newItemCount = keys.filter((key) => !existingKeys.has(key)).length;
  const current = existing.length;

  if (current + newItemCount > limit) {
    sendPlanLimitExceeded(res, req, {
      capability: 'inventory.cloud_sync',
      current,
      limit,
    });
    return false;
  }

  return true;
}

export function createInventoryRouter(prisma) {
  const router = express.Router();

  router.use(requireAuth(prisma));
  router.use(requireCapability(prisma, 'inventory.cloud_sync'));
  router.use(express.json({ limit: '512kb', strict: true }));

  router.get('/', async (req, res, next) => {
    try {
      const items = await prisma.beadInventoryItem.findMany({
        where: { userId: req.user.id },
        orderBy: [{ favorite: 'desc' }, { brandKey: 'asc' }, { code: 'asc' }],
      });
      res.json({ items: items.map(mapInventoryItem) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const normalized = normalizeInventoryInput(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid inventory payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      if (!(await canCreateInventoryItemWithinPlan(prisma, req, res, normalized.data))) return;

      const { item, created } = await upsertInventoryItem(prisma, req.user.id, normalized.data);
      res.status(created ? 201 : 200).json({ item: mapInventoryItem(item) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      if (!isSafeId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid inventory item id', requestId: req.id });
      }

      const existing = await prisma.beadInventoryItem.findFirst({
        where: { id: req.params.id, userId: req.user.id },
      });
      if (!existing) {
        return res.status(404).json({ message: 'Inventory item not found', requestId: req.id });
      }

      const normalized = normalizeInventoryInput(req.body, { partial: true });
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid inventory payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const nextData = {
        brandKey: normalized.data.brandKey ?? existing.brandKey,
        code: normalized.data.code ?? existing.code,
        hex: normalized.data.hex ?? existing.hex,
        quantity: normalized.data.quantity ?? existing.quantity,
        lowStockThreshold: Object.hasOwn(normalized.data, 'lowStockThreshold') ? normalized.data.lowStockThreshold : existing.lowStockThreshold,
        location: Object.hasOwn(normalized.data, 'location') ? normalized.data.location : existing.location,
        note: Object.hasOwn(normalized.data, 'note') ? normalized.data.note : existing.note,
        favorite: normalized.data.favorite ?? existing.favorite,
      };

      const item = await prisma.$transaction(async (tx) => {
        const conflict = await tx.beadInventoryItem.findUnique({
          where: {
            userId_brandKey_code: {
              userId: req.user.id,
              brandKey: nextData.brandKey,
              code: nextData.code,
            },
          },
        });

        if (conflict && conflict.id !== existing.id) {
          const merged = await tx.beadInventoryItem.update({
            where: { id: conflict.id },
            data: nextData,
          });
          await tx.beadInventoryItem.delete({ where: { id: existing.id } });
          return merged;
        }

        return tx.beadInventoryItem.update({
          where: { id: existing.id },
          data: nextData,
        });
      });

      res.json({ item: mapInventoryItem(item) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      if (!isSafeId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid inventory item id', requestId: req.id });
      }

      const existing = await prisma.beadInventoryItem.findFirst({
        where: { id: req.params.id, userId: req.user.id },
      });
      if (!existing) {
        return res.status(404).json({ message: 'Inventory item not found', requestId: req.id });
      }

      await prisma.beadInventoryItem.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sync', async (req, res, next) => {
    try {
      const inputItems = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!inputItems) {
        return res.status(400).json({ message: 'items must be an array', requestId: req.id });
      }
      if (inputItems.length > 1000) {
        return res.status(400).json({ message: 'items cannot contain more than 1000 records', requestId: req.id });
      }

      const normalizedItems = [];
      const errors = [];
      inputItems.forEach((input, index) => {
        const normalized = normalizeInventoryInput(input);
        if (!normalized.ok) {
          normalized.errors.forEach((message) => addValidationError(errors, `items[${index}]: ${message}`));
          return;
        }
        normalizedItems.push(normalized.data);
      });

      if (errors.length) {
        return res.status(400).json({
          message: 'Invalid inventory sync payload',
          errors,
          requestId: req.id,
        });
      }

      if (!(await ensureInventorySyncWithinPlan(prisma, req, normalizedItems, res))) return;

      const stats = { created: 0, updated: 0, skipped: 0 };
      await prisma.$transaction(async (tx) => {
        for (const data of normalizedItems) {
          const incomingUpdatedAt = data.updatedAt ?? new Date();
          const existing = await tx.beadInventoryItem.findUnique({
            where: {
              userId_brandKey_code: {
                userId: req.user.id,
                brandKey: data.brandKey,
                code: data.code,
              },
            },
          });

          if (!existing) {
            await tx.beadInventoryItem.create({
              data: {
                userId: req.user.id,
                ...data,
                updatedAt: incomingUpdatedAt,
              },
            });
            stats.created += 1;
            continue;
          }

          if (existing.updatedAt > incomingUpdatedAt) {
            stats.skipped += 1;
            continue;
          }

          await tx.beadInventoryItem.update({
            where: { id: existing.id },
            data: {
              ...data,
              updatedAt: incomingUpdatedAt,
            },
          });
          stats.updated += 1;
        }
      });

      const items = await prisma.beadInventoryItem.findMany({
        where: { userId: req.user.id },
        orderBy: [{ favorite: 'desc' }, { brandKey: 'asc' }, { code: 'asc' }],
      });

      res.json({ items: items.map(mapInventoryItem), stats });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
