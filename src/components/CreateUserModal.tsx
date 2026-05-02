import React, { useState, useEffect } from 'react';
import { XIcon, UserPlusIcon, EyeIcon, EyeOffIcon, LoaderIcon } from 'lucide-react';
import {
  createUser,
  creatableRoles,
  roleLabel,
  fetchActivitiesForScope,
  type CallerContext,
  type CreatableRole,
  type ScopeOption,
} from '../lib/db/users';
import { fetchClusters, fetchNuclei, type ClusterRow, type NucleusRow } from '../lib/db/clusters';

interface Props {
  callerCtx: CallerContext;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateUserModal({ callerCtx, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<CreatableRole | ''>('');
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedNucleusId, setSelectedNucleusId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');

  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [activities, setActivities] = useState<ScopeOption[]>([]);

  const [loadingClusters, setLoadingClusters] = useState(false);
  const [loadingNuclei, setLoadingNuclei] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableRoles = creatableRoles(callerCtx);

  const needsCluster = role === 'cluster_coordinator' || role === 'nucleus_collaborator' || role === 'activity_lead';
  const needsNucleus = role === 'nucleus_collaborator' || role === 'activity_lead';
  const needsActivity = role === 'activity_lead';

  // Load clusters when role requires one
  useEffect(() => {
    if (!needsCluster) return;
    setLoadingClusters(true);
    fetchClusters()
      .then(setClusters)
      .catch(() => setError('Failed to load clusters'))
      .finally(() => setLoadingClusters(false));
  }, [needsCluster]);

  // Load nuclei when cluster is selected
  useEffect(() => {
    if (!needsNucleus || !selectedClusterId) {
      setNuclei([]);
      return;
    }
    setLoadingNuclei(true);
    setSelectedNucleusId('');
    setSelectedActivityId('');
    fetchNuclei(selectedClusterId)
      .then(setNuclei)
      .catch(() => setError('Failed to load nuclei'))
      .finally(() => setLoadingNuclei(false));
  }, [selectedClusterId, needsNucleus]);

  // Load activities when nucleus is selected
  useEffect(() => {
    if (!needsActivity || !selectedNucleusId) {
      setActivities([]);
      return;
    }
    setLoadingActivities(true);
    setSelectedActivityId('');
    fetchActivitiesForScope(selectedNucleusId)
      .then(setActivities)
      .catch(() => setError('Failed to load activities'))
      .finally(() => setLoadingActivities(false));
  }, [selectedNucleusId, needsActivity]);

  function handleRoleChange(newRole: CreatableRole | '') {
    setRole(newRole);
    setSelectedClusterId('');
    setSelectedNucleusId('');
    setSelectedActivityId('');
    setNuclei([]);
    setActivities([]);
    setError(null);
  }

  function handleClusterChange(clusterId: string) {
    setSelectedClusterId(clusterId);
    setSelectedNucleusId('');
    setSelectedActivityId('');
  }

  function handleNucleusChange(nucleusId: string) {
    setSelectedNucleusId(nucleusId);
    setSelectedActivityId('');
  }

  function isFormValid(): boolean {
    if (!name.trim() || !email.trim() || !password.trim() || !role) return false;
    if (needsCluster && !selectedClusterId) return false;
    if (needsNucleus && !selectedNucleusId) return false;
    if (needsActivity && !selectedActivityId) return false;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid() || !role) return;
    setError(null);
    setSubmitting(true);
    try {
      await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        clusterId: selectedClusterId || undefined,
        nucleusId: selectedNucleusId || undefined,
        activityId: selectedActivityId || undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserPlusIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Create New User</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Role */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
            <select
              value={role}
              onChange={e => handleRoleChange(e.target.value as CreatableRole | '')}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Select a role…</option>
              {availableRoles.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>

          {/* Cluster scope */}
          {needsCluster && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cluster</label>
              {loadingClusters ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                  <LoaderIcon className="w-4 h-4 animate-spin" /> Loading clusters…
                </div>
              ) : (
                <select
                  value={selectedClusterId}
                  onChange={e => handleClusterChange(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Select a cluster…</option>
                  {clusters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Nucleus scope */}
          {needsNucleus && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nucleus</label>
              {loadingNuclei ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                  <LoaderIcon className="w-4 h-4 animate-spin" /> Loading nuclei…
                </div>
              ) : (
                <select
                  value={selectedNucleusId}
                  onChange={e => handleNucleusChange(e.target.value)}
                  required
                  disabled={!selectedClusterId}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!selectedClusterId ? 'Select a cluster first…' : 'Select a nucleus…'}
                  </option>
                  {nuclei.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Activity scope */}
          {needsActivity && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Activity</label>
              {loadingActivities ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                  <LoaderIcon className="w-4 h-4 animate-spin" /> Loading activities…
                </div>
              ) : (
                <select
                  value={selectedActivityId}
                  onChange={e => setSelectedActivityId(e.target.value)}
                  required
                  disabled={!selectedNucleusId}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!selectedNucleusId ? 'Select a nucleus first…' : 'Select an activity…'}
                  </option>
                  {activities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="new-user-name">
                Full Name
              </label>
              <input
                id="new-user-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="new-user-email">
                Email Address
              </label>
              <input
                id="new-user-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="jane@example.com"
                autoComplete="off"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="new-user-password">
                Temporary Password
              </label>
              <div className="relative">
                <input
                  id="new-user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOffIcon className="w-4 h-4" />
                    : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">The user can change this after signing in.</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-4 h-4" />
                  Create User
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
