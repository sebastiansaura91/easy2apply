# easy2apply — Full Code Audit

_Generated from a 5-pass parallel review: goal flow, editor/PDF, edge functions, data safety, frontend._

Severity: **Critical** (breaks a core function or leaks data) · **High** · **Medium** · **Low**.
Line numbers verified against the cloned repo at time of review.

---

## CRITICAL

**C1. Every visitor is auto-logged into ONE shared account — all CVs commingled.**
`src/contexts/AuthContext.tsx:24-41` auto-signs-in all visitors with a hardcoded shared credential. RLS is correct but `auth.uid()` is identical for everyone, so all users read/write the same account. Magic-link login + route guards are bypassed.
→ Delete the auto-login block; rotate/remove the demo account.

**C2. `parse-cv` crashes on normal PDFs and mis-parses DOCX — the primary upload path is broken.**
`supabase/functions/parse-cv/index.ts:65` — `btoa(String.fromCharCode(...bytes))` overflows the stack for any PDF over ~100 KB. `:95-97` decodes DOCX (a ZIP) as UTF-8 → garbage.
→ Base64-encode in chunks; reject/unzip DOCX instead of decoding as text.

**C3. New Experience fields are captured but silently dropped from PDF + preview.**
`roleScope`, `pnlSize`, `headcount`, `revenueImpact` are entered (`SectionForms.tsx:311-325`) but rendered nowhere — `export-pdf.ts:176-209` and `A4Preview.tsx:116-133` ignore them. `roleScope` is a full paragraph the user is told to write; it vanishes.
→ Render them after the date line in both outputs.

**C4. Wizards duplicate the CV instead of opening it.**
Improve/Explore/Apply always insert a brand-new resume row rather than opening the selected one (`ImproveWizard.tsx:31,50-58`; `ExploreWizard.tsx:25,42-51`; `ApplyWizard.tsx:132-142`). The user edits a copy; the original is untouched, and duplicates pile up.
→ Capture the existing resume id and navigate to `/editor/:id` when present.

---

## HIGH

**H1. Wizard analysis results are thrown away on entering the editor.**
Every "Fix this in editor" button opens `/editor/:id`, but `CVEditor` never reads `useFlow` — issues/keywords/weak-bullets are lost. The CTA lands on a generic editor with nothing flagged.
→ Persist analysis (FlowContext/query param/DB); have CVEditor surface flagged issues.

**H2. No React error boundary — one malformed AI payload white-screens the app.**
Panels cast raw edge-function JSON (`data as AtsCheckResult`) and render deeply nested fields unguarded (`AtsCheck.tsx:231-240,285`). No boundary in `main.tsx`/`App.tsx`.
→ Wrap `<Routes>` and each analysis panel in an error boundary.

**H3. Autosave loses the last edits on navigate/tab-close.**
`CVEditor.tsx:94` cleanup clears the pending 2s timer without saving; "Back" unmounts. No `beforeunload` flush.
→ Flush pending save on unmount + `beforeunload`/`visibilitychange`.

**H4. A named person's full CV is committed in a migration (GDPR/PII in git history).**
`supabase/migrations/20260320061912_…sql:1-6` seeds a real individual's career data.
→ Remove the migration and scrub git history (BFG/`git filter-repo`); seed data out-of-band.

**H5. `.env` is committed and not gitignored.**
Only anon/publishable keys today (no secret leaked), but any future service_role key would auto-commit.
→ `git rm --cached .env`, add to `.gitignore`, keep `.env.example`.

**H6. `bulletStyle: "numbered"` never honored.**
`export-pdf.ts:131,203-205` always draws a dot; `A4Preview.tsx:126-130` always `<ul>`. Choosing "Numbered" does nothing.
→ Emit `n.` / `<ol>` when numbered.

**H7. Five edge functions are public (`verify_jwt=false`) with wildcard CORS.**
`supabase/config.toml:3-16` — `optimize-bullets`, `bullet-coach`, `fix-issue`, `generate-fix-questions`, `explain-role` are open, accept CV text, and burn `LOVABLE_API_KEY`. Cost/DoS + unauth CV text to a 3rd party. _(Confirmed by two independent passes.)_
→ `verify_jwt = true` + restrict CORS to app origin.

**H8. Model drift — two functions use an unvetted preview model.**
`fix-issue/index.ts:87` and `generate-fix-questions/index.ts:58` use `google/gemini-3-flash-preview`; everything else uses `gemini-2.5-flash`. If unserved, both 500.
→ Standardize on one shared model constant.

**H9. Bullet selection is keyed by mutable text.**
`BulletResults.tsx:65,71-76,113` — after refine replaces bullet text, `selectedBullets.has(text)` no longer matches → selection lost and `onAccept` returns stale text. Identical bullets share state.
→ Key selection by index/id.

**H10. ApplyWizard opens the wrong CV after replacing a pick with an upload.**
`ApplyWizard.tsx:110-114` sets `flow.resumeId` on pick but never clears it on a subsequent upload → `openEditorToFix` navigates to the old CV, discarding the upload.
→ Reset `resumeId` to null when a fresh upload replaces the selection.

**H11. Improve/Explore hardcode `language:"en"` — Swedish CVs mis-analyzed.**
`ImproveWizard.tsx:39,55`; `ExploreWizard.tsx:30,47`. (ApplyWizard correctly derives from `detected_language`.) App's landing is entirely Swedish.
→ Detect/allow language and thread it through analysis + insert.

**H12. Large parts of the bullet UI are hardcoded Swedish + Swedish-only scoring.**
`BulletResults.tsx` / `BulletWizard.tsx` labels are Swedish regardless of UI language; `computeSkarpaScore` (`BulletResults.tsx:38-42`) only recognizes Swedish strong-verbs/floskler → wrong scores for EN.
→ Thread `language` through strings + score word-lists.

---

## MEDIUM

- **M1.** UPDATE RLS policies lack `WITH CHECK` → row-ownership reassignment. `migration …100758.sql:15,54` (`profiles`, `resumes`). → add `WITH CHECK (auth.uid() = user_id)`.
- **M2.** Prompt injection — raw user text interpolated into prompts can override the `[FYLL I]/[FILL IN]` anti-hallucination rule (`ats-check:34-37`, `optimize-bullets:30-33`, `generate-bullets:129-146`, `analyze-job-posting:49`). → delimit user content as data; keep the rule last.
- **M3.** Missing input validation in ~6 functions (`ats-check`, `optimize-bullets`, `fix-issue`, `generate-fix-questions`, `bullet-coach`, `translate-cv`) → opaque 500s instead of 400s.
- **M4.** No timeout/`AbortController` on any AI gateway `fetch` → hung requests block to the platform limit.
- **M5.** `fix-issue/index.ts:42` emits `[FYLL I]` even in English mode → placeholder inconsistency.
- **M6.** Contact block: preview ≠ PDF (name alignment, field order, per-line vs joined). `A4Preview.tsx:91-102` vs `export-pdf.ts:149-163`.
- **M7.** "Page breaks" preview is DOM-measured while PDF paginates jsPDF text with different metrics → indicators diverge from reality (misleading WYSIWYG).
- **M8.** Empty project bullets render stray dots — `export-pdf.ts:260` and `A4Preview.tsx:172` miss `.filter(Boolean)` (new projects default to `[""]`).
- **M9.** Section H2 headings can orphan at page bottom — `drawH2` reserves only 8mm (`export-pdf.ts:101`).
- **M10.** Dashboard redirects real users to onboarding on a transient fetch error — `Dashboard.tsx:33-42` (empty-state UI is dead code).
- **M11.** Language detector flags "high confidence" mismatch from 1–2 words — `language-detection.ts:74-84` (`svRatio+enRatio===1`); skills lists are noise.
- **M12.** Incomplete GDPR erasure — `Settings.tsx:28-37` leaves `profiles` row + `auth.users` record. → server-side edge function with `auth.admin.deleteUser`.
- **M13.** `useToast` re-subscribes on every state change — `use-toast.ts:169-177` deps should be `[]`.

---

## LOW

- `flow.goal` set but never read (dead state); `flow.setParsedCV` written, never read. `GoalChooser.tsx` / `Onboarding.tsx`.
- Goals list defined twice with diverging copy/ids — `GoalChooser.tsx:6-11` vs `Onboarding.tsx:6-11`.
- `UploadCVDialog` orphaned (0 imports) — dead code.
- `CVUploadZone` locks after one upload — can't re-pick a wrong file in ApplyWizard step 2.
- Inconsistent default language: `CreateWizard` `sv`, Improve/Explore `en`.
- No `_shared/` module in edge functions → CORS/error/model/token drift copy-pasted across all 13 (root cause of H8, M4, M5, and several Lows).
- Non-defensive `JSON.parse` of model output in ~8 functions → cryptic client errors.
- `ats-check` future-date guard only cleans `first_scan_issues`, not `parse_check`.
- Health score double-penalizes weak bullets — `InsightsPanel.tsx:90-96` + `cv-quality.ts:212-229`.
- `t:(k:any)=>string` discards `TranslationKey` type safety — `AtsCheck.tsx:32`, `InsightsPanel.tsx:24`.
- `detectCvLanguages` section labels hardcoded Swedish, surfaced in EN UI — `language-detection.ts:93-140`.
- Dead imports: `InsightsPanel.tsx:11` (`runAtsCheck`), `BulletCoachChat.tsx:3,6,7`; unused `t` prop in `InsightsPanel`.
- Duplicated `scoreBadge`/`suggestionTypeLabel` across `AtsCheck.tsx` and `BulletOptimizer.tsx`.
- Assorted untranslated inline strings in `AtsCheck.tsx`.

---

## Confirmed healthy
RLS enabled on all 7 tables, no `USING(true)` policies, no privilege-escalation path in `user_roles`, no service_role key anywhere, no PII logged. Anti-hallucination rules are broadly present and correct across the generative functions (residual risk is injection + the EN-token bug, not missing rules). No tables/multi-column/icons reach the PDF (ATS-safe body). A vitest harness exists.
