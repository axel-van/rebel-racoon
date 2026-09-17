# Couverture Figma ⇄ app

Le fichier Figma **Archie** (`ulQHaMfPhTQwNLib6IDOez`) doit être la source de vérité **complète** de
l'app : chaque surface, modale, dropdown et bout d'UI du proto y existe. Ce fichier est le backlog de
cet objectif — il recense ce qui est couvert et ce qui ne l'est pas, pour que le travail se reprenne
sans re-faire l'inventaire.

Le mapping technique (fileKey, node-ids des frames maintenues, routes, sources) vit dans
[`figma-sync-map.json`](figma-sync-map.json). Ici, on ne suit que la **couverture**.

Recensement vérifié contre le fichier live le **2026-09-17**.

> **État au 2026-09-17** — le backlog est **vidé**. Les 12 modales ont leur corps, l'Image Studio
> ses 5 surfaces avancées, Insights ses 3 vues, le panneau ses modes `clips` et `context-brief`, et
> les petits bouts d'UI (popover Admin, légende `?`, états vides, grille de réseaux, chat dégradé,
> `ap-select` ouvert, previews de post) existent. Seul reste **explicitement non fait** : les 9
> dessins SVG Type/Style de l'Image Studio, posés en aplats gris/sombres.

## Où vit quoi, dans le Figma

| Page                       | Rôle                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `UI`                       | les écrans pleine page (1440), un par frame                          |
| `Image Generation`         | l'Image Studio : un component set à 3 états + ses 5 sous-composants  |
| `Topic Feed`               | le Topic Feed : ses écrans + ses sous-composants                     |
| `💠 Components`            | tout le réutilisable, rangé en 11 sections — dont `Modals & Studios` |
| `🥸 Archie UI Corrections` | annotations sur captures, pas des écrans                             |
| `🚧 Tests`                 | explorations analytics (Top content card, matrice 6×7)               |
| `🔍 Inspiration`           | références                                                           |

Convention observée : **une grosse feature = sa page**, avec ses écrans ET ses sous-composants
côte à côte. Le réutilisable transverse reste sur `💠 Components`.

## Écrans (routes)

| Route                      | App                                    | Figma                           | État                                        |
| -------------------------- | -------------------------------------- | ------------------------------- | ------------------------------------------- |
| `/`                        | redirect seul, aucun rendu             | —                               | n/a                                         |
| `/session/:id`             | chat                                   | `UI › Session`                  | ✅                                          |
| `/session/:id` (hero vide) | new chat                               | `UI › Session — New chat`       | ✅                                          |
| `/contexts`                | Playbooks                              | `UI › Playbooks`                | ✅                                          |
| `/playbook/:id`            | fiche                                  | `UI › Playbook detail`          | ✅                                          |
| `/connectors`              | galerie                                | `UI › Connectors`               | ⚠️ frame présente, non resynchro (flag OFF) |
| `/welcome-alt`             | onboarding                             | `UI › Welcome-alt`              | ✅                                          |
| `/welcome-alt/recap`       | recap du Playbook construit            | `UI › Welcome-alt — Recap`      | ✅                                          |
| `/home`                    | home compte (flag `playbookWorkspace`) | `UI › Home (account)`           | ✅                                          |
| `/insights` — Cockpit      | vue par défaut (flag `insightsHub`)    | `Insights › Insights — Cockpit` | ✅                                          |
| `/insights` — Mob · Index  | 2e vue                                 | —                               | ❌                                          |
| `/insights` — Mob · Side   | 3e vue                                 | —                               | ❌                                          |
| `/topics`                  | Topic Feed (flag `topicFeed`)          | `Topic Feed › Topic Feed`       | ✅                                          |
| `/topics/settings`         | réglages du feed                       | `Topic Feed › Feed settings`    | ✅                                          |

## Studios & étapes de flow

| Surface                                                                | Figma                                           | État                             |
| ---------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Batch Studio                                                           | `UI › Batch Studio`                             | ✅                               |
| Clip Studio — upload                                                   | `UI › Clip Studio — Setup (Upload)`             | ✅                               |
| Clip Studio — analyse                                                  | `UI › Clip Studio — Setup`                      | ✅                               |
| Clip Studio — revue des clips                                          | `UI › Clip Studio — Clips`                      | ✅                               |
| Top Posts — choix du compte                                            | `UI › Top Posts — Account picker`               | ✅                               |
| Top Posts — board                                                      | `UI › Top Posts — Board`                        | ✅                               |
| Image Studio — Generate vide / Generate résultats / Edit               | `Image Generation › Image Studio`               | ✅                               |
| Image Studio — onglet **Advanced** (le brief dérivé)                   | —                                               | ❌                               |
| Image Studio — panneau **References** ouvert                           | `Settings panel › References body`              | ⚠️ bloc seul, pas d'état d'écran |
| Image Studio — panneau **Branding** ouvert                             | —                                               | ❌                               |
| Image Studio — panneau **Settings** déplié (7 rangées d'options)       | `Settings panel`                                | ⚠️ idem                          |
| Image Studio — barre **Tools** (mode Edit)                             | `Studio Console › Mode=Edit`                    | ⚠️ console seule                 |
| Image Studio — les 9 vignettes Type / Style (`type-art` / `style-art`) | —                                               | ❌                               |
| Image Studio — garde-fou « brief édité à la main »                     | `Image Generation › Image Studio — Brief guard` | ✅                               |
| Étape « connecter un compte » (grille de réseaux)                      | —                                               | ❌                               |
| Chat dégradé (Playbook révoqué)                                        | —                                               | ❌                               |

## Panneaux

| Mode          | Figma                                                                                            | État |
| ------------- | ------------------------------------------------------------------------------------------------ | ---- |
| sources       | `Right Panel — Sources`                                                                          | ✅   |
| ideas         | `Right Panel — Ideas`                                                                            | ✅   |
| drafts        | `Right Panel — Drafts` + `Post Preview` + `Drafts — Filters bar` + `Drafts — Network group band` | ✅   |
| clips         | —                                                                                                | ❌   |
| context-brief | —                                                                                                | ❌   |

### La preview de post — construite le 2026-09-16

⚠️ **La capture qui a motivé cette entrée venait de la PROD, pas du proto.** `docs/audits/PROD-VS-PROTOTYPE.md`
liste comme absents du proto : le badge `Draft ready`, la rangée de scores `Voice / Practices / Accuracy`,
la troncature `…more`, le badge réseau sur l'avatar. Le Figma suit le **proto**.

Autre correction : **le proto ne ship qu'UN chrome de preview, celui de LinkedIn**, rendu à l'identique
pour les six réseaux. Seuls changent l'icône + la limite du compteur de caractères, et l'orientation du
lecteur de clip (9:16 pour TikTok et Instagram). Il n'y a pas d'aperçu natif par réseau à construire.

Ce qui a été construit :

| Élément                                                                                                                                                                                                         | État |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `Post Preview` — carte 500px : avatar d'initiales, auteur / poste / `3h · Public`, corps, hashtags, compteur de caractères                                                                                      | ✅   |
| Emplacement image vide : tuile grise, `Upload an image`, `Drop it here or browse.`, bouton **`.ap-button` variante AI/MermAId** (bordure dégradée, pas un bouton plein) et la ligne `Or open the Image Studio…` | ✅   |
| Barre d'engagement (pastilles de réaction + `8 comments · 11 reposts`) et pied social décoratif `Like · Comment · Repost · Send`                                                                                | ✅   |
| `Drafts — Filters bar` : onglets `All drafts 4` / `Needs fixes 2` + select `All networks` + fermeture                                                                                                           | ✅   |
| `Drafts — Network group band` : case + logo + `LinkedIn` + `· 4 drafts`                                                                                                                                         | ✅   |
| Rail d'actions latéral (**7** boutons, pas 6 : Reference · Regenerate · Image Studio · Upload · Save · Schedule · Delete)                                                                                       | ✅   |
| Menu de réécriture (Shorter · Longer · Warmer · More formal · — · Regenerate)                                                                                                                                   | ✅   |
| Infobox `needs_fixes` (la seule signalisation d'état du proto — pas de badge `Draft ready`)                                                                                                                     | ✅   |
| Disclosure `Generation context` + son panneau (headline teintée + source idée)                                                                                                                                  | ✅   |
| États image / carrousel / clip de la preview                                                                                                                                                                    | ❌   |

## Modales — 20 dans l'app

Construites (section `Modals & Studios`, en instances de la `Modale` DS) :

`add-source-modal` (Upload + URL) · `bug-report-modal` · `confirm-modal` · `feedback-modal` ·
`rename-modal` · `schedule-modal` · `video-clips-modal` · `search-modal` (section `Overlays`) ·
l'Image Studio en modale.

Les 12 manquantes ont été **créées le 2026-09-16** comme instances de la `Modale` DS, à leur
largeur réelle, avec titre et sous-titre verbatim, et leur **slot `Content` a été rempli le
2026-09-17**. Les pieds de page portent désormais les vrais libellés et les vrais styles DS.

| Modale                         | Largeur | Corps rempli                                                        |
| ------------------------------ | ------- | ------------------------------------------------------------------- |
| `topic-ignore-modal`           | 520     | ✅ champ + placeholder                                              |
| `skip-connect-modal`           | 680     | ✅ trio de tuiles + les 6 raisons                                   |
| `topic-history-modal`          | 520     | ✅ la piste à deux versants (4 entrées, médaillons tonés)           |
| `connect-account-modal`        | 480     | ✅ 2 comptes cochables + infobox « Nothing publishes… »             |
| `save-folder-modal`            | 440     | ✅ 2 cartes radio + `ap-select` dossier rempli                      |
| `fill-document-modal`          | 480     | ✅ dropzone + séparateur `or` + champ URL + infobox warning         |
| `analyze-profiles-modal`       | 480     | ✅ recherche + 2 profils + infobox warning                          |
| `chat-picker-modal`            | 560     | ✅ 5 options Quickpicker numérotées                                 |
| `share-playbook-modal`         | 560     | ✅ General access → People with access → transfert                  |
| `objective-modal`              | 640     | ✅ la phrase (Grow / over a) + « Measured by » vide + Add a measure |
| `connectors-modal`             | 920     | ✅ recherche + 7 chips + 2 groupes de 6 cartes, sans pied           |
| `topic-picker-modal`           | 960     | ✅ article 560 + panneau gris 400 des posts contributeurs           |
| Add-source — onglet Connectors | —       | ✅ 2 frames : la liste et la vue « browse » d'un connecteur         |

⚠️ **Divergence code ⇄ Figma relevée** : le `Modale` Figma a bien deux tailles (`Small` 528 /
`Large` 832), alors que `css-ui` ne déclare **aucune** largeur de dialogue — chaque modale de l'app
pose la sienne. Les largeurs ci-dessus sont celles du code, pas celles du DS Figma.

## Dropdowns, popovers, overlays

| Surface                                       | Figma                                                   | État                                                                 |
| --------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Composer — menu Add                           | `Overlays › Composer — Add menu`                        | ✅                                                                   |
| Sidebar — menu ⋯ d'un chat                    | `Overlays › Sidebar — Chat ⋯ menu`                      | ✅                                                                   |
| Sidebar — menu « Sort & group »               | `Overlays › Sidebar — Sort & group menu`                | ✅ ⚠️ l'option DS n'a pas de coche de fin — l'actif n'est pas marqué |
| Sidebar — popover Admin (cog)                 | `Small UI — Admin popover · Shortcuts · États vides`    | ✅ 320px, 4 sections, 9 flags                                        |
| `more-menu` des cartes (source / idée / clip) | `Overlays › Card — ⋯ menu (source / idea / clip)`       | ✅ les trois                                                         |
| Topic Card — menu ⋯                           | `Overlays › Topic Card — ⋯ menu`                        | ✅ (option DS `2 Lines`)                                             |
| `ap-select` ouvert                            | `Small UI — degraded chat · network grid · select open` | ✅ trigger focus + 2 options                                         |
| Composer — mention picker                     | `Overlays › Composer Mention Picker`                    | ✅                                                                   |
| Recherche ⌘K                                  | `Overlays › Search (overlay)`                           | ✅                                                                   |

## Petits bouts d'UI

| Élément                                                                                 | Figma                                   | État                                           |
| --------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Snackbar / toast                                                                        | `Overlays › Snackbar · Success / Error` | ✅ (2 variantes seulement dans le DS)          |
| Tooltip                                                                                 | `Overlays › Tooltip`                    | ✅ (8 directions de pointe)                    |
| Légende des raccourcis (`?`)                                                            | `Small UI — Admin popover · …`          | ✅ 8 raccourcis                                |
| États vides (`empty-state`)                                                             | `Small UI — Admin popover · …`          | ✅ 4 (clips, ideas, no-Playbook, no-objective) |
| Contrôle de feedback (pouces)                                                           | `fb — Feedback control`                 | ✅                                             |
| Conversation status card                                                                | ✅                                      | ✅                                             |
| Dropzone                                                                                | `Dropzone — Large`                      | ✅                                             |
| Cartes source / idée / post / clip / top-post / connecteur / playbook / starter / topic | ✅                                      | ✅                                             |
| `social-post-card` (post d'un tiers comme preuve)                                       | dans `topic-picker-modal`               | ✅ 2 cartes (LinkedIn, X)                      |
| Workflow step                                                                           | ✅                                      | ✅                                             |
| Quickpicker (+ option, header, action bar, lead)                                        | ✅                                      | ✅                                             |
| Bulk bar drafts                                                                         | ✅                                      | ✅                                             |

## Règles de construction retenues

- Une feature lourde prend **sa page**, ses écrans et ses sous-composants ensemble
  (précédent : `Image Generation`).
- Les composants transverses restent sur `💠 Components`, dans la section qui correspond.
- Les écrans sont des **assemblages d'instances**, jamais des calques dupliqués.
- Les états gated par un flag sont portés par une **propriété booléenne** du composant partagé
  plutôt que par un doublon — `Sidebar › Topic Feed row`, `Topbar › Chat counters` /
  `Settings action`.

⚠️ Piège rencontré sur ce fichier : à l'intérieur d'un sous-arbre d'instance, `findOne()` / `query()`
lèvent « node does not exist » sur un nœud périmé. Naviguer par **index** (`node.children[i]`) passe.

✅ **Le slot de l'`Action Dropdown` DS EST peuplable** : on clone l'instance `.action-dropdown option`
déjà présente dans le slot et on l'append. Les options portent une variante `Type` = `Single` /
`2 Lines` / `Separator` — le séparateur est donc une option, pas un trait dessiné — et le
`.action-dropdown base` imbriqué porte `T Action Name`, `👁 Left Icon`, `◇ Left Icon` et
`Action Type` = `Normal` / `Red` / `Feature Locked`. (Le guide du skill `design-guidelines` donne ce
slot comme non peuplable : c'est à corriger.) Écrire dans un slot **invalide les références de nœuds**
détenues par le script — relire après.

## ⚠️ Trois cadrages corrigés par les specs (2026-09-16)

- **Insights n'a pas de vue « Report »** — elle a été supprimée le 2026-09-11 avec « Mob · Band » et
  « Cockpit bis ». Il reste **Cockpit**, **Mob · Index** et **Mob · Side**, et le sélecteur de vue vit
  dans la **topbar**, pas dans la page (il n'y a plus de barre de page).
- **Sur `/home`, l'onglet Playbooks est un TABLEAU**, pas une grille de cartes. La grille de tuiles ne
  survit que sur `/contexts` avec le flag OFF.
- **Le DS ne ship aucune largeur de dialogue** : ni 528 ni 832 n'existent dans `css-ui`. Chaque modale
  déclare la sienne côté app — 440 · 480 · 520 · 560 · 640 · 680 · 720/960 · 920.

## Ce qui a été construit le 2026-09-17

Les corps des 12 modales, puis tout le reste du backlog.

**Image Studio** (page `Image Generation`) — 4 nouvelles frames :

| Frame                                         | Contenu                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Image Studio — Advanced (the brief)`         | les chips `Options` / `Advanced`, l'eyebrow « The brief I sent », le bloc héros « Text on the image » + ses 7 blocs, **les 3 états de la note** (celle d'Archie / reprise à jour / reprise PÉRIMÉE) et l'état « Writing your brief… » |
| `Image Studio — Options (the 6 setting rows)` | `Type & text` et `References` épinglés ouverts, `Branding`, `Style` (désactivé « From references »), `Format`, `Output`                                                                                                               |
| `Image Studio — Edit tools & popovers`        | la palette verticale (Crop / Add text / Add image), la feuille « Add an image » (2 marques Playbook + upload + 16 presets), la mini-barre de texte et ses **4 popovers** (Colour, Font, Outline, Shadow)                              |
| `Image Studio — Brief guard`                  | (2026-09-16)                                                                                                                                                                                                                          |

⚠️ **Non fait, volontairement** : les **9 dessins SVG** Type/Style (`type-art.js` / `style-art.js`).
Les vignettes sont posées en aplats gris (clair) et navy (sombre) avec leur pastille radio au bon
endroit — la géométrie et l'état de sélection sont justes, le dessin ne l'est pas.

**Insights** (page `Insights`) — 2 frames qui s'ajoutent au `Cockpit` :

- `Insights — Mob · Index` : la bande blanche (picker de Playbook + ligne de rollup), l'en-tête de
  liste `Objectives 4` + les pastilles de tiers, et la grille 2 colonnes des 4 cartes d'objectif,
  chacune avec sa courbe de 96px et sa ligne de cible pointillée.
- `Insights — Mob · Side` : la bande (Playbook en 14/700 puis l'objectif en 24/700 + verdict +
  `Fix this in a chat` / `Adjust`), les 2 report cards à 260px de graphe, la section des posts, et
  la colonne de faits de 300px (Verdict · Window · Origin · Measures · Posts + le pied
  « This Playbook »).

**Panneau de droite** (page `💠 Components`) :

- `Right panel — Clips` : la barre d'onglets `Ideas 6` / `Clips 3`, la bande de sélection
  (`· 2 selected`, `Draft posts`, corbeille) et 3 clip-cards complètes — vignette dégradée avec
  chip de ratio, bornes `2:14 → 2:54` et durée, ligne de source avec le tag `clip`, titre, résumé,
  « Why this clip » replié, pouces + `Reference` + `Draft`.
- `Right panel — Playbook brief (read)` : héros, grille de personnalité 2×2, `Voice profile` avec
  son bandeau et ses **9 sous-cartes**, la barre d'essentiels (Language / CTA links), la vitrine
  `Visual identity` (Colors · Typography · Images · Buttons · Personality) et le pied
  `Close` / `Edit Playbook`.

**Objectifs** (section `Modals & Studios`) — 2 frames de plus que la coque vide :

- `Adjust objective — with measures` : la phrase remplie, `Measured by 2`, et **2 cartes de mesure**
  — la forme `Grow from 14,800 → 20,000` avec sa ligne `Suggested · +35% · ~173/day`, et la forme
  taux `Hold above 5.0% now at 4.1%` — chacune avec son `Measured on` (le `measure-scope-field`).
- `Add a measure — metric catalogue` : la recherche, les **8 familles sur 2 colonnes**, les rangées
  `Already measured` grisées et les deux métriques indisponibles avec leur
  « Needs Google Analytics · use Link clicks ».

**Petits bouts d'UI** — 3 planches :

- `Drafts — post previews` : les 4 états de la carte de draft (média vide, image, carrousel, lecteur
  de clip) avec la colonne d'actions à droite, le compteur de caractères, la barre d'engagement
  LinkedIn et la ligne `Generation context`.
- `Small UI — Admin popover · Shortcuts · États vides` : le popover Admin 320px (3 items DS, puis
  User mode / Your role / les 9 feature flags / Docs), la légende des 8 raccourcis, et 4 états vides.
- `Small UI — degraded chat · network grid · select open` : la `ap-status-card red` du chat dégradé,
  la grille des 6 réseaux (Quickpicker `variant: cards`, 4 colonnes) et l'`ap-select` ouvert.

### Pièges d'API rencontrés ce jour-là

- **`resize()` après `layoutSizingHorizontal = 'FILL'` casse le FILL.** Toute frame ou tout
  rectangle qui doit remplir sa colonne doit être redimensionné **d'abord**, puis passé en `FILL` —
  sinon il reste à la largeur littérale passée à `resize` (10px dans nos helpers). C'est la cause de
  tous les « médias écrasés en bandeau » qu'il a fallu reprendre.
- **`figma.createAutoLayout()` fixe aussi l'axe secondaire.** Un `resize(w, 10)` laisse la frame à
  10px de haut : il faut `layoutSizingVertical = 'HUG'` derrière.
- **`text.paddingTop` n'existe pas.** Pour espacer un sous-titre, insérer une frame vide de la
  hauteur voulue.
- **Le `Tag` DS n'expose aucune propriété de texte** — le libellé se pose sur
  `tag.children[0].children[0].children[0]`, et la croix se masque par `children[0].children[1]`.
- **`Tabs` est un `COMPONENT`, pas un `COMPONENT_SET`** : `importComponentByKeyAsync`. Son slot
  `Tabs List` se peuple en clonant l'onglet déjà présent.
- **On ne peut pas `appendChild` dans le sous-arbre d'une instance** : la ligne de provenance du
  `topic-picker-modal` ne pouvait pas accueillir sa `Tag` dans le header de la `Modale`, donc la
  pastille `Trending` est posée en tête du corps.
