import { CVContent } from "@/types/cv";

/**
 * Stable signature of the scan input: CV content (excluding app metadata, so persisting
 * a result never invalidates itself) + the job posting. Every surface that caches an
 * analysis MUST use this same function, or caches will never hit across surfaces.
 */
export function cvScanSignature(cv: CVContent, jobText?: string): string {
  return JSON.stringify({ ...cv, __meta: undefined }) + "|" + (jobText || "").trim();
}
