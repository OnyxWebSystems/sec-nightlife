import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiGet, apiDelete } from '@/api/client';
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Calendar, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl, getTicketVerifyUrl } from '@/utils';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  isLikelyOffline,
  loadMyTicketsSnapshot,
  saveMyTicketsSnapshot,
} from '@/lib/ticketOfflineCache';

function TicketQrBlock({ verifyUrl }) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const ecLevel = verifyUrl.length > 200 ? 'H' : 'M';
    QRCode.toDataURL(verifyUrl, {
      width: 176,
      margin: 1,
      errorCorrectionLevel: ecLevel,
      color: { dark: '#0a0a0b', light: '#ffffff' },
    })
      .then((u) => {
        if (!cancelled) setDataUrl(u);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [verifyUrl]);

  if (!dataUrl) {
    return <div className="w-44 h-44 rounded-md bg-white/10 animate-pulse shrink-0" />;
  }

  return (
    <div className="relative w-44 h-44 shrink-0">
      <img src={dataUrl} alt="" className="w-full h-full rounded-md bg-white p-1 object-contain" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-5">
        <img
          src="/sec-logo.png"
          alt=""
          className="w-9 h-9 object-contain drop-shadow-md rounded-sm bg-white/90 p-0.5"
          onError={(e) => {
            e.currentTarget.src = '/Logo/sec-email-logo-transparent.png';
          }}
        />
      </div>
    </div>
  );
}

function ticketDetailHref(ticket) {
  if (ticket.venue_table_id) {
    return createPageUrl(`TableDetails?id=${ticket.venue_table_id}&source=venue`);
  }
  if (ticket.event_id) return createPageUrl(`EventDetails?id=${ticket.event_id}`);
  if (ticket.table_id) return createPageUrl(`TableDetails?id=${ticket.table_id}`);
  if (ticket.hosted_table_id) {
    return createPageUrl(`TableDetails?id=${ticket.hosted_table_id}&source=hosted`);
  }
  return createPageUrl('Profile');
}

export default function MyTickets({ userId }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('active');
  const ticketsCache = useMemo(() => (userId ? loadMyTicketsSnapshot(userId) : null), [userId]);

  const activeQ = useQuery({
    queryKey: ['my-tickets', userId, 'active'],
    queryFn: () => apiGet('/api/tickets/my?bucket=active'),
    enabled: !!userId,
  });

  const inactiveQ = useQuery({
    queryKey: ['my-tickets', userId, 'inactive'],
    queryFn: () => apiGet('/api/tickets/my?bucket=inactive'),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const prev = loadMyTicketsSnapshot(userId) || { active: [], inactive: [], expired: [] };
    const next = {
      active: activeQ.isSuccess ? (activeQ.data ?? []) : prev.active,
      inactive: inactiveQ.isSuccess ? (inactiveQ.data ?? []) : (prev.inactive ?? prev.expired),
      expired: inactiveQ.isSuccess ? (inactiveQ.data ?? []) : (prev.expired ?? prev.inactive),
    };
    if (activeQ.isSuccess || inactiveQ.isSuccess) {
      saveMyTicketsSnapshot(userId, next);
    }
  }, [userId, activeQ.isSuccess, activeQ.data, inactiveQ.isSuccess, inactiveQ.data]);

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/api/tickets/my/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Removed from history');
      queryClient.invalidateQueries({ queryKey: ['my-tickets', userId] });
    },
    onError: (e) => toast.error(e?.message || 'Could not delete'),
  });

  const offline = isLikelyOffline();
  const activeTickets =
    activeQ.data !== undefined
      ? activeQ.data
      : offline && ticketsCache?.active?.length
        ? ticketsCache.active
        : activeQ.isError && ticketsCache?.active?.length
          ? ticketsCache.active
          : [];
  const inactiveTickets =
    inactiveQ.data !== undefined
      ? inactiveQ.data
      : offline && (ticketsCache?.inactive?.length || ticketsCache?.expired?.length)
        ? (ticketsCache.inactive ?? ticketsCache.expired)
        : inactiveQ.isError && (ticketsCache?.inactive?.length || ticketsCache?.expired?.length)
          ? (ticketsCache.inactive ?? ticketsCache.expired)
          : [];

  const activeFromCache =
    activeQ.data === undefined && ticketsCache?.active?.length && (offline || activeQ.isError);
  const inactiveFromCache =
    inactiveQ.data === undefined &&
    (ticketsCache?.inactive?.length || ticketsCache?.expired?.length) &&
    (offline || inactiveQ.isError);

  const activeLoading =
    activeQ.isLoading && !(offline && ticketsCache?.active?.length) && activeTickets.length === 0;
  const inactiveLoading =
    inactiveQ.isLoading &&
    !(offline && (ticketsCache?.inactive?.length || ticketsCache?.expired?.length)) &&
    inactiveTickets.length === 0;

  function ticketPhase(ticket) {
    const now = Date.now();
    const exp = ticket.expires_at || ticket.visible_until;
    const start = ticket.event_starts_at;
    if (start && Date.parse(start) > now) return 'upcoming';
    if (exp && Date.parse(exp) <= now) return 'expired';
    return 'inactive';
  }

  if (!userId) {
    return null;
  }

  const TicketCard = ({ ticket }) => {
    const expiresRaw = ticket.expires_at || ticket.visible_until;
    const expiresLabel = expiresRaw
      ? format(parseISO(expiresRaw), 'MMM dd, yyyy HH:mm')
      : '—';
    const isInactiveTab = tab === 'inactive';
    const phase = ticketPhase(ticket);
    const verifyUrl =
      ticket.verify_url ||
      getTicketVerifyUrl(ticket.qr_token, {
        venueName: ticket.venue_name,
        eventStartsAt: ticket.event_starts_at,
      });
    const doorTimeLabel = ticket.event_starts_at
      ? format(parseISO(ticket.event_starts_at), 'EEE MMM d · HH:mm')
      : null;

    return (
      <Card className="glass-card border-[#262629] hover:border-[var(--sec-accent)]/30 transition-all">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white leading-snug">{ticket.title}</h3>
                  {ticket.holder_display_name && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{ticket.holder_display_name}</p>
                  )}
                </div>
                <img
                  src="/sec-logo.png"
                  alt=""
                  className="h-8 w-8 object-contain opacity-90 shrink-0"
                  onError={(e) => {
                    e.currentTarget.src = '/Logo/sec-email-logo-transparent.png';
                  }}
                />
              </div>
              {ticket.subtitle && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Ticket className="w-3.5 h-3.5 shrink-0" />
                  <span>{ticket.subtitle}</span>
                </div>
              )}
              {ticket.table_specs_summary && (
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{ticket.table_specs_summary}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {phase === 'upcoming'
                    ? `Starts ${ticket.event_starts_at ? format(parseISO(ticket.event_starts_at), 'MMM dd, yyyy HH:mm') : '—'}`
                    : phase === 'expired'
                      ? `Expired ${expiresLabel}`
                      : `Valid through ${expiresLabel}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" className="border-[#262629] h-8" asChild>
                  <Link to={ticketDetailHref(ticket)}>View details</Link>
                </Button>
                {isInactiveTab && phase === 'expired' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-900/50 text-red-400 hover:bg-red-950/30 h-8"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(ticket.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-600">
                Issued {ticket.created_at ? format(parseISO(ticket.created_at), 'MMM dd, yyyy') : '—'}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <TicketQrBlock verifyUrl={verifyUrl} />
              {(ticket.venue_name || doorTimeLabel) && (
                <p className="text-[10px] text-gray-300 text-right max-w-[11rem] leading-snug font-medium">
                  {[ticket.venue_name, doorTimeLabel].filter(Boolean).join(' · ')}
                </p>
              )}
              <span className="text-[10px] text-gray-600 text-right max-w-[11rem] leading-tight">
                Venue and time are in the QR link for quick checks
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const emptyCopyActive = {
    title: 'No active tickets',
    hint: 'Book a table or buy an event ticket to see it here.',
  };
  const emptyCopyInactive = {
    title: 'No expired tickets',
    hint: 'Tickets move here after the event ends.',
  };

  return (
    <div className="space-y-4">
      <div className="flex w-full rounded-lg border border-[#262629] bg-[#0A0A0B] p-1">
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-[#1a1a1d] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setTab('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === 'inactive' ? 'bg-[#1a1a1d] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setTab('inactive')}
        >
          Inactive
        </button>
      </div>

      <p className="text-xs text-gray-500 px-1">
        Active shows all valid tickets, including upcoming events. Expired tickets are under Inactive.
      </p>

      {(activeFromCache || inactiveFromCache) && (
        <p className="text-xs text-amber-200/90 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2">
          Offline or couldn&apos;t refresh — showing tickets last saved on this device. Open Profile online once to
          update.
        </p>
      )}

      {tab === 'active' && (
        <div className="mt-4 space-y-3">
          {activeLoading ? (
            <div className="text-center py-8 text-gray-500">Loading tickets...</div>
          ) : activeTickets.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">{emptyCopyActive.title}</p>
              <p className="text-gray-500 text-sm mb-4">{emptyCopyActive.hint}</p>
              <Link to={createPageUrl('Events')}>
                <Button className="sec-btn-accent">Browse events</Button>
              </Link>
            </div>
          ) : (
            activeTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
          )}
        </div>
      )}

      {tab === 'inactive' && (
        <div className="mt-4 space-y-3">
          {inactiveLoading ? (
            <div className="text-center py-8 text-gray-500">Loading tickets...</div>
          ) : inactiveTickets.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">{emptyCopyInactive.title}</p>
              <p className="text-gray-500 text-sm">{emptyCopyInactive.hint}</p>
            </div>
          ) : (
            inactiveTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
          )}
        </div>
      )}
    </div>
  );
}
