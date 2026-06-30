import { Router } from 'express';
import { db } from '../database/client';
import { templates } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET - List user's templates
router.get('/', async (req: AuthRequest, res) => {
  try {
    const allTemplates = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, req.userId!))
      .all();
    res.json(allTemplates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST - Create new template
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, layout } = req.body;

    if (!name || !layout) {
      return res.status(400).json({ error: 'name and layout are required' });
    }

    const result = await db
      .insert(templates)
      .values({
        userId: req.userId!,
        name,
        layout: JSON.stringify(layout),
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// GET - Get single template
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id) || '0');

    if (!id) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const template = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, req.userId!)))
      .get();

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// PUT - Update template
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id) || '0');
    const { name, layout } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const updateData: any = {
      updatedAt: Math.floor(Date.now() / 1000),
    };

    if (name) updateData.name = name;
    if (layout) updateData.layout = JSON.stringify(layout);

    const result = await db
      .update(templates)
      .set(updateData)
      .where(and(eq(templates.id, id), eq(templates.userId, req.userId!)))
      .returning();

    if (!result.length) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE - Delete template
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id) || '0');

    if (!id) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const result = await db
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, req.userId!)))
      .returning();

    if (!result.length) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
