import { Router } from 'express';
import multer from 'multer';
import { db } from '../database/client';
import { assets } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getDataDir } from '../utils/paths';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET - List user's assets
router.get('/', async (req: AuthRequest, res) => {
  try {
    const allAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, req.userId!))
      .all();
    // Parse metadata JSON for each asset
    const parsedAssets = allAssets.map(asset => ({
      id: asset.uuid,
      filename: asset.filename,
      filepath: asset.filepath,
      type: asset.type,
      metadata: asset.metadata ? JSON.parse(asset.metadata) : null,
      uploadedAt: asset.uploadedAt,
    }));
    res.json(parsedAssets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// POST - Upload new asset
router.post('/', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const type = req.body.type || 'logo';
    const filename = req.file.originalname;

    // Validate file type
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!['png', 'jpg', 'jpeg'].includes(ext || '')) {
      return res.status(400).json({ error: 'Only PNG and JPG files are allowed' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const subdir = type;
    const dataDir = getDataDir();
    const dirPath = path.join(dataDir, 'uploads', subdir);
    
    // Create directory if it doesn't exist
    await mkdir(dirPath, { recursive: true });
    
    const fullPath = path.join(dirPath, uniqueFilename);
    const filepath = path.join('uploads', subdir, uniqueFilename);

    // Save file
    await writeFile(fullPath, req.file.buffer);

    // Extract image metadata
    let metadata = null;
    try {
      const image = sharp(req.file.buffer);
      const meta = await image.metadata();
      metadata = JSON.stringify({
        width: meta.width,
        height: meta.height,
        size: req.file.buffer.length,
      });
    } catch (e) {
      console.error('Failed to extract metadata:', e);
    }

    // Save to database
    const result = await db
      .insert(assets)
      .values({
        uuid: crypto.randomUUID(),
        userId: req.userId!,
        filename,
        filepath,
        type,
        metadata,
        uploadedAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    const asset = result[0];
    res.status(201).json({
      id: asset.uuid,
      filename: asset.filename,
      filepath: asset.filepath,
      type: asset.type,
      metadata: asset.metadata ? JSON.parse(asset.metadata) : null,
      uploadedAt: asset.uploadedAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
});

// DELETE - Delete asset
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    if (!uuid) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }

    const asset = await db
      .select()
      .from(assets)
      .where(and(eq(assets.uuid, uuid), eq(assets.userId, req.userId!)))
      .get();

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Delete file from filesystem
    const dataDir = getDataDir();
    const fullPath = path.join(dataDir, asset.filepath);
    try {
      await unlink(fullPath);
    } catch (error) {
      console.warn(`Failed to delete file: ${fullPath}`, error);
    }

    // Delete from database
    await db.delete(assets).where(and(eq(assets.uuid, uuid), eq(assets.userId, req.userId!)));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
