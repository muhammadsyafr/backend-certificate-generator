export type PlanType = 'free' | 'pro';

export interface PlanLimits {
  name: string;
  price: number;
  templates: number;
  backgrounds: number;
  logos: number;
  customFonts: boolean;
  batchGeneration: number; // max certificates per batch
  watermark: boolean;
  priorityQueue: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    name: 'Free',
    price: 0,
    templates: 2, // Max 2 templates
    backgrounds: 1, // Max 1 background
    logos: 0, // No logos on free plan
    customFonts: false,
    batchGeneration: 50, // Max 50 certs per batch
    watermark: true,
    priorityQueue: false,
  },
  pro: {
    name: 'Pro',
    price: 19,
    templates: 99, // Max 99 templates
    backgrounds: 99, // Max 99 backgrounds
    logos: 99, // Max 99 logos
    customFonts: true,
    batchGeneration: -1, // Unlimited
    watermark: false,
    priorityQueue: true,
  },
};

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function isFeatureAllowed(plan: PlanType, feature: keyof PlanLimits): boolean {
  const limits = getPlanLimits(plan);
  const value = limits[feature];
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  return true; // For numeric limits, check against current usage
}

export function checkQuota(plan: PlanType, resource: keyof PlanLimits, currentCount: number): {
  allowed: boolean;
  limit: number;
  remaining: number;
} {
  const limits = getPlanLimits(plan);
  const limit = limits[resource] as number;
  
  if (limit === -1) {
    return { allowed: true, limit: -1, remaining: -1 }; // Unlimited
  }
  
  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount < limit;
  
  return { allowed, limit, remaining };
}
