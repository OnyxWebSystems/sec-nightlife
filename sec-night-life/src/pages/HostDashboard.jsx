import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Crown, Plus, Loader2 } from 'lucide-react';
import GoogleAddressInput from '@/components/GoogleAddressInput';

const STATUS_BADGE = {
  DRAFT: { label: 'Draft', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
  PENDING_PAYMENT: { label: 'Pending payment', bg: 'var(--sec-warning-muted)', color: 'var(--sec-text-primary)' },
  PUBLISHED: { label: 'Live', bg: 'var(--sec-success-muted)', color: 'var(--sec-text-primary)' },
  CANCELLED: { label: 'Cancelled', bg: 'var(--sec-error-muted)', color: 'var(--sec-error)' },
  COMPLETED: { label: 'Completed', bg: 'var(--sec-bg-card)', color: 'var(--sec-accent)' },
};

export default function HostDashboard() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('parties');
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [partyStep, setPartyStep] = useState(1);
  const [partyForm, setPartyForm] = useState({
    title: '',
    description: '',
    location: '',
    latitude: null,
    longitude: null,
    startTime: '',
    endTime: '',
    guestQuantity: 20,
    hasEntranceFee: false,
    entranceFeeAmount: '',
    entranceFeeNote: '',
    freeEntryGroup: '',
  });
  const [tableForm, setTableForm] = useState({
    tableType: 'IN_APP_EVENT',
    eventId: '',
    venueName: '',
    venueAddress: '',
    eventDate: '',
    eventTime: '21:00',
    guestQuantity: 4,
    drinkPreferences: '',
    desiredCompany: '',
    isPublic: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(setUser).catch(() => authService.redirectToLogin());
  }, []);

  useEffect(() => {
    const c = searchParams.get('create');
    if (c === 'party') {
      setShowPartyModal(true);
      setTab('parties');
    }
    if (c === 'table') {
      setShowTableModal(true);
      setTab('tables');
    }
    if (c === 'invite') {
      setTab('tables');
      toast.message('Open a table card and use Invite from the full flow in a future update, or invite from table details.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const closePartyModal = () => {
    setShowPartyModal(false);
    setPartyStep(1);
    setSearchParams({}, { replace: true });
  };

  const { data: parties = [], isLoading: loadP } = useQuery({
    queryKey: ['host-parties', user?.id],
    queryFn: () => apiGet('/api/host/parties'),
    enabled: !!user?.id,
  });

  const { data: tables = [], isLoading: loadT } = useQuery({
    queryKey: ['host-tables', user?.id],
    queryFn: () => apiGet('/api/host/tables'),
    enabled: !!user?.id,
  });

  const { data: jobs = [], isLoading: loadJ } = useQuery({
    queryKey: ['host-jobs', user?.id],
    queryFn: () => apiGet('/api/host/jobs'),
    enabled: !!user?.id,
  });

  const { data: activity } = useQuery({
    queryKey: ['host-activity', user?.id],
    queryFn: () => apiGet('/api/host/activity/summary'),
    enabled: !!user?.id,
  });

  const { data: publicEvents = [] } = useQuery({
    queryKey: ['events-published'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
    enabled: showTableModal && tableForm.tableType === 'IN_APP_EVENT',
  });

  const submitParty = async (thenPublish) => {
    setSaving(true);
    try {
      const start = new Date(partyForm.startTime);
      const end = new Date(partyForm.endTime);
      const payload = {
        title: partyForm.title,
        description: partyForm.description,
        location: partyForm.location,
        latitude: partyForm.latitude,
        longitude: partyForm.longitude,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        guestQuantity: partyForm.guestQuantity,
        hasEntranceFee: partyForm.hasEntranceFee,
        entranceFeeAmount: partyForm.hasEntranceFee ? parseFloat(partyForm.entranceFeeAmount) : null,
        entranceFeeNote: partyForm.entranceFeeNote || null,
        freeEntryGroup: partyForm.freeEntryGroup || null,
      };
      const created = await apiPost('/api/host/parties', payload);
      queryClient.invalidateQueries(['host-parties']);
      toast.success('House party saved');
      closePartyModal();
      if (thenPublish && created?.id) {
        const pay = await apiPost(`/api/host/parties/${created.id}/publish`, {});
        if (pay?.authorization_url) window.location.href = pay.authorization_url;
      }
    } catch (e) {
      toast.error(e?.message || 'Could not create party');
    } finally {
      setSaving(false);
    }
  };

  const submitTable = async () => {
    setSaving(true);
    try {
      if (tableForm.tableType === 'IN_APP_EVENT') {
        if (!tableForm.eventId) {
          toast.error('Select an event');
          setSaving(false);
          return;
        }
        await apiPost('/api/host/tables', {
          tableType: 'IN_APP_EVENT',
          eventId: tableForm.eventId,
          eventTime: tableForm.eventTime,
          guestQuantity: tableForm.guestQuantity,
          drinkPreferences: tableForm.drinkPreferences || null,
          desiredCompany: tableForm.desiredCompany || null,
          isPublic: tableForm.isPublic,
        });
      } else {
        if (!tableForm.venueName || !tableForm.eventDate) {
          toast.error('Venue name and date required');
          setSaving(false);
          return;
        }
        await apiPost('/api/host/tables', {
          tableType: 'EXTERNAL_VENUE',
          venueName: tableForm.venueName,
          venueAddress: tableForm.venueAddress || null,
          eventDate: new Date(tableForm.eventDate).toISOString(),
          eventTime: tableForm.eventTime,
          guestQuantity: tableForm.guestQuantity,
          drinkPreferences: tableForm.drinkPreferences || null,
          desiredCompany: tableForm.desiredCompany || null,
          isPublic: tableForm.isPublic,
        });
      }
      queryClient.invalidateQueries(['host-tables']);
      toast.success('Table listed');
      setShowTableModal(false);
      setSearchParams({}, { replace: true });
    } catch (e) {
      toast.error(e?.message || 'Could not create table');
    } finally {
      setSaving(false);
    }
  };

  const publishParty = async (id) => {
    try {
      const pay = await apiPost(`/api/host/parties/${id}/publish`, {});
      if (pay?.authorization_url) window.location.href = pay.authorization_url;
    } catch (e) {
      toast.error(e?.message || 'Payment failed to start');
    }
  };

  const boostParty = async (id) => {
    try {
      const pay = await apiPost(`/api/host/parties/${id}/boost`, {});
      if (pay?.authorization_url) window.location.href = pay.authorization_url;
    } catch (e) {
      toast.error(e?.message || 'Payment failed to start');
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-[480px] mx-auto pb-24">
      <div className="flex items-center gap-2 mb-6">
        <Crown className="text-amber-400" size={28} />
        <div>
          <h1 className="text-xl font-bold">Host</h1>
          <p className="text-sm opacity-70">House parties & tables</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="activity">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="parties">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">My House Parties</h2>
            <button
              type="button"
              onClick={() => setShowPartyModal(true)}
              className="sec-btn sec-btn-primary text-sm py-2 px-3 inline-flex items-center gap-1"
            >
              <Plus size={16} /> Create
            </button>
          </div>
          {loadP ? <Loader2 className="animate-spin" /> : null}
          <div className="space-y-3">
            {parties.map((p) => {
              const sb = STATUS_BADGE[p.status] || STATUS_BADGE.DRAFT;
              return (
                <div key={p.id} className="sec-card p-4 rounded-xl border border-[var(--sec-border)]">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-xs opacity-70">{p.location}</div>
                      <div className="text-xs mt-1">
                        {format(parseISO(p.startTime), 'dd MMM yyyy HH:mm')} — {format(parseISO(p.endTime), 'HH:mm')}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: sb.bg, color: sb.color }}>
                      {sb.label}
                    </span>
                  </div>
                  <div className="text-sm mt-2">
                    RSVPs: {p.attendeeCount ?? p._count?.attendees ?? 0} / {p.guestQuantity} · Spots left: {p.spotsRemaining}
                  </div>
                  {p.boosted && <div className="text-xs text-amber-400 mt-1">Boosted</div>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {p.status === 'DRAFT' && (
                      <button type="button" className="sec-btn sec-btn-secondary text-xs py-1.5" onClick={() => publishParty(p.id)}>
                        Publish (R100)
                      </button>
                    )}
                    {p.status === 'PUBLISHED' && (
                      <>
                        <button type="button" className="sec-btn sec-btn-secondary text-xs py-1.5" onClick={() => boostParty(p.id)}>
                          Boost (R150)
                        </button>
                        <button
                          type="button"
                          className="sec-btn sec-btn-ghost text-xs py-1.5"
                          onClick={async () => {
                            try {
                              await apiDelete(`/api/host/parties/${p.id}`);
                              queryClient.invalidateQueries(['host-parties']);
                              toast.success('Party cancelled');
                            } catch (e) {
                              toast.error(e?.message || 'Could not cancel');
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {parties.length === 0 && !loadP && (
              <p className="text-sm opacity-60 text-center py-8">No parties yet. Create one to get started.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tables">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">My Tables</h2>
            <button
              type="button"
              onClick={() => setShowTableModal(true)}
              className="sec-btn sec-btn-primary text-sm py-2 px-3 inline-flex items-center gap-1"
            >
              <Plus size={16} /> Host table
            </button>
          </div>
          {loadT ? <Loader2 className="animate-spin" /> : null}
          <div className="space-y-3">
            {tables.map((t) => (
              <div key={t.id} className="sec-card p-4 rounded-xl border border-[var(--sec-border)]">
                <div className="font-semibold">{t.venueName}</div>
                <div className="text-xs opacity-70">
                  {format(parseISO(t.eventDate), 'dd MMM yyyy')} · {t.eventTime} · {t.tableType === 'IN_APP_EVENT' ? 'SEC event' : 'External'}
                </div>
                <div className="text-sm mt-2">Members: {t._count?.members ?? 0} · Spots: {t.spotsRemaining}</div>
                {t.boosted && <div className="text-xs text-amber-400 mt-1">Boosted</div>}
              </div>
            ))}
            {tables.length === 0 && !loadT && <p className="text-sm opacity-60 text-center py-8">No tables yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          {loadJ ? <Loader2 className="animate-spin" /> : null}
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="sec-card p-3 rounded-lg border border-[var(--sec-border)] text-sm">
                <div className="font-medium">{j.title}</div>
                <div className="text-xs opacity-70">{j.houseParty?.title}</div>
                <div className="text-xs mt-1">
                  {j.status} · Applicants: {j._count?.applications ?? 0}
                </div>
              </div>
            ))}
            {jobs.length === 0 && !loadJ && <p className="text-sm opacity-60">No jobs posted on your parties yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="sec-card p-4 rounded-xl space-y-2 text-sm">
            <div>Total parties hosted: {activity?.totalHousePartiesHosted ?? '—'}</div>
            <div>Total tables hosted: {activity?.totalTablesHosted ?? '—'}</div>
            <div>Party attendees (going): {activity?.totalPartyAttendees ?? '—'}</div>
            <div>Table joiners: {activity?.totalTableJoiners ?? '—'}</div>
            <div>Avg rating: {activity?.averageRatingReceived != null ? activity.averageRatingReceived.toFixed(1) : '—'}</div>
            <div>Jobs posted: {activity?.jobsPostedCount ?? '—'}</div>
          </div>
        </TabsContent>
      </Tabs>

      {showPartyModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog">
          <div className="bg-[var(--sec-bg-card)] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto border border-[var(--sec-border)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Create house party</h3>
              <button type="button" className="text-sm opacity-70" onClick={closePartyModal}>
                Close
              </button>
            </div>
            <div className="text-xs opacity-60 mb-2">Step {partyStep} of 4</div>
            {partyStep === 1 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Title
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.title}
                    onChange={(e) => setPartyForm((f) => ({ ...f, title: e.target.value }))}
                    maxLength={100}
                  />
                </label>
                <label className="block text-sm">
                  Description
                  <textarea
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    rows={3}
                    value={partyForm.description}
                    onChange={(e) => setPartyForm((f) => ({ ...f, description: e.target.value }))}
                    maxLength={500}
                  />
                </label>
                <GoogleAddressInput
                  value={partyForm.location}
                  onChange={(structured) => {
                    const loc =
                      typeof structured === 'string'
                        ? structured
                        : structured?.formattedAddress || structured?.street || '';
                    setPartyForm((f) => ({
                      ...f,
                      location: loc,
                      latitude: typeof structured === 'object' ? structured?.latitude ?? null : f.latitude,
                      longitude: typeof structured === 'object' ? structured?.longitude ?? null : f.longitude,
                    }));
                  }}
                />
              </div>
            )}
            {partyStep === 2 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Start
                  <input
                    type="datetime-local"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.startTime}
                    onChange={(e) => setPartyForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  End
                  <input
                    type="datetime-local"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.endTime}
                    onChange={(e) => setPartyForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {partyStep === 3 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Guest capacity
                  <input
                    type="number"
                    min={2}
                    max={500}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.guestQuantity}
                    onChange={(e) => setPartyForm((f) => ({ ...f, guestQuantity: parseInt(e.target.value, 10) || 2 }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={partyForm.hasEntranceFee}
                    onChange={(e) => setPartyForm((f) => ({ ...f, hasEntranceFee: e.target.checked }))}
                  />
                  Entrance fee at door
                </label>
                {partyForm.hasEntranceFee && (
                  <>
                    <input
                      type="number"
                      placeholder="Amount (ZAR)"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={partyForm.entranceFeeAmount}
                      onChange={(e) => setPartyForm((f) => ({ ...f, entranceFeeAmount: e.target.value }))}
                    />
                    <input
                      placeholder="Note (e.g. R100 per person)"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={partyForm.entranceFeeNote}
                      onChange={(e) => setPartyForm((f) => ({ ...f, entranceFeeNote: e.target.value }))}
                    />
                  </>
                )}
                <input
                  placeholder="Free entry group (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={partyForm.freeEntryGroup}
                  onChange={(e) => setPartyForm((f) => ({ ...f, freeEntryGroup: e.target.value }))}
                />
              </div>
            )}
            {partyStep === 4 && (
              <div className="text-sm space-y-2 opacity-90">
                <p><strong>{partyForm.title}</strong></p>
                <p>{partyForm.description}</p>
                <p>{partyForm.location}</p>
                <p>Guests: {partyForm.guestQuantity}</p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              {partyStep > 1 && (
                <button type="button" className="sec-btn sec-btn-ghost flex-1" onClick={() => setPartyStep((s) => s - 1)}>
                  Back
                </button>
              )}
              {partyStep < 4 && (
                <button type="button" className="sec-btn sec-btn-primary flex-1" onClick={() => setPartyStep((s) => s + 1)}>
                  Next
                </button>
              )}
              {partyStep === 4 && (
                <>
                  <button type="button" disabled={saving} className="sec-btn sec-btn-secondary flex-1" onClick={() => submitParty(false)}>
                    Save draft
                  </button>
                  <button type="button" disabled={saving} className="sec-btn sec-btn-primary flex-1" onClick={() => submitParty(true)}>
                    Publish R100
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showTableModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--sec-bg-card)] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto border border-[var(--sec-border)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Host a table</h3>
              <button type="button" className="text-sm opacity-70" onClick={() => { setShowTableModal(false); setSearchParams({}, { replace: true }); }}>
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg border ${tableForm.tableType === 'IN_APP_EVENT' ? 'border-[var(--sec-accent)]' : 'border-[var(--sec-border)]'}`}
                  onClick={() => setTableForm((f) => ({ ...f, tableType: 'IN_APP_EVENT' }))}
                >
                  SEC event
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg border ${tableForm.tableType === 'EXTERNAL_VENUE' ? 'border-[var(--sec-accent)]' : 'border-[var(--sec-border)]'}`}
                  onClick={() => setTableForm((f) => ({ ...f, tableType: 'EXTERNAL_VENUE' }))}
                >
                  External venue
                </button>
              </div>
              {tableForm.tableType === 'IN_APP_EVENT' ? (
                <select
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.eventId}
                  onChange={(e) => setTableForm((f) => ({ ...f, eventId: e.target.value }))}
                >
                  <option value="">Select event</option>
                  {publicEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    placeholder="Venue name"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={tableForm.venueName}
                    onChange={(e) => setTableForm((f) => ({ ...f, venueName: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={tableForm.eventDate}
                    onChange={(e) => setTableForm((f) => ({ ...f, eventDate: e.target.value }))}
                  />
                </>
              )}
              <input
                placeholder="Time (e.g. 21:00)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.eventTime}
                onChange={(e) => setTableForm((f) => ({ ...f, eventTime: e.target.value }))}
              />
              <input
                type="number"
                min={1}
                max={20}
                placeholder="Spots at table"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.guestQuantity}
                onChange={(e) => setTableForm((f) => ({ ...f, guestQuantity: parseInt(e.target.value, 10) || 1 }))}
              />
              <button type="button" disabled={saving} className="sec-btn sec-btn-primary w-full" onClick={submitTable}>
                List my table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
