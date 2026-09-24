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

Listening source → Topic ──→ (chat) ──┘   (flag `topicFeed`, voir §17)
```

Le **Topic** est un embranchement amont **optionnel** : Archie n'attend plus qu'on lui donne une source, il en propose une. Une Idea peut toujours venir directement d'une Source.

Vocabulaire : un **Playbook** (label UI) = un **Context** (code/store). Voir [`GLOSSARY.md`](GLOSSARY.md).

---

## 1. Chat & assistant

Surface principale, sur `#/session/:id` ([`screens/session.js`](../../src/screens/session.js), le plus gros fichier). Un panneau assistant plein-largeur : thread scrollable en haut, composer docké en bas. L'état du thread est un store en mémoire par session ([`assistant.js`](../../src/assistant.js)), sans persistance.

### Thread & turns

| Feature                      | Comportement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero « New chat »**        | Avant le 1er turn : wordmark Archie animé, sous-titre _« Drop a source — I'll turn it into a batch of ready-to-schedule posts, all from one chat. »_, composer **inline dans le hero**, puis — sous flags — le rail _« What I'm hearing »_ (§17), et enfin _« Or jump into a workflow »_ + grille de **starter cards** (`mocks.chatStarters`). Cartes prompt-injection (préremplissent le composer) ou action (`open-video-clips`, `open-batch`, `open-top-posts`). Placeholders `{{source}}` / `{{video-source}}` résolus au render. |
| **Greeting**                 | Thread frais : une bulle Archie. Avec Playbook : _« Hi. Want me to compare ideas, pick the strongest one, or draft a post?… »_ ; sans : _« Hi. I'll help you pick sources, sharpen ideas, and draft posts… »_. Sauté pour les sessions `welcome-alt-*` / `clip-studio-*`, qui ouvrent leur propre intro.                                                                                                                                                                                                                              |
| **Échange user → AI**        | 3 turns : bulle « You », notice **« Thinking »** (mermaid, collapsible, _« Analyzing your request and sources… »_), puis bulle AI révélée après ~6 s. Réponse scriptée par intention (`mockAiReply`). Les prompts « batch » produisent en plus un batch de 5 drafts.                                                                                                                                                                                                                                                                  |
| **Notices collapsibles**     | `<details>` avec pill mermaid ou grise (`postSystemNotice` / `markSystemNoticeReady`, ex. « Extracting guidelines »). ⚠️ **Aucun appelant aujourd'hui** — le producteur et les deux branches de rendu existent, rien ne les déclenche.                                                                                                                                                                                                                                                                                                |
| **Source-intake turn**       | Chip compact « Source intake » (icône kind + nom + slot d'état). Loading → spinner « Uploading » ; ready → pills tappables _« N ideas › »_ / _« M clips › »_ (vidéo) ou check vert. Piloté par [`intake-lifecycle.js`](../../src/screens/session/intake-lifecycle.js).                                                                                                                                                                                                                                                                |
| **Idea-extraction turn**     | Pill _« Extracted N idea(s) »_ + cartes idée compactes (feedback pouce, « Why this idea », Mention, Draft).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Draft-result turn**        | `postDraftResult` : anchor **non rendu inline**. Un nouveau draft ouvre le panneau Drafts sur le batch + status bar verte _« N drafts ready »_ + toast.                                                                                                                                                                                                                                                                                                                                                                               |
| **Clip-extraction turn**     | Pill spinner → carte résultat « Open clips » quand l'extraction background finit.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Selection echo**           | Le choix de l'utilisateur reste visible sous forme de carte/chip (source, idée, clip, langue, profils, top-post). Voir mémoire _selection-echo-pattern_.                                                                                                                                                                                                                                                                                                                                                                              |
| **Connect-a-service prompt** | Coller un lien vers un connecteur non connecté (Slite/Notion/Google Docs) affiche une carte « Not connected » + boutons **Connect / Cancel**. Connect → statut vert _« <Name> connected — importing… »_.                                                                                                                                                                                                                                                                                                                              |
| **Chat-switch skeleton**     | ~340 ms de bulles shimmer en changeant de chat démarré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Watchdog loading**         | Un turn coincé en `loading` > 30 s déclenche un toast _« This is taking longer than expected… »_ ([`thinking-chip.js`](../../src/screens/session/thinking-chip.js)).                                                                                                                                                                                                                                                                                                                                                                  |
| **Requête connecteur (MCP)** | Avec un connecteur attaché : `sendConnectorMessage` simule un aller-retour MCP (notice _« Querying <Name> via MCP »_ + trace d'outils) puis une réponse citée.                                                                                                                                                                                                                                                                                                                                                                        |

Les **starter cards** viennent d'un renderer partagé ([`components/starter-card.js`](../../src/components/starter-card.js)) que le héro du chat et la home du compte (§12) appellent tous deux — donc leur mise en page se règle en un seul endroit. Le sous-titre a une **mesure plafond** (46ch) et non une bride : il était capé à 22ch, un quart de la largeur de la carte, si bien qu'une phrase de 70 caractères se cassait en quatre lignes et laissait la moitié droite vide. Le watermark qu'elle évitait est un lavis à 10 % que le texte recouvre de toute façon. Le plancher de la carte (**120px**, après 158 puis 140) est ce que la rangée mesure quand tous les sous-titres sont courts — la grille étire les trois à la plus haute de toute façon. 140 était encore au-dessus de ce que le contenu demande depuis que le sous-titre prend la largeur (16 + 24 titre + 8 + 32 deux lignes + 8 + 4 + 18 CTA + 16 = 126px), donc le plancher rembourrait la carte la plus haute au lieu de ne rattraper que la plus courte.

Rendu des turns : [`screens/session/thread-turns.js`](../../src/screens/session/thread-turns.js).

### Composer

- **Champ** : textarea auto-size 2 lignes, placeholder _« Ask a follow-up, or refine a draft… »_. Toolbar : **Add** · **Reference (@)** · **Playbook** · **Send** (orange). Hint _« Enter to send · Shift+Enter for new line · Drop a file to attach a source »_.
- **Envoi** : Send, **Enter**, ou **Cmd/Ctrl+Enter** ; **Shift+Enter** = newline.
- **Menu Add** : _Add PDF · Add video · Add URL · Paste text_ — puis _Top performing posts_ — puis (flag `connectors`) flyout **Connected sources** + « Browse connectors ».
- **Contrôle Playbook** : sur chat neuf = dropdown sélectionnable (+ « Create a playbook ») ; sur chat actif = indicateur statique. Sous `playbookWorkspace` il **n'est plus rendu du tout** : la question a été posée dans la rail avant que le chat existe, et la rail nomme la marque une rangée de chrome plus haut (§14). La toolbar passe de [Add][Reference][Playbook][Send] à [Add][Reference] … [Send] — Send est en `margin-left: auto`.
- **@ Reference (mentions)** : picker flottant listant sources prêtes + idées ; pick → pill (couleur par kind). Nav clavier ↑/↓/Enter/Esc. Chips gérés par [`composer-mentions.js`](../../src/composer-mentions.js).
- **« / » commande (connecteurs)** : liste les connecteurs connectés en action-dropdown ; pick → attache au composer.
- **Chip connecteur** : demander un connecteur attache un chip removable + swap placeholder _« Ask {name} anything… »_. ([`composer-connector.js`](../../src/composer-connector.js))
- **Status bar** : un slot réconcilié au-dessus du composer. Gris in-progress (loader + label) prioritaire sur vert « ready » (_« N drafts ready to review »_ + **Review**, _« N ideas ready »_ + **View ideas**). Animations enter/exit, reduced-motion aware.
- **Drag & drop** : déposer un fichier sur le panneau lance l'upload ; fichier non classable → modal Add-source.

### Flows conversationnels

Chaque flow échoe les choix, gère Back/Skip, et pousse des turns via l'assistant. Orchestrateurs dédiés :

| Flow                                   | Fichier                                                   | Résumé                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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
- **Toasts** : vidéo _« <name> ready »_ ; non-vidéo _« <name> ready · N ideas extracted »_. (Les deux se déclenchent toujours depuis que `statusActionSnackbars` est baké ON.)
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
- **Media** : clip (faux player, gradient, play, durée, scrubber 24%, badge sous-titres) / image
  (_Edit_ → studio · _Change_ → file picker · _Remove_) / **fente vide** (`.posts__card-media-empty`) :
  une **vraie dropzone média** — pointillé, **sans fond**, 254px, centrée, **toute la zone est
  cliquable** (hover bleu, clic → file picker) : pastille grise à glyphe upload, titre `h3`
  « Upload an image », sous-titre `body` « Drop it here or browse. », puis **un**
  `.ap-button.mermaid` **Generate an image** (génère **en place**, sans studio) et, **sur une ligne
  à lui**, « Or **open the Image Studio** to set the type, style and format. »
  Quatre entrées : cliquer la zone, y glisser un fichier, générer, ou le rail (clavier).
  Voir [`UI-PATTERNS.md`](UI-PATTERNS.md) § Fente média vide — notamment **pourquoi il ne doit
  jamais y avoir un second bouton à côté du mermaid** (deux contours = une paire d'égaux).
- **Hint de brand kit** : si le Playbook du chat n'a ni logo, ni couleurs, ni images de référence
  (`getBrandKitGaps` dans [`contexts-store.js`](../../src/contexts-store.js) — dérivé, jamais stocké),
  une ligne `.muted` sous la fente **nomme ce qui manque** et propose `Open the Playbook` (`.ap-link`,
  navigation → bleu, pas orange). Affichée **une seule fois par feed**, sur le premier draft sans
  média : ce qui manque est un fait du Playbook, pas de ce draft-là.
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

Store [`schedule-store.js`](../../src/schedule-store.js) : file upcoming, `getQueue` (tri asc), `getQueueOn(day)`, `busyCountsByDay` (dots calendrier), `addToQueue`.

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

### Image Studio ([`components/image-studio-v2/`](../../src/components/image-studio-v2/))

Modale near-fullscreen, deux modes pairs (**Generate** / **Edit**, tabs DS). Un header d'une ligne
(titre · les deux modes) et un footer qui porte l'unique action de sortie. Entre les deux, **le stage
prend une forme par mode** :

- **Generate** = **deux moitiés** pour toute la boucle — les sept lignes d'options à gauche, l'image
  (ou son placeholder) à droite — et **Generate est le submit du formulaire**, dans le footer. Pas de
  composer en bas, pas de panneau épinglé, pas de chutier : le stage porte tout. Détail en §7bis.
- **Edit** = un **canvas centré** avec la palette d'outils épinglée au bord gauche et un composer
  « décris un changement » en dessous, parce qu'ici l'image **est** la surface qu'on travaille.

**Entrées** (les seules — pas de route, pas de raccourci) :

- **Le bouton `Image Studio` de la fente vide** (`.ap-link`) → l'entrée que l'on trouve, parce
  qu'elle est là où l'on regarde. Le rail avait shippé en premier, en icône seule, et avait été
  manqué : une icône sans libellé, sixième d'une pile verticale, n'est pas trouvable.
- **Le bouton du rail de la carte** (`data-post-studio`, entre _Regenerate_ et _Upload_) → ouvre le
  studio dans le mode qu'appelle le média du draft : carousel → le set, une image → Edit, **pas de
  média → le flow Generate**. C'est l'entrée principale, et la seule qui marche dans les trois
  états : le rail est le seul endroit toujours visible et indépendant du média. Le rail porte
  aussi **Upload** (`data-post-image-upload`) : seule route clavier vers un fichier, et seul endroit
  où l'upload fonctionne encore quand le draft **a** une image.
- _« Edit »_ / _« Edit slides »_ sur le média lui-même (`data-post-image-edit`) → même fonction
  (`onPostStudio`), en contextuel. Révélé au survol de l'image.
- ⚠️ _« Generate »_ dans la fente vide (`data-post-image`) **n'ouvre pas le studio** : il génère une
  image en place via `quickGenerateUrl` ([`image-studio.js`](../../src/image-studio.js)) — même mock
  Picsum seedé, ratio par défaut du réseau, aucun état de studio créé, un nonce de module pour
  qu'un second appui donne une autre image. Le studio est là pour _piloter_ une génération ; payer
  un modal plein écran pour appuyer sur un bouton était le chemin long.

⚠️ Historique à ne pas refaire : pendant un temps `data-post-image` était la seule entrée du flow
Generate, puis la génération en place l'a prise **sans rien mettre à la place** — un draft sans
image n'atteignait plus le studio du tout. D'où le bouton du rail. N'ajoute pas une troisième
affordance dans la fente : c'est ce qui avait aplati sa hiérarchie.

Tout passe par `onPostStudio` dans [`right-panel.js`](../../src/components/right-panel.js).
`data-post-image-upload` court-circuite le studio (simple file picker).

### Moteur d'état ([`image-studio.js`](../../src/image-studio.js))

UI-agnostique, `Map(key → state)` + subscribers, **tous les mocks dedans**. Les vues n'ont aucun état
propre : chaque mutation notifie et le corps de la modale est **entièrement re-rendu**. Latences
mockées : génération `~4,2 s`, édition IA `~2,6 s`, dérivation du brief `~2 s`.

Les helpers canvas purs (bake / crop / métriques de texte) vivent à part dans
[`image-studio-canvas.js`](../../src/image-studio-canvas.js) — c'est le seul import que le moteur
prend côté rendu, et il est délibéré : « Text in image » est mocké en cuisant les mots dans les pixels
avec **le même aplatisseur** (`compositeOverlays`) que les overlays du mode Edit.

### Generate — le brief

À l'ouverture, Archie **dérive le prompt du texte du draft** (`runDerive`, ~2 s) : le champ arrive
rempli d'un brief structuré (`Subject:` / `Look:` / `Palette:` / `Visual direction:`). Le composer est
une **carte centrée**, pas une barre pleine largeur : à 1440px un champ full-bleed fait ~180
caractères par ligne, et ça faisait lire les réglages comme du mobilier échoué en bas d'une grande
barre. Le champ plafonne à **4 lignes** puis scrolle (un brief dérivé en fait sept, et le laisser haut
de sept faisait du composer le plus gros objet de la modale alors que c'est l'image qu'on juge) ; le
plafond vaut exactement `4 × line-height`, parce que le scrollport d'un textarea couvre son contenu ET
son padding et qu'il n'y a pas de padding en haut. Le toggle d'expansion double le plafond.

**Generate est `secondary blue`** : c'est une étape, pas la destination. L'unique primary de la modale
est _« Use this image »_ dans le footer, présent **dès la première frame** (désactivé jusqu'à ce qu'il
y ait quelque chose à valider) — la destination est visible tout du long au lieu d'apparaître quand
les résultats tombent.

Stage : `empty → generating (~4,2 s) → résultats` (la colonne de preview, §7bis), avec une bascule
**Image / In feed** (aperçu réel via `renderPostCard`).

### Le prompt édité à la main est protégé

**Type** et **References** ne retouchent pas une ligne du brief, ils le **re-dérivent
entièrement** (`~600 ms`, un loader court — un chip doit répondre tout de suite, pas au bout des
2 s de l'ouverture). C'est légitime tant que le brief appartient à Archie. Dès que l'utilisateur a
tapé dans le champ, le même clic jetterait ses mots — alors il demande d'abord.

- **Le sale se mesure par rapport au dernier texte que le studio a écrit** (`derivedPrompt`), pas à
  « une frappe a eu lieu » : taper un mot puis le supprimer laisse propre. Vider le champ compte
  comme une édition.
- **Prompt intact → aucun avertissement**, le brief est simplement réécrit. C'est ce qui répare la
  divergence : avant, l'en-tête affichait « Infographic » pendant que le brief décrivait encore un
  visual hook.
- **Prompt édité → une confirmation** (`prompt-guard.js`), qui **nomme le réglage touché**
  (_« Changing the image type rewrites it from your settings »_). Deux issues : **Rewrite prompt**
  applique le réglage et réécrit, **Cancel** n'applique **rien** — le chip revient où il était. Une
  case _« Don't ask again while this studio is open »_ coupe l'avertissement pour la durée de
  l'ouverture (`exit(KEY)` la remet à zéro : silencier une action destructive ne survit pas à la
  session).
- **Un filet, même quand l'avertissement est coupé** : toute réécriture qui a remplacé du texte
  écrit à la main propose un **Undo** dans un toast, qui restaure le brief précédent.
- **Un upload n'est jamais jeté par une confirmation.** Le drop entre dans le vivier
  inconditionnellement ; seule la **sélection** est gardée. Annuler laisse donc l'image disponible,
  non choisie.
- Les six chemins gardés : le Type, le switch _« Use a reference image »_, la tuile, l'ajout, le
  retrait de l'image **en jeu**, et le mode `REF_MODES`. Retirer une image non sélectionnée ne
  réécrit rien, donc ne demande rien.
- **Les couleurs de marque restent hors périmètre** : elles éditent leur seule ligne `Palette:` en
  place plutôt que de re-dériver, et **se retirent du jeu quand le prompt est édité**
  (`syncPaletteLine`) au lieu d'écraser une ligne que l'utilisateur a peut-être écrite. Le switch
  gouverne toujours la dérivation suivante.
- Style, Format et Text in image, eux, **ne réécrivent toujours pas** le brief après l'ouverture :
  leur ligne reste celle de la dérivation initiale. Divergence connue et assumée.

> ⚠️ La confirmation n'est **pas** `confirm-modal.js`. Celui-ci s'enregistre auprès de
> `modal-coordinator`, et `requestOpen` ferme l'overlay actif — ici le studio, dont le `close()`
> exécute `exit(KEY)` et supprime toute la session. Un « tu vas perdre ton prompt ? » qui perd le
> studio entier est pire que le problème qu'il signale. Elle est donc rendue **dans** le corps du
> studio, depuis l'état, hors coordinateur — et par conséquent : ses touches sont écoutées sur
> **`document` en capture** (Échap avec le focus hors de la modale ne passerait jamais par
> l'élément), et `bindOverlayDismissal` reçoit un `isOpen` qui **se désarme** tant qu'une question
> est en attente, pour qu'Échap ou un clic sur le scrim ne puissent pas fermer le studio par-dessous.

### Generate — les sept réglages

Chaque réglage est une section `.ap-accordion` — **la classe DS, pas le comportement**. Les sections
sont **indépendantes** : une section ouverte le reste, et en ouvrir une seconde ne referme pas la
première. Un-à-la-fois gardait le panneau court mais interdisait de voir deux réglages ensemble et
refermait dans le dos de l'utilisateur. L'état est `collapsedGroups`, un Set de ce qui est **fermé** —
ce qui rend à `openPopover` son seul sens : les flyouts du mode Edit, eux réellement exclusifs.

**Une section qui ARRIVE avec une valeur arrive ouverte.** C'est la règle que suivait déjà le seed du
headline ; elle vaut maintenant aussi à l'ouverture, pour les lignes que le **Playbook** décide (Type,
Style — voir le _Default look_ en §9). Deux `delete` sur le Set construit dans `start()`, gardés sur les
valeurs **validées contre les catalogues**, donc une clé fautive dans un seed ou une analyse ne peut
jamais ouvrir une section vide. Une seule règle, parce que c'est un
`delete` et non un quatrième littéral. Le `refMode` n'a besoin de rien : `refs` est épinglée ouverte
partout et n'entre jamais dans ce Set, donc un mode venu de la fiche est à l'écran
gratuitement (`refSummary` l'imprime, « Acme · Layout »).

⚠️ Cas de conflit assumé : quand la fiche porte **et** un style **et** une image de référence, la
ligne Style reste **fermée et `disabled`** en affichant `From references` — `settingRow` calcule
`expanded = pinned || (open && !disabled)`, donc rien n'est caché — et elle s'ouvre sur la valeur du
Playbook dès que le switch References tombe. Une fiche qui porte les deux ne se contredit pas : les
références sont des **exemples**, le style est le repli quand on travaille sans.

L'ordre dit un raisonnement : **ce que l'image EST et DIT**, puis ce qui va dedans, puis son
**traitement** — `Type & text` · References · Branding · Style · Format · Output.

⚠️ **Type est monté en tête, et « Text in image » a fusionné avec lui dans une seule carte.** Le Type
est la réponse contre laquelle tout le reste se lit (le brief y prend sa direction visuelle), et c'est
lui qui décide de la **forme des mots** posés sur l'image : une accroche, un chiffre, ou un concept en
deux mots. Une ligne dont les autres dépendent se place **au-dessus** d'elles — en dessous, la
dépendance se lit à l'envers — et deux réglages qui ne se comprennent que l'un par l'autre tiennent
dans une carte plutôt que dans une règle qu'il faut énoncer. Le pane compte donc **six lignes**, pas
sept, et la valeur d'en-tête de la carte reste le **Type seul** : c'est le choix des deux qu'une ligne
repliée sait dire en un mot. La carte est **épinglée ouverte** (`pinned`, comme References) — en-tête
statique, pas de chevron, jamais dans `collapsedGroups` : c'est la question que la carte existe pour
poser, plus un champ où l'on écrit, et repliée elle cachait une zone de texte et son bouton Suggest
derrière un en-tête. Une section qu'on rouvre à chaque visite ne devrait pas être une section qu'on
doit ouvrir.

- **References** ([`references-view.js`](../../src/components/image-studio-v2/references-view.js)) —
  épinglée ouverte, en-tête sans chevron (une section qu'on rouvre à chaque visite ne devrait pas
  être une section à ouvrir ; son en-tête cesse alors d'être un contrôle). **Une seule image de
  référence**, prise indifféremment dans le brand book du Playbook ou dans les uploads : le marqueur
  de tuile est donc un **radio**, pas une coche — une coche promet qu'on peut cumuler. `aria-pressed`
  et non `role="radio"`, parce que le contrat est single-select-avec-toggle-off et qu'un groupe radio
  ne sait pas revenir à vide.
  Côté état, `playbookRefs` et `uploadedRefs` sont deux **viviers**, `selectedRefId` est le choix, et
  `referenceImages` reste un tableau de 0 ou 1 **dérivé** par `syncSelectedRef()` — parce que le
  prompt, la seed de génération et le verrou du Style preset lisent tous « les références en jeu »
  sans se soucier du nombre. `MAX_REFS` (6) borne le vivier d'**uploads**.
  Un switch _« Use a reference image »_ possède l'état « aucune » : générer sans référence est un vrai
  choix, et il n'était atteignable qu'en re-cliquant la tuile choisie. **Off masque la grille** (le
  switch EST la disclosure) et **mémorise le choix** (`lastRefId`).
  Chaque vivier est **libellé par sa provenance** (`Brand book — Acme` / `Custom`), même quand il n'y
  en a qu'un : c'est la seule chose qui dise que ces images viennent du brand book, et nommer le book
  nomme le standard auquel l'image générée est tenue. Tiret cadratin, pas point médian — un nom de
  Playbook en contient déjà.
  **« How to use it »**, en bas et seulement quand une image est choisie (une sous-option qui survit à
  son sujet est un contrôle qui ment). Trois modes (`REF_MODES`, `blend` par défaut) : **Layout**
  (reproduire composition et cadrage), **Blend** (le look, plus un écho léger d'un élément),
  **Style only** (palette, texture, traitement — aucune composition). « Match this image » faisait
  beaucoup de travail non dit : reproduire une composition et emprunter une palette sont deux métiers.
  La bande de vignettes est un **scroller horizontal**, pas une grille qui wrappe : un vivier qui
  wrappe grandit d'une rangée à la fois et pousse le composer hors de l'écran à dix images. Exactement
  `VISIBLE_REFS` (3) tuiles rentrent, donc aucune quatrième ne dépasse pour signaler qu'il y en a
  d'autres, et macOS cache sa scrollbar overlay ; au-delà de 3 le groupe reçoit `.is-scrollable`, qui
  allume un **fondu de bord piloté par la position de scroll**. Le fondu anime deux **propriétés
  personnalisées enregistrées** (`@property --isv2-fade-l/r`, typées `<length>`) et non `mask-image`
  directement : un gradient non enregistré s'interpole de façon discrète dans Chrome, donc le masque
  basculait de côté en une frame à mi-course.
  Valeur d'en-tête : la **provenance**, plus le mode s'il n'est pas le défaut (`Acme · Layout`) — un
  résumé doit rapporter un choix que l'utilisateur a fait.
- **Text in image** — les mots qu'Archie écrit **DANS** l'image (à ne pas confondre avec le bloc de
  texte déplaçable d'Edit ; un ⓘ dans l'en-tête porte cette distinction). Mocké en cuisant le texte
  dans les pixels de la variation, donc il survit aux vignettes, à l'aperçu in-feed, au recadrage, au
  « Redraw » et au draft final. **Pas de compteur permanent** : le champ ne dit rien tant que le texte
  tient, et lève un `.ap-form-message error` du DS quand il dépasse (_« 14 characters over — long text
  comes out small in the image. »_). C'est une limite de **lisibilité**, pas de données : ~90
  caractères est ce qui reste lisible dans une image générée, et au-delà la typo sort juste plus
  petite — le champ prend donc ce qu'on écrit, le dit, et ce qu'on a écrit est cuit. La copie vit dans
  `renderTextOverMessage` (moteur) et non dans une vue, parce que le premier rendu et chaque frappe la
  demandent depuis deux modules et ne doivent pas la formuler autrement.
  **Le label est le `<label>` du champ DS** (`.ap-textarea-field > label`), pas la légende maison
  `.isv2-sheet-label` : ça nomme un input, et le DS livre déjà ça — bonne taille, bonne graisse, et un
  `for` qui rend les mots cliquables et lus avec le champ. Le ⓘ voyage dans un `<span>` pour rester sur
  la ligne du label (le label DS est une colonne : sa seconde rangée appartient à `<small>`).
  **Un bouton `Suggest`** (ghost blue + `ap-icon-sparkles-mermaid`) écrit les mots depuis le draft,
  **dans la forme que demande le Type choisi** — accroche pour Visual hook, chiffre + ce qu'il compte
  pour Infographic, concept de deux ou trois mots pour Illustration (`suggestionsFor` dans
  [`image-studio.js`](../../src/image-studio.js)). Une **liste**, pas une réponse : le bouton passe à
  `Try another` tant que le champ contient ce qu'on vient de lui donner, et repasse à `Suggest` à la
  première frappe (patché en place par `onInput`, puisque taper ne re-rend pas la carte).
  **Écrire prend un beat de 2 s, porté par le bouton** (`renderTextLoading` → l'état `loading` du DS,
  sa barre à la couleur du bouton, le libellé `Writing…`, et le champ `disabled` — ce qu'il contient
  va être remplacé, donc taper dedans pendant ces deux secondes serait écrasé sans le dire). La phrase
  sous le champ passe à `Reading your draft…`. `suggestionsFor` est pure : le beat est **mis en
  scène**, comme les 4,2 s du generate et le loader du brief à l'ouverture, et pour la même raison —
  demander des mots à Archie est une demande faite à Archie, et une réponse qui arrive avant que le
  doigt ait quitté le bouton ne se lit pas comme une réponse. Le brief, lui, suit **sans beat**
  (`settingChangedNow`) : l'attente a déjà eu lieu, et un second re-rendu 600 ms plus tard
  reconstruirait le textarea sous quiconque édite la suggestion qui vient d'arriver. Deux choses
  disent la dépendance au Type sans l'expliquer : le **placeholder est un exemple DU type** (il devient
  `68% / never hear back` sur Infographic) et la phrase sous le champ nomme le type en jeu. Le seed
  automatique de `deriveNow` prend la **première candidate de la même liste**, donc la graine et le
  bouton ne peuvent pas être en désaccord sur ce qu'est une bonne accroche.
  ⚠️ **La règle du clic unique** (`onPointerDown`, events.js) : tant que ce champ a le focus, un appui
  ailleurs dans le pane **annule le `pointerdown` par défaut**. Sans ça le blur commit le texte, le
  commit re-dérive le brief, et le re-rendu retire de la page le contrôle qu'on est en train d'appuyer
  — le clic tombe dans le vide et il faut appuyer deux fois (taper une accroche puis cliquer
  `Suggest`, ou la carte Infographic juste au-dessus). Rien n'est perdu : chaque frappe est déjà dans
  le state (`setRenderTextSilent`). Même famille de bug côté `change` : un champ retiré par un
  re-rendu tire un dernier `change` avec sa **valeur d'avant**, que `onChange` ignore désormais
  (`event.target.isConnected`) — sinon il annulait le rendu qui venait d'avoir lieu.
- **Branding** ([`branding-view.js`](../../src/components/image-studio-v2/branding-view.js)) — **deux
  interrupteurs, pas un** : _« Show my logo on the image »_ et _« Use brand colors »_. Le logo et la
  palette sont deux impositions différentes : beaucoup de posts veulent les couleurs de la marque sans
  son wordmark dans un coin, et un visuel de lancement peut vouloir la marque sur l'artwork de
  quelqu'un d'autre — un seul interrupteur prenait la moitié bon marché en otage de la moitié chère.
  Les deux sont **ON par défaut** quand le Playbook a de quoi ; un interrupteur sans matière reste
  **visible mais désactivé** avec la raison dessous (_« This Playbook has no logo yet. »_), parce
  qu'un contrôle qui disparaît laisse se demander si l'option existe.
  **Pas de réglage de placement, juste un aperçu du logo** : la marque atterrit en bas à droite, point
  (`BRAND_MARK` : `xF 0.78 / yF 0.89 / wF 0.26`). C'était choisissable — neuf ancres d'une grille
  3×3 — et le choix ne servait pas : signer un visuel en bas à droite est le défaut pour la même
  raison que sur papier. La seule décision qui reste est **si** la marque apparaît, donc tout ce que la
  section doit est « voici le logo que j'utiliserais » — et le voir est ce qui permet d'attraper un
  logo faux ou périmé avant de générer. Le logo est cuit par le même `compositeOverlays` (overlay
  `kind: "logo"`, 26% de la largeur).
  Le logo vient de la **section Brand du Playbook** (`ctx.brandLogo`, §11) : ce switch ne l'invente pas
  et ne permet pas de le changer — un Playbook sans logo se répare dans le Playbook, pas ici. Le switch
  tamponne **le défaut**, et rien d'autre.
  Le **mode Edit** propose en revanche **tout le set** (`st.playbookLogos`) en tête du flyout « Add an
  image » (groupe _« From your Playbook »_, avant Upload et avant les presets), chaque marque posée
  comme calque déplaçable. Dans les deux modes et pas seulement au défaut, parce que la raison d'aller
  la chercher à la main est justement qu'une autre convient mieux : le lockup inversé sur une photo
  sombre, l'icône là où un wordmark ne se lit pas à cette taille. Le switch est la signature
  automatique, les tuiles sont la pose à la main. Les tuiles portent un **index**
  (`data-img-logo-playbook="<i>"`) plutôt que `data-img-logo-preset="<url>"`, sans quoi un logo
  uploadé — donc une data URL — collerait des centaines de Ko de base64 dans le DOM à chaque render.
  Les couleurs sont les **mêmes pastilles rondes que la ligne « Brand color » du Playbook**
  (`.recap__fact-dot`) et les mêmes mots — un récap doit ressembler à ce qu'il récapitule. Nom + hex en
  tooltip ; l'hex imprimé sous chaque pastille transformait une rangée de cinq en deux lignes de petit
  texte. `playbookColors` porte `{ name, hex }` et non des hex nus.
  Côté moteur, `useBrandColors` conditionne la ligne `Palette:` du brief. Comme le brief n'est écrit
  qu'à l'ouverture et que Generate envoie **le champ** et pas les réglages, l'interrupteur **édite
  cette ligne en place** (`syncPaletteLine`) : re-dériver jetterait ce que l'utilisateur a tapé, ne
  rien faire rendrait l'interrupteur inerte pour la génération qu'il s'apprête à lancer. Même
  mécanisme généralisé pour la ligne `Look:` (`lookLine` → `syncSelectedRef` → `syncLookLine` →
  `spliceBriefLine`) : couper le switch References **retire** la ligne, là où elle restait avant à
  décrire une référence hors jeu.
  Valeur d'en-tête : la moitié active (`Acme` / `Logo only` / `Colors only` / `Off` / `No brand kit`),
  parce qu'« On » cacherait la différence entre un logo tamponné et un brief de couleurs.
- **Type** — à quoi sert l'image (`IMAGE_TYPES` : Visual hook / Infographic / Illustration). Dimension
  distincte du style, et **c'est ce que l'art dit** : un Type est **une image** — un petit dessin de ce
  que ce type produit —, un Style est une **pastille de couleur**. Sans ce partage, neuf cartes dans
  deux sections voisines se lisent comme un seul choix à neuf branches. Les trois dessins vivent dans
  `type-art.js` (un SVG inline par clé), leurs couleurs dans la CSS (`.ta-*` / `.ta-stop-*`, tokens
  DS uniquement). Ce qui les sépare est le **traitement**, pas le sujet : Visual hook est
  photographique (profondeur de champ, sujet à contre-jour cropé par le cadre, accroche écrite
  par-dessus), Infographic est une affiche de données (kicker, titre, chiffre en callout, barres avec
  le gagnant en accent, courbe, légende), Illustration est du vecteur plat (aplats, filets d'encre sur
  les crêtes, aucun dégradé). Et **un seul disque chaud dans la rangée**, le soleil de l'Illustration :
  une sphère dans le hook et un donut dans le graphe faisaient lire trois cartes comme trois couchers
  de soleil. La couleur d'appoint est **l'orange de marque** (`--ref-color-orange-*`, celui du mark Archie) sur
  le navy grey-150 — des images Agorapulse. Pas le bleu électrique : l'anneau bleu veut dire
  « choisi », une forme bleue dans une carte **non sélectionnée** se battrait avec lui. ⚠️ Une
  première passe avait pris l'ambre `tag-orange` pour tenir la couleur d'**action** IA hors des
  cadres ; tranché dans l'autre sens — ce sont des images, pas des contrôles.
- **Style** — 6 presets en vignettes **dessinées** (`style-art.js`, un SVG inline par clé, couleurs en
  CSS, tokens DS). Un Style est un **traitement**, donc les six partagent un seul squelette — un objet
  héros, deux lignes de texte — et ne diffèrent que par la manière : c'est ce qui les fait lire comme
  une question à six réponses et non six images sans rapport. Tech Minimal = filets et air ; Corporate
  = bandeau navy, titre et son filet orange, tuile photo ; 3D Render = sphère violette glossy et ombre de
  contact ; Bold Editorial = diagonale orange / navy, blocs de titre lourds ; Photoreal = ciel dégradé,
  crêtes brumeuses, grain ; Hand-drawn = encre sur papier, chaque trait passé dans un
  `feDisplacementMap`. **Désactivé dès qu'une référence est en jeu**, et il dit alors pourquoi
  (`From references`) : deux sources de look qui se contredisent, c'est une de trop.

Les neuf vignettes **étaient dessinées en CSS** — le patron `.sub-preview--*` de `clip-subtitles.js`,
un markup, neuf modificateurs — et ne le sont plus (`git log -S "isv2-art--visual-hook"` pour les
Types, `-S "isv2-art--tech-minimal"` pour les Styles) : trois spans plus `::before`/`::after`, c'est
cinq formes, et à cinq formes une carte ne peut que nommer une géométrie — « Illustration » était un
cercle, un carré et un triangle, « Corporate » deux bandes. L'argument du scaling qui avait choisi le
CSS ne tenait pas : un `viewBox` est sans résolution par construction, et ces dessins n'ont aucun
filet qui demanderait `vector-effect`. Les Types sont passés d'abord ; à côté d'eux, les pastilles
Style avaient l'air des placeholders qu'elles étaient, et elles ont suivi. Leurs couleurs étaient des
hex d'échantillon hors tokens ; tout est token maintenant, l'exemption `validate_css` que ce bloc
portait est partie avec lui. Le marqueur radio suit : anneau **blanc** sur un dessin sombre
(`.isv2-option-art--dark`, via `:has()` — le hook, Corporate, Bold Editorial), grey-60 sur les clairs
— la coupure que les tuiles de référence faisaient déjà entre une photo et un art clair. Il ne reste
de `.isv2-art` que le cadre gris de repli pour une clé de catalogue sans dessin.

Ce ne sont **pas** des emplacements d'icône — ce sont des cadres d'aperçu 4:3 qui montrent à quoi
ressemblera l'image, le travail que font déjà les maquettes de sous-titres et le faux still vidéo de
`session.js`. Le DS ne livre ni aperçu de type ni pastille de style, donc rien n'est réinventé ; et le
repli « une icône DS pour les trois Types » n'existe pas : **aucune icône DS ne veut dire
« illustration »** (`ap-icon-pen` est le verbe éditer partout dans l'app, `ap-icon-mask` est un masque
de théâtre, et brush / palette / draw / pencil sont absents).

Elles ont remplacé des **photos picsum aléatoires** qui n'avaient aucun rapport avec le preset
qu'elles prétendaient montrer, et qui étaient bloquées par CORS en preview.

Le marqueur de sélection est un **dot radio pour les deux**, plus une coche : `references-view.js`
pose la règle — mono-sélection **avec dé-sélection** prend `aria-pressed` + un dot, parce qu'« une
coche promet qu'on peut en prendre plusieurs ». Type et Style sont exactement ce contrat, donc
l'ancienne coche de Style était l'exception et Type n'avait rien. Toujours rendu, vide quand non
choisi (comme les tuiles de référence) : un anneau vide dit qu'il y a un choix à faire, et la carte
garde les mêmes parties sélectionnée ou non, donc rien ne saute. Géométrie partagée avec
`.isv2-ref-radio` en une seule déclaration ; seule la couleur de l'anneau change (blanc sur photo,
grey-60 sur l'art clair). `IMAGE_TYPES.desc` reste dans le tooltip et pas sur la carte : l'art fait ce
travail, et à 79px une seconde ligne de caption double presque la hauteur de la rangée pour redire
l'image.

- **Format** — les ratios recommandés du network du draft, avec un glyphe dessiné à ses propres
  proportions. La valeur dit la forme (`1:1 · Square`) ; le hint suit la convention app-wide
  « **Best for** » + icône réseau.
- **Output** — Single / Carousel, fusionné avec son compteur (variations, ou slides plafonnées par
  réseau : LinkedIn 20, Instagram 10). L'option Carousel n'apparaît que sur un réseau qui en accepte.

Hiérarchie dans le corps d'une section : **une seule binaire**. Sombre = ça nomme la chose en dessous
(`.isv2-sheet-label`, `.isv2-sheet-switch-label`), clair = c'est un aparté (`.isv2-sheet-hint`). Pas
de seconde taille ni de gras — trois libellés gras empilés dans une colonne de 260px crieraient
par-dessus le titre de la section. Trois pas d'espacement, un par tier de regroupement : 4px libellé →
ce qu'il titre (`.isv2-block`), 8px entre blocs d'un même temps (`.isv2-group`), 12px entre temps.

**Une seule largeur de panneau, 284px, à toutes les tailles** (`--isv2-panel-w`). C'était deux nombres
codés en dur par breakpoint qu'il fallait changer ensemble sous peine de voir l'image glisser sous le
panneau. 284 est le nombre dont `--isv2-tile: 80px` est dérivé (trois vignettes plus deux gaps de 8px
demandent 256 des 260 intérieurs), et la branche étroite à 236 le cassait en silence : la troisième
vignette était coupée en plein milieu, ce qui se lit comme un défaut de rendu et non comme « fais
défiler ». Sous 1100px, seul l'inset se resserre.

> ⚠️ Les tooltips d'en-tête sont le **vrai `.ap-tooltip`**, monté sur `<body>` par
> [`tooltip.js`](../../src/components/tooltip.js) : la classe DS est en `position: absolute`, donc
> rendue sur place elle serait coupée par le conteneur de scroll le plus proche — et le panneau est
> justement une boîte `overflow-y: auto`. `position: fixed` ne sauve pas non plus, le panneau étant
> `transform`é (ce qui en fait le bloc conteneur des descendants fixes).

### Edit

Le même composer devient la **barre IA** (_« Describe a change… »_ → **Redraw**, ~2,6 s) et le panneau
de réglages cède le bord gauche à la **palette d'outils** : Crop · Add text · Add image (upload ou 16
presets). Ne restent **sur le canvas** que ce qui doit suivre un pixel précis :

- Les **overlays** texte/logo — déplaçables, redimensionnables, rotatifs, avec une mini-toolbar
  (couleur, police, bold, italic, outline + slider, shadow + slider, delete) et un bouton de reset de
  rotation qui n'apparaît qu'une fois l'élément tourné.
- La **boîte de crop** freeform : 4 poignées d'angle, masque assombri clippé à l'image, et une toolbar
  ancrée **sous la boîte** portant « Best for », les ratios et la paire ✕ / ✓. Les ratios avaient été
  mis dans un flyout de la palette : ça plaçait le ratio qu'on choisit à une largeur de canvas de la
  boîte qu'il reshape, le seul endroit où il ne doit pas être.

Le CSS de cette couche vit à part, dans
[`image-studio-canvas.css`](../../styles/screens/image-studio-canvas.css) : elle répond à « où
exactement sur l'image est ce contrôle, et comment il y reste » pendant que l'image est redimensionnée,
recadrée et régénérée dessous, ce qui n'est pas la question à laquelle répond la coque.

> ⚠️ Trois familles de classes y sont **assemblées par concaténation** en JS et un renommage les
> casserait en silence : `.image-studio__crop-handle--{nw,ne,se,sw}`, `.image-studio__popover--{kind}`
> et `.image-studio__tt-{kind}`.

Un drop d'image est accepté **sur toute la modale** en mode Generate (la section References est à un
scroll dans un panneau) et ouvre la section pour montrer ce qui vient d'atterrir.

### Commit vers le draft

Les overlays restent **vivants et éditables** jusqu'au commit — il n'y a pas d'« Apply » par édition.
C'est donc le commit qui les aplatit dans les pixels (`compositeOverlays`), avec deux destinations :

- _« Use this image »_ → `attachImageToDraft` + toast, puis fermeture.
- _« Apply to slide N »_ (édition d'une slide de carousel) → recuit la slide et **reste ouvert**, le
  set n'étant pas fini ; _« Use carousel · N slides »_ expédie ensuite l'ensemble via
  `attachCarouselToDraft`.

Chaque chemin resynchronise d'abord le texte en cours d'édition : un clic peut voler le focus d'un
`contenteditable` avant son dernier événement `input`.

### Ce que le mock ne fait pas

Aucune API d'image. `generateImage` renvoie une URL Picsum **seedée sur les entrées** — donc
déterministe : mêmes réglages, même image. Le recadrage est fidèle (reframe à seed constante) et les
overlays cuits sont exacts ; **« Redraw » est un aveu honnête** (reseed), pas une édition dirigée par
le prompt. Les réglages s'appliquent à la **génération suivante**, jamais rétroactivement.

> ⚠️ `derivePrompt` continue d'émettre sa ligne `Visual direction:` — qui retombe silencieusement sur
> Visual hook quand Type vaut « Any » — donc en mode **Layout** deux instructions de composition
> cohabitent dans le brief. Les vrais prompts portent ce genre de tension et le modèle la réconcilie.

---

## 7bis. Le stage Generate — les options d'abord, le brief en Advanced

**Les réglages sont le formulaire, Generate en est le submit, et le brief est la réponse à
« qu'est-ce que tu as envoyé ? »** plutôt que la chose à remplir d'abord. Il n'y a **aucun champ de
prompt en prose** nulle part.

> ⚠️ **Deux dispositions antérieures ont été SUPPRIMÉES, pas mises derrière un flag.** Une
> _classique_ faisait atterrir sur un brief en prose dans un composer du bas, les options épinglées
> au bord gauche du stage dans un inspecteur de 284px (`git log -S isv2-panel`) ; une _auto-brief_
> faisait du brief écrit le héros du stage, les options en barre de modificateurs à popover en
> dessous (`git log -S isv2-bs-mod`). Les deux mettaient l'utilisateur devant un brief avant qu'il y
> ait quoi que ce soit à briefer, et les trois variantes coûtaient trois chemins dans un seul moteur
> (`briefIsDerived()`, `isBriefStage()`, `afterLegacySetting()` n'existaient que pour les
> réconcilier). Leurs flags `imageStudioAutoBrief` / `imageStudioSetupFirst` sont partis avec elles.
> **Ne propose pas de les rétablir.**

Le stage est **deux moitiés pour toute la boucle** (`.isv2-bs.is-split`) : à gauche une bande de deux chips **Options / Advanced** puis le pane
correspondant, à droite la colonne de preview (vide → generating → in-feed → résultats + vignettes +
le voile « la brief a changé depuis cette image »). **La mise en page ne change jamais** — ni au
changement de pane, ni à l'arrivée de la première image.

- **Options** = les **six lignes** (Type & text · References · Branding · Style · Format · Output),
  **une carte par option** — sept avant que « Text in image » ne rejoigne la carte du Type (§7). Elles ont d'abord vécu en
  **deux groupes bornés** coiffés de titres _« What's in the image »_ / _« How it's made »_ — l'idée
  était d'**énoncer** le raisonnement que l'ordre encode, là où le panneau de 284px ne pouvait que
  l'**impliquer par la séquence**. **L'utilisateur a tranché contre** : les titres se lisaient comme
  du chrome dont les options n'avaient pas besoin, et une carte par option les sépare plus proprement
  qu'un groupe de lignes étiqueté. L'ordre porte toujours le raisonnement — par la séquence, pas par
  une légende — et `settingRowEntries` les renvoie déjà dans cet
  ordre, donc le pane est juste leurs cartes à la suite.
  Chaque carte est la recette **du DS** valeur pour valeur : `.ap-card` / `.ap-accordion` sont tous
  deux `blanc · 1px grey-10 · border-radius --ref-border-radius-md (8px)` et **sans ombre**. Composée
  depuis ces tokens plutôt qu'en prenant `.ap-card` (qui ajoute `padding: sm` + `gap: sm` que chaque
  ligne fournit elle-même). Une première passe leur avait mis `--app-shadow-card` + un radius 12px —
  le look « carte handoff » de l'app, qui **n'est pas** la carte du DS ; l'utilisateur l'a signalé.
  La carte DS est plate, et sur la toile grise un rectangle blanc bordé 1px se lit déjà comme sa
  propre carte sans élévation.
- **La colonne d'options EST une mesure, pas une moitié.** Le formulaire fait ~520px. La grille
  était `repeat(2, 1fr)` — deux moitiés égales — donc la colonne gauche faisait ~700px et laissait
  une **bande morte de ~180px** entre le bord droit du formulaire et le filet (signalée par
  l'utilisateur, capture à l'appui). La grille de `.isv2-bs--setup.is-split` est maintenant
  `calc(mesure + 2·lg) minmax(0,1fr)` : la gauche vaut exactement le formulaire plus son padding, la
  **preview absorbe le reste** — c'est la moitié qui veut de la place, et c'est le même master-detail
  que le Topic Feed (un côté mesure fixe, l'autre prend le reste). Le formulaire remplit donc sa
  colonne, plus de bande. Le pane **Advanced** partage cette colonne étroite, donc ses blocs passent
  en **une seule colonne** (`grid-template-columns: 1fr`) : à ~520px un grid 2-up tombait à ~40
  caractères par ligne, sous les 45-75 que l'œil demande ; empilés, chaque bloc court sur toute la
  mesure et se lit comme un vrai champ.
- **Espacement resserré.** Gap **entre cartes** ramené de `sm` à `xxs` (les cartes plates + le canal
  gris séparent déjà — `sm` se lisait « beaucoup trop espacé »), padding vertical des deux moitiés de
  `md` à `sm`. **Titres de section en h3 (16px)**, à égalité avec le « Preview » d'en face : chaque
  carte est une section, son titre mérite une taille de titre (la base `.isv2-acc` garde 14px,
  là les lignes sont des rangs, pas des sections).
- Le pane scrolle quand il faut — sans danger, puisque les réglages n'ont plus de flyout à faire
  sortir de la boîte depuis qu'ils sont des sections qui s'ouvrent en place. Le bord bas **se fond**
  (`mask-image` + `animation-timeline: scroll(self block)`, le jumeau vertical de
  `.isv2-refs.is-scrollable`) : le bas d'une carte est une **bordure**, donc coupée net
  elle a l'air cassée, et macOS masque les barres de défilement. Le fondu ne coûte rien quand tout
  tient : une scroll-timeline sur un élément non scrollable est inactive.
- Le pane scrolle quand il faut — sans danger, puisque les réglages n'ont plus de flyout à faire
  sortir de la boîte depuis qu'ils sont des sections qui s'ouvrent en place. Le bord bas **se fond**
  (`mask-image` + `animation-timeline: scroll(self block)`, le jumeau vertical de
  `.isv2-refs.is-scrollable`) : le bas d'une carte de groupe est une **bordure**, donc coupée net
  elle a l'air cassée, et macOS masque les barres de défilement. Le fondu ne coûte rien quand tout
  tient : une scroll-timeline sur un élément non scrollable est inactive.
- **Advanced** = des **blocs éditables**, avec ces règles : taper dans
  un bloc **EST** la reprise en main, un réglage changé ensuite marque le brief périmé au lieu de
  l'écraser, et le garde-fou nomme le réglage qu'il s'apprête à réécrire. Le chip est **désactivé
  tant qu'aucune image n'existe**, avec la phrase du tab Edit (_« Generate an image first »_) : ce
  qu'il contient est le prompt qui a produit l'image à l'écran, pas un brouillon de brief.
- **Footer** : `Generate` (blue secondary) → `Regenerate` dès qu'il y a des images, `Use this image`
  (orange primary) dans le slot primaire du début à la fin. C'est la branche footer de Generate,
  partagée. La **ligne d'état du brief passe sous les blocs** et non dans le footer : ici le brief
  est un pane sur deux, et le footer parlerait d'une chose que le lecteur n'a peut-être pas à
  l'écran.

### La densité vient du DS, pas d'un réglage maison

Les cartes avaient hérité la densité de l'**inspecteur épinglé de 284px**, où chaque pixel comptait :
lignes de 36px (`--comp-input-height`), corps de section en `8/16/12`, deux libellés de groupe en
caption grey-80. Dans une carte de 520px ça se lit comme un **tableau**, pas comme un formulaire.
Les valeurs viennent maintenant des composants que le DS destine à cette forme-là, et **uniquement
sous `.isv2-opts` / `.isv2-bs--setup`** — la base `.isv2-acc` garde la sienne, qui est le bon
réglage pour un rail :

| Ce qui a changé                     | Avant                | Après                   | D'où ça vient                                                                                  |
| ----------------------------------- | -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Structure                           | 2 groupes titrés     | **1 carte par option**  | choix utilisateur — les titres étaient du chrome, une carte sépare mieux qu'un groupe étiqueté |
| Hauteur de ligne                    | 36px                 | **40px**, `xxs sm`      | `.ap-list-panel-item` — le composant DS des lignes dans une carte                              |
| Corps de section                    | `8/16/12`            | **`xs/sm/sm`**          | `.ap-accordion-content` (`sm` partout), moins un cran en haut                                  |
| Gap dans un corps                   | `xs`                 | **`sm`**                | idem — 12px est le gap _à l'intérieur_ d'un cluster, pas entre deux                            |
| Carte d'option                      | (groupe ombré 12px)  | **carte DS plate, 8px** | `.ap-card` / `.ap-accordion` : 1px grey-10, `--ref-border-radius-md`, **sans ombre**           |
| Eyebrows (`Preview` / `The brief…`) | caption / body-bold  | **h3 (16px) grey-100**  | les libellés qui nomment une moitié du stage → taille de titre de section                      |
| Entre cartes                        | `md` (entre groupes) | **`sm`**                | le bord + la toile grise séparent ; `lg` pousserait la 7ᵉ trop bas                             |
| Padding vertical des deux moitiés   | `sm`                 | **`md`**, gutter `lg`   | de l'air en haut/bas ; le `lg` inline garde le bord gauche commun                              |
| Blocs du brief (pane **Advanced**)  | `xxs xs`             | **`xs sm`**, gap `sm`   | le pane ne porte rien d'autre et s'arrêtait au tiers de la moitié                              |
| Marque + titre du cadre vide        | 32px / 14            | **40px / h3**           | le cadre fait ~600px de côté ; 32/14 y était une légende perdue                                |

Une passe intermédiaire avait donné aux cartes `--app-shadow-card` + un radius 12px — le look
« carte handoff » de l'app — pour « lever » les options de la toile. **L'utilisateur a signalé que ce
n'est pas la carte du DS** : `.ap-card` et `.ap-accordion` sont plates (1px grey-10, 8px, aucune
ombre). Retour à la recette DS ; sur la toile grise un rectangle blanc bordé 1px se lit déjà comme sa
propre carte, sans élévation.

Chaque carte d'option **ne prend pas** le `padding-block` de `.ap-list-panel-items` (l'air aux coins
était le moins cher à céder). Contre-intuitivement, passer aux cartes individuelles a **regagné** de
la hauteur — les deux titres de groupe et leurs gaps supprimés font que les **sept cartes tiennent
dans le pli** à 780px comme à 980px (mesuré : tous les en-têtes visibles, `over: 0`). Ouvrir
plusieurs sections finit par scroller, et le **fondu de bord bas** est ce qui le dit.

### Les blocs ne « sautent » plus à l'expand

Deux causes, corrigées ensemble. **(1)** Chaque toggle de section re-rend **tout** le corps du modal
(`ctx.body.innerHTML = …`, le chemin one-way) — donc le scroller des réglages était recréé à
`scrollTop: 0`, et une carte ouverte après avoir scrollé rebalayait le pane en haut. `renderBody`
sauve puis restaure le `scrollTop` de `.isv2-opts` / `.isv2-panel` autour du swap. **(2)** Le re-rendu
recrée aussi les `<img>` de références ; une image encore en chargement (ou bloquée) se pose un
instant à hauteur nulle, ce qui rétrécissait la carte References de ~62px **à chaque expand** et
poussait tout ce qui suit vers le haut. `.isv2-refs` a maintenant `min-height: var(--isv2-tile)`, si
bien que la hauteur de la carte ne dépend plus de l'état des images (mesuré : hauteur constante,
delta 0, à travers expand/collapse). Correctif partagé par les deux modes (le strip de
références est le même partout).

### Le cadre de preview ne mentait plus qu'ici

`.isv2-bs-shot` était `flex: 1 1 auto` : il réclamait **toute** la hauteur de la colonne, ce qui ne
laissait plus rien à dire à son `aspect-ratio`. À 1240px de viewport un aperçu **1:1 sortait en
654×837**, et l'`object-fit: cover` à l'intérieur **recadrait** l'image carrée que le studio
s'apprêtait à commiter. Il prend maintenant le primitif de `.isv2-frame` — celui du stage
du canvas d'Edit, qui n'a jamais dérivé : `width: min(100%, (100cqh − chrome) × ratio)`, avec
`.isv2-bs-preview` en `container-type: size` et le ratio passé **aussi** en `--isv2-shot-ratio`
(une valeur `aspect-ratio` ne se lit pas dans un `calc()`). Le `chrome` soustrait ce que la colonne
dépense autour du cadre — la ligne d'en-tête, la bande de vignettes toujours présente, les deux
gaps — et il est déclaré à côté des règles qui posent ces hauteurs. Le gap des deux moitiés est
devenu `--isv2-bs-gap` pour cette raison : la valeur qui espace la colonne et celle que ce calcul
retire doivent être **une seule déclaration**, pas deux qui se ressemblent aujourd'hui. Chaque état
porte le même cadre, donc la promesse « rien ne bouge quand l'image arrive » tient toujours. Le
correctif vit sur `.isv2-bs-shot`, la seule déclaration du cadre.

### Le brief est écrit AU moment de générer

`index.js#open` ne dérive **rien**, et `deriveNow()` écrit le brief **synchrone** quand on
presse Generate — `derivePrompt` est une fonction pure, les 2 s de `DERIVE_MS` sont du théâtre, et un
battement là ne servirait qu'à laisser mort pendant deux secondes le seul contrôle vivant du
formulaire. C'est aussi ce qui rend l'onglet Advanced honnête : le texte qu'il porte est le prompt qui
a produit l'image, pas un brouillon.

Le seed du **headline** (`renderText`) suit la même horloge : il arrive au premier Generate, et **la
section s'ouvre pour lui** (`collapsedGroups.delete("renderText")`). Sans ça le studio peindrait des
mots dans l'image sans qu'aucune ligne à l'écran ne le dise — la règle que le `collapsedGroups`
initial suit déjà, appliquée à une section qui arrive vide.

### Un module par sujet

Le stage est une **layout** ; ce qu'elle héberge sont des sujets, chacun avec ses propres règles —
le même motif que `topic-article.js` :

| Module              | Ce qu'il rend                                                            |
| ------------------- | ------------------------------------------------------------------------ |
| `setup-stage.js`    | la layout : la bande de chips, le pane Options, le pane Advanced         |
| `settings-view.js`  | ce qu'**est** une ligne d'option, et le contrôle dans son corps          |
| `brief-blocks.js`   | un bloc de brief, le hero « Text on the image », et `briefNote` (l'état) |
| `preview-column.js` | la moitié droite, ses quatre états, le toggle Image / In feed            |

`briefNote` garde son paramètre `intro` : c'est la **seule** phrase qui affirme _où_ sont les
réglages, et le pane qui l'imprime est un onglet plus loin qu'eux. Les deux états « repris en main »
ne font aucune affirmation spatiale et sont fixes.

### Trois écarts au DS corrigés dans la foulée

- **`is-set` n'est plus bleu.** La valeur d'une ligne décidée passait à
  `--sys-border-color-active` (#178DFE) : cela mettait la **seule couleur du formulaire** sur deux
  noms de marque — la chose la moins importante de l'écran — et teintait une **donnée statique** de
  la couleur que la maison réserve à l'interactif. Elle se lit maintenant en **encre + graisse**
  (grey-100 bold quand c'est décidé, grey-80 regular sinon), le levier que les règles maison
  nomment pour exactement ça. Portée à `.isv2-opts` : la base `.isv2-acc` garde sa décision
  documentée (`12bec519`, contraste mesuré).
- **La ligne désactivée** (le Style quand une référence pilote le look) était `--ref-color-grey-40`
  (#AEB5C1) **plus un italique**. grey-40 est sous le plancher d'encre grey-80 — la ligne avait
  l'air cassée, pas indisponible — et l'italique n'existe nulle part dans le ramp typo du DS.
  C'est **grey-60**, le seul palier que les règles réservent au disabled, sans italique. Corrigé
  **globalement** : c'était un bug, pas un arbitrage.
- **Plus de labels en majuscules sur cet écran.** `.isv2-bs-eyebrow` passe en `text-transform:
uppercase`, ce que les règles maison interdisent — on hiérarchise par taille, graisse et encre.
  Neutralisé sous `.isv2-bs--setup`, et monté en **h3 (16px) grey-100** : _« The brief I sent »_ et
  _« Preview »_ nomment chacun une moitié du stage, donc ils prennent une taille de titre de section.
  La base `.isv2-bs-eyebrow` garde son traitement (uppercase 12px).

> ⚠️ Le switch de pane est une **paire de `.ap-filter-chip`**, pas `.ap-tabs`. Le header de la modale
> porte déjà la seule bande d'onglets de l'écran (Generate | Edit) ; une seconde à 300px de là
> « se lirait comme un sélecteur de mode concurrent du vrai » — la raison même pour laquelle le
> toggle Image / In feed utilise les chips. Le même primitif rend d'ailleurs cette bande symétrique
> de celle qui lui fait face dans l'en-tête du preview.

> ⚠️ **Ce n'est pas le variant grille retiré** (`imageStudioGridBrief`, `6ea8de36` → `2ef212ff`).
> Celui-là remplaçait le prompt en prose par des champs nommés **inventés**, comme **seul** éditeur et
> **avant** génération. Ici les libellés sont ceux de `derivePrompt`, le brief vient **après** la
> génération, et c'est une sortie de secours et non la surface principale.

> ⚠️ Un toggle « qui ne sert qu'à révéler ce qui est déjà là » a été retiré deux fois de ce studio
> (l'expand du composer, `4ea50227` → `12bec519`). L'onglet Advanced révèle quelque chose qui n'a
> **jamais** été à l'écran, pas une vue tronquée de ce qui y est — la prémisse de la règle ne tient
> pas ici. Arbitrage tranché avec l'utilisateur, pas un oubli.

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

Un Playbook capture business summary, audience, goals, voice/style, brand identity — la **fiche d'identité d'un émetteur (marque ou voix) et de son cadrage éditorial**. Ce qu'il est et ce qui n'a jamais le droit d'y entrer : [`CONCEPTS.md` §1](CONCEPTS.md#1-le-playbook). Ci-dessous, ce qu'il fait. Stores/vues : [`contexts-store.js`](../../src/contexts-store.js), [`context-builder.js`](../../src/context-builder.js), [`playbook-view.js`](../../src/playbook-view.js), [`context-mock-analysis.js`](../../src/context-mock-analysis.js), [`languages.js`](../../src/languages.js).

### Library (l'onglet **Playbooks** de `/home`, [`screens/home.js`](../../src/screens/home.js))

Header **« Playbooks »** + _« N Playbooks · applied across N chats »_ + search + **« Create a Playbook »**. Grille de cartes + ghost card. Carte : swatch couleur, nom (+ ★ default), voice headline, brief summary, compteurs, palette dots, _« Updated {when} »_. Hover : **Edit / Duplicate / Delete**. Garde : impossible de supprimer le dernier (_« Can't delete the last Playbook… »_).

**Sous `playbookWorkspace` (§14), cette page quitte le shell et devient un onglet.** Le catalogue est l'onglet **Playbooks** de la home du compte (§12) : son `h1` « Playbooks » et son sous-titre disparaissent — le héro porte le seul `h1`, et l'onglet dit déjà « Playbooks 8 » — la recherche et **Create a Playbook** passent dans la barre d'outils sous les onglets, et « Applied across N chats » y survit en ligne discrète. **Les cartes ne changent pas d'un octet** : verbes au survol, `Current`, `Switch`, garde de suppression, ghost card. Flag OFF, `/contexts` rend toujours cette page seule, avec son entête. Elle parle des marques où l'on n'est **pas** : la porter dans le chrome d'une seule était la contradiction que le switcher a créée. Donc `body.account-scope` ([`ROUTES.md`](ROUTES.md) § Deux niveaux de chrome) — pas de rail, une colonne, topbar réduite à **« ‹ Back to <marque> »** — et une seule porte d'entrée : le footer du switcher (**All playbooks**). La ligne de nav, elle, ne mène plus ici : elle est passée au singulier et pointe la fiche de la marque active (§12).

**Sous le flag, l'onglet est un TABLEAU** (`.ap-table` + `.home-table`), la même forme que l'onglet Chats à côté — les deux tabs sont des **enregistrements à scanner** : champs courts, comparables, une ligne chacun, et un lecteur qui descend une colonne. Et un tableau **nomme ses colonnes en texte** dans un en-tête, là où la liste de cards laissait deviner que « MB » était un propriétaire, un crayon une permission et une date la dernière édition.

| Colonne      | Contenu                                                                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playbook** | vignette (le **logo** de la marque quand l'analyse en a trouvé un, sinon ses initiales dans un `.ap-avatar square`, en `object-fit: contain` — le DS _couvre_ ses images et un lockup couvert revient rogné) + dot de scope + nom + ★ défaut + `Current`, et le brief coupé à l'ellipse en seconde ligne |
| **Owner**    | avatar + « You » / le nom du propriétaire — **flag `playbookSharing`**                                                                                                                                                                                                                                   |
| **Access**   | `ap-icon-pen` si je peux éditer, `ap-icon-eye-on` sinon, le `title` portant la phrase — idem                                                                                                                                                                                                             |
| **Updated**  | l'horodatage                                                                                                                                                                                                                                                                                             |
| (kebab)      | les quatre verbes en `.ap-action-dropdown` (`installMoreMenu`), en-tête nommé pour les lecteurs d'écran seulement                                                                                                                                                                                        |

**Le contrat du composant, tel que la fiche `/design-guidelines` le pose** — et que la première version violait : `<table>` sémantique, **aucune classe sur `tr` / `th` / `td`**, l'apparence venant des **modificateurs racine** (`outer-border`, `header-background`, `small`, plus `clickable-rows` que `ds-patches.css` ajoute faute d'affordance de ligne navigable dans le DS) et des **classes de cellule documentées** (`right`). Tout ce qui habille du contenu se pose sur les spans à l'intérieur de `.ap-table-cell-content`, le wrapper du DS. La cellule d'identité à deux lignes est la forme prescrite par `patterns.md` (« a leading cell often pairs an avatar + name + email »), le brief jouant la seconde ligne — et c'est pour ça que ce tableau ne prend pas le `small` de l'onglet Chats. La colonne d'actions porte l'en-tête **Action**, à droite, comme le composant.

⚠️ **Ce tableau est le troisième état de cet onglet** : grille de tuiles → liste de cards horizontales → tableau. La liste de cards était un tableau qui s'ignorait (largeurs fixes, hauteur de ligne uniforme, nombres alignés) ; seuls la bordure et le radius par ligne restaient « card ». Métrique : ~54px de ligne ici contre 40px (`small`) sur les Chats.

Trois choses que la tuile porte et que la ligne ne porte pas : les **compteurs** (chats / audiences / competitors / influencers — des nombres par ligne que personne ne lit pour choisir une marque), le **chip de voix** (une tuile a la place de caractériser ; une ligne a un nom et, juste dessous, la phrase de la marque qui le dit mieux) et les **dots de palette** (la vignette et le dot portent déjà l'identité visuelle). Ce que Claude Design a et qu'un Playbook n'a pas : **Published** (rien à publier) et l'**étoile favori** — la nôtre est le badge « défaut », en lecture seule, le flag `playbookDefault` ayant été supprimé (§14).

⚠️ **Pas de ghost card** : `Create a Playbook` est le primaire de la barre d'outils juste au-dessus.

**La tuile survit sur `/contexts` flag OFF**, avec son bandeau de couleur, son chip, ses compteurs, sa palette, sa barre de verbes au survol et sa ghost card : là, un Playbook est un **objet qu'on parcourt**, pas une ligne dans laquelle on pioche.

**Sous le flag, la carte EST le workspace** : cliquer dessus bascule sur cette marque et ouvre un **chat neuf** dedans (`?contextId=`, pas `/` — la home est un lanceur, le geste est « démarrer », pas « reprendre »). La fiche garde le crayon, avec les autres verbes au survol, et la marque active porte un tag **`Current`** dans le coin métadonnées.

⚠️ **C'est l'inverse de ce qui a tenu un commit** — le corps ouvrait la fiche, un petit lien `Switch` portait la bascule — au nom de l'asymétrie d'un clic raté (une page contre toute l'app qui bouge). Décision de l'utilisateur ; ce qui la rend sûre, c'est que rien n'est perdu : le chat neuf est vide, le fil d'Ariane ramène, et la marque quittée est à une carte. Le lien `Switch` est parti avec, devenu un second contrôle pour ce que fait la carte entière. Flag OFF, la carte ouvre toujours la fiche.

### Détail (`/playbook/:id`, [`screens/playbook.js`](../../src/screens/playbook.js))

Rendu via `playbook-view` en mode **library**. Header identité + rail sticky + les sections. Actions : **Start a chat**, **Re-analyze website** (confirm → loader staged → patch), Delete, rename. Voice-only re-analysis : **My posts** / **Documents…**.

### Moteur partagé ([`playbook-view.js`](../../src/playbook-view.js))

Sections éditables inline (une à la fois, Save/Cancel avec snapshot) :

1. **Audience & goals** — Language(s), Business, Primary audience, Content style, Primary goal, Content action, CTA links.
2. **Voice & style** — toggle **Guided ⇄ Write it yourself**. Guided = Signature hooks + Closing patterns + Formatting + **Emoji & casing** (le champ s'appelle toujours `visualStyle` en base ; il porte des conventions de **texte** — emoji, casse, hashtags — et son ancien libellé « Visual style » devenait un piège une fois « Default look » posé dans Brand. Libellé renommé, clé inchangée : la renommer serait du churn qu'aucun utilisateur ne voit). Switcher **par langue** (2+ langues, flag `multilingualPlaybook`) — voice **écrite nativement par langue, jamais traduite** (voir mémoire _multilingual-playbook-model_). Dropdown « Learn from… ».
3. **Brand** — **Logo** (galerie + un défaut), Brand colors (hex swatches), Typography, Personality, Reference images, **Default look**.
4. **Competitors** — voir ci-dessous.
5. **Influencers** — même mécanique que Competitors, voir ci-dessous.

**Les logos** sont la première ligne de Brand, parce que c'est la pièce la plus concrète de l'identité visuelle et la seule que le générateur d'images cuit dans les pixels.

**Un SET, pas un logo.** Un site en porte plusieurs — le lockup d'en-tête, la version inversée du footer, l'icône carrée, le favicon — et ils sont tous légitimement « le logo » : n'en stocker qu'un obligerait à en jeter trois. Donc `brandLogos: Array<{ id, label, url }>` (le set) + `brandLogo` (**l'URL du défaut**, pas un id ni un getter : tout l'aval — header, tampon du studio, aperçu de `branding-view` — lit déjà `brandLogo` sans changement, et `snapshotEditable` fait un aller-retour JSON qui écraserait un getter). `normalizeBrandLogos()` dans [`contexts-store.js`](../../src/contexts-store.js) tient l'invariant : `brandLogo` est **toujours** une des URLs du set, ou `""` quand il est vide — un contexte qui ne portait que `brandLogo` devient un set d'une entrée plutôt que de perdre sa marque. Le compteur `brandLogoSeq` vit en haut du fichier parce que le seed appelle le normalizer à l'init du module, où un `let` déclaré à côté de sa fonction serait encore dans sa TDZ.

**La galerie.** Vignettes carrées 72px + label dessous (à cette taille un wordmark et son jumeau inversé sont durs à distinguer, et « Reversed » vs « Icon » n'est pas quelque chose qu'une vignette dit toute seule). Le défaut porte un anneau bleu + un badge check. En **lecture** on montre tout le set, pas seulement le défaut : savoir que quatre marques ont été trouvées est l'information, et c'est ce qui signale qu'il y a un choix à faire sans entrer en édition — les vignettes sont alors des `<span>`, rien n'est cliquable. En **édition** chaque vignette devient le contrôle de sélection, avec une poignée de suppression à l'opposé du badge (même répartition que les tuiles de référence du studio).

Retirer le défaut passe la main à ce qui reste ; vider le set fait retomber le header sur les initiales. Le défaut est stocké **par URL et jamais par index** — un index pointerait silencieusement sur une autre marque dès qu'on supprime celle du dessus.

**D'où viennent les marques.** `imageVoice.websites[0].images.logos` : trois vraies marques Archie pour une analyse d'agorapulse.com, et pour n'importe quel autre domaine **le favicon résolu depuis ce domaine** (même service que les logos de compétiteurs) — inventer un wordmark pour « foo-bar.com » mettrait dans le Playbook un logo qui n'appartient à personne. `deriveBrandLogos()` lit ce champ, en miroir exact de `deriveBrandColors()`.

Upload = bouton + input caché (pas le `.ap-dropzone` partagé : la ligne « Reference images » juste dessous est déjà un bouton + input caché, et deux affordances d'upload à une ligne d'écart se liraient comme deux natures de contrôle), multi-fichiers, `FileReader.readAsDataURL` et non `URL.createObjectURL` — un object URL est éphémère et ne survivrait pas au store. Le label est le nom du fichier sans son extension : c'est le seul que l'utilisateur ait donné. Plafond `MAX_BRAND_LOGOS = 8`.

Le défaut **remplace le monogramme d'initiales** dans le header du Playbook (pattern image + jumeau monogramme, swap sur `error`, comme les logos de compétiteurs) : une marque qui a un logo se reconnaît à lui. Le set repart ensuite dans l'Image Studio — voir §7.

#### Default look — le point de départ d'une image générée

`imageDefaults: { imageType, style, refMode }`, trois enums, `""` = pas de préférence. Pourquoi c'est
admissible sur une fiche et où s'arrête le périmètre : [`CONCEPTS.md` §1](CONCEPTS.md#1-le-playbook).
Le studio les lit dans `start()` (12ᵉ option `playbookImageDefaults`) et les pose sur les trois clés
d'état qui existaient déjà — donc **aucun module de vue n'a changé**, et les surfaces en
héritent ensemble. Il les **lit et ne les écrit jamais** : changer le Type dans le studio est un choix
pour ce post.

**Forme calquée sur `brandTypography`**, pas sur `brandLogos` : objet plat imbriqué, une ligne dans
chacun des quatre points de câblage du store. Toujours **exactement trois clés string**, jamais
`undefined` — `snapshotEditable` fait un aller-retour JSON et `JSON.stringify` **supprime** une clé
`undefined`, donc un snapshot à deux clés ferait restaurer une forme différente au Cancel.
L'appartenance aux catalogues est validée dans `start()` et non dans le store : c'est là que vivent
les catalogues, et un store qui les importerait inverserait les couches.

**Dernière ligne de la section**, et c'est un ordre de lecture : Logo / Couleurs / Typo / Personnalité
sont les **matériaux**, Reference images les **exemples**, le look par défaut l'**instruction sur
comment s'en servir**. Une instruction avant ses matériaux est un contrôle sans sujet.

Trois sous-groupes en `.ap-filter-chip` + `aria-pressed`, **mono-sélection avec dé-sélection** :
re-presser le chip choisi le vide, et vide **est** l'état « pas de préférence » — donc pas de chip
« Any », qui serait une seconde façon de dire la même chose. Même primitif que le toggle Guided ⇄
Write it yourself, ce qui fait aussi que la ligne **ressemble au contrôle qu'elle règle**. Pas de
vignettes pour Style ici, délibérément : ce seraient les **troisièmes** images de la section, en
concurrence avec la galerie de logos et les tuiles de référence — et celles du studio sont des mocks,
pas de vrais aperçus de ces presets. Le sous-groupe `refMode` est **rendu mais `disabled` avec sa
raison** quand il n'y a aucune image de référence (« Add a reference image below and I'll say how to
use it. ») : un contrôle qui disparaît laisse se demander si l'option existe. Et la lecture n'invente
jamais rien — un `refMode` vide n'imprime **pas** « Blend » sous prétexte que c'est là que le moteur
retombe, sinon la fiche revendiquerait une décision que personne n'a prise.

**Pré-rempli par l'analyse du site, à la création seulement.** `imageDefaultsFromAnalysis` mappe
`imageVoice.websites[0].personality` — le ton choisit la famille, l'énergie choisit le membre :

| tone / energy                | → style          |
| ---------------------------- | ---------------- |
| operator-first / medium-high | `bold-editorial` |
| evidence-led / calm          | `corporate`      |
| direct / calm                | `corporate`      |
| warm / calm                  | `photoreal`      |
| professional / medium        | `tech-minimal`   |
| non reconnu                  | `""`             |

Seul `style` est dérivé. `imageType` répond à ce que **ce** post doit montrer et `refMode` décrit
l'usage d'une image de référence que l'analyse n'a pas choisie — deviner l'un ou l'autre serait
l'erreur du variant grille retiré (des champs nommés, inventés). Un ton non reconnu donne `""` plutôt
qu'un preset de repli : mettre sur la fiche une affirmation que rien ne soutient est pire que « Any ».

⚠️ Le mapping vit dans **`applyAnalysisToDraft`** et **pas** dans `sectionPatchFromAnalysis`, parce que
ce patch-là est aussi ce que **Re-analyze website** applique à une fiche **existante** : comme seul
`style` est dérivé, il effacerait un type d'image et un mode de référence choisis à la main sans rien
à mettre à leur place. Le pré-remplissage appartient au chemin qui **crée** un Playbook. Corollaire :
Re-analyze ne touche pas au Default look. `voicePatchFromAnalysis` (« Learn from… ») ne l'inclut pas
non plus — il est scopé à Voice & style.

Un Playbook est une **fiche** : chaque section répond à « qui êtes-vous ? ». La config opérationnelle (quelles sources d'écoute tournent, à quelle fréquence) vit dans son propre store, clé par Playbook, et s'édite sur la route qui possède la feature — voir §17. Une section Topics a été essayée puis retirée : une grille d'interrupteurs se lisait comme un panneau de réglages coincé dans un profil. Le champ `ctx.topics` qui la portait est parti avec elle.

### Competitors

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
- **Toujours affichée** — la section, l'entrée de rail et le compteur `/contexts` sont permanents depuis que `playbookCompetitors` a été baké ON (cleanup 2026-09-04). Ce fut un flag OFF par défaut, comme `multilingualPlaybook` : sa branche OFF est supprimée.

### Influencers

Les créateurs que l'audience de la marque suit déjà. Champ sur le Playbook : `influencers: Array<{ id, name, description, websiteUrl, socials:[{network,url}] }>` — la forme de `competitors`, **sans état pending**.

**Calqué sur la section Competitors de la beta** (`app.beta.agorapulse.com/studio/…/playbook/…`, relevée le 24 Sep 2026), pas sur les Competitors de ce proto : une **liste**, sans bac « Suggested by Archie », sans Discover, sans modale détail. Rendu par `renderInfluencersPanel` dans `playbook-view.js` ; les helpers de données et les hooks name / website / remove sont partagés avec Competitors via `ROSTERS`.

- **Lecture** — une ligne pleine largeur par influenceur : nom, une rangée de vrais liens (`.ap-link standalone small` : site avec `ap-icon-web`, puis chaque profil avec l'icône et le nom de son réseau), description. Une ligne d'intro sous le header : « The creators your audience already follows, with their website and social profiles. »
- **Ajout** — bouton **« Add an influencer »** dans le header, à côté du pencil, **en lecture** : ouvre un `.ap-dialog` (nom, site, puis **un champ fixe par réseau**) ; **Add influencer** (`primary blue`) reste désactivé tant que le nom est vide et commite aussitôt.
- **Édition** — le pencil transforme chaque ligne en formulaire inline (nom, site, champs réseau fixes) avec un bouton poubelle (`.ap-icon-button stroked transparent`) ; header Cancel / Save changes, **Add masqué**, **description masquée** (non éditable, comme sur la beta). Save élague les profils vides.
- **Création** — `sectionPatchFromAnalysis` verse `suggestions.influencers` **directement** dans la liste (la beta dit « …we found for your brand »).
- **Réseaux** : Facebook, Instagram, LinkedIn, X et YouTube — **pas TikTok** (`ROSTERS.influencers.networks`). Competitors garde les six.
- **Pas de `reach`.** Le fork portait un nombre d'abonnés par influenceur ; retiré au portage des seeds (Acme, Founder voice, Customer stories, Noba) : un compteur se périme tout seul, ce qui échoue à la question 2 du test d'inclusion ([`CONCEPTS.md`](CONCEPTS.md) §1).
- Icône `ap-icon-star`, la même partout : section du Playbook, compteur `/contexts`, source d'écoute `influencer-posts` (cartes et article des Topics, carte de réglages).
- ⚠️ Une première version reprenait **toute** la mécanique Competitors du proto (bac de suggestions, Add all, Dismiss mémorisé, Discover, modale détail, `dismissedInfluencers`, `discoverInfluencers`). Elle a été remplacée par le comportement de la beta, sur demande — `git log -S discoverInfluencers`.

### Partage (flag `playbookSharing`, défaut OFF) — « §9bis »

Le problème : dans une org multi-users, N personnes créent chacune leur Playbook pour la **même marque**, personne ne sait laquelle fait autorité, et le travail part avec celui qui quitte l'entreprise. Les seeds le mettent en scène : `Acme · Q2 marketing` (à moi) et `Acme · Developer relations` (à Sam Rivera) sont deux fiches pour Acme.

Les trois portées ont chacune leur seed, sans une ligne de fiche inventée : `Acme · Q2 marketing` est **à l'org** (vu du propriétaire), `Customer stories` est **nommément** à Sam + Léa et **liée au profil LinkedIn** (donc son picker grise trois collègues), `Acme · Developer relations` est reçu **nommément** de Sam (lecture seule, « Sam Rivera shared this Playbook with you »). L'org compte 12 membres, `ORG.memberCount` en dérive : une liste de trois à côté de « All 12 of them » se voyait dès que le picker existait.

**Trois portées, et la distinction qui les sépare est fixe ⇄ dynamique.** Un Playbook est `scope: "personal"`, `"members"` (une liste **fixe** de collègues, dans `sharedWith`) ou `"organization"` (une liste **dynamique** : toute l'org, arrivées comprises). C'est ce que les deux cartes de partage disent **en premier**, avant le qui-l'utilise-vs-qui-le-modifie : la doc demande deux fois de souligner cette différence (§5.1). Un `members` **vide n'est pas partagé** — il ne touche personne, et toute la portée d'un manager pend à ce prédicat.

⚠️ **Ça a vécu deux semaines en binaire**, avec un commentaire « there is no named sharing » en tête de [`playbook-access.js`](../../src/playbook-access.js) : pas de liste de destinataires, pas de people-picker. La doc a trois états dans **toutes** ses versions (§5.1, §5.3, §6.1, lot L2) et l'arbitrage qui en avait retiré un n'était écrit nulle part — donc la doc a gagné (audit du 2026-09-10). Ne pas re-supprimer le partage nommé sans l'écrire dans la doc d'abord.

**Un Playbook lié à un profil social ne touche que qui touche ce profil** (§7, ses deux lignes profil — Q2 tranche l'inverse, l'arbitrage retenu est §7). `profileBlockFor()` passe **avant** tout autre test dans `canView`, et le picker garde le collègue bloqué dans la liste, **désactivé, avec la raison** (« No access to Northwind Studio Co. ») : retirer la ligne laisserait le propriétaire chercher son collègue. La carte « Everyone at {org} » nomme alors le compte plutôt que de promettre « all 12 », que le picker contredirait trois lignes plus bas. La permission est **celle d'Agorapulse** — `profiles` par membre dans [`org.js`](../../src/org.js), `"all"` ou une liste d'ids — jamais stockée sur la fiche ([`CONCEPTS.md`](CONCEPTS.md) §6). **Fail open** quand le profil ne se résout pas (rien de connecté, id périmé) : une contrainte invérifiable ne doit pas verrouiller une fiche.

**Champs sur le Context** (normalisés par `normalizeOwnership()` dans [`contexts-store.js`](../../src/contexts-store.js), dans `addContext` **et** sur le seed qui le bypasse) : `ownerId`, `scope`, `sharedWith: string[]`, `history: Array<{ id, actorId, action, when }>` (capé à 12). `sharedWith` **survit** au passage en privé et retour — la doc promet les deux sens sans perte (§5.3) — donc seul `scope` décide qui est dedans, et `normalizeScope` est une `function` et non un `const` parce que le seed normalise pendant que le module s'évalue encore. L'identité et l'org vivent dans [`org.js`](../../src/org.js) — **CONFIG, pas des mocks** : un utilisateur `new-alt` a lui aussi un nom et une organisation, même split que `ff-catalog.js` vs `mocks.js`.

**Les droits vivent dans [`playbook-access.js`](../../src/playbook-access.js), pas dans le store.** Le store continue de tout renvoyer à tout le monde, délibérément : un chat dont le Playbook a cessé d'être partagé doit encore pouvoir le **nommer** (« ce chat tournait sur Nutrix »), donc lire une fiche qu'il ne peut plus ouvrir. Le store tient les faits, ce module tient les droits, et `revokedContextFor()` est le seul autorisé à regarder par-dessus la barrière. `canView` / `canUse` / `canEdit` / `canGovern` / `canDelete` / `canManageSharing` / `canTransfer`, plus `visibleContexts()` / `usableContexts()` / `editableContexts()` que les surfaces substituent à `getContexts()`. **Flag OFF ⇒ tout est permis** — un seul point de court-circuit, `on()`.

|                                   | Propriétaire | Membre, `organization` | Manager, `organization` | Membre, `personal` d'un autre |
| --------------------------------- | ------------ | ---------------------- | ----------------------- | ----------------------------- |
| Voir / utiliser / dupliquer       | ✅           | ✅                     | ✅                      | ❌                            |
| **Éditer le contenu**             | ✅           | ❌                     | **❌**                  | ❌                            |
| Partager / supprimer / transférer | ✅           | ❌                     | ✅                      | ❌                            |

**Éditer et gouverner sont deux droits séparés, et le manager n'a que le second.** Le contenu d'un Playbook est à son propriétaire et à personne d'autre : partagée, la fiche est en lecture seule pour tout le monde, managers compris (doc §5.2, « Edit the content → Org manager ❌ »). ⚠️ `canEdit` a renvoyé `true` pour un manager pendant deux semaines, ce qui posait un crayon sur chaque section de la fiche d'un collègue ; ce qu'un manager peut faire vit maintenant dans **`canGovern()`** — mettre devant l'org ou l'en retirer, transférer, supprimer. « Qui décide ce que ça dit » et « qui décide de ce que ça devient » ne sont pas la même question. `canDelete` / `canManageSharing` / `canTransfer` dérivent de `canGovern`, plus jamais de `canEdit`.

Le manager ne voit **que** les Playbooks partagés : une fiche personnelle non partagée reste privée même pour lui. Le rôle se change dans **Admin → Your role** ([`org.js`](../../src/org.js), `localStorage` `archie-org-role`) — la première section conditionnelle du popover.

**Surfaces**

- **`/contexts`** — la grille liste `visibleContexts()`. La marque de propriété est un `.ap-tag.grey.mini` dans le **coin métadonnées de la carte**, à côté des pastilles de palette : _« Shared with org »_ (à moi) ou _« Shared by Sam Rivera »_ (à un autre). À moi + personnel n'affiche **rien** : c'est le défaut, personne n'a besoin qu'on le lui dise. Elle a d'abord été essayée à côté du titre et cassait les noms longs sur deux lignes. La barre d'actions au hover est filtrée par droits — un Playbook partagé par un autre n'offre que **Duplicate**.
- **`/playbook/:id`** — `canEdit` false ⇒ aucun crayon de section, pas de rename, pas d'étoile, pas de « Learn from… », pas d'actions sur les compétiteurs, reference images figées. Un `.ap-infobox.info` dit **pourquoi** (« Sam Rivera shares this Playbook with your organisation ») et **Duplicate** est la sortie. Le **manager** y atterrit aussi : il tient Share / transfert / Delete dans le header et aucun crayon dans le corps, donc le message nomme les deux moitiés (« …manage it as a manager… What it SAYS is Sam Rivera's ») — lui dire seulement « duplicate it » se lirait comme une page cassée : la copie est à moi, personnelle, historique vide, détachée (pas de lien « dupliqué depuis »). La propriété apparaît en marque à côté du nom et en quick-fact **Owner** dans le rail — **jamais une section**. Un deep link vers une fiche interdite rebondit sur `/contexts`, exactement comme un id inconnu.
- **Le modal** ([`share-playbook-modal.js`](../../src/components/share-playbook-modal.js), 560px) — **la forme de Notion / Slite / Drive** : la question avec laquelle on ouvre ce dialogue est « qui a ça ? », pas « dans lequel de trois modes est-ce ? ». Dans l'ordre : le select **General access**, la liste **People with access** (son picker en tête), l'`.ap-infobox.warning` de conséquence, puis derrière un filet le **transfert**, replié. Ouvert depuis la carte et depuis la fiche. CTA **bleu** : partager est une action de liste routinière, pas une action IA.
  - ⚠️ **Les trois portées ne se choisissent plus, elles se DÉRIVENT.** `pickedScope()` est le seul endroit où elles se reconstituent : `organization` si l'accès général est l'org, sinon `members` si la liste des invités n'est pas vide, sinon `personal`. Le store et ses trois valeurs sont intacts (la doc les exige toutes les trois, §5.1) — c'est l'UI qui cesse de demander au lecteur de nommer un mode pour en atteindre un. Un Playbook privé se lit maintenant « People with access : moi (Owner) · Invited people only », ce qui est la même information sans le détour.
  - ⚠️ **Ce que ça a remplacé, et où il ne faut pas retourner :** trois `.ap-radio-card` (Just me / Specific people / Everyone at {org}) avec le people picker replié derrière la carte du milieu. Qui avait réellement le Playbook était à un clic, derrière un trigger, et ajouter quelqu'un coûtait quatre gestes. Avant ça, une liste plate de onze cartes cochables dans le corps de la modale (~250px de trop, Save sous le pli).
  - ⚠️ **`General access` vient EN PREMIER, parce qu'il commande la section d'en dessous** : en org-wide il n'y a plus personne à inviter et le picker disparaît. La liste a été au-dessus un moment, au motif que « qui a ça ? » est la question avec laquelle on ouvre le dialogue — mais ça mettait le lecteur devant une liste à configurer, avec un contrôle EN DESSOUS capable de rendre caduc ce qu'il venait de faire. **L'ordre de lecture suit la dépendance.** Le coût est nul : la porte tient en une rangée, donc la liste arrive quand même dans le premier écran. Ça se lit comme une phrase — « invités seulement » → « personne d'autre ne peut l'ouvrir » → « voici qui peut ».
  - **TOUS LES CONTRÔLES SONT DES COMPOSANTS DU DS, non modifiés.** Le picker de personnes est le **Selection Dropdown** de l'ADS derrière un trigger `.ap-select` (recherche + items cochables + état vide), et l'accès général comme le transfert sont des `.ap-select`. ⚠️ **Une passe en a INVENTÉ deux** — une combobox sans bordure pour l'invitation et une switch-row pour l'accès général — parce qu'un dropdown ne pouvait pas échapper au dialogue qui scrolle. Mauvais problème : l'app répond déjà à celui-là (le menu de ligne de la sidebar), et la réponse est `position: fixed` + coordonnées posées au toggle, pas un composant neuf. **Ne pas fabriquer de contrôle à la main ici.**
  - ⚠️ **`position: fixed` ne se résout PAS contre le viewport dans cette modale.** Toutes les modales centrées de l'app portent `transform: translate(-50%, -50%)`, et **un ancêtre transformé devient le bloc conteneur de ses descendants fixed** — des coordonnées viewport posaient le panneau décalé de l'origine de la modale (mesuré : 211px à droite, 129px en bas). `placePopover()` soustrait donc la boîte de la modale. Le panneau échappe quand même au scroller, puisque c'est la modale qu'il prend pour référence et pas lui. Il bascule **au-dessus** du trigger quand il reste moins de 200px dessous et davantage dessus, se referme au scroll du corps (un panneau fixe ne suit pas son trigger) et au clic dehors (`<details>` n'a pas de fermeture extérieure native).
  - ⚠️ **Le corps de la modale est BLANC.** Une passe l'a teinté en gris avec des panneaux blancs dessus pour fabriquer des régions : **les modales n'ont pas de fond gris ici.** Ce qui structure ce dialogue, c'est le chrome propre des contrôles du DS — un trigger `.ap-select` encadré par section — plus les intitulés et la liste de personnes à filets. Le fond teinté et le `__panel` sont partis avec.
  - **Le contenu SCROLLE** (`overflow-y: auto` + `min-height: 0` sur `.ap-dialog-content`), ce que les popovers fixes rendent possible. ⚠️ Il a tourné en `overflow: visible` pour laisser les popovers s'échapper : le corps ne pouvait alors plus scroller, et les deux disclosures ouvertes sur un viewport de 820px, le footer Cancel / Save tombait **119px sous l'écran**, injoignable.
  - **Cocher quelqu'un ne re-render PAS le corps** : le dropdown est un multi-select, il se fermerait à chaque clic en emportant la requête de recherche. `refreshPeople()` ne redessine que la liste (`[data-share-people]`), plus le bouton et l'encart de conséquence. Le `×` d'une ligne fait pareil **et décoche la case correspondante** dans le dropdown, sinon les deux divergent. Changer l'accès général, si : c'est structurel (le picker apparaît ou s'en va), donc `renderBody()`.
  - **La liste `People with access`.** Le **propriétaire y est la première ligne**, marquée `Owner` — ⚠️ c'était un bloc étiqueté séparé sous la décision : « qui peut ouvrir ça » et « à qui c'est » sont une seule réponse d'une seule forme, et deux blocs laissaient le lecteur recoller les moitiés. La puce **`you` se pose sur la ligne qui est la mienne**, propriétaire ou destinataire (l'écran d'un manager liste un collègue en Owner et moi en `Can use`). Le `×` de retrait **garde sa place en permanence** et n'apparaît qu'en opacité au survol : une ligne qui pousse un contrôle au hover décale le nom sous le curseur.
  - **`General access` est le seul endroit où la couture FIXE ⇄ DYNAMIQUE se trace** (doc §5.1) : la liste au-dessus est un ensemble de visages nommés qu'on peut compter, ceci est une règle qui **suit** l'org. C'est un `.ap-select` à deux options — `Invited people only` / `Everyone at {org}` — et la ligne sous lui dit la portée réelle (le compte, ou le compte social quand la fiche est liée à un profil).
  - **Le picker de transfert est un `.ap-select`** de la même famille, dans la disclosure. Un seul patron pour nommer un collègue dans ce dialogue.
  - **Règle générale : rien ne flotte EN FLUX dans cette modale.** Les trois dropdowns survolent le contenu au lieu de le pousser — c'est ce que fait un dropdown. Ce qui ne doit jamais arriver, c'est qu'un panneau s'ouvre en poussant la mise en page ou se fasse découper par le scroller.
  - **La phrase de rôle** (« They can read it and write with it. Only {you|Owner} can change what it says. ») se pose sous **le contrôle qui définit la portée** : la liste tant que l'accès est sur invitation, la ligne d'accès général dès que l'org entière est dedans — laissée sous une liste de trois alors que douze peuvent ouvrir, « they » nommerait les mauvaises personnes. ⚠️ Elle était répétée **mot pour mot dans deux cartes** et elle était **fausse** sur l'écran d'un manager, qui gouverne sans jamais pouvoir éditer ; d'où le nom du propriétaire plutôt que « you ».
  - **Save nomme le CHANGEMENT, pas l'état** — « Share with the org » / « Share with 3 people » / « Make it private », et **« Save » grisé** quand rien n'a bougé : un bouton désactivé qui annonce « Share with 2 people » sur une fiche déjà partagée avec exactement ces deux-là se lit comme une action qui a échoué.
  - **Pas d'autofocus au chargement** : ouvrir le picker d'emblée déplierait son panneau par-dessus le reste avant que le lecteur ait lu un mot. La liste de qui a accès est ce pour quoi ce dialogue existe — qu'elle se voie d'abord.

- **Suppression** — le confirm dit la conséquence quand d'autres en dépendent, au lieu de « will be removed ».
- **`/topics/settings`** — le select ne liste que `editableContexts()` : quelles sources tournent et à quelle cadence est le job du propriétaire.
- **La sidebar** — un chat dont le Playbook est hors de portée retombe sur la pastille grise et le bucket « No playbook » plutôt que d'afficher un nom qu'on ne peut pas ouvrir ; le compteur de nav compte le visible.

**Le chat dégradé** (§6.3 du brief). Perdre l'accès ne casse pas le chat, ça le **fige en lecture-écriture partielle** : les drafts déjà écrits restent enregistrables et programmables, rien de neuf ne se génère. Un seul prédicat, `revokedContextFor(session)`, et deux chemins y mènent — la session seedée `s-brightline`, et un manager qui repasse en personnel le Playbook d'un collègue pendant qu'on l'utilise.

- Un `.ap-status-card red` **prioritaire** sur drafts/ideas/grey dans la fente `.session__composer-status`, à la première personne : _« I can't write anything new here — this chat runs on X, and Y stopped sharing it. »_
- Composer : send `disabled`, textarea `readonly`, hint remplacé par la sortie (« pick a Playbook you have access to »), et `submitInput()` garde-fou en entrée.
- `attachedContext` passe par `canView` au dernier moment : le chat lit comme un chat **sans** Playbook attaché — ce qu'il est devenu — au lieu d'en nommer un qu'il ne peut pas ouvrir. `session.contextId` reste intact, sinon le bandeau n'aurait plus rien à nommer.
- Les actions de génération sont avalées par **un listener `click` en capture** sur `document` (liste `GENERATE_HOOKS`) qui toaste la raison en `variant: "error"`, et grisées par `body.playbook-revoked`. Sur `<body>` et pas sur la racine de la session : le panneau des drafts est du chrome de shell, **hors `#app`** — une classe sur la section laisserait chaque « Generate an image » du panneau parfaitement vivant. Un listener plutôt qu'un flag enfilé dans cinq renderers de cartes : les cartes restent ignorantes du partage, et la raison est **dite** au clic au lieu d'être avalée en silence.
- Choisir un Playbook accessible dans le picker est la sortie : `setHashQuery` refait tourner le handler (comme `startBatchChat`), sinon on laisserait un composer mort sous un picker vivant.

**Notification & historique.** Toute action d'un manager sur la fiche d'un autre toaste _« Sam Rivera will be notified »_ et ajoute une ligne au journal (`appendHistory`, deux appelants : le modal de partage et [`playbook.js`](../../src/screens/playbook.js)). Le journal est **sans versioning et sans diff** — qui, quoi (la phrase que l'appelant fournit), quand.

⚠️ **Il n'est plus rendu nulle part.** La section « Recent changes » du modal a été retirée (demande du 2026-09-15) : le store continue d'écrire la trace, `history` reste sur le Context et reste seedé, mais **aucune surface ne la lit**. C'est délibéré et pas un oubli — la trace est ce que la doc exige (§6.4), la montrer dans ce dialogue ne l'était pas. Si le besoin revient, elle se rebranche en un `renderLog()` ; ne pas supprimer le champ ni les appels en croyant nettoyer du mort.

**Ce qui n'est pas fait** (non-objectifs v1) : bibliothèque inter-orgs, versioning, fusion de doublons, rôle « co-éditeur », instrumentation des métriques. Plus deux parcours que la doc décrit et que le proto **n'ouvre volontairement pas** (tranché à l'audit du 2026-09-10) :

- **Le départ du propriétaire** (§7, lot L5) — « les playbooks partagés sont transférés au manager ». Aucun écran : le proto n'a pas d'état « a quitté l'org », et le transfert manuel (le modal) couvre déjà le geste. `memberName()` rend « a teammate » pour un id qui ne résout plus, ce qui suffit à ne pas casser une phrase.
- **La notification au partage** (§6.1.4, Q3 « Email ») — le proto ne toaste que les actions **manager** sur la fiche d'un autre (« Sam Rivera will be notified »), parce que c'est la seule dont le doc exige une trace. Il n'y a pas de centre de notifications où poser le reste, et en inventer un pour une ligne serait une surface entière hors sujet.

### Mock analysis ([`context-mock-analysis.js`](../../src/context-mock-analysis.js))

- `analyzeWebsite(url)` : URL contenant « agorapulse » → mock Agorapulse détaillé (5 audiences, voiceProfile, hooks, couleurs #212E44/#FF6726, 5 CTA links, 5 competitors réels) ; sinon → template SaaS générique éditable (3 competitors placeholders).
- `discoverCompetitors(url, { exclude })` : puise dans le même pool et ne renvoie que les inconnus.
- `suggestions.influencers` : trois comptes LinkedIn (Matt Navarra, Annie-Mai Hodge, Michael Stelzner) pour le mock Agorapulse, trois archétypes pour le template générique — versés directement dans la liste.
- `analyzeSocialProfiles(ids)` / `analyzeDocument(file)` : voice/summary simulés.

---

## 10. Onboarding (First-Time User « ALT »)

Fichiers : [`screens/welcome-alt.js`](../../src/screens/welcome-alt.js), [`screens/welcome-alt-recap.js`](../../src/screens/welcome-alt-recap.js), + `context-builder.js`.

- **`/welcome-alt`** (redirect) : ajoute `body.onboarding` (full-bleed, pas de sidebar/topbar), mint une session `welcome-alt-{ts}`, arme le handoff `pendingStartContextBuilder` (`flow:"alt"`, `prefilledUrl`), navigue dans la session. Chat 3 questions (URL → profil → documents optionnels ; +langue si `multilingualPlaybook`, **profil rendu optionnel — Skip — si `skipConnectProfiles`, et proposant alors de connecter un compte quand rien ne l'est** ; voir §14). L'ordre des étapes et leur numérotation sont dérivés d'une seule liste (`altSteps()` dans `context-builder.js`), donc ajouter ou retirer une étape renumérote les autres tout seul.
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

### `/` ([`screens/dashboard.js`](../../src/screens/dashboard.js)) — un redirect, et rien d'autre

**Un redirect pur** : first-time sans Playbook → `/welcome-alt` ; sinon → session la plus récente (ou `/session/new`). C'est le bon défaut pour un outil qu'on ouvre avec une tâche déjà en tête, et c'est le seul comportement de cette route.

Elle a rendu quelque chose, une fois : derrière le flag `frontPage`, `/` devenait une **front page** magazine remplie par le listening — une une, une grille de six, des puces de rubrique. C'est parti avec le magazine Topics sur lequel elle était construite (voir §17). Si une front page revient, elle revient **sur la donnée du Topic Feed**, pas comme second lecteur d'un second store.

### `/home` ([`screens/home.js`](../../src/screens/home.js)) — la home du **compte** (flag `playbookWorkspace`)

Là où `/` est la maison de la **marque** active (un redirect), celle-ci est la maison du **compte** : le niveau au-dessus des workspaces, atteint en cliquant le wordmark de la rail. Account scope — pas de rail, topbar réduite à « ‹ Back to <marque> » ([`ROUTES.md`](ROUTES.md) § Deux niveaux de chrome).

⚠️ **Ce n'est pas le retour de la front page** supprimée avec le magazine (§17) : celle-là était une page de ce qu'Archie **propose**, remplie par le listening, montée sur `/`. Celle-ci est une page de ce qu'on **possède** — ses Playbooks et ses chats. Aucun `topics-store` lu, aucun Topic rendu, et `/` reste un pur redirect.

**Le héro** — `h1` « What are we working on? » + « Pick a Playbook, tell me what you need, and I'll open a chat on it. » + une carte portant une textarea, un menu **Add**, le **picker de Playbook** (même `.ap-select` que le switcher de la rail, moins son footer) et **Send** orange. `Enter` envoie, `Shift+Enter` retourne à la ligne, Send est `disabled` tant que le champ est vide — **sans légende de clavier sous la carte** : celle du chat (§1) porte en plus le drop de fichier, que rien d'autre n'annonce là-bas ; ici elle ne restituait que la convention par défaut d'un composer, et elle s'intercalait entre la carte et les workflows, qui sont le second geste de la même phrase. **Choisir une marque ne déplace pas le scope** — seul Send le fait, c'est le commit explicite. **Aucun héro quand il n'y a aucun Playbook** : un composer mort au-dessus d'un picker vide est exactement le champ grisé que les six pickers in-flow ont valu d'être supprimés ; l'empty state de l'onglet porte le seul geste utile.

**Le menu Add** offre exactement ce que celui du composer offre — PDF, vidéo, URL, texte collé, top posts, un Topic, une source connectée — mais **il ne fait aucun intake** : uploads, traitement et rejeu sont par session, et cette page n'en a pas. Il **lance** : l'item bascule sur la marque choisie, crée le chat et fait voyager l'intention dans **un seul** handoff, `pendingHomeAdd`, que `session.js` dispatche vers les **mêmes fonctions** que le menu du composer appelle (`startTopPostsInline`, `startTopicPickerInline`, `openAddSourceModal`, `startPillFromKind`, `askConnector`). Trois flows, trois clés, auraient été trois lignes de la table des handoffs disant toutes « la home a demandé ». **À plat, sections + divider** : l'ADS n'a pas de dropdown imbriqué, donc le flyout « Connected sources ▸ » du composer n'est pas reproduit — les sources connectées sont une troisième section titrée. « Browse connectors » est l'exception qui ne crée pas de chat : une galerie est une page. Ce qui est déjà tapé **part avec** (les deux handoffs), sinon reprendre Add effacerait ce que le lecteur venait d'écrire.

**Envoyer** = `setActivePlaybook` → handoff `pendingHomePrompt` → `/session/new-<ts>?contextId=…&title=<phrase tronquée>` → `sendMessage` à l'arrivée. Le Playbook et le nom voyagent dans l'URL (convention d'`objective-flow`), seul le texte a besoin d'un pont, et le handoff est à usage unique — recharger l'URL ne re-poste rien.

**Les trois workflows** — les mêmes cartes que le héro du chat neuf, depuis le **même renderer** ([`components/starter-card.js`](../../src/components/starter-card.js), extrait de `session.js` pour ça : un objet rendu à deux endroits a un renderer et des hooks `data-*` que chaque hôte câble, comme `topic-card.js`). Elles sont ici pour la raison qu'elles sont dans le héro : le composer répond à « je sais ce que je veux dire », celles-ci à « j'ai une source / une vidéo / un post gagnant et je veux un batch » — et sur la home on choisit en plus la marque où ça atterrit. Seul le dispatch diffère : le chat lance le flow sur place, la home bascule de marque puis crée la session dont le flow a besoin (`pendingStartBatch` / `pendingStartClipStudio` pour les studios, qui lisent déjà `playbookForNewWork()` en démarrant ; `pendingHomeAdd` avec le kind `top-posts-studio` pour le board, qui vit dans un chat). Pleine largeur, contrairement à la colonne de 720px du héro, pour partager ses bords avec le tableau en dessous. **24px sous le composer**, le seul écart de la page : ni padding bas sur le héro, ni marge haute sur les workflows, ni légende entre les deux — les deux moitiés d'un même geste (« dis-le, ou pars d'une de ces trois »), même règle que la barre d'onglets où un calage à la main avait déséquilibré la bande.

**Deux onglets** DS (`.ap-tabs`), **tous les deux en `.ap-table`** (§9 pour le pourquoi), état dans l'URL (`?tab=chats|playbooks`) pour que le Back du navigateur passe de l'une à l'autre. **Chats est le premier et le défaut** : le sujet de la home est le travail ; le catalogue est ce qu'on ouvre pour basculer, créer ou gérer.

- **Chats** — **tous les chats, toutes marques** (`getSessions()` non scopé) en `.ap-table` : Chat · **Sources · Ideas · Drafts** · Playbook · Last activity. Les trois nombres disent jusqu'où le travail est allé (`getSources` / `getIdeas` / `getPosts`, par session) et ont **chacun leur en-tête de colonne** plutôt que trois icônes dans une cellule : un nombre a besoin de son nom en texte, et dans un tableau l'en-tête EST ce nom. Un zéro s'affiche, en gris atténué — une cellule vide dans une colonne de nombres se lit « inconnu », alors que « ce chat n'a rien produit » est un fait utile. ⚠️ Ce n'est pas l'inverse de la décision prise §9 sur l'onglet Playbooks, qui vient de PERDRE ses compteurs : personne ne choisit une marque au nombre d'audiences de sa fiche, mais « 3 sources · 5 idées · 2 drafts » est exactement ce qu'on cherche dans une liste de travail. La marque est **nommée en texte** (dot + nom), grise et « No Playbook » si la fiche est inaccessible. **Ordre : la récence, rien d'autre** — plus d'épinglés en tête ni de glyphe d'épingle : épingler est un geste qu'on fait à un chat DANS son workspace, donc la rail est où ça se trie et où ça se voit ; ici la seule colonne d'ordre visible est Last activity, et une liste triée sur un fait qu'elle n'affiche pas se lit comme arbitraire. Un clic **re-scope** — `setActivePlaybook` puis on ouvre — sinon le lecteur atterrit sur un chat que la rail à côté ne liste pas. Un chat sans Playbook s'ouvre sans toucher au scope : il vit partout par construction.

- **Playbooks** — le catalogue (§9) : chaque carte est une porte vers son workspace (bascule + chat neuf), le crayon garde la fiche.

La recherche est unique et filtre l'onglet actif — sur les chats, le nom **et** la marque, parce qu'une colonne visible doit être cherchable.

### Sidebar ([`sidebar.js`](../../src/components/sidebar.js))

- **Head** : wordmark « Archie » + badge **BETA**, toggle collapse. Le wordmark **ouvre `/home`** sous `playbookWorkspace` (la home du compte, ci-dessus) ; sans le flag il crée un chat, comme avant. `[data-sidebar-new]` partage ce handler et garde son rôle dans les deux modes.
- **Switcher de Playbook** (flag `playbookWorkspace`) : entre le head et la nav — le wordmark, c'est le produit ; ce contrôle, c'est la marque à laquelle appartient tout ce qui est en dessous. Un `.ap-select` DS (dot couleur + label inline « Playbook » + nom + chevron), les Playbooks visibles en options, un footer **All playbooks** (`ap-icon-stack`, → `/contexts` hors du shell) / **Create a playbook**. Ce footer est la **seule** porte vers le catalogue : c'est le seul contrôle qui annonce qu'il change de scope. Rail replié : les initiales de la marque dans un `.ap-avatar square size-24` — cliquer **rouvre la rail** (un scope illisible ne se change pas). Aucun Playbook (new-alt) : la ligne devient l'offre d'en créer un. Où mène un switch, selon la surface d'où il part : depuis un **chat**, sur le chat le plus récent de la marque choisie (ou un neuf) — via `/` ; depuis la **fiche de la marque active**, sur `/playbook/<nouvelle>` — la surface est « le Playbook de cette marque », pas cette marque-là, donc elle se re-pointe ; **ailleurs** (feed, réglages du feed, Insights — aucune marque dans l'URL), la page se repeint sur place (`subscribe` d'`active-playbook`).
- **Nav** : **New chat** (⇧⌘O), **Search…** (⌘K), puis **Playbooks**, **Connectors** (flag `connectors`) et **Topic Feed** (flag `topicFeed`, `ap-icon-antenna`) avec count badges. Sous `playbookWorkspace`, `workspaceNav()` remplace **Playbooks 8** par **Playbook** — singulier, sans compteur, → `/playbook/<actif>` : la fiche de la marque où l'on est. C'était la seule ligne d'une rail d'une marque dont la destination parlait des sept autres, et une seconde porte vers elles à côté du switcher. Aucun Playbook (new-alt) : pas de ligne du tout, le switcher rend déjà l'offre d'en créer un. Le count du Topic Feed est le nombre de Topics **à revoir** du feed du Playbook par défaut — c'est une notification, donc il compte ce qui attend une réponse (voir §17). Il n'y a **pas** de ligne Home : `/` est un redirect.
- **Recent** : groupés Pinned / Recent — **scopés au Playbook actif** sous `playbookWorkspace` (un chat sans Playbook reste visible partout : il n'est nulle part ailleurs ; et l'empty state dit « No chats in this playbook », pas « No chats yet »). L'option **Group by → Playbook** disparaît alors, une liste d'une seule marque n'ayant qu'un groupe. Un bouton filtre au-dessus de la liste ouvre **Group by** Aucun/Playbook/Date + **Sort by** Récence/Alphabétique — Pinned reste toujours en tête ; la préférence persiste (`archie-chat-organize`). Row = dot couleur playbook + titre + menu ⋮ (**Rename / Pin / Delete**). Delete → confirm + sweep de tous les stores per-session.
- **Footer** : bloc user, **Send feedback**, ⚙️ popmenu → Send feedback / Report a bug / Keyboard shortcuts (`?`) / **Admin menu** (voir §14).
- **Raccourcis globaux** : ⌘/Ctrl+B toggle sidebar, ⇧⌘O new chat, Esc ferme le menu. Collapse persisté (`archie-sidebar-collapsed`).

### Topbar ([`topbar.js`](../../src/components/topbar.js))

- **Gauche** : titre de route (session = **click-to-rename**). `/playbook/:id` → « ‹ Back to Playbooks » (workspace mode : rien sur la fiche active, « ‹ Back to all playbooks » sur celle d'une autre marque). `/home` et `/contexts` en account scope → « ‹ Back to <marque> ». Board repurpose → « ‹ Change profile ».
- **Droite** (sessions) : cluster pills **Sources / Ideas / Drafts** (toggle panneau, count badge, désactivé si count 0). Active = `stroked blue`.
- **Toggle « i »** status-card (flag `conversationStatusCard`).
- Touche **« ? »** → shortcut legend.

---

## 13. Panneau de droite — modes

Panneau glissant ([`right-panel.js`](../../src/components/right-panel.js)) qui overlay le workspace ; **resizable** (drag handle, min 380px, largeur calculée `(viewport − sidebar) / 2` — non persistée entre rechargements, voir [`SHELL-LAYOUT.md`](SHELL-LAYOUT.md)), URL-persisté via `?panel=<mode>` (drafts/ideas/sources), scopé session, Esc ferme.

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

### Feature flags ([`ff-catalog.js`](../../src/ff-catalog.js)) — le catalogue

| id                       | label                         | défaut  | Gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insightsHub`            | Insights hub (/insights)      | **OFF** | Toute la section **Insights**, route comprise (un `/insights` tapé rebondit sur `/`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `playbookWorkspace`      | Playbook as a workspace       | **OFF** | **Si le Playbook est un champ sur le travail, ou le niveau au-dessus.** ON : un switcher permanent sous le wordmark de la rail, une **home du compte** derrière le wordmark lui-même (`/home`, §12), et tout ce qui est en dessous du switcher est la marque active — la liste des chats, un chat neuf, le Topic Feed et son compteur, Insights, les drafts des studios. Les six pickers (composer, toolbar du feed, `/topics/settings`, batch, clips, repurpose) **disparaissent** — pas désactivés : un champ grisé qui répète ce que la rail affiche en permanence est du chrome à écarter, et à côté d'un contrôle vivant il se lit comme cassé. Le titre d'Insights redevient un titre. Là où une page cesserait de nommer sa marque, un contrôle **vivant** existant reprend le nom (le lien « Open the Playbook » de `/topics/settings` devient « Open Acme · Q2 marketing »). Un chat garde son propre Playbook, hérité à la naissance (§1, [`CONCEPTS.md`](CONCEPTS.md) §2). Pas de vue « All playbooks » ; `/contexts` reste non filtré, c'est le catalogue dans lequel le switcher choisit. Le court-circuit du flag vit dans [`active-playbook.js`](../../src/active-playbook.js) — `isWorkspaceMode()` / `playbookForNewWork()` / `scopeSessions()`. |
| `draftInlineEdit`        | Inline edit on draft posts    | **OFF** | Édition inline des post cards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `connectors`             | Connectors (live MCP sources) | **OFF** | Toute la feature connecteurs (gallery, modal, submenu, Live connectors, tab modal).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `conversationStatusCard` | Conversation status card      | **OFF** | Carte flottante + toggle « i ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `multilingualPlaybook`   | Multilingual Playbooks        | **OFF** | Playbooks multi-langues (voice par langue, étape langue du draft flow).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `topicFeed`              | Topic Feed (listening)        | **OFF** | Toute la feature **Topic Feed** (§17) : la route `/topics` + sa page `/topics/settings`, l'entrée de nav et sa marque d'unread, la liste « Fresh topics to review » du chat neuf, et l'entrée « Pick from the Topic Feed » du menu Add. Un deep-link périmé rebondit sur `/`. La donnée (feeds + Topics seedés) reste présente quand OFF, comme `multilingualPlaybook`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `playbookSharing`        | Playbook sharing (org-wide)   | **OFF** | **À qui appartient un Playbook** (§9bis). OFF (défaut) = un seul utilisateur implicite, tout est visible et éditable comme avant ; ON = chaque Playbook est **personnel**, **partagé à des gens nommés** ou **partagé à toute l'org**, lecture seule pour les autres, **gouvernance** manager (jamais le contenu), barrière profil, chat dégradé après perte d'accès, section **Your role** dans l'Admin. Les deux Playbooks de démo (`ctx-acme-devrel`, `ctx-orphan-brightline`) et le chat `s-brightline` ne sont seedés **que** sous ce flag — contrairement à `topics`, ce ne sont pas des champs qui roulent avec la donnée mais des objets entiers qui n'ont aucun sens sans propriétaire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

| `skipConnectProfiles` | Skip connecting profiles at setup | **OFF** | **Si connecter un compte est une obligation ou un choix.** OFF (défaut) = la création de Playbook impose de choisir le profil qui publiera, et les ~40 comptes de démo sont connectés d'entrée. ON = **rien n'est connecté au départ** (dans les deux user modes) et l'étape devient **optionnelle** : elle demande toujours — proposant de connecter un compte quand il n'y en a aucun, ou le pick de profil habituel sinon — mais elle porte un **Skip**, et le nombre d'étapes ne bouge pas. Skipper n'est pas un cul-de-sac : la demande revient là où elle est utile : les flows de chat qui draftent POUR un compte — draft depuis une idée, draft depuis des clips, repurpose (inline + studio) — remplacent leur étape « choisis un compte » par une **grille de cartes réseau** au même endroit — reprise du layout de l'écran _Add new social profiles_ de la prod (glyphe, nom, « Pages » / « Professional accounts ») — et reprennent là où ils en étaient une fois le dialogue du réseau confirmé ([`connect-profiles-flow.js`](../../src/connect-profiles-flow.js) + [`connect-account-modal.js`](../../src/components/connect-account-modal.js)). Les autres surfaces à profils (Clip Studio, Objectives, modale analyze-profiles) rendent simplement leur liste vide. **Le Skip de l'onboarding n'est pas silencieux** : il ouvre [`skip-connect-modal.js`](../../src/components/skip-connect-modal.js), qui rassure d'abord — un **trio de trois tuiles** (garantie en gras + un détail sur une ligne, séparées par du blanc et non posées sur un fond commun, qui se lirait comme un bandeau) : rien ne publie sans accord, Archie ne lit que le déjà-public, les comptes vivent dans Agorapulse et pas dans Archie (CONCEPTS §6). En rangée et non en pile, parce qu'une pile avait la même silhouette que la liste de cases en dessous, donc rien ne disait « lis ça, puis réponds à ça ». Puis il demande **pourquoi** en multi-select (pas d'accès / quelqu'un d'autre gère / veut voir Archie d'abord / pas envie de lier maintenant / réseau absent de la liste / autre + champ libre). ⚠️ **Répondre est obligatoire** — `Skip` reste désactivé jusqu'à une case cochée, contrairement à la raison optionnelle de `topic-ignore-modal` : ici c'est la seule chose que l'étape récupère, et l'utilisateur ne croise ce dialogue qu'une fois. Sortir reste libre (Back, Esc, backdrop, X) et **remet la grille de réseaux** au lieu de skipper — le péage est sur le skip, jamais sur la sortie. Les raisons partent dans `feedback-store` (`recordReasons`, clé `skip:connect-profiles`) et un toast accuse réception. Seule la branche « rien de connecté » est interceptée : skipper le _pick_ d'un profil déjà connecté est un autre geste. |

Persistés en `localStorage` (`archie-feature-flags`), lus via `isFlagOn()`. Voir aussi [`STORES.md`](STORES.md).

⚠️ **`imageStudioAutoBrief` et `imageStudioSetupFirst` ont été retirés du catalogue** en même temps que les deux dispositions qu'ils pilotaient (§7bis) : le studio options-first est désormais le seul, donc il ne reste rien à commuter. Un switch qui ne commute plus rien est du bruit dans l'Admin.

⚠️ **Cleanup 2026-09-04 — 5 flags retirés du catalogue** (ne pas les réintroduire comme toggles) :

- `playbookDefault` **supprimé** : l'étoile ★ set/unset default sur `/playbook/:id` n'existe plus (le flag, le wiring, le handler `toggleDefault`). La sélection interne du Playbook par défaut (`getDefaultContext` / `isDefault`) et le badge ★ sur les cards `/contexts` restent — ce n'était pas ce que le flag gérait.
- `statusActionSnackbars` **baké ON** : les snackbars de succès (« N drafts ready », « N ideas ready », source non-vidéo prête) se déclenchent toujours.
- `playbookColors` **baké ON** : les couleurs de Playbook s'affichent toujours ; la classe `body.hide-playbook-colors` et ses 5 règles CSS sont parties.
- `manyProfiles` **baké ON** : le set démo ~40 profils est toujours seedé, donc le picker de profil montre toujours sa recherche live.
- `playbookCompetitors` **baké ON** : la section **Competitors** du Playbook s'affiche toujours (panneau + rail + compteur `/contexts`).

Leurs branches OFF sont supprimées. Comme pour les flags Image Studio, un flag dont la décision est prise devient le comportement, pas une variante de plus.

⚠️ Le `NAV` de [`sidebar.js`](../../src/components/sidebar.js) accepte encore un `flag` en **liste** aussi bien qu'en string. Plus aucune ligne n'en a besoin — la seule qui en avait deux était Home (`frontPage` + `topics`), et les deux flags sont partis avec elle. La capacité reste : une ligne de nav qui survit à l'une de ses dépendances est pire qu'une ligne absente.

### User modes ([`user-mode.js`](../../src/user-mode.js))

`localStorage` `archie-user-mode` : **returning** (mocks peuplés, défaut) / **new-alt** (stores vides + onboarding first-time). `isNewUser()`.

---

## 15. Modals utilitaires

Tous via [`modal-coordinator.js`](../../src/modal-coordinator.js) (un overlay à la fois, focus restore, Esc/backdrop).

| Modal                                                                                                | Rôle                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search** ([`search-modal.js`](../../src/components/search-modal.js))                               | ⌘K → recherche de chats, nav clavier ↑/↓/Enter/Esc.                                                                                                                                                                                                                                                                                                                                                             |
| **Chat picker** ([`chat-picker-modal.js`](../../src/components/chat-picker-modal.js))                | _« Where should this draft go? »_ quand on drafte une idée sans session active.                                                                                                                                                                                                                                                                                                                                 |
| **Bug report** ([`bug-report-modal.js`](../../src/components/bug-report-modal.js))                   | _« Report a bug »_ : type chips, screenshot auto (html2canvas) ou upload, ~1.4 s → succès.                                                                                                                                                                                                                                                                                                                      |
| **Feedback** ([`feedback-modal.js`](../../src/components/feedback-modal.js))                         | _« Send feedback »_ : feature-area select + textarea, ~1.2 s → succès. Store [`feedback-store.js`](../../src/feedback-store.js).                                                                                                                                                                                                                                                                                |
| **Shortcut legend** ([`shortcut-legend.js`](../../src/components/shortcut-legend.js))                | Touche `?` : liste des raccourcis.                                                                                                                                                                                                                                                                                                                                                                              |
| **Confirm** ([`confirm-modal.js`](../../src/components/confirm-modal.js))                            | `alertdialog` réutilisable ; `danger` → confirm rouge + focus Cancel.                                                                                                                                                                                                                                                                                                                                           |
| **Rename** ([`rename-modal.js`](../../src/components/rename-modal.js))                               | Input pré-rempli, Save/Enter, Esc. Sidebar row / topbar / Playbook.                                                                                                                                                                                                                                                                                                                                             |
| **Share Playbook** ([`share-playbook-modal.js`](../../src/components/share-playbook-modal.js))       | Flag `playbookSharing` : la forme Notion / Slite — un champ « Add a teammate », la liste **People with access** (propriétaire en première ligne), le select **General access**, l'avertissement de conséquence en sortie de partage, puis derrière un filet le transfert de propriété (disclosure). Les trois portées du store se **dérivent** de ces deux contrôles, elles ne se choisissent plus. Voir §9bis. |
| **Analyze profiles** ([`analyze-profiles-modal.js`](../../src/components/analyze-profiles-modal.js)) | Sélection de profils sociaux pour l'analyse voice.                                                                                                                                                                                                                                                                                                                                                              |
| **Fill document** ([`fill-document-modal.js`](../../src/components/fill-document-modal.js))          | Dropzone + lien doc (Google Docs/Drive aware) pour nourrir la voice.                                                                                                                                                                                                                                                                                                                                            |
| **Save folder** ([`save-folder-modal.js`](../../src/components/save-folder-modal.js))                | Ranger un contenu dans un dossier ([`folders-store.js`](../../src/folders-store.js)).                                                                                                                                                                                                                                                                                                                           |

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

## 17. Topic Feed — la file du listening (flag `topicFeed`, défaut OFF)

Le seul endroit où **Archie propose** au lieu d'attendre. Le listening Agorapulse remonte des posts sociaux sur huit sources rattachées à un Playbook ; Archie en assemble un **Topic** : une accroche (le constat), une analyse écrite en deux sections, et les posts qui la fondent. `/topics` est la **file où on la trie**.

Porté depuis le fork `axel-van/rebel-racoon` (@ `dbfd9d3c`), après l'audit UX qui a motivé les corrections signalées ci-dessous. Fichiers : [`topics-catalog.js`](../../src/topics-catalog.js), [`topic-feeds-store.js`](../../src/topic-feeds-store.js), [`topics-store.js`](../../src/topics-store.js), [`topic-article.js`](../../src/topic-article.js), [`topic-flow.js`](../../src/topic-flow.js), [`screens/topics.js`](../../src/screens/topics.js), [`screens/topics-settings.js`](../../src/screens/topics-settings.js), [`components/topic-card.js`](../../src/components/topic-card.js), [`components/topic-picker-modal.js`](../../src/components/topic-picker-modal.js), [`components/topic-ignore-modal.js`](../../src/components/topic-ignore-modal.js), [`components/social-post-card.js`](../../src/components/social-post-card.js).

### ⚠️ Ce qui a été supprimé pour faire place

Le proto portait un **magazine** Topics : une une + une grille, transverse à tous les Playbooks, avec `ctx.topics` sur le Context, une front page sur `/` derrière `frontPage`, un rail de trois accroches dans le hero, et deux verbes (Start a chat / Dismiss). **Tout est parti** — 8 modules, 5 feuilles CSS, les flags `topics` et `frontPage`, la ligne de nav Home. Le fork avait laissé les deux features tourner côte à côte, deux entrées de nav avec la même antenne, deux stores, deux pages de réglages : intenable en démo.

C'est ce qui a libéré les noms canoniques (`/topics`, `topics-store.js`, `topic-card.js`, `topic-flow.js`), que le port a repris — au lieu d'installer le troisième vocabulaire `research` / `lane` / `brief` que le fork trimballait dans son code pendant que son UI disait Topic Feed / feed / Topic.

### L'invariant dont tout dépend

> Le **statut de revue** d'un Topic et ses **deux signaux d'attention** sont trois choses séparées.

`status` (`new` / `used` / `ignored`), `isTrending` et `isUpdated` sont trois champs. Ni signal n'est un quatrième statut, donc un Topic peut être **Used et trending** à la fois — et un signal ne **prime jamais** sur le filtre de statut : un Topic ignoré qui se met à monter reste caché. Comme section dépliable, « trending » devait outrepasser le filtre, ce qui faisait mentir le filtre.

Le **triage vit dans sa propre map**, pas écrit sur le Topic : un Topic est ce que le scan a rendu (côté serveur), une ligne de triage est ce que **cet** utilisateur en a fait. Les garder séparés est ce qui permet à un re-scan de remplacer un Topic sans écraser la réponse.

**Les deux signaux sont le composant STATUS du DS**, pas un sosie : `.ap-status` avec la tonalité et l'icône que [`topics-catalog.js`](../../src/topics-catalog.js) **déclarait déjà** par signal — `orange` pour Trending, `tagOrange` pour Updated. Le modificateur `no-dot` libère le slot de la pastille pour le glyphe du signal : une flèche vers le haut dit **qui monte** et un refresh dit **qui a été réécrit**, ce que la pastille neutre du composant ne peut pas dire. Fill, hauteur, rayon et typo viennent tous de `--comp-status-*` : zéro CSS propre pour la pilule.

⚠️ **C'étaient deux `<span>` faits main** (`trending-mark` / `updated-mark`, plus une feuille CSS entière) qui ignoraient le catalogue — `findAttentionSignal()` n'avait **aucun lecteur** jusqu'ici. La feuille est supprimée. Effet de bord : l'encre du label passe de la teinte du signal à `--comp-status-color`, donc du texte foncé sur un aplat teinté au lieu d'un texte orange — c'est le traitement du DS, et il contraste mieux. La couleur n'est toujours pas le seul signal : chacun porte son mot.

Un Topic **ignoré n'est jamais remonté par un signal, nulle part**. Cocher **Ignored** dans le filtre est le seul chemin de retour. La règle inverse — « une pointe n'est jamais masquée par le triage » — a été essayée et retirée : elle faisait d'Ignore une suggestion au lieu d'une réponse.

### Les deux stores

**`topic-feeds-store.js`** — un **feed par Playbook** : quelles sources écoutent, à quelle cadence, et quels sites la source Brand website lit. Global, comme `connectors-store` : un feed apparie un Playbook à des sources et tourne sur une cadence, bien avant qu'un chat existe pour tenir ce qu'il trouve.

**Pourquoi un store et pas un champ sur le Playbook** : le magazine gardait la même config en `ctx.topics`. Elle en sort pour la raison que donne [`CONCEPTS.md`](CONCEPTS.md) §1 — un Playbook est une **fiche**, chaque champ répond à « qui êtes-vous ? », alors que « quels feeds tournent et à quelle fréquence » répond à « quel job Archie doit-il lancer ». C'est opérationnel. Ça achète aussi `websites`, qui n'a nulle part où vivre sur un Context : le `websiteUrl` du Playbook est l'adresse canonique de la marque, ceci est la liste de scan d'**un** feed, qui peut ajouter un blog, un site de docs ou un domaine régional.

**Tout Playbook a un feed, et il écoute dès le premier jour.** `provisionMissingFeeds()` en crée un à la lecture, jamais au chargement du module (en mode `new-alt` les stores démarrent vides et les Playbooks arrivent plus tard). Une marque neuve ne tombe jamais sur un écran qui lui demande de configurer quelque chose avant que rien ne puisse arriver — et c'est aussi pourquoi rien ici ne peut **supprimer** un feed : la lecture suivante le reconstruirait.

**`topics-store.js`** — les Topics + le triage. `getTopicsForFeed` · `groupTopicsByAge` · `countToReview` · `countFresh` · `getFreshTopics` · `getTopicById` · `topicTitle` · `defaultFilters` / `narrowedGroupCount` · `markUsed` / `ignoreTopic` / `unignoreTopic`.

**Un signal ne vit que dans « Last 7 days ».** Trending et Updated sont des affirmations sur **maintenant**. Une carte portant l'une des deux sous un intertitre « il y a trois semaines » se contredit, et c'est l'intertitre qu'on croit. Les flags sont donc **effacés** au-delà du premier groupe d'âge dans `withTriage()`, pas laissés au seed : chaque lecture passe par cette fonction, donc le feed, la liste in-chat, le picker et tous les compteurs sont d'accord gratuitement, et aucun seed futur ne peut réintroduire la contradiction.

### Les huit sources ([`topics-catalog.js`](../../src/topics-catalog.js))

CONFIG, pas contenu : le fichier ship avec l'app et doit exister en mode `new-alt` aussi (une marque neuve voit les huit cartes sur la page de réglages). Même partage que `ff-catalog.js` vs `mocks.js`.

| id                      | Nom                   | `live` | `playbookAnchor` |
| ----------------------- | --------------------- | ------ | ---------------- |
| `competitor-posts`      | Competitors           | ✅     | `competitors`    |
| `influencer-posts`      | Influencers           | ✅     | `influencers`    |
| `brand-website`         | Brand website         | —      | `null`           |
| `brand-feedback`        | Brand feedbacks       | —      | `null`           |
| `competitor-monitoring` | Competitor monitoring | —      | `competitors`    |
| `industry-trends`       | Industry trends       | —      | `null`           |
| `global-trends`         | Global trends         | —      | `null`           |
| `internal-ideas`        | Internal team ideas   | —      | `null`           |

`accent` est une **clé sémantique, jamais un hex** → `.topic-badge--<accent>` ([`topic-badge.css`](../../styles/components/topic-badge.css), partagé par la carte, l'article et les cartes de réglages). `playbookAnchor` — jamais l'id — dit quelle section du Playbook alimente la source, donc la carte offre un deep-link sans hardcoder d'id ; `null` = le listening l'alimente directement.

⚠️ **`competitor-posts` et `influencer-posts` sont les seules `live`, et c'est porteur** : le filtre de source par défaut est dérivé de `LIVE_SOURCE_IDS`, donc un Topic seedé sur une source non-live serait filtré hors de son propre feed dès le premier paint. Les six autres sont déclarées pour la page de réglages, où leur switch est **désactivé** avec un tag « Coming soon » — un switch qui bascule et ne change rien est pire qu'un qui dit qu'il n'est pas prêt.

**Le registre est neutre, pas la 1ʳᵉ personne d'Archie.** Archie dit « je » partout où il vous **parle** : le thread, les toasts, les empty states. Ceci est de la copy de réglages, et la copy de réglages explique ce que le système fait quand personne ne regarde. À la 1ʳᵉ personne les mêmes phrases se lisent comme des promesses de conversation, ce qui est le mauvais registre pour un interrupteur qu'on règle une fois.

**Cadences** : Weekly / Monthly / Quarterly. **De la copy, jamais un timer** — un tick hebdomadaire ne partirait jamais dans une démo.

### Les deux `kind`, qui sont un ÉTAT parmi six

Un Topic est soit draftable maintenant (`ready`), soit un thème à garder (`later`). ⚠️ **Cet axe était la rangée d'onglets au-dessus de la liste ; il est maintenant l'état « For later »** — une ligne de filtre et une pastille, au même niveau que les cinq autres. Un `ready` ne porte rien : comme `To review`, il est l'absence de marque. Un seul vocabulaire, pas deux : le fork portait un `researchType` valant `ready-to-post` / `content-strategy` et le mappait sur des ids de segment `ready` / `later` au rendu — une couche de traduction dont le seul métier était de traduire un ancien nom.

**Deux corrections d'audit ici** :

- Son prédicat de segment lisait aussi un **pilier de contenu** : un Topic `content-strategy` déjà rattaché à un pilier comptait comme ready-to-draft. Les piliers ne font pas partie du port, donc la clause est partie et la règle est celle qu'elle voulait être — la classification du scan décide, rien d'autre ne déplace un Topic.
- Le **non-classé tombe dans `later`**, pas dans `ready`. C'est ce que dit la spec du fork (« Ready to draft revendiquerait une maturité que rien n'a gagnée ») et son code faisait l'inverse.

### La file (`/topics`, [`screens/topics.js`](../../src/screens/topics.js))

**Un Playbook à la fois, porté par `?pb=`.** Le fork avait introduit un scope global persisté (`active-playbook.js`) qui avait supprimé quatre pickers d'un coup — puis son switcher de rail a été garé et le module est resté source de vérité. Résultat : le select « Playbook » de l'entête du feed **ressemblait à un filtre de page et re-scopait l'app entière** (le compteur de la sidebar, le Playbook d'un chat neuf, le picker du composer) et le persistait en `localStorage`. `?pb=` dit la même chose, survit à un lien, et **s'arrête à cet écran**. La page de réglages lit le même param, donc le scope survit à l'aller comme au retour.

**Sous `playbookWorkspace` (§14), c'est la rail qui porte le scope et `?pb=` n'est plus lu du tout** — ni par le feed, ni par ses réglages, ni par le cog de la topbar (qui cesse d'en écrire un). Le select de la toolbar disparaît (il ne restait plus qu'à être la moitié désactivée de lui-même, à côté d'un bouton Filters vivant), et sur la page de réglages le lien « Open the Playbook » devient « Open <marque> » — le nom reste, porté par un contrôle qui fait encore quelque chose. Ce que le fork avait raté n'était pas le scope global, c'était le scope **caché** derrière un contrôle qui promettait un filtre de page ; un switcher permanent en tête de rail est l'autre moitié du marché.

#### La page est un LECTEUR

L'anatomie est celle d'un lecteur : une barre de scope en haut, une liste à gauche, un volet de lecture qui prend le reste, et **les deux colonnes défilent indépendamment**. Ce n'est pas cosmétique — c'est ce qui distingue un lecteur d'une page web à sidebar.

Le premier jet était une page : un seul scroller, aucune largeur maximum, et l'article en carte flottante collée en haut. Deux défauts :

- **Aucune largeur maximum.** Sur un écran large la liste s'étirait au-delà de 1500px pendant que le volet restait collé à son plancher de 440px. Exactement à l'envers.
- **Un seul scroller**, donc lire l'article faisait défiler la liste sous lui.

⚠️ **Le cadre appartient aux OBJETS, pas à la colonne qui les liste.** Un passage intermédiaire a fait le contraire : pour casser un effet « mur de cartes », le cadre est passé des cartes à la rangée qui les contient, avec un filet entre la liste et le volet. C'était le mauvais bout — **le mur venait des gaps et du poids, pas du fait que les cartes ont des bords** — et une surface unique de 1440px se lit comme une dalle qui n'appartient à aucune autre vue de l'app. Les cartes sont revenues, le volet est une carte à part, et la rangée ne fait plus que les espacer. Si une liste pèse trop : resserrer les gaps, alléger la graisse, clamper le texte — pas déshabiller les items.

**Largeur maximum : 1132px, ALIGNÉ À GAUCHE — et calculée en CSS, pas écrite.** `--topic-measure` (600px, ~68 caractères) et `--topic-list-max` (460px) sont déclarées sur `:root` dans [`styles/screens/topics.css`](../../styles/screens/topics.css) et tout l'écran est de l'arithmétique dessus : le cap vaut `list-max + gap + measure + 2× padding du volet`, le volet vaut `measure + 2× padding`, la liste prend le reste, l'article vaut `measure`. Change la mesure et la page suit.

Le reste va dans la marge de **droite** uniquement : les rangées démarrent au padding gauche de l'écran, là où le titre de la topbar est déjà posé — mesuré, les deux tombent sur 284. ⚠️ C'était centré pendant plusieurs commits et ça se lisait comme un défaut : le shell imprime « Topic Feed » collé au bord gauche pendant que la toolbar, les onglets et le lecteur flottaient ~240px plus loin, donc rien ne partageait de bord avec le chrome au-dessus. **Les deux écrans du Topic Feed ne centrent pas** — `/topics` ici et `/topics/settings` (voir §17.6), pour la même raison à chaque fois : le chrome de la topbar est collé à gauche, donc du contenu centré ne partage de bord avec rien. Le reste de l'app centre encore : `/contexts` et `/connectors` capent à 1280, ce qui est presque toute la largeur de contenu, donc leur décalage est petit. 1132 ne l'est pas.

⚠️ **Le cap précédent était un 1440 écrit à la main pendant que la mesure rendait 542px** (`62ch`, alors que le commentaire à côté disait 68ch). Les 412px de différence restaient en **vide blanc dans la carte de lecture** — 43 % du volet — et un nombre écrit à la main dérive de nouveau à la prochaine retouche de la mesure. Un cap sur une surface de lecture se **dérive** de ce qu'elle contient.

**Le volet est la moitié FIXE, la liste celle qui s'étire** — `flex: 0 1 calc(measure + 2× padding)` contre `flex: 1 1 0`. C'est l'inverse de ce qui était écrit ici, et l'inversion suit du cap : une fois la page capée, « une fenêtre plus large achète de la place de lecture » ne décrit plus rien, et la seule question qui reste est ce qu'une fenêtre plus **étroite** doit rabioter. Elle doit le prendre sur la file, jamais sur la prose. Au cap le reste vaut 460 — l'ancien plafond, retrouvé par le calcul au lieu d'être posé — et le **plancher de 340** parce qu'en dessous trois lignes de titre cessent d'être une ligne et se mettent à faire un paragraphe. (La base doit être `0`, pas `auto` : sur `auto` la liste part de la largeur de ses cartes, grossit au-delà du reste et écrase le volet — mesuré à liste 729 / volet 379, layout inversé.)

**Le volet épouse la hauteur de son article**, `align-self: flex-start` + `max-height: 100%`, et `pane-body` scrolle au-delà. Étiré, une analyse courte laissait une carte vide courir jusqu'en bas de la fenêtre — 479px de blanc mesurés à 1450px de haut. Seul le volet **vide** garde `align-self: stretch` : son unique métier est de tenir la colonne ouverte pour que la liste ne saute pas quand un article s'ouvre.

**LE BORD DE CARTE DU VOLET RENCONTRE CEUX DE LA LISTE.** Un bord de carte blanc franc contre une colonne de bords de carte blancs francs, c'est la ligne qu'un lecteur parcourt réellement, et l'un des deux flottant au-dessus des autres est la première chose qu'il remarque. Les deux colonnes démarrent au même y ; la première carte non, parce que le séparateur d'âge est une légende posée sur son groupe — comme celle d'un tableau. Donc le volet est inset de la boîte exacte de ce séparateur, `--topic-group-offset`, dérivée du line-height du label plus son écart à sa carte. Mesuré : delta 0.

⛔️ **Le séparateur doit rester la SEULE chose entre le haut du scrollport et son premier groupe.** Cet offset a dérivé deux fois, différemment, et ça vaut d'être su :

1. La rangée du compteur est passée **dans** la colonne comme en-tête fixe. Elle a ajouté 37px au-dessus des cartes dont l'offset ne savait rien : le bord du volet s'est retrouvé **44px trop haut et au niveau de rien**.
2. L'offset a alors été **supprimé** au profit d'une ligne partagée « haut de colonne ». Vrai au pixel, et **invisible** : la ligne partagée était le texte le plus discret de l'écran — le compteur venait justement d'être démoté — pendant que les bords de carte, les lignes fortes, étaient toujours décalés. Un alignement qu'on ne voit pas n'aligne rien.

Le compteur est donc une **rangée de page** (enfant direct de `.topics-view`), hors du split : le split ne contient plus que les deux lecteurs, et l'inset n'a qu'une chose à franchir. Tout nouvel élément au-dessus des groupes sort du split lui aussi, ou ajoute son terme au token.

⚠️ **Le compteur portait le type d'une accroche de carte** — `--sys-text-style-h4-*` en encre `default`, exactement `.topic-card__headline` en dessous. Le nombre qui décrit la liste concurrençait le contenu qu'il décrit. Il passe en caption encre `light` : de l'appareil. Il reste **non filtré** (il décrit le feed, pas la sélection) et disparaît pendant le scan et sur les deux culs-de-sac, où il n'y a rien à compter.

**LES DONNÉES DE SEED SONT RÉELLES.** Quatre Playbooks viennent de vrais exports d'écoute, portés du fork (`axel-van/rebel-racoon`) : **Agorapulse** (12 topics, le plus riche — 6 ready / 6 later, 9 avec `relevance`, tous avec des posts), **Alliance Jiu Jitsu Carlsbad** (10), **The Dwelling Company** (5) et **Noba Fashion** (4). `Acme · Q2 marketing` (21) reste écrit pour ce proto.

⚠️ **Juger cette feature sur des topics inventés ne marche pas — et c'est réparé.** Les 21 topics Acme n'avaient ni `relevance` ni `whyNow`, donc le bloc de faits ne rendait **rien** sur le Playbook par défaut, et comme leurs articles sont courts le coût vertical de l'en-tête restait invisible. Trois retours produit sur quatre venaient de là.

**Les 52 topics des cinq feeds portent maintenant les deux faits** (43 `relevance` et 39 `whyNow` ajoutés), écrits depuis le contenu de chaque Topic et l'`audience` de son Playbook — pas du remplissage : `relevance` dit **à qui c'est destiné et pourquoi ça compte pour eux**, `whyNow` dit **ce que le scan a vu** (volume, fenêtre, regroupement). Un `whyNow` honnête peut dire que le Topic est hors fenêtre (`br-16` : « gardé parce que la palette revient chaque automne, pas parce que le scan est frais »). N'importe quel Playbook est donc évaluable ; `?pb=ctx-agorapulse` reste le plus dense en posts cités.

⚠️ Le port initial avait relabellisé 12 topics Agorapulse sous un Playbook inventé (« Founder voice only ») : des données réelles sous une marque qui n'est pas la leur, et un doublon exact des originaux une fois ceux-ci importés. Les copies sont supprimées ; ce feed reste seedé mais vide, ce qui donne l'état « feed configuré, rien trouvé encore » à démontrer.

**Deux rangées de page, pas trois — la première appartient au shell.** Le motif d'en-tête maison en compte trois (titre, toolbar, tabs), mais `topbar.js` imprime déjà le nom de la route : l'écran dessine donc la **toolbar** et les **tabs**. La toolbar porte **deux groupes** : le cluster de portée — le select en label inline `Playbook │ …` collé à son cog de réglages, qui configure précisément l'écoute de ce Playbook — puis, après un écart plus large, Filters libellé avec son compteur inline.

⚠️ **Fusionner les deux rangées en une a été essayé et annulé.** L'argument était réel — chaque pixel au-dessus du lecteur est un pixel de prose à faire défiler, et la fusion valait 60px (en-tête 109 → 49) — mais ce n'était **pas** ce qui avait été demandé : le retour signalait le coût vertical, pas une refonte de la barre. Si le sujet revient, le gain est mesuré et la recette connue (la rangée porte le filet, et `.ap-tabs` doit être shrink-wrappé en `width: max-content` sinon les contrôles repassent à la ligne). Voir [`UI-PATTERNS.md`](UI-PATTERNS.md) § En-tête d'écran.

⚠️ **Une rangée de titre dessinée a été essayée et retirée.** Elle imprimait « Topic Feed » 40px sous une topbar imprimant « Topic Feed », sur une rangée qui ne portait rien d'autre que le cog, et le commentaire qui la défendait invoquait `/contexts` — « il dessine les deux, donc le doublon est la convention ». C'était une rationalisation : l'en-tête de `/contexts` porte un sous-titre chargé de données, une recherche et un CTA, donc son titre est un élément sur quatre. Un titre seul ne fait pas une rangée. Le document n'a désormais qu'un seul `<h1>`, celui de la topbar, ce qui est aussi le bon compte pour un lecteur d'écran.

**Le volet stacké se fait amener dans le champ de vision.** En dessous de 760px de contenu deux colonnes sont illisibles, donc le split s'empile et le scroll revient à la racine de l'écran. Ouvrir un article le fait alors défiler jusqu'à lui — arithmétique, pas `scrollIntoView()` : `nearest` refusait de bouger un volet presque aussi haut que le scrollport, et `smooth` perdait la course contre le repaint suivant.

⚠️ **Une seule `@container` query, et c'est une correction.** La réécriture en lecteur avait laissé l'ancien bloc du volet en place, donc **une seconde query à 852px** cohabitait avec la vivante à 760 — et étant plus bas dans le fichier, c'est elle qui gagnait. Entre 760 et 852px de contenu, le split passait en colonne mais la colonne de liste gardait son `flex-basis`, qui devient alors une **hauteur de 340px** : liste écrasée à 2,5 lignes avec son propre scroll, article coincé dessous. Un seul seuil désormais.

⚠️ **`overflow-y: auto` sur `.topics-view` est INCONDITIONNEL**, et pas posé dans la `@container` query. Une container query ne peut styler que les **descendants** de son conteneur, et le conteneur est `.topics-view__body` — un enfant de cet élément. Mise dans la query stacké, la règle avait l'air juste et ne faisait silencieusement rien : en dessous de 760px **rien ne défilait** et tout ce qui passait sous la ligne de flottaison était inatteignable.

**Une `@container` query, pas une media query** : la sidebar se replie et le panneau de droite recouvre, donc la largeur du viewport ne dit jamais la largeur du contenu.

#### Rien d'ouvert, et rien du tout

Le volet **rend un placeholder** au lieu de disparaître, pour que les deux colonnes gardent leurs largeurs et que la liste ne saute pas latéralement chaque fois qu'un article s'ouvre ou se ferme — la seule chose qu'un lecteur ne doit jamais faire.

En revanche, quand il n'y a **rien à lire du tout** — feed vide, filtre qui exclut tout — l'état prend **tout le lecteur** au lieu d'une colonne vide à côté d'un volet vide. Un lecteur sans rien dedans n'est pas un lecteur.

**L'attente, elle, GARDE le split et le dessine en fantômes.** Cinq cartes-fantômes dans la colonne, un article-fantôme à côté, tous dans les vrais cadres aux vraies largeurs (mesuré : 460 et 648, exactement ce que le contenu réel obtient) — donc rien ne saute quand le scan rend. La ligne de statut prend le créneau du séparateur d'âge (« Last 7 days »), le seul qui soit vraiment libre, et garde sa typo pour que le vrai séparateur ne redimensionne pas la rangée. Cinq cartes, pas « autant qu'il en arrive » : le compte est inconnu pendant le scan, et un squelette qui devine est un squelette qui ment.

⚠️ **C'était un `.ap-loader` et une ligne centrés dans le bloc pleine largeur** — un spinner de 12px seul dans ~1100×700 de blanc, suivi d'un lecteur à deux colonnes qui apparaissait autour de lui. Un squelette existe précisément pour empêcher ce saut : s'il ne pré-dessine pas la mise en page, c'est un spinner avec des étapes en plus. La différence avec les impasses est là — elles n'ont rien à pré-dessiner.

#### ⚠️ Vu / non vu : REMIS À PLUS TARD

Un second axe `seen` a été construit puis **retiré** — accusé de lecture sur la carte (bascule verte à gauche du kebab), compteur de non-vus et `Mark all as seen` dans l'en-tête de liste, `seen` dans la Map de triage. Rien de tout ça n'est en place. `git log -S countUnseen` rend l'ensemble.

Ce qui reste de cet épisode : l'en-tête de liste garde son **total** (`N topics`), et le fond `grey-05` de la carte reste accroché à `.is-triaged` — un Topic décidé est ce que ce feed a de plus proche d'un Topic lu, faute de reçu séparé.

La question qu'il faudra retrancher le jour où il revient : `status` dit ce qu'on a **décidé**, `seen` dirait si on a **regardé**. Les deux ne se recouvrent pas — un Topic peut être lu et toujours To review — mais deux axes de revue sur une même file demandent que l'un des deux soit clairement subordonné, sinon la file pose deux fois la même question.

#### Les six états, à un seul niveau

**Une seule espèce : le DS TAG** (`.ap-tag <tone>` + `> i` + `> span`), pas Status. ⚠️ Status était le mauvais frère : il n'a **pas** de créneau d'icône, donc le glyphe passait en fraude dans la place du point via `no-dot` — un modificateur dont le métier est de **retirer** le point, détourné pour le remplacer. Tag stylise `> i` et `> span` comme de vrais créneaux (glyphe 12px, libellé tronqué à 180px), porte une **bordure** en plus du fond donc une pastille a un bord, et livre les cinq teintes voulues. Toujours zéro CSS maison : hauteur, radius, padding et typo viennent de `--comp-tag-*`.

Conséquence, et c'est un correctif : **Tag n'a pas de modificateur `orange`**. Trending portait `orange` — la couleur d'action IA / spotlight que le primaire _Use in chat_ possède — sur une pastille **statique**. Il prend `tagOrange`, et Updated passe en `menthol`, froid contre le chaud de Trending, donc les deux signaux **diffèrent** au lieu de se lire comme deux nuances d'une même chose.

| État         | Teinte Tag  | Icône                   | Pastille |
| ------------ | ----------- | ----------------------- | -------- |
| To review    | —           | —                       | **non**  |
| Trending     | `tagOrange` | `ap-icon-arrow-up`      | oui      |
| Updated      | `menthol`   | `ap-icon-refresh`       | oui      |
| Already used | `green`     | `ap-icon-rounded-check` | oui      |
| For later    | `blue`      | `ap-icon-bookmark`      | oui      |
| Ignored      | `grey`      | `ap-icon-eye-off`       | oui      |

⚠️ **C'était trois niveaux pour un vocabulaire.** Trending et Updated étaient déjà des pastilles DS ; Already used et Ignored étaient des **icônes nues** en encre neutre avec un `title` ; For later n'était pas sur la carte du tout — c'était un **onglet entier**. Une pastille, une icône et un onglet pour ce qu'un lecteur pense comme une seule liste.

**Le modèle de données n'a PAS été aplati, et ne doit pas l'être.** `status` (la réponse du lecteur, dans la Map de triage), `kind` et `isTrending` / `isUpdated` (le scan) restent quatre champs séparés ; `topicStates(topic)` les dérive en une liste plate. C'est exactement ce qui permet à un Topic d'être **Already used ET Trending** et d'afficher les deux. Les fusionner laisserait un fait masquer l'autre et un re-scan écraser le triage — plus le contrat de tracking `AC-TRK-6`, qui reporte les trois indépendamment, tomberait.

**Trois teintes corrigées au passage** :

- `ignored` était `red` dans la config. L'arbitrage fermé de la feature dit l'inverse — ignorer ne détruit rien, cocher Ignored le ramène. La contradiction a survécu parce que **rien ne lisait le champ** : la carte dessinait une icône neutre. La lire la rend visible.
- `used` était `blue`, justifié par un « tag Ready-to-draft » vert dont le fond aurait collisionné. ⚠️ **Ce tag n'existe pas** — aucun tag vert Ready-to-draft n'est jamais rendu. Le motif était périmé, et le bleu était de toute façon la mauvaise couleur : c'est la couleur de **l'interactif** ici, donc une pastille bleue sur une carte cliquable se lit comme un contrôle. (Le vert `Already used` réapparaît d'ailleurs en chip dans le trigger « Marked as » du filtre, reprise exacte de la pastille de la carte.)
- `later` prend le bleu que `used` libère — info / neutre : garé, pas jugé.

⚠️ **Les onglets `.ap-tabs` sont supprimés** — et avant eux un segmented control, qui était le mauvais composant (le produit emploie des tabs partout où cette forme apparaît, et on ne voyait **qu'une** liste à la fois). Le port du segmented control dans `ds-patches.css` était déjà parti ; `git log -S renderTabs` rend la version à onglets, `git log -S ap-segmented-control` celle d'avant. L'axe `kind` (To review / For later) que les onglets portaient est redevenu un contrôle : le **multi-sélect « Topics »** du panneau de filtres (voir Les filtres), **vide au repos donc les deux voies s'affichent dans une seule liste**, à rétrécir à une voie si on veut.

#### Les filtres

Le **DS Filter dropdown**, porté de la même façon et pour la même raison : options **groupées derrière un déclencheur** → filter dropdown. **⚠️ Révision faite exprès, docs (`AC-SEG`, `AC-FILT`) réécrites en conséquence :** la liste plate à six états est partie (`git log -S renderStateSelect`), remplacée par **trois groupes**, chacun un champ.

- **Topics** — un `.ap-select` **multi-sélection** sur `kind`, **vide au repos** : les deux voies s'affichent ensemble dans une seule liste — **To review** (la voie active, `ready`) et **For later** (la voie parkée, `later`). Cocher une voie rétrécit à elle ; un Topic For later se distingue dans la liste mixte par son propre chip bleu « For later », pas par un changement de carte. C'est l'ancien axe à deux segments (`AC-SEG`), passé par un radio « un à la fois » (`git log -S renderKindRadio`) avant de devenir ce multi-sélect vide-par-défaut. Défaut : les deux.
- **Marked as** — un `.ap-select` multi-sélection sur les statuts **répondus** (Already used / Ignored), ajoutés **par-dessus** la base « To review » que chaque voie montre déjà. `new` n'est pas une ligne : c'est la base, montrée sans contrôle. **Already used coché au repos, Ignored non** — « pas celui-là » reste caché jusqu'à ce que le lecteur coche Ignored.
- **Sources** — un `.ap-select` multi-sélection sur la source d'écoute, les live cochables et le reste « Coming soon » désactivé.
- **⚠️ Trending et Updated ne sont PAS des lignes de filtre** — un signal est une affirmation sur le **maintenant**, pas une voie ; ils restent des **chips de carte**. Les sortir du filtre fait tomber la règle du Topic ignoré **gratuitement** : le prédicat ne lit jamais un signal, donc aucun ne peut remonter un Topic ignoré (`matchesFilters`). Un Topic ignoré ne s'affiche que si **Ignored** est coché dans Marked as — `AC-PICK-2b` / `AC-SIG-2` tiennent par construction, pas par une clause « décocher pour masquer » écrite à la main.
- **La sélection s'affiche en chips dans le trigger** de chaque multi-sélection, reprenant le vocabulaire vu ailleurs : la pilule `.ap-tag` de l'état pour Marked as (vert Already used, gris Ignored), le **badge de provenance** de la source pour Sources — jamais un chip bleu, le bleu est la couleur de l'interactif et un nom de source est une donnée statique.
- **⚠️ L'ouverture des selects est dans `view`** (`kindOpen` / `markedOpen` / `sourcesOpen`), pas laissée à `<details>` : cocher déclenche `change`, qui repeint le panneau, donc un `<details>` nativement ouvert se refermerait à chaque clic. Un seul ouvert à la fois ; le clic du `summary` est intercepté (`preventDefault`). Escape ferme le select ouvert **seul** (la chose la plus intérieure), puis le panneau, puis le volet.
- **⚠️ `.ap-select-dropdown` est `position: absolute`** : le contenu du panneau passe en `overflow: visible` (topics.css) pour que le select **du bas** (Sources) ne soit pas rogné par le scroller — trois groupes courts, le panneau ne scrolle jamais, un menu ouvert survole ce qui est sous le panneau (ce que montre la maquette).
- **Le badge compte les GROUPES rétrécis**, comparé au **défaut** — rien au repos, « 2 » veut dire deux groupes qui filtrent. La maquette montrait un « 3 » permanent ; on garde la convention maison (pas de badge au repos, `narrowedGroupCount`), commutable si le compte permanent est un jour voulu.
- **Reset filters** restaure exactement les défauts.
- Les sept sources non-live sont **désactivées avec un `.ap-tag grey mini` « Coming soon »** — jamais en bleu électrique, qui dans cette app est la couleur de ce sur quoi on peut agir, et une ligne désactivée est la seule chose du panneau sur laquelle on ne peut pas.

#### Groupes d'âge, pagination

Trois groupes, toujours dans cet ordre : **Last 7 days** (`≤ 7j`) / **Earlier this month** (`≤ 30j`) / **Earlier**, groupes vides masqués. Définis dans le store, à côté du parseur — le feed demande dans quel bucket tombe un Topic, il ne décide pas de ce que veut dire « 7 jours ».

`ageLabel` (« 2d ago ») est **la seule entrée d'âge** : le « 2d ago » de la carte et le groupe où elle tombe en dérivent tous deux, donc les deux ne peuvent pas se contredire. `topics-store.ageMinutes` est la couture à remplacer par de vrais horodatages.

**Dix par page.** La sentinelle de la dernière page charge la suivante à l'entrée dans le viewport, et il y a aussi un **Load more** explicite : les deux font exactement la même chose — une liste infinie sans bouton est inutilisable au clavier. `loadingMore` empêche un second chargement pendant qu'un est en vol.

**La position de scroll survit à toute action** : trier un Topic à mi-liste ne doit pas renvoyer le lecteur en haut. `paint()` restaure l'offset du scroller autour du repaint.

#### Les deux cartes, et le lu / non-lu ([`topic-card.js`](../../src/components/topic-card.js))

**Deux variantes, toutes deux des cartes** — même surface, même bordure, même rayon — plus la **ligne compacte** de la liste in-chat. Ce qui diffère est ce qui se passe quand on les touche : `--feed` peut être **celle qui est ouverte** à côté de la liste et raffermit alors sa bordure ; `--picker` ne peut pas, puisqu'un clic y choisit le Topic et que rien ne reste sélectionné assez longtemps pour être marqué.

La règle de base du composant ne porte **aucun** cadre, et ça reste délibéré : chaque déclaration de cadre vit sur une variante, parce qu'une `border` partagée est exactement ce qui a fait fuir le cadre d'une variante dans l'autre pendant la construction.

Le feed et le picker sortent **la même carte, partie pour partie** — même accroche, même badge, même âge, mêmes puces d'état, même résumé. Un lecteur qui sortait du feed ne doit pas se voir tendre un objet d'allure différente dans le picker.

- **L'ORDRE DE LA CARTE EST CELUI QUI GAGNE, et l'article s'y range.** La ligne meta (`source · âge · puces`), puis l'accroche, puis le résumé — et l'en-tête de l'article rend la ligne meta, puis l'accroche, puis ses verbes. Un objet, un ordre de lecture, qu'on regarde la porte ou qu'on soit dans la pièce (`AC-TITLE-2`).
  - **Pourquoi la carte et pas l'article** : c'est la forme qu'un lecteur rencontre en premier et qu'il rencontre douze fois, et sa ligne meta est le **chapeau éditorial** — la petite ligne qui dit où on est avant que le titre dise quoi. Ça met aussi la source et l'âge en haut du panneau plutôt que glissés sous un titre de 24px, et un lecteur qui trie une file d'écoute demande « qui, et depuis quand » autant que « quoi ».
  - ⚠️ **Ça a été construit dans l'autre sens d'abord** (`6777c2ad` : accroche en tête des deux), au motif que l'accroche est l'identité et que le chapeau est identique sur toutes les cartes tant que `competitor-posts` est la seule source live. Recalé — ne pas le reproposer.
  - Le kebab garde le coin haut-droit, sur la ligne meta. Sa gouttière est passée du corps de la carte à **cette seule ligne**, donc l'accroche et le résumé récupèrent toute la mesure — l'accroche est celle qui la voulait, puisqu'elle est le plus long texte de la carte et la seule qui clampe. Les puces s'arrêtent à la gouttière du kebab, pas au bord de la carte.
- **Les puces d'état viennent de `topic-article.js`** (`renderTopicStates`), pas d'ici. Elles étaient déclarées dans la carte et exportées par rien, ce qui est exactement pourquoi l'en-tête de l'article n'affichait **aucun** signal : on cliquait une carte marquée Trending et la page ouverte ne prononçait jamais le mot (`AC-TITLE-3`). Même argument que « un moteur d'article, trois hôtes », un cran plus bas.

- **La carte est une surface de lecture, pas un panneau de contrôle.** Le corps est **un seul bouton** couvrant toute la zone de texte, et il ouvre l'article. Les verbes vivent dans le footer de l'article, là où le lecteur vient de finir de lire ce qu'il décide — la forme précédente lui demandait de trancher sur deux lignes de résumé clampées.
- Le kebab est un **frère** du bouton, jamais dedans (un bouton dans un bouton est du HTML invalide, ce qui est aussi pourquoi tout ce qui est dans le corps est un `<span>`). Deux rangs seulement : **Use in chat**, puis **Ignore** ou **Un-ignore** — un seul créneau, deux directions, jamais les deux, parce que c'est une décision lue par les deux bouts.
- **Le glyphe de triage** est juste à droite de l'âge : la gauche de cette ligne, ce sont les faits du Topic, et son statut se lit comme l'un d'eux plutôt que comme une puce en concurrence avec les signaux. **`new` ne rend rien** — c'est l'absence de marque. Les deux autres enregistrent quelque chose que le lecteur **a fait** ; celui-là enregistre qu'il ne l'a pas fait, et une marque disant « rien n'est arrivé » est la seule chose qu'une marque ne peut pas dire. C'était aussi la valeur la plus fréquente : elle dépensait un glyphe sur presque chaque ligne pour ne rien transmettre.
- **Hover et sélection sont deux états distincts.** La convention carte de l'app, que `chat.css` énonce noir sur blanc : au survol un fond bleu clair + une bordure **bleu clair**, jamais du navy, jamais un contour dur, jamais d'élévation ajoutée. La carte dont l'article est ouvert garde ce lavis et **raffermit** sa bordure en `electric-blue-100`, exactement comme `.drafts-card.is-active`, donc les deux restent distinguables. ⛔️ **Jamais** de bordure gauche colorée sur la carte ouverte — règle catégorique, recalée plusieurs fois. Le fork ne donnait **aucun** hover à la carte de feed, donc un bouton pleine carte n'avait rien qui dise qu'il en était un.
- **Non-triée en gras, triée en poids normal.** `new` est le seul statut qui attend encore une réponse, donc tout le reste recule d'une graisse. C'est l'idiome lu/non-lu de n'importe quel client mail, et c'est l'autre moitié de la raison pour laquelle `new` ne rend **aucun** glyphe : la graisse de la ligne le dit déjà, et une marque disant « rien n'est arrivé » serait une seconde réponse à la même question. **La graisse seulement** — l'encre ne change pas, on ne hiérarchise jamais en descendant un texte dans un gris plus clair.
- **Le signal part au bout de la ligne meta** : c'est la seule chose de cette ligne qu'un lecteur ne peut pas savoir sans qu'on lui dise, et au bout c'est ce sur quoi l'œil finit. Les intertitres d'âge, eux, sont de **simples libellés** au-dessus de chaque groupe : ils ont été un bandeau collant le temps que la liste soit une surface continue, mais avec des cartes séparées un bandeau pleine largeur se lit comme un reste de la dalle.
- Aucun traitement de cadre pour une carte trending : le signal est porté **dans** la carte par la marque Trending, exactement comme Updated, donc les deux se lisent comme la même espèce de chose.

#### L'article — un seul moteur, trois hôtes ([`topic-article.js`](../../src/topic-article.js))

Le feed le montre à côté de la liste, le picker le montre dans sa dialog, la liste in-chat l'ouvre dans cette même dialog. Les trois appellent **les mêmes fonctions**, donc il y a exactement un article et aucun moyen que deux d'entre eux dérivent. Même forme que `playbook-view.js` et `connectors-view.js` : fonctions pures, aucun DOM, aucun listener.

Contenu : le titre (**le titre de l'article**, jamais l'accroche du scan — `topicTitle()` traite `headline` comme le repli d'un Topic dont l'article n'est pas écrit ; c'étaient deux phrases différentes sur le même sujet, donc une carte disait une chose et l'article qu'elle ouvrait en disait une autre), la provenance, au plus deux faits (**Relevance** / **Why now**), la prose dans ses deux sections, puis les **Contributing posts**.

**L'en-tête, c'est le haut de la carte.** La ligne de provenance **partie pour partie** celle de la carte — badge, source, `· âge`, puis les puces d'état — puis le titre, puis les verbes sur leur propre rang. Même ordre et même **place** que sur la carte : le chapeau en haut. Les puces ne sont **pas** poussées au bord droit ici, contrairement au feed : le panneau est une colonne unique et une puce seule collée à droite tout en haut se lirait comme un contrôle plutôt que comme le dernier fait d'une suite de faits. Et la ligne tient **la hauteur d'une puce** qu'il y en ait une ou non, sinon l'en-tête changerait de hauteur d'un Topic à l'autre — ce pour quoi les deux faits en sont sortis (mesuré : 144px sur les six Topics testés, avec ou sans puce).

- « Contributing posts », pas « Sources » : une Source dans cette app est quelque chose qu'on amène **dans** un chat, et ceux-là sont la preuve à partir de laquelle l'analyse a été écrite. Deux objets différents sous un mot sur le même écran.
- **⚠️ UN TOPIC `later` A SON ANALYSE. Ce qui lui manque, c'est d'être DRAFTABLE.** Le corps a longtemps **remplacé** la prose par « I haven't found enough to write a detailed version yet » — alors que la version détaillée était dans les données. **Les 18 Topics `later` portent une analyse finie** : 136 mots en moyenne, min 64, max 216, avec leurs propres sous-titres et leur titre. Le panneau affirmait quelque chose de faux et masquait du vrai contenu pour le faire.
  - La distinction réelle est la **draftabilité** — ce que dit la copie d'origine elle-même (« not enough content or assets around this topic to create a draft »). Donc l'analyse s'affiche, et une note sourdine **après** elle dit la chose vraie : « A theme worth keeping, not a draft yet — I don't have enough assets around it to write a post from. »
  - Contenu d'abord, ses limites ensuite : la note vient après la prose, pas à sa place.
- **LA SECTION EST REPLIÉE, toujours.** Un seul état de repos, quel que soit le `kind`. Le compteur annonce le total, donc replier **diffère** la preuve au lieu de la cacher.
  - ⚠️ **Les `later` s'ouvraient dépliés le temps d'un commit**, au motif qu'ils n'ont pas d'angle draftable donc que les posts **SONT** la matière. Mauvais arbitrage : un état de repos qui change selon un champ que le lecteur ne voit pas est une règle qu'il doit découvrir, et le panneau que ça protégeait n'est pas vide — un `later` montre toujours son titre, ses faits et son analyse complète (136 mots en moyenne) au-dessus de cette ligne. `8d8d0b4b` parlait de **remplacer** la prose par un placeholder faux, ce qui n'est pas la même chose que replier de la preuve derrière une disclosure libellée et comptée.
  - ⚠️ **Ça a remplacé un PLAFOND, volontairement.** La section montrait les deux premiers posts et mettait le reste derrière un second lien « N more posts ». Une section repliable **plus** ce lien font **deux disclosures imbriquées** pour une seule liste, et il fallait actionner les deux pour voir six posts. `POST_CAP`, `__more` et `__posts-rest` sont partis : on ouvre la section et tous les posts sont là.
  - **Pourquoi replier du tout** : l'article est une surface de lecture et ces cartes sont ce qu'il y a de plus lourd dessus — les seuls blocs portant un aplat, ~100px chacun — donc deux d'entre elles empilent 200px de gris sous l'analyse, qui est le livrable. Replié, le lecteur obtient la prose, puis l'appareil énoncé en une ligne, puis la preuve à la demande. Le même jugement qui a mis la trace derrière le kebab, un cran en dessous : la trace est méta, ceci est l'assise de l'argument, donc ça reste dans l'article.
  - **Ni `<details>`, ni l'accordéon du DS : une checkbox voisine.** Comme la trace avant elle, et pour la même raison — ce renderer est **pur** et a trois hôtes, dont aucun n'a d'endroit pour un booléen d'ouverture. Et `.ap-accordion` mettrait une **boîte encadrée** autour de blocs qui portent déjà un aplat : l'article garde exactement une espèce encadrée (les deux faits) et une espèce remplie (ces cartes), et un troisième dispositif disant « section » est ce pour quoi le filet au-dessus de ce titre a déjà été retiré. Il donnerait aussi 14/700 en encre foncée à l'en-tête, ce qui surclasserait le libellé d'appareil en 12/700 light du reste de l'article.
- **LA CARTE DE PREUVE EST CELLE DU PRODUIT.** Modelée sur `ap-mini-post` (`conversation/commons/frontend/libs/ui`), le composant avec lequel le vrai feed Listening rend chaque item — copiée, pas approximée. Trois parties dans son ordre : **top** (avatar · identité · date), **content** (le texte), **bottom** (l'engagement).
  - **Coquille** : blanc sur filet grey-10, 12px de padding, 12px entre les trois parties, `--ref-border-radius-md`. ⚠️ C'était un **aplat grey-05 sans bordure**, au nom de la règle du fond unique — le fond marquait « les mots de quelqu'un d'autre ». Cette règle a changé quand le brief d'Archie a pris le fond pêche : les deux se distinguent par la **teinte** maintenant, donc le contenu cité n'a plus besoin de posséder le gris, et coller au produit vaut mieux qu'inventer une seconde convention. Dans la vraie carte, grey-05 veut dire quelque chose de précis et différent : **SEEN**. Le proto n'a pas d'état vu, donc elle reste blanche.
  - **Le réseau est un BADGE SUR L'AVATAR** (`.ap-avatar-network`, une classe livrée que cette app n'utilisait pas), avatar 40px, badge 16px en bas à droite. ⚠️ C'était une icône de 20px flottant en haut à droite de la carte : c'est l'endroit où un lecteur du vrai produit ne la cherche pas, et ça couplait le réseau à la **carte** plutôt qu'à l'auteur.
  - **L'identité tient sur une ligne, la date sur la suivante** : `@handle` en `body-bold`, un **point de 4px** (grey-20, pas un glyphe « · » — un middot hérite l'espacement et la ligne de base de la police, qui dérivent entre le gras et le régulier de part et d'autre), puis le nom en régulier grey-80. La grille est celle de mini-post-top : `auto 4px 1fr`, pour que le séparateur ne puisse pas se comprimer. La date passe à 14px grey-80 sur sa propre ligne — c'était 12px partagés avec le nom du réseau, que le badge porte désormais.
  - **Pas de hover, pas d'élévation** : rien là-dedans n'est cliquable. Et toujours pas de boîte grise autour des cartes — voir ci-dessous.
  - **Deux choses du vrai composant ne sont PAS portées, faute de données** : le **sentiment** (0 des 99 posts seedés en porte un — `AC-POST-5/6/9`, ça a besoin de données avant d'avoir besoin d'UI) et le **surlignage des mots-clés**, que la vraie carte rend en `ap-tag mini` sur les termes matchés. Un Topic n'expose aucun terme matché.

  ⚠️ **Un panneau gris ENTOURANT des cartes blanches a été essayé et retiré** : il coûtait un niveau d'emboîtement entier — 24px de padding de corps, puis 16 de panneau, puis 16 de carte, donc le texte d'un post démarrait **32px plus profond que la prose qu'il soutient**. La preuve était indentée deux fois par rapport à l'argument. Sur les cartes, le gris tient en un niveau, les posts s'alignent sur le bord gauche de la prose, et la séparation se lit même plus franchement puisque aucune boîte intermédiaire ne la dilue. Rien n'imbrique d'élévation : tout est plat.

- **L'article a CINQ pas d'espace, pas un seul.** 2px du label à sa phrase, 8px d'un en-tête de section à ses cartes, 12px entre deux paragraphes **et entre deux posts cités**, 28px au-dessus d'un sous-titre — une section de l'analyse **commence** —, et 32px d'une bande à l'autre.
  - ⚠️ Les posts cités étaient à 8px et lus « tout tassés » : deux cartes de ~100px portant chacune 16px de padding, 8px entre elles font une longue dalle avec une couture. **Un écart entre deux blocs remplis doit dépasser leur padding pour exister.** 32 n'est pas arbitraire : dans le volet, en-tête → corps mesure déjà 16 (padding) + 1 (filet) + 16 (padding), donc la dialog, qui n'a pas de filet, obtient la même séparation **par l'espace seul**. C'est le corollaire de la règle du fond unique : aucun filet neuf, aucun aplat neuf.
  - **L'ÉCHELLE EST 24 / 16 / 14 / 12** — le constat en `h1` (24/32/700), les sous-titres d'analyse en `h3` (16/24/700), la prose en `body` (14/18/400), l'appareil en `caption-bold` (12/16/700, ink light). ⚠️ C'était 18 / 14 / 14 / 12 : le haut de l'échelle plafonnait à `h2`, donc les sous-titres n'avaient nulle part à aller que 14 — **la même taille que la prose qu'ils titrent**, séparés par la seule graisse. Tout se lisait plat, et le correctif n'a jamais été de retenir le sous-titre mais de donner au constat son propre cran. Le sous-titre garde ses 28px d'air au-dessus (16 de marge sur les 12 du gap) contre 12 entre deux paragraphes.
  - Le titre prend la **taille** de `h1` et garde l'**élément** `<h2>` : le document n'a qu'un seul `<h1>` et c'est celui de la topbar. Les text styles du DS nomment le **cran**, pas la balise.
  - « Contributing posts » est en `body-bold` (14/700) **ink par défaut**, un cran sous les sous-titres à 16 et un cran au-dessus des captions à 12. ⚠️ C'était `caption-bold` **light**, comme de l'appareil qui « nomme ce qui suit sans rien affirmer » — juste tant que c'était un libellé au-dessus de cartes visibles, faux dès que c'est aussi la **porte** vers elles : la seule rangée interactive de l'article ne peut pas être son texte le plus discret. Le hover passe en **bleu électrique**, ce à quoi cette couleur sert ici (liens et contrôles), et une seule déclaration couvre le chevron avec — un `ap-icon-*` est un masque peint depuis `currentColor`.
  - **⚠️ LE FILET AU-DESSUS EST DE RETOUR.** Il avait été essayé et retiré, au motif que « le changement de fond sur les cartes trace déjà la frontière ». Ce motif est mort le jour où la section s'est repliée par défaut : au repos il n'y a **aucune carte à l'écran**, donc rien ne la trace, et la rangée flottait sous le dernier paragraphe comme une légende plutôt que comme le bord d'une région. Cette fois le filet est le **seul** dispositif de la frontière, pas un second qui répète ce qu'un aplat disait déjà. 32px de gap de bande au-dessus, 24 en dessous — l'espace du haut appartient à l'analyse qui vient de finir.
  - ⚠️ **`15284825` a supprimé tout ce bloc de CSS par accident**, en même temps qu'il corrigeait les labels de faits : six classes que le renderer émet — `__body`, `__para`, `__subhead`, `__section`, `__section-head`, `__posts` — n'avaient plus **aucune règle nulle part**. `base.css` met la marge de tout `h*` et `p` à zéro, donc l'analyse tombait sur les défauts navigateur : quatre paragraphes collés, sous-titres au ~16px bold de l'UA, et « Contributing posts » du coup au même rang visuel qu'une section de l'argument d'Archie. Le livrable du panneau — une analyse de ~159 mots — était rendu en mur. Ne pas re-supprimer : rien là-dedans n'est décoratif.
- **DEUX TYPES D'OBJET PORTENT UN FOND, distingués par la TEINTE.** ⚠️ La règle disait « un seul », et c'étaient les posts cités — la seule chose qui ne soit pas la voix d'Archie. Elle tient toujours pour eux ; ce qui change, c'est que le **brief** d'Archie en porte un aussi, et que les deux se lisent par la couleur plutôt que par la présence :
  - **pêche** (`--ref-color-orange-10`) — la lecture d'Archie sur le Topic : Relevance et Why now, glyphes en `--ref-color-orange-150` (orange-100 est délavé sur ce fond et le glyphe doit tenir à 16px). Le libellé reste `caption-bold` en encre light : un libellé dé-emphasé au-dessus d'une valeur emphasée est tout l'intérêt de la paire.
  - **gris** (`--app-surface-subtle`) — les mots de quelqu'un d'autre, cités comme preuve.
  - L'orange est la couleur IA de cette app, donc la **seule** teinte qui veut dire « c'est Archie » — et la seule qui restait : le bleu est la couleur de l'interactif et ne peut pas teinter une donnée statique, le vert est Already used, `tagOrange` est Trending, `menthol` est Updated, le gris est Ignored et les posts, le rouge est destructif.
  - ⚠️ **Ça ÉLARGIT la règle de l'orange** de « actions IA / spotlight » à « la voix propre d'Archie ». Décision assumée, pas un oubli. Le primaire _Use in chat_ 40px au-dessus reste sans équivoque : aplat saturé, texte blanc, 40px de haut, contre un lavis. **Ce n'est pas une licence pour teinter d'autres données statiques en orange.**
  - Pas de bordure, pour la raison qui a fait retirer celle des cartes de post : là où un aplat marque une espèce, un contour par-dessus est un second dispositif qui dit la même chose. Pas d'ombre non plus — le volet est déjà une carte.
  - ⚠️ **Cinq choses ont porté un fond en même temps** : les deux faits, le placeholder, les cartes de preuve et la trace, tous sur `--app-surface-subtle`. Cinq gris de poids égal font une pile de dalles ; au test du flou, l'article n'avait plus aucune hiérarchie. Deux teintes qui veulent dire deux choses n'est pas cinq gris qui ne veulent rien dire.
- **Relevance et Why now sont la PREMIÈRE BANDE de l'article**, dans le scroller, **un bloc encadré chacun**. Ce sont les critères de **triage** — à qui c'est destiné, et pourquoi maintenant — donc ils viennent avant l'analyse : l'ordre de lecture est faits → analyse → preuve.
  - **Aplat pêche.** ⚠️ Les faits ont été un **contour** pendant trois commits, au nom de la règle du fond unique — visuellement pauvres : deux rectangles blancs cerclés d'un grey-10 quasi invisible, qui se lisaient comme des fieldsets vides. Voir la règle des deux fonds ci-dessus. Les **boîtes grises**, elles, restent recalées : c'est la teinte des posts cités. `git log -S app-border-soft -- styles/screens/topics.css` a la version encadrée.
  - Le cadre était **libre** : la trace l'a rendu en partant derrière le kebab. L'article garde donc exactement une espèce encadrée (le brief) et une espèce remplie (la preuve), et rien n'imbrique d'ombre — le volet est déjà une carte.
  - **Le label est AU-DESSUS de sa phrase**, jamais à côté. ⚠️ Une colonne de labels en `max-content` a été essayée et retirée : c'est un idiome de **champ de formulaire**, valable pour une valeur courte (une date, un statut) et intenable sur un paragraphe. Elle produisait une **colonne morte** — vide sur trois des quatre lignes de Relevance — et un **second bord de texte**, les phrases démarrant à 115px quand la prose démarrait à 0. Deux bords gauches dans un panneau, c'est la première chose que l'œil remarque. Empilé, la phrase récupère la mesure entière et le bord de la prose (mesuré : 598px et 793 pour les deux).
  - ⚠️ **Ils ont vécu dans l'en-tête FIXE, et la mesure a tranché.** L'argument était que des critères de triage appartiennent à l'identité et aux verbes qui agissent dessus, et qu'un en-tête fixe les garde en vue pendant que la prose défile. Le prix : 125px sans eux (16% du volet), **291 avec les deux (32%)** — et surtout une hauteur d'en-tête qui **variait selon les champs que ce Topic-là portait** (relevance 9 sur 52, why now 13), donc le scrollport se redimensionnait à chaque fois qu'on ouvrait le suivant. `15284825` a posé le chiffre et laissé la décision à qui décide ; elle est prise. Ce que le déplacement achète : un en-tête d'**une seule hauteur**, et la **parité des deux hôtes** — la dialog les faisait déjà défiler, puisqu'elle rend l'en-tête en ligne. Un placement, un comportement. Le correctif interdit ne change pas : **jamais** tronquer les phrases.
- **Le « pas encore assez » est UNE ligne sourdine**, à la place exacte de la prose. ⚠️ C'était un empty state complet — bloc encadré, centré, titre 24px, corps sur trois lignes — ce qui faisait de l'**absence** l'élément le plus fort de la carte. Une absence doit se lire comme une absence.
- **Les compteurs à zéro sont omis** sur les posts cités. Un zéro n'est pas une mesure, c'est l'absence de mesure — et trois zéros d'affilée sur un post calme se lisent comme un widget cassé. La carte de post garde son **fond seul**, sans bordure : sur une surface où le fond est devenu le seul marqueur du contenu cité, un contour par-dessus est un second dispositif qui dit la même chose.
- **Le pied du dialogue est `.ap-dialog-footer`**, frère du scroller — c'est la structure qui l'épingle au bord bas, sans `position: sticky` ni les quatre marges négatives qui reprenaient le padding du scroller. Ordre `[Close] [Ignore] [Use in chat]` : renvoi, secondaire, primaire, tout aligné à droite — la convention que `topic-ignore-modal.js` et neuf autres modales de ce repo suivent déjà. ⚠️ C'était un `.topic-picker__foot` fait main, avec les verbes à gauche et Close poussé à droite.
- **La TRACE N'EST PLUS DANS L'ARTICLE.** Elle est derrière le **kebab de l'en-tête** (`ap-icon-more`, le même contrôle que portent les cartes, donc rien de neuf à apprendre) — un item, `Topic history`, avec le nombre d'entrées en description.
  - Elle était la dernière bande, dans un accordéon DS replié. Deux problèmes : elle dépensait **l'unique boîte encadrée** d'une surface de lecture pour la seule chose qui ne fait pas partie de l'argument (l'ordre de lecture est faits → analyse → preuve → puis ce qui est arrivé au Topic : la trace est méta), et **38 des 50 Topics qui en ont une n'ont qu'UNE entrée** — donc la boîte, le titre et le compteur existaient pour différer une ligne de provenance. Derrière le kebab elle ne coûte rien avant d'être demandée, et le cadre qu'elle rend est celui que portent les deux faits.
  - **Un renderer, deux placements.** `renderTopicTrail()` est exporté ; le feed l'ouvre dans `topic-history-modal.js`, la dialog du picker **bascule dessus comme troisième vue** avec un « Back to the topic ». ⚠️ La dialog ne peut PAS ouvrir la modale : elle est l'overlay actif et `requestOpen` ferme l'overlay actif, donc une modale lancée de l'intérieur fermerait le picker en montant. Seul le placement diffère — le même partage que l'identité et les verbes.
  - ⚠️ **Escape doit être consommé en CAPTURE** par la modale. Le handler Escape du feed est aussi sur `document` et enregistré plus tard (au mount de l'écran, contre le boot pour la modale), donc il passe après en phase bubble : tout état qu'il pourrait tester (`body.has-modal`, l'`activeId` du coordinator, la classe `.open`) est déjà effacé quand il regarde, et une pression fermait la modale **et** l'article derrière. `stopPropagation()` en capture est la seule réponse indépendante de l'ordre. Le garde `has-modal` côté écran reste pour les modales qui ne consomment pas la touche (la dialog Ignore n'écoutait que son textarea).
  - **Le dépli est une checkbox voisine, pas un toggle JS.** `.ap-accordion.collapsed` est le mécanisme du DS et il attend une classe retournée en script — sauf que ce renderer est **pur** et a trois hôtes, dont aucun n'a d'endroit pour un booléen d'ouverture. La checkbox garde l'état dans le DOM, reste opérable au clavier, et ne coûte que deux règles host-scoped qui écrasent ce que `.collapsed` cache.
  - Les statuts d'une trace ne sont **pas** que des statuts de revue : elle porte aussi `updated` et `trending`, qui sont des signaux. D'où une table de libellés locale plutôt que `findReviewStatus`, qui ne connaît que les trois états de revue.
- **Aucune des deux lignes n'est teintée**, sous aucun signal. À qui s'adresse un Topic ne change pas parce que la pile a grossi ; et Why now a pris la teinte du signal — pêche pour un pic, menthol pour une réécriture — avant de partir avec tout le color-coding de l'article (`0196361b`). Peindre un pic en ton d'avertissement est la même erreur que peindre Ignore en rouge, et un bloc teinté à taille de corps se lit comme une alerte alors qu'aucun des deux n'en est une. La carte dit le signal, en mots. ⚠️ Ce paragraphe a décrit la teinte pendant plusieurs commits après sa suppression — aucune règle de ce genre n'existe.
- **Pas d'historique de version.** Un Topic mis à jour se lit comme sa version courante ; un lecteur qui décide quoi poster n'a pas besoin du brouillon qui précédait.
- **Deux verbes, les mêmes partout, dans l'ordre secondaire → primaire.** Donc **Ignore**, puis **Use in chat**. L'action affirmative est celle qu'on atteint en dernier, et dans le volet ce groupe est aligné à droite, donc « en dernier » veut aussi dire le plus près du bord où l'œil arrive. ⚠️ C'était l'inverse pendant un commit, ce qui mettait Ignore à la place que le primaire doit tenir.
  - **Use in chat** est `primary orange` dans l'article (volet et dialogue) et `secondary blue` sur la face d'une carte du hero. L'orange reste l'action IA / spotlight et il est gardé pour **le** primaire, celui de l'en-tête de l'article ; la carte du hero est une **seconde porte** vers le même chat, et le bleu est la couleur de l'interactif / de la navigation dans cette app. ⚠️ Ce bouton a été `secondary orange` le temps d'un commit — ça dépensait la couleur IA sur un point d'entrée de second rang.
  - **Ignore** est `stroked grey` et **pas** rouge : ignorer masque un Topic que cocher Ignored ramène, donc rien n'est détruit et le rouge signalerait un danger absent.
  - La sortie de l'hôte, quand il en a une, vient après et est poussée à droite. Le volet n'en a plus (voir ci-dessous) ; le pied du dialogue garde son `Close`.
- **Le volet ouvre sur l'EN-TÊTE DE L'OBJET, hors du scroller** — le titre, puis la source et l'âge, avec les deux verbes en face du méta. **Pas de Close** : un lecteur à deux volets ne ferme pas un message, il ouvre le suivant, et la liste est juste là — un bouton dépensait le meilleur emplacement de l'en-tête pour ce que la mise en page fait déjà. `Escape` ferme le volet (et d'abord le menu ou le panneau de filtres s'ils sont ouverts : Escape ferme ce qui s'est ouvert en dernier). C'est la forme d'un client mail, pour sa raison : les actions sont visibles pour un article court comme pour un long, elles ne chevauchent jamais la dernière ligne de prose, et le lecteur les retrouve **toujours au même endroit** au lieu d'à la fin de la quantité de texte que ce Topic avait. Être **hors du scroller** satisfait « rester atteignable pendant qu'on défile » absolument plutôt qu'approximativement — et le titre y gagne la même propriété, ce qui est le vrai bénéfice.

  ⚠️ **Une barre de verbes SEULE a été essayée et corrigée.** Les deux verbes plus un Close occupaient cette rangée pendant que le titre restait sous eux, dans le scroller : les actions n'avaient aucun sujet à l'écran, et défiler emportait la seule ligne qui nomme ce sur quoi elles agissent. L'identité et les verbes viennent tous deux de `topic-article.js` (`renderTopicHeader` / `renderTopicActions`) — le dialogue compose les mêmes pièces autrement, identité en ligne et verbes dans un pied collant contre son bord bas, ce qui est correct pour une modale qui a déjà sa croix. Seul le placement appartient à l'hôte.

  La sortie est en face du **titre**, pas à côté des verbes : elle ne fait rien **au** Topic, et la lire comme une troisième décision est exactement ce que la rangée unique invitait à faire. Le padding horizontal de l'en-tête est `md`, celui du corps aussi, donc le titre démarre au pixel où démarre la prose. ⚠️ Le fork dessinait un **liseré bleu électrique** sur ce bord ; c'est un simple filet, parce que le bleu électrique est la couleur de l'interactif et une bande décorative est la seule chose qu'il ne peut pas être.

#### Les deux verbes

- **Use in chat** ([`topic-flow.js`](../../src/topic-flow.js)) — `useTopicInChat()` marque le Topic **Used**, arme le handoff `pendingTopicChat` et navigue vers `/session/new-<ts>?contextId=…&title=<titre>` (les query params, parce que `session.js` les résout en mintant la session, donc le chat est lié et nommé **au premier paint** plutôt que renommé une frame plus tard). La marque tombe **avant** que le chat s'ouvre, et **en un seul endroit**, pour que les trois surfaces qui naviguent (carte du feed, article du feed, carte du hero) veuillent dire exactement la même chose. **Exception : le picker du composer** (« Pick from the Topic Feed ») est **inline** — il attache le Topic au chat courant sans naviguer, voir ci-dessous.
  **Pourquoi une source** : plutôt qu'inventer une surface d'aval, le Topic entre par le pipeline. Tout ce que l'app sait déjà faire — Extract ideas, Draft, Ask, le panneau Sources — s'allume tout seul, sans cas particulier nulle part. `attachTopicToChat()` est consommé au mount ; `intake-lifecycle` en fait la carte de source-intake du thread.
  **Ni message d'écho, ni picker de questions** : la carte nomme déjà le Topic et le composer est juste là.
- **Ignore** — ouvre [`topic-ignore-modal.js`](../../src/components/topic-ignore-modal.js) : « Why did this Topic miss the mark? », le titre cité, un champ **optionnel**, un infobox qui dit ce qu'ignorer implique. Le motif est la seule chose qu'un lecteur **dise** à Archie sur le listening, et c'est ce qui rend l'état Ignored lisible après coup — la carte le réimprime.
  ⚠️ Le fork portait une case **« Don't show this again »**, retirée : elle faisait d'Ignore un clic sans motif, ce qui contredit la promesse de la même feature (le motif est conservé et affiché) et fabriquait des Topics ignorés sans rien à imprimer. Le champ est optionnel à la place — la façon honnête de garder le frottement bas.
  Réversible : le toast offre **Undo** (`unignoreTopic`), qui repasse en `new` et **efface le motif** — la phrase tapée survivrait sinon sur un Topic qui n'est plus ignoré, invisible tant qu'elle dort et fausse dès que quelque chose la lit.

#### États

- **Scanning** — à la première arrivée seulement, jamais sur un lien vers un Topic (le lecteur venait pour une chose, un état de travail serait du théâtre entre lui et elle).
- **Rien trouvé encore** — le feed écoute et doit se lire comme tel, avec la cadence nommée et un chemin vers les réglages. Ne doit **jamais** se lire comme cassé ou éteint.
- **Filtres sans résultat** — c'est le fait du lecteur, donc la sortie est le chemin de retour (**Reset filters**), pas une réassurance. Deux phrases différentes, deux sorties différentes.
- **Aucun Playbook** — il n'y a rien à écouter pour.

### La page de réglages (`/topics/settings`, [`screens/topics-settings.js`](../../src/screens/topics-settings.js))

**Une page, pas un onglet.** Un onglet donne à la config le même poids que le feed, ce qui est faux pour ce qu'elle est : on règle ses sources une fois puis on lit des Topics pendant des mois.

Ce n'est **pas** le retour de la page Settings agrégée retirée quatre fois ici : la règle du projet autorise la config sur l'entité qui la possède **ou** sur une route scopée à une feature, et c'est le second cas. La donnée vit dans `topic-feeds-store`, clé par Playbook ; seule la surface est ici.

- **Chrome DS « settings »** — `--sys-settings-*` pour la coquille et les cartes, `-max-width-lg` (1200px) et deux colonnes. La prose reste plafonnée séparément, donc élargir la grille n'élargit jamais une ligne de texte. Passage à une colonne par **`@container` query**.
- **Une barre de scope labellisée** (deux `.ap-form-field`, le vrai **DS Select** en `<details>` — jamais un `<select>` natif nu), **puis une carte par source**. Empiler un bloc par Playbook ne passe pas l'échelle : à vingt Playbooks, 160 interrupteurs avec chacune des huit descriptions répétée vingt fois — et ce sont les descriptions, pas les interrupteurs, qui font exploser une telle page.
- **Une carte, pas une ligne**, parce qu'une carte peut porter les options de sa source. **Brand website** est la première à le prouver : elle porte sa **liste de sites éditable**. Une ligne neuve est DOM-only jusqu'à contenir une URL — `normalizeFeed` jette les entrées vides, donc un aller-retour par le store supprimerait la ligne que le lecteur vient de demander.
- **Une source pas encore live n'est plus une impasse.** Les six cartes `Coming soon` portent un lien **« Need this source? »** qui ouvre le dialogue de feedback avec la source pour **sujet** : « Industry trends isn't live yet. Tell me how you'd use it and it goes to the team building the next ones. » C'est la seule chose qu'un lecteur peut faire au sujet d'une source qu'il ne peut pas activer — sans ça, la carte est une impasse qui porte une étiquette.
  - ⚠️ **Pas un neuvième shell de modale.** `feedback-modal.js` accepte `open({ subject })`. Son select « Feature area » **est** un sélecteur de sujet : quand l'appelant connaît déjà le sujet, le dialogue y **répond** au lieu de le demander — champ masqué, valeur posée, titre et chapô qui nomment la source. `applySubject(null)` remet tout comme livré depuis un instantané pris à l'`init()` ; sans ce retour, le prochain « Send feedback » générique porterait le titre du dernier sujet.
- **Chaque source lie vers ce qu'elle lit** : les sources pilotées par les concurrents ou les influenceurs portent un `.ap-link` vers la section du Playbook qu'elles lisent. Seulement sur les cartes qui ont un endroit où envoyer — le fork mettait une rangée à flèche sur les huit, dont cinq qui ne lisent rien que le Playbook détient. **Influencers pointe vers la section Influencers** depuis qu'elle existe ; avant, elle ne pointait nulle part exprès, parce qu'envoyer vers Competitors aurait fait dire à la carte qu'elle lit vos concurrents.
- **OFF = la carte perd son fond** et laisse voir la page à travers (badge en grayscale, texte atténué), donc la grille dit d'un coup d'œil ce qui est vivant. **La bordure est identique dans les deux états** : l'état d'une carte va dans son contenu, jamais sur son cadre.
- **Commit direct**, aucune barre Save — un contrôle écrit via `updateFeed`, le store notifie, l'écran repaint, et le focus est **remis sur le switch** (sinon chaque bascule au clavier renvoie en haut de page). ⚠️ Le fork avait un footer **Cancel / Save changes** et des labels de section en **capitales** ; ni l'un ni l'autre ne revient.
- **Dire que les autres diffèrent** — _« 3 other Playbooks listen to different sources »_, parce qu'un-à-la-fois invite au « je croyais avoir réglé ça partout ».
- **Un seul Playbook à la fois**, scopé par `?pb=`, et seulement ceux qu'on peut **éditer** : quelles sources tournent est le job du propriétaire, pas la décision d'un lecteur d'un Playbook partagé.

⚠️ **Piège DS rencontré ici**, valable ailleurs : `.ap-select-not-found` porte un `display` qui bat `[hidden]` → masquer en `style.display` inline.

### Les deux surfaces in-chat

**« Fresh topics to review »** — dans le hero d'un chat neuf, **sous** les starters. Les Topics **à revoir** les plus frais du feed de **ce chat**, six au plus. Ordre : le trending le plus récent, puis l'updated, puis le plus récent du reste — la première carte est celle qui vaut le plus d'être traitée. Une **grille de cartes**, exactement la géométrie de `.starter-grid` juste au-dessus (3 colonnes, même `gap`, même cap à 1040, 2 colonnes sous 900px), donc les deux sections se lisent comme des sœurs.

⚠️ **C'était un panneau de lignes à filets AU-DESSUS des starters**, sur deux arguments qui n'ont pas tenu à l'usage : « proposals first, verbs second », et « six propositions en cartes pèseraient plus que les trois starters ». Six lignes pleine largeur mesuraient ~500px et poussaient **les trois cartes de workflow sous la ligne de flottaison** — la proposition enterrait donc les features qu'elle était censée introduire. En grille 3×2 elle coûte deux rangées au lieu de six, et le cadre du panneau est parti avec : une boîte bordée autour de cartes est le même emboîtement que le volet de lecture vient de perdre, et c'est ce qui faisait lire la section comme une liste.

- **Aucune puce Playbook par ligne.** Le fork en mettait une sur chacune des six lignes **et** sur chacune des trois cartes de workflow — sept copies identiques d'un nom que le composer, 40px au-dessus, énonce déjà. L'entête de section porte le scope une fois.
- **Aucun scroll imbriqué.** Le fork en faisait un scroller à hauteur fixe montrant 2,35 lignes dans une page qui scrolle déjà. Six lignes, toutes, et le pied mène au feed.
- **Le corps de la carte OUVRE l'article**, il ne choisit pas le Topic : lire vient avant décider. Mais la carte porte aussi **Use in chat en clair** sur sa face (`withUse`), parce qu'une carte posée à côté de trois cartes de workflow qu'on clique pour **démarrer** quelque chose doit être actionnable de la même façon. Deux portes, pas une : l'article pour qui doit lire, le verbe pour qui sait déjà. Le bouton est `secondary orange` (variante shippée par le DS : fond `orange-10`, encre `orange-100`), pas `stroked grey` — voir ci-dessous.

**LES DEUX SECTIONS DU HERO DOIVENT SE LIRE COMME DEUX TYPES.** Elles partagent la grille exprès, mais l'item diffère sur **cinq** leviers, aucun décoratif :

|              | Carte de workflow                      | Carte de Topic                |
| ------------ | -------------------------------------- | ----------------------------- |
| Fond         | teinté par tonalité (lavis `::before`) | blanc, plat                   |
| Titre        | `h2` (18px)                            | `h4` (14px)                   |
| Illustration | watermark 104px                        | aucune                        |
| Action       | lien **bleu** + flèche qui avance      | bouton **orange** teinté      |
| Nature       | une porte vers une feature             | du contenu qu'Archie a trouvé |

Les deux actions sont bleues — c'est la couleur de l'interactif ici — donc ce qui les distingue est la **forme** : un lien texte qui mène ailleurs contre un bouton teinté qui agit sur l'objet de la carte. ⚠️ Ce paragraphe a affirmé le contraire pendant un commit, quand le bouton était orange : la couleur ne fait plus partie des leviers.

⚠️ **Elles ne différaient que sur deux leviers, tous deux INVISIBLES AU REPOS.** `.starter-card::before` — le lavis teinté qui _est_ l'identité de ces cartes — était en `opacity: 0` et ne s'allumait qu'au hover, et le watermark était à `0.07`. Au repos : trois boîtes blanches au-dessus de six boîtes blanches, soit un mur de neuf. Le lavis est passé à `0.6` au repos (1 au hover) et le watermark à `0.10` (0.12 au hover) : c'est une **restauration** d'une intention déjà écrite, pas un ajout. Leçon réutilisable : une identité qui ne se voit qu'au survol n'est pas une identité.

⚠️ Reste un écart assumé : la carte de Topic mesure **187px contre 158** pour la carte de workflow — donc le type « dense » est encore le plus haut des deux. La densité par ligne est bien resserrée (`gap xxxs`, padding `xs sm xxs`), mais la carte porte une ligne de plus (méta + titre + résumé + action). Le fermer demanderait de clamper le résumé à une ligne, ce qui coûterait de l'information sur la seule surface où le Topic doit se vendre.

- Le total du pied est **tout Topic de moins d'une semaine quel que soit son statut**, donc la phrase décrit la semaine et pas une to-do : trier une ligne fait baisser N et laisse M où il est.
- Rendu à zéro condition satisfaite = **rien du tout**, donc un hero sans Topics est octet pour octet le hero que l'app a toujours eu. Vivant : `session.js` s'abonne au store et re-render l'aside **seulement si la liste est montée**. Changer le Playbook du composer **échange la liste** avec lui.

**« Pick from the Topic Feed »** — une rangée **plate** du menu Add du composer, pas un sous-menu (ADS ne ship pas de dropdown imbriqué, et c'est une destination, pas un set). **Un flux inline dans le chat courant**, la même forme que « Top performing posts » (`startTopicPickerInline`, [`topic-flow.js`](../../src/topic-flow.js)) : Archie poste une ligne, puis un **widget de tour** (`renderTopicsWidget`, [`topic-card.js`](../../src/components/topic-card.js)) liste en cartes radio les Topics **prêts à drafter** du feed du Playbook **du chat** (règle `getPickableTopics` : voie To review, pas ignorés, tout âge, déjà utilisés compris ; les six plus récents). Aucune étape avant la liste : un chat garde la marque dans laquelle il a été créé, donc rien à demander. **Sélection simple**, CTA **Use this topic** : le widget se fige, le Topic est marqué **Used** et attaché **à ce chat** comme source (le même `attachTopicToChat` que le handoff), puis Archie propose la suite en Quickpicker — **Extract ideas** (`appendExtractedIdeas`), **Draft a post** (extrait une idée puis `startIdeaDraft`), **Ask about it** (`askWhatToKnow`). Pas d'écho : le widget figé montre le choix et la carte d'intake nomme le Topic. Un deuxième choix du même Topic → toast, pas de doublon.

⚠️ **C'était une modale** : la dialog ouvrait sur une **liste** et une carte ouvrait l'article dedans, puis « Use in chat » **naviguait vers un nouveau chat** — le seul item du menu Add qui emmenait le lecteur loin du chat auquel il venait de demander d'ajouter. La vue liste est supprimée avec l'entrée (`git log -S renderListView`).

**Une dialog, deux vues : l'article et son historique.** [`topic-picker-modal.js`](../../src/components/topic-picker-modal.js) n'ouvre plus que sur l'**article** (une carte du hero, `openTopicArticle`) : header de modale (titre + provenance, le × par-dessus), corps en deux colonnes (analyse à gauche, panneau gris des Contributing posts à droite, pleine hauteur), footer (History à gauche, Ignore / Use in chat à droite). **History** bascule le corps sur le trail, avec un retour vers l'article. Il n'y a plus de vue liste (voir ci-dessus).

### Le compteur de la sidebar

La ligne **Topic Feed** (`ap-icon-antenna`) compte les Topics **à revoir** du feed du Playbook par défaut. C'est une notification, donc elle compte ce qui attend une réponse, pas tout ce que le feed tient. Scopée à un Playbook plutôt que sommée sur tous, parce que **le feed lui-même est scopé** : un compte couvrant quatre marques enverrait le lecteur sur un écran qui en montre une. Il n'y a pas de scope global à lire — délibérément.

### Le seed

**2 feeds, 33 Topics.** 19 des 52 du fork sont tombés : leur contenu appartient à des Playbooks que ce repo n'a pas (une académie de jiu-jitsu, un multimarque de mode belge, un constructeur de maisons modulaires), et porter quatre marques de démo est une décision à part. Les deux autres Playbooks reçoivent un feed **provisionné vide**, ce qui est ce qui rend l'état « rien trouvé encore » démontrable.

Deux corrections d'audit sur le seed :

- **Le feed d'atterrissage a ses deux segments.** Celui du fork était 21 ready / 0 later, donc le premier écran affichait un segment à zéro. Six des vingt-et-un sont des thèmes de catégorie plutôt que des observations draftables, répartis sur les trois groupes d'âge.
- **Il a un vrai étalement de statuts** — deux Used, deux Ignored avec la phrase qui explique pourquoi. Ignored est vide de sens sans son motif, et Used est ce qui prouve que le filtre par défaut garde votre propre travail trouvable.

---

## Voir aussi

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — le _comment_ technique
- [`ROUTES.md`](ROUTES.md) — route table + handoffs + URL state
- [`STORES.md`](STORES.md) — API par store
- [`UI-PATTERNS.md`](UI-PATTERNS.md) — usage concret du Design System
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire produit
