import { supabase } from '../supabase';
import { actionPermission } from '../permissions';
import { getCallerContext } from './users';
import { computeComposite, type MilestoneStage } from '../milestoneThree';

// A single feature score as stored for a nucleus.
export interface MilestoneScore {
  featureKey: string;
  score: number;
  note: string;
}

export interface NucleusMilestoneThree {
  scores: MilestoneScore[];
  overallNote: string;
}

// Everything the nucleus editor needs: the per-feature scores/notes and
// the holistic overall note. Missing rows simply don't appear — the UI
// treats an absent feature as "not yet scored".
export async function fetchNucleusMilestoneThree(
  nucleusId: string,
): Promise<NucleusMilestoneThree> {
  const [scoresRes, noteRes] = await Promise.all([
    supabase
      .from('nucleus_milestone_three_scores')
      .select('feature_key, score, note')
      .eq('nucleus_id', nucleusId),
    supabase
      .from('nucleus_milestone_three')
      .select('overall_note')
      .eq('nucleus_id', nucleusId)
      .maybeSingle(),
  ]);
  if (scoresRes.error) throw scoresRes.error;
  if (noteRes.error) throw noteRes.error;

  const scores: MilestoneScore[] = ((scoresRes.data ?? []) as any[]).map(r => ({
    featureKey: r.feature_key,
    score: r.score,
    note: r.note ?? '',
  }));
  return {
    scores,
    overallNote: ((noteRes.data as any)?.overall_note ?? '') as string,
  };
}

// Upsert one feature's score + note for a nucleus. Stamps the editor
// and time so the strip can show "last updated".
export async function saveNucleusMilestoneScore(
  nucleusId: string,
  featureKey: string,
  score: number,
  note: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('nucleus_milestone_three_scores')
    .upsert(
      {
        nucleus_id: nucleusId,
        feature_key: featureKey,
        score,
        note: note.trim() ? note.trim() : null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nucleus_id,feature_key' },
    );
  if (error) throw error;
}

// Remove a feature score entirely (the collaborator cleared it back to
// "not yet scored" rather than 0).
export async function clearNucleusMilestoneScore(
  nucleusId: string,
  featureKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('nucleus_milestone_three_scores')
    .delete()
    .eq('nucleus_id', nucleusId)
    .eq('feature_key', featureKey);
  if (error) throw error;
}

// Upsert the holistic overall note for a nucleus.
export async function saveNucleusMilestoneOverallNote(
  nucleusId: string,
  note: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('nucleus_milestone_three')
    .upsert(
      {
        nucleus_id: nucleusId,
        overall_note: note.trim() ? note.trim() : null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nucleus_id' },
    );
  if (error) throw error;
}

// Whether the signed-in user may edit this nucleus's milestone data —
// the stage picker and, when applicable, the Milestone Three sliders.
// Same gate as editing the concentric circles (cluster coordinators
// and nucleus collaborators only), so the two stay in lock-step.
export async function canEditNucleusMilestone(
  nucleusId: string,
): Promise<boolean> {
  const ctx = await getCallerContext();
  if (!ctx) return false;
  const { data: nucleus } = await supabase
    .from('nuclei')
    .select('cluster_id')
    .eq('id', nucleusId)
    .single();
  if (!nucleus) return false;
  return actionPermission(ctx, 'edit_concentric_circles', {
    clusterId: (nucleus as any).cluster_id,
    nucleusId,
  }) === 'direct';
}

// The nucleus's current milestone stage. Defaults to 0 when no row
// exists yet (a nucleus that has never had its stage set).
export async function fetchNucleusMilestoneStage(
  nucleusId: string,
): Promise<MilestoneStage> {
  const { data, error } = await supabase
    .from('nucleus_milestone_stage')
    .select('stage')
    .eq('nucleus_id', nucleusId)
    .maybeSingle();
  if (error) throw error;
  return ((data as any)?.stage ?? 0) as MilestoneStage;
}

// Set the nucleus's milestone stage. Never touches the Milestone
// Three scores/note tables — those are preserved regardless of the
// current stage, so moving back to stage 3 restores them as-is.
export async function saveNucleusMilestoneStage(
  nucleusId: string,
  stage: MilestoneStage,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('nucleus_milestone_stage')
    .upsert(
      {
        nucleus_id: nucleusId,
        stage,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nucleus_id' },
    );
  if (error) throw error;
}

// Milestone stage per nucleus, for the cluster-level progress view.
// Nuclei with no stored stage default to 0.
export async function fetchMilestoneStagesForNuclei(
  nucleusIds: string[],
): Promise<Map<string, MilestoneStage>> {
  const result = new Map<string, MilestoneStage>();
  nucleusIds.forEach(id => result.set(id, 0));
  if (nucleusIds.length === 0) return result;

  const { data, error } = await supabase
    .from('nucleus_milestone_stage')
    .select('nucleus_id, stage')
    .in('nucleus_id', nucleusIds);
  if (error) throw error;

  for (const row of (data ?? []) as any[]) {
    result.set(row.nucleus_id, row.stage as MilestoneStage);
  }
  return result;
}

export interface NucleusComposite {
  /** Mean of recorded feature scores, or null when none recorded. */
  composite: number | null;
  /** How many of the features have a score. */
  scoredCount: number;
}

// Composite progress per nucleus, for the cluster-level view. Fetches
// all scores for the given nuclei in one query and folds them into a
// mean per nucleus. Nuclei with no scores are still present in the map
// with composite = null.
export async function fetchMilestoneCompositesForNuclei(
  nucleusIds: string[],
): Promise<Map<string, NucleusComposite>> {
  const result = new Map<string, NucleusComposite>();
  nucleusIds.forEach(id => result.set(id, { composite: null, scoredCount: 0 }));
  if (nucleusIds.length === 0) return result;

  const { data, error } = await supabase
    .from('nucleus_milestone_three_scores')
    .select('nucleus_id, score')
    .in('nucleus_id', nucleusIds);
  if (error) throw error;

  const byNucleus = new Map<string, number[]>();
  for (const row of (data ?? []) as any[]) {
    const arr = byNucleus.get(row.nucleus_id) ?? [];
    arr.push(row.score);
    byNucleus.set(row.nucleus_id, arr);
  }
  for (const [id, scores] of byNucleus) {
    result.set(id, {
      composite: computeComposite(scores.map(score => ({ score }))),
      scoredCount: scores.length,
    });
  }
  return result;
}
