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
} from 'lucide-react';
import {
  fetchManagedUsers,
  fetchUserEmails,
  deleteUser,
  changeUserRole,
  getCallerContext,
  canCreateUsers,
  roleLabel,
  type ManagedUser,
  type CallerContext,
  type UserPermissionRow,
  type CreatableRole,
} from '../lib/db/users';
import { CreateUserModal } from './CreateUserModal';
import { GlobalSearch } from './GlobalSearch';

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800',
    cluster_coordinator: 'bg-blue-100 text-blue-800',
    nucleus_collaborator: 'bg-emerald-100 text-emerald-800',
    activity_lead: 'bg-amber-100 text-amber-800',
    viewer: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {roleLabel(role as any)}
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

function rolesForPermission(perm: UserPermissionRow): CreatableRole[] {
  if (perm.clusterId) return ['cluster_coordinator', 'viewer'];
  if (perm.nucleusId) return ['nucleus_collaborator', 'viewer'];
  return ['activity_lead', 'viewer'];
}

interface UserCardProps {
  user: ManagedUser;
  callerCtx: CallerContext | null;
  onDelete: (user: ManagedUser) => void;
  onChangeRole: (user: ManagedUser) => void;
}

function UserCard({ user, callerCtx, onDelete, onChangeRole }: UserCardProps) {
  const isAdmin = callerCtx?.isAdmin ?? false;
  const isSelf = callerCtx?.userId === user.id;
  const canAct = isAdmin && !isSelf;
  // Change role only for non-admin users with exactly one permission
  const canChangeRole = canAct && !user.isAdmin && user.permissions.length === 1;

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
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {user.isAdmin && (
            <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
              <ShieldIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Admin</span>
            </div>
          )}
          {canAct && (
            <div className="flex items-center gap-1">
              {canChangeRole && (
                <button
                  onClick={() => onChangeRole(user)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Change role"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(user)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete user"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {!user.isAdmin && user.permissions.length > 0 && (
        <div className="mt-4 space-y-2">
          {user.permissions.map(perm => {
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

      {!user.isAdmin && user.permissions.length === 0 && (
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
  onClose: () => void;
  onChanged: () => void;
}

function ChangeRoleModal({ user, onClose, onChanged }: ChangeRoleModalProps) {
  const perm = user.permissions[0];
  const availableRoles: CreatableRole[] = perm
    ? ([...rolesForPermission(perm), 'admin'] as CreatableRole[])
    : ['admin'];
  const [selectedRole, setSelectedRole] = useState<CreatableRole>(perm?.role ?? 'admin');
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unchanged = selectedRole === perm?.role;
  const emailMatches = emailInput.trim().toLowerCase() === user.email.toLowerCase();

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await changeUserRole({
        targetUserId: user.id,
        newRole: selectedRole,
        confirmedEmail: emailInput.trim(),
        permissionId: selectedRole !== 'admin' ? perm?.id : undefined,
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
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
            disabled={unchanged || !emailMatches || loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Change Role'}
          </button>
        </div>
      </div>
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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ctx, userList] = await Promise.all([
        getCallerContext(),
        fetchManagedUsers(),
      ]);
      setCallerCtx(ctx);

      // Enrich with emails for admins (requires service role via edge function)
      if (ctx?.isAdmin) {
        const emails = await fetchUserEmails();
        for (const u of userList) {
          u.email = emails[u.id] ?? '';
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

  function handleCreated() {
    setShowCreate(false);
    load();
  }

  function handleDeleted() {
    setPendingDelete(null);
    load();
  }

  function handleRoleChanged() {
    setPendingChangeRole(null);
    load();
  }

  // Guard: enforce that self-actions are blocked even if UI is bypassed
  function handleDeleteRequest(user: ManagedUser) {
    if (!callerCtx?.isAdmin || user.id === callerCtx.userId) return;
    setPendingDelete(user);
  }

  function handleChangeRoleRequest(user: ManagedUser) {
    if (!callerCtx?.isAdmin || user.id === callerCtx.userId || user.isAdmin) return;
    if (user.permissions.length !== 1) return;
    setPendingChangeRole(user);
  }

  const canCreate = callerCtx ? canCreateUsers(callerCtx) : false;

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
              Create and view system users
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

        {!loading && !error && (
          <>
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
                    onDelete={handleDeleteRequest}
                    onChangeRole={handleChangeRoleRequest}
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
          onCreated={handleCreated}
        />
      )}

      {pendingDelete && (
        <DeleteUserModal
          user={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={handleDeleted}
        />
      )}

      {pendingChangeRole && (
        <ChangeRoleModal
          user={pendingChangeRole}
          onClose={() => setPendingChangeRole(null)}
          onChanged={handleRoleChanged}
        />
      )}
    </div>
  );
}
