import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPatch } from '@/api/client';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Briefcase, Armchair } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export default function BusinessMessages() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['business-inbox', filter],
    queryFn: () => apiGet(`/api/business/inbox?type=${filter === 'all' ? 'all' : filter}`),
  });

  const items = data?.items ?? [];

  const reviewTable = async (item, action) => {
    try {
      await apiPatch(`/api/venue-tables/${item.referenceId}/reservations/${item.id}`, {
        action,
        declineReason: action === 'decline' ? 'Not available' : undefined,
      });
      toast.success(action === 'approve' ? 'Approved' : 'Declined');
      refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message);
    }
  };

  return (
    <div className="sec-page max-w-2xl mx-auto pb-24">
      <header className="sec-page-header mb-4">
        <h1 className="sec-page-title flex items-center gap-2">
          <MessageCircle size={22} /> Business messages
        </h1>
        <p className="sec-page-subtitle">Table requests, job applicants, and promoter threads — separate from your partygoer inbox.</p>
      </header>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-center text-[var(--sec-text-muted)] py-12">No messages yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="sec-card p-4 border border-[var(--sec-border)] flex gap-3"
                  style={{ opacity: item.unread ? 1 : 0.85 }}
                >
                  {item.type === 'table_request' ? (
                    <Armchair size={20} className="shrink-0 mt-0.5" />
                  ) : (
                    <Briefcase size={20} className="shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-xs text-[var(--sec-text-muted)]">{item.subtitle}</p>
                    {item.body ? <p className="text-sm mt-1 line-clamp-2">{item.body}</p> : null}
                    {item.type === 'table_request' && item.status === 'PENDING_VENUE_REVIEW' ? (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => reviewTable(item, 'approve')}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => reviewTable(item, 'decline')}>Decline</Button>
                      </div>
                    ) : item.type === 'job' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => navigate(createPageUrl(`JobDetails?id=${item.referenceId}&application=${item.applicationId}`))}
                      >
                        Open job thread
                      </Button>
                    ) : item.status === 'APPROVED' ? (
                      <Button
                        size="sm"
                        className="mt-2 sec-btn-primary"
                        onClick={() => navigate(createPageUrl(`TableDetails?id=${item.referenceId}&source=venue`))}
                      >
                        Guest can pay — view table
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
