import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClusterMapView } from './components/ClusterMapView';
import { NucleusDashboard } from './components/NucleusDashboard';
import { ActivityDetail } from './components/ActivityDetail';
import { IndividualProfile } from './components/IndividualProfile';
import { ActivityTypeReport } from './components/ActivityTypeReport';
import { ClusterProfile } from './components/ClusterProfile';
import { GrowthReport } from './components/GrowthReport';
import { UserGuide } from './components/UserGuide';
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ClusterMapView />} />
        <Route path="/guide" element={<UserGuide />} />
        <Route path="/nucleus/:id" element={<NucleusDashboard />} />
        <Route
          path="/nucleus/:nucleusId/activity/:activityId"
          element={<ActivityDetail />} />
        
        <Route path="/individual/:id" element={<IndividualProfile />} />
        <Route path="/report/:type" element={<ActivityTypeReport />} />
        <Route path="/cluster-profile" element={<ClusterProfile />} />
        <Route path="/growth-report" element={<GrowthReport />} />
        <Route
          path="/nucleus/:nucleusId/growth-report"
          element={<GrowthReport />} />
        
      </Routes>
    </BrowserRouter>);

}