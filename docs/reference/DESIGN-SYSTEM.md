# Design System — workflow & conventions

> Tout le travail UI/CSS doit passer d'abord par le DS Agorapulse V2. **Ne pas inventer un composant / un token / une icône** si le DS le fournit déjà.
>
> Les régressions causées par du CSS ad-hoc qui override les tokens DS sont **le bug #1** de ce repo. Cette doc cadre le workflow pour les éviter.

## Workflow obligatoire avant d'écrire du HTML / CSS

1. **Vérifier qu'un composant DS existe** — `list_components` sur le MCP `ds-css` ; `get_component <name>` pour les variantes / modifiers (`.stroked`, `.primary`, `.ghost`, `.transparent`, classes de couleur).
2. **Vérifier qu'une icône existe** — `search_icons <keyword>` avant d'ajouter du SVG inline. Usage : `<i class="ap-icon-{name}"></i>`.
3. **Utiliser les tokens DS, pas des valeurs hardcodées** — `search_tokens` + `recommend_token` sur le MCP, ou grep `ds/desktop_variables.css` pour `--ref-*` / `--sys-*`. Jamais `padding: 20px` quand `var(--ref-spacing-sm)` existe. Jamais `#fff` quand `var(--ref-color-white)` existe.
4. **Préférer `--sys-*` à `--ref-*`** quand un token sémantique existe (text-color, border-color, état de composant).
5. **CSS custom uniquement si rien dans le DS ne convient** — choisir le bon fichier :
   - `styles/ds-patches.css` — la **seule** place pour étendre une classe DS avec une variante manquante (ex. `.ap-filter-chip`, `.app-modal-backdrop`) ou ajouter une primitive que le DS a oubliée. Doit rétrécir au fil que le DS évolue.
   - `styles/screens/<screen>.css` — styling spécifique à un écran.
   - `styles/components/<component>.css` — styling partagé entre écrans.
   - **Jamais** redéclarer une classe `.ap-*` avec des overrides hors `ds-patches.css` — ça flippe la cascade silencieusement.
6. **Valider avant de commit** — `validate_css` sur le MCP `ds-css`.

## Tiers de tokens

| Tier | Usage |
|---|---|
| `--ref-*` | Reference tokens (couleurs, spacings, fontes, radii) — la base brute du DS |
| `--sys-*` | Semantic tokens (text/border colors, états de composants) — **préférer ces tokens** |
| `--comp-*` | Component-level tokens — ne pas utiliser directement en CSS app |

Exception documentée : l'icône `sparklesMermaid` utilise un SVG inline pour son gradient (pas un token). Les couleurs brand tierces (connector accents, social logos) vivent en data dans JS, pas en tokens DS.

## Convention couleur — usage app-wide

| Couleur | Usage |
|---|---|
| **Orange** | AI / spotlight actions — "Ask", "Try in chat", primary AI CTA, "+ New Playbook" |
| **Bleu** | Routine list-page CTAs — Connect, Create, navigation |

Réutiliser les primitives partagées : ex. tous les filter chips utilisent `.ap-filter-chip` (driven par `aria-pressed`), le même chip qu'utilise le Ideas panel.

## Files DS (générés par `scripts/sync-ds.mjs` — ne pas éditer)

```
ds/
  desktop_variables.css   — design tokens (--ref-*, --sys-*, --comp-*)
  css-ui/font-face.css    — Averta font-face
  css-ui/index.css        — toutes les classes .ap-*
  ap-icons.css            — icon font (<i class="ap-icon-*">)
  fonts/averta/           — OTF font files
```

Le dossier `ds/` est **gitignored** ; il est régénéré à chaque `npm install` via le `postinstall` hook (qui appelle `scripts/sync-ds.mjs`).

## Files app (en `styles/`)

```
styles/
  tokens.css        — tokens app-only (surface aliases, radius, mermaid accent)
  base.css          — resets, keyframes, app-wide token groupings
  layout.css        — app shell (sidebar / topbar / content / panel chrome)
  ds-patches.css    — la seule place légitime pour toucher .ap-*
  chat.css          — composer + thread chrome
  screens/          — dashboard, session, ideas, contexts, connectors, settings,
                      posts, analyse, playbook-editor, modals, sources, welcome
  components/       — sidebar, right-panel, conversation-status-card,
                      add-source-modal, connectors-modal, schedule-modal,
                      video-clips-modal, clip-card, archie-loader
```

## Composants `.ap-*` les plus utilisés

| Classe | Variantes | Usage proto |
|---|---|---|
| `.ap-button` | `.primary` `.stroked` `.ghost` `.transparent` `.danger` (patch) | CTAs |
| `.ap-icon-button` | `.stroked` `.transparent` `.lg` `.sm` | Boutons icon-only |
| `.ap-input` / `.ap-textarea` | — | Inputs |
| `.ap-card` | — | Conteneurs principaux |
| `.ap-tag` | — | Tags texte (hashtags, kind) |
| `.ap-badge` | — | Compteurs |
| `.ap-status` | `.green` `.orange` `.red` `.blue` `.grey` `.tagOrange` | Pills de statut |
| `.ap-snackbar` | — | Toasts (`toast.js`) |
| `.ap-filter-chip` | `aria-pressed` driven | Filtres (extension `ds-patches.css`) |

`list_components` sur le MCP `ds-css` pour la liste exhaustive.

## Icônes

Toujours via la font icon DS : `<i class="ap-icon-{name}" aria-hidden="true"></i>`. 290 icônes disponibles. Tailles via classes `.xs` `.sm` `.md` `.lg`.

Pour les boutons icon-only, **mettre `aria-label` sur le bouton** et `aria-hidden="true"` sur l'icône enfant.

## Anti-patterns connus

- Redéclarer `.ap-icon-button`, `.ap-button` avec `border`/`background` custom → utiliser les modifiers DS (`.stroked`, `.transparent`, `.primary`, color variants).
- Ajouter `padding: 20px` sur `.step-card`, `.source-header`, etc. dans un view file → ces classes sont déjà stylées centralement.
- Couleurs hex, radii px-based, spacings px qui ne matchent pas les tokens.
- Inventer une icône quand `search_icons` matche.
- Mettre `!important` pour résoudre un conflit de cascade — c'est presque toujours le signe qu'une ap-* est override hors `ds-patches.css`.

## MCP outils

Le MCP `ds-css` (configuré dans `.mcp.json`) :

- `list_components` — liste les `.ap-*`
- `get_component <name>` — détail d'un composant + ses variantes
- `search_icons <keyword>` — match d'icône
- `search_tokens <keyword>` — match de token
- `recommend_token` — propose le token pour une valeur donnée
- `get_text_style` — styles de texte du DS
- `get_layout_pattern` — patterns layout du DS
- `validate_css <file>` — détecte les valeurs hardcodées qui devraient être des tokens

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — patterns de composants
- [`../../CLAUDE.md`](../../CLAUDE.md) — résumé pour agents
