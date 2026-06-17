import { createPageUrl } from '@/utils';

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
};

const MESSAGE_THREAD_PARAMS = ['dm', 'group', 'venueTableThread', 'promoterVenue'];
const BUSINESS_THREAD_PARAMS = ['application', 'thread', 'promoterVenue'];

/**
 * Resolve mobile back navigation target.
 * @returns {{ type: 'page', page: string } | { type: 'clearParams', keep?: string[] } | { type: 'history' }}
 */
export function resolveMobileBackTarget(pageName, searchParams) {
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
    return { type: 'page', page: MOBILE_PAGE_PARENT.BusinessMessages || 'BusinessDashboard' };
  }

  if (pageName === 'HostDashboard' && searchParams?.get('create')) {
    const tab = searchParams.get('tab');
    return { type: 'clearParams', keep: tab ? ['tab'] : [] };
  }

  const parent = MOBILE_PAGE_PARENT[pageName];
  if (parent) return { type: 'page', page: parent };

  return { type: 'history' };
}

export function mobileBackNavigate(navigate, setSearchParams, pageName, searchParams) {
  const target = resolveMobileBackTarget(pageName, searchParams);
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
    navigate(createPageUrl(target.page));
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
    return;
  }
  navigate(createPageUrl('Home'));
}
