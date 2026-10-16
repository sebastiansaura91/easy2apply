export type CVSpacingId = "standard" | "tight" | "compact";

export interface CVSpacing {
  id: CVSpacingId;
  label: { sv: string; en: string };
  lineHeight: number;
  marginX: number;
  marginY: number;
  gapScale: number;
}

/** Layout only: keep font sizes, document fields and enabled sections unchanged. */
export const CV_SPACING: CVSpacing[] = [
  { id: "standard", label: { sv: "Original", en: "Original" }, lineHeight: 1.4, marginX: 25, marginY: 17, gapScale: 1 },
  { id: "tight", label: { sv: "Tätare", en: "Tighter" }, lineHeight: 1.3, marginX: 20, marginY: 15, gapScale: 0.75 },
  { id: "compact", label: { sv: "Kompakt", en: "Compact" }, lineHeight: 1.2, marginX: 18, marginY: 14, gapScale: 0.5 },
];

export function getCVSpacing(id?: string): CVSpacing {
  return CV_SPACING.find(spacing => spacing.id === id) ?? CV_SPACING[0];
}