import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/api/client';

/** Unread in-app notification count (excludes DMs / group chat messages). */
export function useNotificationUnreadCount(enabled = true) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => apiGet('/api/notifications/unread-count').then((r) => r?.count ?? 0),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onRefresh = () => queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    window.addEventListener('sec_notifications_refresh', onRefresh);
    return () => window.removeEventListener('sec_notifications_refresh', onRefresh);
  }, [queryClient]);

  return Math.max(0, Number(data) || 0);
}
