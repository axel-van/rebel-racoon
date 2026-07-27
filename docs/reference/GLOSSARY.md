# Glossaire produit

> Vocabulaire à jour. Source de vérité pour résoudre les ambiguïtés (en particulier l'incohérence Context ↔ Playbook).

## Le pipeline canonique

```
Source  →  Finding  →  Idea  →  Draft  →  Schedule
(input)    (research)  (insight) (post)    (calendar slot)
```

1. **Source** — un input brut (PDF, URL, vidéo, audio, video clip, ou une réponse de connecteur). Stocké global cross-session dans `sources-stream.js`.
2. **Finding** — un constat de recherche sourcé, rapporté par un scan récurrent (flag `research`). Global, taggé par Playbook, dans `research-store.js`. Optionnel dans le pipeline : une Idea peut venir directement d'une Source.
3. **Idea** — un insight extrait d'une source par Archie (Hook, Stat, Quote, Story, Insight). Per-session, mais re-mineable.
4. **Draft** — un post généré depuis une (ou plusieurs) idea(s), pour un réseau spécifique (LinkedIn, X, …).
5. **Schedule** — un draft posté dans le queue du calendrier.

## Concepts clés

### Session = Chat = Conversation

Une **session** est un fil de conversation avec Archie. Tous synonymes :

- "Session" (préféré dans le code, store `sessions-store.js`)
- "Chat" (label UI sidebar : "Chats")
- "Conversation" (label UI prod prod)

Chaque session a son propre thread (`assistant.js`), ses ideas (`library.js`), ses drafts (`posts-store.js`), ses mentions composer (`composer-mentions.js`).

### Playbook = Context (vocabulary leak)

⚠️ **Le proto a un héritage** : le code, les stores, les IDs, les noms de fichier utilisent **`Context`** :

- Store : `contexts-store.js` (`getContextById`, `addContext`, …)
- IDs : `ctx-acme`, `ctx-founder-voice`, …
- Variables : `contextId`, `contextBuilder`, `defaultContext`, …
- Route : `/contexts`

L'UI **devrait** utiliser **`Playbook`** partout (label canonique) mais en pratique des labels "Context" leaké dans l'UI :

- Topbar title sur `/contexts` : "Contexts"
- Sidebar nav item : "Contexts (N)"
- Header du Playbook editor : "Contexts"
- Settings → section : "Contexts"
- CTAs : "+ New context"

Cf. [`../audits/PROD-CHANGES.md`](../audits/PROD-CHANGES.md) §P0-1 pour le plan de fix.

**Règle de comm** : dans les nouveaux écrans / nouveau copy, **toujours dire "Playbook"** dans l'UI. Ne pas renommer le code (refactor plus large).

### Source

Un **Source** est tout input brut qu'Archie peut ingérer :

| Kind          | Origin               | State machine                 |
| ------------- | -------------------- | ----------------------------- |
| PDF           | Upload file          | uploading → processing → done |
| URL           | URL import           | importing → processing → done |
| Video         | Upload file          | uploading → processing → done |
| Audio         | Upload file          | uploading → processing → done |
| Video Clip    | Extracted from video | extracting → done             |
| Connector doc | Connector query      | querying → done               |

Géré par [`src/sources-stream.js`](../../src/sources-stream.js) — le seul store global.

### Finding

Un **constat de recherche** : ce qu'un scan récurrent des sources de recherche rapporte. Produit **en amont** des Ideas — accepter un finding injecte ses `ideaSeeds` dans la library d'un chat.

| Champ         | Rôle                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `headline`    | Le constat, en une phrase affirmative                                             |
| `summary`     | 2 lignes (clampées sur la carte du feed)                                          |
| `synthesis[]` | L'argument long, lu dans le modal « Read the research »                           |
| `posts[]`     | Les **source posts** — les publications d'autrui qui servent de preuve            |
| `ideaSeeds[]` | Ce que le finding devient : 2-3 Ideas pré-écrites                                 |
| `sourceId`    | La source de recherche qui l'a produit (voir `research-catalog.js`)               |
| `contextId`   | Le Playbook pour lequel il a été produit                                          |
| `dedupeKey`   | Identité stable entre scans — c'est **là-dessus** que porte la mémoire des rejets |
| `status`      | `new` → `seen` → `used` \| `dismissed`                                            |

**Termes à ne pas utiliser** : `brief` (réservé au sous-élément du Playbook), `signal` (banni comme nom), `insight` (c'est un _kind_ d'Idea), `alert`.

**Feature flag `research`** : default OFF. Activable dans le popover Admin (cog de la sidebar).

### Idea (kind taxonomy)

Une idée est typée selon une de ces 5 kinds :

| Kind        | Description                                     |
| ----------- | ----------------------------------------------- |
| **Hook**    | Un angle / une accroche qui peut ouvrir un post |
| **Stat**    | Un chiffre, une mesure                          |
| **Quote**   | Une citation extraite du contenu source         |
| **Story**   | Une anecdote, un récit                          |
| **Insight** | Une conclusion analytique                       |

Champ optionnel : `potential` (High / Medium / Low) — heuristique de priorité.

### Draft

Un **Draft** est un post candidat pour un réseau social. Stocké dans [`posts-store.js`](../../src/posts-store.js).

Status pipeline (mocké) :

- `generating` — en train d'être créé
- `draft ready` — prêt à reviewer
- `needs fixes` — Archie a flagué un problème (placeholder en proto)
- `scheduled` — dans le queue calendrier

### Network = Channel = Social

| Term               | Usage                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Network**        | Label UI (LinkedIn, X, Instagram, …) — préféré côté UI                                |
| **Channel**        | Variant historique parfois encore dans le code                                        |
| **Social account** | Le compte concret connecté pour publier — distinct de la liste des networks supportés |

Voir `social-profiles.js` (catalogue des comptes connectés).

### Connector

Une **source live MCP-queryable** (Notion, Slite, Google Drive, Slack, …) que Archie peut interroger en chat. Différent d'une source statique parce que :

- Elle est connectée une fois, puis disponible cross-session
- Une requête déclenche un round-trip MCP simulé (reasoning chip "Querying X via MCP" + réponse citée)
- Géré par [`connectors-store.js`](../../src/connectors-store.js), state machine `connected / disconnected / syncing / error`

**Feature flag `connectors`** : default OFF. Activable dans `/settings → Admin`.

### User mode (proto control)

`localStorage.getItem("archie-user-mode")` :

- `"returning"` (default) — stores seedent depuis `mocks.js`, expérience d'un utilisateur établi
- `"new-alt"` — stores vides, force le redirect `/` → `/welcome-alt` (onboarding)

Switch UI : `/settings → Admin`. Un reload est forcé pour que les stores re-seedent.

## Vocabulaire UI à éviter

| Mauvais                           | Bon                                 | Pourquoi                                                                                |
| --------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| "Context" (UI label)              | "Playbook"                          | Label canonique, voir plus haut                                                         |
| "Archie did X"                    | "I did X"                           | Archie parle en 1ère personne                                                           |
| "AI-powered", "magic", "seamless" | concret                             | voir [`../copy/copy-principles.md`](../copy/copy-principles.md) — voice anchor = Linear |
| "Project"                         | "Session" / "Chat" / "Conversation" | "Project" est un terme historique probable-spoon, supprimé                              |
| "Composer"                        | "Archie"                            | "Composer" était un nom interne pré-rebrand                                             |
| "Studio"                          | "Archie" (proto) / "Studio" (prod)  | "Studio" est le label prod côté Agorapulse — le proto reste "Archie standalone"         |

## Voir aussi

- [`../copy/copy-principles.md`](../copy/copy-principles.md) — voice, tone matrix, glossaire éditorial
- [`../audits/PROD-VS-PROTOTYPE.md`](../audits/PROD-VS-PROTOTYPE.md) — différences vocabulaire prod vs proto
- [`STORES.md`](STORES.md) — comment ces concepts sont matérialisés en stores
