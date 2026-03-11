import React, { useState } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReviewForm({ venueId, eventId, onSuccess }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [atmosphereRating, setAtmosphereRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [valueRating, setValueRating] = useState(0);

  const submitReview = useMutation({
    mutationFn: async (reviewData) => {
      const user = await authService.getCurrentUser();
      return dataService.Review.create({
        ...reviewData,
        user_id: user.id
      });
    },
    onSuccess: () => {
      toast.success('Review submitted!');
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      if (onSuccess) onSuccess();
    }
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    submitReview.mutate({
      venue_id: venueId,
      event_id: eventId,
      rating,
      review_text: reviewText,
      atmosphere_rating: atmosphereRating,
      service_rating: serviceRating,
      value_rating: valueRating
    });
  };

  const RatingStars = ({ value, onChange, label }) => (
    <div>
      <Label className="text-gray-400 text-sm mb-2 block">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => label === 'Overall Rating' && setHoveredRating(star)}
            onMouseLeave={() => label === 'Overall Rating' && setHoveredRating(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`w-8 h-8 ${
                star <= (label === 'Overall Rating' ? (hoveredRating || value) : value)
                  ? 'fill-[var(--sec-warning)] text-[var(--sec-warning)]'
                  : 'text-gray-600'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <RatingStars value={rating} onChange={setRating} label="Overall Rating" />

      <div className="grid grid-cols-3 gap-4">
        <RatingStars value={atmosphereRating} onChange={setAtmosphereRating} label="Atmosphere" />
        <RatingStars value={serviceRating} onChange={setServiceRating} label="Service" />
        <RatingStars value={valueRating} onChange={setValueRating} label="Value" />
      </div>

      <div>
        <Label className="text-gray-400 text-sm mb-2 block">Your Review</Label>
        <Textarea
          placeholder="Share your experience..."
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          className="bg-[#141416] border-[#262629] min-h-[120px]"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitReview.isPending || rating === 0}
        className="w-full bg-gradient-to-r from-[var(--sec-accent)] to-[var(--sec-accent)]"
      >
        {submitReview.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Submit Review
      </Button>
    </div>
  );
}