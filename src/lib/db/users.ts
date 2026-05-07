import { supabase } from '../supabase';
import {
  type CallerContext,
  type CreatableRole,
  type ManagedUserSummary,
  type PermissionGrant,
  type ScopedRole,
  canCreateUsers as canCreateUsersCentral,
  creatableRoles as creatableRolesCentral,
  scopeRequirementFor,
  roleLabel as roleLabelCentral,
  highestRole,
} from '../permissions';

// Re-export the central types/helpers so existing imports continue to work.
export type { CallerContext, CreatableRole };
export { creatableRolesCentral as creatableRoles, canCreateUsersCentral as canCreateUsers };
export const roleLabel = (r: CreatableRole | string) => roleLabelCentral(r);

export interface ScopeOption {
  id: string;
  name: string;
}

export interface UserPermissionRow {
  id: string;
  role: ScopedRole;
  clusterId: string | null;
  clusterName: string | null;
  nucleusId: string | null;
  nucleusName: string | null;
  activityId: string | null;
  activityName: string | null;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isRegionalViewer: boolean;
  createdAt: string;
  permissions: UserPermissionRow[];
}

// Convert a ManagedUser into the lightweight summary the central
// safeguards module accepts.
export function toUserSummary(u: ManagedUser): ManagedUserSummary {
  return {
    id: u.id,
    isSuperAdmin: u.isSuperAdmin,
    isAdmin: u.isAdmin,
    isRegionalViewer: u.isRegionalViewer,
    grants: u.permissions.map<PermissionGrant>(p => ({
      role: p.role,
      clusterId: p.clusterId,
      nucleusId: p.nucleusId,
      activityId: p.activityId,
    })),
  };
}

export async function getCallerContext(): Promise<CallerContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_super_admin, is_regional_viewer')
    .eq('id', user.id)
    .single();

  const { data: perms } = await supabase
    .from('user_permissions')
    .select('role, cluster_id, nucleus_id, activity_id')
    .eq('user_id', user.id);

  const p = (profile as any) ?? {};
  const grants: PermissionGrant[] = ((perms as any[]) ?? []).map(r => ({
    role: r.role as ScopedRole,
    clusterId: r.cluster_id ?? null,
    nucleusId: r.nucleus_id ?? null,
    activityId: r.activity_id ?? null,
  }));

  return {
    userId: user.id,
    isSuperAdmin: p.is_super_admin === true,
    isAdmin: p.is_admin === true || p.is_super_admin === true,
    isRegionalViewer: p.is_regional_viewer === true,
    grants,
  };
}

export async function fetchManagedUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, name, is_admin, is_super_admin, is_regional_viewer, created_at,
      user_permissions(
        id, role, cluster_id, nucleus_id, activity_id,
        clusters(name),
        nuclei(name),
        activities(name)
      )
    `)
    .order('name');
  if (error) throw error;

  return (data as any[]).map(p => ({
    id: p.id,
    name: p.name,
    email: '',
    isAdmin: p.is_admin === true || p.is_super_admin === true,
    isSuperAdmin: p.is_super_admin === true,
    isRegionalViewer: p.is_regional_viewer === true,
    createdAt: p.created_at,
    permissions: ((p.user_permissions ?? []) as any[]).map((up: any) => ({
      id: up.id,
      role: up.role as ScopedRole,
      clusterId: up.cluster_id,
      clusterName: up.clusters?.name ?? null,
      nucleusId: up.nucleus_id,
      nucleusName: up.nuclei?.name ?? null,
      activityId: up.activity_id,
      activityName: up.activities?.name ?? null,
    })),
  }));
}

// Loads activities visible to the caller within a given nucleus.
export async function fetchActivitiesForScope(nucleusId: string): Promise<ScopeOption[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, name')
    .eq('nucleus_id', nucleusId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data as any[]).map(a => ({ id: a.id, name: a.name }));
}

export interface CreateUserParams {
  name: string;
  email: string;
  password: string;
  role: CreatableRole;
  clusterId?: string;
  nucleusId?: string;
  activityId?: string;
}

export async function createUser(params: CreateUserParams): Promise<void> {
  // Client-side guard mirrors the table — the edge function performs
  // the authoritative check, but failing here gives a faster + clearer
  // error if the form ever gets out of sync with the central rules.
  const need = scopeRequirementFor(params.role);
  if (need === 'cluster' && !params.clusterId) throw new Error('A cluster must be selected.');
  if (need === 'nucleus' && !params.nucleusId) throw new Error('A nucleus must be selected.');
  if (need === 'activity' && !params.activityId) throw new Error('An activity must be selected.');

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      name: params.name,
      email: params.email,
      password: params.password,
      role: params.role,
      clusterId: params.clusterId,
      nucleusId: params.nucleusId,
      activityId: params.activityId,
    },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

export async function fetchUserEmails(): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'list-emails' },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.emails ?? {}) as Record<string, string>;
}

export async function deleteUser(targetUserId: string, confirmedEmail: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'delete', targetUserId, confirmedEmail },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

export interface ChangeRoleParams {
  targetUserId: string;
  newRole: CreatableRole;
  confirmedEmail: string;
  permissionId?: string;
}

export async function changeUserRole(params: ChangeRoleParams): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: {
      action: 'change-role',
      targetUserId: params.targetUserId,
      newRole: params.newRole,
      confirmedEmail: params.confirmedEmail,
      permissionId: params.permissionId,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

// Convenience re-export for UIs.
export { highestRole };

// Returns the signed-in user's profile_image_url, or null if not set.
export async function fetchOwnProfileImageUrl(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('profile_image_url')
    .eq('id', userId)
    .single();
  return ((data as any)?.profile_image_url as string | null) ?? null;
}

// Uploads a profile photo for the signed-in user, reusing the `profile-photos`
// bucket used by persons. Files are stored under `users/{userId}.{ext}` to
// avoid colliding with person photos at the bucket root, and the resulting
// public URL is written to profiles.profile_image_url.
export async function uploadOwnProfilePhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `users/${userId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  // Append a cache-busting query so the browser refreshes after re-upload
  // (the path is stable across uploads of the same extension).
  const url = `${data.publicUrl}?v=${Date.now()}`;
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ profile_image_url: url })
    .eq('id', userId)
    .select('id');
  if (updateError) throw updateError;
  if (!updated?.length) throw new Error('profile_image_url update matched 0 rows — check profiles RLS update policy');
  return url;
}
