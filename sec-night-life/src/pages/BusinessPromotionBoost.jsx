import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost } from '@/api/client';
import { launchPaystackInline, verifyPaystackReference } from '@/lib/paystackInline';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

const MIN_D = 1;
const MAX_D = 30;
const ZAR_PER_DAY = 150;

export default function BusinessPromotionBoost() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const promotionId = String(params.get('id') || '').trim();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promotion, setPromotion] = useState(null);
  const [days, setDays] = useState(3);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setUser(await authService.getCurrentUser());
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!promotionId || !user?.id) return;
    setLoading(true);
    try {
      const venues = await dataService.Venue.mine();
      const v0 = Array.isArray(venues) ? venues[0] : null;
      if (!v0?.id) {
        setPromotion(null);
        return;
      }
      const list = await apiGet(`/api/promotions/venue/${v0.id}`);
      const p = Array.isArray(list) ? list.find((x) => x.id === promotionId) : null;
      setPromotion(p || null);
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to load promotion');
      setPromotion(null);
    } finally {
      setLoading(false);
    }
  }, [promotionId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalZar = days * ZAR_PER_DAY;

  const pay = async () => {
    if (!promotion?.id || !user?.email) return;
    setPaying(true);
    try {
      const payment = await apiPost(`/api/promotions/${promotion.id}/boost`, { days });
      if (payment?.reference && payment?.access_code) {
        await launchPaystackInline({
          email: user.email,
          amount: payment.amount_zar ?? totalZar,
          reference: payment.reference,
          accessCode: payment.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || payment.reference);
            toast.success(`Boost active for ${days} day(s)`);
            navigate(createPageUrl('BusinessPromotions'));
          },
        });
      } else {
        toast.error('Could not initialize Paystack payment');
      }
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Payment failed to start');
    } finally {
      setPaying(false);
    }
  };

  if (!promotionId) {
    return (
      <div className="p-6 max-w-lg mx-auto" style={{ color: 'var(--sec-text-primary)' }}>
        <p>Missing promotion id.</p>
        <Link to={createPageUrl('BusinessPromotions')} className="sec-link">
          Back to promotions
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header className="sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'rgba(0,0,0,0.9)' }}>
        <button type="button" className="sec-btn sec-btn-ghost p-2" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Boost promotion</h1>
      </header>

      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin" size={28} />
          </div>
        )}
        {!loading && !promotion && (
          <p style={{ color: 'var(--sec-text-muted)' }}>Promotion not found or you do not have access.</p>
        )}
        {!loading && promotion && (
          <>
            <div className="sec-card p-4 rounded-xl border" style={{ borderColor: 'var(--sec-border)' }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--sec-text-muted)' }}>
                Promotion
              </p>
              <p className="font-semibold mt-1">{promotion.title}</p>
              {promotion.boosted && (
                <p className="text-sm mt-2" style={{ color: 'var(--sec-warning)' }}>
                  Already boosted until {promotion.boostExpiresAt ? new Date(promotion.boostExpiresAt).toLocaleString() : '—'}
                </p>
              )}
            </div>

            <div className="sec-card p-4 rounded-xl border space-y-4" style={{ borderColor: 'var(--sec-border)' }}>
              <label className="block">
                <span className="text-sm font-medium">Boost duration: {days} day(s)</span>
                <input
                  type="range"
                  min={MIN_D}
                  max={MAX_D}
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value, 10))}
                  className="w-full mt-3 accent-amber-400"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                  <span>{MIN_D} day</span>
                  <span>{MAX_D} days</span>
                </div>
              </label>
              <div className="pt-2 border-t" style={{ borderColor: 'var(--sec-border)' }}>
                <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                  R{ZAR_PER_DAY} per day × {days} days
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--sec-accent)' }}>
                  R{totalZar.toLocaleString('en-ZA')}
                </p>
              </div>
              <button type="button" className="sec-btn sec-btn-primary sec-btn-full" disabled={paying || promotion.boosted} onClick={() => void pay()}>
                {paying ? 'Opening checkout…' : promotion.boosted ? 'Already boosted' : 'Pay with Paystack'}
              </button>
            </div>
          </>
        )}

        <Link to={createPageUrl('BusinessPromotions')} className="sec-link text-sm inline-block">
          Cancel
        </Link>
      </div>
    </div>
  );
}
