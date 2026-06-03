import React, { useState, useEffect, useMemo } from 'react';
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
import { launchPaystackInline, verifyPaystackReference } from '@/lib/paystackInline';
import MenuPicker, { menuSelectionToPayload, menuSelectionChargeableTotal } from '@/components/menu/MenuPicker';
import VenueMenuBrowser, { getVenueMenuCartStats } from '@/components/menu/VenueMenuBrowser';
import TableCheckoutFooter from '@/components/menu/TableCheckoutFooter';
import CheckoutCart, { CHECKOUT_FOOTNOTES } from '@/components/checkout/CheckoutCart';
import CustomTableRequestModal from '@/components/tables/CustomTableRequestModal';

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
  const [hostPaySuccess, setHostPaySuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get('id');
  const autoJoin = urlParams.get('join');
  const source = urlParams.get('source');
  const bookingModeParam = urlParams.get('mode');
  const settlementParam = urlParams.get('settlement');
  const isVenueSource = source === 'venue';
  const venueBookingMode = bookingModeParam === 'host' ? 'host' : 'join';
  const isHostCheckout = venueBookingMode === 'host';
  const [selectedMenuItems, setSelectedMenuItems] = useState({});
  const [hostedMenuSelected, setHostedMenuSelected] = useState({});

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

  const [venueSettlementMode, setVenueSettlementMode] = useState(() =>
    settlementParam === 'PREPAY_LUMP' ? 'PREPAY_LUMP' : 'PREPAY_MENU',
  );
  const [venueCheckoutStep, setVenueCheckoutStep] = useState(() =>
    settlementParam === 'PREPAY_LUMP' ? 'checkout' : 'menu',
  );

  useEffect(() => {
    if (settlementParam === 'PREPAY_LUMP') {
      setVenueSettlementMode('PREPAY_LUMP');
      setVenueCheckoutStep('checkout');
    } else if (settlementParam === 'PREPAY_MENU') {
      setVenueSettlementMode('PREPAY_MENU');
      setVenueCheckoutStep('menu');
    }
  }, [settlementParam]);
  const [customRequestOpen, setCustomRequestOpen] = useState(false);
  const [customSubmitting, setCustomSubmitting] = useState(false);

  const venueMenuSelectionPayload = useMemo(
    () =>
      Object.entries(selectedMenuItems)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity: Number(quantity) })),
    [selectedMenuItems],
  );

  const { data: venueCheckoutPreview } = useQuery({
    queryKey: ['venue-checkout-preview', tableId, venueMenuSelectionPayload, venueSettlementMode, venueBookingMode],
    queryFn: () =>
      apiPost(`/api/venue-tables/${tableId}/checkout-preview`, {
        selectedMenuItems: venueMenuSelectionPayload,
        settlementMode: venueSettlementMode,
        bookingMode: venueBookingMode,
      }),
    enabled: isVenueSource && !!tableId && !!venueTable,
  });

  useEffect(() => {
    if (urlParams.get('request') === '1') {
      setCustomRequestOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isVenueSource || !venueTable?.includedItems?.length) return;
    setSelectedMenuItems((prev) => {
      const next = { ...prev };
      for (const inc of venueTable.includedItems) {
        const id = inc.menu_item_id || inc.menuItemId;
        if (id && !next[id]) next[id] = String(inc.quantity || 1);
      }
      return next;
    });
  }, [isVenueSource, venueTable?.id, venueTable?.includedItems]);

  const joinVenueTable = async () => {
    const membership = venueTable?.myMembership;
    if (membership?.status === 'PENDING_VENUE_REVIEW') {
      toast.error('Awaiting venue approval before checkout');
      return;
    }
    if (membership?.status === 'DECLINED') {
      toast.error('Your request was declined');
      return;
    }
    if (venueCheckoutPreview?.error) {
      toast.error(venueCheckoutPreview.error);
      return;
    }
    const selected =
      venueSettlementMode === 'PREPAY_LUMP'
        ? []
        : Object.entries(selectedMenuItems)
            .filter(([, qty]) => Number(qty) > 0)
            .map(([menuItemId, quantity]) => ({ menuItemId, quantity: Number(quantity) }));
    setIsProcessingPayment(true);
    try {
      const pay = await apiPost(`/api/venue-tables/${tableId}/join`, {
        selectedMenuItems: selected,
        settlementMode: venueSettlementMode,
        bookingMode: venueBookingMode,
      });
      const refreshBookingQueries = () => {
        queryClient.invalidateQueries(['venue-table', tableId]);
        queryClient.invalidateQueries(['notifications']);
        queryClient.invalidateQueries(['notifications-unread']);
        if (venueTable?.eventId) {
          queryClient.invalidateQueries(['event', venueTable.eventId]);
          queryClient.invalidateQueries(['event-table-tiers', venueTable.eventId]);
        }
      };
      if (pay?.confirmed) {
        refreshBookingQueries();
        if (isHostCheckout) {
          setHostPaySuccess(true);
          toast.success('You are now hosting this table');
        } else {
          toast.success('Booking confirmed');
        }
        return;
      }
      if (pay?.reference && pay?.access_code) {
        await launchPaystackInline({
          email: user?.email,
          amount: pay?.amount || 0,
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || pay.reference);
            refreshBookingQueries();
            if (isHostCheckout) {
              setHostPaySuccess(true);
              toast.success('Payment successful — you are hosting this table');
            } else {
              toast.success('Payment successful — booking confirmed');
            }
          },
        });
      } else {
        toast.error('Could not start payment. Please try again.');
      }
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not start payment');
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
      if (res?.reference && res?.access_code) {
        await launchPaystackInline({
          email: userProfile?.email || user?.email,
          amount: table.joining_fee,
          reference: res.reference,
          accessCode: res.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || res.reference);
            queryClient.invalidateQueries(['table', tableId]);
            setShowPaymentDialog(false);
            toast.success('Payment successful');
          },
        });
      } else throw new Error('No payment reference');
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
    const includedSeed = {};
    for (const inc of venueTable.includedItems || []) {
      const id = inc.menu_item_id || inc.menuItemId;
      if (id) includedSeed[id] = Math.max(includedSeed[id] || 0, Number(inc.quantity) || 1);
    }

    const venueMenuItems = (venueTable.menuItems || []).map((item) => ({
      ...item,
      image_url: item.imageUrl || item.image_url,
      sub_category: item.sub_category || item.subCategory,
    }));
    const includedForPicker = (venueTable.includedItems || []).map((inc) => {
      const id = inc.menu_item_id || inc.menuItemId;
      const row = venueMenuItems.find((m) => m.id === id);
      return {
        menu_item_id: id,
        name: row?.name || inc.name || 'Included item',
        quantity: inc.quantity || 1,
        image_url: row?.image_url || null,
        price: row?.price || 0,
      };
    });
    const minSpendZar =
      isHostCheckout
        ? Number(venueTable.hostMinimumSpend ?? venueTable.host_minimum_spend ?? venueTable.minimumSpend) || 0
        : Number(venueTable.minimumSpend) || 0;
    const { chargeableTotal, itemCount } = getVenueMenuCartStats(
      venueMenuItems,
      selectedMenuItems,
      includedForPicker,
    );
    const minSpendMet =
      minSpendZar <= 0 ||
      venueSettlementMode === 'PREPAY_LUMP' ||
      chargeableTotal >= minSpendZar;
    const checkoutLines = venueCheckoutPreview?.lines?.length ? venueCheckoutPreview.lines : [];
    const checkoutTotal =
      venueCheckoutPreview?.total ?? checkoutLines.reduce((s, l) => s + Number(l.amount_zar || 0), 0);
    const membership = venueTable.myMembership;
    const needsApproval = venueTable.allowsCustomRequests || venueTable.isCustomListing;
    // Host-this-tier flow pays the host fee + min spend without a prior venue custom request.
    const approvalOk =
      !needsApproval ||
      isHostCheckout ||
      membership?.status === 'APPROVED' ||
      membership?.status === 'LEFT';
    const canPay = minSpendMet && approvalOk && !venueCheckoutPreview?.error;
    const showCustomRequest =
      (venueTable.allowsCustomRequests || venueTable.isCustomListing) &&
      membership?.status !== 'APPROVED';
    const inRequestFlow = showCustomRequest && membership?.status !== 'APPROVED';
    const footerPad = inRequestFlow && customRequestOpen
      ? 'min(54vh, 500px)'
      : venueCheckoutStep === 'menu'
        ? (minSpendZar > 0 ? 200 : 160)
        : 120;
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sec-bg-base)', padding: 20, paddingBottom: footerPad }}>
        <button onClick={() => navigate(-1)} className="sec-btn sec-btn-ghost" style={{ marginBottom: 12 }}>Back</button>
        <div className="sec-card" style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{venueTable.tableName}</h1>
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{venueTable.venue?.name}</p>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--sec-accent)', fontWeight: 600 }}>
            {isHostCheckout ? 'Hosting this table' : 'Joining this table'}
          </p>
          <p style={{ marginTop: 8 }}>{venueTable.description || 'No description'}</p>
          <p style={{ marginTop: 8, fontSize: 13 }}>{venueTable.spotsRemaining} spots left</p>
        </div>
        {hostPaySuccess && isHostCheckout ? (
          <div
            className="sec-card"
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid var(--sec-success-muted, rgba(34,197,94,0.35))',
              background: 'var(--sec-success-muted, rgba(34,197,94,0.08))',
            }}
          >
            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
              You are hosting this table. Use Host Dashboard to approve or decline join requests and set your table rules.
            </p>
            <button
              type="button"
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 44 }}
              onClick={() => navigate(createPageUrl('HostDashboard?tab=tables&manage=1'))}
            >
              Open Host Dashboard
            </button>
          </div>
        ) : null}
        {venueCheckoutStep === 'menu' ? (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
              {inRequestFlow ? 'Build your menu (optional)' : 'Select your menu'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 12 }}>
              {inRequestFlow
                ? 'Add items from the venue menu to include in your request, or set a minimum spend amount in the form below.'
                : minSpendZar > 0
                  ? `Choose menu items worth at least R${minSpendZar.toFixed(0)}, or pay the minimum only and order on site (your QR is proof for staff).`
                  : 'Add items from the venue menu (optional).'}
            </p>
            <VenueMenuBrowser
              items={venueMenuItems}
              selected={selectedMenuItems}
              onChange={(id, qty) => {
                setVenueSettlementMode('PREPAY_MENU');
                setSelectedMenuItems((s) => ({ ...s, [id]: qty }));
              }}
              includedItems={includedForPicker}
              minimumSpendZar={minSpendZar}
              venueLogoUrl={venueTable.venue?.logo_url || venueTable.venue?.logoUrl}
              hideStickyFooter
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className="sec-btn sec-btn-ghost"
              style={{ marginTop: 14, marginBottom: 8 }}
              onClick={() => {
                setVenueCheckoutStep('menu');
                setVenueSettlementMode('PREPAY_MENU');
              }}
            >
              ← Edit menu
            </button>
            <CheckoutCart
              lines={checkoutLines}
              settlementMode={venueSettlementMode}
              minimumSpendZar={minSpendZar}
              footnote={
                venueSettlementMode === 'PREPAY_LUMP' && minSpendZar > 0
                  ? `You are prepaying R${minSpendZar.toFixed(0)} minimum spend. Choose drinks and food on site — show your SEC QR to staff.`
                  : undefined
              }
            />
          </>
        )}
        {membership?.status === 'PENDING_VENUE_REVIEW' ? (
          <p className="text-sm text-amber-400 mt-3 text-center">Request pending venue approval</p>
        ) : null}
        {venueCheckoutPreview?.error ? (
          <p style={{ color: 'var(--sec-warning)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
            {venueCheckoutPreview.error}
          </p>
        ) : null}
        {!canPay && venueCheckoutStep === 'checkout' && minSpendZar > 0 && !venueCheckoutPreview?.error ? (
          <p style={{ color: 'var(--sec-text-muted)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            {isHostCheckout
              ? 'Meet the minimum spend with menu items, or go back and choose “Pay minimum only”.'
              : 'Meet the minimum spend to continue checkout.'}
          </p>
        ) : null}
        {showCustomRequest && membership?.status !== 'PENDING_VENUE_REVIEW' && !customRequestOpen ? (
          <button
            type="button"
            className="sec-btn sec-btn-ghost sec-btn-full mt-3"
            style={{ height: 44 }}
            onClick={() => setCustomRequestOpen(true)}
          >
            Request custom table (venue reviews first)
          </button>
        ) : null}
        <CustomTableRequestModal
          open={customRequestOpen}
          onClose={() => setCustomRequestOpen(false)}
          submitting={customSubmitting}
          venueMenuItems={venueMenuItems}
          selectedMenuItems={selectedMenuItems}
          onSubmit={async (specs) => {
            setCustomSubmitting(true);
            try {
              await apiPost(`/api/venue-tables/${tableId}/request`, {
                isCustom: true,
                userSpecs: specs,
              });
              toast.success('Request sent — venue will review');
              setCustomRequestOpen(false);
              queryClient.invalidateQueries(['venue-table', tableId]);
            } catch (e) {
              toast.error(e?.data?.error || e.message);
            } finally {
              setCustomSubmitting(false);
            }
          }}
        />
        {!inRequestFlow && venueCheckoutStep === 'menu' ? (
          <TableCheckoutFooter
            itemCount={itemCount}
            cartTotalZar={chargeableTotal}
            minSpendZar={minSpendZar}
            minMet={minSpendMet}
            onContinue={() => {
              setVenueSettlementMode('PREPAY_MENU');
              setVenueCheckoutStep('checkout');
            }}
            onPayMinimumLump={
              minSpendZar > 0
                ? () => {
                    setVenueSettlementMode('PREPAY_LUMP');
                    setVenueCheckoutStep('checkout');
                  }
                : undefined
            }
            continueLabel="Review order"
          />
        ) : !inRequestFlow ? (
          <TableCheckoutFooter
            itemCount={itemCount}
            cartTotalZar={checkoutTotal}
            minSpendZar={minSpendZar}
            minMet
            onContinue={null}
          >
            <button
              type="button"
              onClick={joinVenueTable}
              disabled={isProcessingPayment || !canPay}
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 48, minHeight: 44 }}
            >
              {isProcessingPayment
                ? 'Processing…'
                : checkoutTotal > 0
                  ? isHostCheckout
                    ? `Pay R${checkoutTotal.toFixed(0)} to host`
                    : `Pay R${checkoutTotal.toFixed(0)} to join`
                  : 'Complete booking'}
            </button>
            <p style={{ color: 'var(--sec-warning)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              No refunds: once you pay, your booking is confirmed per venue policy.
            </p>
            <RefundPolicyNote />
          </TableCheckoutFooter>
        )}
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
    const checkout = hostedTable.checkout || {};
    const entranceZ = Number(checkout.entrance_zar ?? 0);
    const joinZ = Number(checkout.joining_fee_zar ?? 0);
    const totalOnline = Number(checkout.total_pay_online_zar ?? entranceZ + joinZ);
    const isGoingMember = hostedTable.my_membership?.status === 'GOING';
    const tierIncluded = hostedTable.tier_included_items || [];
    const venueMenu = hostedTable.venue_menu || [];

    const payHostedMenu = async () => {
      const payload = menuSelectionToPayload(venueMenu, hostedMenuSelected);
      if (!payload.length) {
        toast.error('Select at least one item');
        return;
      }
      try {
        setIsProcessingPayment(true);
        const r = await apiPost(`/api/host/tables/${tableId}/menu-order`, {
          selectedMenuItems: payload.map((p) => ({ menuItemId: p.menuItemId, quantity: p.quantity })),
        });
        if (r?.pendingPayment && r?.reference && r?.access_code) {
          launchPaystackInline({
            email: user?.email,
            amount: Number(r.amount_zar ?? 0),
            reference: r.reference,
            accessCode: r.access_code,
            onSuccess: async (payloadRef) => {
              await verifyPaystackReference(payloadRef?.reference || r.reference);
              queryClient.invalidateQueries({ queryKey: ['hosted-table-detail', tableId] });
              setHostedMenuSelected({});
              toast.success('Menu order paid — added to your table.');
            },
          });
        }
      } catch (e) {
        toast.error(e?.data?.error || e.message || 'Menu order failed');
      } finally {
        setIsProcessingPayment(false);
      }
    };

    const joinHosted = async () => {
      if (!userProfile) {
        authService.redirectToLogin(window.location.href);
        return;
      }
      const needsPay = totalOnline > 0;
      try {
        if (needsPay) setIsProcessingPayment(true);
        const r = await apiPost(`/api/host/tables/${tableId}/join`, {});
        queryClient.invalidateQueries({ queryKey: ['hosted-table-detail', tableId] });
        if (r?.pending) {
          toast.success('Request sent. The host will approve your join.');
          return;
        }
        if (r?.pendingPayment && r?.reference && r?.access_code) {
          const amount = Number(r.amount_zar ?? totalOnline ?? 0);
          launchPaystackInline({
            email: user?.email,
            amount,
            reference: r.reference,
            accessCode: r.access_code,
            onSuccess: async (payload) => {
              await verifyPaystackReference(payload?.reference || r.reference);
              queryClient.invalidateQueries({ queryKey: ['hosted-table-detail', tableId] });
              toast.success('Payment successful — your ticket is ready.');
            },
            onCancel: () => {
              toast.message('Checkout closed', {
                description: 'No charge was completed. Try again when you are ready.',
              });
            },
          });
          return;
        }
        toast.success('You are on the guest list.');
      } catch (e) {
        toast.error(e?.message || 'Could not join table');
      } finally {
        setIsProcessingPayment(false);
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
          {hostedTable.photo ? (
            <img
              src={hostedTable.photo}
              alt=""
              style={{
                width: '100%',
                maxHeight: 220,
                objectFit: 'cover',
                borderRadius: 16,
                marginBottom: 16,
                border: '1px solid var(--sec-border)',
              }}
            />
          ) : null}
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
          {(hostedTable.hosting_tier_name || hostedTable.hosting_category) && (
            <div className="sec-card" style={{ padding: 14, marginTop: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Table tier</p>
              <p style={{ fontWeight: 600 }}>
                {[hostedTable.hosting_category, hostedTable.hosting_tier_name].filter(Boolean).join(' · ')}
              </p>
              {hostedTable.menu_spend_total > 0 && (
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                  Table menu total: R{Number(hostedTable.menu_spend_total).toFixed(0)}
                  {hostedTable.menu_progress_percent != null
                    ? ` (${Number(hostedTable.menu_progress_percent).toFixed(0)}% of min spend)`
                    : ''}
                </p>
              )}
            </div>
          )}
          {tierIncluded.length > 0 && (
            <div className="sec-card" style={{ padding: 14, marginTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Included with this table</p>
              {tierIncluded.map((inc, i) => (
                <p key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  {inc.quantity}× {inc.name}
                </p>
              ))}
            </div>
          )}
          {Array.isArray(hostedTable.members) && hostedTable.members.length > 0 && (
            <div className="sec-card" style={{ padding: 14, marginTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Table orders</p>
              {hostedTable.members.map((m) => (
                <div key={m.userId} style={{ marginBottom: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{m.user?.full_name || m.user?.username || 'Guest'}</span>
                  {Array.isArray(m.selectedMenuItems) && m.selectedMenuItems.length > 0 ? (
                    <ul style={{ margin: '4px 0 0 14px', color: 'var(--sec-text-muted)' }}>
                      {m.selectedMenuItems.map((line, i) => (
                        <li key={i}>{line.quantity}× {line.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--sec-text-muted)' }}> — no menu items yet</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {isGoingMember && venueMenu.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Add to your table</p>
              <MenuPicker
                items={venueMenu}
                selected={hostedMenuSelected}
                onChange={(id, qty) => setHostedMenuSelected((s) => ({ ...s, [id]: qty }))}
              />
              <button
                type="button"
                className="sec-btn sec-btn-primary sec-btn-full"
                style={{ marginTop: 12, height: 44 }}
                disabled={isProcessingPayment}
                onClick={payHostedMenu}
              >
                Pay for selected items
              </button>
              <p style={{ fontSize: 10, color: 'var(--sec-text-muted)', marginTop: 8, lineHeight: 1.45 }}>
                {CHECKOUT_FOOTNOTES.hostedMenu}
              </p>
            </div>
          )}
          {!isGoingMember && totalOnline > 0 && (
            <div className="sec-card" style={{ padding: 14, marginTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8 }}>
                Pay online to join (next guest)
              </p>
              {entranceZ > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--sec-text-muted)' }}>Entrance fee</span>
                  <span>R{entranceZ.toFixed(0)}</span>
                </div>
              )}
              {joinZ > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--sec-text-muted)' }}>Table joining fee (host)</span>
                    <span>R{joinZ.toFixed(0)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 6 }}>
                    {CHECKOUT_FOOTNOTES.hostedJoin}
                  </p>
                </>
              )}
              {entranceZ > 0 && joinZ === 0 && (
                <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 6 }}>
                  Entrance is split 85% to the venue and 15% to SEC.
                </p>
              )}
              {checkout.tier_min_spend_zar != null && Number(checkout.tier_min_spend_zar) > 0 && (
                <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 8 }}>
                  Tier min spend (table total): R{Number(checkout.tier_min_spend_zar).toFixed(0)}
                  {checkout.min_spend_per_person_zar != null
                    ? ` — about R${Number(checkout.min_spend_per_person_zar).toFixed(0)} per person at this table size.`
                    : ''}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, paddingTop: 8, borderTop: '1px solid var(--sec-border)' }}>
                <span>Total</span>
                <span>R{totalOnline.toFixed(0)}</span>
              </div>
            </div>
          )}
          {!isGoingMember && (
            <button
              type="button"
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ marginTop: 12, height: 48 }}
              disabled={isProcessingPayment}
              onClick={joinHosted}
            >
              {isProcessingPayment ? 'Working…' : totalOnline > 0 ? 'Pay & join' : 'Request to join'}
            </button>
          )}
          {(isGoingMember || hostedTable.is_host) && (
            <button
              type="button"
              className="sec-btn sec-btn-secondary sec-btn-full"
              style={{ marginTop: 10, height: 44 }}
              onClick={() => setShowInviteDialog(true)}
            >
              <UserPlus size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Invite friends
            </button>
          )}
        </div>
        <InviteFriendsDialog
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          table={{ id: tableId }}
          event={hostedTable.event}
          source="hosted"
        />
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
    <div className="pb-24 lg:pb-8" style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>

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

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
              const genderLabel =
                member.gender === 'male' ? 'Male' : member.gender === 'female' ? 'Female' : member.gender === 'other' ? 'Other' : null;

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
                    {genderLabel && (
                      <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                        {genderLabel}
                      </p>
                    )}
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
      <div className="sec-bottom-bar sec-bottom-bar--responsive">
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 960, margin: '0 auto' }}>
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
              A secure Paystack window opens on this page — you are not sent to another site.
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
