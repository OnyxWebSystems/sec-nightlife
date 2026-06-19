import { createPageUrl } from '@/utils';
import { enterPartygoerMode } from '@/lib/activeViewMode';

/** Default parent page when back is pressed (mobile hierarchical nav). */
export const MOBILE_PAGE_PARENT = {
  Messages: 'Home',
  Friends: 'Home',
  Events: 'Home',
  Jobs: 'Home',
  Leaderboard: 'Home',
  Notifications: 'Home',
  HostDashboard: 'Home',
  Profile: 'Home',
  Explore: 'Home',
  Map: 'Home',
  Tables: 'Home',
  EventDetails: 'Home',
  TableDetails: 'Home',
  JobDetails: 'Home',
  ChatRoom: 'Home',
  ManageTable: 'Home',
  TablePayment: 'Home',
  TableJoinOnboarding: 'Home',
  HelpCenter: 'Home',
  UserProfile: 'Home',
  Privacy: 'Profile',
  EditProfile: 'Profile',
  MyJobApplications: 'Profile',
  Settings: 'Profile',
  ChangePassword: 'Settings',
  ChangeEmail: 'Settings',
  AppPreferences: 'Settings',
  PromoterCodeOfConduct: 'Profile',
  VenueBook: 'Home',
  EventHostTables: 'Home',
  CreateTable: 'HostDashboard',
  CreateHostEvent: 'HostDashboard',
  HostEventDetails: 'HostDashboard',
  Payments: 'Profile',
  CelebrationRequest: 'Profile',
  AgeVerificationDeclaration: 'Profile',
  AdminDashboard: 'Home',
  CommunityGuidelines: 'Home',
  TermsOfService: 'Settings',
  PrivacyPolicy: 'Settings',
  UserAgreement: 'Settings',
  RefundPolicy: 'Settings',
  GbvConsequences: 'Settings',
  VenueComplianceCharter: 'Settings',
  BusinessDashboard: 'Home',
  BusinessEvents: 'BusinessDashboard',
  BusinessBookings: 'BusinessDashboard',
  BusinessMenu: 'BusinessDashboard',
  BusinessJobs: 'BusinessDashboard',
  BusinessMessages: 'BusinessDashboard',
  BusinessPromotions: 'BusinessDashboard',
  VenueAnalytics: 'BusinessDashboard',
  BusinessVenueTables: 'BusinessDashboard',
  VenueProfile: 'BusinessDashboard',
  CreateJob: 'BusinessJobs',
  BusinessPromotionBoost: 'BusinessPromotions',
  StaffDashboard: 'Home',
  FeedbackInsights: 'BusinessDashboard',
  VenueOnboarding: 'BusinessDashboard',
};

/** Business pages staff open from Staff Dashboard (party-goer mode). */
export const STAFF_BUSINESS_PAGES = new Set([
  'BusinessDashboard',
  'VenueAnalytics',
  'BusinessBookings',
  'BusinessPromotions',
  'BusinessPromotionBoost',
  'BusinessEvents',
  'BusinessMenu',
  'BusinessJobs',
  'CreateJob',
  'BusinessMessages',
  'BusinessVenueTables',
  'VenueProfile',
  'FeedbackInsights',
  'VenueOnboarding',
]);

const MESSAGE_THREAD_PARAMS = ['dm', 'group', 'venueTableThread', 'promoterVenue'];
const BUSINESS_THREAD_PARAMS = ['application', 'thread', 'promoterVenue'];

function staffSessionActive(searchParams, inStaffSession) {
  if (inStaffSession) return true;
  const token = searchParams?.get('staff_ctx');
  return Boolean(token && token.trim());
}

/**
 * Resolve mobile back navigation target.
 * @returns {{ type: 'page', page: string, clearStaffContext?: boolean } | { type: 'clearParams', keep?: string[] } | { type: 'history' }}
 */
export function resolveMobileBackTarget(pageName, searchParams, { inStaffSession = false } = {}) {
  const inStaff = staffSessionActive(searchParams, inStaffSession);

  if (pageName === 'Messages' && searchParams) {
    const inThread = MESSAGE_THREAD_PARAMS.some((k) => searchParams.get(k));
    if (inThread) return { type: 'clearParams' };
    return { type: 'page', page: MOBILE_PAGE_PARENT.Messages || 'Home' };
  }

  if (pageName === 'BusinessMessages' && searchParams) {
    const inThread = BUSINESS_THREAD_PARAMS.some((k) => searchParams.get(k));
    if (inThread) {
      const tab = searchParams.get('tab');
      return { type: 'clearParams', keep: tab ? ['tab'] : [] };
    }
    if (inStaff) return { type: 'page', page: 'StaffDashboard', clearStaffContext: true };
    return { type: 'page', page: MOBILE_PAGE_PARENT.BusinessMessages || 'BusinessDashboard' };
  }

  if (pageName === 'HostDashboard' && searchParams?.get('create')) {
    const tab = searchParams.get('tab');
    return { type: 'clearParams', keep: tab ? ['tab'] : [] };
  }

  if (inStaff && STAFF_BUSINESS_PAGES.has(pageName)) {
    if (pageName === 'CreateJob') {
      return { type: 'page', page: 'BusinessJobs', preserveStaffContext: true };
    }
    if (pageName === 'BusinessPromotionBoost') {
      return { type: 'page', page: 'BusinessPromotions', preserveStaffContext: true };
    }
    return { type: 'page', page: 'StaffDashboard', clearStaffContext: true };
  }

  const parent = MOBILE_PAGE_PARENT[pageName];
  if (parent) return { type: 'page', page: parent };

  return { type: 'history' };
}

export function mobileBackNavigate(
  navigate,
  setSearchParams,
  pageName,
  searchParams,
  { inStaffSession = false, clearStaffContext, staffContextToken } = {},
) {
  const target = resolveMobileBackTarget(pageName, searchParams, { inStaffSession });
  if (target.type === 'clearParams') {
    if (setSearchParams) {
      const keep = target.keep || [];
      const next = new URLSearchParams();
      for (const k of keep) {
        const v = searchParams?.get(k);
        if (v) next.set(k, v);
      }
      setSearchParams(next);
    }
    return;
  }
  if (target.type === 'page') {
    if (pageName === 'AdminDashboard') {
      enterPartygoerMode();
    }
    if (target.clearStaffContext && clearStaffContext) {
      clearStaffContext();
    }
    if (target.preserveStaffContext && staffContextToken) {
      navigate(`${createPageUrl(target.page)}?staff_ctx=${encodeURIComponent(staffContextToken)}`);
      return;
    }
    navigate(createPageUrl(target.page));
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
    return;
  }
  navigate(createPageUrl('Home'));
}
