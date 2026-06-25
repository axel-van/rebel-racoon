# Docs — index

Point d'entrée pour la documentation du proto Archie. **Toute la doc qui reste est à jour avec le code courant.** Les vieux audits, ux-audit, et autres docs obsolètes ont été supprimés (voir `git log` si besoin de les retrouver).

> **Pour les agents (Claude Code, Codex, …)** : commencer par [`../CLAUDE.md`](../CLAUDE.md) à la racine. Il pointe vers les bonnes sections de ce dossier selon le besoin.

---

## 📘 Reference — current truth about the proto

Documentation qui décrit l'état actuel du code. À maintenir à jour quand le code évolue.

| Document                                                                 | Sujet                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`reference/ARCHITECTURE.md`](reference/ARCHITECTURE.md)                 | Architecture du proto, lifecycle, source layout, patterns de fichiers                    |
| [`reference/ROUTES.md`](reference/ROUTES.md)                             | Route table, handoffs cross-routes, URL state hash query                                 |
| [`reference/STORES.md`](reference/STORES.md)                             | Stores : pattern de base, catalogue, persistence, invariants, singleton warning          |
| [`reference/DESIGN-SYSTEM.md`](reference/DESIGN-SYSTEM.md)               | Workflow DS obligatoire, tokens, composants `.ap-*`, MCP `ds-css`                        |
| [`reference/PANEL-SIDEBAR-RULES.md`](reference/PANEL-SIDEBAR-RULES.md)   | **Règles simples v1** sidebar + right panel (tailles & comportements), hors status-card  |
| [`reference/SHELL-LAYOUT.md`](reference/SHELL-LAYOUT.md)                 | Détail technique complet : right panel / status-card / sidebar + formules de tailles     |
| [`reference/SIDEBAR-PANEL-RECIPE.md`](reference/SIDEBAR-PANEL-RECIPE.md) | **Recette autonome** : recréer le comportement sidebar + right panel de zéro (sans code) |
| [`reference/GLOSSARY.md`](reference/GLOSSARY.md)                         | Vocabulaire produit, pipeline, ambiguïtés (Playbook ↔ Context)                           |

---

## 🔍 Audits — current

| Document                                                     | Date       | Sujet                                                                                                      |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| [`audits/PROD-VS-PROTOTYPE.md`](audits/PROD-VS-PROTOTYPE.md) | 2026-06-04 | Comparaison Studio (prod) ↔ Archie (proto) en 4 dimensions (visuel / fonctionnel / UX-copy / archi)        |
| [`audits/PROD-CHANGES.md`](audits/PROD-CHANGES.md)           | 2026-06-05 | Plan priorisé des changements à appliquer côté prod pour se rapprocher du proto                            |
| [`audits/ALPHA-FEEDBACK.md`](audits/ALPHA-FEEDBACK.md)       | 2026-06-10 | Retours des 12 sessions alpha (Mike Allton) : issues numérotées, statut dans le proto, solutions à choisir |

---

## ✍️ Copy — UX & voice

| Document                                             | Sujet                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`copy/copy-principles.md`](copy/copy-principles.md) | Voice, tone matrix, glossaire éditorial, patterns par famille de copy, style rules |

---

## 🗺️ Comment naviguer

| Tu cherches…                                            | Va voir                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Comment fonctionne le proto en général                  | [`reference/ARCHITECTURE.md`](reference/ARCHITECTURE.md)                 |
| Comment ajouter une route / un écran                    | [`reference/ROUTES.md`](reference/ROUTES.md)                             |
| Comment ajouter / modifier un store                     | [`reference/STORES.md`](reference/STORES.md)                             |
| Comment poser une couleur / un spacing                  | [`reference/DESIGN-SYSTEM.md`](reference/DESIGN-SYSTEM.md)               |
| Comment se comportent sidebar + right panel (v1)        | [`reference/PANEL-SIDEBAR-RULES.md`](reference/PANEL-SIDEBAR-RULES.md)   |
| Recréer le comportement sidebar + right panel de zéro   | [`reference/SIDEBAR-PANEL-RECIPE.md`](reference/SIDEBAR-PANEL-RECIPE.md) |
| Que veut dire "Playbook" / "Context" / "Idea" / "Draft" | [`reference/GLOSSARY.md`](reference/GLOSSARY.md)                         |
| Différences entre la prod Studio et le proto            | [`audits/PROD-VS-PROTOTYPE.md`](audits/PROD-VS-PROTOTYPE.md)             |
| Quels changements appliquer côté prod                   | [`audits/PROD-CHANGES.md`](audits/PROD-CHANGES.md)                       |
| Que dire / pas dire dans les copy                       | [`copy/copy-principles.md`](copy/copy-principles.md)                     |

---

## ✅ Maintenance

- **Quand tu modifies une convention** → mettre à jour à la fois [`CLAUDE.md`](../CLAUDE.md) ET le doc concerné dans `docs/reference/`.
- **Quand tu produis un audit** → poser le doc dans `docs/audits/` avec date + portée en intro. S'il devient obsolète, le supprimer (l'historique git suffit).
- **Quand tu trouves un doc qui contredit le code** → corriger le doc immédiatement, ou le supprimer s'il n'est pas récupérable. Pas de zone tampon "à jour plus tard".
