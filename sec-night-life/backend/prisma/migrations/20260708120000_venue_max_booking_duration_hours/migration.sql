-- Optional per-venue cap on day-booking duration (hours). NULL = no limit.
ALTER TABLE "venues" ADD COLUMN "max_booking_duration_hours" INTEGER;
