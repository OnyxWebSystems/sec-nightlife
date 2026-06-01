-- Venue menu promotion specials (price-only; preserve sub_category)
ALTER TABLE "venue_menu_items" ADD COLUMN IF NOT EXISTS "original_price" DOUBLE PRECISION;
ALTER TABLE "venue_menu_items" ADD COLUMN IF NOT EXISTS "special_price" DOUBLE PRECISION;
ALTER TABLE "venue_menu_items" ADD COLUMN IF NOT EXISTS "special_starts_at" TIMESTAMP(3);
ALTER TABLE "venue_menu_items" ADD COLUMN IF NOT EXISTS "special_ends_at" TIMESTAMP(3);

-- Repair legacy specials that stored schedule in sub_category
UPDATE "venue_menu_items" v
SET
  "special_starts_at" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND position('|' in substring(v."sub_category" from 27)) > 0
    THEN (split_part(substring(v."sub_category" from 27), '|', 1))::timestamptz
    ELSE NULL
  END,
  "special_ends_at" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND position('|' in substring(v."sub_category" from 27)) > 0
    THEN (split_part(substring(v."sub_category" from 27), '|', 2))::timestamptz
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%'
    THEN (substring(v."sub_category" from 27))::timestamptz
    ELSE NULL
  END,
  "special_price" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' THEN v."price"
    ELSE v."special_price"
  END,
  "original_price" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND v."original_price" IS NULL
    THEN COALESCE(c."default_price_zar", v."price")
    ELSE v."original_price"
  END,
  "sub_category" = COALESCE(c."sub_category", CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' THEN NULL
    ELSE v."sub_category"
  END)
FROM "menu_catalog_items" c
WHERE v."catalog_item_id" = c."id"
  AND v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%';

UPDATE "venue_menu_items" v
SET
  "special_starts_at" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND position('|' in substring(v."sub_category" from 27)) > 0
    THEN (split_part(substring(v."sub_category" from 27), '|', 1))::timestamptz
    ELSE NULL
  END,
  "special_ends_at" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND position('|' in substring(v."sub_category" from 27)) > 0
    THEN (split_part(substring(v."sub_category" from 27), '|', 2))::timestamptz
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%'
    THEN (substring(v."sub_category" from 27))::timestamptz
    ELSE NULL
  END,
  "special_price" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' THEN v."price"
    ELSE v."special_price"
  END,
  "original_price" = CASE
    WHEN v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%' AND v."original_price" IS NULL
    THEN v."price"
    ELSE v."original_price"
  END,
  "sub_category" = NULL
WHERE v."sub_category" LIKE '__SEC_SPECIAL_OFFER_EXP__:%'
  AND (v."catalog_item_id" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "menu_catalog_items" c WHERE c."id" = v."catalog_item_id"
  ));

-- Expired legacy rows: restore base price where we have original_price
UPDATE "venue_menu_items"
SET
  "price" = COALESCE("original_price", "price"),
  "special_price" = NULL,
  "special_starts_at" = NULL,
  "special_ends_at" = NULL,
  "original_price" = NULL
WHERE "special_ends_at" IS NOT NULL
  AND "special_ends_at" < NOW();
