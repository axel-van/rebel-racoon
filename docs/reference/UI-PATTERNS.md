# UI patterns — usage concret du Design System

> Ce que le proto **rend réellement** : classes `.ap-*` utilisées, tokens app, primitives patchées, patterns récurrents, loaders, convention couleur en pratique.
>
> Complète [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) (le _workflow obligatoire_ : MCP, ordre des vérifications, anti-patterns). Ici on documente le _résultat_ : comment le DS est câblé dans l'app.

Tokens DS = `--ref-*` / `--sys-*` / `--comp-*`. Tokens app = `--app-*`. Les templates passent par `html`` / `raw()` ([`utils.js`](../../src/utils.js)) — escape par défaut, `raw()`opt-out, arrays`.join("")`, `null`/`false` → vide.

---

## 1. `styles/ds-patches.css` — l'inventaire des « trous du DS »

Seul endroit légitime pour toucher `.ap-*`. Charte du fichier : _« the only legitimate place to extend `.ap-*` classes… should shrink as the DS evolves »_.

| Sélecteur                                   | Raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-modal-backdrop`                       | Le DS ne fournit pas de backdrop plein-viewport. `inset:0`, `--app-modal-backdrop`, `--app-z-modal-backdrop`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `.ap-table.clickable-rows`                  | Le DS prescrit des lignes de tableau qui **naviguent** (« per-row overflow menu and row actions », patterns.md) mais ne livre aucune affordance pour ça : ni curseur, ni hover, ni anneau de focus sur une ligne cliquable. Les écrans le stylaient eux-mêmes sur `tbody tr`, ce que la fiche du composant interdit (« use root modifiers rather than styling individual tr / th / td ») — d'où un **modificateur racine** ici. Hover en grey-05, le même lavis que `.striped` et `.header-background`.                                                           |
| `.ap-status.mermaid` (+ `::before`)         | `.ap-status` DS n'a pas de variante mermaid. Pills de travail in-conversation (Drafting / Extracting / Extracted-N / Analyzing). Teinte `--app-butter`, dot olive `--app-butter-accent`.                                                                                                                                                                                                                                                                                                                                                                          |
| `.ap-icon-archie-official`                  | Le glyphe logotype « A » d'Archie, mask-based (`-webkit-mask-image` data-URI). Hors liste d'icônes DS générée. Peint en `currentColor`. C'est **l'avatar AI**, distinct de `.ap-icon-sparkles`.                                                                                                                                                                                                                                                                                                                                                                   |
| `.ap-status-card` (+ variantes)             | Le DS a les tokens `--comp-status-card-*` mais pas de classe CSS-UI. Recrée la primitive (miroir `libs/ui-components/status-card`). Container-query masque l'icône < 130px. Modifiers en `.tagOrange` (pas `.tag-orange`).                                                                                                                                                                                                                                                                                                                                        |
| `.ap-button.danger` (+ `.stroked.danger`)   | Le DS n'a pas de variante danger. Synthétisée depuis la palette rouge. Utilisée par `confirm-modal` en `danger=true`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.ap-infobox.feature-lock`                  | Intent violet « limit reached / upgrade » (les infobox DS n'ont que info/warning/error/success).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `button.ap-link`                            | `.ap-link` DS suppose un `<a>` ; reset le chrome UA d'un `<button>` stylé en lien.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.ap-filter-chip` (+ états, `-count`)       | Primitive en route vers le DS (V2-Atoms › FilterChip). Pill 24px, `aria-pressed` → ramp electric-blue.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `.ap-divider, .divider`                     | La règle DS référence `--sys-color-border-color-default` mais les tokens du proto définissent `--sys-border-color-default` → fallback `--ref-color-grey-10`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `.ap-form-message[hidden]`                  | `.ap-form-message{display:flex}` bat `[hidden]{display:none}` → restaure le guard hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `.ap-dropzone` (famille)                    | Le DS n'a pas de dropzone. Box partagée « drop / browse » ([`dropzone.js`](../../src/components/dropzone.js)), variantes `--compact` / `--lg`, highlight `is-drop-target`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `.ap-button.mermaid` (`--ap-mermaid-inner`) | Le DS peint l'intérieur du bouton en dur `--ref-color-white`, donc il ne rend correctement que sur du blanc. Hook exposé pour qu'un hôte teinté lui passe son fond (défaut = valeur DS). ⚠️ C'est une bordure dégradée : **poids de contour, jamais un primaire**.                                                                                                                                                                                                                                                                                                |
| `.ap-radio-card-title` (ink)                | **Bug de cascade du DS**, pas un choix de design : `.ap-radio-card-title { color: grey-100 }` (0-1-0) perd contre `.ap-radio-card > div > span { color: grey-80 }` (0-1-2) déclaré plus haut dans le même fichier — or un titre EST un de ces spans. Résultat : le NOM d'une radio-card sort dans l'encre secondaire, même taille et même gris que le hint sous lui, donc la carte n'a aucune hiérarchie. Réénoncé ici à l'intention d'origine avec assez de spécificité pour atterrir. Touche Share, Save drafts et Schedule — les trois perdaient le même rang. |

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
- **Mesure** : `--app-content` (1080) — la largeur de contenu de TOUTE page pleine largeur. C'est la mesure de la fiche Playbook (`.recap > *`, welcome.css), adoptée le 2026-09-11 comme référence de l'app à la place de trois caps qui ne s'accordaient pas (1280 catalogue + connectors, 1200 Insights, 1080 fiche). Tout est `border-box`, donc une page qui se padde elle-même plafonne à `calc(var(--app-content) + 2 * <son gutter>)` : ce qu'un lecteur compare d'une page à l'autre, c'est où le CONTENU commence, pas où la gouttière invisible commence. Seule exception, documentée dans son fichier : `/topics`, dont le cap est une SOMME (plafond de la liste + mesure de prose + gaps) et pas un goût.
- **Chrome** : `--app-topbar-height` (56), `--app-sidebar-width` (260) / `-collapsed` (56), `--app-right-panel-width` (460).
- **Z-index (centralisé)** : content 5, overlay 10, right-panel 15, modal-backdrop 50, modal 60, modal-stacked-backdrop 70, modal-stacked 71, admin 100.

⚠️ **Typo** : aucune taille/poids de police côté app — tout vient des text styles DS (`--sys-text-style-*`). Voir mémoire _ads-figma-text-styles_.

---

## 3. Patterns récurrents (classes/markup exacts)

### En-tête d'écran — LE MOTIF MAISON

Relevé sur le produit réel (Inbox, Drafts, Analytics, Employee Advocacy ×2). Il est le même partout, et c'est la référence pour tout nouvel écran.

```
┌ RANGÉE 1 · en-tête ──────────────────────────────────────────────────────┐
│ [avatar] Titre                          ⟶   [CTA] [secondaires] [⚙]     │
├ RANGÉE 2 · toolbar ──────────────────────────────────────────────────────┤
│ [Label│Valeur ▾] [Label│Valeur ▾] [⚲ Filters n]  ⟶  [🔍 Search] [Sort ▾] │
├ RANGÉE 3 · tabs ─────────────────────────────────────────────────────────┤
│  Vue A 11 │ Vue B                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Les invariants, avec leur nombre d'occurrences sur cinq surfaces produit :

- **Le cog va à droite, en dernier — À CONDITION que quelque chose ancre ce côté** (5/5 dans le produit). C'est un icon-button, pas un bouton libellé : une action rare ne prend pas le poids d'un contrôle qu'on utilise à chaque visite.

  ⚠️ **La condition est la partie qu'on oublie.** Dans le produit, la rangée qui porte le cog a toujours un ancrage — un titre de page à gauche, ou search et sort à droite d'une toolbar. Sur une rangée qui n'a ni l'un ni l'autre, « poussé à droite » ne produit pas un alignement, ça produit un bouton seul dans du vide : sur `/topics`, une fois la page alignée à gauche, le cog s'est retrouvé à ~700px du contrôle le plus proche, en face de rien.

  Dans ce cas, **le cog rejoint ce qu'il configure.** Celui de `/topics` règle l'écoute du Playbook sélectionné, donc il se colle au select qui le nomme (`gap` `xxxs` dedans contre `sm` entre groupes — l'espace dedans doit être plus petit que l'espace autour, sinon le groupe est une affirmation que rien ne soutient). Il repart à droite le jour où la rangée gagne un search ou un sort pour ancrer ce côté.

- ⚠️ **LA RANGÉE 1 EST DÉJÀ PRISE : c'est la topbar du shell.** Le produit ouvre bien sur une rangée de titre (5/5) — mais dans cette app `topbar.js` imprime le nom de la route pour **toute** route de premier niveau. Une page qui redessine son titre ne suit pas le motif, elle le double : `/topics` a imprimé « Topic Feed » 40px sous une topbar imprimant « Topic Feed », sur une rangée qui ne portait rien d'autre que le cog. Un titre seul ne fait pas une rangée.

  La règle qui tient : **la topbar nomme la route, et un écran ne dessine son propre titre que si la topbar le lui a CÉDÉ** — `/playbook/:id` et `/topics/settings`, où elle prend un contrôle de retour à la place — **ou si la rangée porte plus qu'un titre**. `/contexts` est la fausse exception : son en-tête porte un sous-titre chargé de données (« N Playbooks · applied across M chats »), une recherche et un CTA primaire, donc son titre est un élément sur quatre.

  Quand la rangée 1 revient au shell, **le cog descend en fin de rangée 2** — l'invariant est « dernier à droite », pas « sur la rangée du titre ».

- **Filters est un bouton LIBELLÉ**, funnel + le mot + son compteur **inline** quand il filtre (3/3). ⛔️ Jamais un icon-button avec un badge flottant : c'est le contrôle qui dit combien de la liste est caché, il ne peut pas être le plus dur à trouver.
- **Ce qui rétrécit la liste va à GAUCHE de la rangée 2** ; **search et sort vont à droite** (3/3). Si l'écran n'a pas encore de search, la droite reste vide — on ne la remplit pas pour équilibrer.
- **Un select de toolbar porte son label DEDANS**, via `.ap-select-inline-label` (4/5) : `Creator │ Select`, `Status │ Active`, `Playbook │ Acme · Q2 marketing`. ⛔️ Jamais un `<label>` empilé au-dessus — c'est du chrome de formulaire, pas de toolbar — et jamais un select nu, qui ne dit pas ce qu'il scope.
- **Deux vues nommées d'une même liste, avec compteurs → TABS** (3/3), pas un segmented control. On ne voit qu'une vue à la fois, ce qui est la définition des tabs. Markup : `.ap-tabs > .ap-tabs-nav > .ap-tabs-tab.active` + `.ap-counter normal blue|grey`.

Exemples en place : [`screens/topics.js`](../../src/screens/topics.js) (les trois rangées), [`screens/contexts.js`](../../src/screens/contexts.js) (rangée 1 avec search + CTA à droite), [`content-workspace.js`](../../src/components/content-workspace.js) (les tabs et leur compteur).

### Cartes + hover

⚠️ **RÈGLE CORRIGÉE (2026-08-27) : un `:hover` ne porte JAMAIS de fond bleu — seulement la bordure.** `chat.css` documentait l'inverse (« soft blue fill + a light blue border ») et c'est ce qui a été recalé : un sol teinté au survol se lit comme un **état sélectionné**.

⚠️ **PRÉCISÉE DEPUIS, sur `.topic-card--feed`, en reprenant `ap-mini-post`** (la vraie carte du feed Listening, `conversation/commons/frontend/libs/ui`) : **le lavis bleu disparaît complètement**, et les deux états se distinguent par la **force de la bordure**, pas par un fond.

- `:hover` → `border-color: --ref-color-electric-blue-40` (« tu pointes ceci »)
- `.is-reading` → `border-color: --ref-color-electric-blue-100`, fond **blanc** (« celui-ci est ouvert »)
- `.is-triaged` → fond `--ref-color-grey-05`, le traitement `--seen` du produit — donc le SOL porte l'axe lu/non-lu, et la bordure porte l'axe pointé/ouvert. **Un dispositif par question.** ⚠️ Un vrai axe `seen` séparé a existé un commit puis a été retiré ; en son absence, « décidé » est ce que ce feed a de plus proche de « lu ».
- L'ordre compte : `.is-reading` passe après `.is-triaged`, donc une carte triée et ouverte revient au blanc, exactement comme `--selected` écrase `--seen` dans la source.
- Avant : le survol ET l'ouvert partageaient `electric-blue-100`, et seul le lavis les séparait — or ce lavis serait devenu un troisième sol dans une liste qui a maintenant grey-05 pour les triées.

Appliqué sur `.topic-card--feed` / `--picker`. ⚠️ **Pas encore balayé ailleurs** : `.drafts-card:hover` fait toujours fill + bordure, et la phrase de `chat.css` est toujours dans le CSS. À traiter quand la question reviendra, surface par surface.

- `.drafts-card:hover` → `border-color: --ref-color-electric-blue-20` + `background: --ref-color-electric-blue-05`. Actif = `.is-active` (electric-blue-40).
- `.top-post-card:hover`, `.clip-card` sélectionné → `border-color: --ref-color-electric-blue-100`.
- Radius carte = `--app-radius-card` (12). Tuiles icône AI/brand = fond `--ref-color-orange-10` + glyphe orange.
- ⛔️ **Jamais de liseré d'accent coloré sur un bord de carte** (`border-left: 3px solid …`). Règle catégorique de Matt. **L'état d'une carte va dans son contenu, pas sur son cadre** — un marqueur explicite (point + mot, ex. « • New ») dit la même chose sans repeindre la bordure. Un seul cas existait dans l'app (unseen sur `.topic-card`) et il a été retiré ; les `border-left`/`border-right` restants sont des séparateurs de panneau 1px dans la ramp sombre video-clips, pas des accents.
- Cartes in-bubble : `.chat-bubble-card` (grey-05, border grey-10) via `bulletsBlock()` (`_analyse-common.js`).
- **Une carte qui vit sur plusieurs surfaces prend son propre fichier** — [`components/topic-card.css`](../../styles/components/topic-card.css) : la carte Topic rend dans le feed, dans le picker et — en version ligne — dans la la front page et le rail du hero. Trois tailles, **les mêmes hooks `data-*`**, donc un écran les câble une fois.
- **Dans une grille de cartes, `grid-auto-rows: 1fr`** (+ `flex: 1 1 auto` sur le corps) : les cartes d'une même rangée finissent à la même hauteur et leurs pieds s'alignent. Une grille de hauteurs inégales est la moitié de la scannabilité en moins. Une **une** peut casser la règle — mais alors elle est seule à le faire, et exprès.
- **Un composant qui vit dans deux hôtes sort deux variantes, et sa règle de base ne porte AUCUN cadre.** `topic-card` rend une carte dans le feed (`--feed`, qui peut être celle qui est ouverte à côté de la liste) et une carte dans la dialog du picker (`--picker`, où un clic choisit, donc rien ne reste sélectionné). Toute déclaration de cadre — `background`, `border`, `border-radius`, et les états qui les teintent — vit sur la variante, jamais sur la base : une `border` partagée est ce qui a fait fuir le cadre d'une variante dans l'autre. Le test qui le prouve est d'ouvrir le picker après avoir touché au feed.
- **⛔️ Le cadre appartient aux OBJETS, jamais à la colonne qui les liste.** Essayé et retiré sur `/topics` : pour casser un effet « mur de cartes », le cadre est passé des cartes à la rangée qui les contenait, avec un filet entre la liste et le volet. Le mur venait des **gaps et du poids**, pas des bords — et une surface unique de 1440px se lit comme une dalle qui n'appartient à aucune autre vue de l'app. Si une liste pèse trop : resserrer les gaps, alléger la graisse, clamper le texte. Pas déshabiller les items.
- **Sur une vraie ligne, l'état est un REMPLISSAGE ; sur une carte, une bordure.** `.topic-row` (la liste in-chat) est le seul vrai cas de ligne du proto : pas de cadre à teinter, donc l'état va au fond. Une carte suit la convention de l'app — lavis + bordure bleu clair au survol, bordure raffermie quand elle est ouverte. Dans les deux cas, ⛔️ jamais de bordure gauche colorée, qui est la tentation de tout master–detail.
- **Le lu / non-lu se lit à la graisse.** Dans une file à trier, l'élément qui attend encore une réponse garde la graisse pleine et ceux qui ont été traités reculent d'un cran. La graisse **seulement** : l'encre ne change pas.
- **Une carte qui doit changer de mise en page selon la place qu'elle a reçue** se déclare `container-type: inline-size` et utilise une **`@container` query**, pas une media query : sidebar repliable + panneau de droite qui overlay, la largeur du viewport ne dit jamais la largeur du contenu. Cas en place : `.topic-card--lead` (une colonne → deux au-delà de 720px), et la grille de `/topics/settings`.

### Boutons / CTAs

DS `.ap-button` avec `primary|stroked|ghost` × `orange|blue`. Icon = `.ap-icon-button` (souvent `transparent`). Lien-bouton = `button.ap-link` (patché). Danger = `.ap-button.danger`. **Jamais full-width** (voir mémoire _buttons-never-full-width_).

### Selects (`.ap-select`)

`<details class="ap-select">` + `summary.ap-select-trigger` + `.ap-select-dropdown > .ap-select-options > .ap-select-option`. **Dans une toolbar, le label va DEDANS** : `<span class="ap-select-inline-label">Playbook</span>` en tête du trigger, avant le `.ap-select-value` — le DS dessine le séparateur vertical. Voir § En-tête d'écran. Options peuvent porter `.ap-select-option-caption` (2ᵉ ligne) et `.ap-select-option-check`. **Jamais un `<select>` natif** (mémoire _use-ds-dropdowns_). Depuis le picker de Playbook de `/topics`, la dalle de recherche du DS est aussi utilisée : `.ap-select-search` > `.ap-select-search-icon` + `.ap-select-search-input`, avec `.ap-select-not-found`. ⚠️ `.ap-select-not-found` porte `display: flex` → il bat `[hidden]` ; masquer en `style.display` inline.

### Surfaces « settings »

Le DS ship une **recette de page de réglages** et des tokens `--sys-settings-*` dédiés. Sur une telle surface les guidelines sont explicites : utiliser cette famille et **pas** les `--ref-spacing-*` / `--ref-color-grey-bg` génériques **pour la coquille et les cartes** (les gaps intra-composant restent sur `--ref-spacing-*`, comme dans l'exemple de la recette).

| Usage                         | Token                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fond de page                  | `--sys-settings-content-background-color`                                                                  |
| Padding externe du contenu    | `--sys-settings-content-internal-margin` (24)                                                              |
| Gap entre cartes              | `--sys-settings-content-vertical-spacing` (16)                                                             |
| Largeur max — formulaire      | `--sys-settings-content-max-width-md` (**700**)                                                            |
| Largeur max — table/dashboard | `--sys-settings-content-max-width-lg` (1200)                                                               |
| Carte                         | `--sys-settings-card-background-color` / `-border-color` / `-border-radius` (8) / `-internal-padding` (16) |

Markup : une colonne de `.ap-card` (+ classe locale portant les tokens ci-dessus — **ne jamais surcharger `.ap-card`**), titres en `.ap-card-title`, en-tête `h1` + `p.ap-body`. Save bar optionnelle et **inutile quand tout commit immédiatement**.

Première utilisation de la moitié layout de cette famille : [`topics-settings.css`](../../styles/screens/topics-settings.css) (`/topics/settings`, les réglages du Topic Feed). Seul `--sys-settings-card-feature-lock-border-color` était déjà employé, dans `ds-patches` pour l'infobox feature-lock.

Trois écarts assumés à la recette, appris en construisant cette page :

- **Titre de page en `.ap-h1` (24px), pas `.ap-h2` (18px).** À 18 le titre de page n'est qu'à 2px des `.ap-card-title` (16) et la hiérarchie se lit plate. 24 → 16 → label de groupe en `.ap-caption-bold` (12) donne trois marches lisibles, et 24 est déjà la taille des titres des autres pages de l'app.
- **Ne pas donner une carte à un contrôle isolé.** Un `.ap-card-title` au-dessus d'un unique `.ap-select` est surtout du padding, et deux boîtes comme ça enchaînées font une page qui a l'air vide. Les contrôles de **niveau page** (le scope, un rythme) vont dans une **barre de `.ap-form-field`** (label au-dessus du contrôle, classe DS existante qui style son `> label` direct) ; les cartes sont réservées à ce qui a du contenu.
- **`-max-width-lg` (1200) n'est pas réservé aux tables.** Une galerie de cartes de config y a droit aussi : à 700, deux colonnes sont serrées et une colonne donne des bandes larges et courtes qui relisent comme des lignes. Corollaire : plafonner la prose (72ch) indépendamment de la grille, et faire tomber la grille à une colonne avec une **`@container` query** — dans une app à sidebar repliable, la largeur du viewport ne dit pas la largeur du contenu.

### Filtres — chips, selects ou dropdown ?

**Règle du DS** (`choosing-components.md` › Filtering) : bascules **toujours visibles** → _filter chips list_ ; **options groupées / presets / une étape d'apply derrière un déclencheur** → _filter dropdown_.

⚠️ Les deux composants DS (`<ap-filter-chips-list>`, `<ap-filter-dropdown>`) sont **Angular-only** — aucune couche CSS-UI. Équivalents en prototype :

| Intention DS      | En CSS-UI ici                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| Filter chips list | `.ap-filter-chip` (patché dans `ds-patches.css`, « en route vers le DS »)        |
| Filter dropdown   | `.ap-selection-dropdown` (search · `-group` · `-item` · `-selected` · `-footer`) |

**Troisième cas :** quand chaque facette prend **une seule** valeur et s'applique **immédiatement**, ni l'un ni l'autre — **un `.ap-select` par facette**, avec `.ap-select-inline-label` pour nommer la facette dans le déclencheur et `.ap-select-option-badge` pour le compteur. Un select **montre sa sélection fermé** ; un déclencheur « Filters (2) » oblige à l'ouvrir pour savoir. Le _Filters dropdown_ du DS (V2 Molecules, panneau 420px checkboxes + Clear/Apply) reste le bon choix dès qu'on **compose un jeu multi-valeurs et qu'on l'applique en un coup**. Précédent en place : la toolbar Period / Sort du board top-posts.

**Mais la taille du set tranche avant tout le reste**, et le Topic Feed est passé d'un côté à l'autre de cette règle :

| Facette      | Set                          | Composant                          | Pourquoi                                                                                                                                            |
| ------------ | ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**   | **6, figées** (le catalogue) | `.ap-filter-chip` (`aria-pressed`) | Petit set plat et connu = la règle DS du _filter chips list_. Ce sont les **rubriques** de la page : on clique entre elles, on n'ouvre pas un menu. |
| **Playbook** | **grandit avec le compte**   | `.ap-select`                       | Une puce par Playbook ne survit pas à vingt. Un select oui.                                                                                         |

C'était **deux selects** tant que la page était une liste filtrée ; passer la facette bornée en puces est ce qui l'a rendue _browsable_. Le compteur va dans `.ap-filter-chip-count`, et un compteur à zéro pose l'attribut `disabled` (que le patch style déjà) **sauf** si c'est la sélection courante — sinon on ne pourrait plus en sortir. Corollaire de layout : sept puces remplissent une mesure de 1160, donc le select voisin **ne tient pas** sur la même ligne — il est monté dans le head de la page, à côté des autres contrôles de niveau page.

### Filter chips

`.ap-filter-chip` piloté par `aria-pressed`, `-count` optionnel. Les slots `-icon` / `-avatar` ont été écrits puis jamais utilisés — ils sont partis avec la passe de CSS mort ; les remettre est un `git revert`, pas une réinvention. Partout : connectors-view, playbook-view, ideas, image-studio (bascule Image/In feed), right-panel, feedback-control, schedule-modal.

### Status pills

DS `.ap-status` + `blue|green|grey|mermaid` (mermaid patché). Les états de travail in-conversation utilisent `mermaid` (butter + dot olive).

### Quickpicker (inline-question)

Le « pick one of N » réutilisable. État dans [`inline-question.js`](../../src/inline-question.js), rendu par `renderPicker()` dans [`_analyse-common.js`](../../src/screens/_analyse-common.js) sous le chrome `session__assistant--wizard`. Modes : rows numérotées, `variant:"cards"`, `multi`, `single`, `stepper`, free-text, file. **Le CTA submit est bleu** (pas l'orange AI) — mémoire _quickpicker-primary-is-blue_ + _quickpicker-secondary-button-tiers_. Contrôles = vrai radio DS, fade-to-bg gris — mémoire _ds-controls-and-fade-bg_.

### Panneau de droite

`.app-right-panel` (blanc, `border-left`), `__resize` (strip 6px, electric-blue au hover, largeur calculée par formule — non persistée, l'ancienne clé `archie-rpanel-width` est wipée au boot), `__close`, `__body` (`container-type: inline-size`), `__empty*`.

### Toasts

[`toast.js`](../../src/components/toast.js) wrap `.ap-snackbar-thread` / `.ap-snackbar` (+ `.success`/`.error`, `.animate-in/-out`). Queue app (`MAX_VISIBLE=3`), dwell 3200 ms (pause au hover), Undo optionnel (`.ap-link`). Région `#toastRegion`.

### Empty states

`renderEmptyState()` ([`empty-state.js`](../../src/components/empty-state.js)) : `.session__empty` > icône `.lg` > `h3.text-subtitle` > `p.muted` > `.session__empty-action`. Variante panneau : `.app-right-panel__empty`.

### Fente média vide (draft sans image) — une vraie dropzone

`.posts__card-media-empty` ([`post-card.js`](../../src/components/post-card.js) `renderEmptyMedia`,
CSS dans [`posts.css`](../../styles/screens/posts.css)) : `-slot[data-post-drop]` > `-tile` +
`-title` + `-sub` + `-actions`, puis `-hint` **hors** du cadre.
États : `.is-dragover`, `.is-generating`.

Quatre strates, chacune nettement au-dessus de la suivante : pastille neutre → titre `h3` →
sous-titre `body` en encre light → **un** bouton mermaid → **l'Image Studio sur sa propre ligne**.
Le drag/drop est câblé dans [`right-panel.js`](../../src/components/right-panel.js) ;
`.is-dragover` reprend le bleu électrique de `.ap-dropzone`.

- **Le contrôle unique est `.ap-button.mermaid`** — le traitement IA du DS, demandé nommément sur
  cette fente. C'est une **bordure dégradée**, donc un poids de contour et non un bouton plein :
  le DS ne livre aucun bouton IA plein. C'est précisément ce qui rend la règle suivante vitale.
  ⚠️ Historique : `.primary.orange`, puis `.primary.blue`, maintenant `mermaid`.
  **Ne « restaurer » ni l'un ni l'autre** — le bleu se battait en plus avec le lien bleu à côté et
  avec la teinte bleue du dragover.
- ⚠️ **JAMAIS un second bouton à côté.** Deux rectangles en contour se lisent comme une paire
  d'égaux quels que soient les libellés — l'erreur commise **deux fois** ici quand le bouton
  mermaid côtoyait un `stroked grey`. L'échelle maison est écrite dans
  [`_analyse-common.js:394`](../../src/screens/_analyse-common.js) :
  `primary` → `stroked grey` → `ghost grey` (+ `.ap-link` en 4ᵉ).
- **L'Image Studio tient sa visibilité d'une LIGNE À LUI + une phrase**, pas d'un poids.
  En `.ap-link` collé au bouton il était invisible : à côté d'un rectangle, l'œil prend le
  rectangle et s'arrête — aucune taille de lien n'aurait corrigé ça. Il est donc passé en dessous,
  dans `.posts__card-media-empty-studio` (taille **body**, pas caption : c'est la seconde des deux
  routes, pas une note de bas de page), et la phrase dit ce qu'on y gagne (« set the type, style
  and format ») parce qu'un nom de produit nu ne donne aucune raison de cliquer.
- ⚠️ **`.ap-button.mermaid` sur un fond teinté** : le DS peint son intérieur en `white` en dur, donc
  au survol / dragover de la fente il se découpait en blanc dans la teinte. Les deux états lui
  passent leur propre fond via `--ap-mermaid-inner` (hook `ds-patches.css`). Survoler le **bouton**
  l'emporte toujours : le `:hover::after` du DS est plus spécifique.
- **Toute la zone est cliquable** (`right-panel.js` → file picker), d'où `cursor: pointer` et un
  hover. Un bloc intitulé « Upload an image », en pointillé comme toutes les dropzones de l'app,
  qui ne ferait rien au clic serait la même promesse cassée que le pointillé sans drop.
  Le garde-fou : tout clic qui atterrit sur un vrai contrôle (Generate, Image Studio) est ignoré.
  Pas de `role`/`tabindex` sur la zone en revanche — elle contient de vrais boutons, et un
  interactif imbriqué doublerait un arrêt de tabulation ; **le clavier passe par le rail**.
- **Un seul accent par bloc.** La pastille reste grise et ne reprend pas l'orange de
  `.drafts-card__icon` : un second accent diviserait la gravité que le dégradé mermaid doit tenir.
- **Pas de fond au repos.** Le pointillé seul dit « dépose un fichier ici » ; une teinte par-dessus
  était un second signal faible en concurrence avec le premier. Hover et dragover remplissent
  toujours, dans la gradation de `.ap-dropzone` (**05 au survol, 10 quand un fichier est dessus**) :
  ce sont des retours transitoires, pas de la décoration au repos.
- **Une hauteur unique (254px)** posée sur le `-slot`, pour que le cadre soit identique au repos, en
  dragover et en génération. C'est de l'**arithmétique**, pas un chiffre rond : 48 padding + 60
  pastille + 24 titre + 22 sous-titre + 16 + 36 bouton + 12 + 36 ligne studio. Le sous-titre a été
  raccourci à « Drop it here or browse. » **exprès** pour qu'il ne puisse jamais passer à deux
  lignes — sinon le repos dépasse le pin et le cadre resaute. Si le contenu grandit, refaire
  l'addition. Volontairement **pas** d'`aspect-ratio`.
- **L'upload n'est pas dans la fente** : ce serait une troisième action dans la même rangée, ce qui
  a aplati la hiérarchie à chaque tentative. Il vit dans le rail de la carte — seul endroit où il
  fonctionne aussi quand le draft **a** une image, et seule route clavier vers un fichier (le
  glisser-déposer ne peut pas être l'unique entrée).
- ⚠️ **`bindDropzone` est inutilisable ici** : son handler de clic déclenche l'input fichier pour
  **tout** clic dans la zone — appuyer sur Generate ouvrirait un file picker.
- ⚠️ **`ap-icon-missing-image` est inutilisable** : seul icône du DS dont le SVG porte un `clipPath`
  avec un `<rect />` sans dimensions, qui découpe tout le glyphe. D'où `ap-icon-image`.
- ⚠️ Ne pas renommer la classe racine `.posts__card-media-empty` :
  [`image-studio-v2.css`](../../styles/screens/image-studio-v2.css) la masque dans les previews du
  studio. Et `[data-post-drop]` doit rester sur l'élément qui porte `-slot`.

### Modals / backdrop

DS `.ap-dialog` centré par `modals.css` sur `.open`. `.app-modal-backdrop` patché (fade via `@keyframes app-modal-backdrop-fade`). Radius `--app-radius-modal` (16). Modals empilés → couches `--app-z-modal-stacked*`.

**Un nouveau modal doit être ajouté aux DEUX listes de sélecteurs de [`modals.css`](../../styles/screens/modals.css)** (la coquille centrée, et la variante `.open` qui passe `display: none` → `flex`). Sinon il reste invisible avec un backdrop actif. Corollaire : ne pas redéclarer `display` sur la classe du modal dans une feuille chargée **après** `modals.css`.

Échelle de largeurs, toutes en `width: min(calc(100% - 32px), Npx)` :

| Largeur | Modals                            | Pourquoi                                                                                                                                                                                                |
| ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 440     | rename                            | un seul champ                                                                                                                                                                                           |
| 560     | bug report, chat picker, search   | une liste courte ou un formulaire                                                                                                                                                                       |
| 640     | feedback, add source              | formulaire + onglets                                                                                                                                                                                    |
| **720** | **topic** (l'article + le picker) | **lecture longue** — de la prose ; au-delà, la mesure décroche. Même largeur dans les deux vues : une dialog qui se redimensionne entre choisir et lire fait passer les deux pour des écrans différents |
| 920     | connectors                        | une gallery à parcourir                                                                                                                                                                                 |
| 960     | schedule                          | deux colonnes                                                                                                                                                                                           |

Les modals hauts plafonnent leur hauteur (`max-height: min(calc(100vh - 48px), 760px)`) et font défiler leur `.ap-dialog-content`, avec un footer d'actions collant : la décision doit rester atteignable quelle que soit la longueur du contenu.

---

## 3bis. Insights — ce qui vient de la plateforme, et ce qui n'existe pas là-bas

La page Insights est la seule surface du proto qui a un **équivalent en production** : la
tribu `analytics` du monorepo (`~/code/platform`) ship une bibliothèque partagée
(`analytics/commons/frontend/libs/analytics/ui`) dont Reports et ROI sont faits. Audit du
2026-09-11, et ce que le proto en a reprisic :

| Le proto                                    | La source en prod                                                                                                                         | Repris ?                                                                                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ins-content` (mesure de page)            | `.report-content-view` — `max-width: 1200px` centré (`analytics.scss`)                                                                    | ❌ **annulé le 2026-09-11** : `var(--app-content)` = **1080**, la mesure de l'app (§2). Dans CETTE app, une page 120px plus large que toutes les autres se lit comme une autre app, et on arrive sur Insights depuis la fiche, pas depuis Reports |
| `--ins-display-xl` (gros numéral)           | `.main-data` — **38px** bold grey-100. Les deux autres numéraux de prod : 24px sur une overview-card, 64px sur une tuile de widget pleine | ✅ 38px                                                                                                                                                                                                                                           |
| `.ins-section` (châssis de section)         | `[analytics-section]` — grey-10, radius 8, `.section-content{padding:md;gap:md}`, `.title-wrapper`, `.button-wrapper`                     | ✅ composé **avec** `.ap-card`, dont le cadre est déjà identique (même bordure, `--ref-border-radius-md` = 8px) : seule la respiration passe de `sm` à `md`                                                                                       |
| thème Highcharts (`charts.js` `applyTheme`) | `ChartOptions.DEFAULT_OPTIONS` de **`@agorapulse/ui-charts` v22**                                                                         | ✅ tooltip **blanc** 4px sans bordure + son ombre (c'était une bulle d'encre sombre), grille et lignes d'axe grey-10, labels grey-85 12px, `allowDecimals:false`, `inactive.opacity 0.2`, `hover.brightness 0`                                    |
| `lineWidth` du spline                       | `ChartSplineOptions` — **4**                                                                                                              | ✅ sur le plein format ; **2** en `compact` (4 sur une courbe de carte à 104px est un ruban, et la prod n'a pas de graphe si petit à copier)                                                                                                      |
| `--app-chart-data-*`                        | `ChartColors.DATA_COLORS` — 10 teintes, ordre fixe, lues par position (`getDataColor(n)`)                                                 | ✅ remplacent une rampe maison (electric blue / purple / menthol…), que le paquet déclare **dépréciée**                                                                                                                                           |
| `--app-chart-on-track` / `-off-track`       | `SENTIMENT_COLORS.positive` `#45B854` / `negative` = `LIMIT_COLOR` `#E81313`                                                              | ✅ coïncidaient **déjà**                                                                                                                                                                                                                          |
| `trendGlyph`                                | la variation d'`analytics-overview-card` : glyphes `data-increase`/`-decrease`/`-stagnate`, `+X%`, vert **seulement si positif**          | ✅ coïncidait **déjà**                                                                                                                                                                                                                            |

Ce qui n'a **pas** été repris, et pourquoi :

- **`--app-chart-target` reste grey-80**, pas `LIMIT_COLOR`. Une _limite_ est une ligne
  qu'on ne doit pas franchir — la prod la peint en rouge parce que la franchir EST
  l'alarme. Une _cible_ est une ligne qu'on essaie d'atteindre, et une cible rouge
  au-dessus d'une courbe verte se lit comme un échec avant l'échec.
- **L'anatomie d'`ap-analytics-overview-card`** (footer métrique secondaire + lien « See
  section », tooltip info sur le titre) — pas demandée dans cette passe. Ce que la carte
  d'objectif en partage déjà : la bordure grey-10, et **bordure bleue + titre bleu au
  survol**, qui sont exactement le hover de la prod.
- **Le CTA orange** de `analytics-section-no-data` : « New objective » est un CTA de page
  de liste, donc **bleu** ici par la convention du repo (§5), et l'orange est réservé à
  l'IA. Le mettre en orange donnerait deux couleurs à la même action sur un écran.
- **Le paquet `@agorapulse/ui-charts` n'est pas ajouté** aux dépendances : ce sont des
  composants Angular (`ap-chart-spline`…), inutilisables depuis du CSS-UI. Ses valeurs
  sont **mirroitées** avec la référence en commentaire, pas importées.

### La fiche objectif = un en-tête de page + UN report card PAR MESURE

Deuxième source, celle du **design** : le fichier Figma `Analytics - Shared components`
(`1ZSobtunR472OmSX7usn8M`), page `🚧 UI`, qui tient la plupart des composants d'Analytics.
Le composant qui répond à « comment Analytics montre une métrique et ce qu'il y a derrière »
est `Card / Report card (to detach)` — et c'est ainsi qu'une page Reports est faite : un
en-tête qui nomme son sujet, puis **une pile de report cards, une par métrique**.

La fiche suit ça depuis le 2026-09-11 : `Brand awareness` est le **titre de la page**
(en-tête dans `.insights__band` : h1 + verdict, provenance · fenêtre · N measures, les deux
verbes), et `Reach` et `Brand mentions` sont **deux blocs autonomes** en dessous.

| Nœud Figma                               | Ce que la fiche en fait                                                                                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card / Report card` `1070:7477`         | `readMeasures()` → une `.ap-card` **par mesure** : bandeau gris puis corps blanc                                                                                                                                                                   |
| `Card / Title+synthesis` `1069:7931`     | le bandeau de chaque bloc : le nom de la métrique au rung **h3** (l'objectif possède h1, un rung au-dessus), sa portée dans le créneau « description », sa pastille d'état à côté du nom                                                           |
| son cadre `Synthesis`                    | `.ins-read__synth` : encart **blanc** dans le gris, padding 16, cellules label-au-dessus-valeur, filet 1px × 40 avec 24 de part et d'autre. Ici : `Progress` (38px), `Current`, `Target`, `Variation`                                              |
| `Card / Key metrics` `432:6310`          | emprunt assumé pour la cellule de tête : sa `Value` est un gros chiffre, la synthèse du report card est à 14px bold                                                                                                                                |
| `KPI / Percentage-variation` `220:25560` | la cellule `Variation` (`trendGlyph`) — coïncidait déjà                                                                                                                                                                                            |
| `Table / Simple` `1070:6792`             | **plus utilisée sur la fiche** : la table des measures a disparu avec le sélecteur (voir ci-dessous). Reste la référence pour toute table d'Analytics : `.left cols` + n × `.right cols` de largeur égale, que des chiffres, aucune forme dessinée |

Ce que ce découpage **supprime**, et c'est son intérêt : la table à cinq colonnes, son
compteur, et le **sélecteur de mesure**. Trois versions ont été dessinées pour décider où le
poser (une bande d'onglets DS au-dessus du graphe, puis des lignes au-dessus, puis des
lignes en dessous — recalées) ; la réponse était qu'une page à deux mesures n'en a pas
besoin, puisque chaque courbe peut être à l'écran en même temps. Cockpit garde la table et
les onglets : c'est la référence non modifiée.

Divergences volontaires avec le composant prod, écrites pour ne pas être « corrigées » :

- **Pas de sous-titre au-dessus du graphe.** Prod écrit `Engagement overview` sous
  `Engagement` : c'est prod qui nomme deux fois la même métrique. Le bandeau du bloc dit
  déjà `Reach` quarante pixels au-dessus du tracé.
- **La pastille d'état est à côté du nom**, pas à l'extrémité droite du bandeau où prod
  tient `Download chart` : ce créneau est dimensionné pour un bouton de 36px, et une
  pastille de 20px seule au bout d'une ligne de 1150px n'appartient visuellement à rien.
- **Pas de ligne de total** (prod ferme sa table sur un `Total engagement` en gras) : deux
  mesures d'unités différentes ne s'additionnent pas, et l'avancement d'un objectif n'est
  pas la somme de celui de ses mesures.
- **Filets en grey-20** (`--app-border`), pas `--sys-border-color-default` qui résout en
  grey-10 : règle maison pour tout filet écrit par nous, même si les composants existants
  sont en grey-10.

⚠️ **Deux choses n'ont aucun ancêtre en prod** : l'anneau de progression (`ringSvg`) et le
vocabulaire on-track / at-risk / off-track. La plateforme ne ship **aucun** widget
d'objectif — ROI fait des tables « key performance », pas des cibles — et sa seule barre de
progression est un `mat-progress-bar` (Angular) au langage de **quota** (piste
`electric-blue-10`), pas de cible. Ne pas chercher à les aligner sur quelque chose : il n'y
a rien.

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
- **Orange (AI / generate / commit)** : Send composer, Batch/Clip studio Generate, Regenerate, Save recap, Generate-image, add-source Import/Add-URL/Add-text, welcome « Save and continue », Image Studio « Use this image », tuiles icône AI (`--ref-color-orange-10` + glyphe orange).
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

**Keyframes par fichier** : `modals.css` (backdrop-fade, fade-in, success-pop, gen-shimmer), `session.css` (empty-rise, assistant-notice-pulse, composer-status-in/-out, thread-skeleton-shimmer), `dashboard.css` (source-card-processing-pulse), `posts.css` (word-fade-in), `clip-studio.css` (pulse/spin/shimmer/fill/stage), `welcome.css` (recap-loading), `schedule-modal.css` (spin), `topics.css` (topics-ghost-shimmer).

**Squelette (ghost loading) plutôt que spinner, dès que la forme de ce qui arrive est connue.** Un spinner dit « ça charge » ; un squelette dit « voilà ce qui arrive, et où ». Le gradient est toujours le même — `grey-05 → grey-10 → grey-05`, `background-size: 200% 100%`, shimmer de 1,4s linéaire infini, avec un **stagger** par élément sinon la pile pulse comme un seul bloc. Consommateurs : `.thread-skeleton` (bascule de conversation), `.topic-ghost` (`/topics` pendant le scan), `.gen-image-skeleton`.

⚠️ **Deux règles, apprises sur `/topics`.** (1) Le squelette doit être dans **les vrais cadres, aux vraies largeurs** — sinon la mise en page saute au moment du rendu, ce qui est exactement ce qu'il devait empêcher. Là-bas ça voulait dire garder le split à deux colonnes pendant l'attente au lieu de basculer sur un bloc pleine largeur. (2) Il ne **devine pas** un compte : cinq cartes fixes, parce que le nombre est inconnu pendant le scan et qu'un squelette qui annonce huit puis en rend trois a menti. Un état d'impasse (rien trouvé, filtre qui exclut tout) n'a rien à pré-dessiner et reste un état plein, pas un squelette.

**Le loader (source unique)** : [`archie-loader.js`](../../src/archie-loader.js) + `styles/components/archie-loader.css`. Toutes les classes spinner (`.archie-loader`, `.ap-loader` + tailles, ~10 `*-spinner`) rendent **le même mark** : `initArchieLoader()` sweep le DOM + `MutationObserver` injecte `LOADER_SVG` (7 carrés arrondis en scale, stagger 0→0.686s) avec un `__MASKID__` unique. CSS possède la box (`--archie-loader-size`, `aspect-ratio 227.15/170.03`, `color: --archie-loader-color` défaut `--ref-color-orange-100`, `currentColor` blanc sur CTAs pleins). Inline SVG obligatoire (SMIL gèle en background/mask).

⚠️ **Toujours dimensionner par `--archie-loader-size`, jamais par `width` + `height`.** La variable est la **largeur** de la boîte ; la hauteur vient de l'`aspect-ratio` du viewBox. Fixer les deux neutralise l'`aspect-ratio` et écrase le glyphe en carré (c'était le cas du loader de prompt de l'Image Studio, à `28px × 28px`).

⚠️ **Une barre d'outils flottante n'est pas une pill.** Les mini-toolbars de l'Image Studio (texte sélectionné, boîte de crop) étaient en `--app-radius-pill` : à 999px l'arc du coin passe **en travers** des contrôles des deux bouts — la pastille de couleur à gauche, l'`.ap-icon-button` à droite — et les rogne. Elles sont en `--app-radius-lg` (8px), qui vaut aussi `--comp-icon-button-border-radius` : le coin du conteneur est alors **concentrique** avec les boutons qu'il tient (4px de padding autour d'un coin de 4px = 8px). La pill reste juste pour ce qui n'a **pas** de contrôle sur ses bords : segmented view toggle, badge, pastille de position.

⚠️ **`.gen-loading-mark` est le mark 88px du _stage_** (l'état vide du canvas), pas un « loader d'image » générique. Le composer de l'Image Studio le portait, ce qui mettait un glyphe de 88px dans un champ de 36px : il débordait de la carte et poussait le texte sur le côté. Un loader **inline** ne porte que `.gen-image-spinner` (20px par défaut). Et un loader qui remplace un champ doit prendre la **largeur du champ** (`flex: 1`) — centrer dans une boîte shrink-to-fit revient exactement à aligner à gauche.

---

## Voir aussi

- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — workflow DS obligatoire + MCP `ds-css` + anti-patterns
- [`FEATURES.md`](FEATURES.md) — où ces patterns sont utilisés (par feature)
- [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md) — formules de tailles sidebar / panel / status-card
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
