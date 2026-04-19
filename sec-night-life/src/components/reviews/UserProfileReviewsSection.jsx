import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Flag, Loader2 } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
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

function ReviewsIGave({ onEdit }) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['reviews-me-given'],
    queryFn: () => apiGet('/api/reviews/me/given'),
  });
  const rows = data?.reviews ?? [];

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/reviews/users/review/${deleteId}`);
      toast.success('Review deleted');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['reviews-me-given'] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-gray-500 py-4">Loading…</p>;
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h4 className="text-sm font-semibold text-gray-500 mb-3">Reviews I&apos;ve given</h4>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-[#262629] bg-[#141416] p-4 flex justify-between gap-2 items-start">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">@{r.subject?.username}</p>
              {r.event?.name && <p className="text-xs text-gray-500">From {r.event.name}</p>}
              <StarRatingDisplay value={r.rating} size={14} className="mt-1" />
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{r.comment}</p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onEdit(r)}>
                Edit
              </Button>
              <Button type="button" variant="outline" className="min-h-[44px] text-red-400 border-red-900/50" onClick={() => setDeleteId(r.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
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
                confirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function UserProfileReviewsSection({ profileUserId, profileUsername, showReviewsIGave = false }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [accReviews, setAccReviews] = useState([]);
  const [writeOpen, setWriteOpen] = useState(false);
  const [editReview, setEditReview] = useState(null);
  const [flagReview, setFlagReview] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [formEventId, setFormEventId] = useState('');
  const [formRating, setFormRating] = useState(0);
  const [formComment, setFormComment] = useState('');

  const viewerId = user?.id;
  const isOwnProfile = viewerId && viewerId === profileUserId;

  const { data: listData, isLoading, isFetching } = useQuery({
    queryKey: ['user-reviews', profileUserId, page],
    queryFn: () => apiGet(`/api/reviews/users/${profileUserId}?page=${page}`),
    enabled: !!profileUserId,
  });

  useEffect(() => {
    setPage(1);
    setAccReviews([]);
  }, [profileUserId]);

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

  const { data: eligibility } = useQuery({
    queryKey: ['user-review-eligibility', profileUserId],
    queryFn: () => apiGet(`/api/reviews/users/${profileUserId}/eligibility`),
    enabled: !!profileUserId && isAuthenticated && !!viewerId && viewerId !== profileUserId,
  });

  const resetWriteForm = (ev) => {
    const first = ev?.sharedEvents?.[0]?.id || '';
    setFormEventId(first);
    setFormRating(0);
    setFormComment('');
    setEditReview(null);
  };

  const openWrite = () => {
    resetWriteForm(eligibility);
    setWriteOpen(true);
  };

  const openEdit = (rev) => {
    setEditReview(rev);
    setFormRating(rev.rating);
    setFormComment(rev.comment);
    setFormEventId(rev.eventId || '');
    setWriteOpen(true);
  };

  const submitWrite = async () => {
    if (editReview) {
      if (formRating < 1 || formComment.trim().length < 10) {
        toast.error('Rating and comment (10–300 characters) are required.');
        return;
      }
      setSubmitting(true);
      try {
        await apiPatch(`/api/reviews/users/review/${editReview.id}`, {
          rating: formRating,
          comment: formComment.trim(),
        });
        toast.success('Review updated');
        setWriteOpen(false);
        setPage(1);
        queryClient.invalidateQueries({ queryKey: ['user-reviews', profileUserId] });
        queryClient.invalidateQueries({ queryKey: ['reviews-me-given'] });
      } catch (e) {
        toast.error(e?.data?.error || e?.message || 'Failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (formRating < 1 || !formEventId || formComment.trim().length < 10) {
      toast.error('Choose an event, rating, and comment (10–300 characters).');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost(`/api/reviews/users/${profileUserId}`, {
        rating: formRating,
        comment: formComment.trim(),
        eventId: formEventId,
      });
      toast.success('Review posted!');
      setWriteOpen(false);
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['user-reviews', profileUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-review-eligibility', profileUserId] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed');
    } finally {
      setSubmitting(false);
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
      await apiPost(`/api/reviews/users/review/${flagReview.id}/flag`, { reason: r });
      toast.success("Review flagged for admin review. We'll look into this shortly.");
      setFlagReview(null);
      setFlagReason('');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['user-reviews', profileUserId] });
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
    <div className="mt-10 border-t border-[#262629] pt-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Reviews</h3>
          {total === 0 ? (
            <p className="text-sm text-gray-400">No reviews yet</p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <StarRatingDisplay value={avg} size={20} />
              <span className="text-lg font-semibold">{avg.toFixed(1)}</span>
              <span className="text-sm text-gray-500">({total} reviews)</span>
            </div>
          )}
        </div>
      </div>

      {!isOwnProfile && isAuthenticated && viewerId && (
        <div className="mb-4">
          {eligibility?.eligible ? (
            <Button type="button" className="min-h-[44px] w-full sm:w-auto" onClick={openWrite}>
              Write a Review
            </Button>
          ) : (
            <p className="text-xs text-gray-500">Attend an event with this person to leave a review</p>
          )}
        </div>
      )}

      {(isLoading && page === 1) && (
        <div className="flex justify-center py-8">
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
                {r.event?.name && (
                  <p className="text-xs text-gray-500 mt-1">From {r.event.name}</p>
                )}
                <p className="text-xs text-gray-600 mt-2">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </p>
                {viewerId === profileUserId && (
                  <button
                    type="button"
                    className="mt-3 min-h-[44px] min-w-[44px] inline-flex items-center gap-1 text-xs text-amber-500"
                    onClick={() => setFlagReview(r)}
                  >
                    <Flag className="w-4 h-4" />
                    Flag
                  </button>
                )}
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

      {showReviewsIGave && isOwnProfile && <ReviewsIGave onEdit={openEdit} />}

      <Dialog open={writeOpen} onOpenChange={(o) => { if (!o) { setWriteOpen(false); setEditReview(null); } }}>
        <DialogContent className="max-w-app md:max-w-app-md max-h-[90vh] overflow-y-auto bg-[#0A0A0B] border-[#262629]">
          <DialogHeader>
            <DialogTitle>
              {editReview ? 'Edit review' : `Review @${profileUsername || 'user'}`}
            </DialogTitle>
          </DialogHeader>
          {!editReview && eligibility?.existingReview && (
            <p className="text-xs text-gray-500 mb-2">
              You&apos;ve reviewed this person before. This will be a new review for a different event.
            </p>
          )}
          {!editReview && (
            <label className="block text-sm mb-1">Which event was this for?</label>
          )}
          {!editReview && (
            <select
              className="w-full min-h-[44px] rounded-lg bg-[#141416] border border-[#262629] px-3 mb-4"
              value={formEventId}
              onChange={(e) => setFormEventId(e.target.value)}
            >
              <option value="">Select event</option>
              {(eligibility?.sharedEvents || []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-sm mb-1">Rating</p>
          <StarRatingInput value={formRating} onChange={setFormRating} />
          <label className="block text-sm mt-4 mb-1">Comment</label>
          <Textarea
            value={formComment}
            onChange={(e) => setFormComment(e.target.value)}
            minLength={10}
            maxLength={300}
            rows={4}
            className="min-h-[100px] bg-[#141416] border-[#262629]"
          />
          <p className="text-xs text-gray-500 mt-1">{formComment.length}/300</p>
          <Button type="button" className="w-full mt-4 min-h-[44px]" disabled={submitting} onClick={submitWrite}>
            {editReview ? 'Save' : 'Post Review'}
          </Button>
        </DialogContent>
      </Dialog>

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
            placeholder="Describe the issue"
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
