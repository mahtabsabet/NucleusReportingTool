import { supabase } from '../supabase';
import type { PermissionRequestStatus } from '../database.types';

// Lightweight client for the permission_requests table. Mirrors the
// "Request Only" cells in the permissions table.  The full review UI
// lives in the planned Data Review / Hygiene module — this file only
// covers submission, listing, and resolution primitives.

export type PermissionRequestTargetType =
  | 'person'
  | 'activity'
  | 'nucleus'
  | 'user'
  | 'user_permission';

export type PermissionRequestAction =
  | 'delete'
  | 'change_role'
  | 'demote';

export interface SubmitRequestParams {
  targetType: PermissionRequestTargetType;
  targetId?: string | null;
  action: PermissionRequestAction;
  note?: string;
  payload?: Record<string, unknown>;
  // Scope hints — improves routing and lets RLS scope reviewer access
  // without re-deriving from the target. At least one is recommended.
  clusterId?: string | null;
  nucleusId?: string | null;
  activityId?: string | null;
}

export interface PermissionRequestRow {
  id: string;
  targetType: string;
  targetId: string | null;
  action: string;
  note: string | null;
  payload: Record<string, unknown> | null;
  clusterId: string | null;
  nucleusId: string | null;
  activityId: string | null;
  requestedBy: string | null;
  requesterName?: string;
  requestedAt: string;
  status: PermissionRequestStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export async function submitPermissionRequest(p: SubmitRequestParams): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('permission_requests')
    .insert({
      target_type: p.targetType,
      target_id: p.targetId ?? null,
      action: p.action,
      note: p.note ?? null,
      payload: p.payload ?? null,
      cluster_id: p.clusterId ?? null,
      nucleus_id: p.nucleusId ?? null,
      activity_id: p.activityId ?? null,
      requested_by: user.id,
    } as any)
    .select('id')
    .single();
  if (error) throw error;

  // Best-effort audit trail — non-blocking.
  try {
    await supabase.from('event_log').insert({
      type: 'permission_request_submitted' as any,
      cluster_id: p.clusterId ?? null,
      nucleus_id: p.nucleusId ?? null,
      activity_id: p.activityId ?? null,
      person_id: p.targetType === 'person' ? p.targetId ?? null : null,
      user_id: user.id,
      description: `Requested ${p.action} on ${p.targetType}`,
      details: { targetType: p.targetType, targetId: p.targetId, action: p.action, payload: p.payload, note: p.note },
    });
  } catch {
    // ignore — audit log is best-effort
  }

  return (data as any).id as string;
}

// Loads requests visible to the caller.  RLS handles the filtering.
export async function fetchVisiblePermissionRequests(opts?: {
  status?: PermissionRequestStatus;
  limit?: number;
}): Promise<PermissionRequestRow[]> {
  let q = supabase
    .from('permission_requests')
    .select(`
      id, target_type, target_id, action, note, payload,
      cluster_id, nucleus_id, activity_id,
      requested_by, requested_at, status,
      resolved_by, resolved_at, resolution_note
    `)
    .order('requested_at', { ascending: false });

  if (opts?.status) q = q.eq('status', opts.status);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data as any[]) ?? [];
  // Pull requester names in a separate query — keeps PostgREST joins simple.
  const requesterIds = Array.from(new Set(rows.map(r => r.requested_by).filter(Boolean)));
  const nameMap: Record<string, string> = {};
  if (requesterIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', requesterIds);
    ((profs ?? []) as any[]).forEach(p => { nameMap[p.id] = p.name; });
  }

  return rows.map(r => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    action: r.action,
    note: r.note,
    payload: r.payload,
    clusterId: r.cluster_id,
    nucleusId: r.nucleus_id,
    activityId: r.activity_id,
    requestedBy: r.requested_by,
    requesterName: r.requested_by ? nameMap[r.requested_by] : undefined,
    requestedAt: r.requested_at,
    status: r.status as PermissionRequestStatus,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    resolutionNote: r.resolution_note,
  }));
}

export async function resolvePermissionRequest(
  id: string,
  status: 'approved' | 'rejected' | 'cancelled',
  note?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('permission_requests')
    .update({
      status,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    } as any)
    .eq('id', id);
  if (error) throw error;

  try {
    await supabase.from('event_log').insert({
      type: 'permission_request_resolved' as any,
      user_id: user.id,
      description: `Permission request ${status}`,
      details: { requestId: id, status, note },
    });
  } catch {
    // ignore
  }
}
