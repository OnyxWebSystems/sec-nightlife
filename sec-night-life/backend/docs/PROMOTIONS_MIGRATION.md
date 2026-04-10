# Promotions table and Neon

The app expects the `promotions` table to match `prisma/schema.prisma` (columns such as `promotion_type`, `status` as enums, metrics columns, etc.).

**Git push does not change your database.** Apply migrations to production:

1. Set `DATABASE_URL` to your Neon connection string (e.g. in `backend/.env`).
2. From `sec-night-life/backend` run:

```bash
npx prisma migrate deploy
```

**Or** paste the SQL from `scripts/migrations/align-promotions-with-prisma.sql` into the Neon SQL editor and run it (same content as the Prisma migration `20260410140000_align_promotions_with_prisma`).

After migrations, redeploy the API and test **Publish Promotion** again.

## Troubleshooting

**`default for column "status" cannot be cast automatically to type "PromotionStatus"`**  
The legacy column had a text default (`draft`). The migration must run `ALTER COLUMN "status" DROP DEFAULT` before changing the column type. Use the latest `align-promotions-with-prisma.sql` from the repo, or run `resume-align-promotions-from-step6.sql` if the script stopped partway through step 6.

Discard any half-applied “fix with AI” SQL that left a broken `DO $$` block.
