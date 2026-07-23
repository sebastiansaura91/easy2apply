import { CVMeta } from "@/types/cv";

/** Minimal shape needed to read a resume's app metadata from its content_json. */
export interface HasMeta {
  content_json?: { __meta?: CVMeta } | null;
}

export function getResumeMeta(r: HasMeta): CVMeta {
  return r.content_json?.__meta ?? {};
}

/**
 * A resume is an APPLICATION (a job-tailored copy) vs a TEMPLATE (a reusable master).
 * The explicit `isTemplate` flag wins — this lets a template carry a role for
 * categorization (e.g. "Head of Product") without being mistaken for an application.
 * Legacy rows without the flag fall back to "tailored to a specific job = application".
 */
export function isApplication(r: HasMeta): boolean {
  const m = getResumeMeta(r);
  if (m.isTemplate === true) return false;
  if (m.isTemplate === false) return true;
  return !!m.tailoredForJob;
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
