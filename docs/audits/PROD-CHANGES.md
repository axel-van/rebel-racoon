# Changements à apporter à la prod pour se rapprocher du proto

---

## 00 · Onboarding welcome-flow (capture de brand au lancement)

- Pour un nouvel user (premier Playbook du workspace), lancer un onboarding 3-step :
  1. URL du site → analyse automatique (formatting style, visual style, brand colors, typography)
  2. Profil / audience → "Who do you write for?"
  3. Documents optionnels (brand guidelines PDF, charte éditoriale)
     → Recap du Playbook construit + premier prompt "Want to draft a launch post?"

## 2 · Liste des chats

- Dans la sidebar, la liste des chats repose sur un affichage de dates et heures. Ca n'est pas utile, ni lisible: la sidebar prod affiche actuellement 10+ entrées "May 28, 2026, 3:02 PM" / "test" — totalement inutilisable pour retrouver une conversation.
- le :hover change la hauteur de la card, ça ne devrait pas.
- Le rename devrait afficher une modale et non être inline
- Le delete devrait afficher une modale de confirmation.
- L'icône "pin" est à retirer des éléments pinned.
- New conversation -> créée un chat "vide" dans "récents", il faut que la session "existe" à partir du moment où un 1er message est envoyé, pas avant, pour éviter le bruit.
- Bouton "Give Feedback" à mettre tout en bas de la sidebar.

- **🤔 Pourquoi**: La navigation dans une fonctionnalité est un élément central, il permet de faire comprendre à l'utilisateur les éléments qu'il crée et comment intéragir avec.

## 3 · New conversation screen

- Le composer n'est pas centré verticalement, l'utilisateur ne sait pas quoi réaliser sur cette page.
- Le manque des cards de début de flows/exemples.
- les tabs en haut des panneaux ne sont pas à afficher.
- **🤔 Pourquoi** : Ne pas perdre l'utilisateur et maitriser son début d'expérience. Il faut que l'utilisateur sache ce qui est possible avec l'outil et par quoi commencer.

## 8 · Ajouter une "handoff card" à la fin du thread quand les drafts sont prêts

- remplacer le texte assistant "Your N posts are being generated and will be available in the Drafts tab" par une card visuelle proéminente :
  CTA explicite qui ouvre le Drafts panel.

## 9 · Status card flottante avec progression live (sources / ideas / drafts en cours)

ajouter un widget flottant (top-right) qui montre l'état des opérations longues d'Archie :

```
◐ Archie is working…
  ⏳ 2 sources processing
  ✦ 5 ideas extracted
  ✎ Draft 2/3 generating
```

S'affiche dès qu'une action async démarre, se replie quand tout est fini.

- **🤔 Pourquoi** : le proto donne un feedback temps-réel et permet de continuer à chatter pendant qu'Archie travaille en background. Sans ce widget, l'utilisateur attend passivement ou perd de vue ce qui est en cours.

## 10 · État processing live des sources (chip animé)

afficher l'état de chaque source dans le Sources panel avec un chip dynamique :

- `⏳ Processing…` (animation)
- `✓ Ready · 5 ideas`
- `⚠ Failed · Retry`

État dérivé du backend (websocket / SSE / polling). Le proto a une state machine claire : `uploading → processing → done`.

- **🤔 Pourquoi** : actuellement la prod ouvre le panneau source (qui est assez distrayant pour l'utilisateur) et montre la source, puis ouvre le panneau "ideas" sans que l'utilisateur ai touché quoi que ce soit. C'est perturbant pour l'utililisateur quand une interface bouge sans qu'il touche quoi que ce soit.

## 11 · Notifications de fin de génération

quand l'utilisateur navigue ailleurs pendant qu'Archie génère, push notif desktop ou toast à son retour : "5 drafts ready in Q2 launch announcement"

## 4 · Right panels Sizes + Collapsible sidebar (Automatique + icône burger en topbar)

- Les boutons de panels ne devraient pas être clickables si il n'y a rien dedans.
- La taille des rights panels en fonction de la largeur de l'écran à corriger.
- en fonction de ce qu'on ouvre comme panneaux, on collapse ou pas la sidebar.
- - **🤔 Pourquoi** : Permet à l'utilisateur de savoir sur quoi ce focus et quelle zone d'interaction devient importante.

## 6 · Unifier le modèle Playbook (combiner règles éditoriales + identité visuelle)

étendre le modèle Playbook de la prod pour ajouter les champs absents que le proto expose :

- **Audience** (textarea) — "Who you're writing for"
- **Current brief** (textarea) — actuellement la prod a une description brand mais pas un brief par campagne
- **Tone of voice** (multi-select 8 pills : Friendly, Professional, Bold, Witty, Inspirational, Direct, Conversational, Authoritative)
- **DO rules** (liste de strings)
- **DON'T rules** (liste de strings)
- **Default CTA** (texte)
- **Workspace tag** (Acme / Personal / etc.)

Conserver les champs prod existants (brand colors, typography, formatting style, visual style, brand personality, Re-analyze from website).

Réorganiser l'éditeur en 5 sections :

1. Identity (brand name, audience, workspace)
2. Visual (brand colors, typography)
3. Voice & Tone (tone-of-voice picker + brand personality + voice extraction)
4. Editorial rules (DO / DON'T / Default CTA)
5. Brief (per-campaign current brief)

## 7 · Draft Panel

- Les bulks actions devraient être dans une floating bar en bas de l'écran.

## 8 · Playbook edit

- Les playbooks devraient s'ouvrir en pleine page pour qu'ils soient plus facilement éditables.
- UI à revoir

## 7 · Mentions @ dans le composer (sources / ideas / Playbooks)

autocomplete `@` dans le composer pour mentionner :

- une source (@source-name) → Archie focusera sur ce doc
- une idea (@idea-title) → Archie partira de cette idée  
  Le proto a un picker keyboard-driven.

- **🤔 Pourquoi** : donne à l'utilisateur un control fin sans avoir à passer par des menus. Très puissant pour les power users qui veulent diriger Archie.

## 12 · Char counter par network dans les drafts

afficher `50/3000` pour LinkedIn, `50/280` pour X, etc. en haut-à-droite de chaque draft. Le proto a déjà ce pattern.

## 13 · Potential badge sur les Ideas (High / Medium / Low)

ajouter un champ "potential" calculé sur chaque idea (heuristique LLM ou règles : longueur, nouveauté, fit avec le Playbook). Afficher badge coloré (vert/orange/rouge).

## 14 · CTA "Draft Post" (vs "Use") sur les idea cards

remplacer le bouton "↑ Use" par "✦ Draft Post" qui est explicite sur l'action.

## 15 · Menu "more" (…) sur les idea cards

ajouter un menu kebab par idea : Edit · Duplicate · Move to Playbook · Mark as used · Delete

## 16 · "Re-mine sources" CTA + Sort dropdown sur Ideas

sur la page/panel Ideas, ajouter :

- `[↻ Re-mine sources]` — déclenche une nouvelle extraction LLM sur les sources existantes avec un prompt à jour
- Sort dropdown : Most recent · Most used · Highest potential · Alphabetical

## 17 · Drag-and-drop file anywhere

permettre de drop un PDF / image / vidéo n'importe où dans le composer ou le thread. Ajouter le hint "drag a file anywhere to add it as a source" dans le composer shortcuts. Le proto le fait déjà.

## 18 · Settings cog plus découvrable

le bouton settings en prod est un cog minuscule au bottom-right de la sub-sidebar. À remonter dans un popmenu accessible (avatar / user chip) ou en first-class nav item. Le proto a un popmenu structuré (Feedback / Bug / Shortcuts / Settings) au-dessus du user chip.

## 19 · Search modal global (⌘K)

raccourci clavier ⌘K (Mac) / Ctrl+K (Win) qui ouvre un modal de recherche full-text sur : Chats · Sources · Ideas · Drafts · Playbooks. Cibles cliquables.

- **🤔 Pourquoi** : le proto a une recherche qui sert de centre de gravité de navigation. Devient essentiel à mesure que la base grandit.

## 20 · Pin / hover icons sur les conversations recent

le proto révèle des icons "pin / rename / delete" au survol d'une conversation dans la sidebar. La prod a déjà rename + delete mais ne propose pas "pin". Ajouter pin.

## 21 · Connectors comme sources de knowledge MCP-queryable

intégrer Notion, Slite, Google Drive, Slack (et autres) comme **sources live** qu'Archie peut interroger via MCP. Modal de connexion (gallery + capabilities + connect flow). État `connected/syncing/disconnected/error`. Quand l'utilisateur "ask" un connector dans le chat, reasoning chip "Querying Notion via MCP" + answer cité.

- **🤔 Pourquoi** : feature signature du proto qui positionne Archie comme un "AI knowledge agent" branché sur la stack interne. Diffère des intégrations sociales (LinkedIn/X publishing) en cela qu'on parle de **knowledge sources**, pas de canaux de publication.

## 22 · Keyboard shortcuts legend (?)

modal avec la liste des raccourcis. Cmd+K = search, Cmd+N = new chat, Cmd+/ = focus composer, etc.

---

# Ordre d'importance recommandé

## 🔴 P0 — Important

1. **Unifier le modèle Playbook** — pilote à la fois la **forme** ET le **fond** des drafts. Sans ça les posts restent génériques : c'est le cœur de la promesse "on-brand".
2. **Onboarding welcome-flow** — aujourd'hui un nouvel utilisateur arrive sur un Playbook vide → bloqué. Livre un Playbook utilisable en ~90 s et amorce toute la chaîne.
3. **New conversation screen** — la première surface; si l'utilisateur ne sait pas quoi faire ni par où commencer, rien ne démarre.
4. **Liste des chats** — la navigation est centrale et actuellement "totalement inutilisable" (dates/heures, bruit des sessions vides). Hygiène de nav indispensable au quotidien.

## 🟠 P1 — Majeur (différenciateurs AI-native + boucle de feedback)

5. **Connectors comme sources MCP-queryable** — feature signature qui positionne Archie en "AI knowledge agent". Différenciateur produit le plus fort.
6. **Status card flottante (progression live)** — feedback temps-réel + multitâche pendant qu'Archie travaille; perception de vélocité.
7. **État processing live des sources (chip animé)** — supprime l'effet déroutant de panneaux qui s'ouvrent/bougent seuls; clarté sur ce que fait Archie.
8. **Handoff card (drafts prêts)** — l'élément le plus actionnable du thread; draine l'utilisateur vers l'étape suivante au lieu de le laisser deviner.
9. **Playbook edit en pleine page** — le Playbook étant le socle, son édition doit être confortable et lisible.

## 🟡 P2 — Mineur (quality-of-life)

10. **Right panels sizes + collapsible sidebar** — focus et zones d'interaction; panneaux non cliquables si vides, tailles correctes.
11. **Mentions @ dans le composer** — contrôle fin pour diriger Archie (power-users).
12. **Char counter par network** — évite les drafts qui dépassent les limites des réseaux.
13. **CTA "Draft Post" (vs "Use")** — clarifie le verbe d'action sur les idea cards.
14. **"Re-mine sources" + Sort dropdown** — entretien de la library d'ideas dans le temps.
15. **Potential badge sur les Ideas** — aide à prioriser quelle idée drafter en premier.
16. **Menu "more" (…) sur les idea cards** — rend accessibles les actions secondaires (edit / duplicate / move / delete).
17. **Draft Panel — bulk actions en floating bar** — ergonomie des actions groupées.
18. **Drag-and-drop file anywhere** — réduit la friction pour ajouter une source.
19. **Settings cog plus découvrable** — découvrabilité des réglages.

## 🟢 P3 — Nice-to-have (polish / power-user)

20. **Search modal global (⌘K)** — devient essentiel à mesure que la base grandit; gain surtout pour utilisateurs réguliers.
21. **Pin / hover icons sur les conversations** — organisation de la sidebar.
22. **Notifications de fin de génération** — confort multitâche quand l'utilisateur part ailleurs.
23. **Keyboard shortcuts legend (?)** — polish power-user.
