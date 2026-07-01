import { Router } from 'express';
import multer from 'multer';
import { db } from '../database/client';
import { fonts } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { getDataDir } from '../utils/paths';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getPlanLimits, checkQuota } from '../config/plans';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply auth middleware to all routes
router.use(authenticateToken);

// Helper: Detect font weight and style from filename
function detectFontProperties(filename: string) {
  const fname = filename.toLowerCase();
  let fontWeight = '400';
  let fontStyle = 'normal';

  if (fname.includes('italic') || fname.includes('oblique')) {
    fontStyle = 'italic';
  }

  if (fname.includes('thin')) fontWeight = '100';
  else if (fname.includes('extralight') || fname.includes('extra-light') || fname.includes('ultralight')) fontWeight = '200';
  else if (fname.includes('light') && !fname.includes('semi')) fontWeight = '300';
  else if (fname.includes('medium')) fontWeight = '500';
  else if (fname.includes('semibold') || fname.includes('semi-bold') || fname.includes('demibold')) fontWeight = '600';
  else if (fname.includes('extrabold') || fname.includes('extra-bold') || fname.includes('ultrabold')) fontWeight = '800';
  else if (fname.includes('bold') && !fname.includes('semi') && !fname.includes('extra')) fontWeight = '700';
  else if (fname.includes('black') || fname.includes('heavy')) fontWeight = '900';
  else if (fname.includes('regular') || fname.includes('normal')) fontWeight = '400';

  return { fontWeight, fontStyle };
}

// GET - List user's fonts
router.get('/', async (req: AuthRequest, res) => {
  try {
    const allFonts = await db
      .select()
      .from(fonts)
      .where(eq(fonts.userId, req.userId!))
      .all();
    
    const fontsWithUuid = allFonts.map(f => ({
      id: f.uuid,
      name: f.name,
      filename: f.filename,
      filepath: f.filepath,
      fontFamily: f.fontFamily,
      fontWeight: f.fontWeight,
      fontStyle: f.fontStyle,
      uploadedAt: f.uploadedAt,
    }));
    
    res.json(fontsWithUuid);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fonts' });
  }
});

// POST - Upload new font(s) (with quota check)
router.post('/', upload.array('files'), async (req: AuthRequest, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const fontFamily = req.body.fontFamily;
    if (!fontFamily) {
      return res.status(400).json({ error: 'Font family name is required' });
    }

    const userId = req.userId!;
    const userPlan = req.userPlan || 'free';

    // Get plan limits
    const limits = getPlanLimits(userPlan as 'free' | 'pro');

    // Check if custom fonts are allowed
    if (!limits.customFonts) {
      return res.status(403).json({ 
        error: 'Custom fonts not available on Free plan',
        upgrade: true 
      });
    }

    // Count current fonts
    const currentFonts = await db
      .select({ count: fonts.id })
      .from(fonts)
      .where(eq(fonts.userId, userId))
      .all();
    const currentCount = currentFonts.length;

    // Check quota for each file to be uploaded
    const filesToUpload = (req.files as Express.Multer.File[]).length;
    const totalAfterUpload = currentCount + filesToUpload;
    
    const quota = checkQuota(userPlan as 'free' | 'pro', 'fonts', currentCount);
    if (quota.limit !== -1 && totalAfterUpload > quota.limit) {
      return res.status(403).json({ 
        error: `Font limit reached. Your plan allows ${quota.limit} fonts. You have ${currentCount} and are trying to upload ${filesToUpload} more.`,
        current: currentCount,
        limit: quota.limit,
        upgrade: true 
      });
    }

    const results = [];
    const dataDir = getDataDir();
    const dirPath = path.join(dataDir, 'uploads', 'fonts');

    // Create directory if it doesn't exist
    await mkdir(dirPath, { recursive: true });

    for (const file of req.files as Express.Multer.File[]) {
      if (!file.originalname || !file.buffer) continue;

      // Validate file type
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext || '')) {
        console.warn(`Skipping invalid file type: ${file.originalname}`);
        continue;
      }

      // Validate file size (max 5MB)
      if (file.buffer.length > 5_000_000) {
        console.warn(`Skipping large file: ${file.originalname}`);
        continue;
      }

      // Detect font weight and style from filename
      const { fontWeight, fontStyle } = detectFontProperties(file.originalname);

      // Generate unique filename
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${file.originalname}`;
      const filepath = path.join('uploads', 'fonts', uniqueFilename);
      const fullPath = path.join(dirPath, uniqueFilename);

      // Save file
      await writeFile(fullPath, file.buffer);

      // Save to database
      const result = await db
        .insert(fonts)
        .values({
          uuid: crypto.randomUUID(),
          userId: req.userId!,
          name: file.originalname,
          filename: file.originalname,
          filepath,
          fontFamily,
          fontWeight,
          fontStyle,
          uploadedAt: Math.floor(Date.now() / 1000),
        })
        .returning();

      const font = result[0];
      results.push({
        id: font.uuid,
        name: font.name,
        filename: font.filename,
        filepath: font.filepath,
        fontFamily: font.fontFamily,
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle,
        uploadedAt: font.uploadedAt,
      });
    }

    if (results.length === 0) {
      return res.status(400).json({
        error: 'No valid font files were uploaded. Ensure files are TTF, OTF, WOFF, or WOFF2 and under 5MB.',
      });
    }

    res.status(201).json({ uploaded: results.length, fonts: results });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload fonts' });
  }
});

// DELETE - Delete font
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const uuid = String(req.params.id);

    if (!uuid) {
      return res.status(400).json({ error: 'Invalid font ID' });
    }

    const font = await db
      .select()
      .from(fonts)
      .where(and(eq(fonts.uuid, uuid), eq(fonts.userId, req.userId!)))
      .get();

    if (!font) {
      return res.status(404).json({ error: 'Font not found' });
    }

    // Delete file from filesystem
    try {
      const dataDir = getDataDir();
      const fullPath = path.join(dataDir, font.filepath);
      await unlink(fullPath);
    } catch (e) {
      console.error('Failed to delete font file:', e);
    }

    // Delete from database
    await db.delete(fonts).where(and(eq(fonts.uuid, uuid), eq(fonts.userId, req.userId!)));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete font' });
  }
});

export default router;
