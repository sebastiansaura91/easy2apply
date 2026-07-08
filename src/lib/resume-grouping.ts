import { CVMeta } from "@/types/cv";

/** Minimal shape needed to read a resume's app metadata from its content_json. */
export interface HasMeta {
  content_json?: { __meta?: CVMeta } | null;
}

export function getResumeMeta(r: HasMeta): CVMeta {
  return r.content_json?.__meta ?? {};
}

/**
 * Partition resumes into the dashboard's three groups:
 * - templates: explicitly marked as reusable role templates
 * - applications: job-tailored copies (have a tailoredForJob), not templates
 * - others: everything else (plain CVs)
 * A template flag wins over the tailored marker so a template is never double-listed.
 */
export function groupResumesByKind<T extends HasMeta>(rows: T[]): {
  templates: T[];
  applications: T[];
  others: T[];
} {
  const templates = rows.filter((r) => getResumeMeta(r).isTemplate);
  const applications = rows.filter(
    (r) => !getResumeMeta(r).isTemplate && !!getResumeMeta(r).tailoredForJob
  );
  const others = rows.filter(
    (r) => !getResumeMeta(r).isTemplate && !getResumeMeta(r).tailoredForJob
  );
  return { templates, applications, others };
}
