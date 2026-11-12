/** How long after a registry entry a station or permit keeps its "new" marker. */
export const NEW_ENTRY_WINDOW_DAYS = 30;

export interface NewEntryWindow {
  /** Date the window is anchored to: the latest synced UKE registry, or today when none was synced. */
  referenceDate: string;
  /** First day (YYYY-MM-DD) that still counts as new. */
  since: string;
  /** Two-digit year of the reference date, as it appears at the end of UKE permit numbers ("…/9/26 [P]"). */
  year: string;
}

const isoDay = (value: unknown) => {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) ? day : null;
};

/**
 * "New" is relative to the latest registry the database knows about, not to fixed calendar dates,
 * so the marker keeps working after every sync without touching the code.
 */
export function newEntryWindow(referenceDate?: string | null, now = new Date()): NewEntryWindow {
  const reference = isoDay(referenceDate) || now.toISOString().slice(0, 10);
  const since = new Date(Date.parse(reference) - NEW_ENTRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  return { referenceDate: reference, since, year: reference.slice(2, 4) };
}

type PermitBand = { entryDate?: unknown; permit?: unknown };

/** Registry entry date of a band: the explicit field, or the "wpis YYYY-MM-DD" note inside the permit text. */
export function bandEntryDate(band: PermitBand): string | null {
  return isoDay(band.entryDate) || isoDay(String(band.permit ?? '').match(/wpis\s+(\d{4}-\d{2}-\d{2})/)?.[1]);
}

/** Issue year and kind of a UKE permit number such as "REJ/1/41451/9/26 [P] - expires 2099-12-31". */
export function permitIssue(permit: unknown): { year: string; kind: string | null } | null {
  const match = String(permit ?? '').match(/\/(\d{2})\s+(?:\[([^\]]+)\])?/);
  return match ? { year: match[1], kind: match[2] || null } : null;
}

/**
 * A band is new when its registry entry falls inside the window, or when its permit was issued
 * in the reference year. `newPermitsOnly` narrows the latter to brand-new permits ([P]) and
 * leaves out amendments ([zmP]) - the rule used for the station-level marker.
 */
export function isNewBand(band: PermitBand, window: NewEntryWindow, { newPermitsOnly = false } = {}): boolean {
  const entryDate = bandEntryDate(band);
  if (entryDate && entryDate >= window.since) return true;
  const issue = permitIssue(band.permit);
  return Boolean(issue && issue.year === window.year && (!newPermitsOnly || issue.kind === 'P'));
}
