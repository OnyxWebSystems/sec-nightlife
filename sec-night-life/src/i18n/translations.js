/**
 * Translation strings for SEC Nightlife.
 * Structure prepared for future multi-language support.
 */
export const translations = {
  en: {
    settings: 'Settings',
    preferences: 'Preferences',
    support: 'Support',
    account: 'Account',
    editProfile: 'Edit Profile',
    notifications: 'Notifications',
    managePushNotifications: 'Manage push notifications',
    privacySecurity: 'Privacy & Security',
    paymentMethods: 'Payment Methods',
    appPreferences: 'App Preferences',
    theme: 'Theme',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    language: 'Language',
    helpCenter: 'Help Center',
    termsOfService: 'Terms of Service',
    privacyPolicy: 'Privacy Policy',
    userAgreement: 'User Agreement',
    communityGuidelines: 'Community Guidelines',
    gbvConsequences: 'GBV & Safety Consequences',
    refundPolicy: 'Refund Policy',
    venueComplianceCharter: 'Venue Compliance Charter',
    promoterCodeOfConduct: 'Promoter Code of Conduct',
    legalDocuments: 'Legal documents',
    registerVenue: 'Register a Venue',
    registerVenueDesc: 'List your nightclub or event company',
    signOut: 'Sign Out',
    appearance: 'Appearance',
    enableNotifications: 'Enable Notifications',
    enableNotificationsDesc: 'Master toggle for all notifications',
    pushNotifications: 'Push Notifications',
    eventReminders: 'Event reminders',
    tableInvitations: 'Table invitations',
    friendRequests: 'Friend requests',
    messages: 'Messages',
    promotionsFromVenues: 'Promotions from venues',
    promotions: 'Promotions from venues',
    appUpdates: 'App updates',
    emailNotifications: 'Email Notifications',
    emailEventReminders: 'Email event reminders',
    emailPromotions: 'Email promotions',
    locationSettings: 'Location Settings',
    useLocationForVenues: 'Use my location to discover nearby venues',
    useLocationForVenuesDesc: 'Allow SEC to use your location to show nearby venues and events',
    distanceUnit: 'Distance unit',
    kilometers: 'Kilometers',
    miles: 'Miles',
    profileVisibility: 'Profile visibility',
    makeProfilePublic: 'Make profile public',
    searchVisibility: 'Search visibility',
    showInSearchResults: 'Show my profile in search results',
    tableVisibility: 'Table visibility',
    allowViewMyTables: 'Allow people to view my tables',
    messagingPermissions: 'Messaging permissions',
    allowPeopleToMessage: 'Allow people to message me',
    changeEmail: 'Change Email',
    changePassword: 'Change Password',
    deleteAccount: 'Delete Account',
    deleteAccountWarning: 'This action cannot be undone. All your data will be permanently removed.',
    deleteAccountConfirm: 'Are you sure you want to delete your account?',
    cancel: 'Cancel',
    delete: 'Delete',
  },
};

export function t(lang, key) {
  const keys = key.split('.');
  let value = translations[lang] || translations.en;
  for (const k of keys) {
    value = value?.[k];
    if (value == null) break;
  }
  return value ?? key;
}
