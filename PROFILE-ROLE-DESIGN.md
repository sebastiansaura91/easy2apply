# Profil, rikta CV & rollfit — design

Resultatet av en genomgång av hur profilen, rollmallarna och rollfit-analysen ska hänga ihop.
Bärande princip: **din profil är sanningen, allt annat är vyer byggda på den. Inget hittas på.**

## Modellen

**Profilen (en, din, skyddad).**
Din verkliga bakgrund — vem du är och vad du gjort. Arbetslivserfarenhet (tyngst), utbildning
(lätt vikt, spelar bara roll när den tydligt hör till rollen), personliga skills. Det finns
**exakt en** profil, den kan inte raderas av misstag, och det är det enda du underhåller över tid.

**Rikta CV (en funktion, byggd på profilen).**
Slår ihop dagens "anpassa för jobb" och "rollmall" till EN väg. När du ska söka något:
utgå från profilen → välj en **roll** (Head of Commercial, Head of Product…) → valfritt klistra
in en **specifik annons** för att skärpa. Appen tar en färsk kopia av profilen som utgångspunkt.

**Jobbannonsen (när den finns).**
Bryts ner (måste-krav, meriterande, nyckelord, senioritet) och **visas** så du ser vad jobbet
kräver — och matas in i rollfiten så score, nyckelord och gap blir specifika för just det jobbet.

**Rollfiten (appen viskar, du bestämmer).**
Mot roll + ev. annons visar appen: fit-score, nyckelord du täcker vs. saknar, vilka erfarenheter
du bör lyfta/tona ner, och omformuleringsförslag per punkt — som du godkänner en och en. Aldrig
påhittat; saknade siffror blir `[FYLL I]`.

**Utfallet = en ansökan.**
Det riktade CV:t sparas som historik. Uppdaterar du profilen senare rör det inte gamla
ansökningar — du skapar bara en ny, färsk, nästa gång du söker. Ingen synk behövs.

## Konsekvens för gränssnittet

Dagens dashboard listar många jämbördiga CV:n. I den här modellen blir det istället:
**din profil högst upp (en, tydlig, skyddad) + en lista med ansökningar** du riktat.
Det allra första CV:t du laddar upp blir din profil.

## Ändringslista (kod)

Återanvänd det som finns — bygg inte om.

1. **Profil som skyddat singelobjekt.** Bygg vidare på `CVMeta.isBaseProfile` (finns redan):
   säkerställ exakt en, markera tydligt, blockera radering. Första uppladdade CV → profil.
2. **Slå ihop till "rikta CV".** Ett flöde som ersätter separat "rollmall" + apply-wizard:
   välj roll (+ valfri annons) → färsk kopia av profilen → editor med rollfit.
3. **Koppla in annons-nedbrytningen.** Kör `analyze-job-posting` när en annons klistras in,
   visa resultatet, och skicka den strukturerade nedbrytningen (inte råtext) in i
   `analyze-role-fit`. Undvik överlapp med `ats-check`.
4. **Rollfiten läser hela profilen.** Klart: erfarenhet + utbildning (lätt vikt) + skills.
5. **Dashboard: profil + ansökningar.** Ersätt den platta CV-listan med profil-överst + ansökningslista.

## Redan byggt

- `analyze-role-fit` (edge function) + `RoleFitPanel` — score, nyckelord, betoning, omformuleringar, gap.
- Rollmall-dialog + rollråd (`role-advice.ts`, `RoleAdvicePanel`).
- Rollfiten läser redan erfarenhet + utbildning + skills.

## Kvar / att bekräfta senare

- Terminologi i UI (profil / ansökan / rikta CV) — hålla konsekvent.
- Om profilen på sikt förtjänar en egen, strukturerad datamodell istället för "ett CV med flagga"
  (starkare, men större ombygge — uppskjutet).
