import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { fetchMustChangePassword } from '../lib/db/users';
import { ChangePasswordModal } from './ChangePasswordModal';

// Renders a non-dismissable Change Password modal when the signed-in user's
// profile has must_change_password = true. Triggered after an admin sets a
// temporary password (either at user creation or via the "Reset password"
// action). Cleared when the user successfully changes their password.
export function ForcedChangePasswordGate() {
  const { user } = useAuth();
  const [mustChange, setMustChange] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      setMustChange(false);
      setChecked(false);
      return;
    }
    let cancelled = false;
    fetchMustChangePassword(user.id)
      .then(flag => { if (!cancelled) { setMustChange(flag); setChecked(true); } })
      .catch(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !checked || !mustChange) return null;

  return (
    <ChangePasswordModal
      forced
      onChanged={() => setMustChange(false)}
    />
  );
}
