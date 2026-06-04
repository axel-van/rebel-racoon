# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive prototype for exploring and validating Agorapulse UI redesigns — specifically **Archie**, an AI content assistant (sources → ideas → drafts → schedule). No build step, no bundler — static ES modules served locally. The codebase mixes English (code, UI copy) and French (some comments). Archie speaks in the first person ("I", "Let's") — never third-person "Archie" — in user-facing copy.

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

| Route                | Screen                 | Notes                                                                                              |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `/`                  | `dashboard.js`         | Redirect-only: first-time → `/welcome-alt`, returning → most-recent session or a fresh one         |
| `/session/:id`       | `session.js`           | The main chat surface (largest file); hosts the assistant thread, composer, and per-session flows  |
| `/ideas`             | `ideas.js`             | Standalone Ideas library (grid + kind filter + search + sort)                                      |
| `/contexts`          | `contexts.js`          | Standalone **Playbooks** library (cards + edit)                                                    |
| `/playbook/:id`      | `playbook.js`          | Playbook detail page (topbar back → `/contexts`)                                                   |
| `/connectors`        | `connectors.js`        | Connectors gallery (marketplace); detail opens in a modal                                          |
| `/settings`          | `settings.js`          | Two-pane: Social accounts / Admin (prototype controls). Connectors live on `/connectors`, not here |
| `/welcome-alt`       | `welcome-alt.js`       | First-time onboarding kickoff (thin redirect into a transient session)                             |
| `/welcome-alt/recap` | `welcome-alt-recap.js` | Onboarding recap reveal of the built Playbook                                                      |

`setAfterRender` (in `app.js`) re-renders the sidebar + conversation-status-card after every route change and toggles the `body.onboarding` full-bleed class for the welcome-alt flow.

> **Vocabulary:** a saved AI context is a **Playbook** (UI label) but the code/store calls it a **Context** (`contexts-store`, `contextId`). Source → Idea → Draft (post) → Schedule is the content pipeline.

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
  composer-mentions.js  — per-session @mention pills in the composer

  # Conversational flow orchestrators (drive the assistant thread + pickers)
  start-flow.js         — action-picker intro for an existing-Playbook chat
  draft-flow.js         — "Draft post from idea" turn sequence (channel pick → execute → result)
  draft-rewrite.js      — regenerate-a-draft (thinking → streaming → commit)
  context-builder.js    — Playbook creation/edit conversation (drives welcome-alt + edits)
  playbook-editor.js    — per-field Playbook edit mini-conversation (from /contexts)
  playbook-view.js      — shared Playbook render engine (recap + detail)
  context-mock-analysis.js — deterministic mock "website analysis" for onboarding
  sidebar-wizard.js     — multi-stage numbered-option wizard inside the assistant panel
  inline-question.js    — one-shot numbered-option picker inside the assistant panel
  library-actions.js    — shared bulk-bar (Extract/Delete) + click dispatch for content lists
  social-profiles.js    — connected social accounts (source of truth for profile pickers)
  clip-formats.js        — video aspect-ratio catalog
  connectors-view.js    — shared pure render helpers for the connectors gallery + detail
  connector-ask.js      — launches the in-chat "Ask a connector" flow (gallery + right panel)

  screens/
    dashboard.js, session.js, ideas.js, contexts.js, playbook.js,
    settings.js, connectors.js, welcome-alt.js, welcome-alt-recap.js
    _analyse-common.js  — shared "chat bubble + numbered picker bar" wizard primitives
    session/
      intake-lifecycle.js — flips source-intake turns loading→ready as sources process
      thinking-chip.js    — animated "thinking…" composer chip + elapsed/credit counter
      wizard-keyboard.js  — keyboard nav (↑↓ / 1–9 / Enter / Esc) for the picker

  components/             — each exports init() (injects DOM once) + render/open()
    topbar.js             persistent header: route title (rename on session) +
                          Sources / Ideas / Drafts pills + status-card toggle; back on /playbook
    sidebar.js            left rail: brand, New chat, Search, Ideas / Playbooks / Connectors nav,
                          recent chats (pin/rename/delete), footer popmenu (feedback/bug/shortcuts/settings)
    right-panel.js        sliding panel — modes: drafts / ideas / sources / clips / context-brief
    conversation-status-card.js  floating in-progress card (sources/ideas/drafts counts)
    content-workspace.js  shared Sources+Ideas library layout (search / sort / By Source / All Ideas)
    source-card.js, idea-card.js, idea-card-compact.js, post-card.js, clip-card.js, empty-state.js
    toast.js              showToast() snackbar (DS .ap-snackbar)
    shortcut-legend.js    ? key dialog
    # Modals (init → open → close, coordinated by modal-coordinator.js):
    add-source-modal.js   Upload / URL / Connectors tabs
    connectors-modal.js   connectors gallery + detail overlay (from composer Add / Sources panel / page)
    generate-image-modal.js, video-clips-modal.js, schedule-modal.js,
    bug-report-modal.js, feedback-modal.js, chat-picker-modal.js,
    confirm-modal.js, rename-modal.js, search-modal.js

  modal-coordinator.js    one-overlay-at-a-time: requestOpen / notifyClose / bindOverlayDismissal
```

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

`sources-stream` is the only **global** store. `library.js` subscribes to it and re-emits per-session so any session's content surfaces repaint when a source lands. **No localStorage persistence of app state** — only `archie-user-mode`, the feature-flag keys, sidebar collapse state, and the single-use `sessionStorage` handoff keys.

### Connectors as live, MCP-queryable sources

**Gated behind the `connectors` feature flag (default OFF)** — when off, every connectors surface (gallery route + sidebar nav, modal, composer Add → "Connected sources" submenu, Sources panel "Live connectors", Add-source modal Connectors tab) is hidden. Turn it on in Settings → Admin. Connector management lives only on the `/connectors` page/modal — Settings does not duplicate it.

Connectors (Notion, Slite, Google Drive, GitHub, …) are seeded in `mocks.js` (`connectors` + `connectorDocs`) with `category` / `featured` / `accent` / `capabilities`. Once **connected**, a connector becomes a **live source**: the user "asks" it in chat and `assistant.js` `sendConnectorMessage()` simulates an MCP round-trip — a "Querying … via MCP" reasoning chip listing tool calls, then a cited mock answer. Entry points: the `/connectors` gallery page (clicking a connector opens its detail in `connectors-modal.js`), the composer **Add** menu, and the right-panel **Sources** "Connect" / "Live connectors" surface. `connectors-view.js` holds the shared render helpers used by both the page and the modal; `connector-ask.js` launches the in-chat ask flow. All connect/disconnect goes through `connectors-store` so Settings, the gallery, and the modal stay in sync.

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
| `pendingStartPlaybookEditor` | `/contexts` card edit                    | `playbook-editor`                 |

### Admin / user mode (prototype controls)

`/settings` → **Admin** section is the prototype control panel (replaces the old floating chip): switch user mode and toggle feature flags (each change reloads so stores re-seed). `user-mode.js`: `getUserMode()` returns `"returning"` (populated mocks, default) or `"new-alt"` (empty stores + first-time onboarding); `isNewUser()`/`isNewUserAlt()` test for `new-alt`. Feature flags live in `ff-catalog.js` (`FLAGS`, each with a `default`) and are read via `isFlagOn()` (e.g. `connectors` — default OFF, gates the whole connectors feature; `sidebarIdeas`, `hidePlaybookColors`, `conversationalPlaybookEdit`, `draftInlineEdit`).

### Module loading

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
  screens/          — dashboard, session, ideas, contexts, connectors, settings,
                      posts, analyse, playbook-editor, modals, sources, welcome
  components/       — sidebar, right-panel, conversation-status-card,
                      add-source-modal, connectors-modal, schedule-modal,
                      video-clips-modal, clip-card, archie-loader
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

- `README.md` — repo overview.
- `docs/AGENTS.md` — agent/automation notes.
- `AUDIT-stabilisation.md`, `AUDIT-production-readiness.md` — audit findings + prioritised lots.
- `FLOW-CHANGELOG.md` — commit ↔ FIND-XXX status table.
- `docs/copy-principles.md`, `docs/copy-audit.md`, `docs/copy-rewrites.md` — UX copy guidance.
- `docs/archive/` — earlier audit reports (e.g. `FLOW-AUDIT.md`). `audit-assets/` — Mermaid sources + SVG renders for the Figma cartography.

## MCP

- `ds-css` — design-system tools: `validate_css`, `recommend_token`, `search_tokens`, `get_component`, `list_components`, `search_icons`, `get_text_style`, `get_layout_pattern`. (`.mcp.json` ships this server.)
- `plugin:figma:figma` (when enabled) — design ↔ code: `use_figma`, `get_design_context`, `get_screenshot`, `generate_diagram`, etc.
- A live browser **preview** is available for verification (navigate routes, click, screenshot, read console).
