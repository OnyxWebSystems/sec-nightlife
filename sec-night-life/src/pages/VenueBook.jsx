import React from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { ChevronLeft, Armchair, Loader2 } from 'lucide-react';

export default function VenueBook() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const venueId = params.get('venueId');

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
  const customListing = tables.find((t) => t.isCustomListing);

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

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : tables.length === 0 ? (
        <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
          No day tables listed. Check upcoming events on the venue profile.
        </div>
      ) : (
        <div className="space-y-3">
          {tables.filter((t) => !t.isCustomListing).map((t) => (
            <Link
              key={t.id}
              to={createPageUrl(`TableDetails?id=${t.id}&source=venue`)}
              className="sec-card block p-4 border border-[var(--sec-border)] no-underline"
            >
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--sec-text-primary)]">{t.tableName}</p>
                  <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                    Min R{Number(t.minimumSpend).toFixed(0)} · Fee R{Number(t.bookingFeeZar || 0).toFixed(0)}
                  </p>
                </div>
                <span className="text-xs text-[var(--sec-accent)] font-semibold">{t.spotsRemaining} left</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {customListing && (
        <Link
          to={createPageUrl(`TableDetails?id=${customListing.id}&source=venue&request=1`)}
          className="sec-btn sec-btn-ghost sec-btn-full mt-6 block text-center"
          style={{ textDecoration: 'none' }}
        >
          Request a custom table
        </Link>
      )}
    </div>
  );
}
