import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { isStaff } from '../lib/access.js';
import { requirePremium } from '../middleware/premium.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { auditFromReq } from '../lib/audit.js';

const router = Router();

const profileUpdateSchema = z.object({
  username: z.string().max(100).optional(),
  full_name: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  city: z.string().max(100).optional(),
  avatar_url: z.string().url().optional().nullable(),
  favorite_drink: z.string().max(100).optional(),
  date_of_birth: z.string().max(20).optional(),
  id_document_url: z.string().url().optional().nullable(),
  age_verified: z.boolean().optional(),
  verification_status: z.enum(['pending', 'submitted', 'verified', 'rejected']).optional(),
  payment_setup_complete: z.boolean().optional(),
  interests: z.array(z.string()).optional(),
  music_preferences: z.array(z.string()).optional(),
  friends: z.array(z.string()).optional(),
  onboarding_complete: z.boolean().optional()
});

router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId }
    });
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, fullName: true, role: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const result = {
      id: profile?.id || user.id,
      created_by: user.email,
      user_id: user.id,
      username: profile?.username,
      full_name: user.fullName || profile?.username,
      bio: profile?.bio,
      city: profile?.city,
      avatar_url: profile?.avatarUrl,
      favorite_drink: profile?.favoriteDrink,
      date_of_birth: profile?.dateOfBirth,
      id_document_url: profile?.idDocumentUrl,
      age_verified: profile?.ageVerified ?? false,
      verification_status: profile?.verificationStatus ?? 'pending',
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      onboarding_complete: profile?.onboardingComplete ?? false
    };
    res.json(Array.isArray(result) ? result : [result]);
  } catch (err) {
    next(err);
  }
});

router.get('/profile/:id', authenticateToken, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const profile = await prisma.userProfile.findFirst({
      where: { OR: [{ userId: targetId }, { id: targetId }] }
    });
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: targetId }, { id: profile?.userId }], deletedAt: null },
      select: { id: true, email: true, fullName: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Track profile view (non-blocking) — only when viewing someone else's profile
    if (req.userId && req.userId !== user.id) {
      prisma.profileView.create({
        data: { viewerId: req.userId, viewedId: user.id }
      }).catch(() => {});
    }

    const result = {
      id: profile?.id || user.id,
      created_by: user.email,
      user_id: user.id,
      username: profile?.username,
      full_name: user.fullName || profile?.username,
      bio: profile?.bio,
      city: profile?.city,
      avatar_url: profile?.avatarUrl,
      favorite_drink: profile?.favoriteDrink,
      date_of_birth: profile?.dateOfBirth,
      id_document_url: profile?.idDocumentUrl,
      age_verified: profile?.ageVerified ?? false,
      verification_status: profile?.verificationStatus ?? 'pending',
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      onboarding_complete: profile?.onboardingComplete ?? false
    };
    res.json([result]);
  } catch (err) {
    next(err);
  }
});

// ── Premium: Who viewed my profile ───────────────────────────────────────
// SECURITY: email must be verified AND premium to access profile views
router.get('/profile-views', authenticateToken, requireVerified, requirePremium, async (req, res, next) => {
  try {
    const views = await prisma.profileView.findMany({
      where: { viewedId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ views: views.map(v => ({ viewerId: v.viewerId, viewedAt: v.createdAt })) });
  } catch (err) {
    next(err);
  }
});

// ── Premium: Search profiles ──────────────────────────────────────────────
// SECURITY: email must be verified AND premium to search profiles
router.get('/search', authenticateToken, requireVerified, requirePremium, async (req, res, next) => {
  try {
    const { q, city, limit = 20 } = req.query;
    if (!q || String(q).length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        suspendedAt: null,
        OR: [
          { fullName: { contains: String(q), mode: 'insensitive' } },
          { email: { contains: String(q), mode: 'insensitive' } }
        ]
      },
      select: { id: true, fullName: true },
      take: Math.min(parseInt(limit) || 20, 50)
    });

    const profiles = await prisma.userProfile.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {})
      }
    });

    const results = users.map(u => {
      const p = profiles.find(pr => pr.userId === u.id);
      return {
        user_id: u.id,
        full_name: u.fullName || p?.username,
        username: p?.username,
        city: p?.city,
        avatar_url: p?.avatarUrl,
        is_verified_promoter: p?.isVerifiedPromoter ?? false
      };
    }).filter(r => !city || r.city?.toLowerCase().includes(String(city).toLowerCase()));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const { created_by, id, is_verified_promoter } = req.query;
    const where = { deletedAt: null };
    if (created_by) {
      const u = await prisma.user.findFirst({ where: { email: created_by } });
      where.id = u ? u.id : 'none';
    }
    if (id) where.id = id;
    const users = await prisma.user.findMany({ where });
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: users.map(u => u.id) } }
    });
    let results = users.map(u => {
      const p = profiles.find(pr => pr.userId === u.id);
      return {
        id: p?.id || u.id,
        created_by: u.email,
        username: p?.username,
        full_name: u.fullName || p?.username,
        bio: p?.bio,
        city: p?.city,
        avatar_url: p?.avatarUrl,
        favorite_drink: p?.favoriteDrink,
        date_of_birth: p?.dateOfBirth,
        id_document_url: p?.idDocumentUrl,
        age_verified: p?.ageVerified ?? false,
        verification_status: p?.verificationStatus ?? 'pending',
        payment_setup_complete: p?.paymentSetupComplete ?? false,
        is_verified_promoter: p?.isVerifiedPromoter ?? false,
        interests: p?.interests ?? [],
        music_preferences: p?.musicPreferences ?? [],
        friends: p?.friends ?? [],
        onboarding_complete: p?.onboardingComplete ?? false
      };
    });
    if (is_verified_promoter === 'true') {
      results = results.filter(r => r.is_verified_promoter);
    }
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    res.json(results.slice(0, limit));
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', authenticateToken, async (req, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (data.full_name) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { fullName: data.full_name }
      });
    }
    const profileData = {
      ...(data.username != null && { username: data.username }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.city != null && { city: data.city }),
      ...(data.avatar_url !== undefined && { avatarUrl: data.avatar_url }),
      ...(data.favorite_drink != null && { favoriteDrink: data.favorite_drink }),
      ...(data.date_of_birth != null && { dateOfBirth: data.date_of_birth }),
      ...(data.id_document_url !== undefined && { idDocumentUrl: data.id_document_url }),
      ...(data.age_verified != null && { ageVerified: data.age_verified }),
      ...(data.verification_status != null && { verificationStatus: data.verification_status }),
      ...(data.payment_setup_complete != null && { paymentSetupComplete: data.payment_setup_complete }),
      ...(data.onboarding_complete != null && { onboardingComplete: data.onboarding_complete }),
      ...(data.interests != null && { interests: data.interests }),
      ...(data.music_preferences != null && { musicPreferences: data.music_preferences }),
      ...(data.friends != null && { friends: data.friends })
    };
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...profileData },
      update: profileData
    });
    res.json({
      id: profile.id,
      created_by: user.email,
      username: profile.username,
      full_name: user.fullName || profile.username,
      bio: profile.bio,
      city: profile.city,
      avatar_url: profile.avatarUrl,
      favorite_drink: profile.favoriteDrink,
      date_of_birth: profile.dateOfBirth,
      verification_status: profile.verificationStatus,
      payment_setup_complete: profile.paymentSetupComplete,
      interests: profile.interests,
      music_preferences: profile.musicPreferences,
      friends: profile.friends ?? [],
      onboarding_complete: profile.onboardingComplete
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = parsed.data;
    const profile = await prisma.userProfile.findFirst({
      where: { OR: [{ userId: id }, { id }] }
    });
    const targetUserId = profile?.userId || id;
    if (id !== req.userId && targetUserId !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Cannot update another user' });
    }
    if (data.full_name) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { fullName: data.full_name }
      });
    }
    const updates = {};
    if (data.username != null) updates.username = data.username;
    if (data.bio != null) updates.bio = data.bio;
    if (data.city != null) updates.city = data.city;
    if (data.avatar_url !== undefined) updates.avatarUrl = data.avatar_url;
    if (data.favorite_drink != null) updates.favoriteDrink = data.favorite_drink;
    if (data.date_of_birth != null) updates.dateOfBirth = data.date_of_birth;
    if (data.id_document_url !== undefined) updates.idDocumentUrl = data.id_document_url;
    if (data.age_verified != null) updates.ageVerified = data.age_verified;
    if (data.verification_status != null) updates.verificationStatus = data.verification_status;
    if (data.payment_setup_complete != null) updates.paymentSetupComplete = data.payment_setup_complete;
    if (data.interests != null) updates.interests = data.interests;
    if (data.music_preferences != null) updates.musicPreferences = data.music_preferences;
    if (data.friends != null) updates.friends = data.friends;
    if (data.onboarding_complete != null) updates.onboardingComplete = data.onboarding_complete;
    const updated = await prisma.userProfile.upsert({
      where: { userId: targetUserId },
      create: { userId: targetUserId, ...updates },
      update: updates
    });
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    res.json({
      id: updated.id,
      created_by: user.email,
      username: updated.username,
      full_name: user.fullName || updated.username,
      bio: updated.bio,
      city: updated.city,
      avatar_url: updated.avatarUrl,
      favorite_drink: updated.favoriteDrink,
      date_of_birth: updated.dateOfBirth,
      verification_status: updated.verificationStatus,
      payment_setup_complete: updated.paymentSetupComplete,
      interests: updated.interests,
      music_preferences: updated.musicPreferences,
      friends: updated.friends ?? [],
      onboarding_complete: updated.onboardingComplete
    });
  } catch (err) {
    next(err);
  }
});

// ── Account Deletion (STEP 6 — App Store requirement) ────────────────────
// Also available at DELETE /api/auth/account — this alias is for REST convention
// SECURITY: Atomic transaction — no orphaned sessions can remain after deletion
router.delete('/me', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          suspendedAt: now,
          suspendedReason: 'Account deleted by user'
        }
      }),
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    await auditFromReq(req, {
      userId,
      action: 'ACCOUNT_DELETED',
      entityType: 'user',
      entityId: userId
    });

    res.json({ success: true, message: 'Account deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
