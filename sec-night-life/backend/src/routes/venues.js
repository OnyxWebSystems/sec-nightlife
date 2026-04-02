import { Router } from 'express';
import { ensureUserRole } from '../lib/userRoles.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { isStaff } from '../lib/access.js';

const router = Router();

const venueCreateSchema = z.object({
  name: z.string().min(1).max(200),
  venue_type: z.string().min(1),
  city: z.string().min(1),
  address: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  bio: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  website: z.string().url().optional().nullable().or(z.literal('')),
  instagram: z.string().optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  age_limit: z.number().int().min(0).optional().nullable(),
  logo_url: z.string().url().optional().nullable().or(z.literal('')),
  cover_image_url: z.string().url().optional().nullable().or(z.literal(''))
});

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { city, compliance_status, limit = 50 } = req.query;
    const where = { deletedAt: null };
    if (city) where.city = String(city);
    if (compliance_status) where.complianceStatus = compliance_status;
    if (req.userId && req.userRole === 'VENUE') {
      where.ownerUserId = req.userId;
    }

    const venues = await prisma.venue.findMany({
      where,
      orderBy: { rating: 'desc' },
      take: Math.min(parseInt(limit) || 50, 100)
    });

    const list = venues.map(v => ({
      id: v.id,
      name: v.name,
      venue_type: v.venueType,
      city: v.city,
      address: v.address,
      suburb: v.suburb,
      province: v.province,
      latitude: v.latitude,
      longitude: v.longitude,
      is_verified: v.isVerified,
      compliance_status: v.complianceStatus,
      logo_url: v.logoUrl,
      cover_image_url: v.coverImageUrl,
      rating: v.rating,
      owner_user_id: v.ownerUserId
    }));
    res.json(list);
  } catch (err) {
    next(err);
  }
});

router.get('/filter', optionalAuth, async (req, res, next) => {
  try {
    const { city, id, owner_user_id, compliance_status, venue_type, sort, limit = 50 } = req.query;
    const where = { deletedAt: null };
    if (city) where.city = String(city);
    if (id) where.id = String(id);
    if (owner_user_id) where.ownerUserId = String(owner_user_id);
    if (compliance_status) where.complianceStatus = compliance_status;
    if (venue_type) where.venueType = String(venue_type);
    if (req.userId && req.userRole === 'VENUE' && !isStaff(req.userRole)) {
      where.ownerUserId = req.userId;
    }

    const orderBy = sort === '-rating' ? { rating: 'desc' } : { name: 'asc' };
    const venues = await prisma.venue.findMany({
      where,
      orderBy,
      take: Math.min(parseInt(limit) || 50, 100)
    });

    const list = venues.map(v => ({
      id: v.id,
      name: v.name,
      venue_type: v.venueType,
      city: v.city,
      address: v.address,
      suburb: v.suburb,
      province: v.province,
      latitude: v.latitude,
      longitude: v.longitude,
      is_verified: v.isVerified,
      compliance_status: v.complianceStatus,
      logo_url: v.logoUrl,
      cover_image_url: v.coverImageUrl,
      rating: v.rating,
      owner_user_id: v.ownerUserId
    }));
    res.json(list);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: req.params.id, deletedAt: null }
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });

    res.json({
      id: venue.id,
      name: venue.name,
      venue_type: venue.venueType,
      city: venue.city,
      address: venue.address,
      suburb: venue.suburb,
      province: venue.province,
      latitude: venue.latitude,
      longitude: venue.longitude,
      bio: venue.bio,
      is_verified: venue.isVerified,
      compliance_status: venue.complianceStatus,
      logo_url: venue.logoUrl,
      cover_image_url: venue.coverImageUrl,
      phone: venue.phone,
      email: venue.email,
      website: venue.website,
      instagram: venue.instagram,
      capacity: venue.capacity,
      age_limit: venue.ageLimit,
      rating: venue.rating,
      owner_user_id: venue.ownerUserId
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = venueCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const data = parsed.data;

    await ensureUserRole(req.userId, 'business');
    const venue = await prisma.venue.create({
      data: {
        ownerUserId: req.userId,
        name: data.name,
        venueType: data.venue_type,
        city: data.city,
        address: data.address,
        suburb: data.suburb,
        province: data.province,
        latitude: data.latitude,
        longitude: data.longitude,
        bio: data.bio,
        phone: data.phone,
        email: data.email,
        website: data.website,
        instagram: data.instagram,
        capacity: data.capacity,
        ageLimit: data.age_limit,
        logoUrl: data.logo_url,
        coverImageUrl: data.cover_image_url,
        complianceStatus: 'pending',
      }
    });

    res.status(201).json({
      id: venue.id,
      name: venue.name,
      venue_type: venue.venueType,
      city: venue.city,
      address: venue.address,
      suburb: venue.suburb,
      province: venue.province,
      latitude: venue.latitude,
      longitude: venue.longitude,
      compliance_status: venue.complianceStatus,
      owner_user_id: venue.ownerUserId
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: req.params.id, deletedAt: null }
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (venue.ownerUserId !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Not authorized to update this venue' });
    }

    const parsed = venueCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const data = parsed.data;

    const updates = {};
    if (data.name != null) updates.name = data.name;
    if (data.venue_type != null) updates.venueType = data.venue_type;
    if (data.city != null) updates.city = data.city;
    if (data.address != null) updates.address = data.address;
    if (data.suburb != null) updates.suburb = data.suburb;
    if (data.province != null) updates.province = data.province;
    if (data.latitude != null) updates.latitude = data.latitude;
    if (data.longitude != null) updates.longitude = data.longitude;
    if (data.bio != null) updates.bio = data.bio;
    if (data.phone != null) updates.phone = data.phone;
    if (data.email != null) updates.email = data.email;
    if (data.website !== undefined) updates.website = data.website;
    if (data.instagram != null) updates.instagram = data.instagram;
    if (data.capacity != null) updates.capacity = data.capacity;
    if (data.age_limit != null) updates.ageLimit = data.age_limit;
    if (data.logo_url !== undefined) updates.logoUrl = data.logo_url;
    if (data.cover_image_url !== undefined) updates.coverImageUrl = data.cover_image_url;

    const updated = await prisma.venue.update({
      where: { id: venue.id },
      data: updates
    });

    res.json({
      id: updated.id,
      name: updated.name,
      venue_type: updated.venueType,
      city: updated.city,
      address: updated.address,
      suburb: updated.suburb,
      province: updated.province,
      latitude: updated.latitude,
      longitude: updated.longitude,
      cover_image_url: updated.coverImageUrl,
      compliance_status: updated.complianceStatus
    });
  } catch (err) {
    next(err);
  }
});

export default router;
