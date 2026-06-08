/**
 * Open peer review eligibility — any user may review another user once (not self).
 * @param {string} reviewerId
 * @param {string} subjectUserId
 * @returns {{ eligible: boolean, sharedEvents: [] }}
 */
export async function checkUserReviewEligibility(reviewerId, subjectUserId) {
  if (reviewerId === subjectUserId) {
    return { eligible: false, sharedEvents: [] };
  }
  return { eligible: true, sharedEvents: [] };
}
