# Architecture

> Vue d'ensemble du proto, conventions structurelles, lifecycle. Compagnon de [`CLAUDE.md`](../../CLAUDE.md), zoomable sur les conventions d'architecture.

## Principes

- **Vanilla JS pur** — pas de framework, pas de bundler, pas de build, pas de dépendance runtime externe.
- **ES modules** servis directement depuis `src/`, avec suffixes `?v=N` pour le cache-bust (à bumper en cohérence cross-importers).
- **Pure event delegation** — chaque écran/modal/composant attache un seul listener sur sa racine et dispatche via `data-*`. Aucun `onclick=` inline, aucun listener per-child sur les enfants interactifs.
- **Mocks** — toutes les seed data sont dans `src/mocks.js`. Aucune persistance d'état app (seul `archie-user-mode`, les feature flags, l'état collapse de la sidebar et les `sessionStorage` handoffs survivent au reload).

## Lifecycle de l'app

1. `index.html` (~50 lignes) charge tous les CSS et `src/app.js`.
2. `app.js` :
   - importe les screens (renderers) + composants + modaux
   - appelle `init()` sur chaque composant (qui injecte son DOM une fois dans `<body>`)
   - enregistre les routes via `route(path, handler)` (cf. `src/router.js`)
   - appelle `start()` qui lance le premier `hashchange`
3. À chaque `hashchange`, `router.js` :
   - match le path (query stripped)
   - vide `#app`
   - appelle `cleanup` retourné par le précédent handler (si défini)
   - appelle le handler du nouveau path : `renderXxx(params, target)`
4. `setAfterRender` (dans `app.js`) re-render la sidebar + la `conversation-status-card` après chaque route change, et toggle la classe `body.onboarding` pour le flow welcome-alt (layout full-bleed).

## Topologie de l'app shell

```
<body>
  #sidebar          ← persistent, géré par src/components/sidebar.js
  #topbar           ← persistent, géré par src/components/topbar.js
  #app              ← contenu de la route active, vidé/recréé sur hashchange
  #rightPanel       ← persistent overlay, géré par src/components/right-panel.js
  #toastRegion      ← portal pour les toasts (DS .ap-snackbar)
  #conversationStatusCard ← floating indicator
  [modals]          ← chacun s'injecte sur init(), un seul ouvert via modal-coordinator
</body>
```

## Source layout (résumé)

| Domaine                           | Fichiers                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bootstrap**                     | `app.js`, `router.js`, `url-state.js`, `handoff.js`, `utils.js`, `store-utils.js`, `user-mode.js`, `feature-flags.js`, `ff-catalog.js`, `file-kinds.js`, `mocks.js`                                                                                                                                                                                                                          |
| **Stores**                        | `sessions-store.js`, `contexts-store.js`, `connectors-store.js`, `library.js`, `posts-store.js`, `assistant.js`, `sources-stream.js`, `schedule-store.js`, `composer-mentions.js`, `research-store.js` — voir [`STORES.md`](STORES.md)                                                                                                                                                       |
| **Flow orchestrators**            | `start-flow.js`, `draft-flow.js`, `draft-rewrite.js`, `context-builder.js`, `playbook-editor.js`, `playbook-view.js`, `context-mock-analysis.js`, `sidebar-wizard.js`, `inline-question.js`, `library-actions.js`, `social-profiles.js`, `clip-formats.js`, `connectors-view.js`, `connector-ask.js`, `composer-connector.js`, `research-flow.js`, `research-view.js`, `research-catalog.js` |
| **Screens**                       | `screens/{dashboard, session, ideas, contexts, playbook, settings, connectors, research, welcome-alt, welcome-alt-recap}.js` + `screens/_analyse-common.js` + `screens/session/{intake-lifecycle, thinking-chip, wizard-keyboard}.js`                                                                                                                                                        |
| **Components (persistent shell)** | `components/{topbar, sidebar, right-panel, conversation-status-card, content-workspace, toast, shortcut-legend}.js`                                                                                                                                                                                                                                                                          |
| **Components (cards)**            | `components/{source-card, idea-card, idea-card-compact, post-card, clip-card, social-post-card, empty-state}.js`                                                                                                                                                                                                                                                                             |
| **Modals**                        | `components/{add-source, connectors, research, generate-image, video-clips, schedule, bug-report, feedback, chat-picker, confirm, rename, search}-modal.js`                                                                                                                                                                                                                                  |
| **Modal coordinator**             | `modal-coordinator.js` — one-overlay-at-a-time orchestration                                                                                                                                                                                                                                                                                                                                 |

## Conventions de fichiers

### Composants persistants

Chaque composant exporte `init()` (injection DOM idempotente) + une API de render/open/close. Les listeners DOM sont scopés à la racine du composant et installés une fois dans `init()`.

```js
// Pattern type
let inited = false;
let root;
export function init() {
  if (inited) return;
  inited = true;
  document.body.insertAdjacentHTML("beforeend", `<aside id="myComponent">…</aside>`);
  root = document.getElementById("myComponent");
  root.addEventListener("click", handleDelegatedClick);
  subscribe(render); // store subscription
}
```

### Screens

Chaque screen exporte `renderXxx(params, target)`. Peut retourner une cleanup function appelée par le router à la sortie.

```js
export function renderSession(params, target) {
  const sessionId = params.id;
  target.innerHTML = html`…`;
  const unsubscribe = subscribeThread(sessionId, () => paintThread(sessionId));
  return () => unsubscribe();
}
```

### Modaux

Pattern uniforme :

```js
// pseudo-code
let inited = false,
  dialog,
  lastFocus;
const MODAL_ID = "addSourceModal";

export function init() {
  if (inited) return;
  inited = true;
  document.body.insertAdjacentHTML("beforeend", `<dialog id="${MODAL_ID}">…</dialog>`);
  dialog = document.getElementById(MODAL_ID);
  bindOverlayDismissal(dialog, close);
}

export function open() {
  lastFocus = document.activeElement;
  requestOpen(MODAL_ID, close); // modal-coordinator
  dialog.hidden = false;
  dialog.querySelector("[autofocus]")?.focus();
}

function close() {
  dialog.hidden = true;
  notifyClose(MODAL_ID);
  lastFocus?.focus({ preventScroll: true });
}
```

Voir `src/modal-coordinator.js` pour le pattern global one-overlay-at-a-time.

## Rendering — html\`\` + raw()

`src/utils.js` expose deux tag templates :

```js
import { html, raw, escapeHtml } from "./utils.js";

const safe = html`<div class="card">${userInput}</div>`; // escape par défaut
const wrapped = html`<div>${raw(prerenderedHtml)}</div>`; // n'escape pas raw()
```

**Règle d'or** : ne jamais appeler `escapeHtml()` sur une valeur déjà interpolée dans `html\`\``. Double-escape = bug (cf. la section "HTML rendu en clair" historique).

## Cycle d'import + versioning

Les imports portent un suffixe `?v=N` :

```js
import { sendMessage } from "./assistant.js?v=40";
```

⚠️ Bumper la version d'un module impose de bumper **chez tous les importeurs** sinon un singleton/store devient deux instances séparées (avec leurs propres state map + subscribers).

Outils :

- `scripts/bump-cache.py` — utilitaire à utiliser pour bump consistant
- Plus de détails dans [`STORES.md#singleton-warning`](STORES.md#singleton-warning)

## Voir aussi

- [`ROUTES.md`](ROUTES.md) — route table + handoffs + URL state
- [`STORES.md`](STORES.md) — patterns d'état + API par store
- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — DS workflow + conventions CSS
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire produit + pipeline
- [`../../CLAUDE.md`](../../CLAUDE.md) — guide canonique pour les agents
