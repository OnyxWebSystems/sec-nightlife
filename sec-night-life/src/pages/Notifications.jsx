import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiDelete } from '@/api/client';
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
  Trash2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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
  table_request: Users,
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
  table_update: 'sec-badge-silver',
  table_full: 'sec-badge-gold',
  job_application: 'sec-badge-gold',
  message: 'sec-badge-silver',
  event_reminder: 'sec-badge-silver',
  payment: 'sec-badge-success',
  compliance: 'sec-badge-gold',
  system: 'sec-badge-muted'
};

export default function Notifications() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const resolveActionUrl = (notification) => {
    const raw = notification?.action_url;
    if (!raw) return raw;
    if (notification?.type !== 'message') return raw;

    const mode = (() => {
      try {
        return localStorage.getItem('sec_active_mode');
      } catch {
        return null;
      }
    })();
    const isBusinessViewer = user?.role === 'VENUE' || mode === 'business';
    if (!isBusinessViewer) return raw;

    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.pathname !== '/MyJobApplications') return raw;
      const jobId = parsed.searchParams.get('jobId');
      return jobId ? `/JobDetails?id=${jobId}` : raw;
    } catch {
      return raw;
    }
  };

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

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () =>
      apiGet('/api/notifications').then((rows) =>
        (Array.isArray(rows) ? rows : []).map((n) => ({
          ...n,
          message: n.body ?? n.message,
          action_url: n.action_url ?? n.actionUrl ?? null,
          is_read: n.read === true || n.is_read === true,
          created_date: n.createdAt ?? n.created_at ?? n.created_date,
        })),
      ),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => apiPatch(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllAsRead = async () => {
    await apiPatch('/api/notifications/read-all', {});
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const openNotification = async (n) => {
    await markAsReadMutation.mutateAsync(n.id);
    const t = n.type;
    const actionUrl = resolveActionUrl(n);
    if (t === 'FRIEND_REQUEST' || t === 'friend_request') navigate(`${createPageUrl('Friends')}?tab=requests`);
    else if (t === 'FRIEND_ACCEPTED') navigate(`${createPageUrl('Friends')}?tab=all`);
    else if (t === 'DIRECT_MESSAGE' && n.referenceId) navigate(`${createPageUrl('Messages')}?dm=${n.referenceId}`);
    else if ((t === 'GROUP_MESSAGE' || t === 'JOIN_REQUEST_ACCEPTED') && n.referenceId) {
      navigate(`${createPageUrl('Messages')}?group=${n.referenceId}`);
    } else if (t === 'IDENTITY_VERIFICATION_REMINDER') {
      navigate(createPageUrl('EditProfile'));
    } else if (t === 'TABLE_INVITE' && n.referenceId) {
      navigate(`${createPageUrl('TableDetails')}?id=${n.referenceId}`);
    } else if (n.referenceType === 'ROUTE' && typeof n.referenceId === 'string' && n.referenceId.startsWith('/')) {
      navigate(n.referenceId);
    } else if (actionUrl) {
      navigate(actionUrl);
    }
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
            {unreadCount > 0 && (
              <Button
                onClick={markAllAsRead}
                variant="ghost"
                style={{ color: 'var(--sec-accent)' }}
              >
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-4">
        {/* Notifications List */}
        <AnimatePresence>
          {notifications.map((notification, index) => {
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
                      deleteMutation.mutate(notification.id);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty State */}
        {notifications.length === 0 && !isLoading && (
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