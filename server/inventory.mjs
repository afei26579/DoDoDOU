import express from 'express';
import { requireAuth } from './auth.mjs';
import { getNumericLimit, requireCapability, sendPlanLimitExceeded } from './entitlements.mjs';

const brandKeys = new Set(['MARD', 'COCO', 'MANMAN', 'PANPAN', 'MIXIAOWO']);
const inventoryModes = new Set(['palette', 'custom']);
const paletteSourceTypes = new Set(['official', 'custom']);
const DEFAULT_INVENTORY_NAME = '我的库存';

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

function normalizeDate(value, field, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be an ISO date string`);
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    addValidationError(errors, `${field} must be an ISO date string`);
    return undefined;
  }
  return date;
}

function isSafeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
}

function normalizeSafeId(value, field, errors, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, `${field} is required`);
    return undefined;
  }
  if (!isSafeId(value)) {
    addValidationError(errors, `${field} is invalid`);
    return undefined;
  }
  return value;
}

function normalizeMode(value, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, 'mode is required');
    return undefined;
  }
  if (typeof value !== 'string' || !inventoryModes.has(value)) {
    addValidationError(errors, 'mode is invalid');
    return undefined;
  }
  return value;
}

function normalizePaletteSourceType(value, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !paletteSourceTypes.has(value)) {
    addValidationError(errors, 'sourcePaletteType is invalid');
    return undefined;
  }
  return value;
}

function normalizeInventorySetInput(input, { partial = false, allowId = false } = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }

  const data = {};
  const required = !partial;
  const id = allowId ? normalizeSafeId(input.id, 'id', errors, { required: false }) : undefined;
  const name = normalizeOptionalText(input.name, 'name', 80, errors);
  const mode = normalizeMode(input.mode, errors, { required });
  const baseBrand = normalizeBrandKey(input.baseBrand, errors, { required });
  const sourcePaletteId = normalizeOptionalText(input.sourcePaletteId, 'sourcePaletteId', 120, errors);
  const sourcePaletteName = normalizeOptionalText(input.sourcePaletteName, 'sourcePaletteName', 120, errors);
  const sourcePaletteType = normalizePaletteSourceType(input.sourcePaletteType, errors);
  const colorCount = normalizeInteger(input.colorCount, 'colorCount', 0, 10000, errors, { required: false });
  const createdAt = normalizeDate(input.createdAt, 'createdAt', errors);
  const updatedAt = normalizeDate(input.updatedAt, 'updatedAt', errors);

  if (id !== undefined) data.id = id;
  if (name !== undefined) data.name = name || DEFAULT_INVENTORY_NAME;
  if (mode !== undefined) data.mode = mode;
  if (baseBrand !== undefined) data.baseBrand = baseBrand;
  if (sourcePaletteId !== undefined) data.sourcePaletteId = sourcePaletteId;
  if (sourcePaletteName !== undefined) data.sourcePaletteName = sourcePaletteName;
  if (sourcePaletteType !== undefined) data.sourcePaletteType = sourcePaletteType;
  if (colorCount !== undefined && colorCount !== null) data.colorCount = colorCount;
  if (createdAt !== undefined) data.createdAt = createdAt;
  if (updatedAt !== undefined) data.updatedAt = updatedAt;

  return errors.length ? { ok: false, errors } : { ok: true, data };
}

function normalizeInventoryInput(input, { partial = false } = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }

  const data = {};
  const required = !partial;
  const inventoryId = normalizeSafeId(input.inventoryId, 'inventoryId', errors, { required: false });
  const brandKey = normalizeBrandKey(input.brandKey, errors, { required });
  const code = normalizeCode(input.code, errors, { required });
  const hex = normalizeHex(input.hex, errors, { required });
  const quantity = normalizeInteger(input.quantity, 'quantity', 0, 10_000_000, errors, { required });
  const lowStockThreshold = normalizeInteger(input.lowStockThreshold, 'lowStockThreshold', 0, 10_000_000, errors, { required: false });
  const location = normalizeOptionalText(input.location, 'location', 80, errors);
  const note = normalizeOptionalText(input.note, 'note', 500, errors);
  const favorite = normalizeBoolean(input.favorite, 'favorite', errors);
  const updatedAt = normalizeDate(input.updatedAt, 'updatedAt', errors);

  if (inventoryId !== undefined) data.inventoryId = inventoryId;
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

function mapInventory(inventory) {
  return {
    id: inventory.id,
    name: inventory.name,
    mode: inventory.mode,
    baseBrand: inventory.baseBrand,
    sourcePaletteId: inventory.sourcePaletteId,
    sourcePaletteName: inventory.sourcePaletteName,
    sourcePaletteType: inventory.sourcePaletteType,
    colorCount: inventory.colorCount,
    createdAt: inventory.createdAt.toISOString(),
    updatedAt: inventory.updatedAt.toISOString(),
  };
}

function mapInventoryItem(item) {
  return {
    id: item.id,
    inventoryId: item.inventoryId,
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

async function ensureDefaultInventory(prisma, userId) {
  const existing = await prisma.beadInventory.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  return prisma.beadInventory.create({
    data: {
      userId,
      name: DEFAULT_INVENTORY_NAME,
      mode: 'custom',
      baseBrand: 'MARD',
      colorCount: 0,
    },
  });
}

async function findUserInventory(prisma, userId, inventoryId) {
  if (!isSafeId(inventoryId)) return null;
  return prisma.beadInventory.findFirst({
    where: { id: inventoryId, userId },
  });
}

async function requireUserInventory(prisma, req, res, inventoryId) {
  const inventory = await findUserInventory(prisma, req.user.id, inventoryId);
  if (!inventory) {
    res.status(404).json({ message: 'Inventory set not found', requestId: req.id });
    return null;
  }
  return inventory;
}

async function updateInventoryColorCount(prisma, inventoryId) {
  const colorCount = await prisma.beadInventoryItem.count({ where: { inventoryId } });
  return prisma.beadInventory.update({
    where: { id: inventoryId },
    data: { colorCount },
  });
}

async function resolveInventoryId(prisma, userId, data) {
  if (data.inventoryId) {
    const inventory = await findUserInventory(prisma, userId, data.inventoryId);
    if (!inventory) {
      const error = new Error('Inventory set not found');
      error.status = 404;
      throw error;
    }
    return inventory.id;
  }

  return (await ensureDefaultInventory(prisma, userId)).id;
}

async function upsertInventoryItem(prisma, userId, inventoryId, data) {
  const itemData = {
    brandKey: data.brandKey,
    code: data.code,
    hex: data.hex,
    quantity: data.quantity,
    lowStockThreshold: Object.hasOwn(data, 'lowStockThreshold') ? data.lowStockThreshold : undefined,
    location: Object.hasOwn(data, 'location') ? data.location : undefined,
    note: Object.hasOwn(data, 'note') ? data.note : undefined,
    favorite: data.favorite ?? false,
  };

  const existing = await prisma.beadInventoryItem.findUnique({
    where: {
      inventoryId_brandKey_code: {
        inventoryId,
        brandKey: data.brandKey,
        code: data.code,
      },
    },
  });

  const writeData = Object.fromEntries(
    Object.entries(itemData).filter(([, value]) => value !== undefined),
  );
  if (data.updatedAt) writeData.updatedAt = data.updatedAt;

  const item = await prisma.beadInventoryItem.upsert({
    where: {
      inventoryId_brandKey_code: {
        inventoryId,
        brandKey: data.brandKey,
        code: data.code,
      },
    },
    update: writeData,
    create: {
      userId,
      inventoryId,
      ...writeData,
    },
  });

  await updateInventoryColorCount(prisma, inventoryId);
  return { item, created: !existing };
}

async function canCreateInventoryItemWithinPlan(prisma, req, res, inventoryId, data) {
  const limit = getNumericLimit(req.entitlements, 'cloudInventoryItems');
  if (limit === null) return true;

  const existing = await prisma.beadInventoryItem.findUnique({
    where: {
      inventoryId_brandKey_code: {
        inventoryId,
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

  const keys = Array.from(new Set(normalizedItems.map((item) => `${item.inventoryId}:${item.brandKey}:${item.code}`)));
  const existing = await prisma.beadInventoryItem.findMany({
    where: { userId: req.user.id },
    select: { inventoryId: true, brandKey: true, code: true },
  });
  const existingKeys = new Set(existing.map((item) => `${item.inventoryId}:${item.brandKey}:${item.code}`));
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

function getSyncedInventoryId(userId, localId) {
  const normalized = String(localId || 'inventory-default')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 54);
  return `sync-${userId}-${normalized}`.slice(0, 96);
}

async function readInventoryPayload(prisma, userId) {
  const inventories = await prisma.beadInventory.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'asc' }],
  });
  const items = await prisma.beadInventoryItem.findMany({
    where: { userId },
    orderBy: [{ favorite: 'desc' }, { brandKey: 'asc' }, { code: 'asc' }],
  });

  return {
    inventories: inventories.map(mapInventory),
    items: items.map(mapInventoryItem),
  };
}

export function createInventoryRouter(prisma) {
  const router = express.Router();

  router.use(requireAuth(prisma));
  router.use(requireCapability(prisma, 'inventory.cloud_sync'));
  router.use(express.json({ limit: '768kb', strict: true }));

  router.get('/', async (req, res, next) => {
    try {
      await ensureDefaultInventory(prisma, req.user.id);
      res.json(await readInventoryPayload(prisma, req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/sets', async (req, res, next) => {
    try {
      await ensureDefaultInventory(prisma, req.user.id);
      const inventories = await prisma.beadInventory.findMany({
        where: { userId: req.user.id },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'asc' }],
      });
      res.json({ inventories: inventories.map(mapInventory) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sets', async (req, res, next) => {
    try {
      const normalized = normalizeInventorySetInput(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid inventory set payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const inventory = await prisma.beadInventory.create({
        data: {
          userId: req.user.id,
          name: normalized.data.name ?? DEFAULT_INVENTORY_NAME,
          mode: normalized.data.mode ?? 'custom',
          baseBrand: normalized.data.baseBrand ?? 'MARD',
          sourcePaletteId: normalized.data.sourcePaletteId ?? null,
          sourcePaletteName: normalized.data.sourcePaletteName ?? null,
          sourcePaletteType: normalized.data.sourcePaletteType ?? null,
          colorCount: normalized.data.colorCount ?? 0,
        },
      });
      res.status(201).json({ inventory: mapInventory(inventory) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/sets/:inventoryId', async (req, res, next) => {
    try {
      if (!isSafeId(req.params.inventoryId)) {
        return res.status(400).json({ message: 'Invalid inventory set id', requestId: req.id });
      }

      const existing = await requireUserInventory(prisma, req, res, req.params.inventoryId);
      if (!existing) return;

      const normalized = normalizeInventorySetInput(req.body, { partial: true });
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid inventory set payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const inventory = await prisma.beadInventory.update({
        where: { id: existing.id },
        data: {
          name: normalized.data.name ?? existing.name,
          mode: normalized.data.mode ?? existing.mode,
          baseBrand: normalized.data.baseBrand ?? existing.baseBrand,
          sourcePaletteId: Object.hasOwn(normalized.data, 'sourcePaletteId') ? normalized.data.sourcePaletteId : existing.sourcePaletteId,
          sourcePaletteName: Object.hasOwn(normalized.data, 'sourcePaletteName') ? normalized.data.sourcePaletteName : existing.sourcePaletteName,
          sourcePaletteType: Object.hasOwn(normalized.data, 'sourcePaletteType') ? normalized.data.sourcePaletteType : existing.sourcePaletteType,
          colorCount: normalized.data.colorCount ?? existing.colorCount,
        },
      });
      res.json({ inventory: mapInventory(inventory) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/sets/:inventoryId', async (req, res, next) => {
    try {
      if (!isSafeId(req.params.inventoryId)) {
        return res.status(400).json({ message: 'Invalid inventory set id', requestId: req.id });
      }

      const existing = await requireUserInventory(prisma, req, res, req.params.inventoryId);
      if (!existing) return;

      await prisma.beadInventory.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sets/:inventoryId/items', async (req, res, next) => {
    try {
      const inventory = await requireUserInventory(prisma, req, res, req.params.inventoryId);
      if (!inventory) return;

      const items = await prisma.beadInventoryItem.findMany({
        where: { userId: req.user.id, inventoryId: inventory.id },
        orderBy: [{ favorite: 'desc' }, { brandKey: 'asc' }, { code: 'asc' }],
      });
      res.json({ items: items.map(mapInventoryItem) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sets/:inventoryId/items/bulk', async (req, res, next) => {
    try {
      const inventory = await requireUserInventory(prisma, req, res, req.params.inventoryId);
      if (!inventory) return;

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
        normalizedItems.push({ ...normalized.data, inventoryId: inventory.id });
      });

      if (errors.length) {
        return res.status(400).json({
          message: 'Invalid inventory bulk payload',
          errors,
          requestId: req.id,
        });
      }

      if (!(await ensureInventorySyncWithinPlan(prisma, req, normalizedItems, res))) return;

      await prisma.$transaction(async (tx) => {
        for (const data of normalizedItems) {
          await upsertInventoryItem(tx, req.user.id, inventory.id, data);
        }
      });

      const items = await prisma.beadInventoryItem.findMany({
        where: { userId: req.user.id, inventoryId: inventory.id },
        orderBy: [{ favorite: 'desc' }, { brandKey: 'asc' }, { code: 'asc' }],
      });
      res.json({ items: items.map(mapInventoryItem) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sets/:inventoryId/items', async (req, res, next) => {
    try {
      const inventory = await requireUserInventory(prisma, req, res, req.params.inventoryId);
      if (!inventory) return;

      const normalized = normalizeInventoryInput(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid inventory payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      if (!(await canCreateInventoryItemWithinPlan(prisma, req, res, inventory.id, normalized.data))) return;

      const { item, created } = await upsertInventoryItem(prisma, req.user.id, inventory.id, normalized.data);
      res.status(created ? 201 : 200).json({ item: mapInventoryItem(item) });
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

      const inventoryId = await resolveInventoryId(prisma, req.user.id, normalized.data);
      if (!(await canCreateInventoryItemWithinPlan(prisma, req, res, inventoryId, normalized.data))) return;

      const { item, created } = await upsertInventoryItem(prisma, req.user.id, inventoryId, normalized.data);
      res.status(created ? 201 : 200).json({ item: mapInventoryItem(item) });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message, requestId: req.id });
      next(error);
    }
  });

  router.patch('/items/:id', async (req, res, next) => {
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

      const inventoryId = normalized.data.inventoryId ?? existing.inventoryId;
      if (inventoryId !== existing.inventoryId) {
        const inventory = await requireUserInventory(prisma, req, res, inventoryId);
        if (!inventory) return;
      }

      const nextData = {
        inventoryId,
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
            inventoryId_brandKey_code: {
              inventoryId: nextData.inventoryId,
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
          await updateInventoryColorCount(tx, existing.inventoryId);
          await updateInventoryColorCount(tx, nextData.inventoryId);
          return merged;
        }

        const updated = await tx.beadInventoryItem.update({
          where: { id: existing.id },
          data: nextData,
        });
        if (existing.inventoryId !== nextData.inventoryId) {
          await updateInventoryColorCount(tx, existing.inventoryId);
          await updateInventoryColorCount(tx, nextData.inventoryId);
        }
        return updated;
      });

      res.json({ item: mapInventoryItem(item) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/items/:id', async (req, res, next) => {
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
      await updateInventoryColorCount(prisma, existing.inventoryId);
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

      const inputInventories = Array.isArray(req.body?.inventories) ? req.body.inventories : [];
      const normalizedInventories = [];
      const errors = [];
      inputInventories.forEach((input, index) => {
        const normalized = normalizeInventorySetInput(input, { partial: true, allowId: true });
        if (!normalized.ok) {
          normalized.errors.forEach((message) => addValidationError(errors, `inventories[${index}]: ${message}`));
          return;
        }
        normalizedInventories.push(normalized.data);
      });

      const defaultInventory = await ensureDefaultInventory(prisma, req.user.id);
      const inventoryIdMap = new Map();
      normalizedInventories.forEach((inventory) => {
        if (!inventory.id) return;
        inventoryIdMap.set(inventory.id, getSyncedInventoryId(req.user.id, inventory.id));
      });

      const normalizedItems = [];
      inputItems.forEach((input, index) => {
        const normalized = normalizeInventoryInput(input);
        if (!normalized.ok) {
          normalized.errors.forEach((message) => addValidationError(errors, `items[${index}]: ${message}`));
          return;
        }

        const inventoryId = normalized.data.inventoryId
          ? inventoryIdMap.get(normalized.data.inventoryId) ?? defaultInventory.id
          : defaultInventory.id;

        normalizedItems.push({
          ...normalized.data,
          inventoryId,
        });
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
        for (const inventory of normalizedInventories) {
          if (!inventory.id) continue;
          const remoteId = inventoryIdMap.get(inventory.id);
          await tx.beadInventory.upsert({
            where: { id: remoteId },
            update: {
              name: inventory.name ?? DEFAULT_INVENTORY_NAME,
              mode: inventory.mode ?? 'custom',
              baseBrand: inventory.baseBrand ?? 'MARD',
              sourcePaletteId: inventory.sourcePaletteId ?? null,
              sourcePaletteName: inventory.sourcePaletteName ?? null,
              sourcePaletteType: inventory.sourcePaletteType ?? null,
              colorCount: inventory.colorCount ?? 0,
              updatedAt: inventory.updatedAt ?? new Date(),
            },
            create: {
              id: remoteId,
              userId: req.user.id,
              name: inventory.name ?? DEFAULT_INVENTORY_NAME,
              mode: inventory.mode ?? 'custom',
              baseBrand: inventory.baseBrand ?? 'MARD',
              sourcePaletteId: inventory.sourcePaletteId ?? null,
              sourcePaletteName: inventory.sourcePaletteName ?? null,
              sourcePaletteType: inventory.sourcePaletteType ?? null,
              colorCount: inventory.colorCount ?? 0,
              createdAt: inventory.createdAt ?? new Date(),
              updatedAt: inventory.updatedAt ?? new Date(),
            },
          });
        }

        for (const data of normalizedItems) {
          const incomingUpdatedAt = data.updatedAt ?? new Date();
          const existing = await tx.beadInventoryItem.findUnique({
            where: {
              inventoryId_brandKey_code: {
                inventoryId: data.inventoryId,
                brandKey: data.brandKey,
                code: data.code,
              },
            },
          });

          if (!existing) {
            await tx.beadInventoryItem.create({
              data: {
                userId: req.user.id,
                inventoryId: data.inventoryId,
                brandKey: data.brandKey,
                code: data.code,
                hex: data.hex,
                quantity: data.quantity,
                lowStockThreshold: data.lowStockThreshold ?? null,
                location: data.location ?? null,
                favorite: data.favorite ?? false,
                note: data.note ?? null,
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
              brandKey: data.brandKey,
              code: data.code,
              hex: data.hex,
              quantity: data.quantity,
              lowStockThreshold: data.lowStockThreshold ?? null,
              location: data.location ?? null,
              favorite: data.favorite ?? false,
              note: data.note ?? null,
              updatedAt: incomingUpdatedAt,
            },
          });
          stats.updated += 1;
        }

        const touchedInventoryIds = Array.from(new Set(normalizedItems.map((item) => item.inventoryId)));
        for (const inventoryId of touchedInventoryIds) {
          await updateInventoryColorCount(tx, inventoryId);
        }
      });

      res.json({ ...(await readInventoryPayload(prisma, req.user.id)), stats });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
