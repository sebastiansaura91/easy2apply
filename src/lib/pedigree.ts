/**
 * Pedigree proxies: brand/firm names a job ad uses as EXAMPLES of a capability
 * ("exempelvis McKinsey ... eller motsvarande"). Recruiters read these as class
 * labels and accept equivalent proof; a CV that never contained the brand must
 * never gain it. Proxy terms are therefore excluded from keywords, questions and
 * placements, and sent to the server as a never-insert list. The regex is the
 * fallback for demand profiles frozen before proxy classification existed.
 */
export const CONSULTANCY_BRAND_RE =
  /^(mc\s?kinsey|bain|bcg|boston consulting group|mbb|big\s?(?:4|four)|deloitte|kpmg|pwc|ey|ernst\s*&\s*young|accenture|kearney|oliver wyman|roland berger|capgemini)(\s*(&|and)\s*(co|company|partners)\w*)?$/i;

interface ProxyProfile {
  competence_themes?: { proxy_terms?: string[] }[];
}

/** All proxy terms declared in the demand profile, lowercased and trimmed. */
export function collectProxyTerms(profile?: ProxyProfile): Set<string> {
  const out = new Set<string>();
  for (const t of profile?.competence_themes || []) {
    for (const p of t.proxy_terms || []) {
      const n = String(p).trim().toLowerCase();
      if (n) out.add(n);
    }
  }
  return out;
}

/**
 * True when a term is a pedigree proxy: declared in the profile, or any of its
 * comma/"och"/"eller"-separated pieces matches a known consultancy brand.
 */
export function isPedigreeTerm(term: string, proxies: Set<string>): boolean {
  const raw = String(term || "").trim();
  if (!raw) return false;
  if (proxies.has(raw.toLowerCase())) return true;
  return raw
    .split(/[,/]|\boch\b|\beller\b|\band\b|\bor\b/i)
    .map(s => s.trim())
    .filter(Boolean)
    .some(s => CONSULTANCY_BRAND_RE.test(s));
}
