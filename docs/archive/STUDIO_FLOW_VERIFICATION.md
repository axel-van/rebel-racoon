# Studio — Flow Verification (handoff ↔ archie)

> **Date** : 2026-04-29
> **Branche** : `audit/studio-handoff-2026-04-28`
> **Setup** :
>
> - **archie** servi sur `http://localhost:8000` (`python3 -m http.server`)
> - **handoff** servi sur `http://localhost:8001` (même serveur, dossier `~/sources/design_handoff_studio/source/`, ouvert sur `/Studio.html`)
> - admin user-mode chip d'archie testé en `returning` ET en `new` (= "first-time user")

Ce rapport est un audit pur en lecture seule. Aucun fichier d'archie modifié hors ce rapport.

---

## Méthodologie

Pour chaque flow handoff de référence (issu du § 7 de `STUDIO_HANDOFF_AUDIT.md`), j'ai exécuté la même séquence d'actions dans les deux apps via `preview_eval` (DOM queries + KeyboardEvent / click dispatch), puis comparé l'état final.

Couverture :

- **7 flows fonctionnels** (Section 1)
- **2 modes admin** d'archie (returning + first-time), Section 2
- **Audit "extras"** : ce qui est rendu dans archie mais n'apparaît pas dans le handoff et pourrait être nettoyé (Section 3)

---

## 1. Flow-by-flow — comparaison handoff ↔ archie

### Flow 1 — Empty chat → starter → batch → schedule

| Étape                                             | handoff                                                                                                   | archie                                                                           | Statut                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Sidebar "+ New conversation" → empty chat hero    | "What are we creating today?" + 4 starter cards                                                           | ✅ identique (Lot 3.1)                                                           | OK                                     |
| Click starter → composer pre-fill                 | OK                                                                                                        | ✅ OK (`{{source}}` placeholder préservé)                                        | OK                                     |
| Send (Enter) → user msg + AI reply                | OK                                                                                                        | ✅ user msg landing + thinking spinner + AI text                                 | OK                                     |
| AI returns batch automatically                    | ✅ `defaultBatch(...)` triggered on prompts containing `'post'` / `'draft'` / `'moments'` / `'pull'` etc. | ❌ `assistant.sendMessage` retourne du texte générique uniquement                | **GAP majeur**                         |
| Drafts panel auto-opens pinned to batch           | ✅ `setRightPanel('drafts')` + `setActiveBatchRef(...)`                                                   | ❌ pas déclenché (pas de batch)                                                  | **GAP** (mais dérive du gap au-dessus) |
| In-thread Drafts summary card                     | ✅ rendered as part of assistant message                                                                  | ✅ rendered (Lot 3.4) **quand un batch existe** ; cliquable pour ouvrir le panel | OK partiel                             |
| Schedule N posts → modal                          | ✅ Schedule modal handoff `auto / optimal / manual`                                                       | ✅ Schedule modal archie (Lot 9) avec Auto / Optimal / Manual                    | OK                                     |
| Confirm schedule → toast + posts marked scheduled | ✅                                                                                                        | ✅ (Lot 9 inclut le câblage)                                                     | OK                                     |

**Finding 1 (majeur)** — archie's `assistant.sendMessage(text)` ne déclenche pas de batch automatiquement comme `generateReply` du handoff. La "Draft from idea" trigger un batch via `draft-flow.js`, mais l'envoi direct d'un starter prompt depuis l'empty hero produit uniquement du texte. Le handoff matche les keywords `pull` / `moments` / `post` / `draft` / `repurpose` / `schedule` / `batch` / `5-day` / `launch` / `week` dans `App.jsx:430-456` et retourne `defaultBatch()` ou `launchBatch()` selon le cas.

**Recommandation** :

- Étendre `assistant.sendMessage` (ou ajouter un wrapper `generateReply` dans `src/assistant.js`) avec un keyword matcher similaire.
- Quand le matcher hit "batch" / "draft" / "pull", appeler `postDraftResult(sessionId, {drafts: batchFromKeywords(prompt, ctx)})` — la suite du pipeline (auto-open du right panel) est déjà câblée (Lot 4.4).
- Lot estimé : **S** (1/2 j).
- Effet user-visible : l'empty hero devient un vrai parcours end-to-end à un clic.

---

### Flow 2 — Source → batch

| Étape                        | handoff                                                                                                            | archie                                                                                                                     | Statut        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/sources` page              | ✅ SourcesView avec filter rail + grid                                                                             | ✅ idem (Lot 6.1)                                                                                                          | OK            |
| Action "Use in chat" / "Ask" | "Use in chat" → flips view to chat + pre-fills composer avec `Pull the strongest moments from "${source.name}"...` | "Ask" → ouvre `chat-picker-modal` (cible : new chat / existing) → arrivée sur session avec inline question                 | DELTA UX      |
| Source attaché au prompt     | ✅ chip in composer                                                                                                | ⚠ pattern différent — pas de chip "attached source" dans le composer archie ; la source est référencée via inline question | DELTA         |
| Send → batch                 | ✅ (cf. Flow 1)                                                                                                    | ❌ même gap que Flow 1                                                                                                     | GAP (idem F1) |

**Delta Flow 2** — archie passe par un chat picker (cohérent avec son pattern de cross-session draft/ask). Le handoff va direct dans l'empty hero sans demander la cible. Les deux solutions atteignent le même résultat ; archie demande une étape de plus mais offre plus de flexibilité (choix de session). **Pas une régression**, choix produit conscient (Q11).

---

### Flow 3 — Idea → batch

| Étape                                | handoff                                                                                             | archie                                                                                                                                                         | Statut |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `/ideas` page                        | ✅ IdeasLibraryView avec kind filters                                                               | ✅ idem (Lot 7) — 6 chips (All/Hooks/Stats/Quotes/Stories/Insights)                                                                                            | OK     |
| Click "Use this idea" / "Draft Post" | ✅ injecte `Build a batch of posts around this {kind}: "..."` dans composer + retourne 3-post batch | ✅ "Draft Post" déclenche `setHandoff('pendingDraftIdeaId', ideaId)` + chat-picker → session screen consomme le handoff et lance `executeDraft` (3-post batch) | OK     |
| Drafts panel ouverture               | ✅ auto via `setRightPanel('drafts')`                                                               | ✅ auto-open via `wireAssistantPanel` détectant `variant: 'draft'`                                                                                             | OK     |
| Filtrage par kind                    | ✅ Toggle                                                                                           | ✅ Toggle, counts live                                                                                                                                         | OK     |

**Flow 3 OK** — archie est aligné fonctionnellement, avec une étape supplémentaire (chat picker) cohérente avec son design. Idea-to-batch reste un parcours en quelques clics.

---

### Flow 4 — Context manage

| Étape                              | handoff                                      | archie                                                                    | Statut |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `/contexts` page avec ContextCards | ✅ grid 3 cols                               | ✅ idem (Lot 8.1)                                                         | OK     |
| Card "Edit" → drawer               | ✅ rail + editor split                       | ✅ idem (Lot 8.2)                                                         | OK     |
| Drawer dirty state                 | ✅ "Unsaved changes" en orange               | ✅ "Unsaved changes" en orange ; bascule à "All changes saved" après Save | OK     |
| Save & close → card name updates   | ✅                                           | ✅ (Lot 8.2 wires `subscribeContexts` → page re-paint)                    | OK     |
| Duplicate / Delete                 | ✅                                           | ✅ avec confirm + protection "last context"                               | OK     |
| Color swatch picker                | ✅ orange/blue/green/purple/red/yellow/slate | ✅ (Lot 8.2)                                                              | OK     |
| Tones multi-select (1..3)          | ✅                                           | ✅ avec validation max 3                                                  | OK     |
| Do / Don't lists                   | ✅                                           | ✅ avec add/remove rows                                                   | OK     |

**Flow 4 OK end-to-end.** Drawer + édition + persist + propagation fonctionne en boucle complète.

---

### Flow 5 — Sidebar collapse

| Étape                | handoff                                   | archie                                                                  | Statut |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------ |
| ⌘+B togggle          | ✅ animation 200ms cubic-bezier(.2,0,0,1) | ✅ Lot 2.2 — animation `--ref-animation-normal` × `--app-ease-standard` | OK     |
| Click toggle button  | ✅                                        | ✅ chevron-left (expanded) / view-list (collapsed)                      | OK     |
| Width 260 ↔ 56       | ✅                                        | ✅ via `--app-sidebar-width` / `--app-sidebar-width-collapsed`          | OK     |
| Persist              | tweaks data attr                          | localStorage `archie-sidebar-collapsed`                                 | OK     |
| Collapsed icon stack | ✅ toggle / + / avatar / settings         | ✅ Lot 2.2 idem                                                         | OK     |

**Flow 5 OK** — équivalent fonctionnel.

---

### Flow 6 — Right panel toggle

| Étape                                        | handoff             | archie                            | Statut |
| -------------------------------------------- | ------------------- | --------------------------------- | ------ |
| Topbar Drafts pill                           | ✅ avec badge count | ✅ (Lot 4.1 + topbar pills bonus) | OK     |
| Topbar Ideas pill                            | ✅                  | ✅                                | OK     |
| Toggle drafts open/close                     | ✅                  | ✅                                | OK     |
| Switch drafts ↔ ideas                        | ✅                  | ✅                                | OK     |
| Esc closes                                   | ✅                  | ✅                                | OK     |
| In-thread Drafts summary card → opens Drafts | ✅                  | ✅ (Lot 4.3)                      | OK     |

**Flow 6 OK.**

---

### Flow 7 — Empty hero state

| Étape                            | handoff                                                                                                 | archie                                                                              | Statut       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| Hello text                       | "What are we creating today?"                                                                           | ✅ identique                                                                        | OK           |
| Subtitle                         | "Drop in a source and Studio will turn it into a batch of posts you can review, edit, and schedule."    | ⚠ "Archie" au lieu de "Studio" — branding correct                                   | OK           |
| 4 starter cards                  | Batch from a source / Plan a launch week / Repurpose a long-form piece / Customer story → multi-channel | ✅ identique (Q14)                                                                  | OK           |
| Click starter pre-fills composer | ✅                                                                                                      | ✅                                                                                  | OK           |
| Composer hint                    | "↵ to send · Shift+↵ for new line · drop a file anywhere to add it as a source"                         | ⚠ "↵ to send · Shift+↵ for new line · ⌘+↵ sends from anywhere" — drop hint manquant | DELTA mineur |

**Flow 7 OK** avec deux nuances de copie. Le composer hint d'archie a remplacé "drop a file anywhere" par "⌘+↵ sends from anywhere". Archie supporte LES DEUX (drop est wiré Lot 3.5) — c'est juste l'indication textuelle qui est différente.

**Recommandation mineure** : étendre la hint en `↵ · Shift+↵ · ⌘+↵ · drop a file anywhere` (les 4 raccourcis cohabitent).

---

## 2. Admin user-mode toggle (archie-spécifique)

L'app handoff n'a qu'un seul mode (toujours peuplé). Archie a un admin chip qui flip entre `first-time user` et `returning user` (cf. Q10 — gardé).

### Returning user mode

| Surface                  | État attendu                                 | État observé | Statut |
| ------------------------ | -------------------------------------------- | ------------ | ------ |
| Sidebar recent list      | `Acme — Q2 product launch` (1 row)           | ✅           | OK     |
| Dashboard `/`            | Content workspace populé (3 sources)         | ✅           | OK     |
| `/sources`               | 3 cards                                      | ✅           | OK     |
| `/ideas`                 | 7 cards                                      | ✅           | OK     |
| `/contexts`              | 3 cards                                      | ✅           | OK     |
| `/session/s-acme-launch` | Thread avec greeting + Content tab populated | ✅           | OK     |
| Right panel Ideas mode   | 7 ideas listed                               | ✅           | OK     |

### First-time user mode

| Surface                | État attendu                       | État observé                                  | Statut  |
| ---------------------- | ---------------------------------- | --------------------------------------------- | ------- |
| Sidebar recent list    | "No conversations yet"             | ✅                                            | OK      |
| Dashboard `/`          | First-run "Welcome to Archie" card | ✅                                            | OK      |
| `/sources`             | empty grid (or empty-state copy)   | ❌ **3 cards (mocks toujours seedés)**        | **GAP** |
| `/ideas`               | empty grid                         | ❌ **7 cards**                                | **GAP** |
| `/contexts`            | empty grid (or 1 default context?) | ❌ **3 cards**                                | **GAP** |
| `/session/new`         | Empty hero                         | ✅                                            | OK      |
| Right panel Ideas mode | empty                              | ❌ **7 ideas listed** (utilise `mocks.ideas`) | **GAP** |

**Finding 2 (majeur)** — les 3 pages standalone (`/sources`, `/ideas`, `/contexts`) **ainsi que** le right-panel Ideas mode ignorent `isNewUser()`. Le dashboard `/` et le sidebar recent list respectent bien le flag, donc l'incohérence est très visible quand on bascule en first-time mode et qu'on clique "Sources" dans la nav : le user voit 3 sources alors que sa "home" dit qu'il n'a aucune conversation.

**Causes racines** :

- `src/screens/sources.js` lit `getSources()` du global store `sources-stream.js`. Le store seed depuis `mocks.sources` inconditionnellement (ne consulte pas `isNewUser()`).
- `src/screens/ideas.js` lit `mocks.ideas` directement.
- `src/screens/contexts.js` lit `getContexts()` qui seed depuis `mocks.contexts` inconditionnellement.
- `src/components/right-panel.js` (Ideas mode) lit `mocks.ideas` directement.

**Recommandations (par ordre de simplicité)** :

1. **Quick fix** : dans chacun des 3 screens + le right-panel, importer `isNewUser` et retourner un empty state (ou un seul "default" item dans le cas de Contexts) quand la flag est vraie.
2. **Fix structurel** : faire en sorte que les stores (`sources-stream`, `library`, `contexts-store`) seedent une liste vide en first-time mode (pattern déjà appliqué par `posts-store.js:seed` qui consulte `isNewUser()`).

Lot estimé : **S** (1/2 j).

---

## 3. Audit "extras" — ce qui est de trop dans archie vs handoff

L'utilisateur a explicitement demandé de vérifier ce qui pourrait être supprimé. Voici l'inventaire.

### 3.1 Code mort — à supprimer

| Élément                                               | Fichier                                                                                                                   | Détails                                                                                                                                                                                                               | Action                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `renderPopulatedPosts()` + helpers Posts tab body     | [src/screens/session.js](src/screens/session.js) — ~6 occurrences                                                         | Posts tab dropped Lot 4.4 ; le branch `if (q.tab === "posts")` dans `renderTab` est unreachable car `readQuery()` rewrite `posts → content`. Tout le rendu de la Posts tab body (~250 lignes estimées) est dead code. | Supprimer en passe de cleanup                      |
| `styles/screens/posts.css`                            | [styles/screens/posts.css](styles/screens/posts.css) — 8.4 KB                                                             | Toutes les règles `.posts__*` n'ont plus de consumer (rule unused) ; la règle `.session__tab-body--flush` aussi (ne se déclenche plus).                                                                               | Supprimer l'import dans `index.html` puis `git rm` |
| `posts-store.js`                                      | [src/posts-store.js](src/posts-store.js)                                                                                  | Encore utilisé par `draft-flow.js → addPostDraft`. Conservé pour l'instant ; à reconsidérer si on déplace toute la persist drafts vers les batches d'assistant messages.                                              | Garder (mais audit follow-up)                      |
| `commentaire `posts/library/ideas`dans readQuery`tab` | [src/screens/session.js:55](src/screens/session.js) — la ligne `// URL: #/session/:id?tab=posts\|library\|ideas\|context` | Liste obsolète. Tabs réelles : `content` + `context` uniquement.                                                                                                                                                      | Update doc                                         |

### 3.2 Surfaces archie sans pendant handoff — choix produit conservés

Ces éléments sont dans archie mais pas dans le handoff. Je les ai vérifiés contre les Q1–Q17 du rapport d'audit ; tous sont des choix conservés explicitement.

| Surface                                                           | Présence handoff                  | Décision audit                                                              | Action                     |
| ----------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| Dashboard route `/` (content workspace + new chat hero card)      | absent (handoff a `/` = chat)     | Q14 + decisions ; archie le garde pour browser un library overview          | **Garder**                 |
| Session workspace tabs (Content + Context)                        | absent (handoff a chat-only body) | Q4 a réduit à Content + Context ; pas explicitement statué de les supprimer | **À arbitrer** (cf. § 3.3) |
| Settings drawer 5 onglets                                         | absent                            | Q12 garder                                                                  | **Garder**                 |
| `add-source-modal` Upload/URL/Connectors riche                    | drop-zone basique                 | Q11 garder                                                                  | **Garder**                 |
| Connectors (Slite/Notion/GDrive/Slack)                            | absent                            | Q11 garder                                                                  | **Garder**                 |
| Generate Image modal                                              | absent                            | Q13 garder                                                                  | **Garder**                 |
| User-mode admin chip                                              | absent                            | Q10 garder                                                                  | **Garder**                 |
| Sidebar foot popmenu (Send feedback / Bug / Shortcuts / Settings) | foot a juste un cog Settings      | **Lot 11** — feedback / bug / shortcuts sont archie-spécifiques             | **Garder**                 |

### 3.3 Surfaces présentes dans archie qui méritent un arbitrage

#### Session workspace tabs (Content + Context)

Le handoff n'a aucune tab dans la chat view — le body est juste le thread. Archie garde 2 tabs :

- **Content** = "By source" / "All ideas" — duplique exactement ce que `/sources` et `/ideas` exposent maintenant en pages standalone.
- **Context** = sections Voice / Brief / Brand avec boutons "Edit via chat" — duplique ce que ContextDrawer expose avec une UX différente.

**Constat** : ces deux tabs sont des reliques de l'organisation pré-Lot 6/7/8. Maintenant que les pages standalone existent ET que le ContextDrawer existe, les tabs dans la session deviennent redondantes.

**Recommandation** :

- **Supprimer la Content tab** : redirige les liens cross-session "ouvrir source dans la session" vers `/sources?focusSource=...` (à la place du `/session/:id?tab=content&focusSource=...`).
- **Supprimer la Context tab** : remplacer par un bouton dans le composer ou la topbar (Context pill manquant — cf. Lot 11 follow-up) qui ouvre le ContextDrawer.

Effet : la session screen devient un chat-only body (handoff-aligned), et tout le code `renderWorkspaceTabs` / `renderContextTab` / `renderPopulatedPosts` peut disparaître (~500 lignes de session.js).

Lot estimé : **M** (1-2 j incluant la migration des liens cross-session).

---

#### Sidebar — search input manquant

Le handoff sidebar a un search input entre la nav et la recent list (`Sidebar.jsx:36-39`). Archie ne l'a pas (j'avais déféré ce détail au Lot 2.3 sans le rajouter ensuite).

| Surface              | handoff                                  | archie    |
| -------------------- | ---------------------------------------- | --------- |
| Sidebar search input | ✅ filtre la conversation list par titre | ❌ absent |

**Recommandation** : ajouter un `<input>` dans la sidebar entre `.app-sidebar__nav` et `.app-sidebar__list`. Trivial — les rows sont déjà filtrables par `recentSessions` array.

Lot estimé : **S** (1 h).

---

#### Topbar — Context pill manquant

Le handoff topbar inclut un Context pill (à gauche des Drafts/Ideas pills) qui ouvre un dropdown listant les contextes + Edit/New/Manage actions. Archie l'a déféré (note dans `topbar.js`).

**Recommandation** : ajouter le Context pill dans `renderSessionPills` quand `onSession === true`. Le dropdown peut être un simple `<details>` ou un popmenu maison comme celui du sidebar foot.

Lot estimé : **S** (1/2 j).

---

#### Composer — attached source chips manquants

Le handoff composer affiche les sources attachées comme chips au-dessus de la textarea, avec progress bar pour celles en `analyzing` et croix pour les retirer. Archie a juste un menu `+` (Add PDF / Add video / Add URL) qui pousse une source dans le stream, sans concept "attached to this prompt".

| Surface                 | handoff                                                  | archie                                               |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Source chips (composer) | ✅ chips above textarea, removable, with analyzing state | ❌ absent — le `+` menu pousse dans le stream global |
| Source picker popover   | ✅ search + analyzing rows + Upload row                  | ❌ menu basique 3-items (PDF/video/URL)              |

**Constat** : c'est un manque fonctionnel (pas une "extra" à supprimer). Pour scope Lot 12, je le mentionne mais je le laisse en dette — c'était listé dans l'audit Lot 3 et marqué comme follow-up.

---

### 3.4 Mocks data restants à reconsidérer

Vérifié dans `src/mocks.js` :

- ✅ `templateStarters` bien supprimé (Lot 3.1)
- ⚠ `posts` (~6 mock posts avec `stats: {likes, comments, reposts}`) — Q16 dit retirer les stats. Le shape des posts dans `mocks.js` les garde encore. À supprimer dans le mock + dans `posts-store.addPostDraft`.
- ⚠ `socialAccounts` — listés mais utilisés uniquement par `settings-drawer`. Pas de problème.

**Recommandation** : supprimer le champ `stats` des entrées `posts` dans `mocks.js` et de `addPostDraft` dans `posts-store.js`. Effet aujourd'hui : zéro user-visible (les posts ne sont plus affichés dans l'app après Lot 4.4).

Lot estimé : **S** (5 min).

---

## Synthèse + ordre d'attaque recommandé

### Findings classés par sévérité

1. **Majeur — Finding 1** : `assistant.sendMessage` ne déclenche pas de batch sur les starter prompts. Le parcours empty hero → batch est cassé. **Lot 13 priorité haute.**
2. **Majeur — Finding 2** : `/sources`, `/ideas`, `/contexts` et right-panel Ideas mode ignorent `isNewUser()`. Régression UX en first-time mode. **Lot 14 priorité haute.**
3. **Mineur — Composer attach chips** : le composer manque les chips de sources attachées + le source picker popover. Dette connue de Lot 3. **Lot 15 nice-to-have.**
4. **Mineur — Sidebar search** : input manquant entre nav et recent list. **Lot 16 trivial.**
5. **Mineur — Context pill** : absent de la topbar. **Lot 17 small.**
6. **Cleanup — Posts tab dead code** : `renderPopulatedPosts` + `styles/screens/posts.css` à supprimer. **Lot 18 cleanup.**
7. **Cleanup — Session workspace tabs Content + Context** : redondants avec `/sources`, `/ideas`, ContextDrawer. **Lot 19 medium refactor.**
8. **Trivial — `posts.stats` field** : retirer des mocks + addPostDraft. **Petit nettoyage.**

### Plan d'attaque proposé (~3 jours dev)

```
Day 1 :  Lot 13 (sendMessage → auto-batch)        → débloque Flow 1
         Lot 14 (isNewUser dans library pages)    → débloque first-time UX
         Lot 18 (suppression Posts dead code)     → -750 lignes
Day 2 :  Lot 19 (sup. Content + Context tabs session) → -500 lignes session.js
         Lot 16 (sidebar search input)            → 1 h
         Lot 17 (Context pill in topbar)          → 1/2 j
Day 3 :  Lot 15 (composer attach chips + source picker popover)
         + Audit final + screenshot golden path
```

### Verdict global

Le portage Lots 1–11 a livré 100% de la chrome (sidebar, topbar, right panel, pages standalone, drawer, schedule modal) et 6/7 flows fonctionnent end-to-end. Le seul flow cassé est le **starter → batch** (Flow 1) parce que le générateur de batch n'est pas câblé sur le path standard `sendMessage`. Une fois Lots 13 + 14 livrés, archie est aligné fonctionnellement avec le handoff.

L'audit "extras" identifie ~750 lignes de dead code (Posts tab) + ~500 lignes potentiellement migrables (Content/Context tabs), soit un cleanup de ~1250 lignes possible sans perte fonctionnelle.

---

**Fin du rapport.**
