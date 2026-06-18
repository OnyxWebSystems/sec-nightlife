import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiPatch } from '@/api/client';
import { toast } from 'sonner';
import { Plus, Armchair, Settings, Loader2, Users, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TableTierEditor from '@/components/business/TableTierEditor';
import { resolveTierFeesForSave } from '@/lib/tierBookingFees';
import { resolveTierMinSpends } from '@/lib/tierMinSpend';
import { VENUE_DECLINE_TEMPLATES, formatMenuLines } from '@/lib/venueTableMessageTemplates';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import VenueSwitcher from '@/components/business/VenueSwitcher';

export default function BusinessVenueTables() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['listings', 'requests', 'settings'].includes(initialTab) ? initialTab : 'listings',
  );

  useEffect(() => {
    const q = searchParams.get('tab');
    if (q && ['listings', 'requests', 'settings'].includes(q) && q !== tab) setTab(q);
  }, [searchParams]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    description: '',
    serviceDate: '',
    startTime: '19:00',
    allowsCustomRequests: false,
    tiers: [{ tier_name: 'Standard', max_guests: '6', min_spend: '2000', booking_fee_zar: '200', included_items: [] }],
  });
  const [declineTemplatesByMember, setDeclineTemplatesByMember] = useState({});
  const [declineParamsByMember, setDeclineParamsByMember] = useState({});
  const [venueFees, setVenueFees] = useState({ host_table_fee_zar: '', custom_table_booking_fee_zar: '' });
  const [actionTableId, setActionTableId] = useState(null);

  const { activeVenue: venue } = useActiveVenue();

  const { data: venueDetail } = useQuery({
    queryKey: ['venue-detail', venue?.id],
    queryFn: () => apiGet(`/api/venues/${venue.id}`),
    enabled: !!venue?.id,
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['venue-menu-biz', venue?.id],
    queryFn: () => apiGet(`/api/business/venues/${venue.id}/menu-items`),
    enabled: !!venue?.id,
  });

  const { data: dayTablesData, isLoading, refetch: refetchDayTables } = useQuery({
    queryKey: ['biz-day-venue-tables', venue?.id],
    queryFn: () => apiGet(`/api/business/day-venue-tables?venue_id=${encodeURIComponent(venue.id)}`),
    enabled: !!venue?.id,
  });

  const dayTables = dayTablesData?.items || [];
  const dayTablesSummary = dayTablesData?.summary;

  async function hideTableFromListings(tableId) {
    if (!window.confirm('Remove this table from guest listings? Guests already on this table are not affected.')) return;
    setActionTableId(tableId);
    try {
      await apiPost(`/api/business/venue-tables/${tableId}/hide-from-listings`);
      toast.success('Removed from listings');
      refetchDayTables();
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not hide table');
    } finally {
      setActionTableId(null);
    }
  }

  async function restoreTableToListings(tableId) {
    setActionTableId(tableId);
    try {
      await apiPost(`/api/business/venue-tables/${tableId}/restore-to-listings`);
      toast.success('Restored to listings');
      refetchDayTables();
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not restore table');
    } finally {
      setActionTableId(null);
    }
  }

  async function resetTableForRelisting(tableId) {
    if (
      !window.confirm(
        'End this table session and make the slot available for new bookings? Current guests\' table QRs will no longer admit. Past payments stay in Bookings & Analytics.',
      )
    ) {
      return;
    }
    setActionTableId(tableId);
    try {
      await apiPost(`/api/business/venue-tables/${tableId}/release`);
      toast.success('Table reset — slot is available for new bookings');
      refetchDayTables();
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
      qc.invalidateQueries({ queryKey: ['biz-venue-table-bookings'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not reset table');
    } finally {
      setActionTableId(null);
    }
  }

  const { data: reservations } = useQuery({
    queryKey: ['biz-venue-reservations'],
    queryFn: () => apiGet('/api/business/venue-table-reservations?status=pending'),
    enabled: !!venue?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      for (const tier of form.tiers) {
        if (!tier.tier_name?.trim()) throw new Error('Each tier needs a name');
        const fees = resolveTierFeesForSave(tier);
        const spends = resolveTierMinSpends(tier);
        await apiPost('/api/venue-tables', {
          venueId: venue.id,
          tableName: tier.tier_name.trim(),
          description: form.description || null,
          guestCapacity: parseInt(tier.max_guests, 10) || 6,
          minimumSpend: spends.min_spend_join,
          hostMinimumSpend: spends.min_spend_host,
          bookingFeeZar: fees.booking_fee_zar,
          hostTableFeeZar: fees.host_table_fee_zar,
          minSpendSettlement: 'PREPAY_MENU',
          serviceDate: form.serviceDate ? new Date(form.serviceDate).toISOString() : null,
          startTime: form.startTime,
          allowsCustomRequests: form.allowsCustomRequests,
          tierLabel: tier.tier_name,
          eventId: null,
        });
      }
    },
    onSuccess: () => {
      toast.success('Listing(s) created');
      qc.invalidateQueries({ queryKey: ['biz-day-venue-tables'] });
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.message || e?.data?.error || 'Could not create'),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ tableId, memberId, action, declineTemplateKeys, declineParams }) =>
      apiPatch(`/api/venue-tables/${tableId}/reservations/${memberId}`, {
        action,
        declineTemplateKeys: action === 'decline' ? declineTemplateKeys : undefined,
        declineParams: action === 'decline' ? declineParams : undefined,
      }),
    onSuccess: () => {
      toast.success('Updated');
      qc.invalidateQueries({ queryKey: ['biz-venue-reservations'] });
    },
    onError: (e) => toast.error(e?.data?.error || e.message),
  });

  const saveVenueFlags = useMutation({
    mutationFn: (accepts) => apiPatch(`/api/venues/${venue.id}`, { accepts_day_bookings: accepts }),
    onSuccess: () => {
      toast.success('Venue settings saved');
      qc.invalidateQueries({ queryKey: ['venue-detail', venue?.id] });
    },
    onError: (e) => toast.error(e?.data?.error || e.message),
  });

  const saveVenueFees = useMutation({
    mutationFn: () =>
      apiPatch(`/api/venues/${venue.id}`, {
        host_table_fee_zar: parseFloat(venueFees.host_table_fee_zar) || 0,
        custom_table_booking_fee_zar: parseFloat(venueFees.custom_table_booking_fee_zar) || 0,
      }),
    onSuccess: () => {
      toast.success('Fees saved');
      qc.invalidateQueries({ queryKey: ['venue-detail', venue?.id] });
    },
    onError: (e) => toast.error(e?.data?.error || e.message),
  });

  useEffect(() => {
    if (venueDetail) {
      setVenueFees({
        host_table_fee_zar: String(venueDetail.host_table_fee_zar ?? ''),
        custom_table_booking_fee_zar: String(venueDetail.custom_table_booking_fee_zar ?? ''),
      });
    }
  }, [venueDetail?.id, venueDetail?.host_table_fee_zar, venueDetail?.custom_table_booking_fee_zar]);

  if (!venue) {
    return (
      <div className="sec-page flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
        <Armchair size={40} className="mb-4 opacity-40" />
        <h2 className="text-lg font-semibold mb-2">No venue yet</h2>
        <p className="text-sm text-[var(--sec-text-muted)] mb-6">Register your venue to manage tables and day bookings.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))}>Register venue</Button>
      </div>
    );
  }

  const pending = reservations?.items || [];
  const dayBookingsOn = Boolean(venueDetail?.accepts_day_bookings);

  return (
    <div className="sec-page max-w-3xl mx-auto pb-28">
      <PageBackHeader
        title="Tables & day bookings"
        subtitle="Venue listings for any day or synced from published events"
        pageName="BusinessVenueTables"
      />
      <div className="px-4 pt-4">

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setSearchParams({ tab: v });
        }}
      >
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="requests">Requests{pending.length > 0 ? ` (${pending.length})` : ''}</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="space-y-4">
          <p className="text-sm text-[var(--sec-text-muted)] leading-relaxed">
            Manage day listings — hide empty slots from guest browse, or reset in-use tables so new guests can book again during the same service window.
          </p>

          {dayTablesSummary ? (
            <div className="flex flex-wrap gap-2">
              {[
                ['In use', dayTablesSummary.inUse, 'var(--sec-accent)'],
                ['Available', dayTablesSummary.available, '#34d399'],
                ['Hidden', dayTablesSummary.hidden, '#9ca3af'],
              ].map(([label, count, color]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-[var(--sec-border)]"
                  style={{ background: 'var(--sec-bg-elevated)', color }}
                >
                  {label}: {count}
                </span>
              ))}
            </div>
          ) : null}

          <Button className="sec-btn sec-btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} className="mr-2" /> New day listing
          </Button>

          {showForm && (
            <form
              className="sec-card p-5 space-y-4 border border-[var(--sec-border)]"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <Label>Description (optional)</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              <Label>Service date (optional)</Label>
              <Input type="date" value={form.serviceDate} onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))} />
              <TableTierEditor
                tiers={form.tiers}
                onChange={(tiers) => setForm((f) => ({ ...f, tiers }))}
                venueMenuItems={menuItems}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowsCustomRequests}
                  onChange={(e) => setForm((f) => ({ ...f, allowsCustomRequests: e.target.checked }))}
                />
                Allow custom table requests on this listing
              </label>
              <Button type="submit" disabled={createMutation.isPending} className="w-full sec-btn-primary">
                {createMutation.isPending ? 'Creating…' : 'Create listings'}
              </Button>
            </form>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
          ) : dayTables.length === 0 ? (
            <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
              No day listings yet. Add a listing above, or enable day bookings in Settings so guests can request a custom table.
            </div>
          ) : (
            <div className="space-y-3">
              {dayTables.map((t) => {
                const statusColor = t.inUse
                  ? 'var(--sec-accent)'
                  : t.isActive
                    ? '#34d399'
                    : '#9ca3af';
                const serviceLabel = t.serviceDate
                  ? new Date(t.serviceDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null;
                return (
                  <div
                    key={t.id}
                    className="sec-card overflow-hidden border"
                    style={{
                      borderColor: t.inUse ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                    }}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{t.tableName}</p>
                            {t.isCustomListing ? (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                                style={{ color: 'var(--sec-accent)', background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}>
                                Custom requests
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                            {t.isCustomListing ? 'Custom table requests' : 'Day booking'}
                            {serviceLabel ? ` · ${serviceLabel}` : ''}
                            {t.startTime ? ` · ${t.startTime}` : ''}
                            {' · '}Min R{Number(t.minimumSpend || 0).toFixed(0)}
                            {' · '}Fee R{Number(t.bookingFeeZar || 0).toFixed(0)}
                          </p>
                          {t.hostLabel ? (
                            <p className="text-xs mt-1.5 inline-flex items-center gap-1 text-[var(--sec-text-muted)]">
                              <UserCheck size={12} style={{ color: 'var(--sec-accent)' }} />
                              Host: {t.hostLabel}
                            </p>
                          ) : null}
                          {(t.tableSessionNumber ?? 1) > 1 ? (
                            <p className="text-[10px] text-[var(--sec-text-muted)] mt-1">Session {t.tableSessionNumber}</p>
                          ) : null}
                        </div>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0"
                          style={{
                            color: statusColor,
                            background: `${statusColor}18`,
                            border: `1px solid ${statusColor}44`,
                          }}
                        >
                          {t.inUse ? 'In use' : t.isActive ? 'Available' : 'Hidden'}
                        </span>
                      </div>

                      {t.inUse ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="inline-flex items-center gap-1.5 text-[var(--sec-text-secondary)]">
                              <Users size={13} style={{ color: 'var(--sec-accent)' }} />
                              {t.usageLabel}
                            </span>
                            <span className="text-[var(--sec-text-muted)]">{t.spotsRemaining ?? 0} spots left</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${t.fillPercent ?? 0}%`,
                                background: 'linear-gradient(90deg, var(--sec-accent), #e8c547)',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs mt-2 text-[var(--sec-text-muted)]">{t.usageLabel}</p>
                      )}
                    </div>

                    {(t.canResetTable || t.canHideFromListings || t.canRestoreToListings) && (
                      <div
                        className="px-4 py-3 border-t flex justify-end gap-2 flex-wrap"
                        style={{ borderColor: 'var(--sec-border)', background: 'rgba(0,0,0,0.2)' }}
                      >
                        {t.canResetTable ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs sec-btn-secondary"
                            disabled={actionTableId === t.id}
                            onClick={() => resetTableForRelisting(t.id)}
                          >
                            {actionTableId === t.id ? <Loader2 size={14} className="animate-spin" /> : 'Reset table'}
                          </Button>
                        ) : null}
                        {t.canHideFromListings ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionTableId === t.id}
                            className="h-8 text-xs"
                            style={{ borderColor: 'var(--sec-border)' }}
                            onClick={() => hideTableFromListings(t.id)}
                          >
                            {actionTableId === t.id ? <Loader2 size={14} className="animate-spin" /> : 'Remove from listings'}
                          </Button>
                        ) : (
                          t.canRestoreToListings ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionTableId === t.id}
                              className="h-8 text-xs"
                              style={{ borderColor: 'var(--sec-accent-border)', color: 'var(--sec-accent)' }}
                              onClick={() => restoreTableToListings(t.id)}
                            >
                              Restore to listings
                            </Button>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {pending.length === 0 ? (
            <p className="text-sm text-center text-[var(--sec-text-muted)] py-8">No pending table requests.</p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => {
                const specs = r.userSpecs || {};
                const menuLines = formatMenuLines(
                  specs.selectedMenuItems || r.selectedMenuItems,
                  menuItems,
                );
                const menuTotal = menuLines.reduce((s, l) => s + l.lineTotal, 0);
                const minSpend =
                  specs.proposedMinimumSpend != null
                    ? Number(specs.proposedMinimumSpend)
                    : menuTotal > 0
                      ? menuTotal
                      : null;
                return (
                  <div
                    key={r.id}
                    className="sec-card p-5 border border-[var(--sec-border)]"
                    style={{ background: 'linear-gradient(180deg, #121214 0%, #0a0a0b 100%)' }}
                  >
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-base">{r.table?.tableName || 'Custom table request'}</p>
                        <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
                          @{r.user?.username || r.user?.fullName || 'guest'}
                        </p>
                      </div>
                      {r.table?.event?.title ? (
                        <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full border border-[var(--sec-border)]">
                          {r.table.event.title}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {specs.guestCount != null ? (
                        <div className="rounded-xl p-2.5 border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)]">
                          <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)]">Guests</p>
                          <p className="text-sm font-medium mt-0.5">{specs.guestCount}</p>
                        </div>
                      ) : null}
                      {specs.preferredDate || specs.preferredTime ? (
                        <div className="rounded-xl p-2.5 border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)]">
                          <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)]">When</p>
                          <p className="text-sm font-medium mt-0.5">
                            {[specs.preferredDate, specs.preferredTime].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      ) : null}
                      {minSpend != null && minSpend > 0 ? (
                        <div className="rounded-xl p-2.5 border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)]">
                          <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)]">Min spend</p>
                          <p className="text-sm font-medium mt-0.5">
                            R{minSpend.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}
                            {specs.minSpendMode === 'menu' ? ' (menu)' : specs.minSpendMode === 'manual' ? ' (manual)' : ''}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    {menuLines.length > 0 ? (
                      <div className="mb-3">
                        <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)] mb-2">Menu selection</p>
                        <div className="flex flex-wrap gap-1.5">
                          {menuLines.map((line, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-1 rounded-full border border-[var(--sec-border)]"
                            >
                              {line.qty}× {line.label}
                              {line.lineTotal > 0 ? ` · R${line.lineTotal.toFixed(0)}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {specs.notes ? (
                      <p className="text-sm text-[var(--sec-text-secondary)] mb-3 italic">&ldquo;{specs.notes}&rdquo;</p>
                    ) : null}
                    <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)] mb-2">Decline reasons (pick one or more)</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {VENUE_DECLINE_TEMPLATES.map((t) => {
                        const selected = (declineTemplatesByMember[r.id] || []).includes(t.key);
                        return (
                        <button
                          key={t.key}
                          type="button"
                          className="text-xs px-2.5 py-1.5 rounded-full border transition-colors"
                          style={{
                            borderColor: selected ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                            background: selected ? 'var(--sec-accent-muted)' : 'transparent',
                          }}
                          onClick={() => {
                            setDeclineTemplatesByMember((d) => {
                              const cur = d[r.id] || [];
                              const next = cur.includes(t.key)
                                ? cur.filter((k) => k !== t.key)
                                : [...cur, t.key];
                              return { ...d, [r.id]: next };
                            });
                          }}
                        >
                          {t.label}
                        </button>
                        );
                      })}
                    </div>
                    {(declineTemplatesByMember[r.id] || []).includes('decline_increase_min_spend') ? (
                      <div className="mb-3">
                        <Label className="text-xs text-[var(--sec-text-muted)]">Preferred minimum spend (ZAR)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1 h-9 max-w-[200px]"
                          placeholder="e.g. 8000"
                          value={declineParamsByMember[r.id]?.preferredMinimumSpend ?? ''}
                          onChange={(e) =>
                            setDeclineParamsByMember((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], preferredMinimumSpend: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {(declineTemplatesByMember[r.id] || []).includes('decline_add_menu_items') ? (
                      <div className="mb-3">
                        <Label className="text-xs text-[var(--sec-text-muted)]">Menu items should total at least (ZAR)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1 h-9 max-w-[200px]"
                          placeholder="e.g. 4500"
                          value={declineParamsByMember[r.id]?.preferredMenuTotal ?? ''}
                          onChange={(e) =>
                            setDeclineParamsByMember((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], preferredMenuTotal: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {(declineTemplatesByMember[r.id] || []).includes('decline_no_tables_datetime') ? (
                      <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                        <div>
                          <Label className="text-xs text-[var(--sec-text-muted)]">Available date</Label>
                          <Input
                            type="date"
                            className="mt-1 h-9"
                            value={declineParamsByMember[r.id]?.availableDate ?? ''}
                            onChange={(e) =>
                              setDeclineParamsByMember((p) => ({
                                ...p,
                                [r.id]: { ...p[r.id], availableDate: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-[var(--sec-text-muted)]">Available time</Label>
                          <Input
                            type="time"
                            className="mt-1 h-9"
                            value={declineParamsByMember[r.id]?.availableTime ?? ''}
                            onChange={(e) =>
                              setDeclineParamsByMember((p) => ({
                                ...p,
                                [r.id]: { ...p[r.id], availableTime: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                    {(declineTemplatesByMember[r.id] || []).includes('decline_too_many_guests') ? (
                      <div className="mb-3">
                        <Label className="text-xs text-[var(--sec-text-muted)]">Maximum guests we can seat</Label>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          className="mt-1 h-9 max-w-[200px]"
                          placeholder="e.g. 6"
                          value={declineParamsByMember[r.id]?.maxGuestCount ?? ''}
                          onChange={(e) =>
                            setDeclineParamsByMember((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], maxGuestCount: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="sec-btn-primary"
                        onClick={() => reviewMutation.mutate({ tableId: r.table.id, memberId: r.id, action: 'approve' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={(() => {
                          const keys = declineTemplatesByMember[r.id] || [];
                          if (!keys.length) return true;
                          if (keys.includes('decline_increase_min_spend')) {
                            const n = parseFloat(declineParamsByMember[r.id]?.preferredMinimumSpend);
                            if (!Number.isFinite(n) || n < 0) return true;
                          }
                          if (keys.includes('decline_add_menu_items')) {
                            const n = parseFloat(declineParamsByMember[r.id]?.preferredMenuTotal);
                            if (!Number.isFinite(n) || n < 0) return true;
                          }
                          if (keys.includes('decline_no_tables_datetime')) {
                            const p = declineParamsByMember[r.id] || {};
                            if (!p.availableDate || !p.availableTime) return true;
                          }
                          if (keys.includes('decline_too_many_guests')) {
                            const n = parseInt(declineParamsByMember[r.id]?.maxGuestCount, 10);
                            if (!Number.isFinite(n) || n < 1) return true;
                          }
                          return false;
                        })()}
                        onClick={() => {
                          const keys = declineTemplatesByMember[r.id] || [];
                          const params = {};
                          if (keys.includes('decline_increase_min_spend')) {
                            params.preferredMinimumSpend = parseFloat(declineParamsByMember[r.id]?.preferredMinimumSpend);
                          }
                          if (keys.includes('decline_add_menu_items')) {
                            params.preferredMenuTotal = parseFloat(declineParamsByMember[r.id]?.preferredMenuTotal);
                          }
                          if (keys.includes('decline_no_tables_datetime')) {
                            params.availableDate = declineParamsByMember[r.id]?.availableDate;
                            params.availableTime = declineParamsByMember[r.id]?.availableTime;
                          }
                          if (keys.includes('decline_too_many_guests')) {
                            params.maxGuestCount = parseInt(declineParamsByMember[r.id]?.maxGuestCount, 10);
                          }
                          reviewMutation.mutate({
                            tableId: r.table.id,
                            memberId: r.id,
                            action: 'decline',
                            declineTemplateKeys: keys,
                            declineParams: params,
                          });
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="sec-card p-5 border border-[var(--sec-border)]">
          <div className="flex items-center gap-3">
            <Settings size={18} className="opacity-70" />
            <div className="flex-1">
              <p className="font-medium">Show Book on Sec for non-event days</p>
              <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                When on, your venue profile shows day bookings guests can reserve outside events.
              </p>
            </div>
            <Switch
              checked={dayBookingsOn}
              onCheckedChange={(v) => saveVenueFlags.mutate(v)}
              disabled={saveVenueFlags.isPending}
            />
          </div>
          <div className="mt-6 space-y-3 border-t border-[var(--sec-border)] pt-5">
            <p className="text-sm font-medium">Default fees (custom table hosts)</p>
            <div>
              <Label className="text-xs">Host table fee (ZAR)</Label>
              <Input
                className="mt-1 h-9"
                type="number"
                min={0}
                value={venueFees.host_table_fee_zar}
                onChange={(e) => setVenueFees((f) => ({ ...f, host_table_fee_zar: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Custom table booking fee (ZAR)</Label>
              <Input
                className="mt-1 h-9"
                type="number"
                min={0}
                value={venueFees.custom_table_booking_fee_zar}
                onChange={(e) => setVenueFees((f) => ({ ...f, custom_table_booking_fee_zar: e.target.value }))}
              />
            </div>
            <Button
              type="button"
              className="sec-btn-primary w-full"
              disabled={saveVenueFees.isPending}
              onClick={() => saveVenueFees.mutate()}
            >
              Save fees
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
