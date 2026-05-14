import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheckIcon, LoaderIcon, LogOutIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  fetchPrivacyAckStatus,
  recordPrivacyAcknowledgement,
} from '../lib/db/privacy';

// The acknowledgement checkboxes the user must tick. These are the
// concrete commitments — keep the tone non-legalistic. If this list
// changes meaningfully, bump CURRENT_PRIVACY_POLICY_VERSION so every
// existing user is re-prompted.
const ACK_ITEMS: string[] = [
  'I understand that information in this system must be handled responsibly and respectfully.',
  'I will only enter or access information appropriate to my role and responsibilities.',
  'I will take special care when handling information about children and junior youth.',
  'I will use respectful, constructive, and appropriate language when entering notes or comments.',
  'I will not upload or share personal information, photographs, or contact details without appropriate permission or a legitimate community-building purpose.',
  'I understand that this system is intended to support community-building work and not for personal, commercial, or inappropriate use.',
];

// Renders a full-screen, non-dismissable acknowledgement screen for
// signed-in users who haven't accepted the current policy version.
// Mounted in App.tsx alongside the forced-password gate; this gate
// runs first conceptually (information stewardship before anything
// else), but rendering order doesn't matter because each gate
// independently blocks the rest of the UI when active.
//
// Skipped on /reset-password so a recovery-link user can still set a
// new password without an "agree first" loop blocking the input.
export function PrivacyAcknowledgementGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [needsAck, setNeedsAck] = useState(false);
  const [agreed, setAgreed] = useState<boolean[]>(() => ACK_ITEMS.map(() => false));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setChecked(false);
      setNeedsAck(false);
      setAgreed(ACK_ITEMS.map(() => false));
      return;
    }
    let cancelled = false;
    fetchPrivacyAckStatus(user.id)
      .then(status => {
        if (cancelled) return;
        setNeedsAck(!status.acknowledged);
        setChecked(true);
      })
      .catch(err => {
        // Fail-open: a DB hiccup shouldn't block users mid-session.
        // Surface the error in devtools so silent migration drift
        // (the original "I logged in and was never asked" case)
        // doesn't look like working acknowledgement state.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[privacy-ack] failed to fetch acknowledgement status', err);
          setChecked(true);
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  // While we don't know yet, render the app underneath as-is (the
  // user will see whatever was already loading). If the user is
  // unauthenticated, this gate is inert.
  if (!user || !checked || !needsAck) return <>{children}</>;

  // Recovery flow has its own non-skippable surface; don't stack the
  // gate on top of it (would block the user from setting their password).
  if (location.pathname === '/reset-password') return <>{children}</>;

  const allChecked = agreed.every(Boolean);

  async function handleSubmit() {
    if (!user || !allChecked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordPrivacyAcknowledgement(user.id);
      setNeedsAck(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not record your acknowledgement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] bg-stone-50 overflow-y-auto">
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 my-4 sm:my-0">
          <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldCheckIcon className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  A few commitments before we begin
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Information stewardship · v{CURRENT_PRIVACY_POLICY_VERSION}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              This tool exists to help us serve our communities — to keep track of
              friendships, learning, and accompaniment over time. The information
              entered here belongs to the people it describes, and we hold it on
              their behalf. Before continuing, please read and confirm the
              following commitments. The same questions may be asked again later
              if our shared understanding of these matters develops.
            </p>
          </div>

          <div className="px-6 sm:px-8 py-5 space-y-3">
            {ACK_ITEMS.map((text, i) => (
              <label
                key={i}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-stone-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={agreed[i]}
                  onChange={e => {
                    const next = agreed.slice();
                    next[i] = e.target.checked;
                    setAgreed(next);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-800 leading-relaxed">{text}</span>
              </label>
            ))}
          </div>

          <div className="px-6 sm:px-8 pb-5 text-xs text-gray-500 leading-relaxed space-y-1.5">
            <p>
              A few things worth keeping in mind as you use the system:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Avoid recording sensitive personal details that aren't needed for the work.</li>
              <li>Protect your login — don't share your password or leave a session open on a shared device.</li>
              <li>If you notice a mistake, misuse, or something that doesn't feel right, please tell an administrator.</li>
            </ul>
          </div>

          {error && (
            <div className="mx-6 sm:mx-8 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="px-6 sm:px-8 py-5 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              onClick={() => signOut()}
              type="button"
              className="inline-flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <LogOutIcon className="w-4 h-4" />
              Sign out instead
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allChecked || submitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <LoaderIcon className="w-4 h-4 animate-spin" />}
              {submitting ? 'Recording…' : 'I agree — continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
