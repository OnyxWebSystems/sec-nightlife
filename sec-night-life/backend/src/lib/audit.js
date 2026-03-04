/**
 * Structured audit logging.
 * Writes to the audit_logs table and to stdout via structured logger.
 * SECURITY: Never log passwords, tokens, secrets, or authorization headers.
 * Never log sensitive credentials.
 */
import { prisma } from './prisma.js';
import { logger, redact } from './logger.js';

/**
 * @param {object} params
 * @param {string|null} params.userId
 * @param {string} params.action  - e.g. 'LOGIN_SUCCESS', 'TABLE_CREATED'
 * @param {string} params.entityType - e.g. 'user', 'table', 'venue'
 * @param {string|null} params.entityId
 * @param {object} [params.metadata]
 * @param {string|null} [params.ipAddress]
 * @param {string|null} [params.userAgent]
 */
export async function audit({ userId, action, entityType, entityId, metadata = {}, ipAddress = null, userAgent = null }) {
  // SECURITY: redact any sensitive fields from metadata before logging
  const safe = redact(metadata);

  logger.info(`AUDIT: ${action}`, {
    entityType,
    entityId,
    userId,
    ipAddress,
    metadata: safe
  });

  // Persist to DB (non-blocking — don't let audit failure crash the request)
  prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      resource: entityType,
      resourceId: entityId || null,
      details: safe,
      ipAddress,
      userAgent
    }
  }).catch(err => {
    logger.error('audit: failed to persist log', { message: err.message });
  });
}

/** Helper for route handlers — extracts IP and UA from req */
export function auditFromReq(req, params) {
  return audit({
    ...params,
    // SECURITY: never log full headers — only extract IP and UA
    ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null
  });
}
