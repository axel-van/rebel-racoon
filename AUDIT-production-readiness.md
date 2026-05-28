# Archie — Production-Readiness Audit

**Date** : 2026-05-28 · **Périmètre** : tous les écrans, composants, modals, copy, a11y, perf, DS · **Source** : 6 audits parallèles synthétisés (≈260 findings bruts dédupliqués)

> **Objectif** : atteindre un niveau de polish production. Ce document liste tout ce qui doit être corrigé/amélioré, classé par sévérité et thème. Chaque finding cite `file:line` et propose un fix d'une ligne.

---

## 0. Résumé exécutif

| Axe       | État                      | Forces                                                                                     | Faiblesses systémiques                                                                                                                                                                                                                                                           |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A11y**  | ⚠️ Moyen                  | modal-coordinator, role/aria-live sur toast, focus management partiel                      | ~15 boutons icon-only sans `aria-label`, `<div role="button">` sans handler clavier, pas de `aria-live` sur les turns assistant, contraste de `--sys-text-color-light` (≈4.2:1) sous 4.5:1, `prefers-reduced-motion` quasi-absent, pas de skip-link, cibles tactiles 24–36px     |
| **DS**    | ✅ Globalement bon (~85%) | tokens utilisés correctement, `.ap-*` confinés à `ds-patches.css`, icônes via font         | z-index magiques (2, 10, 50), fallbacks `var(--token, #hex)` qui masquent les ratés, SVG inline pour les play-buttons, font-size 10px hardcodés, `.ap-loader` redéclaré hors `ds-patches.css`                                                                                    |
| **Perf**  | ⚠️ Moyen                  | font-display:swap, pas de `console.log` en hot path, transforms pour les anims principales | 17 CSS bloquants, `?v=N` global qui invalide le cache, `right-panel.js` (123k) + `session.js` (116k) chargés sur toutes les routes, 11 modals init() au boot, ticks de upload qui ne pausent pas en background                                                                   |
| **Copy**  | ⚠️ Moyen                  | empty states structurés (why + how), boutons souvent verb-first, ton chaleureux            | voix incohérente (Archie/I/Let's mêlés), CTAs nominaux ("New idea"), placeholder qui fait office de label, jargon ("hooks, stats, stories, Context, Outputs"), FR/ES/DE proposés mais UI EN-only, terminologie flottante (source/document/file, extract/pull/mine, idea/Outputs) |
| **Flows** | ⚠️ Moyen                  | route handlers clairs, handoffs typés                                                      | wizards qui piègent l'utilisateur (pas d'Escape/Cancel sur welcome-alt et playbook-editor), pas d'avertissement sur changements non sauvegardés, "Save Playbook"/"Enter Archie" ambigus                                                                                          |

---

## 1. 🛑 Bloqueurs de release (CRITICAL)

À régler **avant** toute démo "production-ready". Ordre = priorité.

| #       | Finding                                                                                                                                                                          | Where                                                                                                                                                                                                                                   | Fix                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1**  | **Le chip Admin est visible pour tout utilisateur final.** Il s'affiche en bas-gauche sur toutes les routes via `initUserModeChip()` appelé inconditionnellement.                | [src/app.js:66](src/app.js#L66), [src/components/user-mode-chip.js:8](src/components/user-mode-chip.js#L8), [styles/admin-chip.css:4](styles/admin-chip.css#L4)                                                                         | Gater derrière un flag : `if (!localStorage.getItem("archie-dev-mode")) return;` au début de `initUserModeChip()`, ou retirer l'import dans une build production. |
| **B2**  | **Composer textarea sans label associé** (lecteur d'écran ne sait pas ce que c'est).                                                                                             | [src/screens/session.js:401-406](src/screens/session.js#L401)                                                                                                                                                                           | Ajouter `aria-label="Type your message"` sur le `<textarea id="assistantInput">`.                                                                                 |
| **B3**  | **Les tours de l'assistant n'ont pas d'`aria-live`** → les utilisateurs de lecteurs d'écran ne reçoivent jamais les réponses. WCAG 4.1.3.                                        | [src/screens/session.js:261](src/screens/session.js#L261)                                                                                                                                                                               | Ajouter `aria-live="polite" aria-atomic="false"` sur `#assistantThread`.                                                                                          |
| **B4**  | **Modal backdrop hardcodé** `rgba(33, 46, 68, 0.26)` (pas de token, pas de dark-mode). Idem schedule-modal `0.32`.                                                               | [styles/ds-patches.css:10](styles/ds-patches.css#L10), [styles/components/schedule-modal.css:7](styles/components/schedule-modal.css#L7)                                                                                                | Définir `--app-modal-backdrop` dans tokens, l'utiliser dans les deux endroits.                                                                                    |
| **B5**  | **`<div role="button">` sans handler clavier Enter/Space** sur les lignes de conversation (sidebar) + dropzones (add-source, bug-report). Navigation clavier cassée. WCAG 2.1.1. | [src/components/sidebar.js:564-612](src/components/sidebar.js#L564), [src/components/add-source-modal.js:119](src/components/add-source-modal.js#L119), [src/components/bug-report-modal.js:97](src/components/bug-report-modal.js#L97) | Ajouter `keydown` (Enter/Space → click) ou remplacer par `<button type="button">` natif.                                                                          |
| **B6**  | **Wizards `welcome-alt` et `playbook-editor` sans sortie** : pas d'Escape, pas de "Cancel" — l'utilisateur est piégé jusqu'à la fin.                                             | [src/playbook-editor.js:48-115](src/playbook-editor.js#L48), [src/context-builder.js:157-204](src/context-builder.js#L157)                                                                                                              | Ajouter un bouton "Cancel and discard" avec confirm-modal sur état dirty + listener Escape global pendant le flow.                                                |
| **B7**  | **L'utilisateur peut perdre ses éditions** en cliquant "Enter Archie" sur le recap après avoir édité voice/strategy — aucun warning.                                             | [src/screens/welcome-alt-recap.js:118-132](src/screens/welcome-alt-recap.js#L118)                                                                                                                                                       | `beforeunload` ou confirm-modal "You have unsaved edits. Save before continuing?" si `dirty`.                                                                     |
| **B8**  | **`LANGUAGE_OPTIONS` propose Français/Español/Deutsch/Italien/Portugais** dans l'éditeur de Playbook alors que toute l'UI et la copy IA sont en anglais.                         | [src/playbook-view.js:537-538](src/playbook-view.js#L537)                                                                                                                                                                               | Soit retirer les langues non-supportées, soit ajouter un disclaimer "Copy generation currently English-only" sous le select.                                      |
| **B9**  | **⌘K (search) intercepte les frappes dans les textareas/inputs** → un user qui tape `K` dans un draft ouvre la search.                                                           | [src/components/search-modal.js:148-153](src/components/search-modal.js#L148)                                                                                                                                                           | Ignorer si `event.target` est `HTMLInputElement`, `HTMLTextAreaElement`, ou `[contenteditable]`.                                                                  |
| **B10** | **Schedule modal hors modal-coordinator** : pas de focus trap, pas de focus return, peut se superposer aux autres modals.                                                        | [src/components/schedule-modal.js:85-112](src/components/schedule-modal.js#L85)                                                                                                                                                         | `requestOpen(MODAL_ID, close)` au open, `notifyClose()` au close. Ajouter `aria-labelledby` sur le titre.                                                         |

---

## 2. 🎯 Top 10 quick wins (haut impact / faible coût)

Items qui transforment la perception de qualité en quelques minutes chacun.

| #   | Quick win                                                                                                                                     | Where                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Cibles tactiles `.app-sidebar__row-more` de 24→40px et nav-items collapsed 36→40px                                                            | [styles/components/sidebar.css:336-348](styles/components/sidebar.css#L336), [styles/components/sidebar.css:559-565](styles/components/sidebar.css#L559) |
| Q2  | Remplacer emojis 👍 💡 par `<i class="ap-icon-thumb-up">` / `<i class="ap-icon-bulb">` dans les réactions                                     | [src/components/post-card.js:102-103](src/components/post-card.js#L102)                                                                                  |
| Q3  | Mettre `<a href="#">` qui ouvrent un modal en `<button type="button">` (View idea, source chip)                                               | [src/screens/session.js:1209](src/screens/session.js#L1209), [src/components/idea-card.js:158](src/components/idea-card.js#L158)                         |
| Q4  | Toast action `<a>` → `<button>` ; ajouter `<i class="ap-icon-x" aria-hidden="true">` au bouton dismiss vide                                   | [src/components/toast.js:58-59](src/components/toast.js#L58)                                                                                             |
| Q5  | Renommer les CTAs nominaux : "New idea" → "Create an idea", "New Playbook" → "Create a Playbook"                                              | [src/screens/ideas.js:205-207](src/screens/ideas.js#L205), [src/screens/contexts.js:71](src/screens/contexts.js#L71)                                     |
| Q6  | Sur confirm-modal `danger=true`, focuser **Cancel** par défaut, pas Confirm                                                                   | [src/components/confirm-modal.js:115](src/components/confirm-modal.js#L115)                                                                              |
| Q7  | `loading="lazy"` sur toutes les `<img>` hors above-the-fold (cards, avatars)                                                                  | recherche globale `<img`                                                                                                                                 |
| Q8  | Reformuler hints clavier composer : "Enter to send · Shift+Enter for new line · Drag files to attach sources" (uniformiser sentence-case)     | [src/screens/session.js:469](src/screens/session.js#L469)                                                                                                |
| Q9  | Hint `aria-current="page"` + focus-visible ring sur tous les `settings-nav__button`                                                           | [src/screens/settings.js:108](src/screens/settings.js#L108)                                                                                              |
| Q10 | Pré-charger Averta Regular : `<link rel="preload" href="./ds/fonts/averta/AvertaStd-Regular.otf" as="font" type="font/opentype" crossorigin>` | [index.html](index.html)                                                                                                                                 |

---

## 3. ♿ Accessibilité (WCAG 2.1 AA)

### 3.1 Boutons icon-only sans `aria-label` (HIGH — ~15 instances)

| Élément                                                            | Where                                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Transport buttons play/pause/skip (video clips)                    | [src/components/video-clips-modal.js:351-359](src/components/video-clips-modal.js#L351)                                    |
| Composer attach/mention/playbook (s'assurer focus-visible + label) | [src/screens/session.js:416, 454](src/screens/session.js#L416)                                                             |
| Right-panel post/idea actions (more, pin, regenerate, schedule)    | [src/components/right-panel.js](src/components/right-panel.js) (multiple)                                                  |
| Sidebar footer popmenu items                                       | [src/components/sidebar.js:204-209](src/components/sidebar.js#L204)                                                        |
| Source/idea card "more" menus                                      | [src/components/source-card.js](src/components/source-card.js), [src/components/idea-card.js](src/components/idea-card.js) |
| Status card mention button                                         | [src/components/conversation-status-card.js:269-281](src/components/conversation-status-card.js#L269)                      |
| Clip card duration / more                                          | [src/components/clip-card.js](src/components/clip-card.js)                                                                 |

**Action transversale** : audit `grep -nE 'class="[^"]*ap-icon-button' src/` et ajouter `aria-label` partout où il manque ; mettre `aria-hidden="true"` sur l'icône enfant.

### 3.2 Contraste

| Finding                                                                          | Where                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--sys-text-color-light: #5D6A82` sur fond blanc ≈ 4.2:1 → fail WCAG 1.4.3       | [ds/desktop_variables.css:226](ds/desktop_variables.css#L226)                                                   |
| `.muted` class utilisée partout sans token explicite ; couleur fallback inconnue | recherche `class="[^"]*muted`                                                                                   |
| `.posts__card-meta.muted` probablement < 4.5:1 sur blanc                         | [src/components/post-card.js:106](src/components/post-card.js#L106)                                             |
| Status card heading + empty-state-sub utilisent `--ref-color-grey-80` (< 4.5:1)  | [styles/components/right-panel.css](styles/components/right-panel.css) (multiple `.app-right-panel__empty-sub`) |
| Composer "send disabled" gris-sur-gris (hover quasi-invisible)                   | [styles/screens/session.css:1025-1032](styles/screens/session.css#L1025)                                        |

**Fix** : remonter `--sys-text-color-light` à un gris ≥ 4.5:1 sur surfaces blanches (ex. `#4E5970`) **ou** créer `--sys-text-secondary-strong` pour les usages critiques.

### 3.3 Focus management & keyboard

| Finding                                                                                                                                               | Where                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pas de `:focus-visible` sur `.app-sidebar__row` (kbd hints, contexts card, settings nav button, posts card image placeholder, idea-card "why" toggle) | recherche `:focus-visible` (manquants nombreux)                                                       |
| Focus pas restauré au trigger quand right-panel se ferme                                                                                              | [src/components/right-panel.js openDraftsPanel/closePanel](src/components/right-panel.js)             |
| Focus re-render perdu sur sources-stream tick                                                                                                         | [src/screens/session/intake-lifecycle.js](src/screens/session/intake-lifecycle.js)                    |
| Pas de `Escape` pour fermer mention picker ; pas de `Tab` pour le quitter                                                                             | [src/screens/session.js:600-614](src/screens/session.js#L600)                                         |
| Picker (number-keys 1–9, arrows) non documenté / non discoverable                                                                                     | [src/inline-question.js:134-164](src/inline-question.js#L134)                                         |
| Sidebar kbd hints invisibles pour les utilisateurs clavier (opacity 0 jusqu'au hover)                                                                 | [styles/components/sidebar.css:163-185](styles/components/sidebar.css#L163) — ajouter `:focus-within` |
| Filter buttons Ideas : `role="tab"` sans `role="tablist"` parent                                                                                      | [src/screens/ideas.js:78](src/screens/ideas.js#L78)                                                   |
| `aria-pressed` + `disabled` simultanés sur pills topbar Drafts/Ideas                                                                                  | [src/components/topbar.js:308-329](src/components/topbar.js#L308) — préférer `aria-disabled`          |
| Hidden menus restent dans le tab order (opacity:0 sans `visibility:hidden`)                                                                           | [styles/components/sidebar.css:317-334](styles/components/sidebar.css#L317)                           |
| Pas de skip-to-content link                                                                                                                           | [index.html](index.html)                                                                              |

### 3.4 Heading hierarchy

| Finding                                             | Where                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pas de `<h1>` sur la route `/session/:id`           | [src/screens/session.js:756](src/screens/session.js#L756)                                                               |
| Status card `<h3>` orphelins sans `<h2>` parent     | [src/components/conversation-status-card.js:240, 248-250](src/components/conversation-status-card.js#L240)              |
| Analyse wizard saute du H1 → H3 sans H2             | [src/screens/\_analyse-common.js:262](src/screens/_analyse-common.js#L262)                                              |
| Search modal "Pinned/All" en `<div>` non sémantique | [src/components/search-modal.js:197-201](src/components/search-modal.js#L197) — ajouter `role="heading" aria-level="3"` |

### 3.5 Reduced-motion (WCAG 2.3.3)

Couverture quasi-absente. Ajouter `@media (prefers-reduced-motion: reduce) { transition: none !important; animation: none !important; }` dans :

- [styles/components/right-panel.css:34, 429-431, 442-445](styles/components/right-panel.css#L34) (resize handle, idea card hover, focus pulse)
- [styles/screens/session.css:793](styles/screens/session.css#L793) (focus pulse)
- [styles/chat.css:124-126, 188](styles/chat.css#L124) (source intake bubble + pill)
- [styles/screens/contexts.css:137](styles/screens/contexts.css#L137) (ghost card translateY)
- [styles/screens/welcome.css, styles/layout.css, styles/components/sidebar.css:9](styles/components/sidebar.css#L9) (grid-template-columns animée — layout-thrash)

### 3.6 ARIA & semantic structure

| Finding                                                                                 | Where                                                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Asterisk `*` purement visuel sans attribut `required` (forms)                           | [src/components/bug-report-modal.js:77, feedback-modal.js:52](src/components/bug-report-modal.js#L77)                |
| Schedule modal `role="grid"` avec `<button>` enfants (devraient être `role="gridcell"`) | [src/components/schedule-modal.js:567](src/components/schedule-modal.js#L567)                                        |
| Bug-report category chips sans `aria-pressed` (sélection invisible aux SR)              | [src/components/bug-report-modal.js:63-67](src/components/bug-report-modal.js#L63)                                   |
| Status messages async (extracting, uploading) sans `role="status" aria-live="polite"`   | [src/screens/session.js:1091, 1129-1131](src/screens/session.js#L1091)                                               |
| Bulk selection count ("N drafts selected") non annoncé                                  | [src/components/right-panel.js:846-851](src/components/right-panel.js#L846)                                          |
| Idea-card "more" sans `aria-haspopup="menu"`                                            | [src/components/idea-card.js:100-104](src/components/idea-card.js#L100)                                              |
| Pin button : `aria-pressed` non synchronisé à l'init                                    | [src/components/idea-card.js:249](src/components/idea-card.js#L249)                                                  |
| Thinking timer (s) sans `aria-live`                                                     | [src/screens/session.js:385](src/screens/session.js#L385)                                                            |
| Right-panel ouverture/fermeture sans annonce                                            | [src/components/right-panel.js:372](src/components/right-panel.js#L372) — `aria-label` statique, et ouverture muette |

---

## 4. 🎨 Conformité Design System

### 4.1 Tokens manquants ou contournés

| Finding                                                                                | Where                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fallback couleurs `var(--token, #hex)` partout — masque les ratés de chargement        | [styles/screens/dashboard.css:1](styles/screens/dashboard.css#L1), [styles/screens/posts.css](styles/screens/posts.css) (multiple)                                 |
| `font-size: 10px` hardcodé                                                             | [styles/layout.css:246, 250](styles/layout.css#L246), [styles/components/conversation-status-card.css:98, 102](styles/components/conversation-status-card.css#L98) |
| `border-radius: 68px` hardcodé sur `.ap-filter-chip`                                   | [styles/ds-patches.css:204](styles/ds-patches.css#L204) — utiliser `var(--app-radius-pill)`                                                                        |
| `padding: 1px 6px` + `letter-spacing: 0.08em` hardcodés sur `.app-sidebar__brand-beta` | [styles/components/sidebar.css:82, 88](styles/components/sidebar.css#L82)                                                                                          |
| `--comp-icon-size: 16px` / `--comp-avatar-size: 16px` redéfinis localement             | [styles/ds-patches.css:36-37, 60-62](styles/ds-patches.css#L36) — utiliser `--sys-icon-css-sm`                                                                     |
| `padding: 4px 8px; margin-left: -8px` topbar title                                     | [styles/layout.css:143-144](styles/layout.css#L143)                                                                                                                |
| Custom dark palette `#1a1a1a / #14171d` non documentée                                 | [styles/components/video-clips-modal.css:22-25](styles/components/video-clips-modal.css#L22) — accepté comme exception "video editor", mais l'expliciter           |
| Backdrop `rgba(33, 46, 68, 0.26)` / `0.32` hardcodés                                   | voir B4                                                                                                                                                            |

### 4.2 z-index magiques (HIGH)

z-index numériques sans tokens — risque de stacking war. Centraliser :

```
--app-z-content:  10
--app-z-overlay:  100
--app-z-modal:    1000
--app-z-toast:    1100
--app-z-tooltip:  1200
```

Fichiers concernés : [posts.css](styles/screens/posts.css), [welcome.css](styles/screens/welcome.css), [clip-card.css](styles/components/clip-card.css), [sidebar.css](styles/components/sidebar.css), [video-clips-modal.css](styles/components/video-clips-modal.css).

### 4.3 Icônes & SVG inline

| Finding                                                                               | Where                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<svg>` inline pour play/pause/skip alors que `ap-icon-play` existe                   | [src/components/video-clips-modal.js:520, 535, 540, 546](src/components/video-clips-modal.js#L520), [src/components/clip-card.js:143](src/components/clip-card.js#L143) |
| Toast dismiss `<i></i>` sans classe icône                                             | [src/components/toast.js:59](src/components/toast.js#L59)                                                                                                               |
| Style tags `${o.icon}` rendent `undefined` (STYLE/MOOD options n'ont pas de clé icon) | [src/components/generate-image-modal.js:144](src/components/generate-image-modal.js#L144)                                                                               |

### 4.4 `.ap-*` hors `ds-patches.css`

| Finding                                                                      | Where                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.ap-loader` redéclaré avec variantes custom (16/24/30/48)                   | [styles/components/archie-loader.css:1-50](styles/components/archie-loader.css#L1) — déplacer dans `ds-patches.css` |
| `.ap-action-dropdown` scopé app-specific — toléré mais documenter le pattern | [styles/components/sidebar.css:388-395](styles/components/sidebar.css#L388)                                         |

### 4.5 Validation à automatiser

Exécuter le MCP `ds-css`/`validate_css` sur les 25 fichiers CSS pour produire une liste exhaustive des valeurs hardcodées vs tokens. À refaire en CI.

---

## 5. ✍️ UX Copy

### 5.1 Glossaire (terminologie flottante — à figer)

| Terme actuel              | Variantes observées                            | Recommandation                                                                                                                                                    |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**                | Source / Document / File                       | **Source** partout (UI). "File" réservé aux messages techniques.                                                                                                  |
| **Idea**                  | Idea / Outputs (right-panel)                   | **Idea**. "Outputs" seulement quand le panneau contient ideas + clips ; sinon "Ideas".                                                                            |
| **Draft / Post**          | Draft / Draft post / Post                      | **Draft** pour le brouillon, **Post** pour le publié, **Draft a post** en CTA.                                                                                    |
| **Playbook**              | Playbook / Context / Profile                   | **Playbook** partout en UI. "Context" est code-only, à ne jamais leaker.                                                                                          |
| **Attach / Add / Upload** | Attach (composer) / Add (modal) / Upload (tab) | OK chacun dans son contexte, mais ne jamais mélanger dans le même flux.                                                                                           |
| **Ask / Send / Message**  | Ask / Chat / Message / Send                    | **Ask** pour les questions, **Send** pour la soumission, **Chat** pour la session.                                                                                |
| **Extract / Pull / Mine** | Pull / Mine / Extract                          | **Extract** partout. "Re-extract" pour le refresh.                                                                                                                |
| **Status async**          | Processing / Uploading / Reading / Analyzing   | **Analyzing** comme terme unifié quand on analyse une source. "Uploading" _uniquement_ pendant le transfert.                                                      |
| **Voix Archie**           | "Archie", "I", "Let's", impératif "Ask"        | Choisir une convention unique. Recommandation : **first-person "I" pour les actions** + **"Let's" pour les transitions** ; jamais "Archie" en troisième personne. |

### 5.2 CTAs problématiques (HIGH)

| Actuel                                                                                                           | Problème                       | Reformulation                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| "New idea" [src/screens/ideas.js:205](src/screens/ideas.js#L205)                                                 | Nom-CTA                        | "Create an idea"                                                                      |
| "New Playbook" [src/screens/contexts.js:71](src/screens/contexts.js#L71)                                         | Nom-CTA                        | "Create a Playbook"                                                                   |
| "No playbook" pill [src/screens/session.js:349](src/screens/session.js#L349)                                     | Lu comme erreur                | "Choose a playbook" ou "Default playbook"                                             |
| "Back to Playbooks" sur `/playbook/:id` [src/components/topbar.js:385](src/components/topbar.js#L385)            | Pluriel ambigu                 | "Back to all Playbooks"                                                               |
| "Save Playbook" vs "Enter Archie" [src/screens/welcome-alt-recap.js:82-88](src/screens/welcome-alt-recap.js#L82) | Sens et destination peu clairs | "Save and start" / "Save and continue"                                                |
| "Continue" sur destructif voice-edit confirm [src/screens/session.js:837](src/screens/session.js#L837)           | Banal                          | "Yes, edit Voice profile" + caption "Changes apply to every chat using this Playbook" |

### 5.3 Placeholders qui font office de label

| Where                                                                                   | Actuel                                              | Fix                                                                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Composer textarea [src/screens/session.js:404](src/screens/session.js#L404)             | `placeholder="Ask a follow-up, or refine a draft…"` | Ajouter `aria-label` court + placeholder exemple : `placeholder="e.g. Tighten the hook…"` |
| Rename modal [src/components/rename-modal.js:48-50](src/components/rename-modal.js#L48) | `placeholder="Name…"` + `aria-label="New name"`     | Unifier : `placeholder="e.g. Q3 product launch"`                                          |

### 5.4 Empty states avec jargon

| Where                                                         | Problème                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| [src/screens/ideas.js:131-135](src/screens/ideas.js#L131)     | "hooks, stats, quotes, and stories" — jargon pour un new user |
| [src/screens/contexts.js:98-101](src/screens/contexts.js#L98) | "Brand" capitalisé inconsistant, ton impératif "Define"       |
| [src/screens/ideas.js:151](src/screens/ideas.js#L151)         | "Once your sources finish processing" — jargon                |

**Pattern recommandé** : `[Why empty] · [Concrete next action]`. Pas plus de 12 mots, langage du quotidien.

### 5.5 Statuts vagues

| Where                                                       | Actuel                                                                       | Fix                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [src/screens/session.js:1091](src/screens/session.js#L1091) | "Extracting"                                                                 | "Extracting ideas from this source" + `aria-label`                                                         |
| [src/screens/session.js:1129](src/screens/session.js#L1129) | "Uploading"                                                                  | "Uploading {filename}"                                                                                     |
| [assistant.js:95-99](src/assistant.js#L95)                  | "Considering the best next move…"                                            | "Analyzing your request and sources…"                                                                      |
| [src/screens/session.js:1991](src/screens/session.js#L1991) | "Reading X now. While I pull the strongest ideas, what should I do with it?" | "I'm analyzing **X**. What would you like me to do — draft a batch, repurpose it, or extract ideas first?" |

### 5.6 Onboarding (welcome-alt) — première impression

| Where                                                              | Problème                                           | Reformulation                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------- |
| [welcome-alt-recap.js:73-74](src/screens/welcome-alt-recap.js#L73) | "Let's get to know your brand."                    | "Let's understand your brand."                                      |
| [session.js:757](src/screens/session.js#L757)                      | "keeps every post sounding like you" — overpromise | "guides every post to match your voice"                             |
| [session.js:761-773](src/screens/session.js#L761)                  | "Visual identity" trop vague                       | "Brand colors and visual style"                                     |
| [welcome-alt.js:21](src/screens/welcome-alt.js#L21)                | URL pré-rempli sans indication que c'est éditable  | Intro : "Here's your website — confirm it or type a different one." |

### 5.7 Ponctuation & casse

- Tooltips et boutons : **pas de point final**.
- Phrases descriptives (helper, empty subtitle) : **point final obligatoire**.
- Headings : **sentence case** systématique (UI Agorapulse).
- "Playbook" capitalisé partout (concept produit). "Source", "Idea", "Draft" : minuscule dans la copy, mais peuvent être capitalisés en label de colonne / titre de panneau.

---

## 6. 🤚 Polish d'interaction

### 6.1 Cibles tactiles < 40px (HIGH)

| Élément                     | Taille actuelle                | Where                                                                                                         |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Sidebar row "more" (⋮)      | 24×24                          | [styles/components/sidebar.css:336-348](styles/components/sidebar.css#L336)                                   |
| Sidebar collapsed nav items | 36×36                          | [styles/components/sidebar.css:559-565](styles/components/sidebar.css#L559)                                   |
| Status card rows            | ~24 (padding xxs sur icône 16) | [styles/components/conversation-status-card.css:135-157](styles/components/conversation-status-card.css#L135) |
| Toast dismiss / action      | < 40 (à vérifier)              | [src/components/toast.js](src/components/toast.js)                                                            |

### 6.2 Scroll restoration & state preservation

| Finding                                                        | Where                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tab Drafts ↔ Ideas dans right-panel → scroll perdu             | [src/components/right-panel.js:542-549](src/components/right-panel.js#L542) |
| Filter chip click dans Drafts → scroll perdu                   | [src/components/right-panel.js:416-417](src/components/right-panel.js#L416) |
| Pas de back-stack preservation visible (filtre, scroll, input) | recherche `popstate` / scrollTop save                                       |

**Pattern** : capturer `body.scrollTop` avant render, restaurer après via `requestAnimationFrame`.

### 6.3 Validation & feedback

| Finding                                                     | Where                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| URL input validate sur keystroke, pas sur blur              | [src/components/add-source-modal.js:600](src/components/add-source-modal.js#L600)                 |
| Generate button : `disabled` non synchronisé au prompt vide | [src/components/generate-image-modal.js:210, 342](src/components/generate-image-modal.js#L210)    |
| Generate error persiste à la réouverture du modal           | [src/components/generate-image-modal.js:40, 313, 422](src/components/generate-image-modal.js#L40) |
| Stepper temps clip : invalide → reset silencieux            | [src/components/video-clips-modal.js:623-638](src/components/video-clips-modal.js#L623)           |
| Connectors disconnect : pas de confirm, pas d'undo          | [src/screens/settings.js:237, 257](src/screens/settings.js#L237)                                  |
| Bulk delete drafts sans confirmation                        | [src/components/right-panel.js:437-439](src/components/right-panel.js#L437)                       |
| Video clip delete (red button) sans confirm                 | [src/components/video-clips-modal.js:323](src/components/video-clips-modal.js#L323)               |
| Set IN/OUT pas de clamp (start peut dépasser end)           | [src/components/video-clips-modal.js:543, 549](src/components/video-clips-modal.js#L543)          |
| File progress non clampé (peut overflow)                    | [src/components/add-source-modal.js:139](src/components/add-source-modal.js#L139)                 |

### 6.4 Toasts & feedback éphémère

| Finding                                                                | Where                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Toast timer s'efface sur mouseenter mais ne reprend pas sur mouseleave | [src/components/toast.js:75-78](src/components/toast.js#L75)                                    |
| Action toast : `<a>` → `<button>` (sémantique)                         | [src/components/toast.js:58](src/components/toast.js#L58)                                       |
| Subtitle preset toast "Subtitles applied · Bold" — vague               | [src/screens/session.js:2054](src/screens/session.js#L2054) → "Bold subtitles added to N clips" |

### 6.5 Drag & touch

| Finding                                                             | Where                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Video clip pro-trim handles : mouse-only (pas de touch ni keyboard) | [src/components/video-clips-modal.js:652-673](src/components/video-clips-modal.js#L652) |
| Drag-and-drop composer : pas d'`aria-label` sur la zone             | [src/screens/session.js:469](src/screens/session.js#L469)                               |
| Sidebar dropdown `position: fixed` sans clamp viewport              | [styles/components/sidebar.css:388-395](styles/components/sidebar.css#L388)             |

### 6.6 Animations & timings

| Finding                                                              | Where                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sidebar collapse anime `grid-template-columns` (layout trigger, CLS) | [styles/components/sidebar.css:9](styles/components/sidebar.css#L9) |
| Token delays 8-18ms hardcodés sans commentaire                       | [src/draft-rewrite.js:31-32](src/draft-rewrite.js#L31)              |
| Thinking 6s hardcodé sans commentaire                                | [src/draft-flow.js:54, 148](src/draft-flow.js#L54)                  |

---

## 7. 🧭 Information Architecture & Flows

| Finding                                                          | Where                                                                             | Fix                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Aucune sortie sur welcome-alt 3-question chat (voir B6)          | [src/context-builder.js:157-204](src/context-builder.js#L157)                     | Bouton "Exit onboarding" sur chaque question      |
| Profile picker n'a pas de "Mon compte n'est pas listé"           | [src/context-builder.js:218-262](src/context-builder.js#L218)                     | Ajouter option "Skip for now"                     |
| Document upload : multi:true mais traite le 1er seulement        | [src/context-builder.js:270-298](src/context-builder.js#L270)                     | Soit désactiver multi, soit traiter tout le batch |
| Branding step → askPlaybookColor → askBranding (perte de stack)  | [src/playbook-editor.js:573-574](src/playbook-editor.js#L573)                     | Tracker la pile ou toujours retourner au parent   |
| Ideas filter `role="tab"` mais pas de `role="tablist"` parent    | [src/screens/ideas.js:78](src/screens/ideas.js#L78)                               | Wrap dans un container `role="tablist"`           |
| Right-panel modes (Drafts/Ideas/Sources) — `aria-label` statique | [src/components/right-panel.js:372](src/components/right-panel.js#L372)           | Mettre à jour à chaque switch                     |
| Confirm modal : focus Confirm même quand destructif              | [src/components/confirm-modal.js:115](src/components/confirm-modal.js#L115)       | Si `danger`, focus Cancel                         |
| Bug-report screenshot : fetch html2canvas sans timeout           | [src/components/bug-report-modal.js:182](src/components/bug-report-modal.js#L182) | `Promise.race` avec 3s timeout                    |

### 7.1 Responsive (HIGH)

| Finding                                                              | Where                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.contexts-view__search` `flex: 0 0 240px` non responsive            | [styles/screens/contexts.css:59-61](styles/screens/contexts.css#L59)                                       |
| `.ideas-view__sort` `min-width: 160px` cassé sur mobile              | [styles/screens/ideas.css:131-133](styles/screens/ideas.css#L131)                                          |
| `.recap__grid--*` switch à 720px mais font-size headings non ajustée | [styles/screens/welcome.css:995-999](styles/screens/welcome.css#L995)                                      |
| Playbook editor 2-col → mobile : remove button mal aligné            | [src/playbook-view.js:1009-1027](src/playbook-view.js#L1009) — breakpoint 720px trop tardif (tester 375px) |
| Edit mode masque TOUS les pencil icons globalement                   | [src/playbook-view.js:960-963](src/playbook-view.js#L960) — montrer en disabled/muted                      |

---

## 8. 🪟 Modals — checklist transverse

À appliquer à **chaque modal** (add-source, generate-image, bug-report, feedback, chat-picker, schedule, video-clips, confirm, rename, search) :

- [ ] `role="dialog"` (ou `alertdialog` si destructif) + `aria-modal="true"` + `aria-labelledby` pointant sur l'id du titre.
- [ ] Focus trap actif tant que ouvert ; focus return au trigger à la fermeture.
- [ ] Escape ferme (avec confirm si dirty).
- [ ] Premier input focusé au open (sauf si destructif → focus Cancel).
- [ ] Backdrop click ferme (sauf si dirty).
- [ ] `--app-modal-backdrop` token (pas hardcodé).
- [ ] Boutons pinned en bas via flex (pas qui scrollent away).
- [ ] Primary CTA unique, verb-first, `.ap-button.primary`.
- [ ] Submit disabled tant qu'invalide ; spinner pendant request ; toast après succès.
- [ ] Erreurs placées **sous** le champ + `role="alert"` ; `aria-describedby` lié au champ.
- [ ] Autocomplete attributes (`url`, `email`, `off` pour search/rename).
- [ ] Required field : attribut HTML `required` + visible `*` ; pas que visuel.
- [ ] Inline validation **on blur**, pas on keystroke.

État par modal :

| Modal          | Coordinator  | Focus return | Escape | Backdrop token | Errors role=alert |
| -------------- | ------------ | ------------ | ------ | -------------- | ----------------- |
| add-source     | ✅           | ✅           | ✅     | ❌ (B4)        | ✅                |
| generate-image | ✅           | ✅           | ✅     | ❌             | ⚠️                |
| bug-report     | ✅           | ✅           | ✅     | ❌             | ✅                |
| feedback       | ✅           | ✅           | ✅     | ❌             | ✅                |
| chat-picker    | ✅           | ✅           | ✅     | ❌             | n/a               |
| **schedule**   | **❌ (B10)** | ❌           | ⚠️     | ❌             | ⚠️                |
| video-clips    | ⚠️           | ⚠️           | ⚠️     | ❌             | ⚠️                |
| confirm        | ✅           | ✅           | ✅     | ❌             | n/a               |
| rename         | ✅           | ✅           | ✅     | ❌             | n/a               |
| search         | ⚠️           | ⚠️           | ✅     | ❌             | n/a               |

---

## 9. ⚡ Performance

### 9.1 Chargement initial

| Finding                                                                                                                      | Where                                 | Impact                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| 17 stylesheets bloquants au boot                                                                                             | [index.html:13-37](index.html#L13)    | LCP/FCP                 |
| Cache-bust `?v=N` global → cache toujours invalidé                                                                           | [src/app.js](src/app.js) + index.html | TTFB répétés            |
| `right-panel.js` (123k), `session.js` (116k), `sidebar.js` (27k), `video-clips-modal.js` (40k) chargés sur toutes les routes | [src/app.js](src/app.js)              | JS parse time           |
| 11 modals init() au boot (la plupart inutilisés à chaque session)                                                            | [src/app.js:65-84](src/app.js#L65)    | Memory + parse          |
| `mocks.js` (1932 LOC) chargé pour returning users qui n'en ont pas besoin                                                    | [src/mocks.js](src/mocks.js)          | Memory                  |
| Pas de `<link rel="preload">` sur Averta Regular                                                                             | [index.html](index.html)              | LCP (font swap visible) |

### 9.2 Runtime

| Finding                                                            | Where                                                                   | Impact                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------- |
| Polling sources-stream (100ms tick) ne pause pas en background     | [src/sources-stream.js:198-210, 283-285](src/sources-stream.js#L198)    | Battery                             |
| Library.js re-émet à N subscribers à chaque source event           | [src/library.js](src/library.js)                                        | CPU avec sessions multiples         |
| Assistant.js : threads jamais paginés/truncated                    | [src/assistant.js](src/assistant.js)                                    | Memory long-term                    |
| Risque de double subscribe sur session switch (à auditer)          | [src/components/right-panel.js:361](src/components/right-panel.js#L361) | Memory leak                         |
| `clearSession()` sources-stream ok, mais library/posts/assistant ? | [src/sources-stream.js:102-113](src/sources-stream.js#L102)             | Memory leak sur delete conversation |
| Pas de virtualization sur listes (à vérifier sur 50+ ideas/posts)  | [src/components/right-panel.js](src/components/right-panel.js)          | Scroll jank                         |

### 9.3 Animations bloquantes

| Finding                                                                     | Where                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sidebar : transition `grid-template-columns` (layout-trigger)               | [styles/components/sidebar.css:9](styles/components/sidebar.css#L9) → `transform: translateX(...)` |
| Plusieurs `transition: width/height/top/left` à auditer dans tout `styles/` | grep `transition.*\(width\|height\|top\|left\)`                                                    |

---

## 10. 🪲 Dead code & bugs accessoires

| Finding                                                                                 | Where                                                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Boutons "New idea" / "Re-extract from sources" sans handler                             | [src/screens/ideas.js:205-207](src/screens/ideas.js#L205)                                 |
| `STYLE_OPTIONS`/`MOOD_OPTIONS` sans `icon` mais template rend `${o.icon}` → "undefined" | [src/components/generate-image-modal.js:144](src/components/generate-image-modal.js#L144) |
| `accept="image/*"` mais copy dit "PNG, JPG, GIF"                                        | [src/components/bug-report-modal.js:99-101](src/components/bug-report-modal.js#L99)       |
| `accept` extensions sans MIME types                                                     | [src/components/add-source-modal.js:45](src/components/add-source-modal.js#L45)           |
| Connector doc checkbox : titre/kind hors `<label>` → click ne toggle pas                | [src/components/add-source-modal.js:301](src/components/add-source-modal.js#L301)         |
| `"Import N item(s)"` → devrait être "document(s)"                                       | [src/components/add-source-modal.js:334](src/components/add-source-modal.js#L334)         |
| Connector breadcrumb séparateur non aria-hidden                                         | [src/components/add-source-modal.js:283-288](src/components/add-source-modal.js#L283)     |
| Image alt vide sur avatars utilisateur                                                  | [src/screens/\_analyse-common.js:207](src/screens/_analyse-common.js#L207)                |
| `deriveName` : "i.com" → "I" awkward                                                    | [src/context-mock-analysis.js:234-244](src/context-mock-analysis.js#L234)                 |

---

## 11. 📋 Plan d'exécution suggéré

### Sprint 1 — Production blockers + a11y critiques (~3-4j)

1. B1 admin chip gated (15min)
2. B2 + B3 textarea label + thread aria-live (30min)
3. B4 backdrop token (1h)
4. B5 div→button + keyboard (4h)
5. B6 wizards Cancel/Escape (1j)
6. B7 unsaved warning (4h)
7. B8 LANGUAGE_OPTIONS (15min — décision produit)
8. B9 ⌘K guard (15min)
9. B10 schedule-modal coordinator (4h)
10. Tous les Q1–Q10 quick wins (1 demi-journée)

### Sprint 2 — A11y + DS systemic (~1 semaine)

- Audit complet `aria-label` sur tous les icon-only (script grep + fix)
- Audit contraste tokens `--sys-text-color-light`
- Centraliser z-index dans `tokens.css`
- `prefers-reduced-motion` sur tous les fichiers CSS avec animation
- Heading hierarchy par route (h1 unique)
- Skip-to-content + focus management modals/panels
- Touch targets 40px partout

### Sprint 3 — Copy & terminology (~3-5j)

- Décision voix Archie (1st-person "I" recommandé)
- Glossaire figé (cf. §5.1) + audit grep des termes
- Rewrite CTAs nominaux + status async
- Onboarding copy review
- Empty states sans jargon

### Sprint 4 — Polish & flows (~1 semaine)

- Scroll restoration right-panel
- Confirm modals : bulk delete, disconnect, video clip delete
- Validation on-blur partout (URL, time, etc.)
- Touch handlers sur video clip handles
- Toast resume timer on mouseleave + button
- Responsive < 720px (contexts, ideas, recap)
- Modal flex layout (footer pinned)

### Sprint 5 — Performance (~1 semaine)

- Lazy-load modals + screens
- Combine CSS critique (inline) + defer screens CSS
- Remove `?v=N` global (use content hash on changed files)
- Page Visibility API sur sources-stream
- Audit subscribe/unsubscribe cycles
- Mocks.js conditionnel (dev-only)

---

## 12. Métriques de succès

- **A11y** : `axe-core` 0 violations CRITICAL/HIGH sur les 8 routes ; navigation 100% clavier ; lighthouse a11y ≥ 95.
- **Perf** : LCP < 2.5s, FCP < 1.5s, CLS < 0.1 sur dashboard et session.
- **DS** : 0 fallback couleur, 0 z-index hardcodé hors tokens, validate_css clean.
- **Copy** : glossaire respecté (script grep CI), 0 string FR visible sauf intention.

---

_Audit synthétisé à partir de 6 audits parallèles couvrant chrome+dashboard, session+right-panel, écrans secondaires, settings+modals, copy, et a11y/perf/DS transverses. Total : ~260 findings consolidés en ~140 items actionnables._
