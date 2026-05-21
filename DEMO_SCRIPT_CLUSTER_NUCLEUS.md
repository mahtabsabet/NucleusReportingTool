# Demo Script — Cluster & Nucleus Level Users

A walkthrough for presenting the Nucleus Reporting Tool to cluster coordinators
and nucleus coordinators for the first time. You are presenting from your
**Super Admin** account, so you can see everything — this guide flags where a
real cluster or nucleus user would see **less** than you.

> **Two messages to land throughout:**
> 1. **The system works, but it's empty.** Everything you'll see is live and
>    functional. The data is sparse because it hasn't been populated yet.
> 2. **It only becomes valuable if they fill it.** The tool reflects the
>    grassroots reality these coordinators already know. Its job is to make that
>    reality visible, plannable, and shareable — but only once they (and the
>    friends they work with) put the real activities and people into it.

> **Out of scope for this demo:** The **LSA / household** layer. These users
> don't have access to that level, so skip anything under "Households" or LSA
> views entirely. Don't navigate there, even by accident.

---

## 0. Before you start (your prep, not shown)

- Log in on your Super Admin account.
- Have one cluster and at least one nucleus with a *little* sample data ready —
  enough to show the shape of a feature, not so much that it looks "finished."
  Empty-but-functional is the honest and intended impression.
- Decide on one nucleus you'll use as the "worked example" so the demo has a
  through-line.
- Close any tabs showing LSA / household data.

---

## 1. Opening framing (2 minutes, no clicking)

Say something like:

> "What you're about to see is a working system. It's deliberately mostly empty
> right now — think of it as a freshly built house with the lights on but no
> furniture. Nothing here is a mock-up; every button does what it says. The
> reason it looks sparse is that the data comes from you and the friends working
> at the grassroots. The tool's whole purpose is to take what's already
> happening in your neighborhoods and make it visible — so we can see growth,
> plan cycles, and support activities. It can't do that until it's populated, and
> keeping it accurate is an ongoing, shared effort."

Then set the access expectation:

> "I'm logged in as an administrator, so I can see across the whole cluster (and
> beyond). When you log in, you'll see a focused slice — your cluster, or your
> nucleus, or a single activity. I'll point out those differences as we go."

---

## 2. The Cluster Map — the big picture

**Navigate to:** the map view (the default landing page on desktop).

**Show:**
- The geographic layout of the cluster, with nuclei pinned on the map.
- Color-coding by engagement level (Aware / Participating / Supporting /
  Coordinating).
- Click a nucleus pin to open its dashboard.

**Say:** "This is the cluster at a glance. Each pin is a nucleus — a
neighborhood. The colors show how engaged each one is. Right now there are only
a few pins; the vision is that this map fills in as nuclei form and report."

**Access caveats — what differs from your view:**
- **A cluster coordinator** sees this same map, but only for **their** cluster,
  and can create/edit nuclei within it.
- **A nucleus coordinator** does **not** see the cluster map at all. They log in
  and land directly on their own nucleus dashboard — they can't see sibling
  nuclei or pan around the cluster.
- **An activity lead** sees neither the map nor the nucleus dashboard — they land
  on their single activity.

---

## 3. The Nucleus Dashboard — the heart of the tool

**Navigate to:** click into your worked-example nucleus.

This is the screen a nucleus coordinator lives in. Walk through its tabs:

### 3a. Circles (concentric engagement)
- Show the concentric circles: **Aware → Participating → Supporting →
  Coordinating**.
- Demonstrate dragging a person from one circle to the next to show how
  engagement is tracked over time.
- Mention the "primary contact" designation.

**Say:** "This is how we picture a person's journey of engagement — from being
aware, to participating, to supporting, to helping coordinate. Moving someone
here isn't paperwork; it reflects a real relationship growing. This is empty
until you add the people you're actually accompanying."

### 3b. Network
- Show the network graph of people and the activities connecting them.

**Say:** "A visual of who's connected to what in this neighborhood."

### 3c. Activities
- Show the list of activities and create one live (a children's class, a junior
  youth group, a study circle, or a devotional).
- Add a participant and assign a role (teacher, tutor, animator, child, parent,
  etc.).
- Note the current course/book an activity is working through.

**Say:** "These are the core activities — children's classes, junior youth
groups, study circles, devotional gatherings. This is the most important thing
to keep current. Everything else — reports, growth, the map colors — flows from
activities being entered honestly and kept up to date."

### 3d. Capacities
- Show the aggregated skills/roles available in the nucleus.

### 3e. Notes
- Show free-text notes on the nucleus.

**Access caveats:**
- **A nucleus coordinator** has full create/edit on activities and people **in
  their nucleus**, and can move people between circles.
- **An activity lead** can manage participants for **their one activity** only —
  they don't get the dashboard or the circles. They *can* open a participant's
  full profile (including that person's involvement in other activities).
- **A cluster coordinator** can do all of the above across every nucleus in their
  cluster.

---

## 4. A Person's Profile — curriculum and journey

**Navigate to:** click a participant's name to open their individual profile.

**Show:**
- Their activities and roles.
- **Curriculum progress** — Ruhi books (1–14), branch courses, and JY texts,
  with in-progress / completed status.
- Capacities, notes.

**Say:** "Each person has a profile that travels with them. We can see which
books they've studied and which they're in the middle of. This is how we track
the development of human resources over time."

**Privacy note worth mentioning out loud:**
> "For minors, the system only stores a first name — no email, no phone. That's
> built in at the data level, not just hidden. Privacy of children and junior
> youth is protected by design."

---

## 5. The Timeline — planning by cycles

**Navigate to:** the cluster timeline workspace, then the nucleus timeline.

**Show (cluster timeline):**
- The multi-year calendar organized into **three-month cycles**.
- Cluster-wide events and meetings, with notes/documents attached.

**Show (nucleus timeline):**
- Activity occurrences appearing automatically from recurring activities.
- Locally added events and meetings.

**Say:** "Planning happens in cycles. The timeline lets us see the rhythm of
activities, expansion phases, and reflection meetings — at both the cluster and
nucleus level."

**Access caveats:**
- **Cluster coordinators** manage the cluster cycles and cluster-level events.
- **Nucleus coordinators** see and add events on **their** nucleus timeline, but
  can't edit the cluster's cycle structure.

---

## 6. Reports — what the data gives back

This is where you tie the "populate it" message together — reports are the payoff
for keeping data current.

**Show:**
- **Activity Type Report** (`/report/...`) — every children's class, JY group,
  study circle, or devotional in a tabular view.
- **Cluster Profile** — curriculum progress and capacities aggregated across all
  nuclei.
- **Growth Report** — a log of what's happened: activities created, participants
  added, people moving between circles, courses started and completed.

**Say:** "These reports are automatic. Nobody compiles them by hand — they're a
direct readout of the activities and people you enter. An empty system produces
empty reports. A well-tended one tells the real story of the cluster's growth.
This is the 'why bother' answer: the more faithfully it's kept, the more useful
this becomes for planning and for sharing the picture upward."

**Access caveats:**
- **Cluster coordinators** see cluster-wide reports.
- **Nucleus coordinators** get a **per-nucleus** growth report — scoped to their
  neighborhood, not the whole cluster.

---

## 7. Users & roles — who gets to see and do what

**Navigate to:** User Management.

**Show (briefly):** how users are created and assigned roles/scopes.

**Say — summarize the role model out loud:**

| Role | Sees | Can do |
|------|------|--------|
| **Administrator** (you, today) | Everything, all clusters | Full read/write, manage users |
| **Cluster Coordinator** | One whole cluster | Create nuclei, activities, people; manage cluster cycles; assign nucleus coordinators & activity leads |
| **Nucleus Coordinator** | One nucleus | Manage that nucleus's activities, people, circles, timeline; assign activity leads |
| **Activity Lead** | One activity | Manage that activity's participants and their profiles |
| **Regional (View-Only)** | Everything | Read-only, no edits |

> "The point: people only see and touch what's theirs. A nucleus coordinator
> isn't distracted by the rest of the cluster; an activity lead just sees their
> group. It keeps things focused and keeps data stewardship close to the people
> who actually know the reality on the ground."

**Built-in safeguards worth a sentence:**
- You can't accidentally lock yourself out (no self-demotion / self-delete).
- Sensitive actions (deletes, role changes, password resets) require typed
  confirmation.
- Cluster and nucleus coordinators submit deletion *requests* rather than
  deleting directly.

---

## 8. Closing — the ask

Bring it home:

> "So — the system is real, it's live, and it works. What it doesn't have yet is
> *your* reality inside it. None of this is useful until the activities, the
> people, and their journeys are entered and kept current. That's the work ahead,
> and it's shared: it depends on the friends at the grassroots reporting what's
> happening, and on coordinators tending the picture. If we do that, this becomes
> a genuine tool for seeing growth, planning cycles, and supporting one another —
> instead of just another form to fill in."

**Invite questions**, and offer to help them get their first nucleus and a couple
of activities entered so they leave with something concrete.

---

## Quick reference — "Can they see this?" cheat sheet

| Feature | Cluster Coordinator | Nucleus Coordinator | Activity Lead |
|---------|:---:|:---:|:---:|
| Cluster map | ✅ (own cluster) | ❌ | ❌ |
| Create/edit nuclei | ✅ | ❌ | ❌ |
| Nucleus dashboard (circles, network, activities, capacities, notes) | ✅ (all nuclei) | ✅ (own nucleus) | ❌ |
| Move people between circles | ✅ | ✅ | ❌ |
| Activity detail / participants | ✅ | ✅ | ✅ (own activity) |
| Person profiles & curriculum | ✅ | ✅ | ✅ (read full profile) |
| Cluster timeline & cycles | ✅ | view only | ❌ |
| Nucleus timeline | ✅ | ✅ | ❌ |
| Cluster-wide reports | ✅ | ❌ | ❌ |
| Per-nucleus growth report | ✅ | ✅ | ❌ |
| Create users / assign roles | ✅ (within cluster) | ✅ (activity leads) | ❌ |
| **LSA / household layer** | **excluded from this demo** | **excluded** | **excluded** |
