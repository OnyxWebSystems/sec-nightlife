/** Must match backend `LEGAL_DOCS` versions in `backend/src/routes/legal.js` for acceptance POSTs */
export const LEGAL_ACCEPT_VERSION = {
  termsOfService: '1.0',
  privacyPolicy: '1.0',
};

/**
 * Canonical paths for static legal PDFs (served from /public/legal).
 */
export const LEGAL_PDF = {
  termsOfService: '/legal/sec-terms-of-service.pdf',
  communityGuidelines: '/legal/sec-community-guidelines.pdf',
  refundPolicy: '/legal/sec-refund-policy.pdf',
  venueComplianceCharter: '/legal/sec-venue-compliance-charter.pdf',
  userAgreement: '/legal/user-agreement.pdf',
};

/** In-app routes (pages.config keys) for HTML policies vs PDF viewers */
export const LEGAL_PAGE = {
  termsOfService: 'TermsOfService',
  privacyPolicy: 'PrivacyPolicy',
  promoterCodeOfConduct: 'PromoterCodeOfConduct',
  userAgreement: 'UserAgreement',
  communityGuidelines: 'CommunityGuidelines',
  refundPolicy: 'RefundPolicy',
  venueComplianceCharter: 'VenueComplianceCharter',
};
