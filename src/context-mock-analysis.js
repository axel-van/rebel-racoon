// Mocked "website analysis" — the proto has no real scraping. analyzeWebsite
// returns a deterministic draft based on the URL: agorapulse.com hits a
// hand-tuned mock matching the V1 brief HTML reference, anything else
// returns a generic SaaS template that still produces a usable brief.
//
// The shape returned is consumed by context-builder.js after the ~10s
// pending turn finishes, then passed to the right-panel brief renderer.
// Suggested values become menthol chips (AI-suggested). Other static
// option lists come from the brief panel renderer.

const AGORAPULSE = {
  name: "Agorapulse",
  businessSummary:
    "Agorapulse is a B2B SaaS platform designed for social media managers, agencies, and marketing teams. It centralises social media management across multiple platforms, enabling teams to publish, monitor, and report from a single inbox. Agorapulse operates on a subscription model with plans tailored to both independent professionals and large agencies. Its core promise is to save time, reduce tool fragmentation, and make social media ROI measurable.",
  suggestions: {
    audience: [
      "Agency Social Media Manager",
      "In-house Brand Strategist",
      "Freelance Social Media Consultant",
      "Marketing Director",
      "Content Creator",
    ],
    audienceProblems: [
      // Agency Social Media Manager
      "Managing content calendars for 10+ clients",
      "Justifying agency fees with measurable results",
      "Briefing writers who don't know the client's brand",
      "Handling last-minute content requests at scale",
      "Maintaining consistent quality across all accounts",
      // In-house Brand Strategist
      "Aligning social content with brand guidelines",
      "Getting leadership buy-in on content strategy",
      "Keeping up with platform algorithm changes",
      "Coordinating with multiple internal stakeholders",
      "Proving the brand impact of organic social",
      // Freelance Social Media Consultant
      "Onboarding new clients quickly without deep context",
      "Producing high-quality content with limited resources",
      "Differentiating from cheaper generalist competitors",
      "Managing unpredictable client feedback cycles",
      "Scaling output without hiring extra help",
      // Marketing Director
      "Linking social media performance to business outcomes",
      "Managing a lean team with high content demands",
      "Keeping content strategy consistent across channels",
      "Reporting ROI to the C-suite in clear terms",
      "Finding time to stay close to execution",
      // Content Creator
      "Running out of original content ideas consistently",
      "Repurposing long-form content efficiently",
      "Maintaining a posting cadence without burnout",
      "Growing reach beyond the existing follower base",
      "Adapting one piece of content to multiple formats",
    ],
    tones: ["Professional & authoritative"],
    voiceProfile: {
      headline: "Professional · data-driven · approachable",
      writingStyle:
        "Professional, data-grounded, and action-oriented. Combines analytical evidence with clear, immediate takeaways aimed at busy social media managers and marketing leaders. Sentences open with the value to the reader and back claims with measurable outcomes.",
      vocabulary:
        "Industry-specific marketing jargon balanced with plain-English: 'ROI', 'engagement', 'social inbox', 'reporting', 'workflow', alongside conversational terms like 'busy team', 'one place', 'in seconds'. Avoids hype words ('revolutionary', 'game-changer') in favour of measurable claims.",
      sentenceStructure:
        "Mostly short to medium sentences. Headlines are punchy and benefit-led. Body copy occasionally extends for product feature explanations or case studies. Bullet lists are favoured over long paragraphs when explaining capabilities.",
      formality:
        "Semi-formal. Direct address ('you', 'your team') keeps the brand approachable while remaining credible to enterprise buyers. Contractions are used freely, but the tone never drifts into slang or memes.",
      personality:
        "Confident, helpful, results-focused. Speaks with the authority of a tool that has supported thousands of social teams. Empathetic to the chaos of multi-platform work without being self-deprecating about the category.",
      rhetoricalDevices:
        "Lists for product benefits. Customer quotes for proof. Concrete numbers and percentages for credibility (time saved, response-rate gains, ROI). Frequent 'before / after' contrasts between fragmented workflows and the unified Agorapulse experience.",
      emotionalTone:
        "Reassuring and supportive. Acknowledges the daily firefight of multi-platform social media management and positions Agorapulse as the calm centre that gives teams back their time, their data, and their evenings.",
      contentPatterns:
        "Problem → solution → proof. Most pages open with a social-media-manager pain point ('lost in 8 tabs', 'can't prove ROI'), present Agorapulse's specific answer, and close with social proof or a CTA to start a free trial.",
      uniqueTraits:
        "Frequent 'social media inbox' framing. Emphasises ROI measurement and time-to-publish as the two big differentiators. Customer success stories from agencies and in-house teams are woven throughout the marketing site rather than ghettoised on a /customers page.",
    },
    contentStyle: ["Data-driven with storytelling", "Direct and actionable"],
    objective: ["Lead generation", "Brand awareness"],
    contentAction: ["Sign up for a free trial", "Book a demo"],
    signatureHooks: [
      "Stop juggling 8 tabs to run your social.",
      "Here's what the data actually says:",
      "Your team is losing hours to this:",
    ],
    closingPatterns: ["Start your free trial — no card required.", "Book a demo and we'll map it to your workflow."],
    formattingStyle:
      "Benefit-led headline, then short scannable paragraphs. Bullet lists for capabilities. Numbers and percentages for proof. Closes on a single, clear call to action.",
    visualStyle:
      "Minimal emoji. Direct address ('you', 'your team'). Sentence case. Metrics as digits. One primary CTA per post.",
    brandPersonality:
      "Confident, helpful, results-focused. Speaks with the authority of a tool that has supported thousands of social teams, and stays empathetic to the chaos of multi-platform work.",
    brandTypography: { headingFont: "Averta", bodyFont: "Averta" },
    brandColors: [
      { name: "Primary", hex: "#212E44" },
      { name: "Accent", hex: "#FF6726" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#212E44" },
    ],
    ctaLinks: [
      { label: "Free trial signup", url: "agorapulse.com/free-trial", checked: true, suggested: true },
      { label: "Book a demo", url: "agorapulse.com/demo", checked: true, suggested: true },
      { label: "Pricing page", url: "agorapulse.com/pricing", checked: false, suggested: true },
      { label: "Customer stories", url: "agorapulse.com/customers", checked: false, suggested: true },
      { label: "Blog & resources", url: "agorapulse.com/blog", checked: false, suggested: true },
    ],
    language: "English",
    languages: ["English"],
    primaryLanguage: "English",
    color: "orange",
    competitors: [
      {
        name: "Hootsuite",
        description:
          "The incumbent. Broadest network coverage and enterprise footprint, but a heavier, pricier suite that smaller teams outgrow the budget for.",
        websiteUrl: "https://hootsuite.com",
        socials: [
          { network: "linkedin", url: "https://linkedin.com/company/hootsuite" },
          { network: "x", url: "https://x.com/hootsuite" },
          { network: "instagram", url: "https://instagram.com/hootsuite" },
        ],
      },
      {
        name: "Buffer",
        description:
          "Simple, affordable scheduling with a strong creator following. Light on inbox, listening and agency reporting.",
        websiteUrl: "https://buffer.com",
        socials: [
          { network: "linkedin", url: "https://linkedin.com/company/bufferapp" },
          { network: "x", url: "https://x.com/buffer" },
        ],
      },
      {
        name: "Sprout Social",
        description:
          "Premium analytics and social listening aimed at larger in-house teams. Frequently the head-to-head in agency deals.",
        websiteUrl: "https://sproutsocial.com",
        socials: [
          { network: "linkedin", url: "https://linkedin.com/company/sprout-social-inc-" },
          { network: "x", url: "https://x.com/sproutsocial" },
        ],
      },
      {
        name: "Later",
        description:
          "Visual-first planning built around Instagram and TikTok. Popular with ecommerce and creator-led brands.",
        websiteUrl: "https://later.com",
        socials: [
          { network: "instagram", url: "https://instagram.com/latermedia" },
          { network: "tiktok", url: "https://tiktok.com/@later" },
        ],
      },
      {
        name: "Sendible",
        description:
          "Agency-focused scheduling and white-label reporting at a mid-market price. Closest positioning on agency workflows.",
        websiteUrl: "https://sendible.com",
        socials: [
          { network: "linkedin", url: "https://linkedin.com/company/sendible" },
          { network: "x", url: "https://x.com/sendible" },
        ],
      },
    ],
    imageVoice: {
      websites: [
        {
          domain: "agorapulse.com",
          url: "https://agorapulse.com",
          colors: {
            primary: "#212E44",
            accent: "#FF6726",
            background: "#FFFFFF",
            textPrimary: "#FF6726",
            link: "#FF6726",
          },
          typography: {
            primaryFont: "Averta",
            headingFont: "Averta",
            h1Size: "56px",
            h2Size: "20px",
            bodySize: "16px",
            fontStack: ["Averta", "Arial", "Helvetica"],
          },
          images: {
            logo: { label: "Logo", url: "" },
            favicon: { label: "Favicon", url: "" },
            ogImage: { label: "OgImage", url: "" },
          },
          buttons: {
            primary: { bg: "#FF6726", color: "#FFFFFF", label: "Primary" },
            secondary: { bg: "#FFFFFF", color: "#FF6726", border: "#FF6726", label: "Secondary" },
          },
          personality: {
            tone: "professional",
            energy: "medium",
            audience: "business professionals",
          },
        },
      ],
    },
  },
};

const GENERIC = {
  name: "Untitled brand",
  businessSummary:
    "This brand sells a product or service that solves a specific problem for a clearly defined audience. The website highlights the value proposition, key features, and credibility markers (case studies, testimonials, results). Edit this summary to match your business — Archie will use it to ground every post.",
  suggestions: {
    audience: [
      "Operations and marketing leads at growing B2B teams",
      "Founders and decision-makers evaluating the product",
      "Hands-on end users who run the day-to-day",
      "Agencies and consultants serving similar clients",
    ],
    audienceProblems: [
      "Saving time on repetitive tasks",
      "Making better decisions with less data",
      "Reducing operational costs",
      "Scaling without adding headcount",
    ],
    tones: ["Professional & authoritative"],
    voiceProfile: {
      headline: "Professional · clear · helpful",
      writingStyle:
        "Clear, professional, and direct. Sentences are concise and reader-friendly. Each section opens with the benefit and follows with supporting evidence.",
      vocabulary:
        "Plain English with occasional industry terms where relevant. Avoids jargon that hasn't been earned and explains acronyms on first use.",
      sentenceStructure:
        "Mostly short to medium sentences with occasional structural variation for emphasis. Lists are used when explaining multi-step processes.",
      formality: "Semi-formal — friendly enough for a marketing site, credible enough for an enterprise buyer.",
      personality:
        "Trustworthy, helpful, and knowledgeable. Speaks to the reader as an equal who happens to have done the homework.",
      rhetoricalDevices:
        "Lists for clarity. Evidence and customer proof for credibility. Occasional rhetorical questions to set up the value proposition.",
      emotionalTone: "Neutral, supportive, and quietly confident. Reassures without overpromising.",
      contentPatterns:
        "Problem → solution → proof structure across most pages. Calls to action are clear and singular.",
      uniqueTraits:
        "Edit this profile to capture what makes your brand's voice distinctive — the words you reach for, the metaphors you avoid, the moments where the writing relaxes.",
    },
    contentStyle: ["Direct and actionable"],
    objective: ["Brand awareness"],
    contentAction: ["Visit the website"],
    signatureHooks: ["Here's the problem most teams hit:", "What if you could [outcome]?"],
    closingPatterns: ["Learn more on our site.", "Get started today."],
    formattingStyle:
      "Clear, concise paragraphs. A short list when explaining steps. One call to action per post. Edit this to match how you actually write.",
    visualStyle: "Minimal emoji, sentence case, plain English. Edit to capture how your brand styles its posts.",
    brandPersonality:
      "Trustworthy, helpful, and knowledgeable. Speaks to the reader as an equal who has done the homework. Edit to capture what makes your brand's personality distinctive.",
    brandTypography: { headingFont: "System UI", bodyFont: "System UI" },
    brandColors: [
      { name: "Primary", hex: "#178DFE" },
      { name: "Accent", hex: "#178DFE" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#344563" },
    ],
    ctaLinks: [{ label: "Homepage", url: "", checked: true, suggested: true }],
    language: "English",
    languages: ["English"],
    primaryLanguage: "English",
    color: "blue",
    // Placeholder competitor set — like every other GENERIC field, it's a
    // usable template the user edits rather than a real market read.
    competitors: [
      {
        name: "The category incumbent",
        description:
          "The best-known name in the category. Broadest feature set, highest price, and the one prospects benchmark you against.",
        websiteUrl: "",
        socials: [],
      },
      {
        name: "The low-cost challenger",
        description: "Cheaper and simpler. Wins on price with smaller teams and loses on depth once they scale.",
        websiteUrl: "",
        socials: [],
      },
      {
        name: "The niche specialist",
        description:
          "Narrower than you but excellent at one job. Comes up whenever a prospect cares most about that one thing.",
        websiteUrl: "",
        socials: [],
      },
    ],
    imageVoice: {
      websites: [
        {
          domain: "",
          url: "",
          colors: {
            primary: "#178DFE", // electric-blue-100 (the default seeded color)
            accent: "#178DFE",
            background: "#FFFFFF",
            textPrimary: "#344563",
            link: "#178DFE",
          },
          typography: {
            primaryFont: "System UI",
            headingFont: "System UI",
            h1Size: "48px",
            h2Size: "20px",
            bodySize: "16px",
            fontStack: ["System UI", "Arial", "sans-serif"],
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
            tone: "professional",
            energy: "medium",
            audience: "business professionals",
          },
        },
      ],
    },
  },
};

/**
 * Pretend to analyse a set of connected social profiles and return the same
 * draft skeleton shape as analyzeWebsite. The content is "learned from the
 * posts" — voice/format/style lean conversational and engagement-led.
 * @param {string[]} profileIds
 * @returns {{ name, businessSummary, suggestions: object }}
 */
export function analyzeSocialProfiles(profileIds = []) {
  const n = Array.isArray(profileIds) ? profileIds.length : 0;
  const result = clone(GENERIC);
  result.businessSummary = `Built from ${n || "your"} connected social ${
    n === 1 ? "profile" : "profiles"
  }. Archie studied your recent posts — how you open, how you close, the formats you favour, and the tone that earns engagement — and mapped them into the sections below. Edit anything that's off.`;
  Object.assign(result.suggestions, {
    contentStyle: ["Conversational", "Engagement-led"],
    objective: ["Brand awareness", "Build personal brand"],
    contentAction: ["Reply in the comments"],
    signatureHooks: ["Quick one for you:", "Saw this come up again this week:"],
    closingPatterns: ["Drop a comment if this helped.", "What would you add?"],
    formattingStyle:
      "Short, scroll-stopping opener, then a few punchy lines with line breaks. Emoji used sparingly for rhythm. Ends on a question or a light CTA to drive replies.",
    visualStyle: "Casual sentence case, the occasional emoji, the odd hashtag — reads like a person, not a brand.",
    brandPersonality: "Approachable, quick, community-first — the voice that already performs on your feed.",
  });
  return result;
}

/**
 * Pretend to analyse a website and return a draft skeleton.
 * @param {string} url
 * @returns {{ name, businessSummary, suggestions: object }}
 */
export function analyzeWebsite(url) {
  const lower = String(url || "").toLowerCase();
  if (lower.includes("agorapulse")) {
    return clone(AGORAPULSE);
  }
  const derivedName = deriveName(url) || GENERIC.name;
  const generic = clone(GENERIC);
  generic.name = derivedName;
  // Patch domain-dependent fields with the actual URL when available.
  const domain = deriveDomain(url);
  if (domain) {
    if (generic.suggestions.ctaLinks[0]) {
      generic.suggestions.ctaLinks[0].url = domain;
    }
    if (generic.suggestions.imageVoice?.websites?.[0]) {
      generic.suggestions.imageVoice.websites[0].domain = domain;
      generic.suggestions.imageVoice.websites[0].url = url.startsWith("http") ? url : `https://${domain}`;
    }
  }
  return generic;
}

function deriveName(url) {
  const domain = deriveDomain(url);
  if (!domain) return "";
  // "Foo Bar" from "foo-bar.com"
  const slug = domain.split(".")[0] || "";
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Mock-analyse an uploaded document. We don't actually parse the file —
 * we use the filename to derive a brand name. Returns the same shape
 * as `analyzeWebsite`.
 */
export function analyzeDocument(file) {
  const generic = clone(GENERIC);
  const filename = (file && file.name) || "Untitled document";
  const stem = filename.replace(/\.[^.]+$/, "");
  const prettyName =
    stem
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled brand";

  generic.name = prettyName;
  generic.businessSummary = `Playbook built from your document "${filename}". Edit each section below to match what's actually in the file — Archie will then ground every post in your written brand guidance.`;
  generic.suggestions.voiceProfile = {
    ...generic.suggestions.voiceProfile,
    headline: "Professional · clear · helpful",
  };
  return generic;
}

/**
 * Identity of a competitor for dedupe purposes — its domain when it has a
 * website, else its lowercased name (the GENERIC placeholders ship no URL).
 */
function competitorKey(c) {
  return (
    deriveDomain(c?.websiteUrl || "") ||
    String(c?.name || "")
      .trim()
      .toLowerCase() ||
    ""
  );
}

/**
 * Mock "competitor discovery" for a brand's website. Returns the entries from
 * that brand's competitor pool that aren't already known, so a repeat scan is
 * idempotent and only ever adds what's new.
 *
 * @param {string} url                      the Playbook's website URL
 * @param {{ exclude?: object[] }} options   competitors already on the Playbook
 * @returns {object[]} fresh competitors, each flagged `suggested: true`
 */
export function discoverCompetitors(url, { exclude = [] } = {}) {
  const pool = clone(analyzeWebsite(url).suggestions.competitors || []);
  const known = new Set((Array.isArray(exclude) ? exclude : []).map(competitorKey).filter(Boolean));
  return pool.filter((c) => {
    const key = competitorKey(c);
    if (!key || known.has(key)) return false;
    known.add(key); // guard against duplicates inside the pool itself
    return true;
  });
}

function deriveDomain(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
