import React, { useMemo, useState } from 'react';
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
  CalendarIcon,
  BarChart3Icon,
  MessageCircleIcon,
  ShieldCheckIcon,
  HomeIcon,
  SettingsIcon,
  SmartphoneIcon,
  ZapIcon,
  BookOpenIcon,
} from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';

// ============================================================
// Content model — one entry per feature area. Kept as plain data
// (rather than inline JSX per section) so the filter box below can
// search it directly without walking the DOM.
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
  subsections: GuideSubsection[];
}

const b = (lead: string, text: string): GuideBullet => ({ lead, text });
const plain = (text: string): GuideBullet => ({ text });

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-around',
    title: 'Getting around',
    icon: GlobeIcon,
    accent: 'blue',
    subsections: [
      {
        bullets: [
          b('Map', "The home screen — every nucleus in the organization, plotted as pins. The sidebar lists every cluster with its nucleus count; select one to zoom and filter, or choose 'All Clusters' for the full picture."),
          b('Boundaries', 'A map toggle that overlays the real geographic cluster boundaries underneath the pins.'),
          b('Progress', "A map toggle that groups nuclei by milestone stage and draws a line between any two nuclei that share a person — a quick way to see how nuclei connect, not just where they are."),
          b('Search', "The search bar at the top of most pages looks across people, activities, and nuclei at once. Use the arrow keys to move through results and Enter to jump straight to one."),
          b('Account menu', 'Your avatar, top-right, on every page — change your profile photo, change your password, see your role, or log out.'),
        ],
      },
    ],
  },
  {
    id: 'clusters',
    title: 'Clusters',
    icon: UsersIcon,
    accent: 'emerald',
    subsections: [
      {
        heading: 'Cluster People',
        bullets: [
          plain('The full, searchable roster for a cluster. This is also where duplicate profiles get cleaned up.'),
          b('Possible duplicates', "When the tool notices two profiles that look like the same person, an amber banner lists each set with a 'Review & merge' button."),
          b('Merging manually', "Select exactly two people and a 'Merge…' button appears. Pick which profile to keep — everything else (nuclei, activities, course progress, attendance) moves onto it, and any missing email, phone, or photo gets filled in from the other."),
        ],
      },
      {
        heading: 'Capacity catalog',
        bullets: [
          plain("The cluster-wide list of capacities (Tutor, Animator, and so on). New capacities are actually created from a person's own profile — this screen is for cleanup afterward."),
          b('Merge', 'Check two or more near-duplicates (like "Tutor" and "Book Tutor") and merge them into one wording — everyone holding either gets reconciled onto the survivor.'),
        ],
      },
      {
        bullets: [
          b('New Nucleus', 'Places a new nucleus directly on the map.'),
        ],
      },
    ],
  },
  {
    id: 'nuclei',
    title: 'Nuclei',
    icon: LayoutDashboardIcon,
    accent: 'amber',
    subsections: [
      {
        heading: 'Nucleus Dashboard',
        bullets: [
          plain('Its activity list, milestone stage, and a Capacities module that answers "who here could tutor, or host their own gathering?" at a glance.'),
        ],
      },
      {
        heading: 'Concentric Circles',
        bullets: [
          plain('Drag a person between Aware, Participating, Supporting, and Core to update how engaged they are. Nothing is saved until you click Save Engagement Levels.'),
          b('Primary contact', "Click a person's avatar to open their panel — one field there is Primary Contact, the person who introduced or connects them. This is what draws the connecting lines in the Network view below."),
        ],
      },
      {
        heading: 'Network view',
        bullets: [
          plain('A node graph of everyone in the nucleus, connected along those primary-contact lines — a good way to see how people actually relate to each other, not just which ring they sit in.'),
        ],
      },
      {
        heading: 'Milestones',
        bullets: [
          plain('Four stages, 0 through 3, picked with one click. Milestone 3 unlocks detailed scoring across eight growth features, each a 0–10 slider with a written description of what 0, 5, and 10 actually look like, plus an optional note — and one holistic reflection note below all eight.'),
        ],
      },
      {
        heading: 'Nucleus Journal',
        bullets: [
          plain("Free-form, nucleus-wide reflections, alongside the nucleus's own 'Objects of Learning' — click a theme to filter entries down to just that pattern."),
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
          plain("A person's profile: identity (age group, profile status, relationship to the Faith — email and phone are hidden entirely for minors), capacities, curriculum, notes, and a photo."),
          b('Curriculum', "Ruhi books are tracked unit by unit — click a unit to cycle it through Not Started, In Progress, Partially Complete, and Completed. JYSEP texts are tracked as a whole course."),
          b('Deleting someone', "A type-their-name-to-confirm action. If you don't have delete rights yourself, you'll see Request Deletion instead, which goes to a reviewer."),
        ],
      },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    icon: CalendarIcon,
    accent: 'cyan',
    subsections: [
      {
        bullets: [
          plain("Two scopes: a cluster timeline (every nucleus at once, or 'All Clusters') and each nucleus's own timeline."),
          b('Auto-populated entries', "Recurring activities appear automatically, one marker per occurrence, for as long as they're active; short-duration activities show as a single span; sporadic activities don't appear, since they have no fixed schedule to plot. Clicking one of these takes you to the activity itself — that's also where you'd edit it."),
          b('Add Event / Add Meeting', 'Manually add anything else — name, date(s), time, location, and, for meetings, attendees.'),
          b('Attachments', 'Click any manual item to attach a pasted text note, an uploaded document (PDF/DOC/DOCX), or a link.'),
          b('Cycles', "The recurring institute-cycle ladder along the strip. Cluster coordinators can nudge a cycle's boundary by a day at a time from the cluster timeline — not from a nucleus timeline."),
          b('Zoom & pan', "Scroll to zoom, shift-scroll to pan, pinch and swipe on mobile, and 'Fit all' to reset to the full range."),
        ],
      },
    ],
  },
  {
    id: 'learning-hub',
    title: 'Cluster Learning Hub',
    icon: MessageCircleIcon,
    accent: 'indigo',
    subsections: [
      {
        bullets: [
          plain("Objects of Learning proposed at the nucleus level (starting as 'emerging,' then promoted to 'established') automatically link up to one cluster-wide version of the same theme by name."),
          b('The Hub itself', "Three columns: the theme list (with a manual consolidation slider), which nuclei are contributing and their representative moments, and the cluster coordinator's own synthesis reflections tying the pattern together."),
          b('Merge, archive, share', "Merge near-duplicate themes, archive one that's run its course (optionally posting a note back into every nucleus that had it), or Share with nuclei to push a theme — and an optional seed note — down to nuclei that don't have it yet."),
          b('Cluster Meeting Notes', "A separate, general log above the three columns for inter-institutional meetings that aren't tied to a specific theme."),
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: BarChart3Icon,
    accent: 'sky',
    subsections: [
      {
        bullets: [
          b('Growth Report', 'Pick a date range (or 7/30/90 days, 1 year); shows new activities, participants added, circle movements, and course completions/starts, both as summary counts and a full chronological timeline.'),
          b('Cluster Growth Profile', 'A formal, point-in-time snapshot — exportable as Excel or as a print-ready PDF.'),
          b('Activity Type Reports', "One table each for Children's Classes, Junior Youth Groups, Study Circles, and Devotional Gatherings — who's teaching, animating, tutoring, or hosting, and how many participants."),
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles & permissions',
    icon: ShieldCheckIcon,
    accent: 'slate',
    subsections: [
      {
        bullets: [
          plain('Five roles sit beneath full Admin access: Cluster Coordinator, Nucleus Coordinator, Activity Lead, Regional (View-Only), and LSA Member — each scoped to exactly the cluster, nucleus, or activity they were assigned to.'),
          b('Creating a user', "Pick a role, then a scope (only as many levels as that role actually needs), a name and email, and how they'll sign in — an invitation email, or a temporary password you share yourself."),
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
    subsections: [
      {
        bullets: [
          plain("A separate, privacy-walled layer — visible only to LSA members (and Super Admins, for upkeep), never to an ordinary Admin. Reach it from the Households toggle next to the usual community view."),
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
  cyan: { bg: 'bg-cyan-50/50', text: 'text-cyan-600', dot: 'bg-cyan-400' },
  indigo: { bg: 'bg-indigo-50/50', text: 'text-indigo-600', dot: 'bg-indigo-400' },
  sky: { bg: 'bg-sky-50/50', text: 'text-sky-600', dot: 'bg-sky-400' },
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

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => GUIDE_SECTIONS.map(s => matchesQuery(s, q)).filter((s): s is GuideSection => s !== null),
    [q]
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
  const expandAll = () => setOpenIds(new Set(GUIDE_SECTIONS.map(s => s.id)));
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
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Guide</h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                How to use the Nucleus Reporting Tool (NRT)
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* Intro */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-8">
          <p className="text-gray-600 leading-relaxed text-lg">
            The Nucleus Reporting Tool is a web-based coordination platform for
            community nuclei and cluster agencies — a visual, map-based way to
            track community activities, individual development, and growth
            patterns across every level, from a single activity up to the
            region.
          </p>
        </div>

        {/* Quick Start */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-md overflow-hidden text-white">
          <div className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
            <ZapIcon className="w-5 h-5 text-blue-200" />
            <h2 className="text-lg font-bold text-white">Quick Start</h2>
          </div>
          <div className="p-6">
            <ol className="space-y-2 text-sm text-blue-50 list-decimal list-inside">
              <li>Pick your cluster from the map or sidebar.</li>
              <li>Open any nucleus to see its dashboard and activities.</li>
              <li>Try placing someone in the concentric circles, then click Save Engagement Levels.</li>
              <li>Open an activity and write a quick Activity Notebook entry.</li>
              <li>Check Reports for a growth summary of what you just did.</li>
            </ol>
          </div>
        </div>

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

        {/* Mobile note */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="bg-slate-50/50 border-b border-gray-100 px-6 py-4 flex items-center gap-3">
            <SmartphoneIcon className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-bold text-gray-900">On mobile</h2>
          </div>
          <div className="p-6">
            <p className="text-gray-600 text-sm leading-relaxed">
              Everything above works on a phone too — it isn't a trimmed-down
              view. The map, timeline, network, and reports each get a
              touch-friendly layout, concentric circles switch to tap-to-place
              instead of drag-and-drop, and the timeline runs top-to-bottom
              instead of side-to-side.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
