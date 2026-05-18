// ============================================================
// Side drawer for a single household. Occupies the same slot as
// the cluster map's left menu, deliberately — when an LSA flips
// the toggle to Households, the geography becomes the focus and
// the menu becomes the per-household detail panel.
//
// Capabilities (matches the LSA brief):
//   * Edit display_name / address / notes / coordinates
//   * Archive / restore
//   * Add household members (unlinked or linked-to-profile)
//   * Edit / unlink / delete household members
//   * "Move this household" — re-pin on the map (handled by the
//     parent via the onStartMove callback)
// ============================================================

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  XIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoveIcon,
  Trash2Icon,
  UserPlusIcon,
  Link2Icon,
  Link2OffIcon,
  SaveIcon,
  EditIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MapPinOffIcon,
  MailIcon,
  PhoneIcon,
  SmartphoneIcon,
} from 'lucide-react';
import {
  fetchHouseholdWithMembers,
  updateHousehold,
  archiveHousehold,
  unarchiveHousehold,
  createHouseholdMember,
  updateHouseholdMember,
  deleteHouseholdMember,
  suggestPersonMatches,
  type HouseholdWithMembers,
  type HouseholdMember,
  type PersonMatchSuggestion,
} from '../../lib/db/households';
import { geocodeAddressForCluster } from '../../lib/geocoder';

interface Props {
  householdId: string;
  jurisdictionId: string;
  clusterName: string;
  onClose: () => void;
  onStartMove: (householdId: string) => void;
  onChanged: () => void;
}

export function HouseholdDrawer({
  householdId,
  jurisdictionId,
  clusterName,
  onClose,
  onStartMove,
  onChanged,
}: Props) {
  const [data, setData] = useState<HouseholdWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-match scan: for each unlinked member with a name, query
  // the community-building side for possible matches. Surfaced
  // proactively on the row so the LSA doesn't have to click the
  // link icon to discover matches member by member.
  const [matches, setMatches] = useState<Map<string, PersonMatchSuggestion[]>>(new Map());

  async function scanMatches(members: HouseholdMember[]) {
    const candidates = members.filter(m => !m.linkedPersonId && (m.displayName ?? '').trim());
    if (candidates.length === 0) { setMatches(new Map()); return; }
    const results = await Promise.all(
      candidates.map(m =>
        suggestPersonMatches(m.displayName!, jurisdictionId, { limit: 3 })
          .then(s => [m.id, s] as const)
          .catch(() => [m.id, [] as PersonMatchSuggestion[]] as const),
      ),
    );
    setMatches(new Map(results.filter(([, s]) => s.length > 0)));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMatches(new Map());
    fetchHouseholdWithMembers(householdId)
      .then(d => {
        if (cancelled) return;
        setData(d);
        if (d) {
          setName(d.displayName);
          setAddress(d.addressLine ?? '');
          setNotes(d.notes ?? '');
          scanMatches(d.members);
        }
      })
      .catch(e => !cancelled && setError(e.message ?? 'Failed to load household'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [householdId, jurisdictionId]);

  async function reload() {
    const d = await fetchHouseholdWithMembers(householdId);
    setData(d);
    if (d) await scanMatches(d.members);
    onChanged();
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true); setError(null);
    try {
      const trimmedAddress = address.trim();
      const addressChanged = trimmedAddress !== (data.addressLine ?? '');

      // If the address changed (or was cleared), the previous pin is
      // stale. Try to re-geocode; on success update lat/lng, on
      // failure null them so the household flags as "needs attention"
      // in the sidebar rather than sitting at a wrong location.
      const update: {
        displayName: string;
        addressLine: string | null;
        notes: string | null;
        lat?: number | null;
        lng?: number | null;
      } = {
        displayName: name.trim(),
        addressLine: trimmedAddress || null,
        notes: notes.trim() || null,
      };

      if (addressChanged) {
        if (!trimmedAddress) {
          update.lat = null;
          update.lng = null;
        } else {
          try {
            const hit = await geocodeAddressForCluster(trimmedAddress, clusterName);
            update.lat = hit?.lat ?? null;
            update.lng = hit?.lng ?? null;
          } catch {
            update.lat = null;
            update.lng = null;
          }
        }
      }

      await updateHousehold(householdId, update);
      setEditing(false);
      await reload();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!data) return;
    setSaving(true); setError(null);
    try {
      if (data.archivedAt) await unarchiveHousehold(householdId);
      else await archiveHousehold(householdId);
      await reload();
    } catch (e: any) {
      setError(e.message ?? 'Archive failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="bg-white border-r border-gray-200 overflow-y-auto shadow-sm flex flex-col w-80 lg:w-96 relative">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Household</h2>
        <button
          onClick={onClose}
          aria-label="Close household drawer"
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
          <LoaderIcon className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !data ? (
        <div className="p-6 text-sm text-gray-500">Household not found.</div>
      ) : (
        <div className="p-5 space-y-5">
          {data.archivedAt && (
            <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-700 inline-block">
              Archived
            </div>
          )}

          {/* Identity & address */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Display name
              </label>
              {editing ? (
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              ) : (
                <div className="text-base font-semibold text-gray-900">{data.displayName}</div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Address
              </label>
              {editing ? (
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="123 Example St, City"
                />
              ) : (
                <div className="text-sm text-gray-700">
                  {data.addressLine || <span className="text-gray-400 italic">No address recorded</span>}
                </div>
              )}
              {data.lat != null && data.lng != null ? (
                <div className="text-[11px] text-gray-400 mt-1">
                  {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
                </div>
              ) : (
                <div className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1">
                  <MapPinOffIcon className="w-3 h-3" />
                  {data.addressLine ? 'Not pinned yet — edit the address to retry, or use Move pin to drop one manually.' : 'No address recorded — add one above to enable pinning.'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Notes
              </label>
              {editing ? (
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              ) : (
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {data.notes || <span className="text-gray-400 italic">No notes</span>}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 text-white text-xs font-semibold rounded-lg hover:bg-amber-800 disabled:opacity-50">
                  <SaveIcon className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setName(data.displayName);
                    setAddress(data.addressLine ?? '');
                    setNotes(data.notes ?? '');
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                  <EditIcon className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => onStartMove(householdId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                  <MoveIcon className="w-3.5 h-3.5" /> Move pin
                </button>
                <button
                  onClick={handleArchiveToggle}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                  {data.archivedAt
                    ? <><ArchiveRestoreIcon className="w-3.5 h-3.5" /> Restore</>
                    : <><ArchiveIcon className="w-3.5 h-3.5" /> Archive</>}
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Members */}
          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              Household members
            </h3>
            <MembersList
              members={data.members}
              jurisdictionId={jurisdictionId}
              householdId={householdId}
              matches={matches}
              onChanged={reload}
            />
            <AddMemberForm
              householdId={householdId}
              jurisdictionId={jurisdictionId}
              onAdded={reload}
            />
          </div>
        </div>
      )}
    </aside>
  );
}


function MembersList({
  members,
  householdId: _householdId,
  jurisdictionId,
  matches,
  onChanged,
}: {
  members: HouseholdMember[];
  householdId: string;
  jurisdictionId: string;
  matches: Map<string, PersonMatchSuggestion[]>;
  onChanged: () => Promise<void> | void;
}) {
  if (members.length === 0) {
    return <div className="text-xs text-gray-400 italic mb-3">No members yet.</div>;
  }
  return (
    <ul className="space-y-2 mb-4">
      {members.map(m => (
        <MemberRow
          key={m.id}
          member={m}
          jurisdictionId={jurisdictionId}
          suggestions={matches.get(m.id) ?? []}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}


function MemberRow({
  member,
  jurisdictionId,
  suggestions,
  onChanged,
}: {
  member: HouseholdMember;
  jurisdictionId: string;
  suggestions: PersonMatchSuggestion[];
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(member.displayName ?? '');
  const [editRelationship, setEditRelationship] = useState(member.relationship ?? '');
  const [editEmail, setEditEmail] = useState(member.email ?? '');
  const [editPhone, setEditPhone] = useState(member.phone ?? '');
  const [editMobile, setEditMobile] = useState(member.mobile ?? '');

  async function handleSaveMember() {
    setBusy(true);
    try {
      await updateHouseholdMember(member.id, {
        // Display name can only be cleared if a linked profile exists
        // (the check_constraint requires one or the other). The form
        // disables the Save button when both would be empty.
        displayName: editName.trim() || (member.linkedPersonId ? null : member.displayName),
        relationship: editRelationship.trim() || null,
        email:  editEmail.trim()  || null,
        phone:  editPhone.trim()  || null,
        mobile: editMobile.trim() || null,
      });
      setEditing(false);
      await onChanged();
    } finally { setBusy(false); }
  }

  function cancelEdit() {
    setEditName(member.displayName ?? '');
    setEditRelationship(member.relationship ?? '');
    setEditEmail(member.email ?? '');
    setEditPhone(member.phone ?? '');
    setEditMobile(member.mobile ?? '');
    setEditing(false);
  }

  async function handleUnlink() {
    setBusy(true);
    try {
      // Keep display_name; null the linked_person_id.
      const name = member.displayName ?? '';
      await updateHouseholdMember(member.id, {
        linkedPersonId: null,
        // If there's no display_name to fall back on, copy nothing — the
        // check constraint requires at least one. The UI prevents the
        // unlink button from rendering in that case.
        displayName: name || null,
      });
      await onChanged();
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!confirm('Remove this person from the household?')) return;
    setBusy(true);
    try {
      await deleteHouseholdMember(member.id);
      await onChanged();
    } finally { setBusy(false); }
  }

  const navigate = useNavigate();
  const label = member.displayName?.trim() || '(linked profile)';
  const canUnlink = !!member.linkedPersonId && !!member.displayName?.trim();

  // When the user clicks a linked member's name, open the ordinary
  // person-profile page. The IndividualProfile component already
  // renders a Back button at the top that does navigate(-1), which
  // returns to this map view; the map reads ?household=<id> from
  // the URL on mount and reopens this drawer, so the round-trip
  // feels seamless even though the profile page is in a different
  // part of the route tree.
  const openLinkedProfile = () => {
    if (member.linkedPersonId) navigate(`/individual/${member.linkedPersonId}`);
  };

  return (
    <li className="rounded-lg border border-gray-100 px-3 py-2 bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {member.linkedPersonId ? (
            <button
              onClick={openLinkedProfile}
              title="Open this person's profile"
              className="group flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:text-emerald-900 hover:underline truncate text-left max-w-full">
              <span className="truncate">{label}</span>
              <ExternalLinkIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          ) : (
            <div className="text-sm font-medium text-gray-900 truncate">{label}</div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {member.relationship && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {member.relationship}
              </span>
            )}
            {member.linkedPersonId ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                <Link2Icon className="w-3 h-3" /> Linked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Unlinked
              </span>
            )}
          </div>
          {/* Contact info — visible to LSA members. Distinct from any
              contact details on the linked community-building profile. */}
          {!editing && (member.email || member.phone || member.mobile) && (
            <div className="flex flex-col gap-0.5 mt-1.5">
              {member.email && (
                <a
                  href={`mailto:${member.email}`}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-amber-700 hover:underline truncate">
                  <MailIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{member.email}</span>
                </a>
              )}
              {member.phone && (
                <a
                  href={`tel:${member.phone}`}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-amber-700 hover:underline">
                  <PhoneIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  {member.phone}
                </a>
              )}
              {member.mobile && (
                <a
                  href={`tel:${member.mobile}`}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-amber-700 hover:underline">
                  <SmartphoneIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  {member.mobile}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={busy}
              title="Edit member"
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-white rounded">
              <EditIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {!member.linkedPersonId && member.displayName && (
            <button
              onClick={() => setShowLink(v => !v)}
              disabled={busy}
              title="Suggest matches to existing profiles"
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-white rounded">
              <Link2Icon className="w-3.5 h-3.5" />
            </button>
          )}
          {canUnlink && (
            <button
              onClick={handleUnlink}
              disabled={busy}
              title="Unlink from profile"
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-white rounded">
              <Link2OffIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={busy}
            title="Remove from household"
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-white rounded">
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-1.5 border-t border-gray-200 pt-2">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Display name"
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
          <input
            value={editRelationship}
            onChange={e => setEditRelationship(e.target.value)}
            placeholder="Role / relationship (optional)"
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
          <input
            value={editEmail}
            onChange={e => setEditEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
          <input
            value={editPhone}
            onChange={e => setEditPhone(e.target.value)}
            type="tel"
            placeholder="Phone (home/landline)"
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
          <input
            value={editMobile}
            onChange={e => setEditMobile(e.target.value)}
            type="tel"
            placeholder="Mobile"
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveMember}
              disabled={busy || (!editName.trim() && !member.linkedPersonId)}
              className="flex-1 px-3 py-1 text-[11px] font-semibold rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50">
              Save
            </button>
            <button
              onClick={cancelEdit}
              disabled={busy}
              className="px-3 py-1 text-[11px] font-semibold rounded border border-gray-200 text-gray-700 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Proactive auto-match banner: rendered when the background
          scan in HouseholdDrawer found one or more possible community-
          side profiles for this member. Click opens the same review
          panel as the manual link icon does. Hidden once the member
          is linked, while editing, or once the panel is already open. */}
      {!member.linkedPersonId && !editing && !showLink && suggestions.length > 0 && (
        <button
          onClick={() => setShowLink(true)}
          className="mt-2 w-full text-left rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 hover:bg-emerald-100 transition-colors">
          <div className="text-[11px] font-semibold text-emerald-800 inline-flex items-center gap-1.5">
            <Link2Icon className="w-3 h-3" />
            {suggestions.length === 1 ? '1 possible match' : `${suggestions.length} possible matches`} — Review and link
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5 truncate">
            Top: <span className="font-medium">{suggestions[0].name}</span>
            <span className="text-emerald-600 ml-1">
              ({suggestions[0].matchedOn === 'exact' ? 'exact match' : suggestions[0].matchedOn === 'prefix' ? 'starts with this name' : 'name contains this'})
            </span>
          </div>
        </button>
      )}

      {showLink && member.displayName && (
        <LinkSuggestionPanel
          memberId={member.id}
          searchName={member.displayName}
          jurisdictionId={jurisdictionId}
          onLinked={async () => {
            setShowLink(false);
            await onChanged();
          }}
          onClose={() => setShowLink(false)}
        />
      )}
    </li>
  );
}


function LinkSuggestionPanel({
  memberId,
  searchName,
  jurisdictionId,
  onLinked,
  onClose,
}: {
  memberId: string;
  searchName: string;
  jurisdictionId: string;
  onLinked: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(searchName);
  const [results, setResults] = useState<PersonMatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      suggestPersonMatches(query, jurisdictionId)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query, jurisdictionId]);

  async function handleLink(personId: string) {
    setBusy(true);
    try {
      await updateHouseholdMember(memberId, { linkedPersonId: personId });
      await onLinked();
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search profiles in cluster…"
          className="flex-1 rounded border border-emerald-200 px-2 py-1 text-xs bg-white"
        />
        <button
          onClick={onClose}
          className="text-xs text-emerald-700 hover:underline">Close</button>
      </div>
      {loading ? (
        <div className="text-[11px] text-gray-500 italic">Searching…</div>
      ) : results.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic leading-snug">
          No matches found. Try a different spelling, or search by just a last name or first name.
        </div>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {results.map(r => (
            <li key={r.personId} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-emerald-100">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{r.name}</div>
                <div className="text-[10px] text-gray-500 truncate">
                  {r.matchedOn === 'exact' ? 'exact match' : r.matchedOn === 'prefix' ? 'starts with' : 'contains'}
                  {r.ageGroup ? ` · ${r.ageGroup.replace('_', ' ')}` : ''}
                  {r.nuclei.length > 0 ? ` · ${r.nuclei.join(', ')}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleLink(r.personId)}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Link2Icon className="w-3 h-3" /> Link
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function AddMemberForm({
  householdId,
  jurisdictionId,
  onAdded,
}: {
  householdId: string;
  jurisdictionId: string;
  onAdded: () => Promise<void> | void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PersonMatchSuggestion[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = displayName.trim();
      if (q.length < 2) { setSuggestions([]); return; }
      suggestPersonMatches(q, jurisdictionId, { limit: 4 })
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [displayName, jurisdictionId]);

  async function handleAdd(linkedPersonId?: string) {
    setBusy(true); setError(null);
    try {
      await createHouseholdMember({
        householdId,
        displayName: displayName.trim() || null,
        linkedPersonId: linkedPersonId ?? null,
        relationship: relationship.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
      });
      setDisplayName('');
      setRelationship('');
      setEmail('');
      setPhone('');
      setMobile('');
      setShowContact(false);
      setSuggestions([]);
      await onAdded();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add member');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <UserPlusIcon className="w-3.5 h-3.5 text-amber-700" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
          Add a member
        </span>
      </div>
      <input
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="Type a name"
        className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <input
        value={relationship}
        onChange={e => setRelationship(e.target.value)}
        placeholder="Role / relationship (optional)"
        className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        type="button"
        onClick={() => setShowContact(v => !v)}
        className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 self-start">
        {showContact ? '− Hide contact info' : '+ Add contact info'}
      </button>
      {showContact && (
        <div className="space-y-1.5">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            type="tel"
            placeholder="Phone (home/landline)"
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            type="tel"
            placeholder="Mobile"
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      )}
      <p className="text-[10px] text-amber-800/80 leading-snug">
        We'll show possible matches from existing person profiles as you type. Click <strong>Link &amp; add</strong> on a match, or <strong>Add as unlinked</strong> if no match exists.
      </p>
      {suggestions.length > 0 && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 mb-1">
            Possible matches in this cluster
          </div>
          <ul className="space-y-1">
            {suggestions.map(s => (
              <li key={s.personId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">{s.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {s.matchedOn === 'exact' ? 'exact' : s.matchedOn === 'prefix' ? 'starts with' : 'contains'}
                    {s.nuclei.length ? ` · ${s.nuclei.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleAdd(s.personId)}
                  disabled={busy}
                  className="text-[10px] font-semibold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  Link &amp; add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <div className="rounded bg-red-50 border border-red-200 px-2 py-1 text-[11px] text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={() => handleAdd()}
        disabled={busy || !displayName.trim()}
        className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-50">
        Add as unlinked
      </button>
    </div>
  );
}
