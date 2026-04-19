import { LEGAL_PAGE } from './documentUrls';

function baseLegalDocs(t) {
  return [
    { key: 'userAgreement', page: LEGAL_PAGE.userAgreement, label: t('userAgreement') },
    { key: 'termsOfService', page: LEGAL_PAGE.termsOfService, label: t('termsOfService') },
    { key: 'privacyPolicy', page: LEGAL_PAGE.privacyPolicy, label: t('privacyPolicy') },
    { key: 'communityGuidelines', page: LEGAL_PAGE.communityGuidelines, label: t('communityGuidelines') },
    { key: 'refundPolicy', page: LEGAL_PAGE.refundPolicy, label: t('refundPolicy') },
    { key: 'venueComplianceCharter', page: LEGAL_PAGE.venueComplianceCharter, label: t('venueComplianceCharter') },
    { key: 'promoterCodeOfConduct', page: LEGAL_PAGE.promoterCodeOfConduct, label: t('promoterCodeOfConduct') },
  ];
}

/** Settings → Support: Help first, then all legal pages */
export function getSettingsLegalNavItems(t) {
  return [{ key: 'helpCenter', page: 'HelpCenter', label: t('helpCenter') }, ...baseLegalDocs(t)];
}

/** Help Center: same documents as Settings (no self-link to Help) */
export function getHelpCenterLegalNavItems(t) {
  return baseLegalDocs(t);
}

export { LEGAL_PAGE };
