import { CVContent } from "@/types/cv";

export interface LanguageSectionStatus {
  section: string;
  language: "sv" | "en" | "mixed" | "unknown";
  confidence: number;
}

export interface LanguageCheckResult {
  system_language: "sv" | "en";
  detected_sections: LanguageSectionStatus[];
  mismatch: boolean;
  recommendation: string | null;
}

// Swedish indicator words (common words that rarely appear in English text)
const SV_INDICATORS = [
  "och", "att", "för", "med", "som", "har", "kan", "till", "från", "var",
  "det", "den", "ett", "av", "på", "är", "inte", "ska", "hade", "blev",
  "inom", "under", "genom", "samt", "eller", "också", "även", "mot",
  "mellan", "efter", "utan", "detta", "dessa", "vilket", "vilka",
  "ledde", "drev", "ansvarade", "utvecklade", "implementerade", "ökade",
  "minskade", "byggde", "skapade", "samordnade", "stöttade", "hanterade",
  "förbättrade", "etablerade", "analyserade", "förhandlade", "säkrade",
  "arbetslivserfarenhet", "utbildning", "kompetenser", "certifieringar",
  "erfarenhet", "projekt", "språk", "övrigt", "profil",
];

// English indicator words
const EN_INDICATORS = [
  "and", "the", "for", "with", "that", "was", "are", "has", "have", "can",
  "from", "this", "will", "been", "were", "they", "their", "which", "would",
  "could", "should", "about", "into", "through", "between", "during",
  "led", "drove", "managed", "developed", "implemented", "increased",
  "decreased", "built", "created", "coordinated", "supported", "handled",
  "improved", "established", "analyzed", "negotiated", "ensured",
  "experience", "education", "skills", "certifications", "projects",
  "languages", "summary", "profile", "other",
];

// Common Swedish proper nouns / place names that contain å, ä, ö but shouldn't count as Swedish text
const SV_PROPER_NOUNS_WITH_SPECIAL_CHARS = [
  "malmö", "göteborg", "västerås", "jönköping", "linköping", "norrköping",
  "örebro", "gävle", "sundsvall", "östersund", "härnösand", "växjö",
  "kalmar", "hälsingborg", "ängelholm", "märsta", "södertälje", "täby",
  "nacka", "lidingö", "solna", "höör", "luleå", "umeå", "skövde",
  "köping", "åkersberga", "strömsund",
];

function detectLanguageOfText(text: string): { language: "sv" | "en" | "mixed" | "unknown"; confidence: number } {
  if (!text || text.trim().length < 10) {
    return { language: "unknown", confidence: 0 };
  }

  const words = text.toLowerCase().replace(/[^a-zåäöüé\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 3) return { language: "unknown", confidence: 0 };

  let svScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (SV_INDICATORS.includes(word)) svScore++;
    if (EN_INDICATORS.includes(word)) enScore++;
  }

  // Only count Swedish chars if they appear in actual Swedish indicator words,
  // not in proper nouns like city names (Malmö, Nacka, etc.)
  const wordsWithSwedishChars = words.filter(w => /[åäö]/.test(w));
  const meaningfulSwedishCharWords = wordsWithSwedishChars.filter(
    w => !SV_PROPER_NOUNS_WITH_SPECIAL_CHARS.includes(w) && SV_INDICATORS.includes(w)
  );
  if (meaningfulSwedishCharWords.length > 0) svScore += 1;

  const total = svScore + enScore;
  if (total === 0) return { language: "unknown", confidence: 0 };

  const svRatio = svScore / total;
  const enRatio = enScore / total;

  if (svRatio > 0.7) return { language: "sv", confidence: svRatio };
  if (enRatio > 0.7) return { language: "en", confidence: enRatio };
  if (svRatio > 0.4 && enRatio > 0.4) return { language: "mixed", confidence: Math.max(svRatio, enRatio) };
  if (svRatio > enRatio) return { language: "sv", confidence: svRatio };
  return { language: "en", confidence: enRatio };
}

export function detectCvLanguages(cv: CVContent, systemLanguage: "sv" | "en"): LanguageCheckResult {
  const sections: LanguageSectionStatus[] = [];

  // Profile
  if (cv.profile && cv.profile.trim().length > 10) {
    const det = detectLanguageOfText(cv.profile);
    sections.push({ section: "Profil", language: det.language, confidence: det.confidence });
  }

  // Experience - check each role's bullets combined
  for (let i = 0; i < cv.experience.length; i++) {
    const exp = cv.experience[i];
    const allText = [exp.title, ...exp.bullets.filter(Boolean)].join(" ");
    if (allText.trim().length > 10) {
      const det = detectLanguageOfText(allText);
      sections.push({
        section: `Erfarenhet: ${exp.title || `Roll ${i + 1}`}`,
        language: det.language,
        confidence: det.confidence,
      });
    }
  }

  // Education
  const eduText = cv.education.map((e) => `${e.degree} ${e.field} ${e.school}`).join(" ");
  if (eduText.trim().length > 10) {
    const det = detectLanguageOfText(eduText);
    sections.push({ section: "Utbildning", language: det.language, confidence: det.confidence });
  }

  // Skills
  if (cv.skills.length > 0) {
    const det = detectLanguageOfText(cv.skills.join(", "));
    sections.push({ section: "Kompetenser", language: det.language, confidence: det.confidence });
  }

  // Projects
  for (let i = 0; i < cv.projects.length; i++) {
    const p = cv.projects[i];
    const allText = [p.name, p.description, ...p.bullets].filter(Boolean).join(" ");
    if (allText.trim().length > 10) {
      const det = detectLanguageOfText(allText);
      sections.push({
        section: `Projekt: ${p.name || `Projekt ${i + 1}`}`,
        language: det.language,
        confidence: det.confidence,
      });
    }
  }

  // Other
  if (cv.other && cv.other.trim().length > 10) {
    const det = detectLanguageOfText(cv.other);
    sections.push({ section: "Övrigt", language: det.language, confidence: det.confidence });
  }

  // Determine mismatch
  const mismatch = sections.some(
    (s) => s.language !== "unknown" && s.language !== systemLanguage && s.confidence > 0.5
  );

  const recommendation = mismatch
    ? systemLanguage === "en"
      ? "Mixed languages detected. Convert your CV to English for consistency."
      : "Blandade språk upptäckta. Konvertera ditt CV till svenska för konsekvens."
    : null;

  return {
    system_language: systemLanguage,
    detected_sections: sections,
    mismatch,
    recommendation,
  };
}

/**
 * Best-guess dominant language of a CV, weighted by per-section detection confidence.
 * Used to analyze and store an uploaded CV in its actual language instead of assuming
 * English. Falls back to "en" when there is no clear signal.
 */
export function detectDominantLanguage(cv: CVContent): "sv" | "en" {
  const { detected_sections } = detectCvLanguages(cv, "en");
  let sv = 0;
  let en = 0;
  for (const s of detected_sections) {
    if (s.language === "sv") sv += s.confidence;
    else if (s.language === "en") en += s.confidence;
  }
  return sv > en ? "sv" : "en";
}
