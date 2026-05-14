import { supabase } from '../supabase';

// Single source of truth for the version of the privacy & information
// stewardship acknowledgement. Bump this string when the policy text
// (or any of the checkbox items) is updated — users whose stored
// `privacy_policy_version_acknowledged` no longer matches will be
// shown the gate again on their next app load.
//
// The same constant is also defined in the SQL migration as
// `current_privacy_policy_version()`. Keep the two in sync.
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-05-13';

export interface PrivacyAckStatus {
  acknowledged: boolean;
  version: string | null;
  acknowledgedAt: string | null;
}

// Reads the gate state for the signed-in user. `acknowledged` is true
// only when the stored version matches the current version — so a
// version bump implicitly invalidates every prior acknowledgement.
export async function fetchPrivacyAckStatus(userId: string): Promise<PrivacyAckStatus> {
  const { data, error } = await supabase
    .from('profiles')
    .select('privacy_acknowledged_at, privacy_policy_version_acknowledged')
    .eq('id', userId)
    .single();
  if (error) throw error;
  const row = (data as any) ?? {};
  const version = (row.privacy_policy_version_acknowledged as string | null) ?? null;
  return {
    acknowledged: version === CURRENT_PRIVACY_POLICY_VERSION,
    version,
    acknowledgedAt: (row.privacy_acknowledged_at as string | null) ?? null,
  };
}

// Records the user's acknowledgement of the current policy version.
// Writes two places:
//   1. profiles  — the "current state" the gate reads on next load.
//   2. privacy_acknowledgements — append-only audit log; preserved
//      across admin resets and policy-version bumps.
export async function recordPrivacyAcknowledgement(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const version = CURRENT_PRIVACY_POLICY_VERSION;

  // privacy_acknowledgements is not in the generated Database types yet;
  // cast through `as any` (same pattern as the must_change_password
  // helpers in users.ts).
  const { error: logErr } = await (supabase.from('privacy_acknowledgements') as any)
    .insert({ user_id: userId, policy_version: version, acknowledged_at: now });
  if (logErr) throw logErr;

  const { error: profileErr } = await (supabase.from('profiles') as any)
    .update({
      privacy_acknowledged_at: now,
      privacy_policy_version_acknowledged: version,
    })
    .eq('id', userId);
  if (profileErr) throw profileErr;
}

// Admin-only: clears the profile-level acknowledgement so the user is
// shown the gate again on next load. Audit history in
// `privacy_acknowledgements` is intentionally preserved.
//
// Use cases:
//   - account was tested before handoff
//   - admin wants a specific user to re-confirm after a policy update
//     that didn't justify a global version bump
//   - troubleshooting / hygiene
export async function adminResetPrivacyAcknowledgement(targetUserId: string): Promise<void> {
  // RPC isn't typed in database.types — cast for the same reason as above.
  const { error } = await (supabase as any).rpc('reset_privacy_acknowledgement', {
    target_user_id: targetUserId,
  });
  if (error) throw error;
}
