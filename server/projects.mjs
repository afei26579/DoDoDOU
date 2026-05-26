import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from './auth.mjs';

const projectStatuses = new Set(['editing', 'ready', 'paused', 'completed', 'archived']);
const maxDataUrlChars = Number.parseInt(process.env.PROJECTS_MAX_DATA_URL_CHARS || '2500000', 10);
const jsonBodyLimit = process.env.PROJECTS_JSON_BODY_LIMIT || '15mb';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addValidationError(errors, message) {
  if (errors.length < 20) errors.push(message);
}

function normalizeRequiredText(value, field, maxLength, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, `${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    addValidationError(errors, `${field} must be a string`);
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) addValidationError(errors, `${field} is required`);
  if (normalized.length > maxLength) addValidationError(errors, `${field} is too long`);
  return normalized.slice(0, maxLength);
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

function normalizeProjectLookupId(value) {
  return typeof value === 'string' && /^[\w\u4e00-\u9fa5:.-]{1,180}$/u.test(value);
}

function normalizeStatus(value, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) addValidationError(errors, 'status is required');
    return undefined;
  }
  if (typeof value !== 'string' || !projectStatuses.has(value)) {
    addValidationError(errors, 'status is invalid');
    return undefined;
  }
  return value;
}

function normalizeOptionalInteger(value, field, min, max, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    addValidationError(errors, `${field} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return parsed;
}

function normalizeDate(value, field, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
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

function normalizePayloadJson(value, errors, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) addValidationError(errors, 'payloadJson is required');
    return undefined;
  }
  if (!isPlainObject(value)) {
    addValidationError(errors, 'payloadJson must be an object');
    return undefined;
  }
  return value;
}

function normalizeProjectInput(input, { partial = false } = {}) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }

  const required = !partial;
  const data = {};
  const clientProjectId = normalizeRequiredText(input.clientProjectId, 'clientProjectId', 180, errors, { required });
  const title = normalizeRequiredText(input.title, 'title', 80, errors, { required });
  const status = normalizeStatus(input.status, errors, { required: false });
  const sourceType = normalizeRequiredText(input.sourceType, 'sourceType', 40, errors, { required });
  const sourceItemId = normalizeOptionalText(input.sourceItemId, 'sourceItemId', 180, errors);
  const coverUrl = normalizeOptionalText(input.coverUrl, 'coverUrl', maxDataUrlChars, errors);
  const previewUrl = normalizeOptionalText(input.previewUrl, 'previewUrl', maxDataUrlChars, errors);
  const width = normalizeOptionalInteger(input.width, 'width', 1, 10000, errors);
  const height = normalizeOptionalInteger(input.height, 'height', 1, 10000, errors);
  const beadCount = normalizeOptionalInteger(input.beadCount, 'beadCount', 0, 10_000_000, errors);
  const paletteCount = normalizeOptionalInteger(input.paletteCount, 'paletteCount', 0, 10_000, errors);
  const payloadJson = normalizePayloadJson(input.payloadJson, errors, { required });
  const lastOpenedAt = normalizeDate(input.lastOpenedAt, 'lastOpenedAt', errors);
  const createdAt = normalizeDate(input.createdAt, 'createdAt', errors);
  const updatedAt = normalizeDate(input.updatedAt, 'updatedAt', errors);

  if (clientProjectId !== undefined) {
    if (!normalizeProjectLookupId(clientProjectId)) addValidationError(errors, 'clientProjectId contains unsupported characters');
    data.clientProjectId = clientProjectId;
  }
  if (title !== undefined) data.title = title;
  if (status !== undefined) data.status = status;
  if (sourceType !== undefined) data.sourceType = sourceType;
  if (sourceItemId !== undefined) data.sourceItemId = sourceItemId;
  if (coverUrl !== undefined) data.coverUrl = coverUrl;
  if (previewUrl !== undefined) data.previewUrl = previewUrl;
  if (width !== undefined) data.width = width;
  if (height !== undefined) data.height = height;
  if (beadCount !== undefined) data.beadCount = beadCount;
  if (paletteCount !== undefined) data.paletteCount = paletteCount;
  if (payloadJson !== undefined) data.payloadJson = payloadJson;
  if (lastOpenedAt !== undefined) data.lastOpenedAt = lastOpenedAt;
  if (createdAt !== undefined) data.createdAt = createdAt;
  if (updatedAt !== undefined) data.updatedAt = updatedAt;

  return errors.length ? { ok: false, errors } : { ok: true, data };
}

function mapProject(project) {
  return {
    id: project.id,
    clientProjectId: project.clientProjectId,
    title: project.title,
    status: project.status,
    sourceType: project.sourceType,
    sourceItemId: project.sourceItemId,
    coverUrl: project.coverUrl,
    previewUrl: project.previewUrl,
    width: project.width,
    height: project.height,
    beadCount: project.beadCount,
    paletteCount: project.paletteCount,
    payloadJson: project.payloadJson,
    lastOpenedAt: project.lastOpenedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

async function findProjectByLookup(prisma, userId, lookupId) {
  if (!normalizeProjectLookupId(lookupId)) return null;
  return prisma.workshopProject.findFirst({
    where: {
      userId,
      OR: [
        { id: lookupId },
        { clientProjectId: lookupId },
      ],
    },
  });
}

async function upsertProject(prisma, userId, data) {
  const existing = await prisma.workshopProject.findUnique({
    where: {
      userId_clientProjectId: {
        userId,
        clientProjectId: data.clientProjectId,
      },
    },
  });

  if (!existing) {
    const project = await prisma.workshopProject.create({
      data: {
        userId,
        status: 'editing',
        ...data,
      },
    });
    return { project, created: true };
  }

  const project = await prisma.workshopProject.update({
    where: { id: existing.id },
    data,
  });
  return { project, created: false };
}

function createConflictClientProjectId(clientProjectId) {
  const suffix = randomUUID().slice(0, 8);
  return `${clientProjectId}-conflict-${Date.now()}-${suffix}`.slice(0, 180);
}

function createConflictPayload(payloadJson, clientProjectId) {
  if (!isPlainObject(payloadJson)) return payloadJson;
  return {
    ...payloadJson,
    projectId: clientProjectId,
  };
}

export function createProjectsRouter(prisma) {
  const router = express.Router();

  router.use(requireAuth(prisma));
  router.use(express.json({ limit: jsonBodyLimit, strict: true }));

  router.get('/', async (req, res, next) => {
    try {
      const projects = await prisma.workshopProject.findMany({
        where: { userId: req.user.id },
        orderBy: [{ updatedAt: 'desc' }],
      });
      res.json({ items: projects.map(mapProject) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const normalized = normalizeProjectInput(req.body);
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid project payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const { project, created } = await upsertProject(prisma, req.user.id, normalized.data);
      res.status(created ? 201 : 200).json({ item: mapProject(project) });
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
      if (inputItems.length > 500) {
        return res.status(400).json({ message: 'items cannot contain more than 500 records', requestId: req.id });
      }

      const normalizedItems = [];
      const errors = [];
      inputItems.forEach((input, index) => {
        const normalized = normalizeProjectInput(input);
        if (!normalized.ok) {
          normalized.errors.forEach((message) => addValidationError(errors, `items[${index}]: ${message}`));
          return;
        }
        normalizedItems.push(normalized.data);
      });

      if (errors.length) {
        return res.status(400).json({
          message: 'Invalid project sync payload',
          errors,
          requestId: req.id,
        });
      }

      const stats = { created: 0, updated: 0, conflicted: 0 };
      const conflicts = [];

      await prisma.$transaction(async (tx) => {
        for (const data of normalizedItems) {
          const incomingUpdatedAt = data.updatedAt ?? new Date();
          const existing = await tx.workshopProject.findUnique({
            where: {
              userId_clientProjectId: {
                userId: req.user.id,
                clientProjectId: data.clientProjectId,
              },
            },
          });

          if (!existing) {
            await tx.workshopProject.create({
              data: {
                userId: req.user.id,
                status: 'editing',
                ...data,
                updatedAt: incomingUpdatedAt,
              },
            });
            stats.created += 1;
            continue;
          }

          if (existing.updatedAt > incomingUpdatedAt) {
            const conflictClientProjectId = createConflictClientProjectId(data.clientProjectId);
            const conflict = await tx.workshopProject.create({
              data: {
                userId: req.user.id,
                status: 'editing',
                ...data,
                clientProjectId: conflictClientProjectId,
                title: `${data.title}（本地副本）`.slice(0, 80),
                payloadJson: createConflictPayload(data.payloadJson, conflictClientProjectId),
                updatedAt: incomingUpdatedAt,
              },
            });

            conflicts.push({
              clientProjectId: data.clientProjectId,
              keptProjectId: existing.id,
              conflictProjectId: conflict.id,
              conflictClientProjectId,
            });
            stats.conflicted += 1;
            continue;
          }

          await tx.workshopProject.update({
            where: { id: existing.id },
            data: {
              ...data,
              updatedAt: incomingUpdatedAt,
            },
          });
          stats.updated += 1;
        }
      });

      const projects = await prisma.workshopProject.findMany({
        where: { userId: req.user.id },
        orderBy: [{ updatedAt: 'desc' }],
      });

      res.json({ items: projects.map(mapProject), stats, conflicts });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const project = await findProjectByLookup(prisma, req.user.id, req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found', requestId: req.id });
      }
      res.json({ item: mapProject(project) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const existing = await findProjectByLookup(prisma, req.user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ message: 'Project not found', requestId: req.id });
      }

      const normalized = normalizeProjectInput(req.body, { partial: true });
      if (!normalized.ok) {
        return res.status(400).json({
          message: 'Invalid project payload',
          errors: normalized.errors,
          requestId: req.id,
        });
      }

      const project = await prisma.workshopProject.update({
        where: { id: existing.id },
        data: normalized.data,
      });
      res.json({ item: mapProject(project) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const existing = await findProjectByLookup(prisma, req.user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ message: 'Project not found', requestId: req.id });
      }

      await prisma.workshopProject.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
