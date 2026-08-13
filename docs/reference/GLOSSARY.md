# Glossaire produit

> Vocabulaire à jour. Source de vérité pour résoudre les ambiguïtés (en particulier l'incohérence Context ↔ Playbook).

## Le pipeline canonique

```
Source  →  Idea  →  Draft  →  Schedule
(input)    (insight) (post)    (calendar slot)
   ▲
   ├── Topic             (optionnel, en amont — flag `topics`)
   └── Idea (d'un stream) (optionnel, en amont — flag `contentResearch`)
```

1. **Source** — un input brut (PDF, URL, vidéo, audio, video clip, ou une réponse de connecteur). Stocké global cross-session dans `sources-stream.js`.
2. **Idea** — un insight extrait d'une source par Archie.
3. **Draft** — un post généré depuis une (ou plusieurs) idea(s), pour un réseau spécifique (LinkedIn, X, …).
4. **Schedule** — un draft posté dans le queue du calendrier.

En amont, **optionnellement** : un **Topic** ou une **Idea d'un stream**. Les deux entrent dans le pipeline comme **Source**. Une Idea de pipeline peut toujours venir directement d'une Source.

> ⚠️ **« Idea » nomme deux objets.** L'Idea du pipeline (extraite d'une source, panneau de droite, `library.js`, `idea-card`) et l'Idea d'un **Idea stream** (Content Ideas, `briefs-store`, `brief-card`). Les deux sont visibles par l'utilisateur : **nommer la surface** dès que l'un ou l'autre est possible — « une Idea de ce stream », jamais un « Idea » nu. En code ils ne se touchent jamais : stores, modules de carte et routes différents.

### Topic

Un **Topic** est un dossier qu'Archie assemble à partir du listening Agorapulse : une **accroche** (le constat), une **analyse écrite**, et les **posts sources** qui la fondent. Il est rattaché à un Playbook (`contextId`) et à la source de listening qui l'a produit (`sourceId`, voir `topics-catalog.js`).

| Champ                | Rôle                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `headline`           | Le constat — titre de la carte **et** de la dialog                         |
| `analysisTitle`      | Le titre au-dessus de l'analyse                                            |
| `summary`            | Le paragraphe clampé sur la carte                                          |
| `analysis[]`         | Les paragraphes de prose                                                   |
| `posts[]`            | Les **source posts** — les publications d'autrui qui servent de preuve     |
| `ageDays`            | **La** source de vérité de l'âge : groupe le feed et dérive chaque libellé |
| `unseen` `dismissed` | Badge de la sidebar / masqué du feed (jamais supprimé, pour l'Undo)        |

Terme **UI et code identiques** : `topic`, `topics-store`, `topicId`. C'est désormais le **seul** objet appelé Topic dans l'UI : Content Ideas, qui appelait ses cartes des Topics, dit **Idea** depuis le renommage (voir plus bas). `topic` reste **banni comme synonyme d'Idea** (voir [`../copy/copy-principles.md`](../copy/copy-principles.md)) — un Topic est un objet distinct, en amont. Ne pas dire **dossier** dans l'UI (tournure française, et ça collisionne avec `folders-store`).

Deux actions, pas plus : **Start a chat** (le topic entre dans le chat comme Source, donc tout le pipeline existant s'allume) et **Dismiss**. Voir [`FEATURES.md`](FEATURES.md) §17.

### Idea stream + Idea (Content Ideas)

Un **Idea stream** est une **requête permanente nommée** : un Playbook × un jeu de sources × une cadence. Archie y dépose des **Ideas** : une accroche, un résumé, un article complet (avec ses versions successives) et les posts sociaux qui la fondent, chacune triée **New / Saved / Used / Ignored** et éventuellement flaguée **Trending** ou **Updated**.

| UI            | Code                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| Content Ideas | `research-*` (`/content-ideas`, `research-store`, `screens/research-*.js`)      |
| Idea stream   | **lane** (`laneId`, `getLanes`, `research-store.js`)                            |
| Idea          | **brief** (`briefs-store.js`, `brief-card.js`, `data-brief-*`, `.topics-*` CSS) |

Le split UI/code est le même que Playbook/Context, avec une contrainte de plus : `briefs-store` **ne peut pas** être renommé `topics-store`, qui est la feature ci-dessus. Les classes CSS sont `.topics-*` au pluriel pour la même raison — `.topic-card` au singulier appartient déjà au dossier de listening.

Une Idea offre trois actions : **Use in chat** (elle entre comme Source, comme un Topic), **Save for later**, **Ignore Idea**. Voir [`FEATURES.md`](FEATURES.md) §18.

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

### Idea du pipeline (kind taxonomy)

Celle-ci, pas celle d'un Idea stream (voir plus haut). Une idée est typée selon une de ces 5 kinds :

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

**Feature flag `connectors`** : default OFF. Activable dans le **popover ⚙️ Admin de la sidebar** (`admin-menu.js`) — il n'y a plus de route `/settings`.

### User mode (proto control)

`localStorage.getItem("archie-user-mode")` :

- `"returning"` (default) — stores seedent depuis `mocks.js`, expérience d'un utilisateur établi
- `"new-alt"` — stores vides, force le redirect `/` → `/welcome-alt` (onboarding)

Switch UI : **popover ⚙️ Admin de la sidebar**. Un reload est forcé pour que les stores re-seedent.

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
