import { supabase } from '../supabase';
import type { PermissionRole } from '../database.types';

export type CreatableRole = 'admin' | PermissionRole;

export interface ScopeOption {
  id: string;
  name: string;
}

export interface UserPermissionRow {
  id: string;
  role: PermissionRole;
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
  isAdmin: boolean;
  createdAt: string;
  permissions: UserPermissionRow[];
}

export interface CallerContext {
  userId: string;
  isAdmin: boolean;
  isClusterCoordinator: boolean;
  isNucleusCollaborator: boolean;
  coordinatorClusterIds: string[];
  collaboratorNucleusIds: string[];
}

export async function getCallerContext(): Promise<CallerContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  const { data: perms } = await supabase
    .from('user_permissions')
    .select('role, cluster_id, nucleus_id')
    .eq('user_id', user.id);

  const permList = (perms as any[]) ?? [];
  const isAdmin = (profile as any)?.is_admin ?? false;
  const ccPerms = permList.filter(p => p.role === 'cluster_coordinator');
  const ncPerms = permList.filter(p => p.role === 'nucleus_collaborator');

  return {
    userId: user.id,
    isAdmin,
    isClusterCoordinator: ccPerms.length > 0,
    isNucleusCollaborator: ncPerms.length > 0,
    coordinatorClusterIds: ccPerms.map(p => p.cluster_id).filter(Boolean),
    collaboratorNucleusIds: ncPerms.map(p => p.nucleus_id).filter(Boolean),
  };
}

export function canCreateUsers(ctx: CallerContext): boolean {
  return ctx.isAdmin || ctx.isClusterCoordinator || ctx.isNucleusCollaborator;
}

export function creatableRoles(ctx: CallerContext): CreatableRole[] {
  if (ctx.isAdmin) return ['admin', 'cluster_coordinator', 'nucleus_collaborator', 'activity_lead'];
  if (ctx.isClusterCoordinator) return ['cluster_coordinator', 'nucleus_collaborator', 'activity_lead'];
  if (ctx.isNucleusCollaborator) return ['activity_lead'];
  return [];
}

export function roleLabel(role: CreatableRole): string {
  const labels: Record<CreatableRole, string> = {
    admin: 'Administrator',
    cluster_coordinator: 'Cluster Coordinator',
    nucleus_collaborator: 'Nucleus Coordinator',
    activity_lead: 'Activity Lead',
    viewer: 'Viewer',
  };
  return labels[role] ?? role;
}

export async function fetchManagedUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, name, is_admin, created_at,
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
    isAdmin: p.is_admin,
    createdAt: p.created_at,
    permissions: ((p.user_permissions ?? []) as any[]).map((up: any) => ({
      id: up.id,
      role: up.role as PermissionRole,
      clusterId: up.cluster_id,
      clusterName: up.clusters?.name ?? null,
      nucleusId: up.nucleus_id,
      nucleusName: up.nuclei?.name ?? null,
      activityId: up.activity_id,
      activityName: up.activities?.name ?? null,
    })),
  }));
}

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
