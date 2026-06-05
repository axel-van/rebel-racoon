# Archie — Copy principles (Phase 2)

> **Status** — Phase 2. Voice, tone matrix, arbitrated glossary, copy patterns by family, style rules. Drives Phase 3 rewrites.
>
> **Date** — 2026-05-22
>
> **Dependencies** — Phase 0 calibration + Phase 1 audit findings. All §21 concept arbitrations are baked in.

---

## 1. Voice

Archie is a **clear, posed creative co-pilot**. Closer to a senior coworker who's seen many launches than to a chatty bot.

### Identity in one paragraph

Archie is the product. The brand visible to the user is always "Archie", never "Agorapulse" or "Composer". When the assistant speaks, it speaks in the **first person** (`I`, `me`, `my`). It owns its errors (`I couldn't read this file`). It never refers to itself in the third person, never says `we` for an internal team, and never says `Archie did X` in chat copy.

### Three adjectives the voice IS

- **Clear** — every sentence carries one idea. No throat-clearing.
- **Posed** — confident without bragging, helpful without performing. Reads like a smart Slack message, not a press release.
- **Concrete** — specific over abstract. Numbers, names, file types when they help.

### Three registers the voice is NOT

- **Not chatty / not flagornee** — no `great`, `so much`, `truly`, `wonderful`, `awesome`, `magic`, `magical`, `genius`.
- **Not infantilising** — no `Let's go!`, no `Yay`, no over-eager exclamations, no hand-holding tone (`don't worry`, `easy!`).
- **Not marketing** — no `AI-powered`, `seamless`, `next-gen`, `revolutionary`, `Powered by X`, `Studio-grade`, `Pro features`.

### Humour level: 3/10

A touch of warmth is welcome. Never gags, never jokes, never puns. The only places humour can briefly appear: the occasional dry observation in an extended AI reasoning bubble, or a single warm word in an empty state ("Empty for now."). Never in errors, confirmations, system messages, or any blocking UI.

### Voice anchor: Linear

When in doubt, ask: _would Linear's docs say this?_ If the answer is "no, too eager" or "no, too marketing", revise. Linear's UI strings are the boussole.

---

## 2. Tone matrix — modulation by surface

The voice is constant; the **tone** modulates by context.

| Surface                                | Posture                                                                           | Latitude                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding**                         | Warm but composed. The user just landed; greet them once, then get to work.       | `Hi` allowed once at the very first turn. No emojis. No exclamation marks.                                                |
| **AI bubbles (in-chat)**               | Conversational. 1st-person Archie. Short paragraphs. Can ask the user a question. | `I'll`, `Let me`, `Got it — ` is OK rarely, not as a verbal tic (max 1 per session).                                      |
| **Empty states**                       | Helpful + actionable. Always offer a next move. No apology for emptiness.         | Mild warmth is welcome (`Nothing here yet — drop a source to get started.`).                                              |
| **Errors**                             | Direct, factual, no apology. Name what happened, name what to do.                 | Never `Please`, never `We're sorry`, never `Something went wrong`. No exclamation.                                        |
| **Loading / Pending**                  | Descriptive neutral. Tell the user what's happening if it takes more than 2s.     | `Reading 4 sources…`, `Drafting 3 variants…`. No narration in the 1st person (`I'm reading…`) unless the wait exceeds 6s. |
| **Confirmations (destructive)**        | Spell out the consequence, name the action. No "Are you sure?"                    | `Delete playbook?` + `"Acme · Q2" will be removed. 4 chats using it will need a new playbook.`                            |
| **Toasts (success)**                   | Past-tense factual. No emoji. No exclamation.                                     | `Playbook duplicated.`, `Draft scheduled.`                                                                                |
| **Toasts (error)**                     | Same as errors. Offer Retry where applicable.                                     | `Couldn't create those drafts.` + Retry action.                                                                           |
| **Tooltips / titles**                  | Complement the UI, never duplicate the visible label. Max 80 chars.               | `Toggle Drafts panel`. Not `Drafts (click to toggle the Drafts panel)`.                                                   |
| **Settings labels**                    | Plain noun phrases. No imperative verbs.                                          | `Default tone`, `Weekly recap`, not `Set your default tone`.                                                              |
| **Settings descriptions**              | One sentence. Tell the user what the toggle does.                                 | `Add a small set of relevant hashtags to each post.`                                                                      |
| **Form labels**                        | Question form is fine when it adds context, statement form otherwise.             | `Who is your primary audience?` OK. `Audience` also OK. Avoid `Please enter your audience`.                               |
| **Buttons / CTAs**                     | Verb + object. Sentence case. No trailing period.                                 | `Save playbook`, `Delete source`, `Draft post`.                                                                           |
| **Quiet buttons (Cancel, Skip, Back)** | Single verb. No object needed when the action is universal.                       | `Cancel`, `Skip`, `Back`.                                                                                                 |

---

## 3. Glossary — arbitrated lexicon

Source of truth. Phase 3 will replace every drift detected in Phase 1 §19.4 with the official term below.

### Core nouns

| Concept                                                                            | Official term                                        | Notes / banned synonyms                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The unit of work in the app                                                        | **chat** (EN) / **Conversation** (FR, future locale) | Banned: `session`, `conversation` (EN), `thread`, `working session`, `workspace`. Lowercase mid-string in EN (`New chat`, `Recent chats`, `No chats yet`). Plural is `chats`. Phase 0 picked `Session`; Phase 1 §21.2 overrode to `Conversation`; Phase 2 final override to **`chat`** in EN with `Conversation` reserved for FR localisation. |
| A bundle of brand voice + audience + brief + branding                              | **Playbook**                                         | Banned: `context`, `Context`, `bundle`, `profile` (in this sense), `setup`.                                                                                                                                                                                                                                                                    |
| Sub-elements **exposed inside the Playbook**                                       | **Voice profile**, **Brief**, **Branding**           | These are _visible sub-labels_ inside the Playbook panel and addressable individually for editing. Each one is part of the Playbook, never a standalone entity.                                                                                                                                                                                |
| Brand visual identity (colors, typography, images, buttons extracted from website) | **Visual identity**                                  | Sub-section inside **Branding**. Banned: `Image Voice`, `image-voice`.                                                                                                                                                                                                                                                                         |
| A file / URL / connector item the user attaches                                    | **Source**                                           | Banned: `resource`, `reference`, `input`, `document` (too narrow), `attachment`.                                                                                                                                                                                                                                                               |
| Something Archie extracts from sources (hook, stat, quote, story, insight)         | **Idea**                                             | Banned: `theme`, `topic`, `output`, `Outputs`, `signal` (as a noun), `angle` (as a synonym; OK as a descriptor: `a contrarian angle`).                                                                                                                                                                                                         |
| A generated post                                                                   | **Draft**                                            | Banned: `post` (when referring to the unit; OK in `post body`, `LinkedIn post`), `variant`, `version`, `proposal`.                                                                                                                                                                                                                             |
| The Brand identity capitalised                                                     | **Brand**                                            | Phase 1 §21.9. Always capitalised when referring to the user's company brand.                                                                                                                                                                                                                                                                  |
| Saved items in the left sidebar                                                    | **Pinned**                                           | OK.                                                                                                                                                                                                                                                                                                                                            |
| Where the user adds documents from external services                               | **Connector**                                        | OK.                                                                                                                                                                                                                                                                                                                                            |
| Pre-written suggestions Archie offers as chips                                     | **Suggestions**                                      | Phase 1 §21.12. Banned: `custom additions`, `Other…` as a primary label (it stays as the input row only).                                                                                                                                                                                                                                      |

### Core verbs

| Action                           | Official verb                                                                                      | Notes                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Run the model again              | **Regenerate**                                                                                     | OK. Banned: `Re-mine`, `Re-derive`. `Rewrite` is reserved for _editorial_ rewriting of an existing draft (different intent). |
| Attach a file/URL/connector item | **Attach** (file/source), **Add** (when the verb is the dominant signal in a menu, e.g. `Add PDF`) | Banned: `Upload` as a verb in user-facing copy (OK as a tab label).                                                          |
| Pull from external service       | **Import**                                                                                         | OK.                                                                                                                          |
| Save                             | **Save {object}**                                                                                  | Always verb + object on a button. `Save changes` allowed when the object is implicit (an in-progress edit).                  |
| Edit                             | **Edit {object}**                                                                                  | Same.                                                                                                                        |
| Delete                           | **Delete {object}**                                                                                | Same. Confirm body must spell out consequence.                                                                               |
| Cancel                           | **Cancel**                                                                                         | Alone is fine.                                                                                                               |
| Skip                             | **Skip**                                                                                           | Alone is fine.                                                                                                               |
| Refine a Playbook field          | **Refine**                                                                                         | OK.                                                                                                                          |
| Open a panel                     | **Open** in tooltips (`Open Drafts panel`), **Show** in toggles (`Show details`).                  |

### Concepts retired (zero hits allowed in code after Phase 4)

- `Outputs` / `Output` (as a top-level concept). The right-panel header, topbar pill, status card all say **Ideas** going forward. The panel still surfaces Ideas + Clips as two tabs; the panel itself is called Ideas.
- `Themes` (in the video extraction flow). Use **Ideas**.
- `Library` (eyebrow on /ideas and /contexts). Drop entirely; no replacement.
- `Working session` / `workspace`. Drop entirely.
- `Content Studio` / `Content ideas` (Composer legacy). Use **Archie** / **Ideas**.
- `Strategy brief` / `Brand theme`. Use **Brief** / **Branding** (always inside Playbook).
- `Generation preferences` (settings drawer section). **Section retired** — Phase 1 §21.10: there is only the Playbook. Tone, language, length, hashtags, emojis, CTA style live inside the Playbook's Voice profile / Brief sub-elements. _(This implies a code-level removal of the section in Phase 4 — not just a relabel.)_
- `Image Voice`. Use **Visual identity**.
- `(mock)`, `Coming soon`, `(preview only)`, `(s)` pluralisation. None survive Phase 4.
- `chat` is the EN term; `chats` is the plural. `Conversation` / `Conversations` are reserved for the future FR locale only.

### Archie as a speaker

- `I` / `me` / `my` everywhere Archie speaks.
- Archie's name appears as a label above bubbles (`Archie`) and in onboarding signs (`Welcome to Archie`). Otherwise the agent refers to itself as `I`.
- When the system reports an Archie failure: `I couldn't read this file.` (1st person, owns it).
- When the system reports a non-Archie failure (network, quota): factual, no actor. `Quota reached. Resets at 00:00 UTC.`

### User addressing

- `you` / `your` everywhere. Contractions allowed (`you're`, `you'll`, `you've`).

### Banned in conversation echoes

Don't echo a button label verbatim as a `<You>` bubble (`Skip`, `Continue`). Either don't echo at all, or echo with a conversational equivalent (`Not right now`, `OK, continue`).

---

## 4. Copy patterns by family

### 4.1 Buttons / CTAs

**Rule**: verb + object, sentence case, no period.

**Pattern**: `[verb] [object]`

**Examples**:

- `Save playbook` (not `Save`)
- `Delete source` (not `Delete`)
- `Draft post` (not `Draft Post`, not `Generate Draft`)
- `Add a source` (the article `a` is allowed when it disambiguates count)
- `Add PDF` / `Add video` / `Add URL` (in a menu listing types, the article drops — `Add PDF` not `Add a PDF`)
- `Open editor` (not `Launch Playbook editor`)

**Exceptions** (single-verb buttons OK when context is universal):

- `Save` (inside an edit-in-place context where the object is the only thing on screen — e.g. inline draft editor)
- `Cancel`, `Skip`, `Back`, `Done`, `Continue`, `Connect`, `Disconnect`, `Retry`
- `Undo` (toast action)

**Don't**:

- Title Case (`Draft Post`, `Open Editor`).
- Verb alone when an object is needed for clarity (`Delete` on a confirm modal needs `Delete playbook`).
- Article when not needed (`Save the playbook`).
- Punctuation (`Save.`, `Save…` unless the ellipsis signals "this opens more UI" — e.g. `New playbook…`).

### 4.2 Empty states

**Rule**: 3 parts in this order — _what's empty + why it matters + how to start_. Icon + title + body + optional CTA.

**Pattern**:

- **Title**: `No {thing} yet` (preferred) or `No {thing} match` (when filter narrows).
- **Body**: one sentence. Why it matters → How to start.
- **CTA**: one button max, the most obvious next step.

**Examples**:

- ✅ `No drafts yet` / `Ask me for a batch — drafts will land here ready to review and schedule.` / `[Open chat]`
- ✅ `No ideas yet` / `Attach a source — I'll extract hooks, stats, quotes, and stories you can use to draft posts.` / `[Attach a source]`
- ❌ `No content yet.` (no actionable next step)
- ❌ `Oops, nothing here!` (banned tone + exclamation)

### 4.3 Errors

**Rule**: 3 parts in this order — _what happened + why (if knowable) + how to fix_. No "Please". No "Sorry". No "Oops". No "Something went wrong".

**Pattern**:

- **What**: past-tense factual sentence.
- **Why**: optional, single clause, only if user-actionable.
- **How**: imperative next step.

**Examples**:

- ✅ `Couldn't read this file. The PDF is password-protected. Remove the password and try again.`
- ✅ `Quota reached. Resets at 00:00 UTC.`
- ✅ `Image generation failed. Tweak the prompt and try again.` (acceptable; `Tweak` is on the edge but fits operator voice — see §4.4 note on `tweak`)
- ❌ `Oops! Something went wrong, please try again.`
- ❌ `We're sorry, the file couldn't be uploaded.`
- ❌ `Error: invalid URL.`

**Validation errors inline** (form fields):

- ✅ `Enter a URL starting with http:// or https://.`
- ✅ `Add a description before submitting.`
- ❌ `Please describe what went wrong before submitting.`

### 4.4 Loading / pending

**Rule**: descriptive neutral. Tell the user what's happening when it takes more than 2s. No 1st-person narration unless the wait exceeds 6s.

**Pattern**:

- **Short (<2s)**: silent spinner, no copy.
- **Medium (2–6s)**: `[Verb-ing] {object}…` e.g. `Reading source…`, `Generating image…`, `Scheduling…`.
- **Long (>6s)**: 1st-person narration allowed, with optional ETA. `I'm reading 4 sources — about 8s left.` Avoid hard promises (`Up to 45s`); use `~45s` or `about 45s`.

**Examples**:

- ✅ `Reading content`, `Identifying ideas`, `Mining hooks & quotes` (stage labels — neutral)
- ✅ `Cutting your clips…` (acceptable; the metaphor is editorial, not childish)
- ❌ `Archie is reading your sources…` (3rd-person)
- ❌ `Up to 45s · you can keep chatting` (hard promise + multiple ideas in one line)
- ✅ `About 45s. You can keep chatting.` (softened + clean split)

### 4.5 Confirmations (destructive)

**Rule**: name the consequence, label the action. No "Are you sure?".

**Pattern**:

- **Title**: `[Verb] [object]?` — same verb as the primary button.
- **Body**: spell out what happens, including secondary effects (e.g. orphaned sub-objects).
- **Primary**: `[Verb] [object]` — same verb again. Danger styling.
- **Secondary**: `Keep` (preferred) or `Cancel`.

**Examples**:

- ✅ Title: `Delete playbook?` / Body: `"Acme · Q2" will be removed. 4 chats using it will need a new playbook.` / Primary: `Delete playbook` / Secondary: `Keep`
- ✅ Title: `Delete chat?` / Body: `"Q2 launch" and its 6 sources, 7 ideas, and 3 drafts will be permanently removed.` / Primary: `Delete chat` / Secondary: `Keep`
- ❌ Title: `Are you sure?` — banned.
- ❌ Primary: `Delete` alone — should be `Delete {object}`.

### 4.6 Toasts

**Rule**: past-tense factual + optional Undo. No emoji. No exclamation. Default duration 3.2s.

**Pattern**: `[Object] [verb-ed]` or `[Verb-ed] {n} {object}`

**Examples**:

- ✅ `Playbook duplicated`
- ✅ `Draft scheduled`
- ✅ `3 sources deleted` + `Undo`
- ✅ `acme.com ready · 4 ideas extracted`
- ❌ `Successfully scheduled your post!`
- ❌ `Great, draft saved!`

### 4.7 Tooltips / titles

**Rule**: max 80 characters. Complement the UI, don't duplicate it.

**Pattern**: short noun phrase or short imperative.

**Examples**:

- ✅ `Open Drafts panel` (aria + title on the pill)
- ✅ `Drag to resize`
- ✅ `Toggle Drafts panel` (alternative phrasing OK on the same button)
- ❌ `Drafts (click to open the Drafts panel and see all your drafts)` — duplicates + too long.
- ❌ `Show details panel` when the label is just an `i` icon — fine, but the body of the panel should be obvious; if not, name it (`Show chat status`).

### 4.8 Loading skeletons + progress

**Rule**: only show a progress bar when the system can give a meaningful estimate. Otherwise show stage + spinner.

- Upload: `Uploading 64%` (real progress).
- Processing: `Reading content` / `Identifying ideas` (stage), no false progress %.

---

## 5. Style rules

### 5.1 Casing

**Sentence case everywhere.**

- Buttons: `Save playbook`, `Delete source`, `Add a source`.
- Headings (H1/H2/H3): `Audience and goals`, `Visual identity`.
- Section headings: `Voice profile`, `Brand`.
- Modal titles: `Add source`, `Schedule posts`.
- Tab labels: `Upload`, `URL`, `Connectors`, `Ideas`, `Clips`.
- Empty state titles: `No drafts yet`.

**Acceptable Title Case exceptions**:

- Proper nouns: `Archie`, `LinkedIn`, `X`, `Instagram`, `TikTok`, `Facebook`, `YouTube`, `Slack`, `Notion`, `Slite`, `Google Drive`, `Q2 launch`.
- Acronyms in copy: `URL`, `PDF`, `CTA`, `OKR`, `UI`, `BETA`.
- Network/platform official spellings: `LinkedIn`, `TikTok` (not `LinkedIn` then `Linkedin`).

**Banned**:

- ALL CAPS eyebrows (`EDITING CLIP`, `TIMELINE`) — replace with sentence case or a tag pill.
- Title Case CTAs (`Draft Post`, `Open Editor`).
- Mid-sentence capitalisation (`Text Primary`, `Image Voice`).

### 5.2 Punctuation

- **No period on short labels** (buttons, badges, tooltips, single-line empty state titles, status pills).
- **Period on full sentences** in body text, confirm bodies, hints, descriptions.
- **No exclamation marks anywhere in product UI.** Period.
- **Question marks** only on actual questions (form labels, picker titles, confirm modals).
- **Em dash (—)** preferred for parenthetical splits in conversational copy: `Got it — I'll draft 5 posts.`
- **Middle dot (·)** for inline metadata separation: `4 sources · 7 ideas · 3 drafts`.

### 5.3 Ellipsis

- Use the **typographic ellipsis `…`**, never three dots `...`.
- Allowed: loading states (`Generating image…`), input placeholders that signal "type more" (`Search ideas…`), "this opens more UI" CTAs (`New playbook…`).
- Banned: decorative trailing ellipses in headings (`Awesome…`), placeholders that are full sentences (`Write your feedback here…` — drop the ellipsis or rewrite).

### 5.4 Oxford comma

**Use it.** Consistency wins over taste. `hooks, stats, quotes, and stories`.

### 5.5 Contractions

**Allowed.** `you're`, `we'll` (Archie speaking as `I'll`), `can't`, `couldn't`, `won't`, `it's`. Don't force them — use the form that reads most naturally for the sentence.

### 5.6 Numbers

- **Use numerals for quantities**: `4 sources`, `3 ideas`, `5-day sequence`, `2 networks`.
- **Spell out small counts only in headlines** where typography matters: `Three constraints` (idea title — content, not UI). UI labels always use numerals.
- **Times**: `9am`, `1pm` (no space, lowercase). Avoid `9:00 AM`.
- **Durations**: `~45s`, `about 45s`, `8 min`. Not `45 seconds`.
- **Percentages**: `64%`, `92% confidence`.
- **File sizes**: `1.2 MB`, `34 MB`, `100 MB`. Space between number and unit.

### 5.7 Dates

- **Relative when fresh** (last 7 days): `just now`, `2h ago`, `Yesterday`, `5 days ago`.
- **Absolute beyond a week**: `2026-03-05`, `5 May`, `Thu · 9am` (scheduling slots).

### 5.8 Pluralisation

- **Always ternary**: `${n} draft${n === 1 ? "" : "s"} ready`.
- **Never `(s)`**.
- **Never bake singular into the string**: avoid `Drafted a post from clip` (write `Drafted 1 post from clip` and handle the count branch).

### 5.9 Spelling

- **US English**. `analyze`, `customize`, `color`, `behavior`, `center`.
- Apply consistently across context-builder, sidebar-wizard, playbook-editor (which currently mix `analyse` and `analyze`).

### 5.10 Quotation

- Use **straight quotes `"` `'`** in UI copy and code (machines render them; curly quotes break in templating).
- Exception: curly quotes are acceptable in **inside mock content** (idea titles, post bodies, voice analysis bullets) where they appear as user-authored text.

---

## 6. AI-specific rules

### 6.1 Attribution

**AI attribution is implicit.** The whole product is Archie. Don't badge content as "AI-suggested" or "Generated by AI" anywhere.

- ❌ `AI-suggested clips` (video clips modal eyebrow) → ✅ `Suggested clips` or drop the eyebrow entirely.
- ❌ `Rewrite with AI` (post card aria) → ✅ `Regenerate draft`.
- ❌ `context the AI should know when drafting…` (placeholder) → ✅ `context I should remember when drafting…`.
- ❌ Sparkles icon used as an "AI" signal in chip labels — sparkles is fine as a generic "this is dynamic" icon, not as an AI badge.

### 6.2 Generation phrasing

- **Announcing a generation**: 1st-person Archie. `I'll draft 5 posts from {source}.`
- **During generation**: descriptive stage labels (`Reading sources`, `Drafting variants`, `Identifying ideas`).
- **After generation**: factual + grounded. `Drafted 5 posts from "{source}". Each is sized for its network and follows the active Playbook.`

### 6.3 Regeneration phrasing

- The action: **`Regenerate`**.
- After regeneration: `Regenerated. New drafts replaced the previous batch.`
- During regeneration: `Regenerating…`.
- Never `Re-mining`, `Re-deriving`, `Refreshing` (in this sense).

### 6.4 Failures and refusals

- **AI failure**: factual. `Couldn't draft from this source. The file might be empty or unreadable. Try a different source.`
- **Quota / limit**: factual + when it resets. `Quota reached. Resets at 00:00 UTC.`
- **Sensitive content refusal**: factual + reason if knowable. `Skipped this passage — it includes content I won't draft from. Pick a different excerpt.`
- **Never apologise.** `Sorry`, `We're sorry`, `Apologies` are banned.

### 6.5 Reasoning / "Drafting" pill

The mermaid "Drafting" reasoning pill that wraps an AI bubble during thinking:

- Default meta: **`Thinking`** (replaces the current ambiguous `Drafting` when no draft is in progress).
- When a draft is in progress: meta becomes `Drafting`.
- When extracting: meta becomes `Extracting ideas`.
- When analysing a Playbook source: `Analyzing`.

### 6.6 No 3rd-person Archie in copy Archie owns

These are violations to scrub in Phase 3:

- ❌ `Archie analyse ton site…` → ✅ `I'm reading your site…` (after EN translation)
- ❌ `Archie is thinking…` → ✅ `Thinking…` or remove (pill carries the signal)
- ❌ `Archie will turn it into a batch of posts` → ✅ `I'll turn it into a batch of posts`

---

## 7. Interdits absolus (consolidated)

Confirmed Phase 0 + Phase 2 bans. Phase 3 cannot produce any of these.

### Vocabulary

- **Emojis in system copy**: ✨ 🎉 🚀 👋 📷 🎨 ⚡ 📰 🌀 — none. (Emojis in mock post bodies are OK, since they represent user content.)
- **"Oops"** / **"Whoops"** / **"Uh-oh"** — none.
- **"Please"** / **"Kindly"** — none.
- **"We're sorry"** / **"Sorry"** / **"Apologies"** — none.
- **"Click here to…"** / **"Click the button to…"** — none (we name the button).
- **"Magic"** / **"magical"** / **"AI-powered"** / **"AI-suggested"** / **"powered by"** — none.
- **"Something went wrong"** — never.
- **"Great"** / **"Awesome"** / **"Wonderful"** / **"Amazing"** / **"Fantastic"** — none in product UI. (`Yes, looks good` instead of `Yes, looks great`.)
- **"Thank you so much"** / **"thanks so much"** — none. (`Thanks` alone is OK in non-flagornee contexts.)

### Punctuation / typography

- **Exclamation marks**: zero in product UI.
- **Decorative ellipses** (`...` three dots): zero. Use `…` and only when it signals loading or "more UI".
- **`(s)` pluralisation**: zero.

### Style

- **ALL CAPS** in headings or eyebrows: zero. Use sentence case + a status pill if you need emphasis.
- **Title Case** in CTAs and labels: zero (except proper nouns and acronyms — §5.1).
- **3rd-person Archie** in copy that Archie owns: zero.
- **`We` / `our` voice** when Archie is speaking: zero.

### Dev state

- **`(mock)`** / **`Coming soon`** / **`(preview only)`** / **`pinning the page surface first`** — zero exposure to user. Mock states stay silent or factual ("Available in the desktop app" if a feature is conditional).

### Stale references

- References to surfaces that no longer exist (Library tab, Content tab, Content ideas) — zero. Phase 3 must rewrite or remove every hit found in Phase 1 §19.7.

---

## 8. Special policies

### 8.1 Onboarding language

The current `/welcome` linear flow + `/welcome-alt` ALT flow + `welcome-alt-recap` are in French. Phase 0 picked English-first.

**Phase 4 plan**: rewrite every onboarding string to English. FR translation is out of scope for Phase 4 and will be addressed when the localisation infrastructure lands (not yet).

**Exceptions during transition**: none. We do not ship partial translations.

### 8.2 Settings drawer restructure

Phase 1 §21.10 retired **Generation preferences** as a concept. The Settings drawer currently has 5 sections:

| Current section        | Decision                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Connectors             | Keep — global integrations, not Playbook-bound.                                        |
| Playbooks              | Keep — the Playbook library.                                                           |
| Generation preferences | **Retire — move every field to the Playbook's Voice / Brief / Branding sub-elements**. |
| Social accounts        | Keep — global, not Playbook-bound.                                                     |
| Notifications          | Keep — global.                                                                         |

The Generation preferences fields (tone, language, length, autoHashtags, autoEmojis, emojiFreq, ctaStyle) become defaults inside the Playbook. Phase 4 will rip out the section.

### 8.3 Echo policy for picker submits

When the user clicks a chip in a picker, the current code echoes the chip label as a `<You>` bubble (`Skip`, `Continue`, `Use the chat title`). This reads weird because the user didn't _say_ anything.

**Phase 4 rule**:

- For single-pick chips that carry meaningful content (e.g. profile name, document file), echo the content.
- For procedural chips (`Skip`, `Continue`, `Back`), **don't echo** — the next AI bubble carries the conversational continuation.
- For binary intent chips (`Yes, capture my strategy`, `Use the chat title`), echo with a softened equivalent (`OK, capture my strategy`, `Default name`).

### 8.4 Title duplication in pickers

Many wizards declare a `title` on the picker _and_ push an AI bubble with the same text. Phase 4 picks one:

- **Rule**: if an AI bubble carries the question (because the wizard reads as a chat), the picker `title` is `null` (or repurposed for a short step indicator like `Voice · Tones`).
- **Rule**: if there's no AI bubble (e.g. standalone modal pickers), the picker `title` carries the question.

### 8.5 Quotation in dynamic strings

When inserting a Playbook name, source filename, etc. into a string, wrap in **straight double quotes**: `"Acme · Q2"`. Avoid backticks or curly quotes in UI.

---

## 9. Decision log

The 12 §21 arbitrations from Phase 1 are now official:

| #   | Concept                                              | Decision                                                                                                     | Date       |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | Outputs vs Ideas                                     | **Ideas** everywhere; retire Outputs                                                                         | 2026-05-22 |
| 2   | Conversation vs Session vs chat                      | **`chat`** in EN (lowercase mid-string), **`Conversation`** reserved for future FR locale. `session` banned. | 2026-05-22 |
| 3   | Brief / Strategy brief / Brand theme / Voice profile | Exposed as **sub-elements of the Playbook** (Voice profile / Brief / Branding); each editable individually   | 2026-05-22 |
| 4   | Context everywhere in error toasts/confirms          | **Playbook** everywhere                                                                                      | 2026-05-22 |
| 5   | Themes (video flow) vs Ideas                         | **Ideas**                                                                                                    | 2026-05-22 |
| 6   | Content ideas / Content Studio                       | **Drop**                                                                                                     | 2026-05-22 |
| 7   | Library (eyebrow)                                    | **Drop**                                                                                                     | 2026-05-22 |
| 8   | Working session / workspace                          | **Drop**                                                                                                     | 2026-05-22 |
| 9   | `brand` vs `Brand`                                   | **Brand** (capitalised)                                                                                      | 2026-05-22 |
| 10  | Generation preferences (Settings section)            | **Retire entirely** — there's only the Playbook                                                              | 2026-05-22 |
| 11  | Image Voice rename                                   | **Visual identity** (proposed in Phase 2 since user delegated)                                               | 2026-05-22 |
| 12  | Custom additions / Suggestions / Other…              | **Suggestions** (canonical), `Other…` stays only as the input row label                                      | 2026-05-22 |

---

## 10. Applying these principles

These principles are the canonical source for any rewrite. To apply them per-string:

- Take a surface (screen, modal, panel).
- Walk every user-facing string in order.
- Score against §1 (voice), §3–§6 (tone, glossary, patterns).
- Propose a rewrite + 1-line rationale (`Before` / `After` / `Why`).
- Order by severity (🔴 first), commit by surface.
