import { CVMeta } from "@/types/cv";

/** Minimal shape needed to read a resume's app metadata from its content_json. */
export interface HasMeta {
  content_json?: { __meta?: CVMeta } | null;
}

export function getResumeMeta(r: HasMeta): CVMeta {
  return r.content_json?.__meta ?? {};
}

/** A resume is an APPLICATION once it's been angled at a role/job via "Rikta CV". */
export function isApplication(r: HasMeta): boolean {
  const m = getResumeMeta(r);
  return !!m.targetRole || !!m.targetRoleLabel || !!m.tailoredForJob;
}

/**
 * Two-tier split for the dashboard:
 * - templates: your reusable master CVs (one per role you target)
 * - applications: copies tailored to a specific role/job
 * A CV is a template by default; it becomes an application only when angled via "Rikta CV".
 */
export function splitTemplatesApplications<T extends HasMeta>(rows: T[]): {
  templates: T[];
  applications: T[];
} {
  return {
    templates: rows.filter((r) => !isApplication(r)),
    applications: rows.filter((r) => isApplication(r)),
  };
}
