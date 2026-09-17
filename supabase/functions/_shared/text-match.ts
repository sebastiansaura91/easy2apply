/**
 * Deno mirror of src/lib/text-match.ts — edge functions cannot import from src/.
 * KEEP BYTE-IDENTICAL LOGIC: src/lib/text-match.contract.test.ts compares the twins
 * on a word list and fails the suite if they ever answer differently.
 */

export const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

export const stem = (s: string) => (s.length >= 6 ? s.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "") : s);

export const hitIn = (blob: string) => (term: string): boolean => {
  const n = norm(term);
  if (n.length < 3 || !blob) return false;
  if (blob.includes(n)) return true;
  const st = stem(n);
  return st !== n && blob.includes(st);
};
