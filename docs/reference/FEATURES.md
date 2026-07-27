# Features — catalogue fonctionnel

> Inventaire exhaustif de **ce que fait l'app** du point de vue produit : chaque feature, son entrée, son flow, ses états. Compagnon fonctionnel de [`ARCHITECTURE.md`](ARCHITECTURE.md) (le _comment_ technique) et de [`ROUTES.md`](ROUTES.md) (la carte des écrans).
>
> Tout est **mocké** : pas de backend, pas de réseau, pas de persistance d'état app. Les « analyses », requêtes connecteurs, envois de bug/feedback et générations sont simulés par des timers. Les copies UI citées sont **verbatim** du code.

## Le pipeline

Archie transforme des **Sources** en **Ideas**, puis en **Drafts** (posts), puis en posts **planifiés** — le tout depuis un chat conversationnel. En amont, un scan récurrent peut rapporter des **Findings** (§17) qui deviennent des Ideas.

```
Finding → Source → Idea → Draft (post) → Schedule
(§17)       │                             ▲
            └── vidéo → Clips ────────────┘  (les clips deviennent aussi des drafts)
```

Vocabulaire : un **Playbook** (label UI) = un **Context** (code/store). Voir [`GLOSSARY.md`](GLOSSARY.md).

---

## 1. Chat & assistant

Surface principale, sur `#/session/:id` ([`screens/session.js`](../../src/screens/session.js), le plus gros fichier). Un panneau assistant plein-largeur : thread scrollable en haut, composer docké en bas. L'état du thread est un store en mémoire par session ([`assistant.js`](../../src/assistant.js)), sans persistance.

### Thread & turns

| Feature                      | Comportement                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero « New chat »**        | Avant le 1er turn : wordmark Archie animé, sous-titre _« Drop a source — I'll turn it into a batch of ready-to-schedule posts, all from one chat. »_, composer **inline dans le hero**, puis _« Or jump into a workflow »_ + grille de **starter cards** (`mocks.chatStarters`). Cartes prompt-injection (préremplissent le composer) ou action (`open-video-clips`, `open-batch`, `open-top-posts`). Placeholders `{{source}}` / `{{video-source}}` résolus au render. |
| **Greeting**                 | Thread frais : une bulle Archie. Avec Playbook : _« Hi. Want me to compare ideas, pick the strongest one, or draft a post?… »_ ; sans : _« Hi. I'll help you pick sources, sharpen ideas, and draft posts… »_. Sauté si un start-flow est en file, et pour les sessions `welcome-alt-*` / `clip-studio-*`.                                                                                                                                                              |
| **Échange user → AI**        | 3 turns : bulle « You », notice **« Thinking »** (mermaid, collapsible, _« Analyzing your request and sources… »_), puis bulle AI révélée après ~6 s. Réponse scriptée par intention (`mockAiReply`). Les prompts « batch » produisent en plus un batch de 5 drafts.                                                                                                                                                                                                    |
| **Notices collapsibles**     | `<details>` avec pill mermaid ou grise (`postSystemNotice` / `markSystemNoticeReady`, ex. « Extracting guidelines »).                                                                                                                                                                                                                                                                                                                                                   |
| **Source-intake turn**       | Chip compact « Source intake » (icône kind + nom + slot d'état). Loading → spinner « Uploading » ; ready → pills tappables _« N ideas › »_ / _« M clips › »_ (vidéo) ou check vert. Piloté par [`intake-lifecycle.js`](../../src/screens/session/intake-lifecycle.js).                                                                                                                                                                                                  |
| **Idea-extraction turn**     | Pill _« Extracted N idea(s) »_ + cartes idée compactes (feedback pouce, « Why this idea », Mention, Draft).                                                                                                                                                                                                                                                                                                                                                             |
| **Draft-result turn**        | `postDraftResult` : anchor **non rendu inline**. Un nouveau draft ouvre le panneau Drafts sur le batch + status bar verte _« N drafts ready »_ + toast.                                                                                                                                                                                                                                                                                                                 |
| **Clip-extraction turn**     | Pill spinner → carte résultat « Open clips » quand l'extraction background finit.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Selection echo**           | Le choix de l'utilisateur reste visible sous forme de carte/chip (source, idée, clip, langue, profils, top-post). Voir mémoire _selection-echo-pattern_.                                                                                                                                                                                                                                                                                                                |
| **Connect-a-service prompt** | Coller un lien vers un connecteur non connecté (Slite/Notion/Google Docs) affiche une carte « Not connected » + boutons **Connect / Cancel**. Connect → statut vert _« <Name> connected — importing… »_.                                                                                                                                                                                                                                                                |
| **Chat-switch skeleton**     | ~340 ms de bulles shimmer en changeant de chat démarré.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Watchdog loading**         | Un turn coincé en `loading` > 30 s déclenche un toast _« This is taking longer than expected… »_ ([`thinking-chip.js`](../../src/screens/session/thinking-chip.js)).                                                                                                                                                                                                                                                                                                    |
| **Requête connecteur (MCP)** | Avec un connecteur attaché : `sendConnectorMessage` simule un aller-retour MCP (notice _« Querying <Name> via MCP »_ + trace d'outils) puis une réponse citée.                                                                                                                                                                                                                                                                                                          |

Rendu des turns : [`screens/session/thread-turns.js`](../../src/screens/session/thread-turns.js).

### Composer

- **Champ** : textarea auto-size 2 lignes, placeholder _« Ask a follow-up, or refine a draft… »_. Toolbar : **Add** · **Reference (@)** · **Playbook** · **Send** (orange). Hint _« Enter to send · Shift+Enter for new line · Drop a file to attach a source »_.
- **Envoi** : Send, **Enter**, ou **Cmd/Ctrl+Enter** ; **Shift+Enter** = newline.
- **Menu Add** : _Add PDF · Add video · Add URL · Paste text_ — puis _Top performing posts_ — puis (flag `connectors`) flyout **Connected sources** + « Browse connectors ».
- **Contrôle Playbook** : sur chat neuf = dropdown sélectionnable (+ « Create a playbook ») ; sur chat actif = indicateur statique.
- **@ Reference (mentions)** : picker flottant listant sources prêtes + idées ; pick → pill (couleur par kind). Nav clavier ↑/↓/Enter/Esc. Chips gérés par [`composer-mentions.js`](../../src/composer-mentions.js).
- **« / » commande (connecteurs)** : liste les connecteurs connectés en action-dropdown ; pick → attache au composer.
- **Chip connecteur** : demander un connecteur attache un chip removable + swap placeholder _« Ask {name} anything… »_. ([`composer-connector.js`](../../src/composer-connector.js))
- **Status bar** : un slot réconcilié au-dessus du composer. Gris in-progress (loader + label) prioritaire sur vert « ready » (_« N drafts ready to review »_ + **Review**, _« N ideas ready »_ + **View ideas**). Animations enter/exit, reduced-motion aware.
- **Drag & drop** : déposer un fichier sur le panneau lance l'upload ; fichier non classable → modal Add-source.

### Flows conversationnels

Chaque flow échoe les choix, gère Back/Skip, et pousse des turns via l'assistant. Orchestrateurs dédiés :

| Flow                                   | Fichier                                                   | Résumé                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Action-picker intro**                | [`start-flow.js`](../../src/start-flow.js)                | Ouvrir un chat avec Playbook → _« Welcome back. {Playbook} is attached — what do you want to do? »_ + choix _Add a source / Browse sources / Compare ideas / Draft a post_.                                                                                                                              |
| **Draft-a-post-from-idea**             | [`draft-flow.js`](../../src/draft-flow.js) + `session.js` | Chaîne : (langue si multilingue) → **angles** (_« Suggested angles »_ : « The contrarian take », « A practical how-to », « The behind-the-scenes story », « The data-backed proof ») → **profil** → génération (~6 s) → draft-result. Variantes : _« How many drafts? »_ (1/3/5), _« Which channels? »_. |
| **Regenerate / rewrite**               | [`draft-rewrite.js`](../../src/draft-rewrite.js)          | 3 phases sur la carte post : **thinking** (skeleton) → **streaming** (fade mot-à-mot) → **commit**. Intentions : _shorter / longer / warmer / formal / fresh_. Posts planifiés verrouillés.                                                                                                              |
| **« What to know about this source »** | `session.js` `askWhatToKnow`                              | _What's the main takeaway? / Summarize in 3 bullets / Find a contrarian angle_ + texte libre.                                                                                                                                                                                                            |
| **Video-intake choice**                | `session.js` `askVideoIntake`                             | Vidéo processée → _Analyze for ideas_ ou _Extract & create clips_.                                                                                                                                                                                                                                       |
| **Draft-from-clips**                   | `session.js` `startClipDraftFlow`                         | **aspect ratio** (tiles 16:9/9:16/4:3/1:1/4:5) → **sous-titres** (grille 3×3 de presets « Make it Pop ») → **compte(s)** → un draft par (clip × compte).                                                                                                                                                 |
| **Repurpose posts publiés**            | `session.js` `startRepurposeFlow`                         | Stepper par profil : versions par profil (network source pré-tagué « · Source »).                                                                                                                                                                                                                        |
| **Section-edit Playbook**              | `session.js` `startSectionEdit`                           | Confirm → wizard mono-stage → bump timestamp → _« {Section} updated in every chat… »_.                                                                                                                                                                                                                   |

### Pickers & wizards

- **Inline single-question** ([`inline-question.js`](../../src/inline-question.js)) : « pick one of N » réutilisable. Modes : single, single-with-confirm, multi, **stepper** (± par ligne, « Generate N »), free-text, file-dropzone, `variant:"cards"` (grille preview). Intro/title/subtitle, Skip/Back, état loading. **C'est le Quickpicker** — voir mémoire _use-quickpicker-not-choice-chips_.
- **Choice-turn chips** (`assistant-choice`) : picker in-thread avec chips (single/multi, preview-rich, `instant`), bouton Submit.
- **Sidebar wizard** ([`sidebar-wizard.js`](../../src/sidebar-wizard.js)) : construit les sections **Voice / Brief / Brand** du Playbook (intake → recap → confirm), avec étape Save (nommer / titre du chat).
- **Clavier** ([`wizard-keyboard.js`](../../src/screens/session/wizard-keyboard.js)) : **↑/↓ navigate · 1–9 pick · Enter submit · Esc exit**, rebindé après chaque swap de panneau.

---

## 2. Sources

Store **global** [`sources-stream.js`](../../src/sources-stream.js) (uploads + machine à états). Per-session via [`library.js`](../../src/library.js) `getSources`.

### Ajouter une source — modal ([`add-source-modal.js`](../../src/components/add-source-modal.js))

Dialog mono-méthode (le titre reflète la méthode). Entrées : panneau Sources « Attach source », empty-state `/ideas`, menus `+`.

- **Upload** : dropzone _« Drop files here, or »_ / _« PDF, Word, text, video, audio, images · Up to 100MB per file »_. Accepte `.pdf,.doc,.docx,.txt,.md,.mp4,.mov,.mp3,.wav,.m4a,.png,.jpg,.jpeg`. Multi-fichiers. Ligne par fichier : _« Uploading NN% »_ → pill bleu **Processing** → pill vert **Ready**.
- **URL** : label _« Paste a URL »_, placeholder `https://example.com/article`. Reconnaissance de service live (logo + _« I recognised a <service> link — I'll import it. »_). Validation blur _« URL must start with http:// or https:// »_. Toast _« Link added — I'll fetch it now. »_. Lien connecteur non connecté → connect-prompt in-chat.
- **Paste text** : textarea + _« Paste from clipboard »_, char count live. Toast _« Text added — I'll read it now. »_.
- **Connectors** (flag `connectors`) : connecteurs connectés + « Browse » ; sub-écran browse avec cases par doc, « Select all », dossiers _« Folder · imports N files »_ (cap `FOLDER_BATCH_CAP` = 8), « Import N sources ».

### Machine à états du traitement

Classification par extension ([`file-kinds.js`](../../src/file-kinds.js) + `classifyFile`) : PDF, Word, Text, Video, Audio, Image. Rejette inconnu (_« Unsupported file type »_) et > 100 MB (_« File too large »_).

```
upload (uploading, progress 0→100% ~2s)
  → Source status:"Processing" signal:"Pending"
  → [ticker granulaire ~200ms] Extracting content → Reading content → Identifying ideas → Mining hooks & quotes → Finalizing
  → après ~6s : status:"Processed" + signal aléatoire
```

- **URL / Paste / Connector** : sautent l'upload, directement en Processing.
- **Ticker** : pour Video/Audio, « Reading content » s'affiche _« Transcribing audio »_. Barre fine + _« <stage> · ~Ns left »_ + pill mermaid « AI is working ».
- **Signals** (`randomSignal`, skew Medium) : **High** (orange) / **Medium** (tagOrange) / **Low** (grey). Non-vidéo → 2–6 idées immédiates. **Vidéo → diffère** idées ET clips au choix post-upload (`ideaCount` = 0). Sources réutilisées → signal « Reused ».
- **Toasts** : vidéo toujours _« <name> ready »_ ; non-vidéo _« <name> ready · N ideas extracted »_ derrière flag `statusActionSnackbars`.
- **Cancel** : `cancelUpload` jusqu'à Done.

### Cartes & actions

- **Source card** ([`source-card.js`](../../src/components/source-card.js)) : box teintée par kind, nom, sous-ligne _« N ideas · <status> · Added <when> »_. Actions **Ask**, **Reference** (session), pill processing, menu **Extract more ideas** / **Delete source**.
- **Row panneau** : + kebab (vidéo : « View clips (N) », « Edit name », « Reanalyze », « Delete source »). Les rows processées listent leurs idées en liens cliquables (jump + pulse).
- **Bulk / per-row** ([`library-actions.js`](../../src/library-actions.js)) : bulk bar « N sources selected » → _Extract more ideas / Delete_. Extract → task background ~1.6 s, 1–2 idées par source (templates rotatifs). Delete → confirm _« Delete <filename>? … Ideas backed by other sources stay. »_ + cascade. Rename (modal partagé). Reanalyze (stub toast).

---

## 3. Ideas

Store **per-session** [`library.js`](../../src/library.js). Idée = title, hook/body, **kind** (hook/stat/quote/story/insight), rationale (« Why this idea »), relevance/confidence (→ potential label), channels, sourceIds, pinned. Seedées seulement pour sessions démo (returning mode) ; chats neufs vides.

### Page Ideas (`/ideas`, [`screens/ideas.js`](../../src/screens/ideas.js))

- Header **« Ideas »** + _« N ideas · M used in posts · K unused »_ + « Re-extract from sources » / « Create an idea » (non câblés).
- **Filtre kind** (chips + counts) : All / Hooks / Stats / Quotes / Stories / Insights.
- **Search** _« Search ideas… »_ (repaint in-place, caret préservé). **Sort** : Most recent / Most used / Unused first.
- **Empty states** (3 branches) : vide, filtré (« No ideas match »), analysing (« Ideas will appear here once I finish analyzing… »).

### Cartes idée

- **Full** ([`idea-card.js`](../../src/components/idea-card.js)) : pill potential (High ≥80 vert / Medium ≥60 orange / Low grey), badge kind, hook, hashtags (max 4), toggle « Sources », menu **Pin/Unpin**, **Draft post**, **Reference**.
- **Compact** ([`idea-card-compact.js`](../../src/components/idea-card-compact.js)) : tag kind, chip « Source: », « Why this idea », feedback pouce, Reference, Draft.

### Content workspace ([`content-workspace.js`](../../src/components/content-workspace.js))

Layout Sources+Ideas partagé (dashboard + onglet Content en session). Search _« Search sources and ideas… »_, sort (Highest potential / Newest / Source / Workflow state), onglets **By source** / **All ideas** avec compteurs. Bulk bar idées : « N ideas selected » → Delete.

---

## 4. Drafts / Posts

Store **per-session** [`posts-store.js`](../../src/posts-store.js). Draft = author, network (X→"twitter"), status:"ready", language, text[], hashtags, CTA, stats, optionnel `clipRef` (PIP vidéo), `subtitleStyle`, `format`.

### Post card ([`post-card.js`](../../src/components/post-card.js)) — preview LinkedIn-style

- **Structure** : bloc auteur, provenance pill, corps + hashtags (liens `#tag`) + CTA, media, stats, footer déco « Like/Comment/Repost/Send » (non-interactif).
- **Char counter** par network (LinkedIn 3000, X 280, IG 2200, FB 63206, TikTok 2200, YT 5000) → rouge si dépassé.
- **Media** : clip (faux player, gradient, play, durée, scrubber 24%, badge sous-titres) / image (Change/Remove) / rien (« Generate an image » + « Upload an image »).
- **Actions** : Reference · Edit (flag `draftInlineEdit`) · **Regenerate** (menu _Shorter/Longer/Warmer/More formal/Regenerate_) · Save as draft · Schedule · Delete. Toutes désactivées pendant régénération.
- **Inline edit** : corps → contenteditable, Save/Cancel, auto-commit outside-click, Esc annule, Cmd/Ctrl+Enter save.
- **needs_fixes** : infobox rouge listant `post.errors`. Strip feedback « How's this draft? ».

### Panneau Drafts ([`right-panel.js`](../../src/components/right-panel.js) `renderDraftsView`)

- **Onglets statut** : All drafts / Needs fixes. **Dropdown network**.
- **Feed groupé par network** (LinkedIn, X, IG, FB, TikTok, YT). Chaque **band réseau** = header + toolbar bulk (click = select-all du réseau) → _Save as drafts / Schedule / Delete_. Bulk scheduling **scopé network** (batch toujours valide).
- **Empty** : « No drafts yet » / filtré « No drafts match this filter ».
- Handlers par carte : rewrite, save, schedule (→ modal, sort des Drafts au confirm), delete, image, « Edit clip » (rouvre le modal clips en mono-clip), mention.

---

## 5. Scheduling

Store [`schedule-store.js`](../../src/schedule-store.js) : file upcoming, `getQueue` (tri asc), `getQueueOn(day)`, `busyCountsByDay` (dots calendrier), `addToQueue`, `removeFromQueue`.

### Modal Schedule ([`schedule-modal.js`](../../src/components/schedule-modal.js)) — 960px, deux colonnes

- **Titre** _« Schedule N draft(s) »_. Sous-titre selon single/multi.
- **Mode** (radio cards) : **Optimal times** (sparkles) / **Custom**.
- **Stratégie (Optimal)** : chips cadence _Every weekday / 3× a week / Twice a week / Every other day / Once a week_ + free-text _« Or describe your own strategy »_ (parse morning/afternoon/evening + « avoid <weekday> »). « Starting from » (défaut demain). **« Compute best times »** (seule action qui expand la stratégie ; 1.6 s loading). Schedule désactivé tant que non computé.
- **Moteur Optimal** : parcourt les jours matchant la cadence, saute les weekdays évités ET jours déjà occupés ; une date par draft à la meilleure heure du network (`PER_NETWORK_OPTIMAL`). Overflow empilé sur le dernier jour.
- **Slot list** : carte par draft (tag network + 1re ligne + `datetime-local` + ✕). Multi : **drag-to-reorder** (les dates suivent l'ordre). Éditer une heure → bascule Custom.
- **Calendrier** (droite) : grille mois, dots « This batch » (accent) + « Already scheduled » (gris), click jour → liste combinée. Vide → _« No posts on this day — a good window to schedule. »_.
- **Footer** : Clear all dates · disclosure _« Posts will publish to your connected accounts. »_ · Cancel · **Schedule N posts**. Succès → toast _« N post(s) scheduled »_.

---

## 6. Video clips

### Extraction & formats

- Chaque vidéo processée reçoit un set de **5 clips** (`EXTRACTED_CLIPS_TEMPLATE`) : opening hook, live demo, headline stat, contrarian POV, closing line — chacun start/end, hue, summary, why, network, tags.
- **Machine à états** (`extractClipsForSource`, ~7.5 s, `clipExtractionStatus` undefined → "extracting" → "ready") : _Transcribing audio → Detecting highlights & hooks → Scoring moments → Cutting clips → Generating captions_.
- **Catalogue ratios** ([`clip-formats.js`](../../src/clip-formats.js)) : 9:16 Vertical, 4:5 Portrait, 1:1 Square, 4:3 Standard, 16:9 Landscape + sets recommandés par network.

### Surfaces

- **Clip card** ([`clip-card.js`](../../src/components/clip-card.js)) : thumbnail (gradient + `<video>` au start), tag « clip » + source, menu Edit/Remove, « Why this clip », feedback + Reference + Draft.
- **Panneau Clips** (`renderClipsList`) : agrège tous les clips de la session, auto-flip vers Clips au 1er clip, checkbox par clip, band bulk (« Draft post(s) » + delete), bulk delete avec **Undo**.
- **Modal Video Clips** ([`video-clips-modal.js`](../../src/components/video-clips-modal.js)) — éditeur VEED-like (timeline strip, 3 états **Browse / Edit / Add**). Edit : rail « Clip » / « Subtitles », preview au ratio, transport (±5s, play), In/Out steppers, « Trim » pro-trimmer (filmstrip + waveform, MIN 5s MAX 300s). Subtitles : Style (Presets/Font/Effects) + Transcript. Mono-clip mode (depuis Edit d'un clip ou « Edit clip » d'un draft). Rendu captions : [`caption-editor.js`](../../src/caption-editor.js) + [`clip-captions.js`](../../src/clip-captions.js).

---

## 7. Images

### Modal Generate image ([`generate-image-modal.js`](../../src/components/generate-image-modal.js))

Deux-pane (rail contrôles / preview). Entrée : placeholder « Generate an image » d'une post card.

- **Contrôles** : textarea _« Describe your image »_ + **« Suggest from this post »** (dérive un prompt du post, ~6 s ; auto-run si vide) · **Visual style** (Photorealistic / Illustration / Bold graphic / Editorial photo / Abstract / Upload yours) · **Mood** (Professional / Energetic / Calm / Inspiring / Playful) · **Format** (set recommandé du network).
- **Preview** : idle « Your image appears here » → loading (skeleton + mark animé « Generating… ») → result (image mock ~6 s + « Regenerate » + feedback). Changer une option après génération → état **dirty** (« Options changed »).
- **Footer** : Cancel · **Use this image** (`attachImageToDraft`). Échec → infobox.

---

## 8. Studios (prises de contrôle plein-panneau)

Trois « studios » qui prennent tout le panneau assistant (states upload → analyzing → review distincts du thread). Lancés depuis les starter cards du hero ou le menu Add.

| Studio           | Fichier                                                                                                   | Résumé                                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Batch studio** | [`batch-studio.js`](../../src/batch-studio.js)                                                            | Génère un batch de posts en une passe (upload/analyse → review).                                                                                                                                                                                              |
| **Clip studio**  | [`clip-studio.js`](../../src/clip-studio.js)                                                              | Extraction + montage de clips vidéo en plein écran (`clip-studio-*` sessions, sidebar/status-card masqués).                                                                                                                                                   |
| **Top posts**    | [`top-posts-flow.js`](../../src/top-posts-flow.js) + [`top-posts-store.js`](../../src/top-posts-store.js) | « Pick an account → See the winners → Reuse into drafts ». Board de posts gagnants triable/filtrable par période, ou widget multi-select inline dans le thread ([`top-post-card.js`](../../src/components/top-post-card.js)). Alimente le flow **repurpose**. |

---

## 9. Playbooks

Un Playbook capture business summary, audience, goals, voice/style, brand identity. Stores/vues : [`contexts-store.js`](../../src/contexts-store.js), [`context-builder.js`](../../src/context-builder.js), [`playbook-view.js`](../../src/playbook-view.js), [`context-mock-analysis.js`](../../src/context-mock-analysis.js), [`languages.js`](../../src/languages.js).

### Library (`/contexts`, [`screens/contexts.js`](../../src/screens/contexts.js))

Header **« Playbooks »** + _« N Playbooks · applied across N chats »_ + search + **« Create a Playbook »**. Grille de cartes + ghost card. Carte : swatch couleur, nom (+ ★ default), voice headline, brief summary, compteurs, palette dots, _« Updated {when} »_. Hover : **Edit / Duplicate / Delete**. Garde : impossible de supprimer le dernier (_« Can't delete the last Playbook… »_).

### Détail (`/playbook/:id`, [`screens/playbook.js`](../../src/screens/playbook.js))

Rendu via `playbook-view` en mode **library**. Header identité + rail sticky + les sections. Actions : **Start a chat**, **Re-analyze website** (confirm → loader staged → patch), Delete, rename. Voice-only re-analysis : **My posts** / **Documents…**. Toggle ★ default (flag `playbookDefault`).

### Moteur partagé ([`playbook-view.js`](../../src/playbook-view.js))

Sections éditables inline (une à la fois, Save/Cancel avec snapshot) :

1. **Audience & goals** — Language(s), Business, Primary audience, Content style, Primary goal, Content action, CTA links.
2. **Voice & style** — toggle **Guided ⇄ Write it yourself**. Guided = Signature hooks + Closing patterns + Formatting + Visual style. Switcher **par langue** (2+ langues, flag `multilingualPlaybook`) — voice **écrite nativement par langue, jamais traduite** (voir mémoire _multilingual-playbook-model_). Dropdown « Learn from… ».
3. **Brand** — Brand colors (hex swatches), Typography, Personality, Reference images.
4. **Competitors** (flag `playbookCompetitors`) — voir ci-dessous.

### Competitors (flag `playbookCompetitors`, défaut OFF)

Le marché contre lequel Archie positionne la marque. Champs sur le Playbook : `competitors: Array<{ id, name, description, websiteUrl, socials:[{network,url}], logo?, suggested? }>` et `dismissedCompetitors: string[]`.

**Deux états, jamais confondus.** `suggested: true` = **proposition en attente** d'Archie, qui ne fait PAS partie du Playbook. Tout ce qui compte les compétiteurs (grille active, compteur `/contexts`) ignore les pending ; seul le bac « Suggested by Archie » les lit.

|                         | Actif                               | Suggéré (pending)                                                             |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Groupe                  | **« Your competitors »** + compteur | bac **« Suggested by Archie »** + compteur, fond creusé sous la grille active |
| Carte                   | bordure pleine, surface blanche     | bordure **pointillée**, actions incluses dans la bordure                      |
| Actions                 | remove (en edit scope)              | **Add** / **Dismiss** par carte + **« Add all »** dans l'en-tête du groupe    |
| Compté dans le Playbook | oui                                 | non                                                                           |

- **Grille de cartes** — tuile logo, nom, domaine, blurb sur 2 lignes, badges réseaux. Clic sur une carte → modale détail (`.ap-dialog`) : Name, Website, Description, Social profiles (select réseau + URL). Éditable quand la section est en edit scope, sinon lecture seule + liens réseaux cliquables. Pour une proposition, le footer de la modale offre **Dismiss** / **Add to Playbook** au lieu de Done.
- **Accepter / écarter** — dispo en **lecture** (pas besoin d'ouvrir l'éditeur de section, c'est tout l'intérêt du bac). Add → `delete suggested`, la carte rejoint la grille active. Dismiss → la carte disparaît et sa clé part dans `dismissedCompetitors`, donc **Archie ne la repropose jamais**. Hors edit scope les deux commitent directement ; en edit scope c'est le Save de section qui commite.
- **Favicon auto-extraite** — jamais stockée : résolue à partir du domaine via un service de favicons au render. Un `<img>` qui échoue (domaine sans icône, hors-ligne) bascule sur une **tuile monogramme** teintée déterministiquement depuis le nom, via un listener `error` en phase **capture** (`error` ne bulle pas) posé dans `mount()`.
- **Découverte** — bouton **« Discover competitors » / « Discover more »** (`ap-icon-sparkles`) dans le head de section : skeleton scoped à la section (~1,6 s, pas le loader plein écran) → merge de `discoverCompetitors(url, { exclude })` où `exclude` = les compétiteurs présents (actifs **et** pending) + `dismissedCompetitors`. Dédupliqué par domaine (à défaut par nom, via `competitorKey`). Rescan idempotent : si rien de nouveau, ligne _« No new competitors found. »_. Max 12.
- **Pré-remplissage onboarding** — `sectionPatchFromAnalysis` promeut `suggestions.competitors` sur le draft avec `suggested: true`, donc le recap `/welcome-alt/recap` révèle le bac déjà rempli (grille active vide) : pas d'étape de chat supplémentaire, l'utilisateur choisit sur place.
- **Édition** — pencil de section → remove par carte active + **« Add competitor »** (ouvre la modale sur une fiche vierge, donc directement active). Save élague les fiches restées entièrement vides et les lignes sociales sans URL ; `suggested` est **conservé** — une proposition non acceptée reste en attente au lieu d'être adoptée silencieusement.
- **Gate** — quand le flag est OFF : section, entrée de rail et compteur `/contexts` disparaissent, mais **la donnée reste** (l'analyse la pré-remplit quand même) — même contrat que `multilingualPlaybook`.

### Mock analysis ([`context-mock-analysis.js`](../../src/context-mock-analysis.js))

- `analyzeWebsite(url)` : URL contenant « agorapulse » → mock Agorapulse détaillé (5 audiences, voiceProfile, hooks, couleurs #212E44/#FF6726, 5 CTA links, 5 competitors réels) ; sinon → template SaaS générique éditable (3 competitors placeholders).
- `discoverCompetitors(url, { exclude })` : puise dans le même pool et ne renvoie que les inconnus.
- `analyzeSocialProfiles(ids)` / `analyzeDocument(file)` : voice/summary simulés.

---

## 10. Onboarding (First-Time User « ALT »)

Fichiers : [`screens/welcome-alt.js`](../../src/screens/welcome-alt.js), [`screens/welcome-alt-recap.js`](../../src/screens/welcome-alt-recap.js), + `context-builder.js`.

- **`/welcome-alt`** (redirect) : ajoute `body.onboarding` (full-bleed, pas de sidebar/topbar), mint une session `welcome-alt-{ts}`, arme le handoff `pendingStartContextBuilder` (`flow:"alt"`, `prefilledUrl`), navigue dans la session. Chat 3 questions (URL → profil → documents optionnels ; +langue si `multilingualPlaybook`).
- **`/welcome-alt/recap`** (reveal du Playbook) : loader staged (_Reading your website → Learning your voice → Mapping your audience → Building your Playbook_), recap éditable, rename. CTA finish : **Save and start** (first-time → clear user-mode + reload en returning) ou **Save and continue** (intégré → retour à `/contexts` sans reload). Résilient au reload (draft en sessionStorage).
- **Exit** : topbar « Exit » → confirm _« Exit onboarding? … »_.

Le flow « Create a Playbook » depuis `/contexts` réutilise ce flow en mode **intégré** (`welcomeAltIntegrated`, garde le shell).

---

## 11. Connectors / MCP

**Toute la feature est derrière le flag `connectors` (défaut OFF).** Fichiers : [`screens/connectors.js`](../../src/screens/connectors.js), [`connectors-store.js`](../../src/connectors-store.js), [`connectors-view.js`](../../src/connectors-view.js), [`connector-ask.js`](../../src/connector-ask.js), [`connectors-modal.js`](../../src/components/connectors-modal.js).

- **Concept** : un connecteur connecté devient une **source live** — Archie le requête live via un aller-retour MCP simulé, rien n'est importé. _« I query {name} live over MCP — these are the tools I'll call. »_
- **Gallery** (`/connectors`) : hero « Connectors » + _« N of N connected »_ + search + tabs catégorie (Docs & wikis, Storage, Meetings & calls, Dev & project, Messaging, CRM & support). Carte = logo + nom + desc + check/+.
- **Détail** (page ou modal) : hero teinté accent, actions **Connect** ou **Start a chat** + **Disconnect**, prompts exemples + capabilities.
- **Try in chat** ([`connector-ask.js`](../../src/connector-ask.js)) : attache le connecteur au composer (chip) ; depuis la gallery → nouveau chat via `pendingAskConnector`.
- **24 connecteurs seedés** (`mocks.connectors`) — seuls **Slite** & **Notion** démarrent connectés. Catégories : Docs & wikis (Slite, Notion, Confluence, Google Docs), Storage (Google Drive, Dropbox, OneDrive, Box, Airtable), Dev & project (GitHub, Linear, Jira, Trello, Asana, Figma), Messaging (Slack, Teams, Discord), CRM & support (HubSpot, Salesforce, Intercom, Zendesk), Meetings & calls (Zoom, Fathom). Chacun 3 capabilities.

---

## 12. Navigation shell

### Dashboard (`/`, [`screens/dashboard.js`](../../src/screens/dashboard.js)) — redirect pur

First-time sans Playbook → `/welcome-alt` ; sinon → session la plus récente (ou `/session/new`).

### Sidebar ([`sidebar.js`](../../src/components/sidebar.js))

- **Head** : wordmark « Archie » + badge **BETA** (mint un chat), toggle collapse.
- **Nav** : **New chat** (⇧⌘O), **Search…** (⌘K), puis **Research** (flag `research` — compteur **bleu** des findings non vus, c'est une notification et non un total), **Ideas** (flag `sidebarIdeas`), **Playbooks**, **Connectors** (flag `connectors`) avec count badges.
- **Recent** : groupés Pinned / Recent (avec le flag `sidebarOrganize` ON, un bouton filtre au-dessus de la liste ouvre **Group by** Aucun/Playbook/Date + **Sort by** Récence/Alphabétique — Pinned reste toujours en tête). Row = dot couleur playbook (masqué quand `playbookColors` est OFF) + titre + menu ⋮ (**Rename / Pin / Delete**). Delete → confirm + sweep de tous les stores per-session.
- **Footer** : bloc user, **Send feedback**, ⚙️ popmenu → Send feedback / Report a bug / Keyboard shortcuts (`?`) / **Admin menu** (voir §14).
- **Raccourcis globaux** : ⌘/Ctrl+B toggle sidebar, ⇧⌘O new chat, Esc ferme le menu. Collapse persisté (`archie-sidebar-collapsed`).

### Topbar ([`topbar.js`](../../src/components/topbar.js))

- **Gauche** : titre de route (session = **click-to-rename**). `/playbook/:id` → « ‹ Back to Playbooks ». Board repurpose → « ‹ Change profile ».
- **Droite** (sessions) : cluster pills **Sources / Ideas / Drafts** (toggle panneau, count badge, désactivé si count 0). Active = `stroked blue`.
- **Toggle « i »** status-card (flag `conversationStatusCard`).
- Touche **« ? »** → shortcut legend.

---

## 13. Panneau de droite — modes

Panneau glissant ([`right-panel.js`](../../src/components/right-panel.js)) qui overlay le workspace ; **resizable** (drag handle, min 380px, largeur persistée `archie-rpanel-width`), URL-persisté via `?panel=<mode>` (drafts/ideas/sources), scopé session, Esc ferme.

| Mode                | Contenu                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **drafts**          | Feed PostCard groupé par network + filtres + bulk (§4).                                                |
| **ideas** (Outputs) | Sous-onglets **Ideas \| Clips**. Ideas = grille compacte + filtre kind ; Clips = clips agrégés + bulk. |
| **sources**         | Rows sources + « Attach source » + bloc **Live connectors** (flag).                                    |
| **clips**           | Même surface qu'ideas, landé sur Clips.                                                                |
| **context-brief**   | Éditeur/lecteur du brief Playbook (read/edit, footer Save sticky). Hors pipeline sources/ideas/drafts. |

Détail dimensions/coexistence avec la status-card : [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md) et [`PANEL-SIDEBAR-RULES.md`](PANEL-SIDEBAR-RULES.md).

---

## 14. Admin, feature flags & user modes

> ⚠️ **Il n'y a plus de route `/settings`.** L'Admin a migré dans le **popover ⚙️ de la sidebar** ([`admin-menu.js`](../../src/admin-menu.js) rendu par `sidebar.js`). Chaque changement **reload** l'app pour re-seeder les stores.

### Admin menu

- **User mode** (radio) : **Returning user** (_« Populated mocks (default) »_) / **Welcome - First Time XP** (_« Visual picker + conversational chat »_).
- **Feature flags** : une toggle par flag.
- **Docs** : lien externe **« Conversation thread components »** → `/handoff/components.html`.

### Feature flags ([`ff-catalog.js`](../../src/ff-catalog.js)) — les 11

| id                       | label                          | défaut  | Gate                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draftInlineEdit`        | Inline edit on draft posts     | **OFF** | Édition inline des post cards.                                                                                                                                                                                                                                                                                                         |
| `playbookDefault`        | Default Playbook toggle        | **OFF** | Étoile ★ set/unset default sur `/playbook/:id`.                                                                                                                                                                                                                                                                                        |
| `connectors`             | Connectors (live MCP sources)  | **OFF** | Toute la feature connecteurs (gallery, modal, submenu, Live connectors, tab modal).                                                                                                                                                                                                                                                    |
| `conversationStatusCard` | Conversation status card       | **OFF** | Carte flottante + toggle « i ».                                                                                                                                                                                                                                                                                                        |
| `statusActionSnackbars`  | Action success snackbars       | **OFF** | Snackbars succès dupliquant la status bar.                                                                                                                                                                                                                                                                                             |
| `playbookColors`         | Playbook colors                | **OFF** | Quand OFF (défaut), masque les visuels couleur Playbook partout (classe `body.hide-playbook-colors`) ; ON = couleurs affichées.                                                                                                                                                                                                        |
| `multilingualPlaybook`   | Multilingual Playbooks         | **OFF** | Playbooks multi-langues (voice par langue, étape langue du draft flow).                                                                                                                                                                                                                                                                |
| `manyProfiles`           | Many connected profiles (demo) | **OFF** | Seed ~40 profils connectés variés → le quickpicker de profil affiche une recherche live (voir §draft flow).                                                                                                                                                                                                                            |
| `playbookCompetitors`    | Playbook competitors           | **OFF** | Section **Competitors** du Playbook (panneau + entrée de rail + compteur `/contexts`). La donnée reste présente quand OFF (voir §9).                                                                                                                                                                                                   |
| `sidebarOrganize`        | Sort & group chats             | **OFF** | Bouton filtre au-dessus de la liste des chats → popover à plat **Group by** (Aucun / Playbook / Date) + **Sort by** (Récence / Alphabétique) ; réordonne/regroupe la liste (Pinned reste en tête). Date = buckets Today / Yesterday / Previous 7 days / … dérivés du libellé `lastActivity`. Préf. persistée (`archie-chat-organize`). |

| `research` | Research (recurring findings) | **OFF** | Toute la feature **Research** (§17) : route `/research` + entrée de nav (avec le compteur de nouveaux findings), onglets Feed \| Sources, modal « Read the research », turn de livraison in-chat, toast d'arrivée et scan récurrent. La donnée (findings seedés + catalogue de sources) reste présente quand OFF, comme `playbookCompetitors`. |

Persistés en `localStorage` (`archie-feature-flags`), lus via `isFlagOn()`. Voir aussi [`STORES.md`](STORES.md).

### User modes ([`user-mode.js`](../../src/user-mode.js))

`localStorage` `archie-user-mode` : **returning** (mocks peuplés, défaut) / **new-alt** (stores vides + onboarding first-time). `isNewUser()` / `isNewUserAlt()`.

---

## 15. Modals utilitaires

Tous via [`modal-coordinator.js`](../../src/modal-coordinator.js) (un overlay à la fois, focus restore, Esc/backdrop).

| Modal                                                                                                | Rôle                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Search** ([`search-modal.js`](../../src/components/search-modal.js))                               | ⌘K → recherche de chats, nav clavier ↑/↓/Enter/Esc.                                                                              |
| **Chat picker** ([`chat-picker-modal.js`](../../src/components/chat-picker-modal.js))                | _« Where should this draft go? »_ quand on drafte une idée sans session active.                                                  |
| **Bug report** ([`bug-report-modal.js`](../../src/components/bug-report-modal.js))                   | _« Report a bug »_ : type chips, screenshot auto (html2canvas) ou upload, ~1.4 s → succès.                                       |
| **Feedback** ([`feedback-modal.js`](../../src/components/feedback-modal.js))                         | _« Send feedback »_ : feature-area select + textarea, ~1.2 s → succès. Store [`feedback-store.js`](../../src/feedback-store.js). |
| **Shortcut legend** ([`shortcut-legend.js`](../../src/components/shortcut-legend.js))                | Touche `?` : liste des raccourcis.                                                                                               |
| **Confirm** ([`confirm-modal.js`](../../src/components/confirm-modal.js))                            | `alertdialog` réutilisable ; `danger` → confirm rouge + focus Cancel.                                                            |
| **Rename** ([`rename-modal.js`](../../src/components/rename-modal.js))                               | Input pré-rempli, Save/Enter, Esc. Sidebar row / topbar / Playbook.                                                              |
| **Analyze profiles** ([`analyze-profiles-modal.js`](../../src/components/analyze-profiles-modal.js)) | Sélection de profils sociaux pour l'analyse voice.                                                                               |
| **Fill document** ([`fill-document-modal.js`](../../src/components/fill-document-modal.js))          | Dropzone + lien doc (Google Docs/Drive aware) pour nourrir la voice.                                                             |
| **Save folder** ([`save-folder-modal.js`](../../src/components/save-folder-modal.js))                | Ranger un contenu dans un dossier ([`folders-store.js`](../../src/folders-store.js)).                                            |

---

## 16. Comportements transverses

- **Social profiles** ([`social-profiles.js`](../../src/social-profiles.js)) : source de vérité des comptes connectés (`mocks.socialAccounts`, brand « Northwind Studio »). Profils à `postCount === 0` désactivés pour « analyze my posts » (endNote « No posts to analyze »).
- **Toasts** ([`toast.js`](../../src/components/toast.js)) : `showToast()`, queue max 3, dwell 3200 ms, Undo optionnel.
- **Empty states** ([`empty-state.js`](../../src/components/empty-state.js)) : primitive unifiée icône + titre + body + CTA.
- **Feedback control** ([`feedback-control.js`](../../src/components/feedback-control.js)) : strip pouce « How's this…? » réutilisable sous les cartes.
- **URL services** ([`url-services.js`](../../src/url-services.js)) : reconnaissance de service depuis une URL (logos Google Docs/Notion/Drive/YouTube/Figma).
- **Deep-links Figma-capture** : `?route=`, `?openModal=…`, `?openPanel=…`.
- **Suppression de session** : `clearSession` dans chaque store per-session vide sources/ideas/drafts/mentions.

---

## 17. Research — findings récurrents (flag `research`, OFF)

Un scan récurrent de sources de recherche (le **listening** Agorapulse d'abord) rapporte des **findings** : un constat sourcé, en amont des Ideas dans le pipeline. Voir [`GLOSSARY.md`](GLOSSARY.md#finding) pour le vocabulaire.

### Route `/research` ([`screens/research.js`](../../src/screens/research.js))

Deux onglets DS `.ap-tabs`, l'actif dans le hash (`?tab=sources`) — donc deep-linkable. Le Playbook actif aussi (`?pb=ctx-acme`) : la config **et** le feed sont par Playbook, et le picker `.ap-select` disparaît quand il n'y a qu'un Playbook. Header : titre + sous-ligne « N sources · refreshes weekly · last scan 5h ago » + **Run a scan** (gris, pas orange — l'orange de cette page appartient à l'action primaire de chaque carte).

- **Feed** — une colonne de lecture (≈760px, pas une grille : un finding se lit avant d'être décidé). Carte = `.ap-card` + badge de source teinté, `Source · 5h ago`, tag `New` (`.ap-tag blue mini`), headline, résumé clampé à 2 lignes, « Research type » + `.ap-tag grey`, puis les actions : `.ap-split-button primary orange` **Turn into ideas** (chevron → _Turn into ideas in…_ / _Draft a post now_), **Dismiss** en ghost, et **Read the research** poussé à droite — lire est l'alternative à décider maintenant. Un finding utilisé se réduit à un `.ap-status green` « Turned into ideas ». Un toggle discret « Show dismissed (N) » en bas rend le rejet observable et réversible.
- **Sources** — 7 cartes-interrupteurs (voir [`research-catalog.js`](../../src/research-catalog.js)) : Competitor sources, Influencer sources, Brand feedback, Competitor monitoring, Industry trends, Global trends, Internal team ideas. Toute la ligne est le `<label>`, toggle DS `.ap-toggle-container` en fin de ligne (contrat identique aux rows de flags du popover Admin). Sous la description, selon le `kind` : un deep link vers la section du Playbook qui alimente la source, ou les chips des outils connectés (**gatées par le flag `connectors`**). Puis « Other settings » : **Refresh frequency** (`.ap-filter-chip` Daily/Weekly/Monthly) et **Notifications**.

### Modal « Read the research » ([`research-modal.js`](../../src/components/research-modal.js))

720px — le premier dialog de **lecture longue** de l'app, délibérément plus étroit que les 920px du modal Connectors (c'est de la prose). Ordre de lecture : l'argument en 3 paragraphes → **Source posts** (les publications d'autrui, via [`social-post-card.js`](../../src/components/social-post-card.js)) → « What I'd write from this » (les idea seeds) → un footer collant qui rejoue les actions de la carte du feed, sans « Read the research » (on y est déjà). Son menu s'ouvre vers le haut.

### Turn into ideas ([`research-flow.js`](../../src/research-flow.js))

`/research` n'a pas de session : le **chat picker** demande où (avec le raccourci « aucun chat → on en crée un »), et le choix voyage sur le handoff `pendingResearchUse`, consommé au mount de la session. Puis, dans le chat : écho du finding (turn `selection-echo`) → chip _Turning research into ideas_ → le finding devient une **Source** consultable (`addReadySource`, payload `researchFinding`) → `injectIdeasForSource` avec `researchFindingId` sur chaque idea → le turn canonique « Extracted N ideas ». Avec _Draft a post now_, la chaîne continue dans `draft-flow`.

### Livraison in-chat & récurrence

Chaque batch s'annonce là où l'utilisateur est déjà : une phrase à la première personne (« I scanned your research sources. 3 new findings — … ») puis un turn `{ role: "assistant", variant: "research" }` rendu par le `renderResultCard` partagé, donc de la même famille que clips / ideas / drafts. Le teaser porte la headline la plus forte + une `social-post-card` compacte ; le CTA ouvre le modal **sur place** (on ne sort pas l'utilisateur de sa conversation).

Deux déclencheurs, un seul chemin d'annonce : le bouton **Run a scan**, et un scan one-shot ~12s après le boot (`initResearch()` dans le bloc de boot de `app.js`). La **cadence n'est pas un timer** — daily/weekly/monthly ne se déclencherait jamais dans une session de démo ; elle pilote la copie et la taille du batch. La livraison cible le chat ouvert, sinon le plus récent de ce Playbook — jamais un fan-out. « Nothing new » ne se dit que si l'utilisateur a demandé. Notifications OFF supprime le toast mais **pas** le badge : la préférence porte sur l'interruption, pas sur le comptage.

### Mémoire des rejets & toggles chargés

`dismissFinding` retient le `dedupeKey` (pas l'`id`) : un finding rejeté ne revient jamais, même si un scan re-dérive le même constat. `runScan` ignore les sources désactivées — c'est ce qui rend les toggles de l'onglet Sources observablement utiles. Le badge « New » ne se vide qu'au **teardown** de la route, jamais à l'arrivée.

---

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — le _comment_ technique
- [`ROUTES.md`](ROUTES.md) — route table + handoffs + URL state
- [`STORES.md`](STORES.md) — API par store
- [`UI-PATTERNS.md`](UI-PATTERNS.md) — usage concret du Design System
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire produit
