import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  SearchIcon,
  GlobeIcon,
  UsersIcon,
  LayoutDashboardIcon,
  ActivityIcon,
  UserIcon,
  ShieldCheckIcon,
  HomeIcon,
  SettingsIcon,
  BookOpenIcon,
} from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { getCallerContext } from '../lib/db/users';
import {
  type CallerContext,
  isClusterCoordinator,
  isNucleusCollaborator,
  isLsaMember,
} from '../lib/permissions';

// ============================================================
// Content model — one entry per feature area. Kept as plain data
// (rather than inline JSX per section) so the filter box below can
// search it directly without walking the DOM.
//
// `visibleTo` gates a section to the callers who can actually reach
// the interface it describes — undefined means everyone signed in
// can see it. Ordered lowest-permission-first: an activity host's
// world (Getting around / Activities / People) comes before a
// nucleus coordinator's (Nucleus), then a cluster coordinator's
// (Cluster), then admin-only and LSA-only material last.
// ============================================================

interface GuideBullet {
  lead?: string;
  text: string;
}
interface GuideSubsection {
  heading?: string;
  bullets: GuideBullet[];
}
interface GuideSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  visibleTo?: (ctx: CallerContext) => boolean;
  subsections: GuideSubsection[];
}

const b = (lead: string, text: string): GuideBullet => ({ lead, text });
const plain = (text: string): GuideBullet => ({ text });

// Anyone who can see a nucleus dashboard at all: nucleus coordinators
// and up (cluster coordinators, regional viewers, LSA members, and
// admins all have at least read access to every nucleus in their scope).
export const seesNucleusLevel = (ctx: CallerContext) =>
  ctx.isAdmin || ctx.isSuperAdmin || ctx.isRegionalViewer
  || isNucleusCollaborator(ctx) || isClusterCoordinator(ctx) || isLsaMember(ctx);

// Anyone who can see a cluster landing page: cluster coordinators and
// up. Nucleus coordinators and activity leads are pinned to their own
// nucleus/activity and never reach this level.
export const seesClusterLevel = (ctx: CallerContext) =>
  ctx.isAdmin || ctx.isSuperAdmin || ctx.isRegionalViewer
  || isClusterCoordinator(ctx) || isLsaMember(ctx);

export const seesRolesAndPermissions = (ctx: CallerContext) =>
  ctx.isAdmin || ctx.isSuperAdmin || ctx.isRegionalViewer;

// LSA households are Super-Admin + LSA-member only — a plain Admin
// cannot open this layer, so it's excluded here on purpose.
export const seesLsaHouseholds = (ctx: CallerContext) =>
  ctx.isSuperAdmin || isLsaMember(ctx);

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-around',
    title: 'Getting around',
    icon: GlobeIcon,
    accent: 'blue',
    subsections: [
      {
        bullets: [
          b('Search', "The search bar at the top of most pages looks across people, activities, and nuclei at once. Use the arrow keys to move through results and Enter to jump straight to one."),
          b('Account menu', 'Your avatar, top-right, on every page — change your profile photo, change your password, open this guide, see your role, or log out.'),
        ],
      },
    ],
  },
  {
    id: 'activities',
    title: 'Activities',
    icon: ActivityIcon,
    accent: 'purple',
    subsections: [
      {
        heading: 'Scheduling',
        bullets: [
          b('Recurring', 'days of the week, a time, and weekly / biweekly / monthly — for children\'s classes, study circles, and the like.'),
          b('Sporadic', 'a single free-text field, for things without a fixed schedule (accompaniment, ongoing service).'),
          b('Short', 'a start date and an end date — for camps and intensives.'),
        ],
      },
      {
        heading: 'Status',
        bullets: [
          plain('Planned, Active, Completed, or Cancelled — set with one click. A completed or cancelled activity locks its schedule until it\'s reactivated, so history stays clean.'),
        ],
      },
      {
        heading: 'Roster',
        bullets: [
          plain("Add or remove participants by role. Anyone marked inactive collapses into an Inactive section — their history is kept, and they can be reactivated any time."),
        ],
      },
      {
        heading: 'Activity Notebook — where reflection happens',
        bullets: [
          plain('Each entry has a "What happened?" and a "Learning" field (older entries kept their original four-question format, still shown read-only), attendance for that session, and any theme tags — all in one place.'),
          b('Log-entry nudge', "A banner appears when a scheduled session has passed with nothing logged. Log it, or mark 'It didn't happen this time' so the reminder stops coming back for that date."),
          b('Lapsed-attendance nudge', "Flags anyone who hasn't attended in 60+ days, with three genuinely different choices: Keep (just snoozes the flag), Mark inactive, or Remove entirely."),
        ],
      },
    ],
  },
  {
    id: 'people',
    title: 'People',
    icon: UserIcon,
    accent: 'rose',
    subsections: [
      {
        bullets: [
          plain("A person's profile: identity (age group, profile status, relationship to the Faith), capacities, curriculum, notes, and a photo."),
          b('Minors', "Email, phone, and profile photos aren't collected for anyone marked as a minor — those fields are hidden entirely."),
          b('Curriculum', "Ruhi books are tracked unit by unit — click a unit to cycle it through Not Started, In Progress, Partially Complete, and Completed. JYSEP texts are tracked as a whole course."),
          b('Deleting someone', "A type-their-name-to-confirm action. If you don't have delete rights yourself, you'll see Request Deletion instead, which goes to a reviewer."),
        ],
      },
    ],
  },
  {
    id: 'nucleus',
    title: 'Nucleus',
    icon: LayoutDashboardIcon,
    accent: 'amber',
    visibleTo: seesNucleusLevel,
    subsections: [
      {
        heading: 'Timeline',
        bullets: [
          plain('A compressed preview sits on the dashboard — click it to open the full nucleus timeline.'),
          b('Auto-populated entries', "Recurring activities appear automatically, one marker per occurrence, for as long as they're active; short-duration activities show as a single span; sporadic activities don't appear, since they have no fixed schedule to plot. Clicking one takes you to the activity itself — that's also where you'd edit it."),
          b('Add Event / Add Meeting', 'Manually add anything else — name, date(s), time, location, and, for meetings, attendees.'),
          b('Attachments', 'Click any manual item to attach a pasted text note, an uploaded document (PDF/DOC/DOCX), or a link.'),
          b('Cycles', "The recurring institute-cycle ladder along the strip is read-only here — cycle boundaries can only be moved from the cluster timeline."),
          b('Zoom & pan', "Scroll to zoom, shift-scroll to pan, pinch and swipe on mobile, and 'Fit all' to reset to the full range."),
        ],
      },
      {
        heading: 'Milestones',
        bullets: [
          plain('Four stages, 0 through 3, picked with one click. Milestone 3 unlocks detailed scoring across eight growth features, each a 0–10 slider with a written description of what 0, 5, and 10 actually look like, plus an optional note — and one holistic reflection note below all eight.'),
        ],
      },
      {
        heading: 'Core and Other Activities',
        bullets: [
          plain("The nucleus's activity list — schedule, roster, and status for each one. Open any activity from here to manage it."),
        ],
      },
      {
        heading: 'Overall Participation',
        bullets: [
          plain('The concentric circles — drag a person between Aware, Participating, Supporting, and Core to update how engaged they are. Nothing is saved until you click Save Engagement Levels.'),
          b('Primary contact', "Click a person's avatar to open their panel — one field there is Primary Contact, the person who introduced or connects them. This is what draws the connecting lines in Network Overview below."),
        ],
      },
      {
        heading: 'Network Overview',
        bullets: [
          plain('A node graph of everyone in the nucleus, connected along those primary-contact lines — a good way to see how people actually relate to each other, not just which ring they sit in.'),
        ],
      },
      {
        heading: 'Capacities & Books',
        bullets: [
          plain('Educational progress and capacities for everyone in the nucleus — a quick answer to "who here could tutor, or host their own gathering?"'),
        ],
      },
      {
        heading: 'Nucleus Journal',
        bullets: [
          plain("Free-form, nucleus-wide reflections, alongside the nucleus's own 'Objects of Learning' — click a theme to filter entries down to just that pattern. These themes are what feed into the cluster-wide Learning Hub."),
        ],
      },
      {
        heading: 'Growth Report',
        bullets: [
          plain('Trends in participation and engagement over time, scoped to this nucleus — new activities, participants added, circle movements, and course completions, both as summary counts and a full chronological timeline.'),
        ],
      },
    ],
  },
  {
    id: 'cluster',
    title: 'Cluster',
    icon: UsersIcon,
    accent: 'emerald',
    visibleTo: seesClusterLevel,
    subsections: [
      {
        heading: 'Map',
        bullets: [
          plain("Every nucleus in the cluster (or every cluster in the organization, before one is selected), plotted as pins. The sidebar lists each cluster with its nucleus count; select one to zoom and filter, or choose 'All Clusters' for the full picture."),
          b('New Nucleus', 'Places a new nucleus directly on the map.'),
        ],
      },
      {
        heading: 'Top menu',
        bullets: [
          b('Progress', "Groups nuclei by milestone stage and draws a line between any two that share a person — a quick way to see how nuclei connect, not just where they are."),
          b('Timeline', "Opens the cluster-wide timeline. It works the same as a nucleus timeline (see the Nucleus section) — it just shows every nucleus in the cluster at once, or 'All Clusters.' Cycle boundaries can only be adjusted from here, not from a nucleus timeline."),
          b('Boundaries', "Overlays the real geographic cluster boundaries underneath the pins."),
        ],
      },
      {
        heading: 'Side menu',
        bullets: [
          b('Cluster Profile', "Curriculum progress and capacities aggregated across the whole cluster. A Manage button opens capacity cleanup — rename a capacity, or merge near-duplicates like 'Tutor' and 'Book Tutor' into one; everyone holding either gets reconciled onto the survivor."),
          b('Growth Report', "The same trends as a nucleus Growth Report, rolled up across every nucleus in the cluster."),
          b('Learning Hub', "Gathers every nucleus's Objects of Learning side by side, so when two nuclei are independently noticing the same pattern, that becomes visible instead of staying two disconnected observations. Merge near-duplicate themes, archive one that's run its course, or Share with nuclei to push a theme down to nuclei that don't have it yet — plus room for your own cluster-level synthesis reflections tying a pattern together. Cluster Meeting Notes sits above it — a separate, general log for inter-institutional meetings that aren't tied to a specific theme."),
          b('People', "The full, searchable roster for the cluster. Also where duplicate profiles get cleaned up: an amber banner flags likely duplicates automatically ('Review & merge'), or select exactly two people yourself and choose which profile to keep — everything else moves onto it."),
          b('Activity Type Reports', "Four tables — Children's Classes, Junior Youth Groups, Study Circles, and Devotionals — showing who's teaching, animating, tutoring, or hosting, and how many participants, for each activity of that type."),
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles & permissions',
    icon: ShieldCheckIcon,
    accent: 'slate',
    visibleTo: seesRolesAndPermissions,
    subsections: [
      {
        bullets: [
          plain('Five roles sit beneath full Admin access: Cluster Coordinator, Nucleus Coordinator, Activity Lead, Regional (View-Only), and LSA Member — each scoped to exactly the cluster, nucleus, or activity they were assigned to.'),
          b('Creating a user', "From Manage Users: pick a role, then a scope (only as many levels as that role actually needs), a name and email, and how they'll sign in — an invitation email, or a temporary password you share yourself."),
          b('Direct actions vs. requests', "Some actions go through immediately; others — deleting a person, or a whole user account — go into a request queue for someone with broader access to approve, even for a Cluster Coordinator."),
          b('Approving a request', "Only marks the request approved — it doesn't perform the action by itself. A reviewer still has to go make the actual change afterward."),
        ],
      },
    ],
  },
  {
    id: 'lsa',
    title: 'LSA households',
    icon: HomeIcon,
    accent: 'stone',
    visibleTo: seesLsaHouseholds,
    subsections: [
      {
        bullets: [
          plain("A separate, privacy-walled layer — visible only to LSA members and Super Admins, never to an ordinary Admin. Reach it from the Households toggle next to the usual community view."),
          b('Adding households', "One at a time on the map, or bulk-import a spreadsheet (CSV or Excel). The tool guesses which column is which, previews a few rows, and geocodes addresses automatically — anything it can't place is still added, ready to hand-pin."),
          b('Linking members', "Each household member can be linked to their existing community-building profile (the tool proactively suggests likely matches), moved to a different household, or kept as an LSA-only entry with no link at all."),
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & privacy',
    icon: SettingsIcon,
    accent: 'gray',
    subsections: [
      {
        bullets: [
          plain('Change your password or profile photo any time from the account menu, top-right.'),
          b('Privacy acknowledgement', "The six commitments about handling people's information respectfully that you agreed to at first login. An Admin can reset this for a specific person — useful after handing off a test account, or any time someone should re-confirm."),
        ],
      },
    ],
  },
];

// ============================================================

function matchesQuery(section: GuideSection, q: string): GuideSection | null {
  if (!q) return section;
  const titleMatch = section.title.toLowerCase().includes(q);
  const subsections = section.subsections
    .map(sub => {
      const headingMatch = (sub.heading ?? '').toLowerCase().includes(q);
      const bullets = sub.bullets.filter(
        bullet => (bullet.lead ?? '').toLowerCase().includes(q) || bullet.text.toLowerCase().includes(q)
      );
      if (headingMatch || bullets.length > 0) {
        return { ...sub, bullets: headingMatch && bullets.length === 0 ? sub.bullets : bullets };
      }
      return null;
    })
    .filter((s): s is GuideSubsection => s !== null);

  if (titleMatch) return section;
  if (subsections.length > 0) return { ...section, subsections };
  return null;
}

const ACCENT_CLASSES: Record<string, { bg: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-50/50', text: 'text-blue-600', dot: 'bg-blue-400' },
  emerald: { bg: 'bg-emerald-50/50', text: 'text-emerald-600', dot: 'bg-emerald-400' },
  amber: { bg: 'bg-amber-50/50', text: 'text-amber-600', dot: 'bg-amber-400' },
  purple: { bg: 'bg-purple-50/50', text: 'text-purple-600', dot: 'bg-purple-400' },
  rose: { bg: 'bg-rose-50/50', text: 'text-rose-600', dot: 'bg-rose-400' },
  slate: { bg: 'bg-slate-50/50', text: 'text-slate-600', dot: 'bg-slate-400' },
  stone: { bg: 'bg-stone-50/50', text: 'text-stone-600', dot: 'bg-stone-400' },
  gray: { bg: 'bg-gray-50/50', text: 'text-gray-600', dot: 'bg-gray-400' },
};

function GuideBulletRow({ bullet, dotClass }: { bullet: GuideBullet; dotClass: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass} mt-2 flex-shrink-0`} />
      <span className="text-gray-600">
        {bullet.lead && <strong className="text-gray-900">{bullet.lead}: </strong>}
        {bullet.text}
      </span>
    </li>
  );
}

function GuideSectionCard({
  section,
  open,
  onToggle,
}: {
  section: GuideSection;
  open: boolean;
  onToggle: () => void;
}) {
  const accent = ACCENT_CLASSES[section.accent] ?? ACCENT_CLASSES.gray;
  const Icon = section.icon;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full ${accent.bg} border-b border-gray-100 px-8 py-5 flex items-center justify-between gap-3 text-left`}
      >
        <span className="flex items-center gap-3">
          <Icon className={`w-6 h-6 ${accent.text}`} />
          <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
        </span>
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="p-8 space-y-6">
          {section.subsections.map((sub, i) => (
            <div key={i}>
              {sub.heading && <h3 className="font-bold text-gray-900 mb-2">{sub.heading}</h3>}
              <ul className="space-y-3">
                {sub.bullets.map((bullet, j) => (
                  <GuideBulletRow key={j} bullet={bullet} dotClass={accent.dot} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserGuide() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [callerCtx, setCallerCtx] = useState<CallerContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCallerContext().then(ctx => {
      if (!cancelled) {
        setCallerCtx(ctx);
        setCtxLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const sectionsForCaller = useMemo(
    () => GUIDE_SECTIONS.filter(s => !s.visibleTo || (callerCtx && s.visibleTo(callerCtx))),
    [callerCtx]
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => sectionsForCaller.map(s => matchesQuery(s, q)).filter((s): s is GuideSection => s !== null),
    [sectionsForCaller, q]
  );

  const isOpen = (id: string) => (q.length > 0 ? true : openIds.has(id));
  const toggle = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = () => setOpenIds(new Set(sectionsForCaller.map(s => s.id)));
  const collapseAll = () => setOpenIds(new Set());

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans pb-20">
      <header className="bg-white border-b border-gray-200/80 px-8 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Back to Map
            </button>
            <div className="flex-1 max-w-sm">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <BookOpenIcon className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Guide</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <p className="text-xs text-gray-500 italic">
          This guide describes the desktop version of the app. The mobile
          version has most of the same functionality — just laid out a
          little differently.
        </p>

        {ctxLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Filter + expand/collapse */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search this guide — e.g. 'attendance', 'timeline', 'roles'…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {!q && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={expandAll}
                    className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
                  >
                    Collapse all
                  </button>
                </div>
              )}
            </div>

            {/* Sections */}
            {filtered.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-8 text-center text-gray-500">
                No matches for "{query}" — try a different word, or clear the search to browse everything.
              </div>
            )}
            {filtered.map(section => (
              <GuideSectionCard
                key={section.id}
                section={section}
                open={isOpen(section.id)}
                onToggle={() => toggle(section.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
