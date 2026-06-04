-- ─────────────────────────────────────────────────────────────
-- Person merge: collapse a duplicate person into a survivor.
--
-- Strategy (decided with the team):
--   • The loser is SOFT-deleted (deleted_at set) and tagged with
--     merged_into_id so its old profile URL can redirect and the
--     action is auditable / reversible.
--   • Every relationship the loser owns is re-pointed to the
--     survivor. Where a uniqueness constraint would collide (the two
--     people already share a nucleus / activity / course / etc.), the
--     loser's duplicate row is dropped — the survivor already has it.
--   • A `person_merged` event-log row records who merged whom.
--
-- Done in one SECURITY DEFINER function so the whole thing is atomic
-- and can re-point rows the caller can see but RLS would not let them
-- write individually. Authority is still checked explicitly below.
-- ─────────────────────────────────────────────────────────────

-- 1. New audit event type.
alter type event_log_type_enum add value if not exists 'person_merged';

-- 2. Pointer from an archived loser to the survivor it folded into.
alter table persons
  add column if not exists merged_into_id uuid references persons(id);

-- 3. "Can the caller edit this person?" — mirrors the persons UPDATE
--    RLS policy so the merge guard matches who may already edit them.
create or replace function app_can_edit_person(p_person uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    is_admin()
    or exists (
      select 1 from persons pp
      where pp.id = p_person
        and pp.cluster_id is not null
        and user_has_cluster_access(pp.cluster_id)
    )
    or exists (
      select 1 from nucleus_enrollments ne
      where ne.person_id = p_person
        and ne.deleted_at is null
        and user_has_nucleus_access(ne.nucleus_id)
    )
    or exists (
      select 1 from activity_participants ap
      where ap.person_id = p_person
        and ap.deleted_at is null
        and user_has_activity_access(ap.activity_id)
    );
$$;

-- 4. The merge itself.
create or replace function merge_persons(p_loser uuid, p_survivor uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_loser_name    text;
  v_survivor_name text;
begin
  if p_loser is null or p_survivor is null then
    raise exception 'Both the duplicate and the surviving person are required';
  end if;
  if p_loser = p_survivor then
    raise exception 'Cannot merge a person into themselves';
  end if;

  select name into v_loser_name
  from persons where id = p_loser and deleted_at is null;
  if v_loser_name is null then
    raise exception 'The person to merge was not found or is already archived';
  end if;

  select name into v_survivor_name
  from persons where id = p_survivor and deleted_at is null;
  if v_survivor_name is null then
    raise exception 'The surviving person was not found or is archived';
  end if;

  if not (app_can_edit_person(p_loser) and app_can_edit_person(p_survivor)) then
    raise exception 'You do not have permission to merge these people';
  end if;

  -- nucleus_enrollments — unique (person_id, nucleus_id)
  delete from nucleus_enrollments l
  where l.person_id = p_loser
    and exists (
      select 1 from nucleus_enrollments s
      where s.person_id = p_survivor and s.nucleus_id = l.nucleus_id
    );
  update nucleus_enrollments set person_id = p_survivor where person_id = p_loser;
  update nucleus_enrollments set primary_contact_id = p_survivor where primary_contact_id = p_loser;

  -- course_enrollments — unique (person_id, course_id)
  delete from course_enrollments l
  where l.person_id = p_loser
    and exists (
      select 1 from course_enrollments s
      where s.person_id = p_survivor and s.course_id = l.course_id
    );
  update course_enrollments set person_id = p_survivor where person_id = p_loser;

  -- course_unit_enrollments — unique (person_id, course_unit_id)
  delete from course_unit_enrollments l
  where l.person_id = p_loser
    and exists (
      select 1 from course_unit_enrollments s
      where s.person_id = p_survivor and s.course_unit_id = l.course_unit_id
    );
  update course_unit_enrollments set person_id = p_survivor where person_id = p_loser;

  -- activity_participants — unique (activity_id, person_id)
  delete from activity_participants l
  where l.person_id = p_loser
    and exists (
      select 1 from activity_participants s
      where s.person_id = p_survivor and s.activity_id = l.activity_id
    );
  update activity_participants set person_id = p_survivor where person_id = p_loser;

  -- session_attendance — unique (session_id, person_id)
  delete from session_attendance l
  where l.person_id = p_loser
    and exists (
      select 1 from session_attendance s
      where s.person_id = p_survivor and s.session_id = l.session_id
    );
  update session_attendance set person_id = p_survivor where person_id = p_loser;

  -- journal_entry_attendance — pk (entry_id, person_id)
  delete from journal_entry_attendance l
  where l.person_id = p_loser
    and exists (
      select 1 from journal_entry_attendance s
      where s.person_id = p_survivor and s.entry_id = l.entry_id
    );
  update journal_entry_attendance set person_id = p_survivor where person_id = p_loser;

  -- person_capacities — pk (person_id, capacity_id)
  delete from person_capacities l
  where l.person_id = p_loser
    and exists (
      select 1 from person_capacities s
      where s.person_id = p_survivor and s.capacity_id = l.capacity_id
    );
  update person_capacities set person_id = p_survivor where person_id = p_loser;

  -- LSA household linkage and user↔person links — no uniqueness, just re-point.
  update household_members set linked_person_id = p_survivor where linked_person_id = p_loser;
  update profiles          set person_id        = p_survivor where person_id        = p_loser;

  -- Preserve audit history by moving it onto the survivor.
  update event_log set person_id = p_survivor where person_id = p_loser;

  -- Backfill only fields the survivor is missing — never overwrite their data.
  update persons s set
    email             = coalesce(s.email, l.email),
    phone             = coalesce(s.phone, l.phone),
    profile_image_url = coalesce(s.profile_image_url, l.profile_image_url),
    cluster_id        = coalesce(s.cluster_id, l.cluster_id)
  from persons l
  where s.id = p_survivor and l.id = p_loser;

  -- Archive the loser.
  update persons
  set deleted_at = now(), merged_into_id = p_survivor
  where id = p_loser;

  insert into event_log (type, person_id, user_id, description, details)
  values (
    'person_merged',
    p_survivor,
    auth.uid(),
    format('Merged "%s" into "%s"', v_loser_name, v_survivor_name),
    jsonb_build_object(
      'loserId', p_loser,       'loserName', v_loser_name,
      'survivorId', p_survivor, 'survivorName', v_survivor_name
    )
  );
end;
$$;

grant execute on function app_can_edit_person(uuid) to authenticated;
grant execute on function merge_persons(uuid, uuid) to authenticated;
