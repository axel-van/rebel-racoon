# Modèle conceptuel

> **La nature des objets du produit** — ce qu'ils sont, et surtout ce qu'ils ne sont pas.
>
> Trois docs se répondent : [`GLOSSARY.md`](GLOSSARY.md) fixe **les mots**, [`FEATURES.md`](FEATURES.md) décrit **les comportements**, celui-ci pose **les frontières**. Quand une question commence par « est-ce que ça va dans… », c'est ici qu'on répond.

---

## 1. Le Playbook

### Définition

Un **Playbook** est la **fiche d'identité d'un émetteur** — une marque, un produit, ou une personne — **et de son cadrage éditorial**.

C'est le `CLAUDE.md` d'une marque : le document qu'on donnerait à un rédacteur freelance avant sa première mission, pour qu'il écrive juste sans avoir à demander. Qui parle, à qui, pour obtenir quoi, avec quelle voix, sous quelle identité visuelle.

**Le critère qui résume tout** : le contenu d'un Playbook est **vrai avant le premier post et encore vrai après le centième**. Rien de ce qui s'y trouve ne dépend de ce qui a été produit.

### Ce qu'il contient

Cinq familles, détaillées champ par champ dans [`FEATURES.md` §9](FEATURES.md#9-playbooks) :

| Famille              | Répond à                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| **Identité**         | Qui est cette marque ? (nom, site, business summary, langue(s))                                           |
| **Audience & goals** | À qui je parle, quels problèmes ils ont, quel objectif je poursuis, quel CTA                              |
| **Voice & style**    | Comment ça sonne (hooks signature, closings, formatting, style visuel)                                    |
| **Brand identity**   | À quoi ça ressemble (logos, couleurs, typo, personnalité, images de réf., **look par défaut des images**) |
| **Competitors**      | Contre qui je me positionne                                                                               |

### Le test d'inclusion

Avant d'ajouter un champ ou une section, trois questions. **Une seule réponse « non » suffit à exclure.**

1. **Est-ce vrai indépendamment de tout contenu produit ?**
   Si la valeur change parce qu'un post a été écrit, lu ou publié → ce n'est pas de l'identité, c'est du **contenu** ou de la **métrique**.
2. **Est-ce que ça reste vrai sans que personne n'y touche ?**
   Si ça se périme tout seul avec le temps → c'est de la **donnée dynamique**. La fiche ne bouge que quand quelqu'un l'édite.
3. **Est-ce que ça répond « qui êtes-vous ? » — et pas « quel job Archie doit tourner ? »**
   Le second est de la **config opérationnelle**. Déclaratif sur l'entité, opérationnel sur la route qui possède la feature.

### Ce qui n'y entre jamais

| Exclu                          | Exemples                                                             | Vit à la place dans                                                                                           |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Le contenu produit**         | Sources, Ideas, Drafts, posts programmés, Topics                     | `sources-stream.js` (global), `library.js`, `posts-store.js`, `schedule-store.js`, `topics-store.js` (global) |
| **Les métriques & historique** | performance des posts, top posts, ce qui a marché                    | `top-posts-store.js`, et la prod côté Agorapulse                                                              |
| **La config opérationnelle**   | quelles sources d'écoute tournent, à quelle cadence, quoi surveiller | `topic-feeds-store.js`, édité sur `/topics/settings` ([`FEATURES.md`](FEATURES.md) §17)                       |

Les **comptes sociaux connectés** (`connectedSocials`, `selectedProfileId`) restent, eux, admissibles : ils disent sous quelle identité cette marque publie, ce qui est encore une réponse à « qui êtes-vous ? ».

Le **look par défaut des images** (`imageDefaults` : type d'image, style, usage des références) est admissible pour la même raison que `brandColors` — il dit à quoi la marque ressemble, il ne lance rien. Le test qui le sépare de la config de listening qui a **quitté** cette fiche : _est-ce que retirer le champ change ce qu'Archie fait **tout seul ou sur une cadence** ?_ Pour `enabledSourceIds`/`cadence`, oui. Pour un style preset, non : rien ne tourne, rien n'est allé chercher, la valeur n'est lue qu'à l'instant où un humain ouvre un studio. Et la section Brand livre **déjà** quatre lignes dont le seul consommateur est le générateur d'images ([`FEATURES.md` §9](FEATURES.md#9-playbooks) justifie la place du logo par ce que « le générateur d'images cuit dans les pixels ») : si « seul le générateur le lit » disqualifiait, ces quatre-là seraient déjà dehors. La ligne n'est pas _qui le lit_, c'est _ce que ça affirme_.

Ce qui reste **exclu**, et c'est ce qui tient la troisième question : la config **de run** — format, single/carousel, nombre de variations — qui répond à « quel job pour ce post ? ». Le `formatId` se dérive déjà du réseau du draft, une meilleure réponse qu'une préférence stockée. Un relecteur qui doute de cette ligne doit vérifier cette exclusion d'abord.

### Trois exceptions de stockage, assumées

La règle porte sur **ce que la fiche dit**, pas sur la forme de l'objet JS. Trois champs exclus de la fiche sont malgré tout stockés sur le Context :

- **La config du listening a QUITTÉ le Playbook.** Elle y a vécu, en `ctx.topics = { enabledSourceIds, cadence }`, avec l'argument que la donnée est **par Playbook** donc portée par l'entité. Elle est partie avec le magazine : « quelles sources écoutent et à quelle fréquence » répond à « quel job Archie doit-il lancer », pas à « qui êtes-vous ? ». Elle vit maintenant dans [`topic-feeds-store.js`](../../src/topic-feeds-store.js), clé par Playbook — la donnée reste par marque, seul son propriétaire a changé. C'est aussi ce qui a fait de la place à `websites` (la liste de scan d'un feed), qui n'a aucun sens sur une fiche : le `websiteUrl` du Playbook est l'adresse canonique de la marque.

- **`ownerId` / `scope` / `sharedWith` / `history`** (flag `playbookSharing`) — l'appartenance. (`selectedProfileId`, lui, était déjà admissible : il dit sous quelle identité cette marque publie. La barrière de partage le **lit**, elle ne l'a pas mis là.) « À qui est cette fiche et jusqu'où elle porte » ne répond pas à « qui êtes-vous ? » : c'est la troisième question du test d'inclusion qui la rejette, pas la première ni la deuxième. Comme `usedIn`, la donnée est portée par l'entité et **lue ailleurs** — la marque de propriété dans le chrome de la carte et du header, le reste dans le modal de partage. Le journal `history` est de la traçabilité pure, sans versioning ni diff — écrit, jamais rendu depuis que la section « Recent changes » du modal a été retirée (FEATURES §9bis).
  Corollaire : **le store ne filtre pas**. Qui peut faire quoi vit dans [`playbook-access.js`](../../src/playbook-access.js), pas dans `contexts-store`, parce qu'un chat qui a perdu l'accès doit encore pouvoir **nommer** la fiche qu'il a perdue.

**L'invariant** : aucun des trois ne doit jamais devenir une section du Playbook. Si un champ opérationnel finit rendu dans la fiche, c'est un défaut de conception, pas une évolution. Une section « Partage » serait exactement la grille d'interrupteurs déjà retirée pour Topics.

### Granularité — un émetteur × un cadrage

Un Playbook = **un émetteur** (marque, produit ou personne) **× un cadrage éditorial**. Les combinaisons sont des **fiches indépendantes**, sans hiérarchie ni héritage : pas de Playbook parent, pas de variante rattachée. Dupliquer (`duplicateContext`) puis diverger est le geste prévu.

Les seeds montrent les trois cas ([`mocks.js`](../../src/mocks.js)) :

| Playbook               | Émetteur         | Cadrage                                   |
| ---------------------- | ---------------- | ----------------------------------------- |
| `Acme · Q2 marketing`  | la marque Acme   | la campagne du trimestre                  |
| `Customer stories`     | la marque Acme   | un angle éditorial différent, même marque |
| `Founder voice only`   | une **personne** | sa voix propre, hors marque               |
| `Pawtrack · always-on` | une autre marque | le régime permanent                       |

Deux Playbooks pour Acme n'est donc **pas** une incohérence : même identité, cadrage éditorial distinct, deux fiches. Ce qu'un Playbook n'est jamais, c'est un dossier de campagne — la campagne est un cadrage, pas un contenant.

### Évolution — écrit par analyse, édité à la main

Un Playbook naît d'une **analyse** (le site, des posts, des documents) puis ne change **que par un geste explicite** :

- édition d'une section (une à la fois, Save/Cancel sur snapshot) ;
- **Re-analyze website**, derrière une confirmation ;
- ajout d'une proposition d'Archie que l'utilisateur accepte.

**Aucune écriture silencieuse.** Archie ne réécrit pas la fiche parce qu'il a « appris » quelque chose au fil des chats. Le seul motif de proposition existant l'illustre : un competitor découvert arrive avec `suggested: true`, hors du Playbook, dans un bac séparé — il n'en fait partie qu'après un clic. C'est le patron à reprendre pour toute future suggestion : **proposer à côté, jamais écrire dedans**.

Conséquence pour qui code : une feature qui aurait besoin de patcher un Playbook en arrière-plan doit passer par une proposition visible, ou ne pas toucher au Playbook.

Le partage ne fait pas exception : il change **qui peut lire la fiche**, jamais ce qu'elle dit. Un destinataire voit la fiche du propriétaire telle quelle, en lecture seule, et s'il veut la faire diverger il **duplique** — la copie est indépendante, sans lien « dupliqué depuis », exactement la granularité posée plus bas.

### Le nom dans le code

Le code, les stores et les IDs disent **`Context`** ; l'UI dit **`Playbook`**. C'est un héritage assumé, pas une nuance de sens — voir [`GLOSSARY.md` § Playbook = Context](GLOSSARY.md#playbook--context-vocabulary-leak).

---

## 2. La session — le lieu où le travail se fait

Une **session** (= chat = conversation) est un **fil continu avec Archie**. Pas une tâche, pas un livrable : une conversation qui dure, où l'on revient, et qui n'a pas de fin naturelle. C'est ce qui la distingue d'un dossier de campagne ou d'un ticket.

Deux conséquences de conception :

- **Rien n'y « expire ».** Ce qui est produit dans un chat reste dans ce chat. Une session ne se clôture pas, elle se retrouve — d'où le pin, le rename, le regroupement dans la sidebar.
- **Son Playbook est fixé à l'ouverture.** Un chat naît avec un Playbook et n'en change plus : le contrôle est un dropdown sur un chat neuf, un indicateur statique dès qu'il est actif ([`FEATURES.md`](FEATURES.md) §1). La cohérence de ce qu'on y produit est ainsi vraie **par construction** — pas besoin de se demander sous quelle marque tel draft a été écrit. Changer d'avis, c'est ouvrir un chat.

  **Derrière le flag `playbookWorkspace`, seule la question « qui choisit ? » change, pas la règle.** Le Playbook devient le niveau au-dessus (un switcher permanent en tête de la rail, cf. CLAUDE.md § The Playbook scope) : un chat neuf **hérite** du Playbook actif au lieu de le demander, et le dropdown du composer n'est plus rendu du tout — la rail nomme la marque, le répéter dans la toolbar serait la même phrase deux fois. Ce qu'un chat ne fait toujours pas, c'est changer de marque : changer de workspace ne réécrit aucun chat existant — c'est précisément pour ça qu'un switch depuis `/session/*` emmène sur un chat de la marque choisie plutôt que de re-scoper celui qu'on lisait.

Un chat **peut** vivre sans Playbook (Archie travaille alors sans cadrage), mais il ne peut pas en avoir deux.

---

## 3. À qui appartient quoi

**La règle : ce que l'utilisateur apporte ou produit dans un chat appartient à ce chat.** Sources, ideas, drafts. Le chat est le contenant du travail, pas une simple vue sur un stock commun.

Ce qui échappe à la règle, et pourquoi — trois familles seulement :

| Reste global   | Pourquoi                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Topics**     | Un Topic arrive sur une cadence, dans le feed d'un Playbook, **bien avant qu'un chat existe** pour l'accueillir. Son **triage** est global de la même façon : une réponse donnée sur le feed doit valoir dans le picker et dans la liste in-chat sans rechargement. |
| **Top posts**  | L'historique publié est un fait du compte, pas d'une conversation. Aucun chat ne peut le revendiquer.                                                                                                                                                               |
| **Connectors** | De l'infrastructure de compte : on connecte Notion une fois, ça sert partout.                                                                                                                                                                                       |

Le code applique déjà la règle : `sources-stream.js` tient un `Map(sessionId → Source[])` avec des subscribers par session et un `clearSession()`, `library.js` et `posts-store.js` de même. Seuls les **uploads** y sont globaux — un état transitoire d'avant-source, que la modale d'ajout lit comme un pool. Les Playbooks sont légitimement globaux eux aussi : ce sont des fiches réutilisables, pas du travail en cours.

**Le pool global d'ideas a été supprimé** (août 2026). `mocks.ideas` — une union plate des ideas de toutes les sessions — était importée en direct par le panneau de droite (tout son mode Ideas), par le resolver de repli de `draft-flow` et par les réponses mockées d'`assistant` ; `library.js` devait la tenir synchronisée par double écriture, précisément parce que ces trois-là court-circuitaient le store. Le panneau d'un chat listait donc les ideas des autres, et un chat neuf répondait sur du travail fait ailleurs.

Deux points de méthode que ce nettoyage a fixés, et qui resserviront :

- **`assistant.js` ne peut pas importer `library.js`** — `library` importe déjà `assistant`, l'inverse fermerait un cycle. La dépendance reste à sens unique : `library` **injecte** son lecteur (`setIdeasReader(getIdeas)`) au chargement.
- **La cascade de suppression appartient au store.** Le panneau découpait la liste à la main et tuait une idea dès qu'**une** de ses sources partait ; `removeIdeasForSources()` ne supprime que celles qui n'ont plus aucune source.

---

## 4. Le vocabulaire du contenu — quatre objets, un seul mot piégeux

« Post » désigne trois choses différentes dans le code. La ligne de partage est **la publication** :

| Terme           | Ce que c'est                                                      | Où                                                                |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Draft**       | Un post **non publié**, y compris programmé                       | [`posts-store.js`](../../src/posts-store.js), `post-card.js`      |
| **Post**        | Un post **publié**                                                | le terme général une fois que c'est parti                         |
| **Top post**    | **Mon** post publié qui a bien marché                             | [`top-posts-store.js`](../../src/top-posts-store.js)              |
| **Source post** | Le post **de quelqu'un d'autre**, cité comme preuve dans un Topic | [`social-post-card.js`](../../src/components/social-post-card.js) |

Un post programmé **reste un draft** : la Schedule ne publie pas, elle met en file.
Quand il faut parler des quatre à la fois, dire **« content »**, jamais « posts ».

> **« Brief » n'est pas un terme défini.** Le mot est générique et sert à plusieurs échelles (le résumé business d'un Playbook, la consigne d'une image dans l'Image Studio). Ne cherchez pas l'objet « Brief » : il n'existe pas. Ne construisez rien qui suppose qu'il n'y en a qu'un.

---

## 5. Les Studios — un atelier plein écran, pour un artefact

Un **Studio** (Image, Clip, Batch) est un **atelier plein écran dédié à UN artefact**. On y entre depuis un draft, on travaille une seule chose — une image, une vidéo — et on en ressort en la rattachant au draft.

Ce que ça implique, et qui n'est pas négociable :

- **Rien n'y survit qui ne soit commité.** Fermer sans valider ne laisse rien derrière. L'état du studio est de travail, pas de stockage — c'est pourquoi [`image-studio.js`](../../src/image-studio.js) est un `Map(key → state)` en mémoire, effacé à la sortie.
- **Un artefact à la fois.** Un studio qui gérerait une collection serait un écran, pas un atelier.
- **Il lit le Playbook, il ne l'écrit pas** : logos, couleurs, images de référence **et le look par défaut** viennent de la fiche ; un Playbook sans logo se répare dans le Playbook, pas ici. Changer le Type ou le Style **dans** le studio ne remonte jamais sur la fiche — c'est un choix pour ce post.

⚠️ **Collision de noms à connaître.** En prod côté Agorapulse, le produit lui-même s'appelle **Studio**. Règle : **« Studio » seul = le produit prod** ; **« Image Studio » / « Clip Studio » / « Batch Studio » = l'atelier**. Ne jamais écrire « le Studio » pour désigner un atelier.

---

## 6. La frontière Archie ↔ Agorapulse

**Archie est une surface DANS Agorapulse**, pas un outil autonome. Le proto tourne en standalone parce que c'est un proto — pas parce que le produit l'est.

Ça se voit aux endroits où le proto touche déjà le reste de la plateforme, et il faut les traiter comme des **points de contact**, pas comme des features d'Archie :

| Surface                 | Ce qu'elle est vraiment                                      |
| ----------------------- | ------------------------------------------------------------ |
| **Schedule / calendar** | La file de publication d'Agorapulse, vue depuis Archie       |
| **Folders**             | Le classement de contenu d'Agorapulse, où un draft est rangé |
| **Social accounts**     | Les comptes connectés du compte Agorapulse, pas d'Archie     |
| **Top posts**           | L'historique de performance mesuré par Agorapulse            |

Conséquence pratique : avant de construire une capacité de publication, de classement ou de mesure **dans** Archie, se demander si la plateforme ne la possède pas déjà. Le proto la simule pour rendre le flow lisible ; ce n'est pas une invitation à la posséder.

---

## 7. Les autres objets, et pourquoi ils ne sont pas dans le Playbook

Le pipeline canonique et les champs sont dans [`GLOSSARY.md`](GLOSSARY.md). Ici, seulement la frontière.

| Objet         | Ce que c'est                                                  | Pourquoi hors Playbook                                                                                                                 |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Session**   | Un fil continu avec Archie (§2)                               | C'est le lieu où un Playbook est **appliqué**. Une session cite un `contextId` ; elle ne le modifie pas.                               |
| **Source**    | Un input brut ingéré (PDF, URL, vidéo, réponse de connecteur) | Du contenu apporté dans un chat (§3). La fiche dit comment écrire, pas à partir de quoi.                                               |
| **Idea**      | Un insight extrait d'une source                               | Du contenu produit, par session.                                                                                                       |
| **Draft**     | Un post candidat pour un réseau                               | Du contenu produit. Il **lit** le Playbook (voix, CTA, marque) et ne lui rend rien.                                                    |
| **Schedule**  | Un draft posé dans le calendrier                              | Du contenu daté.                                                                                                                       |
| **Topic**     | Une analyse assemblée depuis le listening                     | Arrive tout seul sur une cadence : dynamique par nature. Appartient au **feed** d'un Playbook (`feedId`), jamais stocké dans la fiche. |
| **Connector** | Une source live interrogeable en MCP (Notion, Slite, …)       | De l'infrastructure de compte, partagée par tous les Playbooks. Se connecte une fois, sert partout.                                    |

**La règle de dépendance, dans un seul sens** : le contenu lit le Playbook, le Playbook n'apprend pas du contenu.

```
Playbook ──lu par──▶ Session ──▶ Source ──▶ Idea ──▶ Draft ──▶ Schedule
   ▲                                                              │
   └──────── seulement par édition explicite ─────────────────────┘
```

---

## 8. Checklist avant d'ajouter quelque chose au Playbook

1. Le **test d'inclusion** (§1) passe-t-il sur les trois questions ?
2. Est-ce une réponse à « qui êtes-vous ? » qu'un rédacteur externe aurait besoin de lire avant d'écrire ?
3. Est-ce que ça se met à jour **uniquement** par un geste de l'utilisateur ?
4. Si c'est de la config : la route qui possède la feature n'est-elle pas le bon endroit ? Trois pages de settings agrégées ont été tentées et reverties ici — voir [`CLAUDE.md`](../../CLAUDE.md) § _A settings surface must not aggregate_.

---

## Voir aussi

- [`GLOSSARY.md`](GLOSSARY.md) — le vocabulaire, l'ambiguïté Playbook ↔ Context
- [`FEATURES.md` §9](FEATURES.md#9-playbooks) — les sections, les champs, les flows d'édition
- [`STORES.md`](STORES.md) — comment ces concepts se matérialisent en stores
- [`../copy/copy-principles.md`](../copy/copy-principles.md) — comment en parler dans l'UI
