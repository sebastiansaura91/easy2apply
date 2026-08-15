import { CVContent } from "@/types/cv";

/**
 * Stable signature of the scan input: CV content (excluding app metadata, so persisting
 * a result never invalidates itself) + the job posting. Every surface that caches an
 * analysis MUST use this same function, or caches will never hit across surfaces.
 */
export function cvScanSignature(cv: CVContent, jobText?: string): string {
  // Verified answers feed the rating (Nivålyftet), so they bust the cache like any
  // other input — otherwise a new answer would show stale ratings forever.
  const evidence = cv.__meta?.verifiedEvidence || [];
  return JSON.stringify({ ...cv, __meta: undefined }) + "|" + JSON.stringify(evidence) + "|" + (jobText || "").trim();
}
