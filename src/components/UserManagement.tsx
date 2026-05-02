import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserPlusIcon,
  ShieldIcon,
  UsersIcon,
  LoaderIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  fetchManagedUsers,
  getCallerContext,
  canCreateUsers,
  roleLabel,
  type ManagedUser,
  type CallerContext,
  type UserPermissionRow,
} from '../lib/db/users';
import { CreateUserModal } from './CreateUserModal';

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

function UserCard({ user }: { user: ManagedUser }) {
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
            <p className="text-xs text-gray-400 mt-0.5">
              Joined {new Date(user.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        {user.isAdmin && (
          <div className="flex items-center gap-1.5 flex-shrink-0 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-3 py-1">
            <ShieldIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">Admin</span>
          </div>
        )}
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

export function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ctx, userList] = await Promise.all([
        getCallerContext(),
        fetchManagedUsers(),
      ]);
      setCallerCtx(ctx);
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
            {/* Summary */}
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
                  <UserCard key={user.id} user={user} />
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
    </div>
  );
}
