-- Align database with Prisma schema: Venue.venuePaystackSubaccountCode
-- Fixes: prisma.venue.findMany() failing when column was missing (e.g. admin venue compliance queue)
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "venue_paystack_subaccount_code" TEXT;
