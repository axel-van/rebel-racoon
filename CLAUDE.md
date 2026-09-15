# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive prototype for exploring and validating Agorapulse UI redesigns — specifically **Archie**, an AI content assistant (sources → ideas → drafts → schedule). No build step, no bundler — static ES modules served locally. The codebase mixes English (code, UI copy) and French (some comments). Archie speaks in the first person ("I", "Let's") — never third-person "Archie" — in user-facing copy.

## Before you build a feature — read the docs

`docs/` is not background reference: it records decisions that were argued, shipped, and in several cases **reverted**. Designing here without reading it means re-proposing something that was already tried and removed — which is the single most common failure mode on this repo.

**Whenever a request adds, moves, or changes a feature** — a screen, a section, a field, a control, a flow — read these BEFORE proposing anything:

1. **[`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md)** — what each object IS and where its boundary sits. It settles _"which entity does this thing belong to?"_, the question most rejected designs here got wrong.
2. **[`docs/reference/FEATURES.md`](docs/reference/FEATURES.md)** — the § covering the surface you're touching, so you extend what exists instead of building a parallel version beside it.
3. Then the doc for the dimension in play:

| You're touching…                      | Read                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| a Playbook field or section           | [`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1 + [`FEATURES.md`](docs/reference/FEATURES.md) §9           |
| anything in the Topic Feed            | [`FEATURES.md`](docs/reference/FEATURES.md) §17 + [`specs/AC-TOPIC-FEED.md`](docs/specs/AC-TOPIC-FEED.md) |
| any HTML/CSS                          | [`DESIGN-SYSTEM.md`](docs/reference/DESIGN-SYSTEM.md) + [`UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md) |
| a new route or screen                 | [`ROUTES.md`](docs/reference/ROUTES.md) + [`ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md)             |
| state that has to live somewhere      | [`STORES.md`](docs/reference/STORES.md)                                                                   |
| user-facing copy                      | [`copy-principles.md`](docs/copy/copy-principles.md) + [`GLOSSARY.md`](docs/reference/GLOSSARY.md)        |
| sidebar / right-panel sizing behavior | [`PANEL-SIDEBAR-RULES.md`](docs/reference/PANEL-SIDEBAR-RULES.md)                                         |

Then say, in the proposal itself: **which object the feature attaches to, and why it belongs there** rather than on a neighbour. If a doc contradicts what you were about to build, the doc wins until the user overrules it — and when the user does overrule it, update the doc in the same commit.

**The three arbitrations that keep coming back** (each already cost a revert):

- **A settings surface must not aggregate** — config lives on the entity that owns it, or on a route scoped to one feature. Never a global settings page (§ below).
- **A Playbook is an identity sheet, not a container** — no produced content, no metrics, no operational config ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1).
- **Never invent a component, token, or icon the DS already ships** (§ Design System).

## Running the prototype

```bash
npm install   # installs the DS packages and syncs ds/ via the postinstall sync-ds script
npm start     # runs `npx serve -p 8000` — open http://localhost:8000
```

With Claude Code the dev server auto-launches via `.claude/launch.json` (server name `archie`, runs `python3 -m http.server`). There is **no test suite**; verify changes by running the app (see the verify/run skills) and the `ds-css` MCP `validate_css`.

## Architecture

**Vanilla JS only** — no build step, no bundler, no framework, no external runtime deps. A hash-based router (`src/router.js`) renders the matched route into `#app` on every `hashchange`. The persistent app shell (sidebar + topbar + right panel) lives outside `#app` and is updated by subscriptions. Each screen, modal, and component owns its own DOM and uses **pure event delegation** with `data-*` attributes.

### App shell

`index.html` is the only HTML entry point (~50 lines). It mounts the shell — `#sidebar`, `#topbar`, `#app`, `#toastRegion` — and loads every stylesheet + `src/app.js`. `app.js` registers the routes, calls each component's `init()` (which injects that component's DOM into `<body>` once), and calls `start()`. The right panel and all modals inject themselves on `init()`.

### Routes (declared in `src/app.js`)

| Route                | Screen                 | Notes                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | `dashboard.js`         | Redirect, and nothing else (first-time → `/welcome-alt`, returning → most-recent session **in scope**). Still renders nothing: `/` is the active **brand's** home, `/home` is the **account's**                                                                                     |
| `/session/:id`       | `session.js`           | The main chat surface (largest file); hosts the assistant thread, composer, and per-session flows                                                                                                                                                                                   |
| `/home`              | `home.js`              | The account **HOME** (flag `playbookWorkspace`): a hero (prompt + Playbook picker + Send) over two tabs — Chats (every chat, all brands; the default) and Playbooks (the catalogue, each card a door into its workspace). Account scope, no rail. Flag OFF the route bounces to `/` |
| `/contexts`          | `home.js`              | The **Playbooks** library. In workspace mode it `replace`s to `/home` (the catalogue is that page's Playbooks tab), so every stale deep link still lands; flag OFF it renders the library exactly as before                                                                         |
| `/playbook/:id`      | `playbook.js`          | Playbook detail page (topbar back → `/contexts`)                                                                                                                                                                                                                                    |
| `/connectors`        | `connectors.js`        | Connectors gallery (marketplace); detail opens in a modal (gated by the `connectors` flag)                                                                                                                                                                                          |
| `/topics`            | `topics.js`            | **Topic Feed** — the triage queue: list + article side by side, scoped to ONE Playbook via `?pb=` (flag `topicFeed`)                                                                                                                                                                |
| `/topics/settings`   | `topics-settings.js`   | **Feed settings** — the eight listening sources + cadence for one Playbook (`?pb=`); topbar back                                                                                                                                                                                    |
| `/welcome-alt`       | `welcome-alt.js`       | First-time onboarding kickoff (thin redirect into a transient session)                                                                                                                                                                                                              |
| `/welcome-alt/recap` | `welcome-alt-recap.js` | Onboarding recap reveal of the built Playbook                                                                                                                                                                                                                                       |

There is **no `/settings` route** — it was removed. The prototype Admin controls (user mode + feature flags + docs link) now live in the sidebar footer cog popover (`admin-menu.js`, rendered by `sidebar.js`); the old Social-accounts page was dropped (`social-profiles.js` remains as a shared helper).

`setAfterRender` (in `app.js`) re-renders the sidebar + conversation-status-card after every route change and toggles the `body.onboarding` full-bleed class for the welcome-alt flow.

> **Vocabulary:** a saved AI context is a **Playbook** (UI label) but the code/store calls it a **Context** (`contexts-store`, `contextId`). Source → Idea → Draft (post) → Schedule is the content pipeline; a **Topic** (`topics-store`, flag `topicFeed`) is an optional step upstream of it. `topic` stays banned as a synonym for **Idea** — a Topic is its own object.

### Source layout

```
src/
  app.js                — entry: imports + route table + init() calls + start()
  router.js             — hash router (route() / navigate() / getPath() / start())
  url-state.js          — parseHashParams() / setHashQuery() (hash query params)
  handoff.js            — single-use sessionStorage bridge across navigations
  utils.js              — html`` / raw() tagged-template helpers + escapeHtml (html`` escapes by default)
  store-utils.js        — createNotifier() subscribe/notify primitive used by stores
  user-mode.js          — "returning" vs "new-alt" mode (localStorage: archie-user-mode)
  feature-flags.js      — flag get/set (localStorage); ff-catalog.js is the flag list
  org.js                — CONFIG: who I am, my org, its members, my role (localStorage: archie-org-role)
  active-playbook.js   — the ACTIVE Playbook: the app-wide scope behind the flag
                          `playbookWorkspace` (localStorage: archie-active-playbook), plus the
                          three functions every scoped surface reads — isWorkspaceMode() /
                          playbookForNewWork() / scopeSessions() — and isAccountScope(path),
                          which marks the routes that live ABOVE the workspaces. Insights
                          reads it flag or no flag.
  playbook-access.js    — who may view/use/edit/share a Playbook; the store never filters
  file-kinds.js         — source kind → DS icon class
  figma-capture.js      — ?openModal= / ?openPanel= deep links for the Figma screen capture
  archie-loader.js      — swaps every spinner in the app for the animated Archie mark
  mocks.js              — barrel over mocks/ — the single import path for seed data
  mocks/                — ALL seed data, one file per domain: sessions, top-posts,
                          sources, ideas, playbooks, topics, posts, threads,
                          schedule, connectors, social. Self-contained: no file
                          under mocks/ reads a sibling.
  image-studio.js       — Image Studio state engine (UI-agnostic) + all its mocks
  image-studio-canvas.js — pure canvas helpers: bake / crop / text metrics

  # Stores (per-session Map + subscribers, seed from mocks unless new-alt mode)
  sessions-store.js     — chat sessions list (pin / rename / delete)
  contexts-store.js     — Playbooks (Contexts)
  connectors-store.js   — connectors list + connection state (the only "catalog" store)
  library.js            — per-session ideas; getSources() delegates to sources-stream
  posts-store.js        — per-session drafts
  assistant.js          — per-session conversational thread (turns, reasoning chips, MCP query)
  sources-stream.js     — sources PER SESSION + global uploads + processing state machine
  schedule-store.js     — scheduled-post queue (calendar)
  topic-feeds-store.js  — GLOBAL: one listening feed per Playbook (flag `topicFeed`)
  topics-store.js       — GLOBAL: the Topics + the triage, in two separate structures
  topics-catalog.js     — the eight listening sources, cadences, kinds, review
                          statuses, signals (CONFIG, like ff-catalog)
  composer-mentions.js  — per-session @mention pills in the composer
  composer-connector.js — composer's "Connected sources" submenu (feature-flagged)

  # Conversational flow orchestrators (drive the assistant thread + pickers)
  draft-flow.js         — "Draft post from idea" turn sequence (channel pick → execute → result)
  draft-rewrite.js      — regenerate-a-draft (thinking → streaming → commit)
  context-builder.js    — Playbook creation/edit conversation (drives welcome-alt + edits)
  playbook-view.js      — shared Playbook render engine (recap + detail)
  context-mock-analysis.js — deterministic mock "website analysis" for onboarding
  sidebar-wizard.js     — multi-stage numbered-option wizard inside the assistant panel
  inline-question.js    — one-shot numbered-option picker inside the assistant panel
  library-actions.js    — shared bulk-bar (Extract/Delete) + click dispatch for content lists
  social-profiles.js    — connected social accounts (source of truth for profile pickers)
  clip-formats.js        — video aspect-ratio catalog
  connectors-view.js    — shared pure render helpers for the connectors gallery + detail
  connector-ask.js      — launches the in-chat "Ask a connector" flow (gallery + right panel)
  topic-article.js      — ONE article renderer: the feed's pane, the picker, the in-chat dialog
  topic-flow.js         — Use in chat: mark Used, then a new chat with the Topic as a Source;
                          plus the composer's INLINE picker (startTopicPickerInline)

  # Studios (full-panel takeovers) + newer surfaces (not exhaustive — see docs/reference/FEATURES.md)
  batch-studio.js       — batch-of-posts studio (upload/analyse → review)
  clip-studio.js        — full-screen video clip extraction + editing studio
  top-posts-flow.js / top-posts-store.js — published-posts "winners" board + repurpose entry
  folders-store.js      — save-to-folder store; feedback-store.js — feedback submissions
  languages.js          — language catalog for multilingual Playbooks
  url-services.js       — recognises a service (Notion/Google Docs/…) from a pasted URL
  admin-menu.js         — sidebar cog Admin popover (user mode + feature flags + docs)
  caption-editor.js     — the clip caption editor (word marks, drag handles, presets)
  clip-captions.js      — caption preset catalog + the mock transcript they render
  clip-subtitles.js     — the subtitle-style picker's rendered samples

  screens/
    dashboard.js, session.js, home.js, playbook.js,
    connectors.js, topics.js, topics-settings.js,
    welcome-alt.js, welcome-alt-recap.js
      home.js             — the account home (flag `playbookWorkspace`) AND the Playbooks
                            catalogue, one module, two gated routes (/home + /contexts).
                            Its classes + stylesheet still say `contexts` on purpose.
    _analyse-common.js  — shared "chat bubble + numbered picker bar" wizard primitives
    session/
      intake-lifecycle.js — flips source-intake turns loading→ready as sources process
      thinking-chip.js    — animated "thinking…" composer chip + elapsed/credit counter
      thread-turns.js     — renders each assistant-thread turn type
      wizard-keyboard.js  — keyboard nav (↑↓ / 1–9 / Enter / Esc) for the picker
      clip-draft-flow.js  — "draft from clips" picker (ratio → subtitles → accounts → generate) + clipContext; the only external caller (right-panel) imports THIS, not the whole session screen

  components/             — each exports init() (injects DOM once) + render/open()
    topbar.js             persistent header: route title (rename on session) +
                          Sources / Ideas / Drafts pills + status-card toggle; back on /playbook
    sidebar.js            left rail: brand, the Playbook switcher (flag `playbookWorkspace`),
                          New chat, Search, Playbooks / Connectors / Topic Feed nav
                          (under the flag: `Playbook`, singular, = the active brand's fiche),
                          recent chats (pin/rename/delete + Sort & group), footer popmenu (feedback/bug/shortcuts + Admin menu)
    right-panel.js        sliding panel — modes: drafts / ideas / sources / clips / context-brief
    conversation-status-card.js  floating in-progress card (sources/ideas/drafts counts)
    content-workspace.js  shared Sources+Ideas library layout (search / sort / By Source / All Ideas)
    source-card.js, idea-card.js, idea-card-compact.js, post-card.js, clip-card.js, empty-state.js
    topic-card.js         one Topic: the feed's card, the picker's card, the in-chat row
    starter-card.js       one workflow starter, two hosts: the new chat's hero + the account home
    social-post-card.js   someone ELSE's published post, as evidence (not top-post-card)
    top-post-card.js      MY published post that performed — the Repurpose board's card
    more-menu.js          installMoreMenu(): the shared ⋯ popover on source / idea / clip cards
    dropzone.js           bindDropzone(): a dashed target that really accepts a drop
    tooltip.js            document-delegated [data-tooltip] — no per-screen wiring
    feedback-control.js   the thumbs + reasons row under anything Archie generated
    toast.js              showToast() snackbar (DS .ap-snackbar)
    shortcut-legend.js    ? key dialog
    # Modals (init → open → close, coordinated by modal-coordinator.js):
    add-source-modal.js   Upload / URL / Connectors tabs
    connectors-modal.js   connectors gallery + detail overlay (from composer Add / Sources panel / page)
    topic-picker-modal.js one dialog, two views — the picker's list, and the article
    topic-ignore-modal.js "Why did this Topic miss the mark?" — the reason, kept
    skip-connect-modal.js "Skip connecting an account?" — reassures, then asks why
    topic-history-modal.js the Topic's two-sided trail: the scan's, then the reader's
    video-clips-modal.js, schedule-modal.js,
    bug-report-modal.js, feedback-modal.js, chat-picker-modal.js,
    confirm-modal.js, rename-modal.js, search-modal.js,
    save-folder-modal.js, analyze-profiles-modal.js, fill-document-modal.js,
    share-playbook-modal.js  personal ⇄ org scope + owner + change log (flag)
    image-studio-v2/      the Image Studio, split by subject (see FEATURES §7 / §7bis):
                          index (lifecycle) · events · commit · inline-text · prompt-guard ·
                          stage-view (shell) · setup-stage (Generate: options + preview) ·
                          settings-view · references-view · branding-view ·
                          brief-blocks · preview-column ·
                          composer-view (Edit only) · tools-view · edit-view ·
                          interactions · context · type-art / style-art (the 9 drawn option previews)

  modal-coordinator.js    one-overlay-at-a-time: requestOpen / notifyClose / bindOverlayDismissal
```

### State management

**No external store library.** Stores follow one pattern: a module-level `Map(sessionId → state)` (or a single array for catalogs) plus a `Set<fn>` of subscribers notified shallowly on each mutation, built with `createNotifier()` from `store-utils.js`. State seeds lazily from `mocks.js` on first read — **or stays empty in `new-alt` mode** (`isNewUser()`).

| Store                  | Domain                                                                                 | Key public API                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions-store.js`    | chat sessions                                                                          | `getSessions`, `getSessionById`, `updateSession`, `deleteSession`, `togglePin`, `subscribe`                                                                                                                            |
| `contexts-store.js`    | Playbooks (+ `ownerId`/`scope`/`history` behind `playbookSharing`) — **never filters** | `getContexts`, `getContextById`, `getDefaultContext`, `addContext`, `updateContext`, `duplicateContext`, `deleteContext`, `appendHistory`, `subscribe`                                                                 |
| `connectors-store.js`  | connectors catalog + state                                                             | `getConnectors`, `findConnector`, `getConnectedConnectors`, `setConnectorStatus`, `subscribe`                                                                                                                          |
| `library.js`           | per-session ideas (sources delegate to sources-stream)                                 | `getSources(sid)`, `getIdeas(sid)`, `appendExtractedIdeas`, `injectIdeasForSource`, `extractVideoIdeas`, `removeIdeas`, `subscribe(sid, fn)`                                                                           |
| `posts-store.js`       | per-session drafts                                                                     | `getPosts(sid)`, `addPostDraft`, `updatePostContent`, `attachImageToDraft`, `attachCarouselToDraft`, `removePost`, `subscribe(sid, fn)`                                                                                |
| `assistant.js`         | per-session thread                                                                     | `getThread`, `sendMessage`, `sendConnectorMessage`, `postAssistantMessage`, `postSourceIntake`, `postExtractionResult`, `postAssistantChoice`/`submitAssistantChoice`, `postDraftResult`, `subscribe(sid, fn)`         |
| `sources-stream.js`    | sources **per session** + global uploads state machine (uploading → processing → done) | `getSources`, `getUploads`, `subscribeSources`, `subscribeUploads`, `startFileUpload`, `startUrlImport`, `startConnectorImport`, `extractClipsForSource`, `removeSources`, `renameSource`                              |
| `schedule-store.js`    | scheduled-post queue                                                                   | `getQueue`, `getQueueOn`, `addToQueue`, `busyCountsByDay`, `subscribe`                                                                                                                                                 |
| `composer-mentions.js` | per-session composer mentions                                                          | `addMention`, `removeMention`, `renderInto`, `subscribe(sid, fn)`                                                                                                                                                      |
| `topic-feeds-store.js` | **global** one listening feed per Playbook, provisioned on read (flag `topicFeed`)     | `getFeeds`, `getFeedById`, `getFeedForPlaybook`, `updateFeed`, `subscribe`                                                                                                                                             |
| `topics-store.js`      | **global** the Topics + the triage, in two separate structures                         | `getTopicsForFeed`, `groupTopicsByAge`, `getTopicById`, `topicTitle`, `countToReview`, `countFresh`, `getFreshTopics`, `defaultFilters`, `narrowedGroupCount`, `markUsed`, `ignoreTopic`, `unignoreTopic`, `subscribe` |

**Per-session** stores: `sources-stream` (sources — `Map(sessionId → Source[])`, per-session subscribers, `clearSession()`), `library`, `posts-store`, `assistant`, `composer-mentions`. That's the model: what a user brings into a chat belongs to that chat ([`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md) §3). **Global** are the catalogs, legitimately — they pre-exist any chat: `contexts`, `connectors`, `folders`, `sessions`, `schedule`, `top-posts`, `topic-feeds`, `topics` — plus `sources-stream`'s **uploads**, a transient pre-source pool the Add-source modal reads as a whole. `library.js` subscribes to sources-stream and re-emits per-session so any session's content surfaces repaint when a source lands. **No localStorage persistence of app state** — only `archie-user-mode`, the feature-flag keys, sidebar collapse state, and the single-use `sessionStorage` handoff keys.

### A settings surface must not aggregate

Three attempts at a general settings page were reverted here: the drawer (`2b0abcf`, the DS ships no side-drawer primitive), a Connectors section (`8cdd7e8`, it duplicated `/connectors`), then `/settings` itself (`6fca0b0`). Config belongs on the entity that owns it (a Playbook's fields live on `/playbook/:id`) or on a route scoped to one feature — never re-hosted in a global page.

### Playbook sharing: the store holds the facts, `playbook-access` holds the rights

Behind the `playbookSharing` flag a Playbook has an owner and one of **three** scopes — `personal`,
`members` (a **fixed** list of colleagues, in `sharedWith`) or `organization` (a **dynamic** list: the whole
org, joiners included). That fixed-vs-dynamic difference is what the two sharing cards say FIRST — the doc
asks twice for it to be underlined. ⚠️ This shipped with two scopes and a "there is no named sharing" note
for two weeks, on an arbitration nobody ever wrote down; the spec has had three states in every version, so
the doc won and the people-picker is real. An **empty `members` list is not shared** — it reaches nobody, and
a manager's whole reach hangs off that predicate.

**Editing and governing are separate rights.** `canEdit` is the owner, full stop: a shared fiche is
read-only for everyone it reaches, managers included. What a manager gets on a **shared** Playbook lives in
`canGovern` — share it, hand it over, delete it — and `canDelete` / `canManageSharing` / `canTransfer` all
derive from that, never from `canEdit`. A manager with a pencil on a colleague's Playbook was the bug this
replaced.

**A Playbook tied to a social profile (`selectedProfileId`) only reaches people who can reach that
profile.** `profileBlockFor()` runs before every other test in `canView`, and the picker keeps a blocked
teammate in the list — disabled, with the reason — because removing the row would leave the owner hunting
for their colleague. The permission is Agorapulse's, so it is read from `org.js` (`profiles` per member) and
never stored on the fiche; an unresolvable profile **fails open**.

`contexts-store` carries `ownerId` / `scope` / `sharedWith` / `history` but **never filters** —
`getContexts()` keeps returning everything to everyone. That is deliberate: a chat whose Playbook stopped
being shared still has to _name_ it ("this chat runs on Brightline · launch, and Jonas Beck stopped sharing
it"), which means reading a fiche you may no longer open. `src/playbook-access.js` is the only gate —
`canView` / `canUse` / `canEdit` / `canGovern` / `canManageSharing`, plus `visibleContexts()` /
`usableContexts()` / `editableContexts()` that surfaces substitute for `getContexts()`, and
`revokedContextFor()` as the one function allowed to look past it. `sharedWith` survives a trip through
private and back, because the doc promises both directions with no data loss — only `scope` decides who is
in. The flag short-circuits in a single place, so flag OFF is byte-for-byte the pre-sharing behaviour.

Ownership is **chrome, never a section**: a tag in the card's metadata corner and beside the fiche's name,
an Owner quick-fact in the rail, and everything else in the Share modal. A "Sharing" section on the fiche
would be the switch grid already removed for the listening config ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1, third
storage exception). The degraded chat marks `body.playbook-revoked` — on `<body>`, because the drafts panel
is shell chrome outside `#app` — and one capture-phase listener swallows the generating hooks and says why,
so no card renderer needs to know sharing exists.

### The Image Studio is split by subject, and the engine holds no DOM

`src/image-studio.js` is the state engine: a `Map(key → state)`, every mock, and **no DOM at all**.
The views under `components/image-studio-v2/` hold no state of their own — a mutation notifies and the
whole modal body is re-rendered. That one-way path is what makes the studio safe to change, so the
exceptions are quarantined in **one** file, `inline-text.js`: typing in a text overlay, dragging a
colour or a slider, and toggling outline/shadow all patch the DOM by hand, because a re-render would
lose the caret, replace the input mid-drag, or remount an open popover so it replays its entrance
animation. Nothing else in the studio may skip the render path.

The modules split by **subject**, not by size: `index.js` is the lifecycle, `events.js` every
delegated listener, `commit.js` the paths that write to the draft, `prompt-guard.js` the
confirmation that protects a hand-edited brief, then one view module per surface
(`stage-view`, `setup-stage`, `settings-view`, `references-view`, `branding-view`, `brief-blocks`,
`preview-column`, `composer-view`, `tools-view`, `edit-view`), plus `type-art.js` / `style-art.js`,
the nine drawn option previews.

**The options come first, the brief comes last.** Generate is two halves for the whole loop — the
seven option rows on the left, the image or its placeholder on the right — and **Generate is the
form's submit**, in the footer. There is **no prose prompt field anywhere.** The brief is written AT
generate time (`deriveNow`), not at open, and lives behind an **Advanced** tab beside Options that
stays disabled until an image exists, because what it holds is the prompt that produced the image on
screen rather than a draft of one. Every option rewrites the brief; typing in one of its blocks IS
the takeover, after which an option change flags it stale instead of overwriting, and the guard names
the option it is about to rewrite.

⚠️ **Two earlier arrangements were DELETED, not flagged — don't propose either back.** A _classic_
one landed on a prose brief in a bottom composer with the options pinned to the stage's left edge in
a 284px inspector (`git log -S isv2-panel`), and an _auto-brief_ one made the written brief the hero
of the stage with the options as a bar of popover modifiers under it (`git log -S isv2-bs-mod`). Both
asked the user to face a brief before there was anything to brief about, and keeping three variants
meant three code paths through one engine — `briefIsDerived()`, `isBriefStage()` and
`afterLegacySetting()` existed only to reconcile them. Their flags (`imageStudioAutoBrief`,
`imageStudioSetupFirst`) are gone with them: the surviving studio is the behaviour, not a variant of
it.

⚠️ A confirmation inside the studio must NOT be `confirm-modal.js`: it registers with
`modal-coordinator`, whose `requestOpen` closes the active overlay — the studio — running `exit(KEY)`
and deleting the session. Render it in the studio body from state instead, listen for its keys on
`document` in capture, and pass `bindOverlayDismissal` an `isOpen` that stands down while it's up. Two stylesheets, for the same reason: `image-studio-v2.css` is the shell (`.isv2-*`),
`image-studio-canvas.css` is everything that sits ON the image and must follow a precise pixel
(`.image-studio__*`).

Two naming legacies are deliberate, not oversights: the `image-studio-v2/` directory, the `.isv2-`
prefix and `KEY = "studio-v2"` date from when a second studio was mounted beside this one behind the
`imageStudioV2` flag (both removed). Renaming them would touch two stylesheets and fifteen modules
for something no user can see. Likewise `isv2-sheet-label` / `-hint` / `-switch` were written for
flyout sheets the settings panel replaced — `settings-view.js` carries the disclosure.

⚠️ Four class families are assembled by string concatenation and a rename breaks them silently:
`.image-studio__crop-handle--{nw,ne,se,sw}`, `.image-studio__popover--{kind}`,
`.image-studio__tt-{kind}`, and `.isv2-art--{key}` — now only the grey FALLBACK frame `typeArt()` /
`styleArt()` return for a catalogue key with no drawing.

The nine option previews (three Types, six Styles) are inline SVG — `type-art.js` and `style-art.js`,
one drawing per `IMAGE_TYPES` / `STYLE_PRESETS` key, every colour in CSS as `.ta-*` / `.ta-stop-*`
DS tokens (brand orange on navy for the Types, the user's call over the amber a first pass used).
They replaced CSS-drawn spans: five shapes could only name a geometry, so "Illustration" was a circle,
a square and a triangle. Rules that came out of drawing them: a Type shows a different SUBJECT each
(backlit shot · data poster · flat landscape) while a Style holds ONE subject still and varies the
TREATMENT; there is **one warm disc in the Type row**, the Illustration's sun — a sphere in the hook
and a donut in the chart made three cards read as three sunsets; and `.isv2-option-art--dark` on a
dark drawing turns the radio ring white (`:has()`), the hook, Corporate and Bold Editorial.

### Connectors as live, MCP-queryable sources

**Gated behind the `connectors` feature flag (default OFF)** — when off, every connectors surface (gallery route + sidebar nav, modal, composer Add → "Connected sources" submenu, Sources panel "Live connectors", Add-source modal Connectors tab) is hidden. Turn it on in Settings → Admin. Connector management lives only on the `/connectors` page/modal — Settings does not duplicate it.

Connectors (Notion, Slite, Google Drive, GitHub, …) are seeded in `mocks.js` (`connectors` + `connectorDocs`) with `category` / `featured` / `accent` / `capabilities`. Once **connected**, a connector becomes a **live source**: the user "asks" it in chat and `assistant.js` `sendConnectorMessage()` simulates an MCP round-trip — a "Querying … via MCP" reasoning chip listing tool calls, then a cited mock answer. Entry points: the `/connectors` gallery page (clicking a connector opens its detail in `connectors-modal.js`), the composer **Add** menu, and the right-panel **Sources** "Connect" / "Live connectors" surface. `connectors-view.js` holds the shared render helpers used by both the page and the modal; `connector-ask.js` launches the in-chat ask flow. All connect/disconnect goes through `connectors-store` so Settings, the gallery, and the modal stay in sync.

### The Topic Feed — the one place Archie proposes instead of waiting

**Gated behind the `topicFeed` feature flag (default OFF)** — when off, `/topics` and `/topics/settings` (a stale deep link bounces to `/`), the sidebar nav row and its unread count, the "Fresh topics to review" list on a new chat and the composer's "Pick from the Topic Feed" all disappear. The data (`mocks.topicFeeds`, `mocks.topics`) rides along regardless, exactly like `multilingualPlaybook`.

Agorapulse listening pulls social posts against **eight sources** declared in `topics-catalog.js`. That file is **CONFIG, not content**: it ships with the app and must exist in `new-alt` mode too, the same split as `ff-catalog.js` vs `mocks.js`. Only `competitor-posts` is `live`, and that is load-bearing — the feed's default source filter derives from `LIVE_SOURCE_IDS`, so a Topic seeded on a non-live source would be filtered out of its own feed on first paint.

Archie assembles those posts into a **Topic**: a headline (the claim), a written analysis in two sections, and the posts behind it. `/topics` is the **queue you triage it in**.

**⚠️ This replaced a Topics MAGAZINE, which was deleted rather than flagged.** The proto had a cross-Playbook magazine — lead story + grid, `ctx.topics` on the Context, a front page on `/` behind `frontPage`, a three-headline rail in the new-chat hero, Start-a-chat / Dismiss. All of it is gone: 8 modules, 5 stylesheets, the `topics` and `frontPage` flags, the Home nav row. Keeping both meant two nav rows carrying the same antenna, two stores and two settings pages — which is what the fork this was ported from actually shipped. Deleting freed the canonical names (`/topics`, `topics-store.js`, `topic-card.js`, `topic-flow.js`), which the port took instead of installing a third vocabulary (`research` / `lane` / `brief`) beside the Playbook ⇄ Context legacy. **Do not propose bringing the magazine or the front page back behind a flag** — that arbitration is closed. A front page may return, but on the Topic Feed's own data. ⚠️ The account home (`/home`, § The Playbook scope) is **not** that page coming back: the front page was a page of what Archie PROPOSES, fed by listening and mounted on `/`; the home is a page of what you HAVE — your Playbooks and your chats. It reads no `topics-store`, renders no Topic, and `/` is still a pure redirect.

### THE INVARIANT: four separate fields, ONE visual vocabulary

`status` (`new` / `used` / `ignored`), `kind` (`ready` / `later`), `isTrending` and `isUpdated` are four fields in `topics-store`. No signal is a fourth status and nothing a reader does writes `kind`.

The reader sees **six states as CHIPS** — To review (chip-less) · Trending · Updated · Already used · For later · Ignored — each a `.ap-tag` pill with its own tone, glyph and word, on the card and the article header. `topicStates(topic)` derives that flat list from the four fields; `TOPIC_STATES` in `topics-catalog.js` is the single declaration. **That is presentation, not a merge** — and the separation is exactly what makes it work: a Topic can be **Already used and Trending** at once and both chips show. Collapsing the fields would let one fact hide another, let a re-scan overwrite the reader's own answer, and break the wire contract (`AC-TRK-6`) that reports the three independently.

**The Filters panel is NOT that six-row list** (it was, and the flat version was reverted — `git log -S renderStateSelect`). It is **three grouped controls**, each one field: **Topics**, a multi-select on `kind` that is **EMPTY at rest — both lanes (To review + For later) show in one list**, and ticking a lane narrows to it (a For-later Topic is told apart in the mixed list by its own blue "For later" chip, not a card change); **Marked as**, a multi-select on the ANSWERED statuses (Already used ticked at rest, Ignored not), added on top of the To-review baseline the list shows; **Sources**. This replaced a one-lane-at-a-time RADIO (`git log -S renderKindRadio`), which replaced tabs above the list — the arbitration is now "read both by default, narrow if you want". **Trending and Updated are not filter rows at all** — a signal is a claim about NOW, not a lane, so it stays a card chip. Dropping them from the filter is what lets the ignored rule fall out for free: the predicate never reads a signal, so one can never resurface an ignored Topic. An ignored Topic shows only when **Ignored** is ticked in Marked as. `defaultFilters` / `matchesFilters` / `narrowedGroupCount` in `topics-store` are the three functions this lives in.

**Triage lives in its own `Map`**, never written onto the Topic: a Topic is what the scan returned (server-owned), a triage row is what _this user_ did with it (user-owned). Keeping them apart is what lets a re-scan replace a Topic without clobbering the answer.

**The Topic's trail is two-sided, for the same reason.** `history` on the Topic is what the scan recorded ("Surfaced from the 16 Jun – 16 Jul Instagram scan"); the triage row's `entries` are what this reader did ("Ignored — not our angle"). `withTriage()` concatenates them on read, seeded first, so the trail reads oldest to newest and neither half can overwrite the other. Writing the reader's entries onto the Topic would put them in the path of the next scan — which is precisely what the separate Map exists to prevent. `unignoreTopic` wipes `entries` alongside `reason`, because that is the path the toast's Undo takes and an undo that leaves a footprint has not undone anything.

An **ignored Topic is never surfaced by a signal, anywhere.** Ticking Ignored in the filter is the only way back. The opposite rule — "a spike is never hidden by triage" — was tried and dropped: it made Ignore a suggestion rather than an answer.

`withTriage()` **clears both signals past the first age group**, because Trending and Updated are claims about _now_ and a card carrying either under a three-weeks-ago separator contradicts itself. Enforced on read, not in the seed, so every surface agrees for free.

### Connecting an account: asked in the flow, never as a prerequisite

Behind `skipConnectProfiles`, nothing is connected to begin with and Playbook creation stops
_requiring_ an account: the step stays, but it is a choice — it offers to connect one (the same
rows and the same modal as in chat) when none is, or the usual profile pick when some are, and
either way it carries a **Skip**. The step count doesn't change; only its obligation does.
Skipping is not a dead end — the ask comes back where it pays for itself, in the chat flows that
draft FOR an account. `requireConnectedProfiles()` in
[`connect-profiles-flow.js`](src/connect-profiles-flow.js) is the whole feature: it returns straight
through when anything is connected, so callers wrap unconditionally and the flag-off path is
byte-identical. Otherwise it puts a Quickpicker in the step's own slot, hands the confirm to
[`connect-account-modal.js`](src/components/connect-account-modal.js), then calls `onReady` — so the
flow **resumes where it left off** instead of restarting. The rule is coverage, not convenience:
EVERY path that produces a draft asks — `addPostDraft`'s five call sites are the checklist —
draft-from-idea and repurpose (`session.js`), clip drafts (`clip-draft-flow.js`), top posts inline

- studio (`top-posts-flow.js`), and the Clip Studio. A batch of posts needs no gate of its own: it
  replays its sources through the classic source → idea workflow, which is already gated.

The Clip Studio is the one that can't use the shared step — it is a full-panel takeover, so a
Quickpicker posted into the thread would be hidden behind it. `renderClipStudioConnect` renders
the SAME network cards in the studio's own chrome instead, and connecting notifies so the normal
profiles stage takes over. Left alone it was a silent dead end: `finalizeClipStudio` returns early
on an empty account list, so "Create N drafts" sat disabled with nothing explaining why.

Two rules this rests on:

- **The grid asks, the dialog consents** — the product's own two beats. The step is a card grid of
  NETWORKS (glyph, name, "Pages" / "Professional accounts"), laid out like Agorapulse's _Add new
  social profiles_ screen, because that is the real unit: you don't pick from accounts you already
  have, you pick a network and its dialog hands one back. Connecting is an Agorapulse action, not an
  Archie one ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §6 — the account catalogue belongs to the
  platform). Don't collapse the two into a bare "Connect" button.
- ⚠️ **The cards variant resolves by DESTROYING the picker** (`pick()` deletes the state before
  calling `onPick`). So the dialog must hand control back on cancel — `onDismiss` re-arms the grid.
  Without it, backing out of the dialog leaves the flow with nothing on screen.
- **The Skip is not silent.** Onboarding's Skip (the nothing-connected branch only) opens
  [`skip-connect-modal.js`](src/components/skip-connect-modal.js): three reassurance lines first —
  nothing publishes without approval, Archie reads what the account already published, the accounts
  belong to the Agorapulse account and not to Archie ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §6)
  — then a multi-select "Why not now?". ⚠️ **Answering is REQUIRED** here, unlike
  `topic-ignore-modal`'s optional reason: this is the only thing the step gets back, and the user
  meets the dialog once. What keeps that honest is that LEAVING is free — Back, Esc, backdrop and X
  all put the network grid back rather than skipping, so the gate sits on the skip and never on the
  exit. Reasons land in `feedback-store` via `recordReasons` (key `skip:connect-profiles`), the one
  store function that records an answer with no verdict. Skipping the _pick_ of an already-connected
  profile is a different gesture and is NOT intercepted.
- **A step that a dialog hands control back to is put BACK, not asked again.** `askAltProfile` takes
  `{ announce }`, false from both `onDismiss` paths — without it the thread printed its own question
  twice for one step (a pre-existing blemish on the connect dialog's cancel, doubled the day the skip
  dialog became a second caller).
- **`social-profiles.js` now holds state.** A module-level `Set` of connected ids, seeded once from
  the mocks (flag off) or empty (flag on), with `connectAccounts()` writing to it and a notifier so
  every surface agrees. `profileForNetwork()` goes through the SAME gate — otherwise the schedule
  modal and the top-post cards would show a profile nobody connected. `getConnectableAccounts()`
  filters on `handle`, not `status`: the mock's disconnected entries include bare network stubs
  (`{ id: "tt", platformLabel: "TikTok" }`) that have nothing to connect to and would render as
  "undefined" rows.

⚠️ A surface that merely _lists_ profiles is out of scope on purpose — it renders its empty list.
But a surface that makes the user _pick_ one must never render an empty picker: that is a silent
dead end, which is the exact failure this feature removes. Top Posts was gated for that reason after
it was seen doing it.

### The listening config left the Playbook

The magazine kept it as `ctx.topics`. It now lives in `topic-feeds-store.js`, keyed by Playbook: **one feed per Playbook**, provisioned lazily on read (`provisionMissingFeeds`), so a brand new to the app never meets a screen asking it to configure something first — and nothing can _delete_ a feed, since the next read would rebuild it.

Which feeds listen and how often answers "what job should Archie run?", not "who are you?" ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1). Data stays per Playbook; only its owner changed. It also buys `websites` — one feed's scan list, which has no place on a fiche whose `websiteUrl` is the brand's canonical address.

### The Playbook scope — `?pb=` by default, a workspace behind `playbookWorkspace`

The fork introduced `active-playbook.js`: a global, `localStorage`-persisted Playbook scope written to by a select sitting in the feed's own filter bar — so a control that promised a page filter silently re-scoped the sidebar, the next new chat and the composer's picker. That version was **deliberately not ported**, on one condition stated at the time: _don't reintroduce a global scope without a permanently visible switcher — a scope that hides is only safe while it is legible._

**Behind `playbookWorkspace` (default OFF), that condition is now met and the scope IS the model.** A Playbook is the level above the work, not a field on it: one is active at all times, chosen from the switcher under the wordmark in the rail, and everything below it belongs to that brand — the chat list, a new chat, the Topic Feed and its count, Insights, the studios' drafts. The six pickers that each asked the question separately (the composer's select, the feed's toolbar select, `/topics/settings`' own, the batch / clip / repurpose selects) are **gone**, not disabled: a greyed-out field restating what the rail prints permanently is chrome the reader has to rule out, and next to a live control it reads as something broken. Every host absorbs the loss on its own (`flex-end` commit rows, `margin-left:auto` on Send), and the Insights title stops being a picker because the rail is the door now. Where a page would otherwise stop naming its brand, an existing **live** control picks the name up — `/topics/settings`' "Open the Playbook" link becomes "Open Acme · Q2 marketing".

**Two levels, and the switcher is the seam.** Inside a workspace every surface is one brand's. The CATALOGUE of brands — and any other brand's fiche opened from it — belongs to the level above, so those routes step out of the shell: `isAccountScope(path)` (same module) drives `body.account-scope`, layout.css hides the rail, and the topbar keeps only the way back in ("‹ Back to Acme · Q2 marketing" from the catalogue, "‹ Back to all playbooks" from a fiche). It is the mechanism `body.onboarding` already used, not a new one. Consequences worth knowing before touching either surface:

- **Insights' page head is the flag's too.** Flag ON, `/insights` drops its brand
  band entirely — the rail names the Playbook one row above the topbar's own
  title, so a band re-printing it spent the top of the page on what the chrome
  already said — and **`Objectives` becomes the page title** (`pageTitle()` in
  the screen's `pieces.js`, at the rung the brand name held). Cockpit's rail
  head takes the same word, since a column of three counts and no noun says
  nothing. Flag OFF the band stays: there, the brand name in it is the app's
  only Playbook switcher.
- **The rail's row is singular.** `Playbooks 8` — a count of every brand, in a rail that promises one — became **`Playbook`** → `/playbook/<active>`: the fiche of the brand you are in, which is both in scope and the frequent destination. The list moved to the switcher's footer ("All playbooks" → `/home`), the only control that announces it changes scope. `workspaceNav()` in sidebar.js does that swap.
- **The wordmark is the account's door.** In workspace mode it opens `/home`; flag OFF there is no level above the work, so it keeps minting a chat — and `[data-sidebar-new]`, which shares its handler branch, keeps that job in both modes.
- **The active brand's own fiche stays IN the workspace** — chrome, no crumb, the rail row lit. Only cross-brand routes leave. That is the whole rule: the chrome follows the object's scope.
- **On the home, a Playbook card IS the workspace.** Clicking it switches to that brand and opens a fresh chat in it (`?contextId=`, not `/` — the home is a launcher, so the gesture is "start", not "resume"); the fiche keeps the pen, with the other hover verbs, and the active card reads `Current`. ⚠️ This reversed the opposite arbitration one commit earlier — body opens the fiche, a small `Switch` link carries the scope move — argued from a mis-click's asymmetry. The user's call; what makes it safe is that nothing is lost (the new chat is empty, the crumb goes back, the brand you left is one card away), and the `Switch` link went with it as a second control for what the whole card now does. Flag OFF the card still opens the fiche.
- **`/` is the one definition of "this brand's home"** — a redirect to the most recent chat IN SCOPE, else a fresh one (dashboard.js reads `scopeSessions`). The rail's switcher, the catalogue's Switch and the topbar's way back all navigate there rather than each computing a destination. `/` is the **brand's** home and `/home` the **account's**: two levels, two homes, and neither renders the other's list — `/` still renders nothing at all.
- **A switch re-points the surface it was made from.** From a chat → `/` (above). From the active brand's own fiche → `/playbook/<new id>`: what the reader has open is "this brand's Playbook", not that one brand, so it follows the switch the way `/topics` and Insights follow it. `switchPlaybook()` answers that BEFORE calling `setActivePlaybook` — a moment later the path's id is no longer the active one. Leaving the fiche alone was worse than a stale page: `isAccountScope()` would call it another brand's fiche while `body.account-scope` (only written on a route change) still said workspace, so the rail named one brand above another's sheet. Everywhere else — no brand in the URL — the scope notify repaints in place.

Three rules hold it up:

- **The flag short-circuits in ONE place.** `isWorkspaceMode()` / `playbookForNewWork()` / `scopeSessions()` in [`active-playbook.js`](src/active-playbook.js) are what every surface reads — the same arrangement as `playbook-access.js` and `playbookSharing`. Flag OFF is byte-for-byte the per-chat model: `?pb=` on the feed and its settings, `getDefaultContext()` for new work, a selectable composer pill on a fresh chat.
- **A chat still keeps its own Playbook** ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §2). It inherits the active one at birth and never changes — so switching brand does not rewrite what a chat produced. It also means the chat you are reading can fall outside the new scope, which is why a switch made from `/session/*` lands on that brand's most recent chat (or a fresh one).
- **There is no "All playbooks" inside a workspace, and the account home is unfiltered.** A scope HIDES: anything outside it is invisible rather than empty, so cross-brand views are the price — an "All" row in the rail would turn the guarantee back into a filter. The exception is the one surface whose whole subject is the brands you are NOT in: `/home`, where both its lists are cross-brand — the catalogue the switcher picks from, and every chat with its brand named in a column. `search-modal.js` (⌘K) already read `getSessions()` unscoped, so this makes an existing cross-brand read legible rather than adding one. Opening a chat from there **re-scopes** to that chat's brand, for the same reason `/` exists.

⚠️ Don't re-point a surface at `getDefaultContext()` or add a `?pb=` producer without going through those three functions: two scopes that can disagree is the exact failure this replaced.

### One article, three hosts

`topic-article.js` is the render engine — `renderTopicHeader` + `renderTopicArticle` + `renderTopicActions`, pure functions, no DOM and no listeners, the same shape as `playbook-view.js` and `connectors-view.js`. The feed's pane, the picker's dialog and the in-chat dialog all call it, so there is exactly one article.

The identity is its own renderer because the two hosts **compose** it differently: the pane keeps `renderTopicHeader(topic, {withActions: true})` outside its scroller — title, source and the two verbs, all fixed, and **no Close**: a two-pane reader closes a message by opening the next one, and the list is right there, so a button spent the header's best slot on what the layout already does. Escape closes the pane, wired by the host and removed in teardown. While the dialog renders the same header inline and keeps its verbs in a sticky footer against its bottom edge. Placement is the host's; what the identity and the verbs SAY is not, which is the whole point of rendering both from one place. ⚠️ The pane used to keep only the VERBS up there, with the title below them inside the scroller: the actions had no subject on screen and scrolling took away the line naming what they act on. A second copy for the dialog is how a card and the thing it opens end up saying different sentences about one Topic. `topicTitle()` is the matching rule for titles: the article's own title wins, `headline` is only the fallback for a Topic with no article yet.

`topic-card.js` emits the same object in TWO shapes — the feed's card and the picker's card, identical part for part — both carrying `data-topic-read`, so a host wires them once. The new chat's Fresh-topics grid renders the picker's card too, with `withUse: true` adding the verb on the card face: the body still opens the article, and the button is the second door for a reader who already knows. ⚠️ There was a third shape, `renderTopicRow`, for the hero; six full-width rows ran ~500px and pushed the workflow starters off the fold, so the hero took the card and the shape count went DOWN.

### The master–detail: the list SHRINKS

Non-negotiable, because getting it wrong is what broke this feature on the fork. There the list was pinned at 666px and the pane took the leftover, so under ~1180px of **content** width a container query dropped the article below the list — at 1440px of viewport (a 14" laptop, sidebar included) clicking a card rendered the article 1900px below the fold and nothing appeared to happen. Here the pane is the fixed half — `flex: 0 1 calc(var(--topic-measure) + 2 * var(--ref-spacing-md))`, so exactly the prose measure and never a pixel of dead white space — and the list is `flex: 1 1 0` with a 340px floor, absorbing whatever is left. Side by side survives to 760px of content width. The page cap (1132px) is `calc()`'d from the same two `:root` variables, so it cannot drift from the measure the way the hand-written 1440 did. Below that it stacks and opening an article **scrolls it into view** — arithmetic, not `scrollIntoView()`, whose `nearest` declines to move a pane taller than the scrollport and whose `smooth` loses the race against the next repaint.

The split is measured with a **`@container` query on the row**, never a media query: the sidebar collapses and the right panel overlays, so viewport width never tells you content width.

### Two verbs, and only two

**Use in chat** (`topic-flow.js`) marks the Topic **Used**, then opens a **new** chat with it attached as a Source via `addReadySource` — so Extract ideas, Draft, Ask and the Sources panel all light up with no new plumbing and no special case. The mark lands _before_ the chat opens, in one place, so the three surfaces that navigate (feed card, feed article, hero card) mean the same thing. No echo message and no question picker on arrival: the source-intake card already names the Topic.

**The composer's "Pick from the Topic Feed" is the one INLINE exception** (`startTopicPickerInline`): it runs in the chat the reader is already in, the same shape as "Top performing posts" — one Archie line, then a single-select **widget turn** (`renderTopicsWidget`, radio cards of the feed's draft-ready Topics, newest first, max six), and **Use this topic** marks it Used, attaches it to _this_ chat via the same `attachTopicToChat`, then offers a next-steps Quickpicker (Extract ideas / Draft a post / Ask about it). Every neighbour in the Add menu acts in place; a Topic that opened a second chat was the one item that took the reader away from the chat they had just asked to add to. ⚠️ The dialog's LIST view that used to back this entry point was deleted with it (`git log -S renderListView`) — `topic-picker-modal.js` now opens on the article only.

**Ignore** opens `topic-ignore-modal.js` and asks why. The reason is the only thing a reader ever _tells_ Archie about the listening, and it is what makes the Ignored state readable afterwards — the card prints it back. It is `stroked grey`, not red: ignoring hides a Topic that ticking Ignored brings straight back. Reversible via the toast's Undo, which also **clears the reason**. ⚠️ The fork's "Don't show this again" checkbox is not ported — it turned Ignore into a one-click action with no reason, contradicting the same feature's promise that the reason is kept.

### The DS ports live in ds-patches.css

`.ap-filter-dropdown` is a **transcription of an Angular-only DS component** from its own SCSS — it does not exist in `ds/css-ui`, so this is the missing-primitive case `ds-patches.css` is for, and the day it lands in the DS the block is a delete. It is the component the DS's own tie-breaker prescribes: grouped options behind a trigger → filter dropdown (not filter chips, which is right for a small flat always-visible set — what the magazine correctly used for its six sources).

⚠️ `.ap-segmented-control` was ported here for `/topics`' two-view switch and has been **deleted** — it was the wrong component (the product uses TABS for that shape, and only one list was ever on screen). Then the `.ap-tabs` that replaced it went too. The `kind` axis (To review / For later) it carried now lives as the **Topics multi-select** inside the Filters panel — empty by default so both lanes show in one list, ticking a lane to narrow. `git log -S renderTabs` has the tabbed version, `git log -S ap-segmented-control` the one before it, `git log -S renderKindRadio` the one-lane radio between them. Don't re-port a page-level lane switch without a genuine 2–4 co-visible-views case — the select-in-panel is the answer here.

Every token substitution is commented with the value it stands in for, because the `--sys-color-*-interactive-*` family, `--sys-height-control` and `--sys-radius-inner` are **not in this repo's synced `ds/`** yet. Re-point them on the next `ds/` sync. ⚠️ The `--selected` double dash is the component's own — the DS wrote it that way against its own flat-modifier convention, and a port that "fixed" it would stop matching what it ports.

### Routing & screen lifecycle

`router.js` re-runs the matched handler on **every** `hashchange` (including query-only changes — it matches on the path with the query stripped). A screen's `render(params, target)` may return a cleanup function that the router invokes before the next render. URL state is encoded as hash query params (`#/session/:id?tab=posts&focusIdea=…`); read it with `parseHashParams()` and mutate with `setHashQuery(path, params)` (calls `navigate()`).

### Cross-screen handoffs

`handoff.js` exposes `setHandoff(key, payload)` / `consumeHandoff(key)` (atomic read+remove) over `sessionStorage`. Consumed at `session.js` mount:

| Key                          | Set by                                                                                                       | Consumed by →                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `pendingAskSource`           | source card "Ask"                                                                                            | `askWhatToKnow`                  |
| `pendingAskConnector`        | connectors gallery/modal "Try in chat"                                                                       | `askConnector`                   |
| `pendingStartContextBuilder` | `/contexts` "New Playbook" + welcome-alt                                                                     | `context-builder` (create)       |
| `pendingHomePrompt`          | the account home's hero (Send / Enter)                                                                       | `sendMessage` (session.js)       |
| `pendingHomeAdd`             | the account home's hero **Add** menu                                                                         | the composer's own Add dispatch  |
| `OBJECTIVE_CHAT_HANDOFF`     | `objective-flow.js` — "Fix this in a chat" / repurpose a post                                                | `startObjectiveChat`             |
| `pendingTopicChat`           | "Use in chat", from the three surfaces that navigate (the composer's picker is inline and attaches directly) | `attachTopicToChat` (topic-flow) |
| `pendingStartClipStudio`     | session composer "Extract video clips"                                                                       | `clipStudio.start` (new chat)    |
| `pendingStartBatch`          | session composer "Batch of posts"                                                                            | `batchStudio.start` (new chat)   |

A key that is consumed but never set is dead weight that reads as a live entry point — `pendingStartFlow` and `pendingDraftIdeaId` both sat here after their producers were replaced. Add a row only with both ends.

### Admin / user mode (prototype controls)

The **Admin** popover in the sidebar footer cog (`admin-menu.js`) is the prototype control panel: switch user mode and toggle feature flags (each change reloads so stores re-seed). `user-mode.js`: `getUserMode()` returns `"returning"` (populated mocks, default) or `"new-alt"` (empty stores + first-time onboarding); `isNewUser()` tests for `new-alt`. Feature flags live in `ff-catalog.js` (`FLAGS`, each with a `default`) and are read via `isFlagOn()`. The flags: `insightsHub` (OFF — gates the whole `/insights` section, route included), `playbookWorkspace` (OFF — whether the Playbook is a field on the work or the level above it; ON puts the switcher in the rail, scopes everything under it, and gives the wordmark an account home at `/home`, see § The Playbook scope), `draftInlineEdit` (OFF), `connectors` (OFF — gates the whole connectors feature), `conversationStatusCard` (OFF), `multilingualPlaybook` (OFF), `topicFeed` (OFF — gates the whole Topic Feed: `/topics`, `/topics/settings`, the nav row and its unread count, the new chat's "Fresh topics to review" list, and the composer's "Pick from the Topic Feed"), `playbookSharing` (OFF — gates Playbook ownership: a Playbook is personal, shared with named colleagues, or shared with the whole org; read-only fiche + Duplicate for recipients, manager **governance** rights (never content), the profile gate, the degraded chat after access is lost, and the Admin **Your role** control. Unlike `topicFeed`, its two demo Playbooks and its demo chat are seeded **only** under the flag)., `skipConnectProfiles` (OFF — whether connecting a social account is required or chosen: ON starts with nothing connected in both user modes and makes Playbook creation's account step optional (a Skip, and an offer to connect when nothing is), with the ask returning in the chat flows that draft for an account — see § Connecting an account below).

**Flags removed in the 2026-09-04 cleanup** — do not reintroduce these as toggles: `playbookDefault` was **deleted** (the "set as default" star on `/playbook` is gone; the internal default-Playbook selection via `getDefaultContext` / `isDefault` and the badge on `/contexts` cards stay). `statusActionSnackbars`, `playbookColors`, `manyProfiles` and `playbookCompetitors` were **baked ON** — the success snackbars always fire, Playbook colours always show (no more `hide-playbook-colors` body class), the ~40-profile demo set is always seeded, and the Competitors section always renders. Their OFF branches are deleted, exactly like the earlier Image Studio flags (`imageStudioAutoBrief`, `imageStudioSetupFirst`, also gone — § The Image Studio). Full table + gates: [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md#14-admin-feature-flags--user-modes).

### Module loading

ES modules with a `?v=N` cache-busting suffix (`from "./assistant.js?v=1211"`). **One number for the whole app** — every module specifier in `src/` and every app stylesheet in `index.html` carries the same `?v=`. The browser caches a module by its exact URL, so a store named at two versions becomes two module instances with split state; a single shared number makes that impossible instead of merely discouraged.

```bash
npm run bump            # N → N+1 across every file, in one pass — run it for ANY js/css change
npm run check:versions  # fails on drift; the pre-commit hook runs it
```

Never hand-edit a `?v=`. `scripts/cache-version.mjs` owns the number (it also covers dynamic `import("…")`, which a hand-bump used to miss), and the pre-commit hook blocks a commit whose versions disagree. The number is only a cache-buster — the server resolves the same file whatever the suffix — so a bump is always behaviour-neutral.

⚠️ **A cached entry point pins the whole old import graph.** After a JS change, verify a _visible_ effect (a removed node, a changed class) in the browser: a CSS-only confirmation proves nothing about the JS.

All deps are local; no CDN/`esm.sh` imports. `package.json` exists only for the two DS npm packages + tooling (prettier/husky/lint-staged). The pre-commit hook runs `check-template-comments.py`, `cache-version.mjs check`, and `prettier --write` on staged files.

## Design System — READ FIRST before UI/CSS work

This project is built on the official Agorapulse Design System (`@agorapulse/ui-theme` + `@agorapulse/ui-symbol`, synced into `ds/`). **Do not invent custom components, tokens, or icons when the DS already provides them.** Regressions from ad-hoc CSS overriding DS tokens are the #1 source of bugs in this repo.

### Required workflow before writing any HTML/CSS

1. **Check if a DS component exists** — `list_components` on the `ds-css` MCP; `get_component <name>` for variants/modifiers (`.stroked`, `.primary`, `.ghost`, `.transparent`, color classes).
2. **Check for an existing icon** — `search_icons <keyword>` before adding any SVG. Use `<i class="ap-icon-{name}"></i>`.
3. **Use DS tokens, not hardcoded values** — `search_tokens` + `recommend_token` on the MCP, or grep `ds/desktop_variables.css` for `--ref-*` / `--sys-*`. Never write `padding: 20px` when `var(--ref-spacing-sm)` exists, nor `#fff` when `var(--ref-color-white)` exists.
4. **Prefer `--sys-*` over `--ref-*`** when a semantic token exists.
5. **Custom CSS only if nothing in the DS fits** — pick the right file:
   - `styles/ds-patches.css` — the **only** place to extend a DS class with a missing variant or add a primitive the DS forgot (e.g. `.ap-filter-chip`, `.app-modal-backdrop`). It should shrink as the DS evolves.
   - `styles/screens/<screen>.css` — screen-specific styling.
   - `styles/components/<component>.css` — shared component styling.
   - **Never** redeclare a `.ap-*` class with overrides outside `ds-patches.css` — it flips the cascade silently. The one standing exception is `styles/components/archie-loader.css`, which claims `.ap-loader` on purpose: every spinner in the app is replaced by the animated Archie mark, and that is a brand decision, not a missing DS primitive. It says so at the top of the file. Don't add a second exception without the same kind of note.
6. **Validate before committing** — `validate_css` on the ds-css MCP.

### Brand color convention

Per project preference: **orange = AI / spotlight actions** (Ask, Try in chat, primary AI CTA); **blue = routine list-page CTAs** (Connect, Create, navigation). Reuse shared primitives — e.g. filter chips use `.ap-filter-chip` (driven by `aria-pressed`), the same chip the Ideas panel uses.

### DS files (in `ds/`, generated by `scripts/sync-ds.mjs` — do not edit by hand)

```
ds/
  desktop_variables.css  — design tokens (--ref-* / --sys-* / --comp-*)
  css-ui/font-face.css   — Averta font-face
  css-ui/index.css       — all .ap-* component classes
  ap-icons.css           — icon font (<i class="ap-icon-*">)
  fonts/averta/          — OTF font files
```

### App styles (in `styles/`)

```
styles/
  tokens.css        — app-only tokens (surface aliases, radius, mermaid accent)
  base.css          — resets, keyframes, app-wide token groupings
  layout.css        — app shell (sidebar / topbar / content / panel chrome)
  ds-patches.css    — the only legitimate place to touch .ap-* selectors
  chat.css          — composer + thread chrome
  screens/          — analyse, batch-studio, caption-editor, clip-studio, connectors,
                      contexts (the catalogue + the home's page box), home (its hero,
                      tab toolbar and chats table), dashboard, image-studio-canvas,
                      image-studio-v2,
                      modals, posts, session, topics, topics-settings, welcome
  components/       — add-source-modal, archie-loader, clip-card, connectors-modal,
                      conversation-status-card, feedback-control, right-panel,
                      schedule-modal, sidebar, social-post-card, subtitle-style,
                      top-post-card, topic-badge, topic-card, video-clips-modal,
                      workflow-flow
```

### Token tiers

- `--ref-*` — reference tokens (colors, spacing, fonts, radii) from the DS.
- `--sys-*` — semantic tokens (text/border colors, component states) — prefer these.
- `--comp-*` — component-level tokens — do not use directly in app CSS.

Exception: the `sparklesMermaid` icon uses inline SVG for its gradient fill. Third-party brand colors (connector accents, social logos) live as data in JS, not as DS tokens.

## Key conventions

- `index.html` is HTML markup only — all UI is rendered by JS.
- All seed data lives under `src/mocks/`, one file per domain, re-exported by the `src/mocks.js` barrel — consumers always import from `mocks.js`, never from a domain file. A new domain is a new file plus one `export *` line; it must not read another domain.
- Event wiring is **pure event delegation** with `data-*` attributes on the screen/modal/panel root. No inline `onclick`, no per-child `addEventListener` for interactive elements.
- Keep `?v=N` import suffixes consistent across importers; bump in lockstep when a module changes its exports or is a shared singleton/store.
- The `html` tagged-template escapes interpolations by default — wrap trusted HTML fragments in `raw()`, and do **not** double-escape (don't call `escapeHtml()` on a value already interpolated into an `html` template).
- Commit one change at a time on the current branch; do not push or create branches.

## Docs

All docs (except this file and `README.md`) live under [`docs/`](docs/). Start from [`docs/README.md`](docs/README.md) for the full index. **What to read before designing anything: § Before you build a feature, at the top of this file.**

- [`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md) — **what each object IS**: the Playbook and its hard boundaries, what a session is and what belongs to it, the draft/post/top-post/source-post split, what a Studio is, and where Archie stops and Agorapulse starts. Read before adding a field, a section, or a surface.
- [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md) — **functional catalog of every app feature** (flows, states, entry points). Start here to learn what the app does.
- [`docs/reference/UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md) — concrete DS usage (ds-patches inventory, app tokens, UI patterns, the loader system, colour convention).
- [`docs/reference/`](docs/reference/) — current truth about the proto (architecture, routes, stores, design system, glossary).
- [`docs/audits/`](docs/audits/) — current audits (PROD-VS-PROTOTYPE, PROD-CHANGES).
- [`docs/copy/`](docs/copy/) — UX copy principles (voice, tone, glossary).
- [`docs/specs/`](docs/specs/) — acceptance criteria, written from the running app. [`AC-TOPIC-FEED.md`](docs/specs/AC-TOPIC-FEED.md) covers the Topic Feed; its §0 lists what this repo deliberately does differently from the spec it was ported from.

## MCP

- `ds-css` — design-system tools: `validate_css`, `recommend_token`, `search_tokens`, `get_component`, `list_components`, `search_icons`, `get_text_style`, `get_layout_pattern`. (`.mcp.json` ships this server.)
- `plugin:figma:figma` (when enabled) — design ↔ code: `use_figma`, `get_design_context`, `get_screenshot`, `generate_diagram`, etc.
- A live browser **preview** is available for verification (navigate routes, click, screenshot, read console).
