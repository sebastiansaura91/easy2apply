
# ATS-säkert Svenskt CV-verktyg – Implementeringsplan

## 1. Grundläggande setup
- Aktivera Lovable Cloud (databas, auth, edge functions)
- Konfigurera i18n-system (SV/EN) med React Context + JSON-filer för översättningar
- Sätta upp routing: `/`, `/auth`, `/dashboard`, `/editor/:id`, `/settings`

## 2. Landing page
- Minimalistisk hero-sektion med värdeprop på svenska
- Mock-bild av ett ATS-säkert CV (genererad placeholder)
- CTA-knapp "Skapa CV" som leder till auth/registrering
- Responsiv, enkel layout

## 3. Auth (Magic Link / OTP)
- Email-baserad inloggning via Supabase Auth magic link
- Enkel onboarding-flow i 3 steg (välkommen → grundinfo → skapa första CV)

## 4. Databas & datamodell
- **profiles** – namn, email, språkval
- **user_roles** – separat rolltabell
- **resumes** – id, user_id, title, language, template_id, timestamps
- **resume_versions** – resume_id, version_name, content_json, created_at
- **job_postings** – user_id, title, text, created_at
- **tailoring_runs** – resume_version_id, job_posting_id, suggestions_json, created_at
- **bullet_bank** – user_id, text, tags[], created_at
- RLS-policies på alla tabeller

## 5. Dashboard
- Lista alla CV:n med titel, senast ändrad, språk
- Skapa nytt CV, duplicera, ta bort
- Versionshistorik per CV (skapa version, jämför, rulla tillbaka)
- Tom-tillstånd med CTA

## 6. CV Editor (kärnfunktionen)
- **Tvåpanel-layout**: formulär till vänster, live A4-preview till höger
- **Sektioner** med drag-and-drop (ordning) och on/off toggle:
  - Kontaktuppgifter, Profil, Arbetslivserfarenhet, Utbildning, Kompetenser, Certifieringar, Projekt, Språk, Övrigt
- **content_json**: strukturerat format med sektioner, items, bullets
- **Micro-actions** på varje bullet: "Byt ut mening", "Förkorta", "Gör mer resultatdriven", "Lägg till mätetal-placeholder"
- **Bullet Bank**: spara/ladda bullet-snippets med tags (Strategy, CRM, Pricing etc.)
- Standardrubriker SV/EN beroende på CV-språkval

## 7. Versionshantering ("Git light")
- Skapa namngiven version (snapshot av content_json)
- Jämför versioner (text-diff markerat i grönt/rött)
- Rulla tillbaka till äldre version

## 8. Tailoring-flik
- Klistra in jobbannonstext
- AI-edge function (Lovable AI) som:
  - Extraherar nyckelord/kompetenser från annonsen
  - Föreslår ny profiltext
  - Ger 3–7 keyword-förslag att inkludera
  - Förbättrar bullets i tre nivåer (kort/medium/kraftfull)
  - Visar "gap list" – keywords som saknas i CV:t
- AI skriver aldrig på påhittade fakta – använder [FYLL I] för saknad info

## 9. ATS Check
- Automatisk checklista som scannar CV:t:
  - ✅ Standardiserade rubriker
  - ✅ Konsekvent datumformat
  - ✅ Inga misstänkta tecken (tabeller/kolumner)
  - ✅ Bullet-längd inom gräns
  - ✅ Kontaktuppgifter finns
  - ⚠️ Varningar med förklaringar och fix-förslag

## 10. Export (klient-side)
- **DOCX**: rubrik-hierarki (Heading1/2/3), bullet-listor, konsekvent datumformat – genereras med `docx`-biblioteket
- **PDF**: renderas från samma layout med `html2pdf.js` eller `jspdf` + html-rendering
- ATS-safe mode alltid på – inga tabeller, inga textboxar, enkolumn

## 11. Settings
- Språkväljare (SV/EN) som påverkar hela UI:t
- Standard export-format
- Radera konto och all data

## 12. Testdata
- Exempelanvändare med ett komplett CV: "Strategy & Transformation Lead"
- Realistiska men generiska bullets med [FYLL I]-placeholders
- En exempeljobannons för tailoring-demo

## 13. AI Edge Functions (Lovable AI)
- `cv-tailor` – tar jobbannons + CV, returnerar keyword-analys + förslag
- `cv-rewrite` – tar en bullet/profiltext + instruktion, returnerar omskriven text
- Båda med rate-limit-hantering (429/402) och felmeddelanden i UI

## Designprinciper
- Minimalistiskt, snabbt, utan onödig dekoration
- Tydliga tom-tillstånd och felmeddelanden
- Alla formulär med validering (zod)
- Responsivt (men editorn optimerad för desktop)
