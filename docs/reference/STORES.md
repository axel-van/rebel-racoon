# Stores & state management

Pas de librairie externe (Redux, Zustand, etc.). Le proto a son propre pattern minimaliste documenté ici.

## Pattern de base

Chaque store suit cette structure :

```js
import { createNotifier } from "./store-utils.js";

const state = new Map();           // sessionId → state (ou un array pour un catalogue)
const { subscribe, notify } = createNotifier("storeName");

function seed(sessionId) {
  // lazy seed depuis mocks.js, sauf en mode new-alt
  if (isNewUser()) return emptyState();
  return mocks.byId(sessionId) ?? emptyState();
}

function get(sessionId) {
  if (!state.has(sessionId)) state.set(sessionId, seed(sessionId));
  return state.get(sessionId);
}

export function getX(sessionId)   { return get(sessionId).x; }
export function setX(sessionId, x) {
  state.get(sessionId).x = x;
  notify({ sessionId });          // shallow notify
}
export { subscribe };
```

Voir [`src/store-utils.js`](../../src/store-utils.js) pour `createNotifier()`.

## Catalogue des stores

| Store                                           | Domaine                                                          | API publique principale |
|------------------------------------------------|------------------------------------------------------------------|-----------------------|
| [`sessions-store.js`](../../src/sessions-store.js)         | Sessions de chat                                                 | `getSessions`, `getSessionById`, `updateSession`, `deleteSession`, `togglePin`, `subscribe` |
| [`contexts-store.js`](../../src/contexts-store.js)         | Playbooks (Contexts en code)                                    | `getContexts`, `getContextById`, `getDefaultContext`, `addContext`, `updateContext`, `duplicateContext`, `deleteContext`, `subscribe` |
| [`connectors-store.js`](../../src/connectors-store.js)     | Catalogue + état de connection des connectors                   | `getConnectors`, `findConnector`, `getConnectedConnectors`, `setConnectorStatus`, `subscribe` |
| [`library.js`](../../src/library.js)                       | Ideas per-session (sources delegate to `sources-stream`)        | `getSources(sid)`, `getIdeas(sid)`, `appendExtractedIdeas`, `injectIdeasForSource`, `extractVideoIdeas`, `removeIdeas`, `subscribe(sid, fn)` |
| [`posts-store.js`](../../src/posts-store.js)               | Drafts per-session                                              | `getPosts(sid)`, `addPostDraft`, `updatePostContent`, `attachImageToDraft`, `removePost`, `subscribe(sid, fn)` |
| [`assistant.js`](../../src/assistant.js)                   | Thread conversationnel per-session                              | `getThread`, `sendMessage`, `sendConnectorMessage`, `postAssistantMessage`, `postSystemNotice` / `markSystemNoticeReady`, `postSourceIntake`, `postExtractionResult`, `postAssistantChoice` / `submitAssistantChoice`, `postDraftResult`, `subscribe(sid, fn)` |
| [`sources-stream.js`](../../src/sources-stream.js)         | **Global** : uploads + sources state machine (uploading → processing → done) | `getSources`, `getUploads`, `subscribeSources`, `subscribeUploads`, `startFileUpload`, `startUrlImport`, `startConnectorImport`, `extractClipsForSource`, `removeSources`, `renameSource` |
| [`schedule-store.js`](../../src/schedule-store.js)         | Queue des posts schedulés (calendrier)                          | `getQueue`, `getQueueOn`, `addToQueue`, `removeFromQueue`, `busyCountsByDay`, `subscribe` |
| [`composer-mentions.js`](../../src/composer-mentions.js)   | Mentions @ dans le composer per-session                         | `addMention`, `removeMention`, `renderInto`, `subscribe(sid, fn)` |

## Le seul global : `sources-stream`

Tous les autres stores sont per-session (Map<sessionId, state>). `sources-stream` est **global** parce que les sources sont partagées entre sessions. `library.js` re-émet par session pour que les écrans abonnés à `library.subscribe(sid)` repaint quand une source landed.

Conséquence : si tu ajoutes une source depuis la session A, la library de la session B verra aussi cette source (si elle est listée dans son periphery — selon la sélection).

## Persistence

**Rien n'est persisté côté app state.** Seuls survivent au reload :

| Clé localStorage / sessionStorage | Domaine |
|---|---|
| `archie-user-mode` | `"returning"` vs `"new-alt"` (cf. `user-mode.js`) |
| `ff-{flagName}` | Feature flags individuels (cf. `feature-flags.js`) |
| Sidebar collapse state | UI prefs |
| `pending*` keys | Handoffs sessionStorage (consommés une fois) |

→ Refresh = retour aux mocks (sauf si en `new-alt` mode = state vide).

## User mode + feature flags

```js
import { getUserMode, isNewUser, isNewUserAlt } from "./user-mode.js";
import { isFlagOn } from "./feature-flags.js";

if (isNewUser()) seedEmpty();
if (isFlagOn("connectors")) showConnectorsNav();
```

- [`src/user-mode.js`](../../src/user-mode.js) — `"returning"` (default, populated mocks) ou `"new-alt"` (empty + onboarding)
- [`src/feature-flags.js`](../../src/feature-flags.js) — get/set, store dans localStorage
- [`src/ff-catalog.js`](../../src/ff-catalog.js) — catalogue avec defaults

Switch UI : `/settings → Admin` (un reload est forcé pour que les stores re-seedent).

## Invariants

### 1. Subscribers ne fail jamais le notifier

`createNotifier()` wrappe chaque subscriber dans un `try/catch` et `console.warn` en cas d'erreur. Un subscriber broken ne tue pas les autres.

### 2. Pas de couplage entre stores

Aucun store n'importe un autre store directement. Les flow orchestrators (`draft-flow.js`, `context-builder.js`, etc.) sont les seuls à composer plusieurs stores.

Exception : `library.js` subscribe à `sources-stream` pour re-émettre per-session — c'est OK car c'est une mécanique de fan-out documentée.

### 3. Lazy seed

Un store ne crée jamais d'entrée pour une sessionId tant que `getX(sid)` n'a pas été appelée. Évite la fuite si on liste 100 sessions dans la sidebar mais qu'on n'en ouvre qu'une.

## Singleton warning {#singleton-warning}

Le système `?v=N` du cache-bust **rend deux imports avec versions différentes équivalents à deux modules séparés**. Conséquence :

```js
// fichier A.js
import { getSessions } from "./sessions-store.js?v=12";  // instance #1

// fichier B.js
import { getSessions } from "./sessions-store.js?v=13";  // instance #2 — !!
```

Les deux instances ont leurs propres `state` Map et `subscribers` Set. **Bumper un store impose de bumper en lockstep dans tous les importeurs.**

`scripts/bump-cache.py` automatise ce bump. À utiliser systématiquement.

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — patterns de composants + screens
- [`ROUTES.md`](ROUTES.md) — comment les screens montent/démontent leurs subscriptions
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire (Session, Playbook, Source, Idea, Draft)
