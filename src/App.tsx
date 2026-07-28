import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { UnsavedChangesProvider } from './lib/unsavedChanges';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './components/LoginPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ForcedChangePasswordGate } from './components/ForcedChangePasswordGate';
import { PrivacyAcknowledgementGate } from './components/PrivacyAcknowledgementGate';
import { ClusterMapView } from './components/ClusterMapView';
import { SplashScreen } from './components/SplashScreen';
import { NucleusDashboard } from './components/NucleusDashboard';
import { ActivityDetail } from './components/ActivityDetail';
import { IndividualProfile } from './components/IndividualProfile';
import { ActivityTypeReport } from './components/ActivityTypeReport';
import { ClusterProfile } from './components/ClusterProfile';
import { ClusterLearningHub } from './components/ClusterLearningHub';
import { ClusterPeople } from './components/ClusterPeople';
import { GrowthReport } from './components/GrowthReport';
import { ClusterGrowthProfile } from './components/ClusterGrowthProfile';
import { UserGuide } from './components/UserGuide';
import { UserManagement } from './components/UserManagement';
import { AccountMenu } from './components/AccountMenu';
import { MobileLanding } from './components/MobileLanding';
import { MobileReports } from './components/MobileReports';
import { MobileTimeline } from './components/MobileTimeline';
import { MobileNetwork } from './components/MobileNetwork';
import { TimelineWorkspace } from './components/TimelineWorkspace';
import { NucleusTimeline } from './components/NucleusTimeline';
import { MilestonePage, MilestoneThreeRedirect } from './components/Milestone';
import { LsaHouseholdMapView } from './components/lsa/LsaHouseholdMapView';
import { useIsMobile } from './lib/useIsMobile';
import { getCallerContext } from './lib/db/users';
import {
  activityLeadActivityIds,
  collaboratorNucleusIds,
  isActivityLead,
  isClusterCoordinator,
  isLsaMemberOnly,
  isNucleusCollaborator,
  lsaMemberClusterIds,
} from './lib/permissions';
import { supabase } from './lib/supabase';

// Activity-Lead-only users (no global flag, no CC/NC grant) are confined
// to their own activity page and the individual profiles of its
// participants. Everything else redirects to their assigned activity.
// Returns:
//   ready = false  → still resolving caller context / nucleus lookup
//   ready = true, target = null → caller is NOT AL-only; render the normal app
//   ready = true, target = "/nucleus/.../activity/..." → render the restricted shell
function useActivityLeadOnlyTarget(): { ready: boolean; target: string | null } {
  const { user } = useAuth();
  const [state, setState] = useState<{ ready: boolean; target: string | null }>({
    ready: false,
    target: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ ready: true, target: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const ctx = await getCallerContext();
      if (cancelled) return;
      if (!ctx) { setState({ ready: true, target: null }); return; }

      const isALOnly =
        !ctx.isSuperAdmin && !ctx.isAdmin && !ctx.isRegionalViewer
        && !isClusterCoordinator(ctx) && !isNucleusCollaborator(ctx)
        && isActivityLead(ctx);
      if (!isALOnly) {
        setState({ ready: true, target: null });
        return;
      }

      const activityId = activityLeadActivityIds(ctx)[0];
      if (!activityId) { setState({ ready: true, target: null }); return; }

      const { data } = await supabase
        .from('activities')
        .select('nucleus_id')
        .eq('id', activityId)
        .maybeSingle();
      if (cancelled) return;
      const nucleusId = (data as any)?.nucleus_id;
      if (!nucleusId) { setState({ ready: true, target: null }); return; }

      setState({ ready: true, target: `/nucleus/${nucleusId}/activity/${activityId}` });
    })();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}

// Nucleus-Collaborator-only users (no global flag, no CC grant) are
// confined to their own nucleus — dashboard, timeline, its activities,
// individual profiles, and the per-nucleus growth report. They never
// see the cluster map. We only pin users with *exactly one* NC grant;
// multi-nucleus NCs (which today can only exist via direct DB grants,
// since the user-creation UI only assigns one nucleus) fall through to
// the normal shell so they have a place to choose between them.
function useNucleusCollaboratorOnlyTarget(): { ready: boolean; target: string | null } {
  const { user } = useAuth();
  const [state, setState] = useState<{ ready: boolean; target: string | null }>({
    ready: false,
    target: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ ready: true, target: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const ctx = await getCallerContext();
      if (cancelled) return;
      if (!ctx) { setState({ ready: true, target: null }); return; }

      const nucleusIds = collaboratorNucleusIds(ctx);
      const isNCOnly =
        !ctx.isSuperAdmin && !ctx.isAdmin && !ctx.isRegionalViewer
        && !isClusterCoordinator(ctx)
        && nucleusIds.length === 1;
      if (!isNCOnly) {
        setState({ ready: true, target: null });
        return;
      }
      setState({ ready: true, target: `/nucleus/${nucleusIds[0]}` });
    })();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}

// LSA-only users: pin them to their household map. They still get the toggle
// in the header to flip over to the community-building cluster view (read-only).
// Multi-cluster LSAs fall through — the household map's switcher handles them.
function useLsaOnlyTarget(): { ready: boolean; target: string | null } {
  const { user } = useAuth();
  const [state, setState] = useState<{ ready: boolean; target: string | null }>({
    ready: false,
    target: null,
  });
  useEffect(() => {
    if (!user) { setState({ ready: true, target: null }); return; }
    let cancelled = false;
    (async () => {
      const ctx = await getCallerContext();
      if (cancelled) return;
      if (!ctx || !isLsaMemberOnly(ctx)) { setState({ ready: true, target: null }); return; }
      const clusterIds = lsaMemberClusterIds(ctx);
      if (clusterIds.length !== 1) { setState({ ready: true, target: '/lsa/households' }); return; }
      setState({ ready: true, target: `/lsa/${clusterIds[0]}/households` });
    })();
    return () => { cancelled = true; };
  }, [user]);
  return state;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const { ready: alReady, target: alTarget } = useActivityLeadOnlyTarget();
  const { ready: ncReady, target: ncTarget } = useNucleusCollaboratorOnlyTarget();
  const { ready: lsaReady, target: lsaTarget } = useLsaOnlyTarget();
  // The nucleus dashboard / nucleus timeline render their own AccountMenu
  // inline in their compact header, so suppress the global floating chip
  // on those routes to avoid a duplicate avatar.
  const nucleusDetailRoute = /^\/nucleus\/[^/]+(?:\/timeline)?$/.test(location.pathname);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // Hold rendering until we know whether this user is AL-only or NC-only.
  // Otherwise the full app would flash on screen for a beat before the
  // redirect takes hold.
  if (!alReady || !ncReady || !lsaReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  // Activity-Lead-only users: pin them to their own activity page (and the
  // profiles of its participants). Every other route redirects back.
  if (alTarget) {
    return (
      <PrivacyAcknowledgementGate>
        {!isMobile && <AccountMenu />}
        <ForcedChangePasswordGate />
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/nucleus/:nucleusId/activity/:activityId" element={<ActivityDetail />} />
          <Route path="/individual/:id" element={<IndividualProfile />} />
          <Route path="*" element={<Navigate to={alTarget} replace />} />
        </Routes>
      </PrivacyAcknowledgementGate>
    );
  }

  // LSA-only users: pin them to their household map. The header toggle inside
  // LsaHouseholdMapView lets them flip to a read-only view of their cluster's
  // community-building data, so we let the normal cluster routes through too.
  if (lsaTarget) {
    return (
      <PrivacyAcknowledgementGate>
        {!isMobile && <AccountMenu />}
        <ForcedChangePasswordGate />
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/guide" element={<UserGuide />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/lsa/households" element={<LsaHouseholdMapView />} />
          <Route path="/lsa/:clusterId/households" element={<LsaHouseholdMapView />} />
          {/* Read-only community-building views in their cluster. */}
          <Route path="/" element={<ClusterMapView />} />
          <Route path="/map" element={<ClusterMapView />} />
          <Route path="/cluster-people" element={<ClusterPeople />} />
          <Route path="/learning-hub" element={<ClusterLearningHub />} />
          <Route path="/nucleus/:id" element={<NucleusDashboard />} />
          <Route path="/nucleus/:id/timeline" element={<NucleusTimeline />} />
          <Route path="/nucleus/:id/milestone" element={<MilestonePage />} />
          <Route path="/nucleus/:id/milestone-three" element={<MilestoneThreeRedirect />} />
          <Route path="/nucleus/:nucleusId/activity/:activityId" element={<ActivityDetail />} />
          <Route path="/individual/:id" element={<IndividualProfile />} />
          <Route path="*" element={<Navigate to={lsaTarget} replace />} />
        </Routes>
      </PrivacyAcknowledgementGate>
    );
  }

  // Nucleus-Collaborator-only users: pin them to their nucleus. They can
  // reach the dashboard, its timeline, its activities, individual
  // profiles, the per-nucleus growth report, the user guide, and
  // /users (where they're allowed to create Activity Leads for their
  // nucleus). Everything else (cluster map, cross-cluster reports)
  // redirects back to their nucleus dashboard.
  if (ncTarget) {
    return (
      <PrivacyAcknowledgementGate>
        {!isMobile && !nucleusDetailRoute && <AccountMenu />}
        <ForcedChangePasswordGate />
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/guide" element={<UserGuide />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/nucleus/:id" element={<NucleusDashboard />} />
          <Route path="/nucleus/:id/timeline" element={<NucleusTimeline />} />
          <Route path="/nucleus/:id/milestone" element={<MilestonePage />} />
          <Route path="/nucleus/:id/milestone-three" element={<MilestoneThreeRedirect />} />
          <Route path="/nucleus/:nucleusId/activity/:activityId" element={<ActivityDetail />} />
          <Route path="/nucleus/:nucleusId/growth-report" element={<GrowthReport />} />
          <Route path="/individual/:id" element={<IndividualProfile />} />
          <Route path="*" element={<Navigate to={ncTarget} replace />} />
        </Routes>
      </PrivacyAcknowledgementGate>
    );
  }

  // On mobile, the avatar lives in the mobile-landing header. The floating
  // chip is hidden on every mobile screen so it cannot overlap action
  // buttons (e.g. the "+ New Nucleus" button on the mobile map view).
  return (
    <PrivacyAcknowledgementGate>
      {!isMobile && !nucleusDetailRoute && <AccountMenu />}
      <ForcedChangePasswordGate />
      <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/" element={isMobile ? <MobileLanding /> : <ClusterMapView />} />
      <Route path="/map" element={<ClusterMapView />} />
      <Route path="/m/reports" element={<MobileReports />} />
      <Route path="/m/timeline" element={<MobileTimeline />} />
      <Route path="/m/network" element={<MobileNetwork />} />
      <Route path="/timeline" element={<TimelineWorkspace />} />
      <Route path="/guide" element={<UserGuide />} />
      <Route path="/nucleus/:id" element={<NucleusDashboard />} />
      <Route path="/nucleus/:id/timeline" element={<NucleusTimeline />} />
      <Route path="/nucleus/:id/milestone" element={<MilestonePage />} />
      <Route path="/nucleus/:id/milestone-three" element={<MilestoneThreeRedirect />} />
      <Route path="/nucleus/:nucleusId/activity/:activityId" element={<ActivityDetail />} />
      <Route path="/individual/:id" element={<IndividualProfile />} />
      <Route path="/report/:type" element={<ActivityTypeReport />} />
      <Route path="/cluster-profile" element={<ClusterProfile />} />
      <Route path="/cluster-people" element={<ClusterPeople />} />
      <Route path="/learning-hub" element={<ClusterLearningHub />} />
      <Route path="/growth-report" element={<GrowthReport />} />
      <Route path="/nucleus/:nucleusId/growth-report" element={<GrowthReport />} />
      <Route path="/cluster/:clusterId/cgp" element={<ClusterGrowthProfile />} />
      <Route path="/users" element={<UserManagement />} />
      <Route path="/lsa/households" element={<LsaHouseholdMapView />} />
      <Route path="/lsa/:clusterId/households" element={<LsaHouseholdMapView />} />
      </Routes>
    </PrivacyAcknowledgementGate>
  );
}

export function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AuthProvider>
        <BrowserRouter>
          <UnsavedChangesProvider>
            <AppRoutes />
          </UnsavedChangesProvider>
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}
