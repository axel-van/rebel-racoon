# Alpha test feedback — issues, prototype status & drafted solutions

> Synthesis of 12 live alpha sessions run by Mike Allton (Bex / Oh So Social, Brad Friedman, Debbie Friez / TopRank, Kami Huyse / Zoetica, Amanda Robinson / The Digital Gal, Anne Popolizio & Reyna Pizarro / Social Squib, Peg Fitzpatrick / Kreussler, Mari Smith, Brooke Sellas / B Squared, Amanda Webb / Spiderworking, Goldie Chan / Warm Robots) **plus Mike's own observations**.
>
> ⚠️ **Testers were on a much older build.** Each issue below is tagged with its status in the _current prototype_ so we don't re-solve what's already done. This doc is a **pick-list**: each item has a stable number — say e.g. "let's do 1, 3, 4, 5" and I'll implement those.

---

## How to read this

Each issue has:

- **Said by** — which testers raised it (and Mike's own obs).
- **Status** — where the _current_ prototype stands: ✅ Done · 🟡 Partial / framework-ready · 🔴 Gap · 🐞 Bug.
- **Effort** — rough proto build size: **S** (hours) · **M** (a day-ish) · **L** (new data model / multi-file).
- **Solution** — concrete drafted approach against the real codebase.

---

## Pick-list (at a glance)

| #                                               | Issue                                                                                                                          | Status            | Effort |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ |
| **Quick wins**                                  |                                                                                                                                |                   |        |
| 1                                               | Remove / soften the process-timer ("25s · 3 credits")                                                                          | 🔴 still shipping | S      |
| 2                                               | Download-image button on drafts                                                                                                | 🔴 Gap            | S      |
| 3                                               | Word count on draft cards                                                                                                      | 🔴 Gap            | S      |
| 4                                               | Paste plain text as a source (no PDF conversion)                                                                               | 🔴 Gap            | S      |
| 5                                               | Emoji on/off preference on the Playbook                                                                                        | 🟡 demo-only      | S      |
| 6                                               | Playbook auto-named from meta title, not raw domain                                                                            | 🟡 Partial        | S      |
| 7                                               | Change / re-analyze voice profile without deleting the Playbook                                                                | 🔴 Gap            | M      |
| 16                                              | Distinct styling for the "why pick a profile" explainer                                                                        | 🟡 Partial        | S      |
| 17                                              | First-run onboarding nudge (don't skip setup)                                                                                  | 🟡 Partial        | S      |
| 24                                              | Surface the voice-doc upload earlier in onboarding                                                                             | 🟡 hidden         | S      |
| **Framework exists, needs completion**          |                                                                                                                                |                   |        |
| 8                                               | Turn connectors on + add Airtable / Zoom / Fathom                                                                              | 🟡 flag OFF       | M      |
| 9                                               | Bulk / folder-level ingest from a connector                                                                                    | 🟡 Partial        | M      |
| 10                                              | Brand-color input in image generation                                                                                          | 🔴 Gap            | M      |
| 11                                              | Reference-image / style-guide upload for image gen                                                                             | 🔴 Gap            | M      |
| 12                                              | First-comment defaults to a link to the source asset                                                                           | 🟡 stub           | M      |
| 13                                              | Carousel output format (LinkedIn / Instagram)                                                                                  | 🔴 Gap            | M      |
| 14                                              | Inline shorter / longer / warmer toggles on drafts                                                                             | 🟡 Partial        | M      |
| 15                                              | Voice-crawl failure handling (expired token / no data)                                                                         | 🔴 Gap            | M      |
| 18                                              | Native visual-asset library                                                                                                    | 🔴 Gap            | M      |
| 22                                              | Voice-fidelity tuning (kill generic / negative phrasing)                                                                       | 🟡 inconsistent   | M      |
| **Bugs**                                        |                                                                                                                                |                   |        |
| 23                                              | Video ideas landing in the wrong chat thread                                                                                   | 🐞 fragile        | M      |
| **Larger (new data models — scope separately)** |                                                                                                                                |                   |        |
| 20                                              | Client approval workflow                                                                                                       | 🔴 Gap            | L      |
| 21                                              | Shared team chat histories                                                                                                     | 🔴 Gap            | L      |
| **Already done — re-test with these testers**   |                                                                                                                                |                   |        |
| ✓                                               | Collapse left nav (Bex) · Auto-open drafts (Amanda R.) · Best-times scheduling (Brooke) · Pill single/multi distinction (Mike) | ✅                | —      |

---

## Recurring positive (keep / protect)

Copy quality and "no cheesy AI text" praised by **Bex, Brad, Kami, Brooke, Mari**. Video clip/quote mining loved by **Goldie**. Onboarding speed praised by **Brad**. These are strengths — guard against regressions. Note the **tension** with issue 22 (Goldie, Amanda Robinson, Amanda Webb hit generic / robotic / negative-framing output): voice fidelity is _inconsistent_, not broadly broken.

---

# Quick wins

## 1 · Remove / soften the process-timer

- **Said by:** Peg ("removing the generation timer — showing how long it took feels like useless information"), Mike's obs ("displayed text such as time to process… clutters the chat history and conditions the user to ignore text").
- **Status:** 🔴 The current build _still_ shows `"25s · 3 credits"` — `src/screens/session/thinking-chip.js` formats elapsed + a `seconds/6` credit count and updates every second.
- **Solution:**
  - Default: drop the elapsed/credit readout entirely; keep only the animated "thinking…" label so the user knows work is in flight.
  - Keep the 30s "taking longer than expected" toast (`THINKING_TIMEOUT_MS`) — that's _useful_ signal, the per-second count is not.
  - If we want to retain it for debugging, gate it behind a feature flag (`ff-catalog.js`, default OFF) rather than show it to users.
  - Files: `src/screens/session/thinking-chip.js`.

## 2 · Download-image button on drafts

- **Said by:** Kami ("native 'download image' button within the drafts space so assets can be saved out for blog/email"), Peg (native content libraries — adjacent).
- **Status:** 🔴 Can generate/regenerate/attach an image but never export it. `posts-store.attachImageToDraft` stores it; `post-card.js` renders it with no save action.
- **Solution:**
  - Add a hover/overflow action on the attached-image block in `post-card.js` (`data-post-image-download`) → triggers a download of the image (anchor with `download` attr; mock images are data/asset URLs).
  - Mirror it in the right-panel drafts mode for parity.
  - DS: use an existing icon (`search_icons download`), `.ap-button.ghost` sizing.
  - Files: `src/components/post-card.js`, `src/components/right-panel.js`.

## 3 · Word count on draft cards

- **Said by:** Mari ("at-a-glance word count for the generated social drafts").
- **Status:** 🔴 No length indicator anywhere on the card.
- **Solution:**
  - Compute count from the draft body in `post-card.js` render; show a small muted metaline (e.g. `142 words · 980 chars`).
  - Consider a per-network character ceiling hint later (X 280, LinkedIn 3000) — start with a plain count.
  - Files: `src/components/post-card.js` (+ a tiny helper in `src/utils.js` if reused).

## 4 · Paste plain text as a source

- **Said by:** Amanda Robinson ("friction when the interface required converting a simple text blurb into a PDF before processing").
- **Status:** 🔴 `add-source-modal` has only Upload / URL / Connectors tabs — no raw-text intake.
- **Solution:**
  - Add a **"Paste text"** tab (or a textarea under Upload) in `add-source-modal.js`.
  - On submit, route through `sources-stream` as a new `text` kind source (already exists in `file-kinds.js`) → straight to `processing → done`, no file needed.
  - Files: `src/components/add-source-modal.js`, `src/sources-stream.js` (add a `startTextImport`), `src/file-kinds.js` (already maps `text`).

## 5 · Emoji on/off preference on the Playbook

- **Said by:** Amanda Webb ("rarely uses emojis in her regular copy").
- **Status:** 🟡 "No emojis" exists only as demo prose inside mock Playbook style rules — not a real control.
- **Solution:**
  - Add an `emojis: 'minimal' | 'none' | 'liberal'` field to the Playbook voice profile (contexts-store + mocks).
  - Surface as a toggle in the Playbook editor ("How you sound" section) and respect it in mock draft generation (`draft-flow.js`).
  - Files: `src/mocks.js`, `src/contexts-store.js`, `src/components/right-panel.js` (voice section), `src/draft-flow.js`.

## 6 · Playbook auto-named from meta title, not raw domain

- **Said by:** Brad ("Archie named his playbook from his raw domain string rather than the cleaner corporate title in his site's meta tags").
- **Status:** 🟡 `context-mock-analysis.deriveName()` title-cases the domain slug only.
- **Solution:**
  - In the mock analysis, add a `metaTitle` to the per-site mock data and prefer it over the derived slug; fall back to the slug when absent.
  - Files: `src/context-mock-analysis.js` (add `metaTitle` to site mocks + prefer it in `analyzeWebsite`), `src/context-builder.js` (already reads `analysis.name`).

## 16 · Distinct styling for the "why pick a profile" explainer

- **Said by:** Mike's obs ("testers make that section too fast… the text that explains it is the same font treatment as the text around it and tends to blend together").
- **Status:** 🟡 Explainer copy uses the same `.muted` treatment as every other caption (`_analyse-common.js`).
- **Solution:**
  - Give the profile-selection rationale a distinct treatment — a small DS callout / info block above the options instead of an inline muted caption, or bolded lead-in.
  - Check `get_component callout` on `ds-css`; style in `styles/screens/analyse.css`, not inline.
  - Files: `src/screens/_analyse-common.js`, `src/context-builder.js` (profile question), `styles/screens/analyse.css`.

## 17 · First-run onboarding nudge (don't skip setup)

- **Said by:** Brooke ("accidentally skipped the setup instructions"), Peg ("adding an onboarding prompt for new users").
- **Status:** 🟡 `welcome-alt` onboarding exists but setup steps can be skipped/missed.
- **Solution:**
  - Add a lightweight first-run prompt/coachmark on the new-user path that orients the user before the wizard ("Let's build your Playbook — 3 quick steps").
  - Files: `src/screens/welcome-alt.js`, `src/context-builder.js`.

## 24 · Surface the voice-doc upload earlier

- **Said by:** Kami ("wanted to share an extensive voice document she already has prepared but there's no mechanism for that").
- **Status:** 🟡 The mechanism **exists** (`playbook-editor.js` `askVoiceDocument`) but is buried — Kami never found it.
- **Solution:**
  - Promote the "Drop a brand/voice document" step into the main onboarding wizard (`context-builder.js`), not just the per-field editor, and reference it in the recap.
  - Files: `src/context-builder.js`, `src/playbook-editor.js` (reuse `askVoiceDocument` + `runDocumentAnalysis`).

---

# Framework exists, needs completion

## 8 · Turn connectors on + add Airtable / Zoom / Fathom

- **Said by:** Brad (Google Drive), Debbie (Dropbox + Google Drive + Zoom), Kami (Claude projects + Google Drive via MCP), Anne/Reyna (Airtable), Brooke (SharePoint), Amanda Webb (Google Workspace + Dropbox), Mari (Fathom).
- **Status:** 🟡 Connector framework + live MCP querying exists (15+ connectors seeded incl. Google Drive, Dropbox, OneDrive, SharePoint-equiv, Notion, Slack…) but **gated behind the `connectors` flag (default OFF)**, and Airtable / Zoom / Fathom aren't in the catalog.
- **Solution:**
  - For demos: flip the `connectors` flag ON (Settings → Admin) so the gallery, composer submenu, and Sources "Live connectors" all appear.
  - Add **Airtable, Zoom, Fathom** to `mocks.js` (`connectors` + `connectorDocs`) with `category` / `accent` / `capabilities`, matching the existing shape.
  - Confirm each new connector works as a chat-query source via `connector-ask.js` + `assistant.sendConnectorMessage`.
  - Files: `src/mocks.js`, `src/feature-flags.js` / Settings Admin toggle, `src/connectors-store.js` (no change needed if data shape matches).

## 9 · Bulk / folder-level ingest from a connector

- **Said by:** Brad ("200+ legacy podcast files in nested Google Drive folders — point at a directory and ingest in bulk"), Debbie ("centralized dashboard that pulls and slices files automatically").
- **Status:** 🟡 Folders are _browseable_ in connector doc lists, but `startConnectorImport` pulls one doc at a time.
- **Solution:**
  - Add multi-select (checkboxes) + a "Select folder" / "Import all" action in the connectors browse UI.
  - Extend `sources-stream` with a batch import that fans out the selected docs through the existing `uploading → processing → done` machine, with the status card reflecting the batch count.
  - Files: `src/components/connectors-modal.js` / `src/connectors-view.js`, `src/sources-stream.js` (`startConnectorImportBatch`), `src/components/conversation-status-card.js`.

## 10 · Brand-color input in image generation

- **Said by:** Anne/Reyna ("could not input all four of their brand colors"), Peg & Amanda Webb (imagery doesn't match brand aesthetic).
- **Status:** 🔴 `generate-image-modal` offers only Visual Style + Mood chips; no color input, no read of the Playbook palette.
- **Solution:**
  - Add a brand-color picker to the modal — pre-filled from the Playbook's stored palette, allowing **4+** swatches (the old build capped them).
  - Fold the chosen colors into the generated prompt string.
  - Files: `src/components/generate-image-modal.js`, read palette from `contexts-store`.

## 11 · Reference-image / style-guide upload for image gen

- **Said by:** Kami (uploaded an event banner as a style reference — worked on old build after iteration), Amanda Webb & Goldie (reference styles).
- **Status:** 🔴 Current `generate-image-modal` is text-only — `generateImage()` takes `(prompt, seed)`, no image input. (Regression vs. what Kami used.)
- **Solution:**
  - Add a reference-image file input; thread it through `generateImage()` and reflect it in the result ("matched your reference layout, swapped header text").
  - Files: `src/components/generate-image-modal.js`.

## 12 · First-comment defaults to a link to the source asset

- **Said by:** Mike's obs ("when repurposing a public asset… the real-life first-comment CTA would be a link to that asset, not one of the global CTAs — should be an option without editing the draft").
- **Status:** 🟡 `firstComment` field exists on the post model but isn't auto-populated or source-linked.
- **Solution:**
  - When a draft is generated from a URL/video source, default the first comment to that source link; offer a toggle between "link to source" and the Playbook's global CTA.
  - Files: `src/draft-flow.js` (populate on creation), `src/posts-store.js` (`firstComment`), `src/components/post-card.js` (toggle UI).

## 13 · Carousel output format (LinkedIn / Instagram)

- **Said by:** Brooke (LinkedIn carousel), Amanda Webb (Instagram carousels), Goldie (adjacent).
- **Status:** 🔴 Output formats are video aspect ratios only (`clip-formats.js`); no carousel concept.
- **Solution:**
  - Add a **carousel** draft format in the draft-flow channel/format picker → produces a multi-slide draft (slide list + per-slide copy) rendered in `post-card.js`.
  - Files: `src/draft-flow.js`, `src/mocks.js` (sample carousel), `src/components/post-card.js` (slide rendering), possibly `src/clip-formats.js` for the slide ratios.

## 14 · Inline shorter / longer / warmer toggles

- **Said by:** Goldie ("instant refresh toggles like Adobe Express — shorter, longer, or warmer").
- **Status:** 🟡 Full regenerate exists (`draft-rewrite.js`, sparkles button) but it's all-or-nothing, no tone/length intent.
- **Solution:**
  - Add quick-adjust chips on the draft card (Shorter · Longer · Warmer · More formal) that pass an intent into `startRewrite()`; the mock rewrite biases the output accordingly (trim, expand, soften).
  - Pairs naturally with the `draftInlineEdit` flag already in `ff-catalog.js`.
  - Files: `src/components/post-card.js`, `src/draft-rewrite.js`.

## 15 · Voice-crawl failure handling

- **Said by:** Debbie (crawler failed to pull historic voice from Facebook), Mari (expired-token error blocked the FB page → fell back to LinkedIn), Goldie (token-refresh lag missed recent LinkedIn history).
- **Status:** 🔴 Mock analysis always succeeds — no error/fallback/retry path.
- **Solution:**
  - Add a simulated failure branch in `context-mock-analysis` + the wizard: on "failure", show a graceful message and offer **(a)** pick a different profile, **(b)** upload a voice doc instead, **(c)** retry.
  - Lets us demo the recovery story instead of a dead end.
  - Files: `src/context-mock-analysis.js`, `src/context-builder.js`. Overlaps with **#7** (re-pick affordance) — do them together.

## 18 · Native visual-asset library

- **Said by:** Peg ("native user content libraries for visual assets"), Kami (download/reuse adjacent).
- **Status:** 🔴 Right-panel modes are drafts / ideas / sources / clips / context-brief — no media/asset library.
- **Solution:**
  - Add an **Assets** panel mode that collects generated + uploaded images for reuse, with attach-to-draft and download actions.
  - Larger than the other M items because it needs a small asset store; consider after #2/#10/#11 land (they produce the assets it would hold).
  - Files: new `src/assets-store.js`, `src/components/right-panel.js` (new mode), `src/components/topbar.js` (pill).

## 22 · Voice-fidelity tuning

- **Said by:** Goldie ("generic phrasing tells — obvious machine writing"), Amanda Robinson ("sounded artificial, leaned too heavily into negative framing"), Amanda Webb (default styling she'd scroll past). Counterweight: praised by Bex/Brad/Kami/Brooke/Mari.
- **Status:** 🟡 Output quality is mock/prompt-driven and inconsistent.
- **Solution:**
  - Audit the mock draft templates in `mocks.js` / `draft-flow.js` for generic openers and negative framing; diversify hooks; wire outputs to the voice profile + emoji preference (#5) + uploaded voice doc (#24) so the Playbook actually steers tone.
  - Files: `src/mocks.js`, `src/draft-flow.js`, `docs/copy/copy-principles.md` (align with voice rules).

---

# Bugs

## 23 · Video ideas landing in the wrong chat thread

- **Said by:** Goldie ("video ideas were mistakenly dumped into her previous text chat thread").
- **Status:** 🐞 `library.js` dual-writes extracted ideas into both the per-session `ideasMap` and the global `seedIdeas` array — works today but is fragile; cross-session bleed is exactly this failure mode.
- **Solution:**
  - Tighten the boundary: extracted video ideas should write to the _originating_ session only; audit `injectIdeasForSource` / `extractVideoIdeas` so the global write can't surface ideas in another session's thread.
  - Files: `src/library.js`, `src/sources-stream.js`.

---

# Larger — new data models (scope separately)

## 20 · Client approval workflow

- **Said by:** Debbie ("client approval channels could solve her biggest bottleneck — waiting for slow clients to approve/publish scheduled assets").
- **Status:** 🔴 Drafts go draft → scheduled with no review gate; no approval state anywhere.
- **Solution (sketch):**
  - Introduce an approval state on posts (`pending_approval → approved/rejected`) + an approval view/inbox + an approver role.
  - Needs a real data model and several surfaces — recommend a dedicated design pass, not a quick patch.
  - Files: `src/posts-store.js`, `src/schedule-store.js`, new approval surface, `src/mocks.js`.

## 21 · Shared team chat histories

- **Said by:** Anne/Reyna ("org team members cannot see each other's chat histories yet").
- **Status:** 🔴 Single-user model — `sessions-store` has no user/org/sharing fields.
- **Solution (sketch):**
  - Add ownership + visibility to sessions and a team/workspace switcher; filter the sidebar by owner with a "shared with me" view.
  - Multi-user is a foundational change — scope as its own initiative.
  - Files: `src/sessions-store.js`, `src/mocks.js`, `src/components/sidebar.js`.

---

# Already addressed — re-test with these testers

| Done                                                     | Tester to re-test   | Evidence                                                     |
| -------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Collapsible left nav (Cmd/Ctrl+B, persisted)             | **Bex**             | `src/components/sidebar.js`, `styles/components/sidebar.css` |
| Drafts panel auto-opens on new batch                     | **Amanda Robinson** | `src/screens/session.js` (`openDraftsPanel`)                 |
| Best-time-to-post scheduling (per-network optimal slots) | **Brooke**          | `src/components/schedule-modal.js` (`optimalSlots`)          |
| Pill single vs multi-select now visually distinct        | **Mike**            | `src/screens/_analyse-common.js` (chevron vs check)          |
| Deleted-draft reappear bug not reproduced                | **Amanda Robinson** | `src/posts-store.js` (`removePost`) — spot-check to confirm  |
| "Sourced from website" badge appears removed             | **Mike**            | not found in current wizard — confirm                        |

---

_Generated 2026-06-10 from Mike Allton's alpha-test transcripts. Numbers are stable references for picking work — e.g. "do 1, 3, 4, 5"._
