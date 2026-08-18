# Acceptance criteria — Topic Feed & the chat surfaces it feeds

Derived from the `proto/content-research` prototype at `f8047f60`, by reading the
implementation and exercising the running app. Written to be executed by an
engineer or an agent with browser access: every criterion names the object it
acts on and a way to observe the result.

**Status:** proposed. Nothing here has been agreed with engineering yet.

---

## 0. Scope

### In scope

| Area                        | Surfaces                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Topic Feed                  | `/topic-feeds`, `/topic-feeds/:id`, `/topic-feeds/:id/attention`, `/topic-feeds/settings`                                                  |
| Chat, where Topics enter it | the new-chat "Fresh topics to review" list, the composer's **Pick from the Topic Feed**, the Topic article dialog, the source-posts dialog |
| The Topic object            | ordering, grouping, triage state, attention signals, the article and its versions                                                          |

### Explicitly OUT of scope — deferred to the Content-strategy iteration

Content pillars are a separate iteration and are **not** covered here. Do not
treat any of the following as a defect against this document:

- `/content-strategy`, `/pillar/:id`, and everything the pillar object owns.
- The **pillar mark** on a Topic card and in the starter list, and the kebab's
  _Link to a Content pillar_ / _Unlink_ rows.
- The composer's **Post about a Content Pillar** entry.

**Two couplings you must know about, because they change behaviour in scope.**
The prototype currently defines two in-scope behaviours in terms of pillars:

| Coupling                      | Prototype behaviour                                                                                                                                      | What this document specifies instead                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Segment split (`AC-SEG-*`)    | A Topic is in _Topics for later_ when `researchType = content-strategy` **and** no pillar has claimed it. Linking a pillar moves it to _Ready to draft_. | The split is on `researchType` **alone**. The pillar half is a Content-strategy concern and must be added by that iteration, not assumed here. |
| Picker contents (`AC-PICK-2`) | _Ready to draft_ is computed with the same pillar-aware predicate.                                                                                       | Same: `researchType` alone.                                                                                                                    |

Build the type-only rule. The Content-strategy iteration layers the pillar
condition on top of it and owns the AC for doing so.

### Not specified here

Visual design, copy wording, and animation timings are given only where they
carry meaning (a delay that is the feature, a colour that encodes state).
Everything else is the design system's business.

---

## 1. The objects

An engineer needs these three to read the rest.

### Topic (`brief` in code)

What one scan produced about one theme. **Server-owned.**

| Field          | Type                                  | Notes                                                               |
| -------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `id`           | string                                | stable across re-scans                                              |
| `laneId`       | string                                | the feed it belongs to                                              |
| `sourceId`     | enum                                  | one of the 8 catalogue sources                                      |
| `researchType` | `ready-to-post` \| `content-strategy` | drives the segment and the card's tag                               |
| `title`        | string                                | **the article's title**, not the scan's headline — see `AC-TITLE-1` |
| `summary`      | string                                | the card's body                                                     |
| `publishedAt`  | timestamp                             | the API must send a real timestamp — see `AC-AGE-4`                 |
| `isTrending`   | boolean                               | independent signal                                                  |
| `isUpdated`    | boolean                               | independent signal                                                  |
| `posts[]`      | Post[]                                | the evidence the Topic was assembled from                           |
| `versions[]`   | Version[]                             | past articles, oldest first                                         |

### Triage

What **this user** did with a Topic. **User-owned, stored separately.**

| Field       | Type                             |
| ----------- | -------------------------------- |
| `briefId`   | string                           |
| `status`    | `new` \| `used` \| `ignored`     |
| `reason`    | string — set only when `ignored` |
| `updatedAt` | timestamp                        |

### Feed (`lane` in code)

A Playbook's standing query.

| Field              | Type                                 | Notes                                |
| ------------------ | ------------------------------------ | ------------------------------------ |
| `id`, `playbookId` | string                               | one feed per Playbook today          |
| `sources[]`        | source ids                           | at least one — see `AC-SET-5`        |
| `cadence`          | `weekly` \| `monthly` \| `quarterly` |                                      |
| `notify`           | boolean                              |                                      |
| `paused`           | boolean                              | stops scanning; keeps what was found |
| `showTrending`     | boolean                              | gates the attention notice and page  |

---

## 2. The invariant everything else depends on

> **`AC-CORE-1` — status, trending and updated are three independent fields.**
>
> `status`, `isTrending` and `isUpdated` are stored and returned separately. No
> code path may write a signal into `status`, and no API response may express
> trending as a status value.
>
> **Verify:** a Topic that is `ignored` and `isTrending: true` must be
> representable and must round-trip through the API unchanged. Assert on the
> payload, not on the UI.

Everything in §3 and §4 is a consequence. If this is violated the feed's filter
starts lying and the attention page stops being reachable for triaged Topics.

---

## 3. Topic Feed

### 3.1 Routing and scope

| ID           | Criterion                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-ROUTE-1` | `/topic-feeds` resolves to the **active Playbook's** feed. No id in the URL.                                                                                                                                                                                                                     |
| `AC-ROUTE-2` | `/topic-feeds/:id` opens that feed by id. Used by deep links and by the attention page's back action.                                                                                                                                                                                            |
| `AC-ROUTE-3` | Switching the active Playbook while standing on `/topic-feeds` re-resolves the feed and repaints. The URL does not change, so this cannot rely on a route change.                                                                                                                                |
| `AC-ROUTE-4` | A Playbook whose feed has **no sources** renders a "No sources yet" state with one action, going to that feed's settings. It must not redirect to `/topic-feeds` (that is where it resolved from — it would loop).                                                                               |
| `AC-ROUTE-5` | `/topic-feeds/:id?topic=<briefId>` opens with that Topic's article already showing. To make this work the status filter widens to **all statuses** for that visit, because a `used` or `ignored` Topic is not in the default view and the pane would open onto a card the list does not contain. |

**Backend:** `GET /feeds?playbookId=` must return the feed for a Playbook, and
`GET /feeds/:id/topics` must accept the filter parameters in §3.4 server-side —
the prototype filters in memory over a seeded array, which will not survive a
real corpus.

### 3.2 The list: order and grouping

| ID         | Criterion                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-AGE-1` | Topics are ordered **newest first**, always. There is no other sort and no user control for it.                                                                                                                                                 |
| `AC-AGE-2` | The list is broken by age separators, in this order: **Last 7 days** (≤ 7d), **Earlier this month** (≤ 30d), **Earlier** (everything older). Boundaries are inclusive at the top — exactly 7 days old is _Last 7 days_.                         |
| `AC-AGE-3` | A group with no Topics is not rendered — no empty heading.                                                                                                                                                                                      |
| `AC-AGE-4` | The API returns an absolute `publishedAt`; the client derives both the relative label and the age group from it. The prototype ships relative strings ("2d ago") and parses them, which is a prototype affordance and must not be carried over. |
| `AC-AGE-5` | Paging is applied to the **flat ordered list before grouping**, so a page boundary may land inside a group; that group gains cards on the next page rather than a new group appearing out of order.                                             |

### 3.3 Segments

Two segments, rendered as a segmented control in the topbar, each with a count.

| ID         | Criterion                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SEG-1` | Exactly two segments: **Ready to draft** and **Topics for later**. One is selected at all times; _Ready to draft_ is the default on arrival.                                                   |
| `AC-SEG-2` | A Topic is in _Topics for later_ when `researchType = content-strategy`, and in _Ready to draft_ otherwise. (See §0 — the pillar half of this rule belongs to the Content-strategy iteration.) |
| `AC-SEG-3` | Each segment's count is the number of Topics **in that segment after the current filters are applied**. Switching segments does not change the filters.                                        |
| `AC-SEG-4` | Switching segments closes any open article pane and resets paging to the first page. The new segment then auto-opens its own first Topic (`AC-PANE-2`).                                        |

### 3.4 Filters

One control: a **Filters** dropdown in the topbar, with a badge.

| ID          | Criterion                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-FILT-1` | Two groups, in this order: **Topic status** (New, Used, Ignored) and **Sources** (all 8 catalogue sources). Both are multi-select.                                       |
| `AC-FILT-2` | Defaults: statuses = **New only**; sources = **all**. `researchType` is filtered internally to both types and has **no UI** — the segmented control is the type control. |
| `AC-FILT-3` | The badge counts **narrowed groups**, not ticked options. Two groups narrowed reads "2". At defaults the badge is absent. `researchType` never contributes.              |
| `AC-FILT-4` | **Reset filters** restores exactly the defaults in `AC-FILT-2`.                                                                                                          |
| `AC-FILT-5` | Any filter change resets paging to the first page. Narrowing must never leave the reader three pages deep in a wider list.                                               |
| `AC-FILT-6` | The list is **exactly** what the filter says. Nothing overrides it — see `AC-SIG-2`.                                                                                     |

### 3.5 Attention signals

| ID         | Criterion                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SIG-1` | A Topic may carry **Trending**, **Updated**, both, or neither, independently of its status (`AC-CORE-1`). Neither is rendered as a status pill.                                                                                                                           |
| `AC-SIG-2` | In the feed, a signalled Topic appears **under its own status**. A trending Topic that is `ignored` does not appear while the Ignored status is unticked. Signals are not feed-level overrides.                                                                           |
| `AC-SIG-3` | Signals are only valid inside the **Last 7 days** group. A Topic older than that has both flags cleared on read, whatever the data says — a "trending" card under an _Earlier_ separator contradicts itself. Enforce this in one place on the read path, not in the seed. |
| `AC-SIG-4` | ⚠️ **Decision required — see the note below.** When the feed has any signalled Topic and `showTrending` is on, a notice above the list reports the counts, broken down by signal, and links to the attention page.                                                        |
| `AC-SIG-5` | The notice's `total` is **deduped** (a Topic that is both counts once) while the per-signal numbers are not, so the two breakdowns may sum to more than the total. The copy must therefore never present them as an equation.                                             |
| `AC-SIG-6` | The notice reports what is flagged in the whole feed — not what the current filter hides, and not what the reader has yet to open. `showTrending: false` is the only way to switch it off.                                                                                |

> **⚠️ The attention notice is switched off in the prototype and its rationale
> has expired.**
>
> `SHOW_ATTENTION_NOTICE = false`. The reason recorded in the code is that "with
> every review status ticked by default, a flagged Topic is already visible in
> the list, so the notice repeated it". **That default has since changed** — the
> feed now opens on **New only** (`AC-FILT-2`), so a trending Topic that is
> `used` or `ignored` is no longer in the list, and the notice would no longer be
> repeating anything.
>
> Two consequences, both needing a product decision before build:
>
> 1. Whether the notice ships at all.
> 2. If it does not, `/topic-feeds/:id/attention` needs a different entry point —
>    see `AC-ATT-0`.

### 3.6 Attention page — `/topic-feeds/:id/attention`

| ID         | Criterion                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ATT-0` | ⚠️ **The page must have an entry point in the UI.** In the prototype it has **none** — the only link to it lives inside the parked attention notice, so today the page is reachable by typing the URL. Whatever is decided about the notice, this page needs a way in, or it should not be built. |
| `AC-ATT-1` | Lists every Topic in the feed carrying either signal, deduped, newest first.                                                                                                                                                                                                                      |
| `AC-ATT-2` | **The status filter is ignored entirely here.** This page is the home of the signals; a spike must never be hidden by triage state.                                                                                                                                                               |
| `AC-ATT-3` | Cards on this page show no triage controls and no status marker — the page answers "what is spiking", not "what have I triaged".                                                                                                                                                                  |
| `AC-ATT-4` | The topbar carries a back action to the feed.                                                                                                                                                                                                                                                     |

### 3.7 The article pane

| ID           | Criterion                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PANE-1`  | Clicking a card's body opens that Topic's article **in the page, beside the list** — not in a modal and not in the app's right panel. Clicking the same card again closes it.                                                          |
| `AC-PANE-2`  | On arriving at a list, the first Topic's article auto-opens **once per mount**. After the reader closes the pane it must not reopen itself.                                                                                            |
| `AC-PANE-3`  | Below a container width of **1180px** the pane stacks under the list instead of sitting beside it. This is measured against the split container, not the viewport.                                                                     |
| `AC-PANE-4`  | The pane's bottom — and therefore its action footer — stays within the viewport as the page scrolls. The pane's top moves as the feed header scrolls away, so the cap must follow it.                                                  |
| `AC-PANE-5`  | The pane's footer offers **Use in chat** (primary) and **Ignore**.                                                                                                                                                                     |
| `AC-PANE-6`  | The article renders: title, the prose in its two sections, a **See all N posts** link, and a **See past versions** link when the Topic has more than one version. One version is not a history — the link is absent.                   |
| `AC-TITLE-1` | Every surface showing a Topic's title shows **the article's title**. The scan's original headline is a fallback used only when no article has been written. A card and the article opened from it must never show different sentences. |

### 3.8 Card actions

| ID         | Criterion                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ACT-1` | **Use in chat** — sets the Topic's status to `used`, then opens a **new chat** with the Topic attached as a source. Status is written before navigation. The phrase means the same thing on every surface that offers it. |
| `AC-ACT-2` | **Ignore** — opens a reason prompt; on submit the status becomes `ignored` with the reason stored. Ignoring is reversible and is not deletion.                                                                            |
| `AC-ACT-3` | An ignored Topic still appears on the attention page if it is trending or updated (`AC-ATT-2`).                                                                                                                           |
| `AC-ACT-4` | One menu open at a time across the whole feed; an outside click closes it.                                                                                                                                                |
| `AC-ACT-5` | Triage changes persist across a repaint, a remount and a re-scan. Triage is stored separately from the Topic so a re-scan cannot clobber it.                                                                              |

**Backend:** `PATCH /topics/:id/triage { status, reason }`, scoped to the current
user. A re-scan replacing a Topic's content must leave its triage row intact.

### 3.9 Paging

| ID          | Criterion                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PAGE-1` | A page is **10** Topics.                                                                                                                          |
| `AC-PAGE-2` | The next page loads when a sentinel below the list enters the viewport, and also from an explicit **Load more** control. Both take the same path. |
| `AC-PAGE-3` | A load in flight cannot be triggered again by the same sentinel.                                                                                  |
| `AC-PAGE-4` | Scroll position survives every repaint. Using or ignoring a Topic halfway down the list must not throw the reader back to the top.                |

### 3.10 States

| ID           | Criterion                                                                                                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-STATE-1` | **Scanning** — a generating state runs on arrival: on an explicit `?fresh=1` (a settings save), and once per page load on first arrival. It does **not** run when arriving via `?topic=`, and not on returning from the attention page or settings. |
| `AC-STATE-2` | **Empty after filtering** — when the filter excludes everything, say so and offer a way back (reset, or feed settings). Distinct from `AC-ROUTE-4`.                                                                                                 |
| `AC-STATE-3` | **Paused** — a paused feed says so and offers Resume. Topics already found remain readable.                                                                                                                                                         |

### 3.11 Feed settings — `/topic-feeds/settings`

| ID         | Criterion                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SET-1` | Route with no id means the **active Playbook's** feed. `/topic-feeds/:id/settings` names one, for deep links.                                                               |
| `AC-SET-2` | One card per source: name, a toggle, and a plain-prose "how this source works". Never a disabled input — it reads as broken.                                                |
| `AC-SET-3` | Sources not yet built must **not** silently toggle. The switch reverts and a "Need that source?" prompt collects intent. Today only **Competitors** is live.                |
| `AC-SET-4` | Cadence is one of **Weekly / Monthly / Quarterly**, single-select.                                                                                                          |
| `AC-SET-5` | Saving with **zero** sources enabled is refused, with an inline error scrolled into view. The error clears as soon as a source goes back on, and is never shown on arrival. |
| `AC-SET-6` | Saving returns to the feed and re-runs the scanning state.                                                                                                                  |
| `AC-SET-7` | Also on this form: **notify after a scan**, and **pause this feed**.                                                                                                        |

**Backend:** cadence must actually schedule a recurring scan. In the prototype it
is display copy only — no timer exists. This is the single largest gap between
this document and the running prototype.

---

## 4. The chat surfaces

### 4.1 "Fresh topics to review" — the new-chat list

| ID           | Criterion                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-FRESH-1` | A new chat shows a list of Topics from the **active Playbook's** feeds, capped at **6**.                                                                                                                                                          |
| `AC-FRESH-2` | Only Topics that are `status = new` **and** under 7 days old. Both conditions — the section's label promises freshness and the list must not contradict it.                                                                                       |
| `AC-FRESH-3` | Order: the newest **trending** Topic, then the newest **updated** one, then the newest plain ones to fill. The first row is the one most worth acting on.                                                                                         |
| `AC-FRESH-4` | Used, ignored and stale Topics are excluded — all three mean the reader has already answered, or that the Topic is no longer fresh.                                                                                                               |
| `AC-FRESH-5` | The footer reads **"N out of M shown"**, where **M is every Topic under a week old across the Playbook's feeds, whatever its status**. M must not shrink as the reader triages — it is a statement about the week, not a burn-down. M ≥ N always. |
| `AC-FRESH-6` | The footer links to the full feed.                                                                                                                                                                                                                |
| `AC-FRESH-7` | A waiting state precedes the list **once per chat**, ~3s, and must not replay when the reader returns to the same chat. Cosmetic in the prototype; with a real backend it is the actual fetch and the list renders when it resolves.              |
| `AC-FRESH-8` | Clicking a row opens that Topic's **article dialog** — it does not pick the Topic. The decision is made after reading (`AC-DLG-3`).                                                                                                               |

### 4.2 Topic → chat handoff

The one flow behind **Use in chat**, from all four entry points (feed card,
attention page, fresh-topics list, picker).

| ID          | Criterion                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-CHAT-1` | A **new** chat is created. The Topic is never attached to the chat the reader is standing in.                                                                                                                                                                |
| `AC-CHAT-2` | The chat is bound to the Topic's feed's Playbook, and named after the Topic's title, **on its first paint** — not renamed a frame later.                                                                                                                     |
| `AC-CHAT-3` | The Topic is attached as an already-processed **source**, so every existing affordance (Extract ideas, Draft a post, Ask, the Sources panel) works with no special-casing.                                                                                   |
| `AC-CHAT-4` | The thread shows a source-intake entry naming the Topic. No echo message and no follow-up picker — the intake card already names it and the composer is right there.                                                                                         |
| `AC-CHAT-5` | The topbar's **Sources** count includes it.                                                                                                                                                                                                                  |
| `AC-CHAT-6` | Choosing a **past version** attaches that version as a distinct source: its own id, a filename naming the version, and that version's opening line as the preview. It must be distinguishable from the current Topic in the thread and in the Sources panel. |
| `AC-CHAT-7` | An unknown Topic id must not navigate — the entry point bails and nothing opens.                                                                                                                                                                             |

### 4.3 The composer's Pick from the Topic Feed

| ID           | Criterion                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-PICK-1`  | The composer's Add menu offers **Pick from the Topic Feed**, which opens a picker dialog scoped to **this chat's Playbook** — a chat keeps the brand it was created in.                                                                                                        |
| `AC-PICK-2`  | The picker lists **Ready-to-draft** Topics only, excluding `ignored`. (See §0 for the pillar coupling to be added later.)                                                                                                                                                      |
| `AC-PICK-2b` | ⚠️ **Parked in the prototype:** a "Trending, normally hidden" group that surfaced ignored-but-trending Topics the exclusion above would otherwise drop (`SHOW_HIDDEN_TRENDING = false`). It is the picker's counterpart to the attention notice and should be decided with it. |
| `AC-PICK-3`  | No Playbook-selection step. The dialog opens straight onto the Topic list.                                                                                                                                                                                                     |
| `AC-PICK-4`  | Topics are grouped by the same age groups and sorted newest-first, matching the feed (`AC-AGE-1`, `AC-AGE-2`).                                                                                                                                                                 |
| `AC-PICK-5`  | Cards are **identical to the feed's** — same source badge, age, signals, title and summary. A reader must not be shown a different-looking object from the one they were reading two seconds earlier.                                                                          |
| `AC-PICK-6`  | Clicking a card's body opens the full article **inside the same dialog**, with a back action returning to the list.                                                                                                                                                            |
| `AC-PICK-7`  | From that article, **Use in chat** performs `AC-CHAT-*`.                                                                                                                                                                                                                       |
| `AC-PICK-8`  | Empty state when nothing qualifies.                                                                                                                                                                                                                                            |

### 4.4 The Topic article dialog

Shared by the fresh-topics list, the picker and the feed's "full research".

| ID         | Criterion                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-DLG-1` | The dialog renders the **same article document** as the feed's pane — one source, not two that can drift.                                                                                 |
| `AC-DLG-2` | When the body renders the Topic's title, the dialog header is **not** rendered at all — it would print the same sentence twice. The dialog still carries an accessible name in that case. |
| `AC-DLG-3` | The footer's actions are **Use in chat** (primary) and **Close**.                                                                                                                         |
| `AC-DLG-4` | The close control sits in the dialog's top-right corner, independent of whether a header is rendered.                                                                                     |
| `AC-DLG-5` | Nested views (Sources, Past versions) carry a back action naming where it returns to.                                                                                                     |

### 4.5 Evidence posts — the source-posts dialog

Reached from **See all N posts**. Each post renders as the platform's `mini-post`.

| ID          | Criterion                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-POST-1` | Each post shows: author avatar, author name, network, published date, the post's text, its engagement, its sentiment, and a link to the original.                                           |
| `AC-POST-2` | The date is its own line under the name; the network sits beside the name separated by a dot element (not a typed character).                                                               |
| `AC-POST-3` | Engagement renders as labelled figures separated by a dot ("62 likes · 14 comments"), not as bare icons. Zero counts are omitted rather than printed as "0".                                |
| `AC-POST-4` | Sentiment and the "View on" link share **one row**: sentiment left, link right.                                                                                                             |
| `AC-POST-5` | Sentiment shows an icon and a label, coloured **positive / neutral / negative**. On the read-out only the label is coloured; the icon stays neutral.                                        |
| `AC-POST-6` | Clicking the sentiment opens a menu offering the three values; picking one updates the post's sentiment and closes the menu. One menu open at a time; Escape and an outside click close it. |
| `AC-POST-7` | **"View on" is rendered only when the post carries a real URL.** A link to `#` is worse than no link.                                                                                       |
| `AC-POST-8` | A post with no engagement still renders its sentiment and its link.                                                                                                                         |

**Backend:** sentiment is a stored, per-post value returned by the listening
API and updatable by the user (`PATCH /posts/:id/sentiment`). The prototype
derives it from the post text with a keyword heuristic and keeps the user's
choice in memory only — neither behaviour should ship.

---

## 5. Cross-cutting

| ID       | Criterion                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-X-1` | The sidebar's **Topic Feed** counter is the number of Topics with status `new` in the active Playbook's feed. Using or ignoring a Topic decrements it immediately.            |
| `AC-X-2` | Every list and counter reflects the **active Playbook** only. There is no "all Playbooks" view.                                                                               |
| `AC-X-3` | Triage performed on any surface is reflected on every other surface without a reload.                                                                                         |
| `AC-X-4` | Interactive controls are reachable and operable by keyboard, and state that is carried by colour (segments, sentiment, signals) is also carried by text or an ARIA attribute. |
| `AC-X-5` | Both attention signals, the segments and the age groups must be derivable from the API response alone — no client-side invention of state the server does not know about.     |

---

## 6. Prototype affordances that must NOT be implemented

Called out so nobody ports a demo trick into production.

| Prototype behaviour                               | What production needs                                 |
| ------------------------------------------------- | ----------------------------------------------------- |
| Relative age strings parsed for sorting           | Real `publishedAt` timestamps                         |
| Cadence is display copy; nothing is scheduled     | An actual recurring scan                              |
| The scanning state is a fixed ~1.6s timer         | A real pending state tied to the request              |
| The fresh-topics waiting card is a fixed 3s       | The real fetch                                        |
| Sentiment guessed from keywords, stored in memory | A stored value from the listening API                 |
| Triage stored in a module-level map               | Per-user persistence                                  |
| One feed per Playbook, first-match resolution     | Defined behaviour if a Playbook can ever have several |

---

## 7. Open questions for product

| #   | Question                                                                                           | Blocks                     |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Does the attention notice ship? Its original reason for being switched off no longer holds (§3.5). | `AC-SIG-4`, `AC-ATT-0`     |
| 2   | If not, how is `/attention` reached?                                                               | `AC-ATT-0`                 |
| 3   | Should the picker resurface ignored-but-trending Topics?                                           | `AC-PICK-2b`               |
| 4   | Can a Playbook ever have more than one feed? Everything here assumes one.                          | `AC-ROUTE-1`, `AC-FRESH-5` |
| 5   | Is triage per user or per workspace? This document assumes per user.                               | `AC-ACT-5`                 |
