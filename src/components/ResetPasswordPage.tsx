import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { completePasswordReset } from '../lib/db/users';
import { PASSWORD_MIN_LENGTH, passwordStrengthLabel } from './ChangePasswordModal';

// Landing page for the recovery email link. Supabase's verify endpoint
// redirects here with one of two payload shapes:
//
//   • implicit flow:  /reset-password#access_token=…&type=recovery
//   • PKCE flow:      /reset-password?code=…
//
// The Supabase JS client auto-detects the implicit hash on load, but PKCE
// requires an explicit exchange. We also can't rely on getSession() at
// mount time — the URL processing is async, so we listen for the
// PASSWORD_RECOVERY / SIGNED_IN events via onAuthStateChange instead of
// declaring the link "invalid" prematurely.
//
// The page is mounted on /reset-password and is reachable both signed-in
// and signed-out (App.tsx). Errors in the recovery payload (e.g. expired
// token) arrive as `?error=` / `&error_description=` query params from
// Supabase.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'ready' | 'invalid'>('pending');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let invalidTimer: ReturnType<typeof setTimeout> | null = null;

    // Supabase echoes failures back as query params on the redirect URL.
    // Surface those directly so the user sees a useful message instead of
    // a generic "invalid link".
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDesc = params.get('error_description') ?? hashParams.get('error_description');
    if (errorDesc) {
      setLinkError(errorDesc.replace(/\+/g, ' '));
      setStatus('invalid');
      return;
    }

    function markReady() {
      if (cancelled) return;
      if (invalidTimer) { clearTimeout(invalidTimer); invalidTimer = null; }
      setStatus('ready');
    }

    // 1) PKCE: if the URL carries a `?code=…`, exchange it for a session
    //    explicitly. (Auto-exchange only happens when the client was created
    //    with flowType: 'pkce'; this branch covers both cases safely.)
    const code = params.get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exErr }) => {
        if (cancelled) return;
        if (exErr || !data.session) {
          setLinkError(exErr?.message ?? 'This reset link is invalid or has expired.');
          setStatus('invalid');
        } else {
          markReady();
        }
      });
    }

    // 2) Implicit flow: the SDK processes the hash automatically on init
    //    and fires PASSWORD_RECOVERY (or SIGNED_IN with type=recovery).
    //    Listen for that instead of polling getSession().
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        markReady();
      }
    });

    // 3) Fallback: if a session already exists when we land here (e.g.
    //    the SDK finished processing before this effect ran), accept it.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) markReady();
    });

    // 4) Final safety net: if after ~3 seconds nothing has produced a
    //    session, the link really is broken (or the Supabase project's
    //    redirect-URL allowlist doesn't include this page).
    invalidTimer = setTimeout(() => {
      if (cancelled) return;
      setStatus(prev => (prev === 'pending' ? 'invalid' : prev));
    }, 3000);

    return () => {
      cancelled = true;
      if (invalidTimer) clearTimeout(invalidTimer);
      subscription.unsubscribe();
    };
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

  if (status === 'pending') {
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

        {status === 'invalid' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
            <p className="text-sm text-stone-700">
              {linkError ?? 'This reset link is invalid or has expired.'}
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
