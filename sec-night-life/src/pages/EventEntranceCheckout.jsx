import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import * as authService from '@/services/authService';
import { createPageUrl, getStoredPromoterRef } from '@/utils';
import PageBackHeader from '@/components/layout/PageBackHeader';
import MenuPicker, { menuSelectionTotal, menuSelectionToPayload } from '@/components/menu/MenuPicker';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { launchPaystackInline, loadPaystackScript } from '@/lib/paystackInline';
import { completePaystackCheckout } from '@/lib/completePaystackCheckout';
import { Loader2, Ticket } from 'lucide-react';
import { toast } from 'sonner';

export default function EventEntranceCheckout() {
  const [params] = useSearchParams();
  const eventId = params.get('id') || params.get('event_id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuSelected, setMenuSelected] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${eventId}`),
    enabled: Boolean(eventId),
  });

  const venueId = event?.venue_id;
  const { data: venueMenu = [], isLoading: menuLoading } = useQuery({
    queryKey: ['venue-menu-public', venueId],
    queryFn: () => apiGet(`/api/business/venues/${venueId}/menu-items/public`),
    enabled: Boolean(venueId),
  });

  useEffect(() => {
    loadPaystackScript().catch(() => {});
  }, []);

  const entranceZar = Number(event?.entrance_fee_amount) || 0;
  const menuSubtotal = menuSelectionTotal(venueMenu, menuSelected);
  const totalPrice = Math.round((entranceZar + menuSubtotal) * 100) / 100;

  const handlePay = async () => {
    if (!eventId || !event) return;
    if (!event.has_entrance_fee || entranceZar <= 0) {
      toast.error('This event does not have an entrance fee');
      return;
    }
    if (window.self !== window.top) {
      toast.error('Checkout only works from the published app, not in preview mode');
      return;
    }
    setIsProcessing(true);
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        authService.redirectToLogin(window.location.href);
        return;
      }
      const menuPayload = menuSelectionToPayload(venueMenu, menuSelected);
      const metadata = {
        type: 'EVENT_ENTRANCE',
        event_id: eventId,
        entrance_zar: entranceZar,
        menu_zar: menuSubtotal,
        amount_total_zar: totalPrice,
      };
      if (menuPayload.length > 0) metadata.selected_menu_items = menuPayload;
      const promoterRef = getStoredPromoterRef(eventId);
      if (promoterRef) metadata.promoter_user_id = promoterRef;

      const res = await apiPost('/api/payments/initialize', {
        amount: totalPrice,
        email: user?.email,
        description: `${event.title} — Entrance`,
        event_id: eventId,
        venue_id: venueId,
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
          navigate(`${createPageUrl('TicketSuccess')}?kind=entrance`);
        },
        onCancel: () => toast.message('Checkout cancelled'),
      });
    } catch (error) {
      toast.error(error?.data?.error || error?.message || 'Failed to start checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!eventId) {
    return (
      <div className="sec-page">
        <PageBackHeader title="Pay to enter" />
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
      <PageBackHeader title="Pay to enter" backTo={createPageUrl(`EventDetails?id=${eventId}`)} />
      <div style={{ padding: '0 16px', maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 4 }}>
          {event?.title}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 20 }}>
          Pay the entrance fee to attend. You can still host or join a table later — entrance already paid will be credited.
        </p>

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
            <span style={{ color: 'var(--sec-text-secondary)' }}>Entrance fee</span>
            <span style={{ fontWeight: 700, color: 'var(--sec-text-primary)' }}>R{entranceZar.toFixed(0)}</span>
          </div>
          {menuSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--sec-text-secondary)' }}>Menu</span>
              <span style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>R{menuSubtotal.toFixed(0)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--sec-border)',
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--sec-text-primary)' }}>
              R{totalPrice.toFixed(0)}
            </span>
          </div>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: 'var(--sec-text-primary)' }}>
          Add from the menu (optional)
        </h2>
        {menuLoading ? (
          <Loader2 className="animate-spin" style={{ marginBottom: 16 }} />
        ) : (
          <MenuPicker menuItems={venueMenu} selected={menuSelected} onChange={setMenuSelected} />
        )}

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
              disabled={isProcessing || entranceZar <= 0}
              onClick={handlePay}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Ticket size={18} style={{ marginRight: 8 }} />
                  Pay entrance
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
