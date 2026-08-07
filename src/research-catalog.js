// Content Research sources catalog — what Archie watches inside one research lane.
//
// CONFIG, not content: it ships with the app and must exist in `new-alt` mode
// too (a brand-new user still sees all eight source cards on the research form).
// The briefs those sources produce are content and live in mocks.js, empty for a
// new user. Same split as ff-catalog.js (config) vs mocks.js (data).
//
// ── Why this is NOT topics-catalog.js ───────────────────────────────────────
// The two catalogues overlap by six source names and diverge on everything
// structural, so they stay separate files:
//
//   • Scope — Topics config is PER PLAYBOOK (`ctx.topics`), because /topics is
//     one stream across every Playbook. Content Research config is PER LANE, and
//     a lane is itself (Playbook × sources). Folding one into the other would
//     force a lane to inherit its Playbook's Topics toggles, which is exactly
//     the coupling lanes exist to break.
//   • Cadence — Topics ships Daily / Weekly / Monthly. The handoff specifies
//     Weekly / Monthly / Quarterly. Both are correct for their own surface, so
//     neither catalogue can own the other's list.
//   • Count — Content Research adds two sources Topics does not have: Internal
//     team ideas, which reads connected MCP tools rather than social listening,
//     and Brand website, which reads the Playbook's own site.
//
// Merging them was considered and rejected: it would have meant a shared list
// with per-surface exclusions and two cadence arrays, which is more branching
// than two flat files.
//
// `accent` is a SEMANTIC KEY, never a hex — the view maps it to the shared
// `.topic-badge--<accent>` class that resolves DS colour tokens. Reused rather
// than reinvented: topic-badge is already the source-tile primitive on three
// surfaces, and a source tile means the same thing here.
//
// `live` — false means the source is not built yet. Toggling it opens the
// "Need that source?" feedback modal and leaves the switch untouched, rather
// than pretending it works. Only competitor-posts is live.
//
// `playbookAnchor` — never the id — says which Playbook section a source reads,
// so the card can offer "Edit my competitors in the Playbook" without
// hardcoding a source id. null = Agorapulse listening feeds it directly and the
// Playbook has nothing to do with it.
//
// `howItWorks` is plain informative prose. It began life as a greyed-out
// read-only textarea; that read as a broken input, so it is now text. Do not
// reintroduce a disabled input here.
//
// Descriptions and howItWorks are written in Archie's first person ("I track…"),
// like every other piece of assistant copy in the app.

export const RESEARCH_SOURCES = Object.freeze([
  {
    id: "competitor-posts",
    name: "Competitor sources",
    icon: "ap-icon-megaphone",
    accent: "purple",
    live: true,
    playbookAnchor: "competitors",
    defaultEnabled: true,
    howItWorks:
      "I read every post your listed competitors publish, rank them by how far " +
      "they beat that account's own median engagement, and keep the ones that " +
      "actually outperformed. You get the format, the hook and the angle — plus " +
      "where your own strengths let you answer it differently.",
  },
  {
    id: "influencer-posts",
    name: "Influencer sources",
    icon: "ap-icon-star",
    accent: "red",
    live: false,
    // "influencers", not "competitors": the link opens the Playbook's own
    // Influencers section. Pointing it at Competitors was a stretch that made
    // the card claim this source reads your competitors, which isn't what it does.
    playbookAnchor: "influencers",
    defaultEnabled: true,
    howItWorks:
      "I follow the creators your audience already listens to and watch what " +
      "lands for them: the formats, the partnerships, the recurring themes. You " +
      "get collaboration angles and creative that has already proved itself with " +
      "the people you're trying to reach.",
  },
  {
    id: "brand-website",
    name: "Brand website",
    // NOT one of the web* glyphs. ap-icon-web / web-blogs / web-news are filled
    // multi-tone marks that ignore currentColor, so they render as a dark navy
    // blob inside the tinted badge while every sibling here is a line icon in its
    // accent colour. (ap-icon-web on global-trends below has the same problem —
    // pre-existing, not fixed here.) ap-icon-link takes the tint and says "a URL",
    // which is what this source is.
    icon: "ap-icon-link",
    accent: "soft-blue",
    live: false,
    playbookAnchor: null,
    defaultEnabled: true,
    // The only source whose subject is a VALUE the Playbook already holds, so the
    // card shows that value instead of just a description. `showsWebsite` is what
    // research-form.js keys the URL row on — a flag rather than an id check, so a
    // second value-carrying source wouldn't need the renderer touched again.
    showsWebsite: true,
    // Behaviour only, like every other source's copy. An earlier draft ended with
    // "it comes from your Playbook, so change it there and I follow" — true about
    // the model, but it tells the reader to do something the Playbook UI has no
    // field for. The site row above already states the provenance.
    howItWorks:
      "I scan your website regularly for content worth leveraging — new blog " +
      "posts, product launches, customer success stories — and turn what I find " +
      "into ideas you can post.",
  },
  {
    id: "brand-feedback",
    name: "Brand feedbacks",
    icon: "ap-icon-double-chat-bubbles",
    accent: "menthol",
    live: false,
    playbookAnchor: null,
    defaultEnabled: false,
    howItWorks:
      "I read what people say to and about you — comments, DMs, reviews — and " +
      "pull out the pain points and requests that keep coming back. I only raise " +
      "a theme once ten or more people have voiced it, and I tie it to a real " +
      "complaint so you can answer something specific.",
  },
  {
    id: "competitor-monitoring",
    name: "Competitor monitoring",
    icon: "ap-icon-antenna",
    accent: "electric-blue",
    live: false,
    playbookAnchor: "competitors",
    defaultEnabled: false,
    howItWorks:
      "I watch the complaints and unmet asks piling up under your competitors' " +
      "posts, and flag the openings where a strength of yours answers a need " +
      "they're leaving on the table.",
  },
  {
    id: "industry-trends",
    name: "Industry trends",
    icon: "ap-icon-line-graph",
    accent: "green",
    live: false,
    playbookAnchor: null,
    defaultEnabled: false,
    howItWorks:
      "I follow the conversations gaining momentum in your industry and surface " +
      "the ones that genuinely grew over the last 30 days — not the ones that " +
      "were always loud.",
  },
  {
    id: "global-trends",
    name: "Global trends",
    icon: "ap-icon-web",
    accent: "orange",
    live: false,
    playbookAnchor: null,
    defaultEnabled: false,
    howItWorks:
      "I scan the cultural, seasonal and news moments that touch your brand, and " +
      "suggest the timely angles with wide reach and low risk of landing badly.",
  },
  {
    id: "internal-ideas",
    name: "Internal team ideas",
    icon: "ap-icon-folder",
    accent: "soft-blue",
    live: false,
    playbookAnchor: null,
    defaultEnabled: false,
    // The only source that reads your own tools rather than social listening,
    // which is why it's the one card that lists connected MCP tools.
    tools: Object.freeze([
      { id: "notion", name: "Notion" },
      { id: "intercom", name: "Intercom" },
      { id: "gdrive", name: "Google Drive" },
    ]),
    howItWorks:
      "I read the docs and threads your team already writes — roadmaps, support " +
      "notes, launch briefs — and pull out the things worth saying publicly that " +
      "nobody got round to posting.",
  },
]);

/** The source ids switched on by default on a fresh lane. */
export const DEFAULT_ENABLED_IDS = Object.freeze(RESEARCH_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id));

/** Only these can actually be toggled; the rest open the feedback modal. */
export const LIVE_SOURCE_IDS = Object.freeze(RESEARCH_SOURCES.filter((s) => s.live).map((s) => s.id));

// Refresh cadences. Drives copy, never a timer — a weekly tick would never fire
// inside a demo session, so the recurring feel has to come from the data instead.
//
// Weekly / Monthly / Quarterly, per the handoff. Deliberately NOT the
// Daily / Weekly / Monthly that topics-catalog.js ships: less frequent scanning
// is the point here, because a lane aggregates rather than alerts.
export const CADENCES = Object.freeze([
  { id: "weekly", label: "Weekly", adverb: "weekly", every: "week" },
  { id: "monthly", label: "Monthly", adverb: "monthly", every: "month" },
  { id: "quarterly", label: "Quarterly", adverb: "quarterly", every: "quarter" },
]);

export const DEFAULT_CADENCE = "weekly";

/** The two research types a brief can carry — the feed's third filter group. */
export const RESEARCH_TYPES = Object.freeze([
  { id: "ready-to-post", label: "Ready to post" },
  { id: "competitive-intelligence", label: "Competitive intelligence" },
]);

/** Filter default: Ready to post only. Reset restores exactly this. */
export const DEFAULT_TYPE_IDS = Object.freeze(["ready-to-post"]);

// Review statuses. `id` is what Triage stores; `label` is the pill text.
//
// Trending is deliberately absent — it is an independent boolean on the brief,
// not a status. A brief can be Saved AND trending, or Ignored AND trending, so
// the two can never share one field.
export const REVIEW_STATUSES = Object.freeze([
  { id: "new", label: "New" },
  // "Saved for later", matching the card action that sets it — the short
  // "Saved" read as a different state from the button you had just pressed.
  { id: "saved", label: "Saved for later" },
  { id: "used", label: "Used" },
  { id: "ignored", label: "Ignored" },
]);

/** Filter default: New only. Reset restores exactly this. */
// Every status ticked. The feed used to open on New alone, which meant a topic
// you had saved or used vanished from the list the moment you triaged it — and
// that gap is what the attention notice existed to explain. Opening wide removes
// the premise: the list shows the lane, and the filter is something you narrow
// rather than something you have to widen before the list makes sense.
export const DEFAULT_STATUS_IDS = Object.freeze(REVIEW_STATUSES.map((s) => s.id));

export function findResearchSource(id) {
  return RESEARCH_SOURCES.find((s) => s.id === id) || null;
}

export function findCadence(id) {
  return CADENCES.find((c) => c.id === id) || null;
}

export function findReviewStatus(id) {
  return REVIEW_STATUSES.find((s) => s.id === id) || null;
}

export function isLiveSource(id) {
  return LIVE_SOURCE_IDS.includes(id);
}
