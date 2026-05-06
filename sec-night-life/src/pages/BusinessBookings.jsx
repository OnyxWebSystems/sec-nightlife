import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from '@/api/client';
import {
  BookOpen, Users, Search, Loader2, ChevronRight, Eye
} from 'lucide-react';

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

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['biz-event-table-bookings', user?.id],
    queryFn: () => apiGet('/api/business/event-table-bookings'),
    enabled: !!user,
  });
  const tables = bookingsData?.items || [];

  const filtered = tables
    .filter(t => statusFilter === 'all' || t.role === statusFilter)
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (t?.event?.title || '').toLowerCase().includes(q) ||
        (t?.hostedTable?.tableName || '').toLowerCase().includes(q) ||
        (t?.user?.username || '').toLowerCase().includes(q)
      );
    });

  const stats = {
    total: tables.length,
    open: tables.filter(t => (t.hostedTable?.status || '').toLowerCase() === 'active').length,
    full: tables.filter(t => (t.hostedTable?.status || '').toLowerCase() === 'full').length,
    totalGuests: tables.filter((t) => t.role === 'GUEST').length,
    totalRevenue: tables.reduce((s, t) => s + Number(t.amountTotal || 0), 0),
    pendingRequests: 0,
  };

  if (!user) return null;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Table Bookings</h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{tables.length} SEC hosted-table booking records</p>
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
            <SelectItem value="HOST">Host fee</SelectItem>
            <SelectItem value="GUEST">Guest join</SelectItem>
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
                      {t.event?.title || 'Event booking'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                      {t.hostedTable?.tableName || 'Hosted table'} · {t.role}
                      {t.amountTotal ? ` · Paid R${Number(t.amountTotal).toFixed(0)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={(t.hostedTable?.status || '').toLowerCase()} />
                  <button
                    onClick={() => setDetailTable(t)}
                    style={{ padding: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-text-muted)' }}
                  >
                    <Eye size={16} />
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--sec-text-muted)' }}>
                  User: {t.user?.username || 'guest'} · Entrance: R{Number(t.entranceZar || 0).toFixed(0)} · Component: R{Number(t.componentZar || 0).toFixed(0)}
                </div>
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
                <StatusBadge status={(detailTable.hostedTable?.status || '').toLowerCase()} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Role</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{detailTable.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Total paid</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>R {detailTable.amountTotal || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Reference</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{detailTable.paystackReference || '—'}</span>
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => { setDetailTable(null); navigate(createPageUrl('TableDetails') + `?id=${detailTable.hostedTable?.id}&source=hosted`); }}
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
