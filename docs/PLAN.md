# TRECK – plan

Status: fase 1 klaar (getest op iPhone 11-11); fase 2 klaar 11-11; fase 3 klaar 11-11; fase 4 klaar 12-11 (Garmin via Apple Health + iOS-opdracht). Extra: inloggen met goedkeuring + wachtrij bij drukte. Volledig onderzoek: https://claude.ai/artifact/Qo8zJdyTyCgYJ1LwTnaXxX

## Fases
| Fase | Doel | Klaar als |
| --- | --- | --- |
| 1 Kern | Invoer → AI → juiste dag → dagtotaal | Vanaf beginscherm komen tekst, foto en voice memo ("gisteravond pasta") op de juiste dag, dagtotaal klopt, sleutel niet in de app |
| 2 Geheugen | Vaste producten, eigen gerechten, snelle combinaties | "Mijn ontbijt" geeft vaste portie; top-combinatie met één tik |
| 3 Vergeten dagen | Schatting uit 14-daags gemiddelde, gemarkeerd | Lege dag toont schatting, telt niet mee in echte gemiddelden |
| 4 Garmin | Verbruik naast intake | Elke dag toont verbruik en overschot/tekort |
| 5 Weegschaal | Gewichtstrend | Nieuwe weging staat dezelfde dag in de trend |
| 6 Meldingen | Herinneringen naar keuze | Melding op gekozen tijd, uit te zetten |

Fase 1 deliverables: PWA met één scherm (tekstveld, fotoknop, opnameknop, dagoverzicht met vorige/volgende dag, item wissen); Worker `/analyze` + `/items`; D1-tabel `items`.

## Beslissingen
- 2026-11-11 AI: Gemini 3.1 Flash-Lite (foto+audio+tekst in één verzoek); terugval: Claude Haiku 5.5 + Groq Whisper.
- 2026-11-11 AI zit achter één functie `analyseer(invoer) → items[]` in de Worker.
- 2026-11-11 Claude Pro niet gebruikt: dekt geen API-gebruik, Claude verwerkt geen audio.
- 2026-11-11 Stack: Cloudflare Pages (PWA) + Worker (sleutels als secret) + D1.
- 2026-11-11 Toegang: één lang geheim, eenmalig in de app ingevoerd.
- 2026-11-11 Datamodel kern: één tabel `items` (input_id, date, product, portion, kcal, protein_g, carbs_g, fat_g, note, created_at); foto/audio niet bewaren.
- 2026-11-11 Dag bepalen: app stuurt lokale datum+tijd mee, AI geeft per item de datum.
- 2026-11-11 Voice-terugval: dicteerknop iOS-toetsenbord als MediaRecorder faalt in standalone.
- 2026-11-11 Garmin: Personal API (gratis sinds 22-10-2026); terugval Apple Health via iOS-opdracht.
- 2026-11-11 Weegschaal: via Apple Health + iOS-opdracht (dekt alle merken).
- 2026-11-11 Gebruiker kiest gratis: Gemini gratis laag (data mag voor training). Groq alleen als audio-terugval (geen betrouwbare gratis vision).
- 2026-11-11 Weegschaal = generieke bol.com/AliExpress-schaal → fase 5 via de app van de schaal → Apple Health → iOS-opdracht.
- 2026-11-11 Pages vervangen door Worker met statische assets (`src/worker.js`, `public/`), omdat Cloudflare standaard een Worker aanmaakt.
- 2026-11-11 Fase 1: Pages Functions (`functions/api`), AI in `src/ai.js`, foto client-side verkleind tot 1024 px, toegang via header `x-key`.
- 2026-11-11 Code in GitHub-repo NielsNotsmurf/TRECK.
- 2026-11-11 Gratis limiet (gemeten, dev.to 9-11-2026): 3.1 Flash-Lite 500/dag per project → ruim voor 1–3 personen; 3.5 Flash maar 20/dag → niet gebruiken. Meer personen = kolom user_id + eigen geheim per persoon (later).

- 2026-11-11 Inloggen: naam + wachtwoord (PBKDF2), sessietoken; nieuwe gebruikers wachten op goedkeuring in de app. Items per user_id.
- 2026-11-11 Wachtrij: Gemini 429/5xx → tabel `queue`, cron elke 10 min probeert 5 oudste opnieuw (max 50 pogingen); `now` van invoer blijft bewaard.

- 2026-11-11 Admin = naam `admin` + `APP_SECRET`. Google-inlog via Google Identity Services (ID-token gecheckt via tokeninfo, `GOOGLE_CLIENT_ID`). Apple-inlog niet: kost een betaald Apple-account.
- 2026-11-11 Database migreert zichzelf bij eerste aanvraag (`ensureSchema`).
- 2026-11-11 Werkwijze: Claude merget zelf en pusht direct naar main (geen PR's/preview-builds).
- 2026-11-11 Fase 2: tabel `meals` (eigen gerechten, items als JSON). ☆ bij item bewaart die hele invoer onder een naam. AI krijgt eigen gerechten + vaste porties (producten ≥2x gegeten) mee als context.
- 2026-11-11 Snel toevoegen: chips met eigen gerechten + combinaties die in 60 dagen ≥2x gegeten zijn; één tik kopieert items naar de dag zonder AI-verzoek.
- 2026-11-11 Menu (⋯): gerechten wissen, uitloggen (wist sessie), account verwijderen (wist items, wachtrij, gerechten, sessies, gebruiker).
- 2026-11-11 Opnameknop weg: invoer = tekst (met dicteren via iOS-toetsenbord) + foto. Worker accepteert audio nog.
- 2026-11-11 Item aantikken = handmatig aanpassen (PUT /api/items); ☆ daarna bewaart de aangepaste waarden.
- 2026-11-11 Preset maken met + bij Snel toevoegen: velden per product of AI-balk (/api/parse, slaat niets op) en daarna alles bewerkbaar. Preset aantikken in menu = aanpassen.
- 2026-11-11 ☆ synchroon: meals.source = input_id, snel toegevoegd item krijgt note `meal:id`; gevulde ★ opnieuw tikken = uit favorieten. Ook verwijderen in preset-editor.
- 2026-11-11 Typebalk sorteert favorieten op woordovereenkomst; niet-passende worden vaag.
- 2026-11-11 Uiterlijk: kaarten, licht/donker, invoerbalk vast onderaan.
- 2026-11-11 Fase 3: lege dag in het verleden toont schatting = gemiddelde van ingevulde dagen in de 14 dagen ervoor (per gebruiker). Wordt live berekend, niet opgeslagen, dus telt nooit mee in echte data; grijs/cursief met ≈. Geen schatting zonder eerdere invoer.
- 2026-11-11 Fase 4 via Apple Health + iOS-opdracht i.p.v. Garmin Personal API: geen OAuth/ontwikkelaarsaanvraag, zelfde route als fase 5. Garmin Connect → Apple Health (actieve + rustenergie).
- 2026-11-11 Tabel `burn` (user_id, date, kcal); `POST /api/burn {date, active, resting}` overschrijft die dag. Sleutel = eigen sessie via menu "Sleutel iOS-opdracht" (blijft na uitloggen).
- 2026-11-11 Dagkaart: "Verbruik X kcal · tekort/overschot Y" (verbruik − intake; bij schatting met ≈).
- 2026-11-12 Dag zonder verbruik: ≈ gemiddelde verbruik van de 14 dagen ervoor (live, niet opgeslagen). Shortcut mag waarden ook als header sturen.
- 2026-11-12 Verbruik zonder datum = vandaag in NL-tijd (Europe/Amsterdam). Opdracht draait vaak (bij sluiten Garmin Connect + vaste tijden, laatste 23:55); elke run overschrijft de dag met het nieuwste totaal.
- 2026-11-12 Invoer zonder genoemde dag komt op de geopende dag (app geeft die mee in `now`), anders vandaag.
- 2026-11-12 Verbruik per dag los: schatting alleen op voorbije dagen, vandaag = "tot nu" + tijd laatste update, toekomst leeg. Week (vanaf ma) en maand (vanaf 1e) t/m geopende dag = som(verbruik − inname) over dagen met echte inname én echt verbruik.
- 2026-11-12 Burn: kolommen active/resting apart, verzoek met één van beide laat de ander staan. Opdracht stuurt per dag uit Apple Health (Group by Day, laatste 30 dagen) → elke run vult historie aan, geen gaten na een week offline.
- 2026-11-12 Menu-knop "iOS & Garmin": uitleg koppelen, sleutel kopiëren, ontvangen verbruik (30 d) en wissen. Opdracht kan niet vanuit de app geëxporteerd worden (iOS vereist ondertekende .shortcut); later evt. iCloud-link van werkende opdracht met importvraag voor de sleutel.
- 2026-11-12 Fase 5: tabel `weight` (user_id, date, kg); `POST /api/weight` (headers `date`, `kg`) via dezelfde iOS-opdracht: Find Health Samples Weight 30 d, oudste eerst → laatste weging van de dag wint. Geen Group by Day nodig.
- 2026-11-12 Trend: dagkaart toont laatste weging t/m geopende dag, verschil en lijntje over 30 dagen. Uitleg + ontvangen gewicht in ⋯ → iOS & Garmin.

## Open vragen
- Geen.

## Later
- Offline invoer bewaren op de telefoon als er geen internet is.
- Wachtwoord wijzigen.
- Beperking op inlogpogingen.
- Foto's bewaren per invoer en tonen bij het item (nu worden foto's niet bewaard).
