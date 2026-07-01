import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../database/client';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .get();

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
};
