import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const DEFAULT_SECRET = 'your-secret-key-change-in-production-use-strong-random-string';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;

// Warn on default secret in production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_SECRET) {
  console.error('CRITICAL: Using default JWT secret in production! Generate a strong secret with: openssl rand -base64 32');
}

export interface AuthRequest extends Request {
  userId?: number;
  userUuid?: string;
  user?: {
    id: number;
    uuid: string;
    email: string;
    name: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token || extractBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.userUuid = decoded.userUuid;
    req.user = {
      id: decoded.userId,
      uuid: decoded.userUuid,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7);
}

export const generateToken = (userId: number, userUuid: string, email: string, name: string): string => {
  return jwt.sign(
    { userId, userUuid, email, name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};
