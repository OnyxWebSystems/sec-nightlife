import { queryClientInstance as queryClient } from '@/lib/query-client';
import { asArray } from '@/utils';

/** Pending per-chat unread cleared in the list before server mark-read finishes. */
const pendingReadClears = new Map();

/** Notify Layout to refresh notification / message badge counts. */
export function dispatchMessagesRefresh(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('sec_notifications_refresh', detail != null ? { detail } : undefined),
  );
}

function patchAllLayoutBadges(patchFn) {
  const entries = queryClient.getQueriesData({ queryKey: ['layout-unread-badges'] });
  for (const [key, data] of entries) {
    if (!data || typeof data !== 'object') continue;
    queryClient.setQueryData(key, patchFn(data));
  }
}

function mapListCache(queryKey, mapRow) {
  const prev = queryClient.getQueryData(queryKey);
  if (prev == null) return 0;

  if (Array.isArray(prev)) {
    let cleared = 0;
    const next = prev.map((row) => {
      const { row: mapped, cleared: c } = mapRow(row);
      cleared = Math.max(cleared, c);
      return mapped;
    });
    queryClient.setQueryData(queryKey, next);
    return cleared;
  }

  if (typeof prev === 'object' && Array.isArray(prev.items)) {
    let cleared = 0;
    const nextItems = prev.items.map((row) => {
      const { row: mapped, cleared: c } = mapRow(row);
      cleared = Math.max(cleared, c);
      return mapped;
    });
    queryClient.setQueryData(queryKey, { ...prev, items: nextItems });
    return cleared;
  }

  const list = asArray(prev);
  for (const row of list) {
    const { cleared } = mapRow(row);
    if (cleared > 0) return cleared;
  }
  return 0;
}

/** Zero notification unread everywhere (Home, Layout, More sheet). */
export function clearNotificationUnreadBadges() {
  queryClient.setQueryData(['notifications-unread'], 0);
  patchAllLayoutBadges((data) => ({
    ...data,
    notif: 0,
  }));
  // skipRefetch: avoid racing a badge refetch before read-all API completes.
  dispatchMessagesRefresh({ notif: 0, skipRefetch: true });
}

/** Decrement notification unread by `by` (single mark-as-read). */
export function decrementNotificationUnreadBadges(by = 1) {
  const delta = Math.max(0, Number(by) || 0);
  if (delta === 0) return;

  let current = queryClient.getQueryData(['notifications-unread']);
  if (typeof current !== 'number') {
    const entries = queryClient.getQueriesData({ queryKey: ['layout-unread-badges'] });
    current = 0;
    for (const [, d] of entries) {
      if (d && typeof d.notif === 'number') {
        current = d.notif;
        break;
      }
    }
  }
  const next = Math.max(0, Number(current) || 0) - delta;
  queryClient.setQueryData(['notifications-unread'], next);
  patchAllLayoutBadges((data) => ({
    ...data,
    notif: Math.max(0, (typeof data.notif === 'number' ? data.notif : next + delta) - delta),
  }));
  dispatchMessagesRefresh({ notif: next, skipRefetch: true });
}

/**
 * Mark a conversation as read in list caches and subtract from the nav message badge.
 * @param {'dm'|'group'|'venue_table'|'promoter_venue'} kind
 * @param {string} id
 * @param {{ listOnly?: boolean }} [opts] listOnly: clear row badge immediately without touching nav totals
 *   (use before the server mark-read request finishes).
 */
export function markConversationReadInCaches(kind, id, opts = {}) {
  if (!id) return;

  const pendingKey = `${kind}:${id}`;
  let cleared = 0;

  if (kind === 'dm') {
    cleared = mapListCache(['dm-conversations'], (c) => {
      if (c?.conversationId !== id) return { row: c, cleared: 0 };
      const n = Number(c.unreadCount) || 0;
      return { row: { ...c, unreadCount: 0 }, cleared: n };
    });
  } else if (kind === 'group') {
    cleared = mapListCache(['group-chats-mine'], (g) => {
      if (g?.groupChatId !== id) return { row: g, cleared: 0 };
      const n = Number(g.unreadCount) || 0;
      return { row: { ...g, unreadCount: 0 }, cleared: n };
    });
  } else if (kind === 'venue_table') {
    cleared = mapListCache(['venue-table-threads-mine'], (t) => {
      if (t?.threadId !== id) return { row: t, cleared: 0 };
      const n = Number(t.unreadCount) || 0;
      return { row: { ...t, unreadCount: 0 }, cleared: n };
    });
  } else if (kind === 'promoter_venue') {
    cleared = mapListCache(['promoter-venue-threads-mine'], (t) => {
      if (t?.threadId !== id) return { row: t, cleared: 0 };
      const n = Number(t.unreadCount) || 0;
      return { row: { ...t, unreadCount: 0 }, cleared: n };
    });
  }

  if (opts.listOnly) {
    if (cleared > 0) {
      pendingReadClears.set(
        pendingKey,
        Math.max(pendingReadClears.get(pendingKey) || 0, cleared),
      );
    }
    return;
  }

  const pending = pendingReadClears.get(pendingKey) || 0;
  pendingReadClears.delete(pendingKey);
  const totalCleared = Math.max(cleared, pending);

  if (totalCleared > 0) {
    let nextMsgs = null;
    patchAllLayoutBadges((data) => {
      const msgs = Math.max(0, (Number(data.msgs) || 0) - totalCleared);
      nextMsgs = msgs;
      return { ...data, msgs };
    });
    dispatchMessagesRefresh({ msgs: nextMsgs ?? 0 });
  } else {
    dispatchMessagesRefresh();
  }
}
