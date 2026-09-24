// Playbooks (Contexts) and the component samples they are built from.
// Seed data only — no network, no persistence, no randomness.
// Re-exported by ../mocks.js, which stays the single import path.

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

// The logo variants Archie finds on a brand's site: the header lockup, the
// reversed one from the footer, the square icon, the favicon. Shared between the
// Playbooks of the same brand (Acme has two) so a variant added here shows up on
// both, the way it would if both had been scraped from the same site.
//
// The reversed lockup carries its own dark plate INSIDE the SVG. That's how a
// brand kit presents it, and it's also the only way it survives being shown on a
// white thumbnail tile — a white-on-transparent mark would render as an empty box.
const ACME_LOGOS = [
  { id: "acme-logo", label: "Logo", url: "assets/logos/brands/acme.svg" },
  { id: "acme-logo-reverse", label: "Reversed", url: "assets/logos/brands/acme-reverse.svg" },
  { id: "acme-logo-icon", label: "Icon", url: "assets/logos/brands/acme-icon.svg" },
  { id: "acme-logo-favicon", label: "Favicon", url: "assets/logos/brands/acme-favicon.svg" },
];

const PAWTRACK_LOGOS = [
  { id: "pawtrack-logo", label: "Logo", url: "assets/logos/brands/pawtrack.svg" },
  { id: "pawtrack-logo-reverse", label: "Reversed", url: "assets/logos/brands/pawtrack-reverse.svg" },
  { id: "pawtrack-logo-icon", label: "Icon", url: "assets/logos/brands/pawtrack-icon.svg" },
  { id: "pawtrack-logo-favicon", label: "Favicon", url: "assets/logos/brands/pawtrack-favicon.svg" },
];

export const contexts = [
  {
    id: "ctx-acme",
    name: "Acme · Q2 marketing",
    color: "orange",
    isDefault: true,
    ownerId: "u-me",
    // Mine, and I put it in front of the whole org — the state a Playbook lands
    // in after the Share modal says "My organisation".
    scope: "organization",
    brandName: "Acme",
    brandLogos: ACME_LOGOS.map((l) => ({ ...l })),
    brandLogo: "assets/logos/brands/acme.svg",
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
    objective: ["Brand awareness", "Lead generation", "Thought leadership", "Video performance"],
    contentAction: ["Sign up for a free trial", "Book a demo"],
    signatureHooks: [
      "Most teams get this backwards:",
      "Here's what actually moved the needle:",
      "We cut [task] from days to minutes —",
    ],
    closingPatterns: ["Try it free for 30 days — link in the comments.", "What's your take? Reply and tell me."],
    formattingStyle:
      "Short paragraphs, one idea each. Opens on a hook line, then 2–3 lines of context. A tight three-item list when points are parallel, prose otherwise. Generous line breaks — no walls of text. Most posts top out around 90 words.",
    visualStyle:
      "No emoji. Sentence case throughout — no ALL-CAPS shouting. Numbers as digits ('3x', '40%'). One link, dropped in the first comment, never mid-sentence.",
    brandPersonality:
      "Confident without bragging, helpful without performing. Speaks the way operators talk to each other — direct, specific, occasionally dry. Never hypey.",
    brandTypography: { headingFont: "Inter", bodyFont: "Inter" },
    imageDefaults: { imageType: "visual-hook", style: "bold-editorial", refMode: "layout" },
    brandColors: [
      { name: "Primary", hex: "#1A1F36" },
      { name: "Secondary", hex: "#3B4A6B" },
      { name: "Accent", hex: "#FF6726" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#1A1F36" },
    ],
    // Brand reference images (#11) — the visual references the Image Studio
    // pulls in so generated imagery stays on-brand.
    referenceImages: [
      {
        id: "acme-ref-1",
        label: "Product UI",
        url: "https://picsum.photos/seed/acme-brand-ui/480/480",
        note: "Use for feature launches & how-to posts. Keep the real UI — don't mock up fake screens or crop the logo.",
        networks: ["linkedin", "x"],
      },
      {
        id: "acme-ref-2",
        label: "Team candid",
        url: "https://picsum.photos/seed/acme-brand-team/480/480",
        note: "Great for culture & hiring content. Don't over-retouch — keep it authentic.",
        networks: ["instagram", "facebook"],
      },
      { id: "acme-ref-3", label: "Brand board", url: "https://picsum.photos/seed/acme-brand-board/480/480" },
    ],
    // Competitors — the market Archie positions this brand against. `suggested`
    // marks the ones Archie discovered (vs. added by hand). Logos resolve from
    // the domain at render time, so no url is stored here.
    competitors: [
      {
        id: "acme-cmp-1",
        name: "Notion",
        description:
          "The all-in-one workspace everyone already has a tab open for. Wins on flexibility, loses on opinionated workflows.",
        websiteUrl: "https://notion.so",
        socials: [
          { network: "linkedin", url: "https://linkedin.com/company/notionhq" },
          { network: "x", url: "https://x.com/NotionHQ" },
          { network: "youtube", url: "https://youtube.com/@Notion" },
        ],
        suggested: true,
      },
      {
        id: "acme-cmp-2",
        name: "Linear",
        description:
          "Beloved by engineering teams for speed and craft. Comes up whenever a prospect cares about issue tracking first.",
        websiteUrl: "https://linear.app",
        socials: [{ network: "x", url: "https://x.com/linear" }],
        suggested: true,
      },
      {
        id: "acme-cmp-3",
        name: "Basecamp",
        description:
          "The opinionated veteran. Flat pricing and a strong point of view on how teams should work — a values-led alternative.",
        websiteUrl: "https://basecamp.com",
        socials: [
          { network: "x", url: "https://x.com/basecamp" },
          { network: "linkedin", url: "https://linkedin.com/company/basecamp" },
        ],
      },
    ],
    // Influencers — the creators this audience already follows. Ported from the
    // fork, minus its `reach` follower counts: a count goes stale on its own,
    // which fails the Playbook inclusion test (CONCEPTS.md §1, question 2).
    influencers: [
      {
        id: "acme-inf-1",
        name: "Lenny's Newsletter",
        description: "Product and growth operators. Long-form, high-trust, sceptical of vendor content.",
        socials: [{ network: "x", url: "https://x.com/lennysan" }],
      },
      {
        id: "acme-inf-2",
        name: "Elena Verna",
        description: "Growth. Blunt, framework-led, will not post anything she hasn't pressure-tested.",
        socials: [{ network: "x", url: "https://x.com/elenaverna" }],
      },
      {
        id: "acme-inf-3",
        name: "Dave Gerhardt",
        description: "B2B marketing. Strong on positioning and plain language; audience overlaps ours heavily.",
        socials: [{ network: "instagram", url: "https://instagram.com/davegerhardt" }],
        suggested: true,
      },
      {
        id: "acme-inf-4",
        name: "Anthony Pierri",
        description: "Homepage and positioning teardowns. Format travels; often quoted by our buyers.",
        socials: [{ network: "x", url: "https://x.com/anthonypierri" }],
        suggested: true,
      },
    ],
    ctaLinks: [
      { label: "30-day free trial", url: "acme.example.com/trial", checked: true, suggested: false },
      { label: "Book a demo", url: "acme.example.com/demo", checked: true, suggested: false },
    ],
    // Multilingual Playbook — the flat signatureHooks/closingPatterns/cta above
    // mirror the primary (English) entry. Voice examples are authored PER
    // LANGUAGE; Archie selects the native set, never translates.
    languages: ["English", "Français"],
    primaryLanguage: "English",
    voiceByLanguage: {
      English: {
        signatureHooks: [
          "Most teams get this backwards:",
          "Here's what actually moved the needle:",
          "We cut [task] from days to minutes —",
        ],
        closingPatterns: ["Try it free for 30 days — link in the comments.", "What's your take? Reply and tell me."],
        cta: "Try Acme free for 30 days.",
        ctaLabels: {
          "acme.example.com/trial": "30-day free trial",
          "acme.example.com/demo": "Book a demo",
        },
      },
      Français: {
        signatureHooks: [
          "La plupart des équipes s'y prennent à l'envers :",
          "Voici ce qui a vraiment fait bouger les choses :",
          "On a réduit [tâche] de plusieurs jours à quelques minutes —",
        ],
        closingPatterns: [
          "Essayez gratuitement pendant 30 jours — lien en commentaire.",
          "Votre avis ? Répondez et dites-moi.",
        ],
        cta: "Essayez Acme gratuitement pendant 30 jours.",
        ctaLabels: {
          "acme.example.com/trial": "Essai gratuit de 30 jours",
          "acme.example.com/demo": "Réserver une démo",
        },
      },
    },
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
    ownerId: "u-me",
    scope: "personal",
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
    objective: ["Build personal brand", "Brand awareness", "Thought leadership", "Editorial resonance"],
    contentAction: ["Read more on the blog"],
    signatureHooks: [
      "Unpopular opinion:",
      "I used to believe [X]. I was wrong.",
      "Nobody tells you this when you start:",
    ],
    closingPatterns: [
      "Curious if it's just me — or you've seen it too.",
      "Still figuring this out. Tell me where I'm wrong.",
    ],
    formattingStyle:
      "Very short. Often a single line that lands. The occasional longer sentence to explain a counter-intuitive idea. Heavy line breaks for rhythm. No lists, no headers — reads like a thought, not a doc.",
    visualStyle:
      "No emoji, no hashtags. A lowercase opening is fine when it suits the cadence. First person always ('I', 'we'). Zero links or product mentions.",
    brandPersonality:
      "Opinionated, generous with credit, willing to be wrong out loud. Speaks from scar tissue, not theory. The human is the brand — readers follow the person, not a logo.",
    brandTypography: { headingFont: "System UI", bodyFont: "System UI" },
    imageDefaults: { imageType: "", style: "corporate", refMode: "" },
    brandColors: [
      { name: "Primary", hex: "#178DFE" },
      { name: "Accent", hex: "#178DFE" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#1A1F36" },
    ],
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
    // Influencers — the creators this audience already follows. Ported from the
    // fork, minus its `reach` follower counts: a count goes stale on its own,
    // which fails the Playbook inclusion test (CONCEPTS.md §1, question 2).
    influencers: [
      {
        id: "fv-inf-1",
        name: "Jason Fried",
        description: "The register this Playbook is aiming at: short, first-person, unhedged.",
        socials: [{ network: "x", url: "https://x.com/jasonfried" }],
      },
      {
        id: "fv-inf-2",
        name: "Sahil Bloom",
        description: "Structure and cadence worth studying, even where the subject matter diverges.",
        socials: [{ network: "x", url: "https://x.com/SahilBloom" }],
      },
      {
        id: "fv-inf-3",
        name: "Anne-Laure Le Cunff",
        description: "Research-backed and calm. Good model for citing a source without turning into a citation.",
        socials: [{ network: "x", url: "https://x.com/anthilemoon" }],
      },
      {
        id: "fv-inf-4",
        name: "Arvid Kahl",
        description: "Builds in public without performing it. Strong on the 'what I got wrong' pillar.",
        socials: [{ network: "x", url: "https://x.com/arvidkahl" }],
      },
    ],
  },
  {
    id: "ctx-customer",
    name: "Customer stories",
    color: "green",
    isDefault: false,
    ownerId: "u-me",
    // Shared by NAME, not with the org: the two people who write customer
    // stories, and nobody who joins later. Seen from the owner's side — the
    // card reads "Shared with 2 people" and the dialog opens on the picker
    // with these two ticked. Inert with the flag off, like ownerId itself.
    scope: "members",
    sharedWith: ["u-sam", "u-lea"],
    // Tied to the LinkedIn account it publishes under, which narrows who it can
    // be shared with at all: the picker greys out the teammates who can't reach
    // that profile (doc §7). Both recipients above can.
    selectedProfileId: "li",
    brandName: "Acme",
    brandLogos: ACME_LOGOS.map((l) => ({ ...l })),
    brandLogo: "assets/logos/brands/acme.svg",
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
    objective: ["Brand awareness", "Lead generation", "Editorial resonance"],
    contentAction: ["Read the full customer story", "Book a demo"],
    signatureHooks: ["When [Team] started, they were [problem].", "Here's what changed for [Customer]:"],
    closingPatterns: ["See how teams like yours use Acme →", "Their words, not ours."],
    formattingStyle:
      "Story-shaped: a short hook line, 2–3 sentences of context, a pulled quote on its own line, then a closing line that names the result. Medium-length sentences. The quote is always set apart.",
    visualStyle:
      "No emoji. Names the customer and their role in full. Metrics as digits ('cut response time 60%'). One quote per post, verbatim — never paraphrased.",
    brandPersonality:
      "Trustworthy, attentive, occasionally surprised on the customer's behalf. Lets the customer be the hero and the numbers carry the emotion.",
    brandTypography: { headingFont: "Inter", bodyFont: "Inter" },
    imageDefaults: { imageType: "infographic", style: "corporate", refMode: "" },
    brandColors: [
      { name: "Primary", hex: "#1A6E3F" },
      { name: "Accent", hex: "#34A65F" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#1A1F36" },
    ],
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
    // Influencers — the creators this audience already follows. Ported from the
    // fork, minus its `reach` follower counts: a count goes stale on its own,
    // which fails the Playbook inclusion test (CONCEPTS.md §1, question 2).
    influencers: [
      {
        id: "cs-inf-1",
        name: "Joel Klettke",
        description: "Case-study specialist. Sets the bar for interviewing a customer without leading them.",
        socials: [{ network: "x", url: "https://x.com/JoelKlettke" }],
      },
      {
        id: "cs-inf-2",
        name: "Katelyn Bourgoin",
        description: "Buyer psychology. Useful on the 'why they nearly didn't' pillar specifically.",
        socials: [{ network: "x", url: "https://x.com/KateBour" }],
      },
      {
        id: "cs-inf-3",
        name: "Emily Kramer",
        description: "Marketing operator with a large practitioner audience; shares customer stories readily.",
        socials: [{ network: "x", url: "https://x.com/emilykramer" }],
      },
      {
        id: "cs-inf-4",
        name: "Userlist",
        description: "Small brand, disproportionate trust. Their customer posts get quoted in our niche.",
        socials: [{ network: "instagram", url: "https://instagram.com/userlisthq" }],
      },
    ],
  },
  // A consumer brand, deliberately unlike the three B2B Playbooks above: it
  // gives the Topics feed a market where listening has something vivid to say
  // (a crowded hardware category whose buyers talk in feelings, not specs), and
  // its competitors are the real names the seeded dossiers cite.
  {
    id: "ctx-pawtrack",
    name: "Pawtrack · always-on",
    color: "purple",
    isDefault: false,
    ownerId: "u-me",
    scope: "personal",
    brandName: "Pawtrack",
    brandLogos: PAWTRACK_LOGOS.map((l) => ({ ...l })),
    brandLogo: "assets/logos/brands/pawtrack.svg",
    websiteUrl: "https://pawtrack.example.com",
    audience: ["Dog and cat owners who have already had one scare and never want another"],
    businessSummary:
      "Sell the Pawtrack collar on relief, not on radios. Owners don't buy LTE-M and IP68 — they buy knowing where their animal is at 2am. Lead with the moment the tracker mattered.",
    briefSummary:
      "Sell the Pawtrack collar on relief, not on radios. Owners don't buy LTE-M and IP68 — they buy knowing where their animal is at 2am. Lead with the moment the tracker mattered.",
    tones: ["Warm", "Reassuring"],
    voiceProfile: {
      headline: "Warm · plain-spoken · never alarmist",
      writingStyle:
        "Story-first and close to the ground. Opens on a real moment — a gate left open, a cat that didn't come in — then says what happened next. Specs appear only once they've earned it, and always in service of the moment.",
      vocabulary:
        "The words owners use: 'she got out', 'he bolted', 'found her'. Never 'asset', 'device', 'solution' or 'pet parent'. Coverage and range are described as what they let you do, not as numbers.",
      sentenceStructure:
        "Short sentences. One idea each. The turn in the story gets its own line. Lists only for practical instructions, never for features.",
      formality:
        "Informal but never cute. 'You' and 'your dog', never the third person. Contractions throughout. Reads like a message from someone who's been there.",
      personality:
        "Steady and kind. Takes the fear seriously without dramatising it, and never implies the owner was careless.",
      rhetoricalDevices:
        "Open on the moment, not the product. Before / after in time, not in metrics. Resolve every story — the animal always comes home in ours, and we don't post the ones that don't.",
      emotionalTone: "Relief, mostly. Warm, a little wry about animals being animals. Never panic-selling.",
      contentPatterns:
        "Moment → what we did → how it ended → the one thing that made it possible. Around 80 words, one animal per post.",
      uniqueTraits:
        "Names the animal, always. Real owner photos over studio product shots. No fear-based statistics about lost pets — the story carries the stakes on its own.",
    },
    contentStyle: ["Story-driven", "Warm and human"],
    objective: ["Brand awareness", "Community building", "Video performance"],
    contentAction: ["Shop the collar", "Read owner stories"],
    signatureHooks: [
      "She was gone eleven minutes.",
      "The gate was open. Nobody knows how long.",
      "Here's the part nobody tells you about a cat that goes out:",
    ],
    closingPatterns: ["Home in forty minutes. That's the whole point.", "Tell us about yours — we read all of them."],
    formattingStyle:
      "Opens on a one-line moment. Two or three short paragraphs, a single idea each. The turn in the story sits on its own line. Around 80 words. Emoji sparingly, and only ones an owner would actually use.",
    visualStyle:
      "Real owner photos, daylight, animals mid-motion — never a studio product shot as the hero. Sentence case. Distances in the local unit ('6km from camp'). The collar visible but not centred.",
    brandPersonality:
      "Steady and kind. Takes the fear seriously without dramatising it, is a little wry about animals being animals, and never makes an owner feel careless.",
    brandTypography: { headingFont: "Poppins", bodyFont: "Inter" },
    imageDefaults: { imageType: "visual-hook", style: "photoreal", refMode: "style" },
    brandColors: [
      { name: "Primary", hex: "#2F1B54" },
      { name: "Accent", hex: "#7C4DFF" },
      { name: "Warm", hex: "#FFB86B" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#241537" },
    ],
    referenceImages: [
      {
        id: "pawtrack-ref-1",
        label: "Owner + dog, daylight",
        url: "https://picsum.photos/seed/pawtrack-owner-dog/480/480",
        note: "The default hero for reunion stories. Real light, animal mid-motion, collar visible but not the subject.",
        networks: ["instagram", "facebook"],
      },
      {
        id: "pawtrack-ref-2",
        label: "Collar detail",
        url: "https://picsum.photos/seed/pawtrack-collar/480/480",
        note: "Only for posts that genuinely need the hardware. Never the lead image on a story post.",
        networks: ["instagram"],
      },
    ],
    competitors: [
      {
        id: "pawtrack-cmp-1",
        name: "Fi",
        description:
          "The design-led challenger. Leads on module specs and battery, and owns the running-club end of the market.",
        websiteUrl: "https://tryfi.com",
        socials: [
          { network: "instagram", url: "https://instagram.com/fi.collars" },
          { network: "facebook", url: "https://facebook.com/tryfi" },
        ],
      },
      {
        id: "pawtrack-cmp-2",
        name: "Whistle",
        description:
          "The incumbent with retail shelf space. Bundles health monitoring, and speaks to vets as much as to owners.",
        websiteUrl: "https://whistle.com",
        socials: [
          { network: "facebook", url: "https://facebook.com/whistle" },
          { network: "instagram", url: "https://instagram.com/whistle" },
        ],
      },
      {
        id: "pawtrack-cmp-3",
        name: "Jiobit",
        description:
          "Smallest tracker in the category, sold on being unnoticeable. Strong with cats and small breeds, priced high.",
        websiteUrl: "https://jiobit.com",
        socials: [{ network: "instagram", url: "https://instagram.com/jiobit" }],
      },
      {
        id: "pawtrack-cmp-4",
        name: "Tractive",
        description:
          "The volume player in Europe. Unlimited range on a cheap subscription, and by far the best at owner stories.",
        websiteUrl: "https://tractive.com",
        socials: [
          { network: "instagram", url: "https://instagram.com/tractive" },
          { network: "tiktok", url: "https://tiktok.com/@tractive" },
        ],
        suggested: true,
      },
      {
        id: "pawtrack-cmp-5",
        name: "Garmin",
        description:
          "Comes from hunting-dog GPS, not from pets. Wins on range and durability, loses on anything a city owner cares about.",
        websiteUrl: "https://garmin.com",
        socials: [{ network: "youtube", url: "https://youtube.com/@garmin" }],
        suggested: true,
      },
    ],
    ctaLinks: [
      { label: "Shop the collar", url: "pawtrack.example.com/shop", checked: true, suggested: false },
      { label: "Read owner stories", url: "pawtrack.example.com/stories", checked: true, suggested: false },
    ],
    language: "English",
    imageVoice: {
      websites: [
        {
          domain: "pawtrack.example.com",
          url: "https://pawtrack.example.com",
          colors: {
            primary: "#2F1B54",
            accent: "#7C4DFF",
            background: "#FFFFFF",
            textPrimary: "#241537",
            link: "#7C4DFF",
          },
          typography: {
            primaryFont: "Inter",
            headingFont: "Poppins",
            h1Size: "52px",
            h2Size: "26px",
            bodySize: "17px",
            fontStack: ["Inter", "system-ui", "sans-serif"],
          },
          images: {
            logo: { label: "Logo", url: "" },
            favicon: { label: "Favicon", url: "" },
            ogImage: { label: "OgImage", url: "" },
          },
          buttons: {
            primary: { bg: "#7C4DFF", color: "#FFFFFF", label: "Primary" },
            secondary: { bg: "#FFFFFF", color: "#2F1B54", border: "#2F1B54", label: "Secondary" },
          },
          personality: {
            tone: "warm",
            energy: "calm",
            audience: "dog and cat owners",
          },
        },
      ],
    },
    doRules: ["Name the animal, always", "Open on the moment, not the product", "Resolve the story — say how it ended"],
    dontRules: [
      "No fear statistics about lost pets",
      'Never say "pet parent"',
      "No studio product shot as the hero image",
    ],
    cta: "Home in forty minutes. That's the whole point.",
    usedIn: 2,
    updatedAt: "yesterday",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
  },
  // -- FOUR REAL-BRAND PLAYBOOKS, from actual listening exports --------------
  // Ported from the fork (axel-van/rebel-racoon, src/mocks.js) so the Topic Feed
  // can be judged on real prose instead of on invented topics. These four were
  // built from real website analyses and real 30-day listening scans; the Acme
  // and founder-voice Playbooks above are authored for this prototype.
  //
  // Two fork fields are dropped on the way in: "topics" (the listening config,
  // which lives in topic-feeds-store here - CONCEPTS.md section 1) and
  // "strategy", which has no surface in this repo. "influencers" came back
  // later with the Playbook's Influencers section.
  {
    id: "ctx-alliance-bjj",
    name: "Alliance Jiu Jitsu Carlsbad",
    color: "red",
    isDefault: false,
    brandName: "Alliance Jiu Jitsu Carlsbad",
    brandLogo: null,
    websiteUrl: "https://alliancecarlsbad.com/",
    audience: [
      "Active Carlsbad parents weighing martial arts for a child, and wary of programs that make kids aggressive",
      "Busy professionals and former practitioners returning to the mats after a multi-year break",
      "Women who want self-defence without walking into a room of experienced men — the academy runs a women-only program",
      "Teens and competitors who want structured progression under an Alliance black belt, not just open mats",
    ],
    businessSummary:
      "Win on coaching quality and a safety-first mat culture, not on trophies. Open since 2017 on Roosevelt St and affiliated to Alliance — the team founded by Romero 'Jacaré' Cavalcanti, Fábio Gurgel and Alexandre Paiva — with programs split by who you are rather than by belt: adults, teens, kids, women, competition team, plus no-gi, boxing and yoga. The front door is a complimentary 30-minute one-on-one introduction followed by a free trial period. Local competitors are loud about youth programs, belt promotions and community events; the opening is to explain what those milestones actually build — self-control, problem-solving, resilience — for parents and adults who want capability without aggression.",
    briefSummary:
      "Win on coaching quality and a safety-first mat culture, not on trophies. Local competitors are loud about youth programs, belt promotions and community events; the opening is to explain what those milestones actually build.",
    tones: ["Reassuring", "Expert"],
    voiceProfile: {
      headline: "Calm · expert · safety-first",
      writingStyle:
        "Answers a parent's real hesitation before selling anything. Explains the mechanism — why grappling teaches control rather than aggression — then lets the conclusion follow. Long-form and patient; never hypes competition results.",
      vocabulary:
        "Character development, self-control, problem-solving, structured progression, safety-first. The site's own recurring words are worth keeping: purpose, control, respect, structure, confidence, community, 'leave ego at the door'. Never 'dominate', 'destroy', 'killer instinct', or anything that frames training as fighting.",
      sentenceStructure:
        "Short declaratives, often in pairs — a two-word imperative followed by what it gets you ('Train smarter. Build real skill, strength, and confidence—both on and off the mats.'). One claim per sentence, and the claim names something checkable: a program, an age range, a coach, a class time.",
      formality:
        "Plain and direct. Second person throughout ('you or your child'), contractions allowed, no slang and no exclamation marks. Reads like a coach talking to a parent at the door, not like an ad.",
      personality:
        "Assured and unhurried. Confident enough to describe the room honestly — clean mats, beginners welcome, everyone trains with control — instead of claiming to be the best.",
      rhetoricalDevices:
        "Contrast the milestone with what it builds. Name the hesitation first, answer it second. Member and parent quotes as proof, since the strongest existing material on the site is testimonials about the coaches.",
      emotionalTone:
        "Reassuring. The reader is usually nervous — for themselves or for their kid — and the job of the first three lines is to make the room feel safe and legible.",
      contentPatterns:
        "Hesitation → mechanism → what it builds → an invitation with no pressure. Around 80–120 words. One audience per post; never write to parents and competitors in the same caption.",
      uniqueTraits:
        "Sorts everything by who it's for — adults, teens, kids, women, competition team — the way the site's own program menu does. Names the coach when the post is about instruction. States the offer precisely rather than saying 'free trial': a 30-minute one-on-one intro first, then the trial.",
      examples: [],
    },
    contentStyle: ["Educational", "Long-form"],
    objective: ["Brand awareness", "Lead generation", "Community building"],
    contentAction: ["Book a free intro class", "View the class schedule"],
    signatureHooks: [
      "Train Hard. Stay Humble.",
      "Train with Purpose. Belong to Something Bigger.",
      "Confidence for kids. Discipline for teens. Growth for adults.",
      "No ego, no intimidation.",
      "When something goes wrong, there's always another move to progress.",
    ],
    closingPatterns: [
      "Schedule your free introduction.",
      "Come train with us.",
      "No pressure — just a chance to train.",
    ],
    formattingStyle:
      "Opens on the hesitation or the person, never on the academy. Two or three short lines, one idea each, with the em dash used to attach the payoff to the imperative. Names the audience explicitly. Closes on the free intro with no urgency language. At most one emoji, and no emoji strings or arrow stacks in long-form copy.",
    visualStyle:
      "Black backgrounds, one accent — the Alliance yellow — and nothing else. Condensed uppercase headings over light body text. Square edges: the site's buttons carry no radius. Photography is on the mats, in the gi, mid-instruction rather than posed; kids' and women's classes shot at eye level, not from the ceiling.",
    brandPersonality:
      "Expert, reassuring and disciplined. World-class credentials worn lightly — the lineage is stated once and then earned back through how the room is described.",
    brandTypography: {
      headingFont: "Teko",
      bodyFont: "Ubuntu",
    },
    brandColors: [
      {
        name: "Primary",
        hex: "#FFC20E",
      },
      {
        name: "Secondary",
        hex: "#29282D",
      },
      {
        name: "Background",
        hex: "#020101",
      },
      {
        name: "Surface",
        hex: "#FFFFFF",
      },
      {
        name: "Text",
        hex: "#9C9C9C",
      },
    ],
    referenceImages: [],
    competitors: [
      {
        id: "alliance-cmp-1",
        name: "Gracie Barra Carlsbad",
        description:
          "Most active locally. Promotes youth programs on character building, celebrates belt and stripe promotions, and ran a 1st-anniversary celebration plus belt-rank seminars. Part of the largest BJJ association in the world, which gives it the same lineage argument Alliance uses.",
        websiteUrl: "https://graciebarracarlsbad.com/",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/gbcarlsbad",
          },
        ],
      },
      {
        id: "alliance-cmp-2",
        name: "Six Blades Jiu-Jitsu Carlsbad",
        description:
          "Leans on welcome-back stories (a student returning after a three-year hiatus) and on very young beginners, alongside belt promotions. Ribeiro lineage, on Innovation Way in the business park rather than in the village.",
        websiteUrl: "https://rjjcarlsbad.com/",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/sixbladesbjjcarlsbad",
          },
          {
            network: "facebook",
            url: "https://facebook.com/ribeirojjcarlsbad",
          },
        ],
      },
      {
        id: "alliance-cmp-3",
        name: "Freedom Jiu Jitsu Academy Carlsbad",
        description:
          "Posts belt and stripe promotions; part of the local cluster driving engagement around milestones. Positions on inclusiveness — 'all ages and all experience levels' — which is the closest competitor claim to Alliance's safety-first angle.",
        websiteUrl: "https://freedomjiujitsucarlsbad.com/",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/freedomjiujitsucarlsbad",
          },
        ],
      },
    ],
    ctaLinks: [
      {
        label: "Book a free intro class",
        url: "alliancecarlsbad.com/get-started/",
        checked: true,
        suggested: false,
      },
      {
        label: "Class schedule",
        url: "alliancecarlsbad.com/schedule/",
        checked: true,
        suggested: false,
      },
      {
        label: "Programs",
        url: "alliancecarlsbad.com/classes/",
        checked: true,
        suggested: false,
      },
      {
        label: "Meet our team",
        url: "alliancecarlsbad.com/team-alliance-carlsbad/",
        checked: false,
        suggested: false,
      },
    ],
    language: "English",
    imageVoice: null,
    doRules: [
      "Address the fear that martial arts makes children aggressive, directly.",
      "Explain what a promotion or a technique teaches, not just that it happened.",
      "Name the offer precisely — a complimentary 30-minute one-on-one introduction first, then a free trial period.",
      "Say who the class is for before saying what it teaches; the academy sorts every program by person, not by belt.",
      "Name the coach when the post is about instruction. Johnny Faria, Mark Vorgeas, Michael Nelms and Karolina Vorgeas are why the testimonials read the way they do.",
      "State the Alliance lineage once, in plain terms — Jacaré, Gurgel, Paiva — then move on.",
    ],
    dontRules: [
      "Don't post generic holiday greetings — the export flagged competitors' Independence Day posts as carrying no brand angle.",
      "Don't mirror competitors' anniversary or seminar promotion; it doesn't translate into a credible theme for this brand.",
      "Don't lean on 'world-class' and 'elite'. The site already says both on nearly every screen, and neither answers the question a nervous parent is actually asking.",
      "Don't open on a medal count or a champion callout. Results are proof further down the post, never the hook — this is the one habit the live Instagram has that the strategy argues against.",
      "No urgency or scarcity framing on the intro offer. 'No pressure' is the academy's own promise and countdown language breaks it.",
    ],
    cta: "Book a free intro class",
    usedIn: 0,
    updatedAt: "just now",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
    voice: null,
    brief: null,
    brand: null,
  },
  {
    id: "ctx-noba",
    name: "Noba Fashion",
    color: "yellow",
    isDefault: false,
    brandName: "NOBA",
    brandLogo: null,
    websiteUrl: "https://www.nobalifestyle.com/",
    audience: [
      "Style-conscious professionals, 28–45, who want the look of quiet luxury without the luxury invoice",
      "Repeat buyers who came in through one linen or cashmere piece and are building a wardrobe around it",
    ],
    businessSummary:
      "Sell the material and the restraint, not the season. The market Noba is watched against — Belgian multibrand chains — runs on discount percentages, weekly drops and celebrity capsules. Noba's whole claim is the opposite: fewer, better pieces at an accessible price, worn for years rather than for a weekend. Every post should make the durability argument concrete rather than repeat the word 'quality'.",
    briefSummary:
      "Sell the material and the restraint, not the season. Competitors run on discount percentages and weekly drops; Noba's claim is fewer, better pieces at an accessible price.",
    tones: ["Understated", "Confident"],
    voiceProfile: {
      headline: "Quiet · confident · never salesy",
      writingStyle:
        "Describes the garment and lets the reader draw the conclusion. Leads with the material and what it does over time — how linen softens, why cashmere holds its shape — instead of adjectives. Never hypes a drop.",
      vocabulary:
        "Linen, cashmere, merino, suede, tailored, considered, effortless. Never 'must-have', 'obsessed', 'grab yours', 'last chance', and no percentage-off language in organic copy.",
      sentenceStructure:
        "Short declaratives. One claim per sentence, and the claim is always checkable — a fabric, a construction, a use.",
      formality: "Polished but plain. 'You' and 'your', full words rather than slang, and no exclamation marks.",
      personality: "Assured and unhurried. Says less than it could, and never sounds like it needs the sale.",
      rhetoricalDevices:
        "Contrast the seasonal against the lasting. Show one piece styled several ways rather than several pieces once.",
      emotionalTone: "Calm confidence. Aspirational without being remote.",
      contentPatterns: "Material → what it does over time → how it's worn. Around 60 words, one piece per post.",
      uniqueTraits:
        "Names the fibre every time. Neutral, daylight photography over flat-lays. No countdown timers, no sale stickers on organic content.",
    },
    contentStyle: ["Editorial", "Product-led"],
    objective: ["Brand awareness", "Sales", "Traffic", "Reputation"],
    contentAction: ["Shop the collection", "Discover more"],
    signatureHooks: [
      "True style isn't loud or seasonal.",
      "One hundred percent linen. That's the entire spec sheet.",
      "Built to be worn next summer, and the one after that.",
    ],
    closingPatterns: ["Dress with class, for less.", "Fewer pieces. Worn longer."],
    formattingStyle:
      "Opens on the piece or the fibre. Two or three short lines. No emoji strings, at most one. Never opens with a discount.",
    visualStyle:
      "Neutral and jewel tones, daylight, models in motion rather than posed. Full-look framing so the cut reads. Sentence case throughout.",
    brandPersonality:
      "Assured, understated and accessible. Confident enough not to shout, warm enough not to feel like a luxury house.",
    brandTypography: null,
    brandColors: [],
    referenceImages: [],
    competitors: [
      {
        id: "noba-cmp-1",
        name: "ZEB",
        description:
          "Highest-volume poster in the scan and the loudest discounter — '-50% & -70%' ran through most of July. Multibrand, festival-heavy, and the one running its own staff and ambassadors as the face of the brand.",
        websiteUrl: "https://www.zeb.be",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/zebfashion",
          },
        ],
      },
      {
        id: "noba-cmp-2",
        name: "JBC",
        description:
          "Belgian family retailer, and the strongest engagement in the set by a distance. Wins on personality — a celebrity capsule (CAMILLE x JBC), topical humour and second-hand Bring Back days — rather than on product.",
        websiteUrl: "https://www.jbc.be",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/jbcfashion",
          },
        ],
      },
      {
        id: "noba-cmp-3",
        name: "The Fashion Store",
        description:
          "Multibrand with 75+ labels. Posts twice daily on a fixed schedule, mixing sale reminders with customer-worn looks from its #thefashionstorelovers creators.",
        websiteUrl: "https://www.thefashionstore.be",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/thefashionstore_be",
          },
        ],
      },
      {
        id: "noba-cmp-4",
        name: "E5 Mode",
        description:
          "The closest thing in the set to Noba's register: label-led FW26 storytelling, 'quiet luxury', 'timeless', 'some pieces never date'. Posts in threes, one brand at a time, with almost no discount language.",
        websiteUrl: "https://www.e5.be",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/e5mode",
          },
        ],
      },
      {
        id: "noba-cmp-5",
        name: "PointCarré",
        description:
          "Smallest volume, most creator-dependent. Nearly every post is a paid partnership look, and the comment counts on those run far ahead of its own brand posts.",
        websiteUrl: "https://www.pointcarre.be",
        socials: [
          {
            network: "instagram",
            url: "https://instagram.com/point_carre",
          },
        ],
      },
    ],
    // Influencers — the creators this audience already follows. Ported from the
    // fork, minus its `reach` follower counts: a count goes stale on its own,
    // which fails the Playbook inclusion test (CONCEPTS.md §1, question 2).
    influencers: [
      {
        id: "noba-inf-1",
        name: "Camille Dhont",
        description:
          "Belgian artist behind CAMILLE x JBC. The single biggest engagement driver in the scan — her collection posts ran 10–30× JBC's own baseline.",
        socials: [{ network: "instagram", url: "https://instagram.com/camille_dhont" }],
      },
      {
        id: "noba-inf-2",
        name: "Astrid Coppens",
        description:
          "Astrid Black Label, sold through ZEB. A designer-founder rather than a paid creator — the model closest to how Noba could tell its own founder story.",
        socials: [{ network: "instagram", url: "https://instagram.com/astridblacklabel" }],
      },
      {
        id: "noba-inf-3",
        name: "Ashley Galeyn",
        description:
          "JBC ambassador, used to carry seasonal colour and styling explainers. The format Noba would use for a fibre, not a trend.",
        socials: [{ network: "instagram", url: "https://instagram.com/ashleygaleyn" }],
      },
      {
        id: "noba-inf-4",
        name: "Ellen Callebout",
        description:
          "Belgian accessories designer stocked by The Fashion Store, including behind-the-scenes on the FW shoot — the highest-engagement non-celebrity content in that account.",
        socials: [{ network: "instagram", url: "https://instagram.com/ellencallebout" }],
      },
    ],
    ctaLinks: [
      {
        label: "Shop the collection",
        url: "nobalifestyle.com/collections",
        checked: true,
        suggested: false,
      },
      {
        label: "Our story",
        url: "nobalifestyle.com/pages/our-story",
        checked: true,
        suggested: false,
      },
    ],
    language: "English",
    imageVoice: null,
    doRules: [
      "Name the fibre — linen, cashmere, merino, suede — in every product post.",
      "Argue durability with something checkable: how the fabric ages, how it's made, how it's worn again.",
      "Show one piece styled several ways rather than several pieces once.",
    ],
    dontRules: [
      "No percentage-off language in organic posts — that's the competitors' whole feed and it undercuts the claim.",
      "Don't chase a weekend: festival and one-off event content contradicts 'built to last'.",
      "No countdown or scarcity framing.",
    ],
    cta: "Dress with class, for less.",
    usedIn: 0,
    updatedAt: "just now",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
    voice: null,
    brief: null,
    brand: null,
  },
  {
    id: "ctx-dwelling",
    name: "The Dwelling Company",
    color: "green",
    isDefault: false,
    brandName: "The Dwelling Company",
    brandLogo: null,
    websiteUrl: "https://www.thedwellingcompany.com/",
    audience: [
      "Cost-burdened middle-income renters — households on $20k–$75k paying more than 30% of income in rent",
      "Eco-conscious apartment seekers who weigh how a building was made, not just what it costs",
      "Municipalities, landowners and capital partners looking for attainable housing that actually pencils",
    ],
    businessSummary:
      "The Dwelling Company manufactures, develops and operates attainable, sustainable, connected apartments built on a steel skeleton. Up to 90% of the building is assembled in a centralised factory — including about 95% of the MEP systems, against roughly 10% for panelised construction — which is where the cost saving comes from. The market it is built for is the 9.7 million cost-burdened US rental households, 21.4 million of whom earn between $20k and $75k.",
    briefSummary:
      "Steel-skeleton modular apartments, up to 90% factory-assembled, for the 9.7m US renters paying more than 30% of their income in rent. Attainable, sustainable, connected.",
    tones: ["Direct", "Evidence-led"],
    voiceProfile: {
      headline: "Attainable · sustainable · connected",
      writingStyle:
        "States the problem with a number, then the structural reason it exists, then what the factory changes about it. Never sells the building without saying what it costs to run. Reads like an engineer explaining a constraint, not a developer selling a unit.",
      vocabulary:
        "Cost-burdened, attainable, steel skeleton, modular, MEP, factory completion, Energy Star, DOE ZERH, operating cost. Attainable, never 'affordable housing' — the distinction is the whole positioning. Never 'luxury', never 'dream home'.",
      sentenceStructure: null,
      examples: [],
    },
    contentStyle: ["Data-driven with structural insights", "Problem-solution oriented"],
    objective: ["Brand awareness", "Lead generation", "Reputation"],
    contentAction: ["Contact us for inquiries", "Follow our LinkedIn page"],
    signatureHooks: [],
    closingPatterns: [],
    formattingStyle: null,
    visualStyle: null,
    brandPersonality: "engineering-led, plain-spoken, socially serious",
    brandTypography: null,
    brandColors: [],
    referenceImages: [],
    competitors: [
      {
        id: "dw-cmp-1",
        name: "Factory_OS",
        description:
          "Named in the brand brief. Vallejo, CA — factory-built multifamily at volume, the closest US analogue to this model. The scan returned no posts from this account in the window.",
        websiteUrl: "https://factoryos.com/",
        socials: [],
      },
      {
        id: "dw-cmp-2",
        name: "Vessel Technologies",
        description:
          "Named in the brand brief. Panelised apartment buildings pitched on operating cost rather than sticker price. The scan returned no posts from this account in the window.",
        websiteUrl: "https://www.vesseltechnologies.com/",
        socials: [],
      },
      {
        id: "dw-cmp-3",
        name: "Autovol",
        description:
          "Named in the brand brief. Nampa, ID — robotic modular assembly, the automation end of the same argument. The scan returned no posts from this account in the window.",
        websiteUrl: "https://autovol.com/",
        socials: [],
      },
      {
        id: "dw-cmp-4",
        name: "Module",
        description:
          "Named in the brand brief. Pittsburgh — incremental, expandable modular homes. The scan returned no posts from this account in the window.",
        websiteUrl: "https://modulehousing.com/",
        socials: [],
      },
      {
        id: "dw-cmp-5",
        name: "Sibomat",
        description:
          "Not in the brand brief — surfaced by the scan, and not a competitor. A Belgian timber-frame housebuilder and the loudest account in the window: material performance, showroom visits, a 35-year repeat customer.",
        websiteUrl: "https://www.sibomat.be/",
        socials: [],
      },
      {
        id: "dw-cmp-6",
        name: "Stabilame",
        description:
          "Not in the brand brief — surfaced by the scan. Walloon mass-timber and CLT builder; the only account in the window doing public-amenity work — a marina capitainerie built over water, visitor infrastructure.",
        websiteUrl: "https://www.stabilame.be/",
        socials: [],
      },
      {
        id: "dw-cmp-7",
        name: "Thomas & Piron",
        description:
          "Not in the brand brief — surfaced by the scan. Large Belgian developer, 50 years old this year. Most of its posts in the window are anniversary, recruitment and sponsorship — the noise the scan flagged.",
        websiteUrl: "https://www.thomas-piron.eu/",
        socials: [],
      },
      {
        id: "dw-cmp-8",
        name: "Maisons Blavier",
        description:
          "Not in the brand brief — surfaced by the scan. Bilingual FR/NL housebuilder running an open-house and show-home programme, plus a behind-the-scenes build series.",
        websiteUrl: "https://www.blavier.be/",
        socials: [],
      },
    ],
    ctaLinks: [
      {
        label: "Contact us",
        url: "https://www.thedwellingcompany.com/contact",
      },
      {
        label: "Follow on LinkedIn",
        url: "https://www.linkedin.com/company/the-dwelling-company/",
      },
    ],
    language: "English",
    imageVoice: null,
    doRules: [
      "Lead with the number. 9.7 million cost-burdened households, 30% of income, 90% factory completion — the argument is arithmetic before it is anything else.",
      "Say what it costs to LIVE in, not only what it costs to build. Energy Star and DOE ZERH are the half of the story a renter actually pays for.",
    ],
    dontRules: [
      "Don't say 'affordable housing'. This is attainable, market-rate, unsubsidised — collapsing the two loses the whole position.",
      "Don't borrow the timber-sustainability argument the scan is full of. Steel and factory completion is a different claim, and echoing a competitor's material story concedes the point.",
    ],
    cta: "Contact us for inquiries",
    usedIn: 0,
    updatedAt: "just now",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
    voice: null,
    brief: null,
    brand: null,
  },
  {
    id: "ctx-agorapulse",
    name: "Agorapulse",
    color: "orange",
    isDefault: false,
    brandName: "Agorapulse",
    brandLogo: null,
    websiteUrl: "https://www.agorapulse.com/",
    audience: [
      "Social Media Managers running publishing, inbox and reporting day to day",
      "Marketing agencies handling several client accounts at once",
      "Growing marketing teams that need shared calendars and approval workflows",
      "The social media manager who has to justify the budget upward — the one asked what the posting actually returned",
      "Teams evaluating a switch off Hootsuite or Sprout Social on cost, usability and support",
    ],
    businessSummary:
      "Agorapulse is an easy-to-use social media management platform for growing marketing teams, agencies and businesses: one dashboard for publishing, inbox, reporting, monitoring and team collaboration. Shared calendars, automated moderation and social ROI tracking are the levers — the pitch is saving time, staying organised, and being able to prove the value of the work. Founded in Paris in 2010 by Emeric Ernoult and Benoît Hédiard and bootstrapped since, it shipped the first social media inbox in 2014 and now serves 31K+ social media managers daily. The site argues on four numbers rather than adjectives: 50% of content-creation time saved, 30% average saving for teams switching, 96% user satisfaction, and support answering in 30 minutes or less. Social ROI is the differentiator it claims outright — tracking sales, traffic and leads back to organic posts.",
    briefSummary:
      "One dashboard for publishing, inbox, reporting, monitoring and collaboration. The pitch is saving time, staying organised, and proving social ROI.",
    tones: ["Direct", "Helpful"],
    voiceProfile: {
      headline: "Direct · practical · customer-first",
      writingStyle:
        "Says the useful thing first and shows the workflow rather than describing it. Leans on what real teams did and what it changed. Educational without being abstract — every piece should leave a social media manager able to do something on Monday.",
      vocabulary:
        "Workflow, inbox, publishing, reporting, social ROI, approval, moderation, shared calendar. Concrete nouns over category language; never 'synergy', 'revolutionise' or 'game-changer'.",
      sentenceStructure:
        "Short and load-bearing. The best lines on the site are built on a turn — 'Keep tabs, without switching tabs' — where the second half reverses the first. Body copy runs two or three sentences, then a list of what it lets you do.",
      formality:
        "Semi-formal and colloquial where it helps. Second person throughout, contractions everywhere, and willing to name the feeling out loud ('the internal friction and downright annoyance of having to send multiple emails'). Never corporate, never slangy.",
      personality:
        "A peer who has done the job. Speaks to the social media manager, not to the buyer above them, and takes their side — the recurring subtext is that this work is undervalued and measurable.",
      rhetoricalDevices:
        "Contradict the assumption, then explain ('The best time to post on social media isn't when you think'). Named customer with a number attached. Head-to-head comparisons answered plainly rather than dodged.",
      emotionalTone:
        "Reassuring and slightly conspiratorial. Acknowledges the chaos — tab-switching, approval chasing, proving your worth — and positions the product as relief rather than transformation.",
      contentPatterns:
        "Pain → mechanism → proof → try it free. Blog headlines lead with the reader's problem or a customer's number; product copy leads with the job and closes on a three-item capability list.",
      uniqueTraits:
        "Social ROI is the claim nothing else in the category makes as flatly. Customer names and figures carry the argument in place of adjectives. Competitors are named directly, trademark symbols and all, rather than alluded to.",
      examples: [],
    },
    contentStyle: ["Direct and actionable", "Customer-centric storytelling", "Tool-driven and educational"],
    objective: ["Lead generation", "Product adoption", "Community building"],
    contentAction: ["Sign up for a free trial", "Book a personalized demo", "Try free social media tools"],
    signatureHooks: [
      "Keep tabs, without switching tabs.",
      "Drive real impact on social media. From engagement to ROI.",
      "The best time to post on social media isn't when you think.",
      "Is your social media strategy failing? Here's why.",
      "Save time, stay organized, and easily manage your social media.",
    ],
    closingPatterns: [
      "Try for free now — 30 days, no card required.",
      "See how teams like yours did it.",
      "Book a demo and we'll walk your workflow.",
    ],
    formattingStyle:
      "Opens on the reader's problem or a customer's number, never on the product. Two or three short sentences, then a three-item list of what it lets you do. Headlines built on a reversal or a contradicted assumption. Numbers stated plainly — 50%, 30%, 96%, 30 minutes — with the customer named beside them. Free trial mentioned at the end, with the terms attached rather than as pressure.",
    visualStyle:
      "Navy text on white, orange for emphasis and blue for the action. Light peach and grey tints separate sections; nothing is dark. Product screenshots do the explaining — real dashboards and inboxes, not illustration. Sentence case in body copy, title case in headlines. Buttons are barely rounded.",
    brandPersonality:
      "Direct, practical and customer-first. A peer who has done the job, on the side of the social media manager rather than the buyer — and confident enough to name competitors and put its numbers next to theirs.",
    brandTypography: {
      headingFont: "Averta",
      bodyFont: "Averta",
    },
    brandColors: [
      {
        name: "Primary",
        hex: "#212E44",
      },
      {
        name: "Secondary",
        hex: "#344563",
      },
      {
        name: "Accent",
        hex: "#FF6726",
      },
      {
        name: "Action",
        hex: "#1863DC",
      },
      {
        name: "Background",
        hex: "#FFFFFF",
      },
      {
        name: "Surface",
        hex: "#FFEFE9",
      },
    ],
    referenceImages: [],
    competitors: [
      {
        id: "agp-cmp-1",
        name: "Sprout Social",
        description:
          "Named in the brand brief. In the scan: pillar guides on analytics and a two-part Bluesky playbook — cornerstone content built to rank and anchor a topic cluster.",
        websiteUrl: "https://sproutsocial.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/sprout-social-inc-",
          },
          {
            network: "instagram",
            url: "https://instagram.com/sproutsocial",
          },
        ],
      },
      {
        id: "agp-cmp-2",
        name: "Hootsuite",
        description:
          "Named in the brand brief. In the scan: the loudest AI move of the window — Social OS, pitched as rebuilding the product around an agent layer rather than bolting AI onto it.",
        websiteUrl: "https://www.hootsuite.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/hootsuite",
          },
        ],
      },
      {
        id: "agp-cmp-3",
        name: "Sendible",
        description: "Named in the brand brief. The scan returned no posts from this account in the window.",
        websiteUrl: "https://www.sendible.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/sendible",
          },
          {
            network: "instagram",
            url: "https://instagram.com/sendible",
          },
        ],
      },
      {
        id: "agp-cmp-4",
        name: "Loomly",
        description: "Named in the brand brief. The scan returned no posts from this account in the window.",
        websiteUrl: "https://www.loomly.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/loomly",
          },
          {
            network: "instagram",
            url: "https://instagram.com/loomlysocial",
          },
        ],
      },
      {
        id: "agp-cmp-5",
        name: "Buffer",
        description:
          "Not in the brand brief — surfaced by the scan. Practitioner-voice content on MCP servers and head-to-head comparisons, plus the Insights launch.",
        websiteUrl: "https://buffer.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/bufferapp",
          },
          {
            network: "instagram",
            url: "https://instagram.com/buffer",
          },
        ],
      },
      {
        id: "agp-cmp-6",
        name: "Vista Social",
        description:
          "Not in the brand brief — surfaced by the scan. Ask Vista, a conversational command surface across 50+ tools, and image-to-video in the AI Assistant.",
        websiteUrl: "https://vistasocial.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/vistasocial",
          },
          {
            network: "instagram",
            url: "https://instagram.com/vistasocialapp",
          },
        ],
      },
      {
        id: "agp-cmp-7",
        name: "Sprinklr",
        description:
          "Not in the brand brief — surfaced by the scan. Enterprise framing: governed measurement definitions, and LLM Insights for brand visibility inside AI answers.",
        websiteUrl: "https://www.sprinklr.com/",
        socials: [
          {
            network: "linkedin",
            url: "https://www.linkedin.com/company/sprinklr",
          },
          {
            network: "instagram",
            url: "https://instagram.com/sprinklr",
          },
        ],
      },
    ],
    ctaLinks: [
      {
        label: "Start a free trial",
        url: "https://www.agorapulse.com/free-trial/",
        checked: true,
        suggested: false,
      },
      {
        label: "Book a demo",
        url: "https://www.agorapulse.com/request-demo/",
        checked: true,
        suggested: false,
      },
      {
        label: "Pricing",
        url: "https://www.agorapulse.com/pricing/",
        checked: true,
        suggested: false,
      },
      {
        label: "Free social media tools",
        url: "https://www.agorapulse.com/free-social-media-marketing-tools/",
        checked: true,
        suggested: false,
      },
      {
        label: "Success stories",
        url: "https://www.agorapulse.com/blog/success-stories/",
        checked: false,
        suggested: false,
      },
      {
        label: "Agorapulse Academy",
        url: "https://www.agorapulse.com/academy/",
        checked: false,
        suggested: false,
      },
    ],
    language: "English",
    imageVoice: null,
    doRules: [
      "Show the workflow. A screenshot of the thing working beats a paragraph describing it.",
      "Answer the comparison question honestly — the scan shows head-to-head content is what captures bottom-funnel search.",
      "Attach a number to a named customer. The site argues with 50%, 30%, 96% and 30 minutes rather than with adjectives; a claim without a name behind it is weaker than the brand's own baseline.",
      "Write to the social media manager, not to the person who signs off. The brand's whole position is taking their side.",
      "State the trial terms when you offer it — 30 days, no card required. It is the reason the offer reads as low-risk.",
    ],
    dontRules: [
      "Don't announce an AI capability without saying which job it removes. The window is full of agent launches and thin on what they actually replace.",
      "Don't publish a metrics list. Competitors already own 'here are 30 metrics'; the opening is which ones tie to a decision.",
      "Don't lead with the platform. Every strong line on the site opens on the reader's problem and reaches the product second.",
      "No hype vocabulary — 'revolutionary', 'game-changer', 'synergy'. The brand's credibility rests on sounding like a practitioner.",
      "Don't claim ROI in the abstract. Social ROI means tracked sales, traffic and leads from organic posts; used loosely it becomes the category language it was meant to replace.",
    ],
    cta: "Start a free trial",
    usedIn: 0,
    updatedAt: "just now",
    analysis: {
      voice: null,
      brief: null,
      brand: null,
    },
    voice: null,
    brief: null,
    brand: null,
  },
];

// ---- Playbooks that only exist under the `playbookSharing` flag ------------
//
// Kept out of `contexts` and appended by contexts-store when the flag is on —
// the same split as demoManyProfiles. These aren't data riding along an existing
// object: they're whole Playbooks that only mean something once ownership exists. With the flag off they'd be a stray
// half-filled fiche and an extra library card nobody asked for.
export const sharedContexts = [
  // Sam's Playbook, shared with the whole org — the read-only case, and the
  // problem the sharing feature exists for: two people building a Playbook for
  // the SAME brand (Acme), each with their own editorial framing, neither aware
  // of the other. Mine is "Acme · Q2 marketing" above.
  {
    id: "ctx-acme-devrel",
    name: "Acme · Developer relations",
    color: "blue",
    isDefault: false,
    ownerId: "u-sam",
    // Received by NAME: Sam picked the two of us rather than the whole org, so
    // this is the read-only case AND the fixed-list headline ("Sam Rivera shared
    // this Playbook with you"). The org-wide reach is demoed from the owner's
    // side by "Acme · Q2 marketing" above.
    scope: "members",
    sharedWith: ["u-me", "u-nina"],
    brandName: "Acme",
    brandLogos: ACME_LOGOS.map((l) => ({ ...l })),
    brandLogo: "assets/logos/brands/acme.svg",
    websiteUrl: "https://acme.example.com/developers",
    audience: [
      "Backend engineers who found us through the API docs",
      "Platform teams deciding whether to build or buy",
    ],
    businessSummary:
      "Acme's developer surface, written for people who read the changelog before the landing page. Ship notes, API design decisions, and honest trade-offs — no funnel language.",
    briefSummary:
      "Acme's developer surface, written for people who read the changelog before the landing page. Ship notes, API design decisions, and honest trade-offs — no funnel language.",
    tones: ["Technical", "Direct"],
    voiceProfile: {
      headline: "Technical · direct · unmarketed",
      writingStyle:
        "Leads with the change and what it costs. Explains the trade-off rather than claiming there isn't one.",
      vocabulary: "Precise API vocabulary, no abstraction. Says 'endpoint', 'rate limit', 'breaking change' plainly.",
      sentenceStructure: "Short declaratives. One idea per line. Code or a payload where an example beats a sentence.",
      formality: "Peer to peer. 'We' for the team that shipped it, 'you' for the person integrating.",
      personality: "Straight, unhurried, willing to say what's still rough.",
      rhetoricalDevices: "Before / after payloads. Named versions. Explicit migration notes.",
      emotionalTone: "Level. Enthusiasm is carried by the change itself, never by adjectives.",
      contentPatterns: "What changed → why → what it breaks → how to migrate.",
      uniqueTraits: 'No "excited to announce". No emoji. Never ships a post without a link to the reference.',
    },
    contentStyle: ["Technical deep-dive"],
    objective: ["Product adoption", "Thought leadership", "Traffic"],
    contentAction: ["Read the changelog", "Try it in the sandbox"],
    signatureHooks: ["We changed how [thing] works.", "This one breaks something. Here's what:"],
    closingPatterns: ["Full reference →", "Migration notes in the changelog."],
    formattingStyle:
      "Short declarative lines, one idea each. A payload or snippet where it replaces a paragraph. Version numbers spelled out.",
    visualStyle: "No emoji. No exclamation marks. Endpoint names in backticks. Versions as digits.",
    brandPersonality: "Straight, unhurried, willing to name what's still rough. Talks to peers, not prospects.",
    brandTypography: { headingFont: "Inter", bodyFont: "JetBrains Mono" },
    brandColors: [
      { name: "Primary", hex: "#212E44" },
      { name: "Accent", hex: "#3D7DD6" },
      { name: "Background", hex: "#FFFFFF" },
      { name: "Text", hex: "#1A1F36" },
    ],
    ctaLinks: [
      { label: "Read the changelog", url: "acme.example.com/changelog", checked: true, suggested: false },
      { label: "Try it in the sandbox", url: "acme.example.com/sandbox", checked: true, suggested: false },
    ],
    language: "English",
    doRules: ["Name the version", "Say what breaks", "Link the reference"],
    dontRules: ['No "excited to announce"', "No emoji", "Don't claim there's no trade-off"],
    cta: "Full reference →",
    usedIn: 2,
    updatedAt: "yesterday",
    // Pre-filled so "Recent changes" in the Share modal has something to show
    // on a first run. No diffs, by design — who and when, never what.
    history: [
      { id: "h-seed-1", actorId: "u-sam", action: "created this Playbook", when: "3 weeks ago" },
      { id: "h-seed-2", actorId: "u-sam", action: "shared it with 2 people", when: "3 weeks ago" },
      { id: "h-seed-3", actorId: "u-sam", action: "edited the Voice & style section", when: "yesterday" },
    ],
    analysis: { voice: null, brief: null, brand: null },
  },
  // The tombstone. Deliberately thin: nothing ever renders this Playbook,
  // because nobody but Jonas can see it. It exists so one seeded chat can point
  // at a Playbook it lost access to and still say its name — which is what
  // playbook-access's revokedContextFor() reads. See the note at the top of that
  // file for why the store doesn't just hide it.
  {
    id: "ctx-orphan-brightline",
    name: "Brightline · launch",
    color: "grey",
    isDefault: false,
    ownerId: "u-jonas",
    scope: "personal",
    brandName: "Brightline",
    websiteUrl: "https://brightline.example.com",
    audience: ["Ops leads at mid-market logistics firms"],
    businessSummary: "Launch narrative for Brightline, written while the positioning was still moving.",
    briefSummary: "Launch narrative for Brightline, written while the positioning was still moving.",
    tones: ["Professional"],
    language: "English",
    usedIn: 1,
    updatedAt: "a week ago",
    analysis: { voice: null, brief: null, brand: null },
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
