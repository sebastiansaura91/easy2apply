import { ProfileDetection, ProfileId, Confidence } from "@/types/bullet-coach";
import { PROFILES } from "./bullet-profiles";

export function detectProfile(
  bulletText: string,
  roleTitle?: string,
  surroundingBullets?: string[],
  jobPostingText?: string
): ProfileDetection {
  const corpus = [
    bulletText,
    roleTitle || "",
    ...(surroundingBullets || []),
    (jobPostingText || "").slice(0, 500),
  ]
    .join(" ")
    .toLowerCase();

  const scores: { id: ProfileId; score: number; matched: string[] }[] = [];

  for (const profile of PROFILES) {
    if (profile.id === "other") continue;
    const matched: string[] = [];
    for (const kw of profile.keywords) {
      if (corpus.includes(kw.toLowerCase())) {
        // Higher weight if keyword is in the bullet itself
        const inBullet = bulletText.toLowerCase().includes(kw.toLowerCase());
        matched.push(kw);
        // bullet match = 3 pts, context match = 1 pt
        if (inBullet) matched.push(kw); // extra weight
      }
    }
    if (matched.length > 0) {
      scores.push({ id: profile.id, score: matched.length, matched: [...new Set(matched)] });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    return { profile: "other", confidence: "low", evidence: "" };
  }

  const top = scores[0];
  const second = scores[1];

  let confidence: Confidence = "high";
  if (top.score <= 2) {
    confidence = "low";
  } else if (second && second.score >= top.score * 0.7) {
    confidence = "medium";
  }

  const evidence = top.matched.slice(0, 4).join(", ");

  return { profile: top.id, confidence, evidence };
}
