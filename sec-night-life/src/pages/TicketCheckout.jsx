import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import * as authService from '@/services/authService';
import { createPageUrl, getStoredPromoterRef } from '@/utils';
import PageBackHeader from '@/components/layout/PageBackHeader';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { launchPaystackInline, loadPaystackScript } from '@/lib/paystackInline';
import { completePaystackCheckout } from '@/lib/completePaystackCheckout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Ticket } from 'lucide-react';
import { toast } from 'sonner';

const selectContentClass =
  'bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)] w-[var(--radix-select-trigger-width)]';
const selectItemClass =
  'text-[var(--sec-text-primary)] focus:bg-[var(--sec-bg-elevated)] focus:text-[var(--sec-text-primary)] data-[highlighted]:bg-[var(--sec-bg-elevated)]';

export default function TicketCheckout() {
  const [params] = useSearchParams();
  const eventId = params.get('id') || params.get('event_id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTier, setSelectedTier] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [holderNames, setHolderNames] = useState(['']);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${eventId}`),
    enabled: Boolean(eventId),
  });

  useEffect(() => {
    loadPaystackScript().catch(() => {});
  }, []);

  useEffect(() => {
    setHolderNames((prev) => {
      const next = [...prev];
      while (next.length < quantity) next.push('');
      return next.slice(0, quantity);
    });
  }, [quantity]);

  const availableTickets =
    event?.ticket_tiers?.filter((t) => (t.quantity - (t.sold || 0)) > 0) || [];
  const selectedTierData = event?.ticket_tiers?.find((t) => t.name === selectedTier);
  const maxQuantity = selectedTierData
    ? Math.min(selectedTierData.quantity - (selectedTierData.sold || 0), 10)
    : 1;
  const ticketSubtotal = selectedTierData ? selectedTierData.price * quantity : 0;
  const totalPrice = Math.round(ticketSubtotal * 100) / 100;

  function holderDisplayNameFromUser(u) {
    const n = u?.fullName || u?.username || u?.userProfile?.username;
    return n ? String(n).trim() : 'Guest';
  }

  const handlePurchase = async () => {
    if (!selectedTier) {
      toast.error('Please select a ticket type');
      return;
    }
    if (quantity > 1) {
      for (let i = 0; i < quantity; i++) {
        const parts = String(holderNames[i] || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (parts.length < 2) {
          toast.error(`Enter first and surname for ticket ${i + 1}`);
          return;
        }
      }
    }
    if (window.self !== window.top) {
      toast.error('Checkout only works from the published app, not in preview mode');
      return;
    }
    setIsProcessing(true);
    try {
      const { user } = await authService.resolveUserForAction(window.location.href);
      const names =
        quantity > 1
          ? holderNames.map((n) => String(n).trim())
          : [holderDisplayNameFromUser(user)];
      const promoterRef = getStoredPromoterRef(eventId);

      if (totalPrice <= 0) {
        const body = {
          ticket_tier_name: selectedTier,
          quantity,
          holder_names: names,
        };
        if (promoterRef) body.promoter_user_id = promoterRef;
        const res = await apiPost(`/api/events/${eventId}/claim-free-ticket`, body);
        if (!res?.confirmed) throw new Error(res?.error || 'Could not claim free ticket');
        queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['event', eventId] });
        toast.success(
          quantity === 1
            ? 'Free ticket confirmed. View your QR in Profile → Tickets.'
            : `${quantity} free tickets confirmed. View your QR in Profile → Tickets.`,
        );
        navigate(createPageUrl('TicketSuccess'));
        return;
      }

      const metadata = {
        type: 'ticket',
        event_id: eventId,
        ticket_tier_name: selectedTier,
        quantity: String(quantity),
        holder_names: JSON.stringify(names),
      };
      if (promoterRef) metadata.promoter_user_id = promoterRef;

      const res = await apiPost('/api/payments/initialize', {
        amount: totalPrice,
        email: user?.email,
        description: `${event.title} - ${selectedTier} x${quantity}`,
        event_id: eventId,
        metadata,
      });
      if (!res?.reference || !res?.access_code) throw new Error('No payment URL returned');

      await launchPaystackInline({
        email: user?.email,
        amount: totalPrice,
        reference: res.reference,
        accessCode: res.access_code,
        authorizationUrl: res.authorization_url,
        onSuccess: (payload) => {
          void completePaystackCheckout({ reference: res.reference, payload, queryClient });
          navigate(createPageUrl('TicketSuccess'));
        },
        onCancel: () => toast.message('Checkout cancelled'),
      });
    } catch (error) {
      if (error?.name === 'AuthRequiredError') return;
      if (error?.code === 'SESSION_SOFT_FAIL') {
        toast.error('Still signing you in — try again in a moment.');
        return;
      }
      toast.error(error?.data?.error || error?.message || 'Failed to start checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!eventId) {
    return (
      <div className="sec-page">
        <PageBackHeader title="Buy tickets" />
        <p style={{ padding: 16, color: 'var(--sec-text-muted)' }}>Missing event.</p>
      </div>
    );
  }

  if (eventLoading) {
    return (
      <div className="sec-page" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="sec-page" style={{ paddingBottom: 120 }}>
      <PageBackHeader title="Buy tickets" backTo={createPageUrl(`EventDetails?id=${eventId}`)} />
      <div style={{ padding: '0 16px', maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 4 }}>
          {event?.title}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 20 }}>
          Choose your ticket.
        </p>

        <div style={{ marginBottom: 16 }}>
          <Label style={{ marginBottom: 8, display: 'block' }}>Ticket type</Label>
          <Select value={selectedTier} onValueChange={setSelectedTier}>
            <SelectTrigger
              style={{
                background: 'var(--sec-bg-card)',
                borderColor: 'var(--sec-border)',
                color: 'var(--sec-text-primary)',
              }}
            >
              <SelectValue placeholder="Select a ticket" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {availableTickets.map((tier) => {
                const left = tier.quantity - (tier.sold || 0);
                return (
                  <SelectItem key={tier.name} value={tier.name} className={selectItemClass}>
                    {tier.name} — {Number(tier.price) <= 0 ? 'Free' : `R${tier.price}`} ({left} left)
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {selectedTierData && (
          <div style={{ marginBottom: 16 }}>
            <Label style={{ marginBottom: 8, display: 'block' }}>Quantity</Label>
            <Select value={String(quantity)} onValueChange={(v) => setQuantity(Number(v))}>
              <SelectTrigger
                style={{
                  background: 'var(--sec-bg-card)',
                  borderColor: 'var(--sec-border)',
                  color: 'var(--sec-text-primary)',
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)} className={selectItemClass}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {quantity > 1 &&
          Array.from({ length: quantity }, (_, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <Label style={{ marginBottom: 6, display: 'block' }}>Ticket {i + 1} — full name</Label>
              <Input
                value={holderNames[i] || ''}
                onChange={(e) => {
                  const next = [...holderNames];
                  next[i] = e.target.value;
                  setHolderNames(next);
                }}
                placeholder="First and surname"
                style={{
                  background: 'var(--sec-bg-card)',
                  borderColor: 'var(--sec-border)',
                  color: 'var(--sec-text-primary)',
                }}
              />
            </div>
          ))}

        <div
          style={{
            background: 'var(--sec-bg-card)',
            border: '1px solid var(--sec-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--sec-text-secondary)' }}>Tickets</span>
            <span style={{ fontWeight: 700, color: 'var(--sec-text-primary)' }}>
              R{ticketSubtotal.toFixed(0)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--sec-border)',
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <span style={{ fontWeight: 600 }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>R{totalPrice.toFixed(0)}</span>
          </div>
        </div>

        <RefundPolicyNote style={{ marginTop: 16 }} />
      </div>

      <div className="sec-bottom-bar sec-bottom-bar--responsive">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', maxWidth: 560, margin: '0 auto' }}>
          <div className="sec-bottom-bar__price">
            <div className="sec-bottom-bar__price-label">Total</div>
            <div className="sec-bottom-bar__price-value">R{totalPrice.toFixed(0)}</div>
          </div>
          <div className="sec-bottom-bar__cta">
            <button
              type="button"
              className="sec-btn sec-btn-primary sec-btn-full"
              disabled={isProcessing || !selectedTier}
              onClick={handlePurchase}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Ticket size={18} style={{ marginRight: 8 }} />
                  {totalPrice <= 0 ? 'Get free ticket' : 'Pay now'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
