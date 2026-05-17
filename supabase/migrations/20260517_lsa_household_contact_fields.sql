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
-- ============================================================

alter table household_members
  add column if not exists email  text,
  add column if not exists phone  text,
  add column if not exists mobile text;

alter table households
  add column if not exists neighbourhood text,
  add column if not exists sector        text;
