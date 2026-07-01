import { Router } from 'express';
import { db } from '../database/client';
import { users, templates, assets, fonts } from '../database/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { getPlanLimits, checkQuota } from '../config/plans';

const router = Router();

// Apply auth + admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// GET - List all users
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const allUsers = await db
      .select({
        uuid: users.uuid,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        plan: users.plan,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
      })
      .from(users)
      .all();

    res.json(allUsers);
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET - Get single user by UUID
router.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    const user = await db
      .select({
        id: users.uuid,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.uuid, uuid))
      .get();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT - Update user (toggle admin, unlock account, change plan)
router.put('/users/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);
    const { isAdmin, unlock, plan } = req.body;

    const updateData: any = {};

    if (typeof isAdmin === 'boolean') {
      updateData.isAdmin = isAdmin;
    }

    if (plan && (plan === 'free' || plan === 'pro')) {
      updateData.plan = plan;
    }

    if (unlock === true) {
      updateData.failedLoginAttempts = 0;
      updateData.lockedUntil = null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.uuid, uuid))
      .returning({
        uuid: users.uuid,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        plan: users.plan,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
      });

    if (!result.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE - Delete user
router.delete('/users/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    // Prevent deleting yourself
    if (uuid === req.userUuid) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await db
      .delete(users)
      .where(eq(users.uuid, uuid))
      .returning();

    if (!result.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET - Get user quota usage
router.get('/users/:id/quota', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    const user = await db
      .select({ id: users.id, plan: users.plan })
      .from(users)
      .where(eq(users.uuid, uuid))
      .get();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Count user resources
    const templateCount = await db
      .select({ count: templates.id })
      .from(templates)
      .where(eq(templates.userId, user.id))
      .all();

    const backgroundCount = await db
      .select({ count: assets.id })
      .from(assets)
      .where(eq(assets.userId, user.id))
      .where(eq(assets.type, 'background'))
      .all();

    const logoCount = await db
      .select({ count: assets.id })
      .from(assets)
      .where(eq(assets.userId, user.id))
      .where(eq(assets.type, 'logo'))
      .all();

    const fontCount = await db
      .select({ count: fonts.id })
      .from(fonts)
      .where(eq(fonts.userId, user.id))
      .all();

    const limits = getPlanLimits(user.plan as 'free' | 'pro');
    const usage = {
      templates: templateCount.length,
      backgrounds: backgroundCount.length,
      logos: logoCount.length,
      fonts: fontCount.length,
    };

    const quota = {
      templates: checkQuota(user.plan as 'free' | 'pro', 'templates', usage.templates),
      backgrounds: checkQuota(user.plan as 'free' | 'pro', 'backgrounds', usage.backgrounds),
      logos: checkQuota(user.plan as 'free' | 'pro', 'logos', usage.logos),
    };

    res.json({
      plan: user.plan,
      limits,
      usage,
      quota,
    });
  } catch (error) {
    console.error('Admin get quota error:', error);
    res.status(500).json({ error: 'Failed to get quota' });
  }
});

export default router;
