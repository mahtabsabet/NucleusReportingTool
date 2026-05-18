-- ============================================================
-- LSA household layer — contact + locality fields.
--
-- The community-building `persons` table stores email/phone for
-- adult participants, but those records exist only for people
-- already enrolled in a nucleus/activity. The LSA stewardship
-- side covers the full community roster (well beyond active
-- participants) and the contact details captured there are not
-- the same data — an LSA may have a household phone the
-- community-building side has never collected, or vice versa.
--
-- Per-member email/phone/mobile is intentionally on
-- household_members (not households), so couples / adult children
-- at the same address keep their own contact info.
--
-- neighbourhood/sector live on households because they describe
-- where the household sits, not who lives there.
--
-- POST-MERGE CLEANUP NOTE: this migration ships alongside a one-off
-- import script that loads ~280 real Calgary households into the
-- dev database as sample data. After the corrected, assembly-
-- reviewed dataset lands in production, that dev sample data
-- should be deleted so we aren't holding PII we don't need.
-- ============================================================

alter table household_members
  add column if not exists email  text,
  add column if not exists phone  text,
  add column if not exists mobile text;

alter table households
  add column if not exists neighbourhood text,
  add column if not exists sector        text;
