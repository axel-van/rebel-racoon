# Audit Archie — 2026-05-22

Audit en lecture seule, sur le HEAD de `main`. Périmètre : `src/` (JS, 64 fichiers, ~22 k lignes) + `styles/` (CSS, 33 fichiers, ~13 k lignes) + `index.html`. `ds/` n'est pas audité (vendor).

## Synthèse

| Sévérité      | Axe 1 | Axe 2 | Axe 3 | Axe 4 | Total |
| ------------- | ----- | ----- | ----- | ----- | ----- |
| 🔴 Critique   | 2     | 2     | 0     | 0     | 4     |
| 🟠 Important  | 8     | 5     | 3     | 5     | 21    |
| 🟡 Cosmétique | 9     | 3     | 4     | 3     | 19    |
| **Total**     | 19    | 10    | 7     | 8     | 44    |

Effort estimé global : **M** (~1 à 1,5 jour de travail concentré, hors décisions produit).

Légende effort : **S** = ≤30 min · **M** = 30 min–2 h · **L** = > 2 h.

---

## Axe 1 — Code mort & imports inutilisés

### 🔴 Critique

- **[src/components/right-panel.js:104-294, 653-849, 977-980]** — Le mode `context-form` est entièrement orphelin. `openContextForm`, `refreshContextForm`, `getContextFormMode`, `closeContextFormSilently` ne sont importés depuis aucun consommateur ; la variable `contextFormConfig` et toute la branche `state.mode === "context-form"` (≈ 70 lignes de logique + render) ne sont jamais activées. Le mode est remplacé partout par `openContextBriefPanel` / `refreshContextBriefPanel` (19 références actives). Action : supprimer les 4 exports, la branche `case "context-form"`, le commentaire mode au l. 104, la variable `contextFormConfig` et les blocs d'event delegation dépendants. Effort : **M**.

- **[src/screens/session.js:1397-1443 + 1178-1199]** — Bien que cataloguée Axe 2 plus loin (re-binding), la définition même des handlers drag/drop sur `aside` est partiellement morte après le premier `refreshAssistantAside()` — voir Axe 2/FIND-A. Action : laisser le finding en Axe 2 (correction de re-binding).

### 🟠 Important

- **[src/utils.js:39-41 + 43-53]** — `setHtml(target, markup)` et `on(root, selector, eventName, handler)` ne sont importés depuis aucun fichier. `setHtml` est trivial (innerHTML wrapper) ; `on` est un helper de delegation jamais utilisé alors que toutes les screens font de la delegation manuelle. Action : supprimer les deux exports + leur JSDoc. Effort : **S**.

- **[src/sources-stream.js:142-152]** — `export function formatSize(bytes)` n'a aucun consommateur externe (un seul appel interne ligne 183). Action : retirer `export`. Effort : **S**.

- **[src/composer-mentions.js:getMentions]** — `getMentions(sessionId)` exporté mais aucun import externe (4 références internes seulement). Action : retirer `export`. Effort : **S**.

- **[src/context-builder.js:SOCIAL_PLATFORMS, setAnswer, setVoiceProfileField, setName]** — 4 exports sans consommateur externe (référencés uniquement dans le module). `SOCIAL_PLATFORMS` est défini ligne ~210 ; les 3 setters sont des helpers internes. Action : retirer `export` sur les 4. Effort : **S**.

- **[src/feature-flags.js:50]** — `resetFlags` exporté mais seul consommateur est interne (l. 14, fallback de parsing). Action : retirer `export`. Effort : **S**.

- **[src/mocks.js]** — Exports inutilisés : `createPostFromIdea`, `attachImageToPost`, `postCountsByFilter`, `postCountsByNetwork` (toutes définies au format `export function`, jamais importées). À confirmer : ce sont peut-être des helpers de seed historiques. **[décision requise]** confirmer suppression vs garder pour réamorçage futur. Effort : **S**.

- **[src/_analyse-common.js:advanceContextStage, getStep, setStep, scrollChatToLatest]** — Exportés sans consommateurs externes (utilisés en interne du module). Action : retirer `export`. Effort : **S**.

- **[src/components/right-panel.js:setMode]** — Exporté mais aucun appel `setMode(...)` externe (seulement `state = { ...state, mode }` interne). Action : retirer `export`. Effort : **S**.

### 🟡 Cosmétique

- **[src/components/*-modal.js + settings-drawer.js + shortcut-legend.js]** — 12 modaux exposent `export function close()` ; le coordinator les appelle via la closeFn enregistrée par `requestOpen()`, jamais par import nommé. Action : passer les `close` en `function close()` (drop `export`). Concerne : `add-source-modal.js`, `bug-report-modal.js`, `chat-picker-modal.js`, `confirm-modal.js`, `feedback-modal.js`, `generate-image-modal.js`, `rename-modal.js`, `schedule-modal.js`, `search-modal.js`, `settings-drawer.js`, `shortcut-legend.js`, `video-clips-modal.js`. Effort : **S**.

- **[src/assistant.js:postUserChoice]** — Export sans consommateur externe ni interne (seul ref = la signature). À considérer mort. Effort : **S**.

- **[src/context-mock-analysis.js:detectPlatform, analyzeSocialProfile]** — Exports sans usage externe. Effort : **S**.

- **[src/context-questions.js:emptyAnswers]** — Export sans usage externe. Effort : **S**.

- **[src/sessions-store.js:addSession]** — Export non utilisé (le commentaire d'entête mentionne "used by future 'new chat' flows" → pas branché). **[décision requise]** : à garder en API publique pour future intégration ou à supprimer. Effort : **S**.

- **[src/playbook-editor.js:getContextId]** — Export sans consommateur externe. Effort : **S**.

- **[src/modal-coordinator.js:getActive]** — Export sans consommateur. Effort : **S**.

- **[src/components/conversation-status-card.js:setEnabled]** — Export sans consommateur externe. Effort : **S**.

- **[src/components/sidebar.js:toggleSidebar]** — Export sans consommateur externe (la fonction est utilisée via délégation interne uniquement). Effort : **S**.

- **[Documentation racine — fichiers d'audit obsolètes]** — `AUDIT-archie-states.md` (52 k), `CLEANUP-AUDIT.md` (92 k), `STUDIO_HANDOFF_AUDIT.md` (200 k), `STUDIO_FLOW_VERIFICATION.md` (31 k), `FLOW-AUDIT.md` (118 k). CLAUDE.md ne référence plus que `FLOW-AUDIT.md` et `FLOW-CHANGELOG.md`. **[décision requise]** : archiver les autres dans un dossier `docs/archive/` ou supprimer. Effort : **S**.

> **Note Axe 1** : aucun fichier source n'est totalement orphelin — la chaîne d'imports est complète. Les 100+ "exports inutilisés" remontés en première passe étaient des faux positifs liés aux namespace imports (`import * as inlineQuestion`, etc.). La liste ci-dessus est filtrée par double vérification (0 référence externe).

---

## Axe 2 — Comportements instables / bugs UI

### 🔴 Critique

- **FIND-A — [src/screens/session.js:1397-1443 + 1178-1199] — Drag-and-drop cassé après refresh wizard.** Les listeners `dragenter / dragover / dragleave / drop` sont attachés à `aside = root.querySelector(".session__assistant")` une seule fois dans `wireAssistantPanel`. `refreshAssistantAside` recrée ensuite l'élément `.session__assistant` via `screen.replaceChild(newAside, aside)` — le nouvel élément n'a aucun listener drag/drop. Symptôme : dès qu'une inline-question ou un sidebar-wizard est joué (chaque réponse → refresh), le drop d'un fichier sur le panneau devient un no-op silencieux ; l'utilisateur ne comprend pas pourquoi son drop échoue. Action recommandée : extraire la liaison drag/drop dans une fonction `bindDragAndDrop(aside)` rappelée à la fin de `refreshAssistantAside()` (comme `rebindWizardKeyboardIfActive`). Effort : **S**.

- **FIND-B — [src/router.js:53-74 + screens/dashboard.js,contexts.js,ideas.js,session.js] — Pas de cleanup au changement de route pour 4 screens sur 10.** `welcome-*` retournent une cleanup ; `renderDashboard`, `renderContexts`, `renderIdeas` et `renderSession` non. La session subscrit 9 stores (thread, right-panel, library, posts, wizard, inline-question, composer-sources, composer-uploads, composer-mentions) que `wireAssistantPanel` tear-down seulement à la _prochaine_ entrée dans le même flow (`if (currentUnsubscribe) currentUnsubscribe();`). En sortant vers `/ideas` ou `/contexts`, les subscribers restent actifs en mémoire et tirent encore des notifications (qui hit des DOM nodes nuls, donc no-op visible mais leak vrai). Action : faire retourner `renderSession` une cleanup (`() => { if (currentUnsubscribe) currentUnsubscribe(); }`) ; idem pour les autres screens qui posent des handlers (dashboard.js a une listener sources-stream globale, à vérifier). Effort : **M**.

### 🟠 Important

- **FIND-C — [src/components/*-modal.js + settings-drawer.js (11 fichiers)] — Pas de restauration du focus après fermeture.** Seul `search-modal.js` capture `document.activeElement` à l'ouverture et le restaure à la fermeture (l. 253, 281-286). Les 11 autres overlays ne restaurent rien → après Esc ou clic backdrop, le focus retombe sur `<body>`, cassant le parcours clavier et l'a11y (les utilisateurs lecteurs d'écran perdent le contexte). Action : ajouter à chaque modal un `lastFocus = document.activeElement` dans `open()` et `lastFocus?.focus({ preventScroll: true })` dans `close()`. Effort : **M**.

- **FIND-D — [src/screens/session.js:677-731] — Watchdog clips extraction sans tear-down sur navigation.** `startClipsExtractionFlow` arme un `setTimeout(cleanup, 120000)` + 2 subscriptions sources-stream. Si l'utilisateur quitte la session pendant la fenêtre, rien n'appelle `cleanup` ; les closures restent jusqu'à expiration du watchdog (jusqu'à 2 min). Conséquence : le subscriber peut déclencher `startClipExtraction` sur un node disparu et poster un turn dans une session que l'utilisateur a quittée. Action : enregistrer `cleanup` dans la file de cleanup de la screen (cf FIND-B). Effort : **S**.

- **FIND-E — [src/components/right-panel.js:879-895] — `document.addEventListener("focusin")` + `keydown` posés sans guard d'unicité.** `init()` (l. 877+) est appelé une seule fois depuis `app.js` ; les handlers globaux sont donc safe en l'état. Mais le pattern empêche tout reload partiel : si jamais un `init()` est rappelé (cas de remount à venir), chaque handler est ré-attaché. Risque latent. Action : passer en idempotent (variable `inited` au top du module). Concerne aussi `topbar.js:219-225`, `sidebar.js:206-269`, `clip-card.js:59-75`, `idea-card.js:79-119`, `source-card.js:52-75` qui posent des handlers au TOP-LEVEL du module (s'exécutent à l'import). Action : déplacer ces top-level `document.addEventListener` dans des `init()` idempotents. Effort : **M**.

- **FIND-F — [src/screens/session.js:1505-1518] — `thinkingIntervalId` global vs cycle de vie session.** Le timer est posé/clearé via `start/stopThinkingTimer` mais le state `thinkingIntervalId` est défini au scope du module. Si deux flows concurrents ouvrent une thinking-chip simultanément sur deux sessions différentes (peu probable mais possible en mode dev), le second `setInterval` écrase la référence et le premier fuit. Action : encapsuler dans un objet par session ou ajouter un guard `if (thinkingIntervalId) clearInterval(thinkingIntervalId)` avant ré-armement. Effort : **S**.

- **FIND-G — [src/components/topbar.js:222-228 + sidebar.js:206-269 + search-modal.js:148-188] — Listeners globaux `keydown` multiples sans coordination.** Toolbar `?`, sidebar nav clavier, search modal ouverture ; chaque module attache son propre `document.addEventListener("keydown")`. Les conditions de garde sont OK (input focus check), mais l'ordre d'exécution n'est pas garanti. Symptôme rare : `?` ouvre la shortcut-legend même si on est en train de taper dans le composer (la condition `event.target.matches("input, textarea")` est OK pour ces deux, mais pas vérifiée partout). Action : auditer chaque guard. Effort : **S**.

### 🟡 Cosmétique

- **FIND-H — [src/screens/session.js:1505 + paintThinkingChip] — `setInterval` de 1s qui repaint en lisant `Date.now() - startedAt`.** Si l'utilisateur dort/met l'onglet en arrière-plan, à son retour l'intervalle a sauté quelques ticks et reste cohérent (Date.now() est correct), mais affichera un saut. Acceptable.

- **FIND-I — [src/sources-stream.js:setTimeout x6, src/context-builder.js:setTimeout x4] — Timeouts qui scriptent l'analyse (mock).** Comportement attendu pour un proto, mais aucune clé d'annulation : si l'utilisateur supprime la source pendant l'analyse, le `setTimeout` final fait quand même `completeScriptedSource` sur un id disparu (no-op en pratique). À documenter ou wrapper.

- **FIND-J — [src/components/bug-report-modal.js:386 + feedback-modal.js, generate-image-modal.js] — `setTimeout(close, 2200)` après confirmation.** Si l'utilisateur ouvre un autre modal entre temps, le modal-coordinator a déjà transitionné mais `close` du modal sortant s'exécute quand même → `notifyClose` est protégé par check d'id donc safe. À documenter.

---

## Axe 3 — Cohérence design system (skill `agogo-design`)

> Référence : `CLAUDE.md` section "Design System" + `ds-css` MCP (`validate_css`, `recommend_token`, `search_tokens`). Tokens disponibles : font-size xs→xxxl (12-28px), spacing xxxs→xxxl (4-60px), border-radius sm/md/lg (4/4/8px). Hors-grille = candidat violation.

### 🔴 Critique

(aucun)

### 🟠 Important

- **[styles/screens/dashboard.css:812-840] — `.ap-button.danger { … }` redéclaré hors `ds-patches.css`.** Variante `danger` ajoutée à `.ap-button` directement dans le fichier d'écran, alors que CLAUDE.md stipule : « Never redeclare a `.ap-*` class with overrides outside `ds-patches.css` ». Le DS ne fournit pas de bouton danger natif → la patch est légitime, juste mal placée. Action : déplacer le bloc `.ap-button.danger`, `.ap-button.danger:hover`, `.ap-button.stroked.danger`, `.ap-button.stroked.danger:hover` dans `styles/ds-patches.css` et supprimer du dashboard.css. Effort : **S**.

- **[styles/components/right-panel.css:161,236,310,317,348,353,400,464,500,530,543,552 + sidebar.css:86,175,201,472,578] — `font-size: 10px` et `11px` hors échelle Averta.** Le DS expose `--ref-font-size-xs: 12px` comme plus petite taille ; les valeurs 10/11px ne sont pas sur la scale et ne correspondent à aucun text-style. Total : ~17 occurrences dans right-panel + 5 dans sidebar. Cas légitime pour des micro-labels ? Probablement pas — la DS recommande `--ref-font-size-xs` (12) + `--ref-font-weight-bold` pour ces micro-éléments. Action : pour chaque occurrence, valider via `recommend_token` puis remplacer ; si vraiment besoin d'un sub-xs, déclarer un alias `--app-text-micro` dans `tokens.css` et l'utiliser. Effort : **M**.

- **[styles/components/right-panel.css + sidebar.css + welcome.css — `gap: 2px`, `padding: 2px N`] — Micro-spacings hors-grille.** Le DS scale commence à `--ref-spacing-xxxs: 4px`. `2px` n'a pas d'équivalent. Total : ~12 occurrences. Cas légitime pour ajustements optiques mais à documenter. Action : soit aligner à `--ref-spacing-xxxs` (4px) si le rendu reste OK, soit déclarer `--app-spacing-micro: 2px` dans tokens.css avec commentaire d'usage. Effort : **M**.

### 🟡 Cosmétique

- **[styles/components/video-clips-modal.css] — 49 px-spacings + 12 border-radius + 28 font-sizes + 39 hex colors + 39 rgba.** Comme commenté au top du fichier (l. 5, 545) : la palette sombre `#14171D / #1B1F26 / #232830` est délibérée et représente "the dark editor pane" non couvert par le DS. C'est une décision design assumée. Action : laisser tel quel, éventuellement extraire les couleurs en `--app-clip-editor-bg`, `--app-clip-editor-surface` etc. pour une centralisation, mais pas une violation à corriger. Effort : **M** si extraction tokens.

- **[styles/screens/welcome.css:2 occurrences + chat.css:2 + modals.css:1] — `!important` ponctuel.** Le DS n'utilise pas `!important` ; chaque occurrence devrait être justifiée. À auditer un par un. Effort : **S**.

- **[styles/screens/posts.css:295 — `background-color: #1a1a1a` hors-DS] — Single hex hardcodé.** Probablement une extension du dark-editor (à confirmer). Action : remplacer par var ou justifier. Effort : **S**.

- **[styles/screens/dashboard.css:165 + chat.css:370,375] — Commentaires de redéclaration `.ap-card`.** Les commentaires expliquent qu'on compose avec `.ap-card` mais on n'override que des propriétés tierces (margin/gap des enfants). Pas une violation formelle, mais la frontière "extension" vs "override" est ténue ; à valider lors du fix Axe 3. Effort : **S**.

> **Note Axe 3** : aucune occurrence de `.ap-button`, `.ap-icon-button`, `.ap-status`, `.ap-tag` réécrite avec un border/background custom hors `ds-patches.css` (au-delà du cas `dashboard.css:.danger` cité). C'est un bon point — la convention CLAUDE.md est globalement respectée. Le gros des micro-spacings/sizes vient de la mécanique "ajustement final visuel" classique. À lever progressivement.

---

## Axe 4 — Architecture & duplication

### 🟠 Important

- **FIND-K — [src/{library,sources-stream,posts-store,assistant,contexts-store,sessions-store,connectors-store,composer-mentions}.js] — Boilerplate `subscribers + notify` dupliqué 8 fois.** Chaque store réécrit le même quadruplet :
  - `const subscribers = new Set()`
  - `export function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }`
  - `function notify() { for (const fn of subscribers) try { fn(snap); } catch (err) { console.warn(...) } }`

  Soit ~120 lignes redondantes. Une factory `createNotifier(name)` exposant `{ subscribe, notify }` cargo-culte ce boilerplate. `sources-stream` a deux notifiers (sources + uploads) — la factory rend ça naturel. **Pas à créer en Phase 1** (consigne). Action proposée : `src/store-utils.js` avec `createNotifier(label) → { subscribe, notify }`, puis migration store par store. Effort : **M**.

- **FIND-L — [src/components/*-modal.js + settings-drawer.js + shortcut-legend.js — 12 fichiers] — Pattern init/open/close + coordinator + Esc/backdrop dupliqué.** Chacun ré-implémente :
  - `init()` qui injecte le markup HTML une fois et lie X/Esc/backdrop
  - `open()` qui call `requestOpen(id, close)` + set hidden=false + focus
  - `close()` qui set hidden=true + `notifyClose(id)`
  - listener `keydown` global checkant `event.key === "Escape" && !dialog.hidden`

  Soit ~50 lignes redondantes × 12 ≈ 600 lignes. Action proposée : `createOverlay({ id, html, onOpen, onClose }) → { init, open, close }` dans `modal-coordinator.js` ou utils. Effort : **L**.

- **FIND-M — [src/screens/session.js] — 2628 lignes, ~12 responsabilités enchevêtrées.** Le fichier mélange : routing (renderSession), template HTML, intake-turn lifecycle, draft flow orchestration, clip extraction flow, content workspace render, focus-idea handling, drag-drop, thinking-chip timer, sub-subscriptions à 9 stores, sidebar wizard rebinding, playbook-editor handoff, welcome handoff. Action proposée : extraire les sub-flows en modules :
  - `src/screens/session/intake-lifecycle.js` (intake-turn loading→ready, lignes 1219-1274)
  - `src/screens/session/thinking-chip.js` (lignes 1459-1530)
  - `src/screens/session/clip-extraction-flow.js` (lignes 677-731)
  - `src/screens/session/drag-drop.js` (lignes 1397-1443)
  - `src/screens/session/wizard-keyboard.js` (lignes 1127-1177)

  Le fichier principal tomberait à ~1500-1800 lignes, plus lisible. **Pas à factoriser en Phase 1**. Effort : **L**.

- **FIND-N — [src/components/right-panel.js] — 2838 lignes, 4 modes (`drafts`, `ideas`, `context-form` (mort), `context-brief-panel`) tous dans un seul fichier.** Action proposée après suppression du mode mort (Axe 1) : extraire `renderDraftsView`, `renderIdeasView`, `renderContextBriefPanel` en modules dédiés sous `src/components/right-panel/`. Effort : **L**.

- **FIND-O — [src/library-actions.js + src/components/content-workspace.js + src/screens/session.js (Content tab)] — Logique de sélection multiple dispersée.** La barre d'actions en masse (`renderSourcesBulkBar`, `renderIdeasBulkBar`) vit dans `library-actions.js` ; la sélection contentState vit dans `content-workspace.js` ; session.js orchestre les deux. **[décision requise]** : factoriser en `useBulkSelection(items, kind)` ou laisser tel quel (la duplication est faible, ~30 lignes communes). Effort : **M**.

### 🟡 Cosmétique

- **FIND-P — [src/screens/welcome.js + welcome-recap.js + welcome-alt-recap.js + welcome-socials.js + welcome-sources.js + welcome-alt.js] — 6 fichiers welcome avec patterns voisins.** 4 d'entre eux retournent une cleanup correctement ; structure ~150-170 lignes chacun, headers similaires (logo, progress bar, header card, CTAs). Possibilité de factoriser un `<WelcomeScaffold>`. **[décision requise]** : valeur faible vs lisibilité actuelle. Effort : **M**.

- **FIND-Q — [src/screens/_analyse-common.js] — 451 lignes "common" devenu fourre-tout.** Wizard keyboard binding, picker rendering, stage advancement, scrollChatToLatest — différentes responsabilités. Splittable en `wizard-keyboard.js`, `picker-renderer.js`, `stage-helpers.js`. Effort : **M**.

- **FIND-R — [src/mocks.js] — 1197 lignes en un seul fichier de seed.** Séparable en `mocks/sessions.js`, `mocks/sources.js`, `mocks/ideas.js`, `mocks/contexts.js`, `mocks/posts.js`, `mocks/connectors.js`, `mocks/prefs.js`. Effort : **M**.

> **Note Axe 4** : les fichiers > 300 lignes représentent ~70 % de la masse JS. Mais découper trop agressivement multiplierait les imports et la friction de navigation. Les priorités à factoriser sont right-panel (mode mort + 4 modes) et session.js (responsabilités enchevêtrées). Les stores et modaux sont pertinents pour leur DRY-value, pas leur taille individuelle.

---

## Plan d'exécution proposé

Découpage en lots logiques pour permettre une validation incrémentale. Chaque lot est self-contained : tu peux valider Lot A sans débloquer Lot D.

### Lot A — Suppression code mort sûr (Axe 1, sans déps) — Effort : **M**

Findings : tous les "🟠 Important" + "🟡 Cosmétique" de l'Axe 1 sauf les `[décision requise]`.

1. Drop `export` sur 12 modal `close()` (Axe 1 / Cosmétique #1).
2. Drop `export` sur les helpers internes : `formatSize`, `getMentions`, `setAnswer`, `setVoiceProfileField`, `setName`, `SOCIAL_PLATFORMS`, `resetFlags`, `_analyse-common.*`, `setMode`, `postUserChoice`, `detectPlatform`, `analyzeSocialProfile`, `emptyAnswers`, `getContextId`, `getActive`, `setEnabled`, `toggleSidebar`.
3. Supprimer `utils.setHtml` et `utils.on` (4 lignes).

### Lot B — Suppression mode `context-form` (Axe 1 / 🔴) — Effort : **M**

Findings : `[src/components/right-panel.js]` mode orphelin.

1. Supprimer les 4 exports `openContextForm`, `refreshContextForm`, `getContextFormMode`, `closeContextFormSilently`.
2. Supprimer la variable `contextFormConfig` + initialisation.
3. Supprimer la branche `state.mode === "context-form"` dans `renderPanel`, le case `case "context-form"` du `if/else if`, les blocs `contextFormConfig?.onAnswer?.(...)` (l. 653-849).
4. Mettre à jour le commentaire de `state.mode` (l. 104).
5. Vérifier le build / lancer l'app : la page doit toujours fonctionner (le brief panel reste).

Ne pas faire Lot B sans Lot A (les `export` orphelins se chevauchent).

### Lot C — Fix bugs UI 🔴 + 🟠 (Axe 2) — Effort : **M**

1. FIND-A : extraire `bindDragAndDrop(aside)` dans session.js + appeler depuis `refreshAssistantAside`. Tester le drop après avoir répondu à une inline-question.
2. FIND-B : faire retourner `renderSession` une cleanup qui appelle `currentUnsubscribe()` ; idem `renderDashboard`/`renderContexts`/`renderIdeas` si elles ont des listeners (à confirmer en lisant les bodies).
3. FIND-C : ajouter `lastFocus` capture/restore dans les 11 overlays. Pattern à dupliquer ou (mieux) à intégrer dans la factory FIND-L (cf Lot F).
4. FIND-D : enregistrer le `cleanup` de `startClipsExtractionFlow` dans la cleanup screen (dépend de FIND-B).
5. FIND-E : passer top-level `document.addEventListener` en `init()` idempotent dans `clip-card.js`, `idea-card.js`, `source-card.js`.
6. FIND-F : guard `if (thinkingIntervalId) clearInterval(...)` avant ré-armement.

### Lot D — Conformité DS (Axe 3 / 🟠) — Effort : **M**

1. Déplacer `.ap-button.danger` + variants de `dashboard.css` vers `ds-patches.css`.
2. Auditer chaque `font-size: 10px / 11px` dans right-panel.css + sidebar.css : remplacer par `--ref-font-size-xs` (12) ou déclarer `--app-text-micro` dans tokens.css.
3. Auditer chaque `gap: 2px` / `padding: 2px N` : aligner à `--ref-spacing-xxxs` (4) ou déclarer `--app-spacing-micro: 2px` dans tokens.css.
4. Lancer `validate_css` sur les fichiers modifiés pour confirmer.

### Lot E — Décisions produit (Axe 1 [décision requise]) — Effort : **S**

1. Confirmer suppression vs garder : `mocks.createPostFromIdea`, `mocks.attachImageToPost`, `mocks.postCountsByFilter`, `mocks.postCountsByNetwork`.
2. Confirmer suppression vs garder : `sessions-store.addSession`.
3. Confirmer archivage vs suppression : `AUDIT-archie-states.md`, `CLEANUP-AUDIT.md`, `STUDIO_HANDOFF_AUDIT.md`, `STUDIO_FLOW_VERIFICATION.md`, `FLOW-AUDIT.md`.

### Lot F — Factorisation overlays (Axe 4 / FIND-L) — Effort : **L**

Crée `createOverlay()` dans `modal-coordinator.js` (ou nouveau fichier `overlay-factory.js`). Migre les 12 overlays un par un, en gardant l'API publique stable.

Bénéfice : ~600 lignes économisées + cohérence focus/Esc/backdrop garantie.

### Lot G — Factorisation stores (Axe 4 / FIND-K) — Effort : **M**

Crée `createNotifier(name) → { subscribe, notify }`. Migre 8 stores. Bénéfice : ~120 lignes.

### Lot H — Découpage session.js / right-panel.js (Axe 4 / FIND-M, FIND-N) — Effort : **L**

À planifier APRÈS Lot B (mode context-form mort) et Lot C (drag/drop extrait → tête de pont pour le découpage).

Sous-lots : H1 (intake-lifecycle.js), H2 (thinking-chip.js), H3 (clip-extraction-flow.js), H4 (right-panel/drafts.js + ideas.js + context-brief-panel.js).

### Dépendances entre lots

```
Lot A  ──┐
Lot B  ──┴── préreq Lot H (right-panel pré-nettoyé)
Lot C  ──── pas de déps
Lot D  ──── pas de déps
Lot E  ──── pas de déps (gère uniquement [décision requise])
Lot F  ──── pas de déps ; complète FIND-C de Lot C
Lot G  ──── pas de déps
Lot H  ──── préreq Lot B + Lot C
```

Ordre recommandé : **A → C → D → E → B → F → G → H**.

---

## Remarques transversales

- **Aucun TODO/FIXME explicite dans `src/`.** Les commentaires sont volumineux (~12 % des lignes JS) mais documentent l'intention, pas du travail en attente.
- **Pas d'inline `onclick=` dans le HTML généré.** L'event delegation est universelle. Bon point sécurité/architecture.
- **Pas de console.log** ; uniquement `console.warn`/`console.error` dans 8 stores/coordinator pour les subscriber exceptions et un `console.error` dans `draft-flow` + `schedule-modal` pour les paths d'erreur. Cohérent.
- **Versioning d'imports `?v=N`** : 100+ lignes de discipline manuelle. La cohérence est globalement maintenue mais le système est fragile. Hors-scope d'un audit Phase 1 ; à considérer un cache-bust automatique au moment où le proto sortira du sandbox.

---

_Prêt pour validation. Indique-moi quel(s) lot(s) tu valides pour passer en Phase 2._
