# TRECK
Persoonlijke kcal-tracker: tekst, foto of spraak → Gemini → juiste dag → dagtotaal. Plan: [docs/PLAN.md](docs/PLAN.md).

## Online zetten (eenmalig, Cloudflare gratis)
1. **Gemini-sleutel:** maak er een op https://aistudio.google.com/apikey.
2. **Database:** Cloudflare-dashboard → Storage & Databases → D1 → Create, naam `treck`. Open de Console-tab en plak de inhoud van `schema.sql`. Zet het `database_id` in `wrangler.toml`.
3. **App:** Workers & Pages → Create → Worker → Import a repository → deze repo, branch `main`, deploy command `npx wrangler deploy`.
4. **Geheimen:** in de Worker → Settings → Variables and Secrets: `GEMINI_API_KEY` (stap 1) en `APP_SECRET` (zelfgekozen lange code). Daarna opnieuw deployen.
5. **iPhone:** open de `*.workers.dev`-URL in Safari → Deel → Zet op beginscherm. Eerste keer: vul je `APP_SECRET` in.

## Lokaal
`npm i`, `.dev.vars` met `GEMINI_API_KEY=` en `APP_SECRET=`, `npm run db:local`, `npm run dev`.
