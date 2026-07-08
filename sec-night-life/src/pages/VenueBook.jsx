import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import EventTableTierCard from '@/components/events/EventTableTierCard';
import EventTableTierSheet from '@/components/events/EventTableTierSheet';
import SeatingPlanCTA from '@/components/seating/SeatingPlanCTA';
import SeatingPlanViewer from '@/components/seating/SeatingPlanViewer';
import { normalizeGuestSeatingPlans } from '@/lib/seatingPlanUtils';
import { formatWindowLabel, isOvernightWindow } from '@/lib/dayBookingSlotUtils';
import { venueWindowFromSchedule } from '@/lib/resolveDayBookingContext';

const guestBookQueryOpts = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
};

export default function VenueBook() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const venueId = params.get('venueId');
  const [selectedTier, setSelectedTier] = useState(null);
  const [ensuring, setEnsuring] = useState(false);
  const [seatingViewerOpen, setSeatingViewerOpen] = useState(false);

  const { data: venue } = useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => apiGet(`/api/venues/${venueId}`),
    enabled: !!venueId,
    ...guestBookQueryOpts,
  });

  const { data: tierData, isLoading, isError, refetch } = useQuery({
    queryKey: ['venue-day-table-tiers', venueId],
    queryFn: () => apiGet(`/api/venues/${venueId}/day-table-tiers`),
    enabled: !!venueId,
    ...guestBookQueryOpts,
  });

  const tiers = tierData?.tiers ?? [];
  const firstSlotId = tiers[0]?.slots?.[0]?.venueTableId ?? null;

  const { data: sampleTable } = useQuery({
    queryKey: ['venue-table-sample', firstSlotId],
    queryFn: () => apiGet(`/api/venue-tables/${firstSlotId}`),
    enabled: !!firstSlotId && !tierData?.venueWindow,
  });

  const venueWindow =
    tierData?.venueWindow ?? venueWindowFromSchedule(sampleTable) ?? null;
  const venueWindowIsOvernight = venueWindow
    ? isOvernightWindow(venueWindow.startTime, venueWindow.endTime)
    : false;
  const customListingId = tierData?.customListingId ?? null;
  const allowsCustomRequests = Boolean(tierData?.allowsCustomRequests);
  const seatingPlans = normalizeGuestSeatingPlans(tierData);
  const seatingPlan = seatingPlans[0] ?? null;
  const dayBookingsOn = Boolean(venue?.accepts_day_bookings ?? venue?.acceptsDayBookings);

  const goCustomRequest = async () => {
    if (!venueId) return;
    if (customListingId) {
      navigate(createPageUrl(`TableDetails?id=${customListingId}&source=venue&request=1`));
      return;
    }
    setEnsuring(true);
    try {
      const direct = await apiGet(
        `/api/venue-tables/day-custom-listing?venueId=${encodeURIComponent(venueId)}`,
      );
      const listingId = direct?.tableId || direct?.id || null;
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
      <p className="text-sm text-[var(--sec-text-muted)] mb-2">{venue?.name || 'Venue'} — day bookings</p>
      {venueWindow ? (
        <p className="text-xs text-[var(--sec-text-muted)] mb-6">
          Open today {formatWindowLabel(venueWindow.startTime, venueWindow.endTime, venueWindowIsOvernight)}
        </p>
      ) : (
        <div className="mb-6" />
      )}

      {!dayBookingsOn ? (
        <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
          This venue has not enabled day table bookings.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : isError ? (
        <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)]">
          Could not load table listings. Please try again.
        </div>
      ) : (
        <>
          {seatingPlan ? (
            <SeatingPlanCTA
              plan={seatingPlan}
              planCount={seatingPlans.length}
              onView={() => setSeatingViewerOpen(true)}
              className="mb-4"
            />
          ) : null}
          {tiers.length === 0 ? (
            <div className="sec-card p-8 text-center text-sm text-[var(--sec-text-muted)] mb-4">
              No day tables are open for booking today. Check back on another day, or request a custom table below.
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {tiers.map((tier) => (
                <EventTableTierCard
                  key={tier.tierKey}
                  tier={tier}
                  venueWindow={venueWindow}
                  onSelect={setSelectedTier}
                />
              ))}
            </div>
          )}

          {allowsCustomRequests || customListingId ? (
            <button
              type="button"
              disabled={ensuring}
              onClick={goCustomRequest}
              className="sec-btn sec-btn-ghost sec-btn-full w-full flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              {ensuring ? 'Loading…' : 'Request a custom table'}
            </button>
          ) : null}
        </>
      )}

      <EventTableTierSheet
        tier={selectedTier}
        open={Boolean(selectedTier)}
        onClose={() => setSelectedTier(null)}
        customListingId={customListingId}
        allowsCustomRequests={allowsCustomRequests}
        venueWindow={venueWindow}
      />
      <SeatingPlanViewer
        open={seatingViewerOpen}
        onClose={() => setSeatingViewerOpen(false)}
        plans={seatingPlans}
      />
    </div>
  );
}
