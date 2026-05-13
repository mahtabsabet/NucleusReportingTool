import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchMustChangePassword } from '../lib/db/users';
import { ChangePasswordModal } from './ChangePasswordModal';

// Renders a non-dismissable Change Password modal when the signed-in user's
// profile has must_change_password = true. Triggered after an admin sets a
// temporary password (either at user creation or via the "Reset password"
// action). Cleared when the user successfully changes their password.
//
// Suppressed on /reset-password because that page is the canonical surface
// for choosing a new password (recovery flow); showing the gate on top of
// it would ask for a "current password" the user came to the page without.
export function ForcedChangePasswordGate() {
  const { user } = useAuth();
  const location = useLocation();
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
  if (location.pathname === '/reset-password') return null;

  return (
    <ChangePasswordModal
      forced
      onChanged={() => setMustChange(false)}
    />
  );
}

