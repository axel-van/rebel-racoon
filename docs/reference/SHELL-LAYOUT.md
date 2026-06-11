# Shell layout — Right panel · Status card · Sidebar

Handoff sur l'ensemble des règles qui pilotent les 3 surfaces de chrome de la
zone session : le **right panel**, la **conversation-status-card** et la
**sidebar** (collapsed / expanded), plus la définition des **tailles** du right
panel.

Les 3 surfaces sont des **cellules d'une même grille CSS** sur `#appShell`
(`.app-shell`), pas des overlays. Tout se joue donc sur `grid-template-columns`

- quelques classes d'état :

| Classe sur `#appShell`    | Effet                                   |
| ------------------------- | --------------------------------------- |
| `.is-sidebar-collapsed`   | sidebar en rail icônes (col 1 rétrécie) |
| `.is-right-panel-open`    | ajoute la colonne du right panel        |
| `.is-status-card-visible` | ajoute la colonne de la status-card     |

Fichiers : `src/components/{right-panel,conversation-status-card,sidebar}.js` +
`styles/layout.css`, `styles/components/conversation-status-card.css`,
`styles/tokens.css`.

---

## 1. Right panel — ouverture / fermeture

Cellule de grille **ligne 2, colonne 3**. 5 modes mutuellement exclusifs
(`state.mode`, module-local dans `right-panel.js`) :

| Mode            | Ouvert par                                        | Persisté URL ?         |
| --------------- | ------------------------------------------------- | ---------------------- |
| `drafts`        | `openDrafts()`                                    | oui — `?panel=drafts`  |
| `ideas`         | `openIdeas()` / `openClips()` (sous-onglet Clips) | oui — `?panel=ideas`   |
| `sources`       | `openSources()`                                   | oui — `?panel=sources` |
| `context-brief` | `openContextBriefPanel()`                         | **non**                |
| `null`          | `closePanel()`                                    | —                      |

**Règles :**

- `renderPanel()` pose `el.hidden = !state.mode` et bascule `.is-right-panel-open`
  sur `#appShell`.
- **Scoped session** : `syncFromUrl()` ferme le panel dès qu'on quitte une route
  `/session/:id` (Playbooks, Settings, Dashboard…), avec `skipUrl` pour ne pas
  réécrire le hash de la nouvelle route.
- **Persistance URL** : les 3 modes « utilisateur » (`drafts`/`ideas`/`sources`,
  cf. `VALID_URL_MODES`) sont encodés en `?panel=…`. Au boot et sur chaque
  `hashchange`, `syncFromUrl()` rouvre le bon mode (deep-link + back/forward) ;
  un garde no-op casse la boucle write → hashchange → write. `context-brief`
  n'est **jamais** persisté (piloté par la nav Playbooks, pas un toggle user).
- **Focus** : à l'ouverture fraîche (`prev === null`), le focus courant est
  mémorisé (`snapshotFocusOnOpen`) et restauré à la fermeture
  (`restoreFocusOnClose`).
- **Fermeture** : `Escape` ferme le panel **mais** seulement si aucun menu kebab
  de source n'est ouvert (l'Escape les ferme d'abord). Bouton close inline
  (modes liste) ou close pinné au coin (`context-brief`). Changer de session
  (new chat, suppression de la session active) appelle `closeRightPanel()`.

---

## 2. Conversation-status-card — visibilité

Cellule de grille **colonne 3** elle aussi (classe `.is-status-card-visible`).
Sa `render()` masque la carte (`hideCard()`) si **n'importe laquelle** de ces
gardes est vraie :

1. Pas sur une route `/session/:id`.
2. Session `welcome-alt-*` (onboarding full-bleed, grille mono-colonne).
3. Session `clip-studio-*` (flow full-page).
4. Préférence user désactivée — `isEnabled()` lit
   `localStorage["archie-status-card-visible"]` (défaut **ON** ; `"0"` = masqué),
   togglée par le bouton info de la topbar.
5. **Un right-panel est ouvert** en mode `drafts`/`ideas`/`sources` → la carte
   cède la colonne au panel. La préférence n'est pas touchée : à la fermeture du
   panel, `subscribeRightPanel` re-render et la carte réapparaît si activée.
6. **Chat vide** — aucune source, idée, clip, draft ni travail en cours
   (`isEmptyChat`). Le toggle topbar est masqué en lockstep.

Sinon : `rootEl.hidden = false` + `setShellLayout(true)`.

> **Carte et right-panel sont mutuellement exclusifs** sur la colonne — sauf le
> mode `context-brief` (hors `VALID_URL_MODES`, donc la garde #5 ne s'applique
> pas), qui peut techniquement coexister dans une grille à 4 colonnes.

---

## 3. Sidebar — collapsed / expanded

Piloté par `.is-sidebar-collapsed` sur `#appShell`, persisté dans
`localStorage["archie-sidebar-collapsed"]` (`"1"` = collapsed).

- **Toggle** : bouton head (chevron ↔ view-list), ou **⌘B / Ctrl+B** — sauf quand
  le focus est dans un input/textarea/contenteditable (laisse le raccourci
  plateforme gagner).
- `setSidebarCollapsed()` bascule la classe, écrit le localStorage et
  **re-render** la sidebar (markup différent : rail icônes-only vs complet).
- Au boot, l'état persisté est appliqué **avant** le premier render pour éviter
  le flash de layout.

**Auto-collapse piloté par le right-panel** (le couplage des 3) :

- À chaque **ouverture fraîche** d'un panel (transition `null → mode`),
  `maybeCollapseSidebarOnOpen(prev)` collapse la sidebar — uniquement si
  `prev === null` (pas sur un swap de mode Ideas↔Drafts) et si elle n'est pas
  déjà collapsed. Déféré en `requestAnimationFrame` pour que la colonne du panel
  soit résolue avant le calcul de largeur.
- **Pas d'auto-restore** à la fermeture — l'utilisateur ré-étend manuellement.
- Sur `window.resize` (rAF-debounced), `maybeCollapseSidebar()` re-collapse si un
  panel est ouvert et que la sidebar est étendue.

---

## 4. Définition des tailles du right panel

Les largeurs sont **entièrement pilotées par `grid-template-columns`** sur
`.app-shell`, pas par une largeur fixe sur le panel.

Tokens de base (`styles/tokens.css`) :

```css
--app-sidebar-width: 260px;
--app-sidebar-width-collapsed: 56px;
```

**Formule canonique** (même formule pour tous les modes), avec override runtime —
`styles/layout.css` :

```
var(--app-right-panel-width-runtime, max(610px, calc((100vw - sidebar) / 3)))
```

→ par défaut **1/3 de (viewport − sidebar), plancher 610px**. Les 4 combinaisons :

| État                      | `grid-template-columns`                   |
| ------------------------- | ----------------------------------------- |
| panel ouvert              | `260px / 1fr / max(610px, (100vw−260)/3)` |
| panel + sidebar collapsed | `56px / 1fr / max(610px, (100vw−56)/3)`   |

**Quand la status-card coexiste** (cf. `conversation-status-card.css`) la grille
passe à **4 colonnes** ; le panel passe en `grid-column: 4` et la formule change
(plancher **380px**, diviseur **/2**) :

```
sidebar / 1fr / 296px (carte) / max(380px, (100vw − sidebar) / 2)
```

**Override runtime (drag-resize)** — `--app-right-panel-width-runtime` :

- Posée inline sur `#appShell` **uniquement pendant le drag** de la poignée
  `[data-rpanel-resize]` (séparateur de 4px sur le bord gauche du panel).
- Calcul : `next = innerWidth − clientX`, clampé entre :
  - **min** `PANEL_MIN_WIDTH = 380px`
  - **max** `innerWidth − PANEL_MAX_RIGHT_GAP` (`PANEL_MAX_RIGHT_GAP = 400px`,
    pour garder ≥400px à sidebar + contenu).
- L'override est **réinitialisé à chaque ouverture fraîche** (`prev === null`,
  `resetPanelWidthOverride()`) → la formule redevient le défaut. Un swap de mode
  (Ideas→Drafts) **conserve** l'override pour que le resize survive.
- L'ancienne clé `localStorage["archie-rpanel-width"]` (ère pré-formule) est
  **effacée à l'init** (`clearLegacyPanelWidth`) — la largeur custom n'est donc
  **pas** persistée entre reloads.

> ⚠️ **Divergence code ↔ commentaire** : le commentaire en tête de
> `right-panel.js` évoque « (viewport − sidebar) / 2 ». La formule réellement
> appliquée par défaut est **/3 plancher 610px** (`layout.css`). Le `/2 plancher
380px` ne s'applique qu'au cas status-card + panel. Le commentaire a divergé.

---

## TL;DR — couplage des 3 surfaces

Ouvrir un right-panel : (1) **auto-collapse** la sidebar (one-shot, sans restore)
et (2) **masque la status-card** en lui cédant la colonne 3. Carte et panel ne
s'affichent jamais ensemble (sauf `context-brief`, grille à 4 colonnes). La
sidebar reste ensuite indépendante (⌘B + re-collapse au resize). Taille du
panel = formule de grille `max(610px, (100vw − sidebar) / 3)`, surchargeable
transitoirement par le drag entre **380px** et **`100vw − 400px`**.
