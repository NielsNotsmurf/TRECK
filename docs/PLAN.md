# TRECK – plan

Status: fase 1 klaar (getest op iPhone 11-11); fase 2 klaar 11-11; fase 3 klaar 11-11; fase 4 klaar 12-11 (Garmin via Apple Health + iOS-opdracht). Extra: inloggen met goedkeuring + wachtrij bij drukte. Volledig onderzoek: https://claude.ai/artifact/Qo8zJdyTyCgYJ1LwTnaXxX Fase 11 (UX-polish iOS, incl. 11b–h) klaar 12-11, push main.

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
- 2026-11-13 Backup-AI: Groq (Scout is 17-07-2026 uitgezet → foto: qwen/qwen3.8-27b, tekst: openai/gpt-oss-120b, dan qwen; GROQ_MODEL wint) springt in bij Gemini 429/5xx/time-out als secret GROQ_API_KEY bestaat; telt mee in AI-limiet per gebruiker; audio blijft Gemini-only.
- 2026-11-12 wrangler.toml keep_vars = true: dashboard-variabelen overleven deploys; sleutels nooit in de repo.
- 2026-11-12 AI-volgorde live: Gemini 8 s → Groq 10 s → wachtrij (alleen Gemini, 25 s, 2 per ronde, slot tegen overlappende cron = geen dubbele analyse).
- 2026-11-12 Goedkeuren toont eigen tekst + foto (items.photo, alleen wachtrij-invoer, gewist bij goedkeuren) boven "AI maakte ervan".
- 2026-11-12 AI-acties: verstuur, inspreken (Whisper), gerecht met AI, Inzichten-samenvatting, Programma-advies; elk één verzoek, knop geblokkeerd tijdens verzoek; ✦ op knoppen.
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
- 2026-11-12 Spraak terug (wens gebruiker): microfoonknop in typebalk, MediaRecorder → `POST /api/transcribe` (Groq Whisper large-v3, nl; telt niet als AI-verzoek, gebruiker wil geen AI-kosten voor uitschrijven) → tekst in het veld om na te lezen. Web Speech API niet: onbetrouwbaar in iOS-beginscherm-apps. Uitschrijven mislukt → kiezen Opnieuw of Versturen (audio direct naar analyse/wachtrij).
- 2026-11-12 Dagdeel uit tekst: woord ontbijt/lunch/avondeten(diner)/tussendoor(snack, extraatje) in de invoer wint van het tijdstip, zonder AI (`mealWord` in analyze.js; één dagdeel genoemd → hele invoer). Meerdere genoemd → AI geeft per item `meal`. Extraatje = Tussendoor (geen 5e dagdeel). Lijst uitgebreid (ochtend, brunch, 's middags, avond, toetje, borrel, 's nachts…).
- 2026-11-12 Aantallen zonder AI: `counts` herkent 2x/twee keer/dubbel/halve en geeft ze als harde hint mee in hetzelfde ene AI-verzoek; item met aantal ≠1 stuk krijgt een gekleurd "2×"-label. Max 1 AI-verzoek per invoer, spraak telt niet.
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
- 2026-11-12 Fase 11b: "iOS & Garmin" → "Verbruik koppelen": bron kiezen (Garmin / Apple Watch / alleen iPhone), 5 uitklapbare stappen met nagetekende iOS-schermpjes, ontvangen dagen ingeklapt. Zonder horloge alleen actieve energie (iPhone meet geen rust).
- 2026-11-12 Fase 5: tabel `weight` (user_id, date, kg); `POST /api/weight` overschrijft die dag. Gebruiker kiest: puur handmatig, geen koppeling met Health/weegschaal.
- 2026-11-12 Trend: dagkaart toont laatste weging t/m geopende dag, verschil en lijntje over 30 dagen.
- 2026-11-12 Gewicht ook handmatig: tik op de gewichtregel (of '+ gewicht') → invoer voor de geopende dag, zelfde /api/weight.
- 2026-11-12 Fase 6: alleen kanaal Web Push (iOS 16.4+, beginscherm-app). Menu → Meldingen → tijden typen (voorstel 10:00, 14:00, 20:00, 22:00; leeg = uit), direct testmelding. Push zonder payload, sw.js toont vaste tekst. VAPID-sleutel maakt de Worker zelf en bewaart hem in D1 `config` (geen handmatig secret). Cron elke minuut (wachtrij-retry blijft elke 10 min) stuurt per tijd één melding binnen 30 min, NL-tijd. Wekelijks wegen: aparte dag+tijd (bv. 'ma 08:00'); tekst per melding haalt sw.js op via /api/pushmsg?e=endpoint (geen login, endpoint is geheim genoeg). Tabel `push` (user_id, endpoint, origin, times, sent); 404/410 = abonnement weg.
- 2026-11-12 Fase 7: AI geeft per item `amount` + `unit` (g/ml/stuk), opgeslagen in items (auto-migratie). g/ml = slider (bereik 2,5× AI-hoeveelheid), stuk/oude items = +/− (stap 1, onder 1 stap ½); kcal/macro's schalen lineair, geen AI-verzoek.
- 2026-11-12 Fase 7: foto toont miniatuur met hint "typ context erbij"; tekst + foto gaan in één analyse. Wissen/aanpassen van items hersteld (PUT/DELETE waren per ongeluk weggevallen).
- 2026-11-12 Fase 7: food-thema (crème/tomaat/oranje/avocado), ring = inname t.o.v. verbruik, zonder verbruik t.o.v. 2000 kcal tot fase 9; korte motiverende tekst.
- 2026-11-12 Fase 7: onderbalk Vandaag / Recepten / Inzichten / Programma / Meer. Alleen Vandaag en Meer werken; de rest toont "komt in een volgende fase". Menu = lijst met iconen.
- 2026-11-12 Fase 8: teller in D1 `config` (k=ai, per Pacific-dag) telt elk geslaagd Gemini-verzoek; 429 met `PerDay` in quotaId = balk vol + wachtrij pauzeert tot reset, anders "even wachten". Balk bovenaan Instellingen in Meer, GET /api/ai.
- 2026-11-12 Fase 8: limiet per gebruiker (config k=ai:<id>): gratis 10/dag, abonnement 100/dag; daarboven stopt de AI (429 met uitleg). Abonnement is nep: tik in Meer = direct aan/uit (kolom users.plan).
- 2026-11-12 Fase 9: doel zonder AI (ook geen wekelijkse AI-call): verbruik = gem. inname gelogde dagen − gewichtstrend (regressie) × 7700, venster 28 d vóór de maandag (doel staat een week vast). Pas bij ≥14 gelogde dagen en wegingen ≥7 d uit elkaar.
- 2026-11-12 Fase 9: tempo in Meer → Doel (tik wisselt): afvallen −550 (standaard), op gewicht 0, aankomen +275 kcal; min. 1200. Macro's: eiwit 1,8 g/kg, vet 25%, rest koolh. Uitleg = vaste zin met de cijfers.
- Fase 10: iOS-stijl (HIG): systeemkleuren, grouped inset lists met gekleurde icoontegels in Meer, eigen SVG-lijniconen i.p.v. emoji in de UI, iMessage-achtige typebalk (camera · pil · verstuurpijl, Enter = versturen), sheets met handgreep en Annuleer/Bewaar-kop.
- Fase 10: item-icoon = Apple-voedselemoji in een tegel, gekozen op trefwoord in de productnaam (client, geen AI); verwijderen zit in het item-scherm i.p.v. op elke regel.
- 2026-11-12 Fase 12: statistieken zonder AI (GET /api/stats?days=7|30|90), vandaag telt niet mee in gemiddelden (dag nog niet af); periode start bij de eerste data. Grafieken als inline SVG, geen bibliotheek.
- 2026-11-12 Fase 12: AI-samenvatting (POST /api/insight) = 30 dagtotalen als CSV + doel naar Gemini, max 4 zinnen, geen advies/programma; bewaard in config k=insight:<id> per NL-dag, telt mee in de limiet per gebruiker. Geen stappenteller-data, alleen calorieën (besluit gebruiker).
- 2026-11-12 Gerecht (note meal:<id>, zelfde input_id) verhuist als geheel bij slepen/ander dagdeel/andere dag; wissen en aanpassen blijven per item.
- 2026-11-12 Beginscherm-uitnodiging: iOS = banner met uitleg (Deel → Zet op beginscherm), elders installeerknop; "Niet nu" = nooit meer (localStorage). Verbruik-regel alleen zichtbaar als er ooit verbruik binnenkwam (Garmin/Apple Health is optioneel).
- 2026-11-12 Fase 13: instellingen in config k=prog:<id> (geen migratie); streefgewicht+datum → users.goal/pace (0,1–1 kg/wk); focus bepaalt eiwit g/kg (afvallen 1,8, op gewicht 1,6, spier 2,2, aankomen 1,8) ook in het adaptieve doel.
- 2026-11-12 Fase 13: KPI's rekenen in de client (BMI, Deurenberg-vet%, Mifflin-ruststofwisseling, trend, macro-aandelen, reeks e.d.); ontbrekende data = tegel 'Nog niet' met wat nodig is. Volgorde = volgorde van aanzetten.
- 2026-11-12 Fase 13: AI-advies alleen op knop (niet automatisch, spaart limiet), max 1× per NL-dag, bewaard in k=advice:<id>; input = 14 dagtotalen + 20 meest gegeten producten + doel.
- 2026-11-14 Verbruik "11.823" (iPhone, decimaal) werd 11823: punt+3 cijfers is alleen duizendtal als het ≤ 6000 kcal geeft; foute rijen > 6000 actief eenmalig gecorrigeerd.
- 2026-11-14 Activiteiten (tik op Verbruik): tekst/spraak → AI schat extra kcal bovenop rust ((MET−1)×kg×u), tabel acts; telt via view burn_total alleen mee bij bron "Alleen iPhone" (keuze in Verbruik koppelen, nu ook op server users.src) en op dagen met Apple Health-verbruik, anders dubbel met horloge.

## Voorstel verbeteringen (12-11, wacht op akkoord)
Vergeleken met MyFitnessPal, Lose It!, Cronometer en MacroFactor. Volgorde volgens de rode draad; elk een eigen fase ná 6 (meldingen).
| Fase | Doel | Klaar als |
| --- | --- | --- |
| 7 Invoer & weergave | Foto toont miniatuur + "context toevoegen" in het tekstveld vóór versturen (kan technisch al, maar is niet zichtbaar). Item: +/− (stuks/porties) en slider voor gram/ml; AI geeft daarvoor `amount` + `unit` (g, ml, stuk) mee, kcal/macro's schalen mee zonder AI-verzoek. Food-thema: warme kleuren, voortgangsring dagtotaal, motiverende tekst | Foto + zin geeft één analyse; slider/+− past kcal direct aan; nieuwe look op iPhone |
| 8 AI-limietbalk | Dunne balk in het menu: "AI vandaag 12/500" + reset 09:00 NL (middernacht Pacific). Telt elk Gemini-verzoek in D1; bij 429 leest de Worker `quotaId` (per minuut = "even wachten", per dag = balk vol, invoer naar wachtrij) | Balk telt mee per verzoek en springt op vol bij een echte dag-429 |
| 9 Doelen (adaptief) | Kcal-doel zoals MacroFactor: echt verbruik uit gewichtstrend + inname (rekenwerk, geen AI). AI 1× per week: doel + macro's (eiwit eerst) met één zin uitleg. Dagkaart: "nog X kcal" + macro-balkjes | Na ≥14 dagen data staat er een doel met uitleg; dagkaart toont resterend |
| 10 Usability & look | Instellingen (Meer) en emoji's vervangen door een rustige, consistente stijl (lijn-iconen); duidelijkere typebalk (placeholder, knoppen, focus); betere plaatsing/ordening van items op de dagkaart; automatisch een icoon (of afbeelding) per item op basis van het product | Gebruiker vindt menu, typebalk en itemlijst op iPhone duidelijk en mooi; elk item heeft een passend icoon zonder extra AI-verzoek |
| 11 UX-polish (iOS) | De belangrijkste 3–5 optimalisaties per scherm, zie "Fase 11 details" | Gebruiker test elk scherm op iPhone en vindt het native en duidelijk; geen prompt-popups meer |
| 12 Analytics (Inzichten) | Inzichten-tab: 7/30/90 d, gem. inname vs doel, dagen op doel, tekort/overschot met verwachte vs gemeten kg/week, grafiek inname/verbruik/doel, gewichtsgrafiek, macro's vs doel + energieverdeling. AI-samenvatting max 1/dag (bewaard), binnen de AI-limiet per gebruiker | Grafieken kloppen met gelogde data; 2e tik op samenvatting dezelfde dag = bewaard antwoord zonder AI-verzoek |
| 13 Voedingsprogramma & advies | Programma-tab: mijn doel (focus, streefgewicht/-datum, lengte/leeftijd/geslacht), kerncijfers-slider (28 KPI's, zelf te kiezen), voortgang, 'vandaag nog' uit favorieten, AI-advies (3 tips + voorbeelddag). Geen stappenteller-data | Doel instellen verandert tempo/dagdoel; KPI's kiezen blijft bewaard; advies werkt op iPhone |

- Limiet (bronnen 23-10 en 2-9-2026): 3.1 Flash-Lite gratis = 15/min, 500/dag per Google-project; Google publiceert het niet meer officieel, eigen stand op aistudio.google.com/rate-limit. Gemini stuurt geen resterend-headers, alleen een 429 met QuotaFailure → balk = eigen teller (max via `AI_DAY_LIMIT`, standaard 500) + 429-signaal.
- Gebruik nu ≈4–10/dag; doelen +1/week, analyse max +1/dag → ruim binnen 500, ook met een paar gebruikers.
- Snelle winst zonder AI (veel gevraagd, klein): "kopieer gisteren" per maaltijd, streak-teller, weekgrafiek inname vs verbruik.

### Fase 11 details (12-11, gekozen uit 110 ideeën)
- Dagkaart: vegen tussen dagen; knop "Vandaag" op andere dagen; tik op titel = kalender; schattingsdag met streepjesring + label; grote titel krimpt bij scrollen.
- Snel toevoegen: sorteren op tijdstip; lang drukken = aanpassen/verwijderen; "Ongedaan maken" na toevoegen; chip "Zelfde als gisteren".
- Gegeten-lijst: groeperen per maaltijd met subtotaal; vegen = verwijderen/favoriet; slider/± pas na tik (uitklappen); nieuw AI-item even markeren; lang drukken = andere dag/dupliceren.
- Typebalk: "denkt na"-bubbel tijdens analyse; resultaatkaartje "3 items op vrijdag · bekijk"; placeholder per tijdstip; balk netjes boven toetsenbord (visualViewport); fout als bubbel met "Opnieuw".
- Item-editor: grote kcal + icoon bovenaan; portie-eenheid als picker (g/ml/stuks); dag en maaltijd kiezen; "Wijzigingen weggooien?" bij annuleren.
- Meer: profielkop (naam, doel, gewicht); Mijn gerechten als subscherm; status rechts in rijen ("Aan · 4×", "Verbonden"); AI-balk oranje vanaf 80%.
- Doel: eigen scherm met segmentkeuze + tempo-slider; live "≈ X kcal/dag"; voortgang "9/14 dagen" als balk.
- Meldingen: eigen scherm i.p.v. prompts; iOS-tijdkiezer met +; schakelaar per melding; knop testmelding.
- iOS & Garmin: status "laatst ontvangen" groen/rood bovenaan; stappen als checklist; ontbrekende dagen markeren; "Gekopieerd"-toast i.p.v. alert.
- Inloggen: wachtwoord tonen (oog); fout onder het veld; laadspinner in de knop.
- Onderbalk: lege tabs grijs met "Binnenkort"; opnieuw tikken op Vandaag = naar boven + vandaag; gevuld icoon bij actieve tab.

- Fase 11 keuzes (12-11): maaltijd per item = kolom `meal`, leeg → afgeleid van invoertijd (ontbijt 5–11, lunch 11–15, avond 17–22, rest tussendoor); tempo per gebruiker (`users.pace`, kg/week × 1100 kcal/dag); AI-resultaat springt niet meer naar de dag maar toont "Bekijk"; meldingen die uit staan bewaart de telefoon (localStorage), server krijgt alleen de aan-tijden; Garmin-checklist ook lokaal.

- Fase 11c (12-11): dagdelen staan altijd op de dag (ook leeg); lang vasthouden + slepen = ander dagdeel (kolom `meal`), loslaten zonder slepen = menu. Zonder eigen keuze bepaalt de invoertijd het dagdeel.

- Fase 11d (12-11): favoriet = één los item (`meals.source = item:<id>`), niet meer de hele invoer; oude favorieten per invoer blijven werken. Tijdens typen staan passende favorieten boven de typebalk (tik = toevoegen, geen AI).

- Fase 11e (12-11): ring volgt je doelkeuze ook vóór het persoonlijke doel (verbruik of 2000 ± tempo×1100). Ringkleur: groen 90–105%, rood erboven (bij aankomen niet). Dunne buitenring = tekort/overschot t.o.v. wat je doel vraagt, groen = goede kant op.

- Fase 11h (12-11): voedselemoji vervangen door 17 eigen lijn-iconen (zelfde stijl als de app), gekleurd tegeltje per categorie; onbekend = bestek.
- Fase 11g (12-11): Vandaag-tab in het midden van de onderbalk, alleen icoon (oranje rondje).
- Fase 11f (12-11): live AI-verzoek geeft na 12 s op → wachtrij (cron 60 s timeout). Uit de wachtrij verwerkte items krijgen `items.review = 1`, tellen nergens mee en verschijnen bij openen van de app in "Goedkeuren" (dagdeel, aanpassen, wissen) → `POST /api/review`. Tijdstip = moment van invoer.

## Open vragen
- Geen.

## Later
- Top-up (losse extra AI-verzoeken) en echte betaling voor het abonnement.
- Onderbalk-tabs vullen: recepten/gerechten-suggesties (Programma = fase 13).
- Evt. stappenteller-attributen uit Apple Health in analytics (gebruiker: voorlopig vermijden).
- Barcodescanner via Open Food Facts (gratis, geen AI-verzoek).
- Micronutriënten (vezels, suiker, zout) zoals Cronometer.
- Water bijhouden.
- Offline invoer bewaren op de telefoon als er geen internet is.
- Wachtwoord wijzigen.
- Beperking op inlogpogingen.
- Gewicht automatisch uit Apple Health via de iOS-opdracht (endpoint bestaat al).
- Foto's bewaren per invoer en tonen bij het item (nu worden foto's niet bewaard).
- Meldingen: ander kanaal (mail/Telegram), tekst met dagtotaal (payload-encryptie), alleen melden als er nog niets is ingevoerd.
