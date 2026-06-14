import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { createPageUrl, getPublicAppOrigin } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Loader2, Armchair, Users, Star, Activity } from 'lucide-react';
import SecLogo from '@/components/ui/SecLogo';
import GoogleAddressInput from '@/components/GoogleAddressInput';
import { Input } from '@/components/ui/input';
import { launchPaystackInline } from '@/lib/paystackInline';
import { completePaystackCheckout } from '@/lib/completePaystackCheckout';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';
import { uploadHostedTablePhotoFile } from '@/lib/uploadHostedTablePhoto';
import HostedTableHostCard from '@/components/host/HostedTableHostCard';
import { splitHostDashboardTables } from '@/lib/hostTableDashboard';

/** Hosted table row uses HostedTableStatus (DRAFT / ACTIVE / FULL). */
const TABLE_HOST_STATUS_BADGE = {
  DRAFT: { label: 'Awaiting listing payment', bg: 'var(--sec-warning-muted)', color: 'var(--sec-text-primary)' },
  ACTIVE: { label: 'Live', bg: 'var(--sec-success-muted)', color: 'var(--sec-text-primary)' },
  FULL: { label: 'Full', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
  CLOSED: { label: 'Closed', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
};

export default function HostDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('tables');
  const [tablesSubTab, setTablesSubTab] = useState('upcoming');
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableForm, setTableForm] = useState({
    tableType: 'EXTERNAL_VENUE',
    tableName: '',
    tableDescription: '',
    eventType: 'CLUB_TABLE',
    eventId: '',
    venueName: '',
    venueAddress: '',
    eventDate: '',
    eventTime: '21:00',
    guestQuantity: 4,
    hostingCategory: 'GENERAL',
    hostingTierIndex: 0,
    tierMaxGuests: null,
    hasJoiningFee: false,
    joiningFee: '',
    photo: '',
    photoPublicId: '',
    drinkPreferences: '',
    desiredCompany: '',
    isPublic: true,
  });
  const [saving, setSaving] = useState(false);
  const [pendingTableId, setPendingTableId] = useState(null);
  const [inviteOpenTableId, setInviteOpenTableId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [manageTableId, setManageTableId] = useState(null);
  const [rulesForm, setRulesForm] = useState({
    tableName: '',
    isPublic: true,
    hasJoiningFee: false,
    joiningFee: '',
    photo: '',
    photoPublicId: '',
  });
  const [rulesPhotoPreview, setRulesPhotoPreview] = useState('');
  const [savingRules, setSavingRules] = useState(false);

  const createTablePhotoCrop = useImageCropUpload({
    onCropped: async (file) => {
      try {
        const result = await uploadHostedTablePhotoFile(file);
        if (!result) return;
        setTableForm((f) => ({ ...f, photo: result.imageUrl, photoPublicId: result.imagePublicId }));
      } catch (e) {
        toast.error(e?.message || 'Photo upload failed');
      }
    },
  });

  const manageTablePhotoCrop = useImageCropUpload({
    onCropped: async (file) => {
      try {
        const result = await uploadHostedTablePhotoFile(file);
        if (!result) return;
        setRulesForm((f) => ({ ...f, photo: result.imageUrl, photoPublicId: result.imagePublicId }));
        setRulesPhotoPreview(result.imageUrl);
      } catch (e) {
        toast.error(e?.message || 'Photo upload failed');
      }
    },
  });

  useEffect(() => {
    authService.getCurrentUser().then(async (u) => {
      setUser(u);
      await dataService.User.filter({ created_by: u.email });
    }).catch(() => authService.redirectToLogin());
  }, []);

  useEffect(() => {
    const c = searchParams.get('create');
    const preEventId = searchParams.get('event');
    if (c === 'party') {
      toast.message('House parties are no longer available', {
        description: 'Browse SEC events or list a private meet-up table instead.',
      });
      navigate(createPageUrl('Events'), { replace: true });
      return;
    }
    if (c === 'table') {
      if (preEventId) {
        navigate(createPageUrl(`EventDetails?id=${preEventId}`));
        return;
      }
      setShowTableModal(true);
      setTab('tables');
    }
    if (c === 'invite') {
      setTab('tables');
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('tab') === 'tables') setTab('tables');
    if (searchParams.get('tab') === 'activity') setTab('activity');
  }, [searchParams, setSearchParams, navigate]);

  useEffect(() => {
    if (!inviteOpenTableId) setInviteSearch('');
  }, [inviteOpenTableId]);

  const inviteUserSearchQ = useQuery({
    queryKey: ['host-invite-user-search', inviteSearch.trim()],
    queryFn: () => apiGet(`/api/host/invite-user-search?q=${encodeURIComponent(inviteSearch.trim())}`),
    enabled: Boolean(inviteOpenTableId && inviteSearch.trim().length >= 2),
    staleTime: 20_000,
  });

  const { data: tables = [], isLoading: loadT } = useQuery({
    queryKey: ['host-tables', user?.id],
    queryFn: () => apiGet('/api/host/tables'),
    enabled: !!user?.id,
  });

  const { upcoming: upcomingTables, past: pastTables } = useMemo(
    () => splitHostDashboardTables(tables),
    [tables],
  );

  useEffect(() => {
    if (searchParams.get('manage') !== '1' || !upcomingTables.length) return;
    const firstInApp = upcomingTables.find((t) => t.tableType === 'IN_APP_EVENT' && t.status === 'ACTIVE');
    if (!firstInApp) return;
    setTab('tables');
    setManageTableId(firstInApp.id);
    setRulesForm({
      tableName: firstInApp.tableName || '',
      isPublic: firstInApp.isPublic !== false,
      hasJoiningFee: Boolean(firstInApp.hasJoiningFee),
      joiningFee: firstInApp.joiningFee ? String(firstInApp.joiningFee) : '',
    });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('manage');
      return next;
    }, { replace: true });
  }, [searchParams, upcomingTables, setSearchParams]);

  const { data: activity } = useQuery({
    queryKey: ['host-activity', user?.id],
    queryFn: () => apiGet('/api/host/activity/summary'),
    enabled: !!user?.id,
  });

  const tableGuestMax = 20;

  const { data: pendingRequests = [], refetch: refetchPending, isFetching: pendingLoading } = useQuery({
    queryKey: ['host-table-pending', pendingTableId],
    queryFn: () => apiGet(`/api/host/tables/${pendingTableId}/pending-requests`),
    enabled: !!pendingTableId,
  });

  const submitTable = async () => {
    setSaving(true);
    try {
      if (!tableForm.venueName || !tableForm.eventDate) {
        toast.error('Venue name and date required');
        setSaving(false);
        return;
      }
      if (!tableForm.venueAddress?.trim()) {
        toast.error('Enter the venue address so guests know where to meet');
        setSaving(false);
        return;
      }
      const created = await apiPost('/api/host/tables', {
        tableType: 'EXTERNAL_VENUE',
        tableName: tableForm.tableName,
        tableDescription: tableForm.tableDescription || null,
        eventType: tableForm.eventType,
        venueName: tableForm.venueName,
        venueAddress: tableForm.venueAddress.trim(),
        eventDate: new Date(tableForm.eventDate).toISOString(),
        eventTime: tableForm.eventTime,
        guestQuantity: tableForm.guestQuantity,
        hasJoiningFee: tableForm.hasJoiningFee,
        joiningFee: tableForm.hasJoiningFee ? Number(tableForm.joiningFee) : null,
        photo: tableForm.photo || null,
        photoPublicId: tableForm.photoPublicId || null,
        drinkPreferences: tableForm.drinkPreferences || null,
        desiredCompany: tableForm.desiredCompany || null,
        isPublic: tableForm.isPublic,
      });
      if (created?.payment?.reference && created?.payment?.access_code) {
        launchPaystackInline({
          email: user?.email,
          amount: 200,
          reference: created.payment.reference,
          accessCode: created.payment.access_code,
          onSuccess: async (payload) => {
            await completePaystackCheckout({ reference: created.payment.reference, payload, queryClient, showToasts: false });
            queryClient.invalidateQueries(['host-tables']);
            toast.success('Listing payment received — your external table is live.');
            setShowTableModal(false);
            setSearchParams({}, { replace: true });
          },
          onCancel: () => {
            toast.message('Checkout closed', {
              description: 'Your external table stays in draft until you complete the listing payment.',
            });
            queryClient.invalidateQueries(['host-tables']);
          },
        });
        return;
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

  const boostTable = async (id) => {
    try {
      const pay = await apiPost(`/api/host/tables/${id}/boost`, {});
      if (pay?.reference && pay?.access_code) {
        await launchPaystackInline({
          email: user?.email,
          amount: 200,
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await completePaystackCheckout({ reference: pay.reference, payload, queryClient, showToasts: false });
            queryClient.invalidateQueries({ queryKey: ['host-tables'] });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
            toast.success('Table boosted for 7 days');
          },
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Payment failed to start');
    }
  };

  const copyHostedTableLink = async (tableId) => {
    const url = `${getPublicAppOrigin()}${createPageUrl(
      `TableDetails?id=${encodeURIComponent(tableId)}&source=hosted`,
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Table link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const startRetryListingPayment = async (tableId) => {
    try {
      const pay = await apiPost(`/api/host/tables/${encodeURIComponent(tableId)}/retry-listing-payment`, {});
      if (pay?.reference && pay?.access_code) {
        launchPaystackInline({
          email: user?.email,
          amount: Number(pay.amount_zar || 0),
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await completePaystackCheckout({ reference: pay.reference, payload, queryClient, showToasts: false });
            queryClient.invalidateQueries({ queryKey: ['host-tables', user?.id] });
            toast.success('Payment received — your table is live.');
          },
          onCancel: () => {
            toast.message('Checkout closed', {
              description: 'Your table stays in draft until payment succeeds. You can retry from your tables list.',
            });
            queryClient.invalidateQueries({ queryKey: ['host-tables', user?.id] });
          },
        });
      } else {
        toast.message('Nothing to pay', {
          description: 'This listing may already be paid or does not require checkout.',
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Could not start checkout');
    }
  };

  const deleteTable = async (tableId) => {
    try {
      await apiDelete(`/api/host/tables/${tableId}`);
      queryClient.invalidateQueries({ queryKey: ['host-tables'] });
      queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
      toast.success('Table removed');
    } catch (e) {
      toast.error(e?.message || 'Could not delete table');
      throw e;
    }
  };

  const renderHostedTableCard = (t, { isPast = false } = {}) => {
    const loc =
      t.eventLocation?.displayLabel ||
      [t.venueAddress, t.venueName].filter(Boolean).join(' · ') ||
      t.venueName;
    const hostStatusBadge = TABLE_HOST_STATUS_BADGE[t.status] || TABLE_HOST_STATUS_BADGE.DRAFT;
    return (
      <HostedTableHostCard
        key={t.id}
        table={t}
        isPast={isPast}
        hostStatusBadge={hostStatusBadge}
        loc={loc}
        manageTableId={manageTableId}
        inviteOpenTableId={inviteOpenTableId}
        pendingTableId={pendingTableId}
        rulesForm={rulesForm}
        setRulesForm={setRulesForm}
        savingRules={savingRules}
        photoPreviewUrl={manageTableId === t.id ? rulesPhotoPreview : ''}
        onPayListing={startRetryListingPayment}
        onCopyLink={copyHostedTableLink}
        onBoost={boostTable}
        onDelete={deleteTable}
        onManageToggle={(row) => {
          const opening = manageTableId !== row.id;
          setManageTableId(opening ? row.id : null);
          setRulesPhotoPreview('');
          if (opening) {
            setRulesForm({
              tableName: row.tableName || '',
              isPublic: row.isPublic !== false,
              hasJoiningFee: Boolean(row.hasJoiningFee),
              joiningFee: row.joiningFee ? String(row.joiningFee) : '',
              photo: row.photo || '',
              photoPublicId: row.photoPublicId || '',
            });
          }
        }}
        onInviteToggle={(id) => setInviteOpenTableId((cur) => (cur === id ? null : id))}
        onReviewToggle={(id) => setPendingTableId((cur) => (cur === id ? null : id))}
        onPhotoInputChange={manageTablePhotoCrop.handleInputChange}
        onSaveRules={async (row) => {
          setSavingRules(true);
          try {
            const payload = {
              ...(rulesForm.photo ? { photo: rulesForm.photo, photoPublicId: rulesForm.photoPublicId || null } : {}),
            };
            if (row.tableType === 'IN_APP_EVENT') {
              Object.assign(payload, {
                tableName: rulesForm.tableName.trim(),
                isPublic: rulesForm.isPublic,
                hasJoiningFee: rulesForm.hasJoiningFee,
                joiningFee: rulesForm.hasJoiningFee ? Number(rulesForm.joiningFee) || 10 : null,
              });
            } else if (rulesForm.photo) {
              Object.assign(payload, { tableName: rulesForm.tableName.trim() || row.tableName });
            }
            await apiPatch(`/api/host/tables/${row.id}`, payload);
            toast.success('Table settings updated');
            setRulesPhotoPreview('');
            queryClient.invalidateQueries({ queryKey: ['host-tables'] });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
          } catch (err) {
            toast.error(err?.message || 'Could not save settings');
          } finally {
            setSavingRules(false);
          }
        }}
        childrenInvite={
          !isPast && t.status === 'ACTIVE' && inviteOpenTableId === t.id ? (
            <div className="mt-3 rounded-xl border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)] p-3 space-y-2">
              <p className="text-[11px] text-[var(--sec-text-muted)]">
                Search by username or name. Only people with an SEC account receive the in-app invite. Private
                tables: you can invite anyone registered — they do not need to be friends with you.
              </p>
              <Input
                placeholder="Type at least 2 characters…"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                className="bg-[var(--sec-bg-card)] border-[var(--sec-border)]"
              />
              {inviteUserSearchQ.isFetching ? (
                <p className="text-xs text-[var(--sec-text-muted)] flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching…
                </p>
              ) : inviteSearch.trim().length >= 2 ? (
                <ul className="max-h-40 overflow-y-auto space-y-1">
                  {(inviteUserSearchQ.data || []).length === 0 ? (
                    <li className="text-xs text-[var(--sec-text-muted)] px-1 py-2">No matches</li>
                  ) : (
                    (inviteUserSearchQ.data || []).map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--sec-bg-hover)]"
                      >
                        <div className="min-w-0 text-sm">
                          <span className="font-medium text-white">@{u.username || 'user'}</span>
                          {u.fullName ? (
                            <span className="text-[var(--sec-text-muted)] text-xs ml-1 truncate">{u.fullName}</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="text-[10px] sec-btn sec-btn-primary py-1 px-2 rounded-lg shrink-0"
                          onClick={async () => {
                            try {
                              await apiPost(`/api/host/tables/${t.id}/invite`, { inviteeUserId: u.id });
                              toast.success('Invite sent');
                              setInviteOpenTableId(null);
                              setInviteSearch('');
                              queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                            } catch (err) {
                              toast.error(err?.message || 'Could not send invite');
                            }
                          }}
                        >
                          Invite
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--sec-text-muted)]">Enter 2+ characters to search.</p>
              )}
            </div>
          ) : null
        }
        childrenPending={
          !isPast && pendingTableId === t.id ? (
            <div className="mt-3 space-y-2 border-t border-[var(--sec-border)] pt-3">
              {pendingLoading ? (
                <p className="text-xs text-[var(--sec-text-muted)]">Loading…</p>
              ) : (pendingRequests || []).length === 0 ? (
                <p className="text-xs text-[var(--sec-text-muted)]">No pending requests.</p>
              ) : (
                (pendingRequests || []).map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--sec-bg-elevated)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {pr.user?.avatarUrl ? (
                        <img src={pr.user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[var(--sec-border)] flex items-center justify-center text-xs">
                          {(pr.user?.username || '?')[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">@{pr.user?.username}</div>
                        <div className="text-[10px] text-[var(--sec-text-muted)] truncate">{pr.user?.fullName}</div>
                        {pr.user?.gender && (
                          <div className="text-[10px] text-[var(--sec-text-muted)] mt-0.5">Gender: {pr.user.gender}</div>
                        )}
                        {pr.user?.city && (
                          <div className="text-[10px] text-[var(--sec-text-muted)]">City: {pr.user.city}</div>
                        )}
                        {pr.user?.bio && (
                          <div className="text-[10px] text-[var(--sec-text-muted)] line-clamp-2 mt-1">{pr.user.bio}</div>
                        )}
                        {pr.decisionLabel && (
                          <div className="text-[10px] text-[var(--sec-accent)] mt-1">{pr.decisionLabel}</div>
                        )}
                        {(pr.user?.date_of_birth || pr.user?.verification_status) && (
                          <div className="text-[10px] text-[var(--sec-text-muted)] mt-0.5">
                            {pr.user?.date_of_birth ? `DOB: ${String(pr.user.date_of_birth).slice(0, 10)}` : ''}
                            {pr.user?.date_of_birth && pr.user?.verification_status ? ' · ' : ''}
                            {pr.user?.verification_status ? `Verified: ${pr.user.verification_status}` : ''}
                          </div>
                        )}
                        {pr.user?.id && (
                          <Link
                            to={createPageUrl(`Profile?id=${pr.user.id}`)}
                            className="text-[10px] text-[var(--sec-accent)] underline mt-1 inline-block"
                          >
                            View profile
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {pr.reviewStatus === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-lg bg-[var(--sec-success-muted)] text-black"
                            onClick={async () => {
                              try {
                                await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                  action: 'approve',
                                });
                                toast.success('Approved');
                                queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                refetchPending();
                              } catch (e) {
                                toast.error(e?.message || 'Could not approve');
                              }
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-lg border border-[var(--sec-border)]"
                            onClick={async () => {
                              try {
                                await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                  action: 'reject',
                                });
                                toast.success('Declined');
                                queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                refetchPending();
                              } catch (e) {
                                toast.error(e?.message || 'Could not decline');
                              }
                            }}
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {pr.reviewStatus === 'awaiting_payment' && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--sec-border)]"
                          onClick={async () => {
                            try {
                              await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                action: 'reject',
                              });
                              toast.success('Cancelled');
                              queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                              refetchPending();
                            } catch (e) {
                              toast.error(e?.message || 'Could not cancel');
                            }
                          }}
                        >
                          Cancel approval
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null
        }
      />
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-[1100px] mx-auto pb-24 lg:pb-10">
      <div className="flex items-center gap-2 mb-6">
        <SecLogo size={30} />
        <div>
          <h1 className="text-xl font-bold">Host</h1>
          <p className="text-sm opacity-70">Private meet-up tables</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="activity">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="tables">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-lg">My tables</h2>
              <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
                Live and upcoming tables stay here. After an SEC event ends, or 24 hours after a private meet-up starts,
                the table moves to Past tables.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTableModal(true)}
              className="sec-btn sec-btn-primary text-sm py-2.5 px-3 inline-flex items-center gap-1 rounded-xl shrink-0 self-start sm:self-auto"
            >
              <Plus size={16} /> Host table
            </button>
          </div>
          {loadT ? <Loader2 className="animate-spin mb-4" /> : null}
          <Tabs value={tablesSubTab} onValueChange={setTablesSubTab} className="w-full">
            <TabsList className="w-full bg-[var(--sec-bg-elevated)] p-1 rounded-lg border border-[var(--sec-border)] mb-4">
              <TabsTrigger
                value="upcoming"
                className="flex-1 rounded-md text-xs data-[state=active]:bg-[var(--sec-bg-card)]"
              >
                Upcoming ({upcomingTables.length})
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="flex-1 rounded-md text-xs data-[state=active]:bg-[var(--sec-bg-card)]"
              >
                Past ({pastTables.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              <div className="grid gap-4 xl:grid-cols-2">
                {upcomingTables.map((t) => renderHostedTableCard(t))}
                {upcomingTables.length === 0 && !loadT && (
                  <p className="text-sm text-[var(--sec-text-muted)] text-center py-10 col-span-full">
                    No upcoming tables. Host one to start a group chat.
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="past">
              <div className="grid gap-4 xl:grid-cols-2">
                {pastTables.map((t) => renderHostedTableCard(t, { isPast: true }))}
                {pastTables.length === 0 && !loadT && (
                  <p className="text-sm text-[var(--sec-text-muted)] text-center py-10 col-span-full">
                    No past tables yet. Finished SEC event tables and private meet-ups (after 24 hours) appear here.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="activity">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Armchair,
                label: 'Tables hosted',
                value: activity?.totalTablesHosted ?? '—',
                hint: 'All-time listings',
              },
              {
                icon: Activity,
                label: 'Active tables',
                value: activity?.activeTablesHosted ?? '—',
                hint: 'Live or full right now',
              },
              {
                icon: Users,
                label: 'Table joiners',
                value: activity?.totalTableJoiners ?? '—',
                hint: 'Guests who joined your tables',
              },
              {
                icon: Star,
                label: 'Avg rating',
                value:
                  activity?.averageRatingReceived != null
                    ? activity.averageRatingReceived.toFixed(1)
                    : '—',
                hint:
                  activity?.ratingCount > 0
                    ? `${activity.ratingCount} review${activity.ratingCount === 1 ? '' : 's'}`
                    : 'No reviews yet',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="sec-card rounded-2xl border border-[var(--sec-border)] p-4 flex items-start gap-3"
                style={{ background: 'var(--sec-bg-card)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'var(--sec-accent-muted)',
                    border: '1px solid var(--sec-accent-border)',
                  }}
                >
                  <stat.icon size={18} style={{ color: 'var(--sec-accent-bright)' }} />
                </div>
                <div className="min-w-0">
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: 'var(--sec-accent-bright)' }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-sm font-medium text-white mt-0.5">{stat.label}</div>
                  <div className="text-xs text-[var(--sec-text-muted)] mt-1">{stat.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ImageCropDialog
        open={createTablePhotoCrop.cropOpen || manageTablePhotoCrop.cropOpen}
        onOpenChange={(open) => {
          if (!open) {
            createTablePhotoCrop.onCropOpenChange(false);
            manageTablePhotoCrop.onCropOpenChange(false);
          }
        }}
        imageSrc={createTablePhotoCrop.cropSrc || manageTablePhotoCrop.cropSrc}
        title="Crop table photo"
        onCropped={(file) => {
          if (createTablePhotoCrop.cropOpen) createTablePhotoCrop.handleCropped(file);
          else manageTablePhotoCrop.handleCropped(file);
        }}
        outputFileName="hosted-table.jpg"
        aspect={1}
      />

      {showTableModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--sec-bg-card)] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto border border-[var(--sec-border)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Private meet-up table</h3>
              <button type="button" className="text-sm opacity-70" onClick={() => { setShowTableModal(false); setSearchParams({}, { replace: true }); }}>
                Close
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <p className="text-xs text-[var(--sec-text-muted)] leading-relaxed">
                List a private meet-up at any venue. To book tables at official SEC events, use Book a table on the event page — venues control those listings.
              </p>
              <label className="block text-sm font-medium">
                Venue name
                <input
                  placeholder="e.g. Rooftop Lounge"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.venueName}
                  onChange={(e) => setTableForm((f) => ({ ...f, venueName: e.target.value }))}
                />
              </label>
              <div>
                <div className="text-sm font-medium mb-1">Address</div>
                <p className="text-xs text-[var(--sec-text-muted)] mb-2">Required so friends know exactly where to go.</p>
                <GoogleAddressInput
                  value={tableForm.venueAddress}
                  onChange={(structured) => {
                    const addr =
                      typeof structured === 'string'
                        ? structured
                        : structured?.formattedAddress || structured?.street || '';
                    setTableForm((f) => ({ ...f, venueAddress: addr }));
                  }}
                />
              </div>
              <label className="block text-sm font-medium">
                Date
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.eventDate}
                  onChange={(e) => setTableForm((f) => ({ ...f, eventDate: e.target.value }))}
                />
              </label>
              <input
                placeholder="Table name (e.g. VIP Section)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.tableName}
                onChange={(e) => setTableForm((f) => ({ ...f, tableName: e.target.value }))}
                maxLength={60}
              />
              <select
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.eventType}
                onChange={(e) => setTableForm((f) => ({ ...f, eventType: e.target.value }))}
              >
                <option value="CLUB_TABLE">Club Table</option>
                <option value="HOUSE_PARTY">House Party</option>
                <option value="BOAT_PARTY">Boat Party</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="OTHER">Other</option>
              </select>
              <textarea
                placeholder="Description (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                rows={3}
                value={tableForm.tableDescription}
                onChange={(e) => setTableForm((f) => ({ ...f, tableDescription: e.target.value }))}
                maxLength={300}
              />
              <label className="block text-sm font-medium">
                Meet time
                <input
                  type="time"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.eventTime}
                  onChange={(e) => setTableForm((f) => ({ ...f, eventTime: e.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium">
                Spots at table
                <input
                  type="number"
                  min={1}
                  max={tableGuestMax}
                  placeholder="Spots at table"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.guestQuantity}
                  onChange={(e) =>
                    setTableForm((f) => {
                      const raw = parseInt(e.target.value, 10) || 1;
                      return { ...f, guestQuantity: Math.min(Math.max(1, raw), tableGuestMax) };
                    })
                  }
                />
              </label>
              <p className="text-xs text-[var(--sec-text-muted)]">Private meet-ups allow at most 20 spots.</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tableForm.hasJoiningFee}
                  onChange={(e) => setTableForm((f) => ({ ...f, hasJoiningFee: e.target.checked }))}
                />
                Charge joining fee
              </label>
              {tableForm.hasJoiningFee && (
                <input
                  type="number"
                  min={10}
                  placeholder="Joining fee (ZAR)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.joiningFee}
                  onChange={(e) => setTableForm((f) => ({ ...f, joiningFee: e.target.value }))}
                />
              )}
              <div>
                <label className="text-xs text-[var(--sec-text-muted)] block mb-2">
                  Table photo (group chat, browse & Home when boosted)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-xs sec-input-rect"
                  onChange={createTablePhotoCrop.handleInputChange}
                />
                {tableForm.photo ? (
                  <img src={tableForm.photo} alt="" className="w-full h-28 object-cover rounded-xl mt-2" />
                ) : null}
              </div>
              <div className="rounded-xl border border-[var(--sec-border)] p-3 space-y-2">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={tableForm.isPublic}
                    onChange={(e) => setTableForm((f) => ({ ...f, isPublic: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium">Show in public table list</span>
                    <span className="block text-xs text-[var(--sec-text-muted)] mt-0.5">
                      Turn off for a private table: only people you invite can join, and others must request approval to join.
                    </span>
                  </span>
                </label>
              </div>
              <button
                type="button"
                disabled={saving}
                className="sec-btn sec-btn-primary w-full disabled:opacity-50"
                onClick={submitTable}
              >
                List my table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
