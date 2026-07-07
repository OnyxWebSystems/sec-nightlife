/** Normalize guest seating plan list from API payloads (supports legacy single plan). */
export function normalizeGuestSeatingPlans(source) {
  if (Array.isArray(source?.seatingPlans) && source.seatingPlans.length > 0) {
    return source.seatingPlans.filter((p) => p?.imageUrl);
  }
  if (source?.seatingPlan?.imageUrl) return [source.seatingPlan];
  if (Array.isArray(source)) return source.filter((p) => p?.imageUrl);
  if (source?.imageUrl) return [source];
  return [];
}

export function resolveInitialPlanIndex(plans, initialPlanId) {
  if (!initialPlanId || plans.length <= 1) return 0;
  const idx = plans.findIndex((p) => p.id === initialPlanId);
  return idx >= 0 ? idx : 0;
}
