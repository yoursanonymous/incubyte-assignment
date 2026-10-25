-- Prisma cannot model CHECK constraints, so they are maintained here.
-- Application validation (Zod) rejects bad input first; these guarantee the invariants
-- even if a bug, a script or a manual SQL session bypasses the application.

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "users_email_length_chk" CHECK (char_length("email") BETWEEN 3 AND 254);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_quantity_range_chk" CHECK ("quantity" >= 0 AND "quantity" <= 100000),
  ADD CONSTRAINT "vehicles_price_range_chk" CHECK ("price_cents" > 0 AND "price_cents" <= 1000000000),
  ADD CONSTRAINT "vehicles_make_not_blank_chk" CHECK (char_length(btrim("make")) > 0),
  ADD CONSTRAINT "vehicles_model_not_blank_chk" CHECK (char_length(btrim("model")) > 0);

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_quantity_range_chk" CHECK ("quantity" BETWEEN 1 AND 10),
  ADD CONSTRAINT "purchases_unit_price_positive_chk" CHECK ("unit_price_cents" > 0),
  ADD CONSTRAINT "purchases_total_matches_chk" CHECK ("total_cents" = "unit_price_cents"::bigint * "quantity");
