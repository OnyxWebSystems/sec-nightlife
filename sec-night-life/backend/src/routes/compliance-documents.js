import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendBulkEmails, sendEmail } from '../lib/email.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireComplianceReviewer, requireSuperAdmin } from '../middleware/complianceReviewer.js';
import { auditFromReq } from '../lib/audit.js';
import { v2 as cloudinary } from 'cloudinary';

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

/**
 * Sets venue isVerified + complianceStatus from latest docs per type:
 * all four required types APPROVED, and if an OTHER exists its latest must be APPROVED.
 */
async function recomputeVenueComplianceFromDocuments(venueId) {
  const requiredDocsLatestFirst = await prisma.complianceDocument.findMany({
    where: { venueId, documentType: { in: REQUIRED_DOC_TYPES } },
    orderBy: { uploadedAt: 'desc' },
    select: { documentType: true, status: true }
  });

  const latestByType = new Map();
  for (const d of requiredDocsLatestFirst) {
    if (!latestByType.has(d.documentType)) latestByType.set(d.documentType, d.status);
  }

  const allRequiredApproved = REQUIRED_DOC_TYPES.every(
    (t) => latestByType.get(t) === 'APPROVED'
  );

  const otherLatest = await prisma.complianceDocument.findFirst({
    where: { venueId, documentType: 'OTHER' },
    orderBy: { uploadedAt: 'desc' },
    select: { status: true }
  });

  const complete =
    allRequiredApproved && (!otherLatest || otherLatest.status === 'APPROVED');

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      isVerified: complete,
      complianceStatus: complete ? 'approved' : 'pending'
    }
  });
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function isSuperAdminUser({ role, email, superAdminEmail }) {
  return role === 'SUPER_ADMIN' || (role === 'ADMIN' && superAdminEmail && normalizeEmail(email) === superAdminEmail);
}

function getAppReviewLink({ venueId }) {
  const query = venueId
    ? `?tab=compliance-documents&venueId=${encodeURIComponent(venueId)}`
    : '?tab=compliance-documents';
  const appUrl = process.env.APP_URL;
  if (!appUrl) return `/AdminDashboard${query}`;
  return `${appUrl}/AdminDashboard${query}`;
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

function parseCloudinaryFromUrl(fileUrl) {
  // Accept URLs like:
  // https://res.cloudinary.com/<cloudName>/<resourceType>/upload/v<version>/<publicId>.<ext>
  // where resourceType is typically "image" or "raw".
  try {
    const u = new URL(fileUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx < 2) return null;

    // Expected: [..., <cloudName>, <resourceType>, 'upload', 'v123', '<publicId>.<ext>']
    const resourceType = parts[uploadIdx - 1];
    const versionPart = parts[uploadIdx + 1]; // v...
    void versionPart;

    const publicSegments = parts.slice(uploadIdx + 2); // everything after version
    if (!resourceType || publicSegments.length === 0) return null;

    const last = publicSegments[publicSegments.length - 1];
    const dotIdx = last.lastIndexOf('.');
    const format = dotIdx > -1 ? last.slice(dotIdx + 1) : null;
    const lastNoExt = dotIdx > -1 ? last.slice(0, dotIdx) : last;

    const publicIdPrefix = publicSegments.length > 1
      ? publicSegments.slice(0, -1).join('/')
      : '';

    const publicId = publicIdPrefix ? `${publicIdPrefix}/${lastNoExt}` : lastNoExt;

    // Full path as in the URL (last segment keeps extension). Raw assets often need this for API download.
    const fullPublicId = publicSegments.join('/');

    return { resourceType, publicId, format, fullPublicId };
  } catch {
    return null;
  }
}

let cloudinaryConfigured = false;
function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return true;
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return false;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  cloudinaryConfigured = true;
  return true;
}

function signCloudinaryUrl(fileUrl) {
  const parsed = parseCloudinaryFromUrl(fileUrl);
  if (!parsed) return null;
  if (!ensureCloudinaryConfigured()) return null;

  const { resourceType, publicId, format, fullPublicId } = parsed;
  // 30 min window; refresh per admin page load.
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 30;

  // Default delivery type is "upload". Do not use "authenticated" unless the asset was uploaded that way.
  const baseOpts = {
    secure: true,
    sign_url: true,
    expires_at: expiresAtSeconds,
    type: 'upload',
  };

  // Raw files: public_id includes the extension; do not pass format or it gets appended twice.
  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.url(fullPublicId, {
      ...baseOpts,
      resource_type: 'raw',
    });
  }

  // sign_url=true makes Cloudinary generate an auth/signature querystring.
  return cloudinary.url(publicId, {
    ...baseOpts,
    resource_type: resourceType,
    format: format || undefined,
  });
}

function privateDownloadUrl(fileUrl) {
  const parsed = parseCloudinaryFromUrl(fileUrl);
  if (!parsed) return null;
  if (!ensureCloudinaryConfigured()) return null;

  const { resourceType, publicId, format, fullPublicId } = parsed;

  // Use Cloudinary API-authenticated download endpoint.
  // This works even when delivery URLs are blocked by ACL/token rules.
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 30;

  // Must match how the file was stored. Preset uploads are almost always type "upload".
  const downloadOpts = {
    resource_type: resourceType,
    type: 'upload',
    expires_at: expiresAtSeconds,
    attachment: false,
  };

  // Raw PDFs/docs: API expects public_id with extension; do not split format.
  if (resourceType === 'raw' && fullPublicId) {
    return cloudinary.utils.private_download_url(fullPublicId, null, downloadOpts);
  }

  if (!format) return null;

  return cloudinary.utils.private_download_url(publicId, format, downloadOpts);
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

    const isSuperAdmin = isSuperAdminUser({ role: user.role, email: userEmail, superAdminEmail });
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

    await recomputeVenueComplianceFromDocuments(venue.id);

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

    // SECURITY: venue owners cannot approve/reject their own docs (prevents self-approval).
    // Super admins may review their own venue for operations/testing.
    if (doc.venue.ownerUserId === req.userId) {
      const actor = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true, role: true }
      });
      const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
      const isSuperAdmin = actor && isSuperAdminUser({
        role: actor.role,
        email: normalizeEmail(actor.email),
        superAdminEmail
      });
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Not authorized to review your own venue documents' });
      }
    }

    const reviewed = await prisma.complianceDocument.update({
      where: { id: doc.id },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? (rejectionReason || '').trim() : null,
        reviewedAt: new Date(),
        reviewedBy: req.userId,
      }
    });

    await recomputeVenueComplianceFromDocuments(doc.venueId);

    await auditFromReq(req, {
      userId: req.userId,
      action: `COMPLIANCE_DOCUMENT_${status}`,
      entityType: 'compliance_document',
      entityId: reviewed.id,
      metadata: {
        venueId: doc.venueId,
        venueName: doc.venue.name,
        documentType: doc.documentType,
        reviewedBy: req.userId,
        rejectionReason: status === 'REJECTED' ? (rejectionReason || '').trim() : null,
      }
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

// Compliance admin file access (proxy Cloudinary with fresh signed URL).
// This avoids stale signed Cloudinary URLs stored in the DB returning HTTP 401.
router.get('/:id/file', authenticateToken, requireComplianceReviewer, async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);

    const doc = await prisma.complianceDocument.findUnique({
      where: { id },
      select: { id: true, fileUrl: true, fileName: true }
    });
    if (!doc || !doc.fileUrl) return res.status(404).json({ error: 'Document not found' });

    if (!ensureCloudinaryConfigured()) {
      return res.redirect(doc.fileUrl);
    }

    const signedUrl = signCloudinaryUrl(doc.fileUrl);
    if (!signedUrl) {
      return res.redirect(doc.fileUrl);
    }

    return res.redirect(signedUrl);
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

    const reviewLink = getAppReviewLink({});

    await sendEmail({
      to: created.email,
      subject: 'You now have access to review compliance documents',
      text: `Hi ${created.name},\n\nYou have been added as a compliance reviewer for SEC Nightlife.\n\nOpen the review page here: ${reviewLink}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#000;background:#111;padding:16px;margin:0 0 12px;">SEC Nightlife</h2>
          <div style="padding:16px;background:#1a1a1a;color:#e0e0e0;border-radius:12px;">
            <p style="margin:0 0 8px;">Hi <strong>${created.name}</strong>,</p>
            <p style="margin:0 0 12px;">You have been added as a compliance reviewer and can now approve or reject submitted business documents.</p>
            <a href="${reviewLink}" style="display:inline-block;padding:12px 18px;background:#fff;color:#000;font-weight:700;border-radius:8px;text-decoration:none;">Open review page</a>
          </div>
        </div>
      `
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'ADMIN_REVIEWER_CREATED',
      entityType: 'admin_reviewer',
      entityId: created.id,
      metadata: { reviewerEmail: created.email, reviewerName: created.name }
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

    await auditFromReq(req, {
      userId: req.userId,
      action: isActive ? 'ADMIN_REVIEWER_REACTIVATED' : 'ADMIN_REVIEWER_DEACTIVATED',
      entityType: 'admin_reviewer',
      entityId: updated.id,
      metadata: { reviewerEmail: updated.email, reviewerName: updated.name, isActive }
    });

    res.json({ reviewer: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/reviewers/:reviewerId', authenticateToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const { reviewerId } = z.object({ reviewerId: z.string().min(1) }).parse(req.params);

    const existing = await prisma.adminReviewer.findUnique({ where: { id: reviewerId } });
    if (!existing) return res.status(404).json({ error: 'Reviewer not found' });

    await prisma.adminReviewer.delete({ where: { id: reviewerId } });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'ADMIN_REVIEWER_DELETED',
      entityType: 'admin_reviewer',
      entityId: reviewerId,
      metadata: { reviewerEmail: existing.email, reviewerName: existing.name }
    });

    res.status(204).send();
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

    const payload = await Promise.all(docs.map(async (d) => {
      const owner = ownersById.get(d.venue.ownerUserId);
      const isCloudinary = fileUrlLooksLikeCloudinary(d.fileUrl, process.env.CLOUDINARY_CLOUD_NAME);
      const signedFileUrl = isCloudinary ? signCloudinaryUrl(d.fileUrl) : null;
      const downloadUrl = isCloudinary ? privateDownloadUrl(d.fileUrl) : null;

      return {
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        fileUrl: d.fileUrl,
        signedFileUrl: signedFileUrl || null,
        downloadUrl: downloadUrl || null,
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
    }));

    res.json({ pendingDocuments: payload });
  } catch (err) {
    next(err);
  }
});

export default router;

