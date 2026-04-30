# Audit Archie — Empty / Onboarding / Loading / Error

> Audit produit le 2026-04-29. Périmètre : 5 routes + 7 modales/drawers + 4 surfaces inline = ~20 surfaces. Modales utilitaires (bug-report, feedback, confirm, shortcut-legend) hors périmètre. Routes `/analyse/*` dépréciées (remplacées par sidebar-wizard) hors périmètre.

---

## 1. Synthèse exécutive

### Score global par famille

| Famille        | Score | Lecture                                                                                                                                                                                                                                                                 |
| -------------- | :---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty**      |  ⚠️   | États présents pour ~70% des surfaces, mais incohérents : 3 patterns différents (`session__empty` riche / `<view>__empty` minimal texte / `app-right-panel__empty` riche) ; pas de distinction claire "aucune donnée" vs "aucun match filtre" sur les pages standalone. |
| **Onboarding** |  ⚠️   | Couvre l'arrivée minimale (empty hero `session.js` + welcome card dashboard + sidebar wizard). **Welcome card du dashboard non atteignable** (le dashboard redirige avant render). Aucun tooltip, coach mark, checklist, ni progression visible.                        |
| **Loading**    |  ✅   | Couvert sur les surfaces critiques avec qualité (sources stream à 5 stages + ETA, thinking chip avec compteur secondes/credits, generate-image avec skeleton). Manque : skeletons sur listes au mount, indicateur réseau global, états de save explicites.              |
| **Error**      |  ❌   | Très peu d'états d'erreur user-facing. URL invalide silencieuse, generate-image échoue sans message, draft-flow et schedule sans branche d'erreur, save settings/contexts sans feedback d'échec. **Aucun retry**, aucun timeout, aucun indicateur réseau.               |

### Top 5 problèmes critiques

| #   | Problème                                                                                                                                                                                                                                                                                                                                                                                                        | Surface(s)                    | Sévérité |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------- |
| C1  | **Welcome card dashboard inatteignable** — `dashboard.js:87-90` redirige systématiquement vers `/session/{recent.id}` ou `/session/new` avant de rendre. Le bloc `renderProjectsPanel` (`dashboard.js:132-152`) qui contient la welcome card est code mort.                                                                                                                                                     | Dashboard                     | P0       |
| C2  | **Validation URL silencieuse** — `add-source-modal.js:553-559` désactive juste le bouton "Add URL" quand l'URL est invalide. Pas de message d'erreur, pas d'aria-feedback. L'utilisateur ne sait pas pourquoi le bouton ne réagit pas.                                                                                                                                                                          | Add-source modal · onglet URL | P0       |
| C3  | **Échec de génération d'image silencieux** — `generate-image-modal.js:266-272` attrape `try/catch`, retombe en `idle`, mais l'utilisateur n'a aucun indice qu'une erreur est survenue. La modale "ré-affiche le formulaire" sans explication.                                                                                                                                                                   | Generate-image modal          | P0       |
| C4  | **Pages standalone : empty state minimaliste sans contexte ni CTA** — `sources.js:120` "No sources match." / `ideas.js:110` "No ideas match." / `contexts.js:68` "No contexts match." rendent un simple `<div>` texte, sans icône, sans CTA, sans distinguer "aucune donnée" vs "filtre vide". Le contraste avec le pattern riche de `content-workspace.js:70-81` (icône + titre + body + action) est frappant. | /sources, /ideas, /contexts   | P1       |
| C5  | **Modale schedule : pas de feedback de succès / d'erreur** — `schedule-modal.js:133-138` confirme et ferme immédiatement avec un toast succès, sans vérifier la disponibilité réelle des comptes connectés ni gérer un échec de scheduling (réseau, conflit). En production réelle, c'est un point d'échec utilisateur certain.                                                                                 | Schedule modal                | P1       |

### Top 5 quick wins

| #   | Quick win                                                                                                                                                                                                               | Effort | Impact |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| Q1  | Ajouter une icône + body court aux empty states de `/sources`, `/ideas`, `/contexts` (alignement sur `renderEmptyState` de `content-workspace.js:70-81`). Distinguer "aucune donnée" vs "no match filtre/recherche".    | S      | Fort   |
| Q2  | Surfacer un message d'erreur sous le champ URL d'`add-source-modal` quand le pattern ne valide pas (`isValidUrl` false), au lieu de juste désactiver le bouton.                                                         | S      | Fort   |
| Q3  | Afficher une infobox d'erreur dans `generate-image-modal` quand `runGeneration()` catch (`:266-272`) au lieu de retomber silencieusement en idle.                                                                       | S      | Moyen  |
| Q4  | Décider du sort de la welcome card du dashboard : soit la rendre atteignable (un `/dashboard` qui ne redirige pas), soit supprimer le code mort de `renderProjectsPanel`/`renderContentSection`/`renderNewProjectCard`. | S      | Moyen  |
| Q5  | Toast d'erreur (variant déjà supporté par `toast.js:36`) pour les échecs silencieux : `cancelUpload` réussi mais réseau coupé, save settings, save context. Une seule ligne d'API à câbler.                             | M      | Moyen  |

---

## 2. Cartographie

Légende : ✅ présent et cohérent · ⚠️ partiel ou divergent · ❌ absent · — non applicable

### Routes / écrans

| Surface                      |            Empty            |         Onboarding          |             Loading             |           Error           |
| ---------------------------- | :-------------------------: | :-------------------------: | :-----------------------------: | :-----------------------: |
| Dashboard `/`                | ⚠️ (welcome card mort code) | ⚠️ (welcome card mort code) |       — (route redirige)        |             —             |
| Session `/session/:id`       |       ✅ (empty hero)       |   ⚠️ (empty hero + flows)   | ✅ (thinking chip + extraction) |  ⚠️ (no source material)  |
| Sources library `/sources`   |       ⚠️ (texte seul)       |             ❌              | ⚠️ (cards processing seulement) |            ❌             |
| Ideas library `/ideas`       |       ⚠️ (texte seul)       |             ❌              |               ❌                |            ❌             |
| Contexts library `/contexts` |       ⚠️ (texte seul)       |             ❌              |               ❌                | ⚠️ (window.confirm natif) |

### Modales & overlays

| Surface                         |           Empty           |        Onboarding         |          Loading           |            Error            |
| ------------------------------- | :-----------------------: | :-----------------------: | :------------------------: | :-------------------------: |
| Add-source modal — Upload       |       ✅ (dropzone)       |             —             |   ✅ (progress + stages)   | ✅ (inline 4s auto-dismiss) |
| Add-source modal — URL          |      ⚠️ (input vide)      |             —             |    ⚠️ (pas de spinner)     | ❌ (validation silencieuse) |
| Add-source modal — Connectors   |   ✅ (liste connectors)   |             —             | ⚠️ (pas de spinner browse) |             ❌              |
| Generate-image modal            |             —             |             —             |  ✅ (skeleton + summary)   |    ❌ (catch silencieux)    |
| Chat-picker modal               |             —             |             —             |             —              |              —              |
| Schedule modal                  |             —             |             —             |             ❌             |             ❌              |
| Settings drawer — Connectors    |             —             |             —             |             ❌             |             ❌              |
| Settings drawer — Contexts      | ✅ (icône + titre + body) | ⚠️ (renvoie au flow chat) |             —              |              —              |
| Settings drawer — Préférences   |             —             |             —             |    ❌ (save instantané)    |             ❌              |
| Settings drawer — Social        |             —             |             —             |             ❌             |             ❌              |
| Settings drawer — Notifications |             —             |             —             |             ❌             |             ❌              |
| Context drawer                  |   ✅ (no contexts CTA)    |      ⚠️ (form vide)       |             ❌             |  ⚠️ (window.confirm natif)  |
| Right panel — Drafts            | ✅ (icône + texte + sub)  |             —             |   ✅ (panel suit thread)   |   ⚠️ (rewrite mock toast)   |
| Right panel — Ideas             |      ⚠️ (texte seul)      |             —             |             —              |              —              |

### Surfaces inline

| Surface                  |                   Empty                   |           Onboarding           |                Loading                |          Error          |
| ------------------------ | :---------------------------------------: | :----------------------------: | :-----------------------------------: | :---------------------: |
| Thread (chat bubbles)    | ✅ (empty hero quand pas de user message) | ✅ (greeting selon hasContext) | ✅ (`status: loading` + `is-loading`) | ⚠️ (no source material) |
| Inline question          |                     —                     |               —                |       ⚠️ (pas de pending state)       |           ❌            |
| Sidebar wizard           |                     —                     |       ✅ (chrome dédié)        |         ✅ (analyzing notice)         |           ❌            |
| Composer + thinking chip |             ✅ (placeholder)              |               —                |   ✅ (chip avec compteur + credits)   |           ❌            |
| Sidebar (recent chats)   |        ✅ ("No conversations yet")        |   ⚠️ (search masqué si vide)   |                   —                   |            —            |

---

## 3. Détail par écran

> Chaque bloc cite le code (fichier:ligne) et propose une recommandation factuelle. Aucune maquette n'est proposée pour les états absents.

### 3.1 Dashboard `/`

**Fichiers** : [src/screens/dashboard.js](src/screens/dashboard.js)

#### Empty state · Onboarding

- **Statut** : ⚠️ Partiel — la welcome card existe mais est **inatteignable**.
- **Constat** : `dashboard.js:87` calcule `targetPath = isNewUser() || !recent ? "/session/new" : ...`, puis `dashboard.js:90` redirige systématiquement avec `window.location.replace`. La fonction `renderProjectsPanel` (`dashboard.js:132-152`) qui contient la welcome card "Welcome to Archie" + body "You don't have any projects yet…" n'est jamais appelée.
- **Composants DS** : `<i class="ap-icon-sparkles-mermaid md">`, classes `text-subtitle` / `muted` — usage propre.
- **Problèmes** :
  1. Code mort potentiel (welcome card + renderNewProjectCard + renderContentSection + binding) qui ne peut pas être atteint par l'utilisateur
  2. L'utilisateur "first-run" est jeté directement dans une session vide, sans introduction au produit
  3. Le commentaire `dashboard.js:66-72` reconnaît la redirection comme intentionnelle (alignement handoff), mais le code de rendu est resté.
- **Recommandation** :
  - Soit conserver la redirection et **supprimer** `renderProjectsPanel`, `renderNewProjectCard`, `renderContentSection`, `bindDashboard`, `rerenderContentBody`, `defaultChatName` (~280 lignes mortes)
  - Soit **réactiver** la welcome card en supprimant la redirection pour `isNewUser()` et l'utiliser comme première impression du produit (avec template starters / sample data)
- **Priorité** : P0 (code base) / P1 (UX onboarding)

#### Loading / Error

- Non applicable — la route ne fait que rediriger.

---

### 3.2 Session `/session/:id`

**Fichiers** : [src/screens/session.js](src/screens/session.js), [src/assistant.js](src/assistant.js), [src/start-flow.js](src/start-flow.js), [src/draft-flow.js](src/draft-flow.js), [src/sidebar-wizard.js](src/sidebar-wizard.js), [src/inline-question.js](src/inline-question.js)

#### Empty state — thread sans message utilisateur

- **Statut** : ✅ Présent.
- **Constat** : `session.js:209` détecte `isEmptyConversation = thread.every((m) => m.role !== "user")`. `session.js:355-376` rend `renderEmptyHero()` avec :
  - Titre : "What are we creating today?"
  - Sub : "Drop in a source and Archie will turn it into a batch of posts you can review, edit, and schedule."
  - 4 starter cards depuis `mocks.chatStarters`
- **Composants DS** : classes `empty-chat__hello`, `empty-chat__sub`, `starter-grid`, `starter-card` — patterns custom (pas de DS direct, mais cohérents avec la page).
- **Problèmes** :
  1. Les starters dans `mocks.js:53-79` contiennent des placeholders `{{source}}` qui ne sont **pas substitués** au runtime (ils sont injectés tels quels dans le composer via `data-starter-prompt`). Pour un nouvel utilisateur sans source, le prompt "Pull the strongest moments from {{source}}…" arrivera littéralement avec `{{source}}` dans la composition.
  2. Le composer affiche un dropdown de contexte hardcodé (`session.js:255-279`) avec "Agorapulse · Studio launch" / "Agorapulse · Brand awareness" / "Personal · Side project" — **incohérent avec `isNewUser()` mode** qui vide la liste des contextes en store. Pour un nouvel utilisateur, ces contextes apparaissent malgré tout.
- **Recommandation** :
  - Substituer `{{source}}` par "this source" / "your source" au render du starter, ou désactiver les 3 starters dépendants quand `getSources().length === 0`
  - Synchroniser le dropdown contexte avec le store réel `getContexts()` au lieu du markup hardcodé (priorité haute pour cohérence first-run)
- **Priorité** : P1

#### Onboarding

- **Statut** : ⚠️ Partiel.
- **Constat** : Trois flows déclenchés au mount selon les handoff (`session.js:885-930`) :
  - `pendingDraftIdeaId` → `askProfileQuestion` (inline question)
  - `pendingAskSource` → `askWhatToKnow` (inline question)
  - `pendingStartFlow` → `startContextBuildFlow` (sidebar wizard) ou `startActionPickerFlow` (chat picker)
- Greeting initial dans `assistant.js:321-323` : "Hi — I'll help you pick sources, sharpen angles, and draft posts. Attach a context (Voice, Brief, Brand) any time to make my suggestions sharper."
- **Problèmes** :
  1. Pas de tooltips ni coach marks sur les contrôles du composer (📎 attach, + add source, dropdown contexte) — un nouvel utilisateur doit deviner.
  2. Pas de progression visible (étape 1/N), pas de checklist "Add source ☐ → Pick angle ☐ → Draft ☐".
  3. Le wizard `sidebarWizard` ne peut être atteint que via le handoff dashboard `pendingStartFlow` — un utilisateur qui revient sur une session existante sans contexte n'aura jamais le wizard automatiquement.
- **Recommandation** :
  - Ajouter un onboarding tip discret (auto-dismiss, dismissable) ciblant les 2-3 contrôles clés au premier lancement
  - Ne pas réintroduire de tooltips agressifs ; un seul nudge "1 sur 3" en haut de session suffit
- **Priorité** : P2

#### Loading

- **Statut** : ✅ Excellent.
- **Constat** : Trois mécanismes complémentaires :
  1. **Thinking chip** (`session.js:236-239` + `:998-1059`) : texte dynamique `"{Xs} · {N} credit(s)"`, mis à jour chaque seconde via `setInterval`. Affiché tant qu'au moins un message a `status === "loading"`.
  2. **Extracting notice inline** (`session.js:646-655`) : status pill mermaid + spinner, pour les `role: "pending"` (extractions de sources).
  3. **Drafting collapsible** (`session.js:627-642`) : `<details>` avec `<summary>` mermaid pill "Drafting", contenu = chaîne de raisonnement, collapse après réponse (`assistant.js:101-104`).
- **Composants DS** : `ap-status mermaid`, animations CSS dédiées (`is-loading` modifier).
- **Problèmes** :
  1. Le compteur "credits" (`session.js:1020`) est purement décoratif et arbitraire (1 credit / 6 secondes) — pas un signal réel pour l'utilisateur.
  2. Pas de timeout : si la promise mockée bloquait, le chip resterait à l'infini sans retour utilisateur.
- **Recommandation** :
  - Garder le pattern, ajouter un timeout (~30s) qui bascule vers un état d'erreur explicite ("Cette demande prend plus de temps que prévu — réessayer ?")
  - Remplacer "credit" par un libellé plus évocateur ou retirer si le concept produit n'est pas confirmé
- **Priorité** : P2 (élégance) → P1 (timeout)

#### Error

- **Statut** : ⚠️ Partiel.
- **Constat** :
  - Mock "no source material" (`assistant.js:417-419`) : "I don't have enough source material in this session yet. Add a source first…" — message clair, ton conversationnel, mais traité comme une réponse normale (pas comme une erreur).
  - Pas de connected social profiles (`session.js:545-550`) : "You don't have any connected social profiles yet. Open Settings → Social accounts to connect one…" — avec route explicite, bon pattern.
- **Problèmes** :
  1. Le draft-flow (`draft-flow.js`) n'a **aucune branche d'erreur** : si `addPostDraft` échouait, le `setTimeout(2000)` continuerait sans signal.
  2. Si l'utilisateur cancel un draft en cours (par ex. fermeture/refresh), pas de récupération.
  3. Aucun toast d'erreur n'est jamais émis depuis ce screen (variant `error` de `showToast` non utilisé).
- **Recommandation** :
  - Ajouter une branche `catch` dans `executeDraft` (`draft-flow.js:72-101`) avec `showToast("Couldn't draft those posts. Retry?", { variant: "error", action: { label: "Retry", onClick: ... } })`.
  - Ajouter un timeout au thinking chip (cf. supra).
- **Priorité** : P1

---

### 3.3 Sources library `/sources`

**Fichiers** : [src/screens/sources.js](src/screens/sources.js)

#### Empty state

- **Statut** : ⚠️ Partiel.
- **Constat** : Deux variantes :
  1. **Aucune source** : Le drop tile (`sources.js:130-138`) reste affiché ("Drop a file or paste a link · PDFs, video, audio…"). C'est un proto-empty-state acceptable.
  2. **Filtre/recherche sans match** : `sources.js:120` rend juste `<div class="sources-view__empty">No sources match.</div>` — texte brut, sans icône, sans CTA "Clear filter".
- **Composants DS** : header (`screen__placeholder-eyebrow`, `sources-view__title`), filtres (custom `sources-view__filter` réinventé au lieu d'`ap-tabs` / `ap-button`).
- **Problèmes** :
  1. Le pattern empty state diverge de `content-workspace.js:70-81` (icône + titre + body + action) qui est plus riche et identifié comme le standard du projet.
  2. Aucun moyen de distinguer "première visite, aucune source" vs "filtre actif" — le drop tile masque cette différence.
- **Recommandation** :
  - Pour le no-match, adopter le pattern `renderEmptyState` (réutiliser ou copier de `content-workspace.js`) avec icône `ap-icon-feature-library` + titre + sub + bouton "Clear filters" qui réinitialise `pageState`.
  - Pour aucune source du tout (sources.length === 0), garder le drop tile mais ajouter un titre/contexte au-dessus.
- **Priorité** : P1

#### Onboarding

- **Statut** : ❌ Absent. Aucun onboarding spécifique au standalone /sources. Un nouvel utilisateur arrivant ici via la sidebar découvre le drop tile sans plus d'explication.

#### Loading

- **Statut** : ⚠️ Partiel.
- **Constat** : Une fois une source ajoutée, le `SourceCard` rend les phases Processing avec progress bar + stage + ETA (cf. 3.6). Mais à l'**arrivée sur la page**, aucun skeleton (le store est synchrone, donc OK pour le mock — ne le sera plus en prod).
- **Recommandation** : laisser tel quel pour le proto, prévoir un skeleton à la connexion API.

#### Error

- **Statut** : ❌ Absent. Drag & drop sur `[data-sources-drop-target]` (`sources.js:214-233`) appelle `classifyFile` puis ignore silencieusement les fichiers non valides (`if (c.ok)` sans branche `else`). Si tous les fichiers échouent, ça ouvre la modale upload — pas un toast, pas de message contextuel sur la page.

---

### 3.4 Ideas library `/ideas`

**Fichiers** : [src/screens/ideas.js](src/screens/ideas.js)

#### Empty state

- **Statut** : ⚠️ Partiel.
- **Constat** : `ideas.js:110` rend `<div class="ideas-view__empty">No ideas match.</div>`. Aucune distinction "aucune idée" vs "filtre vide".
- **Problèmes** :
  1. Pattern divergent du standard projet (cf. `content-workspace.js`).
  2. Boutons "Re-mine sources" et "New idea" (`ideas.js:60-67`) ne sont **pas câblés** — `ideas.js:149-155` montre un toast "This action lands in a follow-up — pinning the page surface first." Ce comportement, déjà ironique pour une page mockée, est invisible sur l'empty state où ces actions seraient le seul moyen de débloquer.
- **Recommandation** :
  - Copier/aligner sur `renderEmptyState` du content-workspace
  - Pour l'empty "aucune idée du tout", proposer un CTA "Add a source" qui ouvre la modale d'ajout (raccourci utile)
- **Priorité** : P1

#### Onboarding · Loading · Error

- **Statut** : ❌ Tous absents. La page n'a aucune asynchronicité réelle (mock synchrone), donc Loading/Error ne se posent pas dans le proto, mais le câblage est à prévoir.

---

### 3.5 Contexts library `/contexts`

**Fichiers** : [src/screens/contexts.js](src/screens/contexts.js)

#### Empty state

- **Statut** : ⚠️ Partiel.
- **Constat** : `contexts.js:68` rend `<div class="contexts-view__empty">No contexts match.</div>`. Pas d'écart "aucun contexte du tout" — d'autant plus pertinent pour un nouvel utilisateur. Le bouton "+ New context" reste visible dans le header.
- **Recommandation** : empty state riche avec CTA "+ Create your first context" (alignement DS).
- **Priorité** : P1

#### Loading

- **Statut** : ❌ Absent.

#### Error

- **Statut** : ⚠️ Partiel.
- **Constat** : Suppression utilise `window.confirm()` natif (`contexts.js:170` : `if (!window.confirm(\`Delete "${ctx.name}"?\`)) return;`). Cela enfreint la cohérence DS (modale `confirm-modal.js` existe mais n'est pas utilisée ici).
- **Recommandation** : remplacer `window.confirm` par la `confirm-modal.js` (style DS, danger button rouge déjà supporté). Cf. aussi `context-drawer.js:95, 105, 154, 233`.
- **Priorité** : P1

---

### 3.6 Add-source modal

**Fichier** : [src/components/add-source-modal.js](src/components/add-source-modal.js), [src/sources-stream.js](src/sources-stream.js)

#### Onglet Upload

**Empty** : ✅ Le dropzone (`:116-120`) est l'état vide par défaut : "Drop files here or click to browse" + sub "PDF, Word, text, video, audio, images · Up to 100MB per file". Bon pattern.

**Loading** : ✅ Excellent. Trois sous-états dans `renderUploadRow` (`:130-174`) :

- `uploading` : barre de progression `transform: scaleX()` + texte "Uploading {progress}%"
- `processing` : pill bleue `ap-status blue` + spinner CSS + label "Processing"
- `done` : pill verte `ap-status green` + icône check + label "Ready"

L'état `processing` côté source-stream (`sources-stream.js:158-232`) ajoute en plus 5 stages crossfade ("Extracting content" → "Reading content" → "Identifying ideas" → "Mining hooks & quotes" → "Finalizing", avec variante "Transcribing audio" pour audio/vidéo) + ETA mis à jour toutes les 200ms via `startProcessingTicker`. C'est du soin produit.

**Error** : ✅ Pattern `inline error 4s auto-dismiss` (`add-source-modal.js:122-125, 420-427`). `classifyFile` (`sources-stream.js:80-86`) renvoie des messages explicites :

- "Unsupported file type: {filename}"
- "File too large: {filename} (max 100MB)"

Affichage via `ap-infobox error`. Cohérent DS.

**Problèmes** :

1. Quand l'utilisateur sélectionne plusieurs fichiers et que certains échouent, seul le **premier** message d'erreur est conservé (`ingestFiles:406-417`, `firstError = res.reason`). Les rejets suivants sont silencieux — l'utilisateur ne sait pas que d'autres fichiers ont aussi été refusés.
2. L'auto-dismiss à 4s (`:423`) peut faire perdre le message si l'utilisateur regardait ailleurs.

**Recommandation** :

- Concaténer les erreurs ou afficher "{N} files were rejected: {first reason}, …"
- Allonger ou laisser jusqu'à fermeture / nouvelle action ; le DS infobox a un bouton de fermeture natif

**Priorité** : P2

#### Onglet URL

**Empty** : ⚠️ L'input vide est le seul "empty state". Acceptable mais pourrait suggérer un exemple récent ou un format attendu.

**Loading** : ⚠️ Au submit, l'URL démarre directement en `processing` côté store (`sources-stream.js:263-294`). Aucune indication immédiate dans la modale (pas de spinner sur le bouton "Add URL"). L'élément n'apparaît dans la "url-history" qu'une fois le push effectué — l'utilisateur peut cliquer 2 fois.

**Error** : ❌ **Validation silencieuse**. `:553-561` : à chaque keystroke, `isValidUrl` re-évalue et toggle `disabled` sur le bouton. Aucun message si l'URL est mal formée. L'utilisateur tape, le bouton reste gris, il ne sait pas pourquoi.

**Recommandation** :

- Ajouter un message inline sous l'input quand `urlValue` est non-vide ET non-valide : "URL must start with http:// or https://"
- Ajouter un état "loading" (~500ms feedback visuel) au clic Add URL

**Priorité** : P0 (validation muette = bug UX critique)

#### Onglet Connectors

**Empty** : ✅ Le store seed `mocks.connectors` n'est jamais vide (4 connectors fixes). N/A si le mock est conforme au produit final.

**Loading** : ⚠️ Aucun spinner pendant le clic "Connect" — `setConnectorStatus` est synchrone donc en mock c'est instantané, mais en prod ce serait OAuth = au minimum 2-3 secondes.

**Error** : ❌ Pas de branche d'échec OAuth.

**Recommandation** : prévoir le câblage en parallèle de la branche réseau réelle.

---

### 3.7 Generate-image modal

**Fichier** : [src/components/generate-image-modal.js](src/components/generate-image-modal.js)

#### États

- **idle** (`:151-200`) : textarea + chips style/mood + Cancel/Generate
- **loading** (`:202-218`) : skeleton tile pulsant + summary tags + spinner + label "Generating image…"
- **result** (`:220-241`) : preview image + Regenerate / Edit options / Use this image

#### Loading

- **Statut** : ✅ Très bon pattern.
- **Composants DS** : custom CSS dédié (`gen-image-skeleton`, `gen-image-spinner`, `gen-summary-tag`).
- **Particularité** : `runDerive` (`:246-261`) auto-déclenché à l'ouverture si pas de prompt — affiche un mini-spinner inline sur le bouton "Re-derive" pendant ~600ms. Bon détail.

#### Error

- **Statut** : ❌ **Catch silencieux**.
- **Constat** : `runDerive:249-253` : `try { promptText = await derivePromptFromPost… } catch { /* keep whatever was there */ }` — l'utilisateur ne sait pas si l'auto-dérivation a échoué ; il pense juste que rien ne s'est passé.
- `runGeneration:266-272` : `try { … genState = "result" } catch { genState = "idle" }` — la modale revient au formulaire vide sans message. C'est encore plus problématique : l'utilisateur ne sait pas si :
  - le bouton n'a pas réagi (bug)
  - la génération a été annulée
  - la génération a échoué côté backend
- **Recommandation** :
  - Sur catch `runGeneration`, garder l'état `idle` mais afficher une infobox erreur en haut du body avec "Image generation failed. Try again or tweak the prompt."
  - Sur catch `runDerive`, fallback acceptable (laisse le prompt manuel) mais idéalement ajouter un toast discret "Couldn't auto-derive a prompt — please write one"
- **Priorité** : P0

---

### 3.8 Chat-picker modal

**Fichier** : [src/components/chat-picker-modal.js](src/components/chat-picker-modal.js)

- **Empty / Loading / Error** : Tous N/A. La modale ne s'ouvre que quand il y a au moins une option à présenter (toujours "Start a new chat" + sessions existantes). Réutilise le picker numérotté avec keyboard nav (`renderPicker` + `bindWizardKeyboard`).
- **Onboarding** : sub-titre "Drafts live inside chats. Pick one, or start fresh." (`chat-picker-modal.js:37`) — bon ancrage UX.
- **Aucune action requise.**

---

### 3.9 Schedule modal

**Fichier** : [src/components/schedule-modal.js](src/components/schedule-modal.js)

#### Empty

- **Statut** : — (early return `:76` `if (!posts || posts.length === 0) return;`).

#### Loading

- **Statut** : ❌ Absent. Confirm (`:133-138`) appelle `onConfirm` puis `showToast("{N} posts scheduled")` puis `close()` — instantané. Aucun feedback de "scheduling in progress" même si les calls réseau prendront ~1s par post.

#### Error

- **Statut** : ❌ Absent. Pas de branche d'échec — un post qui échoue à se programmer ne sera pas signalé.

**Recommandation** :

- Ajouter un état "scheduling" pendant l'attente avec spinner sur le bouton primaire.
- Si une partie des posts échoue, toast variant `error` avec liste des posts en échec et bouton Retry.
- Surface inline d'erreur si la connexion réseau est down avant le submit.

**Priorité** : P1

---

### 3.10 Settings drawer

**Fichier** : [src/components/settings-drawer.js](src/components/settings-drawer.js)

5 sections : Connectors / Contexts / Préférences / Social / Notifications.

#### Empty (section Contexts)

- **Statut** : ✅ Bon pattern.
- **Constat** : `:155-164` :
  ```html
  <div class="settings-drawer__empty">
    <div class="settings-drawer__empty-icon"><i class="ap-icon-headset lg"></i></div>
    <h4 class="settings-drawer__empty-title">No saved contexts yet</h4>
    <p class="settings-drawer__empty-body">
      Start a new chat — Archie will walk you through capturing a Voice, Strategy brief, and Brand theme, then offer to
      save it here.
    </p>
  </div>
  ```
- Icône + titre + body explicatif. Aligne avec la philosophie des autres empty states "riches".
- **Problème mineur** : pas de CTA cliquable ; l'utilisateur doit comprendre seul qu'il faut quitter le drawer pour aller dans une chat. Un bouton "+ New chat" serait actionnable.
- **Priorité** : P2

#### Onboarding

- **Statut** : ❌ Aucun. Un nouvel utilisateur ouvrant Settings tombe sur 4 connectors à brancher, sans contexte sur ce qu'ils font (descriptions présentes mais courtes).

#### Loading

- **Statut** : ❌ Absent.
- **Constat** : Tous les saves sont **synchrones et silencieux** :
  - Connectors connect/disconnect (`:586-599`) : mute le store, re-render, toast succès
  - Préférences save (`:602-606`) : `Object.assign(generationPrefs, state.prefs)` → instantané
  - Notifications save (`:610-616`) : pareil
  - Social toggle (`:620-637`) : pareil
- En production réelle (API networks), tous ces clicks devraient avoir un état "saving…" + spinner.
- **Recommandation** : laisser le mock instantané mais marquer le câblage à faire au branchement API.

#### Error

- **Statut** : ❌ Absent. Aucun chemin d'échec — toast d'erreur jamais émis, pas de retry, pas d'infobox.

#### Bonus : confirm dialog Discard

- **Statut** : ✅ Très bien.
- **Constat** : `:79-100` : custom dialog DS (pas window.confirm) avec backdrop + danger button rouge. `:477-487` `attemptSectionChange` et `:564-571` `attemptClose` interceptent les changements quand `state.dirty`.
- C'est un pattern à généraliser (cf. transverse §4.3).

---

### 3.11 Context drawer

**Fichier** : [src/components/context-drawer.js](src/components/context-drawer.js)

#### Empty

- **Statut** : ✅ Bon pattern (mais perfectible).
- **Constat** : `:298-307` quand `draft = null` (zéro contexte) :
  ```html
  <div class="context-drawer__empty">
    <p class="muted">No contexts yet — create one to get started.</p>
    <button type="button" class="ap-button primary orange" data-cdrawer-new>
      <i class="ap-icon-plus"></i><span>New context</span>
    </button>
  </div>
  ```
- CTA clair, action immédiate.
- **Problème** : pas d'icône, body court — moins riche que l'empty state du settings drawer Contexts.
- **Recommandation** : aligner les deux empty states "no context" (drawer + settings). Choisir l'un comme référence.
- **Priorité** : P2

#### Loading

- **Statut** : ❌ Absent. Save (`:210-216`) instantané.

#### Error

- **Statut** : ⚠️ Partiel.
- **Constat** : Trois usages de `window.confirm()` natif :
  - `:95` close avec dirty : "Discard unsaved changes?"
  - `:105` switch focus avec dirty : "Discard unsaved changes?"
  - `:154` new avec dirty : idem
  - `:233` delete : `if (!window.confirm(\`Delete "${state.draft.name}"?\`)) return;`
- Le settings drawer a son propre dialog DS (`settings-confirm`) — pourquoi pas ici ?
- **Recommandation** : remplacer par `confirm-modal.js` (composant DS prévu pour ça). Cohérence avec settings drawer.
- **Priorité** : P1

---

### 3.12 Right panel — modes Drafts / Ideas

**Fichier** : [src/components/right-panel.js](src/components/right-panel.js)

#### Empty — Drafts

- **Statut** : ✅ Bon pattern.
- **Constat** : `:549-559` `renderDraftsEmpty()` :
  ```html
  <div class="app-right-panel__empty">
    <div class="app-right-panel__empty-icon"><i class="ap-icon-pen"></i></div>
    <div class="app-right-panel__empty-title">No drafts yet</div>
    <div class="app-right-panel__empty-sub">
      Ask Archie for a batch — drafts will land here ready to review and schedule.
    </div>
  </div>
  ```
- Icône + titre + sub orienté action. Excellent.

#### Empty — Drafts no-match

- **Statut** : ⚠️ Partiel.
- **Constat** : `:534-539` :
  ```html
  <div class="app-right-panel__empty">
    <div class="app-right-panel__empty-title">No drafts match this filter</div>
    <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
  </div>
  ```
- **Problèmes** : pas d'icône (cassé l'alignement visuel avec le no-drafts-yet juste au-dessus), pas de bouton "Clear filters".
- **Recommandation** : ajouter icône (cohérence) + bouton "Clear filters" qui réinitialise `draftsFilter = "all"` + `draftsNetwork = "all"`.
- **Priorité** : P2

#### Empty — Ideas no-match

- **Statut** : ⚠️ Partiel.
- **Constat** : `:764` `<div class="rpanel-ideas__no-match">No ideas match.</div>` — texte seul, classe ad-hoc.
- **Recommandation** : aligner sur le pattern des autres empty states du panel (icône + titre + sub).
- **Priorité** : P2

#### Loading

- **Statut** : ✅ — le panel reflète instantanément le store. Quand un nouveau draft arrive (callback assistant), le panel s'auto-ouvre (`session.js:786-789`) — bon pattern.

#### Error

- **Statut** : ⚠️ Partiel.
- **Constat** : Per-card actions (rewrite/schedule/duplicate/delete) :
  - `onPostRewrite` (`:563-569`) : montre juste un toast "Regenerating draft… (mock)" — placeholder visible, mais surfacée à l'utilisateur en l'état dans le proto. **Ne doit pas atteindre la prod**.
  - `onPostDelete` (`:603-618`) : pattern excellent — toast avec Undo qui restaure le post à l'index original.
  - `onPostSchedule` (`:571-588`) : ouvre la modale schedule (héritage de ses limites — cf. 3.9).

---

### 3.13 Sidebar (recent chats)

**Fichier** : [src/components/sidebar.js](src/components/sidebar.js)

#### Empty

- **Statut** : ✅ Présent, minimal mais correct.
- **Constat** :
  - `:412-419` (aucune conversation, ou `isNewUser()`) : `<div class="app-sidebar__empty"><span class="app-sidebar__empty-text">No conversations yet</span></div>`
  - `:426-432` (filtre vide) : "No conversations match"
- **Particularité** : la search input est masquée si `isNewUser() || recentSessions.length === 0` (`:380`) — cohérent.
- **Recommandation** : pour le first-run, message un peu plus engageant ("Start your first chat — click + above") avec un focus visuel sur le bouton "+ New conversation". Optionnel.
- **Priorité** : P2

---

### 3.14 Composer + thinking chip + inline question + sidebar wizard

#### Composer (placeholder)

- **Statut** : ✅ Placeholder informatif (`session.js:285`) : "Ask Archie to compare ideas, find a signal, or draft the next move…"
- **Hint visible sous le composer** (`session.js:340-343`) : `↵ to send · Shift+↵ for new line · ⌘+↵ sends from anywhere · drop a file anywhere to add it as a source`. Très bien — coach mark passif.

#### Thinking chip

Cf. 3.2 Loading.

#### Inline question

- **Empty** : N/A
- **Loading** : ⚠️ pas de pending state ; `pick()` / `submitCustom()` (`:47-62`) résolvent immédiatement.
- **Error** : ❌ aucun chemin d'échec.

#### Sidebar wizard

- **Loading** : ✅ `isPending: true` (`:54`) + analyzing notice (`:254-263`) avec mermaid pill "Analyzing" + spinner. Identique au pattern d'extraction. Bon.
- **Error** : ❌ aucun ; si le caller throw dans `setTimeout`, le wizard reste figé.

---

## 4. Problèmes transverses

### 4.1 Trois patterns d'empty state qui divergent

Le projet utilise au moins **3 patterns différents** pour les empty states :

| Pattern                                               | Surfaces                                                                                                  | Fichier référence                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Riche** : icône + titre + body + action optionnelle | content-workspace, settings-drawer Contexts, right-panel Drafts (yes), context-drawer (sans icône)        | `content-workspace.js:70-81` (référence projet) |
| **Minimal texte**                                     | sources-view, ideas-view, contexts-view, right-panel Drafts no-match, right-panel Ideas no-match, sidebar | `sources.js:120`                                |
| **Drop tile / interactive**                           | sources-view (drop tile), add-source-modal upload (dropzone)                                              | `sources.js:130-138`                            |

**Recommandation** : choisir `renderEmptyState({ icon, title, body, actionHtml })` de `content-workspace.js:70-81` comme **fonction utilitaire commune**, l'extraire dans `src/components/empty-state.js`, et migrer toutes les surfaces minimalistes. Effort : M, impact : moyen.

### 4.2 Catch silencieux — pattern dangereux

Au moins 5 surfaces ont des `try/catch` qui **ne surfacent rien** à l'utilisateur :

| Fichier:ligne                                               | Action                | Conséquence                                                      |
| ----------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| `generate-image-modal.js:266-272`                           | `runGeneration` catch | Modale revient à idle sans explication                           |
| `generate-image-modal.js:249-253`                           | `runDerive` catch     | Prompt vide sans info                                            |
| `bug-report-modal.js:126-128`                               | html2canvas           | Badge "Capture unavailable" (OK)                                 |
| `feedback-modal.js:80-82`                                   | submit                | Hors périmètre                                                   |
| `add-source-modal.js` (drag/drop dans `session.js:962-981`) | classifyFile rejette  | Modale s'ouvre, mais sur la page sources le rejet est silencieux |

**Recommandation** : standardiser sur `showToast(message, { variant: "error", action: { label: "Retry", onClick } })`. Ne **jamais** catch+drop.

### 4.3 `window.confirm()` natif vs DS

Mélange incohérent :

- `contexts.js:170` : `window.confirm`
- `context-drawer.js:95, 105, 154, 233` : `window.confirm`
- `settings-drawer.js:79-100, 477-487` : custom DS dialog (le bon pattern)

**Recommandation** : utiliser `confirm-modal.js` (existant, hors périmètre audit mais référencé) partout où `window.confirm` apparaît. Standardisation visuelle + clavier accessible + danger button DS.

### 4.4 Variant `error` du toast jamais utilisé en runtime

`toast.js:36-41` accepte un paramètre `variant: "success" | "error"` (défaut "success"). Une recherche dans le codebase (`grep variant.*error`) montre que ce variant n'est jamais utilisé en production — seuls `showToast("…")` ou `showToast("…", { action })` sont câblés.

Pourtant tous les `try/catch silencieux` (cf. 4.2) seraient des candidats naturels.

**Recommandation** : audit ciblé d'usage, ajouter au moins 5 sites d'erreur (cancel upload échoué, save settings échoué, generate-image catch, schedule échoué, draft-flow catch).

### 4.5 Pas de retry, pas de timeout

Aucun mécanisme de retry n'existe :

- Pas de bouton "Retry" dans aucun message d'erreur
- Pas de re-tentative auto sur les actions failées
- Pas de timeout : un thinking chip qui resterait à 60s+ ne déclenche aucune alerte

**Recommandation** :

- Ajouter un timeout (~30s) dans `assistant.js:97-124` qui bascule la message en `status: "error"` avec un bouton Retry
- Ajouter le pattern Retry à `showToast` quand variant=error (déjà supporté via `action`)

### 4.6 `isNewUser()` et incohérences first-run

`isNewUser()` vide les stores (sources, ideas, contexts, drafts) mais :

- Le composer affiche un dropdown contexte hardcodé (`session.js:255-279`) avec 3 entrées Agorapulse — ne reflète pas le store vide
- Les chat starters (`mocks.js:53-79`) contiennent `{{source}}` non substitué
- La welcome card du dashboard (`:133-149`) destinée au first-run n'est jamais atteinte (redirection)

**Recommandation** : revue cohérence first-run, traiter comme un parcours testable end-to-end avec le toggle `archie-user-mode = "new"`.

### 4.7 No skeletons sur les listes au mount

Les pages /sources, /ideas, /contexts mountent leur contenu de manière synchrone via les stores. En production réelle (avec fetch), il faudra :

- skeleton tile (déjà éprouvé sur `generate-image-modal.js:204`) pour les cards
- placeholder pour le titre + sub
- état de re-fetch (refresh)

**Recommandation** : prévoir le câblage à l'API.

---

## 5. Plan de fixes proposé

> Lots ordonnés par dépendance + priorité. Effort : S < 1h, M = 1-3h, L > 3h. Impact UX : 1-3.

### Lot A — Corrections critiques (urgence)

| #   | Fix                                                                                                           | Surface(s)                      | Effort |      Impact       |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ | :---------------: |
| A1  | Surfacer un message d'erreur sous l'input URL d'`add-source-modal` (URL invalide non-vide)                    | add-source-modal `:553-561`     | S      |         3         |
| A2  | Afficher une infobox erreur dans `generate-image-modal` quand `runGeneration` catch (avec bouton "Try again") | generate-image-modal `:266-272` | S      |         3         |
| A3  | Décider et résoudre le code mort `dashboard.js renderProjectsPanel` (suppression OU réactivation)             | dashboard `:65-374`             | S→M    | 2 (code) / 3 (UX) |
| A4  | Substituer ou conditionner les `{{source}}` des chat starters quand `getSources().length === 0`               | mocks + session.js              | S      |         2         |
| A5  | Brancher le dropdown contexte du composer sur `getContexts()` au lieu du markup hardcodé                      | session.js `:242-281`           | M      |         2         |

### Lot B — Standardisation des empty states

| #   | Fix                                                                                                                                                                      | Surface(s)        | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ | :----: |
| B1  | Extraire `renderEmptyState` de `content-workspace.js` dans `src/components/empty-state.js` (fonction utilitaire commune, signature `{ icon, title, body, actionHtml? }`) | nouveau fichier   | S      |   1    |
| B2  | Migrer `sources.js:120` vers le pattern riche, distinguer "aucune source" vs "no match" + bouton "Clear filters"                                                         | sources.js        | S      |   2    |
| B3  | Migrer `ideas.js:110` vers le pattern riche + CTA "+ Add a source" pour le cas `IDEAS.length === 0`                                                                      | ideas.js          | S      |   2    |
| B4  | Migrer `contexts.js:68` vers le pattern riche + CTA "Create your first context"                                                                                          | contexts.js       | S      |   2    |
| B5  | Migrer `right-panel.js:534-539` (Drafts no-match) avec icône + bouton "Clear filters"                                                                                    | right-panel.js    | S      |   1    |
| B6  | Migrer `right-panel.js:764` (Ideas no-match) avec icône                                                                                                                  | right-panel.js    | S      |   1    |
| B7  | Aligner `context-drawer.js:298-307` avec settings-drawer Contexts (icône + body)                                                                                         | context-drawer.js | S      |   1    |

### Lot C — Cohérence des dialogs de confirmation

| #   | Fix                                                                                                     | Surface(s)        | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------- | ------ | :----: |
| C1  | Remplacer `window.confirm()` par `confirm-modal.js` dans `contexts.js:170` (delete)                     | contexts.js       | S      |   2    |
| C2  | Remplacer les 4 `window.confirm()` de `context-drawer.js` (`:95, 105, 154, 233`) par `confirm-modal.js` | context-drawer.js | M      |   2    |

### Lot D — États d'erreur user-facing manquants

| #   | Fix                                                                                                              | Surface(s)                             | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ | :----: |
| D1  | Ajouter timeout (~30s) au thinking chip + bascule en état d'erreur retry-able                                    | session.js `:1002-1059` + assistant.js | M      |   2    |
| D2  | Ajouter branche d'erreur à `executeDraft` (`draft-flow.js:72-101`) avec toast variant error + Retry              | draft-flow.js                          | S      |   2    |
| D3  | Ajouter état "scheduling" + branche d'erreur à `schedule-modal.js:133-138`                                       | schedule-modal.js                      | M      |   2    |
| D4  | Concaténer les erreurs multi-fichiers dans `add-source-modal.js:405-417` au lieu de garder seulement la première | add-source-modal.js                    | S      |   1    |
| D5  | Toast d'erreur visible quand `runDerive` (generate-image) catch (`:249-253`)                                     | generate-image-modal.js                | S      |   1    |

### Lot E — Onboarding (peut être différé)

| #   | Fix                                                                                                        | Surface(s)                    | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ | :----: |
| E1  | Bouton CTA "+ New chat" sur l'empty state Settings → Contexts                                              | settings-drawer.js `:155-164` | S      |   1    |
| E2  | Welcome card dashboard re-câblée (uniquement si A3 décide la réactivation)                                 | dashboard.js                  | M      |   3    |
| E3  | Ajouter un onboarding tip discret au mount d'une session vide (1 tooltip auto-dismissable sur le composer) | session.js                    | M      |   2    |
| E4  | Empty state sidebar plus engageant pour first-run (focus visuel sur "+ New conversation")                  | sidebar.js `:412-419`         | S      |   1    |

### Lot F — Hygiène code (à valider)

| #   | Fix                                                                                                                          | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1  | Audit & supprimer le code mort de `dashboard.js` si lot A3 décide la suppression (~280 lignes)                               | M      |
| F2  | Décision sur les boutons "Re-mine sources" / "New idea" de `ideas.js:60-67` (câbler ou retirer le toast d'excuse `:149-155`) | S      |
| F3  | Standardiser l'usage du variant `error` dans `showToast` partout où un catch surfacerait un échec                            | S      |

---

### Ordre d'exécution recommandé

1. **A** (5 fixes critiques, ~2-4h)
2. **B** (7 fixes empty states standardisés, ~3-4h, dépend de B1)
3. **C** (2 remplacements `window.confirm`, ~1-2h)
4. **D** (5 états d'erreur, ~3-5h)
5. **E** (4 fixes onboarding, ~3-4h, peut être différé)
6. **F** (hygiène, après validation)

**Effort total estimé** : ~12-19h sur le périmètre validé. Aucun fix Lot A ne nécessite plus que S/M individuel.

---

> Fin du rapport. En attente de validation des fixes par lot avant Phase 2.
