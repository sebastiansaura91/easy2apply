import { ratingOf } from "@/lib/text-match";

/**
 * Kortkön: the decision "which card does the user see next?" as a pure module.
 * The priority order used to live as a 380-line if/else ladder inside the panel —
 * implicit in source order, unnamed and untestable. Here it is data:
 *
 *   knockouts → busy → question → placement → new bullet → gap →
 *   reframe → communication gap → readiness (Färdigmodellen) → done
 *
 * The panel renders whatever this module decides; it never decides itself.
 */

export interface QueueTheme {
  theme: string;
  importance: "must" | "nice" | string;
  rating?: number;
  evidence?: string;
  lifted_by_evidence?: boolean;
}

/**
 * The gap queue: themes the CV hasn't proven (below 4), minus consciously accepted
 * gaps and ones handled this session. Ad requirements first, weakest first.
 */
export function gapQueue<T extends QueueTheme>(
  themes: T[],
  acceptedGaps: Iterable<string>,
  handled: ReadonlySet<string>,
): T[] {
  const accepted = new Set(acceptedGaps);
  return [...themes]
    .filter(t => ratingOf(t) < 4 && !accepted.has(t.theme) && !handled.has(t.theme))
    .sort((a, b) =>
      ((a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1)) ||
      (ratingOf(a) - ratingOf(b)));
}

/**
 * Communication gaps: proven through verified answers (rating lifted to 4+) but
 * invisible in the CV text. Not a competence gap — the recruiter just can't see it.
 */
export function commGapQueue<T extends QueueTheme>(
  themes: T[],
  handledComm: ReadonlySet<string>,
): T[] {
  return themes.filter(t => t.lifted_by_evidence && ratingOf(t) >= 4 && !handledComm.has(t.theme));
}

/** Everything nextCard needs to know, and nothing it doesn't. */
export interface QueueState {
  /** Hard requirements in the ad (count) and whether the user has acknowledged them. */
  knockouts: number;
  knockoutsAcked: boolean;
  /** A question or placement fetch is in flight. */
  busy: boolean;
  /** Unanswered interview questions. */
  questions: number;
  /** Open (not applied, not dismissed) indices, in presentation order. */
  placementsPending: number[];
  newBulletsPending: number[];
  reframesPending: number[];
  /** gapQueue(...).length */
  gaps: number;
  /** commGapQueue(...).length */
  commGaps: number;
  /** Readiness checks left after waivers (Färdigmodellen). */
  readiness: number;
}

export type QueueCard =
  | { kind: "knockouts" | "busy" | "question" | "gap" | "commGap" | "readiness" | "done" }
  | { kind: "placement" | "newBullet" | "reframe"; index: number };

/** The whole priority order, in one place. */
export function nextCard(s: QueueState): QueueCard {
  // Hard requirements gate everything: a "no" there makes tailoring pointless,
  // so it must be said out loud before any polishing starts.
  if (s.knockouts > 0 && !s.knockoutsAcked) return { kind: "knockouts" };
  if (s.busy) return { kind: "busy" };
  if (s.questions > 0) return { kind: "question" };
  if (s.placementsPending.length > 0) return { kind: "placement", index: s.placementsPending[0] };
  if (s.newBulletsPending.length > 0) return { kind: "newBullet", index: s.newBulletsPending[0] };
  if (s.gaps > 0) return { kind: "gap" };
  if (s.reframesPending.length > 0) return { kind: "reframe", index: s.reframesPending[0] };
  if (s.commGaps > 0) return { kind: "commGap" };
  if (s.readiness > 0) return { kind: "readiness" };
  return { kind: "done" };
}

/** The "N kort kvar" counter — busy and knockouts are moments, not work items. */
export function cardsLeft(s: QueueState): number {
  return s.questions +
    s.placementsPending.length +
    s.newBulletsPending.length +
    s.gaps +
    s.reframesPending.length +
    s.commGaps +
    s.readiness;
}

/** Honest pace estimate: ~45 seconds per card, never below one minute. */
export const minutesLeft = (cards: number) => Math.max(1, Math.round(cards * 0.75));

/** Open indices of a list given applied/dismissed sets — presentation order preserved. */
export function pendingIndices(
  length: number,
  applied: ReadonlySet<number>,
  dismissed: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) if (!applied.has(i) && !dismissed.has(i)) out.push(i);
  return out;
}
