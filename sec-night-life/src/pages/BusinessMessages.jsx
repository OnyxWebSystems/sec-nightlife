import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiDelete, apiGet, apiPost } from '@/api/client';
import { asArray } from '@/utils';
import { toast } from 'sonner';
import { Loader2, Briefcase, Armchair, Star, Trash2 } from 'lucide-react';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import BusinessVenueGroupPanel from '@/components/messaging/BusinessVenueGroupPanel';
import PromoterVenueThreadPanel from '@/components/messaging/PromoterVenueThreadPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import SecScrollTabs from '@/components/ui/SecScrollTabs';
import { Button } from '@/components/ui/button';

import {
  VENUE_ARRIVAL_TEMPLATES,
  VENUE_DECLINE_TEMPLATES,
} from '@/lib/venueTableMessageTemplates';
import { dispatchMessagesRefresh } from '@/lib/messagesRefresh';
import { useMessageReply } from '@/hooks/useMessageReply';
import { useIsMobile } from '@/hooks/useIsDesktop';
import ChatComposer from '@/components/messaging/ChatComposer';
import MessageReplyPreview from '@/components/messaging/MessageReplyPreview';
import MessageBubble from '@/components/messaging/MessageBubble';
import { linkifyMessageBody } from '@/lib/linkifyMessageBody';
import PageBackHeader from '@/components/layout/PageBackHeader';

export default function BusinessMessages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams.get('tab') || 'jobs';
  const { activeVenue } = useActiveVenue();
  const venueScope = useBusinessVenueScope();
  const [filter, setFilter] = useState(
    ['jobs', 'promoters', 'tables', 'groups'].includes(initialTab) ? initialTab : 'jobs',
  );
  const [selectedJobAppId, setSelectedJobAppId] = useState(searchParams.get('application') || null);
  const [selectedTableThreadId, setSelectedTableThreadId] = useState(searchParams.get('thread') || null);
  const [selectedPromoterVenueId, setSelectedPromoterVenueId] = useState(searchParams.get('promoterVenue') || null);
  const [jobMessageBody, setJobMessageBody] = useState('');
  const { replyingTo: jobReplyingTo, setReplyingTo: setJobReplyingTo, clearReply: clearJobReply } = useMessageReply();
  const [jobSending, setJobSending] = useState(false);
  const [tableSending, setTableSending] = useState(false);
  const isMobile = useIsMobile();

  const inThread =
    (filter === 'jobs' && !!selectedJobAppId) ||
    (filter === 'tables' && !!selectedTableThreadId) ||
    (filter === 'promoters' && !!selectedPromoterVenueId);

  function closeThread() {
    setSelectedJobAppId(null);
    setSelectedTableThreadId(null);
    setSelectedPromoterVenueId(null);
    setSearchParams({ tab: filter });
  }

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['jobs', 'promoters', 'tables', 'groups'].includes(tab)) setFilter(tab);
    const app = searchParams.get('application');
    if (app) setSelectedJobAppId(app);
    const thread = searchParams.get('thread');
    if (thread) {
      setSelectedTableThreadId(thread);
      if (!tab || tab === 'jobs') setFilter('tables');
    }
    const promoterVenue = searchParams.get('promoterVenue');
    if (promoterVenue) {
      setSelectedPromoterVenueId(promoterVenue);
      setFilter('promoters');
    }
  }, [searchParams]);

  const inboxType =
    filter === 'tables' ? 'tables' : filter === 'promoters' ? 'promoters' : filter === 'groups' ? null : 'jobs';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['business-inbox', inboxType],
    queryFn: () => apiGet(`/api/business/inbox?type=${inboxType}`),
    enabled: !!inboxType,
  });

  const items = data?.items ?? [];

  const selectedPromoterItem = useMemo(
    () => items.find((i) => i.type === 'promoter_venue_thread' && i.threadId === selectedPromoterVenueId),
    [items, selectedPromoterVenueId],
  );

  const selectedJobItem = useMemo(
    () => items.find((i) => i.type === 'job' && i.id === selectedJobAppId),
    [items, selectedJobAppId],
  );

  const { data: jobMessagesRaw, refetch: refetchJobMessages, isSuccess: jobMessagesLoaded } = useQuery({
    queryKey: ['job-messages', selectedJobAppId],
    queryFn: () => apiGet(`/api/jobs/applications/${selectedJobAppId}/messages`),
    enabled: !!selectedJobAppId && filter === 'jobs',
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const { data: tableMessagesRaw, refetch: refetchTableMessages, isSuccess: tableMessagesLoaded } = useQuery({
    queryKey: ['venue-table-thread-messages', selectedTableThreadId],
    queryFn: () => apiGet(`/api/venue-table-threads/${selectedTableThreadId}/messages`),
    enabled: !!selectedTableThreadId && filter === 'tables',
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const jobMessages = asArray(jobMessagesRaw);
  const tableMessages = asArray(tableMessagesRaw);

  useEffect(() => {
    if (jobMessagesLoaded && selectedJobAppId) dispatchMessagesRefresh();
  }, [jobMessagesLoaded, selectedJobAppId, jobMessages.length]);

  useEffect(() => {
    if (tableMessagesLoaded && selectedTableThreadId) dispatchMessagesRefresh();
  }, [tableMessagesLoaded, selectedTableThreadId, tableMessages.length]);

  async function sendJobMessage() {
    if (!selectedJobAppId || !jobMessageBody.trim()) return;
    setJobSending(true);
    try {
      await apiPost(`/api/jobs/applications/${selectedJobAppId}/messages`, {
        body: jobMessageBody.trim(),
        ...(jobReplyingTo?.id ? { replyToMessageId: jobReplyingTo.id } : {}),
      });
      setJobMessageBody('');
      clearJobReply();
      await refetchJobMessages();
      refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to send');
    } finally {
      setJobSending(false);
    }
  }

  async function deleteJobThread() {
    if (!selectedJobAppId) return;
    if (!window.confirm('Delete this thread? It will be removed from your inbox (applications stay on the job page).')) return;
    try {
      await apiDelete(`/api/business/inbox/threads/${selectedJobAppId}`);
      toast.success('Thread removed from inbox');
      setSelectedJobAppId(null);
      setSearchParams({ tab: filter });
      refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not delete conversation');
    }
  }

  async function deleteTableThread() {
    if (!selectedTableThreadId) return;
    if (!window.confirm('Delete this table chat? It will be removed for you and the guest.')) return;
    try {
      await apiDelete(`/api/venue-table-threads/${selectedTableThreadId}`);
      toast.success('Chat deleted');
      setSelectedTableThreadId(null);
      setSearchParams({ tab: 'tables' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['venue-table-threads-mine'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not delete chat');
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

  function selectPromoterItem(item) {
    setSelectedPromoterVenueId(item.threadId);
    setSearchParams({ tab: 'promoters', promoterVenue: item.threadId });
  }

  function selectJobItem(item) {
    setSelectedJobAppId(item.id);
    setSearchParams({ tab: filter, application: item.id });
  }

  return (
    <div className={`sec-page max-w-3xl mx-auto ${isMobile && inThread ? 'fixed inset-0 z-20 flex flex-col bg-[var(--sec-bg-base)] pb-0' : 'pb-24'}`}>
      <PageBackHeader
        title={isMobile && inThread ? (selectedJobItem?.title || 'Thread') : 'Business messages'}
        subtitle={isMobile && inThread ? undefined : 'Job and promoter threads — table requests are under Tables & day bookings'}
        pageName="BusinessMessages"
        onBack={isMobile && inThread ? closeThread : undefined}
      />
      <div className={`px-4 pt-4 flex-1 min-h-0 overflow-y-auto ${isMobile && inThread ? 'pb-[env(safe-area-inset-bottom)]' : ''}`}>

      {!(isMobile && inThread) ? (
      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          setSelectedJobAppId(null);
          setSelectedTableThreadId(null);
          setSelectedPromoterVenueId(null);
          setSearchParams({ tab: v });
        }}
      >
        <SecScrollTabs
          listClassName="mb-4 bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)] rounded-lg p-1"
          triggerClassName="rounded-md text-xs sm:text-sm data-[state=active]:bg-[var(--sec-bg-card)]"
          tabs={[
            { value: 'jobs', label: 'Jobs' },
            { value: 'promoters', label: 'Promoters' },
            { value: 'tables', label: 'Tables' },
            { value: 'groups', label: 'Groups' },
          ]}
        />

        <TabsContent value={filter}>
          {filter === 'groups' ? (
            <BusinessVenueGroupPanel
              venueId={venueScope.inStaffSession ? null : activeVenue?.id}
              staffContextToken={venueScope.staffContextToken}
            />
          ) : (
          <div className={`grid gap-4 ${isMobile && inThread ? '' : 'lg:grid-cols-2'}`}>
            {!(isMobile && inThread) ? (
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
                  const isPromoterThread = item.type === 'promoter_venue_thread';
                  const selected = isJob
                    ? selectedJobAppId === item.id
                    : isPromoterThread
                      ? selectedPromoterVenueId === item.threadId
                      : selectedTableThreadId === item.threadId;
                  return (
                    <button
                      key={`${item.type}-${item.id || item.threadId}`}
                      type="button"
                      className="sec-card p-4 border text-left w-full"
                      style={{
                        borderColor: selected ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                        opacity: item.unread ? 1 : 0.9,
                      }}
                      onClick={() => {
                        if (isJob) selectJobItem(item);
                        else if (isPromoterThread) selectPromoterItem(item);
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
            ) : null}

            <div className={`sec-card p-4 border border-[var(--sec-border)] ${isMobile && inThread ? 'border-0 p-0 min-h-0 flex-1 flex flex-col' : 'min-h-[280px]'}`}>
              {filter === 'tables' ? (
                !selectedTableThreadId ? (
                  <p className="text-sm text-[var(--sec-text-muted)] py-8 text-center">Select a table thread.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="font-semibold">Table messages</h3>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={deleteTableThread}
                      >
                        <Trash2 size={14} className="mr-1" />
                        Delete chat
                      </Button>
                    </div>
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
              ) : filter === 'promoters' ? (
                !selectedPromoterVenueId ? (
                  <p className="text-sm text-[var(--sec-text-muted)] py-8 text-center">Select a promoter thread.</p>
                ) : (
                  <div className="min-h-[400px]">
                    <PromoterVenueThreadPanel
                      threadId={selectedPromoterVenueId}
                      isBusiness
                      onClose={() => {
                        setSelectedPromoterVenueId(null);
                        setSearchParams({ tab: 'promoters' });
                      }}
                      onDeleted={() => {
                        setSelectedPromoterVenueId(null);
                        setSearchParams({ tab: 'promoters' });
                        refetch();
                      }}
                    />
                  </div>
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
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-semibold">{selectedJobItem?.title || 'Messages'}</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={deleteJobThread}
                    >
                      <Trash2 size={14} className="mr-1" />
                      Delete chat
                    </Button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-2 mb-4">
                    {jobMessages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        onReply={setJobReplyingTo}
                        className="text-sm p-2 rounded-lg"
                        style={{ background: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
                      >
                        <div className="text-xs text-[var(--sec-text-muted)]">
                          {m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}
                        </div>
                        <div>{linkifyMessageBody(m.body)}</div>
                      </MessageBubble>
                    ))}
                  </div>
                  <ChatComposer
                    value={jobMessageBody}
                    onChange={setJobMessageBody}
                    onSend={sendJobMessage}
                    disabled={jobSending}
                    placeholder="Type a message to the applicant…"
                    replyPreview={<MessageReplyPreview replyingTo={jobReplyingTo} onClear={clearJobReply} />}
                  />
                </>
              )}
            </div>
          </div>
          )}
        </TabsContent>
      </Tabs>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {filter === 'tables' && selectedTableThreadId ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold">Table messages</h3>
                <Button size="sm" variant="ghost" className="text-red-400" onClick={deleteTableThread}>
                  <Trash2 size={14} className="mr-1" />
                  Delete
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
                {tableMessages.map((m) => (
                  <div key={m.id} className="text-sm p-2 rounded-lg" style={{ background: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}>
                    <div className="text-xs text-[var(--sec-text-muted)]">{m.senderLabel}</div>
                    <div>{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[...VENUE_DECLINE_TEMPLATES, ...VENUE_ARRIVAL_TEMPLATES].map((t) => (
                  <Button key={t.key} size="sm" variant="outline" disabled={tableSending} onClick={() => sendTableTemplate(t.key)}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </>
          ) : filter === 'promoters' && selectedPromoterVenueId ? (
            <PromoterVenueThreadPanel
              threadId={selectedPromoterVenueId}
              isBusiness
              hideHeader
              onClose={closeThread}
              onDeleted={() => {
                closeThread();
                refetch();
              }}
            />
          ) : filter === 'jobs' && selectedJobAppId && selectedJobItem?.status !== 'PENDING' ? (
            <>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
                {jobMessages.map((m) => (
                  <MessageBubble key={m.id} message={m} onReply={setJobReplyingTo} className="text-sm p-2 rounded-lg" style={{ background: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}>
                    <div className="text-xs text-[var(--sec-text-muted)]">{m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}</div>
                    <div>{linkifyMessageBody(m.body)}</div>
                  </MessageBubble>
                ))}
              </div>
              <ChatComposer
                value={jobMessageBody}
                onChange={setJobMessageBody}
                onSend={sendJobMessage}
                disabled={jobSending}
                placeholder="Type a message to the applicant…"
                replyPreview={<MessageReplyPreview replyingTo={jobReplyingTo} onClear={clearJobReply} />}
              />
            </>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}
