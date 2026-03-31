import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendBulkEmails, sendEmail } from '../lib/email.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireComplianceReviewer, requireSuperAdmin } from '../middleware/complianceReviewer.js';

const router = Router();

const REQUIRED_DOC_TYPES = [
  'LIQUOR_LICENCE',
  'BUSINESS_REGISTRATION',
  'HEALTH_CERTIFICATE',
  'TAX_CLEARANCE',
];

const documentTypeSchema = z.enum([
  'LIQUOR_LICENCE',
  'BUSINESS_REGISTRATION',
  'HEALTH_CERTIFICATE',
  'TAX_CLEARANCE',
  'OTHER',
]);

const documentStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function getAppReviewLink({ venueId }) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return `/AdminDashboard?tab=compliance-documents&venueId=${venueId}`;
  return `${appUrl}/AdminDashboard?tab=compliance-documents&venueId=${venueId}`;
}

async function sendComplianceUploadEmails({ superAdminEmail, reviewerEmails, emailPayload }) {
  const uniqueTo = Array.from(
    new Set([superAdminEmail, ...(reviewerEmails || [])].filter(Boolean).map(normalizeEmail))
  );

  if (uniqueTo.length === 0) return;

  const subject = emailPayload.subject;
  const html = emailPayload.html;
  const text = emailPayload.text;

  await sendBulkEmails(uniqueTo.map((to) => ({ to, subject, html, text })));
}

function fileUrlLooksLikeCloudinary(fileUrl, cloudName) {
  if (!fileUrl || !cloudName) return false;
  const prefix = `https://res.cloudinary.com/${cloudName}/`;
  return fileUrl.startsWith(prefix);
}

// Business: get latest compliance status per type for the venue (latest by uploadedAt)
router.get('/venue/:venueId/latest', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = z.object({ venueId: z.string().min(1) }).parse(req.params);

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true, ownerUserId: true }
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });

    const docs = await prisma.complianceDocument.findMany({
      where: { venueId: venue.id },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        status: true,
        rejectionReason: true,
        uploadedAt: true,
      }
    });

    const latestByType = new Map();
    for (const doc of docs) {
      if (!latestByType.has(doc.documentType)) latestByType.set(doc.documentType, doc);
      if (latestByType.size >= REQUIRED_DOC_TYPES.length + 1) break;
    }

    const result = {
      documents: [...REQUIRED_DOC_TYPES, 'OTHER'].map((type) => {
        const doc = latestByType.get(type) || null;
        return {
          documentType: type,
          status: doc?.status || 'PENDING',
          rejectionReason: doc?.rejectionReason || null,
          uploadedAt: doc?.uploadedAt || null,
          id: doc?.id || null,
        };
      })
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Current user capabilities for compliance review (used by the UI)
router.get('/me/access', authenticateToken, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, role: true }
    });
    if (!user) return res.status(401).json({ error: 'Account not found' });

    const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
    const userEmail = normalizeEmail(user.email);

    const isSuperAdmin = user.role === 'ADMIN' && superAdminEmail && userEmail === superAdminEmail;
    if (isSuperAdmin) return res.json({ canReview: true, isSuperAdmin: true });

    const reviewer = await prisma.adminReviewer.findFirst({
      where: { isActive: true, email: userEmail }
    });

    return res.json({ canReview: !!reviewer, isSuperAdmin: false });
  } catch (err) {
    next(err);
  }
});

// Business: upload a new document (Cloudinary upload already done by frontend)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      venueId: z.string().min(1),
      documentType: documentTypeSchema,
      fileUrl: z.string().url(),
      fileName: z.string().min(1).max(300),
    });

    const { venueId, documentType, fileUrl, fileName } = schema.parse(req.body);

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true, ownerUserId: true, name: true }
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!fileUrlLooksLikeCloudinary(fileUrl, cloudName)) {
      return res.status(400).json({ error: 'Invalid file URL (must be Cloudinary)' });
    }

    const created = await prisma.complianceDocument.create({
      data: {
        venueId: venue.id,
        documentType,
        fileUrl,
        fileName,
        status: 'PENDING',
      }
    });

    // Email notifications (Super admin + active reviewers)
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    if (!superAdminEmail) {
      // Still create record, but surface explicit failure
      throw new Error('SUPER_ADMIN_EMAIL env var missing');
    }

    const activeReviewers = await prisma.adminReviewer.findMany({
      where: { isActive: true },
      select: { email: true }
    });

    const reviewerEmails = activeReviewers.map((r) => r.email);
    const reviewLink = getAppReviewLink({ venueId: venue.id });

    const docLabel = documentType
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase());

    await sendComplianceUploadEmails({
      superAdminEmail,
      reviewerEmails,
      emailPayload: {
        subject: `New compliance document pending review — ${venue.name}`,
        text: `A new compliance document is pending review.\n\nVenue: ${venue.name}\nDocument: ${docLabel}\n\nReview here: ${reviewLink}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#000;background:#111;padding:16px;margin:0 0 12px;">SEC Nightlife</h2>
            <div style="padding:16px;background:#1a1a1a;color:#e0e0e0;border-radius:12px;">
              <p style="margin:0 0 8px;"><strong>New compliance document pending review</strong></p>
              <p style="margin:0 0 8px;">Venue: <strong>${venue.name}</strong></p>
              <p style="margin:0 0 8px;">Document: <strong>${docLabel}</strong></p>
              <a href="${reviewLink}" style="display:inline-block;padding:12px 18px;background:#fff;color:#000;font-weight:700;border-radius:8px;text-decoration:none;">Review document</a>
              <p style="font-size:12px;color:#aaa;margin:12px 0 0;">If the link doesn’t work, copy it from the email text.</p>
            </div>
          </div>
        `
      }
    });

    res.status(201).json({ success: true, complianceDocument: created });
  } catch (err) {
    next(err);
  }
});

// Admin/Reviewer: approve/reject
router.patch('/:id/review', authenticateToken, requireComplianceReviewer, async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { status, rejectionReason } = z.object({
      status: documentStatusSchema,
      rejectionReason: z.string().max(1000).optional().nullable(),
    }).parse(req.body);

    if (status === 'REJECTED') {
      const reason = (rejectionReason || '').trim();
      if (!reason) return res.status(400).json({ error: 'rejectionReason is required when rejecting' });
    }

    const doc = await prisma.complianceDocument.findUnique({
      where: { id },
      include: { venue: { select: { id: true, ownerUserId: true, name: true, deletedAt: true } } }
    });
    if (!doc || doc.venue.deletedAt) return res.status(404).json({ error: 'Document not found' });

    // SECURITY: never allow venue owners to approve/reject their own compliance docs.
    if (doc.venue.ownerUserId === req.userId) {
      return res.status(403).json({ error: 'Not authorized to review your own venue documents' });
    }

    await prisma.complianceDocument.update({
      where: { id: doc.id },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? (rejectionReason || '').trim() : null,
        reviewedAt: new Date(),
        reviewedBy: req.userId,
      }
    });

    // Decide whether venue becomes VERIFIED using the *latest* doc per required type.
    // This prevents issues when a document is re-uploaded and duplicates exist.
    const requiredDocsLatestFirst = await prisma.complianceDocument.findMany({
      where: { venueId: doc.venueId, documentType: { in: REQUIRED_DOC_TYPES } },
      orderBy: { uploadedAt: 'desc' },
      select: { documentType: true, status: true }
    });

    const latestByType = new Map();
    for (const d of requiredDocsLatestFirst) {
      if (!latestByType.has(d.documentType)) latestByType.set(d.documentType, d.status);
    }

    const allRequiredLatestApproved = REQUIRED_DOC_TYPES.every(
      (t) => latestByType.get(t) === 'APPROVED'
    );

    await prisma.venue.update({
      where: { id: doc.venueId },
      data: { isVerified: allRequiredLatestApproved, complianceStatus: allRequiredLatestApproved ? 'approved' : 'pending' },
    });

    // Email business owner
    const businessOwner = await prisma.user.findUnique({
      where: { id: doc.venue.ownerUserId },
      select: { email: true }
    });

    const docLabel = doc.documentType
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase());

    const to = businessOwner?.email;
    if (to) {
      if (status === 'APPROVED') {
        await sendEmail({
          to,
          subject: `Your ${docLabel} has been approved`,
          text: `Your ${docLabel} has been approved.`,
          html: `<p>Your <strong>${docLabel}</strong> has been approved.</p>`,
        });
      } else if (status === 'REJECTED') {
        const reason = (rejectionReason || '').trim();
        await sendEmail({
          to,
          subject: `Your ${docLabel} was rejected`,
          text: `Your ${docLabel} was rejected.\n\nReason: ${reason}\n\nPlease re-upload.`,
          html: `<p>Your <strong>${docLabel}</strong> was rejected.</p><p>Reason: <em>${reason}</em></p><p>Please re-upload.</p>`,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Super admin: manage active reviewers
router.get('/admin/reviewers', authenticateToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const reviewers = await prisma.adminReviewer.findMany({
      orderBy: { addedAt: 'desc' }
    });
    res.json({ reviewers });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/reviewers', authenticateToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, name } = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(200),
    }).parse(req.body);

    const created = await prisma.adminReviewer.create({
      data: {
        email: normalizeEmail(email),
        name,
        isActive: true,
        addedByUserId: req.userId,
      }
    });

    res.status(201).json({ reviewer: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/reviewers/:reviewerId', authenticateToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const { reviewerId } = z.object({ reviewerId: z.string().min(1) }).parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    const updated = await prisma.adminReviewer.update({
      where: { id: reviewerId },
      data: { isActive }
    });

    res.json({ reviewer: updated });
  } catch (err) {
    next(err);
  }
});

// Super admin & active reviewer: pending documents list (flat; frontend can group by venue)
router.get('/admin/pending-documents', authenticateToken, requireComplianceReviewer, async (req, res, next) => {
  try {
    const docs = await prisma.complianceDocument.findMany({
      where: { status: 'PENDING' },
      orderBy: { uploadedAt: 'desc' },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            ownerUserId: true,
          }
        }
      },
      take: 200
    });

    // Attach owner emails/names
    const ownerIds = Array.from(new Set(docs.map((d) => d.venue.ownerUserId))).filter(Boolean);
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, email: true, fullName: true }
    });
    const ownersById = new Map(owners.map((o) => [o.id, o]));

    const payload = docs.map((d) => {
      const owner = ownersById.get(d.venue.ownerUserId);
      return {
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        rejectionReason: d.rejectionReason,
        venue: {
          id: d.venue.id,
          name: d.venue.name,
          owner: owner
            ? { id: owner.id, email: owner.email, fullName: owner.fullName }
            : { id: d.venue.ownerUserId }
        }
      };
    });

    res.json({ pendingDocuments: payload });
  } catch (err) {
    next(err);
  }
});

export default router;

