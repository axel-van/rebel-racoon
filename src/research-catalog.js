// Research sources catalog — the definitions of what Archie can scan.
//
// This is CONFIG, not content: it ships with the app and must exist in
// `new-alt` mode too (a brand-new user still sees the seven toggleable source
// cards on /research → Sources). The findings those sources produce are
// content and live in mocks.js, empty for a new user. Same split as
// ff-catalog.js (config) vs mocks.js (data).
//
// Which sources are enabled, plus the refresh cadence and notification
// preference, are PER PLAYBOOK — they live on the Context (`ctx.research`),
// read through research-store.getResearchConfig(contextId).
//
// `kind` — never the id — drives what the settings card renders below its
// description, so the view never hardcodes a source id:
//   "playbook"  → a deep link into the Playbook section that feeds this source
//   "mcp"       → the connected-tool chips + "Add tool"
//   "listening" → nothing (Agorapulse listening feeds it directly)
//   "analytics" → nothing (the brand's own numbers feed it)
//
// `accent` is a SEMANTIC KEY, never a hex — the view maps it to a
// `.research-badge--<accent>` class that resolves DS color tokens. Adding an
// accent means adding the class in styles/screens/research.css.

export const RESEARCH_SOURCES = Object.freeze([
  {
    id: "competitor-posts",
    name: "Competitor sources",
    icon: "ap-icon-megaphone",
    accent: "purple",
    description:
      "I track what your competitors publish and which formats, hooks and tones earn them traction — so you know what to borrow and where to differentiate.",
    kind: "playbook",
    playbookAnchor: "competitors",
    playbookLinkLabel: "Edit my competitors in the Playbook",
    tools: null,
    defaultEnabled: true,
    defaultResearchType: "Competitive intelligence",
  },
  {
    id: "influencer-posts",
    name: "Influencer sources",
    icon: "ap-icon-star",
    accent: "red",
    description:
      "I follow the creators your audience already listens to and surface the content, formats and partnerships that resonate with them.",
    kind: "playbook",
    playbookAnchor: "competitors",
    playbookLinkLabel: "Edit my influencers in the Playbook",
    tools: null,
    defaultEnabled: true,
    defaultResearchType: "Creator signals",
  },
  {
    id: "brand-feedback",
    name: "Brand feedback",
    icon: "ap-icon-double-chat-bubbles",
    accent: "mermaid",
    description:
      "I read what people say to and about you — comments, DMs, reviews — and pull out the pain points and requests that keep coming back.",
    kind: "listening",
    playbookAnchor: null,
    playbookLinkLabel: null,
    tools: null,
    defaultEnabled: false,
    defaultResearchType: "Audience feedback",
  },
  {
    id: "competitor-monitoring",
    name: "Competitor monitoring",
    icon: "ap-icon-feature-listening",
    accent: "electric-blue",
    description:
      "I watch the complaints and gaps in your competitors' products, and flag the openings where your strengths answer an unmet need.",
    kind: "listening",
    playbookAnchor: null,
    playbookLinkLabel: null,
    tools: null,
    defaultEnabled: false,
    defaultResearchType: "Competitive intelligence",
  },
  {
    id: "industry-trends",
    name: "Industry trends",
    icon: "ap-icon-bar-graph",
    accent: "green",
    description: "I follow the topics and conversations gaining momentum in your industry over the last 30 days.",
    kind: "listening",
    playbookAnchor: null,
    playbookLinkLabel: null,
    tools: null,
    defaultEnabled: false,
    defaultResearchType: "Industry trend",
  },
  {
    id: "global-trends",
    name: "Global trends",
    icon: "ap-icon-web-news",
    accent: "orange",
    description:
      "I scan the cultural, seasonal and news moments relevant to your brand, and suggest the timely angles with wide reach and low risk.",
    kind: "listening",
    playbookAnchor: null,
    playbookLinkLabel: null,
    tools: null,
    defaultEnabled: false,
    defaultResearchType: "Cultural moment",
  },
  {
    id: "team-ideas",
    name: "Internal team ideas",
    icon: "ap-icon-note--plus",
    accent: "menthol",
    description:
      "I pick up the campaign notes and priorities your team writes down, so ideas stay aligned with this quarter's goals.",
    kind: "mcp",
    playbookAnchor: null,
    playbookLinkLabel: null,
    tools: ["notion", "intercom", "google-drive"],
    defaultEnabled: false,
    defaultResearchType: "Internal priority",
  },
]);

/** The ids enabled by default on a fresh Playbook. */
export const DEFAULT_ENABLED_IDS = Object.freeze(RESEARCH_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id));

/** Refresh cadences. Drives copy and how much a manual scan yields — never a timer. */
export const CADENCES = Object.freeze([
  { id: "daily", label: "Daily", adverb: "daily" },
  { id: "weekly", label: "Weekly", adverb: "weekly" },
  { id: "monthly", label: "Monthly", adverb: "monthly" },
]);

export function findResearchSource(id) {
  return RESEARCH_SOURCES.find((s) => s.id === id) || null;
}

export function findCadence(id) {
  return CADENCES.find((c) => c.id === id) || null;
}
