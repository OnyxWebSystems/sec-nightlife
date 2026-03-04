/**
 * Legal placeholder routes.
 * App Store requires accessible privacy policy and terms of service.
 * Replace placeholder text with real legal content before launch.
 */
import { Router } from 'express';

const router = Router();

router.get('/privacy-policy', (req, res) => {
  res.json({
    title: 'Privacy Policy',
    version: '1.0',
    effectiveDate: '2026-01-01',
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
  res.json({
    title: 'Terms of Service',
    version: '1.0',
    effectiveDate: '2026-01-01',
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

export default router;
