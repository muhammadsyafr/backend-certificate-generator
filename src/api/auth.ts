import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from '../database/client';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import { generateToken, authenticateToken } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const NODE_ENV = process.env.NODE_ENV || 'development';

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character';
  return null;
}

function getClientIp(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

async function checkAccountLockout(user: { id: number; email: string; failedLoginAttempts: number; lockedUntil: number | null }): Promise<string | null> {
  if (user.lockedUntil && user.lockedUntil > Math.floor(Date.now() / 1000)) {
    const remaining = Math.ceil((user.lockedUntil - Math.floor(Date.now() / 1000)) / 60);
    return `Account locked. Try again in ${remaining} minute(s)`;
  }
  if (user.lockedUntil) {
    // Lockout expired, reset
    await db.update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id))
      .run();
  }
  return null;
}

async function incrementFailedAttempts(userId: number, email: string, ip: string, userAgent: string | undefined): Promise<void> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return;

  const newAttempts = user.failedLoginAttempts + 1;
  const updates: any = { failedLoginAttempts: newAttempts };

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    updates.lockedUntil = Math.floor((Date.now() + LOCKOUT_DURATION_MS) / 1000);
  }

  await db.update(users).set(updates).where(eq(users.id, userId)).run();
  await logAudit({ userId, action: 'login_failed', email, ip, userAgent, details: { attempt: newAttempts, maxAttempts: MAX_FAILED_ATTEMPTS } });

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    await logAudit({ userId, action: 'account_locked', email, ip, userAgent, details: { durationMinutes: LOCKOUT_DURATION_MS / 60000 } });
  }
}

function setAuthCookie(res: any, token: string): void {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

// POST - Register new user
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const emailTrimmed = email.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Validate name
    if (name.trim().length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, emailTrimmed))
      .get();

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await db
      .insert(users)
      .values({
        email: emailTrimmed,
        password: hashedPassword,
        name: name.trim(),
        failedLoginAttempts: 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    const user = result[0];
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    await logAudit({ userId: user.id, action: 'register', email: user.email, ip, userAgent });

    // Generate token
    const token = generateToken(user.id, user.email, user.name);
    setAuthCookie(res, token);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST - Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailTrimmed = email.toLowerCase().trim();

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, emailTrimmed))
      .get();

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    if (!user) {
      await logAudit({ userId: null, action: 'login_failed', email: emailTrimmed, ip, userAgent, details: { reason: 'user_not_found' } });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check account lockout
    const lockoutError = await checkAccountLockout(user);
    if (lockoutError) {
      await logAudit({ userId: user.id, action: 'login_failed', email: user.email, ip, userAgent, details: { reason: 'account_locked' } });
      return res.status(429).json({ error: lockoutError });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      await incrementFailedAttempts(user.id, user.email, ip, userAgent);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset failed attempts on success
    await db.update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id))
      .run();

    await logAudit({ userId: user.id, action: 'login_success', email: user.email, ip, userAgent });

    // Generate token
    const token = generateToken(user.id, user.email, user.name);
    setAuthCookie(res, token);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST - Logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.auth_token;
    if (token) {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production-use-strong-random-string';
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      await logAudit({ userId: decoded.userId, action: 'logout', email: decoded.email, ip: getClientIp(req), userAgent: req.headers['user-agent'] });
    }
  } catch { /* token invalid, still clear */ }

  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true });
});

// GET - Get current user (requires auth)
router.get('/me', authenticateToken, async (req: any, res) => {
  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .get();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
