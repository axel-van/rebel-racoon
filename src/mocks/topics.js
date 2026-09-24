// The Topic Feed: one listening feed per Playbook, and the Topics themselves.
// Seed data only — no network, no persistence, no randomness.
// Re-exported by ../mocks.js, which stays the single import path.

// ---- Topic feeds + Topics (the listening feature) -------------------------
//
// A FEED is one Playbook's standing query: which sources it watches, how often,
// and which sites the Brand-website source reads. Two are seeded; every other
// Playbook gets one provisioned on first read (topic-feeds-store), so nobody
// ever meets a screen asking them to set listening up before anything happens.
//
// A TOPIC is what a scan assembled: a headline, an article in two sections, and
// the posts the article was written from. `kind` is the segment it lands in and
// comes from the scan alone — "ready" is draftable now, "later" is a theme worth
// keeping. `isTrending` / `isUpdated` are the two attention signals, and they are
// independent of `seedStatus`: a Topic can be Used and trending at once. Signals
// only apply inside the first age group, and topics-store enforces that on read
// rather than trusting what is written here.
//
// `ageLabel` is a relative phrase, not a date — a prototype has no clock worth
// trusting, and authored dates rot as the file ages. It is the ONLY age input:
// the card's "2d ago" and the group it sits under both derive from it, so the two
// cannot disagree. topics-store.ageMinutes is the seam to replace with real
// timestamps.
//
// `seedStatus` gives the landing feed a real triage spread rather than twenty-one
// identical To-review rows, and `seedReason` carries the sentence a reader typed
// when they ignored one — the Ignored state is meaningless without it.
//
// `posts[].author.accent` is a semantic avatar tint resolved in
// social-post-card.css — never a hex. Zero engagement counts are OMITTED rather
// than written as 0: the card prints labelled figures, and "0 reposts" is worse
// than nothing.

export const topicFeeds = [
  {
    id: "feed-acme",
    name: "Acme competitors · weekly",
    playbookId: "ctx-acme",
    sources: ["competitor-posts"],
    websites: ["https://acme.example.com"],
    cadence: "weekly",
  },
  {
    id: "feed-founder",
    name: "Category product moves · monthly",
    playbookId: "ctx-founder-voice",
    sources: ["competitor-posts"],
    websites: ["https://acme.example.com"],
    cadence: "monthly",
  },
  // The four real lanes, one per real-brand Playbook. "notify" and "showTrending"
  // are dropped: this repo has no per-feed notification or trending toggle.
  {
    id: "topic-list-7",
    name: "Modular & timber competitors · last 30 days",
    playbookId: "ctx-dwelling",
    sources: ["competitor-posts"],
    cadence: "monthly",
    websites: ["https://www.thedwellingcompany.com/"],
  },
  {
    id: "topic-list-4",
    name: "Carlsbad competitors · last 30 days",
    playbookId: "ctx-alliance-bjj",
    sources: ["competitor-posts"],
    cadence: "monthly",
    websites: ["https://alliancejiujitsucarlsbad.com"],
  },
  {
    id: "topic-list-6",
    name: "Competitor product moves",
    playbookId: "ctx-agorapulse",
    sources: ["competitor-posts", "influencer-posts", "industry-trends", "brand-website"],
    cadence: "monthly",
    websites: ["https://www.agorapulse.com/", "https://www.agorapulse.com/blog/"],
  },
  {
    id: "topic-list-5",
    name: "Belgian multibrand competitors · last 30 days",
    playbookId: "ctx-noba",
    sources: ["competitor-posts"],
    cadence: "monthly",
    websites: ["https://www.nobalifestyle.com/", "https://www.nobalifestyle.com/blog"],
  },
];

export const topics = [
  {
    id: "topic-acme-1",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "2h ago",
    kind: "ready",
    headline: "Linear's least-produced post of the quarter beat everything they shipped",
    summary:
      "A plain-text note about cutting their own roadmap outperformed three launch videos and a redesign announcement. The engagement is on the admission, not the news.",
    relevance:
      "Marketing leads at this size own both the launch calendar and the production budget, so evidence that the cheapest asset beat the expensive ones changes what they commission next. It lands hardest on a team about to spend a quarter's video budget.",
    whyNow:
      "The highest-engagement post in the whole window, and the gap over the launch assets beside it is not close.",
    isTrending: true,
    article: {
      title: "Linear's least-produced post of the quarter beat everything they shipped",
      subheads: ["What actually got shared", "The version Acme can write"],
      paragraphs: [
        "Linear published four things this quarter that cost real production money: two launch films, an interactive changelog and a redesigned pricing page. The post that beat all four was seven sentences of plain text explaining why they deleted their public roadmap.",
        "The comments are not about roadmaps. They are operators saying they have the same problem and have never seen anyone say it out loud. The post works because it names a decision the reader has been putting off, and then shows the cost of making it.",
        "Acme has the same shape of story sitting unused: the Q2 scope cut. Same admission, same audience, and a number attached — three weeks of build handed back. The format is a text post, not a film.",
      ],
    },
    posts: [
      {
        id: "topic-acme-1-p1",
        network: "linkedin",
        publishedOn: "2 days ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "We deleted our public roadmap. It was generating more support load than trust — every date became a promise someone quoted back to us. Here is what we do instead.",
        likes: 1840,
        comments: 212,
        reposts: 96,
      },
      {
        id: "topic-acme-1-p2",
        network: "x",
        publishedOn: "3 days ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "Shipping a roadmap is easy. Being held to one is the part nobody prices in.",
        likes: 920,
        comments: 64,
        reposts: 140,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3 weeks ago",
        note: "Surfaced from the weekly competitor scan (4 matching posts).",
      },
      {
        status: "updated",
        when: "12 days ago",
        note: "Rewritten — two more posts joined it and the engagement read changed.",
      },
      {
        status: "used",
        when: "9 days ago",
        note: "Drafted into a chat — the roadmap-transparency post.",
      },
      {
        status: "trending",
        when: "4 days ago",
        note: "Running 3.1x its own median. Flagged for a second look.",
      },
      {
        status: "new",
        when: "2h ago",
        note: "Surfaced from the weekly competitor scan (9 matching posts). Ranked on engagement against Linear's own median.",
      },
    ],
  },
  {
    id: "topic-acme-2",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "5h ago",
    kind: "ready",
    headline: "Notion is using templates as onboarding and calling it content",
    summary:
      "Every template launch this month ends in a setup flow rather than a download. The content team is doing activation work under a marketing label.",
    relevance:
      "Operators here usually run activation and content with the same two people, so a competitor collapsing both into one artefact is a staffing argument as much as a content one.",
    whyNow: "Six template launches this month, every one ending in a setup flow rather than a download.",
    article: {
      title: "Notion is using templates as onboarding and calling it content",
      subheads: ["The pattern across six launches", "Why it matters for Q2"],
      paragraphs: [
        "Six template posts in four weeks, and none of them end at the template. Each one opens a workspace with the structure already built, which means the reader's first action is using the product rather than saving a file.",
        "The marketing value is secondary. What they are buying is a first session that already contains the customer's own data, which is the hardest thing to manufacture in a trial.",
        "Acme's Q2 launch has the same opportunity and currently ships a PDF. The change is not a content change; it is deciding that the asset opens the product.",
      ],
    },
    posts: [
      {
        id: "topic-acme-2-p1",
        network: "linkedin",
        publishedOn: "4 days ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "New template: the quarterly planning workspace we use internally. It opens with your team already in it.",
        likes: 2400,
        comments: 88,
        reposts: 310,
      },
      {
        id: "topic-acme-2-p2",
        network: "x",
        publishedOn: "6 days ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Templates are the shortest path from 'interesting' to 'in use'.",
        likes: 610,
        comments: 22,
        reposts: 74,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5h ago",
        note: "Surfaced from the weekly competitor scan (6 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-3",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "1d ago",
    kind: "ready",
    headline: "The homepage teardowns keep failing on the same three things",
    summary:
      "Anthony Pierri has published five teardowns this month. Every one flags a missing subject, a feature list where an outcome should be, and a headline that could belong to any competitor.",
    relevance:
      "Every marketing lead at this stage has a homepage they inherited and suspect is wrong. A named, repeated list of failures is the rare kind of feedback they can act on without hiring anyone.",
    whyNow: "Five teardowns from one author this month, and all three failures appear in every single one.",
    isUpdated: true,
    article: {
      title: "The homepage teardowns keep failing on the same three things",
      subheads: ["The three failures, in order", "What Acme's own page does"],
      paragraphs: [
        "Five teardowns, five identical opening notes: the page does not say who it is for, the hero sells a feature set rather than an outcome, and the headline survives a find-and-replace of the company name.",
        "The third one is the useful test. If a competitor could paste their logo onto your hero and nothing would read as false, the hero is not positioning — it is category description.",
        "Acme's page fails the third test today. The fix is one sentence, and the customer quote from the Q2 beta already contains it.",
      ],
    },
    posts: [
      {
        id: "topic-acme-3-p1",
        network: "linkedin",
        publishedOn: "1 day ago",
        author: { name: "Anthony Pierri", handle: "@anthonypierri", initials: "AP", accent: "orange" },
        text: "Teardown #47. Same three problems as #46, #45 and #44. Nobody on the page. No outcome in the hero. A headline that fits every company in the category.",
        likes: 1520,
        comments: 140,
        reposts: 68,
      },
      {
        id: "topic-acme-3-p2",
        network: "linkedin",
        publishedOn: "5 days ago",
        author: { name: "Anthony Pierri", handle: "@anthonypierri", initials: "AP", accent: "orange" },
        text: "If your competitor can swap their logo into your hero and it still reads true, you have written the category, not the product.",
        likes: 3100,
        comments: 201,
        reposts: 240,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "6 days ago",
        note: "Surfaced from the weekly competitor scan (3 matching posts).",
      },
      {
        status: "updated",
        when: "1d ago",
        note: "Rewritten — a fifth teardown landed and the pattern held.",
      },
    ],
  },
  {
    id: "topic-acme-4",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "2d ago",
    kind: "ready",
    headline: "Basecamp is arguing against tools its buyers already pay for",
    summary:
      "Three posts in two weeks position their product as the thing you adopt instead of the stack you have. The argument is subtraction, and it is landing.",
    relevance:
      "A subtraction pitch is tempting for a small team with a narrow product and dangerous for one selling into an existing stack. Whoever owns Acme's positioning has to decide which of those it is.",
    whyNow: "Three posts in two weeks from one account, with the engagement on the argument rather than the product.",
    article: {
      title: "Basecamp is arguing against tools its buyers already pay for",
      subheads: ["Subtraction as a pitch", "The risk in copying it"],
      paragraphs: [
        "Basecamp's last three posts do not compare features. They count tools: how many the reader is paying for, how many they opened yesterday, how many their team can name. The product is positioned as the one that replaces four.",
        "It works because the reader can verify the count themselves in about ten seconds, and because it makes the incumbent's strength — breadth — into the problem.",
        "Acme cannot make this argument without a migration story, and does not have one yet. Worth knowing which of our own comparisons rest on breadth.",
      ],
    },
    posts: [
      {
        id: "topic-acme-4-p1",
        network: "linkedin",
        publishedOn: "6 days ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "Count the tools your team pays for. Now count the ones anyone opened this week. That gap is the pitch.",
        likes: 1200,
        comments: 96,
        reposts: 140,
      },
      {
        id: "topic-acme-4-p2",
        network: "x",
        publishedOn: "9 days ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "We are not trying to be in your stack. We are trying to be most of it.",
        likes: 740,
        comments: 40,
        reposts: 88,
      },
    ],
    seedStatus: "used",
    history: [
      {
        status: "new",
        when: "2d ago",
        note: "Surfaced from the weekly competitor scan (7 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-5",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "3d ago",
    kind: "ready",
    headline: "Launch copy swapped time saved for time to value this quarter",
    summary:
      "Across fourteen B2B launches this month, the headline metric moved from hours saved to days-until-working. The claim is easier to prove and harder to dismiss.",
    relevance:
      "The headline metric on a launch is the one thing a marketing lead cannot delegate, so a category-wide shift in which number gets used is a direct edit to copy already drafted.",
    whyNow: "Fourteen B2B launches inside the month, and the wording moved on nearly all of them.",
    article: {
      title: "Launch copy swapped time saved for time to value this quarter",
      subheads: ["What changed in the wording", "Which one Acme can evidence"],
      paragraphs: [
        "Hours saved is a claim about a counterfactual, and buyers have learned to discount it. Time to value is a claim about a calendar, and it can be checked against their own onboarding.",
        "Eleven of the fourteen launches led with a number of days. Three still led with hours saved, and all three were the ones without a customer named in the post.",
        "Acme has the days number from the Q2 beta and is not using it. It is also the only one of the two claims our own data actually supports.",
      ],
    },
    posts: [
      {
        id: "topic-acme-5-p1",
        network: "linkedin",
        publishedOn: "4 days ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "Stop selling hours saved. Nobody believes the baseline. Sell the date the thing starts working.",
        likes: 2800,
        comments: 150,
        reposts: 190,
      },
      {
        id: "topic-acme-5-p2",
        network: "x",
        publishedOn: "1 week ago",
        author: { name: "Lenny's Newsletter", handle: "@lennysan", initials: "LN", accent: "soft-blue" },
        text: "The best launch copy this month all had a number of days in it, not a percentage.",
        likes: 1400,
        comments: 58,
        reposts: 120,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3d ago",
        note: "Surfaced from the weekly competitor scan (14 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-6",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "4d ago",
    kind: "ready",
    headline: "Elena Verna's growth posts have stopped mentioning funnels",
    summary:
      "Six weeks of posts, no funnel diagrams, no stage names. The framing is now a single question about whether the product gets used in week one.",
    relevance:
      "Operators at this size inherited the funnel vocabulary and still report against it. A widely-followed practitioner dropping it is a signal about which language now reads as dated.",
    whyNow: "Six consecutive weeks of posts with no funnel diagram and no stage names.",
    article: {
      title: "Elena Verna's growth posts have stopped mentioning funnels",
      subheads: ["What replaced the funnel", "The version for Acme's audience"],
      paragraphs: [
        "The funnel was a way of talking about a pipeline to people who own a pipeline. The new framing is about the first week of use, which is the thing an operator can actually change on their own.",
        "It also removes the argument about stage definitions, which is where most of these posts used to end up in the comments.",
        "Acme's audience is operators at 50 to 200 people. They have the same problem and no growth team to hand it to.",
      ],
    },
    posts: [
      {
        id: "topic-acme-6-p1",
        network: "linkedin",
        publishedOn: "5 days ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "I have stopped drawing funnels. The only question that predicted retention in any company I worked with: did they use it in week one.",
        likes: 4200,
        comments: 300,
        reposts: 410,
      },
      {
        id: "topic-acme-6-p2",
        network: "x",
        publishedOn: "2 weeks ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "Week-one usage beats every acquisition metric on the dashboard.",
        likes: 1100,
        comments: 44,
        reposts: 96,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "4d ago",
        note: "Surfaced from the weekly competitor scan (8 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-7",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "6d ago",
    kind: "ready",
    headline: "Linear ships its changelog as marketing and nobody files it as marketing",
    summary:
      "The changelog reads like a product diary, gets shared like an essay, and carries more reach than the paid campaign running beside it.",
    relevance:
      "A changelog is one of the few assets a 50–200-person team already produces for other reasons, so the only real question is whether it can carry reach without new headcount.",
    whyNow: "Its reach beats the paid campaign running alongside it, on the same account in the same week.",
    article: {
      title: "Linear ships its changelog as marketing and nobody files it as marketing",
      subheads: ["Why it travels", "What it costs to run"],
      paragraphs: [
        "Each entry names the person who shipped it and the reason it was worth shipping. That second half is what makes it shareable: it is a decision, not a diff.",
        "The reach comes from engineers reposting their own work, which is a distribution channel the marketing team does not have to buy or brief.",
        "The cost is a writing habit, not a budget line. Acme ships weekly and writes none of it down.",
      ],
    },
    posts: [
      {
        id: "topic-acme-7-p1",
        network: "x",
        publishedOn: "1 week ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "Changelog: sub-issues now roll up estimates to the parent. Small thing. Asked for 300 times.",
        likes: 980,
        comments: 36,
        reposts: 124,
      },
      {
        id: "topic-acme-7-p2",
        network: "linkedin",
        publishedOn: "10 days ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "Our changelog is the most-read page we have. It was never meant to be.",
        likes: 1650,
        comments: 110,
        reposts: 88,
      },
    ],
    seedStatus: "used",
    history: [
      {
        status: "new",
        when: "6d ago",
        note: "Surfaced from the weekly competitor scan (11 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-8",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "7d ago",
    kind: "later",
    headline: "Every launch this week led with a number and two named the task",
    summary:
      "Nine launches, nine headline metrics, and only two that said which job stops arriving. The gap between claim and task is the opening.",
    relevance:
      "The gap between a claim and a named task is the cheapest positioning fix available to a team with no research budget: it is a rewrite, not a repositioning.",
    whyNow: "Nine launches in one week, and only two of the nine named the job that stops arriving.",
    article: {
      title: "Every launch this week led with a number and two named the task",
      subheads: ["The nine claims", "The two that landed"],
      paragraphs: [
        "Percentages, multiples and hours, all in the hero. None of them wrong, and seven of them impossible to picture. A number without a task attached is a benchmark, not a benefit.",
        "The two that named the task — one about weekly reporting, one about invoice chasing — were also the two with a customer quote in the first screen.",
        "Acme's Q2 hero currently has the number and not the task. Both are already in the beta feedback.",
      ],
    },
    posts: [
      {
        id: "topic-acme-8-p1",
        network: "linkedin",
        publishedOn: "1 week ago",
        author: { name: "Dave Gerhardt", handle: "@davegerhardt", initials: "DG", accent: "yellow" },
        text: "Your metric is not a benefit. Tell me which meeting disappears.",
        likes: 2200,
        comments: 180,
        reposts: 150,
      },
      {
        id: "topic-acme-8-p2",
        network: "x",
        publishedOn: "9 days ago",
        author: { name: "Anthony Pierri", handle: "@anthonypierri", initials: "AP", accent: "orange" },
        text: "Nine launches this week. Two of them told me what stops landing in my inbox.",
        likes: 860,
        comments: 30,
        reposts: 70,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "7d ago",
        note: "Surfaced from the weekly competitor scan (9 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-9",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "9d ago",
    kind: "ready",
    headline: "Notion's customer stories count hours and never mention headcount",
    summary:
      "Four stories this month, every one with a time figure and none with a team size. The claim is deliberately portable across company stages.",
    relevance:
      "Marketing leads writing their first customer stories have to choose which figure to lead on, and portability across company stages is exactly the constraint they are under.",
    whyNow: "Four stories this month, a time figure in every one and a team size in none.",
    article: {
      title: "Notion's customer stories count hours and never mention headcount",
      subheads: ["The choice they made", "Where it leaves a gap"],
      paragraphs: [
        "Headcount dates a story: a reader at 60 people discounts a story about a team of 400. Hours do not have that problem, so one story serves every segment.",
        "The cost is that none of the stories prove the product works at scale — which is exactly the objection Acme hears in its own late-stage calls.",
        "Naming the stage is a differentiator here rather than a limitation, because Acme's audience is one stage and can be addressed directly.",
      ],
    },
    posts: [
      {
        id: "topic-acme-9-p1",
        network: "linkedin",
        publishedOn: "11 days ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "How one team cut 11 hours a week out of planning. No new tools, no new hires.",
        likes: 1900,
        comments: 74,
        reposts: 160,
      },
      {
        id: "topic-acme-9-p2",
        network: "linkedin",
        publishedOn: "2 weeks ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Six hours back, every week, on reporting alone.",
        likes: 1350,
        comments: 48,
        reposts: 90,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "9d ago",
        note: "Surfaced from the weekly competitor scan (4 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-10",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "11d ago",
    kind: "later",
    headline: "The same pricing-page question keeps coming back in Lenny's threads",
    summary:
      "Three threads in a month, all asking when to show pricing. The consensus is not a rule — it is that hiding it costs you the people who would have self-served.",
    relevance:
      "Whether to publish pricing is a decision an operator makes once and then lives with, usually without data. Three threads of practitioner consensus is the closest thing available.",
    whyNow: "Three separate threads inside a month, all circling the same question.",
    article: {
      title: "The same pricing-page question keeps coming back in Lenny's threads",
      subheads: ["What the threads agree on", "What Acme's page does today"],
      paragraphs: [
        "Nobody in the threads defends a hidden price on principle. The defence is always operational: the packaging is not ready, or sales wants the conversation.",
        "The counter-argument that lands is a number — the share of qualified traffic that leaves without contacting anyone. Two people posted theirs.",
        "Acme hides pricing and does not measure that share. It is a one-week measurement, not a redesign.",
      ],
    },
    posts: [
      {
        id: "topic-acme-10-p1",
        network: "linkedin",
        publishedOn: "12 days ago",
        author: { name: "Lenny's Newsletter", handle: "@lennysan", initials: "LN", accent: "soft-blue" },
        text: "Third thread this month on whether to show pricing. Same conclusion: you are not protecting a conversation, you are losing the people who never wanted one.",
        likes: 3400,
        comments: 420,
        reposts: 280,
      },
      {
        id: "topic-acme-10-p2",
        network: "x",
        publishedOn: "3 weeks ago",
        author: { name: "Lenny's Newsletter", handle: "@lennysan", initials: "LN", accent: "soft-blue" },
        text: "'Contact us' is a pricing page for exactly one buyer.",
        likes: 1250,
        comments: 60,
        reposts: 130,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "11d ago",
        note: "Surfaced from the weekly competitor scan (3 matching threads).",
      },
    ],
  },
  {
    id: "topic-acme-11",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "13d ago",
    kind: "ready",
    headline: "Basecamp's no-demo stance is positioning, not a support decision",
    summary:
      "They repeat it often enough that it now reads as a claim about the product: if it needed a demo, it would be the wrong product.",
    relevance:
      "Removing the demo reaches sales, onboarding and the homepage at once, which makes it a leadership call rather than a marketing one.",
    whyNow:
      "Repeated often enough across the window that it has stopped reading as a policy and started reading as a claim.",
    article: {
      title: "Basecamp's no-demo stance is positioning, not a support decision",
      subheads: ["The claim underneath", "Whether it is copyable"],
      paragraphs: [
        "Refusing demos looks like an operations choice and functions as a product claim. Every repetition says the same thing — this is simple enough that a call would waste your afternoon.",
        "It only works with a price low enough to self-serve and an onboarding that survives no hand-holding. Both are prerequisites, not consequences.",
        "Acme has neither yet, which makes this a topic to watch rather than one to answer.",
      ],
    },
    posts: [
      {
        id: "topic-acme-11-p1",
        network: "linkedin",
        publishedOn: "2 weeks ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "We still do not do demos. If you need one to understand it, we built it wrong.",
        likes: 2600,
        comments: 340,
        reposts: 190,
      },
      {
        id: "topic-acme-11-p2",
        network: "x",
        publishedOn: "3 weeks ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "No demo. No onboarding call. No implementation partner. That is the feature.",
        likes: 1480,
        comments: 120,
        reposts: 210,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "13d ago",
        note: "Surfaced from the weekly competitor scan (5 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-12",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "16d ago",
    kind: "later",
    headline: "Launch weeks are getting shorter and considerably louder",
    summary:
      "The median B2B launch this quarter ran three days, down from a fortnight last year, with roughly the same volume of posts compressed into it.",
    relevance:
      "Launch cadence is one of the few things a marketing lead controls outright, so a compressed median gives them either a reason to match it or a reason to do the opposite.",
    whyNow:
      "The median launch this quarter ran three days against a fortnight a year ago, with the same volume of posts inside it.",
    article: {
      title: "Launch weeks are getting shorter and considerably louder",
      subheads: ["What the compression does", "The quieter option"],
      paragraphs: [
        "Three days of everything at once buys a spike and spends the whole audience at once. The posts after day three land on people who have already decided.",
        "Two of the launches tracked did the opposite — one artefact a week for five weeks — and both held attention longer, with lower peaks.",
        "Acme's Q2 plan is currently a three-day shape. The five-week shape costs the same and is easier to staff.",
      ],
    },
    posts: [
      {
        id: "topic-acme-12-p1",
        network: "linkedin",
        publishedOn: "2 weeks ago",
        author: { name: "Dave Gerhardt", handle: "@davegerhardt", initials: "DG", accent: "yellow" },
        text: "Launch week is now launch Tuesday. Everyone is shouting on the same day and wondering why reach is down.",
        likes: 1750,
        comments: 130,
        reposts: 110,
      },
      {
        id: "topic-acme-12-p2",
        network: "x",
        publishedOn: "3 weeks ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "A launch is a distribution problem you can spread over a month, or a spike you can spend in a day.",
        likes: 990,
        comments: 42,
        reposts: 84,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "16d ago",
        note: "Surfaced from the weekly competitor scan (12 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-13",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "19d ago",
    kind: "ready",
    headline: "Linear's hiring posts do more brand work than its advertising",
    summary:
      "Role descriptions written as opinions about how work should go, shared by people who are not job-hunting. The reach is several times the paid posts beside them.",
    relevance:
      "Hiring posts are written by people who do not report to marketing, which makes this a question about who is allowed to publish rather than about content.",
    whyNow: "Reach several times the paid posts published beside them, on the same account.",
    article: {
      title: "Linear's hiring posts do more brand work than its advertising",
      subheads: ["Why a job post travels", "The transferable part"],
      paragraphs: [
        "The posts are not lists of requirements. Each opens with a position on the craft — what good looks like, what they refuse to do — and the role follows from it.",
        "That makes them readable by people with no intention of applying, which is where the reach comes from.",
        "Acme is hiring two roles this quarter and writing both as requirement lists.",
      ],
    },
    posts: [
      {
        id: "topic-acme-13-p1",
        network: "linkedin",
        publishedOn: "3 weeks ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "We are hiring a designer. First, what we believe about design reviews — because if you disagree, the rest will not fit.",
        likes: 2100,
        comments: 88,
        reposts: 175,
      },
      {
        id: "topic-acme-13-p2",
        network: "x",
        publishedOn: "4 weeks ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "Job posts are positioning documents that happen to end in a form.",
        likes: 680,
        comments: 26,
        reposts: 90,
      },
    ],
    seedStatus: "ignored",
    seedReason: "We don't comment on other companies' hiring.",
    history: [
      {
        status: "new",
        when: "19d ago",
        note: "Surfaced from the weekly competitor scan (6 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-14",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "22d ago",
    kind: "ready",
    headline: "Dave Gerhardt's message-testing thread has become a template",
    summary:
      "A five-step way to test positioning on sales calls before it reaches a homepage. It is being reposted as a process rather than an opinion.",
    relevance:
      "Testing positioning on sales calls before it reaches a homepage is a process a two-person team can actually run, which is rare among positioning advice.",
    whyNow: "Reposted as a process rather than as an opinion, which is what separates a template from a thread.",
    article: {
      title: "Dave Gerhardt's message-testing thread has become a template",
      subheads: ["The five steps", "Where Acme could run it"],
      paragraphs: [
        "Write three versions of the claim, use each one on the next ten calls, and record which sentence the prospect repeats back. The winner is the one they say, not the one they rate.",
        "The mechanism is that repetition is behaviour and preference is a survey answer. Only one of those predicts anything.",
        "Acme has thirty Q2 beta calls booked, which is three times what the method needs.",
      ],
    },
    posts: [
      {
        id: "topic-acme-14-p1",
        network: "linkedin",
        publishedOn: "3 weeks ago",
        author: { name: "Dave Gerhardt", handle: "@davegerhardt", initials: "DG", accent: "yellow" },
        text: "How to test messaging without a research budget: three versions, ten calls each, write down the sentence they repeat back to you.",
        likes: 5100,
        comments: 380,
        reposts: 620,
      },
      {
        id: "topic-acme-14-p2",
        network: "x",
        publishedOn: "4 weeks ago",
        author: { name: "Dave Gerhardt", handle: "@davegerhardt", initials: "DG", accent: "yellow" },
        text: "The winning message is the one your prospect says back. Not the one they picked in a survey.",
        likes: 1900,
        comments: 70,
        reposts: 240,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "22d ago",
        note: "Surfaced from the weekly competitor scan (4 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-15",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "26d ago",
    kind: "ready",
    headline: "Notion is moving from workspace to system of record, quietly",
    summary:
      "The language shifted over about six weeks: fewer posts about flexibility, more about being the place a decision is written down. That is a different buyer.",
    relevance:
      "A competitor changing which buyer it addresses is the earliest warning a marketing lead gets that their own comparison pages are about to answer the wrong question.",
    whyNow: "The wording moved over roughly six weeks, consistently enough to read as a decision rather than drift.",
    article: {
      title: "Notion is moving from workspace to system of record, quietly",
      subheads: ["The wording that changed", "What it opens up"],
      paragraphs: [
        "Flexibility was the pitch to an individual. A system of record is a pitch to whoever gets asked where the decision was made, and that person signs differently.",
        "The posts have not announced this. It shows up in which nouns repeat — record, source of truth, audit — and in which ones stopped.",
        "It vacates the flexible-workspace position Acme has been arguing against, which is worth a post of its own.",
      ],
    },
    posts: [
      {
        id: "topic-acme-15-p1",
        network: "linkedin",
        publishedOn: "4 weeks ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Where does your team write down a decision so the next person can find it? That is the question we are building for.",
        likes: 1600,
        comments: 64,
        reposts: 120,
      },
      {
        id: "topic-acme-15-p2",
        network: "x",
        publishedOn: "5 weeks ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Source of truth is a promise about six months from now, not about today.",
        likes: 520,
        comments: 18,
        reposts: 60,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "26d ago",
        note: "Surfaced from the weekly competitor scan (8 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-16",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "29d ago",
    kind: "later",
    headline: "The category language from Q1 has already been abandoned",
    summary:
      "Three phrases that were in every deck in January appear in almost nothing published this month. The half-life of category language is now about one quarter.",
    relevance:
      "Anyone maintaining a voice profile or a messaging doc is carrying phrases with a shelf life, and this puts a number on how long that is.",
    whyNow: "Three phrases that were in every deck in January appear in almost nothing published this month.",
    article: {
      title: "The category language from Q1 has already been abandoned",
      subheads: ["The three phrases", "How to write around it"],
      paragraphs: [
        "All three described a shape of software rather than a job, which is why they aged out as soon as the shape became common. Nobody differentiates on a shape everybody has.",
        "The copy that survived the quarter described tasks. Tasks do not go out of fashion, because the reader still has to do them on Monday.",
        "Acme's Q2 messaging contains two of the three phrases.",
      ],
    },
    posts: [
      {
        id: "topic-acme-16-p1",
        network: "linkedin",
        publishedOn: "4 weeks ago",
        author: { name: "Anthony Pierri", handle: "@anthonypierri", initials: "AP", accent: "orange" },
        text: "Every phrase that describes a category will be shared by everyone in it within two quarters. Describe the task instead.",
        likes: 2900,
        comments: 210,
        reposts: 230,
      },
      {
        id: "topic-acme-16-p2",
        network: "x",
        publishedOn: "5 weeks ago",
        author: { name: "Lenny's Newsletter", handle: "@lennysan", initials: "LN", accent: "soft-blue" },
        text: "Category language is rented, not owned.",
        likes: 760,
        comments: 28,
        reposts: 90,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "29d ago",
        note: "Surfaced from the weekly competitor scan (16 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-17",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "5w ago",
    kind: "ready",
    headline: "Linear's pricing page rewrite dropped the feature table entirely",
    summary:
      "Three plans, three sentences, no comparison grid. The table came back for two days and then went away again.",
    relevance:
      "A feature grid is the hardest thing to remove from a pricing page, because every team owns a row of it. Someone doing it, reverting, and doing it again is the useful part.",
    whyNow: "The grid came back for two days and then went away again, inside the same window.",
    article: {
      title: "Linear's pricing page rewrite dropped the feature table entirely",
      subheads: ["What replaced the grid", "The two-day reversal"],
      paragraphs: [
        "Each plan is described by who it is for and the one limit that matters. The reader chooses on a sentence rather than by scanning forty rows for a tick.",
        "The grid returned briefly and was pulled again, which suggests it was tested rather than debated.",
        "Acme's pricing page has a forty-one-row table and no sentence describing any plan.",
      ],
    },
    posts: [
      {
        id: "topic-acme-17-p1",
        network: "linkedin",
        publishedOn: "5 weeks ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "New pricing page. Three plans, three sentences. If a row in a table is deciding your purchase, we have not explained the product.",
        likes: 1400,
        comments: 90,
        reposts: 105,
      },
      {
        id: "topic-acme-17-p2",
        network: "x",
        publishedOn: "6 weeks ago",
        author: { name: "Linear", handle: "@linear", initials: "LI", accent: "purple" },
        text: "Feature tables are for procurement, not for deciding.",
        likes: 620,
        comments: 34,
        reposts: 72,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5w ago",
        note: "Surfaced from the weekly competitor scan (3 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-18",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "7w ago",
    kind: "later",
    headline: "Operator-first is now everywhere and has stopped meaning anything",
    summary:
      "The phrase appears in eleven of the twenty accounts tracked, used to mean four different things. Acme's own voice profile leans on it.",
    relevance:
      "Acme's own voice profile leans on this phrase, so this is not an observation about competitors — it is a note about copy already published.",
    whyNow: "Eleven of the twenty tracked accounts use it, for four different meanings.",
    article: {
      title: "Operator-first is now everywhere and has stopped meaning anything",
      subheads: ["The four meanings", "What to say instead"],
      paragraphs: [
        "It is used for audience (people who run things), for tone (plain language), for pedigree (the founder has operated), and for product (fewer approvals). Those are not the same claim.",
        "A phrase carrying four meanings communicates none of them, and the reader supplies whichever they already believed.",
        "Acme's voice profile uses it as tone. The tone is describable without it, in words the audience uses about their own work.",
      ],
    },
    posts: [
      {
        id: "topic-acme-18-p1",
        network: "linkedin",
        publishedOn: "7 weeks ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "'Operator-first' is in every bio I read this week. I still cannot tell what any of them are claiming.",
        likes: 2400,
        comments: 190,
        reposts: 140,
      },
      {
        id: "topic-acme-18-p2",
        network: "x",
        publishedOn: "8 weeks ago",
        author: { name: "Dave Gerhardt", handle: "@davegerhardt", initials: "DG", accent: "yellow" },
        text: "If your differentiator fits in eleven other bios, it is a genre, not a difference.",
        likes: 1150,
        comments: 52,
        reposts: 130,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "7w ago",
        note: "Surfaced from the weekly competitor scan (11 matching accounts).",
      },
    ],
  },
  {
    id: "topic-acme-19",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "2mo ago",
    kind: "ready",
    headline: "Basecamp's book still outperforms everything on its blog",
    summary:
      "A book published years ago drives more inbound conversation than any post this quarter. The asset compounds because it is quotable.",
    relevance:
      "A compounding quotable asset is the opposite of a content calendar, and choosing between the two is a real allocation decision at this size.",
    whyNow: "A book published years ago still drives more inbound conversation than anything on the blog this quarter.",
    article: {
      title: "Basecamp's book still outperforms everything on its blog",
      subheads: ["Why it keeps working", "The smaller version"],
      paragraphs: [
        "The book is a set of positions with names. Named positions get quoted, and every quote carries the source with it, which is a distribution property a blog post does not have.",
        "It also outlives its own launch: the conversation this quarter is from readers who found it years late.",
        "The transferable version is not a book. It is naming two or three positions Acme will defend, and using the same names every time.",
      ],
    },
    posts: [
      {
        id: "topic-acme-19-p1",
        network: "linkedin",
        publishedOn: "2 months ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "Still the most common way people find us: someone quoted a chapter at them.",
        likes: 1800,
        comments: 140,
        reposts: 220,
      },
      {
        id: "topic-acme-19-p2",
        network: "x",
        publishedOn: "2 months ago",
        author: { name: "Basecamp", handle: "@basecamp", initials: "BC", accent: "menthol" },
        text: "Write the thing people can quote at each other when you are not in the room.",
        likes: 980,
        comments: 44,
        reposts: 160,
      },
    ],
    seedStatus: "ignored",
    seedReason: "Too old to lead with, and we've made this point already.",
    history: [
      {
        status: "new",
        when: "2mo ago",
        note: "Surfaced from the weekly competitor scan (2 matching posts).",
      },
    ],
  },
  {
    id: "topic-acme-20",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "3mo ago",
    kind: "later",
    headline: "Bundled AI stopped being a differentiator in about six weeks",
    summary:
      "Between February and April every tracked competitor shipped an assistant, and the claim went from headline to footnote across the whole set.",
    relevance:
      "Any roadmap claim a marketing lead is planning a launch around carries the same half-life risk, which makes this a question about what to lead with next.",
    whyNow:
      "Every tracked competitor shipped an assistant between February and April, and the claim went from headline to footnote across the set.",
    article: {
      title: "Bundled AI stopped being a differentiator in about six weeks",
      subheads: ["How fast it flattened", "What differentiates now"],
      paragraphs: [
        "Seventeen launches in six weeks, all with the same hero sentence. By the end of it the assistant had moved to the third screen of the same companies' pages.",
        "What stayed in the hero was the task the assistant removed. The ones that named a task still lead with it; the ones that named a capability do not lead with anything.",
        "Acme's Q2 hero names a capability.",
      ],
    },
    posts: [
      {
        id: "topic-acme-20-p1",
        network: "linkedin",
        publishedOn: "3 months ago",
        author: { name: "Lenny's Newsletter", handle: "@lennysan", initials: "LN", accent: "soft-blue" },
        text: "Everyone shipped an assistant. In six weeks it went from the headline to the footer. Capability is not positioning.",
        likes: 3600,
        comments: 240,
        reposts: 300,
      },
      {
        id: "topic-acme-20-p2",
        network: "x",
        publishedOn: "3 months ago",
        author: { name: "Elena Verna", handle: "@elenaverna", initials: "EV", accent: "red" },
        text: "The AI in your hero is now table stakes. What does it stop me doing?",
        likes: 1300,
        comments: 58,
        reposts: 150,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3mo ago",
        note: "Surfaced from the weekly competitor scan (17 matching launches).",
      },
    ],
  },
  {
    id: "topic-acme-21",
    feedId: "feed-acme",
    sourceId: "competitor-posts",
    ageLabel: "4mo ago",
    kind: "ready",
    headline: "Notion's community pages outrank its own product pages",
    summary:
      "Search results for the category are dominated by pages Notion did not write. The product pages sit below them.",
    relevance:
      "Losing category search to pages you did not write is an uncomfortable read for a team whose main lever is content, and it changes what that content is for.",
    whyNow:
      "Category search is dominated by pages Notion did not write, with its own product pages sitting below them.",
    article: {
      title: "Notion's community pages outrank its own product pages",
      subheads: ["What is ranking", "The uncomfortable read"],
      paragraphs: [
        "Templates, forum answers and third-party walkthroughs occupy the first page. All of them are about the product and none of them are controlled by it.",
        "That is enormous reach and no message discipline: the first thing a buyer reads is written by someone with no stake in the positioning.",
        "Acme has no community surface, which means no reach and complete control. Neither is obviously better, and it is worth deciding on purpose.",
      ],
    },
    posts: [
      {
        id: "topic-acme-21-p1",
        network: "linkedin",
        publishedOn: "4 months ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Most people meet us through something a customer built. We stopped treating that as a problem.",
        likes: 2000,
        comments: 96,
        reposts: 180,
      },
      {
        id: "topic-acme-21-p2",
        network: "x",
        publishedOn: "4 months ago",
        author: { name: "Notion", handle: "@notion", initials: "NO", accent: "grey" },
        text: "Our best-performing pages are the ones we did not write.",
        likes: 700,
        comments: 30,
        reposts: 88,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "4mo ago",
        note: "Surfaced from the weekly competitor scan (6 matching posts).",
      },
    ],
  },
  // -- THE REAL TOPICS (31) --------------------------------------------------
  // From the same export. Mapping: laneId to feedId, research to article,
  // researchType "content-strategy" to kind "later" and "ready-to-post" to
  // "ready". Not carried: whyNowDetail, history, versions, volume, whatChanged -
  // this repo renders none of them, and unused seed data rots.
  {
    id: "br-40",
    feedId: "topic-list-7",
    sourceId: "competitor-posts",
    ageLabel: "1d ago",
    kind: "ready",
    headline: "Timber accounts own 'sustainable material'. Nobody owns 'cheaper to live in'",
    summary:
      "Four posts across Sibomat and Stabilame sell wood frame and CLT on carbon storage, local sourcing and thermal comfort. Every claim is about the material. None is about the bill that arrives after someone moves in.",
    relevance:
      "Cost-burdened renters choose on the bill that arrives after they move in, not on the material the building was made from. An entire competitive set selling carbon and comfort leaves the one claim this audience buys on unattended.",
    whyNow:
      "The densest cluster in the whole window — timber sustainability posts across multiple accounts through late June and July, and the single theme the scan ranked highest by volume.",
    isTrending: true,
    article: {
      title: "They are selling the material. The renter is paying the running cost",
      subheads: ["Two accounts, one vocabulary", "The bill that decides affordability"],
      paragraphs: [
        "Four posts in this window make the same case from two accounts. Sibomat explains why it builds in softwood — renewable, strong for its weight, thermally efficient — and pairs that with indoor comfort and durability language. Stabilame shows a Stoumont house where the structure is glued CLT and the wall finishes are cut from the same panels, selling total material harmony. A third Sibomat post uses a couple who chose timber frame twice, thirty-five years apart, as proof the method lasts.",
        "The vocabulary is remarkably consistent: renewable sourcing, carbon storage, certified forest origin, insulation performance. It is a good argument and it is well made. But every single claim is about the material the building is made of, and the story stops at handover.",
        "What none of them says is what the building costs to run. Energy Star and DOE ZERH are operating-cost standards, not material credentials — they describe the bill after somebody moves in, which for a household already over the 30% rent threshold is the number that decides whether the apartment is attainable at all.",
        "That is the opening, and it is a different argument rather than a louder version of theirs. Borrowing the timber-sustainability frame would concede the point to accounts who own it and can out-detail us on it. Leading with the operating cost puts the conversation on ground where a steel skeleton and 95% factory-installed MEP is the stronger answer, not the weaker one.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "1 day ago",
        note: "Surfaced from the 16 Jun – 16 Jul Instagram scan (4 matching items).",
      },
    ],
  },
  {
    id: "br-41",
    feedId: "topic-list-7",
    sourceId: "competitor-posts",
    ageLabel: "3d ago",
    kind: "ready",
    headline: "A competitor argues AGAINST finishing in the factory. That argument has a number",
    summary:
      "Sibomat concedes modular is popular and faster, then explains why it deliberately assembles on the plot instead: standard modules cannot follow a family's brief or an awkward site. It is the clearest statement of the objection in the window.",
    relevance:
      "Municipalities and capital partners ask exactly this question before they commit, and the answer decides whether a site is a fit at all. A competitor making the objection out loud is the clearest version of it anyone will get.",
    whyNow:
      "The clearest statement of the objection in the whole window, and it comes from the competitor rather than from a sceptic.",
    isUpdated: true,
    article: {
      title: "Yes, modules are faster. The question is whether 90% costs you the floor plan",
      subheads: ["A competitor makes the objection for us", "What 90% actually standardises"],
      paragraphs: [
        "Sibomat's post is unusually direct for a competitor. It grants that modular building is popular and rightly so — preparing walls and structures in a controlled workshop delivers speed, quality and a more efficient process. Then it explains the deliberate choice to do something else: prefabricate in the atelier, but carry out the rest of the build on the plot itself, so the house can follow one family's requirements and one site's contours instead of a standard module.",
        "Stabilame makes the same point from the commercial side, with a wood post-and-beam brasserie at Froidchapelle sold on panoramic integration with the lakes and bespoke interior detailing.",
        "This is the objection worth answering directly, because it is the honest version of it. The unhelpful reply is to claim modules are just as flexible. The useful reply is that the 90% figure is about the parts nobody chooses — the steel skeleton, the risers, the 95% of MEP that goes in indoors — and that finishing those in a factory is what buys the rent reduction. The floor plan is not what gets standardised; the plumbing is.",
        "There is a second-order point available too. Their argument assumes one house on one plot. At apartment scale the trade inverts: repetition is the product, and a controlled indoor environment is how you get consistent MEP across ninety units rather than ninety variations of it.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2 weeks ago",
        note: "Surfaced from the competitor scan (1 matching item).",
      },
      {
        status: "new",
        when: "3 days ago",
        note: "Re-scanned — 4 matching items, and a second account joined it.",
      },
    ],
  },
  {
    id: "br-42",
    feedId: "topic-list-7",
    sourceId: "competitor-posts",
    ageLabel: "5d ago",
    kind: "later",
    headline: "Two competitors are filming the build. A factory line is a better episode than a muddy site",
    summary:
      "Maisons Blavier launched a bilingual behind-the-scenes site series and Thomas & Piron a site-manager memories series, both in the same fortnight. The format is proven and the subject is transparency.",
    relevance:
      "Eco-conscious buyers and public partners both want to see how a building was made, and a factory line films better than a muddy plot. The format is already proven by two competitors.",
    whyNow: "Two accounts launched build-documentary series inside the same fortnight.",
    article: {
      title: "The format is available. The footage is the commitment",
      subheads: ["Three posts, one proven format", "What a credible series costs"],
      paragraphs: [
        "Three posts in a two-week window run the same play. Maisons Blavier published part one of a site series in French and again in Dutch, promising to show how a house takes shape phase by phase and how its teams track progress. Thomas & Piron ran a site manager recalling his last project — a fully circular fire station designed by Philippe Samyn. Mi Casa, outside the Idea, is doing a production-process series of its own.",
        "The demand behind it is uncertainty: someone committing to a build wants to see the phases, the checks and who is watching. That is exactly the anxiety a factory answers better than a site does — a controlled line, repeatable stations, quality control that is measured rather than described.",
        "Which is why this is a commitment rather than a post. A credible series needs factory access, a camera on the line across several weeks, someone to own the edit, and sign-off to show a process competitors would study. The alternative — one polished flythrough — is a brochure, and the format's whole appeal is that it does not look like one.",
        "Blocked on: factory filming access and a named owner for a recurring slot. Without both this becomes a single video that sets an expectation nothing follows.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5 days ago",
        note: "Surfaced from the competitor scan (3 matching items).",
      },
    ],
  },
  {
    id: "br-43",
    feedId: "topic-list-7",
    sourceId: "competitor-posts",
    ageLabel: "2w ago",
    kind: "later",
    headline: "Stabilame is winning civic work — a marina office built over water",
    summary:
      "Three project announcements clustered at the start of July: the Capitainerie at Ath standing largely on water, new visitor infrastructure at the Grottes de Han, and the Domaine de Chevetogne. Public amenities, won on short local supply chains.",
    relevance:
      "Municipalities and landowners read civic references as proof before they read a pitch, so a competitor accumulating them narrows what is left to claim.",
    whyNow: "Three project announcements clustered at the start of July, all of them public amenities.",
    article: {
      title: "The buyer here is a municipality, and it is a different sale entirely",
      subheads: ["Civic work, won on short supply chains", "Why a residential reference won't do"],
      paragraphs: [
        "Three Stabilame posts in the first half of July announce civic and recreational work: the Capitainerie at Ath, much of it over water; the new reception buildings at the Domaine des Grottes de Han, open to the public this summer; and the Domaine de Chevetogne. The copy leans on short local supply circuits, techniques for building in wet conditions, and low environmental impact.",
        "This is the one thread in the window with a completely different buyer. A municipality or a regional operator is not comparing rent to income — it is comparing a tender, a timetable and a maintenance liability, and it is accountable for the choice in public.",
        "The argument transfers, but the proof does not. Factory completion is genuinely stronger for public work: a fixed programme, fewer weather-dependent weeks, and a predictable snag list. What is missing is a delivered civic building to point at, and public-sector procurement does not accept a residential reference as evidence.",
        "Blocked on: one completed public or institutional project with a named client willing to be cited, plus whatever framework or prequalification the relevant procurement route requires. Until then this is a market to watch, not a campaign to run.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2 weeks ago",
        note: "Surfaced from the competitor scan (4 matching items).",
      },
    ],
  },
  {
    id: "br-44",
    feedId: "topic-list-7",
    sourceId: "competitor-posts",
    ageLabel: "3w ago",
    kind: "later",
    headline: "Half the industry closed for July. A factory does not take a building holiday",
    summary:
      "Blavier, Naturhome and Stabilame all posted shutdown notices for the same three weeks — Belgium's statutory construction holiday. Sites stop; the model that assembles indoors does not have to.",
    relevance:
      "A three-week stoppage is felt by anyone waiting on a home, and it is the one moment when assembling indoors stops being a technical detail and becomes a delivery date.",
    whyNow: "Three competitors posted shutdown notices for the same statutory three weeks.",
    article: {
      title: "The most revealing posts in the scan are the out-of-office ones",
      subheads: ["Three out-of-office notices, one fortnight", "The schedule argument, and its tone problem"],
      paragraphs: [
        "Three accounts published near-identical notices in the second week of July. Maisons Blavier closed its offices until 3 August, in French and again in Dutch, while keeping advisors reachable. Naturhome paused from 18 July to 3 August. Stabilame's whole team went from 10 July to 2 August. This is the Belgian construction holiday — statutory, industry-wide, and unremarkable to anyone in the sector.",
        "The export flagged this Idea as self-promotional and declined to write it up, which is the right call about the posts themselves: they are logistics notices, and there is nothing to say back to an out-of-office.",
        "It is kept because of what it accidentally demonstrates. Site-dependent construction has weeks in the year when nothing progresses, and everyone in the market has silently agreed which weeks those are. A model that assembles indoors is not exposed to that in the same way — the schedule argument writes itself.",
        "Blocked on a decision rather than an asset, and not a comfortable one: this only works as a schedule-reliability argument, and it has to be made without appearing to mock a statutory holiday that protects workers. Wrong tone and it reads as a firm boasting that its people do not get August off.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3 weeks ago",
        note: "Surfaced from the competitor scan (3 matching items).",
      },
    ],
  },
  {
    id: "br-10",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "11d ago",
    kind: "ready",
    headline: "Beyond the mats: how BJJ builds resilient, confident kids",
    summary:
      "Gracie Barra and Six Blades are both pushing youth programs on character building — 'raise boys who are kind, confident, and capable' — and taking students as young as four. The claim is everywhere; the mechanism behind it is explained nowhere.",
    relevance:
      "This is the claim that decides whether a Carlsbad parent books a trial, and they are being asked to take it on faith. Explaining the mechanism is the whole opening.",
    whyNow:
      "Two competitors are pushing it at once, both taking students as young as four, and neither explains how it works.",
    article: {
      title: "The parent's real question isn't 'will it work' — it's 'will it make my child aggressive'",
      subheads: ["Character is the category's pitch", "Why the safest room produces the least fighting"],
      paragraphs: [
        "Across the tracked Carlsbad academies, youth programs are being sold on character: kind, confident, capable children, sometimes from age four. The shift is a good one, and it is now the category default rather than a differentiator. What none of the posts do is answer the hesitation that actually stops a parent signing up — whether martial arts will teach their child to settle conflict with their fists.",
        "That question has a real answer, and it is structural rather than cultural. Most martial arts are striking arts: they train a child to meet conflict with immediate outward aggression. Brazilian Jiu-Jitsu is grappling — leverage, technique and control. A child is taught to neutralise a threat, control a situation and escape safely, which is a fundamentally different instinct to rehearse. Every movement is cause and effect, so the training rewards keeping a cool head and thinking, not swinging.",
        "The mat culture is the other half of it. A child who does not feel safe cannot build resilience — an environment that is chaotic or overly competitive puts them in survival mode, and character development stops there. The clearest expression of the opposite is the tap: when a partner taps, everything stops, immediately and without exception. That single rule teaches respect for someone else's boundaries and that it is safe to admit you are caught. Strength is for protecting and controlling, never for intimidating.",
        "This is also why capable children fight least. Bullying runs on insecurity in both directions — the aggressor proving dominance, the target projecting fear. A child who knows with certainty that they could control a confrontation, and do it without hurting anyone, has nothing left to prove. That is the angle the local conversation has left open: not that character development matters, but how it is actually produced.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5h ago",
        note: "Surfaced from the 1–31 July competitor scan (8 matching posts).",
      },
    ],
  },
  {
    id: "br-11",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "5h ago",
    kind: "ready",
    headline: "What do BJJ belt promotions really mean for your child's growth?",
    summary:
      "Gracie Barra, Freedom and Six Blades are all posting belt and stripe promotions, and it is the highest-engagement theme in the set. Everyone shows the milestone; nobody explains what earning it actually built.",
    relevance:
      "Parents weighing martial arts want to know what a promotion proves about their child, not that one happened. Everyone posts the milestone; the meaning is unclaimed.",
    whyNow: "Belt and stripe promotions are the highest-volume theme across all three tracked competitors this month.",
    isTrending: true,
    article: {
      title: "A belt is a byproduct of the person a child is becoming",
      subheads: ["An honest system, poorly explained", "Plateaus, stripes and the comparison trap"],
      paragraphs: [
        "In a category full of participation trophies, the youth belt system is unusually honest — and unusually badly explained. Children move white, grey, yellow, orange, green, earning up to four stripes inside each rank. Those stripes are the mechanism worth talking to parents about: for a young child a year is an eternity, and stripes break an intimidating goal into phases small enough to feel. Each one is a signal that daily effort is compounding.",
        "The reason it works is that the recognition is earned rather than given. A promotion arrives after a child has worked through frustration, refined something they were bad at, and shown up disciplined when they were tired. That teaches the thing empty praise cannot: that their success sits entirely inside their own control. Confidence built that way does not break when life produces a setback.",
        "The mats behave like a laboratory for that. A student chasing a stripe will hit plateaus — a position they cannot escape, a newer partner who suddenly gives them trouble — and with decent coaching they learn to read those as information rather than failure. The question shifts to 'what do I do differently next time?'. Children who discover that consistency produces progression on the mats start applying it to schoolwork without being told to.",
        "There is a practical parent angle here too, and it is a corrective. The instinct is to compare — why did another child get a stripe first? The more useful move is to ask what they improved today rather than what they received, to normalise plateaus rather than apologise for them, and to model showing up on the days motivation is low. That is the piece the promotion posts never carry.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5h ago",
        note: "Surfaced from the 1–31 July competitor scan (13 matching posts).",
      },
      {
        status: "trending",
        when: "5h ago",
        note: "Flagged trending — highest-volume theme in the scan.",
      },
    ],
  },
  {
    id: "br-12",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "6w ago",
    kind: "ready",
    headline: "Returning to the mats: how to restart your BJJ journey safely",
    summary:
      "Six Blades welcomed back a student after a three-year hiatus, and it wasn't an isolated post. There is a local audience trying to come back, and nothing in the set speaks to what makes a comeback fail.",
    relevance:
      "Returning professionals are a named audience for this academy, and what ends a comeback is never technique — it is pacing an old injury around a full week. Nobody in the set addresses it.",
    whyNow:
      "A competitor's return-after-three-years post was not an isolated one; the audience is visibly local and visibly trying.",
    article: {
      title: "The comeback fails on ego long before it fails on cardio",
      subheads: ["The hesitations, and the real obstacle", "The ramp, and the room you pick"],
      paragraphs: [
        "A dusty gi in the back of a closet comes with a specific set of hesitations: whether the cardio is gone, whether the joints will hold, whether you can keep pace with people who never stopped. The local signal is that plenty of people in North County are having that thought — former white belts who trained for a few months three years ago, coloured belts who took a multi-year break for work or family.",
        "The obstacle is almost never conditioning. It is that your brain remembers techniques your body cannot yet execute, so timing and spatial awareness lag behind knowledge. Force the gap closed with raw athletic effort and the injury rate climbs. The useful reframe is to stop trying to win rounds and start collecting data: accept that you will be slower and more easily fatigued, and treat that as a temporary state rather than a new baseline.",
        "Physically it wants a ramp, because grappling loads the neck, shoulders, lower back and knees, and a desk-bound body needs to re-adapt to that. Three things do most of the work: a real warm-up that mobilises hips and shoulders, controlled intensity — you are allowed to decline a roll or ask to keep the pace down — and positional sparring from closed guard or side control instead of open scrambles, which is where injuries happen.",
        "Which makes the choice of academy the actual decision. A room that treats every round like a championship final is a poor bet for someone returning, or for anyone who has to be functional at work tomorrow. A structured adult curriculum rebuilds fundamentals in a cooperative setting before adding resistance, and coaches who watch mat dynamics will pair a returning student with partners who are safe rather than eager.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5h ago",
        note: "Surfaced from the 1–31 July competitor scan (6 matching posts).",
      },
    ],
  },
  {
    id: "br-13",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "2d ago",
    kind: "later",
    headline: "The family that rolls together: BJJ as a shared lifestyle",
    summary:
      "Competitors are running family classes and turning academy anniversaries into family community events. The angle is strong and the volume is high — but this one can't be written yet, because it needs assets nobody has shot.",
    relevance:
      "Family classes reach the parent and the child in a single decision, which is the shortest path this academy has to a second membership.",
    whyNow:
      "High volume across the window — family classes and anniversary events — but it needs footage nobody has shot yet.",
    article: {
      title: "Blocked on assets, not on the idea",
      subheads: ["Parents on the mat, not on the sideline", "One shoot, three formats"],
      paragraphs: [
        "The opening is parents training alongside their children rather than watching from the side, positioning one academy as the place where both find a real program rather than a compromise. Competitors are already gathering families — family classes, anniversaries run as community events — so the audience is assembled and the framing is unclaimed.",
        "The export flagged this Idea as needing assets before it can be written, and the two it names are specific: high-quality photos or video of Carlsbad families actually training at the academy, and testimonials from parents who train alongside their kids. Neither can be substituted with stock — the whole claim is that this happens here.",
        "Suggested formats were an Instagram carousel, a short video reel, and a blog post — which is to say the shoot serves all three, so the asset gap is one production job rather than three.",
        "Worth noting what the same scan told us NOT to copy: competitors' generic Independence Day posts were flagged as carrying no brand angle at all, and Gracie Barra's 1st-anniversary celebration and belt-rank seminars were flagged as self-promotional events that don't translate into a credible theme for another academy. The family angle is the part of the community conversation that does transfer.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "5h ago",
        note: "Surfaced from the 1–31 July competitor scan (11 matching posts).",
      },
      {
        status: "trending",
        when: "5h ago",
        note: "Flagged trending — second-highest-volume theme in the scan.",
      },
    ],
  },
  {
    id: "br-14",
    feedId: "topic-list-5",
    sourceId: "competitor-posts",
    ageLabel: "12d ago",
    kind: "ready",
    headline: "From Summer to Autumn: Smart Transitional Layering for the Belgian Climate",
    summary:
      "Advice on building a transitional wardrobe with light layering pieces and versatile essential tops without immediately packing away your summer wardrobe. Focuses on practical multi-brand solutions for unpredictable Belgian weather.",
    relevance:
      "Repeat buyers building a wardrobe around one linen or cashmere piece need to know what carries into the next season — that is the difference between a purchase and a collection.",
    whyNow:
      "The seasonal turn falls inside the window, and the layering advice is already running on competing accounts.",
    article: {
      title: "Belgian weather demands smart layers, not a sudden wardrobe swap",
      subheads: ["Why a wardrobe swap is the wrong move", "Combinations that carry summer into October"],
      paragraphs: [
        "You know the feeling: the mornings already feel surprisingly crisp, while the afternoon sun warms up the terrace again. In fashion stores and across social media, heavy autumn collections and winter coats are already being pushed everywhere. Yet it is far too early to permanently banish your favorite summer items to the attic.",
        "The secret to effortless style during this transitional period lies not in hastily purchasing a complete autumn wardrobe, but in masterfully combining light layers. As a Belgian multi-brand expert, we at Noba Fashion know how quickly our climate can shift. With a few cleverly chosen basic pieces from our wide brand selection, you can transform your summer outfits into autumn-proof combinations in no time.",
        "A successful transitional look relies on garments that adapt easily to temperature fluctuations. Lightweight knitwear is the ultimate in-between piece: a finely knit cardigan or a thin cotton sweater goes over a summer dress or top in the morning, and around your shoulders as soon as the sun breaks through. Timeless denim and light trousers form the foundation — enough protection against a cool breeze, and they pair effortlessly with both sunny tops and autumn blazers. And a versatile mid-season jacket, whether a classic trench coat, a denim jacket or a refined overshirt, instantly elevates any look while staying practical for life on the go.",
        "Fashion is about smart combinations, not monthly overhauls. An airy summer dress gains an instant autumnal feel layered under a tailored blazer, with open sandals swapped for closed-toe shoes or ankle boots. A sleeveless summer top carries over just as easily under a fluid button-down shirt worn open as a light jacket. Combining different brands within a single outfit gives you the freedom to refine your personal style — functional for the morning rush, elegant for work, comfortable for the weekend.",
        "The Belgian autumn requires flexibility. By resisting the urge to jump straight into heavy winter wear and focusing instead on thoughtful transitional layers, you get the absolute most out of your closet. With a few strong foundational elements from our multi-brand selection, you can step out the door every morning with confidence — no matter what your weather app predicts.",
      ],
    },
    posts: [
      {
        id: "br-14-p1",
        network: "instagram",
        publishedOn: "3 weeks ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "30 graden op de planning = tijd voor luchtige zomerlooks. ☀️ En laat dat nu nét goed uitkomen: we hebben extra veel shorts, T-shirts, kleedjes en andere zonnige items toegevoegd aan onze SOLDEN.",
        likes: 163,
        comments: 2,
        reposts: 0,
      },
      {
        id: "br-14-p2",
        network: "instagram",
        publishedOn: "11 days ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Onze #JBCfamily gespot aan zee in de leukste (matching) outfits. Staat een tripje naar de Belgische kust ook nog op jullie planning deze zomer? 🌊",
        likes: 78,
        comments: 1,
        reposts: 0,
      },
      {
        id: "br-14-p3",
        network: "instagram",
        publishedOn: "3 weeks ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Onze allermooiste #JBCfamily gespot op vakantie! 🌞 Deel ook je leukste vakantiekiekjes met ons @jbcfashion. 💛",
        likes: 143,
        comments: 1,
        reposts: 0,
      },
      {
        id: "br-14-p4",
        network: "instagram",
        publishedOn: "3 weeks ago",
        author: {
          name: "ZEB",
          handle: "@zebfashion",
          initials: "ZE",
          accent: "orange",
        },
        text: "Hold the screen to discover your holiday essential 🌴✅️ #zebfashion #multibrandstore #vakantie",
        likes: 3,
        comments: 4,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2h ago",
        note: "Surfaced from the 4 July – 3 August competitor scan (4 matching posts). Keywords: 30 graden, zomerlooks, vakantie, zee.",
      },
    ],
  },
  {
    id: "br-15",
    feedId: "topic-list-5",
    sourceId: "competitor-posts",
    ageLabel: "2h ago",
    kind: "ready",
    headline: "Less Impulse, More Value: Building a Sustainable Sale Capsule",
    summary:
      "Strategic styling advice on leveraging the final sale days to build a timeless capsule wardrobe rather than chasing impulsive discounts. Focuses on selecting high-quality basic pieces and multi-brand classics.",
    relevance:
      "This audience wants the look without the invoice, so a sale is the moment they either build a wardrobe or regret three purchases. Framing a discount as selection is the brand's own argument.",
    whyNow:
      "The final markdown weeks run straight through the 30-day scan, with discount messaging on three of the five tracked accounts at once.",
    isTrending: true,
    article: {
      title: "Don't get carried away by sale frenzy: choose smart investments",
      subheads: ["The pitfall of the final sale weeks", "Building a capsule instead of a pile"],
      paragraphs: [
        "Red stickers, aggressive discounts up to -70%, and slogans shouting 'now or never': the final sale weeks can be overwhelming. The pitfall of this period is well known — you come home with garments that were fantastically discounted, only for them to sit at the back of your closet after a single wear because they match nothing else you own.",
        "At Noba Fashion, we take a different view of sales. We don't see them as a hunt for as many cheap items as possible, but as the moment to secure high-quality multi-brand classics that will last for years. With a targeted approach, an impulsive shopping trip becomes a sustainable upgrade to your wardrobe.",
        "A successful sale purchase meets three simple criteria: the fit is perfect, the quality is exceptional, and the item fits seamlessly into your daily lifestyle. Ask yourself with every item whether you would consider buying it at full price — if the answer is yes, you have found a genuine gem. During the final markdowns that points at three categories: a timeless, well-cut blazer in a neutral shade such as navy, sand or black; high-quality jeans or trousers from a top brand with a great fit; and classic knitwear and blouses — crisp white shirts, finely knit wool or cotton sweaters, neatly finished tops.",
        "The great advantage of a multi-brand store is being able to compare and combine pieces from different quality brands side by side. A capsule wardrobe is ideally around ten well-coordinated garments you can mix and match effortlessly. Searching for neutral color palettes during the sales — warm beige, grey, deep blue, olive green — is what makes new additions integrate with what is already in your closet, and what removes the familiar 'I have nothing to wear' frustration on a busy morning.",
        "Shopping with a plan brings peace of mind. Instead of getting lost in overcrowded racks filled with fleeting trends, a thoughtful shopping visit helps you build a reliable wardrobe you can count on. Style isn't about the quantity of clothes in your closet, but about the quality and versatility of the pieces you wear — which is how you walk away from the final sale weeks with true long-term value rather than buyer's remorse.",
      ],
    },
    posts: [
      {
        id: "br-15-p1",
        network: "instagram",
        publishedOn: "3 weeks ago",
        author: {
          name: "The Fashion Store",
          handle: "@thefashionstore_be",
          initials: "TF",
          accent: "purple",
        },
        text: "Op zoek naar verkoeling? Onze winkels hebben airco! Én je geniet van solden met kortingen tot -70%*🛍️",
        likes: 3,
        comments: 0,
        reposts: 0,
      },
      {
        id: "br-15-p2",
        network: "instagram",
        publishedOn: "4 weeks ago",
        author: {
          name: "ZEB",
          handle: "@zebfashion",
          initials: "ZE",
          accent: "orange",
        },
        text: "Beat the heat & shop je zomer items tot -70%* instore of via link in bio 🔗",
        likes: 3,
        comments: 0,
        reposts: 0,
      },
      {
        id: "br-15-p3",
        network: "instagram",
        publishedOn: "10 days ago",
        author: {
          name: "The Fashion Store",
          handle: "@thefashionstore_be",
          initials: "TF",
          accent: "purple",
        },
        text: "Groetjes van onze #thefashionstorelovers vanop vakantie ☀️ Shop je favoriete vakantielooks aan kortingen tot -70%* ✨",
        likes: 3,
        comments: 1,
        reposts: 0,
      },
      {
        id: "br-15-p4",
        network: "instagram",
        publishedOn: "4 weeks ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Maak je vakantiekoffer klaar met de favoriete zomerlooks van @oliviaburguet, @ashleygaleyn en @maimouna.badjie. Ontdek nu nog meer items in SOLDEN! 🌞",
        likes: 92,
        comments: 0,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2h ago",
        note: "Surfaced from the 4 July – 3 August competitor scan (4 matching posts).",
      },
      {
        status: "trending",
        when: "2h ago",
        note: "Flagged trending — discount messaging runs across three accounts at once.",
      },
    ],
  },
  {
    id: "br-16",
    feedId: "topic-list-5",
    sourceId: "competitor-posts",
    ageLabel: "4mo ago",
    kind: "ready",
    headline: "Showing Your Colors: How to Wear Autumn's Plum & Warm Earth Tones Trend",
    summary:
      "Practical styling guide for integrating rich autumn colors like plum (brownish pink) and warm earth tones into an existing wardrobe. Demonstrates how to subtly balance this trend with neutral basic elements.",
    relevance:
      "Style-conscious professionals adopt a colour trend by fitting it to what they already own rather than replacing it, which is exactly what a quiet-luxury wardrobe is for.",
    whyNow:
      "Outside the current window — kept because the palette returns every autumn, not because the scan is fresh.",
    article: {
      title: "Add depth to your wardrobe with autumn's richest hues",
      subheads: ["This season's shift toward depth", "Texture is what makes earth tones work"],
      paragraphs: [
        "As summer days shorten, the fashion world's color palette transforms. This season sees a clear shift toward deep, warm tones that exude luxury and calm. The absolute showstopper of this autumn is plum — a refined, deep brownish-pink shade — accompanied by warm earth tones like rust brown, chocolate and soft terracotta.",
        "While these rich colors look stunning on mannequins, many women wonder how to translate this trend into their own daily wardrobes. Nobody wants to purchase a head-to-toe outfit that feels dated after a single season. At Noba Fashion, we show you how to introduce these trend colors subtly and stylishly.",
        "Plum serves as the perfect bridge between classic and modern: it has the warmth of brown and the softness of pink, which makes it a surprisingly accessible color for virtually every skin tone. Wear it as a stylish accent — a plum handbag, belt or scarf against grey trousers and a white blouse — or as a statement top, a fluid blouse or knit sweater with your trusted blue jeans, which gives an everyday look extra character without feeling over-the-top. For those who want to make a statement, tone-on-tone with soft pink or warm brown is softer than black-and-white and remarkably elegant.",
        "Alongside plum, rich earth tones form the foundation for a harmonious autumn look, and the key to wearing them lies in playing with textures. A warm brown suede skirt paired with a smooth cotton top, or a rust-colored cardigan layered over a denim shirt, creates engaging visual dynamics that a single flat color cannot. The benefit of a wide multi-brand selection is that different shades of brown and plum from various brands sit side by side in one place, so you find the exact nuance that makes your complexion glow.",
        "Fashion should remain fun and, above all, fit who you are. You don't need to reinvent your entire style to follow the latest trends: adding just one or two key pieces in plum or a warm earth tone gives your familiar outfits a fresh, contemporary appeal. With the right balance between striking trend colors and timeless basics, you can step out the door this autumn feeling confident and stylish.",
      ],
    },
    posts: [
      {
        id: "br-16-p1",
        network: "instagram",
        publishedOn: "10 days ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Volgende week gaat Circus CAMILLE van start… en ook JBC is er dit jaar opnieuw bij met een superleuke stand vol officiële CAMILLE-merch. In deze video krijg je alvast een eerste sneak peek van het nieuwe Circus CAMILLE T-shirt. 🎪✨",
        likes: 2830,
        comments: 34,
        reposts: 0,
      },
      {
        id: "br-16-p2",
        network: "instagram",
        publishedOn: "8 days ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Nieuwe CAMILLE x JBC-collectie én Circus Merch loading... ❤️‍🔥 Heel snel verkrijgbaar... #CAMILLExJBC #CAMILLEcollectie",
        likes: 1058,
        comments: 47,
        reposts: 0,
      },
      {
        id: "br-16-p3",
        network: "instagram",
        publishedOn: "6 days ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Miauw! Voor haar nieuwste collectie liet @camille_dhont zich inspireren door haar eigen kat: Moustache. Shop jouw favoriete looks nu al op JBC.be en vanaf morgen in alle JBC-winkels.",
        likes: 1013,
        comments: 22,
        reposts: 0,
      },
      {
        id: "br-16-p4",
        network: "instagram",
        publishedOn: "6 days ago",
        author: {
          name: "JBC",
          handle: "@jbcfashion",
          initials: "JB",
          accent: "red",
        },
        text: "Er is een nieuwe designer bij CAMILLE x JBC. Hij miauwt, hij heeft snorharen, en hij heet Moustache. Het is... de kat van CAMILLE! Van printjes tot piepkleine details, Moustache heeft zijn pootafdrukje letterlijk overal achtergelaten.",
        likes: 879,
        comments: 17,
        reposts: 0,
      },
      {
        id: "br-16-p5",
        network: "instagram",
        publishedOn: "12 days ago",
        author: {
          name: "ZEB",
          handle: "@zebfashion",
          initials: "ZE",
          accent: "orange",
        },
        text: "NEW: de drinkflessen van Dopper in superleuke zomerkleurtjes🚰☀️ Gemaakt met 90% gerecycleerd staal ✅️",
        likes: 3,
        comments: 0,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2h ago",
        note: "Surfaced from the 4 July – 3 August competitor scan (5 matching posts). Keywords: collectie, print, kleuren, nieuwe collectie.",
      },
    ],
  },
  {
    id: "br-20",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "4d ago",
    kind: "later",
    headline: "The competing gym's kids programme now runs on the same nights as yours",
    summary:
      "Their schedule page changed this week. The Tuesday and Thursday kids classes that used to sit opposite yours now overlap them exactly, and their last three posts push that timetable.",
    relevance:
      "A direct timetable collision is the one competitive move that costs enrolments immediately, and it lands on exactly the families this academy is courting.",
    whyNow: "Their schedule page changed this week, and their last three posts push the new timetable.",
    isUpdated: true,
    article: {
      title: "The timetable gap has closed",
      subheads: ["What changed since the last scan", "What the comparison falls back to"],
      paragraphs: [
        "This Idea originally described a scheduling gap: the nearest competing academy ran its kids programme on nights you did not, so parents comparing the two were not choosing between them. Their schedule page now shows the same Tuesday and Thursday slots.",
        "The angle changes with it. Availability is no longer the differentiator, so the comparison falls back to instructor ratio and belt progression — both things your own posts already document and theirs do not.",
      ],
    },
    posts: [],
    seedStatus: "new",
  },
  {
    id: "br-21",
    feedId: "topic-list-5",
    sourceId: "competitor-posts",
    ageLabel: "5d ago",
    kind: "ready",
    headline: "The multibrand discount wave has stopped, three weeks early",
    summary:
      "Four of the five tracked accounts pulled their sale messaging this week and went back to full-price editorial. The markdown conversation you were planning to answer has already moved on.",
    relevance:
      "A brand about to answer the markdown conversation is publishing into a room that has already moved on, and full-price editorial is where the attention went.",
    whyNow:
      "Four of the five tracked accounts pulled sale messaging in the same week, three weeks ahead of the calendar.",
    isUpdated: true,
    article: {
      title: "The sale ended before the response could ship",
      subheads: ["The wave ended three weeks early", "What survives the change in timing"],
      paragraphs: [
        "The original reading of this Idea was that a sustained discount wave gave a sustainable-wardrobe message something concrete to push against. That wave has ended earlier than the seasonal pattern suggested — four of five accounts are back to full-price editorial.",
        "What survives is the observation, not the urgency: shoppers who bought in the wave are three weeks from regret posts, which is a better moment for the capsule argument than the sale itself was.",
      ],
    },
    posts: [],
    seedStatus: "new",
  },
  {
    id: "br-22",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "18d ago",
    kind: "ready",
    headline: "Consistency is the only thing every promotion in this town has in common",
    summary:
      "Eleven July posts frame progress the same way — show up, keep showing up, the rank follows. Nobody explains what consistency actually looks like in a first year, which is the part a beginner is trying to work out before they sign.",
    relevance:
      "A beginner is trying to work out what the first year actually asks of them before they sign, and being told to keep showing up does not answer it.",
    whyNow: "Eleven July posts frame progress the same way, and none of them says what that looks like week to week.",
    article: {
      title: "Everyone says 'stay consistent'. Almost nobody says what that means in practice",
      subheads: ["Eleven posts, one word: consistency", "The number nobody publishes"],
      paragraphs: [
        "Eleven of the twenty-five posts in the July window frame training as a long-term journey built on steady effort — belt and stripe promotions, anniversary reflections, open mats. The vocabulary is remarkably uniform across the three tracked academies: endurance, perseverance, showing up. Sixty-four percent of it ran on Instagram, the rest on Facebook.",
        "The messaging is also honest about pressure. Several posts note that sparring is where technique gets tested and that the pressure is productive when paired with patience — training rounds framed as a place to try things and help a partner improve rather than to win. That is a genuinely useful thing to say to an adult who is worried about being the worst person in the room.",
        "Where the category stops short is the specific. 'Be consistent' is advice you can only act on if you know the number. Two sessions a week for a year is a different proposition to four, and a beginner deciding whether this fits around a job is doing exactly that arithmetic. None of the tracked posts answer it.",
        "The opening is the mechanics rather than the mindset: what a realistic first year looks like week by week, what actually stalls people at the three-month mark, and why missing a fortnight does not undo it. The sentiment is taken; the specifics are unclaimed.",
      ],
    },
    posts: [],
    seedStatus: "used",
    history: [
      {
        status: "new",
        when: "18 days ago",
        note: "Surfaced from the 1–31 July competitor scan (11 matching posts).",
      },
      {
        status: "used",
        when: "9 days ago",
        note: "Drafted into a chat — first-year expectations post.",
      },
    ],
  },
  {
    id: "br-23",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "3d ago",
    kind: "ready",
    headline: "The best coaching in the room happens between rounds",
    summary:
      "Gracie Barra ran a post asking students for the best advice they had been given on the mats, and it outperformed everything else they published in July. The subject — peer learning, not instruction — is barely covered by anyone else.",
    relevance:
      "Peer learning is what keeps a returning adult on the mats past the first month, and it is the part of the room a prospective member cannot see from outside.",
    whyNow:
      "Peer-learning posts drew the highest engagement of any theme in the window, on ten matching posts across two accounts.",
    isTrending: true,
    article: {
      title: "The thing beginners are most afraid of is the thing that teaches them fastest",
      subheads: ["The post about what happens between rounds", "Nobody explains how the culture is produced"],
      paragraphs: [
        "One tracked account published a post in late July about the conversations that happen between rounds — questions asked, experiences swapped, advice passed down — and closed it by asking followers for the best guidance they had received on the mats. It drew more response than any of that account's promotional posts in the same window.",
        "The framing matters. It presents the room as collaborative rather than competitive, and it makes the explicit claim that a beginner has something to learn from everyone training near them, not only from the instructor. Ten posts across two academies touched the theme; sixty percent ran on Instagram.",
        "This lands on the exact hesitation that keeps adults out of a first class. The fear is not injury so much as being the least capable person present and having that be visible. A room where the person ahead of you is expected to help you is a different proposition to one where they are expected to beat you.",
        "The gap is that everyone celebrates the culture and nobody explains how it is produced. It is not accidental — it comes from how rounds are paired, how the tap is treated, and what an instructor does when a stronger student goes too hard. That is the piece worth writing, because it is the piece a parent or a returning adult is actually assessing.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3 days ago",
        note: "Surfaced from the 1–31 July competitor scan (10 matching posts).",
      },
      {
        status: "trending",
        when: "2 days ago",
        note: "Flagged trending — engagement above the window baseline.",
      },
    ],
  },
  {
    id: "br-24",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "7w ago",
    kind: "ready",
    headline: "Is grappling alone enough? The striking question parents keep asking",
    summary:
      "Six Blades has its 'Little Samurai' group training stand-up striking alongside grappling. One post, one account — but it puts a question in front of parents that is worth answering properly.",
    relevance:
      "Parents comparing programmes ask whether grappling alone is enough, and an academy that answers it honestly wins the ones who would otherwise hedge toward a striking gym.",
    whyNow: "One post from one account — thin as evidence, but it puts a live parent question on the table.",
    article: {
      title: "Most of what a child actually faces isn't a punch",
      subheads: ["One post, one implied criticism", "What a playground confrontation actually is"],
      paragraphs: [
        "A single Instagram post in the July window shows a nearby academy's seven-to-twelve group working stand-up striking alongside their grappling. One matching item out of twenty-five, which is under the three-item floor this lane treats as evidence — but adding striking to a kids curriculum is a positioning decision, and the implied claim travels further than the post does.",
        "The claim is that grappling alone is incomplete self-defence, and it is the kind of thing a parent hears once and then carries into every comparison. It deserves a real answer rather than a defensive one.",
        "The answer is about what children actually encounter. Playground and schoolyard confrontations are overwhelmingly grabs, shoves, pins and being taken to the ground — not exchanges of punches. Grappling trains precisely that situation, and it trains it with an outcome that does not require hurting the other child: control, escape, and a conflict that ends without escalating. Striking trains a child to answer force with force, which is a different instinct to rehearse and a harder one to switch off.",
        "That is the post. Not a rebuttal of another academy's curriculum, but the mechanism a parent is trying to reason about when they ask whether their child should learn to punch.",
      ],
    },
    posts: [],
    seedStatus: "ignored",
    seedReason:
      "Real question, but one post from one account is thin. Revisit when more than a single post is driving it.",
    history: [
      {
        status: "new",
        when: "7 weeks ago",
        note: "Surfaced from the 1–31 July competitor scan (1 matching post).",
      },
      {
        status: "ignored",
        when: "6 weeks ago",
        note: "Ignored — single post, below the evidence floor.",
      },
    ],
  },
  {
    id: "br-25",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "1d ago",
    kind: "ready",
    headline: "Competitors sell confidence to girls and character to boys",
    summary:
      "Gracie Barra's youth copy splits cleanly by gender — empowerment and fun for girls, self-control and respect for boys. It is the most consistent pattern in the scan and nobody has questioned whether parents want the split.",
    relevance:
      "This academy runs a women-only programme, which puts it on the other side of the gendered split before the question is even asked.",
    whyNow: "The most consistent pattern in the scan, and nobody has questioned whether parents want the split.",
    isUpdated: true,
    article: {
      title: "The same programme, described two different ways depending on the child",
      subheads: ["The same class, described twice", "The mechanism does not vary by child"],
      paragraphs: [
        "Eleven July posts cover youth programmes, eighty-two percent of them on Instagram, and the framing divides by gender with unusual consistency. Posts about boys lead on behavioural outcomes — self-control, respect, problem-solving, perseverance, raising boys who are kind and capable rather than fighters. Posts about girls lead on empowerment, self-assurance, fun and friendship, frequently welcoming pairs of sisters.",
        "Both halves are reasonable on their own. Read together they describe the same class twice, and the split implies the two children are there for different reasons. A parent with a son and a daughter is being sold two programmes.",
        "There is a straightforward position available here, and it is the one this Playbook already holds: the mechanism does not vary by child. The tap teaches the same thing to everyone in the room. Leverage over strength matters more to the smaller person regardless of who that is. Control rather than aggression is the point of the art, not a girls' version of it.",
        "The scan also fills in the specifics worth answering alongside: dedicated cohorts for four-year-olds and for seven-to-twelves, a parent-and-child class, and a free introductory session. Those are the concrete comparisons a parent will make once the framing question is settled.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "27 days ago",
        note: "Surfaced from the 1–31 July competitor scan (11 matching posts).",
      },
    ],
  },
  {
    id: "br-26",
    feedId: "topic-list-4",
    sourceId: "competitor-posts",
    ageLabel: "6d ago",
    kind: "later",
    headline: "Most of what the Carlsbad academies published in July was about themselves",
    summary:
      "Anniversaries, belt promotions, new-member welcomes and holiday greetings account for the bulk of the twenty-five posts in the window. Four self-promotional formats, three academies, almost no teaching.",
    relevance:
      "A parent researching academies is reading four self-promotional formats and learning nothing about the teaching, which is the gap any instructional post walks straight into.",
    whyNow:
      "Anniversaries, promotions, welcomes and holiday greetings account for the bulk of twenty-five posts across three academies.",
    article: {
      title: "Four formats, three academies, and a month with almost nothing to learn from",
      subheads: ["Four formats, all social proof", "Won on frequency, not on content"],
      paragraphs: [
        "The July scan flags four recurring formats as self-promotional rather than subject matter: school anniversary and seminar announcements, individual belt and stripe promotions, welcome posts for new and returning students, and Independence Day greetings. Between them they account for most of the twenty-five posts collected across the three tracked academies.",
        "That is not a criticism of any one of them — social proof is a legitimate thing for a local academy to publish, and the promotions genuinely matter to the students in them. It is an observation about what is left over. Strip the four formats out and the month contains a handful of posts that teach a parent or a prospective adult student anything.",
        "The competitive read is that attention in this category is not being won on content. It is being won on frequency and on local familiarity, which is a position that is hard to attack directly and easy to go around. Everything else in this lane — how character development is actually produced, what a realistic first year looks like, why a room where people help each other is safer — is unoccupied ground.",
        "The practical consequence is about cadence rather than volume. Matching their posting rate is the wrong target; publishing the explanations they are not publishing is the cheap one.",
      ],
    },
    posts: [],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "6 days ago",
        note: "Surfaced from the 1–31 July competitor scan (aggregate noise flags).",
      },
    ],
  },
  // ── Agorapulse · influencer posts ─────────────────────────────────────────
  // Three Topics from the influencer handoff (agorapulse-playbook-prototype-
  // inputs.json, 24 Sep 2026): LinkedIn posts by Matt Navarra, Annie-Mai Hodge
  // and Michael Stelzner, 19 Aug → 23 Sep 2026. Title, summary, relevance, why
  // now, kind and both article halves are the handoff's, converted from markdown
  // (headings → subheads, bullets → paragraphs, bold dropped). INVENTED because
  // the handoff is silent: ages, post dates, engagement counts, profile URLs,
  // avatar tints and the history line.
  //
  // All three are `kind: "ready"`, although the handoff tags two of them
  // idea_for_later: its own deviation note says those articles were written
  // anyway, so with a full article each they are shown as draftable.
  //
  // ⚠️ AP-06 (Stelzner) sits under the Meta One Topic too, on purpose: the chain
  // matched it on the keyword "captions" and the article ignores it. A real feed
  // shows that false match, so this one does.
  {
    id: "inf-agp-1",
    feedId: "topic-list-6",
    sourceId: "influencer-posts",
    ageLabel: "3d ago",
    kind: "ready",
    headline: "Meta One subscription tiers gating links and creator features",
    summary:
      "Two monitored accounts report on the global rollout of Meta One, noting tiered pricing reaching $499 per month for business users. One account observes that link-sharing capabilities—such as adding links to Instagram captions or publishing more than two link posts monthly on Facebook pages—are being restricted to paying subscribers.",
    relevance:
      "Social media managers and agency teams rely on outbound link posts to distribute client campaigns and drive measurable traffic, so gating basic publishing options behind subscriptions alters their daily workflow and software overhead.",
    whyNow:
      "Multiple accounts reported on Meta One's live global launch and link restrictions within the monitored window.",
    isTrending: true,
    article: {
      title:
        "Monitored accounts on Meta One subscription tiers gating links and creator features, August 19 to September 23, 2026",
      subheads: [
        "",
        "Tiered pricing and distribution thresholds",
        "",
        "",
        "For the brand",
        "Paid distribution thresholds and organic referral measurement",
        "Managing restricted outbound distribution",
        "",
        "Refocusing attribution frameworks",
      ],
      paragraphs: [
        "Three monitored accounts addressed platform developments over the thirty-six-day window, with commentary concentrated on LinkedIn at low volume. Discussion focused on the arrival of paid membership packages and their impact on functional distribution.",
        "One account highlighted the worldwide release of the subscription framework, noting that base access begins at $7.99 per month while the top commercial package demands at least $499 monthly.",
        "Another account connected the program directly to distribution constraints. It stated that inclusion in the program grants the ability to place functional hyperlinks directly into post descriptions on Instagram. Concurrently, that same account pointed to accounts from practitioners encountering monthly caps of two link-bearing shares across standard pages on Facebook unless an active subscription is maintained.",
        "The monitored posts reflect a shift toward attaching baseline marketing mechanics, specifically referral clicks, to recurring account charges rather than organic distribution channels.",
        "Agorapulse positions itself as an operational hub helping marketing teams, agencies, and expanding brands save time, stay organised, and prove the tangible value of social media work through dedicated social ROI tracking.",
        "Platform owners periodically adjust basic publishing allowances to encourage monetization, transforming standard outbound mechanics into paid features.",
        "When basic referral methods face frequency caps or require dedicated profile billing, publishing strategies require structural reorganization. Restricting unpaid outbound posts forces teams to evaluate the exact commercial return of external traffic versus network-native engagement. Uncapped publishing historically allowed continuous testing of landing page conversion; strict allocation limits mean each outbound post must justify its slot against measurable conversion figures.",
        "Monitored discussions show the platform testing distribution barriers, creating situations where regular company feeds risk losing outbound routing altogether unless accounts absorb monthly administrative fees. Marketing operations running across diverse profile rosters face compounding overhead if subscriptions are mandated profile by profile.",
        "Restricting hyperlinked updates alters how teams prove business value. For years, external referral traffic functioned as the primary measurement for social campaign success. When link posts are constrained to low monthly counts, teams must separate channel operations into distinct goals: using organic updates strictly for audience retention while reserving limited external link slots for verified, high-converting revenue events. Treating external traffic as an expensive asset requires precise attribution models that demonstrate whether external visits justify both platform costs and administrative labor.",
      ],
    },
    posts: [
      {
        id: "inf-ap-01-1",
        network: "linkedin",
        publishedOn: "21 Sep 2026",
        author: {
          name: "Matt Navarra",
          handle: "@mattnavarra",
          initials: "MN",
          accent: "electric-blue",
        },
        text: "The BIGGEST social media updates of this week, in under 3 minutes 🔥\n\n- Meta One is now live globally, with consumer plans from $7.99 a month and a new Max tier for creators and businesses running at least $499 a month.\n- Snap Inc. launched $2,200 Specs AR glasses alongside Specs Intelligence, a new AI assistant, doubling down on cameras as a feature rather than a liability.\n- The European Commission has proposed banning social media access for under-13s, with full platform access reserved for over-18s.\n- TikTok rejected Meta's own ads asking it to join Meta's child safety settlement framework.\n- Meta is being sued over allegedly using Facebook and Instagram photos to illegally train its AI and facial recognition systems.\n- Multiple women told WIRED they felt \"super violated\" after discovering dates were recording them with Meta smart glasses.\n- A new startup called Noise wants to let anyone become a paid creator and get paid on results, no existing following required.\n...And more…",
        likes: 412,
        comments: 38,
        reposts: 21,
        url: "https://www.linkedin.com/in/mattnavarra/",
      },
      {
        id: "inf-ap-04-1",
        network: "linkedin",
        publishedOn: "19 Sep 2026",
        author: {
          name: "Annie-Mai Hodge",
          handle: "@anniemaihodge",
          initials: "AH",
          accent: "menthol",
        },
        text: "👋🎙️📌🗞️ Social media updates you NEED to know this week:\n\n→ Instagram is allowing users and brands to add links in their captions, finally… If they subscribe to Meta One.\n\n→ Some users are reporting (and I've heard it from many peers) that pages on Facebook are being limited to just two posts with links per month, unless they pay for the Meta One subscription.\n\n→ LinkedIn is testing a “Network” feed, to help users “stay connected to your network, i.e. the people you have explicitly connected or followed.”\n\n→ Threads advertisers will no longer need an Instagram account, and if they do have an Instagram account, they'll no longer need to have a matching username on both Threads and Instagram to run promotions.\n\n→ Adobe launches Premiere on Android for free.\n\n→ Instagram now notifies users when someone has unfollowed them. And this is the fake update for the folks who steal Annie-Mai's content.\n\n→ Adam Mosseri clarifies a few more things in last week's AMA over on Instagram: dele…",
        likes: 286,
        comments: 54,
        reposts: 12,
        url: "https://www.linkedin.com/in/anniemaihodge/",
      },
      {
        id: "inf-ap-06-1",
        network: "linkedin",
        publishedOn: "16 Sep 2026",
        author: {
          name: "Michael Stelzner",
          handle: "@stelzner",
          initials: "MS",
          accent: "orange",
        },
        text: "I handed a raw video to AI and said, ‘Get this down to two minutes.’ Then I watched what it did when she moved her head.\n\nWhile I'm trying to get Social Media Marketing World to 3,000, I keep running into moments like this one.\n\nDan was showing me that Codex can handle the whole video editing process. No Final Cut. No editing app of any kind. No MCP. You drag in the file and tell it what you want.\n\nSo I did. I asked it to find the most salient clips, make sure it included me (‘the old gray-haired guy’), John, and Jessica, crop it, and keep the person centered in the frame the whole time.\n\nIt worked for eight minutes. Captions? It'll do it. A title on top? It'll do it. Horizontal to vertical? Yep.\n\nBut here's the part neither of us saw coming. When she moved her head, the frame moved with her. Like a camera operator had been following her the entire time. We both expected it to crop once and let her wander out of frame. It didn't. Mind blown.…",
        likes: 198,
        comments: 27,
        reposts: 6,
        url: "https://www.linkedin.com/in/stelzner/",
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "3d ago",
        note: "Surfaced from the 19 Aug – 23 Sep LinkedIn influencer scan.",
      },
    ],
  },
  {
    id: "inf-agp-2",
    feedId: "topic-list-6",
    sourceId: "influencer-posts",
    ageLabel: "8d ago",
    kind: "ready",
    headline: "Automated end-to-end video reframing and editing with AI",
    summary:
      "One monitored account details testing an AI workflow using Codex to handle the full video editing pipeline from raw footage without manual editing software. The account highlights dynamic subject tracking and automated reframing, where the crop follows subject movement rather than staying static.",
    relevance:
      "Marketing teams producing short-form video spend significant production hours manually cropping, centering, and reframing clips across social formats.",
    whyNow: "Shared as a hands-on production experiment during the current window.",
    article: {
      title: "Conversational prompt-driven video reframing and editing (2026-08-19 to 2026-09-23)",
      subheads: [
        "",
        "",
        "",
        "",
        "For the brand",
        "Managing the output of autonomous production",
        "Dynamic framing versus editorial composition",
        "",
        "Verification and schedule bottlenecks",
        "",
      ],
      paragraphs: [
        "One monitored account on LinkedIn reported testing conversational prompts to execute multi-step video editing workflows without conventional software.",
        "The post describes feeding raw footage into a general-purpose model interface using plain instructions. The account claims the system parsed an eight-minute recording down to a specified target length, selected segments featuring specific named participants, added text overlays and subtitles, and converted horizontal footage into a vertical orientation.",
        "The account highlighted continuous subject tracking as the unexpected capability. Rather than applying a static central crop where speakers drift beyond view, the system dynamically adjusted the crop window to track head movements throughout the sequence. The post frames this as bypassing specialized editing applications entirely through conversational instructions.",
        "One item matched this subject during the period, falling into the low volume band on LinkedIn.",
        "Agorapulse positions its platform around saving time, staying organised, and proving social media value for agencies and marketing teams. As generative systems lower the friction of post-production cutting, social teams face a practical bottleneck not in assembling short-form cuts, but in coordinating review cycles, scheduling distribution across formats, and measuring which variations generate business results.",
        "Prompt-driven workflows allow marketers to bypass technical video suites for routine reframing and transcription. However, delegating cuts to autonomous pipelines introduces specific structural friction across multi-network publishing.",
        "One monitored account describes software that automatically follows a speaker across a vertical frame. In practice, automated reframing relies on facial recognition or saliency bounding boxes to determine focal points. While this maintains face visibility across mobile ratios, it frequently misinterprets multi-subject scenes, shared graphics, or presentation slides where the visual context sits away from the speaker.",
        "Marketing teams evaluating automated reframing must separate routine single-speaker tracking from deliberate visual pacing. When software tracks natural head movement continuously, it can introduce rapid lateral shifts that distract viewers. Teams using prompt-based reformatting still require manual quality checks to ensure crops do not cut off overlaid assets or introduce visual instability.",
        "As the generation of platform-specific aspect ratios accelerates, the operational challenge moves from footage manipulation to quality assurance and rights verification. Conversational tools generate multiple cutdowns rapidly, but they do not manage approvals, multi-account calendar coordination, or direct performance attribution.",
        "Handling an increased volume of vertical short-form assets requires structured governance: verifying speaker permissions, ensuring caption accuracy across industry-specific terminology, and scheduling delivery across separate channels. For agencies managing multiple brands, the primary operational safeguard remains a unified dashboard that links ingested creative assets to scheduled publishing queues and tracks incoming post performance.",
      ],
    },
    posts: [
      {
        id: "inf-ap-06-2",
        network: "linkedin",
        publishedOn: "16 Sep 2026",
        author: {
          name: "Michael Stelzner",
          handle: "@stelzner",
          initials: "MS",
          accent: "orange",
        },
        text: "I handed a raw video to AI and said, ‘Get this down to two minutes.’ Then I watched what it did when she moved her head.\n\nWhile I'm trying to get Social Media Marketing World to 3,000, I keep running into moments like this one.\n\nDan was showing me that Codex can handle the whole video editing process. No Final Cut. No editing app of any kind. No MCP. You drag in the file and tell it what you want.\n\nSo I did. I asked it to find the most salient clips, make sure it included me (‘the old gray-haired guy’), John, and Jessica, crop it, and keep the person centered in the frame the whole time.\n\nIt worked for eight minutes. Captions? It'll do it. A title on top? It'll do it. Horizontal to vertical? Yep.\n\nBut here's the part neither of us saw coming. When she moved her head, the frame moved with her. Like a camera operator had been following her the entire time. We both expected it to crop once and let her wander out of frame. It didn't. Mind blown.…",
        likes: 198,
        comments: 27,
        reposts: 6,
        url: "https://www.linkedin.com/in/stelzner/",
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "8d ago",
        note: "Surfaced from the 19 Aug – 23 Sep LinkedIn influencer scan.",
      },
    ],
  },
  {
    id: "inf-agp-3",
    feedId: "topic-list-6",
    sourceId: "influencer-posts",
    ageLabel: "2w ago",
    kind: "ready",
    headline: "False positives and bypasses in Instagram AI content labeling",
    summary:
      "One monitored account highlights inaccuracies in Instagram's automated AI detection system, reporting that authentic brand photography received forced AI labels while generated imagery with standard watermarks passed unlabeled. The account notes that social teams had to issue public clarifications after their organic images were incorrectly tagged.",
    relevance:
      "Social media managers risk brand credibility and audience confusion when native platform moderation tools mistakenly flag authentic production assets as artificial.",
    whyNow: "Reported following a recent wave of enforcement and external media testing covered in the window.",
    article: {
      title:
        "Social commentary on platform misclassification and evasion of synthetic media badges from August 19 to September 23, 2026",
      subheads: [
        "",
        "",
        "For the brand",
        "Navigating automated synthetic attribution",
        "Origin markers and post-production artifacts",
        "Preserving asset lineage for audit defense",
        "",
        "",
        "",
        "",
      ],
      paragraphs: [
        "A single monitored account addressed automated synthetic asset flags during this period, generating low volume on LinkedIn.",
        "The post reports that authentic mobile photography received automated synthetic production notices, forcing brand representatives to publicly state that generative tools played no part in asset creation. Citing investigations conducted by an editorial outlet, the contributor notes that imagery created through third-party generative suites failed to prompt system notifications, even when bearing established metadata identifiers. According to the test cited, newly established publishing handles distributing machine-generated media in rapid succession escaped platform filters, with detection occurring consistently only when output originated from the platform provider's internal generative application.",
        "Agorapulse serves social media managers and agencies who must maintain publishing accuracy and brand credibility, drawing on its mission of automated moderation, organized publishing, and time savings. When native automated filters misread genuine assets while synthetic media passes undetected, publishing workflows require clear asset tracking to protect brand reputation against erroneous moderation badges.",
        "Automated asset labeling relies primarily on embedded metadata markers alongside image-analysis heuristics. When publishing workflows introduce subtle digital adjustments, platform algorithms frequently confuse routine edits with full generative generation, while actual synthetic assets stripped of structural flags evade notice entirely.",
        "One monitored account highlights that genuine mobile snapshots have been tagged as computer-generated, while media built using standard commercial suites escaped tagging entirely despite embedded digital signatures. Metadata standards such as the Coalition for Content Provenance and Authenticity (C2PA) and invisible watermarking protocols like SynthID are designed to record an asset's lineage. In regular marketing production, routine tasks like cleaning backgrounds, applying corrective filters, or re-exporting files through certain compression software can inadvertently insert synthetic tags or scrub genuine provenance chains. When native systems scan these modified files, heuristic systems often misclassify routine editing adjustments as complete generative creation.",
        "Because automated review operates asynchronously after publication, teams face public scrutiny before they can contest a classification error. Maintaining internal audit trails protects campaign integrity:",
        "Archive raw capture records: Retaining camera raw files and source mobile assets provides timestamped documentation when audiences question an applied label.",
        "Audit export pipelines: Some design applications embed synthetic lineage tags when generative fill is applied to minor portions of a background, triggering global asset warnings upon upload.",
        "Separate native captures from generative elements: Storing digital mockups separately from standard studio assets keeps digital lineage distinct across client handoffs.",
        "When moderation tools misinterpret production workflows, having documented file histories enables practitioners to address audience confusion quickly without slowing production schedules.",
      ],
    },
    posts: [
      {
        id: "inf-ap-03-3",
        network: "linkedin",
        publishedOn: "9 Sep 2026",
        author: {
          name: "Matt Navarra",
          handle: "@mattnavarra",
          initials: "MN",
          accent: "electric-blue",
        },
        text: "Instagram's AI detection system is flagging real photos as AI.\n\nMeanwhile, actual AI content is sailing straight through.\n\nA Halsey-owned brand, about-face beauty, had real iPhone photos hit with the \"AI Content\" label recently. Their social team had to publicly clarify that no AI was involved.\n\nThe Verge ran a test. They uploaded AI-generated images with Adobe Firefly, Google's Gemini, and Apple's own AI tools, all carrying real verification watermarks, C2PA and SynthID. Meta didn't flag any of it.\n\nThey even built a brand-new account and posted rapid-fire to look like an AI farm, on purpose. That didn't get caught either, despite Meta's own crackdown on fake AI accounts running at the same time.\n\nThe only thing that reliably triggered the label in all this testing was content made in Meta's own AI app. Impressive 👏\n\nJust weeks ago Instagram cracked down on unlabelled AI accounts, and now its own system starts labelling the wrong content entirely.…",
        likes: 931,
        comments: 112,
        reposts: 64,
        url: "https://www.linkedin.com/in/mattnavarra/",
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "2w ago",
        note: "Surfaced from the 19 Aug – 23 Sep LinkedIn influencer scan.",
      },
    ],
  },
  {
    id: "br-27",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "2h ago",
    kind: "ready",
    headline: "Everyone is shipping an agent. Nobody says what it takes off your plate",
    summary:
      "Fourteen posts across Hootsuite, Vista Social and Buffer pitch conversational agents as a replacement for the dashboard. The claims are about architecture — orchestration layers, autonomous teammates — not about which job disappears on a Tuesday.",
    relevance:
      "Social media managers spend their working days inside publishing and monitoring dashboards, so shifting execution to conversational AI agents fundamentally alters their daily operations. Teams managing high-volume channels feel the need for automated triage first.",
    whyNow:
      "The highest-volume theme in the whole scan — 14 items, and every major competitor moved within the same thirty days.",
    isTrending: true,
    article: {
      title: "The category is selling the architecture. Social media managers buy the hour back",
      subheads: ["Fourteen items, all architecture", "Show the Tuesday, not the layer"],
      paragraphs: [
        "Fourteen items in this window pitch conversational agents as a replacement for the dashboard. Hootsuite describes rebuilding the product around an agent layer rather than bolting AI onto it. Vista Social launched a command surface wired into fifty-odd tools. Buffer published a creator's stack of MCP servers. The vocabulary is consistent across all three: orchestration layers, intelligence units, autonomous teammates.",
        "What is almost entirely missing is the other half of the sentence. An agent that runs continuously and only interrupts you when something matters is a good pitch — but a social media manager reading it wants to know which of today's twenty jobs it does. Morning briefing? Inbox triage? Flagging the post that overperformed? Some posts list those duties; most stop at the layer.",
        "That gap is the opening, and it is not a positioning argument — it is a format one. The same claim written as a workflow beats it written as an architecture. Show the Tuesday: what the inbox looked like at 9am, what the agent had already sorted, what was left for a human, and how long that took before.",
        "One competitor makes the cost comparison explicit, setting a monthly subscription against the labour it displaces. That framing is available to anyone, and it is more concrete than any of the capability language around it.",
      ],
    },
    posts: [
      {
        id: "agp-p1",
        network: "instagram",
        publishedOn: "14 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: 'Still using a dashboard to manage social? That\'s sooo 2025. The smarter way: Connect the AI tool you already use (Claude, Gemini, whatever) to handle your social tasks right in the chat. Comment "chat" for the shortcut👇',
        likes: 18,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Dayg7sfjNo4/",
      },
      {
        id: "agp-p2",
        network: "instagram",
        publishedOn: "24 Jun 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "There's a future where you'll be able to do everything you do in Hootsuite now — without ever looking at our software. Today, we're announcing a major step toward that future. While others bolt AI features onto their existing tools and platforms, we've…",
        likes: 62,
        comments: 14,
        reposts: 0,
        url: "https://www.instagram.com/p/DZ-GDNcDj9a/",
      },
      {
        id: "agp-p3",
        network: "instagram",
        publishedOn: "14 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Last year, scaling meant hiring another coordinator. This year, it means setting up an agent. Here's the test I use to tell a real AI agent from a gimmick: does it just generate content, or does it actually run your operations? Triaging inboxes, flagging…",
        likes: 21,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Dax2KWUiloD/",
      },
      {
        id: "agp-p4",
        network: "instagram",
        publishedOn: "3 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "Meet Wisdom. Your social-first AI teammate, and the intelligence layer behind everything in Hootsuite's Social OS. In seconds, Wisdom: 👀 Surfaces what deserves your attention 🧠 Explains why it matters 💡 Sets you up to take action. Ask it anything. It knows…",
        likes: 23,
        comments: 3,
        reposts: 0,
        url: "https://www.instagram.com/p/DaVp3aMGpRP/",
      },
      {
        id: "agp-p5",
        network: "instagram",
        publishedOn: "25 Jun 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: 'We knew there was a better way to manage social. And we knew we couldn\'t deliver it by bolting AI onto Hootsuite. So we started over and built AI right in. Comment "Suite" for more details!',
        likes: 60,
        comments: 12,
        reposts: 0,
        url: "https://www.instagram.com/p/DaA5GJ0lJFO/",
      },
      {
        id: "agp-p6",
        network: "instagram",
        publishedOn: "25 Jun 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Your social media now has a whole AI team on the clock. Ask Vista lives inside Vista Social and it types back. Need a report? Done. Inbox chaos? Sorted. Leads slipping through the cracks at 2am? Leo's got it. 50+ tools. 25+ agents. 20+ skills. All yours, just…",
        likes: 13,
        comments: 2,
        reposts: 0,
        url: "https://www.instagram.com/p/DaAoBwyFNkf/",
      },
    ],
    seedStatus: "new",
    volume: "high",
    history: [
      {
        status: "new",
        when: "2 hours ago",
        note: "Surfaced from the Apr 2025 – Jul 2026 competitor scan (14 matching items).",
      },
    ],
  },
  {
    id: "br-28",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "4d ago",
    kind: "ready",
    headline: "MCP is being explained to engineers. Nobody has explained it to a social media manager",
    summary:
      "Eight items, three quarters of them blog posts, frame connectors as the glue between social data and the AI tools people already draft in. Every one is pitched at a technical reader — and the person who would benefit most isn't one.",
    relevance:
      "Marketing teams increasingly rely on external AI tools for strategy and drafting, making direct data connectors essential for bridging the gap between social data and AI generation. Technical operators running multi-channel pipelines adopt these integrations first.",
    whyNow:
      "Concentrated thought-leadership and guide publications from Buffer and Hootsuite throughout July 2026 highlight the growing adoption of MCP.",
    isUpdated: true,
    article: {
      title: "Your listening data, in the chat window where the work already happens",
      subheads: ["Eight items, one technical register", "The same story, told to a social media manager"],
      paragraphs: [
        "Eight items in this window cover Model Context Protocol connectors, three quarters of them on web blogs. Buffer publishes a creator's roundup of the eight servers they use weekly. Hootsuite frames protocol bridges as the way social intelligence reaches outside tools. One head-to-head comparison makes a point of MCP access being included on every plan.",
        "All of it is written for someone comfortable with the words 'server' and 'protocol'. The person with the most to gain is a social media manager who already drafts in a chat tool and retypes numbers into it by hand — and none of this content is addressed to them.",
        "Written for that reader, the story is short: the reporting you screenshot into a prompt can arrive by itself. No new dashboard to learn, no export step, and the thing you were already doing gets its data automatically. That is a workflow post, not a technical one, and it is unoccupied.",
        "The pricing angle travels with it. If protocol access is a paid tier elsewhere and not here, that belongs in the comparison content the scan shows already captures bottom-funnel search. Written as one piece the two arguments answer different readers without competing: the workflow story for the person who does not care what a server is, and the tier comparison for the one who is already choosing between vendors.",
      ],
    },
    posts: [
      {
        id: "agp-p7",
        network: "instagram",
        publishedOn: "9 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "One MCP is great. Several MCPs stacked on top of each other is even better. Here are the 8 I use in my day to day as a creator. Comment MCP to get the article or check the link in bio🔗",
        likes: 40,
        comments: 4,
        reposts: 0,
        url: "https://www.instagram.com/p/DalMPEzMMvm/",
      },
      {
        id: "agp-p8",
        network: "instagram",
        publishedOn: "15 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "As of today, you have access to Insights in Buffer! 🎉 Your numbers can tell you a lot, but not always what to do with them. Buffer Insights helps close that gap. It reads what's working across your channels and suggests what to try next, you can act on right…",
        likes: 111,
        comments: 5,
        reposts: 0,
        url: "https://www.instagram.com/p/Da0IuICiKbD/",
      },
      {
        id: "agp-p9",
        network: "instagram",
        publishedOn: "14 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: 'Still using a dashboard to manage social? That\'s sooo 2025. The smarter way: Connect the AI tool you already use (Claude, Gemini, whatever) to handle your social tasks right in the chat. Comment "chat" for the shortcut👇',
        likes: 18,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Dayg7sfjNo4/",
      },
      {
        id: "agp-p10",
        network: "instagram",
        publishedOn: "24 Jun 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "There's a future where you'll be able to do everything you do in Hootsuite now — without ever looking at our software. Today, we're announcing a major step toward that future. While others bolt AI features onto their existing tools and platforms, we've…",
        likes: 62,
        comments: 14,
        reposts: 0,
        url: "https://www.instagram.com/p/DZ-GDNcDj9a/",
      },
    ],
    seedStatus: "new",
    volume: "medium",
    history: [
      {
        status: "new",
        when: "1 week ago",
        note: "Surfaced from the competitor scan (1 matching item).",
      },
      {
        status: "new",
        when: "4 days ago",
        note: "Re-scanned — 8 matching items, and the framing shifted.",
      },
    ],
  },
  {
    id: "br-45",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "1d ago",
    kind: "ready",
    headline: "Two ways to sell an agent: bring your own AI, or move into theirs",
    summary:
      "Every account in this window agrees the chat replaces the dashboard. They split on where the agent lives — one rebuilds the suite into apps behind a central agent and bridges out to the AI you already use, the other is a command surface you move into. That is the choice nobody is putting to the buyer.",
    relevance:
      "Social media managers spend much of their working day inside publishing, inbox, and analytics dashboards, so a shift toward conversational agent layers directly alters how daily team and account operations are managed.",
    whyNow:
      "Concentrated messaging across June and July 2026 driven by Hootsuite's Social OS release, Vista Social's Ask Vista launch, and Buffer's practitioner content on MCP integrations.",
    article: {
      title: "The category agrees on the premise and splits on the architecture",
      subheads: ["One premise, two architectures", "The question a buyer can actually answer"],
      paragraphs: [
        "Every monitored account in this window makes the same promise: conversational commands supersede interface navigation, agents run in the background, and you are interrupted only when something matters. The vocabulary is shared too — orchestration layers, intelligence units, autonomous teammates.",
        "They diverge on structure, and the divergence is the story. One approach reorganises a legacy suite into purpose-built component apps — publishing, care, listening, advocacy — governed by a central agent, and keeps protocol bridges open so listening data flows into whatever AI tool the rest of the company already uses. The other positions its product as a standalone conversational command surface wired directly into its own tools; a third framing presents the software as one link inside a practitioner's stack rather than the platform itself.",
        "Underneath the two shapes is one number worth repeating: a provider's own research claims most senior marketing leaders already run AI tools that have no access to live social data. Both architectures are answers to that, and they ask opposite things of you — bring your own AI and let the data reach it, or bring your work to the vendor's chat.",
        'That is a question a social media manager can actually answer, unlike "is AI a foundation or a feature". Whoever writes it as a straight comparison — where does the agent live, whose AI does it feed, what happens to your data when you change tools — publishes the piece the category has been talking around for a month.',
      ],
    },
    posts: [
      {
        id: "agp-p31",
        network: "instagram",
        publishedOn: "24 Jun 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "There's a future where you'll be able to do everything you do in Hootsuite now — without ever looking at our software. While others bolt AI features onto their existing tools and platforms, we've rebuilt Hootsuite from the ground up with AI as a foundation, not a feature. Flow real-time social listening insights directly into the AI tools you already use across your organization via MCP connectors.",
        likes: 62,
        comments: 14,
        reposts: 0,
        url: "https://www.instagram.com/p/DZ-GDNcDj9a/",
      },
      {
        id: "agp-p32",
        network: "instagram",
        publishedOn: "25 Jun 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: 'We knew there was a better way to manage social. And we knew we couldn\'t deliver it by bolting AI onto Hootsuite. So we started over and built AI right in. Comment "Suite" for more details!',
        likes: 60,
        comments: 12,
        reposts: 0,
        url: "https://www.instagram.com/p/DaA5GJ0lJFO/",
      },
      {
        id: "agp-p33",
        network: "instagram",
        publishedOn: "25 Jun 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: 'Your social media now has a whole AI team on the clock. Ask Vista lives inside Vista Social and it types back. Need a report? Done. Inbox chaos? Sorted. 50+ tools. 25+ agents. 20+ skills. All yours, just by typing. Comment "ask vista" below and we\'ll send you the link. 👇',
        likes: 13,
        comments: 2,
        reposts: 0,
        url: "https://www.instagram.com/p/DaAoBwyFNkf/",
      },
      {
        id: "agp-p34",
        network: "instagram",
        publishedOn: "14 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Here's the test I use to tell a real AI agent from a gimmick: does it just generate content, or does it actually run your operations? Triaging inboxes, flagging leads in comments, drafting review replies, building monthly reports — while you sleep. Ask Vista does the math for you too — every agent logs the hours it saved and what that labor would've cost a human.",
        likes: 21,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Dax2KWUiloD/",
      },
      {
        id: "agp-p35",
        network: "instagram",
        publishedOn: "9 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "One MCP is great. Several MCPs stacked on top of each other is even better. Here are the 8 I use in my day to day as a creator. Comment MCP to get the article or check the link in bio🔗",
        likes: 40,
        comments: 4,
        reposts: 0,
        url: "https://www.instagram.com/p/DalMPEzMMvm/",
      },
    ],
    seedStatus: "new",
    volume: "high",
    history: [
      {
        status: "new",
        when: "1 day ago",
        note: "Surfaced from the competitor scan (5 matching items).",
      },
    ],
  },
  {
    id: "br-29",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "6d ago",
    kind: "ready",
    headline: "The argument isn't more metrics. It's which number ends an argument",
    summary:
      "Sprinklr says analytics break down when teams use inconsistent definitions. Buffer shipped Insights to turn numbers into next steps. Sprout published the pillar guide. Four items, one shared premise: volume of metrics is not insight.",
    relevance:
      "Marketing leaders struggle to prove social ROI when dealing with disconnected platform metrics and multiple unaligned dashboards. Agencies and growing teams handling multiple client accounts feel the pressure of metric fragmentation most acutely.",
    whyNow: "Featured insights and product updates from Sprinklr and Buffer clustered densely in mid-July 2026.",
    article: {
      title: "Everyone tracks more. Almost nobody says which number changes a decision",
      subheads: ["Three competitors, one complaint", "Which number ends an argument"],
      paragraphs: [
        "Four items in this window, split across web blogs, Facebook and Instagram, converge on the same complaint: reporting breaks at scale when teams use inconsistent definitions and siloed tools, so results can't be compared or trusted. Sprinklr argues for a single governed measurement framework. Buffer shipped a feature to turn data into takeaways. Sprout published the cornerstone metrics guide.",
        "The convergence is the interesting part. Three competitors with very different customers arrived at the same premise — that tracking more does not produce more insight — which means the premise is safe and the differentiation has to be downstream of it.",
        "Downstream is the decision. A metrics guide tells you what to measure; almost nothing in this window tells you which number should change what you do next week, or what to stop doing when it moves. For an agency reporting on several accounts, that is the whole job.",
        "There is a customer story shape here too, and this Playbook is built for it: one team, one report that used to take a morning, and the specific meeting it now settles.",
      ],
    },
    posts: [
      {
        id: "agp-p11",
        network: "instagram",
        publishedOn: "15 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "As of today, you have access to Insights in Buffer! 🎉 Your numbers can tell you a lot, but not always what to do with them. Buffer Insights helps close that gap. It reads what's working across your channels and suggests what to try next, you can act on right…",
        likes: 111,
        comments: 5,
        reposts: 0,
        url: "https://www.instagram.com/p/Da0IuICiKbD/",
      },
      {
        id: "agp-p12",
        network: "instagram",
        publishedOn: "2 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "Customer feedback isn't the hard part anymore. Turning it into action is. Sprinklr's Chief Product Officer Karthik Suri shares a simple framework for what makes an AI-native approach to Customer Feedback Management different: 1️⃣ Data. 2️⃣ Context. 3️⃣…",
        likes: 7,
        comments: 1,
        reposts: 0,
        url: "https://www.instagram.com/p/DaSte_qgDgz/",
      },
      {
        id: "agp-p13",
        network: "instagram",
        publishedOn: "20 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "The biggest moments don't announce themselves. They start as signals. A shift in conversation. An emerging trend. A change in customer behavior. The advantage doesn't go to the team with the most data. It goes to the team that recognizes what matters first…",
        likes: 9,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/DbBTbdAAhzY/",
      },
      {
        id: "agp-p14",
        network: "instagram",
        publishedOn: "16 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "Most telecom brands only get noticed when something goes wrong. That's the challenge. 🙇‍♀️ According to the 2026 Social Index, more than 60% of telecom brands operate in negative sentiment. Yet a handful are changing the narrative. Not through more content.…",
        likes: 8,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Da25kKljGEX/",
      },
    ],
    seedStatus: "new",
    volume: "low",
    history: [
      {
        status: "new",
        when: "6 days ago",
        note: "Surfaced from the competitor scan (4 matching items).",
      },
    ],
  },
  {
    id: "br-30",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "19d ago",
    kind: "ready",
    headline: "Buyers are asking an AI about you before they ask you",
    summary:
      "Sprinklr launched LLM Insights to track how brands appear in AI answers, and its content playbook argues search is moving into AI Overviews. Two items — thin — but it is the one theme in the scan with no incumbent.",
    relevance:
      "Marketing teams responsible for corporate reputation must track how conversational AI tools represent their brand, as prospective customers rely on direct AI answers during product research.",
    whyNow:
      "Launch announcements for LLM tracking tools and published guidance on generative engine optimization appeared in mid-2026.",
    article: {
      title: "The comparison page that matters most may be one you never see",
      subheads: ["Two items, below this lane's floor", "Unglamorous, and close to what already works"],
      paragraphs: [
        "Two items in this window cover brand visibility inside AI answers. Sprinklr launched LLM Insights — tracking how a brand shows up across LLM-powered search, and whether AI recommends it — and published a content playbook arguing that content now needs sharper structure, direct answers and credible sourcing because discovery is moving beyond ranked links.",
        "Two items is below the floor this lane treats as evidence, so this is an observation rather than a trend. It is recorded because of what it implies rather than how loud it is: if a prospective customer asks an assistant which social tool suits an agency, the answer is assembled from content nobody in this category is writing for that purpose.",
        "The practical version is unglamorous. Direct answers to real questions, sourced and structured, published where they can be cited. That is close to what the comparison content in this scan already does — the difference is writing it to be quoted rather than to be clicked.",
        "Worth watching before it is worth investing in. If a second competitor ships tracking for this, it stops being an observation.",
      ],
    },
    posts: [
      {
        id: "agp-p15",
        network: "instagram",
        publishedOn: "24 Jun 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "MAD//FEST energy, with a view ⛱️✨ Join us at the Sprinklr × SAMY Beach Hut, where social expertise meets real-time customer intelligence. Together with @samy.uk, we're creating a space for marketers to connect, explore, and rethink how campaigns come to life…",
        likes: 13,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/DZ9vxkilcO5/",
      },
      {
        id: "agp-p16",
        network: "instagram",
        publishedOn: "11 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "Someone on Instagram just compared your product to a competitor's. You didn't see it. Your dashboard didn't flag it. Your team won't know until it's too late. That's what happens when you monitor only for mentions and don't fully listen. We put together a…",
        likes: 12,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/DaoIf15FFY7/",
      },
      {
        id: "agp-p17",
        network: "instagram",
        publishedOn: "2 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: 'One report distills billions of social conversations into one picture. Social Media Trends 2026 names answer-engine optimisation as the discovery shift leaders are least ready for — and video getting indexed in public search as the one closest behind it. Comment "Trends" to get it.',
        likes: 44,
        comments: 6,
        reposts: 0,
      },
    ],
    seedStatus: "ignored",
    seedReason:
      "Two posts, both from one competitor. Real shift, but I'd rather write it when there's more than one account behind it.",
    volume: "low",
    history: [
      {
        status: "new",
        when: "19 days ago",
        note: "Surfaced from the competitor scan (2 matching items).",
      },
      {
        status: "ignored",
        when: "12 days ago",
        note: "Ignored — below the evidence floor.",
      },
    ],
  },
  {
    id: "br-31",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "6w ago",
    kind: "ready",
    headline: "Sprout has written the Bluesky guide twice. The question underneath it is unanswered",
    summary:
      "Two Sprout pieces: what Bluesky is, and how to build a brand presence on it. Both answer 'how'. Neither answers the question a social media manager actually has, which is whether it is worth the hours.",
    relevance:
      "Social media managers regularly evaluate whether emerging networks merit dedicated resource investment and how to establish brand presence without overextending operational capacity.",
    whyNow: "Dedicated strategy guides and platform explainers were published by monitored accounts in mid-July 2026.",
    article: {
      title: "Not 'how to post on Bluesky' — 'is it worth your Thursday'",
      subheads: ["Two guides, both about how", "An honest way to run the test"],
      paragraphs: [
        "Two web-blog items in this window, both from the same competitor: an explainer on what Bluesky is and where it fits in a 2026 strategy, and a fuller guide to building a brand presence — how the network differs from X and Threads, why a roughly 42-million audience skewing 25-34 is worth testing, and how to adapt tone and cadence.",
        "Both are 'how' content, and both are good at it. Neither answers the prior question, which is the one a social media manager with a full calendar actually asks: does this earn a slot, and what comes off the calendar to pay for it?",
        "That question has a shape this Playbook is suited to. Not a verdict — an honest way to run the test. What a fair trial looks like, over how many weeks, and the number that would tell you to keep going or stop. Two competitors have covered the setup; nobody has covered the decision.",
        "The audience fit also deserves a sentence rather than a statistic. A 25-34 skew matters to some of the brands reading this and not at all to others, and saying which is which is more useful than the number on its own.",
      ],
    },
    posts: [
      {
        id: "agp-p18",
        network: "instagram",
        publishedOn: "1 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "We recently moved our newsletter, The Weekly Scroll, to Substack and received a few questions about it. There were three main reasons: 🔠 Simple feature set 🛠️ Building expertise with a social platform ✨Social by default See what we've done so far at the link…",
        likes: 45,
        comments: 3,
        reposts: 0,
        url: "https://www.instagram.com/p/DaQay0btZxD/",
      },
      {
        id: "agp-p19",
        network: "instagram",
        publishedOn: "13 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: 'Brandon Green (@kidlightbulbs), a Staff Product Manager here at Buffer and founder of Unstream (@unstream.stream), described his marketing strategy as "impulse posting." Think of something, drop everything to write it, forget about it for two weeks. So he…',
        likes: 39,
        comments: 4,
        reposts: 0,
        url: "https://www.instagram.com/p/DavEqQLDRy3/",
      },
      {
        id: "agp-p20",
        network: "instagram",
        publishedOn: "9 Jul 2026",
        author: {
          name: "Sprout Social",
          handle: "@sproutsocial",
          initials: "SS",
          accent: "green",
        },
        text: "Bluesky, part two. Part one covered what it is; this one is the build — how to set up a brand presence, what to post in the first month, and which of your existing formats travel. Link in bio.",
        likes: 31,
        comments: 4,
        reposts: 0,
      },
    ],
    seedStatus: "used",
    volume: "low",
    history: [
      {
        status: "new",
        when: "6 weeks ago",
        note: "Surfaced from the competitor scan (2 matching items).",
      },
      {
        status: "used",
        when: "3 weeks ago",
        note: "Drafted into a chat.",
      },
    ],
  },
  {
    id: "br-32",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "3d ago",
    kind: "later",
    headline: "Buffer's creator says half their followers came from a ten-minute DM setup",
    summary:
      "Keyword-triggered DMs through Meta's official API, framed as the single biggest driver of their Instagram growth. Two items, both Buffer, both first-person — and the format is the whole reason it lands.",
    relevance:
      "Creator account managers and social marketers experience manual inbox strain when delivering resource links at scale.",
    whyNow:
      "Multiple posts published in June and July 2026 outline specific automation setups and account growth results.",
    article: {
      title: "The tactic is public. The proof is what's missing",
      subheads: ["One creator, one number", "What the publishable version needs"],
      paragraphs: [
        "Two items in this window, split between a first-person Instagram post and a longer guide, both from Buffer. The claim is specific: roughly half the account's followers came from keyword-triggered DM automation running on Meta's official API, set up in about ten minutes. The guide's angle is doing it without sounding robotic.",
        "It works because it is first-person and numbered. A platform explaining DM automation is a feature page; a person saying what it did for their own account is a story, and the comments do the rest.",
        "Which is also what this Idea is waiting on. The version worth publishing needs someone's real numbers — before, after, over what period — and permission to use them. Without that it is the same explainer everyone has.",
        "Blocked on: a customer or an in-house account willing to share follower data, and a screen recording of the setup rather than a description of it.",
      ],
    },
    posts: [
      {
        id: "agp-p21",
        network: "instagram",
        publishedOn: "30 Jun 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "Roughly half my followers came from this ten-minute setup. It's the \"comment the word and I'll send it\" thing you've seen everywhere. Runs through Meta's official API, so it won't get your account banned/limited. It's done the most for my growth journey on…",
        likes: 147,
        comments: 13,
        reposts: 0,
        url: "https://www.instagram.com/p/DaNq3Zfsfp5/",
      },
      {
        id: "agp-p22",
        network: "instagram",
        publishedOn: "26 Jun 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Comment VISTA and stop losing leads while you sleep 💸 Most content creators and businesses don't realize how much money walks away simply because no one replied in time Vista Social handles your DMs so you never miss another one",
        likes: 127,
        comments: 11,
        reposts: 0,
        url: "https://www.instagram.com/p/DaEEC7GuuLb/",
      },
      {
        id: "agp-p23",
        network: "instagram",
        publishedOn: "7 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: 'Comment "Ask Vista" and I\'ll DM you the link. I built an AI agent team that runs my social media 24/7 — zero humans, zero coding. In Ask Vista, I click New Agent, describe what I need in plain English, and it builds it. Mine hand me a morning briefing,…',
        likes: 225,
        comments: 305,
        reposts: 0,
        url: "https://www.instagram.com/p/DafuSiJx8yw/",
      },
    ],
    seedStatus: "new",
    volume: "medium",
    history: [
      {
        status: "new",
        when: "3 days ago",
        note: "Surfaced from the competitor scan (2 matching items).",
      },
    ],
  },
  {
    id: "br-33",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "5d ago",
    kind: "later",
    headline: '"Not every trend is your trend" — a way to tell which ones are',
    summary:
      "Vista Social ran two posts pulling apart the same week's viral moments: one a format you can build on, one a template where every brand's output is identical but the logo. The test underneath it is reusable.",
    relevance:
      "Social media teams waste significant creative hours jumping on fleeting fads that fail to deliver enduring audience connection.",
    whyNow: "Concentrated commentary and tactical guides emerged across multiple publishing channels in mid-July.",
    article: {
      title: "A format you can build on, or a template you can only copy",
      subheads: ["Format or template — the distinction", "Why this needs a recurring slot"],
      paragraphs: [
        "Two Instagram posts in this window make the same argument from different angles. The first separates a mockumentary format — which a brand can take and tell its own story inside — from an AI-edit template where every participant produces the identical clip with a different logo. The second argues most trends are a spike on one platform driven by a handful of accounts, not a trend at all.",
        "Both land on a test rather than a verdict, which is the useful part: does this give us something to build on, and is it moving on more than one network? That is two questions a social media manager can actually apply on a Thursday without a meeting.",
        "The reason this isn't ready is that a trend-vetting piece is worthless in the abstract. It needs this week's examples, and by the time it publishes they have to still be current — which makes it a repeatable format rather than a one-off, and a format needs a slot in the calendar and someone who owns it.",
        "Blocked on: a recurring slot, and a decision about who picks the two examples each time.",
      ],
    },
    posts: [
      {
        id: "agp-p24",
        network: "instagram",
        publishedOn: "20 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Not every trend is your trend. 🚩 Two blew up this week — one's worth your team's time, one's a trap. The Netflix mockumentary format? Do it. It's a format, not a clip. You build your own story, your own angle, your own dramatic zoom on a random photo. People…",
        likes: 88,
        comments: 3,
        reposts: 0,
        url: "https://www.instagram.com/p/DbBUd_mP1lJ/",
      },
      {
        id: "agp-p25",
        network: "instagram",
        publishedOn: "15 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: 'Most "trends" are a spike on one platform, driven by a handful of accounts — not actual cross-platform momentum. ㅤ We put together the exact 5-step check to confirm a trend is real before you build content around it. ㅤ Comment "TRENDS" and we\'ll send you the…',
        likes: 16,
        comments: 4,
        reposts: 0,
        url: "https://www.instagram.com/p/Da0VxlSiWjp/",
      },
      {
        id: "agp-p26",
        network: "instagram",
        publishedOn: "20 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "The biggest moments don't announce themselves. They start as signals. A shift in conversation. An emerging trend. A change in customer behavior. The advantage doesn't go to the team with the most data. It goes to the team that recognizes what matters first…",
        likes: 9,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/DbBTbdAAhzY/",
      },
    ],
    seedStatus: "new",
    volume: "high",
    history: [
      {
        status: "new",
        when: "5 days ago",
        note: "Surfaced from the competitor scan (2 matching items).",
      },
    ],
  },
  {
    id: "br-34",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "11d ago",
    kind: "later",
    headline: "Buffer publishes head-to-head comparisons. We publish feature pages",
    summary:
      "Buffer vs Sprout, Buffer vs Hootsuite, Buffer vs Metricool — all on the blog, all pitched at people already deciding. The scan's own note calls it bottom-funnel search capture, and nobody in the set is doing it defensively.",
    relevance:
      "Comparison pages catch people already choosing between vendors, which is the last moment a social media manager's shortlist is still editable. Nobody in the set is defending that ground.",
    whyNow: "Three head-to-head posts on one blog, and the scan's own note flags them as bottom-funnel search capture.",
    article: {
      title: "The comparison the buyer runs anyway, written by someone who knows the answer",
      subheads: ["Three comparisons, all conceding something", "The decision that comes before the draft"],
      paragraphs: [
        "Three head-to-head comparisons in this window, all Buffer, all on the blog: against Sprout Social, against Hootsuite, against Metricool. Each covers features, pricing structure and which team size it suits. The scan tags all three the same way — competitor-comparison content aimed at high-intent switchers.",
        "The tone is what makes them work. They concede things. A comparison that finds the competitor better at nothing reads as an advert and converts like one, and buyers who have already opened three tabs can tell the difference immediately.",
        "This is the highest-intent content in the whole scan and it is the one thing here that needs a decision before a draft. Being honest in public about where a rival is stronger is a position, not a writing task.",
        "Blocked on: sign-off on how candid the comparisons are allowed to be, and current pricing for each competitor — the numbers go stale fast and a wrong one is worse than no page.",
      ],
    },
    posts: [
      {
        id: "agp-p27",
        network: "instagram",
        publishedOn: "17 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "Buffer vs Sprout Social, honestly. Where Sprout is stronger (approval chains, enterprise reporting), where we are (price per channel, API access on every plan), and who each one actually suits. Full comparison on the blog.",
        likes: 58,
        comments: 9,
        reposts: 0,
      },
      {
        id: "agp-p28",
        network: "instagram",
        publishedOn: "10 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "Buffer vs Hootsuite. We concede the listening depth — Hootsuite has fifteen years of it. What we will not concede is what a team of five pays to publish. The numbers, side by side, on the blog.",
        likes: 41,
        comments: 12,
        reposts: 0,
      },
      {
        id: "agp-p29",
        network: "instagram",
        publishedOn: "9 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "Buffer vs Metricool: pricing models (per-channel against per-brand), analytics depth, and who each suits. Includes the bit most comparison pages leave out — MCP and API access is on every Buffer plan, not a tier.",
        likes: 37,
        comments: 5,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "11 days ago",
        note: "Surfaced from the competitor scan (3 matching items).",
      },
    ],
  },
  {
    id: "br-35",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "5w ago",
    kind: "later",
    headline: "The brands winning attention stopped posting about their product",
    summary:
      "Sprinklr's line — 76% of tech brands stuck because they all say the same thing — next to Vista Social's case study where organic LinkedIn was the biggest lead source of the year. Three items, one argument.",
    relevance:
      "Marketing leaders struggling with low engagement rates need alternative approaches to capture attention in saturated feeds.",
    whyNow: "Several reports and podcast highlights focused on organic strategy throughout July.",
    article: {
      title: "Posting more didn't work. Posting about something else did",
      subheads: ["The pattern, and what replacing it looks like", "This argument needs a named company"],
      paragraphs: [
        "Three items in this window, two thirds Instagram. Sprinklr's claim is blunt: most tech brands aren't stuck because they post too little, they're stuck because they all post launches, features and product updates. One global brand publishes 32 times a week to very little effect. Vista Social's contribution is a case study — a company whose biggest lead source last year was organic LinkedIn, not paid.",
        "The two halves fit together well. One names the pattern, the other shows what replacing it looks like, and the second is the half that persuades anyone.",
        "That is also the blocker. This argument does not survive being made in the abstract — it needs a named company, a real before-and-after, and someone prepared to be quoted saying they stopped posting about their product.",
        "Blocked on: a customer willing to go on record with lead-source numbers. Without one this is an opinion piece competing with a case study.",
      ],
    },
    posts: [
      {
        id: "agp-p30",
        network: "instagram",
        publishedOn: "9 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "76% of tech brands are stuck. Not because they aren't posting. Because they're saying the same things everyone else is. Launches. Features. Product updates. Meanwhile, the brands winning attention are creating content people actually want to engage with. The…",
        likes: 5,
        comments: 2,
        reposts: 0,
        url: "https://www.instagram.com/p/DakyZH5li3d/",
      },
      {
        id: "agp-p31",
        network: "instagram",
        publishedOn: "21 Jul 2026",
        author: {
          name: "Vista Social",
          handle: "@vistasocial",
          initials: "VS",
          accent: "purple",
        },
        text: "Vector's 👻 biggest lead source last year wasn't paid. It was organic LinkedIn. 💙 ㅤ Jess Cook, their VP of Marketing, said they spent maybe $40K on ads for all of 2025. That was basically the whole budget, and organic still carried the year. ㅤ Now they're…",
        likes: 11,
        comments: 5,
        reposts: 0,
        url: "https://www.instagram.com/p/DbDukl-lXwj/",
      },
      {
        id: "agp-p32",
        network: "instagram",
        publishedOn: "16 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "Most telecom brands only get noticed when something goes wrong. That's the challenge. 🙇‍♀️ According to the 2026 Social Index, more than 60% of telecom brands operate in negative sentiment. Yet a handful are changing the narrative. Not through more content.…",
        likes: 8,
        comments: 0,
        reposts: 0,
        url: "https://www.instagram.com/p/Da25kKljGEX/",
      },
    ],
    seedStatus: "new",
    volume: "high",
    history: [
      {
        status: "new",
        when: "5 weeks ago",
        note: "Surfaced from the competitor scan (3 matching items).",
      },
    ],
  },
  {
    id: "br-36",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "6mo ago",
    kind: "later",
    headline: "Everyone announced a pricing change in the same quarter",
    summary:
      "Per-channel, per-brand, per-seat — three competitors repriced within weeks of each other and each explained it as simplification. Nobody published what a team of five actually ends up paying.",
    relevance:
      "A social media manager justifying a renewal internally needs the number for a team of five, and every announcement explains the model instead of the bill.",
    whyNow: "Three competitors repriced within weeks of each other, each calling it simplification.",
    article: {
      title: "Three repricings, no worked example",
      subheads: ["Three repricings, one quarter", "The worked example, and the decision behind it"],
      paragraphs: [
        "Three accounts changed pricing model inside one quarter and all three used the word simplification. One moved to per-channel, one to per-brand, one added a seat tier on top of both.",
        "None of them published the arithmetic. The comparison a buyer actually runs — a team of five, twelve channels, one approval step — is absent from all three announcements, which is why the comparison content that ranks is written by third parties.",
        "The opening is the worked example rather than an opinion about who is cheapest: same team, same channels, three bills, shown.",
        "Blocked on: current published rates for all three, and a decision about whether we are willing to show a case where we are not the cheapest. Without the second, the piece is a pricing page in disguise and reads like one.",
      ],
    },
    posts: [
      {
        id: "agp-p33",
        network: "instagram",
        publishedOn: "14 Jul 2026",
        author: {
          name: "Buffer",
          handle: "@buffer",
          initials: "BF",
          accent: "electric-blue",
        },
        text: "We are simplifying pricing. One price per channel, every feature on every plan, no seat maths. What you pay now is what you pay when your team doubles.",
        likes: 63,
        comments: 14,
        reposts: 0,
      },
      {
        id: "agp-p34",
        network: "instagram",
        publishedOn: "8 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "New plans, live today. Pricing now follows brands rather than channels, so a team running twelve profiles for one brand pays for one brand. Simpler to predict, simpler to approve.",
        likes: 29,
        comments: 7,
        reposts: 0,
      },
      {
        id: "agp-p35",
        network: "instagram",
        publishedOn: "1 Jul 2026",
        author: {
          name: "Sprout Social",
          handle: "@sproutsocial",
          initials: "SS",
          accent: "green",
        },
        text: "A clearer way to buy Sprout. Seats are unbundled from channels, so you add reviewers without adding publishing licences. Same platform, a plan that matches how teams are actually shaped.",
        likes: 22,
        comments: 3,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "6 months ago",
        note: "Surfaced from the competitor scan (3 matching items).",
      },
    ],
  },
  {
    id: "br-37",
    feedId: "topic-list-6",
    sourceId: "competitor-posts",
    ageLabel: "6mo ago",
    kind: "later",
    headline: "The approval workflow is everyone's screenshot and nobody's argument",
    summary:
      "Four posts across two accounts show an approval queue in a product shot. None of them says what it prevents — the wrong logo, the unapproved claim, the post that went out during an outage.",
    relevance:
      "Approval is the feature a social media manager buys after something went out wrong, so the argument is the incident, not the queue.",
    whyNow: "Four posts across two accounts show the queue; none of them says what it prevents.",
    article: {
      title: "They show the queue. The story is the thing that did not get published",
      subheads: ["Four screenshots, no consequence", "The near-miss nobody will describe"],
      paragraphs: [
        "Four items, two accounts, all product screenshots: a draft, a reviewer, a green tick. The feature is table stakes and the copy treats it that way — a caption naming the feature and a link.",
        "What none of them has is a consequence. An approval step earns its cost exactly once, on the day it catches the post that would have been a problem, and that is the only version of this story anyone remembers.",
        "This is a strong pillar and a weak post, which is the distinction worth keeping: the argument is available, the evidence is not.",
        "Blocked on: one customer willing to describe a near-miss on the record. Anonymised it is a hypothetical, and a hypothetical is what all four of these screenshots already are.",
      ],
    },
    posts: [
      {
        id: "agp-p36",
        network: "instagram",
        publishedOn: "16 Jul 2026",
        author: {
          name: "Sprout Social",
          handle: "@sproutsocial",
          initials: "SS",
          accent: "green",
        },
        text: "Draft, review, approve. Every post through one queue, with the reviewer named and the version history kept. Link in bio for the walkthrough.",
        likes: 19,
        comments: 2,
        reposts: 0,
      },
      {
        id: "agp-p37",
        network: "instagram",
        publishedOn: "6 Jul 2026",
        author: {
          name: "Sprout Social",
          handle: "@sproutsocial",
          initials: "SS",
          accent: "green",
        },
        text: "Approval workflows, now with conditional steps — legal only sees the posts that mention a claim. Fewer bottlenecks, same paper trail.",
        likes: 26,
        comments: 4,
        reposts: 0,
      },
      {
        id: "agp-p38",
        network: "instagram",
        publishedOn: "13 Jul 2026",
        author: {
          name: "Hootsuite",
          handle: "@hootsuite",
          initials: "HS",
          accent: "yellow",
        },
        text: "Set who signs off on what, per channel and per campaign. Nest keeps the queue and the record, so nothing publishes without the pair of eyes you decided it needed.",
        likes: 17,
        comments: 1,
        reposts: 0,
      },
      {
        id: "agp-p39",
        network: "instagram",
        publishedOn: "2 Jul 2026",
        author: {
          name: "Sprinklr",
          handle: "@sprinklr",
          initials: "SP",
          accent: "orange",
        },
        text: "Governance is not a feature you notice until you need it. Approval paths, audit trails and brand-safety checks across every channel — configured once, enforced everywhere.",
        likes: 11,
        comments: 0,
        reposts: 0,
      },
    ],
    seedStatus: "new",
    history: [
      {
        status: "new",
        when: "6 months ago",
        note: "Surfaced from the competitor scan (4 matching items).",
      },
    ],
  },
];
