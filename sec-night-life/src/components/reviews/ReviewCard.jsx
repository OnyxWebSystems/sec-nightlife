import React, { useState } from 'react';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Star } from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewCard({ review }) {
  const [helpful, setHelpful] = useState(false);

  const { data: reviewer } = useQuery({
    queryKey: ['user-profile', review.user_id],
    queryFn: async () => {
      const profiles = await dataService.User.filter({ created_by: review.created_by });
      return profiles[0];
    }
  });

  return (
    <Card className="glass-card border-[#262629]">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sec-accent)] to-[var(--sec-accent)] flex items-center justify-center overflow-hidden flex-shrink-0">
            {reviewer?.avatar_url ? (
              <img src={reviewer.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold">{reviewer?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-semibold text-white">{reviewer?.username || 'User'}</p>
                <p className="text-xs text-gray-500">
                  {format(new Date(review.created_date), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= review.rating ? 'fill-[var(--sec-warning)] text-[var(--sec-warning)]' : 'text-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            {review.review_text && (
              <p className="text-gray-300 text-sm mb-3">{review.review_text}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-500">
              {review.atmosphere_rating && (
                <span>Atmosphere: {review.atmosphere_rating}/5</span>
              )}
              {review.service_rating && (
                <span>Service: {review.service_rating}/5</span>
              )}
              {review.value_rating && (
                <span>Value: {review.value_rating}/5</span>
              )}
            </div>

            {review.verified_attendance && (
              <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--sec-success)]/20 text-[var(--sec-success)] text-xs">
                ✓ Verified Attendance
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}