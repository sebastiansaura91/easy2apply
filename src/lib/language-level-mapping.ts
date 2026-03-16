const LEVEL_MAP_SV_TO_EN: Record<string, string> = {
  "Modersmål": "Native speaker",
  "Flytande": "Fluent",
  "Avancerad": "Advanced",
  "Övre mellannivå": "Upper intermediate",
  "Mellannivå": "Intermediate",
  "Grundläggande": "Basic",
};

const LEVEL_MAP_EN_TO_SV: Record<string, string> = Object.fromEntries(
  Object.entries(LEVEL_MAP_SV_TO_EN).map(([sv, en]) => [en, sv])
);

export function convertLanguageLevel(level: string, targetLang: "sv" | "en"): string {
  if (!level) return level;
  const map = targetLang === "en" ? LEVEL_MAP_SV_TO_EN : LEVEL_MAP_EN_TO_SV;
  return map[level] ?? level;
}

import type { CVContent } from "@/types/cv";

export function convertLanguageLevels(cv: CVContent, targetLang: "sv" | "en"): CVContent["languages"] {
  return cv.languages.map((lang) => ({
    ...lang,
    level: convertLanguageLevel(lang.level, targetLang),
  }));
}
