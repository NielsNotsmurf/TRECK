# TRECK

## Werkwijze: token-vriendelijk en de rode draad volgen
Dit principe gaat boven alles, ook boven volledigheid.
- **Rode draad:** invoer (voice, foto en/of tekst) → AI-analyse → opgeslagen bij de juiste dag → dagtotaal. Elke stap levert die kern werkend op of versterkt hem direct. De rest gaat op de later-lijst.
- **Geen substappen:** geen hulpschermen, instellingenpagina's, abstracties, generieke frameworks of "handig voor later"-code. Eenvoudigste oplossing die nu werkt.
- **Scope creep:** nieuw idee? Niet bouwen; één regel op de later-lijst in docs/PLAN.md en door met de huidige fase.
- **Eén fase tegelijk:** pas af als de "klaar als"-test slaagt. Volgende fase pas na akkoord.
- **Zuinig met tokens:** lees alleen wat nodig is, herlees niet; kleine gerichte wijzigingen; geen lange uitleg of herhaling; rapporteer per stap in max. 3 regels (gedaan, getest, volgende stap).
- **Beslissingen:** elke keuze in één regel in docs/PLAN.md.
- **Twijfel:** kies wat de rode draad het snelst werkend maakt, meld het in één zin. Vraag alleen als het antwoord verandert wat je bouwt.

## Context
- PWA op het iPhone-beginscherm, geen Apple-kosten. Eén gebruiker. Praktisch gratis; 4–10 AI-verzoeken per dag.
- Stack en fases: zie docs/PLAN.md.
- API-sleutels alleen als Worker-secret, nooit in de client.
