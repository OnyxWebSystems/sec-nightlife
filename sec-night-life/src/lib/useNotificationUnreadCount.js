import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/api/client';

/**
 * Unread in-app notification count.
 * Prefer Layout's layout-unread-badges cache to avoid a duplicate /notifications/unread-count.
 */
export function useNotificationUnreadCount(enabled = true) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const entries = queryClient.getQueriesData({ queryKey: ['layout-unread-badges'] });
      for (const [, d] of entries) {
        if (d && typeof d.notif === 'number') return d.notif;
      }
      const r = await apiGet('/api/notifications/unread-count');
      return r?.count ?? 0;
    },
    enabled,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['layout-unread-badges'] });
    };
    window.addEventListener('sec_notifications_refresh', onRefresh);
    return () => window.removeEventListener('sec_notifications_refresh', onRefresh);
  }, [queryClient]);

  // Live mirror of layout badges when present
  const badgeEntries = queryClient.getQueriesData({ queryKey: ['layout-unread-badges'] });
  for (const [, d] of badgeEntries) {
    if (d && typeof d.notif === 'number') return Math.max(0, d.notif);
  }

  return Math.max(0, Number(data) || 0);
}
