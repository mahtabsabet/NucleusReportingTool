import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { completePasswordReset } from '../lib/db/users';
import { PASSWORD_MIN_LENGTH, passwordStrengthLabel } from './ChangePasswordModal';

// Landed-from-email page. Supabase converts the `?code=…` / hash params from
// the recovery email into a session of type `recovery` via the auth client;
// the user is then allowed to call updateUser({ password }) without
// re-authenticating with an old password.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // After Supabase processes the recovery link, there is a session with
    // user. If there's no session at all, the link is invalid/expired.
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setTokenValid(!!session?.user);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const strength = passwordStrengthLabel(next);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = next.length >= PASSWORD_MIN_LENGTH && matches && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await completePasswordReset(next);
      // Force a clean sign-out so the user re-authenticates with the new
      // password — this also invalidates any other lingering sessions.
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to set password');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">Set a new password</h1>
        </div>

        {!tokenValid ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
            <p className="text-sm text-stone-700">
              This reset link is invalid or has expired.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block mt-4 text-sm text-stone-800 underline hover:no-underline"
            >
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
            <p className="text-sm text-emerald-700 font-medium">Password updated</p>
            <p className="text-xs text-stone-500 mt-2">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1" htmlFor="reset-next">
                New password
              </label>
              <input
                id="reset-next"
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={next}
                onChange={e => setNext(e.target.value)}
                autoComplete="new-password"
                placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              {next.length > 0 && (
                <p
                  className={`mt-1 text-xs font-medium ${
                    strength.score === 0 ? 'text-red-600'
                      : strength.score === 1 ? 'text-orange-600'
                      : strength.score === 2 ? 'text-yellow-600'
                      : 'text-emerald-600'
                  }`}
                >
                  Strength: {strength.label}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1" htmlFor="reset-confirm">
                Confirm new password
              </label>
              <input
                id="reset-confirm"
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              {confirm.length > 0 && !matches && (
                <p className="mt-1 text-xs text-red-600">Passwords don't match</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-stone-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
