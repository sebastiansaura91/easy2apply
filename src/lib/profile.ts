import { HasMeta, getResumeMeta } from "./resume-grouping";

/** A resume row with the timestamp we use to decide which CV is "first". */
export type ProfileRow = HasMeta & { id: string; created_at?: string };

/**
 * There is exactly ONE profile — it represents the person. These helpers keep that
 * invariant: find the current profile, and if none is marked yet, the earliest-created CV
 * is the profile (the first CV you add becomes your profile).
 */

function byCreatedAsc<T extends { created_at?: string }>(a: T, b: T): number {
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/** The current profile, if one is marked. If several are marked, the earliest wins. */
export function findBaseProfile<T extends ProfileRow>(rows: T[]): T | undefined {
  const marked = rows.filter((r) => getResumeMeta(r).isBaseProfile);
  if (marked.length) return [...marked].sort(byCreatedAsc)[0];
  return undefined;
}

/** The CV that SHOULD be the profile when none is marked yet: the earliest created. */
export function profileCandidate<T extends ProfileRow>(rows: T[]): T | undefined {
  if (!rows.length) return undefined;
  return [...rows].sort(byCreatedAsc)[0];
}

export function isProfile<T extends ProfileRow>(row: T, rows: T[]): boolean {
  const p = findBaseProfile(rows) ?? profileCandidate(rows);
  return !!p && p.id === row.id;
}
