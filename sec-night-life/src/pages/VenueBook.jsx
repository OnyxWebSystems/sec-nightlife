import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function pickCustomListingId(items = []) {
  const row = items.find((t) => t.isCustomListing || t.is_custom_listing);
  return row?.id || null;
}

export default function VenueBook() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const venueId = params.get('venueId');
  const [ensuring, setEnsuring] = useState(false);

  const { data: venue } = useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => apiGet(`/api/venues/${venueId}`),
    enabled: !!venueId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['venue-day-tables', venueId],
    queryFn: () => apiGet(`/api/venue-tables/available?venueId=${encodeURIComponent(venueId)}&dayOnly=true&limit=50`),
    enabled: !!venueId,
  });

  const tables = data?.items ?? [];
  const dayBookingsOn = Boolean(venue?.accepts_day_bookings ?? venue?.acceptsDayBookings);
  const customListingId = pickCustomListingId(tables);
  const bookableTables = tables.filter((t) => !t.isCustomListing && !t.is_custom_listing);

  const resolveCustomListingId = async () => {
    if (customListingId) return customListingId;
    const available = await apiGet(
      `/api/venue-tables/available?venueId=${encodeURIComponent(venueId)}&dayOnly=true&limit=50`,
    );
    const fromAvailable = pickCustomListingId(available?.items);
    if (fromAvailable) return fromAvailable;
    const direct = await apiGet(
      `/api/venue-tables/day-custom-listing?venueId=${encodeURIComponent(venueId)}`,
    );
    return direct?.tableId || direct?.id || null;
  };

  const goCustomRequest = async () => {
    if (!venueId) return;
    setEnsuring(true);
    try {
      const listingId = await resolveCustomListingId();
      if (!listingId) {
        toast.error('Custom table request is not available for this venue right now.');
        return;
      }
      navigate(createPageUrl(`TableDetails?id=${listingId}&source=venue&request=1`));
    } catch (e) {
      if (e?.data?.code === 'HTML_INSTEAD_OF_JSON') {
        toast.error(
          'Could not reach the API. Redeploy the backend with the latest code, or set VITE_API_URL to your live API base URL.',
        );
      } else {
        toast.error(e?.data?.error || e.message || 'Could not start custom request');
      }
    } finally {
      setEnsuring(false);
    }
  };

  if (!venueId) {
    return <div className="sec-page p-6">Missing venue.</div>;
  }

  return (
    <div className="sec-page max-w-lg mx-auto pb-24">
      <button type="button" className="sec-btn sec-btn-ghost mb-4" onClick={() => navigate(-1)}>
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="text-xl font-bold mb-1">Book on Sec</h1>
      <p className="text-sm text-[var(--sec-text-muted)] mb-6">{venue?.name || 'Venue'} — day bookings</p>

      {!dayBookingsOn ? (
        <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
          This venue has not enabled day table bookings.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          {bookableTables.length === 0 ? (
            <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)] mb-4">
              No day tables listed right now. You can still request a custom table below.
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {bookableTables.map((t) => (
                <div key={t.id} className="sec-card p-4 border border-[var(--sec-border)]">
                  <div className="flex justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold text-[var(--sec-text-primary)]">{t.tableName}</p>
                      <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                        Min R{Number(t.minimumSpend).toFixed(0)} · Fee R{Number(t.bookingFeeZar || 0).toFixed(0)}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--sec-accent)] font-semibold">{t.spotsRemaining} left</span>
                  </div>
                  <div className="grid gap-2">
                    <Link
                      to={createPageUrl(`TableDetails?id=${t.id}&source=venue&mode=host&settlement=PREPAY_MENU`)}
                      className="sec-btn sec-btn-primary sec-btn-sm w-full text-center no-underline"
                      style={{ display: 'block', textDecoration: 'none' }}
                    >
                      Host table (order from menu)
                    </Link>
                    {Number(t.hostMinimumSpend ?? t.minimumSpend) > 0 ? (
                      <Link
                        to={createPageUrl(`TableDetails?id=${t.id}&source=venue&mode=host&settlement=PREPAY_LUMP`)}
                        className="sec-btn sec-btn-secondary sec-btn-sm w-full text-center no-underline"
                        style={{ display: 'block', textDecoration: 'none' }}
                      >
                        Host — pay minimum spend upfront
                      </Link>
                    ) : null}
                    <Link
                      to={createPageUrl(`TableDetails?id=${t.id}&source=venue&mode=join&settlement=PREPAY_MENU`)}
                      className="sec-btn sec-btn-ghost sec-btn-sm w-full text-center no-underline"
                      style={{ display: 'block', textDecoration: 'none', border: '1px solid var(--sec-border)' }}
                    >
                      Join table (order from menu)
                    </Link>
                    {Number(t.minimumSpend) > 0 ? (
                      <Link
                        to={createPageUrl(`TableDetails?id=${t.id}&source=venue&mode=join&settlement=PREPAY_LUMP`)}
                        className="sec-btn sec-btn-ghost sec-btn-sm w-full text-center no-underline"
                        style={{ display: 'block', textDecoration: 'none', border: '1px solid var(--sec-border)' }}
                      >
                        Join — pay minimum spend upfront
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {customListingId ? (
            <Link
              to={createPageUrl(`TableDetails?id=${customListingId}&source=venue&request=1`)}
              className="sec-btn sec-btn-ghost sec-btn-full block text-center w-full"
              style={{ textDecoration: 'none' }}
            >
              Request a custom table
            </Link>
          ) : (
            <button
              type="button"
              disabled={ensuring}
              onClick={goCustomRequest}
              className="sec-btn sec-btn-ghost sec-btn-full block text-center w-full"
            >
              {ensuring ? 'Loading…' : 'Request a custom table'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
