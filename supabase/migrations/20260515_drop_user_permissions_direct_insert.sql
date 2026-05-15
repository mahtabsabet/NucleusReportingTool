-- ============================================================
-- Drop the back-door direct-INSERT RLS policies on user_permissions.
--
-- These policies originally let a Cluster Coordinator directly
-- INSERT 'nucleus_collaborator' rows and a Nucleus Coordinator
-- directly INSERT 'activity_lead' rows — bypassing the UI's
-- request-review flow. With this branch, CC / NC role changes go
-- through the manage-user edge function (service_role, bypasses
-- RLS, with explicit scope checks in code). No UI writes to
-- user_permissions through the client at all — verified by grep
-- across src/. These RLS policies are therefore an unused
-- alternate write path with weaker safeguards; dropping them
-- closes the original divergence #6 hole.
--
-- The "Admins manage all permissions" policy is left in place;
-- admins continue to manage every permission row directly, and
-- the edge-function path (service_role) is unaffected.
-- ============================================================

drop policy if exists "Cluster coordinators assign nucleus collaborators" on user_permissions;
drop policy if exists "Nucleus collaborators assign activity leads" on user_permissions;
