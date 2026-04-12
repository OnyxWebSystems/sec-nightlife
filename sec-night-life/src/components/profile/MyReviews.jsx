import React from 'react';
import UserProfileReviewsSection from '@/components/reviews/UserProfileReviewsSection';

/** Own profile: reviews about you + reviews you’ve given (with edit). */
export default function MyReviews({ userId, username }) {
  if (!userId) return null;
  return (
    <UserProfileReviewsSection profileUserId={userId} profileUsername={username} showReviewsIGave />
  );
}
