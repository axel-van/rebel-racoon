import { TOP_POST_IMAGES } from "./top-posts.js?v=1170";

// ---- Objectives — the data an objective is read from (Insights) -------------
//
// Ported with the Insights feature. Two authored tables, both keyed
// `${contextId}::${objective label}` — the objective's identity is its label,
// the same key `objectiveMeasures` and the alert store use:
//
//   objectiveNextMoves — the ONE recommendation an objective's chat opens on
//   objectivePosts     — the posts drafted with Archie that moved it
//
// Everything else an objective needs (the metric catalogue, the baselines, the
// targets, the trends, the proxies) lives in `objective-measures.js`, because it
// is config that ships with the app rather than seed content.

// ---- Objective next moves (the loop's exit — PP key flow 4) ----------------
//
// An objective's "Work on this" door in Insights — ONE recommendation per
// objective, the way back into creation. Authored here, deterministic, the same discipline as the mock
// crawl: a demo recommendation must be credible and replayable, never generated.
// Keyed `${contextId}::${objective label}`; anything un-authored falls back to
// a generic move derived from the objective's state (objective-flow.js).
//
// `pitch` is the card's sentence — Archie talking, so first person, and it must
// CITE ITS EVIDENCE (a naked "post more" is what this feature exists to avoid).
// `opening` is Archie's first turn in the pre-loaded chat; `angles` seed the
// question picker, phrased as things the user could have typed anyway.
export const objectiveNextMoves = {
  "ctx-noba::Sales": {
    pitch: "Let's draft three more from your two winners.",
    cta: "Fix this in a chat",
    opening:
      "We're here about Sales — link clicks are at 42% of target, behind pace and slowing. The pattern is clear though: only 4 of your 41 posts carry a product and a price, and those 4 drive every click. Your jacket post did 2.4× your median. I'd start there.",
    angles: [
      { value: "Draft three product posts from my two winning posts.", label: "Draft 3 from my winners" },
      { value: "Why do so few of my posts carry a link?", label: "Why so few link posts?" },
      { value: "What should next week's product post be?", label: "Plan next week's product post" },
    ],
  },
  "ctx-acme::Brand awareness": {
    pitch: "Let's counter the slide before the pace verdict flips.",
    cta: "Fix this in a chat",
    opening:
      "Brand awareness is holding at 74% of target, but reach is down 8% on the window — the same three-week slide your feed already flagged on your own posts. Holding pace on a falling trend means the flip is a matter of weeks. Let's get ahead of it.",
    angles: [
      { value: "What changed in my posts over the last three weeks?", label: "What changed in my posts?" },
      { value: "Draft two reach-first posts for this week.", label: "Draft 2 reach-first posts" },
      { value: "Which formats are carrying my reach right now?", label: "Which formats carry reach?" },
    ],
  },
  "ctx-acme::Lead generation": {
    pitch: "Let's make more of whatever changed.",
    cta: "Double down in a chat",
    opening:
      "Lead generation is the one to copy from: link clicks at 84% of target, ahead of pace and climbing. Something in what you publish is working — let's name it and make more of it while it compounds.",
    angles: [
      { value: "What's driving my link clicks up?", label: "What's driving the climb?" },
      { value: "Draft two more posts like my best click drivers.", label: "Draft 2 more like the best" },
      { value: "Can we push the target higher?", label: "Raise the target?" },
    ],
  },
};

// ---- Archie-drafted posts per objective (Insights) --------------------------
//
// Only posts DRAFTED WITH ARCHIE and published count towards an objective — the
// section under each objective is "what Archie's work moved", not the brand's
// whole feed. No structural post↔objective link exists anywhere else (topPosts
// are account-global, carry no clicks and no metric), so the evidence is
// authored here, keyed `${contextId}::${objective label}` like objectiveNextMoves.
//
//   daysAgo   — relative to TOP_POST_TODAY, so a post lands on the trend curve
//   metricId  — the measure this post moved (one of the objective's)
//   share     — the fraction of that measure's CURRENT value the post accounts
//               for; one objective's rows sum to ≤ 0.6 (Archie never claims the
//               whole number)
//   multiple  — against the brand's 30-day median for that metric
//   figure    — the contribution, pre-formatted, as the card prints it
//   image     — the poster, for an image post: the row that renders these is the
//               winners' own (renderPostEchoRow), which shows the post's picture,
//               so an image post without one rendered a grey square beside a row
//               that had a photo
//
// Un-authored objectives fall to a deterministic generator in the Insights
// model, drawing sentences from objectivePostPool below.
export const objectivePosts = {
  "ctx-noba::Sales": [
    {
      id: "ap-noba-sales-1",
      network: "instagram",
      daysAgo: 10,
      mediaType: "image",
      image: TOP_POST_IMAGES[0],
      excerpt: "“The jacket we almost didn't make — and the 40 people who talked us into it.”",
      metricId: "clicks",
      share: 0.25,
      multiple: 2.4,
      figure: "31 clicks",
    },
    {
      id: "ap-noba-sales-2",
      network: "facebook",
      daysAgo: 23,
      mediaType: "text",
      excerpt: "“Three ways to wear the same coat for ten years.”",
      metricId: "clicks",
      share: 0.17,
      multiple: 1.8,
      figure: "22 clicks",
    },
    {
      id: "ap-noba-sales-3",
      network: "instagram",
      daysAgo: 4,
      mediaType: "image",
      image: TOP_POST_IMAGES[1],
      excerpt: "Linen, cashmere, and the one question we ask before adding a piece.",
      metricId: "clicks",
      share: 0.09,
      multiple: 1.3,
      figure: "12 clicks",
    },
  ],
  "ctx-acme::Brand awareness": [
    {
      id: "ap-acme-aware-1",
      network: "linkedin",
      daysAgo: 11,
      mediaType: "document",
      excerpt: "What our busiest customer taught us about scheduling.",
      metricId: "reach",
      share: 0.22,
      multiple: 1.9,
      figure: "+3,300 reach",
    },
    {
      id: "ap-acme-aware-2",
      network: "x",
      daysAgo: 17,
      mediaType: "text",
      excerpt: "The thread that got quoted by three newsletters.",
      metricId: "mentions",
      share: 0.23,
      multiple: 2.2,
      figure: "11 mentions",
    },
    {
      id: "ap-acme-aware-3",
      network: "instagram",
      daysAgo: 21,
      mediaType: "image",
      image: TOP_POST_IMAGES[2],
      excerpt: "A week of posts, one honest retro.",
      metricId: "reach",
      share: 0.08,
      multiple: 1.4,
      figure: "+1,200 reach",
    },
    {
      id: "ap-acme-aware-4",
      network: "linkedin",
      daysAgo: 28,
      mediaType: "text",
      excerpt: "Our take on the platform pricing change.",
      metricId: "mentions",
      share: 0.15,
      multiple: 1.5,
      figure: "7 mentions",
    },
  ],
  "ctx-acme::Lead generation": [
    {
      id: "ap-acme-lead-1",
      network: "linkedin",
      daysAgo: 14,
      mediaType: "text",
      excerpt: "The workflow we stopped recommending — and what replaced it.",
      metricId: "clicks",
      share: 0.21,
      multiple: 2.1,
      figure: "27 clicks",
    },
    {
      id: "ap-acme-lead-2",
      network: "instagram",
      daysAgo: 27,
      mediaType: "document",
      excerpt: "Three numbers from last quarter we didn't expect.",
      metricId: "clicks",
      share: 0.15,
      multiple: 1.6,
      figure: "19 clicks",
    },
    {
      id: "ap-acme-lead-3",
      network: "linkedin",
      daysAgo: 6,
      mediaType: "text",
      excerpt: "Book a demo, or read how a 12-person team runs approvals in one afternoon.",
      metricId: "clicks",
      share: 0.12,
      multiple: 1.5,
      figure: "15 clicks",
    },
  ],
  "ctx-customer::Brand awareness": [
    {
      id: "ap-customer-aware-1",
      network: "linkedin",
      daysAgo: 8,
      mediaType: "document",
      excerpt: "“We cut approval time from 4 days to 6 hours.” — the full interview, in their words.",
      metricId: "reach",
      share: 0.18,
      multiple: 1.7,
      figure: "+1,900 reach",
    },
    {
      id: "ap-customer-aware-2",
      network: "instagram",
      daysAgo: 19,
      mediaType: "image",
      image: TOP_POST_IMAGES[3],
      excerpt: "One team, one calendar, zero Slack threads about who posts what.",
      metricId: "reach",
      share: 0.11,
      multiple: 1.3,
      figure: "+1,100 reach",
    },
  ],
  "ctx-founder-voice::Build personal brand": [
    {
      id: "ap-founder-brand-1",
      network: "linkedin",
      daysAgo: 5,
      mediaType: "text",
      excerpt: "Unpopular opinion: your content calendar is why your content is boring.",
      metricId: "followersNet",
      share: 0.24,
      multiple: 2.6,
      figure: "+300 followers",
    },
    {
      id: "ap-founder-brand-2",
      network: "linkedin",
      daysAgo: 13,
      mediaType: "text",
      excerpt: "I ran a 40-person marketing team. Here is the one meeting I would keep.",
      metricId: "engagementRate",
      share: 0.2,
      multiple: 1.9,
      figure: "7.8% engagement",
    },
    {
      id: "ap-founder-brand-3",
      network: "x",
      daysAgo: 24,
      mediaType: "text",
      excerpt: "The advice I got at 25 that I would now un-give.",
      metricId: "followersNet",
      share: 0.1,
      multiple: 1.4,
      figure: "+120 followers",
    },
  ],
  "ctx-agorapulse::Product adoption": [
    {
      id: "ap-agp-adopt-1",
      network: "linkedin",
      daysAgo: 9,
      mediaType: "document",
      excerpt: "How a five-person agency runs eleven client calendars from one inbox.",
      metricId: "clicks",
      share: 0.22,
      multiple: 2.0,
      figure: "28 clicks",
    },
    {
      id: "ap-agp-adopt-2",
      network: "x",
      daysAgo: 18,
      mediaType: "text",
      excerpt: "Approval workflows in 60 seconds. No, really — here is the clip.",
      metricId: "clicks",
      share: 0.14,
      multiple: 1.5,
      figure: "18 clicks",
    },
  ],
};

// The generator's sentence pool for un-authored objectives — one list per
// metric so a followers post never reads like a clicks post, and a `default`
// for metrics with no list. Indexed deterministically by the objective's key.
export const objectivePostPool = {
  reach: [
    "The one chart from our quarterly review we could not stop sharing.",
    "What we learned from the post that outperformed everything else this month.",
    "A behind-the-scenes look at how the work actually gets made.",
    "Five things our customers say that we finally wrote down.",
  ],
  mentions: [
    "Our honest take on the change everyone in the industry is discussing.",
    "The thread that started an argument — and the part we got wrong.",
    "We asked twelve peers one question. Here are the answers, unedited.",
  ],
  clicks: [
    "The workflow we stopped recommending — and what replaced it.",
    "Three numbers from last quarter we did not expect. Full breakdown at the link.",
    "The case study our sales team keeps asking for, now written up.",
    "A 90-second walkthrough of the feature people ask about most.",
  ],
  followersNet: [
    "Unpopular opinion, backed by eight years of doing it the other way.",
    "The one meeting I would keep if I could only keep one.",
    "What I would tell a first-time manager about their first bad quarter.",
  ],
  engagementRate: [
    "A question we still do not have a good answer to. Curious what you think.",
    "Two ways to read the same result — which one is yours?",
    "The mistake that taught us the most this year.",
  ],
  comments: [
    "Which of these three would you cut first? Genuinely undecided.",
    "We changed our mind on this. Tell us where we are still wrong.",
  ],
  savesShares: [
    "The checklist we run before every launch, in one image.",
    "Everything we know about the topic, in the order we wish we had learned it.",
  ],
  videoViews: [
    "Sixty seconds inside a day that usually takes a week.",
    "The clip our team replays before every kickoff.",
  ],
  sentiment: [
    "Thank you for the feedback that stung. Here is what changed because of it.",
    "A note to the customers who stuck with us through the rough patch.",
  ],
  default: [
    "A post drafted from this month's strongest source, published on the plan.",
    "The idea Archie pulled from your notes and turned into a post.",
    "One clear point, one honest example, one ask.",
  ],
};
