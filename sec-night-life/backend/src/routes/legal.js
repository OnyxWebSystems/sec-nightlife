import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

const LEGAL_DOCS = {
  privacy_policy: {
    type: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    version: '1.0',
    effectiveDate: '2026-01-01',
  },
  terms_of_service: {
    type: 'TERMS_OF_SERVICE',
    title: 'Terms of Service',
    version: '1.0',
    effectiveDate: '2026-01-01',
  },
  promoter_code_of_conduct: {
    type: 'PROMOTER_CODE_OF_CONDUCT',
    title: 'Promoter Code of Conduct',
    version: '1.0',
    effectiveDate: '2026-04-15',
  },
};

function isMissingAcceptanceSchema(err) {
  return err?.code === 'P2022' || err?.code === 'P2021';
}

router.get('/privacy-policy', (req, res) => {
  const meta = LEGAL_DOCS.privacy_policy;
  res.json({
    documentKey: 'privacy_policy',
    documentType: meta.type,
    title: meta.title,
    version: meta.version,
    effectiveDate: meta.effectiveDate,
    content: [
      {
        heading: 'Information We Collect',
        body: 'We collect information you provide when registering, including your name, email address, and profile details. We also collect usage data to improve our services.'
      },
      {
        heading: 'How We Use Your Information',
        body: 'We use your information to provide and improve the SEC Nightlife platform, send service notifications, and ensure platform safety.'
      },
      {
        heading: 'Data Sharing',
        body: 'We do not sell your personal data. We may share data with service providers necessary to operate the platform.'
      },
      {
        heading: 'Account Deletion',
        body: 'You may delete your account at any time from within the app. Upon deletion, your personal data will be removed from our active systems.'
      },
      {
        heading: 'Contact',
        body: 'For privacy inquiries, contact us at privacy@secnightlife.com'
      }
    ],
    note: 'This is a placeholder. Replace with full legal privacy policy before launch.'
  });
});

router.get('/terms-of-service', (req, res) => {
  const meta = LEGAL_DOCS.terms_of_service;
  res.json({
    documentKey: 'terms_of_service',
    documentType: meta.type,
    title: meta.title,
    version: meta.version,
    effectiveDate: meta.effectiveDate,
    content: [
      {
        heading: 'Acceptance of Terms',
        body: 'By using SEC Nightlife, you agree to these Terms of Service. If you do not agree, do not use the platform.'
      },
      {
        heading: 'Eligibility',
        body: 'You must be 18 years or older to use SEC Nightlife. By registering, you confirm you meet this requirement.'
      },
      {
        heading: 'User Conduct',
        body: 'You agree not to use the platform for illegal activities, harassment, or any conduct that violates our community guidelines.'
      },
      {
        heading: 'Content',
        body: 'You are responsible for content you post. SEC Nightlife reserves the right to remove content that violates our policies.'
      },
      {
        heading: 'Account Termination',
        body: 'We may suspend or terminate accounts that violate these terms. You may delete your account at any time.'
      },
      {
        heading: 'Contact',
        body: 'For terms inquiries, contact us at legal@secnightlife.com'
      }
    ],
    note: 'This is a placeholder. Replace with full legal terms of service before launch.'
  });
});

router.get('/promoter-code-of-conduct', (req, res) => {
  const meta = LEGAL_DOCS.promoter_code_of_conduct;
  res.json({
    documentKey: 'promoter_code_of_conduct',
    documentType: meta.type,
    title: meta.title,
    version: meta.version,
    effectiveDate: meta.effectiveDate,
    content: [
      {
        heading: 'Purpose and Scope',
        body: 'This Code of Conduct establishes the ethical and professional standards expected of all promoters operating on the SEC platform. Promoters play a critical role in the platform ecosystem and are expected to act with integrity and professionalism.',
      },
      {
        heading: 'Accuracy and Transparency',
        body: 'Promoters must ensure that all information related to events, including pricing, availability, and features, is accurate and not misleading. Misrepresentation of events is strictly prohibited.',
      },
      {
        heading: 'Ethical Conduct',
        body: 'Promoters must conduct themselves in a manner that is respectful, lawful, and professional at all times. This includes interactions with users, venues, and other stakeholders.',
      },
      {
        heading: 'Financial Integrity',
        body: 'Promoters must not engage in fraudulent practices, including ticket scams, misappropriation of funds, or unauthorized transactions outside the platform.',
      },
      {
        heading: 'Compliance and Enforcement',
        body: 'SEC reserves the right to monitor promoter activity and suspend or remove promoters who violate this Code.',
      },
    ],
  });
});

router.get('/acceptance-status', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.legalDocumentAcceptance.findMany({
      where: { userId: req.userId },
      orderBy: { acceptedAt: 'desc' },
      select: { documentType: true, version: true, acceptedAt: true },
    });
    const latest = {};
    for (const row of rows) {
      if (!latest[row.documentType]) latest[row.documentType] = row;
    }
    res.json({ latest });
  } catch (err) {
    if (isMissingAcceptanceSchema(err)) return res.json({ latest: {}, pendingMigration: true });
    next(err);
  }
});

router.post('/acceptances', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      document_key: z.enum(['privacy_policy', 'terms_of_service', 'promoter_code_of_conduct']),
      version: z.string().min(1).max(30),
    });
    const parsed = schema.parse(req.body || {});
    const docMeta = LEGAL_DOCS[parsed.document_key];
    const created = await prisma.legalDocumentAcceptance.create({
      data: {
        userId: req.userId,
        documentType: docMeta.type,
        version: parsed.version,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
    res.status(201).json({
      id: created.id,
      documentType: created.documentType,
      version: created.version,
      acceptedAt: created.acceptedAt,
    });
  } catch (err) {
    if (isMissingAcceptanceSchema(err)) {
      return res.status(503).json({ error: 'Legal acceptance storage is temporarily unavailable. Please try again shortly.' });
    }
    next(err);
  }
});

export default router;
