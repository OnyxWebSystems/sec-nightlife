import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Briefcase, Armchair, Star } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

import {
  VENUE_ARRIVAL_TEMPLATES,
  VENUE_DECLINE_TEMPLATES,
} from '@/lib/venueTableMessageTemplates';

export default function BusinessMessages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams.get('tab') || 'jobs';
  const [filter, setFilter] = useState(
    ['jobs', 'promoters', 'tables'].includes(initialTab) ? initialTab : 'jobs',
  );
  const [selectedJobAppId, setSelectedJobAppId] = useState(searchParams.get('application') || null);
  const [selectedTableThreadId, setSelectedTableThreadId] = useState(searchParams.get('thread') || null);
  const [jobMessageBody, setJobMessageBody] = useState('');
  const [jobSending, setJobSending] = useState(false);
  const [tableSending, setTableSending] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['jobs', 'promoters', 'tables'].includes(tab)) setFilter(tab);
    const app = searchParams.get('application');
    if (app) setSelectedJobAppId(app);
    const thread = searchParams.get('thread');
    if (thread) {
      setSelectedTableThreadId(thread);
      if (!tab || tab === 'jobs') setFilter('tables');
    }
  }, [searchParams]);

  const inboxType = filter === 'tables' ? 'tables' : filter === 'promoters' ? 'promoters' : 'jobs';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['business-inbox', inboxType],
    queryFn: () => apiGet(`/api/business/inbox?type=${inboxType}`),
  });

  const items = data?.items ?? [];

  const selectedJobItem = useMemo(
    () => items.find((i) => i.type === 'job' && i.id === selectedJobAppId),
    [items, selectedJobAppId],
  );

  const { data: jobMessages = [], refetch: refetchJobMessages } = useQuery({
    queryKey: ['job-messages', selectedJobAppId],
    queryFn: () => apiGet(`/api/jobs/applications/${selectedJobAppId}/messages`),
    enabled: !!selectedJobAppId && (filter === 'jobs' || filter === 'promoters'),
    refetchInterval: 20000,
  });

  const { data: tableMessages = [], refetch: refetchTableMessages } = useQuery({
    queryKey: ['venue-table-thread-messages', selectedTableThreadId],
    queryFn: () => apiGet(`/api/venue-table-threads/${selectedTableThreadId}/messages`),
    enabled: !!selectedTableThreadId && filter === 'tables',
    refetchInterval: 20000,
  });

  async function sendJobMessage() {
    if (!selectedJobAppId || !jobMessageBody.trim()) return;
    setJobSending(true);
    try {
      await apiPost(`/api/jobs/applications/${selectedJobAppId}/messages`, { body: jobMessageBody.trim() });
      setJobMessageBody('');
      await refetchJobMessages();
      refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to send');
    } finally {
      setJobSending(false);
    }
  }

  async function sendTableTemplate(templateKey) {
    if (!selectedTableThreadId) return;
    setTableSending(true);
    try {
      await apiPost(`/api/venue-table-threads/${selectedTableThreadId}/messages`, { templateKey });
      await refetchTableMessages();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['venue-table-threads-mine'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to send');
    } finally {
      setTableSending(false);
    }
  }

  function selectJobItem(item) {
    setSelectedJobAppId(item.id);
    setSearchParams({ tab: filter, application: item.id });
  }

  return (
    <div className="sec-page max-w-3xl mx-auto pb-24">
      <header className="sec-page-header mb-4">
        <h1 className="sec-page-title flex items-center gap-2">
          <MessageCircle size={22} /> Business messages
        </h1>
        <p className="sec-page-subtitle">
          Job and promoter threads live here. Review new table requests under Tables &amp; day bookings.
        </p>
      </header>

      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          setSelectedJobAppId(null);
          setSelectedTableThreadId(null);
          setSearchParams({ tab: v });
        }}
      >
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="promoters">Promoters</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 min-h-[200px]">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-center text-[var(--sec-text-muted)] py-12">No threads yet.</p>
              ) : (
                items.map((item) => {
                  const isJob = item.type === 'job';
                  const isTable = item.type === 'venue_table_thread';
                  const selected = isJob
                    ? selectedJobAppId === item.id
                    : selectedTableThreadId === item.threadId;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      className="sec-card p-4 border text-left w-full"
                      style={{
                        borderColor: selected ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                        opacity: item.unread ? 1 : 0.9,
                      }}
                      onClick={() => {
                        if (isJob) selectJobItem(item);
                        else if (isTable) {
                          setSelectedTableThreadId(item.threadId);
                          setSearchParams({ tab: 'tables', thread: item.threadId });
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        {isTable ? (
                          <Armchair size={20} className="shrink-0 mt-0.5" />
                        ) : filter === 'promoters' ? (
                          <Star size={20} className="shrink-0 mt-0.5" />
                        ) : (
                          <Briefcase size={20} className="shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">{item.subtitle}</p>
                          {item.body ? <p className="text-sm mt-1 line-clamp-2">{item.body}</p> : null}
                          {isJob && item.status === 'PENDING' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(createPageUrl(`JobDetails?id=${item.referenceId}&application=${item.id}`));
                              }}
                            >
                              Review applicant
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="sec-card p-4 border border-[var(--sec-border)] min-h-[280px]">
              {filter === 'tables' ? (
                !selectedTableThreadId ? (
                  <p className="text-sm text-[var(--sec-text-muted)] py-8 text-center">Select a table thread.</p>
                ) : (
                  <>
                    <h3 className="font-semibold mb-3">Table messages</h3>
                    <p className="text-xs text-[var(--sec-text-muted)] mb-3">
                      Use quick replies only — no payment details in chat.
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-2 mb-4">
                      {tableMessages.length === 0 ? (
                        <p className="text-sm text-[var(--sec-text-muted)]">No messages yet.</p>
                      ) : (
                        tableMessages.map((m) => (
                          <div
                            key={m.id}
                            className="text-sm p-2 rounded-lg"
                            style={{ background: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
                          >
                            <div className="text-xs text-[var(--sec-text-muted)]">{m.senderLabel}</div>
                            <div>{m.label}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[...VENUE_DECLINE_TEMPLATES, ...VENUE_ARRIVAL_TEMPLATES].map((t) => (
                        <Button
                          key={t.key}
                          size="sm"
                          variant="outline"
                          disabled={tableSending}
                          onClick={() => sendTableTemplate(t.key)}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )
              ) : !selectedJobAppId ? (
                <p className="text-sm text-[var(--sec-text-muted)] py-8 text-center">Select a job thread.</p>
              ) : selectedJobItem?.status === 'PENDING' ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-[var(--sec-text-muted)] mb-4">
                    Messaging unlocks after you add this applicant to the waitlist or hire them.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate(
                        createPageUrl(
                          `JobDetails?id=${selectedJobItem.referenceId}&application=${selectedJobAppId}`,
                        ),
                      )
                    }
                  >
                    Review on job page
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold mb-3">{selectedJobItem?.title || 'Messages'}</h3>
                  <div className="max-h-52 overflow-y-auto space-y-2 mb-4">
                    {jobMessages.map((m) => (
                      <div
                        key={m.id}
                        className="text-sm p-2 rounded-lg"
                        style={{ background: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
                      >
                        <div className="text-xs text-[var(--sec-text-muted)]">
                          {m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}
                        </div>
                        <div>{m.body}</div>
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="sec-input w-full min-h-[72px] mb-2"
                    value={jobMessageBody}
                    onChange={(e) => setJobMessageBody(e.target.value)}
                    placeholder="Type a message to the applicant…"
                  />
                  <Button className="w-full" disabled={!jobMessageBody.trim() || jobSending} onClick={sendJobMessage}>
                    {jobSending ? 'Sending…' : 'Send'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
