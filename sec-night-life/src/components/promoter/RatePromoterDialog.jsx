import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService } from '@/services/dataService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from 'lucide-react';
import { toast } from 'sonner';

export default function RatePromoterDialog({ isOpen, onClose, promoter, context, contextId }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');

  const rateMutation = useMutation({
    mutationFn: async () => {
      await dataService.Rating.create({
        ratee_user_id: promoter.id,
        score: rating,
        message: comment || null,
        context_type: context === 'table' ? 'table' : context,
        context_id: contextId,
      });
    },
    onSuccess: () => {
      toast.success('Rating submitted successfully');
      queryClient.invalidateQueries(['promoters-leaderboard']);
      queryClient.invalidateQueries(['viewed-profile']);
      onClose();
    },
    onError: () => {
      toast.error('Failed to submit rating');
    }
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }
    rateMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141416] border-[#262629] text-white">
        <DialogHeader>
          <DialogTitle className="gradient-text">Rate {promoter.username}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">How was your experience?</p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-[var(--sec-warning)] text-[var(--sec-warning)]'
                        : 'text-gray-600'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-400 mt-3">
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </p>
            )}
          </div>

          <div>
            <Textarea
              placeholder="Share your feedback (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="bg-[#0A0A0B] border-[#262629]"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-[#262629]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={rateMutation.isPending || rating === 0}
              className="flex-1 sec-btn-accent"
            >
              {rateMutation.isPending ? 'Submitting...' : 'Submit Rating'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}