import express from 'express';
import { optionalAuth } from './auth.mjs';
import { getEntitlementSnapshot, PLAN_DEFINITIONS } from './entitlements.mjs';

function mapPublicPlans() {
  return Object.entries(PLAN_DEFINITIONS)
    .filter(([planKey]) => planKey !== 'admin')
    .map(([planKey, plan]) => ({
      planKey,
      label: plan.label,
      capabilities: plan.capabilities,
      limits: plan.limits,
    }));
}

export function createSubscriptionRouter(prisma) {
  const router = express.Router();

  router.get('/me', optionalAuth(prisma), async (req, res, next) => {
    try {
      res.json(await getEntitlementSnapshot(prisma, req.user ?? null));
    } catch (error) {
      next(error);
    }
  });

  router.get('/plans', (_req, res) => {
    res.json({ plans: mapPublicPlans() });
  });

  return router;
}
