import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BookOpen, Users, Search, Loader2, Check, X,
  DollarSign, Calendar, Building2, ChevronRight, Eye
} from 'lucide-react';
import { toast } from 'sonner';

function StatusBadge({ status }) {
  const classMap = {
    open: 'sec-badge-success',
    active: 'sec-badge-gold',
    full: 'sec-badge-gold',
    closed: 'sec-badge-muted',
  };
  return (
    <span className={`sec-badge ${classMap[status] || 'sec-badge-muted'}`}>
      {status}
    </span>
  );
}

export default function BusinessBookings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailTable, setDetailTable] = useState(null);

  useEffect(() => {
    (async () => {
      try { setUser(await authService.getCurrentUser()); }
      catch { authService.redirectToLogin(); }
    })();
  }, []);

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user,
  });
  const venue = venues[0];

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['biz-tables', venue?.id],
    queryFn: () => dataService.Table.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['biz-events', venue?.id],
    queryFn: () => dataService.Event.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => dataService.Table.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biz-tables'] });
      toast.success('Booking updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  const handleApproveRequest = (table, requestUserId) => {
    const pending = (table.pending_requests || []).filter(r => {
      const uid = typeof r === 'string' ? r : r.user_id;
      return uid !== requestUserId;
    });
    const members = [...(table.members || []), requestUserId];
    updateMutation.mutate({
      id: table.id,
      data: {
        pending_requests: pending,
        members,
        current_guests: (table.current_guests || 0) + 1,
      },
    });
  };

  const handleRejectRequest = (table, requestUserId) => {
    const pending = (table.pending_requests || []).filter(r => {
      const uid = typeof r === 'string' ? r : r.user_id;
      return uid !== requestUserId;
    });
    updateMutation.mutate({ id: table.id, data: { pending_requests: pending } });
  };

  const eventMap = {};
  events.forEach(e => { eventMap[e.id] = e; });

  const filtered = tables
    .filter(t => statusFilter === 'all' || t.status === statusFilter)
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      const evt = eventMap[t.event_id];
      return (evt?.title || '').toLowerCase().includes(q) || (t.status || '').includes(q);
    });

  const stats = {
    total: tables.length,
    open: tables.filter(t => t.status === 'open').length,
    full: tables.filter(t => t.status === 'full').length,
    totalGuests: tables.reduce((s, t) => s + (t.current_guests || 0), 0),
    totalRevenue: tables.reduce((s, t) => s + (t.min_spend || 0), 0),
    pendingRequests: tables.reduce((s, t) => s + (t.pending_requests?.length || 0), 0),
  };

  if (!user) return null;

  if (!venue) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <BookOpen size={32} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Venue Found</h2>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>Register a venue to manage bookings.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))} style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}>
          Register Venue
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Table Bookings</h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{venue.name} &middot; {tables.length} bookings</p>
      </div>

      {/* Stats Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Tables', value: stats.total },
          { label: 'Open', value: stats.open },
          { label: 'Full', value: stats.full },
          { label: 'Total Guests', value: stats.totalGuests },
          { label: 'Pending Requests', value: stats.pendingRequests },
        ].map(s => (
          <div key={s.label} className="sec-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-accent)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
          <Input
            placeholder="Search by event name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
            style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-10 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }} className="text-white">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="full">Full</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bookings List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sec-accent)', margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, borderRadius: 14,
          backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
        }}>
          <BookOpen size={28} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: 'var(--sec-text-muted)' }}>
            {search ? 'No matching bookings' : 'No table bookings yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(t => {
            const evt = eventMap[t.event_id];
            const pendingCount = t.pending_requests?.length || 0;
            return (
              <div
                key={t.id}
                style={{
                  padding: '14px 16px', borderRadius: 14,
                  backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                    backgroundColor: 'var(--sec-bg-base)', border: '1px solid var(--sec-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Users size={20} style={{ color: 'var(--sec-accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt?.title || 'Table Booking'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                      {t.current_guests || 0}/{t.max_guests || '—'} guests &middot; Min R{t.min_spend || 0}
                      {t.joining_fee ? ` &middot; Fee R${t.joining_fee}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                  <button
                    onClick={() => setDetailTable(t)}
                    style={{ padding: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-text-muted)' }}
                  >
                    <Eye size={16} />
                  </button>
                </div>

                {/* Pending Requests Inline */}
                {pendingCount > 0 && (
                  <div style={{
                    marginTop: 10, padding: '10px 12px', borderRadius: 10,
                    backgroundColor: 'var(--sec-warning-muted)', border: '1px solid rgba(212,160,23,0.2)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sec-warning)', marginBottom: 6 }}>
                      {pendingCount} pending request{pendingCount > 1 ? 's' : ''}
                    </div>
                    {(t.pending_requests || []).slice(0, 3).map((req, i) => {
                      const uid = typeof req === 'string' ? req : req.user_id;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <span style={{ fontSize: 12, color: 'var(--sec-text-secondary)', flex: 1 }}>
                            Guest request #{i + 1}
                          </span>
                          <button
                            onClick={() => handleApproveRequest(t, uid)}
                            disabled={updateMutation.isPending}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              backgroundColor: 'var(--sec-success-muted)', color: 'var(--sec-success)', fontSize: 11, fontWeight: 600,
                            }}
                          >
                            <Check size={12} style={{ display: 'inline', marginRight: 3 }} />
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(t, uid)}
                            disabled={updateMutation.isPending}
                            style={{
                              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              backgroundColor: 'var(--sec-error-muted)', color: 'var(--sec-error)', fontSize: 11, fontWeight: 600,
                            }}
                          >
                            <X size={12} style={{ display: 'inline', marginRight: 3 }} />
                            Reject
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailTable} onOpenChange={() => setDetailTable(null)}>
        <DialogContent className="text-white sm:max-w-[440px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
          </DialogHeader>
          {detailTable && (
            <div className="space-y-3 mt-2">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Status</span>
                <StatusBadge status={detailTable.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Guests</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{detailTable.current_guests || 0} / {detailTable.max_guests || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Min Spend</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>R {detailTable.min_spend || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Joining Fee</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>R {detailTable.joining_fee || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Members</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{detailTable.members?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Pending Requests</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{detailTable.pending_requests?.length || 0}</span>
              </div>
              {detailTable.event_id && eventMap[detailTable.event_id] && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Event</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{eventMap[detailTable.event_id].title}</span>
                </div>
              )}
              <div className="pt-2">
                <Button
                  onClick={() => { setDetailTable(null); navigate(createPageUrl('ManageTable') + '?id=' + detailTable.id); }}
                  className="w-full h-10 rounded-xl font-semibold"
                  style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
                >
                  Manage Table <ChevronRight size={15} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
