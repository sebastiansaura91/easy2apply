/** Human-readable CV dates: "2021-01" → "jan 2021" (sv) / "Jan 2021" (en). */

const MONTHS: Record<"sv" | "en", string[]> = {
  sv: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** Format a stored CV date ("YYYY-MM" or "YYYY"). Unparseable input is returned as-is. */
export function formatCvDate(value: string | undefined, lang: "sv" | "en"): string {
  const v = (value || "").trim();
  if (!v) return "";
  const m = /^(\d{4})-(\d{1,2})$/.exec(v);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return `${MONTHS[lang][month - 1]} ${m[1]}`;
  }
  if (/^\d{4}$/.test(v)) return v;
  return v;
}

/** "jan 2021 – nuvarande" / "Jan 2021 – Present" style range. */
export function formatCvDateRange(
  start: string | undefined,
  end: string | undefined,
  isPresent: boolean,
  lang: "sv" | "en",
  presentLabel: string
): string {
  const from = formatCvDate(start, lang);
  const to = isPresent ? presentLabel : formatCvDate(end, lang);
  if (from && to) return `${from} – ${to}`;
  return from || to || "";
}
