# Sidebar & right panel — règles (v1)

Set de règles simples qui décrivent **comment se comportent et se dimensionnent**
la **sidebar** et le **right panel** dans la zone session.

> Périmètre **v1** : la `conversation-status-card` n'est **pas** shippée en
> première version. Les règles ci-dessous ignorent donc la status-card. Pour le
> détail technique complet (status-card incluse, formules de grille, gardes
> internes), voir [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md).

Les deux surfaces sont des **colonnes d'une même grille** (`#appShell`), pas des
overlays : `sidebar | contenu | right panel`.

---

## Sidebar

1. **Deux états** : étendue (~260px, complète) ou rétractée (~56px, rail
   d'icônes). Jamais cachée.
2. **Toggle manuel** : bouton chevron en tête, ou **⌘B / Ctrl+B** (le raccourci
   est ignoré quand on tape dans un champ texte).
3. **État mémorisé** : le choix étendu/rétracté est retenu entre les sessions et
   appliqué dès l'ouverture (pas de flash).

---

## Right panel

4. **Une seule chose à la fois** : le panel a un seul contenu actif parmi
   **Drafts**, **Ideas** (avec sous-onglet Clips) et **Sources**. Ouvrir un mode
   remplace le précédent.
5. **Lié à la session** : le panel n'existe que sur une page de session. Quitter
   la session (Playbooks, Settings, Dashboard, changement de chat…) le ferme.
6. **Deep-link & retour navigateur** : le mode ouvert est encodé dans l'URL
   (`?panel=drafts|ideas|sources`), donc partageable et restauré au
   précédent/suivant.
7. **Fermeture** : bouton de fermeture du panel, ou **Échap** (Échap ferme
   d'abord un menu contextuel ouvert, puis le panel).

---

## Couplage sidebar ↔ panel

8. **Ouvrir le panel rétracte la sidebar** automatiquement — une seule fois, à
   l'ouverture (pas à chaque changement de mode), et seulement si elle était
   étendue.
9. **Pas de ré-extension auto** : à la fermeture du panel, l'utilisateur
   ré-étend la sidebar lui-même.
10. **Au redimensionnement de la fenêtre**, si un panel est ouvert et la sidebar
    étendue, elle se rétracte à nouveau (pour garder de la place au contenu).

---

## Tailles

11. **Largeur par défaut du panel** : **1/3 de l'espace disponible**
    (viewport − sidebar), avec un **plancher de 610px**.
12. **Redimensionnable à la souris** : une poignée sur le bord gauche du panel
    permet de l'élargir/rétrécir, entre **380px** minimum et **viewport − 400px**
    maximum (on garde toujours ≥400px pour la sidebar + le contenu).
13. **Largeur custom non persistée** : elle est conservée tant qu'on change de
    mode dans le même panel, mais **réinitialisée** à la prochaine ouverture
    fraîche et **non** mémorisée entre rechargements.
