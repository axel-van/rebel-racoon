# Acceptance criteria — Topic Feed & the chat surfaces it feeds

Derived from the prototype, by exercising the running app. Written to be executed by
anyone with access to a build: every criterion names what the reader does and what they
should see.

**Written as behaviour only.** No field names, routes, endpoints or implementation
detail — a criterion here is something you can check by using the product. Where a rule
constrains how the system must work rather than how it looks, it is stated as the
observable consequence.

**Status:** proposed. Nothing here has been agreed with engineering yet.

---

## 1. The invariant everything else depends on

> **`AC-CORE-1` — a Topic's review state and its two attention signals are three
> independent things.**
>
> Trending and Updated are never expressed as review states, and never replace one. A
> Topic can be Ignored and Trending at the same time, and every surface must be able to
> show that combination.
>
> **Verify:** ignore a trending Topic. It stays trending — the attention page still
> lists it, and re-ticking Ignored in the filter brings it back to the feed with its
> Trending mark intact.

Everything below is a consequence. If this is violated the feed's filter starts
lying and the attention page stops being reachable for Topics the reader has triaged.

---

## 2. Topic Feed

### 2.1 Arriving at a feed

| ID           | Criterion                                                                                                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ROUTE-1` | Opening the Topic Feed from the sidebar shows the **active Playbook's** feed. The reader never picks a feed from a list.                                                                                                                                                                 |
| `AC-ROUTE-2` | A link to one specific feed opens that feed. Deep links and the attention page's back action both rely on this.                                                                                                                                                                          |
| `AC-ROUTE-3` | Switching the active Playbook while looking at the feed swaps the feed under the reader, without them navigating.                                                                                                                                                                        |
| `AC-ROUTE-4` | A Playbook whose feed has **no sources** shows a "No sources yet" state with one action, which goes to that feed's settings. It must not send the reader back to the feed they just came from.                                                                                           |
| `AC-ROUTE-5` | A link that names one Topic opens the feed with that Topic's article already showing. The status filter widens to **every state** for that visit, because a Used or Ignored Topic is not in the default view and the article would otherwise open onto a card the list does not contain. |

### 2.2 The list: order and grouping

| ID         | Criterion                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-AGE-1` | Topics are ordered **newest first**, always. There is no other sort and no control to change it.                                                                                                  |
| `AC-AGE-2` | The list is broken by age separators, in this order: **Last 7 days**, **Earlier this month**, **Earlier**. Boundaries are inclusive at the top — a Topic exactly seven days old is _Last 7 days_. |
| `AC-AGE-3` | A group with no Topics is not shown — no empty heading.                                                                                                                                           |
| `AC-AGE-4` | Both the relative age on a card ("2d ago") and the group it falls into derive from the Topic's real publication date, so they can never disagree with each other.                                 |
| `AC-AGE-5` | Loading more Topics may add cards to a group already on screen rather than always adding a new group. A page boundary inside a group must not make a later group appear out of order.             |

### 2.3 Segments

Two segments, side by side above the list, each with a count.

| ID         | Criterion                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-SEG-1` | Exactly two segments: **Ready to draft** and **Topics for later**. One is always selected; _Ready to draft_ is the default on arrival.                                                                                                                                                                       |
| `AC-SEG-2` | A Topic falls in _Topics for later_ when the scan classified it that way, and in _Ready to draft_ otherwise. The classification is the whole rule; a Content pillar claiming a Topic must not move it between segments. (The pillar half of the prototype's rule belongs to the Content-strategy iteration.) |
| `AC-SEG-3` | Each segment's count is how many Topics are in it **after the current filters apply**. Switching segments does not change the filters.                                                                                                                                                                       |
| `AC-SEG-4` | Switching segments closes any open article, returns to the first page, and then opens the new segment's own first Topic.                                                                                                                                                                                     |

### 2.4 Filters

One control: a **Filters** dropdown above the list, with a badge.

| ID          | Criterion                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-FILT-1` | Two groups, in this order: **Topic status** (New, Used, Ignored) and **Sources**. Both allow several selections.                                                          |
| `AC-FILT-2` | Defaults: **New only**, and every source. There is no filter for the two segments — the segmented control is that control, and duplicating it would let the two disagree. |
| `AC-FILT-3` | The badge counts **groups that are narrowed**, not options ticked: two narrowed groups reads "2". At the defaults there is no badge.                                      |
| `AC-FILT-4` | **Reset filters** restores exactly the defaults above.                                                                                                                    |
| `AC-FILT-5` | Any filter change returns to the first page. Narrowing must never leave the reader three pages deep in a wider list.                                                      |
| `AC-FILT-6` | The list is **exactly** what the filter says it is. Nothing overrides it — see `AC-SIG-2`.                                                                                |

### 2.5 Attention signals

| ID         | Criterion                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SIG-1` | A Topic may carry **Trending**, **Updated**, both, or neither, whatever its review state. Neither is ever shown as a review-state pill.                                                                                            |
| `AC-SIG-2` | In the feed, a signalled Topic appears **under its own review state**. A trending Topic that has been ignored does not appear while Ignored is unticked. A signal does not override the filter.                                    |
| `AC-SIG-3` | Signals are only valid inside **Last 7 days**. An older Topic shows neither mark, whatever the data says — a "trending" card under an _Earlier_ separator contradicts itself.                                                      |
| `AC-SIG-4` | ⚠️ **Decision required — see the note below.** When a feed has any signalled Topic and the feed's own attention setting is on, a notice above the list reports the counts, broken down by signal, and links to the attention page. |
| `AC-SIG-5` | The notice's total counts a Topic **once** even when it carries both signals, while the per-signal numbers do not, so the parts may add up to more than the total. The copy must never present them as a sum.                      |
| `AC-SIG-6` | The notice reports what is flagged in the whole feed — not what the current filter hides, and not what the reader has yet to open. The feed's attention setting is the only way to switch it off.                                  |

> **⚠️ The attention notice is switched off in the prototype and its rationale has
> expired.**
>
> It was switched off because, with every review state shown by default, a flagged Topic
> was already visible in the list and the notice repeated it. **That default has since
> changed** — the feed now opens on **New only**, so a trending Topic that has been used
> or ignored is no longer in the list, and the notice would no longer be repeating
> anything.
>
> Two consequences, both needing a product decision before build:
>
> 1. Whether the notice ships at all.
> 2. If it does not, the attention page needs a different way in — see `AC-ATT-0`.

### 2.6 The attention page

| ID         | Criterion                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ATT-0` | ⚠️ **The page must have a way in from the UI.** In the prototype it has none: the only link to it lives inside the switched-off notice. Whatever is decided about the notice, this page needs an entry point, or it should not be built. |
| `AC-ATT-1` | Lists every Topic in the feed carrying either signal, each once, newest first.                                                                                                                                                           |
| `AC-ATT-2` | **The status filter is ignored entirely here.** This page is the home of the signals; a spike must never be hidden by what the reader did with the Topic.                                                                                |
| `AC-ATT-3` | Cards here show no triage controls and no review-state marker — the page answers "what is spiking", not "what have I triaged".                                                                                                           |
| `AC-ATT-4` | There is a back action to the feed.                                                                                                                                                                                                      |

### 2.7 The article, beside the list

| ID           | Criterion                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PANE-1`  | Clicking a card's body opens that Topic's article **in the page, beside the list** — not in a dialog and not in the app's right panel. Clicking the same card again closes it.                                                          |
| `AC-PANE-2`  | On arriving at a list, the first Topic's article opens by itself **once**. After the reader closes it, it must not reopen on its own.                                                                                                   |
| `AC-PANE-3`  | On a narrow window the article stacks under the list instead of sitting beside it. The switch happens on the width available to the two of them, not on the size of the browser window.                                                 |
| `AC-PANE-4`  | The article's bottom — and so its actions — stays within view as the page scrolls.                                                                                                                                                      |
| `AC-PANE-5`  | Its actions are **Use in chat** (primary) and **Ignore**.                                                                                                                                                                               |
| `AC-PANE-6`  | The article shows: its title, the prose in its two sections, a **See all N posts** link, and a **See past versions** link when there is more than one version. One version is not a history, so the link is absent.                     |
| `AC-TITLE-1` | Every surface showing a Topic's title shows **the article's title**. The scan's original headline is a fallback used only where no article has been written. A card and the article opened from it must never show different sentences. |

### 2.8 Card actions

| ID         | Criterion                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-ACT-1` | **Use in chat** — marks the Topic Used, then opens a **new chat** with the Topic attached as a source. The mark lands before the chat opens. The phrase means the same thing on every surface offering it. |
| `AC-ACT-2` | **Ignore** — asks for a reason; on submit the Topic is Ignored and the reason is kept. Ignoring is reversible and is not deletion.                                                                         |
| `AC-ACT-3` | An ignored Topic still appears on the attention page if it is trending or updated.                                                                                                                         |
| `AC-ACT-4` | One card menu open at a time across the whole feed; a click outside closes it.                                                                                                                             |
| `AC-ACT-5` | What the reader did with a Topic survives leaving the screen, coming back, and the next scan. A re-scan that rewrites a Topic must not reset it.                                                           |

### 2.9 Loading more

| ID          | Criterion                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PAGE-1` | A page is **10** Topics.                                                                                                                |
| `AC-PAGE-2` | The next page loads when the reader reaches the end of the list, and also from an explicit **Load more** control. Both behave the same. |
| `AC-PAGE-3` | Reaching the end of the list again while a page is still loading does not start a second load.                                          |
| `AC-PAGE-4` | Scroll position survives every action. Using or ignoring a Topic halfway down the list must not throw the reader back to the top.       |

### 2.10 States

| ID           | Criterion                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-STATE-1` | **Scanning** — a working state shows while the feed is being assembled: after saving feed settings, and on the reader's first arrival. It does not show when arriving on a link to one Topic, nor when coming back from the attention page or from settings. |
| `AC-STATE-2` | **Empty after filtering** — when the filter excludes everything, say so and offer a way back: reset the filter, or open feed settings. This is a different state from a feed with no sources.                                                                |
| `AC-STATE-3` | **Paused** — a paused feed says so and offers Resume. Topics already found stay readable.                                                                                                                                                                    |

### 2.11 Feed settings

| ID         | Criterion                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-SET-1` | Reached from the feed, and settings always belong to the feed the reader came from.                                                                                                   |
| `AC-SET-2` | One card per source: its name, a switch, and a plain-prose "how this source works". Never a disabled field — it reads as broken.                                                      |
| `AC-SET-3` | A source that is not built yet must **not** silently switch on. The switch returns to off and a "Need that source?" prompt collects the interest. Today only **Competitors** is live. |
| `AC-SET-4` | How often the feed runs is one of **Weekly / Monthly / Quarterly** — one choice.                                                                                                      |
| `AC-SET-5` | Saving with **no** sources on is refused, with the error shown next to the sources and scrolled into view. It clears as soon as a source goes back on, and never shows on arrival.    |
| `AC-SET-6` | Saving returns to the feed and shows the scanning state.                                                                                                                              |
| `AC-SET-7` | Also here: **notify me after a run**, and **pause this feed**.                                                                                                                        |
| `AC-SET-8` | How often the feed runs must actually govern when it runs. A reader who picks Weekly and comes back next week must find new Topics — the cadence is a promise, not a label.           |

---

## 3. The chat surfaces

### 3.1 "Fresh topics to review" — the new-chat list

| ID           | Criterion                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-FRESH-1` | A new chat shows a list of Topics from the **active Playbook**, at most **6**.                                                                                                                                                                 |
| `AC-FRESH-2` | Only Topics that are **New** and under seven days old. Both conditions — the label promises freshness and the list must not contradict it.                                                                                                     |
| `AC-FRESH-3` | Order: the newest **trending** Topic, then the newest **updated** one, then the newest of the rest. The first row is the one most worth acting on.                                                                                             |
| `AC-FRESH-4` | Used, ignored and older Topics are all excluded — each means the reader has already answered, or that the Topic is no longer fresh.                                                                                                            |
| `AC-FRESH-5` | The footer reads **"N out of M shown"**, where **M is every Topic under a week old in this Playbook, whatever the reader did with it**. M must not shrink as they triage — it describes the week, not a to-do list. M is never smaller than N. |
| `AC-FRESH-6` | The footer links to the full feed.                                                                                                                                                                                                             |
| `AC-FRESH-7` | A waiting state precedes the list **once per chat**, and must not replay when the reader returns to that chat. It should last as long as the work takes, not a fixed interval.                                                                 |
| `AC-FRESH-8` | Clicking a row opens that Topic's **article** — it does not choose the Topic. That decision is made after reading.                                                                                                                             |

### 3.2 Topic → chat

The one flow behind **Use in chat**, from all four places offering it: a feed card, the
attention page, the fresh-topics list, and the picker.

| ID          | Criterion                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-CHAT-1` | A **new** chat is created. The Topic is never added to the chat the reader is already in.                                                                                                                                               |
| `AC-CHAT-2` | The chat belongs to the Topic's Playbook and is named after the Topic, **as it first appears** — not renamed a moment later.                                                                                                            |
| `AC-CHAT-3` | The Topic arrives as an already-processed **source**, so everything the chat can already do with a source — extract ideas, draft a post, ask about it, list it in the Sources panel — works on it with no special case.                 |
| `AC-CHAT-4` | The thread shows a source entry naming the Topic. No echoed message and no follow-up question — the entry already names it and the composer is right there.                                                                             |
| `AC-CHAT-5` | The chat's **Sources** count includes it.                                                                                                                                                                                               |
| `AC-CHAT-6` | Choosing a **past version** brings that version in as its own source, named for the version, with that version's opening line as its preview. It must be distinguishable from the current Topic in the thread and in the Sources panel. |
| `AC-CHAT-7` | A link to a Topic that no longer exists opens nothing and goes nowhere.                                                                                                                                                                 |

### 3.3 The composer's Pick from the Topic Feed

| ID           | Criterion                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-PICK-1`  | The composer's Add menu offers **Pick from the Topic Feed**, opening a picker for **this chat's Playbook** — a chat keeps the brand it was created in.                                                                                         |
| `AC-PICK-2`  | The picker lists **ready-to-draft** Topics only, and never an ignored one — decided by the scan's classification alone, as in `AC-SEG-2`.                                                                                                      |
| `AC-PICK-2b` | ⚠️ **Parked in the prototype:** a "Trending, normally hidden" group surfacing ignored-but-trending Topics that the rule above would otherwise drop. It is the picker's counterpart to the attention notice and should be decided alongside it. |
| `AC-PICK-3`  | No Playbook-choosing step. The picker opens straight onto the Topic list.                                                                                                                                                                      |
| `AC-PICK-4`  | Topics are grouped by the same age groups and ordered newest first, matching the feed.                                                                                                                                                         |
| `AC-PICK-5`  | Cards are **identical to the feed's** — same source badge, age, signals, title and summary. A reader must not be shown a different-looking object from the one they were reading two seconds earlier.                                          |
| `AC-PICK-6`  | Clicking a card's body opens the full article **inside the same dialog**, with a back action to the list.                                                                                                                                      |
| `AC-PICK-7`  | From that article, **Use in chat** behaves exactly as in §3.2.                                                                                                                                                                                 |
| `AC-PICK-8`  | An empty state when nothing qualifies.                                                                                                                                                                                                         |

### 3.4 The Topic article dialog

Shared by the fresh-topics list, the picker, and the feed's full-article view.

| ID         | Criterion                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-DLG-1` | The dialog shows the **same article** as the feed does beside the list — one article, not two that can drift apart.                                                                              |
| `AC-DLG-2` | When the article itself carries the Topic's title, the dialog does not print a header above it — it would be the same sentence twice. The dialog is still named for screen readers in that case. |
| `AC-DLG-3` | Its actions are **Use in chat** (primary) and **Close**.                                                                                                                                         |
| `AC-DLG-4` | The close control sits in the dialog's top-right corner, whether or not a header is shown.                                                                                                       |
| `AC-DLG-5` | Views opened inside it — Sources, Past versions — carry a back action that names where it returns to.                                                                                            |

### 3.5 Evidence posts

Reached from **See all N posts**. Each post is shown the way the platform shows a post
anywhere else.

| ID          | Criterion                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-POST-1` | Each post shows: author avatar, author name, network, published date, the post's text, its engagement, its sentiment, and a link to the original.                     |
| `AC-POST-2` | The date is on its own line under the name; the network sits beside the name, separated by a dot.                                                                     |
| `AC-POST-3` | Engagement reads as labelled figures separated by a dot ("62 likes · 14 comments"), not as bare icons. A count of zero is left out rather than printed.               |
| `AC-POST-4` | Sentiment and the "View on" link share **one row**: sentiment left, link right.                                                                                       |
| `AC-POST-5` | Sentiment shows an icon and a label, coloured **positive / neutral / negative**. In the read-only view only the label is coloured; the icon stays neutral.            |
| `AC-POST-6` | Clicking the sentiment opens a menu of the three values; choosing one updates the post and closes the menu. One menu at a time; Escape and an outside click close it. |
| `AC-POST-7` | **"View on" appears only when the post has a real link.** A link that goes nowhere is worse than no link.                                                             |
| `AC-POST-8` | A post with no engagement still shows its sentiment and its link.                                                                                                     |
| `AC-POST-9` | A sentiment the reader sets stays set: it is that post's sentiment from then on, on every surface and after a reload, not a choice that lasts the session.            |

---

## 4. Cross-cutting

| ID       | Criterion                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-X-1` | The sidebar's **Topic Feed** counter is the number of **New** Topics in the active Playbook's feed. Using or ignoring one decreases it straight away.                          |
| `AC-X-2` | Every list and counter reflects the **active Playbook** only. There is no "all Playbooks" view.                                                                                |
| `AC-X-3` | Triaging a Topic anywhere is reflected everywhere else without a reload.                                                                                                       |
| `AC-X-4` | Every control is reachable and operable by keyboard, and anything carried by colour — segments, sentiment, signals — is also carried by text a screen reader can read.         |
| `AC-X-5` | The signals, the segments and the age groups are all decided by the system that produces the Topics. The reader's own view must not invent state the feed does not know about. |

---

## 5. Prototype shortcuts that must NOT ship

Called out so nobody mistakes a demo trick for the behaviour.

| In the prototype                                                    | What it must be                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A card's age is a fixed phrase, not a real date                     | A real publication date, with the phrase and the age group derived from it |
| How often a feed runs is a label; nothing ever runs                 | An actual recurring run — see `AC-SET-8`                                   |
| The scanning state lasts a fixed moment                             | As long as the work takes                                                  |
| The fresh-topics waiting state lasts a fixed three seconds          | As long as the work takes — see `AC-FRESH-7`                               |
| Sentiment is guessed from the post's words, and forgotten on reload | A real value, kept — see `AC-POST-9`                                       |
| What the reader did with a Topic is forgotten on reload             | Kept for that reader — see `AC-ACT-5`                                      |
| One feed per Playbook, and nothing defines what a second would do   | Defined behaviour if a Playbook can ever have more than one                |

---

## 6. Tracking

**This section names events, properties and attributes on purpose.** Everywhere else in
this document a name would be implementation detail; here the names _are_ the thing being
agreed, so they are written out and must match exactly.

**One criterion per tracking update.** Each one is a single test.

**What a frontend test proves, and what it does not.** For every criterion in §6.4, the
test asserts that the element carries the stated `data-track` value and that clicking it
fires. It says nothing about the event reaching the warehouse, and nothing about the
payload — that is verified once, downstream, not per control. A missing attribute is a
failed test even when the click still works.

### 6.1 Updated — the workflow-start event

Three additions to `started_an_archie_workflow`. Nothing existing changes.

| ID         | Criterion                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-1` | `source_type` accepts **`topic`**, and reports it whenever the workflow was started from a Topic — from any of the four surfaces offering _Use in chat_. |
| `AC-TRK-2` | `entry_point` accepts **`starter-topic_list`**, and reports it when the workflow started from the Fresh topics list on a new chat.                       |
| `AC-TRK-3` | `entry_point` accepts **`topic-feed-panel`**, and reports it when the workflow started from the article shown beside the feed.                           |

The values already carried by `source_type` and `entry_point` must keep firing unchanged.
A test that only proves the new values arrive would pass while the old ones silently
stopped.

⚠️ Two entry points are named here, but four surfaces offer _Use in chat_ — the card's
own menu and the picker have no value assigned. Either they report one of these two, or
they need values of their own. See §7.

### 6.2 New event — a Topic was ignored

| ID         | Criterion                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-4` | Ignoring a Topic fires the event **once**, from either surface that offers it. Opening the reason dialog and cancelling fires nothing — the Topic was not ignored.                                                                                 |
| `AC-TRK-5` | The event carries all seven properties: `Topic_status`, `Topic_trending`, `Topic_updated`, `Topic_title`, `Topic_summary`, `Topic_playbook`, `Topic_source`. None may be absent or empty.                                                          |
| `AC-TRK-6` | `Topic_status`, `Topic_trending` and `Topic_updated` are reported **independently**. Ignoring a trending Topic sends the ignored status _and_ trending true — this is `AC-CORE-1` on the wire, and a payload that collapses them is a failed test. |

Allowed values:

| Property         | Values                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `Topic_status`   | `new` · `used` · `ignored`                                               |
| `Topic_trending` | `true` · `false`                                                         |
| `Topic_updated`  | `true` · `false`                                                         |
| `Topic_title`    | the article's title, the same sentence the reader saw — see `AC-TITLE-1` |
| `Topic_summary`  | the Topic's summary                                                      |
| `Topic_playbook` | the Playbook the Topic belongs to                                        |
| `Topic_source`   | the listening source it came from — competitor, influencer, website, …   |

⚠️ **`Topic_status` needs a decision before this can be tested.** On an ignore event the
status is always `ignored` once the action lands, which makes the property constant and
tells you nothing. It is only useful as the status the Topic held **before** the ignore —
which is how these criteria read it. See §7.

### 6.3 New — Topic traces on AI calls

| ID         | Criterion                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-TRK-7` | An AI call that takes a Topic as its input records a trace of that call's input and output, tagged with `Topic_trending`, `Topic_title`, `Topic_summary`, `Topic_playbook` and `Topic_source`. Whatever the tracing layer can carry, it carries all five or none — a partially tagged trace cannot be grouped by Topic. |

There is nothing for a frontend test to assert here: no control is involved and no
attribute is added. It is verified on the trace itself.

### 6.4 Frontend — the ten controls

Each control carries a `data-track` value. The values below are proposals: snake*case,
prefixed `topic*`, and naming the **surface** as well as the action, because the same
action on two surfaces is two different things to a funnel.

| ID          | The control                      | Where                              | `data-track`                   |
| ----------- | -------------------------------- | ---------------------------------- | ------------------------------ |
| `AC-TRK-8`  | **See more topics in your feed** | footer of the Fresh topics list    | `topic_feed_see_more`          |
| `AC-TRK-9`  | **Pick from the Topic Feed**     | the composer's Add menu            | `topic_picker_open`            |
| `AC-TRK-10` | a Topic card's body              | the Pick a topic dialog            | `topic_card_open_picker`       |
| `AC-TRK-11` | a Topic card's body              | the Fresh topics list              | `topic_card_open_fresh_list`   |
| `AC-TRK-12` | **Use in chat**                  | a feed card's action menu          | `topic_use_in_chat_card_menu`  |
| `AC-TRK-13` | **Use in chat**                  | the article beside the feed        | `topic_use_in_chat_panel`      |
| `AC-TRK-14` | **Use in chat**                  | the Pick a topic dialog            | `topic_use_in_chat_picker`     |
| `AC-TRK-15` | **Use in chat**                  | reached from the Fresh topics list | `topic_use_in_chat_fresh_list` |
| `AC-TRK-16` | **Ignore**                       | a feed card's action menu          | `topic_ignore_card_menu`       |
| `AC-TRK-17` | **Ignore**                       | the article beside the feed        | `topic_ignore_panel`           |

Two things that will bite whoever implements this:

- **`AC-TRK-14` and `AC-TRK-15` are the same button.** One article dialog serves both the
  picker and the Fresh topics list (`AC-DLG-1`), so a fixed attribute cannot tell them
  apart. The value has to be set from wherever the dialog was opened, or the two events
  will be indistinguishable — which defeats the reason for splitting them.
- **Cards open, they do not choose.** `AC-TRK-10` and `AC-TRK-11` record a card being
  read, not a Topic being taken (`AC-FRESH-8`). They are the top of the funnel whose
  bottom is `AC-TRK-14` / `AC-TRK-15`, and reading them as intent will overcount.

---

## 7. Open questions for product

| #   | Question                                                                                                                                   | Blocks                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1   | Does the attention notice ship? Its original reason for being switched off no longer holds (§2.5).                                         | `AC-SIG-4`, `AC-ATT-0`     |
| 2   | If not, how does a reader reach the attention page?                                                                                        | `AC-ATT-0`                 |
| 3   | Should the picker resurface ignored-but-trending Topics?                                                                                   | `AC-PICK-2b`               |
| 4   | Can a Playbook ever have more than one feed? Everything here assumes one.                                                                  | `AC-ROUTE-1`, `AC-FRESH-5` |
| 5   | Is a Topic's review state per reader or shared by the workspace? This document assumes per reader.                                         | `AC-ACT-5`                 |
| 6   | Is `Topic_status` on an ignore event the status **before** the ignore, or after? After makes it a constant (§6.2).                         | `AC-TRK-5`, `AC-TRK-6`     |
| 7   | Do _Use in chat_ from a card's menu and from the picker get their own `entry_point` values, or fold into an existing one (§6.1)?           | `AC-TRK-1`, `AC-TRK-2`     |
| 8   | `starter-topic_list` mixes a hyphen and an underscore while `topic-feed-panel` is all hyphens. Intended, or should both be one convention? | `AC-TRK-2`, `AC-TRK-3`     |
