import { db } from '../database/client';
import { auditLogs } from '../database/schema';

type AuditAction = 'login_failed' | 'login_success' | 'register' | 'logout' | 'account_locked' | 'account_unlocked';

interface AuditEntry {
  userId?: number | null;
  action: AuditAction;
  email: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      email: entry.email,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}