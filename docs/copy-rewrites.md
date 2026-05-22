# Archie — Copy rewrites (Phase 3)

> **Status** — Phase 3. Before/After rewrites for every 🔴 → 🟠 → 🟡 entry from Phase 1 audit, honouring every rule in Phase 2.
>
> **Date** — 2026-05-22
>
> **Dependencies** — [docs/copy-audit.md](copy-audit.md) (Phase 1) + [docs/copy-principles.md](copy-principles.md) (Phase 2). IDs match Phase 1 row IDs.
>
> **Out of scope** — Strings flagged 🟢 in Phase 1. Strings inside `mocks.js` that represent user-authored sample content (post bodies, idea titles, voice analysis bullets) — they're demo material, not product copy.

---

## Methodology

For every entry in Phase 1 with severity 🔴 / 🟠 / 🟡:

- **Before** — the verbatim current string.
- **After** — the rewrite.
- **Rationale** — one short line tying the rewrite to a Phase 2 rule.

When a single sweep rule covers a large family of rewrites (e.g. every `conversation` → `chat`), it appears once in **§1 Sweep rules**, then per-surface tables skip the trivial repetitions and call out only what diverges from the sweep.

---

## 1. Sweep rules (apply across all files)

These transformations run as a global sweep across every string in the codebase. Per-surface sections below assume these are applied first.

### S1 — `conversation` / `Conversation` → `chat` / `Chat`

Per Phase 2 §3 (overridden glossary). All EN UI copy uses `chat` (lowercase mid-string, capitalised start-of-string). `Conversation` is reserved for the future FR locale.

| Pattern                                                                         | Rewrite                                          | Surfaces affected                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `New conversation`                                                              | `New chat`                                       | sidebar, topbar fallback, modal placeholders |
| `Recent conversations`                                                          | `Recent chats`                                   | sidebar nav aria + section heading           |
| `Search conversations`                                                          | `Search chats`                                   | search modal aria, placeholder, sidebar nav  |
| `No conversations yet`                                                          | `No chats yet`                                   | sidebar empty, search empty                  |
| `No conversations match`                                                        | `No chats match`                                 | search empty                                 |
| `Untitled conversation`                                                         | `Untitled chat`                                  | search fallback                              |
| `Rename conversation`                                                           | `Rename chat`                                    | sidebar, topbar                              |
| `Delete conversation?`                                                          | `Delete chat?`                                   | sidebar                                      |
| `Delete conversation`                                                           | `Delete chat`                                    | sidebar confirm CTA                          |
| `Conversation pinned` / `unpinned` / `deleted`                                  | `Chat pinned` / `Chat unpinned` / `Chat deleted` | sidebar toasts                               |
| `Conversation name`                                                             | `Chat name`                                      | rename modal placeholder                     |
| `${n} chat uses this playbook` / `${n} chats use this playbook`                 | unchanged (already correct)                      | contexts card title                          |
| `${n} ${n === 1 ? "conversation" : "conversations"}` in any pluralised template | `${n} ${n === 1 ? "chat" : "chats"}`             | contexts card sub, delete body               |
| `chat title` (in wizard memorize)                                               | `chat name` (consistency with rename modal)      | sidebar-wizard                               |

### S2 — `context` / `Context` → `playbook` / `Playbook`

Per Phase 2 §3. Capitalise `Playbook` when referring to the user-facing concept (matching sidebar nav `Playbooks`), lowercase in flowing copy.

| Pattern                                                                       | Rewrite                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Context name & color`                                                        | `Playbook name & color`                                                        |
| `Context deleted` (toast)                                                     | `Playbook deleted`                                                             |
| `Context name in chats and listings`                                          | `Playbook name in chats and listings`                                          |
| `Editing the ${section} will update this context across every chat using it.` | `Editing the ${section} will update this playbook across every chat using it.` |
| `Run the edit wizard. Changes propagate to all chats using this context.`     | `Run the edit wizard. Changes propagate to every chat using this playbook.`    |
| `${section} updated everywhere this context is used.`                         | `${section} updated in every chat that uses this playbook.`                    |
| `Pick a color for your context`                                               | `Pick a color for your playbook`                                               |
| `bundle of voice, brief, and brand` (settings empty body)                     | `playbook bundling voice, brief, and brand`                                    |
| Any data attribute or variable named `context*` in user-facing copy contexts  | replaced where rendered as text; internal variable names stay                  |

### S3 — `Outputs` / `Output` → `Ideas` / `Idea`

The right-panel header, topbar pill, and conversation status card all rename. The panel still surfaces Ideas + Clips as two tabs, but the panel name is **Ideas** (the Clips tab becomes a sub-view of the Ideas panel — same as today, just relabeled).

| Pattern                                                                | Rewrite                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Topbar pill label `Outputs`                                            | `Ideas`                                                   |
| Topbar pill title `Toggle Outputs panel`                               | `Toggle Ideas panel`                                      |
| Topbar pill title `No outputs yet — attach a source or send a message` | `No ideas yet — attach a source or send a message`        |
| Right-panel header `Outputs`                                           | `Ideas`                                                   |
| Status card `Outputs` row                                              | `Ideas` row                                               |
| Status card `Open Outputs panel` (title)                               | `Open Ideas panel`                                        |
| `Processed · {n} ideas` link title `Open Outputs panel`                | `Open Ideas panel`                                        |
| Section default title fallback in right-panel: `Outputs`               | `Ideas`                                                   |
| Drafts pill `No drafts in this conversation yet`                       | `No drafts in this chat yet` (sweep S1 also applies here) |

### S4 — `themes` / `Themes` → `ideas` / `Ideas` (video flow)

| Pattern                                                | Rewrite                                  |
| ------------------------------------------------------ | ---------------------------------------- |
| Video intake choice `Extract themes`                   | `Extract ideas`                          |
| Pending bubble title `Reading the video for themes…`   | `Reading the video for ideas…`           |
| Ready bubble title `Themes ready from ${filename}`     | `Ideas ready from ${filename}`           |
| Ready bubble sub `Check the Ideas panel on the right.` | (unchanged — already says "Ideas panel") |

### S5 — `Library` eyebrow → drop

| Pattern                                                      | Rewrite                                     |
| ------------------------------------------------------------ | ------------------------------------------- |
| `/ideas` page eyebrow `Library`                              | (remove the eyebrow line entirely)          |
| `/contexts` page eyebrow `Library`                           | (remove the eyebrow line entirely)          |
| `pick from your library to start.` (Sources panel empty sub) | `pick from a connector to start.`           |
| `re-open the editor anytime from the Playbooks library`      | `re-open the editor anytime from Playbooks` |
| `Playbooks library` (any reference)                          | `Playbooks`                                 |

### S6 — `Got it —` verbal tic → drop or replace

Phase 2 §1: max 1 use per chat session. Most current uses are openers in pickup intros. Strip them.

| Before                                                                                                               | After                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Got it — paste your website URL and I'll pull the brand voice, audience and visual identity from it.`               | `Paste your website URL and I'll pull the brand voice, audience, and visual identity.`                 |
| `Got it — drop a brand or strategy document and I'll build the playbook from it.`                                    | `Drop a brand or strategy document and I'll build the playbook from it.`                               |
| `Got it — I'm reading **${filename}**. While I extract the strongest moments, what should I do with it?`             | `Reading **${filename}** now. While I pull the strongest ideas, what should I do with it?`             |
| `Got it — I'll draft 5 posts from **${filename}** across LinkedIn, X, and Instagram as soon as the analysis lands.`  | `I'll draft 5 posts from **${filename}** across LinkedIn, X, and Instagram once the analysis lands.`   |
| `Got it — I'll turn **${filename}** into 8 posts (3 LinkedIn, 3 X, 2 Instagram) keeping the brand voice consistent.` | `I'll turn **${filename}** into 8 posts: 3 LinkedIn, 3 X, 2 Instagram, all in the brand voice.`        |
| `Got it — I'll surface the strongest ideas from **${filename}** first. You can decide what to draft from there.`     | `I'll surface the strongest ideas from **${filename}** first. You can pick which to draft from there.` |

### S7 — Onboarding FR → EN

Full English rewrite of the linear `/welcome` flow and the ALT chat + recap. See **§3** below for the per-string table. No partial translation — the FR strings stay in `welcome.css` only if a localisation infra ever lands.

### S8 — `Please` → drop / rephrase

| Before                                               | After                                         |
| ---------------------------------------------------- | --------------------------------------------- |
| `Please write your feedback before sending.`         | `Write your feedback before sending.`         |
| `Please describe what went wrong before submitting.` | `Describe what went wrong before submitting.` |
| `Please enter your audience` (any future use)        | `Enter your audience`                         |

### S9 — `...` (three dots) → `…` (typographic ellipsis)

| Before                                  | After                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ask archie...` (composer placeholder)  | `Ask Archie` (no ellipsis, no lowercase — see per-surface §6.3)                                        |
| `e.g. Schedule a post, add a source...` | `e.g. Schedule a post, add a source…`                                                                  |
| `e.g. The calendar didn't open...`      | `e.g. The calendar didn't open…`                                                                       |
| `Write your feedback here...`           | (drop the trailing dots; redundant with the label) → `What should we know?` (full rewrite — see §15.5) |

### S10 — `Generation preferences` section → retire entirely

Phase 2 §8.2 + Phase 1 §21.10. The entire `settings-drawer.js` section retires. No rewrites needed for these strings — they will be deleted in Phase 4:

- `Generation preferences` (section title)
- `Defaults applied to every new post Archie drafts.` (sub)
- `Default tone`, `Default language`, `Default post length`, `Auto-add hashtags`, `Auto-add emojis`, `Frequency`, `Default CTA style` + their hints + radio labels + option labels
- `Save` (footer btn)
- Tone options: `Professional`, `Friendly`, `Casual`, `Witty`, `Inspirational`, `Educational`
- Length options: `Short`, `Medium`, `Long`
- Frequency options: `Minimal`, `Balanced`, `Generous`
- CTA options: `None`, `Question`, `Direct ask`, `Soft suggestion`

The corresponding nav item `Generation preferences` is also removed. Default tone/language/length/CTA become Playbook fields (see Phase 4 plan §3 below).

### S11 — `Image Voice` → `Visual identity`

| Before                                              | After                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Section title `Image Voice`                         | `Visual identity`                                                                               |
| Sub `Brand visual identity extracted from websites` | `Pulled from your website`                                                                      |
| `Text Primary` (color label)                        | `Body text`                                                                                     |
| Trash button `Remove website` / `Coming soon` title | Remove the disabled button entirely; if kept, label `Remove site` (no "Coming soon" disclosure) |

### S12 — Emojis in system copy → drop

| Before                                                            | After                                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Bienvenue 👋` (welcome.js eyebrow)                               | replaced by EN copy, no emoji (see §3)                                             |
| `Bienvenue 👋 On va construire ton Playbook ensemble…` (ALT chat) | replaced by EN, no emoji                                                           |
| Generate-image style chips with emoji icons (📷 🎨 ⚡ 📰 🌀)      | drop the emoji from the chip label; rely on the existing chip style and label text |

### S13 — Exclamation marks → drop

| Before                                            | After                                        |
| ------------------------------------------------- | -------------------------------------------- |
| `Bug reported!`                                   | `Bug reported`                               |
| `Thanks for your feedback!`                       | `Thanks for your feedback`                   |
| `Yes, looks great` (Phase 0 §1.3 forbids "great") | `Yes, looks good`                            |
| `Bienvenue ${playbookName} !`                     | replaced by EN: `Welcome to ${playbookName}` |

### S14 — Dev-state leaks → drop or rephrase

| Before                                                               | After                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Regenerating draft… (mock)`                                         | `Regenerating draft…`                                                                       |
| `This action lands in a follow-up — pinning the page surface first.` | (drop entirely — replace the toast with a real action or hide the affordance until Phase 4) |
| `Coming soon` (Image Voice trash btn title)                          | (drop the button — see S11)                                                                 |
| `(preview only)` (video clips play btn title)                        | `Play preview` (the parenthetical was redundant)                                            |
| `(mock)` / `(s)` anywhere                                            | drop                                                                                        |

### S15 — Title Case CTAs → sentence case

| Before                       | After          |
| ---------------------------- | -------------- |
| `Draft Post` (idea-card CTA) | `Draft post`   |
| `Draft Post` (clip-card CTA) | `Draft post`   |
| `Save Changes` (anywhere)    | `Save changes` |
| `Open Editor` (anywhere)     | `Open editor`  |

### S16 — 3rd-person Archie / `we` voice → 1st-person

| Before                                                                                                             | After                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Archie analyse ton site…` (FR — replaced by S7)                                                                   | `I'm reading your site…`                                                                                                                                                                 |
| `Archie is thinking…` (status card fallback)                                                                       | `Thinking…`                                                                                                                                                                              |
| `Archie will turn it into a batch of posts` (empty hero sub)                                                       | `I'll turn it into a batch of posts`                                                                                                                                                     |
| `What are we creating today?` (empty hero)                                                                         | `What are you working on?` (you-voice, not nous-voice)                                                                                                                                   |
| `We read every piece of feedback…`                                                                                 | `Archie reads every piece of feedback…` (acceptable 3rd-person here because the form copy is **about** Archie, not Archie speaking) — alternatively `Every piece of feedback gets read.` |
| `Thank you so much for your feedback, we will take it into account in the continuous improvements of our product!` | `Thanks for your feedback. It feeds into how Archie evolves.`                                                                                                                            |
| `We read every message and use it to improve Archie.`                                                              | `Every message feeds into Archie's improvements.`                                                                                                                                        |
| `Share what happened and we will send the context with it.`                                                        | `Share what happened. Archie attaches the screen context with it.`                                                                                                                       |
| `Green chips were suggested by Archie.`                                                                            | `Green chips are Archie's suggestions.`                                                                                                                                                  |
| `This idea has been generated using these sources`                                                                 | `Sources used to generate this idea`                                                                                                                                                     |

### S17 — Echo policy — drop procedural echoes

Per Phase 2 §8.3. The user clicking `Skip` / `Continue` / `Use the chat title` should NOT produce a `<You>` bubble echoing the button label.

| Echo to drop                                     | Where                                                |
| ------------------------------------------------ | ---------------------------------------------------- |
| `Skip` echoed as `<You>`                         | every wizard skip-fallback (cb.user-echo.skip, etc.) |
| `Continue` echoed as `<You>`                     | sidebar-wizard, context-builder                      |
| `Use default name` / `Use the chat title` echoed | sidebar-wizard memorize step                         |
| `Passer` (FR)                                    | replaced by EN, then dropped                         |
| Profile pick echo `${platformLabel} · ${handle}` | KEPT — meaningful content the user picked            |
| Document upload echo `Uploaded ${filename}`      | KEPT — meaningful content                            |

### S18 — Duplicate picker title + AI bubble — pick one

Per Phase 2 §8.4. Many wizards render the same string as an AI bubble (intro) and the picker title. Rule: when the AI bubble carries the question, the picker `title` becomes a short noun-phrase step label (`Voice`, `Brief`, `Branding`, `Profile`).

| Surface                       | Keep as AI bubble                                                                              | Picker title becomes                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| voice intake (wizard)         | `Want me to learn how you write? I'll analyze a profile or a document to match your voice.`    | (drop title, keep `Voice` as stepIndicator)               |
| voice source picker           | `Which profile should I analyze?`                                                              | (drop title)                                              |
| voice profile picker          | `Pick a profile to analyze:`                                                                   | (drop title)                                              |
| brief intake                  | `Want me to capture your brief? I'll set goals, audience, and brand voice for this chat.`      | (drop title)                                              |
| brand intake                  | `Want me to pull in your branding? I'll grab colors, imagery, and personality from your site.` | (drop title)                                              |
| analyze summaries             | (existing summary text)                                                                        | (drop redundant title)                                    |
| context-builder source picker | `Let's set up a new playbook.` + `How should I start?`                                         | Keep title — modal picker, no separate bubble works here. |

---

## 2. Sweep coverage stats

After S1–S18, the following share of Phase 1 entries is already addressed:

- 🔴 Onboarding FR (≈55 entries) — fully covered by S7 + per-string §3 below.
- 🔴 "Outputs" concept (≈12 entries) — fully covered by S3.
- 🔴 "Conversation"/"chat" drift (≈25 entries) — fully covered by S1.
- 🔴 "Context" drift (≈12 entries) — fully covered by S2.
- 🔴 "Themes" drift (≈4 entries) — fully covered by S4.
- 🟠 "Got it" tic (~6 entries) — fully covered by S6.
- 🟠 "Library" eyebrow + body (≈5 entries) — fully covered by S5.
- 🔴 emoji in system copy (≈7 entries) — fully covered by S12.
- 🔴 exclamation marks (≈4 entries) — fully covered by S13.
- 🟠 Title Case CTAs (≈3 entries) — fully covered by S15.
- 🟠 dev-state leaks (≈5 entries) — fully covered by S14.
- Voice violations (≈13 entries) — fully covered by S16.

≈150 of the ~300 non-🟢 entries are sweep-handled. The rest (≈150) are per-surface judgement calls. They follow.

---

## 3. Onboarding linear flow — full EN rewrite

Per Phase 2 §8.1 + S7. Every welcome screen rewritten. Files: `welcome.js`, `welcome-socials.js`, `welcome-sources.js`, `welcome-recap.js`, `welcome-alt.js`, `welcome-alt-recap.js`. Plus the toast in `session.js:1294`.

### 3.1 `/welcome` — Step 1 of 4 (URL input)

| ID                             | Before (FR)                                                                                                                                           | After (EN)                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `onb.linear.step1.brand-chip`  | `Powered by Agorapulse`                                                                                                                               | `BETA` (replace marketing tagline with the existing BETA badge pattern — Phase 0 §1.3 bans marketing-ese). Alternative: drop the chip entirely. |
| `onb.linear.step1.eyebrow`     | `Bienvenue 👋`                                                                                                                                        | `Welcome`                                                                                                                                       |
| `onb.linear.step1.title`       | `Faisons connaissance avec ton brand.`                                                                                                                | `Let's get to know your brand.`                                                                                                                 |
| `onb.linear.step1.sub`         | `Colle l'URL de ton site et Archie en extrait ta voix, ton audience et ton identité visuelle. On construit ton Playbook ensemble en quelques étapes.` | `Paste your website URL and I'll extract your voice, audience, and visual identity. We'll build your Playbook in a few steps.`                  |
| `onb.linear.step1.label`       | `URL de ton site`                                                                                                                                     | `Your website URL`                                                                                                                              |
| `onb.linear.step1.placeholder` | `https://your-brand.com`                                                                                                                              | (unchanged)                                                                                                                                     |
| `onb.linear.step1.submit`      | `Continuer`                                                                                                                                           | `Continue`                                                                                                                                      |
| `onb.linear.step1.hint`        | `On analyse ton site pour démarrer ton Playbook. Tu pourras tout modifier après.`                                                                     | `Archie analyses your site to seed the Playbook. You can edit anything later.`                                                                  |
| `onb.linear.step1.error`       | `Colle une URL valide pour démarrer (ex : acme.com).`                                                                                                 | `Enter a URL like acme.com or https://acme.com.`                                                                                                |
| `onb.linear.step1.roadmap.1`   | `Ton site`                                                                                                                                            | `Site`                                                                                                                                          |
| `onb.linear.step1.roadmap.2`   | `Tes réseaux`                                                                                                                                         | `Profile`                                                                                                                                       |
| `onb.linear.step1.roadmap.3`   | `Tes sources`                                                                                                                                         | `Sources`                                                                                                                                       |
| `onb.linear.step1.roadmap.4`   | `Ton Playbook`                                                                                                                                        | `Playbook`                                                                                                                                      |

### 3.2 `/welcome/socials` — Step 2 of 4

| ID                          | Before (FR)                                                                                                                        | After (EN)                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onb.linear.step2.tag`      | `Étape 2 sur 4`                                                                                                                    | `Step 2 of 4`                                                                                                                                                                 |
| `onb.linear.step2.title`    | `Quel profil veux-tu utiliser ?`                                                                                                   | `Which profile should I use?`                                                                                                                                                 |
| `onb.linear.step2.sub`      | `Voici les comptes que tu as déjà connectés à Agorapulse — choisis-en un pour démarrer. Tu pourras en ajouter d'autres plus tard.` | `Here are the accounts you've already connected. Pick one to start — you can add more later.` (drops the parent-brand mention; Phase 0 §5.1 keeps Archie the visible product) |
| `onb.linear.step2.skip`     | `Passer pour l'instant`                                                                                                            | `Skip for now`                                                                                                                                                                |
| `onb.linear.step2.continue` | `Continuer`                                                                                                                        | `Continue`                                                                                                                                                                    |

### 3.3 `/welcome/sources` — Step 3 of 4

| ID                                 | Before (FR)                                                                                                                                                  | After (EN)                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `onb.linear.step3.tag`             | `Étape 3 sur 4 · optionnelle`                                                                                                                                | `Step 3 of 4 · optional`                                                                                                 |
| `onb.linear.step3.title`           | `Connecte tes sources de documents`                                                                                                                          | `Connect your document sources`                                                                                          |
| `onb.linear.step3.sub`             | `Slite, Notion, Google Drive ou Slack — Archie y puisera tes contenus existants pour s'aligner sur ton style. Tu pourras en ajouter d'autres à tout moment.` | `Slite, Notion, Google Drive, or Slack. I'll pull your existing content to match your style. You can add more any time.` |
| `onb.linear.step3.skip`            | `Passer pour l'instant`                                                                                                                                      | `Skip for now`                                                                                                           |
| `onb.linear.step3.continue`        | `Continuer`                                                                                                                                                  | `Continue`                                                                                                               |
| `onb.linear.step3.card.status`     | `Connecté · ${account}`                                                                                                                                      | `Connected · ${account}`                                                                                                 |
| `onb.linear.step3.card.connect`    | `Connecter`                                                                                                                                                  | `Connect`                                                                                                                |
| `onb.linear.step3.card.disconnect` | `Déconnecter`                                                                                                                                                | `Disconnect`                                                                                                             |

### 3.4 `/welcome/recap` — Step 4 of 4

| ID                               | Before (FR)                                                                      | After (EN)                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `onb.linear.recap.pending.title` | `Archie analyse ton site…`                                                       | `Reading your site…`                                          |
| `onb.linear.recap.pending.sub`   | `Le récap apparaît dans un instant.`                                             | `The recap lands in a moment.`                                |
| `onb.linear.recap.tag`           | `Étape 4 sur 4`                                                                  | `Step 4 of 4`                                                 |
| `onb.linear.recap.title`         | `Voici ton Playbook.`                                                            | `Here's your Playbook.`                                       |
| `onb.linear.recap.sub`           | `Vérifie les détails — tu peux le raffiner avec Archie ou démarrer directement.` | `Check the details — refine with Archie or jump straight in.` |
| `onb.linear.recap.cta.finetune`  | `Fine-tune mon Playbook`                                                         | `Fine-tune Playbook`                                          |
| `onb.linear.recap.cta.done`      | `Entrer dans Archie`                                                             | `Enter Archie`                                                |

### 3.5 `/welcome-alt/recap`

Same screen architecture as 3.4 — same rewrites except the eyebrow.

| ID                            | Before (FR)                                                                                                      | After (EN)                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `onb.alt.recap.pending.title` | `Archie analyse ton site…`                                                                                       | `Reading your site…`                                                                    |
| `onb.alt.recap.pending.sub`   | `Le récap apparaît dans un instant.`                                                                             | `The recap lands in a moment.`                                                          |
| `onb.alt.recap.tag`           | `Résultat`                                                                                                       | `Result`                                                                                |
| `onb.alt.recap.title`         | `Voici ton Playbook.`                                                                                            | `Here's your Playbook.`                                                                 |
| `onb.alt.recap.sub`           | `Voici ce qu'Archie a compris de ton brand depuis la conversation. Tu peux le raffiner ou démarrer directement.` | `Here's what I pulled from your Brand through our chat. Refine it or jump straight in.` |
| `onb.alt.recap.cta.finetune`  | `Fine-tune mon Playbook`                                                                                         | `Fine-tune Playbook`                                                                    |
| `onb.alt.recap.cta.done`      | `Entrer dans Archie`                                                                                             | `Enter Archie`                                                                          |

### 3.6 ALT conversational script (`context-builder.js` startAlt)

| ID                               | Before (FR)                                                                                                                                | After (EN)                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `onb.alt.chat.q1.intro`          | `Bienvenue 👋 On va construire ton Playbook ensemble. Colle l'URL de ton site et j'en extrais la voix, l'audience et l'identité visuelle.` | `Welcome. Let's build your Playbook together. Paste your website URL and I'll extract the voice, audience, and visual identity.`            |
| `onb.alt.chat.q1.title`          | `Quelle est l'URL de ton site ?`                                                                                                           | `What's your website URL?`                                                                                                                  |
| `onb.alt.chat.q1.step`           | `1 / 3`                                                                                                                                    | (unchanged)                                                                                                                                 |
| `onb.alt.chat.q1.placeholder`    | `https://your-brand.com`                                                                                                                   | (unchanged)                                                                                                                                 |
| `onb.alt.chat.q2.intro`          | `Choisis le profil que tu veux utiliser pour ce Playbook — je l'utiliserai pour adapter le ton et le format des posts.`                    | `Pick the profile to use for this Playbook. I'll tune tone and format for it.`                                                              |
| `onb.alt.chat.q2.title`          | `Sur quel profil veux-tu publier ?`                                                                                                        | `Which profile will publish?`                                                                                                               |
| `onb.alt.chat.q2.step`           | `2 / 3`                                                                                                                                    | (unchanged)                                                                                                                                 |
| `onb.alt.chat.q3.intro`          | `Tu peux aussi connecter des documents qui détaillent ta marque (brand book, brief stratégique, etc.) — ou passer à la suite.`             | `Optional: connect documents that detail your Brand (brand book, brief, etc.). Or skip.`                                                    |
| `onb.alt.chat.q3.title`          | `Connecter des documents (optionnel)`                                                                                                      | `Connect documents (optional)`                                                                                                              |
| `onb.alt.chat.q3.submit`         | `Continuer`                                                                                                                                | `Continue`                                                                                                                                  |
| `onb.alt.chat.q3.skip`           | `Passer`                                                                                                                                   | `Skip`                                                                                                                                      |
| `onb.alt.chat.q3.echo.connected` | `${n} source(s) connectée(s)`                                                                                                              | `${n} ${n === 1 ? "source" : "sources"} connected`                                                                                          |
| `onb.alt.chat.q3.echo.skip`      | `Passer`                                                                                                                                   | (drop the echo per S17)                                                                                                                     |
| `onb.alt.chat.notice.extracting` | `Extracting guidelines`                                                                                                                    | (unchanged — already EN, but switch to `Reading your site` to match S16 voice + S2 lexicon: drop "guidelines" jargon) → `Reading your site` |
| `onb.alt.chat.notice.extracted`  | `Extracted guidelines`                                                                                                                     | `Site read`                                                                                                                                 |

### 3.7 Post-onboarding welcome toast

| ID                         | Before (FR)                                  | After (EN)                                            |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `onb.linear.toast.welcome` | `Bienvenue ${pendingWelcome.playbookName} !` | `Welcome — your Playbook "${playbookName}" is ready.` |

---

## 4. Context-builder regular path (EN — `+ New playbook` from a chat)

| ID                          | Before                                                                                                                           | After                                                                                                                  | Rationale                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `cb.intro.normal`           | `Let's set up a new playbook.`                                                                                                   | `Let's set up a new Playbook.`                                                                                         | Capitalisation per S2                         |
| `cb.intro.auto`             | `Before I dive in — there's no playbook defined for this conversation yet. Let's create one together, it'll only take a minute.` | `There's no Playbook in this chat yet. Let's build one — it takes a minute.`                                           | Voice posed (no "dive in"), no chatty promise |
| `cb.source.website.caption` | `Paste any URL — agorapulse.com, your blog, a landing page…`                                                                     | `Paste any URL — your website, blog, or landing page.`                                                                 | Drop parent-brand mention                     |
| `cb.analysis.pending`       | `Extracting guidelines`                                                                                                          | `Reading your source`                                                                                                  | Drop "guidelines" jargon; align with S4/S16   |
| `cb.analysis.ready`         | `Extracted guidelines`                                                                                                           | `Source read`                                                                                                          | Same                                          |
| `cb.social.intro`           | `Which connected profile should I analyse? I'll capture its voice and use it to shape the playbook's tone and format.`           | `Which connected profile should I analyze? I'll capture its voice and shape the Playbook's tone and format around it.` | US "analyze" (S5.9); "Playbook" capitalised   |
| `cb.social.title`           | `Which profile to analyse?`                                                                                                      | (drop title per S18)                                                                                                   |
| `cb.user-echo.skip`         | `Skip` echoed as `<You>`                                                                                                         | (drop echo per S17)                                                                                                    | —                                             |
| `cb.url.intro`              | `Got it — paste your website URL and I'll pull the brand voice, audience and visual identity from it.`                           | `Paste your website URL and I'll pull the brand voice, audience, and visual identity.`                                 | S6                                            |
| `cb.doc.intro`              | `Got it — drop a brand or strategy document and I'll build the playbook from it.`                                                | `Drop a brand or strategy document and I'll build the Playbook from it.`                                               | S6 + S2                                       |

---

## 5. Sidebar (`src/components/sidebar.js`)

Sweep S1 covers all `conversation` → `chat` cases. Per-string remainders:

| ID                              | Before                                           | After                                                                                            | Rationale                                                  |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `chrome.sidebar.empty.hint`     | `Start one with the button above.`               | `Start one with the **New chat** button above.`                                                  | Phase 2 §4.7: name the button                              |
| `chrome.sidebar.foot.user-plan` | `Studio · Team`                                  | (kept; this is sample data — but flag the placeholder is dev-only, not a real subscription tier) | Demo data, OK as-is                                        |
| `chrome.sidebar.foot.menu.aria` | `More options`                                   | `More actions`                                                                                   | Match the row "More actions" — single term across surfaces |
| `chrome.sidebar.delete.body`    | `"${session.name}" will be permanently removed.` | `"${session.name}" and its sources, ideas, and drafts will be permanently removed.`              | Phase 2 §4.5: spell out the secondary effects              |
| `chrome.sidebar.delete.confirm` | `Delete`                                         | `Delete chat`                                                                                    | Phase 2 §4.1 verb+object                                   |
| `chrome.sidebar.rename.confirm` | `Save`                                           | `Save name`                                                                                      | Phase 2 §4.1 verb+object                                   |

---

## 6. Topbar (`src/components/topbar.js`)

S1 covers all `conversation` → `chat`. S3 covers `Outputs` → `Ideas`.

| ID                                      | Before               | After                                                                             | Rationale                     |
| --------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| `chrome.topbar.title.sources`           | `Sources`            | (the `/sources` route is dead — remove the case from `currentTitle()` in Phase 4) | Phase 1 §19.7 stale ref       |
| `chrome.topbar.rename.confirm`          | `Save`               | `Save name`                                                                       | Verb+object                   |
| `chrome.topbar.status-toggle.show.aria` | `Show details panel` | `Show chat status`                                                                | Name the panel (Phase 2 §4.7) |
| `chrome.topbar.status-toggle.hide.aria` | `Hide details panel` | `Hide chat status`                                                                | Same                          |

---

## 7. Session — Assistant thread (`src/assistant.js` + `src/screens/session.js`)

### 7.1 Greetings

| ID                                | Before                                                                                                                                               | After                                                                                                                        | Rationale                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `assistant.greeting.with-context` | `Hi — I can compare ideas, pick the strongest signal, or draft a post. Pick a suggestion below, type a question, or drop a source.`                  | `Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.`      | Drop "strongest signal" jargon; conversational question form                                         |
| `assistant.greeting.no-context`   | `Hi — I'll help you pick sources, sharpen angles, and draft posts. Attach a playbook (Voice, Brief, Brand) any time to make my suggestions sharper.` | `Hi. I'll help you pick sources, sharpen ideas, and draft posts. Attach a Playbook any time to make my suggestions sharper.` | "ideas" not "angles" (lexicon); drop the redundant breakdown (Playbook contents covered in glossary) |

### 7.2 Reasoning pill

| ID                                     | Before                                                               | After                                                         | Rationale                                                                   |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `assistant.notice.drafting.meta`       | `Drafting` (used both when actually drafting and when just thinking) | `Thinking` (default) / `Drafting` (when a batch is in flight) | Phase 2 §6.5                                                                |
| `assistant.notice.drafting.text`       | `Thinking through the best next move…`                               | `Considering the best next move…`                             | Drop "Thinking through" (redundant with meta)                               |
| `assistant.thread.source-intake-label` | `Source intake`                                                      | `Source attached`                                             | "Source intake" reads internal; user-facing label should describe the event |

### 7.3 Mock AI replies

| ID                                  | Before                                                                                                                                                                                                                                                | After                                                                                                                                                                                                               | Rationale                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `assistant.reply.batch.reasoning`   | `Scanned ${ideaCount} extracted ideas, ranked by confidence and relevance. "${leadIdea.title}" came out on top (${leadIdea.confidence}% confidence) — composing a ${batch.length}-post batch grounded in its source.`                                 | `Scanned ${ideaCount} ideas and picked "${leadIdea.title}" (${leadIdea.confidence}%). Composing a ${batch.length}-post batch grounded in its source.`                                                               | Drop jargon ("ranked by confidence and relevance", "came out on top"); cleaner.   |
| `assistant.reply.batch.text`        | `I drafted ${batch.length} posts grounded in "${leadIdea.title}". Each is sized for its network and follows the active playbook's tone rules.`                                                                                                        | `Drafted ${batch.length} posts grounded in "${leadIdea.title}". Each is sized for its network and follows the active Playbook.`                                                                                     | Drop "tone rules" jargon; simplify                                                |
| `assistant.reply.compare.reasoning` | `Compared confidence + relevance between "${A}" (${a%}) and "${B}" (${b%}). Picked the higher-confidence, more specific angle to lead with.`                                                                                                          | `Compared "${A}" (${a%}) and "${B}" (${b%}). Picked the higher-confidence, more specific idea to lead with.`                                                                                                        | Drop "confidence + relevance" jargon                                              |
| `assistant.reply.compare.text`      | `Between "${A}" and "${B}", I'd move forward with "${stronger}" first — clearer proof point and a higher confidence signal. Keep "${weaker}" as a supporting beat or follow-up draft.`                                                                | `Between "${A}" and "${B}", I'd lead with "${stronger}" — clearer proof, higher confidence. Keep "${weaker}" as a follow-up draft.`                                                                                 | Drop "supporting beat" jargon; tighter                                            |
| `assistant.reply.pin.text`          | `The strongest signal right now is "${leadIdea.title}" — specific, believable, and close to publishable. I'd pin it, pressure-test it against one secondary angle, then draft the first post.`                                                        | `The strongest idea right now is "${leadIdea.title}" — specific, believable, close to publishable. I'd pin it, pressure-test it against one alternative, then draft the first post.`                                | "signal" → "idea"; "secondary angle" → "alternative"                              |
| `assistant.reply.source.text`       | `Drop one more source to pressure-test the current angle — ideally something that isn't a marketing post. A transcript, a product retro, or a customer interview will shift the signal fastest.`                                                      | `Drop one more source to pressure-test the current idea — ideally something that isn't a marketing post. A transcript, a product retro, or a customer interview moves the needle fastest.`                          | "signal" → "idea"; "shift the signal" → "moves the needle" (still operator-voice) |
| `assistant.reply.fallback.text`     | `I can keep working inside this session. My recommendation: tighten the angle in the Library tab, confirm the strongest idea, then generate a draft so the post stays grounded in the source context. "${leadIdea.title}" is the one I'd start with.` | `I can keep working in this chat. My recommendation: confirm the strongest idea in the Ideas panel, then generate a draft so the post stays grounded in the source. "${leadIdea.title}" is the one I'd start with.` | Drop stale "Library tab" ref (no longer exists); chat lexicon                     |

### 7.4 Source intake bubble

| ID                                   | Before                                      | After                                                           | Rationale         |
| ------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| `assistant.intake.label.processed.n` | `Processed · {n} idea(s)` (link to Outputs) | `Processed · {n} ${n === 1 ? "idea" : "ideas"}` (link to Ideas) | S3 + S19.1 plural |
| `assistant.intake.link.title`        | `Open Outputs panel`                        | `Open Ideas panel`                                              | S3                |

### 7.5 Extraction turn

| ID                                       | Before                                                      | After                                                              | Rationale                             |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `assistant.extraction.idea.view.aria`    | `Open this idea in Content ideas`                           | `Open this idea in Ideas`                                          | Stale ref (S5/S19.7); concept = Ideas |
| `assistant.extraction.fallback.no-ideas` | `Scanned ${filename} but didn't find a clear idea to pull.` | `Scanned ${filename}. Couldn't find a clear idea to pull from it.` | Cleaner cadence                       |

### 7.6 Draft turn

| ID                                   | Before                       | After                         | Rationale                             |
| ------------------------------------ | ---------------------------- | ----------------------------- | ------------------------------------- |
| `assistant.draft.sub.empty-networks` | `review, edit, and schedule` | `Review, edit, and schedule.` | Capitalise first word; not a fragment |

### 7.7 Clip / Idea extraction turns

| ID                                     | Before                              | After                               | Rationale                                     |
| -------------------------------------- | ----------------------------------- | ----------------------------------- | --------------------------------------------- |
| `assistant.clip.pending.sub`           | `Up to 45s · you can keep chatting` | `About 45s. You can keep chatting.` | Phase 2 §4.4 (soft estimate, no hard promise) |
| `assistant.idea-extract.pending.title` | `Reading the video for themes…`     | `Reading the video for ideas…`      | S4                                            |
| `assistant.idea-extract.pending.sub`   | `Up to 15s · you can keep chatting` | `About 15s. You can keep chatting.` | Same as clip                                  |
| `assistant.idea-extract.ready.title`   | `Themes ready from ${filename}`     | `Ideas ready from ${filename}`      | S4                                            |

### 7.9 Channel picker / draft flow

| ID                          | Before                                     | After                                                           | Rationale                                                                 |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `draft.channel-picker.text` | `Which channels should I draft for?`       | `Which networks should I draft for?`                            | Match the rest of the UI (Network filter, network select); drop "channel" |
| `draft.toast.error`         | `Couldn't create those drafts. Try again?` | `Couldn't create those drafts.` (keeps the Retry action button) | Drop interrogative; action button is the answer                           |

### 7.10 Start-flow / action picker

| ID                     | Before                                                                         | After                                                                                   | Rationale                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `start.choice.browse`  | `Browse content`                                                               | `Browse sources`                                                                        | "content" was stale (Content tab no longer exists); the action lands on the Sources panel |
| `start.choice.submit`  | `Go`                                                                           | `Continue`                                                                              | Match Continue used elsewhere; "Go" too punchy                                            |
| `start.action.browse`  | `Here's everything you've attached so far. Click any source to dig in.`        | `Here's everything you've attached. Open the Sources panel to dig in.`                  | Stale ref ("Click any source" — no longer routes); name the panel                         |
| `start.action.compare` | `Here are your ideas. Pick two and I'll compare which one is more actionable.` | `Here are your ideas. Pick two and I'll compare them.`                                  | Drop "more actionable" jargon                                                             |
| `start.action.draft`   | `Pick an idea below and hit Draft Post — I'll generate the post for you.`      | `Open the Ideas panel and hit Draft post on the one you want — I'll generate the post.` | Stale ref ("below"); fix the CTA name                                                     |

### 7.11 Inline subtitle picker

| ID                        | Before                         | After       | Rationale |
| ------------------------- | ------------------------------ | ----------- | --------- |
| `assistant.subtitle.text` | `Add subtitles to your clips?` | (unchanged) | OK        |

### 7.12 Source intake choice

| ID                                        | Before                                                                                                               | After                                                                                                  | Rationale                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| `assistant.video-intake.ideas`            | `Extract themes`                                                                                                     | `Extract ideas`                                                                                        | S4                       |
| `assistant.pdf-intake.intro.template`     | `Got it — I'm reading **${filename}**. While I extract the strongest moments, what should I do with it?`             | `Reading **${filename}** now. While I pull the strongest ideas, what should I do with it?`             | S6 + "moments" → "ideas" |
| `assistant.pdf-intake.extract`            | `Just extract ideas first`                                                                                           | `Extract ideas first`                                                                                  | "Just" weakens — drop    |
| `assistant.pdf-intake.followup.batch`     | `Got it — I'll draft 5 posts from **${filename}** across LinkedIn, X, and Instagram as soon as the analysis lands.`  | `I'll draft 5 posts from **${filename}** across LinkedIn, X, and Instagram once the analysis lands.`   | S6                       |
| `assistant.pdf-intake.followup.repurpose` | `Got it — I'll turn **${filename}** into 8 posts (3 LinkedIn, 3 X, 2 Instagram) keeping the brand voice consistent.` | `I'll turn **${filename}** into 8 posts: 3 LinkedIn, 3 X, 2 Instagram, all in the brand voice.`        | S6                       |
| `assistant.pdf-intake.followup.extract`   | `Got it — I'll surface the strongest ideas from **${filename}** first. You can decide what to draft from there.`     | `I'll surface the strongest ideas from **${filename}** first. You can pick which to draft from there.` | S6                       |

### 7.13 Ask flow

| ID                               | Before                   | After                                          | Rationale           |
| -------------------------------- | ------------------------ | ---------------------------------------------- | ------------------- |
| `assistant.ask.option.summarize` | `Summarize in 3 bullets` | (unchanged — US spelling consistent with rest) | OK after S5.9 sweep |

### 7.14 Profile question

| ID                                | Before                                                                                                                       | After                                                                               | Rationale                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `assistant.profile.no-connection` | `You don't have any connected social profiles yet. Open Settings → Social accounts to connect one, then come back to draft.` | `No connected social profiles yet. Open Settings → Social accounts to connect one.` | Drop the redundant "come back to draft" — user knows |

### 7.15 Section edit confirm

| ID                                        | Before                                                                        | After                                                                   | Rationale          |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------ |
| `assistant.edit-confirm.intro.template`   | `Editing the ${section} will update this context across every chat using it.` | `Editing the ${section} updates this Playbook in every chat using it.`  | S2 + S6 cleanup    |
| `assistant.edit-confirm.continue.caption` | `Run the edit wizard. Changes propagate to all chats using this context.`     | `Open the editor. Changes propagate to every chat using this Playbook.` | S2 + drop "wizard" |
| `assistant.section-edit.done.template`    | `${section} updated everywhere this context is used.`                         | `${section} updated in every chat that uses this Playbook.`             | S2                 |

---

## 8. Composer (`src/screens/session.js`)

| ID                                 | Before                                                                                                    | After                                                                                      | Rationale                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `session.empty.hello`              | `What are we creating today?`                                                                             | `What are you working on?`                                                                 | You-voice (not nous) per S16                                                  |
| `session.empty.sub`                | `Drop in a source and Archie will turn it into a batch of posts you can review, edit, and schedule.`      | `Drop a source and I'll turn it into a batch of posts you can review, edit, and schedule.` | 1st-person per S16                                                            |
| `session.empty.starter-label`      | `Start with a source or pick a starter pack`                                                              | `Start with a source or pick a starter`                                                    | Drop "pack" (marketing)                                                       |
| `session.composer.placeholder`     | `ask archie...`                                                                                           | `Ask Archie`                                                                               | Sentence case, no decorative ellipsis (S9)                                    |
| `session.composer.thinking-text`   | `0s · 1 credit`                                                                                           | `0s` (drop credits)                                                                        | Phase 1 §6.3 — "credit" concept not explained anywhere; expose if/when needed |
| `session.composer.hint`            | `↵ to send · Shift+↵ for new line · ⌘+↵ sends from anywhere · drop a file anywhere to add it as a source` | `↵ to send · Shift+↵ for new line · drop a file to add a source`                           | Drop redundant ⌘+↵ (same as ↵); drop "anywhere"                               |
| `session.composer.playbook.detach` | `No playbook`                                                                                             | `Detach Playbook`                                                                          | Verb+object (Phase 2 §4.1)                                                    |
| `session.composer.playbook.create` | `New playbook…`                                                                                           | `New Playbook…`                                                                            | Capitalisation (S2)                                                           |

### Starter cards (mocks.js)

| ID                                | Before                                                                                                               | After                                                                                                              | Rationale                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `session.starter.batch.prompt`    | `Pull the strongest moments from {{source}} and draft 5 posts across LinkedIn, X, and Instagram.`                    | `Pull the strongest ideas from {{source}} and draft 5 posts across LinkedIn, X, and Instagram.`                    | "moments" → "ideas" (lexicon) |
| `session.starter.repurpose.title` | `Repurpose a long-form piece`                                                                                        | `Repurpose a long-form source`                                                                                     | "piece" → "source"            |
| `session.starter.clips.prompt`    | `Surface the best moments from {{video-source}} and turn them into posts across LinkedIn, X, Instagram, and TikTok.` | `Surface the best ideas from {{video-source}} and turn them into posts across LinkedIn, X, Instagram, and TikTok.` | "moments" → "ideas"           |

---

## 9. Right panel — Drafts mode

| ID                                   | Before                       | After                 | Rationale                 |
| ------------------------------------ | ---------------------------- | --------------------- | ------------------------- |
| `rpanel.drafts.rail.filter.all`      | `All posts`                  | `All drafts`          | Lexicon (Draft, not Post) |
| `rpanel.drafts.rail.network.heading` | `Network`                    | (unchanged)           | OK                        |
| `rpanel.drafts.toast.regen`          | `Regenerating draft… (mock)` | `Regenerating draft…` | S14                       |

---

## 10. Right panel — Ideas mode

| ID                            | Before    | After      | Rationale                  |
| ----------------------------- | --------- | ---------- | -------------------------- |
| `rpanel.head.outputs.title`   | `Outputs` | `Ideas`    | S3                         |
| `rpanel.ideas.card.use.label` | `Use`     | `Use idea` | Verb+object (Phase 2 §4.1) |

---

## 11. Right panel — Sources mode

| ID                                | Before                                                                      | After                                                                | Rationale                                                     |
| --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `rpanel.sources.no-session.title` | `Open a conversation`                                                       | `Open a chat`                                                        | S1                                                            |
| `rpanel.sources.no-session.sub`   | `Sources attach to a conversation. Start or open one to manage its inputs.` | `Sources attach to a chat. Start or open one to manage its sources.` | S1 + "inputs" → "sources"                                     |
| `rpanel.sources.count.template`   | `${n} source${s} in this chat`                                              | (unchanged after S1 already aligned)                                 | OK                                                            |
| `rpanel.sources.sub`              | `These files feed this conversation's outputs.`                             | `These sources feed this chat's ideas.`                              | S1 + S3 + "files" → "sources" (the items aren't always files) |
| `rpanel.sources.head.attach`      | `Attach`                                                                    | `Attach source`                                                      | Verb+object                                                   |
| `rpanel.sources.empty.sub`        | `Attach a file or pick from your library to start.`                         | `Attach a file or pick from a connector to start.`                   | S5 (drop "library")                                           |

---

## 12. Right panel — Playbook brief panel

| ID                                   | Before                                                                                            | After                                                                               | Rationale                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `rpanel.brief.head.edit.empty`       | `Define your content brief`                                                                       | `Define your Playbook`                                                              | Drop "content brief" drift; align with concept                         |
| `rpanel.brief.group.voice`           | `Voice profile`                                                                                   | (unchanged)                                                                         | OK — chosen sub-element name                                           |
| `rpanel.brief.intro.text`            | `Help Archie understand your brand so it generates posts that truly fit your voice and audience.` | `Help me understand your Brand so I draft posts that fit your voice and audience.`  | 1st-person; drop "truly" (Phase 2 §1 bans gushy)                       |
| `rpanel.brief.name.title`            | `Context name & color`                                                                            | `Playbook name & color`                                                             | S2                                                                     |
| `rpanel.brief.name.hint`             | `Shown next to the context in chats and listings.`                                                | `Shown next to the Playbook in chats and listings.`                                 | S2                                                                     |
| `rpanel.brief.color.title.edit`      | `Pick a color for your context`                                                                   | `Pick a color for your Playbook`                                                    | S2                                                                     |
| `rpanel.brief.color.hint`            | `Shown next to the context name in chats and listings.`                                           | `Shown next to the Playbook name in chats and listings.`                            | S2                                                                     |
| `rpanel.brief.iv.title`              | `Image Voice`                                                                                     | `Visual identity`                                                                   | S11                                                                    |
| `rpanel.brief.iv.hint`               | `Brand visual identity extracted from websites`                                                   | `Pulled from your website`                                                          | S11; drop "extracted" jargon                                           |
| `rpanel.brief.iv.color.text-primary` | `Text Primary`                                                                                    | `Body text`                                                                         | Sentence case + plain English                                          |
| `rpanel.brief.iv.delete.label`       | `Remove website` / `Coming soon` (disabled button)                                                | (remove the button entirely)                                                        | S14                                                                    |
| `rpanel.brief.voice.headline.empty`  | `Tap a section to refine the voice`                                                               | `Click a section to refine the voice`                                               | Desktop product (Phase 2 §1)                                           |
| `rpanel.brief.voice.snippet.empty`   | `Tap to add a description.`                                                                       | `Click to add a description.`                                                       | Same                                                                   |
| `rpanel.brief.footer.read.edit`      | `Edit`                                                                                            | `Edit Playbook`                                                                     | Verb+object + S2                                                       |
| `rpanel.brief.chip-other.add`        | `Add`                                                                                             | `Add suggestion`                                                                    | Verb+object; clarifies what's added (per Phase 1 §21.12 "Suggestions") |
| `rpanel.brief.warning.audience`      | `${n} suggestions — all audiences combined`                                                       | `${n} suggestions across all audiences`                                             | Cleaner cadence                                                        |
| `rpanel.brief.warning.message`       | `Pick the pains that truly resonate. You'll get a sharper brief by narrowing down to 5–10.`       | `Pick the pains that match your audience. Narrowing to 5–10 sharpens the Playbook.` | Drop "truly resonate" (marketing); align with Playbook lexicon         |
| `rpanel.brief.objective.title`       | `What's your primary social media objective?`                                                     | `What's your primary social objective?`                                             | Drop "media" (redundant)                                               |

---

## 13. Conversation status card

S1 covers `conversation` → `chat`. S3 covers `Outputs` → `Ideas`. Per-string remainders:

| ID                                       | Before                | After         | Rationale |
| ---------------------------------------- | --------------------- | ------------- | --------- |
| `status-card.aria`                       | `Conversation status` | `Chat status` | S1        |
| `status-card.pending.fallback.assistant` | `Archie is thinking…` | `Thinking…`   | S16       |

---

## 14. Standalone routes

### 14.1 `/ideas`

| ID                        | Before                                                               | After                                                          | Rationale             |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------- |
| `ideas.head.eyebrow`      | `Library`                                                            | (drop the eyebrow line)                                        | S5                    |
| `ideas.head.remine`       | `Re-mine sources`                                                    | `Re-extract from sources`                                      | Drop "Re-mine" jargon |
| `ideas.toast.placeholder` | `This action lands in a follow-up — pinning the page surface first.` | (drop the toast — hide the button or wire it to a real action) | S14                   |

### 14.2 `/contexts`

S1 covers `chat` drift. Per-string remainders:

| ID                              | Before                                                                                | After                                                                 | Rationale           |
| ------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------- |
| `contexts.head.eyebrow`         | `Library`                                                                             | (drop the eyebrow line)                                               | S5                  |
| `contexts.ghost-card.title`     | `Crée un nouveau Playbook`                                                            | `New Playbook`                                                        | EN + capitalisation |
| `contexts.ghost-card.sub`       | `Un brand, une voix, un objectif — Archie s'aligne.`                                  | `One Brand, one voice, one goal — Archie aligns.`                     | EN                  |
| `contexts.ghost-card.aria`      | `Crée un nouveau Playbook`                                                            | `Create a new Playbook`                                               | EN                  |
| `contexts.toast.last`           | `Can't delete the last playbook — every chat needs one.`                              | `Can't delete the last Playbook — every chat needs one.`              | S2 capitalisation   |
| `contexts.delete.body.template` | `"${name}" will be removed. Chats currently referencing it will need a new playbook.` | `"${name}" will be removed. Chats using it will need a new Playbook.` | S2                  |
| `contexts.delete.confirm`       | `Delete`                                                                              | `Delete Playbook`                                                     | Verb+object         |
| `contexts.toast.deleted`        | `Context deleted`                                                                     | `Playbook deleted`                                                    | S2                  |

---

## 15. Settings drawer

### 15.1 Connectors section

| ID                        | Before                                                       | After                                                     | Rationale                                                |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------- |
| `settings.connectors.sub` | `Sources Archie pulls knowledge from when generating posts.` | `Where Archie pulls source material when drafting posts.` | "Knowledge" was vague; "source material" matches lexicon |

### 15.2 Playbooks section

| ID                             | Before                                                                                                                            | After                                                                                                             | Rationale                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `settings.contexts.sub`        | `Saved bundles of voice, brief, and brand. Create or edit one from inside any chat.`                                              | `Voice, Brief, and Branding bundled together. Create or edit one from inside any chat.`                           | Match the brief panel groups; "Branding" matches the section name |
| `settings.contexts.empty.body` | `Start a new chat — Archie will walk you through capturing a Voice, Strategy brief, and Brand theme, then offer to save it here.` | `Start a new chat — I'll walk you through your voice, brief, and Branding, then offer to save the Playbook here.` | 1st-person; lexicon                                               |
| `settings.contexts.empty.cta`  | `Start a new chat`                                                                                                                | (unchanged)                                                                                                       | OK                                                                |
| `settings.contexts.tag.brief`  | `Brief`                                                                                                                           | (unchanged)                                                                                                       | OK                                                                |

### 15.3 Generation preferences section — RETIRED

Per S10. Section + all its strings + nav entry are deleted in Phase 4. No rewrites.

### 15.4 Notifications section

| ID                                     | Before                                                          | After                                                  | Rationale                                         |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `settings.notifications.push.footnote` | `Available on the mobile app — toggles preview the experience.` | `Available on the mobile app. Toggle to preview here.` | Drop dev-speak ("toggles preview the experience") |

### 15.5 Bug + Feedback modals

| ID                                   | Before                                                                                                                                         | After                                                                               | Rationale                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `modal.bug.subtitle`                 | `Share what happened and we will send the context with it.`                                                                                    | `Share what happened. Archie attaches the screen context.`                          | Phase 2 §6.6 — Archie 3rd-person OK in product copy _about_ Archie; drop "we"                  |
| `modal.bug.problem.error`            | `Please describe what went wrong before submitting.`                                                                                           | `Describe what went wrong before submitting.`                                       | S8                                                                                             |
| `modal.bug.success.title`            | `Bug reported!`                                                                                                                                | `Bug reported`                                                                      | S13                                                                                            |
| `modal.bug.success.body`             | `Thanks for helping improve Archie.<br/>We read every report.`                                                                                 | `Thanks for helping improve Archie. Every report gets read.`                        | Avoid "we" voice; single line                                                                  |
| `modal.feedback.title`               | `Give more feedback`                                                                                                                           | `Send feedback`                                                                     | "Give more" implies prior feedback; primary entry should be neutral                            |
| `modal.feedback.intro`               | `We read every piece of feedback sent through this form. If you require a response or urgent support please contact our support team instead.` | `Every piece of feedback gets read. For urgent support, contact the team directly.` | Drop "we" + "please"; tighter                                                                  |
| `modal.feedback.area.content-studio` | `Content Studio`                                                                                                                               | `General`                                                                           | Drop legacy "Content Studio" name; "General" covers undefined feature area                     |
| `modal.feedback.area.library`        | `Library`                                                                                                                                      | (drop — fold under General)                                                         | S5                                                                                             |
| `modal.feedback.area.ideas`          | `Content ideas`                                                                                                                                | `Ideas`                                                                             | S6                                                                                             |
| `modal.feedback.area.posts`          | `Posts`                                                                                                                                        | `Drafts`                                                                            | Lexicon (Draft)                                                                                |
| `modal.feedback.area.brief`          | `Strategy brief`                                                                                                                               | `Playbook — Brief`                                                                  | Re-anchor under Playbook                                                                       |
| `modal.feedback.area.voice`          | `Voice profile`                                                                                                                                | `Playbook — Voice profile`                                                          | Same                                                                                           |
| `modal.feedback.area.brand`          | `Brand theme`                                                                                                                                  | `Playbook — Branding`                                                               | Same; lexicon                                                                                  |
| `modal.feedback.text.label`          | `Write a feedback` (required)                                                                                                                  | `What's on your mind?`                                                              | Drop "a feedback" (ungrammatical); question prompts content                                    |
| `modal.feedback.text.placeholder`    | `Write your feedback here...`                                                                                                                  | `What worked, what didn't, what's missing…`                                         | Concrete prompt; typographic ellipsis (S9)                                                     |
| `modal.feedback.text.error`          | `Please write your feedback before sending.`                                                                                                   | `Write something before sending.`                                                   | S8                                                                                             |
| `modal.feedback.thank-you`           | `Thank you so much for your feedback, we will take it into account in the continuous improvements of our product!`                             | (drop entirely — redundant with the success state below)                            | Phase 2 §1 bans "Thank you so much" + "continuous improvements of our product" corporate-speak |
| `modal.feedback.success.title`       | `Thanks for your feedback!`                                                                                                                    | `Feedback sent`                                                                     | S13; factual                                                                                   |
| `modal.feedback.success.body`        | `We read every message and use it to improve Archie.`                                                                                          | `Every message feeds into Archie's improvements.`                                   | Drop "we"                                                                                      |

### 15.6 Chat picker modal

| ID                                            | Before                                                                               | After                                                                                 | Rationale           |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------- |
| `modal.chat-picker.subtitle`                  | `Drafts live inside chats. Pick one, or start fresh.`                                | (unchanged after S1)                                                                  | OK                  |
| `modal.chat-picker.new.caption`               | `Empty chat — bring this draft to a fresh thread`                                    | `Empty chat — start fresh`                                                            | Drop "thread" drift |
| `modal.chat-picker.existing.caption.template` | `${sourceCount} sources · ${ideaCount} ideas · ${postCount} posts · ${lastActivity}` | `${sourceCount} sources · ${ideaCount} ideas · ${postCount} drafts · ${lastActivity}` | "posts" → "drafts"  |

### 15.7 Confirm + Rename modals

| ID                            | Before                      | After                                                                                                                                     | Rationale                       |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `modal.confirm.default.title` | `Confirm` / `Are you sure?` | `Confirm action` (the second variant `Are you sure?` is unreachable since callers always pass a title; drop it from the default fallback) | Phase 0 §8.1 ban + Phase 2 §4.5 |
| `modal.rename.default.save`   | `Save`                      | `Save` (single-word default is OK; callers can pass `Save name` etc.)                                                                     | Default; callers customise      |

### 15.8 Add source modal

| ID                                   | Before                  | After          | Rationale                     |
| ------------------------------------ | ----------------------- | -------------- | ----------------------------- |
| `modal.add-source.title`             | `Add source`            | `Add a source` | Sentence-form clarifies count |
| `modal.add-source.url.history.title` | `Added in this session` | `Added so far` | "session" → drop              |

### 15.9 Schedule modal

| ID                                      | Before                                        | After                                            | Rationale       |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------ | --------------- |
| `modal.schedule.title.template`         | `Schedule ${n} ${n === 1 ? "post" : "posts"}` | `Schedule ${n} ${n === 1 ? "draft" : "drafts"}`  | Lexicon (Draft) |
| `modal.schedule.footer.cta.template`    | `Schedule ${n} ${n === 1 ? "post" : "posts"}` | `Schedule ${n} ${n === 1 ? "draft" : "drafts"}`  | Same            |
| `modal.schedule.toast.success.template` | `${n} post(s) scheduled`                      | `${n} ${n === 1 ? "draft" : "drafts"} scheduled` | Same + ternary  |
| `modal.schedule.error.fallback`         | `Couldn't schedule these posts. Try again.`   | `Couldn't schedule those drafts. Try again.`     | Same            |

### 15.10 Generate image modal

| ID                                   | Before                                                     | After                                                                 | Rationale            |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `modal.gen-image.derive.idle`        | `Re-derive from post content`                              | `Refresh from post content`                                           | Drop "derive" jargon |
| `modal.gen-image.style.photo`        | `Photorealistic` (icon 📷)                                 | `Photorealistic` (drop emoji icon — see S12; rely on chip text alone) | S12                  |
| `modal.gen-image.style.illustration` | `Illustration` (icon 🎨)                                   | `Illustration`                                                        | S12                  |
| `modal.gen-image.style.bold`         | `Bold graphic` (icon ⚡)                                   | `Bold graphic`                                                        | S12                  |
| `modal.gen-image.style.editorial`    | `Editorial photo` (icon 📰)                                | `Editorial photo`                                                     | S12                  |
| `modal.gen-image.style.abstract`     | `Abstract` (icon 🌀)                                       | `Abstract`                                                            | S12                  |
| `modal.gen-image.cta`                | `Generate`                                                 | `Generate image`                                                      | Verb+object          |
| `modal.gen-image.derive.error.toast` | `Couldn't auto-derive a prompt. Type one in or try again.` | `Couldn't auto-fill the prompt. Type one in or try again.`            | "derive" → "fill"    |

### 15.11 Video clips modal

| ID                                                   | Before                                                              | After                                                                   | Rationale                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| `modal.video-clips.eyebrow`                          | `AI-suggested clips`                                                | `Suggested clips`                                                       | Drop AI badge (Phase 2 §6.1)          |
| `modal.video-clips.head.sub.template`                | `${n} moment${s} worth posting · pulled from ${time} of footage`    | `${n} ${n === 1 ? "clip" : "clips"} worth posting · ${time} of footage` | "moments" → "clips"                   |
| `modal.video-clips.toolbar.regen.loading`            | `Re-mining clips…`                                                  | `Suggesting more…`                                                      | Drop "Re-mining" jargon               |
| `modal.video-clips.toast.regen`                      | `Re-mining clips for new moments…`                                  | `Suggesting new clips…`                                                 | Same                                  |
| `modal.video-clips.editor.eyebrow`                   | `EDITING CLIP`                                                      | `Editing clip`                                                          | Sentence case (Phase 2 §5.1)          |
| `modal.video-clips.editor.transport.play.title`      | `Play (preview only)`                                               | `Play preview`                                                          | Drop the "(preview only)" disclosure  |
| `modal.video-clips.editor.timeline.title.template`   | `TIMELINE · ${filename}`                                            | `Timeline · ${filename}`                                                | Sentence case                         |
| `modal.video-clips.editor.field.summary.placeholder` | `What's in this moment — context the AI should know when drafting…` | `What's in this moment — context I should remember when drafting…`      | Drop "the AI" attribution; 1st-person |

---

## 16. Cards

### 16.1 Source card

| ID                        | Before   | After           | Rationale   |
| ------------------------- | -------- | --------------- | ----------- |
| `card.source.more.delete` | `Delete` | `Delete source` | Verb+object |

### 16.2 Idea card

| ID                             | Before                                             | After                                | Rationale                    |
| ------------------------------ | -------------------------------------------------- | ------------------------------------ | ---------------------------- |
| `card.idea.sources.info.label` | `This idea has been generated using these sources` | `Sources used to generate this idea` | Active framing; less passive |
| `card.idea.cta.draft`          | `Draft Post`                                       | `Draft post`                         | S15                          |

### 16.3 Post card

| ID                               | Before            | After              | Rationale                                                       |
| -------------------------------- | ----------------- | ------------------ | --------------------------------------------------------------- |
| `card.post.actions.rewrite.aria` | `Rewrite with AI` | `Regenerate draft` | Drop AI badge; align with canonical `Regenerate` (Phase 2 §6.3) |
| `card.post.edit.save`            | `Save`            | `Save changes`     | Verb+object                                                     |

### 16.4 Clip card

| ID              | Before       | After        | Rationale |
| --------------- | ------------ | ------------ | --------- |
| `card.clip.cta` | `Draft Post` | `Draft post` | S15       |

---

## 17. Wizards

### 17.1 Sidebar wizard (memorize + scripts)

| ID                               | Before                                                                                                  | After                                                                                                          | Rationale                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `wizard.memorize.intro`          | `Saving this playbook so you can reuse it. Want to name it, or use the chat's title as the default?`    | `Saving this Playbook so you can reuse it. Name it, or use the chat name?`                                     | S2 + S1                                        |
| `wizard.memorize.picker.title`   | `Saving this playbook so you can reuse it. Name it, or use the chat title?`                             | (drop title per S18 — keep step indicator only)                                                                | S18                                            |
| `wizard.memorize.option.default` | `Use the chat title`                                                                                    | `Use the chat name`                                                                                            | "title" → "name" consistency with rename modal |
| `wizard.memorize.echo.default`   | `Use default name`                                                                                      | `Default name` (echoed only when meaningful per S17) — better: drop the echo, let the next AI bubble continue. | S17                                            |
| `wizard.voice.summary.yes`       | `Yes, looks great`                                                                                      | `Yes, looks good`                                                                                              | S13 (drop "great")                             |
| `wizard.brief.intake.intro`      | `Want me to capture your strategy brief? I'll set goals, audience, and brand voice for this chat.`      | `Want me to capture the brief? I'll set goals, audience, and brand voice for this chat.`                       | "strategy brief" drift drop                    |
| `wizard.brief.intake.step`       | `Strategy brief`                                                                                        | `Brief`                                                                                                        | Same                                           |
| `wizard.brief.summary.intro`     | `Here's your strategy brief. Keep it or tweak.`                                                         | `Here's your brief. Keep it or refine.`                                                                        | Drop "strategy"; "refine" replaces "tweak"     |
| `wizard.brief.summary.no`        | `Tweak the brief`                                                                                       | `Refine the brief`                                                                                             | Drop "tweak"                                   |
| `wizard.brand.intake.intro`      | `Want me to pull in your brand theme? I'll grab colors, imagery notes, and personality from your site.` | `Want me to pull your Branding? I'll grab colors, imagery, and personality from your site.`                    | "brand theme" → "Branding"                     |
| `wizard.brand.intake.step`       | `Brand theme`                                                                                           | `Branding`                                                                                                     | Same                                           |
| `wizard.brand.summary.no`        | `Tweak the brand`                                                                                       | `Refine Branding`                                                                                              | Same + "refine"                                |

### 17.2 Playbook editor

| ID                                           | Before                                                                                                            | After                                                            | Rationale         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| `playbook.editor.target.brief`               | `let's sharpen the brief`                                                                                         | (unchanged)                                                      | OK                |
| `playbook.editor.target.label.brief`         | `the brief`                                                                                                       | (unchanged)                                                      | OK                |
| `playbook.editor.chip.brief`                 | `Refine brief`                                                                                                    | (unchanged)                                                      | OK                |
| `playbook.editor.brief.intro.empty`          | `What's the new brief?`                                                                                           | (unchanged)                                                      | OK                |
| `playbook.editor.brief.title`                | `Refine brief`                                                                                                    | (unchanged after S18 drop)                                       | OK                |
| `playbook.editor.launch.modal.body.template` | `You'll open a chat to refine "${name}". Changes will only be saved when you click "Save changes" at the bottom.` | (unchanged after S1)                                             | OK                |
| `playbook.session.save.confirm.body.clean`   | `No edits were staged — closing the editor will return you to the Playbooks library.`                             | `No edits staged — closing the editor returns you to Playbooks.` | S5 drop "library" |
| `playbook.session.cancel.confirm.body.clean` | `You can re-open the editor anytime from the Playbooks library.`                                                  | `You can re-open the editor anytime from Playbooks.`             | S5                |

---

## 18. Toasts (cross-surface remainders)

| ID                        | Before                                                               | After                                                                 | Rationale          |
| ------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| `toast.draft.failed`      | `Couldn't create those drafts. Try again?`                           | `Couldn't create those drafts.` (keeps Retry action)                  | Drop interrogative |
| `toast.ideas.placeholder` | `This action lands in a follow-up — pinning the page surface first.` | (drop the toast; gate the button until Phase 4 wires the real action) | S14                |

---

## 19. Implementation notes for Phase 4

### 19.1 Branch + commit strategy

Phase 4 lands in a separate branch (per user's standing instruction). Suggested commits, one per surface, in this order:

1. `feat(copy): sweep rules S1–S5 — chat / Playbook / Ideas / themes-to-ideas / drop Library` (touches every file)
2. `feat(copy): sweep rules S6–S9 — drop "Got it" / S7 onboarding-EN / S8 Please / S9 ellipsis`
3. `feat(copy): sweep rules S10–S12 — retire Generation preferences section / Image Voice → Visual identity / drop emojis`
4. `feat(copy): sweep rules S13–S18 — exclamations / dev leaks / Title Case CTAs / voice fixes / echoes / picker titles`
5. `feat(copy): onboarding EN translation — welcome × 4 + welcome-alt × 2 + ALT chat`
6. `feat(copy): per-surface remainders — composer, assistant, modals, cards, wizards`

### 19.2 Code-level structural changes

These go beyond pure copy and need actual code edits:

- **`settings-drawer.js`** (§S10) — delete the `preferences` section: SECTIONS array entry, renderPreferencesSection, footerForSection branch, save handler, state.prefs/clone/revertWorkingCopies for prefs, all related markup. Save the existing fields (default tone/lang/length/CTA) so we can move them to Playbook fields in a follow-up.
- **`right-panel.js`** (§S3) — rename `mode === "ideas"` panel title from `Outputs` to `Ideas`. Keep the Ideas/Clips tab structure intact.
- **`topbar.js`** (§S3) — rename the `Outputs` pill to `Ideas`. Keep the badge logic.
- **`conversation-status-card.js`** (§S3) — rename `Outputs` row to `Ideas`.
- **`feature-flags.js`** — the `sidebarIdeas` flag becomes redundant when Ideas is the canonical name (the gate was hiding `Ideas` in the sidebar nav because it conflicted with the right-panel `Outputs` label). Remove the flag after rename. (Optional; safe to leave for one release.)
- **`settings-drawer.js` nav** — remove the `preferences` entry from the SECTIONS array.
- **Image Voice rename** (§S11) — the section title + CSS class `context-brief__image-voice` stays internal; only the visible string changes. Update the disabled trash btn handling to remove the button outright.
- **Echo drops** (§S17) — touch `sidebar-wizard.js` answer handler (don't push the verbatim Skip to history), `context-builder.js` setSelectedProfile / askAltDocuments onSkip, `inline-question.js` if any path pushes echoes.
- **Picker title drops** (§S18) — pass `title: null` from each wizard step where the AI bubble carries the question. The picker rendering already handles `title: null` (renders no header).
- **`session.js:1294` welcome toast** — replace string and remove the FR variable name.
- **`mocks.js:1294`** — keep `chatStarters` strings updated (`moments` → `ideas`).

### 19.3 Tests / verification

After Phase 4:

- Start the dev server and walk through:
  1. First-time mode: `/welcome` → URL → socials → sources → recap → enter Archie.
  2. First-time ALT mode: `/welcome-alt` → ALT chat → recap → enter.
  3. Returning mode: dashboard → open a chat → drop a source → run a batch → schedule.
  4. Settings drawer: every section (Connectors, Playbooks — note Generation preferences should be gone, Social accounts, Notifications).
  5. Bug + Feedback modals: open, see new copy, submit (mock).
  6. Right panel: Drafts mode + Ideas mode (verify "Outputs" gone) + Sources + Playbook brief panel.
- Scan codebase for remaining `conversation` / `context` / `outputs` / `themes` / `library` / `please` / `(mock)` after Phase 4 commits: `grep -rn "conversation\|context\|outputs\|themes\|library\|please\|(mock)" src/ index.html | grep -v "\.test\." | grep -v "// "` — only intentional cases survive (e.g. CSS class names, variable names).

---

## 20. Coverage summary

- Phase 1 entries audited: ~570.
- Phase 3 rewrites proposed: ~180 explicit + ~150 covered by sweep rules = ~330.
- Phase 1 entries flagged 🟢 (no rewrite needed): ~270.
- Phase 1 entries deleted (Generation preferences section): ~30.
- Remaining gaps: variable names + CSS classes + comments containing the banned terms (intentional — non user-facing).

**Awaiting your validation. Once you OK Phase 3, I land Phase 4 (code) in a separate branch.**
