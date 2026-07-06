import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  Bell,
  Check,
  X,
  ChevronRight,
  Trash2,
  Star,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NOTIFICATION_ICONS, NOTIFICATION_COLORS } from './notificationConstants';

const actionBtnClass =
  'min-h-[44px] min-w-[44px] p-2 hover:bg-white/5 rounded-lg transition-colors flex items-center justify-center';

export default function NotificationCard({
  notification,
  index,
  isFavorite,
  isArchived,
  onOpen,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  resolveActionUrl,
  onMarkAsRead,
}) {
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const colorClass = NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.system;
  const actionUrl = resolveActionUrl(notification);

  const timestamp =
    notification.created_date &&
    formatDistanceToNow(
      typeof notification.created_date === 'string'
        ? parseISO(notification.created_date)
        : notification.created_date,
      { addSuffix: false },
    );

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(notification)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(notification)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.03 }}
      className={`mb-2 p-4 glass-card rounded-xl cursor-pointer relative ${!notification.is_read ? 'border-l-2' : ''}`}
      style={!notification.is_read ? { borderLeftColor: 'var(--sec-success)' } : {}}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
              <h3
                className={`font-medium flex items-center gap-2 ${!notification.is_read ? 'text-white' : 'text-gray-400'}`}
              >
                {!notification.is_read ? (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--sec-success)' }}
                    aria-label="Unread"
                  />
                ) : null}
                <span className="line-clamp-2">{notification.title}</span>
              </h3>
              {timestamp ? (
                <span className="text-xs text-gray-600 shrink-0 sm:ml-2">{timestamp}</span>
              ) : null}
            </div>

            <p className="text-sm text-gray-500 mt-0.5 line-clamp-3">{notification.message}</p>

            {notification.type === 'friend_request' && !notification.is_read && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1 min-h-[44px] sec-btn-primary">
                  <Check className="w-4 h-4 mr-1" />
                  Accept
                </Button>
                <Button size="sm" variant="outline" className="flex-1 min-h-[44px] border-[#262629]">
                  <X className="w-4 h-4 mr-1" />
                  Decline
                </Button>
              </div>
            )}

            {notification.type === 'table_request' && !notification.is_read && (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="flex-1 min-h-[44px]"
                  style={{ backgroundColor: 'var(--sec-success)', color: '#000' }}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" className="flex-1 min-h-[44px] border-[#262629]">
                  <X className="w-4 h-4 mr-1" />
                  Decline
                </Button>
              </div>
            )}

            {actionUrl && !['friend_request', 'table_request'].includes(notification.type) && (
              <Link
                to={actionUrl}
                className="inline-flex items-center gap-1 mt-2 text-sm sec-link"
                style={{ color: 'var(--sec-accent)' }}
                onClick={() => onMarkAsRead(notification.id)}
              >
                View details <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-1 border-t border-[var(--sec-border)] pt-3 sm:border-0 sm:pt-0 sm:flex-col sm:gap-0 sm:shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => onToggleFavorite(notification.id)}
            className={actionBtnClass}
            title={isFavorite ? 'Unfavorite' : 'Favorite'}
            aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'text-yellow-400' : 'text-gray-600'}`} />
          </button>
          <button
            type="button"
            onClick={() => onToggleArchive(notification.id)}
            className={actionBtnClass}
            title={isArchived ? 'Unarchive' : 'Archive'}
            aria-label={isArchived ? 'Unarchive' : 'Archive'}
          >
            <Archive className="w-4 h-4 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(notification.id)}
            className={actionBtnClass}
            title="Delete (undo available)"
            aria-label="Delete notification"
          >
            <Trash2 className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
