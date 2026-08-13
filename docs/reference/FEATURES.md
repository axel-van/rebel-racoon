# Features — catalogue fonctionnel

> Inventaire exhaustif de **ce que fait l'app** du point de vue produit : chaque feature, son entrée, son flow, ses états. Compagnon fonctionnel de [`ARCHITECTURE.md`](ARCHITECTURE.md) (le _comment_ technique) et de [`ROUTES.md`](ROUTES.md) (la carte des écrans).
>
> Tout est **mocké** : pas de backend, pas de réseau, pas de persistance d'état app. Les « analyses », requêtes connecteurs, envois de bug/feedback et générations sont simulés par des timers. Les copies UI citées sont **verbatim** du code.

## Le pipeline

Archie transforme des **Sources** en **Ideas**, puis en **Drafts** (posts), puis en posts **planifiés** — le tout depuis un chat conversationnel.

```
Source → Idea → Draft (post) → Schedule
   │                          ▲
   └── vidéo → Clips ─────────┘  (les clips deviennent aussi des drafts)

Listening source → Topic ──→ (chat) ──┘   (flag `topics`, voir §17)
```

Le **Topic** est un embranchement amont **optionnel** : Archie n'attend plus qu'on lui donne une source, il en propose une. Une Idea peut toujours venir directement d'une Source.

Vocabulaire : un **Playbook** (label UI) = un **Context** (code/store). Voir [`GLOSSARY.md`](GLOSSARY.md).

---

## 1. Chat & assistant

Surface principale, sur `#/session/:id` ([`screens/session.js`](../../src/screens/session.js), le plus gros fichier). Un panneau assistant plein-largeur : thread scrollable en haut, composer docké en bas. L'état du thread est un store en mémoire par session ([`assistant.js`](../../src/assistant.js)), sans persistance.

### Thread & turns

| Feature                      | Comportement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero « New chat »**        | Avant le 1er turn : wordmark Archie animé, sous-titre _« Drop a source — I'll turn it into a batch of ready-to-schedule posts, all from one chat. »_, composer **inline dans le hero**, puis **deux blocs étiquetés** : _« Ideas waiting for you »_ + le **carrousel d'Ideas** (§18, flag `contentResearch`), puis _« Or jump into a workflow »_ + grille de **starter cards** (`mocks.chatStarters`). Cartes prompt-injection (préremplissent le composer) ou action (`open-video-clips`, `open-batch`, `open-top-posts`). Placeholders `{{source}}` / `{{video-source}}` résolus au render. |
| **Greeting**                 | Thread frais : une bulle Archie. Avec Playbook : _« Hi. Want me to compare ideas, pick the strongest one, or draft a post?… »_ ; sans : _« Hi. I'll help you pick sources, sharpen ideas, and draft posts… »_. Sauté si un start-flow est en file, et pour les sessions `welcome-alt-*` / `clip-studio-*`.                                                                                                                                                                                                                                                                                    |
| **Échange user → AI**        | 3 turns : bulle « You », notice **« Thinking »** (mermaid, collapsible, _« Analyzing your request and sources… »_), puis bulle AI révélée après ~6 s. Réponse scriptée par intention (`mockAiReply`). Les prompts « batch » produisent en plus un batch de 5 drafts.                                                                                                                                                                                                                                                                                                                          |
| **Notices collapsibles**     | `<details>` avec pill mermaid ou grise (`postSystemNotice` / `markSystemNoticeReady`, ex. « Extracting guidelines »).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Source-intake turn**       | Chip compact « Source intake » (icône kind + nom + slot d'état). Loading → spinner « Uploading » ; ready → pills tappables _« N ideas › »_ / _« M clips › »_ (vidéo) ou check vert. Piloté par [`intake-lifecycle.js`](../../src/screens/session/intake-lifecycle.js).                                                                                                                                                                                                                                                                                                                        |
| **Idea-extraction turn**     | Pill _« Extracted N idea(s) »_ + cartes idée compactes (feedback pouce, « Why this idea », Mention, Draft).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Draft-result turn**        | `postDraftResult` : anchor **non rendu inline**. Un nouveau draft ouvre le panneau Drafts sur le batch + status bar verte _« N drafts ready »_ + toast.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Clip-extraction turn**     | Pill spinner → carte résultat « Open clips » quand l'extraction background finit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Selection echo**           | Le choix de l'utilisateur reste visible sous forme de carte/chip (source, idée, clip, langue, profils, top-post). Voir mémoire _selection-echo-pattern_.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Connect-a-service prompt** | Coller un lien vers un connecteur non connecté (Slite/Notion/Google Docs) affiche une carte « Not connected » + boutons **Connect / Cancel**. Connect → statut vert _« <Name> connected — importing… »_.                                                                                                                                                                                                                                                                                                                                                                                      |
| **Chat-switch skeleton**     | ~340 ms de bulles shimmer en changeant de chat démarré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Watchdog loading**         | Un turn coincé en `loading` > 30 s déclenche un toast _« This is taking longer than expected… »_ ([`thinking-chip.js`](../../src/screens/session/thinking-chip.js)).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Requête connecteur (MCP)** | Avec un connecteur attaché : `sendConnectorMessage` simule un aller-retour MCP (notice _« Querying <Name> via MCP »_ + trace d'outils) puis une réponse citée.                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

Dialog mono-méthode (le titre reflète la méthode). Entrées : panneau Sources « Attach source », menus `+`.

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

### Image Studio ([`components/image-studio/`](../../src/components/image-studio/))

Modale near-fullscreen, deux modes pairs (**Generate** / **Edit**, tabs DS). Entrées : « Generate
an image » d'un draft, ou l'action d'édition d'un draft qui a déjà une image (ouvre directement en
Edit, ou en résultats carousel si le draft porte plusieurs slides). Tout l'état + les mocks vivent
dans [`image-studio.js`](../../src/image-studio.js) (UI-agnostique) ; la vue est découpée en
`shell-view` / `compose-view` / `edit-view` / `interactions`.

- **Generate** — rail de gauche : le prompt qu'Archie dérive du post à l'ouverture (**« Suggest from
  this post »**, ~2 s) puis six réglages repliables portant chacun sa valeur courante :
  **References** (une seule section, voir ci-dessous) · **Text in image** (optionnel, ≤ 90 car., ≤ 4 lignes — les mots qu'Archie écrit DANS
  l'image, à ne pas confondre avec l'overlay texte déplaçable du mode Edit ; mocké en cuisant le
  texte dans les pixels de la variation via `compositeOverlays`, donc il survit aux vignettes, à
  l'aperçu in-feed, au recadrage, au « Redraw » et au draft final) · **Image type** (Visual hook /
  Infographic / Illustration) · **Style preset** (6 vignettes,
  désactivé dès qu'il y a une référence) · **Format** (ratios recommandés du network) · **Output**
  (Single / Carousel + nombre de variations ou de slides ; carousel sur LinkedIn 20 / Instagram 10).
  Canvas à droite : empty → generating (~4 s) → résultats (grande image + rail de variations
  flottant) ; bascule **Image / In feed** (aperçu via `renderPostCard`).
- **Edit** — canvas plein, palette d'outils flottante (**Crop** freeform avec ratios + poignées ·
  **Add text** · **Add image** : upload ou 16 presets), barre IA flottante « Describe a change… »
  (~2,6 s), overlays texte/logo déplaçables/redimensionnables/rotatifs avec mini-toolbar (couleur,
  police, bold, italic, outline, shadow, delete) et undo.
- **Commit** : **Use this image** aplatit les overlays sur l'image (`compositeOverlays`) puis
  `attachImageToDraft` + toast ; en carousel, `attachCarouselToDraft` avec toutes les slides
  (« Apply to slide N » rebake une slide éditée).

#### Image Studio v2 — prompt en bas (flag `imageStudioV2`, **défaut ON**)

Redesign complet de la même feature, monté en parallèle
([`components/image-studio-v2/`](../../src/components/image-studio-v2/)) et servi **par défaut** ; le
flag à OFF rebascule sur v1. **Mêmes options, même moteur d'état** (`image-studio.js`, clé `studio-v2`) —
seule la surface change, ce qui permet de comparer les deux à comportement identique.

- Un header d'une seule ligne (titre · tabs de mode · bascule Image/In feed), un **stage pleine
  largeur**, et **un composer unique en bas**.
- **Generate** : le composer est une **carte** centrée en bas (champ + bouton **Generate** côte à
  côte, `secondary blue` — c'est une étape, pas la destination : l'unique primary de la modale est
  « Use this image » dans le footer). Le champ est plafonné à **4 lignes** puis scrolle : un brief
  dérivé en fait sept, et le laisser haut de sept lignes faisait du composer le plus gros objet de
  la modale alors que c'est l'image qu'on juge. Le plafond vaut exactement `4 × line-height` — le
  scrollport d'un textarea couvre son contenu ET son padding, et il n'y a pas de padding en haut.
  Les réglages vivent dans un panneau de sections `.ap-accordion` à gauche du stage — **la classe
  DS, pas le comportement** : une section ouverte le reste, et en ouvrir une seconde ne referme
  pas la première. Un-à-la-fois gardait le panneau court mais interdisait de voir deux réglages
  en même temps et refermait dans le dos de l'utilisateur ce qu'il avait ouvert. L'état vit dans
  `collapsedGroups` — le Set que le composer de **v1 utilisait déjà**, si bien que les deux
  studios suivent le même modèle et que `openPopover` retrouve son seul sens : les flyouts du
  mode Edit, eux réellement exclusifs.
  **Une seule section References, épinglée ouverte.** Brand kit était une ligne à part au-dessus,
  et c'était une distinction sans différence : des deux côtés, une image dont la génération doit
  s'inspirer. D'où elle **vient** est un label sur la tuile, pas une raison d'avoir deux sections —
  et séparées, il fallait regarder à deux endroits pour répondre à une seule question (« ça va
  ressembler à quoi ? »). Épinglée pour la même raison qu'avant : une section qu'on rouvre à chaque
  visite ne devrait pas être une section à ouvrir. Son en-tête cesse alors d'être un contrôle — un
  `<div>` et non un `<button>`, sans chevron ni hook de toggle — et n'entre jamais dans
  `collapsedGroups` ; sa valeur est le **nom de l'image choisie** (`Product UI`), ou `None`.
  Chaque groupe est **libellé par sa provenance** — `Brand book — Acme` et `Custom` — et le libellé
  s'affiche même quand il n'y a qu'un groupe : les deux sections disparues, c'est la seule chose qui
  dise encore que ces images viennent du brand book du Playbook, et nommer le book nomme le standard
  auquel l'image générée est tenue. Tiret cadratin et pas point médian, un nom de Playbook en
  contenant déjà. La **valeur de l'en-tête replié est cette provenance** (`Acme` / `Custom` /
  `None`), pas le nom du fichier : « Product UI » redisait une vignette qu'on a sous les yeux, alors
  que la provenance est ce qu'une vignette ne montre pas.
  L'ajout est un **bouton** (`stroked grey`) avec sa ligne d'explication dessous, pas un panneau de
  drop pointillé : le panneau faisait 64px de haut pour une action à un clic, et c'était l'objet le
  plus gros d'une section dont le sujet est les vignettes au-dessus. Le drop marche toujours —
  `data-img-dropzone` est sur le bouton, et le mode Generate accepte de toute façon un drop
  n'importe où dans la modale.
  **Aucun séparateur à l'intérieur de la section** : un filet entre les vignettes et le bouton
  redessinait exactement la frontière que la fusion venait d'enlever. Les libellés de groupe
  séparent déjà les viviers, et le cadre de la section la sépare déjà de Text in image.
  **Un switch « Use a reference image » possède l'état « aucune ».** Générer sans référence est un
  vrai choix — c'est comme ça qu'on obtient une image qui n'est tenue à rien — mais il n'était
  atteignable qu'en re-cliquant la tuile choisie, donc seulement en essayant. Essayé en **tuile
  « None »** d'abord : 81px de carré pour du néant, alors qu'un choix à deux états est très
  exactement ce qu'est un switch. **Off masque la grille** (le switch EST la disclosure) et
  **mémorise le choix** (`lastRefId`), donc rallumer ne fait pas rechercher son image. Corollaire :
  les tuiles redeviennent un **radio pur** — re-cliquer la tuile choisie ne fait rien, parce que
  deux chemins vers le même néant, c'est un de trop. Ajouter une image rallume le switch.
  **Branding** — une section à part, après Text in image : références / mots / marque, c'est le trio
  « ce qui va DANS l'image », avant les réglages de traitement en dessous. Un switch « Show my logo
  on the image » + un aperçu de la marque, parce qu'un logo qu'on ne voit pas est un réglage qu'on
  doit croire sur parole. **ON par défaut** quand le Playbook a un logo (`ctx.brandLogo`) : une image
  faite pour une marque la porte, sauf avis contraire. Sans logo la section est **désactivée, pas
  masquée** — une section absente laisse se demander si la fonctionnalité existe, une section grisée
  dit où aller la chercher. Le logo est cuit dans les pixels par le même `compositeOverlays` que
  « Text in image » (overlay `kind: "logo"`, 26% de la largeur, **en bas à droite**), donc il survit aux
  vignettes, à l'aperçu in-feed, au recadrage et au draft final. Comme tous les autres réglages, il
  s'applique à la **génération suivante**, pas rétroactivement.
  **Pas de réglage de placement — juste un aperçu du logo.** La marque atterrit en bas à droite,
  point (`BRAND_MARK` dans `image-studio.js` : `xF 0.78 / yF 0.89 / wF 0.26`, le centre de l'overlay,
  donc la même marge d'environ 9% à droite et en dessous). C'était choisissable — neuf ancres d'une
  grille 3×3 — et le choix ne servait pas : signer un visuel en bas à droite est le défaut pour la
  même raison que sur papier. La seule décision qui reste à l'utilisateur est **si** la marque
  apparaît, donc tout ce que la section lui doit est « voici le logo que j'utiliserais » — celui du
  Playbook, et le voir est ce qui permet d'attraper un logo faux ou périmé avant de générer.
  L'aperçu est une **tuile encadrée** (bordure + fond blanc + padding) : un logo nu posé sur le
  panneau se lit comme du mobilier, une tuile bordée se lit comme un fichier qu'on a fourni. Elle est
  **dimensionnée par la hauteur** (44px), largeur libre : la tuile n'a pas de largeur propre, donc
  une marque bornée par `max-width: 100%` n'avait rien dont être un pourcentage et se repliait à
  18px — et laisser la largeur suivre est ce qui fait sortir correctement aussi bien un wordmark
  qu'un monogramme.
  **Une seule taille de vignette dans tout le panneau : 80px** (`--isv2-tile`, porté par
  `.isv2-panel`) — les tuiles de References. Deux
  tailles de vignette dans un même panneau se lisent comme deux natures de chose, alors que ce sont
  toutes « une image que tu m'as donnée ». 80 et pas 88 par arithmétique : le corps du panneau fait
  260px, et trois tuiles plus deux gaps de 8px font 256 — exactement trois visibles.
  **La bande de References est un SCROLLER horizontal, pas une grille qui passe à la ligne.** Un pool
  qui wrappe fait grandir le panneau d'une rangée à la fois — à dix images les réglages poussent le
  composer hors de l'écran — alors qu'une bande a la même hauteur à trois images comme à trente. En
  flex (`flex: 0 0 var(--isv2-tile)` sur le slot suffit à un scroller ; `grid-auto-flow: column`
  aurait dû redire la taille de piste).
  Conséquence à corriger : trois tuiles rentrent **exactement**, donc aucune quatrième ne dépasse pour
  signaler qu'il y en a d'autres, et macOS cache sa scrollbar overlay tant qu'on n'a pas déjà
  scrollé — dix images se liraient comme trois. Au-delà de `VISIBLE_REFS` (3), le groupe reçoit
  `.is-scrollable`, qui allume un **fondu de bord piloté par la position de scroll** : plein du côté
  atteint, fondu du côté où il reste des images. Le fondu anime deux **propriétés personnalisées
  enregistrées** (`@property --isv2-fade-l/r`, typées `<length>`) et non `mask-image` directement —
  un gradient non enregistré s'interpole de façon discrète dans Chrome, donc le masque basculait de
  côté en une frame à mi-course. À 0px la paire de stops se réduit à une largeur nulle : pas de
  fondu du tout, ce qui est exactement l'aspect attendu du bord qu'on a atteint.
  **Deux interrupteurs, pas un** — « Show my logo » et « Use brand colors ». Le logo et la
  palette sont deux impositions différentes sur une image : beaucoup de posts veulent les couleurs de
  la marque sans son wordmark dans un coin, et un visuel de lancement peut vouloir la marque sur
  l'artwork de quelqu'un d'autre. Un seul interrupteur prenait la moitié bon marché en otage de la
  moitié chère. Chacun ouvre SA propre partie (le placeur au logo, les pastilles aux couleurs) — les pastilles **sans libellé à elles**, directement sous l'interrupteur : « Use brand
  colors » suivi de cinq pastilles dit tout ce qu'une légende « Brand color » intercalée disait, et
  cette légende faisait lire la paire comme deux rangées au lieu d'un seul énoncé, les
  deux sont ON par défaut quand le Playbook a de quoi, et un interrupteur sans matière reste
  **visible mais désactivé** avec la raison en dessous (« This Playbook has no logo yet. ») — un
  contrôle qui disparaît laisse se demander si l'option existe. La valeur d'en-tête nomme la moitié
  active (`Acme` / `Logo only` / `Colors only` / `Off` / `No brand kit`), parce qu'« On » cacherait
  la différence entre un logo tamponné et un brief de couleurs.
  Chaque paire interrupteur + contenu est **emballée** (`.isv2-brandgroup`) : le corps de
  l'accordéon espace ses enfants uniformément, donc sans emballage l'écart entre un interrupteur et
  ce qu'il commande valait celui entre les deux moitiés, et le placeur se lisait autant comme
  appartenant à la rangée du dessous.
  Côté moteur, `useBrandColors` conditionne la ligne `Palette:` du brief. Comme le brief n'est écrit
  qu'à l'ouverture et que Generate envoie **le champ** et pas les réglages, l'interrupteur **édite
  cette ligne en place** (`syncPaletteLine`) : re-dériver jetterait tout ce que l'utilisateur a tapé,
  ne rien faire rendrait l'interrupteur inerte pour la génération qu'il s'apprête à lancer. La ligne
  revient à sa position d'origine (après `Look:`), pas en fin de brief.
  Un **libellé et ce qu'il titre forment UN bloc** (`.isv2-block`, 4px à l'intérieur, les 12px du
  corps entre blocs) — partagé par les groupes de References et par « Brand color », sinon les deux
  sections dérivent : le libellé de References collait à ses vignettes à 4px pendant que celui de
  Branding flottait à 12px de ses pastilles, la même relation à deux espacements.
  **Les couleurs ne font pas partie du logo** : elles ont leur propre interrupteur et leur propre
  rangée — les glisser à côté de la marque disait qu'elles lui appartenaient. Un **récap des couleurs de marque** : les **mêmes pastilles rondes que la ligne
  « Brand color » du Playbook** (`.recap__fact-dot`), et les mêmes mots — un récap doit ressembler à
  ce qu'il récapitule. Nom + hex en tooltip ; l'hex imprimé sous chaque pastille transformait une
  rangée de cinq en deux lignes de petit texte que personne ne lit dans un panneau. Les règles sont
  redites côté studio plutôt qu'importées : `welcome.css` appartient à un écran sans rapport, et
  coupler le studio à lui pour six lignes est le pire des deux échanges — au troisième consommateur,
  promouvoir dans `styles/components/` comme `topic-badge`.
  `playbookColors` porte `{ name, hex }` et non des hex nus : les quatre consommateurs qui veulent
  l'hex le mappent, et deux tableaux parallèles pour une seule palette, c'est ce qui dérive.

  **Une seule image de référence à la fois**, prise indifféremment dans le brand book du Playbook ou
  dans les uploads de l'utilisateur — donc le marqueur de tuile est un **radio**, pas une coche :
  une coche promet qu'on peut en cumuler. `aria-pressed` et non `role="radio"`, parce que cliquer
  la tuile choisie la désélectionne et qu'un groupe radio ne sait pas revenir à vide — même contrat
  single-select-avec-toggle-off qu'Image type et Style preset. Côté état : `playbookRefs` et
  `uploadedRefs` sont deux **viviers**, `selectedRefId` est le choix, et `referenceImages` reste un
  tableau de 0 ou 1 **dérivé** par `syncSelectedRef()` — parce que le prompt, la seed de génération
  et le verrou du Style preset lisent tous « les références en jeu » sans se soucier du nombre. Les
  deux studios partagent ce modèle, donc v1 est single-select aussi. `MAX_REFS` borne désormais le
  **vivier d'uploads**, pas une multi-sélection.
  Le titre de la modale est un `.ap-dialog-title` **à la taille du DS (24px), sans glyphe** : il
  avait été descendu à 14px pour « tenir à côté » de la bande d'onglets, qui est en fait sur sa
  propre ligne en dessous — il n'y avait donc rien à accompagner, et le studio portait juste le
  plus petit titre de toutes les dialogs de l'app.

- **Edit** : le même composer devient la barre IA (rangée 1) et les chips d'outils Crop / Add text /
  Add image (rangée 2). Le rail de gauche, le footer, la barre IA flottante et la palette flottante
  de v1 disparaissent tous les quatre. Ne restent sur le canvas que la boîte de crop (avec son ✕/✓)
  et la mini-toolbar du texte sélectionné — ce qui doit suivre un pixel précis.
- Le drop d'une image est accepté **sur toute la modale** en mode Generate (la feuille References
  est le plus souvent fermée) et ouvre la feuille pour montrer ce qui vient d'atterrir.

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

Un Playbook est une **fiche** : chaque section répond à « qui êtes-vous ? ». La config opérationnelle (quelles sources d'écoute tournent, à quelle fréquence) vit sur la route qui possède la feature, pas ici — voir §17. Une section Topics a été essayée puis retirée : une grille d'interrupteurs se lisait comme un panneau de réglages coincé dans un profil.

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
- **Nav** : **New chat** (⇧⌘O), **Search…** (⌘K), puis **Playbooks**, **Connectors** (flag `connectors`) avec count badges.
- **Recent** : groupés Pinned / Recent. Un bouton filtre au-dessus de la liste ouvre **Group by** Aucun/Playbook/Date + **Sort by** Récence/Alphabétique — Pinned reste toujours en tête ; la préférence persiste (`archie-chat-organize`). Row = dot couleur playbook (masqué quand `playbookColors` est OFF) + titre + menu ⋮ (**Rename / Pin / Delete**). Delete → confirm + sweep de tous les stores per-session.
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

### Feature flags ([`ff-catalog.js`](../../src/ff-catalog.js)) — les 12

| id                       | label                           | défaut  | Gate                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draftInlineEdit`        | Inline edit on draft posts      | **OFF** | Édition inline des post cards.                                                                                                                                                                                                                                 |
| `playbookDefault`        | Default Playbook toggle         | **OFF** | Étoile ★ set/unset default sur `/playbook/:id`.                                                                                                                                                                                                                |
| `connectors`             | Connectors (live MCP sources)   | **OFF** | Toute la feature connecteurs (gallery, modal, submenu, Live connectors, tab modal).                                                                                                                                                                            |
| `conversationStatusCard` | Conversation status card        | **OFF** | Carte flottante + toggle « i ».                                                                                                                                                                                                                                |
| `statusActionSnackbars`  | Action success snackbars        | **OFF** | Snackbars succès dupliquant la status bar.                                                                                                                                                                                                                     |
| `playbookColors`         | Playbook colors                 | **OFF** | Quand OFF (défaut), masque les visuels couleur Playbook partout (classe `body.hide-playbook-colors`) ; ON = couleurs affichées.                                                                                                                                |
| `multilingualPlaybook`   | Multilingual Playbooks          | **OFF** | Playbooks multi-langues (voice par langue, étape langue du draft flow).                                                                                                                                                                                        |
| `manyProfiles`           | Many connected profiles (demo)  | **OFF** | Seed ~40 profils connectés variés → le quickpicker de profil affiche une recherche live (voir §draft flow).                                                                                                                                                    |
| `playbookCompetitors`    | Playbook competitors            | **OFF** | Section **Competitors** du Playbook (panneau + entrée de rail + compteur `/contexts`). La donnée reste présente quand OFF (voir §9).                                                                                                                           |
| `imageStudioV2`          | Image Studio v2 (prompt en bas) | **ON**  | Les actions image d'un draft ouvrent le redesign v2 (stage pleine largeur, composer en bas, réglages en sections indépendantes). OFF rebascule sur l'Image Studio précédent. Mêmes options, même moteur d'état (voir §7).                                      |
| `topics`                 | Topics (listening dossiers)     | **OFF** | Toute la feature **Topics** (§17) : la route `/topics` + son entrée de nav et son compteur d'unseen, la dialog du dossier, et la page **/topics/settings**. La donnée (dossiers seedés + `ctx.topics`) reste présente quand OFF, comme `playbookCompetitors`.  |
| `contentResearch`        | Idea streams                    | **OFF** | Toute la feature **Idea streams** (§18) : les routes `/content-ideas*`, l'entrée de nav + son compteur, et le picker « Pick from Idea streams » du menu Add. Le carrousel de la page nouvelle session disparaît avec. Deep-link périmé → `/`, comme `/topics`. |

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

## 17. Topics — les dossiers du listening (flag `topics`, défaut OFF)

Le seul endroit où **Archie propose** au lieu d'attendre. Le listening Agorapulse remonte des posts sociaux sur six sources rattachées à un Playbook ; Archie en assemble un **Topic** : une accroche (le constat), une analyse écrite, et les posts qui la fondent. Fichiers : [`topics-catalog.js`](../../src/topics-catalog.js), [`topics-store.js`](../../src/topics-store.js), [`screens/topics.js`](../../src/screens/topics.js), [`components/topic-card.js`](../../src/components/topic-card.js), [`components/topic-modal.js`](../../src/components/topic-modal.js), [`components/social-post-card.js`](../../src/components/social-post-card.js), [`topic-flow.js`](../../src/topic-flow.js).

### Les six sources ([`topics-catalog.js`](../../src/topics-catalog.js))

**Config, pas contenu** — le catalogue ship avec l'app et existe aussi en mode `new-alt` (un utilisateur neuf voit les six cartes même s'il n'a aucun dossier). Même partage que `ff-catalog.js` (config) vs `mocks.js` (data). Descriptions écrites **à la 1ʳᵉ personne d'Archie**.

| Source                    | Accent        | `playbookAnchor` | Défaut |
| ------------------------- | ------------- | ---------------- | ------ |
| **Competitors**           | purple        | `competitors`    | **ON** |
| **Influencers**           | red           | `influencers`    | **ON** |
| **Brand feedback**        | menthol       | —                | OFF    |
| **Competitor monitoring** | electric-blue | `competitors`    | OFF    |
| **Industry trends**       | green         | —                | OFF    |
| **Global trends**         | orange        | —                | OFF    |

`accent` est une **clé sémantique, jamais un hex** → `.topic-badge--<accent>` ([`topic-badge.css`](../../styles/components/topic-badge.css), partagé par les trois surfaces). `playbookAnchor` — jamais l'id — dit quelle section du Playbook alimente la source, donc la vue offre un deep-link sans hardcoder d'id.

### Config par Playbook

`ctx.topics = { enabledSourceIds, cadence }` — **une seule cadence pour tout le Playbook** (daily / weekly / monthly), pas une par source. Normalisé par `normalizeTopics()` dans [`contexts-store.js`](../../src/contexts-store.js), appliqué dans `addContext` **et sur le seed** (qui bypasse `addContext`). Édité sur **`/topics/settings`** — voir ci-dessous. Le Playbook **ne porte rien** de tout ça.

**La cadence est du copy, pas un timer** — un tick hebdo ne se déclencherait jamais dans une démo. Le côté récurrent vient du bouton **Refresh now**.

### Le feed (`/topics`, [`screens/topics.js`](../../src/screens/topics.js))

Header **« Topics »** + _« N new · N topics · from N Playbooks »_ (les Playbooks **représentés** dans le feed, pas ceux surveillés — « across 4 Playbooks » est un mensonge quand neuf dossiers viennent de deux) + **⚙ Settings** (vers la page de réglages) + **Refresh now** (`secondary blue` : rafraîchir une liste est une action de page routinière ; l'orange est réservé au geste spotlight sur une carte).

- **Filtres — deux `.ap-select`** (`Playbook` · `Source`), même forme de toolbar que le board top-posts (Period / Sort), avec le `.ap-select-inline-label` du DS pour que chaque facette se nomme elle-même. Le DS **ship bien** un composant _Filters dropdown_ (V2 Molecules › `Filters dropdown` — panneau 420px de checkboxes + `Clear filters` / `Apply filters`, soit `<ap-filter-dropdown>` avec `needApplyButton`), et c'est le bon composant quand l'utilisateur **compose un jeu multi-valeurs et l'applique en un coup**. Ici chaque facette prend **une** valeur et s'applique immédiatement : deux selects **montrent la sélection sans être ouverts**, ce qu'un déclencheur « Filters (2) » ne peut pas faire. Une puce par Playbook était la troisième option — le même piège que la config a rencontré : elle ne survit pas à vingt Playbooks, un select oui.
  - **Les compteurs de chaque facette sont calculés contre la sélection de l'AUTRE** (`.ap-select-option-badge`), donc un nombre ne promet jamais des lignes que les filtres en cours excluraient (Pawtrack + toutes sources = 7, et ses six compteurs par source font exactement 7).
  - **Un compteur à zéro _désactive_ l'option au lieu de la masquer** — la liste ne se réorganise pas sous le curseur. Le DS n'a pas de modifier `disabled` sur `.ap-select-option` : c'est un état applicatif sur `.topics-filter__select`. Effet de bord voulu : une combinaison morte est **inatteignable** par l'UI.
  - **Seuls les Playbooks présents dans le feed ont une option** — un filtre qui ne peut que ne rien renvoyer n'est pas un filtre. C'est ce qui règle vraiment l'échelle : la liste grandit avec le **contenu du feed**, pas avec la taille du compte (à 14 Playbooks le select en listait 3). La dalle `.ap-select-search` apparaît au-delà de 8 options.
  - **`Clear` n'apparaît que s'il y a quelque chose à effacer** — chaque select a déjà son « All », donc un Clear permanent serait une troisième façon de faire la même chose.
  - **`?pb=` pour le Playbook, state module pour la source** — la facette source change beaucoup plus souvent que le scope et empilerait une entrée d'historique par clic.
- **Sous-titre filtré** — _« 2 of 9 topics · Pawtrack · always-on · Competitors »_ : « 9 topics » au-dessus d'une liste de 2 se lit comme un bug.
- **Feed** — un flux chronologique groupé par date : **This week** (`ageDays ≤ 7`) / **Earlier this month** (`≤ 30`) / **Earlier**. Groupes vides masqués.
- **Carte** ([`topic-card.js`](../../src/components/topic-card.js)) — un **brief éditorial** : kicker, accroche, chapô, ligne de signature.
  - **Kicker à gauche, marques à droite**, `space-between` : `[badge] Source · quand` d'un côté, `[chip Playbook] • New` de l'autre. En une seule file, seul le badge restait à sa place — tout le reste glissait selon la longueur du nom qui le précédait. Deux ancres fixes donnent deux colonnes à scanner : la **source** (quelle écoute a trouvé ça) et les marques. `margin-left: auto` sur les marques, pour qu'un nom de Playbook long qui les fait passer à la ligne les garde à droite.
  - **L'accroche mène** : `--sys-text-style-h2` (**18px/700**). Elle était en h4 — **14px, la taille du résumé** — donc la carte n'avait pas de tête et chaque brief se lisait comme un paragraphe gris. Plafond **62ch** (et non 52 : à 52 cette accroche cassait en « …peace / of mind ») + `text-wrap: balance` et clamp **2 lignes** — une orpheline est le plus court chemin pour perdre un scan, une 3ᵉ ligne veut dire que l'accroche fait le travail du résumé.
  - **Rythme en marges explicites**, pas un gap uniforme : kicker → 8 → accroche → 4 → chapô. Avec un gap unique, l'accroche ne se lit plus comme ce à quoi le chapô appartient.
  - **Filet au-dessus du pied**, sur la couleur de bordure de la carte : sans lui le brief et les actions formaient un seul aplat, et le « Start a chat » teinté finissait par concurrencer l'accroche. Pied : `.ap-avatar-group` des auteurs + « N posts », puis **Dismiss** (ghost grey) et **Start a chat** (`secondary orange` — neuf boutons pleins en colonne, aucun ne lit comme important).
  - Corps = un seul `<button>` qui ouvre la dialog ; les actions vivent dans un footer **frère** (un bouton dans un bouton est du HTML invalide). Hover = bordure bleue, sans élévation. Neuf cartes de **hauteur identique** (187px au measure du feed), ce qui est la moitié de la scannabilité. Unseen se lit au **point orange « New »** dans l'eyebrow, jamais à un liseré de bord : l'état d'une carte est dans son **contenu**, pas sur son cadre.
- **Scan** — Refresh passe en état scanning (`.archie-loader` + skeletons ~2 s) puis `refreshTopics()` prepend 2 dossiers unseen et **vieillit tout le reste d'un jour**, donc les arrivants sont vraiment les plus récents.
- **Empty states** — trois culs-de-sac distincts : rien d'activé nulle part (**« Tell me what to watch »** → navigue vers `/topics/settings`, l'endroit qui règle le problème), filtres sans résultat (**« Nothing matches those filters »**, qui nomme **les deux** facettes — « nothing from that source » est faux quand c'est le Playbook qui exclut ; atteignable seulement en écartant le dernier match, puisque les combinaisons mortes sont désactivées), feed vidé à la main (**« Nothing new right now »** + la cadence la plus rapide). Précédence voulue : neuf dossiers avec zéro source active affichent quand même le feed — les dossiers sont toujours là à lire.

### La page de réglages (`/topics/settings`, [`screens/topics-settings.js`](../../src/screens/topics-settings.js))

**Une page, pas un onglet.** Un onglet donnait à la config le même poids que le feed, ce qui est faux pour ce qu'elle est : on règle ses sources une fois puis on lit des topics pendant des mois. Le feed est la destination ; ceci est un endroit où l'on passe de temps en temps. Ce **n'est pas** un retour de la page Settings agrégée revertée trois fois : la règle du projet autorise la config sur l'entité qui la possède **ou sur une route scopée à une seule feature**, et c'est la seconde. `route()` ancre sa regex (`^…$`), donc `/topics/settings` est un frère distinct de `/topics`.

- **Entrée** — un bouton **libellé** « ⚙ Settings » à côté de Refresh now (un cog nu obligerait à survoler un glyphe pour savoir ce qu'il ouvre), plus le CTA de l'empty state « Choose what I watch » (une **action**, pas le nom de la surface : « Tell me what to watch » → [Settings] serait un cul-de-sac plus faible). Le titre de la page est **« Topics settings »** et pas un « Settings » nu : sur une route où le projet interdit d'agréger la config, un titre qui dit seulement Settings se lit comme global — la même erreur que les trois pages revertées. **Sortie** — le back du topbar (`backTargetFor`, même mécanisme que `/playbook/:id`), qui **remporte `?pb=`** : un feed filtré survit à l'aller-retour. L'entrée de nav Topics reste allumée (`match` en préfixe).
- **Chrome DS « settings »** — `--sys-settings-*` pour la coquille et les cartes (`content-background-color`, `-internal-margin`, `-vertical-spacing`, `-max-width-lg` **1200px** — voir la grille ci-dessous ; `card-background-color` / `-border-color` / `-border-radius` / `-internal-padding`), `.ap-card` + `.ap-card-title`, `h1.ap-h1` (**24px**, pas le `.ap-h2` de la recette : à 18px le titre de page n'est qu'à 2px des titres de carte et la hiérarchie se lit plate — et 24 est aussi la taille du titre du feed) + `p.ap-body`. Les guidelines interdisent les `--ref-*` génériques **pour la coquille et les cartes** ; les gaps intra-composant restent sur `--ref-spacing-*`, exactement comme l'exemple de la recette. Seul `--sys-settings-card-feature-lock-border-color` était utilisé dans l'app avant : c'est donc la **première utilisation de la moitié layout** de cette famille. **Pas de save bar** — tout commit immédiatement.
- **Un seul Playbook à la fois**, scopé par `?pb=` (le même param que le filtre du feed). Le scope est **au-dessus** des cartes : c'est le sujet de la page, pas une de ses sections. « Playbook » le nomme en prose en plus d'offrir le contrôle — une page qui ressemble à des réglages se lit sinon comme globale, et `.ap-select` se réduit à une option quand il n'y a qu'un Playbook. Empiler un bloc par Playbook a été essayé : à vingt Playbooks c'est 120 switches et six descriptions répétées vingt fois — et ce sont les **descriptions** qui font exploser la page.
- **Une barre de scope, puis une carte par source.** Les deux contrôles de niveau page — quel Playbook, quel rythme — sont **deux `.ap-form-field` côte à côte** (label au-dessus du `.ap-select`), pas une carte chacun : la même forme à deux selects que la barre de filtres du feed, donc les deux écrans se ressemblent. Puis un label de groupe _« Sources · 2 of 6 on »_ et **les six sources en cartes**, deux colonnes.
  - **Pourquoi ce n'est plus une carte par contrôle + six lignes dans une septième** (la première version) : un titre de carte au-dessus d'un seul `.ap-select` est surtout du padding — la page se lisait comme deux boîtes presque vides — et **une ligne ne peut pas porter les options propres à une source**, ce qui est précisément la raison d'être des cartes. Le pied de carte est ce **slot** ; aujourd'hui il ne contient que la dépendance Playbook, pour les deux sources concernées.
  - **`-max-width-lg` (1200) et deux colonnes**, pas les 700 de la recette « formulaire » : à 700 deux colonnes sont serrées et une colonne donne 900px de scroll de bandes larges et courtes… qui relisent comme des lignes. À 1200 chaque colonne fait ~570px — une largeur de carte. La prose au-dessus est plafonnée à 72ch séparément.
  - **Le passage à une colonne est une `@container` query**, pas une media query : la sidebar se replie, donc la largeur du viewport ne dit pas la largeur du contenu.
  - **OFF = la carte perd son fond** et laisse voir la page à travers (plus badge en grayscale et texte atténué), donc la grille dit d'un coup d'œil ce qui est vivant. **La bordure est identique dans les deux états** — l'état d'une carte est dans son contenu, pas sur son cadre.
  - Les cartes d'une même rangée sont **à hauteur égale** et le pied est poussé en bas (`margin-top: auto`), pour que les notes s'alignent au lieu de flotter.
- **Commit direct** — un switch écrit via `updateContext`, `contexts-store` notifie, `subscribeContexts` repaint, et le focus est **remis sur le switch** (sinon chaque bascule au clavier renvoie en haut de page). `change` et pas `click` (un clic sur le `<label>` se propage à l'input, ce qui doublerait ; et `change` attrape l'Espace). Ids stockés **dans l'ordre du catalogue**. Recherche dans le picker au-delà de 8 Playbooks.
- **Dire que les autres diffèrent** — _« 3 other Playbooks watch different sources »_, parce qu'un-à-la-fois invite au « je croyais avoir réglé ça partout ».
- **Empty state** — aucun Playbook (mode `new-alt`) : **« No Playbooks yet »** + lien vers `/contexts`.

⚠️ **Deux pièges DS rencontrés ici**, valables ailleurs : `.ap-select-not-found` et `.ap-selection-dropdown-empty` portent un `display` qui bat `[hidden]` → masquer en `style.display` inline. Et **des backticks dans un commentaire HTML terminent le template `html``**.

### La dialog du dossier ([`topic-modal.js`](../../src/components/topic-modal.js))

`.ap-dialog` **720px** — c'est de la prose, le 920 des connecteurs dépasse une mesure confortable. Lifecycle standard via `modal-coordinator` (un overlay à la fois, focus restore, Esc / backdrop). L'ouvrir vaut lecture (`markSeen`).

Titre = **l'accroche** (le constat est ce qu'on vient lire ; un « Topic » générique au-dessus ne fait que le pousser vers le bas). La provenance est un **kicker AU-DESSUS** (badge + source · âge + chip Playbook), pas un sous-titre en dessous : même ordre que la carte du feed qu'on vient de cliquer, donc la dialog se lit comme cette carte ouverte. En `.ap-dialog-subtitle` elle était à **16px**, une seule marche sous un titre de 24 — l'en-tête se lisait comme deux titres ; elle est à 12px. Le Playbook reste un `.ap-tag` comme sur la carte : son nom contient lui-même un point médian (« Pawtrack · always-on ») et en texte dans une ligne à séparateurs, le kicker devenait quatre points d'affilée. Accroche plafonnée à **42ch** (34 forçait un retour que le conteneur ne demandait pas : 512px dans une colonne de 654) + `text-wrap: balance`. **Filet sous l'en-tête**, parce que le corps _scrolle_ : sans lui la prose glissait sous le titre sans rien pour dire que le titre est une couche fixe — le DS en met déjà un au-dessus du footer, la zone de lecture est donc bornée en haut et en bas.

Corps : eyebrow orange **« What I found »** (`ap-icon-sparkles` à 14px, pas 16 — à 16 l'icône était plus grosse que le mot de 12px à côté), titre d'analyse, les paragraphes ; puis un filet, **« Source posts »** + compteur, et les cartes de posts. Footer : **Start a chat** (`primary orange` — il n'y en a qu'un ici) + **Not for me**.

**C'est la seule surface de l'app dont le métier est de lire**, donc la prose a un réglage de lecture et pas le réglage d'UI : **16px** (`--ref-font-size-md`, la taille que le DS emploie lui-même pour un sous-titre de dialog) et **la couleur de texte par défaut, pas `-light`** — trois paragraphes d'argumentation en 14px gris, c'était le plus petit texte de l'app pour le plus gros travail, et le gris clair rendait l'argument plus pâle que le mobilier autour. `line-height` 1.65 et **24px entre paragraphes** : à 16/1.65 une ligne fait 26px, donc l'ancien gap de 16 était inférieur à une ligne et les paragraphes se lisaient comme un seul mur. Mesure plafonnée en `ch` (68), pour tenir ~72 caractères quelle que soit la taille.

🐛 **Corrigé au passage** : « Not for me » ne levait **jamais** son toast Undo. `onClick` appelait `close()` — qui remet `onDismiss` à `null` — _avant_ `onDismiss?.(id)`, donc l'appel était un no-op silencieux. Le callback est maintenant capturé avant la fermeture. Le Dismiss de la carte n'était pas touché, seulement celui de la dialog.

**Social post card** ([`social-post-card.js`](../../src/components/social-post-card.js)) — le post publié par **quelqu'un d'autre**, comme preuve. Délibérément pas `top-post-card` : celui-là résout l'identité via tes propres profils connectés et présente ses chiffres comme une décision de perf. Ici l'auteur n'est pas toi et l'engagement fonde une affirmation. Avatar DS teinté (`data-accent`), handle, réseau · âge, la marque officielle du réseau en haut à droite (les glyphes `-official` du DS **portent leurs propres couleurs** — des SVG data-URI, donc aucun hex tiers en dur), texte, et les compteurs compactés (`1.4K`). `compact: true` retire l'engagement et clampe à 2 lignes.

### Ce qu'on peut en faire

Deux actions, pas plus : **Start a chat** et **Dismiss**.

- **Start a chat** ([`topic-flow.js`](../../src/topic-flow.js)) — `openTopicInChat()` arme le handoff `pendingTopicChat` et navigue vers `/session/new-<ts>?contextId=…&title=<accroche>` (les query params pilotent déjà le nom et le Playbook d'une session `new-*`, donc le chat est correctement lié dès sa première frame). Au mount, `session.js` consomme le handoff → `startTopicChat()` : `markSeen`, puis **`addReadySource()`** (le hook existant, déjà utilisé par un top post repurposé), puis la lecture d'Archie, puis un Quickpicker de trois questions + custom + Skip.
  **Pourquoi une source** : plutôt qu'inventer une surface d'action, le topic entre par le pipeline. Tout ce que l'app sait déjà faire (Extract ideas, Draft, Ask, le panneau Sources) s'allume tout seul — **zéro ligne dans `sources-stream.js`**. C'est aussi ce qui met le topic dans le thread comme **carte** : `intake-lifecycle` poste un turn source-intake pour toute source qui arrive après le mount, donc le pick est visible comme l'est une source choisie. Un `postSelectionEcho` par-dessus empilait deux fois la même accroche.
- **Dismiss** — masque, ne supprime pas, donc le toast peut vraiment offrir **Undo** (`restoreTopic`). Même toast depuis la carte et depuis la dialog (la dialog passe un `onDismiss` au lieu d'en posséder un second).

### Le compteur de la sidebar

Le badge de la ligne **Topics** compte les **unseen**, pas le total : la ligne est une notification. Il somme **tout le compte** — l'arrivée est un évènement account-level même si la config qui l'a produite est par Playbook. `subscribeTopics` re-render la sidebar, donc lire ou écarter un dossier bouge le badge sans changer de route.

### Une seule source de vérité pour l'âge

`ageDays` — pas d'horodatage réel : un proto n'a pas d'horloge fiable, et des dates mockées qui dérivent avec l'âge du fichier lisent moins bien qu'un « 3 days ago » stable. Le feed **groupe** dessus **et** chaque libellé en est **dérivé** via `topicWhen()`. Un `scannedOn` stocké a existé puis a sauté : `refreshTopics()` vieillit tout d'un jour, donc la chaîne écrite disait encore « yesterday » sur une carte que le feed avait déjà passée en semaine dernière.

---

## 18. Idea streams — flag `contentResearch`, défaut OFF

> **Vocabulaire.** L'UI dit **Idea stream** (une _lane_ en code) et **Idea** (un _brief_, encore appelé « topic » dans les commentaires et les classes `.topics-*`). Le mot **Idea** porte donc deux objets : celui d'un stream et celui du pipeline (Source → Idea → Draft). Nommer la surface quand l'un ou l'autre est possible. Voir [`GLOSSARY.md`](GLOSSARY.md) et [`../../CLAUDE.md`](../../CLAUDE.md).

Là où **Topics** (§17) est **un** flux across-Playbooks, les **Idea streams** sont **plusieurs opérations de veille nommées** qui tournent en parallèle, chacune avec ses sources. C'est pourquoi l'entrée est la liste des streams et pas leur sortie fusionnée.

### La liste (`/content-ideas`, [`screens/research.js`](../../src/screens/research.js))

- H1 **« Idea streams »**, sub `« N Idea streams · N Ideas waiting »` (le 2ᵉ chiffre = les Ideas non triées, sommées sur tous les streams — le nombre qui dit s'il faut agir).
- Recherche (`« Search Idea streams… »`, filtre sur le **nom du stream**) + facette Playbook + CTA **« Create an Idea stream »**.
- Une carte par stream : nom, Playbook, nombre de sources, cadence, signaux (`N trending`, `N NEW`), action **« Get ideas »**.
- Tuile de création en dernière cellule : titre + sub _« Pick a Playbook and idea sources. They will be turned into ideas you can draft from. »_ — même forme que `contexts-card--ghost__sub`.
- Empty state (aucun stream) distinct d'une recherche sans résultat : « Create » répond à la première question, pas à la seconde.

### Créer / régler (`/content-ideas/new`, `/content-ideas/:id/settings`, [`screens/research-form.js`](../../src/screens/research-form.js))

Un seul écran, deux modes. Création : H1 **« New Idea stream »**, lede _« Pick a Playbook and sources to get content ideas. »_ Réglages : H1 « Feed settings », lede _« What I watch for this Idea stream, and how often I check it. »_ Sections : **Idea stream scope** (nom + Playbook lié, les deux requis), **Idea sources** (les 8 de [`research-catalog.js`](../../src/research-catalog.js), une carte chacune ; une source `live: false` ouvre le modal « Need that source? » et laisse le switch tel quel), site scanné, **Refresh frequency** (Weekly / Monthly / Quarterly), notifications. Footer : Cancel + **« Save Idea stream »** / « Save changes ».

### Le feed d'un stream (`/content-ideas/:id`, [`screens/research-feed.js`](../../src/screens/research-feed.js))

- **Une seule liste**, groupée par âge, la plus récente en premier. La tranche la plus récente **n'a pas de libellé** (le lecteur y atterrit par défaut) ; les suivantes en portent un, parce qu'elles _sont_ un écart.
- **Filtres** dans un panneau, trois groupes : **Idea type** (Ideas for later / Draft-ready), **Idea status** (New / Saved / Used / Ignored), **Sources**. Défauts : les deux types, toutes les sources, et **New + Saved** seulement — Used et Ignored sont des réponses déjà données, le feed n'ouvre pas sur du travail fini. Le badge compte les **groupes rétrécis**, pas les cases cochées (`briefs-store.narrowedGroupCount`, mesuré contre `DEFAULT_STATUS_IDS`).
- **Le statut est une icône** à droite de l'âge (New / Saved / Used / Ignored), avec tooltip DS ; les mêmes glyphes servent de **légende** dans l'en-tête replié du groupe Idea status. Les icônes de source, elles, ne sont **pas** rendues dans le panneau : une carte nomme déjà sa source à côté de son glyphe, donc il n'y a pas de mapping à apprendre.
- **Chargement infini** : 10 Ideas, puis les 10 suivantes quand la sentinelle entre dans le viewport, après 2 s (lisible en démo, pas cassé).
- **Trois actions par Idea**, en boutons plats : **Use in chat** / **Save for later** / **Ignore Idea**.
- Les deux **signaux d'attention** (trending, updated) ne surchargent pas le filtre : une Idea flaguée apparaît sous son statut et disparaît si ce statut est décoché. `/content-ideas/:id/attention` est la page qui les sort du triage.

### Le panneau article ([`research-modals.js`](../../src/components/research-modals.js) `renderResearchArticle`)

Ouvert à côté de la liste, hauteur = tout l'écran disponible (mesuré relativement au viewport et recalculé au scroll). Le titre est **le même `topics-card__headline`** que la carte — une Idea, une phrase. Sections, dans l'ordre : le corps (avec 2 sous-titres), **Trend levels** (où vivent « Why now » et « What changed », retirés des cartes), **Idea history** + lien _« See past versions of this Idea »_, **Sources**. Footer flottant, pleine largeur, filet electric-blue, portant les trois mêmes actions.

- **Past versions** : modal, dropdown de la plus récente à la plus ancienne, version courante sélectionnée par défaut et traitée comme les autres (pas d'état grisé). Chaque version : 4 paragraphes, ≥ 200 mots. Bouton **« Use this version in chat »** identique au CTA de la carte. Utiliser une ancienne version fait passer l'Idea de **new** à **used**.
- **Sources** : les 3 posts qui fondent l'Idea + lien vers la liste complète en modal, avec « View on » (mêmes composants que le feed listening).

### Le carrousel de la page nouvelle session ([`screens/session.js`](../../src/screens/session.js))

Bloc propre **au-dessus** de la grille de workflows, sous son propre `empty-chat__starter-label` _« Ideas waiting for you »_, à la **largeur des trois starter cards** (1040px, 651px sous 900px — la même que la grille, donc un seul alignement).

- La file vient de `briefs-store.getStarterTopics()` : **4 Ideas** max, ordonnées trending → updated → les plus récentes non triées. Statuts Saved / Used / Ignored exclus (déjà répondus).
- **Slides = file + 1** : la dernière est la carte de clôture _« Get the full details into your Idea streams »_ / _« Every idea in full, with the posts behind it. I refresh them weekly. »_ + « Explore more ideas ». Elle a **son propre point**, donc chaque point correspond à une slide.
- **Nav sous la scène** : chevron gauche, `.ap-dot-stepper` (le composant DS des indicateurs de carrousel), chevron droit. Les points sont cliquables et sautent à la slide.
- **Anneau dans les deux sens** : aucun chevron n'est jamais désactivé. Suivant depuis la dernière slide → la première Idea ; Précédent depuis la première → la carte de clôture. Les deux gardent leur chevron sur toutes les slides.
- **Direction dérivée du pas**, pas de la comparaison d'index : sur un anneau l'index descend quand on avance (dernière → première) et monte quand on recule. Les points, eux, comparent (ils n'ont pas de direction).
- ⚠️ Le handler **retire les classes `is-entering*` avant** de poser une classe `is-leaving*`. Les règles d'entrée sont déclarées après celles de sortie à spécificité égale, donc une classe d'entrée restée sur la scène gagne la cascade et **la sortie ne joue pas** (vérifié : `« is-entering-back is-leaving »` résout `animation-name` en `starter-topic-in-back`).
- Avant la 1ʳᵉ Idea : carte d'attente (3 s, spinner DS). Aucune Idea du tout (`new-alt`) : **pas de bloc**, ni libellé ni carte de clôture.

### Critères d'acceptation

| #   | Critère                                                                                                                                                 | Vérifié le 2026-08-13                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `/content-ideas` affiche H1 « Idea streams » et le sub compte streams + Ideas en attente                                                                | ✅ 4 streams · 24 Ideas                                      |
| 2   | Tout retour vers la liste dit **« Back to Idea streams »** (y compris le fallback d'un stream supprimé) ; un retour scopé à un stream garde **son nom** | ✅ `/content-ideas/:id`, `/new`, `/…/attention`              |
| 3   | Le feed ouvre sur New + Saved ; le badge Filters est vide au repos                                                                                      | ✅ 9 cartes au défaut (11 avec les 4 statuts)                |
| 4   | Chaque statut a son icône à droite de l'âge, avec tooltip, et les mêmes glyphes en légende du groupe replié                                             | ✅                                                           |
| 5   | Le titre du panneau est identique à celui de la carte                                                                                                   | ✅ même `topics-card__headline`                              |
| 6   | Le carrousel fait la largeur des trois starter cards et s'aligne avec elles                                                                             | ✅ 462→1478 px, identique à `.starter-grid`                  |
| 7   | 5 points pour 4 Ideas + la carte de clôture ; un point = une slide                                                                                      | ✅                                                           |
| 8   | L'anneau tourne dans les deux sens, aucun chevron désactivé, chevrons inchangés sur toutes les slides                                                   | ✅ 0→prev→4→next→0→prev→4→prev→3                             |
| 9   | Une transition ne porte qu'**une** classe de direction                                                                                                  | ✅ mesuré à 90 ms : `["is-leaving"]` / `["is-leaving-back"]` |
| 10  | « Start drafting » ouvre un chat avec l'Idea attachée en Source                                                                                         | ✅ turn source-intake                                        |
| 11  | Flag OFF : aucune surface Idea streams, deep-link périmé → `/`                                                                                          | ✅                                                           |

---

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — le _comment_ technique
- [`ROUTES.md`](ROUTES.md) — route table + handoffs + URL state
- [`STORES.md`](STORES.md) — API par store
- [`UI-PATTERNS.md`](UI-PATTERNS.md) — usage concret du Design System
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire produit
