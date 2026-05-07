import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPinIcon,
  HelpCircleIcon,
  GlobeIcon,
  MapIcon,
  CalendarIcon,
  NetworkIcon,
  BarChart3Icon,
  ChevronRightIcon,
  XIcon,
  CheckIcon,
} from 'lucide-react';
import { fetchClusters, fetchNuclei } from '../lib/db/clusters';
import type { ClusterRow, NucleusRow } from '../lib/db/clusters';
import { getCallerContext } from '../lib/db/users';
import type { CallerContext } from '../lib/permissions';
import { coordinatorClusterIds } from '../lib/permissions';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';

const REGION_NAME = 'Alberta';

type WorkspaceKey = 'map' | 'timeline' | 'network' | 'reports';

export function MobileLanding() {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [nuclei, setNuclei] = useState<NucleusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchClusters(), fetchNuclei(), getCallerContext()])
      .then(([c, n, ctx]) => {
        setClusters(c);
        setNuclei(n);
        if (ctx) {
          const initial = pickInitialCluster(ctx);
          if (initial) setSelectedCluster(initial);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredNuclei = useMemo(
    () => selectedCluster ? nuclei.filter(n => n.clusterId === selectedCluster) : nuclei,
    [nuclei, selectedCluster],
  );

  const clusterById = useMemo(() => {
    const m = new Map<string, ClusterRow>();
    clusters.forEach(c => m.set(c.id, c));
    return m;
  }, [clusters]);

  const currentClusterName = selectedCluster ? clusterById.get(selectedCluster)?.name ?? null : null;
  const contextKindLabel = currentClusterName ? 'Cluster' : 'Region';
  const contextValueLabel = currentClusterName ?? `All ${REGION_NAME} Clusters`;

  function navigateToWorkspace(key: WorkspaceKey) {
    const params = new URLSearchParams();
    if (selectedCluster) params.set('cluster', selectedCluster);
    if (key === 'reports') {
      navigate(`/m/reports${params.toString() ? `?${params}` : ''}`);
      return;
    }
    if (key === 'timeline' || key === 'network') params.set('view', key);
    navigate(`/map${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-12">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
            <MapPinIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate">Nucleus Reporting</h1>
            <p className="text-xs font-medium text-gray-500 truncate">{REGION_NAME} Region</p>
          </div>
          <button
            onClick={() => navigate('/guide')}
            aria-label="User guide"
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <HelpCircleIcon className="w-5 h-5" />
          </button>
          <AccountMenu
            inline
            buttonClassName="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-md hover:bg-blue-700 transition-colors overflow-hidden flex-shrink-0"
          />
        </div>
        <div className="px-4 pb-3">
          <GlobalSearch placeholder="Search nuclei, people, activities..." />
        </div>
      </header>

      <section className="px-4 pt-6">
        <SectionHeading>Current Context</SectionHeading>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={loading}
          className="mt-3 w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <GlobeIcon className="w-5 h-5 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500">{contextKindLabel}</p>
            <p className="text-sm font-bold text-gray-900 truncate">{contextValueLabel}</p>
          </div>
          <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </button>
      </section>

      <section className="px-4 pt-6">
        <SectionHeading>Workspaces</SectionHeading>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <WorkspaceCard
            title="Map View"
            subtitle="Geographic explorer"
            icon={<MapIcon className="w-5 h-5 text-blue-600" />}
            tint="bg-blue-50"
            onClick={() => navigateToWorkspace('map')}
          />
          <WorkspaceCard
            title="Timeline"
            subtitle="Cycles & events"
            icon={<CalendarIcon className="w-5 h-5 text-indigo-600" />}
            tint="bg-indigo-50"
            onClick={() => navigateToWorkspace('timeline')}
          />
          <WorkspaceCard
            title="Network"
            subtitle="Cross-nucleus links"
            icon={<NetworkIcon className="w-5 h-5 text-purple-600" />}
            tint="bg-purple-50"
            onClick={() => navigateToWorkspace('network')}
          />
          <WorkspaceCard
            title="Reports"
            subtitle="Insights & data"
            icon={<BarChart3Icon className="w-5 h-5 text-emerald-600" />}
            tint="bg-emerald-50"
            onClick={() => navigateToWorkspace('reports')}
          />
        </div>
      </section>

      <section className="px-4 pt-6">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Nuclei</SectionHeading>
          <span className="text-xs font-medium text-gray-400">
            {loading ? '—' : `${filteredNuclei.length} ${filteredNuclei.length === 1 ? 'nucleus' : 'nuclei'}`}
          </span>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : filteredNuclei.length === 0 ? (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl px-4 py-6 text-center text-sm text-gray-500">
            No nuclei in this {contextKindLabel.toLowerCase()}.
          </div>
        ) : (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
            {filteredNuclei.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => navigate(`/nucleus/${n.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <MapPinIcon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{n.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-md">
                      {clusterById.get(n.clusterId)?.name ?? '—'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {peopleCount(n)} {peopleCount(n) === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {pickerOpen && (
        <ContextPicker
          clusters={clusters}
          nuclei={nuclei}
          selectedCluster={selectedCluster}
          regionLabel={`All ${REGION_NAME} Clusters`}
          onClose={() => setPickerOpen(false)}
          onSelect={id => {
            setSelectedCluster(id);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{children}</h2>
  );
}

interface WorkspaceCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tint: string;
  onClick: () => void;
}

function WorkspaceCard({ title, subtitle, icon, tint, onClick }: WorkspaceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-4 text-left hover:bg-gray-50 transition-colors flex flex-col gap-3 min-h-[120px]"
    >
      <div className={`w-11 h-11 rounded-xl ${tint} flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <p className="text-xs font-medium text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}

interface ContextPickerProps {
  clusters: ClusterRow[];
  nuclei: NucleusRow[];
  selectedCluster: string | null;
  regionLabel: string;
  onClose: () => void;
  onSelect: (id: string | null) => void;
}

function ContextPicker({ clusters, nuclei, selectedCluster, regionLabel, onClose, onSelect }: ContextPickerProps) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    nuclei.forEach(n => m.set(n.clusterId, (m.get(n.clusterId) ?? 0) + 1));
    return m;
  }, [nuclei]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full bg-white rounded-t-3xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
          <h3 className="flex-1 text-base font-bold text-gray-900">Select context</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto py-2">
          <PickerRow
            label={regionLabel}
            sublabel={`${nuclei.length} ${nuclei.length === 1 ? 'nucleus' : 'nuclei'}`}
            icon={<GlobeIcon className="w-5 h-5 text-gray-500" />}
            selected={selectedCluster === null}
            onClick={() => onSelect(null)}
          />
          <div className="px-5 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Clusters
          </div>
          {clusters.map(c => {
            const count = counts.get(c.id) ?? 0;
            return (
              <PickerRow
                key={c.id}
                label={c.name}
                sublabel={`${count} ${count === 1 ? 'nucleus' : 'nuclei'}`}
                icon={<MapIcon className="w-5 h-5 text-blue-500" />}
                selected={selectedCluster === c.id}
                onClick={() => onSelect(c.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PickerRowProps {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}

function PickerRow({ label, sublabel, icon, selected, onClick }: PickerRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${selected ? 'text-blue-900' : 'text-gray-900'}`}>{label}</p>
        <p className="text-xs text-gray-500">{sublabel}</p>
      </div>
      {selected && <CheckIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />}
    </button>
  );
}

function peopleCount(n: NucleusRow): number {
  const c = n.engagementCounts;
  return c.coordinating + c.supporting + c.participating + c.aware;
}

// If the caller is a cluster coordinator with exactly one cluster grant
// (and no global access), preselect that cluster so they don't have to
// pick it before creating a nucleus on the map. Admins / regional viewers
// keep the all-region default.
function pickInitialCluster(ctx: CallerContext): string | null {
  if (ctx.isSuperAdmin || ctx.isAdmin || ctx.isRegionalViewer) return null;
  const cc = coordinatorClusterIds(ctx);
  return cc.length === 1 ? cc[0] : null;
}
