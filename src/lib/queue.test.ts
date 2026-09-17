import { describe, expect, it } from "vitest";
import { nextCard, gapQueue, commGapQueue, cardsLeft, minutesLeft, pendingIndices, QueueState } from "./queue";

const empty: QueueState = {
  knockouts: 0, knockoutsAcked: false, busy: false, questions: 0,
  placementsPending: [], newBulletsPending: [], reframesPending: [],
  gaps: 0, commGaps: 0, readiness: 0,
};

describe("nextCard — the priority order, now a testable fact", () => {
  it("hard requirements gate everything, until acknowledged", () => {
    const s = { ...empty, knockouts: 2, busy: true, questions: 3, gaps: 5, readiness: 4 };
    expect(nextCard(s).kind).toBe("knockouts");
    expect(nextCard({ ...s, knockoutsAcked: true }).kind).toBe("busy");
  });

  it("walks the full order: question → placement → new bullet → gap → reframe → commGap → readiness → done", () => {
    let s: QueueState = {
      ...empty, knockoutsAcked: true, questions: 1,
      placementsPending: [2], newBulletsPending: [0], reframesPending: [1],
      gaps: 1, commGaps: 1, readiness: 1,
    };
    const walk: string[] = [];
    const drain: (keyof QueueState)[] = ["questions", "placementsPending", "newBulletsPending", "gaps", "reframesPending", "commGaps", "readiness"];
    for (const key of drain) {
      walk.push(nextCard(s).kind);
      s = { ...s, [key]: Array.isArray(s[key]) ? [] : 0 };
    }
    walk.push(nextCard(s).kind);
    expect(walk).toEqual(["question", "placement", "newBullet", "gap", "reframe", "commGap", "readiness", "done"]);
  });

  it("returns the FIRST open index for indexed cards", () => {
    const card = nextCard({ ...empty, placementsPending: [3, 5] });
    expect(card).toEqual({ kind: "placement", index: 3 });
  });
});

describe("gapQueue", () => {
  const themes = [
    { theme: "Nice-svag", importance: "nice", rating: 1 },
    { theme: "Krav-mellan", importance: "must", rating: 3 },
    { theme: "Krav-svag", importance: "must", rating: 1 },
    { theme: "Täckt", importance: "must", rating: 5 },
    { theme: "Accepterad", importance: "must", rating: 1 },
    { theme: "Hanterad", importance: "must", rating: 1 },
  ];
  it("filters covered/accepted/handled and sorts musts first, weakest first", () => {
    const q = gapQueue(themes, ["Accepterad"], new Set(["Hanterad"]));
    expect(q.map(t => t.theme)).toEqual(["Krav-svag", "Krav-mellan", "Nice-svag"]);
  });
  it("falls back to evidence-derived ratings for unrated themes", () => {
    const q = gapQueue([{ theme: "Orated", importance: "must", evidence: "missing" }], [], new Set());
    expect(q).toHaveLength(1);
  });
});

describe("commGapQueue", () => {
  it("only lifted themes at 4+, minus handled", () => {
    const themes = [
      { theme: "Lyft", importance: "must", rating: 4, lifted_by_evidence: true },
      { theme: "Lyft men hanterad", importance: "must", rating: 4, lifted_by_evidence: true },
      { theme: "Lyft men svag", importance: "must", rating: 3, lifted_by_evidence: true },
      { theme: "Stark utan lyft", importance: "must", rating: 5 },
    ];
    expect(commGapQueue(themes, new Set(["Lyft men hanterad"])).map(t => t.theme)).toEqual(["Lyft"]);
  });
});

describe("counters", () => {
  it("cardsLeft counts work items, never the busy/knockout moments", () => {
    const s: QueueState = {
      ...empty, knockouts: 3, busy: true, questions: 2,
      placementsPending: [0, 1], newBulletsPending: [0], reframesPending: [0, 1, 2],
      gaps: 4, commGaps: 1, readiness: 2,
    };
    expect(cardsLeft(s)).toBe(2 + 2 + 1 + 3 + 4 + 1 + 2);
  });
  it("minutesLeft: ~45s per card, floor 1", () => {
    expect(minutesLeft(0)).toBe(1);
    expect(minutesLeft(4)).toBe(3);
  });
  it("pendingIndices keeps order and skips applied/dismissed", () => {
    expect(pendingIndices(4, new Set([1]), new Set([3]))).toEqual([0, 2]);
  });
});
