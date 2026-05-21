-- ============================================================
-- Sample data for the Cluster Learning Hub (and the Activity
-- Notebook + Nucleus Journal underneath it).
--
-- Seeds one cluster — the FIRST one alphabetically — with three
-- nuclei worth of journal activity, four cluster-level themes,
-- a handful of activity-notebook entries and nucleus-journal
-- entries, and two cluster synthesis reflections. Together they
-- demonstrate the upward flow: activity → nucleus → cluster.
--
-- Idempotent: each insert is guarded by ON CONFLICT, and uses
-- WHERE NOT EXISTS guards on the inserts that don't have a
-- natural unique constraint to lean on. Re-running this file
-- is safe.
--
-- To target a specific cluster instead of "first", replace the
-- `target_cluster` CTE below with a literal id.
-- ============================================================

do $$
declare
  c_id  uuid;
  n1_id uuid;
  n2_id uuid;
  n3_id uuid;
  a1_id uuid;
  a2_id uuid;
  ct_youth uuid;
  ct_parents uuid;
  ct_new_families uuid;
  ct_devotional uuid;
  lt_n1_youth uuid;
  lt_n1_parents uuid;
  lt_n2_youth uuid;
  lt_n2_new_families uuid;
  lt_n3_devotional uuid;
  lt_n3_parents uuid;
  e_id uuid;
begin

-- Pick the first non-deleted cluster.
select id into c_id
  from clusters where deleted_at is null
  order by name limit 1;
if c_id is null then raise notice 'No clusters found; aborting seed.'; return; end if;

-- ─── Nuclei ────────────────────────────────────────────────
-- Reuse existing nuclei when present; otherwise create three
-- with friendly names. We pick the first three alphabetically.

select id into n1_id from nuclei
  where cluster_id = c_id and deleted_at is null order by name limit 1 offset 0;
select id into n2_id from nuclei
  where cluster_id = c_id and deleted_at is null order by name limit 1 offset 1;
select id into n3_id from nuclei
  where cluster_id = c_id and deleted_at is null order by name limit 1 offset 2;

if n1_id is null then
  insert into nuclei (cluster_id, name, lat, lng)
  values (c_id, 'Falcon Ridge', 53.5461, -113.4938)
  returning id into n1_id;
end if;
if n2_id is null then
  insert into nuclei (cluster_id, name, lat, lng)
  values (c_id, 'Maplewood', 53.5500, -113.5000)
  returning id into n2_id;
end if;
if n3_id is null then
  insert into nuclei (cluster_id, name, lat, lng)
  values (c_id, 'Riverbend', 53.5400, -113.5100)
  returning id into n3_id;
end if;

-- ─── Cluster themes ───────────────────────────────────────

-- Upsert four cluster themes. RETURNING is omitted because a
-- multi-row INSERT/UPDATE can't be captured into a scalar
-- variable in PL/pgSQL ("query returned more than one row").
-- The four ids are re-fetched by name below.
insert into cluster_themes (cluster_id, name, color, description, consolidation_level)
values
  (c_id, 'Sustaining Youth Participation', 'amber',
   'How we are inviting, engaging, and empowering youth to take part and grow.', 55),
  (c_id, 'Building Parent Engagement', 'green',
   'Strengthening relationships with parents and involving them meaningfully.', 70),
  (c_id, 'Welcoming New Families', 'blue',
   'Creating a warm and supportive experience for new families.', 30),
  (c_id, 'Deepening Devotional Life', 'purple',
   'Nurturing our spiritual life individually and together.', 45)
on conflict (cluster_id, name) do update
  set description = excluded.description,
      color = excluded.color,
      consolidation_level = excluded.consolidation_level;

select id into ct_youth        from cluster_themes where cluster_id = c_id and name = 'Sustaining Youth Participation';
select id into ct_parents      from cluster_themes where cluster_id = c_id and name = 'Building Parent Engagement';
select id into ct_new_families from cluster_themes where cluster_id = c_id and name = 'Welcoming New Families';
select id into ct_devotional   from cluster_themes where cluster_id = c_id and name = 'Deepening Devotional Life';

-- ─── Nucleus-level learning_themes ─────────────────────────
-- The auto-link trigger handles cluster_theme_id when not supplied;
-- we set it explicitly to be safe (and idempotent).

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n1_id, 'Sustaining Youth Participation', 'amber',
          'Nucleus-level reflections on inviting and empowering youth.',
          'established', ct_youth)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n1_youth from learning_themes where nucleus_id = n1_id and name = 'Sustaining Youth Participation';

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n1_id, 'Building Parent Engagement', 'green',
          'Connecting with parents in Falcon Ridge.', 'established', ct_parents)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n1_parents from learning_themes where nucleus_id = n1_id and name = 'Building Parent Engagement';

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n2_id, 'Sustaining Youth Participation', 'amber',
          'Maplewood: keeping youth engaged across the year.', 'established', ct_youth)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n2_youth from learning_themes where nucleus_id = n2_id and name = 'Sustaining Youth Participation';

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n2_id, 'Welcoming New Families', 'blue',
          'How new families are received.', 'established', ct_new_families)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n2_new_families from learning_themes where nucleus_id = n2_id and name = 'Welcoming New Families';

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n3_id, 'Deepening Devotional Life', 'purple',
          'Riverbend devotional culture.', 'established', ct_devotional)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n3_devotional from learning_themes where nucleus_id = n3_id and name = 'Deepening Devotional Life';

insert into learning_themes (nucleus_id, name, color, description, status, cluster_theme_id)
  values (n3_id, 'Building Parent Engagement', 'green',
          'Parents stepping into hosting roles.', 'established', ct_parents)
  on conflict (nucleus_id, name) do nothing;
select id into lt_n3_parents from learning_themes where nucleus_id = n3_id and name = 'Building Parent Engagement';

-- ─── Activities ────────────────────────────────────────────
-- One activity in n1 (Junior Youth) and one in n2 (Devotional).

select id into a1_id from activities
  where nucleus_id = n1_id and name = 'Sample JY Gathering' and deleted_at is null limit 1;
if a1_id is null then
  insert into activities (nucleus_id, name, type, is_active)
  values (n1_id, 'Sample JY Gathering', 'junior_youth', true)
  returning id into a1_id;
end if;

select id into a2_id from activities
  where nucleus_id = n2_id and name = 'Sample Devotional' and deleted_at is null limit 1;
if a2_id is null then
  insert into activities (nucleus_id, name, type, is_active)
  values (n2_id, 'Sample Devotional', 'devotional', true)
  returning id into a2_id;
end if;

-- ─── Activity Notebook entries (source = 'activity') ───────
-- Each entry is followed by its theme tag insert. We use a
-- short helper inline to avoid repeating the same pattern.

if not exists (
  select 1 from journal_entries where activity_id = a1_id and what_happened like 'Strong turnout%'
) then
  insert into journal_entries (
    nucleus_id, source, activity_id, occurred_at,
    what_happened, encouraging_signs, people_emerging
  ) values (
    n1_id, 'activity', a1_id, now() - interval '14 days',
    'Strong turnout this evening. 22 youth came, including three who were invited by friends for the first time.',
    'Several youth stayed afterward asking about service projects in the neighborhood.',
    'Maya and Ali both stepped up to lead small-group conversations.'
  ) returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n1_youth);
end if;

if not exists (
  select 1 from journal_entries where activity_id = a1_id and challenges like 'A couple of youth%'
) then
  insert into journal_entries (
    nucleus_id, source, activity_id, occurred_at,
    what_happened, challenges, follow_up
  ) values (
    n1_id, 'activity', a1_id, now() - interval '7 days',
    'Smaller gathering tonight (12). Quieter atmosphere — went deeper than usual on the unit reading.',
    'A couple of youth said the evening time conflicts with sports practice. We may need to consider shifting.',
    'Reach out to parents to see if a Saturday morning slot works better.'
  ) returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n1_youth);
end if;

if not exists (
  select 1 from journal_entries where activity_id = a2_id and what_happened like '14 attended%'
) then
  insert into journal_entries (
    nucleus_id, source, activity_id, occurred_at,
    what_happened, encouraging_signs
  ) values (
    n2_id, 'activity', a2_id, now() - interval '10 days',
    '14 attended the home devotional. Two new families joined for the first time — neighbors who heard about it from a friend on the street.',
    'The new mother said it was the first time she felt at home in a gathering since they moved.'
  ) returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n2_new_families);
end if;

if not exists (
  select 1 from journal_entries where activity_id = a2_id and follow_up like 'Follow up with the%'
) then
  insert into journal_entries (
    nucleus_id, source, activity_id, occurred_at,
    encouraging_signs, follow_up
  ) values (
    n2_id, 'activity', a2_id, now() - interval '3 days',
    'A youth who recently graduated from JY led one of the prayers tonight. The shift in confidence over the year is striking.',
    'Follow up with the family of the recent attendee about hosting a devotional in their home next month.'
  ) returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n2_youth);
end if;

-- ─── Nucleus Journal entries (source = 'nucleus') ──────────

if not exists (select 1 from journal_entries where nucleus_id = n1_id and source = 'nucleus' and body like 'A pattern is emerging%') then
  insert into journal_entries (nucleus_id, source, occurred_at, body)
  values (n1_id, 'nucleus', now() - interval '5 days',
    'A pattern is emerging: when parents are personally invited (not just told about events), they begin to come and even bring others. Three families in the last cycle joined this way.')
  returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n1_parents);
end if;

if not exists (select 1 from journal_entries where nucleus_id = n2_id and source = 'nucleus' and body like 'Transportation continues%') then
  insert into journal_entries (nucleus_id, source, occurred_at, body)
  values (n2_id, 'nucleus', now() - interval '12 days',
    'Transportation continues to be a real barrier for some families on the east side. Personally arranging ride shares has been more effective than announcing the gathering.')
  returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n2_new_families);
end if;

if not exists (select 1 from journal_entries where nucleus_id = n3_id and source = 'nucleus' and body like 'The devotional gatherings%') then
  insert into journal_entries (nucleus_id, source, occurred_at, body)
  values (n3_id, 'nucleus', now() - interval '8 days',
    'The devotional gatherings have taken on a new quality this season. People are arriving early, lingering after — a kind of unhurried rhythm we haven''t had before.')
  returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n3_devotional);
end if;

if not exists (select 1 from journal_entries where nucleus_id = n3_id and source = 'nucleus' and body like 'Two parents%') then
  insert into journal_entries (nucleus_id, source, occurred_at, body)
  values (n3_id, 'nucleus', now() - interval '2 days',
    'Two parents have offered to host devotionals in their homes next cycle. This grew out of conversations after the children''s class — a clear example of one activity giving rise to another.')
  returning id into e_id;
  insert into journal_entry_themes (entry_id, theme_id) values (e_id, lt_n3_parents);
end if;

-- ─── Cluster synthesis entries (source = 'cluster') ───────

if not exists (select 1 from journal_entries where cluster_theme_id = ct_youth and source = 'cluster' and body like 'Across both Falcon Ridge%') then
  insert into journal_entries (source, cluster_id, cluster_theme_id, occurred_at, body)
  values ('cluster', c_id, ct_youth, now() - interval '4 days',
    'Across both Falcon Ridge and Maplewood, the same observation keeps surfacing: youth come more consistently when they have a clear role, not just an invitation. The "stepping into responsibility" pattern (Maya/Ali in Falcon Ridge; the JY graduate leading prayer in Maplewood) seems to be the through-line. Worth raising at the next cluster reflection meeting.');
end if;

if not exists (select 1 from journal_entries where cluster_theme_id = ct_parents and source = 'cluster' and body like 'Two nuclei are%') then
  insert into journal_entries (source, cluster_id, cluster_theme_id, occurred_at, body)
  values ('cluster', c_id, ct_parents, now() - interval '1 day',
    'Two nuclei are independently noticing the same thing: personal invitation outperforms general announcement, and parents who are invited often arrive bringing others. Falcon Ridge described it as a "pattern"; Riverbend has seen it show up around the children''s class. Consultation question for the next reflection: how do we equip more friends to do this kind of one-on-one invitation well?');
end if;

raise notice 'Learning Hub sample data seeded into cluster %', c_id;
end $$;
