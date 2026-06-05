# Routes & navigation

Source de vérité : [`src/app.js`](../../src/app.js) (route table) + [`src/router.js`](../../src/router.js) (matcher).

## Route table

| Route                | Handler                  | Notes                                                                                              |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `/`                  | `dashboard.js`           | **Redirect-only** : first-time (`new-alt` mode) → `/welcome-alt` ; returning → most-recent session ou nouvelle session. Pas de UI propre. |
| `/session/:id`       | `session.js`             | La surface chat principale (le plus gros fichier du projet). Héberge le thread assistant, le composer, les flows per-session (intake, draft, clips). |
| `/ideas`             | `ideas.js`               | Library Ideas standalone : grid + filter chips by kind + search + sort. Multi-session.            |
| `/contexts`          | `contexts.js`            | Library **Playbooks** : cards (DO/DON'T, brief, color tag) + edit en side panel. |
| `/playbook/:id`      | `playbook.js`            | Page détail d'un Playbook. Topbar back → `/contexts`. |
| `/connectors`        | `connectors.js`          | Gallery des connectors (feature flag `connectors`, default OFF). Détail dans un modal. |
| `/settings`          | `settings.js`            | Two-pane settings : Connectors / Contexts / Generation preferences / Social accounts / Notifications + section **Admin** (proto controls). |
| `/welcome-alt`       | `welcome-alt.js`         | Onboarding first-time. Redirige vers une session transitoire. Body en `.onboarding` (full-bleed). |
| `/welcome-alt/recap` | `welcome-alt-recap.js`   | Recap final du Playbook construit pendant l'onboarding. |

## Matching & lifecycle

Le router (`src/router.js`) :

1. Écoute `hashchange` sur `window`.
2. Sépare le path de la query : `#/session/abc?tab=posts` → path = `/session/abc`, query = `tab=posts`.
3. Cherche la 1ère route qui match le path (avec `:param` extraction).
4. Si match : appelle `cleanup()` du précédent handler (s'il en a retourné une), vide `#app`, appelle le nouveau handler avec `({ ...params }, target)`.
5. Si pas de match : fallback (à confirmer dans le code — généralement redirection home ou 404 silencieux).

**Important** : le router re-run le handler sur **chaque hashchange**, y compris pour des changements de query (à path identique). C'est intentionnel — l'écran réagit aux query params (tab, focusIdea, etc.).

## URL state (hash query params)

Toutes les query params sont encodées dans le hash. Helpers dans [`src/url-state.js`](../../src/url-state.js) :

```js
import { parseHashParams, setHashQuery } from "./url-state.js";

const { tab, focusIdea } = parseHashParams();
setHashQuery("/session/abc", { tab: "posts", focusIdea: "i-42" });
```

`setHashQuery` appelle `navigate()` du router. Idiomatic pour pousser un changement d'état d'écran sans reload.

Exemples observés :
- `/session/:id?tab=posts` — Posts tab actif (right panel mode `drafts`)
- `/session/:id?focusIdea=…` — scroll-and-highlight d'une idée précise
- (autres possibles : `?tab=ideas`, `?tab=sources`, `?tab=clips`, etc.)

## Handoffs entre routes

`src/handoff.js` est un bridge à usage unique sur `sessionStorage`.

```js
import { setHandoff, consumeHandoff, hasHandoff } from "./handoff.js";

// avant de navigate
setHandoff("pendingDraftIdeaId", { ideaId: "i-42" });
navigate("/session/abc");

// dans le handler de la destination
const payload = consumeHandoff("pendingDraftIdeaId");  // atomic read+remove
if (payload) { /* … */ }
```

### Handoffs actifs (consumés au mount de `session.js`)

| Clé                          | Posé par                                       | Consommé par →                       |
| ---------------------------- | ---------------------------------------------- | ------------------------------------ |
| `pendingStartFlow`           | dashboard / new chat with a Playbook            | `startActionPickerFlow`              |
| `pendingDraftIdeaId`         | idea card "Draft post"                          | `askProfileQuestion` (`draft-flow`)  |
| `pendingAskSource`           | source card "Ask"                               | `askWhatToKnow`                      |
| `pendingAskConnector`        | connectors gallery / modal "Try in chat"        | `askConnector` (`connector-ask`)     |
| `pendingStartContextBuilder` | `/contexts` "New Playbook" + welcome-alt       | `context-builder` (création)         |
| `pendingStartPlaybookEditor` | `/contexts` card edit                           | `playbook-editor`                    |

## Navigation interne — patterns

### Côté code

```js
import { navigate } from "./router.js";

// changer de route
navigate("/contexts");

// avec query
setHashQuery("/session/abc", { tab: "ideas" });
```

### Côté HTML

Les liens utilisent `href="#/route"` :

```html
<a href="#/ideas" class="ap-button stroked">All ideas</a>
```

Et le router gère le hashchange naturellement (pas besoin de preventDefault sauf cas particulier).

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — lifecycle global de l'app
- [`STORES.md`](STORES.md) — comment les screens consomment les stores
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
