import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiPatch } from '@/api/client';
import { toast } from 'sonner';
import { Plus, Armchair, Settings, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TableTierEditor from '@/components/business/TableTierEditor';
import { resolveTierFeesForSave } from '@/lib/tierBookingFees';
import { resolveTierMinSpends } from '@/lib/tierMinSpend';
import { VENUE_DECLINE_TEMPLATES, formatMenuLines } from '@/lib/venueTableMessageTemplates';

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
  const [declineTemplateByMember, setDeclineTemplateByMember] = useState({});
  const [venueFees, setVenueFees] = useState({ host_table_fee_zar: '', custom_table_booking_fee_zar: '' });

  const { data: venues = [] } = useQuery({
    queryKey: ['my-venues'],
    queryFn: () => apiGet('/api/venues/mine'),
  });
  const venue = venues[0];

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

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['biz-venue-tables', venue?.id],
    queryFn: () => apiGet(`/api/venue-tables/venue/${venue.id}?dayOnly=true`),
    enabled: !!venue?.id,
  });

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
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.message || e?.data?.error || 'Could not create'),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ tableId, memberId, action, declineTemplateKey }) =>
      apiPatch(`/api/venue-tables/${tableId}/reservations/${memberId}`, {
        action,
        declineTemplateKey: action === 'decline' ? declineTemplateKey : undefined,
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
      <header className="sec-page-header mb-6">
        <span className="sec-label">Reservations</span>
        <h1 className="sec-page-title">Tables & day bookings</h1>
        <p className="sec-page-subtitle">
          Venue-owned listings for any day or synced from published events. Guests book and pay on Sec.
        </p>
      </header>

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
          ) : tables.length === 0 ? (
            <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
              No day listings yet. Add a listing above, or enable day bookings in Settings so guests can request a custom table.
            </div>
          ) : (
            <div className="space-y-3">
              {tables.map((t) => (
                <div key={t.id} className="sec-card p-4 flex justify-between items-start gap-3 border border-[var(--sec-border)]">
                  <div>
                    <p className="font-semibold">{t.tableName}</p>
                    <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                      Day booking
                      {' · '}Min R{Number(t.minimumSpend).toFixed(0)}
                      {' · '}Fee R{Number(t.bookingFeeZar || 0).toFixed(0)}
                      {' · '}{t.memberCount || 0} bookings
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide opacity-60">{t.status}</span>
                </div>
              ))}
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
                    <p className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)] mb-2">Decline reason (pick one)</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {VENUE_DECLINE_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          className="text-xs px-2.5 py-1.5 rounded-full border transition-colors"
                          style={{
                            borderColor:
                              declineTemplateByMember[r.id] === t.key
                                ? 'var(--sec-accent-border)'
                                : 'var(--sec-border)',
                            background:
                              declineTemplateByMember[r.id] === t.key
                                ? 'var(--sec-accent-muted)'
                                : 'transparent',
                          }}
                          onClick={() =>
                            setDeclineTemplateByMember((d) => ({
                              ...d,
                              [r.id]: declineTemplateByMember[r.id] === t.key ? null : t.key,
                            }))
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
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
                        disabled={!declineTemplateByMember[r.id]}
                        onClick={() =>
                          reviewMutation.mutate({
                            tableId: r.table.id,
                            memberId: r.id,
                            action: 'decline',
                            declineTemplateKey: declineTemplateByMember[r.id],
                          })
                        }
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
  );
}
