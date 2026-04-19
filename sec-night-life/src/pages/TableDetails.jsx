import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Share2, Users, DollarSign, Calendar, Clock,
  BadgeCheck, MessageCircle, UserPlus, Check, X, Crown,
  MoreVertical, CreditCard, Link as LinkIcon, Copy, ChevronRight,
  MapPin, Navigation,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { motion } from 'framer-motion';
import { getEventImage } from '@/lib/placeholders';
import { isIdentityVerifiedUser } from '@/lib/identityVerification';
import { toast } from 'sonner';

import InviteFriendsDialog from '@/components/tables/InviteFriendsDialog';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';

/* ── small shared helpers ─────────────────────────────────────── */

function CircleBtn({ onClick, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--sec-text-secondary)',
        transition: 'border-color 0.15s, background-color 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StatCell({ value, label, valueStyle = {} }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-text-primary)', letterSpacing: '-0.02em', ...valueStyle }}>
        {value}
      </p>
      <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </p>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────── */

export default function TableDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get('id');
  const autoJoin = urlParams.get('join');
  const source = urlParams.get('source');
  const isVenueSource = source === 'venue';
  const [selectedMenuItems, setSelectedMenuItems] = useState({});

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) setUserProfile(profiles[0]);
    } catch (e) {}
  };

  const { data: table, isLoading } = useQuery({
    queryKey: ['table', tableId],
    queryFn: async () => { const t = await dataService.Table.filter({ id: tableId }); return t[0]; },
    enabled: !!tableId,
  });

  const { data: hostedTable, isLoading: hostedLoading } = useQuery({
    queryKey: ['hosted-table-detail', tableId],
    queryFn: async () => {
      try {
        return await apiGet(`/api/host/hosted-tables/${tableId}`);
      } catch {
        return null;
      }
    },
    enabled:
      !!tableId &&
      !isVenueSource &&
      (source === 'hosted' || (!isLoading && !table)),
    retry: false,
  });
  const { data: venueTable, isLoading: venueLoading } = useQuery({
    queryKey: ['venue-table', tableId],
    queryFn: () => apiGet(`/api/venue-tables/${tableId}`),
    enabled: !!tableId && isVenueSource,
  });

  const joinVenueTable = async () => {
    const selected = Object.entries(selectedMenuItems)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity: Number(quantity) }));
    if (!selected.length) {
      toast.error('Select at least one menu item');
      return;
    }
    setIsProcessingPayment(true);
    try {
      const pay = await apiPost(`/api/venue-tables/${tableId}/join`, { selectedMenuItems: selected });
      if (pay?.authorization_url) window.location.href = pay.authorization_url;
    } catch (e) {
      toast.error(e?.message || 'Could not start payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const { data: event } = useQuery({
    queryKey: ['table-event', table?.event_id],
    queryFn: async () => { const e = await dataService.Event.filter({ id: table.event_id }); return e[0]; },
    enabled: !!table?.event_id,
  });

  const { data: venue } = useQuery({
    queryKey: ['table-venue', table?.venue_id],
    queryFn: async () => { const v = await dataService.Venue.filter({ id: table.venue_id }); return v[0]; },
    enabled: !!table?.venue_id,
  });

  const { data: host } = useQuery({
    queryKey: ['table-host', table?.host_user_id],
    queryFn: async () => { const u = await dataService.User.filter({ id: table.host_user_id }); return u[0]; },
    enabled: !!table?.host_user_id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['table-members', table?.members],
    queryFn: async () => {
      if (!table?.members?.length) return [];
      const profiles = await Promise.all(table.members.map(m => dataService.User.filter({ id: m.user_id })));
      return profiles.flat();
    },
    enabled: !!table?.members?.length,
  });

  const handleJoinTable = async () => {
    if (!userProfile) { authService.redirectToLogin(window.location.href); return; }
    if (table.joining_fee > 0) { setShowJoinDialog(false); setShowPaymentDialog(true); }
    else joinMutation.mutate();
  };

  const handlePayment = async () => {
    if (window.self !== window.top) {
      alert('Payment checkout only works in the published app. Please open the app in a new tab.');
      return;
    }
    setIsProcessingPayment(true);
    try {
      const res = await apiPost('/api/payments/initialize', {
        amount: table.joining_fee,
        email: userProfile?.email || user?.email,
        description: `Join Table: ${table.name}`,
        metadata: { type: 'table', table_id: tableId, user_id: userProfile?.id || user?.id },
      });
      if (res?.authorization_url) window.location.href = res.authorization_url;
      else throw new Error('No payment URL');
    } catch {
      alert('Payment failed. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${createPageUrl('TableDetails')}?id=${tableId}`;
    if (navigator.share) {
      try { await navigator.share({ title: table.name, text: `Join my table at ${event?.title || 'this event'}!`, url: shareUrl }); }
      catch {}
    } else setShowShareDialog(true);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${createPageUrl('TableDetails')}?id=${tableId}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const joinMutation = useMutation({
    mutationFn: async () => {
      const updatedMembers = [
        ...(table.members || []),
        { user_id: userProfile?.id, status: 'pending', joined_at: new Date().toISOString(), contribution: 0 },
      ];
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: [...(table.pending_requests || []), userProfile?.id],
      });
      await dataService.Notification.create({
        user_id: table.host_user_id, type: 'table_request',
        title: 'New Table Request',
        message: `${userProfile?.username || 'Someone'} wants to join your table "${table.name}"`,
        data: { table_id: tableId, user_id: userProfile?.id },
        action_url: createPageUrl(`TableDetails?id=${tableId}`),
      });
    },
    onSuccess: () => { setShowJoinDialog(false); queryClient.invalidateQueries(['table', tableId]); },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestUserId) => {
      const member = table.members.find(m => m.user_id === requestUserId);
      const totalPayment = (member?.contribution || 0) + (table.joining_fee || 0);
      const updatedMembers = table.members.map(m =>
        m.user_id === requestUserId ? { ...m, status: 'confirmed' } : m
      );
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: table.pending_requests.filter(id => id !== requestUserId),
        current_guests: (table.current_guests || 1) + 1,
      });
      if (totalPayment > 0) {
        await dataService.Notification.create({
          user_id: requestUserId, type: 'payment',
          title: 'Complete Your Payment',
          message: `Your request to join "${table.name}" was accepted! Complete your payment of R${totalPayment.toLocaleString()} to finalize.`,
          data: { table_id: tableId, amount: totalPayment, contribution: member?.contribution || 0, joining_fee: table.joining_fee || 0 },
          action_url: createPageUrl(`TablePayment?id=${tableId}`),
        });
      } else {
        await dataService.Notification.create({
          user_id: requestUserId, type: 'table_invite',
          title: 'Request Accepted!',
          message: `You've been accepted to join "${table.name}"`,
          data: { table_id: tableId },
          action_url: createPageUrl(`TableDetails?id=${tableId}`),
        });
      }
      const chats = await dataService.Chat.filter({ related_table_id: tableId });
      if (chats.length > 0) {
        const chat = chats[0];
        await dataService.Chat.update(chat.id, {
          participants: [...new Set([...chat.participants, requestUserId])],
        });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(['table', tableId]); },
  });

  const isHost = user?.id === table?.host_user_id;
  const identityOk = isIdentityVerifiedUser(user, userProfile);
  const isMember = table?.members?.some(m => m.user_id === userProfile?.id);
  const isPending = table?.pending_requests?.includes(userProfile?.id);
  const spotsLeft = (table?.max_guests || 10) - (table?.current_guests || 1);

  useEffect(() => {
    if (autoJoin === 'true' && userProfile && table && !isHost && !isMember && !isPending && spotsLeft > 0) {
      setShowJoinDialog(true);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('join');
      window.history.replaceState({}, '', newUrl);
    }
  }, [autoJoin, userProfile, table, isHost, isMember, isPending, spotsLeft]);

  /* ── loading / not found ── */
  if (isVenueSource) {
    if (venueLoading) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
          <div className="sec-spinner" />
        </div>
      );
    }
    if (!venueTable) {
      return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Venue table not found</div>;
    }
    const grouped = (venueTable.menuItems || []).reduce((acc, item) => {
      const key = item.category || 'Other';
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
    const contribution = Object.entries(selectedMenuItems).reduce((sum, [id, qty]) => {
      const item = (venueTable.menuItems || []).find((m) => m.id === id);
      return sum + (item ? item.price * Number(qty || 0) : 0);
    }, 0);
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sec-bg-base)', padding: 20, paddingBottom: 90 }}>
        <button onClick={() => navigate(-1)} className="sec-btn sec-btn-ghost" style={{ marginBottom: 12 }}>Back</button>
        <div className="sec-card" style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{venueTable.tableName}</h1>
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{venueTable.venue?.name}</p>
          <p style={{ marginTop: 8 }}>{venueTable.description || 'No description'}</p>
          <p style={{ marginTop: 8, fontSize: 13 }}>{venueTable.spotsRemaining} spots left</p>
          <p style={{ marginTop: 6, fontSize: 13 }}>R{Number(venueTable.amountContributed).toFixed(0)} of R{Number(venueTable.minimumSpend).toFixed(0)} contributed ({Number(venueTable.progressPercentage).toFixed(1)}%)</p>
        </div>
        <div style={{ marginTop: 14 }}>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="sec-card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{category}</div>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>{item.name} · R{Number(item.price).toFixed(0)}</div>
                  <input
                    type="number"
                    min={0}
                    value={selectedMenuItems[item.id] || 0}
                    onChange={(e) => setSelectedMenuItems((s) => ({ ...s, [item.id]: e.target.value }))}
                    style={{ width: 68 }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="sec-bottom-bar">
          <button onClick={joinVenueTable} disabled={isProcessingPayment || contribution <= 0} className="sec-btn sec-btn-primary sec-btn-full" style={{ height: 48 }}>
            {isProcessingPayment ? 'Processing…' : `Pay R${contribution.toFixed(0)} to join`}
          </button>
          <p style={{ color: 'var(--sec-warning)', fontSize: 12, marginTop: 8 }}>No refunds: once you join and pay, contribution is retained.</p>
          <div style={{ marginTop: 8 }}>
            <RefundPolicyNote />
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || (!isVenueSource && !table && hostedLoading)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!isVenueSource && !table && hostedTable?.kind === 'hosted') {
    const mapQuery = hostedTable.resolvedAddress || hostedTable.venueAddress || hostedTable.venueName || '';
    const joinHosted = async () => {
      if (!userProfile) {
        authService.redirectToLogin(window.location.href);
        return;
      }
      try {
        const r = await apiPost(`/api/host/tables/${tableId}/join`, {});
        queryClient.invalidateQueries({ queryKey: ['hosted-table-detail', tableId] });
        if (r?.pending) toast.success('Request sent. The host will approve your join.');
        else toast.success('Joined table');
      } catch (e) {
        toast.error(e?.message || 'Could not join table');
      }
    };
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 96 }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 40,
          backgroundColor: 'rgba(0,0,0,0.92)',
          borderBottom: '1px solid var(--sec-border)',
          padding: '0 20px', height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button type="button" onClick={() => navigate(-1)} className="sec-btn sec-btn-ghost" style={{ padding: 8 }}>
            <ChevronLeft size={20} />
          </button>
        </header>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hosted table</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{hostedTable.tableName}</h1>
          {hostedTable.event?.title && (
            <p style={{ fontSize: 14, color: 'var(--sec-text-secondary)', marginTop: 8 }}>{hostedTable.event.title}</p>
          )}
          <div className="sec-card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--sec-accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 4 }}>Location</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{hostedTable.resolvedAddress}</div>
                {mapQuery && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="sec-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 14 }}
                  >
                    <Navigation size={16} />
                    Open in Maps
                  </a>
                )}
              </div>
            </div>
          </div>
          {hostedTable.event?.id && (
            <Link
              to={createPageUrl(`EventDetails?id=${hostedTable.event.id}`)}
              className="sec-btn sec-btn-secondary sec-btn-full"
              style={{ marginTop: 14, display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              View event details
            </Link>
          )}
          <button type="button" className="sec-btn sec-btn-primary sec-btn-full" style={{ marginTop: 12, height: 48 }} onClick={joinHosted}>
            Request to join
          </button>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Table not found</h2>
          <Link to={createPageUrl('Tables')} style={{ color: 'var(--sec-text-secondary)', fontSize: 14 }}>Browse Tables</Link>
        </div>
      </div>
    );
  }

  const progress = ((table?.current_guests || 1) / (table?.max_guests || 10)) * 100;
  const spendPerPerson = Math.ceil((table?.min_spend || 0) / (table?.max_guests || 1));
  const venueAddressLine = venue
    ? [venue.address, venue.suburb, venue.city, venue.province].filter(Boolean).join(', ')
    : '';

  const getDateLabel = () => {
    if (!event?.date) return '';
    const d = parseISO(event.date);
    if (isToday(d)) return 'Tonight';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  };

  /* ── status badge colour ── */
  const statusStyle = {
    open: { bg: 'var(--sec-success-muted)', color: 'var(--sec-success)', border: 'rgba(61,186,107,0.2)' },
    full: { bg: 'var(--sec-error-muted)', color: 'var(--sec-error)', border: 'rgba(217,85,85,0.2)' },
    closed: { bg: 'rgba(107,107,107,0.12)', color: 'var(--sec-text-muted)', border: 'rgba(107,107,107,0.2)' },
  }[table.status] || { bg: 'rgba(107,107,107,0.12)', color: 'var(--sec-text-muted)', border: 'rgba(107,107,107,0.2)' };

  /* ── capacity fill colour ── */
  const fillColor = progress < 50 ? 'var(--sec-success)' : progress < 85 ? 'var(--sec-accent)' : 'var(--sec-error)';

  /* ── dialog shared styles ── */
  const dialogContentStyle = {
    backgroundColor: 'var(--sec-bg-elevated)',
    border: '1px solid var(--sec-border)',
    borderRadius: 'var(--radius-xl)',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 96 }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--sec-border)',
        padding: '0 20px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <CircleBtn onClick={() => navigate(-1)}>
          <ChevronLeft size={18} strokeWidth={2} />
        </CircleBtn>
        <div style={{ display: 'flex', gap: 8 }}>
          <CircleBtn onClick={handleShare}>
            <Share2 size={16} strokeWidth={1.5} />
          </CircleBtn>
          {isHost && (
            <CircleBtn>
              <MoreVertical size={16} strokeWidth={1.5} />
            </CircleBtn>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Table info card ── */}
        <div className="sec-card" style={{ padding: '20px 20px 16px' }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--sec-text-primary)', marginBottom: 4 }}>
                {table.name}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
                Hosted by {host?.username || 'Anonymous'}
              </p>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 'var(--radius-pill)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              backgroundColor: statusStyle.bg, color: statusStyle.color,
              border: `1px solid ${statusStyle.border}`,
              flexShrink: 0,
            }}>
              {table.status}
            </span>
          </div>

          {table.description && (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
              {table.description}
            </p>
          )}

          {/* Capacity bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--sec-text-muted)' }}>Spots filled</span>
              <span style={{ fontWeight: 700, color: 'var(--sec-text-primary)' }}>
                {table.current_guests || 1}/{table.max_guests || 10}
              </span>
            </div>
            <div className="sec-progress" style={{ height: 4 }}>
              <motion.div
                className="sec-progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ backgroundColor: fillColor }}
              />
            </div>
          </div>

          {/* Stats — 3 columns */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12, paddingTop: 14,
            borderTop: '1px solid var(--sec-border)',
          }}>
            <StatCell value={`R${table.min_spend?.toLocaleString()}`} label="Min Spend" />
            <StatCell value={`R${spendPerPerson.toLocaleString()}`} label="Per Person" />
            <StatCell
              value={spotsLeft}
              label="Spots Left"
              valueStyle={{ color: spotsLeft === 0 ? 'var(--sec-error)' : spotsLeft <= 2 ? 'var(--sec-warning)' : 'var(--sec-text-primary)' }}
            />
          </div>
        </div>

        {venueAddressLine && (
          <div className="sec-card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--sec-accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 4 }}>Venue location</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{venueAddressLine}</div>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(venueAddressLine)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="sec-link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 14 }}
                >
                  <Navigation size={16} />
                  Open in Maps
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Event row ── */}
        {event && (
          <Link
            to={createPageUrl(`EventDetails?id=${event.id}`)}
            className="sec-card"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textDecoration: 'none' }}
          >
            {/* Thumbnail */}
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {event.cover_image_url ? (
                <img src={getEventImage(event.cover_image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.title}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--sec-text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} strokeWidth={1.5} />
                  {getDateLabel()}
                </span>
                {event.start_time && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} strokeWidth={1.5} />
                    {event.start_time}
                  </span>
                )}
              </div>
            </div>

            <ChevronRight size={16} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
          </Link>
        )}

        {/* ── Table Members ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Users size={15} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
              Table Members ({members.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((member, index) => {
              const memberData = table.members?.find(m => m.user_id === member.id);
              const isHostMember = member.id === table.host_user_id;
              const isPendingMember = memberData?.status === 'pending';

              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
                  }}
                >
                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-secondary)' }}>
                          {(member.username || 'U')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Host crown badge */}
                    {isHostMember && (
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: 18, height: 18, borderRadius: '50%',
                        backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Crown size={9} strokeWidth={2} style={{ color: 'var(--sec-accent)' }} />
                      </div>
                    )}
                  </div>

                  {/* Name + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 2 }}>
                      {member.username || 'User'}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                      {isHostMember ? 'Host' : isPendingMember ? 'Pending' : 'Confirmed'}
                    </p>
                  </div>

                  {/* Host accept/reject controls */}
                  {isHost && isPendingMember && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => acceptRequestMutation.mutate(member.id)}
                        disabled={acceptRequestMutation.isPending}
                        style={{
                          width: 32, height: 32, borderRadius: '50%',
                          backgroundColor: 'var(--sec-success-muted)',
                          border: '1px solid rgba(61,186,107,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: 'var(--sec-success)',
                        }}
                      >
                        <Check size={14} strokeWidth={2.5} />
                      </button>
                      <button style={{
                        width: 32, height: 32, borderRadius: '50%',
                        backgroundColor: 'var(--sec-error-muted)',
                        border: '1px solid rgba(217,85,85,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--sec-error)',
                      }}>
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {member.is_verified_promoter && !isPendingMember && (
                    <BadgeCheck size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  )}
                </motion.div>
              );
            })}

            {members.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--sec-text-muted)', fontSize: 13 }}>
                No members yet
              </div>
            )}
          </div>
        </div>

        {/* ── Joining fee notice ── */}
        {table.joining_fee > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
              backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DollarSign size={16} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 2 }}>
                Joining Fee: R{table.joining_fee}
              </p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Paid upfront to secure your spot</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom bar ── */}
      <div className="sec-bottom-bar">
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 640, margin: '0 auto' }}>
          {isHost ? (
            <>
              <button
                onClick={() => {
                  if (!identityOk) {
                    toast.error('Verify your identity in Profile to invite guests.');
                    return;
                  }
                  setShowInviteDialog(true);
                }}
                className="sec-btn sec-btn-secondary"
                style={{
                  width: 48,
                  height: 48,
                  padding: 0,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-pill)',
                  opacity: identityOk ? 1 : 0.45,
                }}
                title={!identityOk ? 'Identity verification required' : 'Invite friends'}
              >
                <UserPlus size={18} strokeWidth={1.5} />
              </button>
              <Link
                to={createPageUrl(`ChatRoom?table=${tableId}`)}
                className="sec-btn sec-btn-secondary"
                style={{ flex: 1, height: 48, textDecoration: 'none' }}
              >
                <MessageCircle size={16} strokeWidth={1.5} />
                Chat
              </Link>
              <Link
                to={createPageUrl(`ManageTable?id=${tableId}`)}
                className="sec-btn sec-btn-primary"
                style={{ flex: 1, height: 48, textDecoration: 'none' }}
              >
                Manage
              </Link>
            </>
          ) : isMember ? (
            <Link
              to={createPageUrl(`ChatRoom?table=${tableId}`)}
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 48, textDecoration: 'none' }}
            >
              <MessageCircle size={16} strokeWidth={1.5} />
              Open Chat
            </Link>
          ) : isPending ? (
            <button disabled className="sec-btn sec-btn-ghost sec-btn-full" style={{ height: 48, opacity: 0.55 }}>
              Request Pending…
            </button>
          ) : spotsLeft > 0 ? (
            <button
              onClick={() => userProfile
                ? navigate(createPageUrl(`TableJoinOnboarding?id=${tableId}`))
                : authService.redirectToLogin(window.location.href)
              }
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 48, fontSize: 15 }}
            >
              <UserPlus size={16} strokeWidth={2} />
              Request to Join
            </button>
          ) : (
            <button disabled className="sec-btn sec-btn-ghost sec-btn-full" style={{ height: 48, opacity: 0.45 }}>
              Table Full
            </button>
          )}
        </div>
      </div>

      {/* ── Join dialog ── */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent style={dialogContentStyle}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--sec-text-primary)', fontSize: 17, fontWeight: 600 }}>
              Request to Join
            </DialogTitle>
            <DialogDescription style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
              {table.joining_fee > 0 ? 'Payment required to join this table' : 'Send a message to the host with your request'}
            </DialogDescription>
          </DialogHeader>

          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {table.joining_fee === 0 && (
              <Textarea
                placeholder="Hi! I'd love to join your table…"
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                style={{
                  backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
                  borderRadius: 'var(--radius-md)', color: 'var(--sec-text-primary)',
                  fontSize: 14, padding: '12px 14px', minHeight: 100, resize: 'none',
                }}
              />
            )}
            {table.joining_fee > 0 && (
              <div className="sec-card" style={{ padding: '16px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8 }}>
                  Joining Fee
                </p>
                <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--sec-text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  R{table.joining_fee.toLocaleString()}
                </p>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                  Secure your spot at this table. Payment confirms your attendance.
                </p>
                <div style={{ marginTop: 10 }}>
                  <RefundPolicyNote />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowJoinDialog(false)} className="sec-btn sec-btn-ghost" style={{ flex: 1, height: 44 }}>
              Cancel
            </button>
            <button
              onClick={handleJoinTable}
              disabled={joinMutation.isPending || isProcessingPayment}
              className="sec-btn sec-btn-primary"
              style={{ flex: 1, height: 44 }}
            >
              {table.joining_fee > 0
                ? isProcessingPayment ? 'Processing…' : <><CreditCard size={14} strokeWidth={1.5} /> Pay &amp; Join</>
                : joinMutation.isPending ? 'Sending…' : 'Send Request'
              }
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent style={dialogContentStyle}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--sec-text-primary)', fontSize: 17, fontWeight: 600 }}>
              Complete Payment
            </DialogTitle>
            <DialogDescription style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
              Secure checkout powered by Paystack
            </DialogDescription>
          </DialogHeader>

          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="sec-card" style={{ padding: '14px 16px' }}>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 4 }}>You&apos;re joining</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 2 }}>{table.name}</p>
              {event && <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>at {event.title}</p>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
              <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Joining Fee</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--sec-text-primary)' }}>
                R{table.joining_fee.toLocaleString()}
              </span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', textAlign: 'center' }}>
              You&apos;ll be redirected to Paystack&apos;s secure checkout
            </p>
            <RefundPolicyNote className="text-center" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowPaymentDialog(false)} disabled={isProcessingPayment} className="sec-btn sec-btn-ghost" style={{ flex: 1, height: 44 }}>
              Cancel
            </button>
            <button onClick={handlePayment} disabled={isProcessingPayment} className="sec-btn sec-btn-primary" style={{ flex: 1, height: 44 }}>
              {isProcessingPayment ? 'Processing…' : <><CreditCard size={14} strokeWidth={1.5} /> Proceed to Payment</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Share dialog ── */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent style={dialogContentStyle}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--sec-text-primary)', fontSize: 17, fontWeight: 600 }}>
              Share Table
            </DialogTitle>
            <DialogDescription style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
              Invite friends to join your table
            </DialogDescription>
          </DialogHeader>

          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
            }}>
              <LinkIcon size={14} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                value={`${window.location.origin}${createPageUrl('TableDetails')}?id=${tableId}`}
                readOnly
                style={{
                  flex: 1, background: 'transparent', outline: 'none', border: 'none',
                  fontSize: 13, color: 'var(--sec-text-secondary)', minWidth: 0,
                }}
              />
              <button
                onClick={copyLink}
                className="sec-btn sec-btn-secondary"
                style={{ height: 32, padding: '0 12px', fontSize: 12, flexShrink: 0 }}
              >
                {copiedLink ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.5} />}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', textAlign: 'center' }}>
              {copiedLink ? 'Link copied to clipboard' : 'Share this link with friends'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Invite friends dialog ── */}
      <InviteFriendsDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        table={table}
        event={event}
      />
    </div>
  );
}
