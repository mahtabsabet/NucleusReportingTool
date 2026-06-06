import type { ClusterGrowthProfile } from './cgp';
import { cgpTables } from './cgpTables';

// Build a safe, dated filename stem for a cluster's CGP export.
function fileStem(clusterName: string): string {
  const slug = clusterName.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `cluster-growth-profile-${slug || 'cluster'}-${date}`;
}

// Export the profile as a multi-sheet .xlsx workbook (one sheet per
// table). SheetJS is imported lazily so it never weighs down the main
// bundle — the cost is paid only when a user actually exports.
export async function exportCgpToXlsx(
  profile: ClusterGrowthProfile,
  clusterName: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const table of cgpTables(profile)) {
    const aoa: (string | number)[][] = [table.columns, ...table.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Sheet names are capped at 31 chars and can't contain []:*?/\.
    const sheetName = table.title.replace(/[[\]:*?/\\]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, `${fileStem(clusterName)}.xlsx`);
}
