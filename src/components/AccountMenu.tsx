import React, { useEffect, useRef, useState } from 'react';
import { LogOutIcon, UserIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getCallerContext, type CallerContext } from '../lib/db/users';
import { primaryRole, roleLabel, ROLE_BADGE_CLASSES } from '../lib/permissions';

// Floating account chip available on every authenticated page.
// Shows the signed-in user's name, email, role, and a logout button.
// Mounted globally from App.tsx so we don't need to touch each page header.
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<CallerContext | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCallerContext().then(c => { if (!cancelled) setCtx(c); });
    // Display name from user_metadata if present, otherwise fall back to
    // email prefix.  Profile name is loaded lazily inside getCallerContext's
    // calls, but we don't have it here — derive a friendly fallback.
    const meta = (user.user_metadata as Record<string, unknown> | null) ?? null;
    const name = (meta && typeof meta.name === 'string') ? meta.name : null;
    setProfileName(name ?? (user.email ? user.email.split('@')[0] : null));
    return () => { cancelled = true; };
  }, [user]);

  // Close the popover when clicking outside or pressing escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const role = ctx ? primaryRole(ctx) : null;
  const initial = (profileName ?? user.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="fixed top-3 right-3 z-40">
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 hover:shadow-lg hover:border-gray-300 transition-all"
        aria-label="Account menu"
        title="Account"
      >
        {initial}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{profileName ?? '—'}</p>
              {user.email && (
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              )}
            </div>
          </div>

          {role && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-1.5">Role</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE_CLASSES[role] ?? 'bg-gray-100 text-gray-600'}`}>
                {roleLabel(role)}
              </span>
            </div>
          )}

          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-xl text-sm transition-colors"
          >
            <LogOutIcon className="w-4 h-4" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
