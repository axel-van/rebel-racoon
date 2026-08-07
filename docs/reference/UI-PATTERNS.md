# UI patterns — usage concret du Design System

> Ce que le proto **rend réellement** : classes `.ap-*` utilisées, tokens app, primitives patchées, patterns récurrents, loaders, convention couleur en pratique.
>
> Complète [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) (le _workflow obligatoire_ : MCP, ordre des vérifications, anti-patterns). Ici on documente le _résultat_ : comment le DS est câblé dans l'app.

Tokens DS = `--ref-*` / `--sys-*` / `--comp-*`. Tokens app = `--app-*`. Les templates passent par `html`` / `raw()` ([`utils.js`](../../src/utils.js)) — escape par défaut, `raw()`opt-out, arrays`.join("")`, `null`/`false` → vide.

---

## 1. `styles/ds-patches.css` — l'inventaire des « trous du DS »

Seul endroit légitime pour toucher `.ap-*`. Charte du fichier : _« the only legitimate place to extend `.ap-*` classes… should shrink as the DS evolves »_.

| Sélecteur                                               | Raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-modal-backdrop`                                   | Le DS ne fournit pas de backdrop plein-viewport. `inset:0`, `--app-modal-backdrop`, `--app-z-modal-backdrop`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.ap-status.mermaid` (+ `::before`)                     | `.ap-status` DS n'a pas de variante mermaid. Pills de travail in-conversation (Drafting / Extracting / Extracted-N / Analyzing). Teinte `--app-butter`, dot olive `--app-butter-accent`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `.ap-icon-archie-official`                              | Le glyphe logotype « A » d'Archie, mask-based (`-webkit-mask-image` data-URI). Hors liste d'icônes DS générée. Peint en `currentColor`. C'est **l'avatar AI**, distinct de `.ap-icon-sparkles`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `.ap-status-card` (+ variantes)                         | Le DS a les tokens `--comp-status-card-*` mais pas de classe CSS-UI. Recrée la primitive (miroir `libs/ui-components/status-card`). Container-query masque l'icône < 130px. Modifiers en `.tagOrange` (pas `.tag-orange`).                                                                                                                                                                                                                                                                                                                                                                                          |
| `.ap-button.danger` (+ `.stroked.danger`)               | Le DS n'a pas de variante danger. Synthétisée depuis la palette rouge. Utilisée par `confirm-modal` en `danger=true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `.ap-infobox.feature-lock`                              | Intent violet « limit reached / upgrade » (les infobox DS n'ont que info/warning/error/success).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `.ap-infobox.main`                                      | Variante orange. Le DS n'a que info/warning/error/success — tous sous-évaluent une notice qui n'est ni une mise en garde ni un aparté neutre. `warning` refusé : bon ton, mauvaise raison. **Alignée sur `.topics-card__whynow`** : fond `--app-peach`, filet `--app-archie-orange`, icône `--app-archie-orange-deep` (orange-sur-peach = version deep, contraste). Titre `--app-convo-navy` + message `--sys-text-color-light` : le DS peint les deux en `grey-100` (#344563), qui ne correspond à rien dans l'app et aplatit titre et prose sur un seul ton. Taille/graisse laissées aux `--comp-infobox-text-*`. |
| `.ap-infobox-content > .ap-button`                      | L'infobox écrase son propre bouton : `-texts` est `width:100%`, donc en ligne (≥560px) le bouton cède son padding (mesuré 150px rendu / 181px naturel). `flex-shrink:0` dessus, `min-width:0` sur `-texts` — c'est le texte qui doit céder.                                                                                                                                                                                                                                                                                                                                                                         |
| `button.ap-link`                                        | `.ap-link` DS suppose un `<a>` ; reset le chrome UA d'un `<button>` stylé en lien.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `.ap-filter-chip` (+ états, `-icon`/`-avatar`/`-count`) | Primitive en route vers le DS (V2-Atoms › FilterChip). Pill 24px, `aria-pressed` → ramp electric-blue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.ap-divider, .divider`                                 | La règle DS référence `--sys-color-border-color-default` mais les tokens du proto définissent `--sys-border-color-default` → fallback `--ref-color-grey-10`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `.ap-form-message[hidden]`                              | `.ap-form-message{display:flex}` bat `[hidden]{display:none}` → restaure le guard hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `.ap-dropzone` (famille)                                | Le DS n'a pas de dropzone. Box partagée « drop / browse » ([`dropzone.js`](../../src/components/dropzone.js)), variantes `--compact` / `--lg`, highlight `is-drop-target`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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
- ⛔️ **Jamais de liseré d'accent coloré sur un bord de carte** (`border-left: 3px solid …`). Règle catégorique de Matt. **L'état d'une carte va dans son contenu, pas sur son cadre** — un marqueur explicite (point + mot, ex. « • New ») dit la même chose sans repeindre la bordure. Un seul cas existait dans l'app (unseen sur `.topic-card`) et il a été retiré ; les `border-left`/`border-right` restants sont des séparateurs de panneau 1px dans la ramp sombre video-clips, pas des accents.
- Cartes in-bubble : `.chat-bubble-card` (grey-05, border grey-10) via `bulletsBlock()` (`_analyse-common.js`).

### Boutons / CTAs

DS `.ap-button` avec `primary|stroked|ghost` × `orange|blue`. Icon = `.ap-icon-button` (souvent `transparent`). Lien-bouton = `button.ap-link` (patché). Danger = `.ap-button.danger`. **Jamais full-width** (voir mémoire _buttons-never-full-width_).

### Selects (`.ap-select`)

`<details class="ap-select">` + `summary.ap-select-trigger` + `.ap-select-dropdown > .ap-select-options > .ap-select-option`. Options peuvent porter `.ap-select-option-caption` (2ᵉ ligne) et `.ap-select-option-check`. **Jamais un `<select>` natif** (mémoire _use-ds-dropdowns_). Depuis le picker de Playbook de `/topics`, la dalle de recherche du DS est aussi utilisée : `.ap-select-search` > `.ap-select-search-icon` + `.ap-select-search-input`, avec `.ap-select-not-found`. ⚠️ `.ap-select-not-found` porte `display: flex` → il bat `[hidden]` ; masquer en `style.display` inline.

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

Première utilisation de la moitié layout de cette famille : [`topics-settings.css`](../../styles/screens/topics-settings.css) (`/topics/settings`). Seul `--sys-settings-card-feature-lock-border-color` était déjà employé, dans `ds-patches` pour l'infobox feature-lock.

Trois écarts assumés à la recette, appris en construisant cette page :

- **Titre de page en `.ap-h1` (24px), pas `.ap-h2` (18px).** À 18 le titre de page n'est qu'à 2px des `.ap-card-title` (16) et la hiérarchie se lit plate. 24 → 16 → label de groupe en `.ap-caption-bold` (12) donne trois marches lisibles, et 24 est déjà la taille des titres des autres pages de l'app.
- **Ne pas donner une carte à un contrôle isolé.** Un `.ap-card-title` au-dessus d'un unique `.ap-select` est surtout du padding, et deux boîtes comme ça enchaînées font une page qui a l'air vide. Les contrôles de **niveau page** (le scope, un rythme) vont dans une **barre de `.ap-form-field`** (label au-dessus du contrôle, classe DS existante qui style son `> label` direct) ; les cartes sont réservées à ce qui a du contenu.
- **`-max-width-lg` (1200) n'est pas réservé aux tables.** Une galerie de cartes de config y a droit aussi : à 700, deux colonnes sont serrées et une colonne donne des bandes larges et courtes qui relisent comme des lignes. Corollaire : plafonner la prose (72ch) indépendamment de la grille, et faire tomber la grille à une colonne avec une **`@container` query** — dans une app à sidebar repliable, la largeur du viewport ne dit pas la largeur du contenu.

### En-tête de page de détail (identité + cluster d'actions)

Le patron partagé par `recap__header` (`/playbook/:id`) et `research-feed__header`
(`/research/:id`) : un **bloc identité** à gauche (monogramme 52×52, `h1` 24px/700,
ligne de méta en `caption`) et un **cluster d'actions** à droite, `display: flex`,
`align-items: flex-start`, `justify-content: space-between`, `gap: 24px`
(`--ref-spacing-md`), `flex-wrap: wrap`.

**Le piège :** avec `flex-wrap: wrap`, un navigateur qui manque de place **passe à
la ligne, il ne rétrécit pas**. Dès que `identité + actions + gap` dépasse la
colonne, le cluster tombe sous le titre. `recap__header` n'a aucun mécanisme contre
ça — il y échappe seulement parce que sa colonne fait 1080px et que les noms de
Playbook sont courts (mesuré : le plus long nom de lane n'y demande que 1016px).
La colonne de Content Research fait 820px (mesure de lecture voulue pour les cartes
de brief) et le même nom demande 885px → il passait à la ligne.

**La règle, donc :** dans un en-tête comme ça, c'est **l'identité qui cède**, jamais
les actions.

| Élément           | Déclarations                               | Pourquoi                                                                                                                                     |
| ----------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| bloc identité     | `flex: 1 1 0` + `min-width: 0`             | base zéro → ne réclame jamais une largeur qui force un retour à la ligne ; prend ce qui reste                                                |
| le `h1`           | `min-width: 0` + `overflow-wrap: anywhere` | un `h1` refuse de descendre sous son mot le plus long (mesuré 131px) et son cadre finit par croiser les boutons                              |
| cluster d'actions | `flex-shrink: 0` + `flex-wrap: wrap`       | les boutons gardent leur largeur intrinsèque ; si le cluster lui-même manque de place il se replie en interne plutôt que d'écraser un bouton |

Le nom **passe à la ligne** au lieu d'être tronqué : un nom de lane complet reste
lisible, une ellipse le perd. Vérifié de 820 à 380px de colonne — même ligne,
aucun débordement, aucune collision.

### Listes de cartes groupées par âge

Deux surfaces le font — le feed `/topics` et une liste de topics `/research/:id` —
et elles doivent se ressembler. Le patron : une `<section>` par tranche, titrée
par un label **`caption-bold` en capitales**, `--sys-text-color-light`, **sans
filet**. Le blanc suffit : 32px au-dessus du label contre 16px entre deux cartes,
donc la frontière entre deux tranches se lit plus large que celle entre deux
cartes. `.topics-group__label` (/topics) et `.topics-agegroup__label` (Content
Ideas) partagent exactement ce style — ne pas en inventer un troisième.

Règles qui comptent :

- **Une tranche vide ne s'affiche pas.** Pas de section vide, pas de « 0 topic ».
  Le filtre peut vider une tranche entière, et le titre doit partir avec.
- **Les bornes vivent dans le store**, à côté du parseur d'âge, jamais dans la
  vue : la vue demande dans quelle tranche tombe un élément, elle ne décide pas
  ce que « 7 jours » veut dire. Voir `AGE_GROUPS` / `groupBriefsByAge` dans
  [`briefs-store.js`](../../src/briefs-store.js).
- **Bornes inclusives en haut** — `1w ago` est dans « Last 7 days », pas dans la
  tranche suivante par effet de bord.
- **Marge sur `+` plutôt que `gap` sur la section** : un `gap` s'appliquerait
  aussi entre le label et sa première carte, qui doivent rester serrés.

⚠️ Piège du parseur : `ageMinutes()` lit `mo|[wdhm]` — **`mo` en premier**. Avec
`m` d'abord, « 2mo » matche le `m` puis échoue sur le `\b`, et l'étiquette tombe
en `MAX_SAFE_INTEGER` (« âge inconnu », triée en dernier). C'était le cas avant
que le groupement par âge ait besoin des mois.

### Filtres — chips, selects ou dropdown ?

**Règle du DS** (`choosing-components.md` › Filtering) : bascules **toujours visibles** → _filter chips list_ ; **options groupées / presets / une étape d'apply derrière un déclencheur** → _filter dropdown_.

⚠️ Les deux composants DS (`<ap-filter-chips-list>`, `<ap-filter-dropdown>`) sont **Angular-only** — aucune couche CSS-UI. Équivalents en prototype :

| Intention DS      | En CSS-UI ici                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| Filter chips list | `.ap-filter-chip` (patché dans `ds-patches.css`, « en route vers le DS »)        |
| Filter dropdown   | `.ap-selection-dropdown` (search · `-group` · `-item` · `-selected` · `-footer`) |

**Troisième cas, et c'est celui de `/topics` :** quand chaque facette prend **une seule** valeur et s'applique **immédiatement**, ni l'un ni l'autre — **un `.ap-select` par facette**, avec `.ap-select-inline-label` pour nommer la facette dans le déclencheur et `.ap-select-option-badge` pour le compteur. Un select **montre sa sélection fermé** ; un déclencheur « Filters (2) » oblige à l'ouvrir pour savoir. Le _Filters dropdown_ du DS (V2 Molecules, panneau 420px checkboxes + Clear/Apply) reste le bon choix dès qu'on **compose un jeu multi-valeurs et qu'on l'applique en un coup**. Précédent en place : la toolbar Period / Sort du board top-posts.

### Filter chips

`.ap-filter-chip` piloté par `aria-pressed`, optionnels `-icon` / `-avatar` (img rond) / `-count`. Partout : connectors-view, playbook-view, ideas, generate-image-modal, right-panel, feedback-control, schedule-modal.

### Status pills

DS `.ap-status` + `blue|green|grey|mermaid` (mermaid patché). Les états de travail in-conversation utilisent `mermaid` (butter + dot olive).

### Deux axes sur une même carte : pill ≠ texte

Sur une carte de brief (Content Research), deux informations coexistent et **ne sont
pas du même genre** : le **statut de revue** (New / Saved / Used / Ignored,
un état à la fois, choisi par l'utilisateur) et **trending** (un booléen indépendant
que le système constate, et qui peut se cumuler avec n'importe lequel des quatre).

Le statut est une **pill remplie**. Trending est du **texte orange avec une flèche**
(`.trending-mark`), jamais une pill — y compris pas un `.ap-tag tagOrange`, qui est
pourtant la réponse « correcte » côté modèle de données. Raison : `.ap-status grey` et
`.ap-tag tagOrange` ont la même géométrie et se lisent côte à côte comme **deux
états**, donc trending passe pour un cinquième statut. La séparation des deux axes doit
être portée par la **forme**, pas seulement par le nom de classe. Voir l'en-tête de
[`trending-mark.css`](../../styles/components/trending-mark.css).

Corollaire côté données : `status` et `isTrending` sont deux champs séparés dans
[`briefs-store.js`](../../src/briefs-store.js) et doivent le rester.

### L'accent de cadre : interdit en colonne, permis en vedette

Les cartes de topics du feed n'ont **pas** d'accent de cadre (voir plus bas) : dans
une colonne à parcourir, un liseré coloré fait crier une ligne sur dix et casse la
lecture. La carte Content Ideas de la page nouvelle session en porte un — 4px en
haut, orange (`--app-archie-orange`) pour Trending, menthol
(`--ref-color-menthol-100`) pour Updated.

Ce n'est pas une contradiction, c'est la même règle appliquée à deux contextes : là
c'est **une carte unique en vedette**, où le signal est précisément la raison d'être
de la carte, et il n'y a aucune voisine à écraser. Une carte « New » reçoit un
liseré **transparent** de 4px plutôt que rien, pour que la carte ne bouge pas de 3px
entre deux tons.

⚠️ Si une troisième surface veut un accent, réconcilier les deux règles avant de
l'ajouter.

**Au survol, l'accent garde sa couleur.** `.starter-card:hover` pose
`border-color` en raccourci — les quatre côtés — ce qui repeignait le liseré de 4px
en bleu et donnait l'impression que la carte changeait de catégorie sous le curseur.
L'accent est donc stocké dans une custom property (`--starter-topic-accent`) et une
règle `:hover` de même spécificité, placée **après** la règle de base, le restaure
sur le seul bord haut. Les trois autres bords prennent le survol standard, et le
reste du traitement (lavis teinté, filigrane) ne change pas.

### Un contrôle par-dessus une carte-bouton est un FRÈRE, pas un enfant

`.starter-card` est un `<button>`. Le bouton « voir un autre topic » ne peut donc pas
vivre dedans : un bouton dans un bouton est du HTML invalide que les navigateurs
résolvent de façon imprévisible. Le motif est un wrapper `position: relative` qui
contient les deux en frères, le contrôle étant positionné en absolu dans le coin.
Même raison que la séparation body / footer de `topics-card`.

### Un sélecteur montre la vraie carte, pas une ligne compacte

Le modal « Pick a topic » dessinait ses propres formes : une ligne d'une ligne pour
un topic, une rangée maison pour un Playbook. Les deux ont été remplacées par les
composants existants — `.contexts-card` à l'étape 1, `topics-card` (variante
`picker`) à l'étape 2. Le principe : **ce qu'on choisit doit ressembler à ce qu'on
lisait juste avant**. La ligne compacte supprimait le résumé, les marques Trending /
Updated et les blocs Why-now / What-changed — c'est-à-dire exactement ce sur quoi on
choisit.

Deux ajustements imposés par la réutilisation :

- La carte `topics-card` en variante `picker` n'a **pas de footer** : son bouton de
  corps porte `data-idea-pick` au lieu de `data-brief-research`. Le même élément,
  un autre verbe — une rangée d'actions en dessous serait une seconde réponse au
  même clic.
- `.contexts-card` est un `<article role="button">`, pas un `<button>`. Enter et
  Espace doivent être câblés à la main dans le modal, comme `contexts.js` le fait
  déjà sur sa propre page.

⚠️ `.contexts-card` a maintenant deux consommateurs (l'écran `/contexts` et ce
modal) tout en vivant dans `styles/screens/contexts.css`. Au troisième, la déplacer
dans `styles/components/`.

### Les séparateurs d'âge appartiennent à la carte, pas à l'écran

`.topics-agegroup` vit désormais dans
[`styles/components/brief-card.css`](../../styles/components/brief-card.css) et non
dans `styles/screens/research.css` : le modal « Pick a topic » groupe par âge lui
aussi, donc c'est de la chrome de liste de cartes partagée par deux surfaces. Le
modal groupait auparavant par topic list, ce qui faisait de la seule liste montrant
les cartes du feed la seule à les trier autrement que lui.

Contrepartie assumée : en groupant par âge on perd les titres de topic list, alors
qu'un Playbook peut en posséder plusieurs. L'information redescend donc sur la
carte, dans `.topics-card__lane` — **variante picker uniquement**, parce que le feed
et la page attention sont déjà à l'intérieur d'une seule lane et que la nommer y
serait du bruit.

### Un signal d'attention ne vit que dans « Last 7 days »

Trending et Updated affirment quelque chose sur le **maintenant**. Sous un séparateur
« Earlier », la carte se contredit — et c'est le séparateur que le lecteur croit.
La règle est donc appliquée à la lecture, dans `withTriage()` de
[`briefs-store.js`](../../src/briefs-store.js) : au-delà du premier groupe d'âge les
deux booléens sont remis à faux. L'âge (`ageLabel`) reste la seule source de vérité,
et une donnée de seed qui oublierait la règle perd son signal au lieu de casser la
mise en page.

### Une seule température de page

Tous les écrans peignent le fond du shell (`--app-bg` → `--ref-color-grey-bg`,
`#F9F9FA`). Content Ideas a longtemps fait exception : la liste de topics, la page
attention et la page de réglages étaient sur `--app-paper` (`#F9F9F2`, chaud), au
motif que « les vues de détail gardent le papier ». Sauf que `/playbook/:id` est une
vue de détail et se trouve sur le fond du shell — la règle n'avait qu'un membre, et
l'effet visible était une page qui changeait de température quand on ouvrait une
liste de topics depuis la liste des listes. Les trois fonds sont alignés et le token
`--app-paper` a été supprimé faute de consommateur. Ne pas le réintroduire pour un
seul écran.

**Le signal reste à l'intérieur de la carte — pas sur son cadre.** Une carte trending
a porté un temps une bordure pêche et un rail orange de 4px en haut ; les deux ont été
retirés. Il ne reste plus de modificateur `.topics-card--trending` : le signal est
porté par la marque « Trending » dans la ligne de source et par le bloc
`.topics-card__whynow` (fond pêche, rail orange à gauche) — exactement ce que faisait
déjà Updated, qui n'a jamais eu d'accent de cadre. Deux signaux, une seule grammaire.
Le cadre reste la même bordure grise pour toutes les cartes, donc la colonne se lit
comme une liste et non comme une liste plus des exceptions.

Si un accent de cadre devait revenir un jour : **une bordure, jamais un span en
position absolue**. Le premier essai était un span de 4px dans un wrapper
`overflow:hidden`, ce qui a coûté trois bugs — il rognait le dropdown Use-now, et comme
`overflow:hidden` met à zéro la taille minimale automatique d'un flex item, le
`flex-shrink` par défaut de la colonne écrasait les cartes et coupait leurs footers.
Le `flex: 0 0 auto` de [`research.css`](../../styles/screens/research.css) est l'autre
moitié de ce correctif et reste nécessaire.

⚠️ `.ap-tag` n'accepte **qu'une** icône, `ap-icon-close` dans un bouton de fermeture —
pas de flèche de tendance dedans (règle DS sur `.ap-tag`). Et `.ap-badge` est réservé
au contexte **système** (NEW / BETA, auto-uppercase en `orange`) : un état de cycle de
vie choisi par l'utilisateur n'y a pas sa place, sinon un état sur quatre est un badge
et les trois autres des status.

### Un filtre ne ment pas : la notice dit ce qu'il cache

Quand un signal système (ex. trending) tombe sur une carte que le filtre actif masque,
la tentation est de **passer outre le filtre** et d'afficher la carte quand même. Ne
pas le faire : une carte qu'aucun filtre actif n'explique se lit comme un bug.

Le patron retenu (`/research/:id`) : **rien ne passe outre**, et c'est la notice qui
rend compte de ce que le filtre exclut — « 2 trending topics don't match your filters »

- un bouton vers la surface où le triage est ignoré (`/research/:id/trending`). Trois
  propriétés à conserver :

* **Le compte ne porte que sur ce qui est caché**, jamais sur le total. L'ancienne
  bannière annonçait les 3 trending de la lane alors que le feed n'en montrait qu'1 —
  c'est cet écart inexpliqué qui fait croire à un filtre cassé.
* **Elle disparaît quand elle n'a rien à signaler**, ce qui la dispense d'être
  fermable : un bouton « fermer » ne pourrait que masquer un énoncé encore vrai. La
  réponse à la cécité aux bannières est là, pas dans le dismiss.
* **Un seul prédicat de filtre** ([`matchesFilters()`](../../src/briefs-store.js)),
  partagé par la liste et par le compte, sinon la notice contredit la liste au-dessus
  de laquelle elle est posée. Et il couvre les trois groupes (statut, sources, types) —
  un brief tenu à l'écart par le type est tout aussi caché.

Composant : **`.ap-infobox main has-title`**, pas une boîte maison — « banner » est une
entrée de la table intent→composant et résout vers Infobox. Anatomie imposée :
`> i` puis `.ap-infobox-content` > `.ap-infobox-texts` > `-title` / `-message`, le
`.ap-button` en **enfant direct** de `-content` (le DS style `> .ap-button` et `> i`
lui-même).

`main` (orange), pas `info` : le bleu se lit comme un aparté neutre et sous-évalue
l'information — c'est Archie qui signale qu'on ne voit pas quelque chose, et l'orange
c'est ça partout dans l'app. La variante orange est un ajout `ds-patches.css` (le DS
n'en a pas) ; `warning` a été écarté parce que choisir une famille sémantique **pour sa
teinte** et non pour son sens est précisément l'anti-pattern. Et l'icône reprend le
`arrow-up` de `.trending-mark` sur les cartes en dessous, pour que la notice et les
marqueurs se lisent comme un seul signal.

⚠️ Deux pièges mesurés sur ce composant, tous deux corrigés dans `ds-patches.css` :
l'infobox **écrase son propre bouton** (voir le tableau §1), et son `border-radius` est
de **4px** contre 14px pour les cartes de l'app — non aligné volontairement, puisque
l'aligner voudrait dire surcharger un token du composant DS.

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

| Largeur | Modals                          | Pourquoi                                                       |
| ------- | ------------------------------- | -------------------------------------------------------------- |
| 440     | rename                          | un seul champ                                                  |
| 560     | bug report, chat picker, search | une liste courte ou un formulaire                              |
| 640     | feedback, add source            | formulaire + onglets                                           |
| **720** | **topic** (le dossier)          | **lecture longue** — de la prose ; au-delà, la mesure décroche |
| 920     | connectors                      | une gallery à parcourir                                        |
| 960     | schedule                        | deux colonnes                                                  |

Les modals hauts plafonnent leur hauteur (`max-height: min(calc(100vh - 48px), 760px)`) et font défiler leur `.ap-dialog-content`, avec un footer d'actions collant : la décision doit rester atteignable quelle que soit la longueur du contenu.

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

⚠️ **Toujours dimensionner par `--archie-loader-size`, jamais par `width` + `height`.** La variable est la **largeur** de la boîte ; la hauteur vient de l'`aspect-ratio` du viewBox. Fixer les deux neutralise l'`aspect-ratio` et écrase le glyphe en carré (c'était le cas du loader de prompt de l'Image Studio v1, à `28px × 28px`).

⚠️ **Une barre d'outils flottante n'est pas une pill.** Les mini-toolbars de l'Image Studio (texte sélectionné, boîte de crop) étaient en `--app-radius-pill` : à 999px l'arc du coin passe **en travers** des contrôles des deux bouts — la pastille de couleur à gauche, l'`.ap-icon-button` à droite — et les rogne. Elles sont en `--app-radius-lg` (8px), qui vaut aussi `--comp-icon-button-border-radius` : le coin du conteneur est alors **concentrique** avec les boutons qu'il tient (4px de padding autour d'un coin de 4px = 8px). La pill reste juste pour ce qui n'a **pas** de contrôle sur ses bords : segmented view toggle, badge, pastille de position.

⚠️ **`.gen-loading-mark` est le mark 88px du _stage_** (l'état vide du canvas), pas un « loader d'image » générique. Les deux composers d'Image Studio le portaient, ce qui mettait un glyphe de 88px dans un champ de 36px : il débordait de la carte et poussait le texte sur le côté. Un loader **inline** ne porte que `.gen-image-spinner` (20px par défaut). Et un loader qui remplace un champ doit prendre la **largeur du champ** (`flex: 1`) — centrer dans une boîte shrink-to-fit revient exactement à aligner à gauche.

---

## Voir aussi

- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — workflow DS obligatoire + MCP `ds-css` + anti-patterns
- [`FEATURES.md`](FEATURES.md) — où ces patterns sont utilisés (par feature)
- [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md) — formules de tailles sidebar / panel / status-card
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
