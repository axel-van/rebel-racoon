# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive prototype for exploring and validating Agorapulse UI redesigns — specifically **Archie**, an AI content assistant (sources → ideas → drafts → schedule). No build step, no bundler — static ES modules served locally. The codebase mixes English (code, UI copy) and French (some comments). Archie speaks in the first person ("I", "Let's") — never third-person "Archie" — wherever it is TALKING to you: the thread, toasts, empty states, onboarding. **Settings and instructional copy are neutral and passive** ("every post is read", not "I read every post"): a switch you set once and leave running for months is not a conversation, and the first person turns a description of what the system does into a promise someone made.

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

| Route                        | Screen                 | Notes                                                                                             |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `/`                          | `dashboard.js`         | Redirect-only: first-time → `/welcome-alt`, returning → most-recent session or a fresh one        |
| `/session/:id`               | `session.js`           | The main chat surface (largest file); hosts the assistant thread, composer, and per-session flows |
| `/contexts`                  | `contexts.js`          | Standalone **Playbooks** library (cards + edit); topbar leads with **Back to chat**               |
| `/playbook/:id`              | `playbook.js`          | Playbook detail page (topbar back → `/contexts`)                                                  |
| `/connectors`                | `connectors.js`        | Connectors gallery (marketplace); detail opens in a modal (gated by the `connectors` flag)        |
| `/topics`                    | `topics.js`            | **Topics** feed — the listening dossiers, one stream across every Playbook (gated by `topics`)    |
| `/topics/settings`           | `topics-settings.js`   | **Topics settings** — the six listening sources + cadence for one Playbook (`?pb=`); topbar back  |
| `/topic-feeds`               | `research-feed.js`     | **THE feed** — the active Playbook's, resolved from the rail's scope. One feed per Playbook       |
| `/topic-feeds/settings`      | `research-form.js`     | Which sources that feed listens to. Registered BEFORE `/topic-feeds/:id`                          |
| `/topic-feeds/:id`           | `research-feed.js`     | One feed by id — deep links (a pillar's trail) and the attention page                             |
| `/topic-feeds/:id/settings`  | `research-form.js`     | The same form, feed named by id                                                                   |
| `/topic-feeds/:id/attention` | `research-trending.js` | The flagged Topics (trending / updated), outside triage                                           |
| `/content-strategy`          | `content-strategy.js`  | **Content strategy** — the pillar list (gated by `contentStrategy`)                               |
| `/pillar/:id`                | `pillar.js`            | One pillar: Context & assets · What went into it. Topbar back → `/content-strategy`               |
| `/welcome-alt`               | `welcome-alt.js`       | First-time onboarding kickoff (thin redirect into a transient session)                            |
| `/welcome-alt/recap`         | `welcome-alt-recap.js` | Onboarding recap reveal of the built Playbook                                                     |

`research.js` (the feed LIST) and `/topic-feeds/new` are gone: with one feed per Playbook there is nothing to list and nothing to create. The file is kept and marked unreachable — it carries the reasoning for the list shape, if several feeds per Playbook ever come back.

There is **no `/settings` route** — removed, restored once, and removed again (see "A settings surface must not aggregate"). Playbooks are managed on **`/contexts`**, the library that already exists for them; a feed's sources are edited from that feed. The prototype Admin controls (user mode + feature flags + docs link) now live in the sidebar footer cog popover (`admin-menu.js`, rendered by `sidebar.js`); the old Social-accounts page was dropped (`social-profiles.js` remains as a shared helper).

`setAfterRender` (in `app.js`) re-renders the sidebar + conversation-status-card after every route change and toggles the `body.onboarding` full-bleed class for the welcome-alt flow.

> **Vocabulary — UI label vs code name.** A saved AI context is a **Playbook** in the UI but a **Context** in code (`contexts-store`, `contextId`). Content Research is **Topic Feed** in the UI — singular, because there is one per Playbook: the section and the nav row are **Topic Feed**, and each card in it is a **Topic**. Everything in code still says research / brief / lane / topic (`briefs-store`, `brief-card`, `data-brief-*`, `/topic-feeds` routes, `.topics-*` classes) — same split as Playbook/Context, and `briefs-store` could not be renamed regardless because `topics-store` is a different feature. Source → Idea → Draft (post) → Schedule is the content pipeline.
>
> ⚠️ **"Topic" names TWO objects again — by decision, not by accident.** The listening dossier (`topics-store`, `/topics`, flag `topics`) and a card in a Topic feed (`briefs-store`, `brief-card`, `/topic-feeds`, flag `contentResearch`). Earlier renames (Topic→Idea, then Idea→Inspiration) existed to separate exactly these two; Inspiration→Topic puts them back under one word. When both are possible in one sentence, **name the surface** — "a Topic in this feed", never a bare "Topic". They never touch in code: different stores, different card modules, different routes. Both flags default OFF, so the clash is invisible in the default demo, and `/topics` vs `/topic-feeds` keeps the routes distinct.
>
> **Pillar** is the third object in this family and does not collide with either: a theme the brand keeps coming back to, living in **Content strategy** (`pillars-store`, `/content-strategy`, `/pillar/:id`, flag `contentStrategy`). It is called a Pillar in the UI **and** in code — the one object in this app whose two names match. A Topic can be _filed into_ a pillar; a pillar is never a Topic.
>
> **Idea**, by contrast, now names one thing: the pipeline's extracted Idea (right panel, `library.js`, `idea-card`, the topbar's Ideas pill), from a source you supplied. A Topic comes from outside — competitors, influencers, trends, Archie found it.
>
> One label deliberately keeps the older word, because it names something other than the object: the source **"Internal team ideas"** (your team's own ideas, read from connected MCP tools). The card type that was "Ideas for later" is now **"Topics for later"** — it names the route this object takes, and the object is a Topic now.

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
  file-kinds.js         — source kind → DS icon class
  mocks.js              — ALL seed data (sessions, contexts, sources, ideas, posts,
                          connectors + connectorDocs, social accounts, threads, prefs)

  # Stores (per-session Map + subscribers, seed from mocks unless new-alt mode)
  sessions-store.js     — chat sessions list (pin / rename / delete)
  contexts-store.js     — Playbooks (Contexts)
  connectors-store.js   — connectors list + connection state (the only "catalog" store)
  library.js            — per-session ideas; getSources() delegates to sources-stream
  posts-store.js        — per-session drafts
  assistant.js          — per-session conversational thread (turns, reasoning chips, MCP query)
  sources-stream.js     — GLOBAL sources + uploads + processing state machine
  schedule-store.js     — scheduled-post queue (calendar)
  topics-store.js       — GLOBAL listening dossiers + the mock scan (flag `topics`)
  pillars-store.js      — GLOBAL content pillars: condensed context, dated sources, assets (flag `contentStrategy`)
  topics-catalog.js     — the six listening sources + cadences (CONFIG, like ff-catalog)
  composer-mentions.js  — per-session @mention pills in the composer
  composer-connector.js — composer's "Connected sources" submenu (feature-flagged)

  # Conversational flow orchestrators (drive the assistant thread + pickers)
  start-flow.js         — action-picker intro for an existing-Playbook chat
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
  topic-flow.js         — a topic opens a chat with itself attached as a Source

  # Studios (full-panel takeovers) + newer surfaces (not exhaustive — see docs/reference/FEATURES.md)
  batch-studio.js       — batch-of-posts studio (upload/analyse → review)
  clip-studio.js        — full-screen video clip extraction + editing studio
  top-posts-flow.js / top-posts-store.js — published-posts "winners" board + repurpose entry
  folders-store.js      — save-to-folder store; feedback-store.js — feedback submissions
  languages.js          — language catalog for multilingual Playbooks
  url-services.js       — recognises a service (Notion/Google Docs/…) from a pasted URL
  admin-menu.js         — sidebar cog Admin popover (user mode + feature flags + docs)

  screens/
    dashboard.js, session.js, ideas.js, contexts.js, playbook.js,
    connectors.js, topics.js, topics-settings.js,
    content-strategy.js, pillar.js, settings.js,
    welcome-alt.js, welcome-alt-recap.js
    _analyse-common.js  — shared "chat bubble + numbered picker bar" wizard primitives
    session/
      intake-lifecycle.js — flips source-intake turns loading→ready as sources process
      thinking-chip.js    — animated "thinking…" composer chip + elapsed/credit counter
      thread-turns.js     — renders each assistant-thread turn type
      wizard-keyboard.js  — keyboard nav (↑↓ / 1–9 / Enter / Esc) for the picker

  components/             — each exports init() (injects DOM once) + render/open()
    topbar.js             persistent header: route title (rename on session) +
                          Sources / Ideas / Drafts pills + status-card toggle; back on /playbook
    sidebar.js            left rail: brand, New chat, Search, Playbooks / Connectors / Topics nav,
                          recent chats (pin/rename/delete + Sort & group), footer popmenu (feedback/bug/shortcuts + Admin menu)
    right-panel.js        sliding panel — modes: drafts / ideas / sources / clips / context-brief
    conversation-status-card.js  floating in-progress card (sources/ideas/drafts counts)
    content-workspace.js  shared Sources+Ideas library layout (search / sort / By Source / All Ideas)
    source-card.js, idea-card.js, idea-card-compact.js, post-card.js, clip-card.js, empty-state.js
    topic-card.js         one listening dossier, summarised, in the /topics feed
    social-post-card.js   someone ELSE's published post, as evidence (not top-post-card)
    toast.js              showToast() snackbar (DS .ap-snackbar)
    shortcut-legend.js    ? key dialog
    # Modals (init → open → close, coordinated by modal-coordinator.js):
    add-source-modal.js   Upload / URL / Connectors tabs
    connectors-modal.js   connectors gallery + detail overlay (from composer Add / Sources panel / page)
    topic-modal.js        one dossier read end to end — 720px, prose measure
    generate-image-modal.js, video-clips-modal.js, schedule-modal.js,
    bug-report-modal.js, feedback-modal.js, chat-picker-modal.js,
    confirm-modal.js, rename-modal.js, search-modal.js

  modal-coordinator.js    one-overlay-at-a-time: requestOpen / notifyClose / bindOverlayDismissal
```

### The active Playbook is the app's one scope

The switcher is the **only** entry point to the Playbook — the nav row that pointed at the same object was a second door to one room and is gone. Its dropdown footer carries one verb — **Manage Playbooks** (`/contexts`) — the way OUT to the library where a Playbook is created, edited and deleted, which is a different job from switching and has no other door in the rail. "Open this Playbook" was the second verb and had to go: two destinations under a list of choices made the switcher read as a nav menu.

`active-playbook.js` holds **one** Playbook id, chosen from the switcher pinned above the nav in the sidebar and persisted in `localStorage` (`archie-active-playbook`). Everything below the switcher inherits it: Content strategy, the Topic feed, the new-session "Fresh topics to review" list, the recent-chats list, both nav counters, and a **new chat's** `contextId`.

**This replaced four pickers** — the composer's Playbook select, the Topic-feed form's, the New-pillar dialog's, and the Playbook facet on `/content-strategy`. Each asked the same question in a different place, and any two could disagree.

Two rules that keep it honest:

- **No "All Playbooks".** An escape hatch turns the guarantee (_everything you see is this brand_) back into a filter (_everything you see might be_), and every surface below would have to name its Playbook again — which is what this removed. Cross-brand views were the price.
- **A global scope HIDES.** Anything outside it is invisible rather than empty, so the switcher is permanent and always shows the brand name: the scope is only safe while it is legible.

An existing chat keeps whichever Playbook it was created in — a chat is a record, and re-scoping old records on a brand switch would rewrite history rather than filter it. Switching brand from a pillar or a feed lands on the **section**, never on another brand's object.

### The topbar can carry a screen's own controls

`topbar.setTopbarActions(actions, lead)` / `clearTopbarActions()`. Two slots — `actions` on the right, `lead` beside the title — used by the Topic feed for Filters (right) and the segmented control (left), which retired an in-page header costing ~96px above the fold. A **Feed-settings cog** is rendered on `/topic-feeds*` and nowhere else; it opens `/topic-feeds/settings`, that feed's own sources form. It was briefly on every topbar, pointing at a global settings space — both are gone: a cog on a chat's topbar promised configuration for a screen that has none. It is a **composition**, not a new component: what goes in is unmodified `.ap-button`s. The rule — only controls acting on the **whole screen** belong there. The screen owns the teardown, and must bind its own click listener on `#topbar`: that node is outside `#app`, so a screen's delegated handler does not reach it.

### State management

**No external store library.** Stores follow one pattern: a module-level `Map(sessionId → state)` (or a single array for catalogs) plus a `Set<fn>` of subscribers notified shallowly on each mutation, built with `createNotifier()` from `store-utils.js`. State seeds lazily from `mocks.js` on first read — **or stays empty in `new-alt` mode** (`isNewUser()`).

| Store                  | Domain                                                                     | Key public API                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions-store.js`    | chat sessions                                                              | `getSessions`, `getSessionById`, `updateSession`, `deleteSession`, `togglePin`, `subscribe`                                                                                                                                                                |
| `contexts-store.js`    | Playbooks                                                                  | `getContexts`, `getContextById`, `getDefaultContext`, `addContext`, `updateContext`, `duplicateContext`, `deleteContext`, `subscribe`                                                                                                                      |
| `connectors-store.js`  | connectors catalog + state                                                 | `getConnectors`, `findConnector`, `getConnectedConnectors`, `setConnectorStatus`, `subscribe`                                                                                                                                                              |
| `library.js`           | per-session ideas (sources delegate to sources-stream)                     | `getSources(sid)`, `getIdeas(sid)`, `appendExtractedIdeas`, `injectIdeasForSource`, `extractVideoIdeas`, `removeIdeas`, `subscribe(sid, fn)`                                                                                                               |
| `posts-store.js`       | per-session drafts                                                         | `getPosts(sid)`, `addPostDraft`, `updatePostContent`, `attachImageToDraft`, `removePost`, `subscribe(sid, fn)`                                                                                                                                             |
| `assistant.js`         | per-session thread                                                         | `getThread`, `sendMessage`, `sendConnectorMessage`, `postAssistantMessage`, `postSystemNotice`/`markSystemNoticeReady`, `postSourceIntake`, `postExtractionResult`, `postAssistantChoice`/`submitAssistantChoice`, `postDraftResult`, `subscribe(sid, fn)` |
| `sources-stream.js`    | **global** uploads + sources state machine (uploading → processing → done) | `getSources`, `getUploads`, `subscribeSources`, `subscribeUploads`, `startFileUpload`, `startUrlImport`, `startConnectorImport`, `extractClipsForSource`, `removeSources`, `renameSource`                                                                  |
| `schedule-store.js`    | scheduled-post queue                                                       | `getQueue`, `getQueueOn`, `addToQueue`, `removeFromQueue`, `busyCountsByDay`, `subscribe`                                                                                                                                                                  |
| `composer-mentions.js` | per-session composer mentions                                              | `addMention`, `removeMention`, `renderInto`, `subscribe(sid, fn)`                                                                                                                                                                                          |
| `topics-store.js`      | **global** listening dossiers + the mock scan (flag `topics`)              | `getTopics`, `getTopicById`, `getUnseenCount`, `countBySource`, `markSeen`, `dismissTopic`, `restoreTopic`, `refreshTopics`, `hasMoreToScan`, `topicWhen`, `subscribe`                                                                                     |
| `pillars-store.js`     | **global** content pillars (flag `contentStrategy`)                        | `getPillars`, `getPillarById`, `addPillar`, `updatePillar`, `deletePillar`, `mergePillar`, `removeSource`/`restoreSource`, `addAsset`/`removeAsset`, `unseenCount`/`unseenCountFor`/`markPillarSeen`, `pillarForBrief`, `unlinkBrief`, `subscribe`         |

`sources-stream` is the only **global** store. `library.js` subscribes to sources-stream and re-emits per-session so any session's content surfaces repaint when a source lands. **No localStorage persistence of app state** — only `archie-user-mode`, the feature-flag keys, sidebar collapse state, and the single-use `sessionStorage` handoff keys.

### A settings surface must not aggregate

**FOUR** attempts at a general settings page have been reverted here: the drawer (`2b0abcf`, the DS ships no side-drawer primitive), a Connectors section (`8cdd7e8`, it duplicated `/connectors`), `/settings` itself (`6fca0b0`), and the rail-plus-table version that argued it was scoped to one feature. Config belongs on the entity that owns it — never re-hosted in a global page.

**The fourth attempt is the instructive one.** It claimed the rule's "or on a route scoped to one feature" clause: once the Playbook became the app's scope, "which brands exist, and what each one's feed listens to" reads like one feature with two views. It still became a place you GO to configure things, one screen away from every object it configured — a table of Playbooks beside the Playbooks library that already existed, and a row per feed you had to find yourself instead of the feed you were looking at. Where things live now:

| To configure…       | Go to                                                       |
| ------------------- | ----------------------------------------------------------- |
| a Playbook          | `/contexts` (the library) → `/playbook/:id`                 |
| a feed's sources    | the feed's own topbar cog → `/topic-feeds/settings`         |
| Topics' six sources | `/topics/settings` — one feature, reached from that feature |
| the prototype Admin | the sidebar footer cog popover                              |

Read the second clause narrowly: a route scoped to one feature is one the FEATURE owns and links to from inside itself, not a hub several features are re-hosted in.

### Connectors as live, MCP-queryable sources

**Gated behind the `connectors` feature flag (default OFF)** — when off, every connectors surface (gallery route + sidebar nav, modal, composer Add → "Connected sources" submenu, Sources panel "Live connectors", Add-source modal Connectors tab) is hidden. Turn it on in Settings → Admin. Connector management lives only on the `/connectors` page/modal — Settings does not duplicate it.

Connectors (Notion, Slite, Google Drive, GitHub, …) are seeded in `mocks.js` (`connectors` + `connectorDocs`) with `category` / `featured` / `accent` / `capabilities`. Once **connected**, a connector becomes a **live source**: the user "asks" it in chat and `assistant.js` `sendConnectorMessage()` simulates an MCP round-trip — a "Querying … via MCP" reasoning chip listing tool calls, then a cited mock answer. Entry points: the `/connectors` gallery page (clicking a connector opens its detail in `connectors-modal.js`), the composer **Add** menu, and the right-panel **Sources** "Connect" / "Live connectors" surface. `connectors-view.js` holds the shared render helpers used by both the page and the modal; `connector-ask.js` launches the in-chat ask flow. All connect/disconnect goes through `connectors-store` so Settings, the gallery, and the modal stay in sync.

### Topics — the one place Archie proposes instead of waiting

**Gated behind the `topics` feature flag (default OFF)** — when off, the `/topics` route (a stale deep link bounces to `/`), its sidebar nav row + unseen counter, and the dossier dialog all disappear. The data (`mocks.topics`, `mocks.topicScanPool`, `ctx.topics`) rides along regardless, exactly like `playbookCompetitors`.

Agorapulse listening pulls social posts against **six sources** declared in `topics-catalog.js` — competitor posts, influencer posts, brand feedback, competitor monitoring, industry trends, global trends. That file is **CONFIG, not content**: it ships with the app and must exist in `new-alt` mode too, the same split as `ff-catalog.js` vs `mocks.js`. Which sources are on, plus **one cadence for the whole Playbook**, live on the Context as `ctx.topics = { enabledSourceIds, cadence }` (normalised by `normalizeTopics()` in `contexts-store.js` — in `addContext` **and** on the seed, which bypasses it). They are **edited on `/topics/settings`** — a settings PAGE, not a tab on the feed, because you set your sources once and then read topics for months; a tab gave it equal billing with the feed. It commits straight through `updateContext` with no Save button, shows **one Playbook at a time** scoped by `?pb=` (the same param the feed filters on, so the scope survives both directions), and uses the DS settings recipe (`--sys-settings-*`). Stacking a block per Playbook was tried and doesn't scale — twenty Playbooks meant 120 switches and every description repeated twenty times. Layout: the two page-level controls sit in a **labelled toolbar** (`.ap-form-field` × 2, the feed's two-select shape) and each of the six sources is **its own card** in a two-column grid — a card can carry that source's own options later, a row can't, and a card title over a single select was mostly padding.

**Not on the Playbook — that was tried and reverted.** A Playbook is a fact sheet: every section answers "who are you?". Which feeds are live and how often they run answers "what job should Archie run?" — operational, not declarative, and as a grid of switches it read as a settings panel wedged into a profile. The "config lives on its entity" rule has a second clause that covers this: _or on a route scoped to one feature_. The data stays per Playbook; only the surface moved.

Archie assembles those posts into a **Topic**: a headline (the claim), a written analysis, and the source posts behind it. `topics-store.js` is **global** — a topic belongs to a Playbook and arrives on a cadence, long before a chat exists to hold it, so the `/topics` feed spans every Playbook and the sidebar counter sums the whole account. **Cadence is copy, never a timer** (a weekly tick would never fire in a demo); the recurring feel comes from **Refresh now**, which drains a seeded pool and ages everything else by a day. `ageDays` is the single source of truth for age — the feed groups on it _and_ every "3 days ago" label derives from it via `topicWhen()`.

A topic offers exactly two actions: **Start a chat** and **Dismiss**. Start-a-chat (`topic-flow.js`) hands the topic to a fresh chat as a **Source** via the existing `addReadySource()` — no new action surface, no change to `sources-stream.js`, and every affordance the app already has (Extract ideas, Draft, Ask, the Sources panel) lights up on its own. Dismiss hides rather than deletes so the toast can genuinely offer Undo.

### Routing & screen lifecycle

`router.js` re-runs the matched handler on **every** `hashchange` (including query-only changes — it matches on the path with the query stripped). A screen's `render(params, target)` may return a cleanup function that the router invokes before the next render. URL state is encoded as hash query params (`#/session/:id?tab=posts&focusIdea=…`); read it with `parseHashParams()` and mutate with `setHashQuery(path, params)` (calls `navigate()`).

### Cross-screen handoffs

`handoff.js` exposes `setHandoff(key, payload)` / `consumeHandoff(key)` (atomic read+remove) / `hasHandoff(key)` over `sessionStorage`. Consumed at `session.js` mount:

| Key                          | Set by                                   | Consumed by →                     |
| ---------------------------- | ---------------------------------------- | --------------------------------- |
| `pendingStartFlow`           | dashboard / new chat with a Playbook     | `startActionPickerFlow`           |
| `pendingDraftIdeaId`         | idea card "Draft post"                   | `askProfileQuestion` (draft-flow) |
| `pendingAskSource`           | source card "Ask"                        | `askWhatToKnow`                   |
| `pendingAskConnector`        | connectors gallery/modal "Try in chat"   | `askConnector`                    |
| `pendingStartContextBuilder` | `/contexts` "New Playbook" + welcome-alt | `context-builder` (create)        |
| `pendingTopicChat`           | topic card / dialog "Start a chat"       | `startTopicChat` (topic-flow)     |

### Admin / user mode (prototype controls)

The **Admin** popover in the sidebar footer cog (`admin-menu.js`) is the prototype control panel: switch user mode and toggle feature flags (each change reloads so stores re-seed). `user-mode.js`: `getUserMode()` returns `"returning"` (populated mocks, default) or `"new-alt"` (empty stores + first-time onboarding); `isNewUser()`/`isNewUserAlt()` test for `new-alt`. Feature flags live in `ff-catalog.js` (`FLAGS`, each with a `default`) and are read via `isFlagOn()`. The 13 flags: `draftInlineEdit` (OFF), `playbookDefault` (OFF), `connectors` (OFF — gates the whole connectors feature), `conversationStatusCard` (OFF), `statusActionSnackbars` (OFF), `playbookColors` (OFF — colors hidden by default), `manyProfiles` (OFF — demo seed of ~40 connected profiles), `multilingualPlaybook` (OFF), `playbookCompetitors` (OFF — gates the Playbook's Competitors section), `imageStudioV2` (**ON** — the prompt-at-the-bottom redesign in `components/image-studio-v2/` is the Image Studio; OFF falls back to the previous one), `topics` (OFF — gates the whole Topics feature: the `/topics` feed, `/topics/settings`, the nav row, and the dossier dialog), `contentResearch` (OFF — gates the whole Topic-feeds feature: the `/topic-feeds*` routes, the nav row + counter, the composer's "Pick from Topic feeds" picker, and the new-session Topics list), `contentStrategy` (OFF — gates Content strategy: the `/content-strategy` and `/pillar/:id` routes, the nav row + counter, the New-pillar dialog, the composer's content-pillar picker, and on a topic card (feed AND the new-session "Fresh topics to review" list) the pillar mark plus the "Unlink from this pillar" menu row. NOT gated by it, because they belong to Topic feeds: the topic card's kebab menu itself, and the removal of the route tag). Full table + gates: [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md#14-admin-feature-flags--user-modes).

### Module loading

> ⚠️ **Deleting a module can "crash" a browser that still holds an old graph.** `index.html` carries no `?v=` of its own, so a stale copy asks for an old `src/app.js?v=N`; the browser answers that from its own cache and follows the imports THAT file names. Any module deleted since then 404s, the whole ES module graph fails to instantiate, and the app renders nothing — with no console error naming the cause. A hard reload (⇧⌘R) fixes it; `serve.json` sends `Cache-Control: no-cache` for html/js/css so `npm start` can't get into that state.

ES modules with `?v=N` cache-busting suffixes (`from "./assistant.js?v=40"`). **Bumping a module's version means updating every importer to the same version** — a singleton/store imported at two versions becomes two separate instances (separate state). All deps are local; no CDN/`esm.sh` imports. `package.json` exists only for the two DS npm packages + tooling (prettier/husky/lint-staged). A pre-commit hook runs `prettier --write` on staged files.

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
   - **Never** redeclare a `.ap-*` class with overrides outside `ds-patches.css` — it flips the cascade silently.
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
  screens/          — dashboard, session, ideas, contexts, connectors, topics,
                      topics-settings, content-strategy (list + pillar + dialog),
                      posts, analyse, modals, sources, welcome
  components/       — sidebar, right-panel, conversation-status-card,
                      add-source-modal, connectors-modal, schedule-modal,
                      video-clips-modal, clip-card, archie-loader,
                      topic-badge (shared by 3 surfaces), topic-modal, social-post-card
```

### Token tiers

- `--ref-*` — reference tokens (colors, spacing, fonts, radii) from the DS.
- `--sys-*` — semantic tokens (text/border colors, component states) — prefer these.
- `--comp-*` — component-level tokens — do not use directly in app CSS.

Exception: the `sparklesMermaid` icon uses inline SVG for its gradient fill. Third-party brand colors (connector accents, social logos) live as data in JS, not as DS tokens.

## Key conventions

- `index.html` is HTML markup only — all UI is rendered by JS.
- All seed data lives in `src/mocks.js`.
- Event wiring is **pure event delegation** with `data-*` attributes on the screen/modal/panel root. No inline `onclick`, no per-child `addEventListener` for interactive elements.
- Keep `?v=N` import suffixes consistent across importers; bump in lockstep when a module changes its exports or is a shared singleton/store.
- The `html` tagged-template escapes interpolations by default — wrap trusted HTML fragments in `raw()`, and do **not** double-escape (don't call `escapeHtml()` on a value already interpolated into an `html` template).
- Commit one change at a time on the current branch; do not push or create branches.

## Docs

All docs (except this file and `README.md`) live under [`docs/`](docs/). Start from [`docs/README.md`](docs/README.md) for the full index.

- [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md) — **functional catalog of every app feature** (flows, states, entry points). Start here to learn what the app does.
- [`docs/reference/UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md) — concrete DS usage (ds-patches inventory, app tokens, UI patterns, the loader system, colour convention).
- [`docs/reference/`](docs/reference/) — current truth about the proto (architecture, routes, stores, design system, glossary).
- [`docs/audits/`](docs/audits/) — current audits (PROD-VS-PROTOTYPE, PROD-CHANGES).
- [`docs/copy/`](docs/copy/) — UX copy principles (voice, tone, glossary).

## MCP

- `ds-css` — design-system tools: `validate_css`, `recommend_token`, `search_tokens`, `get_component`, `list_components`, `search_icons`, `get_text_style`, `get_layout_pattern`. (`.mcp.json` ships this server.)
- `plugin:figma:figma` (when enabled) — design ↔ code: `use_figma`, `get_design_context`, `get_screenshot`, `generate_diagram`, etc.
- A live browser **preview** is available for verification (navigate routes, click, screenshot, read console).
