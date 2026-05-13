import React, { useState } from 'react';
import { XIcon, KeyRoundIcon, EyeIcon, EyeOffIcon, LoaderIcon } from 'lucide-react';
import { changeOwnPassword } from '../lib/db/users';

export const PASSWORD_MIN_LENGTH = 8;

export function passwordStrengthLabel(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < PASSWORD_MIN_LENGTH) return { score: 0, label: 'Too short' };
  let score = 0;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak' };
  if (score === 2) return { score: 2, label: 'Okay' };
  return { score: 3, label: 'Strong' };
}

interface Props {
  // When true, hides the close button + cancel. Used by the forced-change
  // gate after login, where the user must complete the change before
  // continuing into the app.
  forced?: boolean;
  onClose?: () => void;
  onChanged: () => void;
}

export function ChangePasswordModal({ forced = false, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrengthLabel(next);
  const matches = next.length > 0 && next === confirm;
  const canSubmit =
    current.length > 0 &&
    next.length >= PASSWORD_MIN_LENGTH &&
    matches &&
    next !== current &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await changeOwnPassword({ currentPassword: current, newPassword: next });
      onChanged();
    } catch (err: any) {
      setError(err.message ?? 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <KeyRoundIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {forced ? 'Set a new password' : 'Change password'}
            </h2>
          </div>
          {!forced && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {forced && (
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              For security, please choose your own password before continuing.
            </p>
          )}

          <div>
            <label htmlFor="cp-current" className="block text-sm font-semibold text-gray-700 mb-1.5">
              {forced ? 'Temporary password' : 'Current password'}
            </label>
            <div className="relative">
              <input
                id="cp-current"
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="cp-next" className="block text-sm font-semibold text-gray-700 mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="cp-next"
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowNext(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showNext ? 'Hide password' : 'Show password'}
              >
                {showNext ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
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
            <label htmlFor="cp-confirm" className="block text-sm font-semibold text-gray-700 mb-1.5">
              Confirm new password
            </label>
            <input
              id="cp-confirm"
              type={showNext ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {confirm.length > 0 && !matches && (
              <p className="mt-1 text-xs text-red-600">Passwords don't match</p>
            )}
            {next.length > 0 && next === current && (
              <p className="mt-1 text-xs text-red-600">New password must differ from the current one</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            {!forced && onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Update password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
