import { getAllRoles } from "./role-advice";
import { CUSTOM_ROLE } from "@/components/role/RolePicker";

/**
 * Derive the broad role bucket from a job ad's title so the user never has to be asked.
 * Matches the title against the role catalog (both languages); the longest catalog label
 * whose words all appear in the title wins. No match → custom role carrying the ad title.
 */
export function deriveRoleFromTitle(
  jobTitle: string | undefined | null
): { roleId: string; customLabel?: string } | null {
  const title = (jobTitle || "").toLowerCase().trim();
  if (!title) return null;

  let best: { id: string; labelLen: number } | null = null;
  for (const lang of ["sv", "en"] as const) {
    for (const group of getAllRoles(lang)) {
      for (const role of group.roles) {
        const label = role.label.toLowerCase();
        const words = label.split(/[^a-zåäöé&]+/).filter(w => w.length > 1);
        if (!words.length) continue;
        const allPresent = words.every(w => title.includes(w));
        if (allPresent && (!best || label.length > best.labelLen)) {
          best = { id: role.id, labelLen: label.length };
        }
      }
    }
  }
  if (best) return { roleId: best.id };
  // No catalog match — use the ad's own title as a custom role bucket.
  return { roleId: CUSTOM_ROLE, customLabel: (jobTitle || "").trim() };
}
