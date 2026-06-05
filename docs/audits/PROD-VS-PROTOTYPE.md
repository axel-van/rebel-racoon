# Prod vs Prototype — Rapport de différence

> Comparaison entre **Studio** (prod : `app.beta.agorapulse.com/studio/197`) et le **prototype Archie** (ce repo, servi en local sur `localhost:8000` et mirror `mbousendorfer.github.io/rebel-racoon/`).
>
> Auteur : Matthieu Bousendorfer · Date : 2026-06-04 · Méthode : exploration côte-à-côte dans Chrome (claude-in-chrome MCP), lecture du code du proto, références au design system Agorapulse (`ds-css` MCP, `ds/desktop_variables.css`, `ds/css-ui/index.css`).
>
> **Portée** : on ignore l'app shell Agorapulse autour de Studio (Boîte de réception, Calendrier, Idées globales, Brouillons, Analytique, Veille, Advocacy…). Le comparable est **Studio (prod) ↔ Archie (proto)**.

---

## Comment lire ce rapport

Chaque écran est analysé selon 4 dimensions :

| Dimension | Ce qu'on regarde |
|---|---|
| **Visuel / UI** | Layout, couleurs, typo, espacements, états, iconographie, conformité DS |
| **Fonctionnel** | Présence/absence de features, parité des actions, comportement |
| **UX / copy / interactions** | Microcopy, ordre des steps, modales, animations, raccourcis |
| **Architecture / data model** | Concepts, entités, hiérarchie, terminologie, intégrations |

Sévérité des écarts :

- 🔴 **Bloquant** — la prod et le proto divergent sur un fondamental (concept manquant, flow cassé).
- 🟠 **Majeur** — différence structurante qui change l'expérience.
- 🟡 **Mineur** — incohérence à corriger mais pas critique.
- ⚪ **Cosmétique** — détail de design ou de copy.

Direction de l'écart :
- **→ Aligner la prod** : le proto a la bonne version, la prod doit rattraper.
- **← Aligner le proto** : la prod a raison, le proto a divergé.
- **↔ Décision produit** : les deux approches sont valides, il faut trancher.

---

## Table des matières

1. [Vue d'ensemble — positionnement et architecture globale](#1-vue-densemble)
2. [App shell — sidebar + topbar + composer chrome](#2-app-shell)
3. [Dashboard / entry point](#3-dashboard)
4. [Session de chat — le cœur](#4-session-de-chat)
5. [Playbooks — liste + détail + édition](#5-playbooks)
6. [Ideas library](#6-ideas-library)
7. [Connectors](#7-connectors)
8. [Settings](#8-settings)
9. [Onboarding — welcome-alt](#9-onboarding)
10. [Bugs et défauts détectés](#10-bugs)
11. [Synthèse — gaps prioritaires et recommandations](#11-synthèse)

---

<a id="1-vue-densemble"></a>
## 1. Vue d'ensemble — positionnement et architecture globale

### Positionnement produit

| Aspect | Prod (Studio) | Prototype (Archie) |
|---|---|---|
| Nature | Sous-produit "Studio" **embedded** dans l'app Agorapulse complète | App **standalone** avec son propre shell |
| URL | `/studio/:sessionId` | `/#/session/:id`, `/#/ideas`, `/#/contexts`, `/#/connectors`, `/#/settings`, `/#/welcome-alt` |
| Branding | "Archie BETA" dans la sous-sidebar | "Archie BETA" en logo principal sidebar |
| Voisins fonctionnels | Boîte de réception, Calendrier, Idées (globales), Brouillons, Librairie, Analytique, Veille, Advocacy | Aucun — le proto ne s'embarque dans rien |

🟠 **Majeur ↔ Décision produit** — Le proto suppose une expérience standalone (App Archie comme produit séparé). La prod a tranché en faveur d'un sous-produit Studio dans Agorapulse. Cette décision impacte le shell, les settings, les notifications, et la cohabitation avec Calendrier/Brouillons (qui sont des concepts redondants avec ce que le proto gère en interne).

### Mental model

| Concept | Prod | Proto |
|---|---|---|
| Conversation | "Session" / "Conversation" | "Session" / "Chat" |
| Source (input) | "Source" — PDF, URL, Video, Audio, Video Clip | "Source" — PDF, URL, Video, Audio, Video Clip + connectors (Notion, Slite, Drive, Slack) |
| Idée extraite | "Idea" (avec kind: Hook/Stat/Quote/Story/Insight) | "Idea" (même taxonomie + champ "potential" High/Medium/Low + draft action) |
| Draft | "Draft" / "Post" | "Draft" / "Post" |
| Brief réutilisable | **"Playbook"** (label UI), inclut **brand colors + typography + brand personality + voice analysis** | **"Playbook"** (UI doc) MAIS la base de code et toute l'UI lisible utilisent "Context" — voir [§5 Playbooks](#5-playbooks). Modèle : voice (tone) + audience + brief + DO/DON'T rules + default CTA + color tag |
| Programmation | Réutilise le Calendrier d'Agorapulse | `schedule-store.js` interne (modal de scheduling propre) |
| Compte social | Réutilise l'inbox Agorapulse | `social-profiles.js` standalone (mocks) |

🔴 **Bloquant ↔ Décision produit** — Le **modèle Playbook diffère fondamentalement** entre les deux. La prod a un Playbook "identité de marque visuelle" (couleurs, typo, voice extraite du site), le proto a un Playbook "règles éditoriales" (tone, DO/DON'T, audience, brief). Ces deux modèles ne sont pas opposés — ils sont complémentaires — mais aucune des deux implémentations ne couvre les deux dimensions. Il faut décider d'unifier les deux modèles (un seul Playbook qui contient brand visuel + règles éditoriales) ou de garder deux concepts séparés.

### Mode d'authentification / contexte utilisateur

| | Prod | Proto |
|---|---|---|
| Workspace | "AP Beta - WP 01" (Agorapulse standard) | Pas de workspace réel, mocks "Studio · Team" affichés en footer |
| Réel vs prototype | Session réelle persistée côté serveur | `localStorage` (mode `archie-user-mode`, feature flags), pas de persistance d'état |

---

<a id="2-app-shell"></a>
## 2. App shell — sidebar + topbar + composer chrome

### 2.1 Sidebar interne

**Prod (sous-sidebar Studio)** — comparant ce qui est *interne* à Studio, hors shell Agorapulse :

```
┌─────────────────────────────┐
│ Archie BETA              ← │
│ ◆ Give feedback            │
│ ┌─────────────────────────┐│
│ │ + New conversation      ││  ← bouton plein
│ └─────────────────────────┘│
│ ✨ Playbooks            2  │
│ ┌─────────────────────────┐│
│ │ 🔍 Search…              ││
│ └─────────────────────────┘│
│ PINNED                     │
│   ◯ Apr 15, 2026, 1:36 PM  │  ← pin icon en préfixe
│ RECENT                     │
│   May 28, 2026, 3:02 PM    │
│   …                        │
│   tezaazfazfaf             │  (data de test)
│   test x4                  │
│                          ⚙ │  ← gear bottom-right
└─────────────────────────────┘
```

**Proto (sidebar standalone)** :

```
┌─────────────────────────────┐
│ ✦ Archie BETA           ◀ │
│ ◆ Give feedback            │
│ ┌─────────────────────────┐│
│ │ + New conversation      ││
│ └─────────────────────────┘│
│ 💬 Chats                   │
│ 📁 Sources              3  │
│ ✨ Ideas               28  │
│ 📋 Contexts             3  │  ← label "Contexts", pas "Playbooks"
│ ┌─────────────────────────┐│
│ │ 🔍 Search…              ││
│ └─────────────────────────┘│
│ PINNED                     │
│   ◯ Q2 launch announcement │  (orange dot = active)
│ RECENT                     │
│   Riverside customer story │
│   State of Social → …      │
│   Weekly engagement recap  │
│                            │
│ MB  Matt Bousendorfer    ⚙│  ← user chip + gear
│     Studio · Team          │
└─────────────────────────────┘
```

| Élément | Prod | Proto | Écart |
|---|---|---|---|
| Brand "Archie BETA" + collapse arrow | ✔ | ✔ | OK |
| "Give feedback" lien | ✔ | ✔ | OK |
| "+ New conversation" CTA | ✔ filled outline-style | ✔ filled outline-style (DS `.ap-button`) | Visuellement très proches |
| Section navigation **Chats** | ❌ implicite (la liste Pinned/Recent est la nav) | ✔ entrée dédiée | 🟡 **Mineur ↔ Décision produit** — proto a une nav structurée |
| Entrée **Sources** (compteur) | ❌ exposé uniquement comme right-panel pill | ✔ compteur 3 | 🟠 **Majeur** — proto donne un accès first-class aux sources globales (cross-session) |
| Entrée **Ideas** (compteur) | ❌ exposé uniquement comme right-panel pill | ✔ compteur 28 | 🟠 **Majeur** — proto offre une "Library" globale Ideas (cross-session) |
| Entrée **Contexts** / Playbooks | ✔ "Playbooks (2)" | ✔ "Contexts (3)" | 🔴 **Bloquant** — vocabulaire incohérent (proto dit "Contexts", prod dit "Playbooks") |
| Search bar | ✔ inline | ✔ inline | OK — mais le proto a aussi un raccourci `⌘K` modal (`search-modal.js`) absent de la prod |
| Section PINNED | ✔ | ✔ | OK |
| Section RECENT | ✔ avec timestamps comme titres | ✔ avec titres custom + timestamps | Proto a des **vrais titres** ("Q2 launch announcement"), prod n'a que des timestamps → l'item est moins identifiable |
| Hover icons (pin, rename, delete) | ✔ pencil + trash en hover | ✔ via `sidebar.js` (rename-modal + confirm-modal) | OK |
| Footer user info | ❌ vit dans le shell Agorapulse | ✔ user chip + gear popmenu (Feedback / Bug / Shortcuts / Settings) | 🟠 **Majeur ↔ Décision produit** — proto gère son propre user/auth/settings ; prod délègue à Agorapulse |
| Settings cog | ⚙ minuscule en bottom-right (icône seule) | ⚙ avec popmenu structuré | 🟡 **Mineur → Aligner la prod** — le bouton prod est discret et peu découvrable |

🟠 **Majeur ↔ Décision produit (titres de session)** — Les titres "Jun 4, 2026, 4:40 PM" / "May 28, 2026, 3:02 PM" de la prod sont **inutilisables comme repères** quand on a 10+ conversations. Le proto auto-génère un titre éditorial (ex. "Q2 launch announcement") qui rend la liste scannable. **→ Aligner la prod** : exposer un rename inline + auto-naming depuis le sujet de la première saisie.

### 2.2 Topbar

**Prod** : `[title]                                            [Sources] [Ideas] [Drafts (n)] [Admin]`

**Proto** : `[☰] [title]                          [CONTEXT chip ▾]  [Drafts (n)] [Ideas]`

| Élément | Prod | Proto | Écart |
|---|---|---|---|
| Titre de l'écran | "May 28, 2026, 3:02 PM" (timestamp) | "Q2 launch announcement" (titre custom) | Voir §2.1 |
| Toggle sidebar (☰) | ❌ | ✔ icône liste à gauche | 🟡 **Mineur** |
| **Context chip** dans topbar | ❌ — le chip est dans le composer | ✔ chip prominent dans la topbar à droite du titre (`Acme · Q2 marketing ▾`) | 🟠 **Majeur ↔ Décision produit** — proto rend le Playbook actif **visible en permanence dans la topbar** + permet de switcher ; prod ne montre le Playbook que dans le composer |
| Pill **Sources** | ✔ avec icône folder | ❌ — Sources est sidebar | Voir §2.1 |
| Pill **Ideas** | ✔ avec sparkles icône | ✔ avec sparkles icône | OK |
| Pill **Drafts** + compteur | ✔ orange badge (count) | ✔ orange badge (count, `.ap-icon-pencil` + `.ap-icon-square-pencil`) | OK |
| Chip **Admin** | ✔ → ouvre le panneau event-log (debug) | ❌ en topbar (Admin est dans /settings → Admin section + chip au bottom-right) | 🟠 **Majeur ↔ Décision produit** — voir §10 |
| Status card flottante | ❌ | ✔ `conversation-status-card.js` (sources/ideas/drafts counts en cours) | 🟠 **Majeur** — proto a un **indicateur de progression live** pendant qu'Archie travaille en arrière-plan ; prod n'a rien d'équivalent |
| Bouton retour (Back) | ✔ contextuel (depuis playbook detail) | ✔ sur `/playbook/:id` uniquement | OK |

### 2.3 Composer

| Élément | Prod | Proto |
|---|---|---|
| Placeholder | "Ask Archie to compare ideas, find a signal, or draft the next move…" | **Identique** — "Ask Archie to compare ideas, find a signal, or draft the next move…" |
| Boutton Add (📎 paperclip) | ✔ menu : Attach PDF / Insert URL / Attach Video / Attach Audio (probablement Video Clip à scroller) | ✔ menu : Add source · Import from connector (si flag on) · …  |
| Chip Playbook dans composer | ✔ "Agorapulse 🔒" (lock icon → Playbook lock) ou "No Playbook 🔒" | ❌ — le Playbook est dans la topbar, pas le composer |
| Mentions @ | ❌ pas vu | ✔ `composer-mentions.js` — chips @mention en pré-écriture |
| Bouton envoyer | ✔ arrow circle | ✔ arrow circle |
| Hint shortcuts | "to send · Shift + for new line" | "to send · Shift + for new line · sends from anywhere · drag a file anywhere to add it as a source" |

| Écart | Sévérité |
|---|---|
| Placeholder identique au caractère près | ✔ aligné |
| Chip Playbook : prod l'a dans composer, proto dans topbar | 🟡 **Mineur ↔ Décision produit** — la position dans la topbar est plus visible cross-conversation ; dans le composer elle est plus proche du contexte d'envoi |
| Mentions @ | 🟠 **Majeur → Aligner la prod** — le proto permet de mentionner une source/idea/Playbook dans le composer, donnant un control fin sur ce qu'Archie utilise. Pas de signe de cette feature en prod |
| Hint shortcuts plus complet en proto | 🟡 **Mineur → Aligner la prod** — drag-and-drop file anywhere n'est pas mentionné en prod |
| Drag-and-drop d'un fichier n'importe où | Pas testé en prod | ✔ supporté (par hint) | 🟠 **Majeur → Aligner la prod** — feature découvrable et utile |

### 2.4 DS / conformité visuelle

Le proto utilise rigoureusement les classes DS : `.ap-button` (`.primary`, `.ghost`, `.stroked`, `.transparent`), `.ap-filter-chip`, `.ap-icon-*` et les tokens `--ref-*` / `--sys-*`. La prod (Studio) utilise aussi un tronc DS Agorapulse mais avec quelques composants custom plus avancés (preview LinkedIn-style des posts dans Drafts panel — voir §4.4).

Convention couleur **orange = AI / spotlight** vs **bleu = routine** — alignée entre les deux (CTA "+ New Playbook" orange dans les deux côtés ; chip Playbook orange filled ; CTA secondaires bleus).

---

<a id="3-dashboard"></a>
## 3. Dashboard / entry point

### Prod
- URL : `/studio` (sans ID) → redirige vers la dernière conversation ouverte OU vers la liste Playbooks selon l'état
- Pas de "dashboard" identifiable comme tel — l'écran d'accueil pour un returning user est la dernière session ou la liste Playbooks
- Pour un new user : flow d'onboarding global Agorapulse (hors scope ici)

### Proto
- URL : `/` → redirige selon `user-mode.js` :
  - `returning` user → most-recent session ou fresh session
  - `new-alt` user → `/welcome-alt` (onboarding intégré, voir §9)
- Pas de page d'accueil dédiée non plus

| Écart | Sévérité |
|---|---|
| Aucun dashboard explicite des deux côtés (redirect-only) | OK |
| Proto a un onboarding **interne** au produit (welcome-alt) | 🟠 **Majeur ↔ Décision produit** — voir §9 |

---

<a id="4-session-de-chat"></a>
## 4. Session de chat — le cœur

C'est l'écran principal des deux produits — toute la suite des observations est dense.

### 4.1 État vide (nouvelle conversation)

**Prod** — `New conversation` ouvre :
- Titre "Jun 4, 2026, 4:40 PM" (timestamp)
- Body central : icône orange (megaphone-like), **"Hi! I'm ready to help you create posts."** + **"Select a source type below to get started."**
- Source picker tabbé : **PDF · URL · Video · Audio · Video Clip**
- Dropzone PDF "Drop PDF or click to upload"
- Composer activé, chip Playbook "Agorapulse" pré-sélectionné

**Proto** — `New conversation` ouvre :
- Titre auto-généré
- Body central : message d'accueil Archie : **"Hi — I'll help you pick sources, sharpen angles, and draft posts. Attach a context (Voice, Brief, Brand) any time to make my suggestions sharper."**
- Pas de tabs source-picker — l'action picker conversationnel (`start-flow.js`) prend le relais selon le contexte (Playbook existant ou pas)
- Composer activé

| Écart | Sévérité |
|---|---|
| Empty state **très différent** : prod est form-driven (tabs), proto est conversation-driven | 🟠 **Majeur ↔ Décision produit** — l'approche prod est explicite et oriente vers l'action ; l'approche proto est plus conversationnelle. Tradeoff découvrabilité vs naturel. À trancher. |
| Copy d'accueil — prod = `"Hi! I'm ready to help you create posts."`  /  proto = `"Hi — I'll help you pick sources, sharpen angles, and draft posts. Attach a context (Voice, Brief, Brand) any time to make my suggestions sharper."` | 🟡 **Mineur** — proto donne plus de contexte sur ce qui va se passer ; prod est plus court |
| Source picker tabbé | Présent en prod uniquement | 🟠 **Majeur → Aligner le proto** ou décision produit — le tabbé prod permet de comprendre immédiatement quels types de sources sont supportés |
| Premier état avec Playbook pré-sélectionné | ✔ prod (Agorapulse par défaut) | 🟡 — proto laisse "No Playbook" possible (en prod c'est un état impossible, voir §4.2) |

### 4.2 Conversation sans Playbook attaché (état bloquant)

**Prod** — c'est un état spécifique :
- Body : **"Pick a context to start chatting"** + **"A context holds your brief, voice and brand theme — Archie needs one before it can generate posts on-brand. Choose one from the chip below."**
- Composer : placeholder "Pick a context to start chatting…", **chip "No Playbook" avec icône cadenas** → composer désactivé

**Proto** — pas d'état bloquant équivalent observé : le proto autorise la conversation sans Playbook (et le contexte se choisit/se crée via `context-builder.js`).

🔴 **Bloquant ↔ Décision produit** — la prod **force** la sélection d'un Playbook avant tout chat. Cela contredit le principe énoncé en CLAUDE.md : "Attach a context (Voice, Brief, Brand) **any time** to make my suggestions sharper." La prod a un Playbook obligatoire ; le proto un Playbook optionnel.

> ⚠️ **Vocabulary inconsistency in prod** — Dans cet état, la prod utilise simultanément les deux termes :
> - Titre : "Pick a **context**"
> - Corps : "A **context** holds your brief…"
> - Chip composer : "No **Playbook** 🔒"
>
> Le proto a exactement le même problème dans l'autre sens (UI "Contexts" partout malgré le label canonique "Playbook").

### 4.3 Thread peuplé

Structure commune :
```
[user bubble pill]
[assistant text]
[reasoning chip : "Ran 2 tools · 0.1s ⌄"]     ← expandable
  ├─ ⏵ Select Theme    · 0.0s
  └─ ⏵ Propose Angles  · 0.0s
[POST MIX card] (purple icon)
  1× LinkedIn, 1× X (2 total)
[Set Angle Mix · 0.0s]                         ← system notice (chip + check)
[ACCOUNTS card] (person icon)
  LinkedIn · X
[Set Publishing Accounts · 0.0s]
[assistant text : "Your N posts are being generated and will be available in the Drafts tab. You can continue chatting in the meantime!"]
```

Le proto a en **plus** :
- Une **handoff card orange** "2 drafts ready · Across 2 networks · review, edit, and schedule **[View drafts >]**" en bas du thread
- Cette card est l'élément visuel **le plus prominent** du thread proto, et fournit une CTA explicite vers le Drafts panel

| Élément | Prod | Proto | Écart |
|---|---|---|---|
| User bubble (pill) | ✔ teal/blue background, pill | ✔ teal/blue background, pill | Visuellement identique |
| User bubble pour upload | ✔ icône folder + filename | ✔ idem | OK |
| Assistant text | Sparkle icon (orange/red) à gauche | Sparkle icon à gauche | OK |
| Reasoning chip "Ran X tools · 0.1s" | ✔ dot orange + chevron expand | ✔ dot orange + chevron expand | OK |
| Tool calls listés (Select Theme, Propose Angles) | ✔ table compacte | ✔ table compacte | OK |
| POST MIX card (icône violette) | ✔ | ✔ | OK |
| ACCOUNTS card (icône personne) | ✔ "👤 DevTestCo" | ✔ "👤 LinkedIn · X" (mocks) | OK |
| System notice "Set X · 0.0s" (chip avec ✓) | ✔ | ✔ | OK |
| **Handoff card "N drafts ready"** | ❌ — seulement texte assistant | ✔ orange filled card avec CTA "View drafts >" | 🟠 **Majeur → Aligner la prod** — la card est plus actionnable que le texte |

### 4.4 Right panel — Drafts mode

#### Prod (Drafts panel) — RICHE

Structure d'une carte draft :
```
┌──────────────────────────────────────────────┐
│ [☑] D · DevTestCo                  • Draft ready│
│       LinkedIn Profile · Just now ·            │
│                                          [📅]│  ← schedule
│                                          [✎] │  ← edit
│                                          [🖼] │  ← attach image
│                                          [🗑] │  ← delete
│ Visceral reactions are the most honest         │
│ indicators of product-market fit 🤢            │
│ When a beta tester looks at your new feature  │
│ and says 'berk,' your first instinct is to    │
│ defend the code….                              │
│ …more                                          │
│ [✨ + Generate an image]                       │  ← full-width CTA
│ ◐◐◐ 24                          1 comment     │  ← engagement bar
│ 👍 Like  💬 Comment  🔁 Repost  ➤ Send         │  ← LinkedIn-style actions
│ D Add a comment…                               │
│ Most relevant ⌄                                │
│   DevTestCo (Author) · now                    │
│   See how we build tools that actually solve  │
│   SMM frustrations: https://agorapulse.com/…  │
│   Like | Reply                                 │
│ ◐ Generation context ⌄                         │  ← collapsible
│ [Voice 10/10] [Practices 9/10] [Details ⌄]    │
└──────────────────────────────────────────────┘
```

- Header panel : "Drafts" + close X
- Tabs : "All posts (5)" / "Needs fixes (0)"
- Compteur "5 posts" + CTAs **[Schedule]** [Save as draft] [🗑]
- Filtre Network : "All networks (5)" dropdown

#### Proto (Drafts panel) — MINIMAL

Structure :
```
┌──────────────────────────────────────────────┐
│ Drafts                                    ✕   │
│ Drafts             ↻ Regenerate               │
│ 2 posts · 2 selected                          │
│ [📅 Schedule 2 posts]                         │
│ LinkedIn 1                                    │
│ ┌──────────────────────────────────────────┐ │
│ │ [☑] in LinkedIn                  50/3000 │ │
│ │ The three constraints that killed our    │ │
│ │ first launch                              │ │
│ └──────────────────────────────────────────┘ │
│ X 1                                           │
│ ┌──────────────────────────────────────────┐ │
│ │ [☑] X                              50/280│ │
│ │ The three constraints that killed our    │ │
│ │ first launch                              │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

| Élément | Prod | Proto | Écart |
|---|---|---|---|
| Preview LinkedIn-style (avatar, reactions, comment) | ✔ très fidèle | ❌ — juste un titre+char-count | 🟠 **Majeur → Aligner le proto** — la preview prod aide l'utilisateur à valider le rendu social |
| Bouton "Generate an image" inline par draft | ✔ | ❌ — il existe `generate-image-modal.js` mais pas exposé par draft dans le panel | 🟠 **Majeur → Aligner le proto** |
| Generation context (Voice X/10, Practices Y/10) | ✔ — qualité signalée | ❌ | 🟠 **Majeur → Aligner le proto** — feedback de qualité utile |
| Filtre "Needs fixes" tab | ✔ — distingue les drafts en erreur | ❌ | 🟡 **Mineur → Aligner le proto** |
| Filtre par network | ✔ dropdown | ✔ groupé par section (LinkedIn 1, X 1) | OK — proto a une variante visuelle |
| Compteur char count par network | ❌ visible dans la prod ? | ✔ `50/3000`, `50/280` | 🟡 **Mineur → Aligner la prod** |
| Re-generate all CTA | ❌ | ✔ "↻ Regenerate" | 🟡 **Mineur → Aligner la prod** |
| Bouton "Save as draft" top-level | ✔ | ❌ (le proto les sauvegarde implicitement) | 🟡 |
| Comment composer + comment list | ✔ | ❌ | 🟠 **Majeur → Aligner le proto** ou décision produit (les comments sont-ils du chat ou un mock pour preview ?) |

🔴 **Bloquant → Aligner le proto** — Le draft panel prod est **dramatiquement plus mature**. Le proto a un panel de gestion de drafts (sélection + scheduling) mais pas de preview de rendu social.

### 4.5 Right panel — Ideas mode

**Prod** :
- Header "✨ Ideas" + close X
- Search bar
- **Filter chips** (DS `.ap-filter-chip` pattern) : **All / Hooks / Stats / Quotes / Stories / Insights** — `aria-pressed` driven
- Cards :
  - Kind chip top-left ("HOOK", "INSIGHT", "STAT", "STORY", "QUOTE")
  - Title (bold)
  - Description
  - **Hashtags** chips (#webfeedback, #uxfrustration…)
  - Source filename "review-agorapulse-inbox-3-654-8f47acdd.pdf"
  - CTA "↑ Use" à droite

**Proto** (right-panel mode + /ideas standalone) :
- Filtre identique (All/Hooks/Stats/Quotes/Stories/Insights)
- Cards similaires avec :
  - Kind chip + **potential badge** ("● High potential" / Medium / Low)
  - Hashtags
  - Source expandable ("Sources ▼")
  - Date "2d ago"
  - CTA "✦ Draft Post" (au lieu de "Use")
  - Menu "…" (more actions)

| Écart | Sévérité |
|---|---|
| Taxonomie kinds (Hook/Stat/Quote/Story/Insight) | ✔ alignée parfaitement | — |
| **Potential badge** | ❌ prod | ✔ proto | 🟡 **Mineur → Aligner la prod** ou décision produit |
| CTA principal "Use" vs "Draft Post" | "Use" (prod) — sans verbe d'action clair | "Draft Post" (proto) — explicite | 🟡 **Mineur → Aligner la prod**, le verbe proto est plus clair |
| Menu more (…) | ❌ prod | ✔ proto | 🟡 |
| Date relative | ❌ prod | ✔ proto | 🟡 |

### 4.6 Right panel — Sources mode

**Prod** :
- Header "📁 Sources" + close X
- Description : "Documents, videos, and audio used as input. Extracted ideas appear in the Ideas tab."
- Card :
  - Icône type (PDF)
  - Filename
  - Date "May 28"
  - Count badge "5"
  - **Actions** (rangée de liens) : **Ask a question · 🔄 Extract more · 🚫 Remove**

**Proto** :
- Header "Sources" + close X (mode `sources` du right-panel)
- État affiché : sources avec leur état (uploading → processing → done) via `sources-stream.js`
- Cards source-card.js : icône kind, titre, count idées extraites, état (chip)
- Actions : Ask, Extract more, Rename, Delete
- Empty state "No sources yet — drop a file to get started"

| Écart | Sévérité |
|---|---|
| Actions par source (Ask / Extract more / Remove) | ✔ alignées | — |
| **État processing visible (chip animé)** | ❌ prod (semble synchrone) | ✔ proto (`sources-stream.js`) | 🟠 **Majeur → Aligner la prod** — sans feedback de progression, l'utilisateur ne sait pas où en est l'extraction |
| Drop file anywhere | ? | ✔ (hint composer mentionne) | 🟡 |
| Live connectors (Notion, Slite, …) listés ici | ❌ | ✔ si feature flag on | Voir §7 |

### 4.7 Composer — Add menu

**Prod** — clic 📎 :
- Attach PDF
- Insert URL
- Attach Video
- Attach Audio
- (probable Video Clip à scroller — pas vérifié)

**Proto** — clic + :
- (à vérifier dans `add-source-modal.js`) — tabs : Upload / URL / Connectors
- Si flag `connectors` on → sous-menu "Connected sources" (Notion, Slite, Drive, Slack)

### 4.8 Suggestions / quick prompts

🔴 **Bloquant** — **Bug visuel** dans le proto : la section de suggestions de prompts (`session.__assistant-suggestions`) **rend son HTML en clair** (texte brut affichant `<div class="…">…</div>`). Visible sur les routes `/`, `/contexts` (redirigée), `/connectors` (redirigée), `/welcome-alt` (returning).

```
<div class="session__assistant-suggestions" data-assistant-prompts>
  <button type="button" class="assistant-prompt" data-assistant-prompt="Find the strongest post angle in this session">
    <span class="assistant-prompt__title">Find strongest signal</span>
  </button>
  …
</div>
```

Cela ressemble à un appel à `html\`...\`` avec un fragment **déjà escapé** (ou un `escapeHtml()` de trop sur un résultat de `raw()`). Voir §10.

Côté prod, des suggestions équivalentes existent mais sont rendues correctement comme boutons cliquables.

---

<a id="5-playbooks"></a>
## 5. Playbooks — liste + détail + édition

### 5.1 Liste de Playbooks (page)

**Prod** (Studio → "Playbooks (2)" dans la sub-sidebar) :
- Titre : **"Playbooks"** + subtitle "2 Playbooks · applied across 4 chats"
- Search bar + CTA **"+ New Playbook"** (orange filled)
- 3 cards dans une grid :
  - **Agorapulse**
    - Icône drapeau (🇬🇧 — language tag ?)
    - Brief (3 lignes) : "Agorapulse is an award-winning social media management platform designed for businesses, agencies, and marketers of all sizes. It provides a…"
    - Chips "2" et "6"
    - **Dots couleur** (●●) — preview des brand colors (noir + orange)
    - Footer : "Updated 7 days ago"
  - **My first context**
    - Drapeau anglais
    - Italic placeholder : "No brief yet — open this Playbook to add one."
    - Chip "2" + dots (noir + orange)
    - "Updated 17 days ago"
  - **+ New Playbook** card (add-style avec sparkle)
    - Subtitle : "One brand, one voice, one goal — Archie aligns."

**Proto** (`/contexts`) :
- Topbar title : **"Contexts"** (vocabulary leak !)
- LIBRARY · h1 **"Contexts"**
- Subtitle "3 contexts · applied across 5 chats"
- Search + CTA "+ **New context**"  ← copy fix needed
- 3 cards dans grid :
  - **Acme · Q2 marketing** (Acme)
    - Header coloré gauche (orange) — color tag visuel
    - "4 chats" badge top-right
    - Brief : "Drive awareness for Acme's Q2 launch. Lead with concrete time savings + customer outcomes, not feature lists."
    - **Style tags** : `[Direct]` `[Operator-first]`
    - **DO / DON'T** rules listées :
      - DO : Use "we" and "you" — never third person · Open with a hook or specific number
      - DON'T : No emoji in B2B contexts · Avoid jargon: "synergy", "leverage", "10x"
    - Footer actions : **Edit** | duplicate | delete
  - **Founder voice only** (Jamie Torres · Personal)
    - Header bleu
    - "1 chat"
    - Brief, style tags, DO/DON'T
  - **Customer stories** (Acme)
    - Header vert
    - "0 chats"
    - Brief, style tags, DO/DON'T

| Élément | Prod | Proto | Écart |
|---|---|---|---|
| Nom du concept (label UI) | **"Playbook"** | **"Contexts"** | 🔴 **Bloquant** — vocabulary leak du code (`contexts-store`) vers l'UI |
| Card preview du contenu | Brief + **couleurs** (dots) | Brief + **règles DO/DON'T** + style tags | 🔴 **Bloquant ↔ Décision produit** — voir §5.2 |
| Drapeau langue | ✔ | ❌ | 🟡 **Mineur → Aligner le proto** (multi-language ?) |
| Workspace tag (ex "Acme" / "Jamie · Personal") | ❌ | ✔ | 🟠 **Majeur → Aligner la prod** — proto distingue Playbooks d'équipe vs perso |
| Chips de stats (chats count) | ✔ "2" + "6" (ce que ça représente ?) | ✔ "4 chats" badge clair | 🟡 — proto est plus lisible |
| Date "Updated X days ago" | ✔ | ❌ — pas affiché sur les cards proto | 🟡 |
| Add-card (+ New Playbook) | ✔ tile add-style | ❌ — proto a un bouton dans le header | 🟡 |
| "+ New" CTA | ✔ "+ New Playbook" | ❌ "+ New context" | Vocabulary fix |

### 5.2 Détail / édition d'un Playbook

#### Prod — modèle "identité de marque visuelle"

Panneau latéral droit ouvrant sur le détail :

```
Agorapulse                                  [+ duplicate] [🗑]
────────────────────────────────────────────────────────────
[ Scrolled section :  Brand voice extracted from website ]

FORMATTING STYLE
The author employs a highly scannable and digestible formatting rhythm.
Posts are broken into short paragraphs, typically 1-3 sentences long,
separated by frequent line breaks. Bullet points (using ✦, ➜, ◆) are
extensively used to list updates, key takeaways, or discussion points…

VISUAL STYLE
Emojis are a prominent feature, used liberally and strategically to add
visual flair, convey emotion, or highlight key information. They often
appear at the end of sentences or phrases (e.g., 🚀, 🎯, ✅, …)
…

📎 [Upload a brand document]     ← PDF/DOCX/TXT
🔄 [Re-extract voice from Agorapulse]

BRAND
[Visual identity]
"Archie picked these up from your site so visuals stay on-brand."

BRAND COLORS
  Primary    [█] #212E4A
  Secondary  [ ] #000000
  Accent     [█] #FF6726
  Background [ ] #FFFFFF
  Text       [█] #FF6726

TYPOGRAPHY
  Primary    Averta
  Heading    Averta

BRAND PERSONALITY
  professional

🔄 [Re-analyze from website]

[Cancel]                                       [Save changes]
```

#### Proto — modèle "règles éditoriales"

Panneau latéral droit :

```
Contexts                                    [duplicate] [🗑]
Define brand, audience, brief and tone — Archie applies it every draft.
────────────────────────────────────────────────────────────
Acme · Q2 marketing

COLOR TAG
  ● ● ● ● ● ●        (orange selected — single color, no brand semantic)

BRAND
  Acme

AUDIENCE
  Who you're writing for. Affects vocabulary, examples, references.
  [Operators and marketing leads at 50–200-person B2B startups.]

CURRENT BRIEF
  What posts in this context should accomplish. Update per campaign.
  [Drive awareness for Acme's Q2 launch. Lead with concrete time
   savings + customer outcomes, not feature lists.]

TONE OF VOICE
  Pick 1–3. Archie blends them.
  Friendly  Professional  Bold  Witty
  Inspirational  [Direct]  Conversational  Authoritative

DO  (Patterns we always follow.)
  [Use "we" and "you" — never third person                  ] [✕]
  [Open with a hook or specific number                      ] [✕]
  [End every post with a clear next step                    ] [✕]
  [+ Add rule]

DON'T  (Patterns we never use.)
  [No emoji in B2B contexts                                 ] [✕]
  [Avoid jargon: "synergy", "leverage", "10x"               ] [✕]
  [+ Add rule]

DEFAULT CTA
  [Try Acme free for 30 days.]

All changes saved
```

#### Diff field-by-field

| Champ | Prod | Proto |
|---|---|---|
| Color tag (single accent color) | ❌ | ✔ palette de 6 |
| **Brand name (text)** | ✔ "Brand" input | ✔ "Brand" input |
| **Audience** | ❌ | ✔ textarea |
| **Brief** | ❌ — équivalent dans la description analysée ? | ✔ "Current brief" textarea |
| **Tone of voice (multi-select pills)** | ❌ — la "voix" est extraite du site (Formatting style + Visual style + Brand personality) | ✔ 8 options à picker |
| **DO rules (list)** | ❌ | ✔ |
| **DON'T rules (list)** | ❌ | ✔ |
| **Default CTA** | ❌ | ✔ |
| Brand colors (primary/secondary/accent/background/text) | ✔ 5 inputs colorpicker | ❌ — proto a juste un color tag |
| Typography (primary/heading font) | ✔ | ❌ |
| Brand personality (text) | ✔ "professional" | ❌ — pourrait mapper à "tone of voice" mais c'est plus large |
| Formatting style (longue description analysée) | ✔ | ❌ |
| Visual style (longue description analysée) | ✔ | ❌ |
| Re-analyze from website | ✔ | ❌ |
| Re-extract voice from brand | ✔ | ❌ — proto a `context-mock-analysis.js` qui simule cette analyse pendant l'onboarding mais ne l'expose pas dans l'éditeur |
| Upload brand document | ✔ (PDF/DOCX/TXT) | ❌ |

🔴 **Bloquant ↔ Décision produit** — Les deux modèles sont **largement disjoints**. Aucune des deux implémentations ne contient l'intégralité des champs utiles.

| Modèle | Force | Faiblesse |
|---|---|---|
| Prod | Capture l'identité **visuelle** et stylistique implicite (typo, couleurs, formatting, voice extraction) — pilote la **forme** des posts | Pas de règles explicites (DO/DON'T), pas de CTA par défaut, pas de notion d'audience |
| Proto | Capture les règles **éditoriales** explicites (audience, DO/DON'T, ton, CTA) — pilote le **contenu** des posts | Pas de visuels (brand colors, typo), pas d'analyse automatique du site |

**Recommandation** : unifier en un Playbook qui combine les deux dimensions, organisé en sections :
1. **Identité** (brand name, audience, langue)
2. **Visuel** (brand colors, typography — depuis prod)
3. **Voice & tone** (tone-of-voice picker + brand personality)
4. **Règles éditoriales** (DO / DON'T rules, default CTA — depuis proto)
5. **Voice extraction** (formatting style + visual style — depuis prod, auto-analysés)

### 5.3 Édition conversationnelle

| | Prod | Proto |
|---|---|---|
| Édition d'un champ via chat | ❌ — édition uniquement form-based | ✔ `playbook-editor.js` — chaque champ peut être modifié via mini-conversation Archie ("What's the new brief?" → réponse libre → Archie reformule et confirme) |
| Création d'un Playbook via chat | ❌ — création form-based (1 input "name") | ✔ `context-builder.js` — flow conversationnel multi-étapes pendant l'onboarding ou via "+ New context" |

🟠 **Majeur → Aligner la prod** — Le proto pousse l'édition conversationnelle comme un differentiator UX clé d'Archie. La prod garde une approche form-only qui est moins "AI-native".

### 5.4 Lien Playbook ↔ Session

| | Prod | Proto |
|---|---|---|
| Switch de Playbook depuis le chat | Composer chip (clic = ?) | Topbar chip (dropdown explicite) |
| Lock du Playbook (impossible sans) | ✔ — chat bloqué | ❌ — chat possible sans Playbook |
| Affichage du Playbook actif dans le thread | ✔ — implicite ("Using your **Agorapulse** style for these posts") | ✔ — chip topbar |
| Création inline d'un Playbook depuis le chat | ❌ | ✔ `context-builder.js` |

---

<a id="6-ideas-library"></a>
## 6. Ideas library

| | Prod | Proto |
|---|---|---|
| Page Ideas standalone | ❌ — Ideas est juste un right-panel | ✔ `/ideas` — page dédiée plein écran |
| Layout | Panel droit ~360px | Grid 3 colonnes pleine page |
| Filtres kind | ✔ chips | ✔ chips |
| Search | ✔ | ✔ |
| Sort | ❌ | ✔ "Most recent" dropdown |
| Re-mine sources | ❌ | ✔ CTA top-right |
| + New idea (manual creation) | ❌ | ✔ |
| Idea card preview | Title + desc + hashtags + source + Use | Title + desc + hashtags + **potential badge** + Draft Post + … menu |
| Cross-session library | ❌ — chaque session a ses ideas | ✔ — la library est globale, partageable cross-session |

🟠 **Majeur → Aligner la prod** — Le proto traite Ideas comme une **library cross-session** : les ideas extraites depuis n'importe quelle source sont disponibles partout. La prod scope Ideas à la session courante.

🟡 **Mineur → Aligner la prod** :
- Pas de standalone Ideas page en prod (forcé à passer par le right panel)
- Pas de sort
- Pas de re-mine
- Pas de manual create
- Pas de potential badge

---

<a id="7-connectors"></a>
## 7. Connectors

### Proto
- Page `/connectors` (gated par feature flag `connectors`, default OFF)
- Sub-page de Settings → Connectors (visible même sans flag, exemple capturé : Slite ✓ connected, Notion ✓ connected, Google Drive disconnected, Slack disconnected)
- Modal `connectors-modal.js` accessible depuis :
  - Composer Add menu → "Connected sources"
  - Sources right-panel → "Connect"
  - Add-source modal → tab "Connectors"
- Mocks dans `mocks.js` : Notion, Slite, Google Drive, GitHub (et probablement plus)
- Chaque connecteur connecté devient une **source live** : `assistant.js sendConnectorMessage()` simule un round-trip MCP (reasoning chip "Querying X via MCP" + answer cité)
- Catégories : `category` / `featured` / `accent` / `capabilities`

### Prod
- **Aucune trace de connectors dans Studio**.
- L'app Agorapulse globale a des intégrations (LinkedIn, X, Facebook…) mais ce sont des **publishing channels**, pas des **sources de knowledge**. La distinction est claire et c'est une feature **nouvelle** que le proto introduit.

🟠 **Majeur → Aligner la prod** (ou décision produit) — Les connectors comme **source de knowledge live MCP-queryable** sont une feature signature du proto. Si la prod veut suivre cette direction, c'est un chantier complet (UX galerie + ack flow + state machine `connected/disconnected/syncing/error` + intégration avec Sources panel).

---

<a id="8-settings"></a>
## 8. Settings

### Proto — `/settings` (ou ouvert depuis sidebar gear popmenu)

Side panel avec nav latérale gauche :

```
┌─────────────────────────────┐
│ Settings              ✕    │
│ ┌──────────┬─────────────┐ │
│ │ ◆ Connectors          │ │
│ │ ◇ Contexts            │ │
│ │ ◇ Generation prefs    │ │
│ │ ◇ Social accounts     │ │
│ │ ◇ Notifications       │ │
│ └──────────┴─────────────┘ │
└─────────────────────────────┘
```

- **Connectors** : list connectors (Slite/Notion connected, Drive/Slack disconnected) avec connect/disconnect
- **Contexts** : summary cards (Acme · Q2 marketing avec chips [Voice][Brief][Brand], Founder voice only [Voice], Customer stories [Empty])
- **Generation preferences** : (à vérifier — paramètres de génération)
- **Social accounts** : connected social profiles (LinkedIn, X, …)
- **Notifications** : préférences

Par ailleurs : section **Admin** dans `/settings` qui sert de **prototype control panel** (user-mode switcher, feature flags toggles).

### Prod — Studio n'a pas de Settings propre

Toutes les préférences (notifications, social accounts, profile, password…) sont gérées dans l'app shell Agorapulse (Utilisateur/profil, Notifications). Studio ne duplique pas, c'est cohérent avec son positionnement de sous-produit.

🟠 **Majeur ↔ Décision produit** — Si on aligne sur le positionnement "Studio embedded", les sections Connectors / Generation preferences / Social accounts du proto doivent migrer vers Agorapulse global (ou s'effacer si redondantes). Si on aligne sur "Archie standalone", il faut les développer comme dans le proto.

---

<a id="9-onboarding"></a>
## 9. Onboarding — welcome-alt

### Proto — `/welcome-alt` (déclenché pour `new-alt` user)

- Layout **full-bleed** (corps avec `.onboarding` class — pas de sidebar/topbar)
- Étape 1/3 : "Welcome · Let's understand your brand. Point me at your website and I'll capture what makes your brand yours — then shape it into a Playbook that guides every post toward your voice. Voice · Audience · Brand colors"
- Input "What's your website URL?"
- Footer hint : "↑↓ navigate · 1–9 pick · Enter submit · Esc exit"
- Suite (selon `context-builder.js` + `context-mock-analysis.js`) :
  - Étape 2 : profile / role
  - Étape 3 : optional docs upload
- Recap final : `/welcome-alt/recap` — reveal du Playbook construit

### Prod
- Pas d'onboarding spécifique Studio observé (Studio démarre directement sur la dernière session ou la liste Playbooks).
- L'utilisateur arrive dans Studio avec un Playbook par défaut "My first context" préinstallé avec brief vide.

🟠 **Majeur → Aligner la prod** (ou décision produit) — Le proto pousse un **onboarding produit-AI** ambitieux : on capture la brand au lancement, on bâtit un Playbook personnalisé, on dévoile le résultat. La prod a juste un Playbook vide à remplir. Le delta UX est énorme pour la première impression d'Archie.

---

<a id="10-bugs"></a>
## 10. Bugs et défauts détectés

### 10.1 Proto — HTML rendu en clair (suggestions composer)

🔴 **Bloquant** — La section `<div class="session__assistant-suggestions" data-assistant-prompts>` apparaît comme **texte brut** au-dessus du composer dans plusieurs routes (`/`, `/contexts` après navigation, `/connectors` redirigé, etc.).

```
<div class="session__assistant-suggestions" data-assistant-prompts> <button type="button" class="assistant-prompt" data-assistant-prompt="Find the strongest post angle in this session"> <span class="assistant-prompt__title">Find strongest signal</span> </button> …
```

**Cause probable** : `html\`\`` escape par défaut. Soit le fragment est passé en valeur (au lieu d'utiliser `raw()`), soit `escapeHtml()` est appelé en plus sur un `raw()`. Voir `src/utils.js` (html/raw helpers) et `src/screens/session.js` ou `start-flow.js` pour le rendu des suggestions.

**Recommandation** : retrouver l'appel responsable (probablement `html\`${suggestionsHtml}\`` au lieu de `html\`${raw(suggestionsHtml)}\``).

### 10.2 Proto — Vocabulary leak "Contexts" partout

🔴 **Bloquant** — Malgré l'instruction CLAUDE.md ("Vocabulary: a saved AI context is a **Playbook** (UI label) but the code/store calls it a **Context**"), l'UI continue d'afficher "Contexts" :
- Topbar title sur `/contexts` : "Contexts"
- Sidebar nav item : "Contexts (3)"
- Settings nav item : "Contexts"
- CTAs : "+ New context"
- Edit panel header : "Contexts"
- Card du Settings : description "voice, brief, and brand. Create or edit one from inside any chat."

**Recommandation** : renommer dans toutes les vues utilisateur, en gardant le nom de fichier `contexts-store.js` côté code (refactor en deux temps : labels UI d'abord, IDs/fichiers ensuite si besoin).

### 10.3 Prod — Inconsistance "context" ↔ "Playbook"

🟠 **Majeur** — Sur l'écran "Pick a context to start chatting", la prod utilise les deux termes dans la même vue :
- Titre : "Pick a **context**"
- Corps : "A **context** holds your brief…"
- Composer chip : "No **Playbook** 🔒"

**Recommandation** : remplacer "context" par "Playbook" dans tout le copy de Studio.

### 10.4 Prod — Toast persistant "Une nouvelle version d'Agorapulse est disponible !"

⚪ **Cosmétique** — Toast visible sur **toutes** les captures prod, masquant partiellement le composer. À dismiss ou auto-hide.

### 10.5 Prod — Mojibake dans le Post mix

🟡 **Mineur** — Le card "Post mix" affiche `"1× The 'Brutal' Truth for SMMs, 2× Beta Testing: The ROI of Honesty, 2× Turning Trash into Gold, 1@@@@@@@ The Psychology of Feature Rejection"`. Le `1@@@@@@@` est probablement un emoji cassé (encodage / police manquante).

### 10.6 Prod — Titres de session = timestamps non navigables

🟠 **Majeur** — Voir §2.1. Liste de "May 28, 2026, 3:02 PM" × 5 et "test" × 4 dans Recent → inutilisable. **Auto-naming requis**.

### 10.7 Proto — `/playbook/:id` ne navigue pas comme prévu

🟡 **Mineur** — Navigation directe à `/playbook/ctx-acme` redirige vers `/session/s-acme-launch`. À investiguer (`renderPlaybook` dans `playbook.js` — peut-être un fallback si conditions non remplies).

---

<a id="11-synthèse"></a>
## 11. Synthèse — gaps prioritaires et recommandations

### 11.1 Tableau récapitulatif

| # | Gap | Sévérité | Direction | Section |
|---|---|---|---|---|
| 1 | Modèle Playbook divergent (visuel prod vs éditorial proto) | 🔴 | ↔ Décision produit (unifier) | §5.2 |
| 2 | Vocabulary leak "Contexts" partout dans le proto | 🔴 | ← Aligner le proto | §10.2 |
| 3 | Bug HTML rendu en clair dans le composer (`assistant-suggestions`) | 🔴 | ← Aligner le proto | §10.1 |
| 4 | Drafts panel : preview LinkedIn-style absent du proto | 🔴 | ← Aligner le proto | §4.4 |
| 5 | Chat bloqué sans Playbook (prod) vs Playbook optionnel (proto) | 🔴 | ↔ Décision produit | §4.2 |
| 6 | Connectors comme source de knowledge MCP | 🟠 | ↔ Décision produit | §7 |
| 7 | Onboarding interne (welcome-alt) absent en prod | 🟠 | ↔ Décision produit | §9 |
| 8 | Titres de session = timestamps non navigables (prod) | 🟠 | → Aligner la prod | §2.1, §10.6 |
| 9 | Édition conversationnelle des Playbooks (proto only) | 🟠 | → Aligner la prod | §5.3 |
| 10 | Ideas library cross-session (proto only) | 🟠 | → Aligner la prod | §6 |
| 11 | Status card flottante (in-progress indicators) — proto only | 🟠 | → Aligner la prod | §2.2 |
| 12 | Mentions @ dans le composer (proto only) | 🟠 | → Aligner la prod | §2.3 |
| 13 | Handoff card "N drafts ready" (proto only) | 🟠 | → Aligner la prod | §4.3 |
| 14 | Generation context (Voice/Practices ratings) (prod only) | 🟠 | ← Aligner le proto | §4.4 |
| 15 | Generate image inline par draft (prod only) | 🟠 | ← Aligner le proto | §4.4 |
| 16 | Sources sidebar nav globale (proto only) | 🟠 | → Aligner la prod | §2.1 |
| 17 | Inconsistance "context" ↔ "Playbook" en prod | 🟠 | → Aligner la prod | §10.3 |
| 18 | État processing live des sources (proto only) | 🟠 | → Aligner la prod | §4.6 |
| 19 | Source picker tabbé empty state (prod only) | 🟠 | ↔ Décision produit | §4.1 |
| 20 | Pas de standalone Ideas page (prod) | 🟡 | → Aligner la prod | §6 |
| 21 | Workspace tag sur Playbook card (Acme/Personal) (proto only) | 🟡 | → Aligner la prod | §5.1 |
| 22 | Potential badge sur idea card (proto only) | 🟡 | → Aligner la prod | §4.5 |
| 23 | Sort + Re-mine sur Ideas (proto only) | 🟡 | → Aligner la prod | §6 |
| 24 | Drapeau langue sur Playbook card (prod only) | 🟡 | ← Aligner le proto | §5.1 |
| 25 | Settings center interne (proto only) | 🟡 | ↔ Décision produit | §8 |
| 26 | Char counter par network sur drafts (proto only) | 🟡 | → Aligner la prod | §4.4 |
| 27 | Re-generate all drafts CTA (proto only) | 🟡 | → Aligner la prod | §4.4 |
| 28 | "Needs fixes" tab sur drafts (prod only) | 🟡 | ← Aligner le proto | §4.4 |
| 29 | Toast version Agorapulse persistant | ⚪ | → Aligner la prod | §10.4 |
| 30 | Mojibake "1@@@@@" dans post mix (prod) | 🟡 | → Aligner la prod | §10.5 |
| 31 | Verbe CTA "Use" vs "Draft Post" sur idea card | 🟡 | → Aligner la prod | §4.5 |
| 32 | Admin panel debug log (prod) vs feature flags (proto) | 🟠 | ↔ Différents besoins (peuvent coexister) | §2.2 |

### 11.2 Décisions produit à arbitrer

Avant tout chantier d'alignement, **5 décisions stratégiques** :

1. 🔴 **Positionnement** : Archie est-il un standalone ou un sous-produit Studio dans Agorapulse ?
   - Standalone (proto) → besoin de settings/notifications/auth internes
   - Embedded (prod) → besoin de cohabiter avec Calendrier/Brouillons/Idées globales d'Agorapulse, pas de duplication
   - **Recommandation** : la prod a déjà tranché pour embedded → le proto doit ajuster son shell pour cette réalité, mais peut continuer à itérer la couche AI/UX comme standalone pour vélocité.

2. 🔴 **Modèle Playbook** : unifier ou séparer ?
   - Unifier = un Playbook complet (identité + visuel + voice + règles éditoriales)
   - Séparer = deux concepts (Brand identity ≠ Editorial rules)
   - **Recommandation** : unifier en une fiche Playbook structurée en 4-5 sections (cf. §5.2). Le proto a les bonnes règles éditoriales, la prod a la bonne extraction visuelle. Combinés.

3. 🔴 **Playbook obligatoire ?**
   - Obligatoire (prod) → l'UX guide vers la qualité, mais friction high pour nouveaux users
   - Optionnel (proto) → flexibilité, mais Archie produit du contenu off-brand
   - **Recommandation** : obligatoire avec un Playbook par défaut auto-créé (avec brief vide mais voice par défaut "professional, friendly").

4. 🟠 **Connectors** : on développe ?
   - Le proto présente une vision "knowledge sources live MCP" (Notion, Slite, Drive, Slack)
   - **Recommandation** : OUI, c'est un differentiator évident. Phaser : feature flag MVP avec 2-3 connectors, gallery + state machine, intégration dans Sources panel.

5. 🟠 **Onboarding** : on intègre welcome-alt ?
   - Le proto a un onboarding ambitious qui capture la brand au lancement
   - **Recommandation** : OUI, comme welcome-flow ajouté à Studio uniquement pour le premier user d'un workspace (ou nouveau Playbook).

### 11.3 Roadmap d'alignement suggérée

**Phase 1 — Bugfixes (1 sprint)**
- Fix HTML rendu en clair (#3)
- Fix vocabulary "Contexts" → "Playbooks" dans tout le proto (#2)
- Fix inconsistance "context" ↔ "Playbook" en prod (#17)
- Fix titres de session non navigables en prod (#8)
- Fix toast Agorapulse persistant (#29)

**Phase 2 — Quick wins (2-3 sprints)**
- Ajouter handoff card "N drafts ready" en prod (#13)
- Ajouter status card flottante en prod (#11)
- Ajouter état processing live des sources en prod (#18)
- Ajouter potential badge + sort sur Ideas en prod (#22, #23)
- Ajouter char counter par network sur drafts en prod (#26)
- Ajouter "Re-generate all" CTA en prod (#27)
- Standalone /ideas page en prod (#20)
- Sources sidebar nav globale en prod (#16)

**Phase 3 — Refonte Playbook (1 trimestre)**
- Décision produit unifiée
- Migration data model (combinaison des deux schémas)
- Refonte UI éditeur (5 sections)
- Édition conversationnelle (#9)
- Workspace tagging des Playbooks (#21)

**Phase 4 — Drafts mature (1 trimestre)**
- Preview LinkedIn-style dans le proto (#4)
- Generation context ratings dans le proto (#14)
- Generate image inline dans le proto (#15)
- "Needs fixes" tab dans le proto (#28)
- Comment composer mockup (decision : keep or remove)

**Phase 5 — Features differentiating (1 trimestre)**
- Connectors live (proto-validated) (#6)
- Onboarding welcome-alt (#7)
- Mentions @ dans composer (#12)
- Drag-and-drop file anywhere (#12)
- Source picker tabbed empty state (#19, si on l'aligne au proto)

---

## Annexe : conventions DS référencées

Le proto suit strictement les conventions DS Agorapulse (cf. CLAUDE.md). Composants/patterns identifiés dans cette analyse :

- `.ap-button` (`.primary`, `.ghost`, `.stroked`, `.transparent`) — boutons
- `.ap-filter-chip` — filtres (aria-pressed driven) — utilisé dans Ideas filter chips, presence d'un équivalent en prod
- `.ap-icon-*` — icon font (sparkles, pencil, square-pencil, folder, person, etc.)
- `.ap-snackbar` — toasts (`toast.js`)
- Tokens DS : `--ref-spacing-sm`, `--ref-color-white`, `--sys-color-text-primary`, etc.
- Variantes documentées dans `ds/desktop_variables.css` + `ds/css-ui/index.css`

Convention couleur (du proto, alignée avec la prod) :
- **Orange = AI / spotlight actions** (Ask, Try in chat, primary AI CTA, "+ New Playbook")
- **Bleu = routine list-page CTAs** (Connect, Create, navigation)

---

## Annexe : captures écran

Les descriptions textuelles font foi dans ce rapport (chaque section décrit précisément ce qui a été observé côte-à-côte dans Chrome). Les captures n'ont pas été embarquées pour limiter la taille du document.
