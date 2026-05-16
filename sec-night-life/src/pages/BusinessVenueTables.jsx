import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiPatch } from '@/api/client';
import { toast } from 'sonner';
import { Plus, Calendar, Armchair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BusinessVenueTables() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tableName: '',
    description: '',
    guestCapacity: '6',
    minimumSpend: '2000',
    bookingFeeZar: '0',
    minSpendSettlement: 'PAY_ON_ARRIVAL',
    serviceDate: '',
    startTime: '19:00',
    allowsCustomRequests: false,
  });
  const [declineDraft, setDeclineDraft] = useState({});

  const { data: venues = [] } = useQuery({
    queryKey: ['my-venues'],
    queryFn: () => apiGet('/api/venues/mine'),
  });
  const venue = venues[0];

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['biz-venue-tables', venue?.id],
    queryFn: () => apiGet(`/api/venue-tables/venue/${venue.id}`),
    enabled: !!venue?.id,
  });

  const { data: reservations } = useQuery({
    queryKey: ['biz-venue-reservations'],
    queryFn: () => apiGet('/api/business/venue-table-reservations?status=pending'),
    enabled: !!venue?.id,
  });

  const createMutation = useMutation({
    mutationFn: (body) => apiPost('/api/venue-tables', { venueId: venue.id, ...body }),
    onSuccess: () => {
      toast.success('Table listing created');
      qc.invalidateQueries({ queryKey: ['biz-venue-tables'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.data?.error || e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ tableId, memberId, action, declineReason }) =>
      apiPatch(`/api/venue-tables/${tableId}/reservations/${memberId}`, { action, declineReason }),
    onSuccess: () => {
      toast.success('Updated');
      qc.invalidateQueries({ queryKey: ['biz-venue-reservations'] });
    },
    onError: (e) => toast.error(e?.data?.error || e.message),
  });

  const saveVenueFlags = useMutation({
    mutationFn: () =>
      apiPatch(`/api/venues/${venue.id}`, {
        accepts_day_bookings: true,
      }),
    onSuccess: () => toast.success('Day bookings enabled on venue profile'),
  });

  if (!venue) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Register your venue first.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))}>Register venue</Button>
      </div>
    );
  }

  const pending = reservations?.items || [];

  return (
    <div className="sec-page" style={{ paddingBottom: 48 }}>
      <div className="sec-page-header">
        <h1 className="sec-page-title">Tables & day bookings</h1>
        <p className="sec-page-subtitle">List tables for events or any day. Guests book through Sec — not user-hosted SEC event tables.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Button className="sec-btn sec-btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} className="mr-2" /> New listing
        </Button>
        <Button variant="outline" onClick={() => saveVenueFlags.mutate()}>
          Enable “Book on Sec” for non-event days
        </Button>
      </div>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar size={18} /> Pending requests ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}>
                <div className="font-medium">{r.table?.tableName}</div>
                <p className="text-xs opacity-70">@{r.user?.username || r.user?.fullName}</p>
                {r.userSpecs?.notes ? <p className="text-sm mt-2">{r.userSpecs.notes}</p> : null}
                <textarea
                  className="w-full mt-2 text-sm rounded-lg border p-2"
                  placeholder="Decline reason (required if declining)"
                  value={declineDraft[r.id] || ''}
                  onChange={(e) => setDeclineDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => reviewMutation.mutate({ tableId: r.table.id, memberId: r.id, action: 'approve' })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      reviewMutation.mutate({
                        tableId: r.table.id,
                        memberId: r.id,
                        action: 'decline',
                        declineReason: declineDraft[r.id],
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <form
          className="rounded-xl border p-4 mb-6 space-y-3"
          style={{ borderColor: 'var(--sec-border)' }}
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({
              tableName: form.tableName,
              description: form.description || null,
              guestCapacity: parseInt(form.guestCapacity, 10),
              minimumSpend: parseFloat(form.minimumSpend),
              bookingFeeZar: parseFloat(form.bookingFeeZar) || 0,
              minSpendSettlement: form.minSpendSettlement,
              serviceDate: form.serviceDate ? new Date(form.serviceDate).toISOString() : null,
              startTime: form.startTime,
              allowsCustomRequests: form.allowsCustomRequests,
              eventId: null,
            });
          }}
        >
          <Label>Table name</Label>
          <Input value={form.tableName} onChange={(e) => setForm((f) => ({ ...f, tableName: e.target.value }))} required />
          <Label>Capacity</Label>
          <Input type="number" value={form.guestCapacity} onChange={(e) => setForm((f) => ({ ...f, guestCapacity: e.target.value }))} />
          <Label>Minimum spend (ZAR)</Label>
          <Input value={form.minimumSpend} onChange={(e) => setForm((f) => ({ ...f, minimumSpend: e.target.value }))} />
          <Label>Booking fee (ZAR)</Label>
          <Input value={form.bookingFeeZar} onChange={(e) => setForm((f) => ({ ...f, bookingFeeZar: e.target.value }))} />
          <Label>Service date (optional — leave empty for recurring)</Label>
          <Input type="date" value={form.serviceDate} onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allowsCustomRequests} onChange={(e) => setForm((f) => ({ ...f, allowsCustomRequests: e.target.checked }))} />
            Allow custom table requests (venue reviews before payment)
          </label>
          <Button type="submit" disabled={createMutation.isPending}>Create listing</Button>
        </form>
      )}

      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Armchair size={18} /> Your listings
      </h2>
      {isLoading ? <p>Loading…</p> : null}
      <div className="space-y-2">
        {tables.map((t) => (
          <div key={t.id} className="rounded-xl border p-3 flex justify-between" style={{ borderColor: 'var(--sec-border)' }}>
            <div>
              <div className="font-medium">{t.tableName}</div>
              <p className="text-xs opacity-70">
                Min R{t.minimumSpend} · Fee R{t.bookingFeeZar ?? 0} · {t.memberCount || 0} bookings
              </p>
            </div>
            <span className="text-xs uppercase opacity-60">{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
