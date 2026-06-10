import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl, buildPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/api/client';
import { 
  Bell,
  Users,
  Calendar,
  MessageCircle,
  Briefcase,
  DollarSign,
  UserPlus,
  Check,
  X,
  ChevronRight,
  Trash2,
  Star,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const NOTIFICATION_ICONS = {
  FRIEND_REQUEST: UserPlus,
  FRIEND_ACCEPTED: UserPlus,
  DIRECT_MESSAGE: MessageCircle,
  GROUP_MESSAGE: Users,
  JOIN_REQUEST_ACCEPTED: Users,
  EVENT_JOINED: Calendar,
  TABLE_JOINED: Users,
  friend_request: UserPlus,
  table_invite: Users,
  TABLE_INVITE: Users,
  IDENTITY_VERIFICATION_REMINDER: Bell,
  EVENT_INTEREST_REMINDER: Calendar,
  table_request: Users,
  TABLE_REQUEST: Users,
  TABLE_APPROVED: Users,
  TABLE_DECLINED: Users,
  TABLE_MESSAGE: MessageCircle,
  table_update: Users,
  table_full: Users,
  job_application: Briefcase,
  message: MessageCircle,
  event_reminder: Calendar,
  payment: DollarSign,
  compliance: Bell,
  system: Bell
};

const NOTIFICATION_COLORS = {
  FRIEND_REQUEST: 'sec-badge-silver',
  FRIEND_ACCEPTED: 'sec-badge-silver',
  DIRECT_MESSAGE: 'sec-badge-silver',
  GROUP_MESSAGE: 'sec-badge-success',
  JOIN_REQUEST_ACCEPTED: 'sec-badge-success',
  friend_request: 'sec-badge-silver',
  table_invite: 'sec-badge-success',
  table_request: 'sec-badge-success',
  TABLE_REQUEST: 'sec-badge-success',
  TABLE_APPROVED: 'sec-badge-success',
  TABLE_DECLINED: 'sec-badge-danger',
  TABLE_MESSAGE: 'sec-badge-silver',
  table_update: 'sec-badge-silver',
  table_full: 'sec-badge-gold',
  job_application: 'sec-badge-gold',
  message: 'sec-badge-silver',
  event_reminder: 'sec-badge-silver',
  payment: 'sec-badge-success',
  compliance: 'sec-badge-gold',
  system: 'sec-badge-muted',
  EVENT_INTEREST_REMINDER: 'sec-badge-silver',
};

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('all'); // all | favorites | archived
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [archivedIds, setArchivedIds] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const favKey = user?.id ? `sec_notifications_favorites_${user.id}` : null;
  const archivedKey = user?.id ? `sec_notifications_archived_${user.id}` : null;
  const deletedKey = user?.id ? `sec_notifications_deleted_${user.id}` : null;

  const isBusinessViewer = () => {
    try {
      const mode = localStorage.getItem('sec_active_mode');
      return user?.role === 'VENUE' || mode === 'business';
    } catch {
      return user?.role === 'VENUE';
    }
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

    if (t === 'TABLE_REQUEST' || t === 'table_request') {
      return business ? `${createPageUrl('BusinessVenueTables')}?tab=requests` : null;
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
      const threadId = n.referenceId || extractQueryParam(actionUrl, 'venueTableThread');
      if (!threadId) return actionUrl;
      return business
        ? `${createPageUrl('BusinessMessages')}?tab=tables&thread=${encodeURIComponent(threadId)}`
        : `${createPageUrl('Messages')}?venueTableThread=${encodeURIComponent(threadId)}`;
    }

    if (t === 'DIRECT_MESSAGE' && n.referenceId) {
      return `${createPageUrl('Messages')}?dm=${n.referenceId}`;
    }
    if ((t === 'GROUP_MESSAGE' || t === 'JOIN_REQUEST_ACCEPTED') && n.referenceId) {
      if (n.referenceType === 'HOSTED_TABLE_GROUP_CHAT') {
        return `${createPageUrl('Messages')}?group=${encodeURIComponent(n.referenceId)}&gk=HOSTED_TABLE`;
      }
      return `${createPageUrl('Messages')}?group=${encodeURIComponent(n.referenceId)}`;
    }

    if (t === 'IDENTITY_VERIFICATION_REMINDER') {
      if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
        return n.referenceId;
      }
      return createPageUrl('EditProfile');
    }

    if (t === 'TABLE_INVITE' || t === 'table_invite') {
      const id = extractTableIdFromNotification(n, actionUrl);
      if (id) return buildPageUrl('TableDetails', { id, source: 'venue' });
    }
    if (t === 'EVENT_INTEREST_REMINDER' && n.referenceId) {
      return `${createPageUrl('EventDetails')}?id=${n.referenceId}`;
    }
    if (t === 'event_reminder' && n.referenceId) {
      return `${createPageUrl('EventDetails')}?id=${n.referenceId}`;
    }

    if (t === 'message' || t === 'job_application') {
      if (actionUrl) return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
      return business ? createPageUrl('BusinessJobs') : createPageUrl('MyJobApplications');
    }

    if (t === 'payment' || t === 'system' || t === 'table_update' || t === 'table_full') {
      if (actionUrl) {
        if (actionUrl.includes('Profile') || actionUrl.includes('Tickets')) {
          return `${createPageUrl('Profile')}?tab=tickets`;
        }
        return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
      }
    }

    if (t === 'TABLE_JOINED' || t === 'EVENT_JOINED') {
      if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
        return n.referenceId;
      }
      if (actionUrl) return actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
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
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (e) {
      authService.redirectToLogin();
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

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () =>
      apiGet('/api/notifications?limit=100').then((rows) =>
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
      ),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => apiPatch(`/api/notifications/${id}/read`),
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
    try {
      await apiPatch('/api/notifications/read-all', {});
      toast.success('All notifications marked as read');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
    } catch {
      toast.error('Could not mark notifications as read');
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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-500">{unreadCount} unread</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {visibleNotifications.length > 0 && (
                <Button
                  onClick={markAllAsRead}
                  variant="ghost"
                  disabled={unreadCount === 0}
                  style={{ color: unreadCount === 0 ? 'var(--sec-text-muted)' : 'var(--sec-accent)' }}
                >
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
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
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Undo
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-4">
        <div className="mb-3 flex gap-2">
          <Button variant={view === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setView('all')}>All</Button>
          <Button variant={view === 'favorites' ? 'default' : 'outline'} size="sm" onClick={() => setView('favorites')}>Favorites</Button>
          <Button variant={view === 'archived' ? 'default' : 'outline'} size="sm" onClick={() => setView('archived')}>Archived</Button>
        </div>
        {/* Notifications List */}
        <AnimatePresence>
          {visibleNotifications.map((notification, index) => {
            const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
            const colorClass = NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.system;

            return (
              <motion.div
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => openNotification(notification)}
                onKeyDown={(e) => e.key === 'Enter' && openNotification(notification)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.03 }}
                className={`mb-2 p-4 glass-card rounded-xl cursor-pointer ${!notification.is_read ? 'border-l-2' : ''}`}
                style={!notification.is_read ? { borderLeftColor: 'var(--sec-accent)' } : {}}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className={`font-medium ${!notification.is_read ? 'text-white' : 'text-gray-400'}`}>
                          {notification.title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
                      </div>
                      {notification.created_date && (
                        <span className="text-xs text-gray-600 flex-shrink-0 ml-2">
                          {formatDistanceToNow(typeof notification.created_date === 'string' ? parseISO(notification.created_date) : notification.created_date, { addSuffix: false })}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons for specific types */}
                    {notification.type === 'friend_request' && !notification.is_read && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="h-8 sec-btn-primary">
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 border-[#262629]">
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    )}

                    {notification.type === 'table_request' && !notification.is_read && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="h-8" style={{ backgroundColor: 'var(--sec-success)', color: '#000' }}>
                          <Check className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 border-[#262629]">
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    )}

                    {notification.action_url && !['friend_request', 'table_request'].includes(notification.type) && (
                      <Link
                        to={resolveActionUrl(notification)}
                        className="inline-flex items-center gap-1 mt-2 text-sm sec-link"
                    style={{ color: 'var(--sec-accent)' }}
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                      >
                        View details <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(notification.id);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    title={favoriteIds.includes(notification.id) ? 'Unfavorite' : 'Favorite'}
                  >
                    <Star className={`w-4 h-4 ${favoriteIds.includes(notification.id) ? 'text-yellow-400' : 'text-gray-600'}`} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArchive(notification.id);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    title={archivedIds.includes(notification.id) ? 'Unarchive' : 'Archive'}
                  >
                    <Archive className="w-4 h-4 text-gray-600" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      softDeleteNotification(notification.id);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    title="Delete (undo available)"
                  >
                    <Trash2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </motion.div>
            );
          })}
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