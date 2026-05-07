-- Add a profile_image_url column to profiles so signed-in users can attach
-- a photo to their account. Mirrors persons.profile_image_url and uses the
-- same `profile-photos` storage bucket (under a `users/` path prefix).
alter table profiles
  add column if not exists profile_image_url text;
