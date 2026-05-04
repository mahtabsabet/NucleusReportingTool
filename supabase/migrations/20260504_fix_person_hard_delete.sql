-- Allow admins to hard-delete person records.
create policy "Admins delete persons" on persons
  for delete using (is_admin());

-- Cascade deletes to child records so that deleting a person automatically
-- removes their activity participation, nucleus enrollment, session attendance,
-- and course enrollment rows.
alter table activity_participants
  drop constraint activity_participants_person_id_fkey,
  add constraint activity_participants_person_id_fkey
    foreign key (person_id) references persons(id) on delete cascade;

alter table nucleus_enrollments
  drop constraint nucleus_enrollments_person_id_fkey,
  add constraint nucleus_enrollments_person_id_fkey
    foreign key (person_id) references persons(id) on delete cascade;

alter table session_attendance
  drop constraint session_attendance_person_id_fkey,
  add constraint session_attendance_person_id_fkey
    foreign key (person_id) references persons(id) on delete cascade;

alter table course_enrollments
  drop constraint course_enrollments_person_id_fkey,
  add constraint course_enrollments_person_id_fkey
    foreign key (person_id) references persons(id) on delete cascade;

-- Null out references where this person is listed as someone else's primary contact.
alter table nucleus_enrollments
  drop constraint nucleus_enrollments_primary_contact_id_fkey,
  add constraint nucleus_enrollments_primary_contact_id_fkey
    foreign key (primary_contact_id) references persons(id) on delete set null;

-- Preserve audit log rows but clear the dangling person reference.
alter table event_log
  drop constraint event_log_person_id_fkey,
  add constraint event_log_person_id_fkey
    foreign key (person_id) references persons(id) on delete set null;
