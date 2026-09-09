import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl, buildPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/api/client';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import PageBackHeader from '@/components/layout/PageBackHeader';
import NotificationCard from '@/components/notifications/NotificationCard';
import { Bell, RotateCcw, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  clearNotificationUnreadBadges,
  decrementNotificationUnreadBadges,
} from '@/lib/messagesRefresh';

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('all'); // all | favorites | archived
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [archivedIds, setArchivedIds] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const venueScope = useBusinessVenueScope();

  const businessMode = (() => {
    try {
      const mode = localStorage.getItem('sec_active_mode');
      return user?.role === 'VENUE' || mode === 'business';
    } catch {
      return user?.role === 'VENUE';
    }
  })();

  const venueScopeSuffix =
    businessMode && venueScope.venueQuery
      ? `_${venueScope.staffContextToken || venueScope.venueId || 'scoped'}`
      : '';

  const favKey = user?.id ? `sec_notifications_favorites_${user.id}${venueScopeSuffix}` : null;
  const archivedKey = user?.id ? `sec_notifications_archived_${user.id}${venueScopeSuffix}` : null;
  const deletedKey = user?.id ? `sec_notifications_deleted_${user.id}${venueScopeSuffix}` : null;

  const isBusinessViewer = () => businessMode;

  const withVenueQuery = (path) => {
    if (!businessMode || !venueScope.venueQuery || !path) return path;
    const sep = path.includes('?') ? '&' : '?';
    if (path.includes('venue_id=') || path.includes('staff_ctx=')) return path;
    return `${path}${sep}${venueScope.venueQuery}`;
  };

  const normalizeActionUrl = (notification) => {
    const fromField = notification?.action_url ?? notification?.actionUrl;
    if (fromField) return fromField;
    if (notification?.referenceType === 'ROUTE' || notification?.referenceType === 'LEGACY') {
      const ref = notification?.referenceId;
      if (typeof ref === 'string' && ref.startsWith('/')) return ref;
    }
    return null;
  };

  const resolveActionUrl = (notification) => {
    const raw = normalizeActionUrl(notification);
    if (!raw) return raw;
    if (notification?.type !== 'message' && notification?.type !== 'job_application') return raw;

    if (!isBusinessViewer()) return raw;

    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.pathname === '/MyJobApplications') {
        const jobId = parsed.searchParams.get('jobId');
        return jobId ? `/JobDetails?id=${jobId}` : raw;
      }
      if (parsed.pathname.includes('MyJobApplications') && parsed.searchParams.get('applicationId')) {
        return `/BusinessJobs?application=${parsed.searchParams.get('applicationId')}`;
      }
      return raw;
    } catch {
      return raw;
    }
  };

  function extractTableIdFromNotification(n, actionUrl) {
    const ref = n.referenceId;
    if (ref && typeof ref === 'string' && !ref.startsWith('/') && !ref.includes('?')) {
      return ref;
    }
    if (ref && typeof ref === 'string' && ref.includes('id=')) {
      const fromRef = extractQueryParam(ref.startsWith('/') ? ref : `/?${ref}`, 'id');
      if (fromRef && !fromRef.includes('/')) return fromRef;
    }
    const fromUrl = extractQueryParam(actionUrl, 'id');
    if (fromUrl && !fromUrl.includes('/')) return fromUrl;
    return null;
  }

  const resolveNotificationDestination = (n) => {
    const t = n.type;
    const actionUrl = resolveActionUrl(n);
    const business = isBusinessViewer();

    if (t === 'FRIEND_REQUEST' || t === 'friend_request') {
      return `${createPageUrl('Friends')}?tab=requests`;
    }
    if (t === 'FRIEND_ACCEPTED') return `${createPageUrl('Friends')}?tab=all`;

    if (t === 'PLATFORM_ANNOUNCEMENT' || t === 'VENDOR_LISTING_REMINDER') {
      if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
        return n.referenceId;
      }
      return t === 'VENDOR_LISTING_REMINDER'
        ? createPageUrl('VendorBusinessSettings')
        : createPageUrl('Home');
    }

    if (t === 'TABLE_REQUEST' || t === 'table_request') {
      return business ? withVenueQuery(`${createPageUrl('BusinessVenueTables')}?tab=requests`) : null;
    }
    if (t === 'TABLE_APPROVED' || t === 'table_approved') {
      const tableId = extractTableIdFromNotification(n, actionUrl);
      return tableId
        ? buildPageUrl('TableDetails', { id: tableId, source: 'venue', checkout: '1' })
        : actionUrl;
    }
    if (t === 'TABLE_DECLINED') {
      const threadId =
        (n.referenceId && !String(n.referenceId).includes('/')
          ? n.referenceId
          : null) || extractQueryParam(actionUrl, 'venueTableThread');
      if (threadId && !threadId.includes('/')) {
        return `${createPageUrl('Messages')}?venueTableThread=${encodeURIComponent(threadId)}`;
      }
      const tableId = extractTableIdFromNotification(n, actionUrl);
      return tableId ? buildPageUrl('TableDetails', { id: tableId, source: 'venue' }) : actionUrl;
    }
    if (t === 'TABLE_MESSAGE') {
      const promoterVenue = extractQueryParam(actionUrl, 'promoterVenue');
      if (promoterVenue) {
        return business
          ? withVenueQuery(`${createPageUrl('BusinessMessages')}?tab=promoters&promoterVenue=${encodeURIComponent(promoterVenue)}`)
          : `${createPageUrl('Messages')}?promoterVenue=${encodeURIComponent(promoterVenue)}`;
      }
      const threadId = n.referenceId || extractQueryParam(actionUrl, 'venueTableThread');
      if (!threadId) return actionUrl;
      return business
        ? withVenueQuery(`${createPageUrl('BusinessMessages')}?tab=tables&thread=${encodeURIComponent(threadId)}`)
        : `${createPageUrl('Messages')}?venueTableThread=${encodeURIComponent(threadId)}`;
    }

    if (t === 'PROMOTER_EVENT_ASSIGNED') {
      const promoterVenue = extractQueryParam(actionUrl, 'promoterVenue');
      if (promoterVenue) {
        return `${createPageUrl('Messages')}?promoterVenue=${encodeURIComponent(promoterVenue)}`;
      }
      if (actionUrl) return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
      return createPageUrl('Messages');
    }

    if (t === 'VENUE_STAFF_ASSIGNED') {
      return createPageUrl('StaffDashboard');
    }

    if (t === 'VENUE_FOLLOW' && n.referenceId) {
      return `${createPageUrl('UserProfile')}?id=${encodeURIComponent(n.referenceId)}`;
    }

    if (t === 'DIRECT_MESSAGE' && n.referenceId) {
      return `${createPageUrl('Messages')}?dm=${n.referenceId}`;
    }
    if ((t === 'GROUP_MESSAGE' || t === 'JOIN_REQUEST_ACCEPTED') && n.referenceId) {
      if (n.referenceType === 'HOSTED_TABLE_GROUP_CHAT') {
        return `${createPageUrl('Messages')}?group=${encodeURIComponent(n.referenceId)}&gk=HOSTED_TABLE`;
      }
      if (n.referenceType === 'GROUP_CHAT') {
        return `${createPageUrl('Messages')}?group=${encodeURIComponent(n.referenceId)}`;
      }
      if (n.referenceType === 'HOSTED_TABLE') {
        return buildPageUrl('TableDetails', { id: n.referenceId, source: 'hosted', checkout: '1' });
      }
      if (t === 'JOIN_REQUEST_ACCEPTED') {
        const tableId = extractTableIdFromNotification(n, actionUrl) || n.referenceId;
        if (tableId && !String(tableId).includes('/')) {
          const needsCheckout = actionUrl?.includes('checkout=1');
          return buildPageUrl('TableDetails', {
            id: tableId,
            source: 'hosted',
            ...(needsCheckout ? { checkout: '1' } : {}),
          });
        }
      }
      return `${createPageUrl('Messages')}?group=${encodeURIComponent(n.referenceId)}`;
    }

    if (t === 'TABLE_JOIN_REQUEST' && n.referenceId) {
      return `${createPageUrl('HostDashboard')}?tab=tables&requests=${encodeURIComponent(n.referenceId)}`;
    }

    if (t === 'IDENTITY_VERIFICATION_REMINDER') {
      if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
        return n.referenceId;
      }
      return createPageUrl('EditProfile');
    }

    if (t === 'TABLE_INVITE' || t === 'table_invite') {
      const id = extractTableIdFromNotification(n, actionUrl);
      if (id) {
        const isHostedInvite =
          n.referenceType === 'TABLE_INVITE' ||
          n.referenceType === 'HOSTED_TABLE' ||
          !n.referenceType;
        if (isHostedInvite) {
          return buildPageUrl('TableDetails', { id, source: 'hosted', join: '1' });
        }
        return buildPageUrl('TableDetails', { id, source: 'venue' });
      }
    }
    if (t === 'EVENT_INTEREST_REMINDER' && n.referenceId) {
      return `${createPageUrl('EventDetails')}?id=${n.referenceId}`;
    }
    if (t === 'event_reminder' && n.referenceId) {
      return `${createPageUrl('EventDetails')}?id=${n.referenceId}`;
    }

    if (t === 'message' || t === 'job_application') {
      if (actionUrl) {
        const path = actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
        return business ? withVenueQuery(path) : path;
      }
      return business ? withVenueQuery(createPageUrl('BusinessJobs')) : createPageUrl('MyJobApplications');
    }

    if (t === 'payment' || t === 'system' || t === 'table_update' || t === 'table_full') {
      if (actionUrl) {
        if (actionUrl.includes('Profile') || actionUrl.includes('Tickets')) {
          return `${createPageUrl('Profile')}?tab=tickets`;
        }
        return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
      }
    }

    if (n.referenceType === 'TICKET') {
      return `${createPageUrl('Profile')}?tab=tickets`;
    }

    if (t === 'TABLE_JOINED' || t === 'EVENT_JOINED') {
      if (n.referenceType === 'HOSTED_TABLE' && n.referenceId) {
        if (n.title === 'Join request' || (n.body && String(n.body).includes('requested to join'))) {
          return `${createPageUrl('HostDashboard')}?tab=tables&requests=${encodeURIComponent(n.referenceId)}`;
        }
        return buildPageUrl('TableDetails', { id: n.referenceId, source: 'hosted' });
      }
      if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
        return n.referenceId;
      }
      const hostPaymentTitle =
        typeof n.title === 'string' &&
        (/host payment confirmed/i.test(n.title) ||
          /host booking confirmed/i.test(n.title) ||
          /hosted table payment confirmed/i.test(n.title));
      if (hostPaymentTitle) {
        return `${createPageUrl('HostDashboard')}?tab=tables&manage=1`;
      }
      if (actionUrl) {
        if (actionUrl.includes('Profile') || actionUrl.includes('Tickets')) {
          return `${createPageUrl('Profile')}?tab=tickets`;
        }
        return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
      }
      return `${createPageUrl('Profile')}?tab=tickets`;
    }

    if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
      return n.referenceId;
    }

    return actionUrl ? (actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`) : null;
  };

  function extractQueryParam(url, key) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.searchParams.get(key);
    } catch {
      const m = url.match(new RegExp(`[?&]${key}=([^&]+)`));
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.loadUserOrLogin();
      setUser(currentUser);
    } catch {
      // loadUserOrLogin redirects when no session remains
    }
  };

  useEffect(() => {
    if (!favKey || !archivedKey || !deletedKey) return;
    try {
      setFavoriteIds(JSON.parse(localStorage.getItem(favKey) || '[]'));
      setArchivedIds(JSON.parse(localStorage.getItem(archivedKey) || '[]'));
      setDeletedIds(JSON.parse(localStorage.getItem(deletedKey) || '[]'));
    } catch {
      setFavoriteIds([]);
      setArchivedIds([]);
      setDeletedIds([]);
    }
  }, [favKey, archivedKey, deletedKey]);

  useEffect(() => {
    if (!favKey) return;
    localStorage.setItem(favKey, JSON.stringify(favoriteIds));
  }, [favKey, favoriteIds]);

  useEffect(() => {
    if (!archivedKey) return;
    localStorage.setItem(archivedKey, JSON.stringify(archivedIds));
  }, [archivedKey, archivedIds]);

  useEffect(() => {
    if (!deletedKey) return;
    localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
  }, [deletedKey, deletedIds]);

  const notificationScopeKey = venueScope.staffContextToken || venueScope.venueId || null;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.id, businessMode ? notificationScopeKey : null],
    queryFn: () => {
      const qs = businessMode && venueScope.venueQuery ? `&${venueScope.venueQuery}` : '';
      return apiGet(`/api/notifications?limit=100${qs}`).then((rows) =>
        (Array.isArray(rows) ? rows : []).map((n) => {
          const actionFromRef =
            (n.referenceType === 'ROUTE' || n.referenceType === 'LEGACY') &&
            typeof n.referenceId === 'string' &&
            n.referenceId.startsWith('/')
              ? n.referenceId
              : null;
          return {
            ...n,
            message: n.body ?? n.message,
            action_url: n.action_url ?? n.actionUrl ?? actionFromRef ?? null,
            is_read: n.read === true || n.is_read === true,
            created_date: n.createdAt ?? n.created_at ?? n.created_date,
          };
        }),
      );
    },
    enabled: !!user?.id && (!businessMode || !!venueScope.venueQuery),
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => apiPatch(`/api/notifications/${id}/read`),
    onMutate: async (id) => {
      const listKeys = queryClient.getQueriesData({ queryKey: ['notifications'] });
      let wasUnread = false;
      for (const [key, data] of listKeys) {
        if (!Array.isArray(data)) continue;
        const row = data.find((n) => n.id === id);
        if (row && !row.is_read && row.read !== true) wasUnread = true;
        queryClient.setQueryData(key, (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((n) =>
            n.id === id ? { ...n, is_read: true, read: true } : n,
          );
        });
      }
      if (wasUnread) decrementNotificationUnreadBadges(1);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: (id) => apiPatch(`/api/notifications/${id}/unread`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
    },
  });

  const visibleNotifications = useMemo(() => {
    const base = notifications.filter((n) => !deletedIds.includes(n.id));
    if (view === 'favorites') return base.filter((n) => favoriteIds.includes(n.id));
    if (view === 'archived') return base.filter((n) => archivedIds.includes(n.id));
    return base.filter((n) => !archivedIds.includes(n.id));
  }, [notifications, deletedIds, view, favoriteIds, archivedIds]);

  const unreadCount = visibleNotifications.filter((n) => !n.is_read).length;

  const markAllAsRead = async () => {
    const visibleUnread = visibleNotifications.filter((n) => !n.is_read).length;
    if (visibleUnread === 0) return;
    // Optimistic: clear badges + list immediately so Home/nav don't keep a stale count.
    clearNotificationUnreadBadges();
    queryClient.setQueriesData({ queryKey: ['notifications'] }, (prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((n) => ({ ...n, is_read: true, read: true }));
    });
    try {
      const qs = businessMode && venueScope.venueQuery ? `?${venueScope.venueQuery}` : '';
      await apiPatch(`/api/notifications/read-all${qs}`, {});
      toast.success('All notifications marked as read');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
    } catch {
      toast.error('Could not mark notifications as read');
      window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
    }
  };

  const openNotification = async (n) => {
    await markAsReadMutation.mutateAsync(n.id);
    const dest = resolveNotificationDestination(n);
    if (dest) {
      if (isBusinessViewer() && dest.includes('/Messages') && !dest.includes('BusinessMessages')) {
        toast.message('Switch to Party Goer mode to view this message', { duration: 4000 });
      }
      navigate(dest);
    }
  };

  const toggleFavorite = (notificationId) => {
    const wasFav = favoriteIds.includes(notificationId);
    if (wasFav) {
      setFavoriteIds((prev) => prev.filter((id) => id !== notificationId));
      toast('Removed from favorites', {
        action: {
          label: 'Undo',
          onClick: () => setFavoriteIds((prev) => (prev.includes(notificationId) ? prev : [...prev, notificationId])),
        },
      });
      return;
    }
    setFavoriteIds((prev) => [...prev, notificationId]);
    toast('Added to favorites', {
      action: {
        label: 'Undo',
        onClick: () => setFavoriteIds((prev) => prev.filter((id) => id !== notificationId)),
      },
    });
  };

  const toggleArchive = (notificationId) => {
    const wasArchived = archivedIds.includes(notificationId);
    if (wasArchived) {
      setArchivedIds((prev) => prev.filter((id) => id !== notificationId));
      toast('Restored from archive', {
        action: {
          label: 'Undo',
          onClick: () => setArchivedIds((prev) => (prev.includes(notificationId) ? prev : [...prev, notificationId])),
        },
      });
      return;
    }
    setArchivedIds((prev) => [...prev, notificationId]);
    toast('Archived notification', {
      action: {
        label: 'Undo',
        onClick: () => setArchivedIds((prev) => prev.filter((id) => id !== notificationId)),
      },
    });
  };

  const softDeleteNotification = (notificationId) => {
    if (deletedIds.includes(notificationId)) return;
    setDeletedIds((prev) => [...prev, notificationId]);
    toast('Notification deleted', {
      action: {
        label: 'Undo',
        onClick: () => setDeletedIds((prev) => prev.filter((id) => id !== notificationId)),
      },
    });
  };

  const headerSubtitle = (() => {
    if (unreadCount > 0) return `${unreadCount} unread`;
    if (businessMode && venueScope.venueName) return venueScope.venueName;
    return null;
  })();

  const headerActions = (
    <div className="flex items-center gap-1 shrink-0">
      {visibleNotifications.length > 0 && (
        <Button
          onClick={markAllAsRead}
          variant="ghost"
          size="sm"
          disabled={unreadCount === 0}
          className="min-h-[44px] px-2 sm:px-3"
          style={{ color: unreadCount === 0 ? 'var(--sec-text-muted)' : 'var(--sec-accent)' }}
          title="Mark all read"
          aria-label="Mark all read"
        >
          <CheckCheck className="w-4 h-4 sm:mr-1" />
          <span className="hidden sm:inline">Mark all read</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="min-h-[44px] px-2 sm:px-3"
        onClick={() => {
          const prev = { favoriteIds, archivedIds, deletedIds };
          setFavoriteIds([]);
          setArchivedIds([]);
          setDeletedIds([]);
          toast('Cleared local notification actions', {
            action: {
              label: 'Undo',
              onClick: () => {
                setFavoriteIds(prev.favoriteIds);
                setArchivedIds(prev.archivedIds);
                setDeletedIds(prev.deletedIds);
              },
            },
          });
        }}
        title="Undo local favorites/archive/delete changes"
        aria-label="Undo local changes"
      >
        <RotateCcw className="w-4 h-4 sm:mr-1" />
        <span className="hidden sm:inline">Undo</span>
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen">
      <PageBackHeader
        title="Notifications"
        subtitle={headerSubtitle}
        pageName="Notifications"
        rightSlot={headerActions}
      />

      <div className="py-4 lg:px-4">
        {businessMode ? (
          <div className="mb-4">
            <VenueSwitcher />
          </div>
        ) : null}
        <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          <Button variant={view === 'all' ? 'default' : 'outline'} size="sm" className="flex-shrink-0 min-h-[44px]" onClick={() => setView('all')}>All</Button>
          <Button variant={view === 'favorites' ? 'default' : 'outline'} size="sm" className="flex-shrink-0 min-h-[44px]" onClick={() => setView('favorites')}>Favorites</Button>
          <Button variant={view === 'archived' ? 'default' : 'outline'} size="sm" className="flex-shrink-0 min-h-[44px]" onClick={() => setView('archived')}>Archived</Button>
        </div>
        <AnimatePresence>
          {visibleNotifications.map((notification, index) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              index={index}
              isFavorite={favoriteIds.includes(notification.id)}
              isArchived={archivedIds.includes(notification.id)}
              onOpen={openNotification}
              onToggleFavorite={toggleFavorite}
              onToggleArchive={toggleArchive}
              onDelete={softDeleteNotification}
              resolveActionUrl={resolveActionUrl}
              onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
            />
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {visibleNotifications.length === 0 && !isLoading && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-[#141416] flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
            <p className="text-gray-500">No notifications yet</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-4 glass-card rounded-xl animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[#262629]" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-[#262629] mb-2" />
                  <div className="h-3 w-48 rounded bg-[#262629]" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}