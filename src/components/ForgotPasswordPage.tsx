import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '../lib/db/users';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(email);
    } catch (err: any) {
      // Surface only generic problems (e.g. network) to the user — do NOT
      // distinguish "email exists" vs. "doesn't exist". The success screen
      // shows the same message in either case to prevent account enumeration.
      setError(err.message ?? 'Something went wrong, please try again.');
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">Reset your password</h1>
          <p className="text-stone-500 text-sm mt-1">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
            <p className="text-sm text-stone-700">
              If an account exists for <strong className="break-all">{email}</strong>, a password
              reset link has been sent. Check your inbox (and spam folder).
            </p>
            <p className="text-xs text-stone-400 mt-3">
              The link will expire in 1 hour.
            </p>
          </div>
        )}

        <p className="text-center text-sm text-stone-500 mt-6">
          <Link to="/login" className="underline hover:text-stone-700">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
