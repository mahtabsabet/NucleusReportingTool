import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserPlusIcon,
  ShieldIcon,
  UsersIcon,
  LoaderIcon,
  RefreshCwIcon,
  Trash2Icon,
  PencilIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  KeyRoundIcon,
  MailIcon,
  EyeIcon,
  EyeOffIcon,
  ShieldCheckIcon,
  PlusIcon,
} from 'lucide-react';
import {
  fetchManagedUsers,
  fetchUserEmails,
  deleteUser,
  changeUserRole,
  addNucleusToCollaborator,
  adminResetUserPassword,
  getCallerContext,
  toUserSummary,
  fetchActivitiesForScope,
  type ManagedUser,
  type UserPermissionRow,
  type ScopeOption,
} from '../lib/db/users';
import { fetchClusters, fetchNuclei, type ClusterRow, type NucleusRow } from '../lib/db/clusters';
import { PASSWORD_MIN_LENGTH } from './ChangePasswordModal';
import {
  type CallerContext,
  type CreatableRole,
  ROLE_BADGE_CLASSES,
  canCreateUsers,
  canDeleteUserDirectly,
  canRequestDeleteUser,
  canChangeUserRoleDirectly,
  canResetUserPasswordDirectly,
  creatableRoles,
  highestRole,
  primaryRole,
  roleLabel,
  scopeRequirementFor,
} from '../lib/permissions';
import {
  fetchVisiblePermissionRequests,
  resolvePermissionRequest,
  submitPermissionRequest,
  type PermissionRequestRow,
} from '../lib/db/requests';
import { adminResetPrivacyAcknowledgement } from '../lib/db/privacy';
import { CreateUserModal } from './CreateUserModal';
import { GlobalSearch } from './GlobalSearch';

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE_CLASSES[role] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {roleLabel(role)}
    </span>
  );
}

function permissionDescription(perm: UserPermissionRow): string {
  if (perm.clusterName) return perm.clusterName + ' cluster';
  if (perm.nucleusName) return perm.nucleusName + ' nucleus';
  if (perm.activityName) return perm.activityName;
  if (perm.clusterId) return `Cluster ${perm.clusterId.slice(0, 8)}…`;
  if (perm.nucleusId) return `Nucleus ${perm.nucleusId.slice(0, 8)}…`;
  if (perm.activityId) return `Activity ${perm.activityId.slice(0, 8)}…`;
  return '';
}

// Roles offered when changing a user's role. Since the Change Role modal
// supports cross-scope-type replacements (a person can move from being an
// Activity Lead to a Nucleus Coordinator, for example — handled in the
// edge function as a delete-old + insert-new flow), we don't filter by
// the target's current scope here. ROLE_ASSIGNERS via creatableRoles is
// the only filter that applies: a CC may assign CC/NC/AL, an NC may
// assign AL, etc.
function roleOptionsForChange(
  ctx: CallerContext,
  _user: ManagedUser
): CreatableRole[] {
  return creatableRoles(ctx);
}

interface UserCardProps {
  user: ManagedUser;
  callerCtx: CallerContext;
  onDelete: (user: ManagedUser) => void;
  onChangeRole: (user: ManagedUser) => void;
  onAddNucleus: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResetPrivacyAck: (user: ManagedUser) => void;
  onRequestDelete: (user: ManagedUser) => void;
}

function UserCard({
  user, callerCtx, onDelete, onChangeRole, onAddNucleus, onResetPassword, onResetPrivacyAck, onRequestDelete,
}: UserCardProps) {
  const summary = toUserSummary(user);
  const directDelete = canDeleteUserDirectly(callerCtx, summary);
  const requestDelete = !directDelete && canRequestDeleteUser(callerCtx, summary);
  // Show the Change Role button if the caller could plausibly assign at
  // least one role to this target. Admin / Super Admin / CC / NC all
  // change roles directly (no request flow) — the edge function does the
  // authoritative scope check on save.
  const directChange =
    callerCtx.userId !== user.id
    && !summary.isSuperAdmin
    && (!summary.isAdmin || callerCtx.isSuperAdmin)
    && roleOptionsForChange(callerCtx, user).length > 0;
  // Show "Add nucleus" for existing nucleus collaborators when the caller
  // can assign the nucleus_collaborator role (admins + cluster coordinators).
  const canAddNucleus =
    callerCtx.userId !== user.id
    && !summary.isSuperAdmin
    && !summary.isAdmin
    && user.permissions.some(p => p.role === 'nucleus_collaborator')
    && (callerCtx.isSuperAdmin || callerCtx.isAdmin
        || callerCtx.grants.some(g => g.role === 'cluster_coordinator'));
  const directReset = canResetUserPasswordDirectly(callerCtx, summary);
  // Admins / Super Admins can force a user to re-acknowledge the policy.
  // Useful after handoff of a test account, or when an admin wants a
  // specific user to re-confirm without bumping the global version.
  const canResetPrivacyAck = (callerCtx.isAdmin || callerCtx.isSuperAdmin)
    && callerCtx.userId !== user.id;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-gray-600">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{user.name}</p>
            {user.email && (
              <p className="text-sm text-gray-600 truncate">{user.email}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              Joined {new Date(user.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
            {directChange && (
              <button
                onClick={() => onChangeRole(user)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Change role"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {canAddNucleus && (
              <button
                onClick={() => onAddNucleus(user)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                title="Add another nucleus"
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {directReset && (
              <button
                onClick={() => onResetPassword(user)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                title="Reset password"
              >
                <KeyRoundIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {canResetPrivacyAck && (
              <button
                onClick={() => onResetPrivacyAck(user)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                title="Require re-acknowledgement of the privacy & stewardship commitments"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {(directDelete || requestDelete) && (
              <button
                onClick={() => (directDelete ? onDelete(user) : onRequestDelete(user))}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title={directDelete ? 'Delete user' : 'Request user deletion'}
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            )}
        </div>
      </div>

      {/* All role badges live in a row below the header so they
          don't compete with the user's name for horizontal space —
          long names used to get truncated by Admin / Super Admin /
          Regional Viewer pills rendered up top. */}
      {(user.isSuperAdmin || user.isAdmin || user.isRegionalViewer || user.permissions.length > 0) && (
        <div className="mt-4 space-y-2">
          {user.isSuperAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-3 py-1">
                <ShieldIcon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">Super Admin</span>
              </div>
            </div>
          )}
          {!user.isSuperAdmin && user.isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
                <ShieldIcon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">Admin</span>
              </div>
            </div>
          )}
          {!user.isAdmin && user.isRegionalViewer && (
            <div className="flex items-center gap-2 flex-wrap">
              <RoleBadge role="regional_viewer" />
            </div>
          )}
          {!user.isAdmin && user.permissions.map(perm => {
            const scope = permissionDescription(perm);
            return (
              <div key={perm.id} className="flex items-center gap-2 flex-wrap">
                <RoleBadge role={perm.role} />
                {scope && (
                  <span className="text-xs text-gray-500">— {scope}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!user.isAdmin && !user.isRegionalViewer && user.permissions.length === 0 && (
        <p className="mt-3 text-xs text-gray-400 italic">No permissions assigned</p>
      )}
    </div>
  );
}

interface DeleteModalProps {
  user: ManagedUser;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteUserModal({ user, onClose, onDeleted }: DeleteModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await deleteUser(user.id, emailInput.trim());
      onDeleted();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Trash2Icon className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Delete User</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          This will permanently remove <strong>{user.name}</strong> from the system. Their person record will not be affected.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-1">
          <p className="text-sm font-mono font-semibold text-gray-900 break-all">{user.email}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">Type this email to confirm</p>
        <input
          type="text"
          value={emailInput}
          onChange={e => setEmailInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm mb-4"
          placeholder={user.email}
          autoFocus
          autoComplete="off"
        />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={emailInput.trim().toLowerCase() !== user.email.toLowerCase() || loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting…' : 'Delete User'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChangeRoleModalProps {
  user: ManagedUser;
  callerCtx: CallerContext;
  onClose: () => void;
  onChanged: () => void;
}

function ChangeRoleModal({ user, callerCtx, onClose, onChanged }: ChangeRoleModalProps) {
  const perm = user.permissions[0];
  // A user_permissions row pins one scope type, so changing to a scoped
  // role with a different scope means replacing the row, not editing it —
  // which the edge function and the scope picker below both handle. The
  // modal therefore offers every role the caller may assign, regardless
  // of the target's current role.
  const availableRoles = creatableRoles(callerCtx);
  // Scope type of the target's current permission, if any.
  const currentScopeType: 'cluster' | 'nucleus' | 'activity' | 'none' =
    perm?.clusterId ? 'cluster'
    : perm?.nucleusId ? 'nucleus'
    : perm?.activityId ? 'activity'
    : 'none';
  const initial: CreatableRole = (
    user.isAdmin ? 'admin'
    : user.isRegionalViewer ? 'regional_viewer'
    : (perm?.role as CreatableRole | undefined) ?? availableRoles[0] ?? 'activity_lead'
  );
  const [selectedRole, setSelectedRole] = useState<CreatableRole>(initial);
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Scope picker — shown when the chosen scoped role needs a different
  // scope than the target currently has (a global user moving to any
  // scoped role, or a scoped user moving to a different scope type). The
  // cluster→nucleus→activity dropdowns cascade like the Create User modal.
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedNucleusId, setSelectedNucleusId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [activities, setActivities] = useState<ScopeOption[]>([]);

  const scopeNeed = scopeRequirementFor(selectedRole);
  // Show the scope picker whenever the new role needs a scope AND either:
  //   - the current row's scope type doesn't match (the row needs creating
  //     in a different table column), OR
  //   - the role itself is changing (the existing user_permissions row
  //     gets replaced, so a fresh scope choice is required even when the
  //     two roles share the same scope type — e.g. lsa_member → cluster_
  //     coordinator are both cluster-scoped but bind to different roles
  //     and shouldn't silently reuse the LSA grant's cluster).
  const needsScopePicker =
    scopeNeed !== 'none'
    && (scopeNeed !== currentScopeType || selectedRole !== perm?.role);
  // Cluster, nucleus and activity scopes all start from a cluster.
  const needsCluster = needsScopePicker;
  const needsNucleus = needsScopePicker && (scopeNeed === 'nucleus' || scopeNeed === 'activity');
  const needsActivity = needsScopePicker && scopeNeed === 'activity';

  const currentRole = user.isAdmin ? 'admin' : user.isRegionalViewer ? 'regional_viewer' : perm?.role;
  const unchanged = selectedRole === currentRole;
  const emailMatches = emailInput.trim().toLowerCase() === user.email.toLowerCase();
  const scopeComplete =
    scopeNeed === 'cluster' ? !!selectedClusterId
    : scopeNeed === 'nucleus' ? !!selectedNucleusId
    : scopeNeed === 'activity' ? !!selectedActivityId
    : true;

  // Reset scope selections whenever the chosen role changes.
  useEffect(() => {
    setSelectedClusterId('');
    setSelectedNucleusId('');
    setSelectedActivityId('');
    setNuclei([]);
    setActivities([]);
  }, [selectedRole]);

  // Load clusters once a scoped role is selected for a global user.
  useEffect(() => {
    if (!needsCluster) return;
    fetchClusters()
      .then(setClusters)
      .catch(() => setError('Failed to load clusters'));
  }, [needsCluster]);

  // Load nuclei for the chosen cluster.
  useEffect(() => {
    if (!needsNucleus || !selectedClusterId) {
      setNuclei([]);
      return;
    }
    fetchNuclei(selectedClusterId)
      .then(setNuclei)
      .catch(() => setError('Failed to load nuclei'));
  }, [selectedClusterId, needsNucleus]);

  // Load activities for the chosen nucleus.
  useEffect(() => {
    if (!needsActivity || !selectedNucleusId) {
      setActivities([]);
      return;
    }
    fetchActivitiesForScope(selectedNucleusId)
      .then(setActivities)
      .catch(() => setError('Failed to load activities'));
  }, [selectedNucleusId, needsActivity]);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await changeUserRole({
        targetUserId: user.id,
        newRole: selectedRole,
        confirmedEmail: emailInput.trim(),
        // permissionId updates an existing scoped row in place; it's absent
        // for a global user, which tells the edge function to create a new
        // scoped row from the ids below.
        permissionId: (selectedRole === 'admin' || selectedRole === 'regional_viewer')
          ? undefined
          : perm?.id,
        clusterId: needsScopePicker && scopeNeed === 'cluster' ? selectedClusterId : undefined,
        nucleusId: needsScopePicker && scopeNeed === 'nucleus' ? selectedNucleusId : undefined,
        activityId: needsScopePicker && scopeNeed === 'activity' ? selectedActivityId : undefined,
      });
      onChanged();
    } catch (err: any) {
      setError(err.message ?? 'Failed to change role');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <PencilIcon className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Change Role</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Changing role for <strong>{user.name}</strong>
          {perm && (
            <span className="text-gray-500"> ({permissionDescription(perm)})</span>
          )}
          .
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New role</label>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value as CreatableRole)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
          >
            {availableRoles.map(r => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        </div>

        {/* Scope picker — shown when moving a global user to a scoped role. */}
        {needsCluster && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cluster</label>
            <select
              value={selectedClusterId}
              onChange={e => { setSelectedClusterId(e.target.value); setSelectedNucleusId(''); setSelectedActivityId(''); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              <option value="">Select a cluster…</option>
              {clusters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {needsNucleus && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nucleus</label>
            <select
              value={selectedNucleusId}
              onChange={e => { setSelectedNucleusId(e.target.value); setSelectedActivityId(''); }}
              disabled={!selectedClusterId}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{selectedClusterId ? 'Select a nucleus…' : 'Select a cluster first…'}</option>
              {nuclei.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        )}
        {needsActivity && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity</label>
            <select
              value={selectedActivityId}
              onChange={e => setSelectedActivityId(e.target.value)}
              disabled={!selectedNucleusId}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{selectedNucleusId ? 'Select an activity…' : 'Select a nucleus first…'}</option>
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-1">
          <p className="text-sm font-mono font-semibold text-gray-900 break-all">{user.email}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">Type this email to confirm</p>
        <input
          type="text"
          value={emailInput}
          onChange={e => setEmailInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mb-4"
          placeholder={user.email}
          autoFocus
          autoComplete="off"
        />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={unchanged || !emailMatches || loading || (needsScopePicker && !scopeComplete)}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Change Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResetPasswordModalProps {
  user: ManagedUser;
  onClose: () => void;
  onReset: () => void;
}

function ResetPasswordModal({ user, onClose, onReset }: ResetPasswordModalProps) {
  const [mode, setMode] = useState<'email' | 'temporary'>('email');
  const [tempPassword, setTempPassword] = useState('');
  const [showTemp, setShowTemp] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailMatches = emailInput.trim().toLowerCase() === user.email.toLowerCase();
  const tempValid = mode === 'email' || tempPassword.length >= PASSWORD_MIN_LENGTH;
  const canSubmit = emailMatches && tempValid && !loading;

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await adminResetUserPassword({
        targetUserId: user.id,
        confirmedEmail: emailInput.trim(),
        mode,
        temporaryPassword: mode === 'temporary' ? tempPassword : undefined,
      });
      onReset();
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <KeyRoundIcon className="w-5 h-5 text-amber-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Reset Password</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Reset the password for <strong>{user.name}</strong>.
        </p>

        <div className="space-y-2 mb-4">
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="reset-mode"
              checked={mode === 'email'}
              onChange={() => setMode('email')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <MailIcon className="w-4 h-4 text-gray-500" />
                Send reset email
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                The user gets a one-time link to set their own password. Recommended.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="reset-mode"
              checked={mode === 'temporary'}
              onChange={() => setMode('temporary')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <KeyRoundIcon className="w-4 h-4 text-gray-500" />
                Set a temporary password
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Share the temp password out-of-band; the user is forced to change it on next login.
              </p>
            </div>
          </label>
        </div>

        {mode === 'temporary' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Temporary password</label>
            <div className="relative">
              <input
                type={showTemp ? 'text' : 'password'}
                value={tempPassword}
                onChange={e => setTempPassword(e.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                placeholder={`Min. ${PASSWORD_MIN_LENGTH} characters`}
                autoComplete="new-password"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowTemp(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showTemp ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-1">
          <p className="text-sm font-mono font-semibold text-gray-900 break-all">{user.email}</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">Type this email to confirm</p>
        <input
          type="text"
          value={emailInput}
          onChange={e => setEmailInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm mb-4"
          placeholder={user.email}
          autoComplete="off"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-medium rounded-xl hover:bg-amber-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Working…' : mode === 'email' ? 'Send Reset Email' : 'Set Temporary Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResetPrivacyAckModalProps {
  user: ManagedUser;
  onClose: () => void;
  onReset: () => void;
}

function ResetPrivacyAckModal({ user, onClose, onReset }: ResetPrivacyAckModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await adminResetPrivacyAcknowledgement(user.id);
      onReset();
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset acknowledgement');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Require re-acknowledgement</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Next time <strong>{user.name}</strong> opens the app, they will be
          asked again to confirm the privacy and information stewardship
          commitments. Their previous acknowledgements are kept in the audit
          history.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Use this after handing off a test account, after a policy clarification,
          or any time you want a specific user to re-confirm.
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Working…' : 'Reset acknowledgement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Lightweight "submit a request" modal used by Cluster/Nucleus Coordinators.
// The reviewer's resolution UI is deliberately minimal here — the planned
// Data Review / Hygiene interface is the eventual home for this flow.
interface RequestModalProps {
  user: ManagedUser;
  action: 'delete' | 'change_role';
  callerCtx: CallerContext;
  onClose: () => void;
  onSubmitted: () => void;
}

function RequestUserActionModal({ user, action, callerCtx, onClose, onSubmitted }: RequestModalProps) {
  const [note, setNote] = useState('');
  const [newRole, setNewRole] = useState<CreatableRole | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableRoles = action === 'change_role' ? roleOptionsForChange(callerCtx, user) : [];
  const perm = user.permissions[0];

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await submitPermissionRequest({
        targetType: action === 'delete' ? 'user' : 'user_permission',
        targetId: action === 'delete' ? user.id : (perm?.id ?? user.id),
        action: action === 'delete' ? 'delete' : 'change_role',
        note: note.trim() || undefined,
        payload: action === 'change_role' && newRole
          ? { newRole, targetUserId: user.id, permissionId: perm?.id }
          : { targetUserId: user.id },
        clusterId: perm?.clusterId ?? null,
        nucleusId: perm?.nucleusId ?? null,
        activityId: perm?.activityId ?? null,
      });
      onSubmitted();
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  const valid = action === 'delete' ? true : newRole !== '';

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <ClockIcon className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Request {action === 'delete' ? 'User Deletion' : 'Role Change'}
          </h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          You don’t have permission to {action === 'delete' ? 'delete' : 'change the role of'} <strong>{user.name}</strong> directly.
          Submit a request and an Administrator will review it.
        </p>
        {action === 'change_role' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Requested new role</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as CreatableRole | '')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              <option value="">Select a role…</option>
              {availableRoles.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>
        )}
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none mb-4"
          placeholder="Add context for the reviewer…"
        />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid || loading}
            className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-medium rounded-xl hover:bg-amber-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddNucleusModalProps {
  user: ManagedUser;
  callerCtx: CallerContext;
  onClose: () => void;
  onAdded: () => void;
}

function AddNucleusModal({ user, callerCtx, onClose, onAdded }: AddNucleusModalProps) {
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedNucleusId, setSelectedNucleusId] = useState('');
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assignedNucleusIds = new Set(user.permissions.map(p => p.nucleusId).filter(Boolean));

  useEffect(() => {
    fetchClusters()
      .then(setClusters)
      .catch(() => setError('Failed to load clusters'));
  }, []);

  useEffect(() => {
    if (!selectedClusterId) { setNuclei([]); return; }
    fetchNuclei(selectedClusterId)
      .then(setNuclei)
      .catch(() => setError('Failed to load nuclei'));
  }, [selectedClusterId]);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await addNucleusToCollaborator(user.id, selectedNucleusId);
      onAdded();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add nucleus');
    } finally {
      setLoading(false);
    }
  }

  const availableNuclei = nuclei.filter(n => !assignedNucleusIds.has(n.id));

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
            <PlusIcon className="w-5 h-5 text-emerald-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Add Nucleus</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Assign <strong>{user.name}</strong> as Nucleus Coordinator for an additional nucleus.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Cluster</label>
          <select
            value={selectedClusterId}
            onChange={e => { setSelectedClusterId(e.target.value); setSelectedNucleusId(''); }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none"
          >
            <option value="">Select a cluster…</option>
            {clusters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nucleus</label>
          <select
            value={selectedNucleusId}
            onChange={e => setSelectedNucleusId(e.target.value)}
            disabled={!selectedClusterId}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{selectedClusterId ? (availableNuclei.length === 0 && nuclei.length > 0 ? 'All nuclei already assigned' : 'Select a nucleus…') : 'Select a cluster first…'}</option>
            {availableNuclei.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedNucleusId || loading}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Adding…' : 'Add Nucleus'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Pending-requests strip shown to reviewers (Admins / Super Admins / CCs
// for their cluster). This is intentionally minimal — full review tools
// live in the upcoming Data Review / Hygiene interface.
function PendingRequestsPanel({ callerCtx, refreshKey }: { callerCtx: CallerContext; refreshKey: number }) {
  const [requests, setRequests] = useState<PermissionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchVisiblePermissionRequests({ status: 'pending', limit: 25 });
      setRequests(rows);
    } catch {
      // RLS may legitimately return nothing — silent fail is acceptable for the panel.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  if (!callerCtx.isAdmin && !callerCtx.isSuperAdmin
      && !callerCtx.grants.some(g => g.role === 'cluster_coordinator')) {
    return null;
  }

  if (!loading && requests.length === 0) return null;

  async function resolve(id: string, status: 'approved' | 'rejected') {
    setBusyId(id);
    try {
      await resolvePermissionRequest(id, status);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClockIcon className="w-4 h-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-900">Pending Requests</h2>
        <span className="text-xs text-amber-700">({requests.length})</span>
      </div>
      <ul className="space-y-2">
        {requests.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-amber-100 px-3 py-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-gray-900 truncate">
                {r.requesterName ?? 'Someone'} requested <span className="font-semibold">{r.action.replace('_', ' ')}</span> on <span className="font-mono text-xs">{r.targetType}</span>
              </p>
              {r.note && (
                <p className="text-xs text-gray-500 truncate">“{r.note}”</p>
              )}
              <p className="text-xs text-gray-400">
                {new Date(r.requestedAt).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => resolve(r.id, 'approved')}
                disabled={busyId === r.id}
                className="w-7 h-7 flex items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                title="Mark approved (action must still be taken manually)"
              >
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => resolve(r.id, 'rejected')}
                disabled={busyId === r.id}
                className="w-7 h-7 flex items-center justify-center rounded-md text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                title="Reject"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-700/80">
        Marking a request approved/rejected only updates the request status. The actual change must still be made through the relevant action — full workflow lands with the Data Review interface.
      </p>
    </div>
  );
}

export function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [pendingChangeRole, setPendingChangeRole] = useState<ManagedUser | null>(null);
  const [pendingAddNucleus, setPendingAddNucleus] = useState<ManagedUser | null>(null);
  const [pendingReset, setPendingReset] = useState<ManagedUser | null>(null);
  const [pendingPrivacyReset, setPendingPrivacyReset] = useState<ManagedUser | null>(null);
  const [resetSuccessName, setResetSuccessName] = useState<string | null>(null);
  const [privacyResetSuccessName, setPrivacyResetSuccessName] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ user: ManagedUser; action: 'delete' | 'change_role' } | null>(null);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ctx, userList] = await Promise.all([
        getCallerContext(),
        fetchManagedUsers(),
      ]);
      setCallerCtx(ctx);

      // Email enrichment requires the service role.  Allowed for both
      // admins and coordinators (the manage-user fn enforces the gate).
      if (ctx) {
        try {
          const emails = await fetchUserEmails();
          for (const u of userList) {
            u.email = emails[u.id] ?? '';
          }
        } catch {
          // Non-fatal — emails just won't render for users that can't fetch them.
        }
      }

      setUsers(userList);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const canCreate = callerCtx ? canCreateUsers(callerCtx) : false;
  const callerRoleLabel = callerCtx ? roleLabel(primaryRole(callerCtx)) : '';

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Manage Users</h1>
            <p className="text-xs font-medium text-gray-500 hidden sm:block">
              {callerRoleLabel ? `Signed in as ${callerRoleLabel}` : 'Create and view system users'}
            </p>
          </div>
        </div>
        <div className="hidden md:block flex-1 max-w-sm mx-4">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 text-sm transition-colors shadow-sm"
            >
              <UserPlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Create User</span>
            </button>
          )}
        </div>
      </header>

      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2">
        <GlobalSearch />
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-red-700 font-medium">{error}</p>
            <button
              onClick={load}
              className="mt-3 text-sm text-red-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && callerCtx && (
          <>
            <PendingRequestsPanel callerCtx={callerCtx} refreshKey={requestsRefreshKey} />

            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {users.length === 1 ? '1 user' : `${users.length} users`} visible to you
              </p>
            </div>

            {users.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
                <UsersIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No users found</p>
                {canCreate && (
                  <p className="text-sm text-gray-400 mt-1">
                    Click "Create User" to add someone.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {users.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    callerCtx={callerCtx}
                    onDelete={u => setPendingDelete(u)}
                    onChangeRole={u => setPendingChangeRole(u)}
                    onAddNucleus={u => setPendingAddNucleus(u)}
                    onResetPassword={u => setPendingReset(u)}
                    onResetPrivacyAck={u => setPendingPrivacyReset(u)}
                    onRequestDelete={u => setPendingRequest({ user: u, action: 'delete' })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showCreate && callerCtx && (
        <CreateUserModal
          callerCtx={callerCtx}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {pendingDelete && (
        <DeleteUserModal
          user={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => { setPendingDelete(null); load(); }}
        />
      )}

      {pendingChangeRole && callerCtx && (
        <ChangeRoleModal
          user={pendingChangeRole}
          callerCtx={callerCtx}
          onClose={() => setPendingChangeRole(null)}
          onChanged={() => { setPendingChangeRole(null); load(); }}
        />
      )}

      {pendingAddNucleus && callerCtx && (
        <AddNucleusModal
          user={pendingAddNucleus}
          callerCtx={callerCtx}
          onClose={() => setPendingAddNucleus(null)}
          onAdded={() => { setPendingAddNucleus(null); load(); }}
        />
      )}

      {pendingReset && (
        <ResetPasswordModal
          user={pendingReset}
          onClose={() => setPendingReset(null)}
          onReset={() => {
            setResetSuccessName(pendingReset.name);
            setPendingReset(null);
            setTimeout(() => setResetSuccessName(null), 5000);
          }}
        />
      )}

      {resetSuccessName && (
        <div className="fixed bottom-6 right-6 z-[2500] bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-lg px-4 py-3">
          Password reset triggered for {resetSuccessName}
        </div>
      )}

      {pendingPrivacyReset && (
        <ResetPrivacyAckModal
          user={pendingPrivacyReset}
          onClose={() => setPendingPrivacyReset(null)}
          onReset={() => {
            setPrivacyResetSuccessName(pendingPrivacyReset.name);
            setPendingPrivacyReset(null);
            setTimeout(() => setPrivacyResetSuccessName(null), 5000);
          }}
        />
      )}

      {privacyResetSuccessName && (
        <div className="fixed bottom-6 right-6 z-[2500] bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-lg px-4 py-3">
          {privacyResetSuccessName} will be asked to re-acknowledge on next load
        </div>
      )}

      {pendingRequest && callerCtx && (
        <RequestUserActionModal
          user={pendingRequest.user}
          action={pendingRequest.action}
          callerCtx={callerCtx}
          onClose={() => setPendingRequest(null)}
          onSubmitted={() => { setPendingRequest(null); setRequestsRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
