import { Participant, Activity, TimelineCycle, TimelineEvent } from '../types';
import { mockParticipants, mockActivities, mockNuclei } from './mockData';

// ─── Centralized Store ───────────────────────────────────────────
// Module-level mutable state that persists across route changes.
// Acts as a simple in-memory database for the prototype.

// ─── Event Log ───────────────────────────────────────────────────
// Records all meaningful changes for growth reporting.
// In production, this would be backed by a database with proper timestamps.

export interface EventLogEntry {
  id: string;
  timestamp: Date;
  type:
  'activity_created' |
  'participant_added' |
  'participant_removed' |
  'circle_movement' |
  'course_completed' |
  'course_started' |
  'person_created' |
  'nucleus_created' |
  'profile_updated';
  nucleusId?: string;
  activityId?: string;
  personId?: string;
  personName?: string;
  description: string;
  details?: Record<string, any>;
}

const eventLog: EventLogEntry[] = [];
let _eventCounter = 0;

function generateEventId(): string {
  return `evt-${++_eventCounter}-${Date.now()}`;
}

export function logEvent(
entry: Omit<EventLogEntry, 'id' | 'timestamp'> & {timestamp?: Date;})
: void {
  eventLog.push({
    ...entry,
    id: generateEventId(),
    timestamp: entry.timestamp || new Date()
  });
}

export function getEvents(options?: {
  startDate?: Date;
  endDate?: Date;
  nucleusId?: string;
  type?: EventLogEntry['type'];
}): EventLogEntry[] {
  let filtered = [...eventLog];
  if (options?.startDate) {
    filtered = filtered.filter((e) => e.timestamp >= options.startDate!);
  }
  if (options?.endDate) {
    filtered = filtered.filter((e) => e.timestamp <= options.endDate!);
  }
  if (options?.nucleusId) {
    filtered = filtered.filter((e) => e.nucleusId === options.nucleusId);
  }
  if (options?.type) {
    filtered = filtered.filter((e) => e.type === options.type);
  }
  return filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function getEventsSummary(options?: {
  startDate?: Date;
  endDate?: Date;
  nucleusId?: string;
}): {
  activitiesCreated: EventLogEntry[];
  participantsAdded: EventLogEntry[];
  participantsRemoved: EventLogEntry[];
  circleMovements: EventLogEntry[];
  coursesCompleted: EventLogEntry[];
  coursesStarted: EventLogEntry[];
  peopleCreated: EventLogEntry[];
  nucleiCreated: EventLogEntry[];
  total: number;
} {
  const events = getEvents(options);
  return {
    activitiesCreated: events.filter((e) => e.type === 'activity_created'),
    participantsAdded: events.filter((e) => e.type === 'participant_added'),
    participantsRemoved: events.filter((e) => e.type === 'participant_removed'),
    circleMovements: events.filter((e) => e.type === 'circle_movement'),
    coursesCompleted: events.filter((e) => e.type === 'course_completed'),
    coursesStarted: events.filter((e) => e.type === 'course_started'),
    peopleCreated: events.filter((e) => e.type === 'person_created'),
    nucleiCreated: events.filter((e) => e.type === 'nucleus_created'),
    total: events.length
  };
}

// ─── Seed Demo Events ────────────────────────────────────────────
// Backdated events to make the demo compelling from the start.

function seedDemoEvents() {
  const now = new Date();
  const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  // 6 weeks ago: Study circle started
  logEvent({
    timestamp: daysAgo(42),
    type: 'activity_created',
    nucleusId: 'taradale',
    activityId: 'act-3',
    description: 'Study Circle - Book 1 started in Taradale',
    details: {
      activityName: 'Study Circle - Book 1',
      activityType: 'study-circle'
    }
  });

  // 5 weeks ago: Children's class started
  logEvent({
    timestamp: daysAgo(35),
    type: 'activity_created',
    nucleusId: 'taradale',
    activityId: 'act-1',
    description: "Children's Class started in Taradale",
    details: {
      activityName: "Children's Class - Taradale",
      activityType: 'children-class'
    }
  });

  // 4 weeks ago: Junior youth group started
  logEvent({
    timestamp: daysAgo(28),
    type: 'activity_created',
    nucleusId: 'taradale',
    activityId: 'act-2',
    description: 'Junior Youth Group started in Taradale',
    details: {
      activityName: 'Junior Youth Group - Taradale',
      activityType: 'junior-youth'
    }
  });

  // 3 weeks ago: Devotional started
  logEvent({
    timestamp: daysAgo(21),
    type: 'activity_created',
    nucleusId: 'taradale',
    activityId: 'act-4',
    description: 'Devotional Gathering started in Taradale',
    details: {
      activityName: 'Devotional Gathering',
      activityType: 'devotional'
    }
  });

  // Various participant additions over time
  const participantEvents = [
  {
    days: 40,
    person: 'Sara Miller',
    personId: 'p-1',
    activity: "Children's Class - Taradale",
    activityId: 'act-1',
    role: 'teacher'
  },
  {
    days: 40,
    person: 'David Chen',
    personId: 'p-2',
    activity: "Children's Class - Taradale",
    activityId: 'act-1',
    role: 'teacher'
  },
  {
    days: 38,
    person: 'Elaine Lopez',
    personId: 'p-7',
    activity: "Children's Class - Taradale",
    activityId: 'act-1',
    role: 'parent'
  },
  {
    days: 30,
    person: 'Sara Miller',
    personId: 'p-1',
    activity: 'Junior Youth Group - Taradale',
    activityId: 'act-2',
    role: 'animator'
  },
  {
    days: 25,
    person: 'David Chen',
    personId: 'p-2',
    activity: 'Study Circle - Book 1',
    activityId: 'act-3',
    role: 'tutor'
  },
  {
    days: 20,
    person: 'Elaine Lopez',
    personId: 'p-7',
    activity: 'Devotional Gathering',
    activityId: 'act-4',
    role: 'host'
  }];


  participantEvents.forEach(
    ({ days, person, personId, activity, activityId, role }) => {
      logEvent({
        timestamp: daysAgo(days),
        type: 'participant_added',
        nucleusId: 'taradale',
        activityId,
        personId,
        personName: person,
        description: `${person} joined ${activity} as ${role}`,
        details: { activityName: activity, role }
      });
    }
  );

  // Course completions over time
  logEvent({
    timestamp: daysAgo(60),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-1',
    personName: 'Sara Miller',
    description:
    'Sara Miller completed Book 1: Reflections on the Life of the Spirit',
    details: {
      courseId: 'c-1',
      courseName: 'Book 1: Reflections on the Life of the Spirit'
    }
  });
  logEvent({
    timestamp: daysAgo(45),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-1',
    personName: 'Sara Miller',
    description: 'Sara Miller completed Book 2: Arising to Serve',
    details: { courseId: 'c-2', courseName: 'Book 2: Arising to Serve' }
  });
  logEvent({
    timestamp: daysAgo(30),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-1',
    personName: 'Sara Miller',
    description:
    "Sara Miller completed Book 3: Teaching Children's Classes Grade 1",
    details: {
      courseId: 'c-3',
      courseName: "Book 3: Teaching Children's Classes Grade 1"
    }
  });
  logEvent({
    timestamp: daysAgo(55),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-2',
    personName: 'David Chen',
    description:
    'David Chen completed Book 1: Reflections on the Life of the Spirit',
    details: {
      courseId: 'c-1',
      courseName: 'Book 1: Reflections on the Life of the Spirit'
    }
  });
  logEvent({
    timestamp: daysAgo(40),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-2',
    personName: 'David Chen',
    description: 'David Chen completed Book 2: Arising to Serve',
    details: { courseId: 'c-2', courseName: 'Book 2: Arising to Serve' }
  });
  logEvent({
    timestamp: daysAgo(25),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-2',
    personName: 'David Chen',
    description:
    "David Chen completed Book 3: Teaching Children's Classes Grade 1",
    details: {
      courseId: 'c-3',
      courseName: "Book 3: Teaching Children's Classes Grade 1"
    }
  });
  logEvent({
    timestamp: daysAgo(15),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-2',
    personName: 'David Chen',
    description: 'David Chen completed Book 6: Teaching the Cause',
    details: { courseId: 'c-6', courseName: 'Book 6: Teaching the Cause' }
  });
  logEvent({
    timestamp: daysAgo(50),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-7',
    personName: 'Elaine Lopez',
    description:
    'Elaine Lopez completed Book 1: Reflections on the Life of the Spirit',
    details: {
      courseId: 'c-1',
      courseName: 'Book 1: Reflections on the Life of the Spirit'
    }
  });
  logEvent({
    timestamp: daysAgo(35),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-7',
    personName: 'Elaine Lopez',
    description: 'Elaine Lopez completed Book 2: Arising to Serve',
    details: { courseId: 'c-2', courseName: 'Book 2: Arising to Serve' }
  });
  logEvent({
    timestamp: daysAgo(20),
    type: 'course_completed',
    nucleusId: 'taradale',
    personId: 'p-7',
    personName: 'Elaine Lopez',
    description:
    "Elaine Lopez completed Book 3: Teaching Children's Classes Grade 1",
    details: {
      courseId: 'c-3',
      courseName: "Book 3: Teaching Children's Classes Grade 1"
    }
  });
  logEvent({
    timestamp: daysAgo(10),
    type: 'course_started',
    nucleusId: 'taradale',
    personId: 'p-7',
    personName: 'Elaine Lopez',
    description:
    'Elaine Lopez started Book 5: Releasing the Powers of Junior Youth',
    details: {
      courseId: 'c-5',
      courseName: 'Book 5: Releasing the Powers of Junior Youth'
    }
  });

  // Circle movements
  logEvent({
    timestamp: daysAgo(32),
    type: 'circle_movement',
    nucleusId: 'taradale',
    personId: 'p-1',
    personName: 'Sara Miller',
    description: 'Sara Miller moved from Supporting to Coordinating',
    details: { from: 'supporting', to: 'coordinating' }
  });
  logEvent({
    timestamp: daysAgo(32),
    type: 'circle_movement',
    nucleusId: 'taradale',
    personId: 'p-2',
    personName: 'David Chen',
    description: 'David Chen moved from Supporting to Coordinating',
    details: { from: 'supporting', to: 'coordinating' }
  });
  logEvent({
    timestamp: daysAgo(18),
    type: 'circle_movement',
    nucleusId: 'taradale',
    personId: 'p-7',
    personName: 'Elaine Lopez',
    description: 'Elaine Lopez moved from Aware to Supporting',
    details: { from: 'aware', to: 'supporting' }
  });
}

// ─── End Event Log ───────────────────────────────────────────────

// People registry: id -> Participant
const people: Map<string, Participant> = new Map();

// Initialize from mock data
mockParticipants.forEach((p) => people.set(p.id, { ...p }));

// Concentric circle placements per nucleus: nucleusId -> { level -> personId[] }
const circlePlacements: Map<string, Record<string, string[]>> = new Map();

// Unplaced names per nucleus (new names sidebar)
const unplacedNames: Map<string, string[]> = new Map();

// Nucleus banner images: nucleusId -> dataUrl
const bannerImages: Map<string, string> = new Map();

// Profile banner images: personId -> dataUrl
const profileBannerImages: Map<string, string> = new Map();

// Nucleus notes: nucleusId -> notes string
const nucleusNotes: Map<string, string> = new Map();

// ─── Demo Mode (Blank / Populated Toggle) ────────────────────────

// Save snapshots of original data for restore
const originalNuclei = mockNuclei.map((n) => ({
  ...n,
  engagementCounts: { ...n.engagementCounts }
}));
const originalActivities = mockActivities.map((a) => ({
  ...a,
  participants: { ...a.participants }
}));
const originalPeople = mockParticipants.map((p) => ({
  ...p,
  nuclei: [...p.nuclei],
  courses: [...p.courses],
  capacities: [...p.capacities],
  activities: [...p.activities]
}));

let _isPopulated = true;

export function isPopulatedMode(): boolean {
  return _isPopulated;
}

export function toggleDemoMode(): boolean {
  if (_isPopulated) {
    // Switch to blank mode
    mockNuclei.splice(0, mockNuclei.length);
    mockActivities.splice(0, mockActivities.length);
    people.clear();
    circlePlacements.clear();
    unplacedNames.clear();
    eventLog.length = 0;
    nucleusNotes.clear();
    _isPopulated = false;
  } else {
    // Restore populated mode
    mockNuclei.splice(
      0,
      mockNuclei.length,
      ...originalNuclei.map((n) => ({
        ...n,
        engagementCounts: { ...n.engagementCounts }
      }))
    );
    mockActivities.splice(
      0,
      mockActivities.length,
      ...originalActivities.map((a) => ({
        ...a,
        participants: { ...a.participants }
      }))
    );
    people.clear();
    originalPeople.forEach((p) =>
    people.set(p.id, {
      ...p,
      nuclei: [...p.nuclei],
      courses: [...p.courses],
      capacities: [...p.capacities],
      activities: [...p.activities]
    })
    );
    circlePlacements.clear();
    unplacedNames.clear();
    eventLog.length = 0;
    nucleusNotes.clear();
    seedDemoEvents();
    _isPopulated = true;
  }
  return _isPopulated;
}

// ─── People ──────────────────────────────────────────────────────

export function getPerson(id: string): Participant | undefined {
  return people.get(id);
}

export function getPersonName(id: string): string {
  return people.get(id)?.name || id;
}

export function getAllPeople(): Participant[] {
  return Array.from(people.values());
}

export function getPeopleForNucleus(nucleusId: string): Participant[] {
  return Array.from(people.values()).filter((p) => p.nuclei.includes(nucleusId));
}

export function addPerson(name: string, nucleusId: string): string {
  const id = `person-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const person: Participant = {
    id,
    name,
    nuclei: [nucleusId],
    engagementLevel: 'aware',
    courses: [],
    capacities: [],
    activities: []
  };
  people.set(id, person);
  logEvent({
    type: 'person_created',
    nucleusId,
    personId: id,
    personName: name,
    description: `${name} added to the system`
  });
  return id;
}

export function updatePerson(id: string, updates: Partial<Participant>): void {
  const person = people.get(id);
  if (person) {
    // Detect course changes for logging
    if (updates.courses) {
      const oldCourses = person.courses;
      const newCourses = updates.courses;
      newCourses.forEach((nc) => {
        const old = oldCourses.find((oc) => oc.id === nc.id);
        if (!old && nc.status === 'in-progress') {
          logEvent({
            type: 'course_started',
            nucleusId: person.nuclei[0],
            personId: id,
            personName: person.name,
            description: `${person.name} started ${nc.name}`,
            details: { courseId: nc.id, courseName: nc.name }
          });
        } else if (!old && nc.status === 'completed') {
          logEvent({
            type: 'course_completed',
            nucleusId: person.nuclei[0],
            personId: id,
            personName: person.name,
            description: `${person.name} completed ${nc.name}`,
            details: { courseId: nc.id, courseName: nc.name }
          });
        } else if (
        old &&
        old.status === 'in-progress' &&
        nc.status === 'completed')
        {
          logEvent({
            type: 'course_completed',
            nucleusId: person.nuclei[0],
            personId: id,
            personName: person.name,
            description: `${person.name} completed ${nc.name}`,
            details: { courseId: nc.id, courseName: nc.name }
          });
        }
      });
    }
    people.set(id, { ...person, ...updates });
  }
}

export function personExists(id: string): boolean {
  return people.has(id);
}

// ─── Activities ──────────────────────────────────────────────────

export function getAllActivities(): Activity[] {
  return [...mockActivities];
}

export function getActivitiesForNucleus(nucleusId: string): Activity[] {
  return mockActivities.filter((a) => a.nucleusId === nucleusId);
}

export function getActivity(id: string): Activity | undefined {
  return mockActivities.find((a) => a.id === id);
}

export function addActivity(activity: Activity): void {
  mockActivities.push(activity);
  const nucleusName =
  mockNuclei.find((n) => n.id === activity.nucleusId)?.name ||
  activity.nucleusId;
  logEvent({
    type: 'activity_created',
    nucleusId: activity.nucleusId,
    activityId: activity.id,
    description: `${activity.name} started in ${nucleusName}`,
    details: { activityName: activity.name, activityType: activity.type }
  });
}

export function updateActivity(
activityId: string,
updates: Partial<Activity>)
: void {
  const idx = mockActivities.findIndex((a) => a.id === activityId);
  if (idx !== -1) {
    mockActivities[idx] = { ...mockActivities[idx], ...updates };
  }
}

export function updateActivityParticipants(
activityId: string,
participants: Record<string, string[]>)
: void {
  const idx = mockActivities.findIndex((a) => a.id === activityId);
  if (idx !== -1) {
    const activity = mockActivities[idx];
    const oldParticipants = activity.participants;

    // Detect added participants
    Object.entries(participants).forEach(([role, ids]) => {
      const oldIds = oldParticipants[role] || [];
      ids.forEach((id) => {
        if (!oldIds.includes(id)) {
          logEvent({
            type: 'participant_added',
            nucleusId: activity.nucleusId,
            activityId,
            personId: id,
            personName: getPersonName(id),
            description: `${getPersonName(id)} joined ${activity.name} as ${role}`,
            details: { activityName: activity.name, role }
          });
        }
      });
    });

    // Detect removed participants
    Object.entries(oldParticipants).forEach(([role, oldIds]) => {
      const newIds = participants[role] || [];
      oldIds.forEach((id) => {
        if (!newIds.includes(id)) {
          logEvent({
            type: 'participant_removed',
            nucleusId: activity.nucleusId,
            activityId,
            personId: id,
            personName: getPersonName(id),
            description: `${getPersonName(id)} removed from ${activity.name}`,
            details: { activityName: activity.name, role }
          });
        }
      });
    });

    mockActivities[idx] = { ...mockActivities[idx], participants };
  }
}

// ─── Circle Placements ───────────────────────────────────────────

export function getCirclePlacements(
nucleusId: string)
: Record<string, string[]> | null {
  return circlePlacements.get(nucleusId) || null;
}

export function saveCirclePlacements(
nucleusId: string,
placements: Record<string, string[]>)
: void {
  const old = circlePlacements.get(nucleusId);
  if (old) {
    // Detect movements between levels
    const levels = ['coordinating', 'supporting', 'participating', 'aware'];
    const oldMap: Record<string, string> = {};
    const newMap: Record<string, string> = {};
    levels.forEach((level) => {
      ;(old[level] || []).forEach((id) => {
        oldMap[id] = level;
      });
      (placements[level] || []).forEach((id) => {
        newMap[id] = level;
      });
    });
    Object.entries(newMap).forEach(([personId, newLevel]) => {
      const oldLevel = oldMap[personId];
      if (oldLevel && oldLevel !== newLevel) {
        logEvent({
          type: 'circle_movement',
          nucleusId,
          personId,
          personName: getPersonName(personId),
          description: `${getPersonName(personId)} moved from ${oldLevel.charAt(0).toUpperCase() + oldLevel.slice(1)} to ${newLevel.charAt(0).toUpperCase() + newLevel.slice(1)}`,
          details: { from: oldLevel, to: newLevel }
        });
      }
    });
  }
  circlePlacements.set(nucleusId, placements);
}

export function getUnplacedNames(nucleusId: string): string[] {
  return unplacedNames.get(nucleusId) || [];
}

export function saveUnplacedNames(nucleusId: string, ids: string[]): void {
  unplacedNames.set(nucleusId, ids);
}

// ─── Nucleus Notes ───────────────────────────────────────────────

export function getNucleusNotes(nucleusId: string): string {
  return nucleusNotes.get(nucleusId) || '';
}

export function setNucleusNotes(nucleusId: string, notes: string): void {
  nucleusNotes.set(nucleusId, notes);
}

// ─── Banner Images ───────────────────────────────────────────────

export function getBannerImage(nucleusId: string): string | null {
  return bannerImages.get(nucleusId) || null;
}

export function setBannerImage(nucleusId: string, dataUrl: string): void {
  bannerImages.set(nucleusId, dataUrl);
}

// ─── Profile Banner Images ───────────────────────────────────────

export function getProfileBannerImage(personId: string): string | null {
  return profileBannerImages.get(personId) || null;
}

export function setProfileBannerImage(personId: string, dataUrl: string): void {
  profileBannerImages.set(personId, dataUrl);
}

// ─── Person Notes ────────────────────────────────────────────────

const personNotes: Map<string, string> = new Map();

export function getPersonNotes(personId: string): string {
  return personNotes.get(personId) || '';
}

export function setPersonNotes(personId: string, notes: string): void {
  personNotes.set(personId, notes);
}

// ─── Timeline ────────────────────────────────────────────────────
// Cycles default to 3-month intervals starting Apr 20, 2026.
// Users can adjust boundaries and add events.

const TIMELINE_START = new Date(2026, 3, 20); // Apr 20, 2026

function generateDefaultCycles(
startDate: Date,
count: number)
: TimelineCycle[] {
  const cycles: TimelineCycle[] = [];
  let current = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const end = new Date(current);
    end.setMonth(end.getMonth() + 3);
    end.setDate(end.getDate() - 1);
    cycles.push({
      id: `cycle-${i + 1}`,
      startDate: new Date(current),
      endDate: end,
      label: `Cycle ${i + 1}`
    });
    const next = new Date(current);
    next.setMonth(next.getMonth() + 3);
    current = next;
  }
  return cycles;
}

// Generate enough cycles to cover several years
const timelineCycles: TimelineCycle[] = generateDefaultCycles(
  TIMELINE_START,
  40
);
const timelineEvents: TimelineEvent[] = [];

export function getTimelineStart(): Date {
  return new Date(TIMELINE_START);
}

export function getTimelineCycles(): TimelineCycle[] {
  return timelineCycles.map((c) => ({
    ...c,
    startDate: new Date(c.startDate),
    endDate: new Date(c.endDate)
  }));
}

export function updateCycleBoundary(
cycleId: string,
newStart?: Date,
newEnd?: Date)
: void {
  const cycle = timelineCycles.find((c) => c.id === cycleId);
  if (!cycle) return;
  if (newStart) cycle.startDate = new Date(newStart);
  if (newEnd) cycle.endDate = new Date(newEnd);
}

export function getTimelineEvents(options?: {
  clusterId?: string;
  startDate?: Date;
  endDate?: Date;
}): TimelineEvent[] {
  let filtered = [...timelineEvents];
  if (options?.clusterId) {
    filtered = filtered.filter(
      (e) => !e.clusterId || e.clusterId === options.clusterId
    );
  }
  if (options?.startDate) {
    filtered = filtered.filter(
      (e) =>
      e.startDate >= options.startDate! ||
      e.endDate && e.endDate >= options.startDate!
    );
  }
  if (options?.endDate) {
    filtered = filtered.filter((e) => e.startDate <= options.endDate!);
  }
  return filtered.map((e) => ({
    ...e,
    startDate: new Date(e.startDate),
    endDate: e.endDate ? new Date(e.endDate) : undefined
  }));
}

export function addTimelineEvent(
event: Omit<TimelineEvent, 'id'>)
: TimelineEvent {
  const newEvent: TimelineEvent = {
    ...event,
    id: `tl-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  };
  timelineEvents.push(newEvent);
  return { ...newEvent };
}

export function removeTimelineEvent(eventId: string): void {
  const idx = timelineEvents.findIndex((e) => e.id === eventId);
  if (idx !== -1) timelineEvents.splice(idx, 1);
}

export function updateTimelineEvent(
eventId: string,
updates: Partial<Omit<TimelineEvent, 'id'>>)
: void {
  const event = timelineEvents.find((e) => e.id === eventId);
  if (!event) return;
  if (updates.name !== undefined) event.name = updates.name;
  if (updates.startDate !== undefined) event.startDate = updates.startDate;
  if (updates.endDate !== undefined) event.endDate = updates.endDate;
  if (updates.clusterId !== undefined) event.clusterId = updates.clusterId;
  if (updates.nucleusId !== undefined) event.nucleusId = updates.nucleusId;
  if (updates.location !== undefined) event.location = updates.location;
}

// ─── Initialize ──────────────────────────────────────────────────
// Seed demo events on module load
seedDemoEvents();

// Seed timeline events
function seedTimelineEvents() {
  const d = (month: number, day: number) => new Date(2026, month - 1, day);

  const sampleEvents: Array<{
    name: string;
    start: Date;
    end?: Date;
    regional?: boolean;
  }> = [
  {
    name: 'Indigenous/Neighbourhood Youth SLBC Camp',
    start: d(5, 1),
    end: d(5, 3)
  },
  { name: 'Cluster Reflection Gathering', start: d(5, 3) },
  {
    name: 'Home Visit Campaign for Indigenous/Neighborhood Youth',
    start: d(5, 4),
    end: d(5, 15)
  },
  {
    name: 'Regional Gathering',
    start: d(5, 8),
    end: d(5, 10),
    regional: true
  },
  {
    name: 'Regional BK5 Animator Training Camp',
    start: d(5, 15),
    end: d(5, 18),
    regional: true
  },
  {
    name: 'Consultations with neighbourhood nuclei',
    start: d(5, 18),
    end: d(5, 23)
  },
  { name: "Nuclei Collaborators' Gathering", start: d(5, 23) },
  {
    name: 'Expansion phase for neighbourhoods',
    start: d(5, 23),
    end: d(6, 6)
  },
  {
    name: 'Indigenous/Neighbourhood Youth BK3 SLBC Camp',
    start: d(6, 12),
    end: d(6, 14)
  },
  {
    name: 'Indigenous/Neighbourhood Youth SLBC Camp',
    start: d(7, 13),
    end: d(7, 22)
  },
  {
    name: 'Indigenous/Neighbourhood Youth Expansion Phase',
    start: d(7, 23),
    end: d(8, 2)
  },
  { name: 'Bk 7 Youth Teaching Project', start: d(7, 26), end: d(8, 6) },
  {
    name: 'Indigenous/Neighbourhood Youth Conference/Book 1',
    start: d(7, 31),
    end: d(8, 2)
  },
  {
    name: 'Indigenous/Neighbourhood Youth Consolidation Phase',
    start: d(8, 3),
    end: d(8, 11)
  },
  { name: 'Youth Conference', start: d(8, 7), end: d(8, 9) },
  { name: 'ISGP', start: d(8, 12), end: d(8, 22) }];


  for (const evt of sampleEvents) {
    timelineEvents.push({
      id: `tl-seed-${Math.random().toString(36).slice(2, 9)}`,
      name: evt.name,
      startDate: evt.start,
      endDate: evt.end,
      clusterId: evt.regional ? 'regional' : 'calgary'
    });
  }
}

seedTimelineEvents();