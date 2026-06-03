// All prototype data. One module, hardcoded, easy to edit.
// No network, no persistence, no randomness.

// Per-session sources / ideas / drafts live in their own bySession maps
// below. Source counts, idea counts and draft counts are derived from
// those stores at render time — never declared here.
export const recentSessions = [
  {
    id: "s-acme-launch",
    name: "Q2 launch announcement",
    lastActivity: "2 hours ago",
    contextId: "ctx-acme",
    pinned: true,
  },
  {
    id: "s-riverside",
    name: "Riverside customer story → 5 posts",
    lastActivity: "Yesterday",
    contextId: "ctx-customer",
    pinned: false,
  },
  {
    id: "s-state-of-social",
    name: "State of Social → thought leadership",
    lastActivity: "2 days ago",
    contextId: "ctx-founder-voice",
    pinned: false,
  },
  {
    id: "s-weekly-recap",
    name: "Weekly engagement recap",
    lastActivity: "5 days ago",
    contextId: "ctx-acme",
    pinned: false,
  },
];

// Empty-state Chat starter cards — the four handoff-spec prompts shown when a
// conversation has no user message yet. The `{{source}}` placeholder is
// resolved at render time by renderEmptyHero in screens/session.js — either
// the filename of the first attached source, or the literal "your source"
// fallback for first-run users. Per Q14 these are now the only starters in
// the product — the previous `templateStarters` array (dashboard sidebar
// workflow templates) was dropped at Lot 2.1.
export const chatStarters = [
  {
    id: "starter-batch",
    icon: "ap-icon-sparkles-mermaid",
    tone: "mermaid",
    title: "Batch from a source",
    prompt: "Pull the strongest ideas from {{source}} and draft 5 posts across LinkedIn, X, and Instagram.",
  },
  {
    id: "starter-launch",
    icon: "ap-icon-feature-publishing",
    tone: "orange",
    title: "Plan a launch week",
    prompt: "Plan a 5-day launch sequence using {{source}}. One post per day, mixed networks, ready to schedule.",
  },
  {
    id: "starter-repurpose",
    icon: "ap-icon-pen",
    tone: "blue",
    title: "Repurpose a long-form source",
    prompt:
      "Turn {{source}} into 8 posts: 3 for LinkedIn, 3 for X, 2 for Instagram. Different angles, same brand voice.",
  },
  {
    id: "starter-video-clips",
    icon: "ap-icon-video",
    tone: "purple",
    title: "Extract video clips",
    prompt:
      "Surface the best ideas from {{video-source}} and turn them into posts across LinkedIn, X, Instagram, and TikTok.",
    // `action` switches the starter from text-injection to a direct
    // dispatch in renderEmptyHero's click handler. See session.js.
    action: "open-video-clips",
  },
];

// Per-session source seed. Each conversation owns its own sources — no
// cross-session reuse. Listed by sessionId for clarity; sources-stream.js
// loads this into its per-session Map at boot for returning users.
export const sourcesBySession = {
  "s-acme-launch": [
    {
      id: "src-acme-1",
      filename: "q2-strategy-offsite-notes.pdf",
      kind: "PDF",
      status: "Processed",
      signal: "High signal",
      signalColor: "orange",
      ideaCount: 2,
      addedAt: "2d ago",
    },
    {
      id: "src-acme-2",
      filename: "founder-keynote.mp4",
      kind: "Video",
      status: "Processed",
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount: 2,
      addedAt: "2d ago",
      durationSec: 1458,
      clips: [
        {
          id: "cl1",
          start: 252,
          end: 282,
          hue: 22,
          title: '"It\'s about removing the blank page"',
          summary: "Tightest version of the Studio positioning — a single sentence that lands the whole thesis.",
          why: "Quotable hook. Reads as a standalone post on X or as the lede of a LinkedIn story.",
          network: "x",
          tags: ["hook", "positioning"],
        },
        {
          id: "cl2",
          start: 510,
          end: 568,
          hue: 280,
          title: "One draft → every network in 4 seconds",
          summary: "Live demo of a single post auto-adapting for FB, IG, LinkedIn, and X. Strong visual moment.",
          why: "Video carries this — short, kinetic, and ends with a clear payoff.",
          network: "instagram",
          tags: ["demo", "product"],
        },
        {
          id: "cl3",
          start: 890,
          end: 938,
          hue: 200,
          title: "6.2 hours back per week",
          summary: "The headline beta-user stat, delivered with the customer story behind it.",
          why: "Specific number + before/after. LinkedIn audiences over-index on time-savings proof.",
          network: "linkedin",
          tags: ["stat", "proof"],
        },
        {
          id: "cl4",
          start: 1102,
          end: 1156,
          hue: 12,
          title: 'Why we killed the "scheduling" tab',
          summary: "Contrarian product decision — explains the philosophy behind the Studio rebuild.",
          why: "Founder POV in a single beat. Ideal for thought-leadership context.",
          network: "linkedin",
          tags: ["contrarian", "pov"],
        },
        {
          id: "cl5",
          start: 1340,
          end: 1392,
          hue: 145,
          title: '"Stop measuring posts. Start measuring outcomes."',
          summary: "Closing line of the keynote. Clean delivery, room around it for graphics.",
          why: "Vertical-format reel material. Punchy, mid-length, ends on a quotable.",
          network: "tiktok",
          tags: ["closing", "reel"],
        },
      ],
    },
    {
      id: "src-acme-3",
      filename: "roadmap-blogpost.com/launch",
      kind: "URL",
      status: "Processed",
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount: 1,
      addedAt: "1d ago",
    },
  ],
  "s-riverside": [
    {
      id: "src-riv-1",
      filename: "riverside-discovery-call.mp3",
      kind: "Audio",
      status: "Processed",
      signal: "High signal",
      signalColor: "orange",
      ideaCount: 3,
      addedAt: "Yesterday",
    },
    {
      id: "src-riv-2",
      filename: "riverside-case-study-draft.pdf",
      kind: "PDF",
      status: "Processed",
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount: 1,
      addedAt: "Yesterday",
    },
  ],
  "s-state-of-social": [
    {
      id: "src-sos-1",
      filename: "state-of-social-2026-report.pdf",
      kind: "PDF",
      status: "Processed",
      signal: "High signal",
      signalColor: "orange",
      ideaCount: 4,
      addedAt: "2d ago",
    },
    {
      id: "src-sos-2",
      filename: "social-trends-keynote.mp4",
      kind: "Video",
      status: "Processed",
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount: 2,
      addedAt: "2d ago",
      durationSec: 1820,
    },
  ],
  "s-weekly-recap": [
    {
      id: "src-weekly-1",
      filename: "analytics-week-12.pdf",
      kind: "PDF",
      status: "Processed",
      signal: "Low signal",
      signalColor: "grey",
      ideaCount: 2,
      addedAt: "5d ago",
    },
  ],
};

// Idea model — Q1 hybrid:
//   • Original archie fields (relevance/confidence/pinned/state/channels/
//     sourceIds) preserved for the rich workspace UX
//   • Handoff fields layered on top — `kind` (stat/quote/hook/story/insight)
//     for filter rails, `tags` for chip rows, `used` for "Most used / Unused"
//     sort, `ref` for the inline citation snippet shown on each card
//
// Partitioned by session so each conversation owns its own idea pool —
// counts displayed in the topbar, status card and chat-picker match the
// store contents on a per-session basis. Per-source `ideaCount` in
// Handcrafted "angles" for the draft-from-idea flow. When the user clicks
// Draft on an idea card, Archie suggests 4 AI-generated angles (title +
// short description) the idea could be reframed into before asking how
// many drafts. These are mocked per-idea for the main demo session; any
// idea without a handcrafted set falls back to draft-flow's generateAngles().
// Keyed by idea id; each angle is { id, title, description }.
export const anglesByIdea = {
  "idea-acme-1": [
    {
      id: "angle-acme-1-1",
      title: "The honest founder retro",
      description:
        "Walk through the three bottlenecks — scope, distribution, onboarding — and what you'd do differently.",
    },
    {
      id: "angle-acme-1-2",
      title: "The contrarian take on launch hype",
      description: "Argue that most launches fail on distribution, not product, using your scope-creep story as proof.",
    },
    {
      id: "angle-acme-1-3",
      title: "A playbook for first-time launchers",
      description: "Turn the three constraints into a pre-launch checklist readers can steal before their own launch.",
    },
    {
      id: "angle-acme-1-4",
      title: "The data-backed post-mortem",
      description: "Frame each constraint around the number it cost you, and the metric that finally moved.",
    },
  ],
  "idea-acme-2": [
    {
      id: "angle-acme-2-1",
      title: "The contrarian manifesto",
      description: "Make the case that OKRs are a lagging signal, not a focus tool — and what you replaced them with.",
    },
    {
      id: "angle-acme-2-2",
      title: "The before-and-after story",
      description: "Show one quarter run on OKRs versus one run without, and what changed for the team.",
    },
    {
      id: "angle-acme-2-3",
      title: "A how-to for ditching rituals",
      description: "Give readers a three-step path to retire OKRs without losing alignment.",
    },
    {
      id: "angle-acme-2-4",
      title: "The reply to OKR defenders",
      description: "Pre-empt the obvious objections and answer them head-on to spark debate.",
    },
  ],
  "idea-acme-3": [
    {
      id: "angle-acme-3-1",
      title: "The behind-the-scenes recap",
      description: "Show the keynote as it really happened, including the bits that got cut.",
    },
    {
      id: "angle-acme-3-2",
      title: "The lessons-learned angle",
      description: "Pull three things you'd change about presenting to a small, high-trust room.",
    },
    {
      id: "angle-acme-3-3",
      title: "The vulnerable founder story",
      description: "Share the nerves and the moment it clicked, to make the post relatable.",
    },
    {
      id: "angle-acme-3-4",
      title: "The tactical breakdown",
      description: "Turn the keynote structure into a template other founders can reuse.",
    },
  ],
  "idea-acme-4": [
    {
      id: "angle-acme-4-1",
      title: "The positioning statement",
      description: "Lead with the quote and unpack what “removing the blank page” means for your users.",
    },
    {
      id: "angle-acme-4-2",
      title: "The contrarian framing",
      description: "Use the quote to push back on the “AI replaces writers” narrative dominating the feed.",
    },
    {
      id: "angle-acme-4-3",
      title: "The customer-proof angle",
      description: "Pair the quote with a short story of a writer who shipped faster, not less.",
    },
    {
      id: "angle-acme-4-4",
      title: "The manifesto post",
      description: "Expand the quote into a three-line belief statement about how you build.",
    },
  ],
  "idea-acme-5": [
    {
      id: "angle-acme-5-1",
      title: "The editorial rule of thumb",
      description: "Share the exact filter you use to decide what's safe to talk about publicly.",
    },
    {
      id: "angle-acme-5-2",
      title: "The thoughtful-vs-hype angle",
      description: "Position your restraint as a deliberate choice in a market full of roadmap theater.",
    },
    {
      id: "angle-acme-5-3",
      title: "A how-to for transparent roadmaps",
      description: "Give teams a simple framework for deciding what to share and what to hold.",
    },
    {
      id: "angle-acme-5-4",
      title: "The behind-the-curtain story",
      description: "Tell the story of a roadmap item you almost announced — and why you didn't.",
    },
  ],
};

// `sourcesBySession` is kept in sync with the count of ideas pointing at
// that source below.
export const ideasBySession = {
  "s-acme-launch": [
    {
      id: "idea-acme-1",
      title: "The three constraints that killed our first launch",
      body: "A candid retro framed around the three bottlenecks we kept underestimating: scope, distribution, and onboarding.",
      kind: "story",
      tags: ["retro", "operator", "launch"],
      used: 1,
      ref: "p. 4 · offsite notes",
      rationale:
        "Concrete and personal — operator retros are the kind of post readers save and reread. Strong pull on discussion.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 92,
      channels: ["linkedin"],
      state: "Pinned",
      pinned: true,
      sourceIds: ["src-acme-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-acme-2",
      title: "Why we stopped writing quarterly OKRs",
      body: "Contrarian take grounded in the offsite notes. Frames OKRs as a lagging signal rather than a tool for focus.",
      kind: "insight",
      tags: ["okrs", "contrarian"],
      used: 0,
      ref: "p. 7 · offsite notes",
      rationale:
        "A contrarian frame on a rituals-heavy topic. High comment potential from teams with their own OKR scars.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 88,
      channels: ["linkedin", "x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-acme-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-acme-3",
      title: "What a founder keynote looks like at 50 people",
      body: "Behind-the-scenes recap of the keynote, including the bits that got cut.",
      kind: "story",
      tags: ["bts", "founder"],
      used: 0,
      ref: "12:30 · keynote",
      rationale:
        "Behind-the-scenes posts earn trust fast — readers get a rare look at how the company actually operates.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 76,
      channels: ["linkedin", "instagram"],
      state: "New",
      pinned: false,
      sourceIds: ["src-acme-2"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-acme-4",
      title: '"Studio isn\'t about replacing the writer."',
      body: "\"Studio isn't about replacing the writer — it's about removing the blank page.\"",
      kind: "quote",
      tags: ["positioning", "hero"],
      used: 1,
      ref: "04:12 · keynote",
      rationale: "Crisp hero quote — works equally well as the lede or the close of a launch post.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 90,
      channels: ["linkedin", "x", "instagram"],
      state: "Pinned",
      pinned: true,
      sourceIds: ["src-acme-2"],
      extractedAt: "1d ago",
    },
    {
      id: "idea-acme-5",
      title: "How we pick which roadmap items we talk about publicly",
      body: "An editorial rule of thumb the team actually uses.",
      kind: "insight",
      tags: ["editorial", "judgement"],
      used: 2,
      ref: "acme.com/launch",
      rationale:
        "Editorial restraint is under-used as an angle. Positions the team as thoughtful rather than hype-driven.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 71,
      channels: ["linkedin"],
      state: "Reviewed",
      pinned: false,
      sourceIds: ["src-acme-3"],
      extractedAt: "just now",
    },
  ],
  "s-riverside": [
    {
      id: "idea-riv-1",
      title: "Riverside's 6-week onboarding rebuild",
      body: "The arc: legacy CMS → unified Studio workflow. Three decisions that compounded, told from the customer's POV.",
      kind: "story",
      tags: ["case-study", "onboarding"],
      used: 2,
      ref: "08:42 · discovery call",
      rationale:
        "Operator-shaped story with a clear before/after. Customer-told arcs convert better than vendor-told ones.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 91,
      channels: ["linkedin"],
      state: "Pinned",
      pinned: true,
      sourceIds: ["src-riv-1"],
      extractedAt: "Yesterday",
    },
    {
      id: "idea-riv-2",
      title: "The metric Riverside cared about that we didn't track",
      body: "How a single discovery call reframed our success metric — and why it changed the roadmap that quarter.",
      kind: "insight",
      tags: ["metrics", "discovery"],
      used: 1,
      ref: "22:10 · discovery call",
      rationale: "Naming a blind spot earns credibility. Pairs well as a teaser for the longer customer story post.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 84,
      channels: ["linkedin", "x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-riv-1"],
      extractedAt: "Yesterday",
    },
    {
      id: "idea-riv-3",
      title: '"We just needed one place to start a draft."',
      body: '"We just needed one place to start a draft. Everything else followed from that."',
      kind: "quote",
      tags: ["positioning", "verbatim"],
      used: 0,
      ref: "31:05 · discovery call",
      rationale: "Single-sentence customer quote that maps to the Studio thesis — strong lede or close.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 89,
      channels: ["linkedin", "x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-riv-1"],
      extractedAt: "Yesterday",
    },
    {
      id: "idea-riv-4",
      title: "From spreadsheet chaos to one workflow — the Riverside arc",
      body: "The before/after of consolidating four tools into one. Numbers from the case study draft: 11 hours/week reclaimed.",
      kind: "stat",
      tags: ["before-after", "time-saved"],
      used: 0,
      ref: "p. 3 · case-study draft",
      rationale:
        "Hard time-savings number sourced from the customer's own tracking — the kind of stat operators forward.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 78,
      channels: ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: ["src-riv-2"],
      extractedAt: "Yesterday",
    },
  ],
  "s-state-of-social": [
    {
      id: "idea-sos-1",
      title: "73% of social managers say context-switching is their #1 blocker",
      body: "73% of social media managers say context-switching between tools is their #1 blocker — up from 58% last year.",
      kind: "stat",
      tags: ["report", "pain-point"],
      used: 3,
      ref: "p. 9 · State of Social 2026",
      rationale: "Hard number with a year-over-year comparison — gives the post immediate credibility on LinkedIn.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 95,
      channels: ["linkedin", "x"],
      state: "Pinned",
      pinned: true,
      sourceIds: ["src-sos-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-sos-2",
      title: "The platform decline no one wants to call",
      body: "Two-year trend buried in the report: organic reach on the big-three networks is down 34% on average. Implications for next-year planning.",
      kind: "insight",
      tags: ["industry", "contrarian"],
      used: 1,
      ref: "p. 14 · State of Social 2026",
      rationale: "Contrarian read of a closely-watched number. Strong inbound for thought-leadership audiences.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 86,
      channels: ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: ["src-sos-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-sos-3",
      title: "Why Gen Z marketers are leaving the funnel framework behind",
      body: "A hook framed around generational shifts the report names but doesn't unpack — leave the reader wanting the follow-up.",
      kind: "hook",
      tags: ["audience", "gen-z"],
      used: 0,
      ref: "p. 22 · State of Social 2026",
      rationale: "Generational angle drives shares — works as a thread opener or a single-line LinkedIn hook.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 73,
      channels: ["linkedin", "x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-sos-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-sos-4",
      title: "Three numbers from the 2026 report that flipped my Q3 plan",
      body: "A short-form retrospective listing three counter-intuitive findings from the report and what I changed.",
      kind: "story",
      tags: ["retro", "planning"],
      used: 0,
      ref: "Generated · synthesis",
      rationale: "Operator retros built on industry data perform well — concrete, specific, easy to disagree with.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 70,
      channels: ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: ["src-sos-1"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-sos-5",
      title: '"Posting more is not strategy — it never was."',
      body: '"Posting more is not strategy — it never was. Picking the right beat is."',
      kind: "quote",
      tags: ["positioning", "verbatim"],
      used: 1,
      ref: "06:24 · social trends keynote",
      rationale: "Strong quotable for thought-leadership posts. Works as the close of a longer breakdown.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 88,
      channels: ["linkedin", "x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-sos-2"],
      extractedAt: "2d ago",
    },
    {
      id: "idea-sos-6",
      title: "The one founder story we won't tell (and why)",
      body: "A meta-post about editorial restraint — when not posting is itself the brand move.",
      kind: "hook",
      tags: ["meta", "editorial"],
      used: 0,
      ref: "23:18 · social trends keynote",
      rationale:
        "Meta-post about judgement, not the story itself. Niche but memorable for founders in similar positions.",
      relevance: "Low relevance",
      relevanceColor: "grey",
      confidence: 54,
      channels: ["x"],
      state: "New",
      pinned: false,
      sourceIds: ["src-sos-2"],
      extractedAt: "2d ago",
    },
  ],
  "s-weekly-recap": [
    {
      id: "idea-weekly-1",
      title: "What week 12 told us about Tuesday vs Thursday",
      body: "Engagement split this week ran 2.3× higher on Tuesday morning than Thursday afternoon — same length, same author.",
      kind: "stat",
      tags: ["timing", "engagement"],
      used: 1,
      ref: "p. 2 · analytics-week-12",
      rationale: "Day-of-week stats are the kind of thing social managers test for themselves — invites engagement.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 74,
      channels: ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: ["src-weekly-1"],
      extractedAt: "5d ago",
    },
    {
      id: "idea-weekly-2",
      title: "The post we almost skipped that pulled the week",
      body: "A short retro about the post we nearly didn't publish — and the reach numbers that came out of it.",
      kind: "story",
      tags: ["retro", "weekly"],
      used: 0,
      ref: "p. 5 · analytics-week-12",
      rationale: "Near-miss stories add credibility — readers reward operators who admit to the close calls.",
      relevance: "Low relevance",
      relevanceColor: "grey",
      confidence: 62,
      channels: ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: ["src-weekly-1"],
      extractedAt: "5d ago",
    },
  ],
};

// Flat union — kept for legacy consumers that read a single global pool
// (assistant.js reasoning text, screens/ideas.js standalone route,
// right-panel.js Ideas tab). Stays mutable so library.js dual-write
// (`injectIdeasForSource` → seedIdeas.unshift) continues to land here.
export const ideas = [
  ...ideasBySession["s-acme-launch"],
  ...ideasBySession["s-riverside"],
  ...ideasBySession["s-state-of-social"],
  ...ideasBySession["s-weekly-recap"],
];

// ---- Contexts --------------------------------------------------------------
//
// A *context* is a named bundle that can hold Voice, Brief and Brand
// components. A session attaches at most ONE context. Components are
// optional — a context may have only voice, for instance.

// Component samples (reused inside contexts + by the stage wizards).

export const voiceAnalysis = {
  sections: [
    {
      id: "hooks",
      title: "Opening Hooks",
      bullets: [
        "Cold-open with a contrarian claim, then immediately soften with a personal story.",
        "Never start with a question — always a statement the reader can disagree with.",
      ],
    },
    {
      id: "closing",
      title: "Closing Patterns",
      bullets: [
        "Close with a one-line callback to the opening claim, rarely with a CTA.",
        "Avoid the word 'takeaway'. Leave the reader to name it themselves.",
      ],
    },
    {
      id: "rhythm",
      title: "Formatting Rhythm",
      bullets: [
        "Short sentence, short sentence, longer sentence that earns it.",
        "Line breaks carry weight — never fill them with filler words.",
      ],
    },
    {
      id: "style",
      title: "Visual Style",
      bullets: [
        "No emojis. No bullets except under a header.",
        "Bold a maximum of one phrase per post, and only when it's the thesis.",
      ],
    },
    {
      id: "soul",
      title: "Soul",
      bullets: [
        "Trust the reader to be smart. Don't explain the joke.",
        "If the post can be read aloud without sounding like a brand, it passes.",
      ],
    },
    {
      id: "verbatim",
      title: "Verbatim Examples",
      bullets: [
        '"We didn\'t ship the thing. We shipped a version of the thing that we could live with."',
        '"Quarterly OKRs are a retrospective tool wearing a planning costume."',
      ],
    },
    {
      id: "metadata",
      title: "Metadata",
      bullets: ["Average post length: 85 words.", "Posts per week analyzed: 14."],
    },
  ],
};

export const strategyBrief = {
  sections: [
    {
      id: "goals",
      title: "Goals",
      fields: [
        { label: "Primary objective", value: "Establish the founder as a credible voice on product discipline." },
        { label: "Target action", value: "Inbound intros from operators at 50–200-person startups." },
      ],
    },
    {
      id: "audience",
      title: "Audience",
      fields: [
        {
          label: "Target demographic",
          value: "Product leaders, 5–15 years in, operator-track rather than investor-track.",
        },
        {
          label: "Pain points",
          value: "Team is shipping, but no one outside the company can tell what the strategy is.",
        },
      ],
    },
    {
      id: "voice",
      title: "Brand Voice",
      fields: [
        { label: "Tone", value: "Candid, specific, allergic to LinkedIn platitudes." },
        { label: "Style", value: "Short paragraphs, no emojis, one thesis per post." },
      ],
    },
  ],
};

export const brandTheme = {
  url: "https://acme.com",
  colors: [
    { name: "Primary", hex: "#FF6726" },
    { name: "Surface", hex: "#F9F9FA" },
    { name: "Ink", hex: "#212E44" },
    { name: "Accent", hex: "#178DFE" },
  ],
  imageryNotes: [
    "Studio-lit product photography, shallow depth of field.",
    "Never stock imagery. Never AI-generated faces.",
  ],
  buttons: [
    { label: "Get started", variant: "primary" },
    { label: "Learn more", variant: "secondary" },
  ],
  personality: ["Candid", "Precise", "Warm", "Operator-first", "No-nonsense"],
};

// Named contexts — whole bundles. Sessions attach one of these by id.
//
// Q2 hybrid Context model — the editable fields surfaced in the Contexts
// view + drawer (color / isDefault / brandName / audience / briefSummary /
// tones / doRules / dontRules / cta / usedIn / updatedAt) sit at the top
// level. The rich analytical sub-objects (voice / brief / brand) move
// under `analysis` — read-only, surfaced in the Context tab as
// "Voice analysis / Strategy brief / Brand theme" once Archie has
// processed source material.
//
// Old call sites that read `context.voice` / `context.brief` /
// `context.brand` keep working through accessor helpers below. New
// surfaces (Lot 8 Contexts page, drawer, ContextCard) read the flat
// fields directly.

export const contexts = [
  {
    id: "ctx-acme",
    name: "Acme · Q2 marketing",
    color: "orange",
    isDefault: true,
    brandName: "Acme",
    websiteUrl: "https://acme.example.com",
    audience: ["Operators and marketing leads at 50–200-person B2B startups"],
    businessSummary:
      "Drive awareness for Acme's Q2 launch. Lead with concrete time savings + customer outcomes, not feature lists.",
    briefSummary:
      "Drive awareness for Acme's Q2 launch. Lead with concrete time savings + customer outcomes, not feature lists.",
    tones: ["Direct", "Operator-first"],
    voiceProfile: {
      headline: "Direct · operator-first · specific",
      writingStyle:
        "Direct, hook-first, and benefit-led. Every sentence has to earn its place: cut the throat-clearing, lead with the outcome, back it with a number or a quote.",
      vocabulary:
        "Plain operator language — 'time saved', 'shipped', 'closed', 'pipeline'. Avoid corporate jargon ('synergy', 'leverage', '10x') and feature-shaped marketing words ('robust', 'powerful', 'cutting-edge').",
      sentenceStructure:
        "Short to medium sentences. Often opens on a number or a contrarian beat. Lists when there are three or more parallel points; otherwise prose.",
      formality:
        "Semi-formal. Always 'we' and 'you' — never the third person. Contractions are fine. The tone matches a smart Slack message, not a press release.",
      personality:
        "Confident without bragging. Helpful without performing. Speaks the way operators actually talk to each other — direct, specific, occasionally dry.",
      rhetoricalDevices:
        "Open with a hook or specific number. Use before / after contrasts. End every post with a clear next step. No 'stay tuned' cliffhangers.",
      emotionalTone: "Steady and confident. Acknowledges the messy reality of B2B without complaining about it.",
      contentPatterns:
        "Hook → context → concrete result → call to action. Most posts top out around 90 words and resolve in a single idea.",
      uniqueTraits:
        "No emoji in B2B contexts. Customer outcomes always sit ahead of feature names. Numbers are real, sourced, and rounded honestly (not '99.999%').",
    },
    contentStyle: ["Direct and actionable", "Data-driven with storytelling"],
    objective: ["Brand awareness", "Lead generation"],
    contentAction: ["Sign up for a free trial", "Book a demo"],
    ctaLinks: [
      { label: "30-day free trial", url: "acme.example.com/trial", checked: true, suggested: false },
      { label: "Book a demo", url: "acme.example.com/demo", checked: true, suggested: false },
    ],
    language: "English",
    imageVoice: {
      websites: [
        {
          domain: "acme.example.com",
          url: "https://acme.example.com",
          colors: {
            primary: "#1A1F36",
            accent: "#FF6726",
            background: "#FFFFFF",
            textPrimary: "#1A1F36",
            link: "#FF6726",
          },
          typography: {
            primaryFont: "Inter",
            headingFont: "Inter",
            h1Size: "48px",
            h2Size: "24px",
            bodySize: "16px",
            fontStack: ["Inter", "system-ui", "sans-serif"],
          },
          images: {
            logo: { label: "Logo", url: "" },
            favicon: { label: "Favicon", url: "" },
            ogImage: { label: "OgImage", url: "" },
          },
          buttons: {
            primary: { bg: "#FF6726", color: "#FFFFFF", label: "Primary" },
            secondary: { bg: "#FFFFFF", color: "#1A1F36", border: "#1A1F36", label: "Secondary" },
          },
          personality: {
            tone: "operator-first",
            energy: "medium-high",
            audience: "B2B startup operators",
          },
        },
      ],
    },
    doRules: [
      'Use "we" and "you" — never third person',
      "Open with a hook or specific number",
      "End every post with a clear next step",
    ],
    dontRules: ["No emoji in B2B contexts", 'Avoid jargon: "synergy", "leverage", "10x"'],
    cta: "Try Acme free for 30 days.",
    usedIn: 4,
    updatedAt: "3 minutes ago",
    analysis: {
      voice: voiceAnalysis,
      brief: strategyBrief,
      brand: brandTheme,
    },
  },
  {
    id: "ctx-founder-voice",
    name: "Founder voice only",
    color: "blue",
    isDefault: false,
    brandName: "Jamie Torres · Personal",
    websiteUrl: "",
    audience: ["B2B founders and product leaders thinking about how teams ship"],
    businessSummary:
      "Build trust over time with sharp opinions, lived experience, zero promotional content. Posts should make readers re-examine an assumption.",
    briefSummary:
      "Build trust over time with sharp opinions, lived experience, zero promotional content. Posts should make readers re-examine an assumption.",
    tones: ["Direct", "Conversational"],
    voiceProfile: {
      headline: "Direct · conversational · opinionated",
      writingStyle:
        "Conversational and pointed. Reads like a strong founder DM — sharp opinion up front, lived context behind it, no marketing varnish.",
      vocabulary:
        "Plain English, occasional technical terms used precisely. Avoids growth-speak ('community', 'movement') and the LinkedIn cliché vocabulary ('grateful', 'humbled', 'thrilled').",
      sentenceStructure:
        "Short. Sometimes a single line. Occasional longer sentences when explaining a counter-intuitive idea, but never paragraphs of throat-clearing.",
      formality:
        "Informal. First person ('I', 'we'), contractions, the occasional cuss kept in if it's the right word.",
      personality:
        "Opinionated, generous with credit, willing to be wrong out loud. Speaks from scar tissue, not theory.",
      rhetoricalDevices:
        "Contrarian take or a specific moment up top. Often a single surprising data point. Resolves on a reframe rather than a CTA.",
      emotionalTone:
        "Engaged and a bit impatient. Readers should feel pulled forward and slightly challenged, never sold to.",
      contentPatterns:
        "Hook (contrarian or anecdote) → context → reframe. One idea per post. Length is whatever the idea needs; usually short.",
      uniqueTraits:
        "No CTAs, no links, no product mentions. No hashtags. The byline is the brand — the audience follows the human, not a logo.",
    },
    contentStyle: ["Direct and actionable"],
    objective: ["Build personal brand", "Brand awareness"],
    contentAction: ["Read more on the blog"],
    ctaLinks: [],
    language: "English",
    imageVoice: {
      websites: [
        {
          domain: "",
          url: "",
          colors: {
            primary: "#178DFE",
            accent: "#178DFE",
            background: "#FFFFFF",
            textPrimary: "#1A1F36",
            link: "#178DFE",
          },
          typography: {
            primaryFont: "System UI",
            headingFont: "System UI",
            h1Size: "44px",
            h2Size: "22px",
            bodySize: "16px",
            fontStack: ["System UI", "Inter", "sans-serif"],
          },
          images: {
            logo: { label: "Logo", url: "" },
            favicon: { label: "Favicon", url: "" },
            ogImage: { label: "OgImage", url: "" },
          },
          buttons: {
            primary: { bg: "#178DFE", color: "#FFFFFF", label: "Primary" },
            secondary: { bg: "#FFFFFF", color: "#178DFE", border: "#178DFE", label: "Secondary" },
          },
          personality: {
            tone: "direct",
            energy: "calm",
            audience: "founders & product leaders",
          },
        },
      ],
    },
    doRules: [
      "Start with a contrarian take or a moment, not a stat",
      "Write like you talk — short sentences, real verbs",
      "One idea per post",
    ],
    dontRules: ["No CTAs, no links, no product mentions", "No hashtags"],
    cta: "",
    usedIn: 1,
    updatedAt: "yesterday",
    analysis: {
      voice: voiceAnalysis,
      brief: null,
      brand: null,
    },
  },
  {
    id: "ctx-customer",
    name: "Customer stories",
    color: "green",
    isDefault: false,
    brandName: "Acme",
    websiteUrl: "https://acme.example.com/customers",
    audience: ["Prospects evaluating Acme who care about real outcomes from teams like theirs"],
    businessSummary:
      "Turn customer interviews into evidence-led posts. Lead with the team's situation, the change they made, and the measurable result. Quote them directly.",
    briefSummary:
      "Turn customer interviews into evidence-led posts. Lead with the team's situation, the change they made, and the measurable result. Quote them directly.",
    tones: ["Professional", "Conversational"],
    voiceProfile: {
      headline: "Professional · evidence-led · honest",
      writingStyle:
        "Story-shaped and grounded in fact. Each post follows a specific team's arc — situation, change, result — and lets their voice carry it.",
      vocabulary:
        "Industry-neutral. Customer's own words for their problem and outcome; Acme's words stay out of the quote. Avoid marketing words ('transformed', 'revolutionised') in favour of measurable verbs.",
      sentenceStructure:
        "Medium-length sentences. A short opening line for the hook, then 2–3 sentences of context, a quote, and a closing line that names the result.",
      formality:
        "Professional but warm. Always names the customer and their role. 'They' for the team, 'we' only when speaking about Acme's role in the story.",
      personality:
        "Trustworthy, attentive, occasionally surprised on the customer's behalf. Lets the customer be the hero.",
      rhetoricalDevices:
        "Direct quotes — never paraphrased. Before / after metrics. Specific names of teams and tools.",
      emotionalTone: "Genuine and slightly understated. Lets the numbers and the human carry the emotion.",
      contentPatterns: "Situation → change → result, with a quote anchoring the change. One customer per post.",
      uniqueTraits:
        'No generic testimonials ("game changer", "love this"). No paraphrasing. No "stay tuned" cliffhangers — every story resolves.',
    },
    contentStyle: ["Data-driven with storytelling"],
    objective: ["Brand awareness", "Lead generation"],
    contentAction: ["Read the full customer story", "Book a demo"],
    ctaLinks: [
      {
        label: "See how teams like yours use Acme",
        url: "acme.example.com/customers",
        checked: true,
        suggested: false,
      },
      { label: "Book a demo", url: "acme.example.com/demo", checked: true, suggested: false },
    ],
    language: "English",
    imageVoice: {
      websites: [
        {
          domain: "acme.example.com",
          url: "https://acme.example.com/customers",
          colors: {
            primary: "#1A6E3F",
            accent: "#34A65F",
            background: "#FFFFFF",
            textPrimary: "#1A1F36",
            link: "#1A6E3F",
          },
          typography: {
            primaryFont: "Inter",
            headingFont: "Inter",
            h1Size: "44px",
            h2Size: "22px",
            bodySize: "16px",
            fontStack: ["Inter", "system-ui", "sans-serif"],
          },
          images: {
            logo: { label: "Logo", url: "" },
            favicon: { label: "Favicon", url: "" },
            ogImage: { label: "OgImage", url: "" },
          },
          buttons: {
            primary: { bg: "#1A6E3F", color: "#FFFFFF", label: "Primary" },
            secondary: { bg: "#FFFFFF", color: "#1A6E3F", border: "#1A6E3F", label: "Secondary" },
          },
          personality: {
            tone: "evidence-led",
            energy: "calm",
            audience: "B2B buyers in evaluation",
          },
        },
      ],
    },
    doRules: [
      "Always name the customer and their role",
      "Pull one direct quote per post",
      "Include a specific metric or before/after",
    ],
    dontRules: [
      'No generic testimonials ("game changer", "love this")',
      "Don't paraphrase — quote them",
      'No "stay tuned" cliffhangers',
    ],
    cta: "See how teams like yours use Acme →",
    usedIn: 0,
    updatedAt: "2 days ago",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
  },
];

// Legacy accessors — keep `context.voice`, `context.brief`, `context.brand`
// reading from the new analysis sub-object so callers from before Lot 8
// don't break. Callers should migrate to ctx.analysis.* over time.
for (const ctx of contexts) {
  if (ctx.analysis) {
    Object.defineProperty(ctx, "voice", { get: () => ctx.analysis.voice, enumerable: true });
    Object.defineProperty(ctx, "brief", { get: () => ctx.analysis.brief, enumerable: true });
    Object.defineProperty(ctx, "brand", { get: () => ctx.analysis.brand, enumerable: true });
  }
}

// ---- Posts (shown in the session Posts tab when populated) ----------------
//
// Partitioned by session so each conversation owns its own drafts —
// counters in the topbar pill, status card and chat picker derive from
// these arrays on a per-session basis.

const AUTHOR_MC = {
  name: "Maya Chen",
  title: "Head of Marketing",
  initials: "MC",
  connection: "1st",
  visibility: "Public",
};

const AUTHOR_JT = {
  name: "Jamie Torres",
  title: "Founder & CEO",
  initials: "JT",
  connection: "1st",
  visibility: "Public",
};

export const postsBySession = {
  "s-acme-launch": [
    {
      id: "post-acme-1",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "ready",
      timeLabel: "3h",
      text: [
        "Your Q2 plan isn't a plan, it's a wish list — unless every objective names the single signal you'll watch weekly to prove it.",
        "Teams who track one weekly proof point ship on cadence. Teams who wait for quarterly wrap-ups publish less, and ship less.",
      ],
      hashtags: ["Q2Planning", "ContentOps"],
      cta: "",
      stats: { likes: 147, comments: 8, reposts: 11 },
      hasImage: false,
    },
    {
      id: "post-acme-2",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "needs_fixes",
      timeLabel: "6h",
      text: [
        "Short version of today's offsite: we stopped writing quarterly OKRs. Here's what replaced them and why the team ships faster now.",
        "The replacement is simple: one weekly operating signal, one owner, and one decision the team can actually make before Friday.",
      ],
      hashtags: ["OKRs", "OperatorNotes"],
      cta: "",
      stats: { likes: 0, comments: 0, reposts: 0 },
      hasImage: false,
      errors: [
        {
          id: "e-acme-2-1",
          message: "Caption exceeds 2,200 characters for LinkedIn.",
          field: "caption",
          platform: "linkedin",
        },
        {
          id: "e-acme-2-2",
          message: "First comment requires at least one mention.",
          field: "firstComment",
          platform: "linkedin",
        },
      ],
    },
    {
      id: "post-acme-3",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "ready",
      timeLabel: "2d",
      text: [
        "Three constraints killed our first launch: scope, distribution, and onboarding. All three were visible at the offsite — and all three were missing from the retrospective doc.",
        "If your retro doesn't name the constraints, your next launch will hit the same ones.",
      ],
      hashtags: ["Launches", "Retros"],
      cta: "",
      stats: { likes: 198, comments: 22, reposts: 14 },
      hasImage: false,
    },
    {
      id: "post-acme-4",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "needs_fixes",
      timeLabel: "3d",
      text: [
        "Behind-the-scenes on the founder keynote — including the parts that got cut. The cuts are more instructive than the keynote itself.",
      ],
      hashtags: ["FounderKeynote", "BTS"],
      cta: "",
      stats: { likes: 0, comments: 0, reposts: 0 },
      hasImage: false,
      errors: [
        {
          id: "e-acme-4-1",
          message: "Image dimensions invalid for LinkedIn (1200×627 recommended).",
          field: "media",
          platform: "linkedin",
        },
      ],
    },
  ],
  "s-riverside": [
    {
      id: "post-riv-1",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "ready",
      timeLabel: "2h",
      text: [
        "Riverside cut 11 hours a week off their content workflow. They didn't add tools — they removed three.",
        "The change started with a single decision: pick one place to start every draft. Everything downstream followed from there.",
      ],
      hashtags: ["CustomerStory", "Workflow"],
      cta: "Read the full Riverside story →",
      stats: { likes: 132, comments: 9, reposts: 7 },
      hasImage: false,
    },
    {
      id: "post-riv-2",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "ready",
      timeLabel: "5h",
      text: [
        '"We just needed one place to start a draft." — that line from the discovery call became the brief for the entire rebuild.',
        "Six weeks later, the Riverside team is publishing 2× the cadence with the same headcount.",
      ],
      hashtags: ["CustomerVoice", "Quotes"],
      cta: "",
      stats: { likes: 89, comments: 6, reposts: 4 },
      hasImage: false,
    },
    {
      id: "post-riv-3",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "needs_fixes",
      timeLabel: "yesterday",
      text: [
        "The metric Riverside cared about that we didn't track — until they told us. Sharing the reframe that flipped our roadmap.",
      ],
      hashtags: ["Discovery", "Roadmap"],
      cta: "",
      stats: { likes: 0, comments: 0, reposts: 0 },
      hasImage: false,
      errors: [
        {
          id: "e-riv-3-1",
          message: "Post body is too short for LinkedIn's recommended length (200+ chars).",
          field: "caption",
          platform: "linkedin",
        },
      ],
    },
    {
      id: "post-riv-4",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "scheduled",
      scheduledForLabel: "Tue · 9:30",
      timeLabel: "yesterday",
      text: [
        "Spreadsheet chaos → one workflow, in six weeks. The Riverside arc, told with the before/after metrics they tracked themselves.",
        "Three numbers stood out: 11h/week saved, 2× publishing cadence, and 0 tools added.",
      ],
      hashtags: ["BeforeAfter", "Operators"],
      cta: "Read the full case study →",
      stats: { likes: 0, comments: 0, reposts: 0 },
      hasImage: false,
    },
    {
      id: "post-riv-5",
      author: AUTHOR_MC,
      network: "twitter",
      status: "ready",
      timeLabel: "2d",
      text: ['"We just needed one place to start a draft."', "Six weeks later, 2× the cadence, same team."],
      hashtags: [],
      cta: "",
      stats: { likes: 41, comments: 2, reposts: 6 },
      hasImage: false,
    },
  ],
  "s-state-of-social": [
    {
      id: "post-sos-1",
      author: AUTHOR_JT,
      network: "linkedin",
      status: "ready",
      timeLabel: "1h",
      text: [
        "A quick operator note for B2B teams: weekly proof points build more trust than polished campaign reveals.",
        "The 2026 State of Social repeatedly emphasizes how audience trust rises when brands publish one concrete learning per week instead of one massive campaign wrap-up at the end of the quarter.",
        "If Q2 B2B Social Growth wants more repeatable reach, publish the useful lesson now, support it with one real signal from B2B Social…",
      ],
      hashtags: ["Longform", "Reports", "B2BMarketing"],
      cta: "Follow for more practical B2B content systems and repeatable editorial angles.",
      stats: { likes: 281, comments: 13, reposts: 19 },
      hasImage: false,
    },
    {
      id: "post-sos-2",
      author: AUTHOR_JT,
      network: "linkedin",
      status: "scheduled",
      scheduledForLabel: "Thu · 9:00",
      timeLabel: "yesterday",
      text: [
        "The one founder story we won't tell — and why editorial restraint is a better brand move than another launch anthem.",
        "A meta-post about why our team chooses which roadmap pieces to talk about publicly. Restraint is a feature.",
      ],
      hashtags: ["Editorial", "Founders"],
      cta: "Save this one — useful the next time you're tempted to post something just to post.",
      stats: { likes: 62, comments: 4, reposts: 2 },
      hasImage: false,
    },
  ],
  "s-weekly-recap": [
    {
      id: "post-weekly-1",
      author: AUTHOR_MC,
      network: "linkedin",
      status: "ready",
      timeLabel: "4d",
      text: [
        "Week 12 reach split: Tuesday morning 2.3× Thursday afternoon. Same length, same author, same hashtags.",
        "Timing remains the cheapest lever we have — and the one most teams stop testing after their second month.",
      ],
      hashtags: ["WeeklyRecap", "Timing"],
      cta: "",
      stats: { likes: 73, comments: 5, reposts: 3 },
      hasImage: false,
    },
  ],
};

// ---- Assistant thread seeds (per-session conversation history) -----------
//
// Each demo session gets a scripted thread so opening one looks like a
// real, mid-flight conversation instead of an empty hero. Turns mirror
// the live assistant.js shape exactly — assistant.js's seedThread()
// clones each turn, assigns a fresh id + createdAt, and drops them into
// the per-session thread map. Brand-new sessions (id === "new" or
// runtime-created) keep the default greeting → empty hero path.
//
// Ids on draft/extraction sub-items reference the actual ids in
// postsBySession / ideasBySession so the cards link back to the real
// content on click.

export const threadsBySession = {
  "s-acme-launch": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "q2-strategy-offsite-notes.pdf",
      size: "1.2mb",
      sourceId: "src-acme-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "q2-strategy-offsite-notes.pdf",
      ideas: [
        {
          id: "idea-acme-1",
          title: "The three constraints that killed our first launch",
          body: "A candid retro framed around the three bottlenecks we kept underestimating: scope, distribution, and onboarding.",
        },
        {
          id: "idea-acme-2",
          title: "Why we stopped writing quarterly OKRs",
          body: "Contrarian take grounded in the offsite notes. Frames OKRs as a lagging signal rather than a tool for focus.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Video",
      filename: "founder-keynote.mp4",
      size: "34mb",
      sourceId: "src-acme-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "founder-keynote.mp4",
      ideas: [
        {
          id: "idea-acme-3",
          title: "What a founder keynote looks like at 50 people",
          body: "Behind-the-scenes recap of the keynote, including the bits that got cut.",
        },
        {
          id: "idea-acme-4",
          title: '"Studio isn\'t about replacing the writer."',
          body: "\"Studio isn't about replacing the writer — it's about removing the blank page.\"",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Pull the strongest ideas from these and draft 4 posts across LinkedIn and X.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: 'I drafted 4 posts grounded in "The three constraints that killed our first launch". Each is sized for its network and follows the Acme · Q2 marketing playbook. Two are ready; one is past LinkedIn\'s caption limit and one is missing image dimensions — both flagged in the Drafts panel.',
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "The three constraints that killed our first launch",
      drafts: [
        {
          id: "post-acme-1",
          network: "linkedin",
          preview:
            "Your Q2 plan isn't a plan, it's a wish list — unless every objective names the single signal you'll watch weekly to prove it.",
        },
        {
          id: "post-acme-2",
          network: "linkedin",
          preview:
            "Short version of today's offsite: we stopped writing quarterly OKRs. Here's what replaced them and why the team ships faster now.",
        },
        {
          id: "post-acme-3",
          network: "linkedin",
          preview:
            "Three constraints killed our first launch: scope, distribution, and onboarding. All three were visible at the offsite — and all three were missing from the retrospective doc.",
        },
        {
          id: "post-acme-4",
          network: "linkedin",
          preview:
            "Behind-the-scenes on the founder keynote — including the parts that got cut. The cuts are more instructive than the keynote itself.",
        },
      ],
      count: 4,
      open: false,
    },
  ],
  "s-riverside": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Audio",
      filename: "riverside-discovery-call.mp3",
      size: "18mb",
      sourceId: "src-riv-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "riverside-discovery-call.mp3",
      ideas: [
        {
          id: "idea-riv-1",
          title: "Riverside's 6-week onboarding rebuild",
          body: "The arc: legacy CMS → unified Studio workflow. Three decisions that compounded, told from the customer's POV.",
        },
        {
          id: "idea-riv-2",
          title: "The metric Riverside cared about that we didn't track",
          body: "How a single discovery call reframed our success metric — and why it changed the roadmap that quarter.",
        },
        {
          id: "idea-riv-3",
          title: '"We just needed one place to start a draft."',
          body: '"We just needed one place to start a draft. Everything else followed from that."',
        },
      ],
      count: 3,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "riverside-case-study-draft.pdf",
      size: "0.8mb",
      sourceId: "src-riv-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "riverside-case-study-draft.pdf",
      ideas: [
        {
          id: "idea-riv-4",
          title: "From spreadsheet chaos to one workflow — the Riverside arc",
          body: "The before/after of consolidating four tools into one. Numbers from the case study draft: 11 hours/week reclaimed.",
        },
      ],
      count: 1,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Turn this into 5 customer-story posts — 4 LinkedIn, 1 X. Lead with their words.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: 'Drafted 5 posts grounded in "Riverside\'s 6-week onboarding rebuild". Each leads with a customer quote, names the metric, and closes with a link to the case study. One needs a longer LinkedIn body — flagged in Drafts.',
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "Riverside's 6-week onboarding rebuild",
      drafts: [
        {
          id: "post-riv-1",
          network: "linkedin",
          preview:
            "Riverside cut 11 hours a week off their content workflow. They didn't add tools — they removed three.",
        },
        {
          id: "post-riv-2",
          network: "linkedin",
          preview:
            '"We just needed one place to start a draft." — that line from the discovery call became the brief for the entire rebuild.',
        },
        {
          id: "post-riv-3",
          network: "linkedin",
          preview:
            "The metric Riverside cared about that we didn't track — until they told us. Sharing the reframe that flipped our roadmap.",
        },
        {
          id: "post-riv-4",
          network: "linkedin",
          preview:
            "Spreadsheet chaos → one workflow, in six weeks. The Riverside arc, told with the before/after metrics they tracked themselves.",
        },
        {
          id: "post-riv-5",
          network: "twitter",
          preview: '"We just needed one place to start a draft."',
        },
      ],
      count: 5,
      open: false,
    },
  ],
  "s-state-of-social": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "state-of-social-2026-report.pdf",
      size: "3.4mb",
      sourceId: "src-sos-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "state-of-social-2026-report.pdf",
      ideas: [
        {
          id: "idea-sos-1",
          title: "73% of social managers say context-switching is their #1 blocker",
          body: "Year-over-year jump in the State of Social 2026 — context-switching is now ranked above hiring and tooling cost.",
        },
        {
          id: "idea-sos-2",
          title: "The platform decline no one wants to call",
          body: "Two-year trend buried in the report: organic reach on the big-three networks is down 34% on average.",
        },
        {
          id: "idea-sos-3",
          title: "Why Gen Z marketers are leaving the funnel framework behind",
          body: "A hook framed around generational shifts the report names but doesn't unpack.",
        },
        {
          id: "idea-sos-4",
          title: "Three numbers from the 2026 report that flipped my Q3 plan",
          body: "A short-form retrospective listing three counter-intuitive findings and what I changed.",
        },
      ],
      count: 4,
      open: false,
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "Video",
      filename: "social-trends-keynote.mp4",
      size: "42mb",
      sourceId: "src-sos-2",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "social-trends-keynote.mp4",
      ideas: [
        {
          id: "idea-sos-5",
          title: '"Posting more is not strategy — it never was."',
          body: '"Posting more is not strategy — it never was. Picking the right beat is."',
        },
        {
          id: "idea-sos-6",
          title: "The one founder story we won't tell (and why)",
          body: "A meta-post about editorial restraint — when not posting is itself the brand move.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "What's the strongest thought-leadership angle in here? Draft 2 posts.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: 'The strongest signal is "73% of social managers say context-switching is their #1 blocker" — hard year-over-year delta, credible source. I drafted 2 posts: one long-form for LinkedIn, one scheduled mid-week for the founder account.',
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "73% of social managers say context-switching is their #1 blocker",
      drafts: [
        {
          id: "post-sos-1",
          network: "linkedin",
          preview:
            "A quick operator note for B2B teams: weekly proof points build more trust than polished campaign reveals.",
        },
        {
          id: "post-sos-2",
          network: "linkedin",
          preview:
            "The one founder story we won't tell — and why editorial restraint is a better brand move than another launch anthem.",
        },
      ],
      count: 2,
      open: false,
    },
  ],
  "s-weekly-recap": [
    {
      role: "assistant",
      meta: "Archie",
      text: "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source.",
    },
    {
      role: "source-intake",
      meta: "Source intake",
      kind: "PDF",
      filename: "analytics-week-12.pdf",
      size: "0.4mb",
      sourceId: "src-weekly-1",
      status: "ready",
    },
    {
      role: "assistant",
      variant: "extraction",
      meta: "Archie",
      filename: "analytics-week-12.pdf",
      ideas: [
        {
          id: "idea-weekly-1",
          title: "What week 12 told us about Tuesday vs Thursday",
          body: "Engagement split this week ran 2.3× higher on Tuesday morning than Thursday afternoon — same length, same author.",
        },
        {
          id: "idea-weekly-2",
          title: "The post we almost skipped that pulled the week",
          body: "A short retro about the post we nearly didn't publish — and the reach numbers that came out of it.",
        },
      ],
      count: 2,
      open: false,
    },
    {
      role: "user",
      meta: "You",
      text: "Draft the recap post.",
    },
    {
      role: "assistant",
      meta: "Archie",
      text: 'Drafted 1 LinkedIn post grounded in "What week 12 told us about Tuesday vs Thursday" — opens with the 2.3× delta and closes on the cheapest lever most teams stop testing.',
    },
    {
      role: "assistant",
      variant: "draft",
      meta: "Archie",
      ideaTitle: "What week 12 told us about Tuesday vs Thursday",
      drafts: [
        {
          id: "post-weekly-1",
          network: "linkedin",
          preview:
            "Week 12 reach split: Tuesday morning 2.3× Thursday afternoon. Same length, same author, same hashtags.",
        },
      ],
      count: 1,
      open: false,
    },
  ],
};

// ── Already-scheduled queue ──────────────────────────────────────────────
// Seed for the schedule modal's calendar context. Represents posts the
// user (or teammates) queued across other sessions / outside Archie — so
// the calendar dots and "N posts already scheduled" affordance feel
// populated from the first open instead of empty until the user schedules
// something themselves.
//
// Each entry is a lightweight summary: `id`, `network`, `text` (first
// line shown in the day list), `when` (epoch ms). The real queue is
// owned by the publishing backend ; this mock stands in for the GET that
// would fetch upcoming posts in a date range.
//
// The list is *seeded relative to "today"* so the calendar always shows
// upcoming activity regardless of when the prototype is opened.
function seedScheduledQueue() {
  const now = new Date();
  const at = (daysFromNow, hour, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  // Day offsets chosen to land 1–14 days out with two clusters (mid-week
  // peak around d+2 / d+9) so the calendar density reads naturally.
  return [
    {
      id: "sched-1",
      network: "linkedin",
      text: "Behind the offsite: the three constraints we keep hitting",
      when: at(1, 9, 0),
    },
    {
      id: "sched-2",
      network: "twitter",
      text: "Tiny thread on weekly proof points →",
      when: at(2, 10, 30),
    },
    {
      id: "sched-3",
      network: "linkedin",
      text: "Why we stopped writing quarterly OKRs",
      when: at(2, 14, 0),
    },
    {
      id: "sched-4",
      network: "instagram",
      text: "Team retro recap — slide carousel",
      when: at(3, 11, 0),
    },
    {
      id: "sched-5",
      network: "twitter",
      text: "Hot take: editorial restraint > another launch anthem",
      when: at(5, 17, 0),
    },
    {
      id: "sched-6",
      network: "linkedin",
      text: "One weekly operating signal — operator note",
      when: at(7, 9, 0),
    },
    {
      id: "sched-7",
      network: "facebook",
      text: "Customer story: how Acme cut content QA in half",
      when: at(8, 13, 0),
    },
    {
      id: "sched-8",
      network: "linkedin",
      text: "Founder keynote BTS — the cuts are more instructive",
      when: at(9, 12, 0),
    },
    {
      id: "sched-9",
      network: "twitter",
      text: "Three things I'd cut from your retro doc",
      when: at(9, 14, 0),
    },
    {
      id: "sched-10",
      network: "instagram",
      text: "Reel: weekly proof points in 30 seconds",
      when: at(12, 19, 0),
    },
  ];
}

export const scheduledQueue = seedScheduledQueue();

// Lookup helpers ----------------------------------------------------------------

export function getSessionById(id) {
  return recentSessions.find((s) => s.id === id) || null;
}

export function getContextById(id) {
  return contexts.find((c) => c.id === id) || null;
}

// Which component keys a context actually has — used for the dashboard row
// subtitle and the session Context tab.
export function contextComponentsFor(context) {
  if (!context) return [];
  const out = [];
  if (context.voice) out.push("Voice");
  if (context.brief) out.push("Brief");
  if (context.brand) out.push("Brand");
  return out;
}

// ── Settings drawer mocks ─────────────────────────────────────────────────
// All settings sections are mocked in-memory. Connect/disconnect, save, etc.
// flip these objects locally — no persistence.

// Mock doc lists exposed by each connector once "connected". Used by the
// Add source modal's Browse sub-screen.
export const connectorDocs = {
  slite: [
    { id: "slite-1", title: "Q2 strategy offsite — full notes", kind: "Doc", size: "8 min read", iconKey: "text" },
    { id: "slite-2", title: "Brand guidelines v3", kind: "Doc", size: "12 min read", iconKey: "text" },
    { id: "slite-3", title: "Onboarding playbook", kind: "Doc", size: "5 min read", iconKey: "text" },
    { id: "slite-4", title: "Customer interview — Acme", kind: "Doc", size: "4 min read", iconKey: "text" },
    { id: "slite-5", title: "Sales enablement deck — narrative", kind: "Doc", size: "9 min read", iconKey: "text" },
    { id: "slite-6", title: "Engineering principles", kind: "Doc", size: "6 min read", iconKey: "text" },
  ],
  notion: [
    { id: "notion-1", title: "Roadmap H2 2026", kind: "Page", size: "Updated 2d ago", iconKey: "text" },
    { id: "notion-2", title: "Hiring plan — design + eng", kind: "Page", size: "Updated 1w ago", iconKey: "text" },
    { id: "notion-3", title: "Engineering wiki — home", kind: "Page", size: "Updated 3d ago", iconKey: "text" },
    { id: "notion-4", title: "Q1 retro notes", kind: "Page", size: "Updated 1mo ago", iconKey: "text" },
    { id: "notion-5", title: "Pricing experiment results", kind: "Page", size: "Updated 4d ago", iconKey: "text" },
  ],
  gdrive: [
    { id: "gd-1", title: "Q2-pitch.pdf", kind: "PDF", size: "2.4 MB", iconKey: "pdf" },
    { id: "gd-2", title: "Customer logos.png", kind: "Image", size: "780 KB", iconKey: "image" },
    { id: "gd-3", title: "Founder keynote — rough cut.mp4", kind: "Video", size: "84 MB", iconKey: "video" },
    { id: "gd-4", title: "Pricing model.xlsx", kind: "Spreadsheet", size: "1.1 MB", iconKey: "file" },
    { id: "gd-5", title: "Brand assets/", kind: "Folder", size: "32 files", iconKey: "file" },
    { id: "gd-6", title: "Customer success stories.docx", kind: "Word", size: "640 KB", iconKey: "word" },
  ],
  slack: [
    { id: "slack-1", title: "#product-launches — last 7 days", kind: "Channel", size: "120 messages", iconKey: "text" },
    { id: "slack-2", title: "#wins — Q2 highlights", kind: "Channel", size: "48 messages", iconKey: "text" },
    { id: "slack-3", title: "DM with Lucia — messaging draft", kind: "Thread", size: "26 messages", iconKey: "text" },
    {
      id: "slack-4",
      title: "#feedback — recent customer pings",
      kind: "Channel",
      size: "60 messages",
      iconKey: "text",
    },
    { id: "slack-5", title: "#leadership — strategy thread", kind: "Thread", size: "18 messages", iconKey: "text" },
  ],
  confluence: [
    { id: "conf-1", title: "Product spec — Inbox v4", kind: "Page", size: "Updated 3d ago", iconKey: "text" },
    { id: "conf-2", title: "GTM playbook — Q3", kind: "Page", size: "Updated 1w ago", iconKey: "text" },
    { id: "conf-3", title: "Architecture decision records", kind: "Space", size: "42 pages", iconKey: "text" },
  ],
  gdocs: [
    { id: "gdocs-1", title: "Messaging house — master", kind: "Doc", size: "Updated 2d ago", iconKey: "text" },
    { id: "gdocs-2", title: "Webinar script — April", kind: "Doc", size: "6 min read", iconKey: "text" },
  ],
  dropbox: [
    { id: "dbx-1", title: "Brand kit 2026/", kind: "Folder", size: "58 files", iconKey: "file" },
    { id: "dbx-2", title: "Case study — Acme.pdf", kind: "PDF", size: "1.8 MB", iconKey: "pdf" },
  ],
  onedrive: [
    { id: "od-1", title: "Sales deck — enterprise.pptx", kind: "Slides", size: "9.2 MB", iconKey: "file" },
    { id: "od-2", title: "Quarterly report.docx", kind: "Word", size: "720 KB", iconKey: "word" },
  ],
  box: [
    { id: "box-1", title: "Legal — MSA template.pdf", kind: "PDF", size: "320 KB", iconKey: "pdf" },
    { id: "box-2", title: "Customer assets/", kind: "Folder", size: "120 files", iconKey: "file" },
  ],
  github: [
    { id: "gh-1", title: "product/roadmap — open issues", kind: "Issues", size: "37 open", iconKey: "text" },
    { id: "gh-2", title: "Release notes — v2.8.0", kind: "Release", size: "Published 4d ago", iconKey: "text" },
    { id: "gh-3", title: "PR #1284 — Inbox filters", kind: "Pull request", size: "Merged", iconKey: "text" },
  ],
  linear: [
    { id: "lin-1", title: "Cycle 41 — committed scope", kind: "Cycle", size: "22 issues", iconKey: "text" },
    { id: "lin-2", title: "ENG-902 — Live connectors", kind: "Issue", size: "In progress", iconKey: "text" },
  ],
  jira: [
    { id: "jira-1", title: "SOCIAL-1203 — Calendar revamp", kind: "Epic", size: "14 stories", iconKey: "text" },
    { id: "jira-2", title: "Sprint 58 — board", kind: "Sprint", size: "31 issues", iconKey: "text" },
  ],
  trello: [
    { id: "trello-1", title: "Content calendar — June", kind: "Board", size: "48 cards", iconKey: "text" },
    { id: "trello-2", title: "Campaign — Summer launch", kind: "List", size: "12 cards", iconKey: "text" },
  ],
  asana: [
    { id: "asana-1", title: "Launch checklist — v2.8", kind: "Project", size: "26 tasks", iconKey: "text" },
    { id: "asana-2", title: "Content ops — recurring", kind: "Project", size: "40 tasks", iconKey: "text" },
  ],
  figma: [
    { id: "fig-1", title: "Brand system — components", kind: "File", size: "Updated 1d ago", iconKey: "image" },
    { id: "fig-2", title: "Social templates — 2026", kind: "File", size: "Updated 5d ago", iconKey: "image" },
  ],
  teams: [
    { id: "teams-1", title: "Marketing — General", kind: "Channel", size: "82 messages", iconKey: "text" },
    { id: "teams-2", title: "Launch room — standup", kind: "Channel", size: "37 messages", iconKey: "text" },
  ],
  discord: [
    { id: "disc-1", title: "#community — last 7 days", kind: "Channel", size: "210 messages", iconKey: "text" },
    { id: "disc-2", title: "#feedback — feature asks", kind: "Channel", size: "64 messages", iconKey: "text" },
  ],
  hubspot: [
    { id: "hs-1", title: "Q2 pipeline — closing soon", kind: "Deals", size: "18 deals", iconKey: "text" },
    { id: "hs-2", title: "Customer testimonials — list", kind: "Contacts", size: "32 records", iconKey: "text" },
  ],
  salesforce: [
    {
      id: "sf-1",
      title: "Enterprise opportunities — open",
      kind: "Opportunities",
      size: "24 records",
      iconKey: "text",
    },
    { id: "sf-2", title: "Account — Acme Corp", kind: "Account", size: "Updated 2d ago", iconKey: "text" },
  ],
  intercom: [
    { id: "ic-1", title: "Recent conversations — billing", kind: "Conversations", size: "53 threads", iconKey: "text" },
    { id: "ic-2", title: "Help center — top articles", kind: "Articles", size: "120 articles", iconKey: "text" },
  ],
  zendesk: [
    { id: "zd-1", title: "Tickets — last 7 days", kind: "Tickets", size: "88 tickets", iconKey: "text" },
    { id: "zd-2", title: "Knowledge base — product", kind: "Articles", size: "64 articles", iconKey: "text" },
  ],
};

// Connectors catalog. Each connector behaves like a Codex-style extension:
// once connected it becomes a LIVE, queryable source (the assistant searches
// its content via a simulated MCP query — see assistant.js sendConnectorMessage).
//
// Fields:
//   category      grouping for the gallery (Docs & wikis / Storage / …)
//   featured      surfaced in the gallery's "Featured" grid
//   accent        brand color used by the monogram-tile fallback (no token —
//                 these are third-party brand identities, like social logos)
//   capabilities  MCP-tool-style verbs; shown as the connector's "tools" and
//                 replayed in the simulated "Querying … via MCP" reasoning chip
//   logo          only the four original connectors ship an SVG asset; the
//                 rest fall back to an accent monogram tile (renderConnectorLogo)
export const connectors = [
  {
    id: "slite",
    name: "Slite",
    desc: "Search and read docs from your Slite workspace",
    category: "Docs & wikis",
    featured: true,
    accent: "#3155EE",
    capabilities: ["Search docs", "Read note content", "List recent edits"],
    logo: "assets/logos/slite.svg",
    status: "connected",
    account: "matt@archie.io",
    lastSync: "just now",
  },
  {
    id: "notion",
    name: "Notion",
    desc: "Search pages and query databases in your Notion workspace",
    category: "Docs & wikis",
    featured: true,
    accent: "#111111",
    capabilities: ["Search pages", "Read page content", "Query databases"],
    logo: "assets/logos/notion.svg",
    status: "connected",
    account: "matthieu@archie.io",
    lastSync: "5 minutes ago",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    desc: "Search files and read documents across your Drive",
    category: "Storage",
    featured: true,
    accent: "#1FA463",
    capabilities: ["Search files", "Read documents", "List folders"],
    logo: "assets/logos/gdrive.svg",
    status: "disconnected",
  },
  {
    id: "slack",
    name: "Slack",
    desc: "Search messages and read channel history",
    category: "Messaging",
    accent: "#611F69",
    capabilities: ["Search messages", "Read channel history", "List channels"],
    logo: "assets/logos/slack.svg",
    status: "disconnected",
  },
  {
    id: "confluence",
    name: "Confluence",
    desc: "Search spaces and read pages from Confluence",
    category: "Docs & wikis",
    accent: "#1868DB",
    capabilities: ["Search spaces", "Read pages", "List recent updates"],
    status: "disconnected",
  },
  {
    id: "gdocs",
    name: "Google Docs",
    desc: "Search and read content from your Google Docs",
    category: "Docs & wikis",
    accent: "#1A73E8",
    capabilities: ["Search docs", "Read document content", "List comments"],
    status: "disconnected",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    desc: "Search files and read content stored in Dropbox",
    category: "Storage",
    accent: "#0061FF",
    capabilities: ["Search files", "Read file content", "List folders"],
    status: "disconnected",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    desc: "Search files and read documents from OneDrive",
    category: "Storage",
    accent: "#0364B8",
    capabilities: ["Search files", "Read documents", "List folders"],
    status: "disconnected",
  },
  {
    id: "box",
    name: "Box",
    desc: "Search files and read content stored in Box",
    category: "Storage",
    accent: "#0061D5",
    capabilities: ["Search files", "Read file content", "List folders"],
    status: "disconnected",
  },
  {
    id: "github",
    name: "GitHub",
    desc: "Search repos and read issues, PRs and releases",
    category: "Dev & project",
    featured: true,
    accent: "#24292E",
    capabilities: ["Search repos", "Read issues & PRs", "List releases"],
    status: "disconnected",
  },
  {
    id: "linear",
    name: "Linear",
    desc: "Search issues and read cycle details from Linear",
    category: "Dev & project",
    accent: "#5E6AD2",
    capabilities: ["Search issues", "Read issue details", "List cycles"],
    status: "disconnected",
  },
  {
    id: "jira",
    name: "Jira",
    desc: "Search issues and read sprint details from Jira",
    category: "Dev & project",
    accent: "#2684FF",
    capabilities: ["Search issues", "Read tickets", "List sprints"],
    status: "disconnected",
  },
  {
    id: "trello",
    name: "Trello",
    desc: "Search cards and read boards from Trello",
    category: "Dev & project",
    accent: "#0079BF",
    capabilities: ["Search cards", "Read card content", "List boards"],
    status: "disconnected",
  },
  {
    id: "asana",
    name: "Asana",
    desc: "Search tasks and read projects from Asana",
    category: "Dev & project",
    accent: "#F06A6A",
    capabilities: ["Search tasks", "Read task details", "List projects"],
    status: "disconnected",
  },
  {
    id: "figma",
    name: "Figma",
    desc: "Search files and read frame content from Figma",
    category: "Dev & project",
    accent: "#A259FF",
    capabilities: ["Search files", "Read frame content", "List comments"],
    status: "disconnected",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    desc: "Search messages and read channel posts from Teams",
    category: "Messaging",
    accent: "#4B53BC",
    capabilities: ["Search messages", "Read channel posts", "List teams"],
    status: "disconnected",
  },
  {
    id: "discord",
    name: "Discord",
    desc: "Search messages and read channel history from Discord",
    category: "Messaging",
    accent: "#5865F2",
    capabilities: ["Search messages", "Read channel history", "List servers"],
    status: "disconnected",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    desc: "Search records and read deals and contacts from HubSpot",
    category: "CRM & support",
    accent: "#FF7A59",
    capabilities: ["Search records", "Read deals & contacts", "List pipelines"],
    status: "disconnected",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    desc: "Search records and read opportunities from Salesforce",
    category: "CRM & support",
    accent: "#00A1E0",
    capabilities: ["Search records", "Read opportunities", "List accounts"],
    status: "disconnected",
  },
  {
    id: "intercom",
    name: "Intercom",
    desc: "Search conversations and read help articles from Intercom",
    category: "CRM & support",
    accent: "#1F8DED",
    capabilities: ["Search conversations", "Read tickets", "List articles"],
    status: "disconnected",
  },
  {
    id: "zendesk",
    name: "Zendesk",
    desc: "Search tickets and read conversations from Zendesk",
    category: "CRM & support",
    accent: "#03363D",
    capabilities: ["Search tickets", "Read conversations", "List articles"],
    status: "disconnected",
  },
];

export const socialAccounts = [
  {
    id: "fb-page",
    platform: "facebook",
    platformLabel: "Facebook",
    kind: "Page",
    handle: "Northwind Studio",
    photo: "assets/avatars/northwind-studio.svg",
    logo: "assets/logos/social/facebook.svg",
    status: "connected",
  },
  {
    id: "ig",
    platform: "instagram",
    platformLabel: "Instagram",
    kind: "Profile",
    handle: "@northwind.studio",
    photo: "assets/avatars/northwind-studio.svg",
    logo: "assets/logos/social/instagram.svg",
    status: "connected",
  },
  {
    id: "li",
    platform: "linkedin",
    platformLabel: "LinkedIn",
    kind: "Page",
    handle: "Northwind Studio Co.",
    photo: "assets/avatars/northwind-studio.svg",
    logo: "assets/logos/social/linkedin.svg",
    status: "connected",
  },
  {
    id: "x",
    platform: "x",
    platformLabel: "X (Twitter)",
    kind: "Profile",
    handle: "@northwindhq",
    photo: "assets/avatars/northwind-studio.svg",
    logo: "assets/logos/social/x.svg",
    status: "connected",
  },
  {
    id: "tt",
    platform: "tiktok",
    platformLabel: "TikTok",
    logo: "assets/logos/social/tiktok.svg",
    status: "disconnected",
  },
  {
    id: "yt",
    platform: "youtube",
    platformLabel: "YouTube",
    logo: "assets/logos/social/youtube.svg",
    status: "disconnected",
  },
  {
    id: "pin",
    platform: "pinterest",
    platformLabel: "Pinterest",
    logo: "assets/logos/social/pinterest.svg",
    status: "disconnected",
  },
  {
    id: "th",
    platform: "threads",
    platformLabel: "Threads",
    logo: "assets/logos/social/threads.svg",
    status: "disconnected",
  },
  {
    id: "bs",
    platform: "bluesky",
    platformLabel: "Bluesky",
    logo: "assets/logos/social/bluesky.svg",
    status: "disconnected",
  },
];
