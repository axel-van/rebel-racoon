// Topics sources catalog — what Agorapulse listening watches on a brand's behalf.
//
// This is CONFIG, not content: it ships with the app and must exist in
// `new-alt` mode too (a brand-new user still sees the six toggleable source
// cards in their Playbook's Topics section). The topics those sources produce
// are content and live in mocks.js, empty for a new user. Same split as
// ff-catalog.js (config) vs mocks.js (data).
//
// Which sources are on, plus the refresh cadence, are PER PLAYBOOK — they live
// on the Context as `ctx.topics = { enabledSourceIds, cadence }`, normalised in
// contexts-store.js and edited in the Playbook's Topics section.
//
// `playbookAnchor` — never the id — says which part of the Playbook a source
// reads, so the view can state the dependency ("Reads your competitors") without
// hardcoding a source id. null = Agorapulse listening feeds it directly and the
// Playbook has nothing to do with it.
//
// `accent` is a SEMANTIC KEY, never a hex — the view maps it to a
// `.topic-badge--<accent>` class that resolves DS colour tokens. Adding an
// accent means adding the class in styles/screens/topics.css.
//
// Descriptions are written in Archie's first person ("I track…"), like every
// other piece of assistant copy in the app.

export const TOPIC_SOURCES = Object.freeze([
  {
    id: "competitor-posts",
    name: "Competitor sources",
    icon: "ap-icon-megaphone",
    accent: "purple",
    description:
      "I track your competitors' best-performing posts — the formats, the messaging, the tone — so you know what's worth borrowing and where your own strengths let you differentiate.",
    playbookAnchor: "competitors",
    defaultEnabled: true,
  },
  {
    id: "influencer-posts",
    name: "Influencer sources",
    icon: "ap-icon-star",
    accent: "red",
    description:
      "I follow the creators your audience already listens to: their best content, the formats they use, who they partner with. You get collaboration angles and creative that already lands.",
    // null, not "competitors": a Playbook holds no list of creators, so nothing
    // in it feeds this. Agorapulse listening finds them from the audience.
    // Pointing at Competitors was a stretch that made the UI claim this source
    // "reads your competitors", which isn't what it does.
    playbookAnchor: null,
    defaultEnabled: true,
  },
  {
    id: "brand-feedback",
    name: "Brand feedback",
    icon: "ap-icon-double-chat-bubbles",
    accent: "menthol",
    description:
      "I read what people say to and about you — comments, DMs, reviews — and pull out the pain points and requests that keep coming back. I only raise a theme once ten or more people have voiced it, and I tie it to a real complaint.",
    playbookAnchor: null,
    defaultEnabled: false,
  },
  {
    id: "competitor-monitoring",
    name: "Competitor monitoring",
    icon: "ap-icon-feature-listening",
    accent: "electric-blue",
    description:
      "I watch the complaints and gaps in your competitors' products, and flag the openings where your strengths answer a need they're leaving unmet.",
    playbookAnchor: "competitors",
    defaultEnabled: false,
  },
  {
    id: "industry-trends",
    name: "Industry trends",
    icon: "ap-icon-bar-graph",
    accent: "green",
    description:
      "I follow the conversations gaining momentum in your industry, and surface the ones that have actually grown over the last 30 days.",
    playbookAnchor: null,
    defaultEnabled: false,
  },
  {
    id: "global-trends",
    name: "Global trends",
    icon: "ap-icon-web-news",
    accent: "orange",
    description:
      "I scan the cultural, seasonal and news moments that touch your brand, and suggest the timely angles with wide reach and low risk.",
    playbookAnchor: null,
    defaultEnabled: false,
  },
]);

/** The source ids switched on by default on a fresh Playbook. */
export const DEFAULT_ENABLED_IDS = Object.freeze(TOPIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id));

// Refresh cadences. Drives copy, never a timer — a daily/weekly/monthly tick
// would never fire inside a demo session. The recurring feel comes from the
// "Refresh now" scan on /topics.
//
// `every` for "every week", `adverb` for "I bring you topics weekly". Both
// spelled out rather than derived — stripping "ly" off "daily" gives "dai".
export const CADENCES = Object.freeze([
  { id: "daily", label: "Daily", adverb: "daily", every: "day" },
  { id: "weekly", label: "Weekly", adverb: "weekly", every: "week" },
  { id: "monthly", label: "Monthly", adverb: "monthly", every: "month" },
]);

export const DEFAULT_CADENCE = "weekly";

export function findTopicSource(id) {
  return TOPIC_SOURCES.find((s) => s.id === id) || null;
}

export function findCadence(id) {
  return CADENCES.find((c) => c.id === id) || null;
}
