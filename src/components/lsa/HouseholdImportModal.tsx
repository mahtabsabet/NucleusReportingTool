// ============================================================
// Household import flow (CSV / XLSX).
//
// Three steps:
//   1. Pick a file.
//   2. Map sheet columns to our fields (display_name, address,
//      notes, members). Headers are heuristically pre-mapped;
//      LSA can override.
//   3. Confirm + geocode + insert. The geocode-households edge
//      function runs the lookups server-side and paces them to
//      Nominatim's 1 req/sec limit; rows we couldn't geocode
//      are still inserted (sans coordinates) so the LSA can
//      hand-pin them later.
// ============================================================

import React, { useMemo, useState } from 'react';
import { XIcon, UploadCloudIcon, LoaderIcon, MapPinIcon, MapPinOffIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { bulkCreateHouseholds } from '../../lib/db/households';
import { geocodeAddressBatch } from '../../lib/geocoder';

type FieldKey = 'displayName' | 'address' | 'notes' | 'members' | 'ignore';

const FIELD_LABELS: Record<Exclude<FieldKey, 'ignore'>, string> = {
  displayName: 'Display name *',
  address: 'Address',
  notes: 'Notes',
  members: 'Member names (semicolon-separated)',
};

interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
}

interface Props {
  jurisdictionId: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

export function HouseholdImportModal({ jurisdictionId, onClose, onImported }: Props) {
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ inserted: number; geocoded: number; ungeocoded: number } | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
        raw: false,
      });
      if (json.length === 0) {
        setError('The first sheet is empty.');
        return;
      }
      const headers = Object.keys(json[0]);
      const rows = json.map(r => {
        const o: Record<string, string> = {};
        for (const h of headers) o[h] = String((r as any)[h] ?? '').trim();
        return o;
      });
      setSheet({ headers, rows, fileName: file.name });
      setMapping(autoMap(headers));
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? 'Failed to read file');
    } finally {
      setBusy(false);
    }
  }

  // Heuristic header → field mapping. Falls back to 'ignore' for
  // columns we don't recognise; the LSA can override anything.
  function autoMap(headers: string[]): Record<string, FieldKey> {
    const m: Record<string, FieldKey> = {};
    for (const h of headers) {
      const k = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['name', 'household', 'householdname', 'displayname', 'family', 'lastname', 'familyname'].includes(k)) m[h] = 'displayName';
      else if (['address', 'streetaddress', 'fulladdress', 'addr', 'location'].includes(k)) m[h] = 'address';
      else if (['notes', 'note', 'comment', 'comments', 'remarks'].includes(k)) m[h] = 'notes';
      else if (['members', 'people', 'residents', 'occupants', 'membernames'].includes(k)) m[h] = 'members';
      else m[h] = 'ignore';
    }
    if (!Object.values(m).includes('displayName') && headers.length > 0) {
      m[headers[0]] = 'displayName';
    }
    return m;
  }

  const preview = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.slice(0, 5).map(r => projectRow(r, mapping));
  }, [sheet, mapping]);

  const validRowCount = useMemo(() => {
    if (!sheet) return 0;
    return sheet.rows.filter(r => projectRow(r, mapping).displayName.trim()).length;
  }, [sheet, mapping]);

  async function handleImport() {
    if (!sheet) return;
    const projected = sheet.rows
      .map(r => projectRow(r, mapping))
      .filter(r => r.displayName.trim());
    if (projected.length === 0) {
      setError('No rows have a Display Name — pick the right column above.');
      return;
    }
    setBusy(true); setError(null); setStep(3);
    setProgress({ done: 0, total: projected.length });

    try {
      // Geocode in chunks of 25 so the user sees progress moving.
      const CHUNK = 25;
      const enriched: typeof projected = [];
      let geocoded = 0;
      for (let i = 0; i < projected.length; i += CHUNK) {
        const slice = projected.slice(i, i + CHUNK);
        const hits = await geocodeAddressBatch(slice.map(r => r.address ?? ''));
        for (let j = 0; j < slice.length; j++) {
          const hit = hits[j];
          const row = { ...slice[j] };
          if (hit) {
            row.lat = hit.lat;
            row.lng = hit.lng;
            geocoded++;
          }
          enriched.push(row);
        }
        setProgress({ done: Math.min(i + CHUNK, projected.length), total: projected.length });
      }

      const result = await bulkCreateHouseholds(jurisdictionId, enriched.map(r => ({
        displayName: r.displayName.trim(),
        addressLine: r.address?.trim() || null,
        notes: r.notes?.trim() || null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        memberNames: r.members
          ? r.members.split(/[;,]/).map(s => s.trim()).filter(Boolean)
          : [],
      })));

      setReport({
        inserted: result.inserted,
        geocoded,
        ungeocoded: result.inserted - geocoded,
      });
      onImported(result.inserted);
    } catch (e: any) {
      setError(e.message ?? 'Import failed');
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-stone-100 rounded-xl flex items-center justify-center">
              <UploadCloudIcon className="w-5 h-5 text-stone-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import households</h2>
              <p className="text-xs text-gray-500">CSV or Excel — addresses will be geocoded.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {step === 1 && (
            <Step1 onPicked={handleFile} busy={busy} error={error} />
          )}
          {step === 2 && sheet && (
            <Step2
              sheet={sheet}
              mapping={mapping}
              setMapping={setMapping}
              preview={preview}
              validRowCount={validRowCount}
              onCancel={() => { setSheet(null); setStep(1); }}
              onImport={handleImport}
              error={error}
            />
          )}
          {step === 3 && (
            <Step3 progress={progress} report={report} error={error} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}


function projectRow(
  raw: Record<string, string>,
  mapping: Record<string, FieldKey>,
): {
  displayName: string;
  address?: string;
  notes?: string;
  members?: string;
  lat?: number;
  lng?: number;
} {
  const out: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue;
    const existing = out[field] ?? '';
    const v = raw[header] ?? '';
    out[field] = existing ? (existing + ' ' + v).trim() : v;
  }
  return {
    displayName: out.displayName ?? '',
    address: out.address ?? '',
    notes: out.notes ?? '',
    members: out.members ?? '',
  };
}


function Step1({
  onPicked,
  busy,
  error,
}: {
  onPicked: (f: File) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <label className="block border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-stone-400 hover:bg-stone-50/50 transition-colors">
        <UploadCloudIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <div className="text-sm font-semibold text-gray-700">Choose a CSV or Excel file</div>
        <div className="text-xs text-gray-500 mt-1">.csv · .xlsx · .xls</div>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          disabled={busy}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onPicked(f);
          }}
        />
      </label>
      {busy && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <LoaderIcon className="w-4 h-4 animate-spin" /> Reading file…
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}


function Step2({
  sheet,
  mapping,
  setMapping,
  preview,
  validRowCount,
  onCancel,
  onImport,
  error,
}: {
  sheet: ParsedSheet;
  mapping: Record<string, FieldKey>;
  setMapping: (m: Record<string, FieldKey>) => void;
  preview: Array<ReturnType<typeof projectRow>>;
  validRowCount: number;
  onCancel: () => void;
  onImport: () => void;
  error: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="text-sm text-gray-600">
        <strong className="font-semibold text-gray-900">{sheet.fileName}</strong> — {sheet.rows.length} rows.
        Match each column in your sheet to a household field. Pick <em>Ignore</em> for columns you don't need.
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Column in your file</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Maps to</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Sample value</th>
            </tr>
          </thead>
          <tbody>
            {sheet.headers.map((h, i) => (
              <tr key={h} className={i % 2 ? 'bg-white' : 'bg-gray-50/40'}>
                <td className="px-3 py-2 text-gray-800 font-medium">{h}</td>
                <td className="px-3 py-2">
                  <select
                    value={mapping[h] ?? 'ignore'}
                    onChange={e => setMapping({ ...mapping, [h]: e.target.value as FieldKey })}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
                    <option value="ignore">— ignore —</option>
                    {Object.entries(FIELD_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs truncate max-w-xs">
                  {sheet.rows[0]?.[h] || <em className="text-gray-300">(empty)</em>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Preview — first 5 rows
        </div>
        <div className="rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Display name</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Address</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Members</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className={i % 2 ? 'bg-white' : 'bg-gray-50/40'}>
                  <td className="px-3 py-1.5 text-gray-800">{r.displayName || <em className="text-red-400">(missing)</em>}</td>
                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-xs">{r.address}</td>
                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-xs">{r.members}</td>
                  <td className="px-3 py-1.5 text-gray-500 truncate max-w-xs">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        <strong className="font-semibold text-gray-900">{validRowCount}</strong> of {sheet.rows.length} rows
        have a usable display name and will be imported.
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-semibold">
          Pick another file
        </button>
        <button
          onClick={onImport}
          disabled={validRowCount === 0}
          className="flex-1 px-4 py-2.5 bg-stone-700 text-white rounded-xl hover:bg-stone-800 text-sm font-semibold disabled:opacity-50">
          Import {validRowCount} household{validRowCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}


function Step3({
  progress,
  report,
  error,
  onClose,
}: {
  progress: { done: number; total: number } | null;
  report: { inserted: number; geocoded: number; ungeocoded: number } | null;
  error: string | null;
  onClose: () => void;
}) {
  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-stone-700 text-white text-sm font-semibold">
          Close
        </button>
      </div>
    );
  }

  if (!report) {
    const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          Geocoding addresses (this respects OpenStreetMap's 1 request / second limit)…
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full bg-stone-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {progress && (
          <div className="text-xs text-gray-500">{progress.done} / {progress.total} rows processed.</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-800">
        Imported <strong className="font-semibold">{report.inserted}</strong> household{report.inserted === 1 ? '' : 's'}.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-stone-50 border border-stone-100 px-3 py-2">
          <div className="flex items-center gap-2 text-stone-700">
            <MapPinIcon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Geocoded</span>
          </div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{report.geocoded}</div>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <div className="flex items-center gap-2 text-amber-700">
            <MapPinOffIcon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">No coordinates</span>
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{report.ungeocoded}</div>
        </div>
      </div>
      {report.ungeocoded > 0 && (
        <p className="text-xs text-gray-500">
          Rows without coordinates were still inserted. Open them from the household list to drop a pin manually.
        </p>
      )}
      <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl bg-stone-700 text-white text-sm font-semibold">
        Done
      </button>
    </div>
  );
}
