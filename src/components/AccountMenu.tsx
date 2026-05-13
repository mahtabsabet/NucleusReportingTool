import React, { useEffect, useRef, useState } from 'react';
import { LogOutIcon, UserIcon, CameraIcon, KeyRoundIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  getCallerContext,
  fetchOwnProfileImageUrl,
  uploadOwnProfilePhoto,
  type CallerContext,
} from '../lib/db/users';
import { primaryRole, roleLabel, ROLE_BADGE_CLASSES } from '../lib/permissions';
import { ChangePasswordModal } from './ChangePasswordModal';

// Floating account chip available on every authenticated page.
// Shows the signed-in user's name, email, role, and a logout button.
// Mounted globally from App.tsx so we don't need to touch each page header.
//
// z-index note: the wrapper sits at z-[2000] so the dropdown stays above
// Leaflet's map controls (which use z-index: 1000); a lower value caused
// the menu to be hidden behind the map on the cluster map view.
//
// `inline` renders the menu in document flow (used by the mobile landing
// header) instead of as a floating chip. `buttonClassName` overrides the
// avatar trigger styling so callers can match local design (e.g. the blue
// avatar in the mobile landing header).
export interface AccountMenuProps {
  inline?: boolean;
  buttonClassName?: string;
}

export function AccountMenu({ inline = false, buttonClassName }: AccountMenuProps = {}) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<CallerContext | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChangedAt, setPasswordChangedAt] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCallerContext().then(c => { if (!cancelled) setCtx(c); });
    fetchOwnProfileImageUrl(user.id).then(url => { if (!cancelled) setPhotoUrl(url); });
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadOwnProfilePhoto(user.id, file);
      setPhotoUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset so picking the same file again still triggers onChange.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const wrapperClass = inline ? 'relative z-50' : 'fixed top-3 right-3 z-[2000]';
  const triggerClass = buttonClassName
    ?? 'w-10 h-10 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 hover:shadow-lg hover:border-gray-300 transition-all overflow-hidden';

  return (
    <div className={wrapperClass}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className={triggerClass}
        aria-label="Account menu"
        title="Account"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-6 h-6 text-gray-500" />
                )}
              </div>
              <label
                className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 hover:opacity-100 transition-opacity ${uploading ? 'opacity-100' : ''} cursor-pointer`}
                title={photoUrl ? 'Change photo' : 'Add photo'}
              >
                <CameraIcon className="w-4 h-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{profileName ?? '—'}</p>
              {user.email && (
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CameraIcon className="w-4 h-4" />
            {uploading ? 'Uploading…' : photoUrl ? 'Change Profile Photo' : 'Add Profile Photo'}
          </button>
          {uploadError && (
            <p className="text-xs text-red-600 mb-3">{uploadError}</p>
          )}

          {role && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-1.5">Role</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE_CLASSES[role] ?? 'bg-gray-100 text-gray-600'}`}>
                {roleLabel(role)}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowChangePassword(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors"
          >
            <KeyRoundIcon className="w-4 h-4" />
            Change Password
          </button>
          {passwordChangedAt && Date.now() - passwordChangedAt < 5000 && (
            <p className="text-xs text-emerald-600 mb-2 text-center">Password updated</p>
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

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onChanged={() => {
            setShowChangePassword(false);
            setPasswordChangedAt(Date.now());
          }}
        />
      )}
    </div>
  );
}
