-- Repair day-booking VENUE_TABLE_JOIN tickets that expired too early because
-- visible_until was set to service end instead of service end + 24h.

UPDATE tickets t
SET visible_until = GREATEST(
  COALESCE(t.visible_until, t.created_at) + interval '24 hours',
  NOW() + interval '24 hours'
)
WHERE t.kind = 'VENUE_TABLE_JOIN'
  AND t.event_id IS NULL
  AND t.refunded_at IS NULL
  AND t.created_at > NOW() - interval '90 days'
  AND (t.visible_until IS NULL OR t.visible_until < NOW());

-- Restore hidden day-booking passes when the user has no other visible pass for the same table.
UPDATE tickets t
SET hidden_from_history_at = NULL
WHERE t.hidden_from_history_at IS NOT NULL
  AND t.kind = 'VENUE_TABLE_JOIN'
  AND t.event_id IS NULL
  AND t.refunded_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tickets t2
    WHERE t2.user_id = t.user_id
      AND t2.venue_table_id = t.venue_table_id
      AND t2.hidden_from_history_at IS NULL
      AND t2.refunded_at IS NULL
      AND t2.id <> t.id
  );
