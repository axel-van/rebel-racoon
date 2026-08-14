export const FLAGS = Object.freeze([
  {
    id: "draftInlineEdit",
    label: "Inline edit on draft posts",
    default: false,
    hides:
      "Inline editing affordance + handler for draft post cards in the " +
      "right panel (introduit par le commit 1e3076e — feat(rpanel): " +
      "inline editing for draft posts).",
  },
  {
    id: "playbookDefault",
    label: "Default Playbook toggle",
    default: false,
    hides:
      "When OFF (default), hides the star button next to the Playbook name on " +
      "the /playbook detail page that sets/unsets it as the default Playbook. " +
      "The default-selection logic still works internally.",
  },
  {
    id: "connectors",
    label: "Connectors (live MCP sources)",
    default: false,
    hides:
      "When OFF (default), hides everything connectors-related: the " +
      "Connectors gallery (route /connectors + sidebar nav) and modal, the " +
      "composer Add → 'Connected sources' submenu, the Sources panel 'Live " +
      "connectors' group, the Settings → Connectors section, and the " +
      "Add-source modal's Connectors tab.",
  },
  {
    id: "conversationStatusCard",
    label: "Conversation status card",
    default: false,
    hides:
      "When OFF, hides the floating conversation status card (sources / " +
      "ideas / clips / drafts summary) entirely, including its 'i' toggle " +
      "button in the session topbar.",
  },
  {
    id: "statusActionSnackbars",
    label: "Action success snackbars",
    default: false,
    hides:
      "When OFF, suppress the success snackbars that now duplicate the " +
      "persistent composer status bar: 'N drafts ready to review', " +
      "'Drafted N posts from <source>', 'N ideas ready', and the non-video " +
      "source-ready toast ('<source> ready · N ideas'). The composer status " +
      "bar (and the in-progress / video-ready toasts) stay regardless.",
  },
  {
    id: "playbookColors",
    label: "Playbook colors",
    default: false,
    hides:
      "When OFF (default), hides the playbook color visuals everywhere: the " +
      "top stripe + palette dots on /contexts cards, the color dot on " +
      "sidebar conversation rows, and the color swatch picker in the " +
      "brief panel. When ON, the color coding is shown. Body gets " +
      "`hide-playbook-colors` while the flag is OFF.",
  },
  {
    id: "manyProfiles",
    label: "Many connected profiles (demo)",
    default: false,
    hides:
      "When ON, seeds a large, varied set of connected social profiles (~40 " +
      "across Facebook / Instagram / LinkedIn / X / TikTok / YouTube) so the " +
      "profile quickpicker's search field can be evaluated with a realistic " +
      "long list. When OFF (default), only the base connected accounts show " +
      "and the picker stays a short, unsearched list.",
  },
  {
    id: "multilingualPlaybook",
    label: "Multilingual Playbooks",
    default: false,
    hides:
      "When OFF (default), Playbooks are single-language: the Audience & goals " +
      "language row is a plain English-only picker, the Voice & style panel has " +
      "no per-language switcher, and the draft flow never asks which language to " +
      "write in. When ON, a Playbook holds several languages (languages[] / " +
      "primaryLanguage / voiceByLanguage), the Voice examples are authored per " +
      "language, and drafting asks the target language. Underlying multilingual " +
      "data is preserved either way — only the surfaces are gated.",
  },
  {
    id: "imageStudioV2",
    label: "Image Studio v2 (prompt at the bottom)",
    default: true,
    hides:
      "When ON (default), the draft image actions open the v2 redesign: a " +
      "full-width stage, the prompt as a composer pinned to the bottom, and " +
      "the settings in a panel of independent sections beside the image " +
      "(brand kit pinned open, then references, text in image, type, style, " +
      "format, output). In Edit mode that same composer becomes the AI " +
      "reprompt bar and carries the manual tools. When OFF, they open the " +
      "previous Image Studio instead: a settings rail on the left carrying " +
      "the prompt, a canvas on the right, a footer CTA, and a floating AI bar " +
      "in Edit mode. Both versions share the same state engine " +
      "(src/image-studio.js) so they behave identically — only the surface " +
      "differs.",
  },
  {
    id: "topics",
    label: "Topics (listening dossiers)",
    default: false,
    hides:
      "When OFF (default), hides everything Topics-related: the /topics feed " +
      "route + its sidebar nav row and unseen counter, the topic dossier " +
      "dialog, and the Topics section (sources + refresh cadence) on a " +
      "Playbook. The seeded dossiers and the per-Playbook config still ride " +
      "along in the data, like playbookCompetitors. When ON, Agorapulse " +
      "listening produces dossiers — a headline, a written analysis, and the " +
      "social posts behind it — from six sources tied to the Playbook's " +
      "competitors; each one can open a chat with itself attached, or be " +
      "dismissed.",
  },
  {
    id: "contentResearch",
    label: "Topic feeds",
    default: false,
    hides:
      "When OFF (default), hides everything Topic feeds: the /topic-feeds " +
      "routes (feed list, form, feed, trending page), its sidebar nav row, and " +
      "the composer Add → 'Pick from Topic feeds' picker. A stale deep link bounces " +
      "to /, like /topics. When ON, the user pairs a Playbook with sources into " +
      "a named INSPIRATION FEED, and Archie returns INSPIRATIONS — a headline, a " +
      "summary, a full write-up and the social posts behind it — each triaged " +
      "New / Saved / Used / Ignored. Topics whose volume runs above their own " +
      "baseline are additionally flagged Trending (an independent boolean, " +
      "never a status), surfaced by a notice plus a dedicated page. " +
      "\n\nNAMING: the UI says INSPIRATION FEEDS for the section and the list, and " +
      "INSPIRATION for each card. It said Content Ideas, then Idea streams; nothing " +
      "a user sees says either now. Everything underneath still says research / " +
      "brief / lane / topic — briefs-store, the brief-card module, data-brief-* " +
      "hooks, the /topic-feeds routes and the .topics-* CSS classes — the same " +
      "split as Playbook/Context. briefs-store could not be renamed regardless: " +
      "topics-store is a different feature. " +
      "\n\nTwo collisions are now settled rather than one. The `topics` flag below " +
      "owns a listening dossier, still called Topic, and no Topic-feeds " +
      "surface uses that word for anything a user sees. IDEA is likewise back to " +
      "naming one object: the pipeline's extracted Idea (Sources → Ideas → Drafts, " +
      "in the right panel). A card in a feed here is a Topic.",
  },
  {
    id: "contentStrategy",
    label: "Content strategy (pillars)",
    default: false,
    hides:
      "When OFF (default), hides everything Content-strategy: the " +
      "/content-strategy and /pillar/:id routes, the sidebar nav row and its " +
      "counter, the New-pillar dialog, and — on a Topic feed — the pillar mark " +
      "in a topic card's source row plus the 'Unlink from this pillar' row in " +
      "that card's menu. A stale deep link bounces to /, like /topics. The " +
      "seeded pillars ride along in the data either way. " +
      "\n\nWhen ON, a PILLAR is a theme the brand keeps coming back to: a " +
      "condensed context Archie carries into a chat, the assets you attach to " +
      "it, and the audit trail of every topic, chat and note that fed it. " +
      "\n\nTHE DECISION IT ENCODES: matching is TRUSTED and reviewed " +
      "AFTERWARDS. There is no approval queue and no pending state — Archie " +
      "files what matches, each row is stamped with when it arrived, and the " +
      "only verb is Remove (which re-condenses the context without it). Archie " +
      "also OPENS pillars on his own when topics keep landing outside every " +
      "existing one; those are labelled until someone opens them.",
  },
  {
    id: "playbookCompetitors",
    label: "Playbook competitors",
    default: false,
    hides:
      "When OFF (default), hides the Competitors section of a Playbook: its " +
      "panel + rail entry on /playbook and the onboarding recap, and the " +
      "competitor counter on /contexts cards. The discovered competitors " +
      "still ride along in the data (the website analysis pre-fills them) — " +
      "only the surfaces are gated, like multilingualPlaybook. When ON, the " +
      "section lists competitors (name, description, website, social " +
      "profiles, auto-extracted favicon), Archie can discover more from the " +
      "brand's market, and each one is editable in its own modal.",
  },
]);
