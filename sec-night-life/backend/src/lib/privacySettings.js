/** Read privacy JSON from UserProfile with safe defaults. */
export function readPrivacySettings(profile) {
  const raw = profile?.privacySettings;
  if (!raw || typeof raw !== 'object') {
    return {
      profilePublic: true,
      searchVisible: true,
      tablesVisible: true,
      allowMessages: true,
    };
  }
  return {
    profilePublic: raw.profilePublic !== false,
    searchVisible: raw.searchVisible !== false,
    tablesVisible: raw.tablesVisible !== false,
    allowMessages: raw.allowMessages !== false,
  };
}

export async function userAllowsMessages(prisma, userId) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { privacySettings: true },
  });
  return readPrivacySettings(profile).allowMessages;
}

export async function userIsSearchVisible(prisma, userId) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { privacySettings: true },
  });
  return readPrivacySettings(profile).searchVisible;
}
