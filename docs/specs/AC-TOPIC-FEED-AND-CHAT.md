# Acceptance criteria — Topic Feed & the chat surfaces it feeds

Written from the prototype, by using the running app. Each criterion says what the
reader does and what they should see, so anyone with a build can run it.

**Behaviour only.** No field names, routes, endpoints, or code references. If a rule is
really about how the system works rather than how it looks, it's written as what the
reader would observe instead.

**Status:** proposed. Not yet agreed with engineering.

---

## 1. The invariant everything else depends on

> **`AC-CORE-1` — a Topic's review state and its two attention signals are three
> separate things.**
>
> Trending and Updated are never shown as a review state, and never replace one. A Topic
> can be Ignored and Trending at the same time, and every surface has to show both.
>
> **Verify:** ignore a trending Topic, then re-tick Ignored in the filter. It comes back
> with its Trending mark intact. Ignoring it said nothing about whether it's spiking.

Everything below follows from this. Break it and the feed's filter starts lying, and a
Topic's review state quietly overwrites what the scan found about it.

---

## 2. Topic Feed

### 2.1 Arriving at a feed

| ID           | Title                                                | Criterion                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ROUTE-1` | Feed always follows the active Playbook              | Opening the Topic Feed from the sidebar shows the **active Playbook's** feed. The reader never picks a feed from a list.                                                                                                                                                  |
| `AC-ROUTE-2` | A link to one feed opens that feed                   | A link to one specific feed opens that feed, not whatever the reader's current scope happens to be. Every other link into the feed depends on this, including `AC-ROUTE-5`.                                                                                               |
| `AC-ROUTE-3` | Switching Playbook swaps the feed in place           | Switching the active Playbook while looking at the feed swaps the feed under the reader — no navigation needed.                                                                                                                                                           |
| `AC-ROUTE-4` | Every Playbook's feed already listens to competitors | **Every Playbook has a feed, and it's already listening.** A brand new to the app never lands on a screen asking it to set something up first — the feed listens to competitor posts from day one. There's no "no sources yet" wall.                                      |
| `AC-ROUTE-5` | A Topic link opens its article, filters widen        | A link to one Topic opens the feed with that Topic's article already showing. The status filter widens to **every state** for that visit, since a Used or Ignored Topic isn't in the default view and the article would otherwise open onto a card the list doesn't show. |

### 2.2 The list: order and grouping

| ID         | Title                                 | Criterion                                                                                                                                                                      |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-AGE-1` | Topics always sort newest first       | Topics are always ordered **newest first**. No other sort, no control to change it.                                                                                            |
| `AC-AGE-2` | Three age groups, always in order     | The list is broken into age groups, in order: **Last 7 days**, **Earlier this month**, **Earlier**. A Topic exactly seven days old counts as _Last 7 days_.                    |
| `AC-AGE-3` | Empty age groups are hidden           | A group with nothing in it isn't shown. No empty headings.                                                                                                                     |
| `AC-AGE-4` | Card age and its group share one date | A card's age ("2d ago") and the group it sits in both come from the same real publication date, so they can't disagree.                                                        |
| `AC-AGE-5` | Paging can add to an existing group   | Loading more Topics can add cards to a group already on screen — it doesn't always start a new group. A page boundary inside a group must not push a later group out of order. |

### 2.3 Segments

Two segments, side by side above the list, each with a count.

| ID         | Title                                           | Criterion                                                                                                                                            |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SEG-1` | Two segments, Ready to draft is default         | Exactly two segments: **Ready to draft** and **Topics for later**. One is always selected; _Ready to draft_ is the default.                          |
| `AC-SEG-2` | Scan classification alone decides the segment   | A Topic sits in _Topics for later_ when the scan classified it that way, and in _Ready to draft_ otherwise. Nothing else moves a Topic between them. |
| `AC-SEG-3` | Segment counts reflect the current filters      | Each segment's count is how many Topics are in it **after filters apply**. Switching segments doesn't change the filters.                            |
| `AC-SEG-4` | Switching segments opens its own first Topic    | Switching segments closes any open article, goes back to page one, then opens the new segment's own first Topic.                                     |
| `AC-SEG-5` | Every Topic lands in exactly one segment        | Every Topic the feed receives lands in exactly one segment — never both, never neither. The two counts add up to the total received, before filters. |
| `AC-SEG-6` | Unclassified Topics default to Topics for later | A Topic with no classification, or one we don't recognise, goes to **Topics for later**. Ready to draft would claim a readiness nothing earned.      |

### 2.4 Filters

One control: a **Filters** dropdown above the list, with a badge.

| ID          | Title                                     | Criterion                                                                                                                                                          |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-FILT-1` | Two filter groups, both multi-select      | Two groups, in this order: **Topic status** (To review, Used, Ignored) and **Sources**. Both let you pick several.                                                 |
| `AC-FILT-2` | Defaults are To review only, every source | Defaults: **To review only**, every source. No filter for the two segments — the segmented control already does that job, and a second one could disagree with it. |
| `AC-FILT-3` | Badge counts narrowed groups, not options | The badge counts **groups that are narrowed**, not options ticked. Two narrowed groups shows "2". At the defaults, no badge.                                       |
| `AC-FILT-4` | Reset restores the exact defaults         | **Reset filters** puts the defaults above back exactly.                                                                                                            |
| `AC-FILT-5` | Any filter change returns to page one     | Any filter change goes back to page one. Narrowing must never leave the reader three pages deep in a list that's now wider than it looks.                          |
| `AC-FILT-6` | The filter is never overridden            | The list is **exactly** what the filter says. Nothing overrides it — see `AC-SIG-2`.                                                                               |

### 2.5 Attention signals

| ID         | Title                                      | Criterion                                                                                                                                                                                    |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SIG-1` | Signals never replace the review state     | A Topic can carry **Trending**, **Updated**, both, or neither, whatever its review state is. Neither is ever shown as a review-state pill.                                                   |
| `AC-SIG-2` | A signal never overrides the status filter | In the feed, a signalled Topic still shows **under its own review state**. A trending Topic that's been ignored stays hidden while Ignored is unticked. A signal never overrides the filter. |
| `AC-SIG-3` | Signals only apply inside Last 7 days      | Signals only apply inside **Last 7 days**. An older Topic shows neither mark, whatever the data says — a "trending" card under _Earlier_ contradicts itself.                                 |

### 2.6 The article, beside the list

| ID           | Title                                           | Criterion                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PANE-1`  | Card click opens the article beside the list    | Clicking a card's body opens that Topic's article **in the page, beside the list** — not a dialog, not the right panel. Clicking again closes it.                                                                          |
| `AC-PANE-2`  | The first Topic's article opens only once       | On arriving at a list, the first Topic's article opens by itself **once**. Once the reader closes it, it doesn't reopen on its own.                                                                                        |
| `AC-PANE-3`  | Layout follows available width, not window size | On a narrow window the article stacks under the list instead of beside it. The switch is based on the space available to the two, not the browser window's size.                                                           |
| `AC-PANE-4`  | Article actions stay in view while scrolling    | The article's bottom, and its actions with it, stay in view as the page scrolls.                                                                                                                                           |
| `AC-PANE-5`  | Article actions: Use in chat and Ignore         | Its actions are **Use in chat** (primary) and **Ignore**.                                                                                                                                                                  |
| `AC-PANE-6`  | Article shows title, prose, and post count      | The article shows its title, the prose in its two sections, and a **See all N posts** link. No version history — an Updated Topic just reads as its current version.                                                       |
| `AC-TITLE-1` | Every surface shows the article's own title     | Every surface showing a Topic's title shows **the article's title**. The scan's original headline is only a fallback for a Topic with no article yet. A card and the article it opens must never show different sentences. |

### 2.7 Card actions

| ID         | Title                                        | Criterion                                                                                                                                                                                |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ACT-1` | Use in chat marks Used, opens a new chat     | **Use in chat** marks the Topic Used, then opens a **new chat** with the Topic attached as a source. The mark lands before the chat opens. Same meaning on every surface that offers it. |
| `AC-ACT-2` | Ignore asks for a reason and is reversible   | **Ignore** asks for a reason. On submit, the Topic is Ignored and the reason is kept. Ignoring is reversible — it isn't deletion.                                                        |
| `AC-ACT-4` | Only one card menu open at a time            | One card menu open at a time across the whole feed. Clicking outside closes it.                                                                                                          |
| `AC-ACT-5` | Triage survives navigation and the next scan | What the reader did with a Topic survives leaving the screen, coming back, and the next scan. A re-scan that rewrites a Topic must not reset it.                                         |

### 2.8 Loading more

| ID          | Title                                       | Criterion                                                                                                                         |
| ----------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PAGE-1` | A page is 10 Topics                         | A page is **10** Topics.                                                                                                          |
| `AC-PAGE-2` | Load more behaves like scrolling to the end | The next page loads when the reader reaches the end of the list, or from an explicit **Load more** control. Both behave the same. |
| `AC-PAGE-3` | No second load while one is in flight       | Reaching the end again while a page is still loading doesn't start a second load.                                                 |
| `AC-PAGE-4` | Scroll position survives every action       | Scroll position survives every action. Using or ignoring a Topic halfway down the list must not throw the reader back to the top. |

### 2.9 States

| ID           | Title                                             | Criterion                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-STATE-1` | Scanning shows once, on first arrival only        | **Scanning** — a working state shows while the feed is being assembled, on first arrival. It doesn't show when arriving on a link to one Topic.                                                                                            |
| `AC-STATE-2` | Empty-after-filter offers a reset, not a dead end | **Empty after filtering** — when the filter excludes everything, say so and offer a way back: reset the filter. Different from a feed that just hasn't found anything yet — see `AC-STATE-4`.                                              |
| `AC-STATE-4` | Nothing-found-yet reads as listening, not broken  | **Nothing found yet** — a feed that's listening but has produced nothing shows the working state first, then says nothing's landed and that it's listening, with a way to widen the sources. It must never read as broken or switched off. |

---

## 3. The chat surfaces

### 3.1 "Fresh topics to review" — the new-chat list

| ID           | Title                                            | Criterion                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-FRESH-1` | Fresh list shows at most 6 Topics                | A new chat shows a list of Topics from the **active Playbook**, at most **6**.                                                                                                                                                                          |
| `AC-FRESH-2` | Only to-review Topics under a week old qualify   | Only Topics that are **To review** and under seven days old. The list is called "fresh," so it has to actually be fresh.                                                                                                                                |
| `AC-FRESH-3` | Order: trending, then updated, then newest       | Order: the newest **trending** Topic first, then the newest **updated** one, then the newest of the rest. The top row is the one most worth acting on.                                                                                                  |
| `AC-FRESH-4` | Used, ignored, and older Topics are excluded     | Used, ignored, and older Topics are all excluded — either the reader already answered, or the Topic isn't fresh anymore.                                                                                                                                |
| `AC-FRESH-5` | Footer's total never shrinks as you triage       | The footer reads **"N out of M shown"**, where **M is every Topic under a week old in this Playbook**, regardless of what the reader did with it. M doesn't shrink as they triage — it describes the week, not a to-do list. M is never smaller than N. |
| `AC-FRESH-6` | Footer links through to the full feed            | The footer links to the full feed.                                                                                                                                                                                                                      |
| `AC-FRESH-7` | Waiting state plays once per chat, not per visit | A waiting state shows before the list, **once per chat**, and doesn't replay when the reader comes back to that chat. It lasts as long as the work actually takes.                                                                                      |
| `AC-FRESH-8` | A row opens the article, not a choice            | Clicking a row opens that Topic's **article** — it doesn't choose the Topic. That decision comes after reading.                                                                                                                                         |

### 3.2 Topic → chat

The one flow behind **Use in chat**, from all four places that offer it: a feed card's
action menu, the article beside the feed, the fresh-topics list, and the picker.

| ID          | Title                                           | Criterion                                                                                                                                                                                  |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-CHAT-1` | Use in chat always opens a brand new chat       | A **new** chat is created. The Topic is never added to the chat the reader is already in.                                                                                                  |
| `AC-CHAT-2` | Chat is scoped and named on first paint         | The chat belongs to the Topic's Playbook and is named after the Topic **as it first appears** — it isn't renamed a moment later.                                                           |
| `AC-CHAT-3` | The Topic behaves like any other source         | The Topic arrives as an already-processed **source**. Extract ideas, draft a post, ask about it, list it in Sources — everything a source can already do just works, with no special case. |
| `AC-CHAT-4` | Thread names the Topic, no extra message        | The thread shows a source entry naming the Topic. No echoed message, no follow-up question — the entry already names it and the composer is right there.                                   |
| `AC-CHAT-5` | The Sources count includes the Topic            | The chat's **Sources** count includes it.                                                                                                                                                  |
| `AC-CHAT-7` | A link to a deleted Topic goes nowhere          | A link to a Topic that no longer exists opens nothing and goes nowhere.                                                                                                                    |
| `AC-CHAT-8` | Extracted ideas must come from the Topic itself | Ideas extracted from a Topic come from that Topic's own analysis and its evidence posts. Two different Topics must not produce the same ideas with just the titles swapped.                |

### 3.3 The composer's Pick from the Topic Feed

| ID           | Title                                           | Criterion                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PICK-1`  | Picker is scoped to the chat's own Playbook     | The composer's Add menu offers **Pick from the Topic Feed**, opening a picker for **this chat's Playbook** — a chat keeps the brand it was created in.                                                                                                          |
| `AC-PICK-2`  | Picker lists ready-to-draft Topics only         | The picker lists **ready-to-draft** Topics only, never an ignored one. Same rule as `AC-SEG-2`: the scan's classification decides it.                                                                                                                           |
| `AC-PICK-2b` | Parked: resurfacing ignored-but-trending Topics | ⚠️ **Parked in the prototype:** a "Trending, normally hidden" group that would surface ignored-but-trending Topics the rule above drops. It used to pair with the attention notice and the attention page — both gone now — so this stands or falls on its own. |
| `AC-PICK-3`  | No Playbook-picking step before the Topic list  | No Playbook-picking step. The picker opens straight onto the Topic list.                                                                                                                                                                                        |
| `AC-PICK-4`  | Picker grouping and order match the feed        | Topics are grouped and ordered the same way as the feed: same age groups, newest first.                                                                                                                                                                         |
| `AC-PICK-5`  | Picker cards look identical to the feed's       | Cards look **identical to the feed's** — same badge, age, signals, title, summary. The reader shouldn't see a different-looking object from the one they were just reading.                                                                                     |
| `AC-PICK-6`  | Article opens inside the same picker dialog     | Clicking a card's body opens the full article **inside the same dialog**, with a back action to the list.                                                                                                                                                       |
| `AC-PICK-7`  | Use in chat behaves the same from here          | From that article, **Use in chat** works exactly as in §3.2.                                                                                                                                                                                                    |
| `AC-PICK-8`  | An empty state when nothing qualifies           | An empty state when nothing qualifies.                                                                                                                                                                                                                          |

### 3.4 The Topic article dialog

Shared by the fresh-topics list, the picker, and the feed's full-article view.

| ID         | Title                                            | Criterion                                                                                                                                                                     |
| ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-DLG-1` | Dialog shows the exact same article as the feed  | The dialog shows the **same article** the feed shows beside the list. One article, not two that can drift apart.                                                              |
| `AC-DLG-2` | No duplicate header when the article has its own | If the article already carries the Topic's title, the dialog doesn't print a second header above it — that'd be the same sentence twice. It's still named for screen readers. |
| `AC-DLG-3` | Dialog actions: Use in chat and Close            | Its actions are **Use in chat** (primary) and **Close**.                                                                                                                      |
| `AC-DLG-4` | Close sits top-right, with or without a header   | The close control sits in the dialog's top-right corner, header or no header.                                                                                                 |
| `AC-DLG-5` | Inner dialog views carry a named back action     | A view opened inside it — the source posts — carries a back action that names where it returns to.                                                                            |

### 3.5 Evidence posts

Reached from **See all N posts**. Each post is shown the way the platform shows a post
anywhere else.

| ID          | Title                                                   | Criterion                                                                                                                                                         |
| ----------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-POST-1` | A post shows author, network, date, text, engagement    | Each post shows: author avatar, author name, network, published date, the post's text, its engagement, its sentiment, and a link to the original.                 |
| `AC-POST-2` | Date and network sit close to the author's name         | The date sits on its own line under the name; the network sits beside the name, separated by a dot.                                                               |
| `AC-POST-3` | Engagement is labelled figures; zero counts are omitted | Engagement reads as labelled figures separated by a dot ("62 likes · 14 comments"), not bare icons. A count of zero is left out, not printed as 0.                |
| `AC-POST-4` | Sentiment and the View-on link share one row            | Sentiment and the "View on" link share **one row**: sentiment on the left, link on the right.                                                                     |
| `AC-POST-5` | Sentiment is an icon plus a coloured label              | Sentiment shows an icon and a label, coloured **positive / neutral / negative**. In the read-only view only the label is coloured — the icon stays neutral.       |
| `AC-POST-6` | Clicking sentiment opens a three-value menu             | Clicking sentiment opens a menu of the three values. Choosing one updates the post and closes the menu. One menu at a time; Escape or an outside click closes it. |
| `AC-POST-7` | View-on only shows when the link is real                | **"View on" only shows up when the post has a real link.** A dead link is worse than no link.                                                                     |
| `AC-POST-8` | No engagement still shows sentiment and the link        | A post with no engagement still shows its sentiment and its link.                                                                                                 |
| `AC-POST-9` | A set sentiment persists everywhere, after reload       | A sentiment the reader sets stays set — for that post, on every surface, after a reload. Not just for the session.                                                |

---

## 4. Cross-cutting

| ID       | Title                                                | Criterion                                                                                                                                                                              |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-X-1` | Sidebar counter is to-review Topics in this Playbook | The sidebar's **Topic Feed** counter is the number of **To review** Topics in the active Playbook's feed. Using or ignoring one drops it right away.                                   |
| `AC-X-2` | Every surface reflects the active Playbook only      | Every list and counter reflects the **active Playbook** only. There's no "all Playbooks" view.                                                                                         |
| `AC-X-3` | Triage syncs everywhere at once, no reload           | Triaging a Topic anywhere shows up everywhere else without a reload.                                                                                                                   |
| `AC-X-4` | Keyboard-operable; colour is never the only signal   | Every control works by keyboard, and anything shown by colour alone — segments, sentiment, signals — is also readable as text for a screen reader.                                     |
| `AC-X-5` | The feed alone decides signals, segments, age groups | Signals, segments, and age groups are all decided by whatever produces the Topics. The reader's own view must not invent state the feed doesn't know about.                            |
| `AC-X-6` | A Topic only appears under its own Playbook          | A Topic only shows up under the Playbook that owns it. Test with two Playbooks that both have Topics: nothing from one shows up under the other, in the list or the counts.            |
| `AC-X-7` | A card's Playbook label must match its true owner    | When a card names a Playbook, it's naming the Topic's actual owner, and it matches the Playbook the reader is scoped to. If those two can disagree, the label is the one that's wrong. |
| `AC-X-8` | No Playbook selected shows nothing, not everything   | With no Playbook selected, every Topic surface shows nothing. It must not fall back to showing every Playbook's Topics.                                                                |

---

## 5. Prototype shortcuts that must NOT ship

Called out so nobody mistakes a demo trick for the real behaviour.

| In the prototype                                                    | What it needs to be                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A card's age is a fixed phrase, not a real date                     | A real publication date; the phrase and the age group both come from it |
| How often a feed runs is a label — nothing actually runs            | An actual recurring run, on whatever cadence a feed is given            |
| The scanning state lasts a fixed moment                             | As long as the work actually takes                                      |
| The fresh-topics waiting state lasts a fixed three seconds          | As long as the work actually takes — see `AC-FRESH-7`                   |
| Sentiment is guessed from the post's words, and forgotten on reload | A real value, kept — see `AC-POST-9`                                    |
| What the reader did with a Topic is forgotten on reload             | Kept for that reader — see `AC-ACT-5`                                   |
| One feed per Playbook, and nothing says what a second one would do  | Defined behaviour, if a Playbook can ever have more than one            |

---

## 6. Tracking

**This section names events, properties, and attributes on purpose.** Everywhere else in
this doc a name would be an implementation detail. Here the names are the thing being
agreed, so they're spelled out and have to match exactly.

**One criterion per tracking update, with one exception:** the ten frontend controls
share a single criterion. Attaching an attribute is the same mechanical check ten times
over — the real decisions are all in §6.1 to §6.3, and ten criteria would give the
mechanical part more weight than it deserves.

**What the frontend criterion proves, and what it doesn't.** It checks that each element
carries the right `data-track` value and fires it on click. It says nothing about the
event reaching the warehouse, and nothing about the payload — that's verified once,
downstream, not per control. A missing attribute is still a failure even if the click
itself works fine.

### 6.1 Updated — the workflow-start event

Three additions to `started_an_archie_workflow`. Nothing existing changes.

| ID         | Title                                | Criterion                                                                                                                                   |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-1` | source_type gains a topic value      | `source_type` accepts **`topic`**, and reports it whenever the workflow started from a Topic — from any of the four _Use in chat_ surfaces. |
| `AC-TRK-2` | entry_point gains starter-topic_list | `entry_point` accepts **`starter-topic_list`**, reported when the workflow started from the Fresh topics list on a new chat.                |
| `AC-TRK-3` | entry_point gains topic-feed-panel   | `entry_point` accepts **`topic-feed-panel`**, reported when the workflow started from the article beside the feed.                          |

The values `source_type` and `entry_point` already carry keep firing unchanged. A test
that only checks the new values would pass even if the old ones quietly broke.

⚠️ Two entry points are named here, but four surfaces offer _Use in chat_ — the card's own
menu and the picker have no value yet. Either they reuse one of these two, or they need
their own. See §7.

### 6.2 New event — a Topic was ignored

| ID          | Title                                              | Criterion                                                                                                                                                                                                                                                                                               |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-4`  | Ignore event fires once, never on cancel           | Ignoring a Topic fires the event **once**, from either surface that offers it. Opening the reason dialog and cancelling fires nothing — the Topic wasn't ignored.                                                                                                                                       |
| `AC-TRK-5`  | Ignore event carries all eight properties          | The event carries all eight properties: `Topic_status`, `Topic_trending`, `Topic_updated`, `Topic_title`, `Topic_summary`, `Topic_playbook`, `Topic_source`, `Topic_ignored_reason`. All eight, every time.                                                                                             |
| `AC-TRK-5b` | Only the reason property may be empty              | `Topic_ignored_reason` is the only one allowed to be **empty** — the reason box is optional and the dialog submits with nothing typed. Present and empty, never absent: a missing property and an unanswered question are two different things, and we want to know how often people bother explaining. |
| `AC-TRK-6`  | Status, trending, and updated report independently | `Topic_status`, `Topic_trending`, and `Topic_updated` are reported **independently**. Ignoring a trending Topic sends the ignored status _and_ trending true — that's `AC-CORE-1` on the wire, and a payload that collapses them fails this test.                                                       |

Allowed values:

| Property               | Values                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `Topic_status`         | `new` · `used` · `ignored` — `new` is labelled **To review** in the UI   |
| `Topic_trending`       | `true` · `false`                                                         |
| `Topic_updated`        | `true` · `false`                                                         |
| `Topic_title`          | the article's title — the same sentence the reader saw, see `AC-TITLE-1` |
| `Topic_summary`        | the Topic's summary                                                      |
| `Topic_playbook`       | the Playbook the Topic belongs to                                        |
| `Topic_source`         | the listening source it came from — competitor, influencer, website, …   |
| `Topic_ignored_reason` | the text the reader typed, verbatim — empty if they typed nothing        |

⚠️ **`Topic_status` needs a decision before this can be tested.** On an ignore event the
status is always `ignored` once it lands, which makes the property constant and useless.
It only means something as the status the Topic held **before** the ignore — that's how
these criteria read it. See §7.

**Two things about the reason text.** It's whatever the reader typed — any language, any
length, possibly personal — so it needs the same care as any other free-text field we
collect. And the same dialog also has a **Don't show this again** checkbox, which answers
a related question but isn't in the property list above. See §7.

### 6.3 New — Topic traces on AI calls

| ID         | Title                                | Criterion                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-7` | AI traces on a Topic carry five tags | An AI call that takes a Topic as input records a trace of its input and output, tagged with `Topic_trending`, `Topic_title`, `Topic_summary`, `Topic_playbook`, and `Topic_source`. All five or none — a partially tagged trace can't be grouped by Topic. |

Nothing here for a frontend test to check — no control involved, no attribute added.
Verified on the trace itself.

### 6.4 Frontend — ten controls, one criterion

| ID         | Title                                      | Criterion                                                                                                                                                                                |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-8` | Ten controls each carry a data-track value | Every control in the table below carries the `data-track` value listed against it, and fires it on click. A wrong or missing value on any one of the ten fails this — no partial credit. |

The values below are proposals: `snake_case`, prefixed `topic_`, and each names the
**surface** as well as the action, since the same action means something different
depending on where it happens.

| The control                      | Where                              | `data-track`                   |
| -------------------------------- | ---------------------------------- | ------------------------------ |
| **See more topics in your feed** | footer of the Fresh topics list    | `topic_feed_see_more`          |
| **Pick from the Topic Feed**     | the composer's Add menu            | `topic_picker_open`            |
| a Topic card's body              | the Pick a topic dialog            | `topic_card_open_picker`       |
| a Topic card's body              | the Fresh topics list              | `topic_card_open_fresh_list`   |
| **Use in chat**                  | a feed card's action menu          | `topic_use_in_chat_card_menu`  |
| **Use in chat**                  | the article beside the feed        | `topic_use_in_chat_panel`      |
| **Use in chat**                  | the Pick a topic dialog            | `topic_use_in_chat_picker`     |
| **Use in chat**                  | reached from the Fresh topics list | `topic_use_in_chat_fresh_list` |
| **Ignore**                       | a feed card's action menu          | `topic_ignore_card_menu`       |
| **Ignore**                       | the article beside the feed        | `topic_ignore_panel`           |

Two things that will bite whoever builds this:

- **The picker's _Use in chat_ and the Fresh-list one are the same button.** One article
  dialog serves both (`AC-DLG-1`), so a fixed attribute can't tell them apart. The value
  has to be set based on where the dialog was opened from, or the two events become
  indistinguishable — which defeats the point of splitting them.
- **Cards open, they don't choose.** The two card-body values just record a card being
  read, not a Topic being picked (`AC-FRESH-8`). They're the top of a funnel whose bottom
  is the _Use in chat_ values — reading them as intent will overcount.

---

## 7. Open questions for product

| #   | Question                                                                                                                                                                                                                       | Blocks                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1   | Should the picker resurface ignored-but-trending Topics?                                                                                                                                                                       | `AC-PICK-2b`               |
| 2   | Can a Playbook ever have more than one feed? Everything here assumes one.                                                                                                                                                      | `AC-ROUTE-1`, `AC-FRESH-5` |
| 3   | Is a Topic's review state per reader, or shared across the workspace? This doc assumes per reader.                                                                                                                             | `AC-ACT-5`                 |
| 4   | Is `Topic_status` on an ignore event the status **before** the ignore, or after? After makes it a constant (§6.2).                                                                                                             | `AC-TRK-5`, `AC-TRK-6`     |
| 5   | Do _Use in chat_ from the card menu and the picker get their own `entry_point` values, or fold into an existing one (§6.1)?                                                                                                    | `AC-TRK-1`, `AC-TRK-2`     |
| 6   | `starter-topic_list` mixes a hyphen and an underscore, while `topic-feed-panel` is all hyphens. Intended, or should both use one convention?                                                                                   | `AC-TRK-2`, `AC-TRK-3`     |
| 7   | The ignore dialog's **Don't show this again** checkbox is feedback too, but no property carries it. Should it join the event (§6.2)?                                                                                           | `AC-TRK-5`                 |
| 8   | A feed starts out listening to competitor posts (`AC-ROUTE-4`), but with no settings surface, nothing can ever change that — or its cadence, or its notify choice. Is competitors-only okay for V1?                            | `AC-ROUTE-4`               |
| 9   | With no version history and no "what changed," the **Updated** mark tells the reader something changed but not what. Does the mark still earn its place?                                                                       | `AC-SIG-1`, `AC-PANE-6`    |
| 10  | With the notice and the attention page both gone, nothing surfaces a spike on a Topic the reader's already triaged — the only way to see one is re-ticking Ignored in the filter. Is that okay, or do the signals need a home? | `AC-SIG-1`, `AC-SIG-2`     |
