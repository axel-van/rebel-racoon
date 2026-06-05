# Changements à apporter à la prod pour se rapprocher du proto

> Document compagnon de [`PROD-VS-PROTOTYPE.md`](./PROD-VS-PROTOTYPE.md). Ici, on ne garde que les **changements à faire côté prod** (Studio / Archie embedded), triés par priorité.
>
> Les écarts où la prod a raison sur le proto (ex. preview LinkedIn-style des drafts) ne figurent pas ici — voir le rapport complet pour ceux-là.
>
> Auteur : Matthieu Bousendorfer · Date : 2026-06-05

---

## Comment lire ce doc

Chaque changement a :

- **🎯 Quoi** : description concrète
- **🤔 Pourquoi** : ce que le proto a démontré + ref section
- **⚙️ Effort** : XS (< 1j) · S (1-3j) · M (1 semaine) · L (2-3 semaines) · XL (1+ mois)
- **📈 Impact** : qualitatif (UX/produit)
- **🔗 Lié** : autres changements interdépendants

Codes priorité :

- **P0 — Bloquant** : fondamentaux à corriger avant tout le reste
- **P1 — Majeur** : différenciateurs UX importants
- **P2 — Mineur** : alignements ciblés, faciles à expédier
- **P3 — Nice-to-have** : polish, à grouper en sprint dédié

---

## P0 — Bloquants

### P0-1 · Renommer toutes les occurrences de "context" en "Playbook" dans le copy

- **🎯 Quoi** : sur l'écran "Pick a context to start chatting", remplacer titre + corps par "Pick a Playbook to start chatting" / "A Playbook holds your brief, voice and brand theme — Archie needs one before it can generate posts on-brand. Choose one from the chip below." Le chip composer dit déjà "No Playbook 🔒" — c'est la cible. Auditer tous les autres écrans Studio pour traces de "context".
- **🤔 Pourquoi** : la prod mélange les deux termes sur le même écran (titre = "context", chip = "Playbook"). Mauvaise expérience pour un nouveau user qui doit deviner que c'est la même chose. Voir [PROD-VS-PROTOTYPE.md §10.3](./PROD-VS-PROTOTYPE.md#10-bugs).
- **⚙️ Effort** : XS (grep + remplace dans les fichiers de traduction / strings)
- **📈 Impact** : cohérence terminologique immédiate, clarification du modèle mental
- **🔗 Lié** : P0-3 (modèle Playbook unifié)

### P0-2 · Auto-naming des sessions (remplacer les timestamps comme titres)

- **🎯 Quoi** : générer automatiquement un titre de session court (5-8 mots) à partir du sujet de la première saisie utilisateur ou du premier source uploadé. Permettre rename inline (clic sur le titre dans la sidebar). Garder le timestamp en metadata accessible au survol.
- **🤔 Pourquoi** : la sidebar prod affiche actuellement 10+ entrées "May 28, 2026, 3:02 PM" / "test" — totalement inutilisable pour retrouver une conversation. Le proto auto-génère "Q2 launch announcement", "Riverside customer story", "Weekly engagement recap" — la liste devient scannable. Voir [§2.1](./PROD-VS-PROTOTYPE.md#2-app-shell).
- **⚙️ Effort** : S (1-2 jours — endpoint de génération + UI rename + heuristique de premier titre)
- **📈 Impact** : 🔴 énorme — c'est la friction #1 sur la navigation prod aujourd'hui
- **🔗 Lié** : aucun

### P0-3 · Unifier le modèle Playbook (combiner règles éditoriales + identité visuelle)

- **🎯 Quoi** : étendre le modèle Playbook de la prod pour ajouter les champs absents que le proto expose :
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
- **🤔 Pourquoi** : aujourd'hui le Playbook prod = identité visuelle uniquement → Archie sait à quoi ressemble la marque mais pas quoi dire ni quel ton prendre. Le proto a démontré qu'on peut driver la **forme** ET le **fond** depuis un seul Playbook. Voir [§5.2](./PROD-VS-PROTOTYPE.md#5-playbooks).
- **⚙️ Effort** : L (2-3 semaines — schema migration + UI éditeur + intégration LLM prompt)
- **📈 Impact** : 🔴 fondamental — les drafts sortiront enfin "on-brand" sur le ton ET le visuel
- **🔗 Lié** : P0-1, P1-3 (édition conversationnelle)

### P0-4 · Fix bug HTML rendu en clair sur "assistant-suggestions" (proto)

> ⚠️ Ce bug est **côté proto**, pas prod. Mentionné ici pour rappel.

---

## P1 — Majeurs (différenciateurs UX)

### P1-1 · Ajouter une "handoff card" à la fin du thread quand les drafts sont prêts

- **🎯 Quoi** : remplacer le texte assistant "Your N posts are being generated and will be available in the Drafts tab" par une card visuelle proéminente :
  ```
  ╔════════════════════════════════════════════════╗
  ║ ✎  2 drafts ready                              ║
  ║    Across 2 networks · review, edit, schedule  ║
  ║                                  [View drafts ▸]║
  ╚════════════════════════════════════════════════╝
  ```
  Card orange (DS spotlight), CTA explicite qui ouvre le Drafts panel.
- **🤔 Pourquoi** : le proto a démontré que cette card est l'élément le plus actionnable du thread, qui draine immédiatement l'utilisateur vers la prochaine étape. La prod laisse l'utilisateur deviner où aller. Voir [§4.3](./PROD-VS-PROTOTYPE.md#4-session-de-chat).
- **⚙️ Effort** : XS (~ 1 jour — composant + intégration thread)
- **📈 Impact** : 🟠 fort — taux de conversion thread → drafts panel
- **🔗 Lié** : aucun

### P1-2 · Status card flottante avec progression live (sources / ideas / drafts en cours)

- **🎯 Quoi** : ajouter un widget flottant (bottom-right ou top-right) qui montre l'état des opérations longues d'Archie :
  ```
  ◐ Archie is working…
    ⏳ 2 sources processing
    ✦ 5 ideas extracted
    ✎ Draft 2/3 generating
  ```
  S'affiche dès qu'une action async démarre, se replie quand tout est fini.
- **🤔 Pourquoi** : le proto a `conversation-status-card.js` qui donne un feedback temps-réel et permet de continuer à chatter pendant qu'Archie travaille en background. Sans ce widget, l'utilisateur attend passivement ou perd de vue ce qui est en cours. Voir [§2.2](./PROD-VS-PROTOTYPE.md#2-app-shell).
- **⚙️ Effort** : M (~1 semaine — widget + event stream backend si pas déjà streaming)
- **📈 Impact** : 🟠 fort — perception de vélocité + multitâche utilisateur
- **🔗 Lié** : P1-5 (état processing live des sources)

### P1-3 · Édition conversationnelle des Playbooks

- **🎯 Quoi** : permettre de modifier les champs d'un Playbook via chat (au lieu d'éditer un formulaire) :
  - Dans le chat, l'utilisateur tape "Update the brief to focus on Q3 launch instead"
  - Archie répond avec une proposition de réécriture
  - L'utilisateur valide / re-formule
  - Le champ est mis à jour
  
  Implémentation : intent detector sur les messages utilisateur, micro-flow conversationnel (`playbook-editor.js` côté proto comme référence). Garder le formulaire comme fallback pour les power users.
- **🤔 Pourquoi** : c'est un differentiator UX clé de l'expérience "AI-native" que pousse le proto. L'utilisateur garde le contexte de la conversation au lieu de basculer en mode formulaire. Voir [§5.3](./PROD-VS-PROTOTYPE.md#5-playbooks).
- **⚙️ Effort** : L (2-3 semaines — intent classifier + flow orchestrateur + reprise dans la conversation)
- **📈 Impact** : 🟠 fort — positionne Studio/Archie comme "vraiment AI" vs "form + IA en pop-up"
- **🔗 Lié** : P0-3 (modèle Playbook unifié)

### P1-4 · Workspace tagging des Playbooks (Team / Personal / Project)

- **🎯 Quoi** : ajouter un champ `workspace` ou `scope` sur chaque Playbook (ex. "Acme", "Jamie · Personal", "Q2 launch"). Filtre dans la liste Playbooks. Affichage clair sur les cards.
- **🤔 Pourquoi** : sans tagging, une équipe avec 10+ Playbooks ne sait plus distinguer ceux d'un client donné, d'un side-project, d'une campagne ponctuelle. Le proto a un système de workspace clair sur chaque card. Voir [§5.1](./PROD-VS-PROTOTYPE.md#5-playbooks).
- **⚙️ Effort** : S (schema + filtre UI)
- **📈 Impact** : 🟠 moyen-fort à mesure que la base de Playbooks grandit
- **🔗 Lié** : P0-3

### P1-5 · État processing live des sources (chip animé)

- **🎯 Quoi** : afficher l'état de chaque source dans le Sources panel avec un chip dynamique :
  - `⏳ Processing…` (animation)
  - `✓ Ready · 5 ideas`
  - `⚠ Failed · Retry`
  
  État dérivé du backend (websocket / SSE / polling). Le proto a une state machine claire : `uploading → processing → done` (`sources-stream.js`).
- **🤔 Pourquoi** : actuellement la prod montre la source dès qu'elle est uploadée mais sans signal sur si l'extraction d'ideas est en cours, ratée ou terminée. L'utilisateur ne sait pas quand chercher dans Ideas. Voir [§4.6](./PROD-VS-PROTOTYPE.md#4-session-de-chat).
- **⚙️ Effort** : M (state machine + UI chip + event stream backend)
- **📈 Impact** : 🟠 fort — clarté sur ce que fait Archie en background
- **🔗 Lié** : P1-2 (status card)

### P1-6 · Mentions @ dans le composer (sources / ideas / Playbooks)

- **🎯 Quoi** : autocomplete `@` dans le composer pour mentionner :
  - une source (@source-name) → Archie focusera sur ce doc
  - une idea (@idea-title) → Archie partira de cette idée
  - un Playbook (@playbook) → switch ponctuel pour cette saisie
  
  Le proto a `composer-mentions.js` avec un picker keyboard-driven.
- **🤔 Pourquoi** : donne à l'utilisateur un control fin sans avoir à passer par des menus. Très puissant pour les power users qui veulent diriger Archie. Voir [§2.3](./PROD-VS-PROTOTYPE.md#2-app-shell).
- **⚙️ Effort** : M (autocomplete + résolution backend + chips visuels)
- **📈 Impact** : 🟠 fort pour les utilisateurs avancés
- **🔗 Lié** : aucun

### P1-7 · Ideas library cross-session standalone

- **🎯 Quoi** :
  - Créer une route `/studio/ideas` (ou équivalent) avec une page pleine d'Ideas, cross-session
  - Filtres : All / Hooks / Stats / Quotes / Stories / Insights + search + sort (Most recent / Most used)
  - CTA "+ New idea" (manual create) + "Re-mine sources"
  - Cards : kind chip + **potential badge** (High/Medium/Low — voir P2-2) + title + desc + hashtags + Source expandable + CTA "Draft Post"
  - Ajouter "Ideas" en first-class nav item dans la sub-sidebar Studio (à côté de Playbooks)
- **🤔 Pourquoi** : aujourd'hui les ideas sont enfermées par session → on ne peut pas réutiliser une bonne idée d'il y a 2 mois sans rouvrir la session. Le proto traite Ideas comme une library globale. Voir [§6](./PROD-VS-PROTOTYPE.md#6-ideas-library).
- **⚙️ Effort** : M (page + filtres + cross-session query backend)
- **📈 Impact** : 🟠 fort — réutilisation du contenu produit, mémoire à long terme
- **🔗 Lié** : P1-8 (Sources sidebar globale)

### P1-8 · Sources sidebar globale (entrée nav first-class)

- **🎯 Quoi** : ajouter "Sources (N)" comme entrée nav dans la sub-sidebar Studio, qui ouvre une liste cross-session des sources. Mêmes actions que le right-panel (Ask, Extract more, Remove, Rename) mais avec une vue gérable de toutes les sources accumulées.
- **🤔 Pourquoi** : pendant un trimestre d'usage, on accumule 50+ sources. Aujourd'hui pas de vue d'ensemble. Voir [§2.1](./PROD-VS-PROTOTYPE.md#2-app-shell).
- **⚙️ Effort** : S (nav item + page liste)
- **📈 Impact** : 🟠 moyen — utile pour les power users
- **🔗 Lié** : P1-7

### P1-9 · Inconsistance "context" ↔ "Playbook" sur l'écran "Pick a context"

- **🎯 Quoi** : voir P0-1, c'est l'écran prioritaire. Mais aussi auditer l'ensemble du copy Studio pour les autres traces.
- **🔗 Lié** : P0-1

### P1-10 · Décider si le Playbook reste obligatoire pour démarrer une session

- **🎯 Quoi** : décision produit à arbitrer.
  - **Option A** (actuel prod) : Playbook obligatoire → assure que tous les drafts sont on-brand mais friction high pour nouveaux users
  - **Option B** (proto) : Playbook optionnel → flexibilité mais risque de drafts génériques
  - **Option C (recommandée)** : Playbook obligatoire **avec auto-create d'un Playbook par défaut** vide pour les nouveaux users (preset "Professional · Friendly · ----- (brief)"). Onboarding au premier draft pour remplir.
- **🤔 Pourquoi** : aujourd'hui un nouveau user qui crée une session voit "Pick a context to start chatting" sans Playbook disponible → bloqué. Voir [§4.2](./PROD-VS-PROTOTYPE.md#4-session-de-chat).
- **⚙️ Effort** : S (option C, juste le seed + onboarding inline)
- **📈 Impact** : 🟠 fort sur l'activation des nouveaux users
- **🔗 Lié** : P2-7 (onboarding welcome-alt)

---

## P2 — Mineurs (alignements ciblés)

### P2-1 · Char counter par network dans les drafts

- **🎯 Quoi** : afficher `50/3000` pour LinkedIn, `50/280` pour X, etc. en haut-à-droite de chaque draft. Le proto a déjà ce pattern.
- **⚙️ Effort** : XS
- **📈 Impact** : 🟡 quality-of-life — évite les drafts qui dépassent les limites

### P2-2 · Potential badge sur les Ideas (High / Medium / Low)

- **🎯 Quoi** : ajouter un champ "potential" calculé sur chaque idea (heuristique LLM ou règles : longueur, nouveauté, fit avec le Playbook). Afficher badge coloré (vert/orange/rouge).
- **⚙️ Effort** : S
- **📈 Impact** : 🟡 aide à prioriser quelle idea drafter en premier
- **🔗 Lié** : P1-7

### P2-3 · CTA "Draft Post" (vs "Use") sur les idea cards

- **🎯 Quoi** : remplacer le bouton "↑ Use" par "✦ Draft Post" qui est explicite sur l'action.
- **⚙️ Effort** : XS (label)
- **📈 Impact** : 🟡 clarté du verbe d'action

### P2-4 · Menu "more" (…) sur les idea cards

- **🎯 Quoi** : ajouter un menu kebab par idea : Edit · Duplicate · Move to Playbook · Mark as used · Delete
- **⚙️ Effort** : S
- **📈 Impact** : 🟡 actions secondaires accessibles

### P2-5 · "Re-mine sources" CTA + Sort dropdown sur Ideas

- **🎯 Quoi** : sur la page/panel Ideas, ajouter :
  - `[↻ Re-mine sources]` — déclenche une nouvelle extraction LLM sur les sources existantes avec un prompt à jour
  - Sort dropdown : Most recent · Most used · Highest potential · Alphabetical
- **⚙️ Effort** : S (re-mine = endpoint à wire, sort = client-side)
- **📈 Impact** : 🟡 maintenance de la library
- **🔗 Lié** : P1-7

### P2-6 · Drag-and-drop file anywhere

- **🎯 Quoi** : permettre de drop un PDF / image / vidéo n'importe où dans le composer ou le thread. Ajouter le hint "drag a file anywhere to add it as a source" dans le composer shortcuts. Le proto le fait déjà.
- **⚙️ Effort** : XS-S (drop handler global)
- **📈 Impact** : 🟡 friction réduite pour ajouter une source

### P2-7 · Onboarding welcome-flow (capture de brand au lancement)

- **🎯 Quoi** : pour un nouvel user (premier Playbook du workspace), lancer un onboarding 3-step :
  1. URL du site → analyse automatique (formatting style, visual style, brand colors, typography)
  2. Profil / audience → "Who do you write for?"
  3. Documents optionnels (brand guidelines PDF, charte éditoriale)
  → Recap du Playbook construit + premier prompt "Want to draft a launch post?"
  
  Le proto fait cela en plein écran (`/welcome-alt`). En prod, peut être un modal ou un flow inline.
- **🤔 Pourquoi** : aujourd'hui un nouveau user arrive sur un Playbook vide à remplir manuellement — friction énorme. L'onboarding du proto livre un Playbook utilisable en 90 secondes. Voir [§9](./PROD-VS-PROTOTYPE.md#9-onboarding).
- **⚙️ Effort** : M-L (UI multi-step + analyse backend + integration avec le LLM extraction)
- **📈 Impact** : 🟠-🟡 fort sur l'activation
- **🔗 Lié** : P0-3 (modèle Playbook unifié), P1-10 (décision Playbook obligatoire)

### P2-8 · Toggle sidebar (icône burger en topbar)

- **🎯 Quoi** : icône ☰ en topbar pour collapse/expand la sub-sidebar Studio. Persister l'état (localStorage).
- **⚙️ Effort** : XS
- **📈 Impact** : 🟡 plus d'espace écran sur grands threads

### P2-9 · Settings cog plus découvrable

- **🎯 Quoi** : le bouton settings en prod est un cog minuscule au bottom-right de la sub-sidebar. À remonter dans un popmenu accessible (avatar / user chip) ou en first-class nav item. Le proto a un popmenu structuré (Feedback / Bug / Shortcuts / Settings) au-dessus du user chip.
- **⚙️ Effort** : XS
- **📈 Impact** : 🟡 découvrabilité

### P2-10 · Search modal global (⌘K)

- **🎯 Quoi** : raccourci clavier ⌘K (Mac) / Ctrl+K (Win) qui ouvre un modal de recherche full-text sur : Chats · Sources · Ideas · Drafts · Playbooks. Cibles cliquables.
- **🤔 Pourquoi** : le proto a `search-modal.js` qui sert de centre de gravité de navigation. Devient essentiel à mesure que la base grandit.
- **⚙️ Effort** : M
- **📈 Impact** : 🟡 navigation power-user

### P2-11 · Sub-tabs "All posts" / "Needs fixes" → ajouter aussi côté proto

> ⚠️ Inverse — la prod l'a déjà, c'est le proto qui doit rattraper. Pas listé ici.

### P2-12 · Reasoning chip "Querying X via MCP" pour les connectors (cf. P3 connectors)

- **🔗 Lié** : P3-1

### P2-13 · Bouton "Re-generate all" sur le Drafts panel

- **🎯 Quoi** : ajouter un CTA `[↻ Regenerate]` qui relance la génération de tous les drafts sélectionnés (avec un prompt à jour si le Playbook a été modifié entre-temps).
- **⚙️ Effort** : XS-S
- **📈 Impact** : 🟡 itération rapide quand l'utilisateur ajuste le Playbook

---

## P3 — Nice-to-have (polish / features new)

### P3-1 · Connectors comme sources de knowledge MCP-queryable

- **🎯 Quoi** : intégrer Notion, Slite, Google Drive, Slack (et autres) comme **sources live** qu'Archie peut interroger via MCP. Modal de connexion (gallery + capabilities + connect flow). État `connected/syncing/disconnected/error`. Quand l'utilisateur "ask" un connector dans le chat, reasoning chip "Querying Notion via MCP" + answer cité.
- **🤔 Pourquoi** : feature signature du proto qui positionne Archie comme un "AI knowledge agent" branché sur la stack interne. Diffère des intégrations sociales (LinkedIn/X publishing) en cela qu'on parle de **knowledge sources**, pas de canaux de publication. Voir [§7](./PROD-VS-PROTOTYPE.md#7-connectors).
- **⚙️ Effort** : XL (1+ mois — gallery + state machine + auth flows + MCP integration + UI right-panel + intégration thread)
- **📈 Impact** : 🟠 fort — c'est un différenciateur produit majeur si exécuté
- **🔗 Lié** : ensemble du composant Sources

### P3-2 · Source picker tabbé en empty state du chat

- **🎯 Quoi** : sur la session vide, ajouter le tabbed picker (PDF / URL / Video / Audio / Video Clip) → décision déjà côté prod, donc en fait c'est l'inverse (proto doit rattraper). À garder dans le rapport pour rappel.
- **(N/A — la prod a déjà cette feature)**

### P3-3 · Drapeau langue sur les Playbook cards

- **🎯 Quoi** : afficher la langue détectée (🇬🇧 / 🇫🇷 / 🇪🇸 …) sur chaque Playbook card. Permet aussi de filtrer.
- **⚙️ Effort** : XS-S
- **📈 Impact** : 🟡 utile en multi-langue
- **(prod le fait déjà — proto doit rattraper)**

### P3-4 · Pin / hover icons sur les conversations recent

- **🎯 Quoi** : le proto révèle des icons "pin / rename / delete" au survol d'une conversation dans la sidebar. La prod a déjà rename + delete mais ne propose pas "pin". Ajouter pin.
- **⚙️ Effort** : XS
- **📈 Impact** : 🟡 organisation

### P3-5 · Keyboard shortcuts legend (?)

- **🎯 Quoi** : modal avec la liste des raccourcis (proto a `shortcut-legend.js` accessible via `?`). Cmd+K = search, Cmd+N = new chat, Cmd+/ = focus composer, etc.
- **⚙️ Effort** : XS
- **📈 Impact** : 🟡 power-user

### P3-6 · Generation preferences (paramètres globaux d'Archie)

- **🎯 Quoi** : section settings pour les paramètres de génération transversaux : longueur de post par défaut, density d'hashtags, langage, modèle LLM préféré, etc. Le proto a une section "Generation preferences" dans Settings.
- **⚙️ Effort** : S
- **📈 Impact** : 🟡 power-user / agencies

### P3-7 · Notifications de fin de génération

- **🎯 Quoi** : quand l'utilisateur navigue ailleurs pendant qu'Archie génère, push notif desktop ou toast à son retour : "5 drafts ready in Q2 launch announcement"
- **⚙️ Effort** : S
- **📈 Impact** : 🟡 multitâche

---

## Tableau récap (vue dense)

| Prio | # | Changement | Effort | Impact | Section ref |
|---|---|---|---|---|---|
| P0 | 1 | Renommer "context" → "Playbook" partout | XS | 🔴 | §10.3 |
| P0 | 2 | Auto-naming des sessions | S | 🔴 | §2.1 |
| P0 | 3 | Modèle Playbook unifié (éditorial + visuel) | L | 🔴 | §5.2 |
| P1 | 1 | Handoff card "N drafts ready" | XS | 🟠 | §4.3 |
| P1 | 2 | Status card flottante (progression live) | M | 🟠 | §2.2 |
| P1 | 3 | Édition conversationnelle des Playbooks | L | 🟠 | §5.3 |
| P1 | 4 | Workspace tagging des Playbooks | S | 🟠 | §5.1 |
| P1 | 5 | État processing live des sources | M | 🟠 | §4.6 |
| P1 | 6 | Mentions @ dans le composer | M | 🟠 | §2.3 |
| P1 | 7 | Ideas library cross-session standalone | M | 🟠 | §6 |
| P1 | 8 | Sources sidebar globale (nav item) | S | 🟠 | §2.1 |
| P1 | 9 | Audit copy "context" sur tous les écrans | XS | 🟠 | §10.3 |
| P1 | 10 | Décider Playbook obligatoire (option C: auto-default) | S | 🟠 | §4.2 |
| P2 | 1 | Char counter par network sur drafts | XS | 🟡 | §4.4 |
| P2 | 2 | Potential badge sur Ideas | S | 🟡 | §4.5 |
| P2 | 3 | CTA "Draft Post" (vs "Use") sur idea card | XS | 🟡 | §4.5 |
| P2 | 4 | Menu "…" sur idea cards | S | 🟡 | §4.5 |
| P2 | 5 | Re-mine + Sort sur Ideas | S | 🟡 | §6 |
| P2 | 6 | Drag-and-drop file anywhere | XS-S | 🟡 | §2.3 |
| P2 | 7 | Onboarding welcome-flow (capture brand) | M-L | 🟠-🟡 | §9 |
| P2 | 8 | Toggle sidebar (burger en topbar) | XS | 🟡 | §2.2 |
| P2 | 9 | Settings cog découvrable + popmenu | XS | 🟡 | §2.1 |
| P2 | 10 | Search modal global (⌘K) | M | 🟡 | §2.1 |
| P2 | 13 | "Re-generate" CTA sur Drafts panel | XS-S | 🟡 | §4.4 |
| P3 | 1 | Connectors comme sources MCP-queryable | XL | 🟠 | §7 |
| P3 | 4 | Pin sur conversations recent | XS | 🟡 | §2.1 |
| P3 | 5 | Keyboard shortcuts legend (?) | XS | 🟡 | §2.3 |
| P3 | 6 | Generation preferences globales | S | 🟡 | §8 |
| P3 | 7 | Notifications de fin de génération | S | 🟡 | — |

---

## Roadmap suggérée

### Sprint 1-2 (Fix & quick wins) — ~2 semaines
- **P0-1** (rename context → Playbook) — XS
- **P1-9** (audit copy) — XS
- **P0-2** (auto-naming sessions) — S
- **P1-1** (handoff card) — XS
- **P2-1** (char counter) — XS
- **P2-3** (CTA "Draft Post") — XS
- **P2-8** (toggle sidebar) — XS
- **P2-9** (settings popmenu) — XS
- **P2-13** (re-generate CTA) — XS-S

> Cible : sortir P0-1, P0-2, P1-1, P1-9 + 4-5 quick wins P2 en 2 semaines.

### Sprint 3-4 (Differentiators UX) — ~3 semaines
- **P1-2** (status card) — M
- **P1-5** (état processing sources) — M
- **P1-4** (workspace tagging) — S
- **P1-7** (Ideas library standalone) — M
- **P1-8** (Sources sidebar nav) — S

### Sprint 5-6 (Refonte Playbook) — ~3 semaines
- **P0-3** (modèle Playbook unifié) — L
- **P1-3** (édition conversationnelle Playbook) — L (peut chevaucher avec P0-3)
- **P1-10** (décision Playbook obligatoire + auto-default) — S
- **P2-7** (onboarding welcome-flow) — M-L

### Sprint 7+ (Features ambitieuses) — variable
- **P3-1** (Connectors MCP) — XL — projet en soi
- **P1-6** (Mentions @) — M
- **P2-2** (Potential badge Ideas) — S
- **P2-5** (Re-mine + Sort) — S
- **P2-10** (Search modal ⌘K) — M
- **P3-*** divers

---

## Annexe — Ce qui n'est PAS dans ce doc

Les écarts où **la prod a raison sur le proto** ne figurent pas ici :

| Item | Pourquoi pas | Où en parler |
|---|---|---|
| Preview LinkedIn-style des drafts | proto doit rattraper | [PROD-VS-PROTOTYPE.md §4.4](./PROD-VS-PROTOTYPE.md#4-session-de-chat) |
| Generation context (Voice/Practices ratings) | idem | §4.4 |
| Generate image inline par draft | idem | §4.4 |
| "Needs fixes" tab sur drafts | idem | §4.4 |
| Comment composer dans drafts preview | idem (mock prod) | §4.4 |
| Drapeau langue sur Playbook card | idem | §5.1 |
| Source picker tabbé empty state | idem (ou décision produit) | §4.1 |

Ces items sont à intégrer dans un doc miroir "PROTO-CHANGES.md" si besoin.
