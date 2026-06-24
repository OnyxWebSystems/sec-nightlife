import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiDelete } from '@/api/client';
import { createPageUrl } from '@/utils';
import { format, parseISO } from 'date-fns';
import { Users, Trash2, TrendingUp, Ticket } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

function historyHref(row) {
  if (row.venueTableId) return createPageUrl(`TableDetails?id=${row.venueTableId}&source=venue`);
  if (row.hostedTableId) return createPageUrl(`TableDetails?id=${row.hostedTableId}&source=hosted`);
  if (row.tableId) return createPageUrl(`TableDetails?id=${row.tableId}`);
  if (row.eventId) return createPageUrl(`EventDetails?id=${row.eventId}`);
  return null;
}

function roleLabel(role) {
  if (role === 'host') return 'Hosted';
  if (role === 'attended') return 'Attended';
  return 'Joined';
}

function roleStyles(role) {
  if (role === 'host') {
    return {
      badge: 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]',
      icon: 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]',
    };
  }
  if (role === 'attended') {
    return {
      badge: 'bg-[var(--sec-info-muted)] text-[var(--sec-info)]',
      icon: 'bg-[var(--sec-info-muted)] text-[var(--sec-info)]',
    };
  }
  return {
    badge: 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]',
    icon: 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]',
  };
}

function displayTitle(row) {
  if (row.role === 'attended') return row.eventTitle || row.tableName || 'Event';
  return row.tableName || row.eventTitle || 'Event';
}

export default function TableHistorySection({ userId, isOwn = false, limit = 8 }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['table-history', userId],
    queryFn: () => apiGet(`/api/users/${userId}/table-history?limit=${limit}`),
    enabled: !!userId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (row) => {
      if (row.ticketId) {
        await apiDelete(`/api/tickets/my/${encodeURIComponent(row.ticketId)}`);
        return;
      }
      await apiDelete(`/api/users/me/table-history/${encodeURIComponent(row.id)}`);
    },
    onSuccess: () => {
      toast.success('Removed from event history');
      queryClient.invalidateQueries({ queryKey: ['table-history', userId] });
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || 'Could not remove'),
  });

  const items = data?.items ?? [];
  const canDelete = isOwn || data?.isOwn;

  if (isLoading) {
    return <div className="text-center py-6 text-gray-500 text-sm">Loading event history...</div>;
  }

  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
        Event History
      </h3>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((row, index) => {
            const href = historyHref(row);
            const styles = roleStyles(row.role);
            const Icon = row.role === 'attended' ? Ticket : Users;
            const inner = (
              <>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${styles.icon}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{displayTitle(row)}</p>
                  {row.role !== 'attended' && row.eventTitle && row.tableName && (
                    <p className="text-xs text-gray-500 truncate">{row.eventTitle}</p>
                  )}
                  {row.role === 'attended' && row.tableName && (
                    <p className="text-xs text-gray-500 truncate">{row.tableName}</p>
                  )}
                  <p className="text-xs text-gray-600">
                    {row.occurredAt && format(parseISO(row.occurredAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${styles.badge}`}>
                  {roleLabel(row.role)}
                </span>
                {canDelete && row.id && !String(row.id).startsWith('synth-') && (
                  <button
                    type="button"
                    className="p-2 text-gray-500 hover:text-red-400 shrink-0"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteMutation.mutate(row);
                    }}
                    aria-label="Remove from history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            );

            return (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {href ? (
                  <Link
                    to={href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]">{inner}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No event history yet</p>
        </div>
      )}
    </div>
  );
}
