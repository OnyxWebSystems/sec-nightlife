export const ADMIN_TABS = [
  'overview',
  'announcements',
  'promoters',
  'reports',
  'payments',
  'users',
  'venues',
  'flagged-reviews',
  'compliance-documents',
];

export const ADMIN_SECTIONS = [
  { id: 'home', label: 'Home', tabs: ['overview'] },
  { id: 'moderation', label: 'Moderation', tabs: ['reports', 'flagged-reviews', 'users'] },
  { id: 'venues', label: 'Venues', tabs: ['venues', 'compliance-documents'] },
  { id: 'growth', label: 'Growth', tabs: ['announcements', 'promoters'] },
  { id: 'money', label: 'Money', tabs: ['payments'] },
];

export function withPdfInlineParams(fileUrl) {
  if (!fileUrl) return fileUrl;
  const lower = fileUrl.toLowerCase();
  const looksSigned = lower.includes('signature=') || /[?&]s=/.test(lower) || /[?&]e=/.test(lower);
  if (looksSigned) return fileUrl;

  const paramsToAdd = [
    ['response-content-disposition', 'inline'],
    ['attachment', 'false'],
    ['fl_attachment', 'false'],
  ];

  let url = fileUrl;
  for (const [k, v] of paramsToAdd) {
    const hasParam = new RegExp(`([?&])${k}=`, 'i').test(url);
    if (hasParam) continue;
    url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }
  return url;
}

export function getTabLabel(tabId, flaggedCount) {
  if (tabId === 'compliance-documents') return 'Compliance';
  if (tabId === 'flagged-reviews') {
    return flaggedCount != null ? `Flags (${flaggedCount})` : 'Flags';
  }
  if (tabId === 'announcements') return 'Announcements';
  return tabId.charAt(0).toUpperCase() + tabId.slice(1);
}

export function getVisibleSections(visibleTabs) {
  return ADMIN_SECTIONS.map((section) => ({
    ...section,
    tabs: section.tabs.filter((t) => visibleTabs.includes(t)),
  })).filter((section) => section.tabs.length > 0);
}
