import { CVMeta } from "@/types/cv";

/**
 * The canonical competence registry: the user's own, hand-approved list of
 * competences. Every theme name an ad invents resolves to one of these, so the
 * map, question dedup and coverage all key on stable ids instead of raw strings.
 */
export interface CanonicalCompetence {
  id: string;
  name_sv: string;
  name_en: string;
  /** Every raw string ever seen that means this competence. */
  aliases: string[];
}

export interface CompetenceRegistry {
  version: number;
  updatedAt: string;
  competences: CanonicalCompetence[];
}

/** Title of the hidden resume row that stores the registry. */
export const REGISTRY_ROW_TITLE = "Profil · kompetensregister";

export const normName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Resolve a raw theme/keyword name to a canonical competence. Exact name or alias
 * first, then containment either way (min 4 chars, so "B2C" won't swallow everything).
 */
export function resolveCompetence(registry: CompetenceRegistry | null | undefined, name: string): CanonicalCompetence | null {
  if (!registry?.competences?.length) return null;
  const n = normName(name);
  if (!n) return null;
  const candidates = (c: CanonicalCompetence) => [c.name_sv, c.name_en, ...(c.aliases || [])].map(normName).filter(Boolean);
  for (const c of registry.competences) {
    if (candidates(c).includes(n)) return c;
  }
  if (n.length >= 4) {
    for (const c of registry.competences) {
      if (candidates(c).some(a => a.length >= 4 && (a.includes(n) || n.includes(a)))) return c;
    }
  }
  return null;
}

export interface ProfileEvidenceItem { keyword: string; answer: string; at: string; cvTitle: string }

/**
 * Build a lookup from any theme/keyword name to all verified evidence for that
 * competence, across every CV. Registry ids are the primary key; unresolved
 * keywords group under their own normalized name.
 */
export function buildEvidenceLookup(
  rows: { title: string; meta: CVMeta }[],
  registry: CompetenceRegistry | null | undefined,
): (name: string) => ProfileEvidenceItem[] {
  const byKey = new Map<string, ProfileEvidenceItem[]>();
  for (const { title, meta } of rows) {
    if (meta.isRegistryRow) continue;
    for (const ev of meta.verifiedEvidence || []) {
      const c = resolveCompetence(registry, ev.keyword);
      const key = c ? `id:${c.id}` : `raw:${normName(ev.keyword)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ ...ev, cvTitle: title });
    }
  }
  return (name: string) => {
    const c = resolveCompetence(registry, name);
    return (c ? byKey.get(`id:${c.id}`) : byKey.get(`raw:${normName(name)}`)) || [];
  };
}
