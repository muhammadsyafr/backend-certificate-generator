import { Router } from 'express';
import { db } from '../database/client';
import { templates } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { checkQuotaMiddleware } from '../middleware/quota';

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
    
    const templatesWithUuid = allTemplates.map(t => ({
      id: t.uuid,
      name: t.name,
      layout: JSON.parse(t.layout),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    
    res.json(templatesWithUuid);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST - Create new template (with quota check)
router.post('/', checkQuotaMiddleware('templates'), async (req: AuthRequest, res) => {
  try {
    const { name, layout } = req.body;

    if (!name || !layout) {
      return res.status(400).json({ error: 'name and layout are required' });
    }

    const result = await db
      .insert(templates)
      .values({
        uuid: crypto.randomUUID(),
        userId: req.userId!,
        name,
        layout: JSON.stringify(layout),
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    const template = result[0];
    res.status(201).json({
      id: template.uuid,
      name: template.name,
      layout: JSON.parse(template.layout),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// GET - Get single template
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    if (!uuid) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const template = await db
      .select()
      .from(templates)
      .where(and(eq(templates.uuid, uuid), eq(templates.userId, req.userId!)))
      .get();

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      id: template.uuid,
      name: template.name,
      layout: JSON.parse(template.layout),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// PUT - Update template
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);
    const { name, layout } = req.body;

    if (!uuid) {
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
      .where(and(eq(templates.uuid, uuid), eq(templates.userId, req.userId!)))
      .returning();

    if (!result.length) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result[0];
    res.json({
      id: template.uuid,
      name: template.name,
      layout: JSON.parse(template.layout),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE - Delete template
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    if (!uuid) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const result = await db
      .delete(templates)
      .where(and(eq(templates.uuid, uuid), eq(templates.userId, req.userId!)))
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
