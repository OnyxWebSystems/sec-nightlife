import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  friend_request: UserPlus,
  table_invite: Users,
  table_request: Users,
  job_application: Briefcase,
  message: MessageCircle,
  event_reminder: Calendar,
  payment: DollarSign,
  compliance: Bell,
  system: Bell
};

const NOTIFICATION_COLORS = {
  friend_request: 'sec-badge-silver',
  table_invite: 'sec-badge-success',
  table_request: 'sec-badge-success',
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
    queryFn: () => apiGet('/api/notifications')
      .then((rows) => (Array.isArray(rows) ? rows : []).map((n) => ({
        ...n,
        message: n.body ?? n.message,
        created_date: n.created_at ?? n.created_date,
      }))),
    enabled: !!user?.id,
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
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => markAsReadMutation.mutateAsync(n.id)));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.03 }}
                className={`mb-2 p-4 glass-card rounded-xl ${!notification.is_read ? 'border-l-2' : ''}`}
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
                        to={notification.action_url}
                        className="inline-flex items-center gap-1 mt-2 text-sm sec-link"
                    style={{ color: 'var(--sec-accent)' }}
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                      >
                        View details <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>

                  <button
                    onClick={() => deleteMutation.mutate(notification.id)}
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