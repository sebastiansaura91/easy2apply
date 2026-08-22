import { supabase } from "@/integrations/supabase/client";

/**
 * First-party telemetry: funnel events + client errors into the RLS-scoped
 * app_events table. No third-party SDK, no cookies, nothing leaves Supabase.
 *
 * Contract: telemetry may NEVER affect the product — every call is
 * fire-and-forget and swallows every failure.
 */

export type AppEvent =
  | "cv_created"        // { source: "upload" | "linkedin" | "blank" | "tailored" }
  | "ad_analyzed"       // { themes: number, knockouts: number }
  | "scan_completed"    // { score: number, cached: boolean }
  | "card_actioned"     // { type: placement|new_bullet|question|reframe|check|proof_move, action: accept|dismiss|answer|waive }
  | "readiness_done"    // { score: number|null }
  | "export"            // { surface: "editor" | "apply" }
  | "stage_changed"     // { stage: sent|interview|offer|rejected|draft }
  | "client_error";     // { message, source }

// The generated Database type predates these tables; the cast is contained here.
const db = supabase as unknown as { from: (t: string) => { insert: (r: object) => Promise<unknown> } };

export function track(event: AppEvent, props: Record<string, unknown> = {}): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      await db.from("app_events").insert({ user_id: uid, event, props });
    } catch { /* telemetry never throws into the app */ }
  })();
}

// Client errors: global handlers, capped per session so a render loop can't
// flood the table. Wired once from main.tsx.
let errorBudget = 5;
export function trackError(message: string, source: string): void {
  if (errorBudget-- <= 0) return;
  track("client_error", { message: String(message).slice(0, 500), source });
}

export function initErrorTracking(): void {
  window.addEventListener("error", (e) => trackError(e.message, "window.onerror"));
  window.addEventListener("unhandledrejection", (e) =>
    trackError(e.reason instanceof Error ? e.reason.message : String(e.reason), "unhandledrejection"));
}
