// The page for an activity. Activities in a nucleus live under the
// nucleus; standalone ones (no nucleus) have their own top-level route.
export function activityPath(activity: { id: string; nucleusId?: string | null }): string {
  return activity.nucleusId
    ? `/nucleus/${activity.nucleusId}/activity/${activity.id}`
    : `/activity/${activity.id}`;
}
