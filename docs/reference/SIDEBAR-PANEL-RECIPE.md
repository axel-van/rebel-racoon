# Recette — sidebar + right panel (à recréer de zéro)

Document **autonome** : tout ce qu'il faut pour reconstruire le comportement
sidebar ↔ right panel (structure, tailles, collapse/expand couplé) sans lire
d'autre doc. Description fonctionnelle, **sans code** — à traduire dans
n'importe quelle stack.

> Pour les **règles produit** seules, voir [`PANEL-SIDEBAR-RULES.md`](PANEL-SIDEBAR-RULES.md).
> Pour le **détail tel qu'implémenté dans ce proto**, voir [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md).

---

## L'idée en une phrase

Sidebar et panel sont **deux colonnes d'une même grille**, pas des overlays.
Tout se pilote en basculant des **états** sur le conteneur, ce qui redistribue
les largeurs de colonnes. La sidebar **se rétracte / ré-étend toute seule selon
la place disponible** pour le chat — sauf si l'utilisateur l'a réglée à la main.

```
┌──────────┬─────────────────────┬──────────────┐
│ sidebar  │      contenu        │  right panel │
│ 260/56px │       1fr           │   ~1/3, ⩾610 │
└──────────┴─────────────────────┴──────────────┘
```

---

## Les 5 réglages (les seuls chiffres à connaître)

| Réglage           | Valeur            | Rôle                                               |
| ----------------- | ----------------- | -------------------------------------------------- |
| Sidebar étendue   | `260px`           | largeur de la sidebar complète                     |
| Sidebar rétractée | `56px`            | largeur du rail d'icônes                           |
| Plancher du panel | `610px`           | largeur mini du panel                              |
| Seuil de chat     | `560px`           | sous cette largeur de chat, la sidebar se rétracte |
| Bornes du drag    | `380px` / `400px` | min du panel / place toujours réservée au reste    |

Changer le ressenti = bouger **un** de ces chiffres. Ex. : sidebar qui reste
ouverte plus longtemps → baisser le seuil de chat.

---

## 1. Structure

Un conteneur en grille avec, de gauche à droite : **sidebar**, **contenu**
(le chat, qui occupe l'espace restant), et **right panel**. La topbar est une
rangée au-dessus. Le panel n'est **pas** un calque flottant : il occupe une vraie
colonne, donc l'ouvrir **réduit** la largeur du contenu au lieu de le recouvrir.

Trois **états** se posent sur le conteneur et redistribuent les colonnes :

| État              | Effet                                                         |
| ----------------- | ------------------------------------------------------------- |
| sidebar rétractée | la colonne 1 passe de `260px` à `56px`                        |
| panel ouvert      | **ajoute** la 3ᵉ colonne (sa largeur = la formule ci-dessous) |
| (combinaison)     | les deux peuvent être vrais en même temps                     |

Une **transition** sur la largeur des colonnes rend chaque collapse / expand
fluide. Au démarrage, l'état persisté de la sidebar est appliqué **avant** le
premier rendu pour éviter un saut de mise en page.

---

## 2. Tailles du panel

Largeur du panel par défaut :

> **un tiers de (viewport − sidebar), avec un plancher de 610px.**

Quand la sidebar est rétractée, c'est la largeur rétractée (56px) qui entre dans
le calcul. Une largeur **custom** (drag, cf. §4) prend le dessus quand elle est
posée, sinon la formule par défaut s'applique.

---

## 3. Le couplage — collapse / expand piloté par la largeur

C'est le cœur du sujet.

### Le principe : prédire, ne pas mesurer

On **calcule** la largeur qu'aurait le chat **si la sidebar restait étendue** :

> largeur chat = viewport − sidebar étendue (260) − largeur du panel

Ce calcul utilise **toujours** la valeur étendue (260), jamais l'état courant
(voir l'avertissement plus bas). On le **calcule** plutôt que de **mesurer**
l'élément à l'écran, pour ne pas être faussé par la transition de largeur encore
en cours.

### Les deux déclencheurs

- **À l'ouverture fraîche du panel** (transition fermé → ouvert, une seule fois,
  pas à chaque changement de mode interne) : si le chat prédit passerait **sous
  560px**, on rétracte la sidebar et on marque ce collapse comme **auto**. Sinon
  (grand écran) on ne touche à rien : la sidebar reste étendue.
- **Au redimensionnement de la fenêtre** (panel ouvert) : comportement
  **bidirectionnel** —
  - chat prédit **< 560px** → rétracter (marqué auto) ;
  - chat prédit **≥ 560px** et la sidebar a été rétractée **automatiquement** →
    la **ré-étendre**.

Pour ne pas saturer pendant un redimensionnement continu, le traitement du
resize est **throttlé à une frame** (un seul calcul par rafraîchissement).

À la **fermeture** du panel : **aucune** ré-extension automatique — l'utilisateur
ré-étend la sidebar lui-même.

### La distinction auto / manuel (indispensable)

Il faut retenir **pourquoi** la sidebar est rétractée :

- rétractée **par la règle de largeur** → marquée **auto** → pourra être
  ré-étendue automatiquement quand l'écran s'agrandit ;
- rétractée **à la main** (bouton chevron / ⌘B) → **manuel** → on ne la ré-étend
  jamais toute seule.

Conséquence : **toute action manuelle efface le marqueur auto**. Si l'utilisateur
rétracte (ou ré-étend) la sidebar lui-même, la règle de largeur cesse de la
piloter jusqu'à la prochaine rétraction automatique.

### Les comportements qui en découlent

| Situation                                   | Résultat                       |
| ------------------------------------------- | ------------------------------ |
| Ouvrir le panel, **grand écran**            | sidebar **reste étendue**      |
| Ouvrir le panel / rétrécir, **petit écran** | sidebar **se rétracte** (auto) |
| Auto-rétractée puis on **élargit**          | sidebar **se ré-étend**        |
| Rétractée **à la main** puis on élargit     | sidebar **reste rétractée**    |

> ⚠️ **Pourquoi la prédiction utilise toujours 260 (sidebar étendue), jamais la
> largeur courante** : sinon le seuil bougerait selon l'état → effet ping-pong
> (rétracter élargit le chat → on ré-étend → ça resserre → on rétracte…). Avec
> une prédiction **stable**, le seuil n'est franchi qu'à **une seule** valeur de
> viewport : aucune oscillation.

---

## 4. (Optionnel) Drag-resize du panel

Une poignée fine sur le **bord gauche** du panel permet de l'élargir / rétrécir.
Pendant le glissement, la largeur custom est calculée à partir de la position du
curseur et **bornée** : jamais en dessous de **380px**, jamais au point de
laisser moins de **400px** à l'ensemble sidebar + contenu.

Cette largeur custom **n'est pas persistée** : elle tient tant qu'on reste dans
le panel (y compris en changeant de mode interne), mais elle est **réinitialisée
à la prochaine ouverture fraîche**, où la formule par défaut reprend la main.

---

## Checklist de validation

- [ ] Panel ouvert sur **grand écran (≥ ~1440px)** → sidebar **reste étendue**.
- [ ] Panel ouvert sur **petit écran (~1280px)** → sidebar **se rétracte**.
- [ ] Auto-rétractée, puis on **élargit** la fenêtre → sidebar **se ré-étend**.
- [ ] Rétractée à la main (⌘B), puis on élargit → sidebar **reste rétractée**.
- [ ] Fermer le panel → sidebar **ne se ré-étend pas** toute seule.
- [ ] L'état étendu / rétracté **survit au reload**.
- [ ] Aucune **oscillation** quand on traverse lentement le seuil de largeur.
