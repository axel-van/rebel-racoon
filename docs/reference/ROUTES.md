# Routes & navigation

Source de vérité : [`src/app.js`](../../src/app.js) (route table) + [`src/router.js`](../../src/router.js) (matcher).

## Route table

| Route                        | Handler                | Notes                                                                                                                                                                 |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | `dashboard.js`         | **Redirect-only** : first-time (`new-alt` mode) → `/welcome-alt` ; returning → most-recent session ou nouvelle session. Pas de UI propre.                             |
| `/session/:id`               | `session.js`           | La surface chat principale (le plus gros fichier du projet). Héberge le thread assistant, le composer, les flows per-session (intake, draft, clips).                  |
| `/contexts`                  | `contexts.js`          | Library **Playbooks** : cards (DO/DON'T, brief, color tag) + edit en side panel.                                                                                      |
| `/playbook/:id`              | `playbook.js`          | Page détail d'un Playbook. Topbar back → `/contexts`.                                                                                                                 |
| `/connectors`                | `connectors.js`        | Gallery des connectors (feature flag `connectors`, default OFF). Détail dans un modal.                                                                                |
| `/topics`                    | `topics.js`            | Feed des dossiers du listening. Filtres Playbook (`?pb=`) + Source. Flag `topics`, default OFF ; deep-link périmé → `/`.                                              |
| `/topics/settings`           | `topics-settings.js`   | **Topics settings** — les six sources d'écoute + la cadence, scopées à un Playbook (`?pb=`). Une page, pas un onglet : on la règle une fois. Topbar back → `/topics`. |
| `/topic-feeds`               | `research.js`          | Liste des **Topic feeds** (H1 « Topic feeds »). Flag `contentResearch`, défaut OFF ; deep-link périmé → `/`. Voir [`FEATURES.md`](FEATURES.md) §18.                   |
| `/topic-feeds/new`           | `research-form.js`     | Créer un stream : nom + Playbook + sources + cadence. **Déclarée AVANT `/topic-feeds/:id`** — `match()` rend la 1ʳᵉ route qui matche, et `:id` avalerait « new ».     |
| `/topic-feeds/:id/settings`  | `research-form.js`     | Le même écran en mode réglages. Topbar back → le stream, en gardant **son nom**.                                                                                      |
| `/topic-feeds/:id/attention` | `research-trending.js` | Les Topics flaguées (trending / updated) hors triage. Topbar back → le feed.                                                                                          |
| `/topic-feeds/:id`           | `research-feed.js`     | Le feed d'un stream : une liste groupée par âge + panneau article. `?fresh=1` joue le loader de génération (~1,6 s) ; le back du topbar l'omet délibérément.          |
| `/welcome-alt`               | `welcome-alt.js`       | Onboarding first-time. Redirige vers une session transitoire. Body en `.onboarding` (full-bleed).                                                                     |
| `/welcome-alt/recap`         | `welcome-alt-recap.js` | Recap final du Playbook construit pendant l'onboarding.                                                                                                               |

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
- `/topics?pb=ctx-…` — le feed **filtré** sur un Playbook
- `/topic-feeds/:id?fresh=1` — le feed **avec** le loader de génération. Posé par l'ouverture d'un stream depuis la liste et par le Save du formulaire ; jamais par le back du topbar (rejouer 1,6 s de faux fetch sur un retour est une punition).
- `/topics/settings?pb=ctx-…` — la page de réglages **scopée** au même Playbook. `?pb=` est une seule idée partagée par les deux surfaces ; seule la valeur absente diffère (feed → tous, réglages → le défaut ★). Obligatoire sur les réglages : sans lui, configurer B puis Retour montrerait A. Le back du topbar le remporte vers le feed.
- (autres possibles : `?tab=ideas`, `?tab=sources`, `?tab=clips`, etc.)

## Handoffs entre routes

`src/handoff.js` est un bridge à usage unique sur `sessionStorage`.

```js
import { setHandoff, consumeHandoff, hasHandoff } from "./handoff.js";

// avant de navigate
setHandoff("pendingDraftIdeaId", { ideaId: "i-42" });
navigate("/session/abc");

// dans le handler de la destination
const payload = consumeHandoff("pendingDraftIdeaId"); // atomic read+remove
if (payload) {
  /* … */
}
```

### Handoffs actifs (consumés au mount de `session.js`)

| Clé                          | Posé par                                                                    | Consommé par →                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pendingStartFlow`           | dashboard / new chat with a Playbook                                        | `startActionPickerFlow`                                                                               |
| `pendingDraftIdeaId`         | idea card "Draft post"                                                      | `askProfileQuestion` (`draft-flow`)                                                                   |
| `pendingAskSource`           | source card "Ask"                                                           | `askWhatToKnow`                                                                                       |
| `pendingAskConnector`        | connectors gallery / modal "Try in chat"                                    | `askConnector` (`connector-ask`)                                                                      |
| `pendingTopicChat`           | topic card / dialog "Start a chat"                                          | `startTopicChat` (`topic-flow`)                                                                       |
| `pendingBriefChat`           | « Use in chat » d'une Topic (carte, footer du panneau, modal Past versions) | `attachBriefToChat` (`brief-flow`) — porte `briefId` **+ `versionId`** quand c'est une version passée |
| `pendingStartContextBuilder` | `/contexts` "New Playbook" + welcome-alt                                    | `context-builder` (création)                                                                          |
| `pendingStartPlaybookEditor` | `/contexts` card edit                                                       | `playbook-editor`                                                                                     |

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
<a href="#/contexts" class="ap-button stroked">All playbooks</a>
```

Et le router gère le hashchange naturellement (pas besoin de preventDefault sauf cas particulier).

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — lifecycle global de l'app
- [`STORES.md`](STORES.md) — comment les screens consomment les stores
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
