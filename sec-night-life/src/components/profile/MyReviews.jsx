import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataService } from '@/services/dataService';
import { Card, CardContent } from "@/components/ui/card";
import { Star, MapPin, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyReviews({ userId }) {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['my-reviews', userId],
    queryFn: () => dataService.Review.filter({ user_id: userId }),
    enabled: !!userId
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['reviewed-venues'],
    queryFn: async () => {
      const venueIds = [...new Set(reviews.map(r => r.venue_id).filter(Boolean))];
      if (venueIds.length === 0) return [];
      const allVenues = await dataService.Venue.list();
      return allVenues.filter(v => venueIds.includes(v.id));
    },
    enabled: reviews.length > 0
  });

  const { data: events = [] } = useQuery({
    queryKey: ['reviewed-events'],
    queryFn: async () => {
      const eventIds = [...new Set(reviews.map(r => r.event_id).filter(Boolean))];
      if (eventIds.length === 0) return [];
      const allEvents = await dataService.Event.list();
      return allEvents.filter(e => eventIds.includes(e.id));
    },
    enabled: reviews.length > 0
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading reviews...</div>;
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <Star className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500">No reviews yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map(review => {
        const venue = venues.find(v => v.id === review.venue_id);
        const event = events.find(e => e.id === review.event_id);
        const target = venue || event;
        const targetUrl = venue 
          ? createPageUrl(`VenueProfile?id=${venue.id}`)
          : createPageUrl(`EventDetails?id=${event.id}`);

        return (
          <Link key={review.id} to={targetUrl}>
            <Card className="glass-card border-[#262629] hover:border-[#FF3366]/50 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{target?.name || target?.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{format(parseISO(review.created_date), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < review.rating ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {review.review_text && (
                  <p className="text-gray-400 text-sm mb-3">{review.review_text}</p>
                )}

                <div className="flex gap-4 text-xs">
                  {review.atmosphere_rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Atmosphere:</span>
                      <span className="text-[#FF3366]">{review.atmosphere_rating}/5</span>
                    </div>
                  )}
                  {review.service_rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Service:</span>
                      <span className="text-[#7C3AED]">{review.service_rating}/5</span>
                    </div>
                  )}
                  {review.value_rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Value:</span>
                      <span className="text-[#00D4AA]">{review.value_rating}/5</span>
                    </div>
                  )}
                </div>

                {review.verified_attendance && (
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#00D4AA]/20 text-[#00D4AA] text-xs">
                    ✓ Verified Attendance
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}