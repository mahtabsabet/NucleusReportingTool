import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON as GeoJSONLayer,
  useMap,
  useMapEvents } from
'react-leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPinIcon,
  XIcon,
  PlusIcon,
  CheckIcon,
  InfoIcon,
  GlobeIcon,
  UsersIcon,
  BookOpenIcon,
  HeartIcon,
  MenuIcon,
  TrendingUpIcon,
  MapIcon,
  CalendarIcon,
  HelpCircleIcon,
  NetworkIcon,
  UserPlusIcon,
  ArrowLeftIcon,
  LayersIcon,
  ChevronDownIcon } from
'lucide-react';
import { useIsMobile } from '../lib/useIsMobile';
import { fetchClusters, fetchNuclei, createNucleus, canCreateNucleusInCluster } from '../lib/db/clusters';
import type { ClusterRow, NucleusRow } from '../lib/db/clusters';
import { getCallerContext, canCreateUsers } from '../lib/db/users';
import { canCreateAnyNucleus } from '../lib/permissions';
import { NetworkView } from './NetworkView';
import { GlobalSearch } from './GlobalSearch';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});
function MapController({
  center,
  zoom



}: {center: [number, number];zoom: number;}) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}
function MapClickHandler({
  isPlacing,
  onLocationSelect



}: {isPlacing: boolean;onLocationSelect: (lat: number, lng: number) => void;}) {
  useMapEvents({
    click(e) {
      if (isPlacing) {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}
export function ClusterMapView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [selectedNucleus, setSelectedNucleus] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([52.5, -114.0]);
  const [mapZoom, setMapZoom] = useState(6);
  const [isPlacing, setIsPlacing] = useState(false);
  const [newLocation, setNewLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [boundariesData, setBoundariesData] = useState<any | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [canCreateAnyCluster, setCanCreateAnyCluster] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [showSelectClusterMessage, setShowSelectClusterMessage] = useState(false);
  const [clustersListOpen, setClustersListOpen] = useState(false);
  const [nucleiListOpen, setNucleiListOpen] = useState(false);

  useEffect(() => {
    const initialClusterId = searchParams.get('cluster');
    const initialView = searchParams.get('view');
    Promise.all([fetchClusters(), fetchNuclei(), getCallerContext()])
      .then(([c, n, ctx]) => {
        setClusters(c);
        setNuclei(n);
        if (ctx) {
          setCanManageUsers(canCreateUsers(ctx));
          setCanCreateAnyCluster(canCreateAnyNucleus(ctx));
        }
        if (initialClusterId) {
          const cluster = c.find(cl => cl.id === initialClusterId);
          if (cluster) {
            setSelectedCluster(cluster.id);
            setMapCenter([cluster.center.lat, cluster.center.lng]);
            setMapZoom(cluster.zoom);
            canCreateNucleusInCluster(cluster.id).then(setCanCreate);
          }
        }
        // Legacy deep-link `?view=timeline`: redirect into the new
        // full-page Timeline workspace, preserving the cluster scope.
        if (initialView === 'timeline') {
          const target = initialClusterId
            ? `/timeline?cluster=${initialClusterId}`
            : '/timeline';
          navigate(target, { replace: true });
          return;
        }
        if (initialView === 'network') setShowNetwork(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showBoundaries || boundariesData) return;
    fetch('/data/alberta-clusters.geojson')
      .then((r) => r.json())
      .then(setBoundariesData)
      .catch((err) => console.error('Failed to load cluster boundaries', err));
  }, [showBoundaries, boundariesData]);

  const filteredNuclei = selectedCluster
    ? nuclei.filter(n => n.clusterId === selectedCluster)
    : nuclei;
  const selectedClusterName = selectedCluster
    ? clusters.find((c) => c.id === selectedCluster)?.name ?? null
    : null;
  const handleClusterSelect = (clusterId: string | null) => {
    if (isPlacing) return;
    setSelectedCluster(clusterId);
    setSelectedNucleus(null);
    setClustersListOpen(false);
    if (clusterId) {
      const cluster = clusters.find(c => c.id === clusterId);
      if (cluster) {
        setMapCenter([cluster.center.lat, cluster.center.lng]);
        setMapZoom(cluster.zoom);
      }
      canCreateNucleusInCluster(clusterId).then(setCanCreate);
    } else {
      setMapCenter([52.5, -114.0]);
      setMapZoom(6);
      setCanCreate(false);
    }
  };

  const handleNucleusClick = (nucleusId: string) => {
    if (isPlacing) return;
    const nucleus = nuclei.find(n => n.id === nucleusId);
    if (nucleus) {
      setMapCenter([nucleus.location.lat, nucleus.location.lng]);
      setMapZoom(13);
      setSelectedNucleus(nucleusId);
      setNucleiListOpen(false);
    }
  };
  const handleStartPlacing = () => {
    setIsPlacing(true);
    setNewLocation(null);
    setNewName('');
    setSelectedNucleus(null);
  };
  const handleNewNucleusClick = () => {
    if (!canCreate) {
      setShowSelectClusterMessage(true);
      window.setTimeout(() => setShowSelectClusterMessage(false), 4000);
      return;
    }
    handleStartPlacing();
  };
  const handleCancelPlacing = () => {
    setIsPlacing(false);
    setNewLocation(null);
    setNewName('');
  };
  const handleCreateNucleus = async () => {
    if (!newLocation || !newName.trim() || !selectedCluster) return;
    const nucleus = await createNucleus({
      clusterId: selectedCluster,
      name: newName.trim(),
      lat: newLocation.lat,
      lng: newLocation.lng,
    });
    setNuclei(prev => [...prev, nucleus]);
    setIsPlacing(false);
    setNewLocation(null);
    setNewName('');
    setSelectedNucleus(nucleus.id);
    setMapCenter([newLocation.lat, newLocation.lng]);
    setMapZoom(13);
  };

  const currentClusterName = selectedCluster
    ? clusters.find(c => c.id === selectedCluster)?.name
    : null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between z-10 relative shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {isMobile ? (
            <button
              onClick={() => navigate('/')}
              aria-label="Back to home"
              className="w-10 h-10 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden w-10 h-10 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors">
              <MenuIcon className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md hidden sm:flex">
            <MapPinIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
              {currentClusterName ?
              `${currentClusterName} Cluster` :
              isMobile ? 'Map View' : 'Nucleus Reporting Tool'}
            </h1>
            <p className="text-xs sm:text-sm font-medium text-gray-500 hidden sm:block">
              {currentClusterName ?
              'Cluster Overview' :
              'Regional Overview — Alberta'}
            </p>
          </div>
        </div>
        {!isMobile && (
          <div className="hidden md:block flex-1 max-w-md mx-4">
            <GlobalSearch />
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isMobile && (
            <>
              <button
                onClick={() => setShowNetwork(!showNetwork)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border ${showNetwork ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                <NetworkIcon
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${showNetwork ? 'text-indigo-600' : 'text-gray-500'}`} />
                <span className="hidden sm:inline">Network</span>
              </button>

              <button
                onClick={() => navigate(
                  selectedCluster
                    ? `/timeline?cluster=${selectedCluster}`
                    : '/timeline'
                )}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                title="Open the full-page timeline workspace">
                <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                <span className="hidden sm:inline">Timeline</span>
              </button>

              <button
                onClick={() => setShowBoundaries(!showBoundaries)}
                title="Toggle cluster boundaries"
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border ${showBoundaries ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                <LayersIcon
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${showBoundaries ? 'text-indigo-600' : 'text-gray-500'}`} />
                <span className="hidden sm:inline">Boundaries</span>
              </button>

              <button
                onClick={() => navigate('/guide')}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                title="User Guide">
                <HelpCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                <span className="hidden sm:inline">Guide</span>
              </button>
            </>
          )}

          {!isPlacing && canCreateAnyCluster &&
          <button
            onClick={handleNewNucleusClick}
            aria-disabled={!canCreate}
            title={!canCreate ? 'Select a cluster first to add a nucleus' : ''}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white font-semibold rounded-xl transition-all duration-200 text-xs sm:text-sm flex-shrink-0 ${canCreate ? 'hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5' : 'opacity-50 cursor-not-allowed'}`}>

              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New Nucleus</span>
            </button>
          }
        </div>
      </header>

      {!isMobile && (
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2">
          <GlobalSearch />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative flex-col lg:flex-row">
        {/* Mobile sidebar overlay (desktop-narrow viewports only — hidden on the
            mobile breakpoint since the mobile landing replaces this navigation). */}
        {sidebarOpen && !isMobile &&
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)} />

        }
        {!isMobile && <aside
          className={`bg-white border-r border-gray-200 overflow-y-auto shadow-sm flex flex-col transition-transform duration-300 ease-in-out z-30 fixed lg:relative inset-y-0 left-0 w-80 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          
          {/* Close button for mobile */}
          <div className="lg:hidden flex justify-end p-3 border-b border-gray-100">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Clusters Section */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              Clusters
            </h2>
            <button
              onClick={() => setClustersListOpen((v) => !v)}
              disabled={isPlacing}
              aria-expanded={clustersListOpen}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 text-left border ${selectedCluster === null ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-blue-50 text-blue-900 border-blue-100 shadow-sm'} ${isPlacing ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}>

              <div className="flex items-center gap-3 min-w-0">
                {selectedCluster === null ? (
                  <GlobeIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
                ) : (
                  <MapIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                )}
                <span className="font-semibold truncate">
                  {currentClusterName ?? 'All Clusters'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${selectedCluster === null ? 'bg-gray-800 text-gray-300' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedCluster === null
                    ? nuclei.length
                    : nuclei.filter(n => n.clusterId === selectedCluster).length}
                </span>
                <ChevronDownIcon
                  className={`w-4 h-4 transition-transform ${clustersListOpen ? 'rotate-180' : ''} ${selectedCluster === null ? 'text-gray-300' : 'text-blue-700'}`} />
              </div>
            </button>

            {clustersListOpen && (
              <div className="space-y-1.5 mt-2 max-h-72 overflow-y-auto pr-1">
                <button
                  onClick={() => handleClusterSelect(null)}
                  disabled={isPlacing}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 text-left ${selectedCluster === null ? 'bg-gray-900 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'} ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>

                  <div className="flex items-center gap-3">
                    <GlobeIcon
                      className={`w-5 h-5 ${selectedCluster === null ? 'text-gray-300' : 'text-gray-400'}`} />

                    <span className="font-semibold">All Clusters</span>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${selectedCluster === null ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>

                    {nuclei.length}
                  </span>
                </button>

                {clusters.map((cluster) => {
                  const count = nuclei.filter(n => n.clusterId === cluster.id).length;
                  return (
                    <button
                      key={cluster.id}
                      onClick={() => handleClusterSelect(cluster.id)}
                      disabled={isPlacing}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 text-left ${selectedCluster === cluster.id ? 'bg-blue-50 text-blue-900 shadow-sm' : 'hover:bg-gray-50 text-gray-700'} ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>

                      <div className="flex items-center gap-3">
                        <MapIcon
                          className={`w-5 h-5 ${selectedCluster === cluster.id ? 'text-blue-500' : 'text-gray-400'}`} />

                        <span className="font-semibold">{cluster.name}</span>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${selectedCluster === cluster.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>

                        {count}
                      </span>
                    </button>);

                })}
              </div>
            )}
          </div>

          {/* Reports Section */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              {selectedCluster ? 'Cluster Reports' : 'Regional Reports'}
            </h2>
            <div className="space-y-2">
              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/cluster-profile?cluster=${selectedCluster}` :
                  '/cluster-profile'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-blue-50 text-gray-700 hover:text-blue-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <GlobeIcon className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">
                  {selectedCluster ? 'Cluster Profile' : 'Regional Profile'}
                </span>
              </button>

              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/growth-report?cluster=${selectedCluster}` :
                  '/growth-report'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-emerald-50 text-gray-700 hover:text-emerald-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <TrendingUpIcon className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold">Growth Report</span>
              </button>

              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/report/children-class?cluster=${selectedCluster}` :
                  '/report/children-class'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-emerald-50 text-gray-700 hover:text-emerald-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <UsersIcon className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold text-sm">
                  Children's Classes
                </span>
              </button>

              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/report/junior-youth?cluster=${selectedCluster}` :
                  '/report/junior-youth'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-amber-50 text-gray-700 hover:text-amber-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <UsersIcon className="w-5 h-5 text-amber-500" />
                <span className="font-semibold text-sm">
                  Junior Youth Groups
                </span>
              </button>

              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/report/study-circle?cluster=${selectedCluster}` :
                  '/report/study-circle'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-purple-50 text-gray-700 hover:text-purple-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <BookOpenIcon className="w-5 h-5 text-purple-500" />
                <span className="font-semibold text-sm">Study Circles</span>
              </button>

              <button
                onClick={() =>
                navigate(
                  selectedCluster ?
                  `/report/devotional?cluster=${selectedCluster}` :
                  '/report/devotional'
                )
                }
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-rose-50 text-gray-700 hover:text-rose-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                
                <HeartIcon className="w-5 h-5 text-rose-500" />
                <span className="font-semibold text-sm">Devotionals</span>
              </button>
            </div>
          </div>

          {canManageUsers && (
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Administration
              </h2>
              <button
                onClick={() => navigate('/users')}
                disabled={isPlacing}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-indigo-50 text-gray-700 hover:text-indigo-900 ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <UserPlusIcon className="w-5 h-5 text-indigo-500" />
                <span className="font-semibold">Manage Users</span>
              </button>
            </div>
          )}

          <div className="p-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              Nuclei
            </h2>
            <button
              onClick={() => setNucleiListOpen((v) => !v)}
              disabled={isPlacing || filteredNuclei.length === 0}
              aria-expanded={nucleiListOpen}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 text-left border ${selectedNucleus ? 'bg-blue-50 text-blue-900 border-blue-100 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'} ${isPlacing || filteredNuclei.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>

              <div className="flex items-center gap-3 min-w-0">
                <MapPinIcon
                  className={`w-5 h-5 flex-shrink-0 ${selectedNucleus ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="font-semibold truncate">
                  {selectedNucleus
                    ? filteredNuclei.find(n => n.id === selectedNucleus)?.name ?? 'Select a nucleus'
                    : 'Select a nucleus'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${selectedNucleus ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {filteredNuclei.length}
                </span>
                <ChevronDownIcon
                  className={`w-4 h-4 transition-transform ${nucleiListOpen ? 'rotate-180' : ''} ${selectedNucleus ? 'text-blue-700' : 'text-gray-400'}`} />
              </div>
            </button>

            {nucleiListOpen && filteredNuclei.length > 0 && (
              <div className="space-y-1.5 mt-2 max-h-96 overflow-y-auto pr-1">
                {filteredNuclei.map((nucleus) =>
                <button
                  key={nucleus.id}
                  onClick={() => handleNucleusClick(nucleus.id)}
                  disabled={isPlacing}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left relative overflow-hidden ${selectedNucleus === nucleus.id ? 'bg-blue-50/80 text-blue-900 shadow-sm' : 'hover:bg-gray-50 text-gray-700'} ${isPlacing ? 'opacity-50 cursor-not-allowed' : ''}`}>

                    {selectedNucleus === nucleus.id &&
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />
                  }
                    <MapPinIcon
                    className={`w-5 h-5 flex-shrink-0 transition-colors ${selectedNucleus === nucleus.id ? 'text-blue-600' : 'text-gray-400'}`} />

                    <span
                    className={`font-semibold ${selectedNucleus === nucleus.id ? 'text-blue-900' : 'text-gray-700'}`}>

                      {nucleus.name}
                    </span>
                  </button>
                )}
              </div>
            )}

            {filteredNuclei.length === 0 && (
              <p className="text-sm text-gray-400 mt-3">
                {selectedCluster ? 'No nuclei in this cluster yet.' : 'No nuclei to display.'}
              </p>
            )}
          </div>
        </aside>}

        <main className="flex-1 relative flex flex-col min-w-0">
          {/* Select-a-cluster prompt — shown when the user taps "New Nucleus"
              without a cluster selected (or without permission for the
              selected one). Auto-dismisses. */}
          {showSelectClusterMessage &&
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50/95 backdrop-blur-md rounded-2xl shadow-xl border border-amber-200/70 p-4 sm:p-5 w-[min(440px,calc(100vw-2rem))] animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <InfoIcon className="w-5 h-5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-amber-900 text-sm sm:text-base">Please select a cluster</h3>
                  <p className="text-xs sm:text-sm font-medium text-amber-800 mt-0.5">
                    <span className="sm:hidden">
                      Go back to the home screen to choose a cluster, then return here to create a nucleus.
                    </span>
                    <span className="hidden sm:inline">
                      Pick a cluster from the sidebar to create a nucleus in it.
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setShowSelectClusterMessage(false)}
                  aria-label="Dismiss"
                  className="text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-full p-1 transition-colors flex-shrink-0">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          }
          {/* Placing Mode Banner */}
          {isPlacing &&
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-blue-200/60 p-5 w-[min(480px,calc(100vw-2rem))] animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <MapPinIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Place New Nucleus</h3>
                  <p className="text-sm font-medium text-gray-500">
                    {!newLocation ?
                  'Click anywhere on the map to set location' :
                  'Enter a name and save'}
                  </p>
                </div>
              </div>

              {newLocation &&
            <div className="space-y-4">
                  <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter nucleus name..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium shadow-sm"
                autoFocus />
              
                  <div className="flex gap-3">
                    <button
                  onClick={handleCancelPlacing}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-semibold transition-colors">
                  
                      Cancel
                    </button>
                    <button
                  onClick={handleCreateNucleus}
                  disabled={!newName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2">
                  
                      <CheckIcon className="w-4 h-4" />
                      Create Nucleus
                    </button>
                  </div>
                </div>
            }

              {!newLocation &&
            <button
              onClick={handleCancelPlacing}
              className="w-full mt-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-semibold transition-colors">
              
                  Cancel Placing
                </button>
            }
            </div>
          }

          <div className="flex-1 relative min-h-0">
            {showNetwork ?
            <NetworkView
              nuclei={filteredNuclei}
              clusterId={selectedCluster} /> :


            <MapContainer
              center={[52.5, -114.0]}
              zoom={6}
              className={`w-full h-full ${isPlacing && !newLocation ? 'cursor-crosshair' : ''}`}
              zoomControl={true}>
              
                <MapController center={mapCenter} zoom={mapZoom} />
                <MapClickHandler
                isPlacing={isPlacing}
                onLocationSelect={(lat, lng) =>
                setNewLocation({
                  lat,
                  lng
                })
                } />
              

                <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />


                {showBoundaries && boundariesData &&
              <GeoJSONLayer
                key={`cluster-boundaries-${selectedClusterName ?? 'none'}`}
                data={boundariesData}
                style={(feature: any) => {
                  const isSelected =
                    selectedClusterName != null &&
                    feature?.properties?.name === selectedClusterName;
                  return isSelected ?
                    { color: '#4338ca', weight: 4, fillColor: '#6366f1', fillOpacity: 0.25 } :
                    { color: '#4f46e5', weight: 2, fillColor: '#6366f1', fillOpacity: 0.08 };
                }}
                onEachFeature={(feature: any, layer: any) => {
                  const name = feature?.properties?.name;
                  if (name) layer.bindTooltip(name, { sticky: true });
                }} />
              }

                {/* Existing Nuclei Markers */}
                {filteredNuclei.map((nucleus) =>
              <Marker
                key={nucleus.id}
                position={[nucleus.location.lat, nucleus.location.lng]}
                eventHandlers={{
                  click: () => handleNucleusClick(nucleus.id)
                }}>
                
                    {!isPlacing &&
                <Popup className="rounded-2xl overflow-hidden">
                        <div className="p-1 min-w-[260px]">
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                              {nucleus.name}
                            </h3>
                            <button
                        onClick={() => setSelectedNucleus(null)}
                        className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors">
                        
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                            <div className="space-y-2.5">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-medium">Core Team</span>
                                <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                                  {nucleus.engagementCounts.coordinating}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-medium">Supporting</span>
                                <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                                  {nucleus.engagementCounts.supporting}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-medium">Participating</span>
                                <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                                  {nucleus.engagementCounts.participating}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-medium">Aware</span>
                                <span className="font-bold text-gray-700 bg-gray-200 px-2 py-0.5 rounded-md">
                                  {nucleus.engagementCounts.aware}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                      onClick={() => navigate(`/nucleus/${nucleus.id}`)}
                      className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md">
                      
                            Open Dashboard
                          </button>
                        </div>
                      </Popup>
                }
                  </Marker>
              )}

                {/* Temporary Marker for New Nucleus */}
                {isPlacing && newLocation &&
              <Marker
                position={[newLocation.lat, newLocation.lng]}
                opacity={0.7} />

              }
              </MapContainer>
            }
          </div>

        </main>
      </div>
    </div>);

}