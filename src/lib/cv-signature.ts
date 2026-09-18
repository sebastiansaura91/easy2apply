import { CVContent } from "@/types/cv";

/**
 * Stable signature of the scan input: CV content (excluding app metadata, so persisting
 * a result never invalidates itself) + the job posting. Every surface that caches an
 * analysis MUST use this same function, or caches will never hit across surfaces.
 */
/**
 * Bump when the ANALYSIS CONTRACT changes (output language split, note format,
 * new fields): every cached result older than the contract re-runs once instead
 * of serving pre-change output forever. v2: report/CV language split + plain
 * evidence notes + ad quotes.
 */
const SCAN_CONTRACT_VERSION = "v2";

export function cvScanSignature(cv: CVContent, jobText?: string): string {
  // Verified answers feed the rating (Nivålyftet), so they bust the cache like any
  // other input — otherwise a new answer would show stale ratings forever.
  const evidence = cv.__meta?.verifiedEvidence || [];
  return SCAN_CONTRACT_VERSION + "|" + JSON.stringify({ ...cv, __meta: undefined }) + "|" + JSON.stringify(evidence) + "|" + (jobText || "").trim();
}
