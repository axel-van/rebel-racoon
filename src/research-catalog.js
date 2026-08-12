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
    name: "Competitors",
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
    name: "Influencers",
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

// The types a brief can carry — the feed's third filter group, and the axis its
// two columns are built on.
//
// ── The LABELS renamed; the ids did not ────────────────────────────────────
//   content-strategy → "Ideas for later"
//   ready-to-post    → "Draft-ready"
//
// Ids stay because they are data, not copy: `researchType` is written on thirty
// seeded briefs, keys TYPE_TAG_COLOR below, and appears in the filter state the
// URL and localStorage carry. Renaming them buys nothing a reader can see and
// breaks all of that. This repo already runs that split deliberately elsewhere —
// Content Research is "Content Ideas" in the UI while the code still says
// research/brief (see CLAUDE.md) — so the pattern is the established one.
//
// The new labels say what the reader does next rather than what the topic is.
// "Draft-ready" is a state of readiness, which is what the green tag claims;
// "Ideas for later" says the topic is worth keeping without implying the reader
// owes it a strategy document. The previous pair — "Ready to post" and "Content
// strategy" — described a workflow stage and a deliverable, and the second one
// collided with the Playbook's own Content Strategy section, a different object
// entirely.
//
// Historic note, still true of the ID: `content-strategy` is the listening
// export's `needs_strategy`, and it spent a while as `needs-assets` — naming the
// blocker rather than the decision.
export const RESEARCH_TYPES = Object.freeze([
  { id: "content-strategy", label: "Ideas for later" },
  { id: "ready-to-post", label: "Draft-ready" },
]);

/** Filter default: both types. There are only two, and both are worth reading. */
export const DEFAULT_TYPE_IDS = Object.freeze(["content-strategy", "ready-to-post"]);

// ── Both types carry a tag ──────────────────────────────────────────────────
// Every card is labelled. An earlier pass tagged only the exception and left
// postable topics bare, on the reasoning that you shouldn't mark the default
// case — but with two types and only two, the label is what tells you which
// action the footer will offer, and inferring it from an ABSENCE is a worse
// trade than one extra chip.
//
// Colour: green for postable, grey for not-yet. Green is the DS house rule for
// "a validated / approved object", which is exactly what Draft-ready claims.
// Grey is the neutral. Deliberately not orange and not blue — in this app those
// are action colours, and a category is not an action; not red, which means
// error.
//
// ⚠️ Both fills are shared with a status chip, and there is no way around it.
// The four status chips consume grey-10, tag-orange-20, green-10 and red-10, so
// `grey` matches New (#EAECEF) and `green` matches Used (#ECF7ED) exactly. The
// only tag colours outside that set are `blue` and `menthol`, and menthol was
// measured too pale to scan at tag size.
//
// It is accepted because the two things that must be told apart are the TWO TAGS
// — they occupy one position across a scanned list — and grey vs green is
// unmistakable. The status chip sits ~290px away at the other end of the row and
// differs in radius (24px vs 4px), case (UPPERCASE vs sentence) and size
// (11/800 vs 14/400). Region before colour; see UI-PATTERNS.md.
const TYPE_TAG_COLOR = Object.freeze({
  "content-strategy": "grey",
  "ready-to-post": "green",
});

export function typeTagColor(typeId) {
  return TYPE_TAG_COLOR[typeId] || "grey";
}

export function findResearchType(id) {
  return RESEARCH_TYPES.find((t) => t.id === id) || null;
}

// Review statuses. `id` is what Triage stores; `label` is the pill text.
//
// Trending is deliberately absent — it is an independent boolean on the brief,
// not a status. A brief can be Saved AND trending, or Ignored AND trending, so
// the two can never share one field.
// `icon` and `hint` were added when the card's status stopped being a pill and
// became a glyph. Both belong HERE rather than in the card: the feed's Filters
// panel shows the same pair, and two copies of "which icon means saved" would
// drift the first time one changed.
//
// THREE icons, not four — New deliberately has none. See the New entry below.
// Every icon that IS here is OUTLINE, deliberately: bookmark_fill and
// rounded-check_fill both exist and either would read as "more applied" on its own,
// but mixed weights in one set make the set look like two sets. Uniform stroke, and
// the tooltip carries the meaning.
//
// `hint` is a sentence, not a restatement of the label. A tooltip that says "Saved"
// over an icon labelled Saved is a tooltip that has told you nothing; each one says
// what the status MEANS for the topic.
//
// Both fields are OPTIONAL. Every consumer already skips a status without an icon
// (the card renders nothing, the Filters option row omits the glyph, the legend
// filters the list), so leaving them off is how a status opts out of the marker.
export const REVIEW_STATUSES = Object.freeze([
  {
    id: "new",
    label: "New",
    // No icon, and no hint to put in a tooltip — New is the ABSENCE of a marker.
    //
    // The other three statuses all record something the reader DID to the topic:
    // saved it, used it, ignored it. New records that they haven't, so there is no
    // event for a glyph to stand for. A marker meaning "nothing has happened" is
    // the one thing a marker cannot say, and it was the most common value in the
    // lane — so the feed spent a glyph on almost every row to convey nothing.
    //
    // Sparkles was tried and is what prompted this: it is the app's AI mark, and
    // every topic in the feed is Archie's, so it separated New from nothing. An
    // hourglass fixed the semantics but not the arithmetic — the glyph still sat on
    // most rows, competing with Trending and Updated, the two marks in that row that
    // the reader genuinely cannot know without being told.
    //
    // So New now reads off the absence: no glyph means untriaged. The Filters panel
    // still lists New with its label, which is where the word belongs.
  },
  // "Saved", not "Saved for later". The long form was chosen to echo the card
  // action that sets it ("Save for later"), but a pill states a STATE and the
  // menu row states an ACTION — they don't have to read identically, and at pill
  // size the extra two words were the widest thing in the status row.
  {
    id: "saved",
    label: "Saved",
    icon: "ap-icon-bookmark",
    hint: "Kept for later. It stays in the list until you use or ignore it.",
  },
  {
    id: "used",
    label: "Used",
    icon: "ap-icon-rounded-check",
    hint: "Taken into a chat to draft a post.",
  },
  {
    id: "ignored",
    label: "Ignored",
    icon: "ap-icon-eye-off",
    hint: "Kept off this list unless it starts trending or gets updated.",
  },
]);

/** Filter default: New and Saved. Reset restores exactly this. */
// UNTRIAGED and PARKED, not all four. Used and Ignored are both answers the reader
// has already given — a topic taken into a chat, or one pushed off the list — so
// opening on them puts finished work in front of someone looking for what to do next.
// Both are one tick away in the panel, and Ignored also comes back on its own when a
// topic starts trending or gets updated.
//
// This is NOT the old New-only default, which was reverted for a good reason: under
// it, saving a topic made it vanish the instant you triaged it, and the attention
// notice existed largely to explain that gap. Saved stays visible here, so the act of
// parking something never removes it from view.
export const DEFAULT_STATUS_IDS = Object.freeze(["new", "saved"]);

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
