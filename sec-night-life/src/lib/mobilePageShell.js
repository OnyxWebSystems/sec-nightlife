/** Mobile hub pages that keep the floating bottom nav (no drill-down back header from Layout). */
export const MOBILE_NAV_ROOT_PAGES = new Set(['Home', 'BusinessDashboard', 'StaffDashboard']);

/** Pages that already render their own mobile back header (avoid duplicate). */
export const MOBILE_OWN_BACK_HEADER = new Set([
  'Messages',
  'BusinessMessages',
  'EventDetails',
  'TableDetails',
  'JobDetails',
  'ChatRoom',
  'ManageTable',
  'TablePayment',
  'TableJoinOnboarding',
  'Friends',
  'Settings',
  'HelpCenter',
  'Privacy',
  'CreateJob',
  'AppPreferences',
  'ChangePassword',
  'ChangeEmail',
  'BusinessEvents',
  'BusinessJobs',
  'BusinessBookings',
  'BusinessMenu',
  'BusinessPromotions',
  'BusinessVenueTables',
  'VenueAnalytics',
  'FeedbackInsights',
  'StaffDashboard',
  'HostDashboard',
  'Profile',
  'EditProfile',
  'UserProfile',
  'VenueProfile',
  'MyJobApplications',
  'PromoterCodeOfConduct',
  'EditProfile',
  'VenueOnboarding',
  'ProfileSetup',
  'EventHostTables',
  'VenueBook',
  'CreateTable',
  'CreateHostEvent',
  'HostEventDetails',
  'BusinessPromotionBoost',
  'Payments',
  'CelebrationRequest',
  'AgeVerificationDeclaration',
  'AdminDashboard',
]);

const AUTH_FLOW_PAGES = new Set([
  'Onboarding',
  'ProfileSetup',
  'VenueOnboarding',
  'Welcome',
  'Login',
  'Register',
  'ResetPassword',
  'VerifyEmail',
  'ForgotPassword',
  'PaymentSuccess',
  'TicketSuccess',
  'TicketVerify',
]);

export const MOBILE_PAGE_TITLES = {
  Events: 'Events',
  Jobs: 'Jobs',
  Notifications: 'Notifications',
  Leaderboard: 'Leaderboard',
  Explore: 'Explore',
  Map: 'Map',
  Tables: 'Tables',
  AdminDashboard: 'Admin',
  CommunityGuidelines: 'Community Guidelines',
  TermsOfService: 'Terms of Service',
  PrivacyPolicy: 'Privacy Policy',
  UserAgreement: 'User Agreement',
  RefundPolicy: 'Refund Policy',
  GbvConsequences: 'GBV Consequences',
  VenueComplianceCharter: 'Compliance Charter',
};

export function shouldShowMobileBackHeader(pageName) {
  if (!pageName) return false;
  if (MOBILE_NAV_ROOT_PAGES.has(pageName)) return false;
  if (MOBILE_OWN_BACK_HEADER.has(pageName)) return false;
  if (AUTH_FLOW_PAGES.has(pageName)) return false;
  return true;
}

export function getMobilePageTitle(pageName) {
  if (!pageName) return '';
  return MOBILE_PAGE_TITLES[pageName] || pageName.replace(/([A-Z])/g, ' $1').trim();
}
