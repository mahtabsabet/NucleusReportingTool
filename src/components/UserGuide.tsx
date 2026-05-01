import React, { Children } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  GlobeIcon,
  MapPinIcon,
  LayoutDashboardIcon,
  ActivityIcon,
  UserIcon,
  BarChart3Icon,
  CalendarIcon,
  SmartphoneIcon,
  ZapIcon,
  BookOpenIcon } from
'lucide-react';
export function UserGuide() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50/50 font-sans pb-20">
      <header className="bg-white border-b border-gray-200/80 px-8 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 mb-4 transition-colors">
            
            <ChevronLeftIcon className="w-4 h-4" />
            Back to Map
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <BookOpenIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                User Guide
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                How to use the Nucleus Reporting Tool (NRT)
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8 space-y-8">
        {/* Intro */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-8">
          <p className="text-gray-600 leading-relaxed text-lg">
            The Nucleus Reporting Tool is a web-based coordination platform for
            community nuclei and cluster agencies. It provides a visual,
            map-based interface for tracking community activities, individual
            development, and growth patterns across multiple levels.
          </p>
        </div>

        {/* 1. Regional Overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-blue-50/50 border-b border-gray-100 px-8 py-5 flex items-center gap-3">
            <GlobeIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">
              1. Regional Overview (Home Screen)
            </h2>
          </div>
          <div className="p-8">
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Map of Alberta</strong> with all nuclei displayed as
                  pins.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Sidebar</strong> lists 6 clusters with their nuclei
                  counts.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Select a cluster</strong> to zoom the map and filter
                  the list, or choose 'All Clusters' for the full view.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Toggle sample data</strong> using the green button in
                  the header to switch between demo data and a blank slate.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Timeline button</strong> reveals the planning timeline
                  at the bottom of the screen.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Sidebar Reports</strong> switch between Regional
                  Reports and Cluster Reports depending on your selection.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* 2. Cluster Overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-emerald-50/50 border-b border-gray-100 px-8 py-5 flex items-center gap-3">
            <MapPinIcon className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-900">
              2. Cluster Overview
            </h2>
          </div>
          <div className="p-8">
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <span>
                  The map automatically zooms to the selected cluster's nuclei.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Click pins</strong> for a popup showing engagement
                  counts and an 'Open Dashboard' button.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Click a nucleus name</strong> in the sidebar to center
                  the map on it.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <span>
                  Use the <strong>'New Nucleus'</strong> button to place new
                  nuclei directly on the map.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <span>
                  Access <strong>cluster-level reports</strong> from the
                  sidebar.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* 3. Nucleus Dashboard */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-amber-50/50 border-b border-gray-100 px-8 py-5 flex items-center gap-3">
            <LayoutDashboardIcon className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-bold text-gray-900">
              3. Nucleus Dashboard
            </h2>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Activities Panel</h3>
              <p className="text-gray-600">
                A table of all activities with their type, schedule, and
                participant count. Click any row to open the Activity Detail.
                Use the Add Activity button to create new ones.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">
                Concentric Circles
              </h3>
              <p className="text-gray-600">
                Visual engagement rings (Core Team, Supporting, Participating,
                Aware). Drag (or tap-to-place on mobile) names from the Unplaced
                area into the rings. Click the profile link on any chip to view
                the person. Remember to click <strong>Save Placements</strong>.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">
                Community Profile
              </h3>
              <p className="text-gray-600">
                Aggregated Ruhi progress and capacities for everyone in the
                nucleus.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Other Features</h3>
              <p className="text-gray-600">
                Upload a custom banner photo, write nucleus notes, or jump to
                the Growth Report.
              </p>
            </div>
          </div>
        </div>

        {/* 4 & 5. Activity & Individual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden flex flex-col">
            <div className="bg-purple-50/50 border-b border-gray-100 px-6 py-4 flex items-center gap-3">
              <ActivityIcon className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">
                4. Activity Detail
              </h2>
            </div>
            <div className="p-6 flex-1">
              <ul className="space-y-3 text-gray-600 text-sm">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                  <span>Participants organized by specific roles.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                  <span>Add or remove participants easily.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                  <span>
                    Editable schedule field, notes area, and current book
                    tracking for study circles.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden flex flex-col">
            <div className="bg-rose-50/50 border-b border-gray-100 px-6 py-4 flex items-center gap-3">
              <UserIcon className="w-5 h-5 text-rose-600" />
              <h2 className="text-lg font-bold text-gray-900">
                5. Individual Profile
              </h2>
            </div>
            <div className="p-6 flex-1">
              <ul className="space-y-3 text-gray-600 text-sm">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                  <span>
                    Personal info, engagement level, and nuclei membership.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                  <span>Ruhi courses (completed or in-progress).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                  <span>Capacities and activities with roles.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                  <span>Personal notes and banner photo upload.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 6. Reports */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-indigo-50/50 border-b border-gray-100 px-8 py-5 flex items-center gap-3">
            <BarChart3Icon className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900">6. Reports</h2>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">
                Cluster/Regional Profile
              </h3>
              <p className="text-gray-600">
                Ruhi progress aggregated across the selected scope, with all
                capacities listed and linked to individuals.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Growth Report</h3>
              <p className="text-gray-600">
                Features a date range picker, summary cards, and a detailed
                event timeline. Works per-nucleus, per-cluster, or regionally.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">
                Activity Type Reports
              </h3>
              <p className="text-gray-600">
                Four reports (Children's Classes, JY Groups, Study Circles,
                Devotionals) showing tables with activity names, nuclei, primary
                roles, and participant counts.
              </p>
            </div>
          </div>
        </div>

        {/* 7. Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-cyan-50/50 border-b border-gray-100 px-8 py-5 flex items-center gap-3">
            <CalendarIcon className="w-6 h-6 text-cyan-600" />
            <h2 className="text-xl font-bold text-gray-900">7. Timeline</h2>
          </div>
          <div className="p-8">
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>4 zoom levels:</strong> Multi-Year → Year → Cycle →
                  Month. Click segments to drill down, use breadcrumbs to zoom
                  out.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Events</strong> appear as blue dots (single-day) or
                  bars (multi-day), positioned by exact date. Overlapping events
                  stack vertically.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Hover</strong> over any event to see its name, date
                  range, and location.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Adjust cycle boundaries</strong> using the +/− buttons
                  in the Year view to shift by 1 day.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Add Event</strong> button lets you create new events
                  with a name, date, and location.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <span>
                  <strong>Resizable panel:</strong> Drag the handle at the top
                  of the timeline to adjust its height.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* 8. Mobile Support & Quick Start */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden flex flex-col">
            <div className="bg-slate-50/50 border-b border-gray-100 px-6 py-4 flex items-center gap-3">
              <SmartphoneIcon className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-bold text-gray-900">
                8. Mobile Support
              </h2>
            </div>
            <div className="p-6 flex-1">
              <p className="text-gray-600 text-sm leading-relaxed">
                The entire app is responsive. The sidebar collapses into a
                hamburger menu, activity rows become tappable, concentric
                circles use a tap-to-place interaction instead of drag-and-drop,
                and the timeline supports touch scrolling.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-md overflow-hidden flex flex-col text-white">
            <div className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
              <ZapIcon className="w-5 h-5 text-blue-200" />
              <h2 className="text-lg font-bold text-white">Quick Start</h2>
            </div>
            <div className="p-6 flex-1">
              <ol className="space-y-2 text-sm text-blue-50 list-decimal list-inside">
                <li>Select Calgary cluster, click Taradale</li>
                <li>See 4 pre-loaded activities</li>
                <li>Place people in concentric circles</li>
                <li>Click names to see profiles</li>
                <li>Use sidebar for reports</li>
                <li>Open Timeline for May–August 2026 events</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>);

}