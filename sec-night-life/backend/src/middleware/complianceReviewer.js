import { prisma } from '../lib/prisma.js';

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * Super admin = user role ADMIN AND email matches SUPER_ADMIN_EMAIL.
 * SECURITY: email is fetched server-side from DB; never trust client claims.
 */
export async function requireSuperAdmin(req, res, next) {
  if (!req.userId || !req.userRole) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  if (!superAdminEmail) {
    return res.status(500).json({ error: 'SUPER_ADMIN_EMAIL env var missing on server' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true }
  });

  if (!user || normalizeEmail(user.email) !== superAdminEmail) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
}

/**
 * Compliance reviewer can approve/reject:
 * - Super admin (role ADMIN + SUPER_ADMIN_EMAIL)
 * - OR active AdminReviewer record by email
 *
 * SECURITY: block venue owners from reviewing by default (they would only pass
 * if explicitly configured as AdminReviewer by Super Admin).
 */
export async function requireComplianceReviewer(req, res, next) {
  if (!req.userId || !req.userRole) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, role: true }
  });

  if (!user) return res.status(401).json({ error: 'Account not found' });

  const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  const userEmail = normalizeEmail(user.email);

  // Super admin
  if (user.role === 'ADMIN' && superAdminEmail && userEmail === superAdminEmail) {
    return next();
  }

  // Active AdminReviewer
  const reviewer = await prisma.adminReviewer.findFirst({
    where: {
      isActive: true,
      email: userEmail
    }
  });

  if (!reviewer) {
    return res.status(403).json({ error: 'Reviewer access required' });
  }

  next();
}

