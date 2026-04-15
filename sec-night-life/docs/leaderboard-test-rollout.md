# Leaderboard Test And Rollout Checklist

## Backend API Validation
- `GET /api/leaderboard/promoters` returns only eligible verified promoters.
- Ranking order is deterministic with tie-breakers (quality, completed jobs, recency).
- Pagination metadata is correct (`page`, `limit`, `total`, `hasMore`).
- `GET /api/leaderboard/promoters/me/status` returns featured status and next steps.
- `POST /api/ratings` rejects duplicate ratings per context and updates profile aggregates.

## Legal And Compliance Validation
- `GET /api/legal/promoter-code-of-conduct` returns the legal document with version.
- `POST /api/legal/acceptances` records acceptance with user id, version, and timestamp.
- Promoters without current `PROMOTER_CODE_OF_CONDUCT` acceptance are excluded.
- Suspended users and compliance-flagged users are excluded from leaderboard output.

## Moderation Validation
- `PATCH /api/admin/leaderboard/promoters/:userId/visibility` hides promoter immediately.
- Hidden promoter is excluded from public leaderboard until reinstated or expiry.
- Reinstated promoter appears again when all eligibility gates are satisfied.

## Frontend Validation
- `Leaderboard` page loads from backend API (no client-side ranking math).
- Top-3 podium and fallback list both render correctly for 0, 1, 2, 3+ entries.
- “How to get featured” section is visible and reflects policy thresholds.
- Error state renders when leaderboard API fails.

## Rollout Plan
1. Deploy backend schema + API and run Prisma migration/push in target environment.
2. Deploy frontend leaderboard and legal acceptance UI updates.
3. Backfill promoter legal acceptance where legally allowed (or require re-acceptance).
4. Monitor API error rate and ranking anomalies for 48 hours.
5. Enable admin moderation workflow for enforcement and dispute handling.
