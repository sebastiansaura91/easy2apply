import { describe, expect, it } from "vitest";
import { norm, stem, hitIn, ratingOf } from "./text-match";
// The Deno mirror — plain TS with no Deno APIs, so vitest can load it directly.
import { norm as serverNorm, stem as serverStem, hitIn as serverHitIn } from "../../supabase/functions/_shared/text-match";

/**
 * The contract: the client module and the server mirror must answer identically.
 * If someone edits one twin and forgets the other, this suite fails the build.
 */
const WORDS = [
  "ledarskap", "ledarskapet", "ledarskapsresor", "prissättning", "pris-sättning",
  "Förändringsledning", "förändringsledningen", "appar", "app", "resurser", "ledning",
  "sales enablement", "Sales—Enablement", "b2c", "ai", "tillit", "delaktighet",
  "SJÄLVBESTÄMMANDE", "kundmöten", "kpi:er", "",
];
const BLOBS = [
  "ledde förändringsledning och prissättning för hela portföljen med tillit",
  "byggde sales enablement, coachade 40 säljare, ökade delaktigheten",
  "",
];

describe("text-match: client and server twins agree", () => {
  it("norm agrees on every word", () => {
    for (const w of WORDS) expect(serverNorm(w), w).toBe(norm(w));
  });
  it("stem agrees on every word", () => {
    for (const w of WORDS) expect(serverStem(w), w).toBe(stem(w));
  });
  it("hitIn agrees on every word × blob", () => {
    for (const b of BLOBS) {
      const c = hitIn(norm(b));
      const s = serverHitIn(serverNorm(b));
      for (const w of WORDS) expect(s(w), `"${w}" in "${b}"`).toBe(c(w));
    }
  });
});

describe("text-match: the behaviour the 12 old copies disagreed on", () => {
  it("stems definite forms so 'ledarskapet' matches 'ledarskap'", () => {
    expect(hitIn(norm("stark inom ledarskap"))("ledarskapet")).toBe(true);
  });
  it("keeps short words unstemmed (the old 5/6-char boundary drift)", () => {
    expect(stem("appar")).toBe("appar"); // 5 chars: below the gate, untouched
    expect(stem("resurser")).toBe("resurs");
  });
  it("never matches terms under 3 characters", () => {
    expect(hitIn(norm("ai och b2c-erfarenhet"))("ai")).toBe(false);
  });
  it("ratingOf: model rating wins, evidence falls back, always clamped 1-5", () => {
    expect(ratingOf({ rating: 4.4 })).toBe(4);
    expect(ratingOf({ rating: 99 })).toBe(5);
    expect(ratingOf({ rating: Number.NaN, evidence: "strong" })).toBe(4);
    expect(ratingOf({ evidence: "missing" })).toBe(1);
    expect(ratingOf({ evidence: "partial" })).toBe(3);
  });
});
