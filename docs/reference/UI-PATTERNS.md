# UI patterns — usage concret du Design System

> Ce que le proto **rend réellement** : classes `.ap-*` utilisées, tokens app, primitives patchées, patterns récurrents, loaders, convention couleur en pratique.
>
> Complète [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) (le _workflow obligatoire_ : MCP, ordre des vérifications, anti-patterns). Ici on documente le _résultat_ : comment le DS est câblé dans l'app.

Tokens DS = `--ref-*` / `--sys-*` / `--comp-*`. Tokens app = `--app-*`. Les templates passent par `html`` / `raw()` ([`utils.js`](../../src/utils.js)) — escape par défaut, `raw()`opt-out, arrays`.join("")`, `null`/`false` → vide.

---

## 1. `styles/ds-patches.css` — l'inventaire des « trous du DS »

Seul endroit légitime pour toucher `.ap-*`. Charte du fichier : _« the only legitimate place to extend `.ap-*` classes… should shrink as the DS evolves »_.

| Sélecteur                                               | Raison                                                                                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-modal-backdrop`                                   | Le DS ne fournit pas de backdrop plein-viewport. `inset:0`, `--app-modal-backdrop`, `--app-z-modal-backdrop`.                                                                                                              |
| `.ap-status.mermaid` (+ `::before`)                     | `.ap-status` DS n'a pas de variante mermaid. Pills de travail in-conversation (Drafting / Extracting / Extracted-N / Analyzing). Teinte `--app-butter`, dot olive `--app-butter-accent`.                                   |
| `.ap-icon-archie-official`                              | Le glyphe logotype « A » d'Archie, mask-based (`-webkit-mask-image` data-URI). Hors liste d'icônes DS générée. Peint en `currentColor`. C'est **l'avatar AI**, distinct de `.ap-icon-sparkles`.                            |
| `.ap-status-card` (+ variantes)                         | Le DS a les tokens `--comp-status-card-*` mais pas de classe CSS-UI. Recrée la primitive (miroir `libs/ui-components/status-card`). Container-query masque l'icône < 130px. Modifiers en `.tagOrange` (pas `.tag-orange`). |
| `.ap-button.danger` (+ `.stroked.danger`)               | Le DS n'a pas de variante danger. Synthétisée depuis la palette rouge. Utilisée par `confirm-modal` en `danger=true`.                                                                                                      |
| `.ap-infobox.feature-lock`                              | Intent violet « limit reached / upgrade » (les infobox DS n'ont que info/warning/error/success).                                                                                                                           |
| `button.ap-link`                                        | `.ap-link` DS suppose un `<a>` ; reset le chrome UA d'un `<button>` stylé en lien.                                                                                                                                         |
| `.ap-filter-chip` (+ états, `-icon`/`-avatar`/`-count`) | Primitive en route vers le DS (V2-Atoms › FilterChip). Pill 24px, `aria-pressed` → ramp electric-blue.                                                                                                                     |
| `.ap-divider, .divider`                                 | La règle DS référence `--sys-color-border-color-default` mais les tokens du proto définissent `--sys-border-color-default` → fallback `--ref-color-grey-10`.                                                               |
| `.ap-form-message[hidden]`                              | `.ap-form-message{display:flex}` bat `[hidden]{display:none}` → restaure le guard hidden.                                                                                                                                  |
| `.ap-dropzone` (famille)                                | Le DS n'a pas de dropzone. Box partagée « drop / browse » ([`dropzone.js`](../../src/components/dropzone.js)), variantes `--compact` / `--lg`, highlight `is-drop-target`.                                                 |

Règle : **jamais** redéclarer une `.ap-*` hors ce fichier (ça flippe la cascade silencieusement).

---

## 2. Tokens app-only (`styles/tokens.css`)

Tous namespacés `--app-*`. Charte : _« prefer DS tokens first; fall back to these only for handoff-specific values »_. Groupes :

- **Surfaces** : `--app-bg`, `--app-surface`, `--app-surface-subtle`, `--app-border`, `--app-border-soft`.
- **Accent « butter »** (Archie) : `--app-butter` (#f7ffc5, fond pill status), `--app-butter-accent` (#8a9b2e olive, dot).
- **Logo mark** : `--app-archie-mark` (#ff3c00).
- **Conversation navy** (brand tertiaire #0A1B33, remplace l'electric-blue dans le thread) : `--app-convo-navy(-deep/-05/-10/-20)`.
- **Video-clips dark ramp** (seule palette sombre de l'app, alimente le modal clips + caption-editor) : `--app-vc-*` (surfaces, field, borders, text, accent, primary, danger, scrim, shadow). Commentaire : _« blue = selected/info, orange = primary/AI, red = destructive »_.
- **Radius** : `--app-radius-sm/-md/-lg`, `-button-sm` (6), `-starter` (10), `-card` (12), `-modal` (16), `-pill` (999), `-circle` (50%).
- **Elevation** : `--app-shadow-subtle/-low/-popover-md/-lg/-drawer-left/-card/-modal/-orange-hover`.
- **Easing** : `--app-ease-out/-bounce/-standard`.
- **Chrome** : `--app-topbar-height` (56), `--app-sidebar-width` (260) / `-collapsed` (56), `--app-right-panel-width` (460).
- **Z-index (centralisé)** : content 5, overlay 10, right-panel 15, modal-backdrop 50, modal 60, modal-stacked-backdrop 70, modal-stacked 71, admin 100.

⚠️ **Typo** : aucune taille/poids de police côté app — tout vient des text styles DS (`--sys-text-style-*`). Voir mémoire _ads-figma-text-styles_.

---

## 3. Patterns récurrents (classes/markup exacts)

### Cartes + hover

Règle universelle (`chat.css`) : _« a light-blue wash on hover/focus (never navy/black) — soft blue fill + a light blue border, not a hard outline »_. Voir mémoire _card-hover-convention_.

- `.drafts-card:hover` → `border-color: --ref-color-electric-blue-20` + `background: --ref-color-electric-blue-05`. Actif = `.is-active` (electric-blue-40).
- `.top-post-card:hover`, `.clip-card` sélectionné → `border-color: --ref-color-electric-blue-100`.
- Radius carte = `--app-radius-card` (12). Tuiles icône AI/brand = fond `--ref-color-orange-10` + glyphe orange.
- Cartes in-bubble : `.chat-bubble-card` (grey-05, border grey-10) via `bulletsBlock()` (`_analyse-common.js`).

### Boutons / CTAs

DS `.ap-button` avec `primary|stroked|ghost` × `orange|blue`. Icon = `.ap-icon-button` (souvent `transparent`). Lien-bouton = `button.ap-link` (patché). Danger = `.ap-button.danger`. **Jamais full-width** (voir mémoire _buttons-never-full-width_).

### Filter chips

`.ap-filter-chip` piloté par `aria-pressed`, optionnels `-icon` / `-avatar` (img rond) / `-count`. Partout : connectors-view, playbook-view, ideas, generate-image-modal, right-panel, feedback-control, schedule-modal.

### Status pills

DS `.ap-status` + `blue|green|grey|mermaid` (mermaid patché). Les états de travail in-conversation utilisent `mermaid` (butter + dot olive).

### Quickpicker (inline-question)

Le « pick one of N » réutilisable. État dans [`inline-question.js`](../../src/inline-question.js), rendu par `renderPicker()` dans [`_analyse-common.js`](../../src/screens/_analyse-common.js) sous le chrome `session__assistant--wizard`. Modes : rows numérotées, `variant:"cards"`, `multi`, `single`, `stepper`, free-text, file. **Le CTA submit est bleu** (pas l'orange AI) — mémoire _quickpicker-primary-is-blue_ + _quickpicker-secondary-button-tiers_. Contrôles = vrai radio DS, fade-to-bg gris — mémoire _ds-controls-and-fade-bg_.

### Panneau de droite

`.app-right-panel` (blanc, `border-left`), `__resize` (strip 6px, electric-blue au hover, largeur → `localStorage` `archie-rpanel-width`), `__close`, `__body` (`container-type: inline-size`), `__empty*`.

### Toasts

[`toast.js`](../../src/components/toast.js) wrap `.ap-snackbar-thread` / `.ap-snackbar` (+ `.success`/`.error`, `.animate-in/-out`). Queue app (`MAX_VISIBLE=3`), dwell 3200 ms (pause au hover), Undo optionnel (`.ap-link`). Région `#toastRegion`.

### Empty states

`renderEmptyState()` ([`empty-state.js`](../../src/components/empty-state.js)) : `.session__empty` > icône `.lg` > `h3.text-subtitle` > `p.muted` > `.session__empty-action`. Variante panneau : `.app-right-panel__empty`.

### Modals / backdrop

DS `.ap-dialog` centré par `modals.css` sur `.open`. `.app-modal-backdrop` patché (fade via `@keyframes app-modal-backdrop-fade`). Radius `--app-radius-modal` (16). Modals empilés → couches `--app-z-modal-stacked*`.

**Un nouveau modal doit être ajouté aux DEUX listes de sélecteurs de [`modals.css`](../../styles/screens/modals.css)** (la coquille centrée, et la variante `.open` qui passe `display: none` → `flex`). Sinon il reste invisible avec un backdrop actif. Corollaire : ne pas redéclarer `display` sur la classe du modal dans une feuille chargée **après** `modals.css`.

Échelle de largeurs, toutes en `width: min(calc(100% - 32px), Npx)` :

| Largeur | Modals                               | Pourquoi                                                       |
| ------- | ------------------------------------ | -------------------------------------------------------------- |
| 440     | rename                               | un seul champ                                                  |
| 560     | bug report, chat picker, search      | une liste courte ou un formulaire                              |
| 640     | feedback, add source                 | formulaire + onglets                                           |
| **720** | **research** (« Read the research ») | **lecture longue** — de la prose ; au-delà, la mesure décroche |
| 920     | connectors                           | une gallery à parcourir                                        |
| 960     | schedule                             | deux colonnes                                                  |

Les modals de lecture longue plafonnent aussi leur hauteur (`max-height: min(calc(100vh - 48px), 760px)`) et font défiler leur `.ap-dialog-content`, avec un footer d'actions collant : la décision doit rester atteignable quelle que soit la longueur du texte.

---

## 4. Icônes

Glyphes webfont DS `<i class="ap-icon-*">` (quasi toujours `aria-hidden="true"`). Icon-buttons = `.ap-icon-button` (mettre `aria-label` sur le bouton). Les plus utilisés : `ap-icon-archie-official` (avatar), `-close`, `-plus`, `-pen`, `-check`, `-chevron-down`, `-trash`, `-file`, `-sparkles`, `-search`, `-link`, `-upload`, + glyphes réseaux (`-linkedin-official`, `-twitter-official`/`-x-official`, `-instagram-official`, `-tiktok-official`, `-facebook-official`, `-youtube-official`).

- **Sparkles = affordance AI** : `ap-icon-sparkles` marque les actions Archie (Regenerate, Suggest from this post, Compare, Optimal times), recoloré orange.
- **Avatar AI** = `.ap-icon-archie-official` (le mask « A », **pas** le sparkle DS).

**Exceptions inline-SVG** (animation ou path bespoke) :

- `LOADER_SVG` ([`archie-loader.js`](../../src/archie-loader.js)) — mark animé SMIL « pixel-pop » (SMIL gèle si utilisé en background/mask → injection JS).
- `ARCHIE_MARK_SVG` (`playbook-view.js`) — mark statique du recap.
- `.clip-studio__frame-art` (`session.js`) et le triangle play (`post-card.js`) — chrome vidéo déco.

---

## 5. Convention couleur en pratique

Codifiée dans `tokens.css` (_« orange = primary/AI, blue = selected/info, red = destructive »_). Voir [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md#convention-couleur--usage-app-wide).

- **Exemple le plus net** — [`connectors-view.js`](../../src/connectors-view.js) : action AI « Try » = `ap-button primary orange`, action routine « Connect » = `ap-button primary blue`, côte à côte.
- **Orange (AI / generate / commit)** : Send composer, Batch/Clip studio Generate, Regenerate, Save recap, Generate-image, add-source Import/Add-URL/Add-text, welcome « Save and continue », tuiles icône AI (`--ref-color-orange-10` + glyphe orange).
- **Bleu (routine / navigation / picker submit)** : Connect, « Create a Playbook », Ideas new, playbook Start, bulk-extract, top-post CTAs, **tous les submits Quickpicker**.
- **Conversation navy** (`--app-convo-navy*`) : override l'electric-blue pour les accents du **thread** (bulle user, label « You », pill Ideas, chips source-intake, halos hover).

---

## 6. Layout / shell CSS

`styles/layout.css` — `.app-shell` est une grille CSS :

- **Colonnes** : `--app-sidebar-width` (260) + `minmax(0,1fr)` contenu ; `.is-sidebar-collapsed` → col 1 = 56.
- **Rangées** : `--app-topbar-height` (56) + `1fr`.
- **Sidebar** (`.app-sidebar`) : `grid-row 1/3` (col 1). **Topbar** : row 1, col `2/-1` (span le panneau pour garder les pills visibles). **Content** : row 2, col 2.
- **Right panel** : row 2, col 3 quand `.is-right-panel-open` ajoute une 3e colonne (`max(610px, calc((100vw − sidebar)/3))`, override runtime persisté).
- **Status card** (`conversation-status-card.css`) : colonne 296px (row 2, col 3) quand `.is-status-card-visible` ; si le panneau est aussi ouvert il passe **col 4** pour coexister. Masquée sur routes `.clip-studio`.
- **Modes spéciaux** : `body.onboarding` → colonne unique plein-viewport (pas de sidebar/topbar) ; `.app-shell:has(.empty-chat)` drop le topbar pour le hero.
- **Scaffolding** : `.screen`, `.screen--split` (`minmax(320px,380px) 1fr`), `.screen--centered` ; helpers `.stack`/`.row`/`.row-between`/`.grow`/`.muted`/`.text-title`/`.text-subtitle`/`.text-caption`.

Détail complet des formules de taille : [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md).

---

## 7. Animations & loaders

**`base.css` (partagé)** : `@keyframes app-spin`, `app-focus-pulse` (pulse electric-blue-20), + umbrella **reduced-motion** (`@media (prefers-reduced-motion: reduce)` cape toutes les durées à ~0).

**Keyframes par fichier** : `modals.css` (backdrop-fade, fade-in, success-pop, gen-shimmer), `session.css` (empty-rise, assistant-notice-pulse, composer-status-in/-out, thread-skeleton-shimmer), `dashboard.css` (source-card-processing-pulse), `posts.css` (word-fade-in), `clip-studio.css` (pulse/spin/shimmer/fill/stage), `welcome.css` (recap-loading), `schedule-modal.css` (spin).

**Le loader (source unique)** : [`archie-loader.js`](../../src/archie-loader.js) + `styles/components/archie-loader.css`. Toutes les classes spinner (`.archie-loader`, `.ap-loader` + tailles, ~10 `*-spinner`) rendent **le même mark** : `initArchieLoader()` sweep le DOM + `MutationObserver` injecte `LOADER_SVG` (7 carrés arrondis en scale, stagger 0→0.686s) avec un `__MASKID__` unique. CSS possède la box (`--archie-loader-size`, `aspect-ratio 227.15/170.03`, `color: --archie-loader-color` défaut `--ref-color-orange-100`, `currentColor` blanc sur CTAs pleins). Inline SVG obligatoire (SMIL gèle en background/mask).

---

## Voir aussi

- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — workflow DS obligatoire + MCP `ds-css` + anti-patterns
- [`FEATURES.md`](FEATURES.md) — où ces patterns sont utilisés (par feature)
- [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md) — formules de tailles sidebar / panel / status-card
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
