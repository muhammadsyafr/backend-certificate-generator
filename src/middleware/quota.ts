import { Response, NextFunction } from 'express';
import { db } from '../database/client';
import { users, templates, assets, fonts } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { AuthRequest } from './auth';
import { getPlanLimits, checkQuota } from '../config/plans';

type ResourceType = 'templates' | 'backgrounds' | 'logos' | 'fonts';

export const checkQuotaMiddleware = (resourceType: ResourceType) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      const userPlan = req.userPlan || 'free';

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get plan limits
      const limits = getPlanLimits(userPlan as 'free' | 'pro');

      // Check if feature is allowed
      if (resourceType === 'logos' && limits.logos === 0) {
        return res.status(403).json({ 
          error: 'Logo uploads not available on Free plan',
          upgrade: true 
        });
      }

      if (resourceType === 'fonts' && !limits.customFonts) {
        return res.status(403).json({ 
          error: 'Custom fonts not available on Free plan',
          upgrade: true 
        });
      }

      // Count current usage
      let currentCount = 0;

      if (resourceType === 'templates') {
        const count = await db
          .select({ count: templates.id })
          .from(templates)
          .where(eq(templates.userId, userId))
          .all();
        currentCount = count.length;
      } else if (resourceType === 'backgrounds') {
        const count = await db
          .select({ count: assets.id })
          .from(assets)
          .where(and(eq(assets.userId, userId), eq(assets.type, 'background')))
          .all();
        currentCount = count.length;
      } else if (resourceType === 'logos') {
        const count = await db
          .select({ count: assets.id })
          .from(assets)
          .where(and(eq(assets.userId, userId), eq(assets.type, 'logo')))
          .all();
        currentCount = count.length;
      } else if (resourceType === 'fonts') {
        const count = await db
          .select({ count: fonts.id })
          .from(fonts)
          .where(eq(fonts.userId, userId))
          .all();
        currentCount = count.length;
      }

      // Check quota
      const quota = checkQuota(userPlan as 'free' | 'pro', resourceType, currentCount);

      if (!quota.allowed) {
        const limitValue = quota.limit === -1 ? 'unlimited' : quota.limit;
        return res.status(403).json({ 
          error: `${resourceType} limit reached. Your plan allows ${limitValue} ${resourceType}.`,
          current: currentCount,
          limit: quota.limit,
          upgrade: true 
        });
      }

      // Store quota info in request for use in route handler
      req.quota = {
        current: currentCount,
        limit: quota.limit,
        remaining: quota.remaining
      };

      next();
    } catch (error) {
      console.error('Quota check error:', error);
      res.status(500).json({ error: 'Failed to check quota' });
    }
  };
};

// Extend AuthRequest interface
declare module './auth' {
  interface AuthRequest {
    quota?: {
      current: number;
      limit: number;
      remaining: number;
    };
  }
}
