import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './components/LoginPage';
import { ClusterMapView } from './components/ClusterMapView';
import { SplashScreen } from './components/SplashScreen';
import { NucleusDashboard } from './components/NucleusDashboard';
import { ActivityDetail } from './components/ActivityDetail';
import { IndividualProfile } from './components/IndividualProfile';
import { ActivityTypeReport } from './components/ActivityTypeReport';
import { ClusterProfile } from './components/ClusterProfile';
import { GrowthReport } from './components/GrowthReport';
import { UserGuide } from './components/UserGuide';
import { UserManagement } from './components/UserManagement';
import { AccountMenu } from './components/AccountMenu';
import { MobileLanding } from './components/MobileLanding';
import { MobileReports } from './components/MobileReports';
import { useIsMobile } from './lib/useIsMobile';

function AppRoutes() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // The mobile landing renders its own inline account avatar, so the global
  // floating one would double up. Hide it only on that screen.
  const onMobileLanding = isMobile && location.pathname === '/';

  return (
    <>
      {!onMobileLanding && <AccountMenu />}
      <Routes>
      <Route path="/" element={isMobile ? <MobileLanding /> : <ClusterMapView />} />
      <Route path="/map" element={<ClusterMapView />} />
      <Route path="/m/reports" element={<MobileReports />} />
      <Route path="/guide" element={<UserGuide />} />
      <Route path="/nucleus/:id" element={<NucleusDashboard />} />
      <Route path="/nucleus/:nucleusId/activity/:activityId" element={<ActivityDetail />} />
      <Route path="/individual/:id" element={<IndividualProfile />} />
      <Route path="/report/:type" element={<ActivityTypeReport />} />
      <Route path="/cluster-profile" element={<ClusterProfile />} />
      <Route path="/growth-report" element={<GrowthReport />} />
      <Route path="/nucleus/:nucleusId/growth-report" element={<GrowthReport />} />
      <Route path="/users" element={<UserManagement />} />
      </Routes>
    </>
  );
}

export function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}
