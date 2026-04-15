/**
 * Blocks actions until identity verification is approved (admin-verified profile).
 * Place after authenticateToken (sets req.userId).
 */
import { prisma } from '../lib/prisma.js';

export function isIdentityVerifiedStatus(status) {
  return status === 'verified' || status === 'approved';
}

/** For use inside route handlers (e.g. payments) without middleware. */
export async function userHasIdentityVerified(userId) {
  if (!userId) return false;
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { verificationStatus: true, deletedAt: true },
  });
  if (!profile || profile.deletedAt) return false;
  return isIdentityVerifiedStatus(profile.verificationStatus);
}

export async function requireIdentityVerified(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: req.userId },
    select: { verificationStatus: true, deletedAt: true },
  });

  if (!profile || profile.deletedAt) {
    return res.status(403).json({
      error: 'Complete your profile before using this feature.',
      code: 'IDENTITY_NOT_VERIFIED',
    });
  }

  if (!isIdentityVerifiedStatus(profile.verificationStatus)) {
    return res.status(403).json({
      error: 'Identity verification required. Upload your ID in Profile and wait for approval.',
      code: 'IDENTITY_NOT_VERIFIED',
    });
  }

  next();
}
