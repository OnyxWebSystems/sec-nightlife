import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Flag, Loader2 } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { StarRatingDisplay, StarRatingInput } from './StarRating';

export default function VenueReviewsSection({
  venueId,
  venueName,
  ownerUserId,
  currentUserId,
  isAuthenticated,
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [accReviews, setAccReviews] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [flagReview, setFlagReview] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [deleteReviewId, setDeleteReviewId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOwner = currentUserId && ownerUserId && currentUserId === ownerUserId;

  const { data: listData, isLoading, isFetching } = useQuery({
    queryKey: ['venue-reviews', venueId, page],
    queryFn: () => apiGet(`/api/reviews/venues/${venueId}?page=${page}`),
    enabled: !!venueId,
  });

  useEffect(() => {
    setPage(1);
    setAccReviews([]);
  }, [venueId]);

  useEffect(() => {
    if (!listData?.reviews) return;
    if (page === 1) {
      setAccReviews(listData.reviews);
    } else {
      setAccReviews((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const add = listData.reviews.filter((r) => !ids.has(r.id));
        return [...prev, ...add];
      });
    }
  }, [listData, page]);

  const { data: myReview } = useQuery({
    queryKey: ['venue-my-review', venueId],
    queryFn: () => apiGet(`/api/reviews/venues/${venueId}/my-review`),
    enabled: !!venueId && isAuthenticated && !!currentUserId && !isOwner,
  });

  const openModal = () => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment);
    } else {
      setRating(0);
      setComment('');
    }
    setModalOpen(true);
  };

  const submitReview = async () => {
    if (rating < 1 || comment.trim().length < 10) {
      toast.error('Rating and comment (10–300 characters) are required.');
      return;
    }
    setSubmitting(true);
    try {
      if (myReview) {
        await apiPatch(`/api/reviews/venues/${venueId}`, { rating, comment: comment.trim() });
        toast.success('Review updated');
      } else {
        await apiPost(`/api/reviews/venues/${venueId}`, { rating, comment: comment.trim() });
        toast.success('Review posted!');
      }
      setModalOpen(false);
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['venue-reviews', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venue-my-review', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteVenueReview = async () => {
    if (!deleteReviewId) return;
    const removedId = deleteReviewId;
    setDeleting(true);
    try {
      await apiDelete(`/api/reviews/venues/review/${removedId}`);
      toast.success('Review deleted');
      setDeleteReviewId(null);
      setAccReviews((prev) => prev.filter((x) => x.id !== removedId));
      queryClient.invalidateQueries({ queryKey: ['venue-reviews', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venue-my-review', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const submitFlag = async () => {
    const r = flagReason.trim();
    if (r.length < 1 || r.length > 200) {
      toast.error('Reason required (max 200 characters).');
      return;
    }
    if (!flagReview) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/reviews/venues/review/${flagReview.id}/flag`, { reason: r });
      toast.success('Review flagged for admin review.');
      setFlagReview(null);
      setFlagReason('');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['venue-reviews', venueId] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const avg = listData?.averageRating ?? 0;
  const total = listData?.totalReviews ?? 0;
  const reviews = accReviews;
  const totalPages = listData?.totalPages ?? 1;

  return (
    <div className="mt-8 border-t border-[#262629] pt-6">
      <h3 className="text-lg font-semibold mb-3">Reviews</h3>
      {total === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No reviews yet</p>
      ) : (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <StarRatingDisplay value={avg} size={20} />
          <span className="text-lg font-semibold">{avg.toFixed(1)}</span>
          <span className="text-sm text-gray-500">({total} reviews)</span>
        </div>
      )}

      {isAuthenticated && !isOwner && (
        <Button type="button" className="min-h-[44px] w-full mb-4" onClick={openModal}>
          {myReview ? 'Edit Your Review' : 'Write a Review'}
        </Button>
      )}

      {(isLoading && page === 1) && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--sec-accent)]" />
        </div>
      )}

      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border border-[#262629] bg-[#141416] p-4">
            <div className="flex gap-3">
              <div className="w-11 h-11 rounded-full bg-[#262629] overflow-hidden shrink-0">
                {r.reviewer?.avatarUrl ? (
                  <img src={r.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                    {(r.reviewer?.fullName || r.reviewer?.username || '?')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium truncate">{r.reviewer?.fullName || r.reviewer?.username}</p>
                    <p className="text-xs text-gray-500">@{r.reviewer?.username}</p>
                  </div>
                  <StarRatingDisplay value={r.rating} size={14} />
                </div>
                <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{r.comment}</p>
                <p className="text-xs text-gray-600 mt-2">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  {currentUserId && r.reviewer?.id === currentUserId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] text-red-400 border-red-900/50"
                      onClick={() => setDeleteReviewId(r.id)}
                    >
                      Delete
                    </Button>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      className="min-h-[44px] inline-flex items-center gap-1 text-xs text-amber-500"
                      onClick={() => setFlagReview(r)}
                    >
                      <Flag className="w-4 h-4" />
                      Flag
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && page < totalPages && (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full min-h-[44px]"
          disabled={isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          {isFetching ? 'Loading…' : 'Load more'}
        </Button>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-app md:max-w-app-md bg-[#0A0A0B] border-[#262629]">
          <DialogHeader>
            <DialogTitle>Review {venueName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm mb-1">Rating</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <label className="block text-sm mt-4 mb-1">Comment</label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            minLength={10}
            maxLength={300}
            rows={4}
            className="bg-[#141416] border-[#262629]"
          />
          <p className="text-xs text-gray-500 mt-1">{comment.length}/300</p>
          <Button type="button" className="w-full mt-4 min-h-[44px]" disabled={submitting} onClick={submitReview}>
            {myReview ? 'Save' : 'Post Review'}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteReviewId} onOpenChange={(o) => { if (!o) setDeleteReviewId(null); }}>
        <AlertDialogContent className="bg-[#0A0A0B] border-[#262629]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete this review? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#262629]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteVenueReview();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!flagReview} onOpenChange={(o) => { if (!o) setFlagReview(null); }}>
        <DialogContent className="max-w-app md:max-w-app-md bg-[#0A0A0B] border-[#262629]">
          <DialogHeader>
            <DialogTitle>Why are you flagging this review?</DialogTitle>
          </DialogHeader>
          <Textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            maxLength={200}
            rows={3}
            className="bg-[#141416] border-[#262629]"
          />
          <Button type="button" className="w-full min-h-[44px] mt-2" disabled={submitting} onClick={submitFlag}>
            Submit
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
