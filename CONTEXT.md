# CONTEXT — domänorden i CVSäkert

Kort ordlista för koden. Använd de här namnen i kod, commits och diskussioner.

## Kärnbegrepp

- **Mall** — ett master-CV, ett per rollvinkel. **Ansökan** — en riktad kopia av en
  mall mot en specifik annons. Skiljs via `__meta.isTemplate` (`resume-grouping.ts`).
- **Kravprofilen (demandProfile)** — annonsens extraherade teman, hårda krav, verktyg
  och tonläge, sparad på ansökan vid skapandet. Alla senare skanningar ankrar mot den.
- **Tonläget (register)** — annonsens språkstil: värderingsdriven/metrikdriven/blandad,
  plus annonsens egna värdeord. Styr skrivarnas balans (`registerRules` i gatewayn).
- **Färdigmodellen** — de deterministiska dokumentkollarna som gatar "redo att skicka":
  sexsekunders, profiltäckning, värdespråk, rollomfång, sidbudget, skills (`readiness.ts`).
- **Ärlighetsstacken** — vakterna som gör att AI aldrig hittar på: inga nya siffror/
  egennamn i omskrivningar, pedigree-proxies (varumärken är klassetiketter, aldrig
  CV-ord), obevisade skills går via frågor.

## Djupa moduler (och deras sömmar)

- **Kortkön** (`src/lib/queue.ts`) — beslutet "vilket kort ser användaren härnäst".
  Turordningen är data här: knockouts → busy → fråga → placering → ny punkt → gap →
  omformulering → kommunikationsgap → Färdigmodellen → klart. Panelen
  (`InsightsPanel`) renderar bara det kön bestämmer — lägg aldrig prioritetslogik
  i panelen igen.
- **Matchmotorn** (`src/lib/text-match.ts`) — DEN enda linjalen för "bär CV:t det här
  ordet?": `norm`, `stem`, `hitIn`, `themeWords`, `ratingOf`. Servern kan inte
  importera från `src/`, så `supabase/functions/_shared/text-match.ts` är en
  bytelik tvilling — `text-match.contract.test.ts` fäller bygget om de glider isär.
  Definiera aldrig en lokal `norm`/`stem` igen.
- **Bantningsplanen** (`src/lib/cut-plan.ts`) — annonsmedveten trimlista för CV över
  2 sidor: nollträffspunkter i äldsta rollerna först, toppen av senaste två rollerna
  skyddad, "begravda kort" lyfts fram.
- **Gatewayn** (`supabase/functions/_shared/gateway.ts`) — all AI-trafik: modellkedjor,
  kvot, timeout, logg (`ai_calls`), FENCE-injektionsskydd, skrivregler, tonlägesregler.

## Beslut som inte ska omprövas i förbifarten

- Chrome (knappar, rubriker) följer ALLTID appspråket; endast dokumentinnehåll och
  AI-anrop följer CV:ts språk.
- Poäng får aldrig visas från en inaktuell skanning (stale-vakter i panelen) —
  flyttas till en skanningsmodul i nästa fördjupning, inte tillbaka till spridda hooks.
- Temperatur sätts alltid explicit; 0 för scoring/extraktion.
