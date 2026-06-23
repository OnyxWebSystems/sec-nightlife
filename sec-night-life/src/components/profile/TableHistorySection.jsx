import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiDelete } from '@/api/client';
import { createPageUrl } from '@/utils';
import { format, parseISO } from 'date-fns';
import { Users, Trash2, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

function historyHref(row) {
  if (row.venueTableId) return createPageUrl(`TableDetails?id=${row.venueTableId}&source=venue`);
  if (row.hostedTableId) return createPageUrl(`TableDetails?id=${row.hostedTableId}&source=hosted`);
  if (row.tableId) return createPageUrl(`TableDetails?id=${row.tableId}`);
  if (row.eventId) return createPageUrl(`EventDetails?id=${row.eventId}`);
  return null;
}

export default function TableHistorySection({ userId, isOwn = false, limit = 8 }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['table-history', userId],
    queryFn: () => apiGet(`/api/users/${userId}/table-history?limit=${limit}`),
    enabled: !!userId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/api/users/me/table-history/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Removed from table history');
      queryClient.invalidateQueries({ queryKey: ['table-history', userId] });
    },
    onError: (e) => toast.error(e?.message || 'Could not remove'),
  });

  const items = data?.items ?? [];
  const canDelete = isOwn || data?.isOwn;

  if (isLoading) {
    return <div className="text-center py-6 text-gray-500 text-sm">Loading table history...</div>;
  }

  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
        Table History
      </h3>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((row, index) => {
            const href = historyHref(row);
            const inner = (
              <>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  row.role === 'host'
                    ? 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]'
                    : 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]'
                }`}>
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{row.tableName || 'Table'}</p>
                  {row.eventTitle && (
                    <p className="text-xs text-gray-500 truncate">{row.eventTitle}</p>
                  )}
                  <p className="text-xs text-gray-600">
                    {row.occurredAt && format(parseISO(row.occurredAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${
                  row.role === 'host'
                    ? 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]'
                    : 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]'
                }`}>
                  {row.role === 'host' ? 'Hosted' : 'Joined'}
                </span>
                {canDelete && row.id && !String(row.id).startsWith('synth-') && (
                  <button
                    type="button"
                    className="p-2 text-gray-500 hover:text-red-400 shrink-0"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteMutation.mutate(row.id);
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
          <p className="text-gray-500 text-sm">No table history yet</p>
        </div>
      )}
    </div>
  );
}
