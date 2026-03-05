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
    registerVenue: 'Register a Venue',
    registerVenueDesc: 'List your nightclub or event company',
    signOut: 'Sign Out',
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
