# Trust & Safety Reporting Rollout

## Phase 1 (implemented)

- Business navigation `Insights` entry removed.
- Reporting now supports `user`, `venue`, and `event` targets.
- New report metadata: category, priority, assignment, evidence links, resolution note.
- Admin can triage reports and take direct moderation actions:
  - suspend / unsuspend user
  - reject venue compliance
  - cancel event

## Phase 2 (recommended next)

- Add secure evidence file uploads (not just URL links).
- Add urgent escalation policy for GBV/harm reports (response SLA and dedicated queue).
- Add notifier workflow to alert moderators on critical reports.

## Manual test checklist

1. Submit user report from `UserProfile`.
2. Submit venue report from `VenueProfile`.
3. Submit event report from `EventDetails`.
4. Verify duplicate reports (same target + category) within 12h are blocked.
5. Open admin dashboard `reports` tab and confirm pending report appears.
6. Resolve report with note (dismiss or action taken).
7. Run moderation action from report:
   - suspend target user and verify protected API returns suspended error
   - cancel target event and verify it is no longer active
8. Check admin dashboard counters for pending/high/critical reports.
