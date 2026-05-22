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
    ctaLinks: [
      { label: "Free trial signup", url: "agorapulse.com/free-trial", checked: true, suggested: true },
      { label: "Book a demo", url: "agorapulse.com/demo", checked: true, suggested: true },
      { label: "Pricing page", url: "agorapulse.com/pricing", checked: false, suggested: true },
      { label: "Customer stories", url: "agorapulse.com/customers", checked: false, suggested: true },
      { label: "Blog & resources", url: "agorapulse.com/blog", checked: false, suggested: true },
    ],
    language: "English",
    color: "orange",
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
    audience: ["Decision-makers", "End users"],
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
    ctaLinks: [{ label: "Homepage", url: "", checked: true, suggested: true }],
    language: "English",
    color: "blue",
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
