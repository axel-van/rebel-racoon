// Conversational context-builder orchestrator.
//
// Playbook CREATION is the First Time User ALT flow (`startAlt`): a 3-question
// chat (URL → profile → optional documents) that kicks off a mock website
// analysis, then reveals the editable recap (see playbook-view + the
// welcome-alt-recap / integrated New-Playbook wrappers). `save()` persists the
// draft into the contexts-store. The older brief-builder (a "Website /
// Documents" source picker → right-panel brief form) was removed once the ALT
// flow became the single creation path.
//
// State per "session" (a synthetic id when invoked outside a real chat) is the
// draft: { websiteUrl, name, businessSummary, audience, audienceProblems,
// tones, contentStyle, objective, contentAction, ctaLinks, language, color,
// suggestions, editingId, onComplete }.

import * as inlineQuestion from "./inline-question.js?v=1163";
import { connectableNetworkCards, accountIdsForNetwork } from "./connect-profiles-flow.js?v=1163";
import { open as openConnectAccountModal } from "./components/connect-account-modal.js?v=1163";
import { postAssistantMessage, postUserTurn, postUserProfilesTurn } from "./assistant.js?v=1163";
import * as rightPanel from "./components/right-panel.js?v=1163";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=1163";
import { isWorkspaceMode, setActivePlaybook } from "./active-playbook.js?v=1163";
import { analyzeWebsite } from "./context-mock-analysis.js?v=1163";
import { connectors as connectorMocks } from "./mocks.js?v=1163";
import {
  getConnectedProfiles,
  buildConnectedProfileItems,
  PROFILE_SEARCH_THRESHOLD,
} from "./social-profiles.js?v=1163";
import { cloneVoiceByLanguage, LANGUAGE_OPTIONS, DEFAULT_LANGUAGE } from "./languages.js?v=1163";
import { isFlagOn } from "./feature-flags.js?v=1163";

const drafts = new Map(); // sessionId → draft
const subscribers = new Map(); // sessionId → Set<fn>

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch (err) {
      console.warn("[context-builder] subscriber threw", err);
    }
  }
}

function emptyDraft(overrides = {}) {
  return {
    websiteUrl: "",
    name: "",
    businessSummary: "",
    audience: [],
    audienceProblems: [],
    tones: [],
    contentStyle: [],
    objective: [],
    contentAction: [],
    ctaLinks: [], // Array<{ label, url, checked, suggested }>
    language: "English",
    color: "orange",
    voiceProfile: null,
    // Voice & style — concrete patterns surfaced in the Playbook view.
    signatureHooks: [],
    closingPatterns: [],
    formattingStyle: "",
    visualStyle: "",
    voiceMode: "guided", // "guided" (structured fields) | "manual" (free-form)
    voiceManual: "",
    // Brand — author-editable identity (seeded from the scraped site on first edit).
    brandPersonality: "",
    brandTypography: null, // { headingFont, bodyFont }
    brandColors: [], // Array<{ name, hex }>
    brandLogos: [], // Array<{ id, label, url }> — every mark found or uploaded
    brandLogo: "", // the DEFAULT's url (one of brandLogos, "" = none)
    // The brand's default look for generated images — { imageType, style, refMode },
    // "" on each = no preference. See contexts-store#normalizeImageDefaults.
    imageDefaults: { imageType: "", style: "", refMode: "" },
    referenceImages: [], // Array<{ id, label, url, note?, networks? }> — note/networks = optional usage guidance
    // Competitors — Array<{ id, name, description, websiteUrl, socials:[{network,url}], logo?, suggested? }>.
    // Pre-filled from the website analysis, each flagged `suggested: true` =
    // a PENDING proposal the user still has to accept in the Playbook's
    // Competitors section. dismissedCompetitors keeps the keys of the rejected
    // ones so discovery never proposes them again.
    competitors: [],
    dismissedCompetitors: [],
    sourceType: null, // "website" | "documents" | "social"
    sourceUrl: "",
    sourceFile: null,
    sourcePlatform: null,
    connectedSocials: [],
    selectedProfileId: null,
    imageVoice: { websites: [] },
    suggestions: {
      audience: [],
      audienceProblems: [],
      tones: [],
      contentStyle: [],
      objective: [],
      contentAction: [],
      ctaLinks: [],
    },
    customAdditions: {
      audience: [],
      audienceProblems: [],
      tones: [],
      contentStyle: [],
      objective: [],
      contentAction: [],
    },
    editingId: null,
    onComplete: null,
    ...overrides,
  };
}

export function getDraft(sessionId) {
  return drafts.get(sessionId) || null;
}

// Map an analysis result onto the section fields of a Playbook/draft, WITHOUT
// touching identity (name) or chrome. Shared by the onboarding draft fill
// (applyAnalysisToDraft) and the saved-Playbook "Auto-fill" overwrite on the
// detail page (screens/playbook.js). Returns a plain patch object.
// The scraped logo candidates → { brandLogos, brandLogo }. Kept beside the
// analysis mapper rather than inside it so the shape stays one line up there.
function logoPatchFromAnalysis(s) {
  const found = s?.imageVoice?.websites?.[0]?.images?.logos;
  const list = (Array.isArray(found) ? found : [])
    .filter((l) => l && l.url)
    .map((l, i) => ({ id: `site-logo-${i}`, label: l.label || "Logo", url: l.url }));
  return { brandLogos: list, brandLogo: list[0]?.url || "" };
}

// The brand's default LOOK, guessed from the site's personality. Tone picks the
// family, energy picks the member — deliberately small, because a website's
// personality genuinely constrains "photographic vs graphic" and "quiet vs loud"
// and nothing finer than that.
//
// Only `style` is derived. `imageType` answers what THIS post should show and
// `refMode` describes the use of a reference image the analysis never picked —
// guessing either would be the retired grid-brief mistake (named fields, invented).
// An unrecognised tone yields "" rather than a fallback preset: putting a claim on
// the fiche that nothing supports is worse than leaving it on "Any".
const LOOK_FAMILY = {
  professional: "graphic",
  "operator-first": "graphic",
  direct: "graphic",
  "evidence-led": "graphic",
  authoritative: "graphic",
  warm: "warm",
  friendly: "warm",
  playful: "warm",
  human: "warm",
};
const LOOK_BY_ENERGY = {
  graphic: { calm: "corporate", medium: "tech-minimal", high: "bold-editorial" },
  warm: { calm: "photoreal", medium: "photoreal", high: "hand-drawn" },
};
function energyBand(e) {
  const v = String(e || "").toLowerCase();
  if (v === "calm" || v === "low") return "calm";
  if (v === "high" || v === "medium-high") return "high";
  return "medium";
}
// NOT part of sectionPatchFromAnalysis, on purpose: that patch is also what
// "Re-analyze website" applies to an EXISTING fiche, and since only `style` is
// derived it would blank a hand-picked image type and reference mode with nothing
// to put in their place. The pre-fill belongs to the path that CREATES a Playbook.
export function imageDefaultsFromAnalysis(analysis) {
  const p = (analysis && analysis.suggestions)?.imageVoice?.websites?.[0]?.personality || {};
  const fam = LOOK_FAMILY[String(p.tone || "").toLowerCase()];
  return { imageType: "", style: fam ? LOOK_BY_ENERGY[fam][energyBand(p.energy)] : "", refMode: "" };
}

export function sectionPatchFromAnalysis(analysis) {
  const s = (analysis && analysis.suggestions) || {};
  return {
    businessSummary: analysis?.businessSummary || "",
    briefSummary: analysis?.businessSummary || "", // legacy mirror
    // Primary audience is single-select (the user picks one from Archie's
    // analysed list in the recap), so pre-select only the top suggestion —
    // the full list stays available via `suggestions.audience` for the picker.
    audience: (s.audience || []).slice(0, 1),
    audienceProblems: (s.audienceProblems || []).slice(),
    tones: (s.tones || []).slice(),
    contentStyle: (s.contentStyle || []).slice(),
    objective: (s.objective || []).slice(),
    contentAction: (s.contentAction || []).slice(),
    ctaLinks: (s.ctaLinks || []).map((l) => ({ ...l })),
    language: s.language || "English",
    voiceProfile: s.voiceProfile ? { ...s.voiceProfile } : null,
    imageVoice: s.imageVoice || { websites: [] },
    signatureHooks: (s.signatureHooks || []).slice(),
    closingPatterns: (s.closingPatterns || []).slice(),
    formattingStyle: s.formattingStyle || "",
    visualStyle: s.visualStyle || "",
    // A fresh analysis always produces structured voice — reset to guided.
    voiceMode: "guided",
    voiceManual: "",
    brandPersonality: s.brandPersonality || "",
    brandTypography: s.brandTypography ? { ...s.brandTypography } : null,
    brandColors: (s.brandColors || []).map((c) => ({ ...c })),
    // Marks the crawl turned up (imageVoice.websites[0].images.logos). The
    // first becomes the default; the user re-picks in the Brand section.
    ...logoPatchFromAnalysis(s),
    // Competitors Archie found on the brand's market. Flagged `suggested`, so
    // they arrive as PENDING proposals in the Competitors section rather than
    // as Playbook entries — the user accepts the ones that matter.
    competitors: (s.competitors || []).map((c) => ({
      ...c,
      socials: Array.isArray(c.socials) ? c.socials.map((x) => ({ ...x })) : [],
      suggested: true,
    })),
  };
}

// Shared draft patch — applied by the First Time User ALT flow (`startAlt`)
// after the website analysis lands. Pre-selects every suggested value so the
// recap reads as "Archie's best guess, edit if anything's off".
function applyAnalysisToDraft(d, analysis) {
  d.name = d.name || analysis.name;
  d.suggestions = analysis.suggestions;
  d.color = analysis.suggestions.color || "orange";
  Object.assign(d, sectionPatchFromAnalysis(analysis));
  d.imageDefaults = imageDefaultsFromAnalysis(analysis);
}

// Patch the draft from outside the conversational flow — used by the
// welcome-alt recap to edit Playbook fields without going through
// inlineQuestion.
export function patchDraft(sessionId, patch) {
  const d = drafts.get(sessionId);
  if (!d) return null;
  Object.assign(d, patch);
  notify(sessionId);
  return d;
}

// Re-seed a draft from a persisted snapshot (e.g. the welcome-alt recap
// rehydrating itself after a page reload, where the in-memory Map is
// empty). Replaces any existing draft for the session wholesale.
export function restoreDraft(sessionId, draft) {
  if (!draft) return null;
  drafts.set(sessionId, draft);
  notify(sessionId);
  return draft;
}

// True once the website analysis has populated the draft. The welcome-alt
// recap screen polls this to decide between "Analyzing…" and "Show
// the Playbook".
export function isAnalysisReady(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return false;
  return Boolean(d.businessSummary || (d.tones && d.tones.length));
}

// First Time User ALT — a 3-question onboarding (URL → profiles →
// documents) rendered as inline-questions inside a chat with
// body.onboarding chrome. The website analysis kicks off in
// the background as soon as the URL lands, so by the time the user
// finishes the documents step the brief panel can open immediately.
//
// `prefilledUrl` represents an URL collected by an earlier step that
// lives outside the prototype — the chat surface uses it to pre-populate
// the URL question card so the user just confirms instead of typing.
export function startAlt(sessionId, { onComplete, prefilledUrl = "" } = {}) {
  const url = (prefilledUrl || "").trim();
  drafts.set(
    sessionId,
    emptyDraft({
      onComplete,
      sourceType: "website",
      websiteUrl: url,
      sourceUrl: url,
    }),
  );
  notify(sessionId);
  askAltUrl(sessionId, url);
}

// The onboarding steps, in order, as they exist under the current flags — the
// single place that knows which questions the flow asks. Two flags move it:
// `multilingualPlaybook` inserts a language step after the URL, and
// `skipConnectProfiles` does NOT remove the account step — it turns it into a
// choice. The step is still asked, but it is optional (a Skip), and when
// nothing is connected it offers to connect rather than listing profiles that
// don't exist. Skipping is not a dead end: the chat flows that draft FOR an
// account ask again at the moment it is needed (connect-profiles-flow.js).
// Labels are derived from this list, so adding or removing a step renumbers the
// rest for free.
function altSteps() {
  const steps = ["url"];
  if (isFlagOn("multilingualPlaybook")) steps.push("language");
  steps.push("profile", "documents", "images");
  return steps;
}
function altTotalSteps() {
  return altSteps().length;
}
function altStepLabel(stepId) {
  return `${altSteps().indexOf(stepId) + 1} / ${altTotalSteps()}`;
}
// Walk to the step before `stepId`, whichever ones are present under the flags.
function askAltPrevious(sessionId, stepId) {
  const steps = altSteps();
  const prev = steps[steps.indexOf(stepId) - 1];
  const d = drafts.get(sessionId);
  if (prev === "language") askAltLanguage(sessionId);
  else if (prev === "profile") askAltProfile(sessionId);
  else if (prev === "documents") askAltDocuments(sessionId);
  else askAltUrl(sessionId, d?.sourceUrl || d?.websiteUrl || "");
}
// The step after the URL question — the language picker when multilingual is
// on, otherwise the account step.
function askAltAfterUrl(sessionId) {
  if (isFlagOn("multilingualPlaybook")) askAltLanguage(sessionId);
  else askAltProfile(sessionId);
}

function askAltUrl(sessionId, prefilledUrl = "") {
  const intro = prefilledUrl
    ? "Here's the site I found — confirm it below to begin."
    : "Drop your website URL below to begin.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "What's your website URL?",
    stepLabel: altStepLabel("url"),
    items: [],
    customPlaceholder: "https://your-brand.com",
    customValue: prefilledUrl,
    onCustom: (value) => {
      const d = drafts.get(sessionId);
      if (!d) return;
      d.sourceUrl = (value || "").trim();
      d.websiteUrl = d.sourceUrl;
      postUserTurn(sessionId, d.sourceUrl);
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      // Kick off the website analysis in the background. It runs while
      // the user moves through questions 2 and 3 — by the time they
      // finish, the draft is hydrated and the brief panel can render
      // without an additional pending state.
      window.setTimeout(() => {
        const dd = drafts.get(sessionId);
        if (!dd) return;
        applyAnalysisToDraft(dd, analyzeWebsite(dd.sourceUrl || dd.websiteUrl));
        notify(sessionId);
      }, 6000);
      askAltAfterUrl(sessionId);
    },
  });
}

// Language step (multilingual flag ON only) — pick the ONE language this
// Playbook writes in. It becomes the Playbook's primary language, the default
// Archie drafts posts in; more languages can be added later in the editor.
// Voice examples are authored per language, never translated.
function askAltLanguage(sessionId) {
  postAssistantMessage(
    sessionId,
    "Which language should this Playbook write in? It's the language I'll draft your posts in — you can add more later in the Playbook.",
  );
  const d = drafts.get(sessionId);
  const current =
    d?.primaryLanguage || d?.language || (Array.isArray(d?.languages) && d.languages[0]) || DEFAULT_LANGUAGE;
  inlineQuestion.ask(sessionId, {
    title: "Choose your Playbook language",
    subtitle: "The language I'll write your posts in. You can add more later.",
    stepLabel: altStepLabel("language"),
    items: LANGUAGE_OPTIONS.map((l) => ({ value: l, label: l, icon: "ap-icon-web" })),
    selected: current,
    onPick: (lang) => {
      const chosen = lang || DEFAULT_LANGUAGE;
      const dd = drafts.get(sessionId);
      if (dd) {
        dd.languages = [chosen];
        dd.primaryLanguage = chosen;
        dd.language = chosen;
      }
      postUserTurn(sessionId, chosen);
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      askAltProfile(sessionId);
    },
    onBack: () => {
      const dd = drafts.get(sessionId);
      askAltUrl(sessionId, dd?.sourceUrl || dd?.websiteUrl || "");
    },
  });
}

// Record the account(s) this Playbook publishes as, echo them, and move on.
// The first one is the selected profile — connecting several is allowed, but a
// Playbook still names ONE identity.
function commitAltProfiles(sessionId, profiles) {
  const d = drafts.get(sessionId);
  if (!d || !profiles.length) return;
  d.selectedProfileId = profiles[0].id;
  d.connectedSocials = profiles.map((p) => p.platform);
  postUserProfilesTurn(sessionId, profiles);
}

// The account step. Under `skipConnectProfiles` it is a CHOICE rather than a
// gate: optional either way, and shaped by what the user actually has.
//   - nothing connected → offer to connect (the same rows and the same modal as
//     the in-chat step), or Skip;
//   - something connected → the normal profile pick, plus a Skip.
// Skipping leaves connectedSocials empty, which is a legitimate Playbook state:
// the chat flows ask for an account when they need one.
function askAltProfile(sessionId) {
  const optional = isFlagOn("skipConnectProfiles");
  const connectedProfiles = getConnectedProfiles();

  if (optional && connectedProfiles.length === 0) {
    postAssistantMessage(
      sessionId,
      "Connect the account you'll publish from and I'll tune tone and format for it. Skip it and I'll ask when I write your first draft.",
    );
    inlineQuestion.ask(sessionId, {
      title: "Connect an account (optional)",
      subtitle: "Nothing publishes yet — this only lets me write and schedule for it.",
      stepLabel: altStepLabel("profile"),
      // The same grid as the in-chat step, and as the product's own "Add new
      // social profiles" screen: pick a network, its dialog hands back the
      // account.
      variant: "cards",
      cardCols: 4,
      items: connectableNetworkCards(),
      skipLabel: "Skip",
      onPick: (platform) => {
        openConnectAccountModal({
          network: platform,
          preselected: accountIdsForNetwork(platform),
          onConfirm: (accounts) => {
            if (!accounts.length) return;
            commitAltProfiles(sessionId, accounts);
            inlineQuestion.exit(sessionId);
            notify(sessionId);
            askAltDocuments(sessionId);
          },
          // Backing out of the dialog puts the grid back, not a dead end.
          onDismiss: () => askAltProfile(sessionId),
        });
      },
      onSkip: () => {
        inlineQuestion.exit(sessionId);
        notify(sessionId);
        askAltDocuments(sessionId);
      },
      onBack: () => askAltPrevious(sessionId, "profile"),
    });
    return;
  }

  postAssistantMessage(sessionId, "Pick the profile to use for this Playbook. I'll tune tone and format for it.");
  // Connected profiles + their picker presentation come from the shared
  // social-profiles helper so this onboarding step and the in-session
  // draft profile picker stay identical.
  const items = buildConnectedProfileItems();
  inlineQuestion.ask(sessionId, {
    title: optional ? "Which profile will publish? (optional)" : "Which profile will publish?",
    stepLabel: altStepLabel("profile"),
    items,
    // With many connected profiles, filter the list live instead of scrolling.
    searchable: items.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search profiles by name, handle or network…",
    onPick: (id) => {
      const profile = connectedProfiles.find((p) => p.id === id);
      if (!drafts.get(sessionId)) return;
      if (profile) commitAltProfiles(sessionId, [profile]);
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      askAltDocuments(sessionId);
    },
    // Only skippable under the flag — without it the Playbook has always named
    // a profile, and making it optional here would change the flag-off flow.
    skipLabel: optional ? "Skip" : undefined,
    onSkip: optional
      ? () => {
          inlineQuestion.exit(sessionId);
          notify(sessionId);
          askAltDocuments(sessionId);
        }
      : undefined,
    // Back to the language picker (multilingual on) or the URL question — and
    // askAltPrevious re-renders question 1 with whatever URL the draft holds.
    onBack: () => askAltPrevious(sessionId, "profile"),
  });
}

function askAltDocuments(sessionId) {
  postAssistantMessage(
    sessionId,
    "Optional: connect documents that detail your Brand (brand book, brief, etc.). Or skip.",
  );
  // Onboarding keeps the choice tight — the four sources most people connect
  // first. The full catalogue lives on /connectors; the subtitle points there.
  const ONBOARDING_DOC_CONNECTORS = ["slite", "notion", "gdrive", "slack"];
  const items = ONBOARDING_DOC_CONNECTORS.map((id) => connectorMocks.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      value: c.id,
      label: c.name,
      caption: c.desc,
      imgSrc: c.logo,
    }));
  inlineQuestion.ask(sessionId, {
    title: "Connect documents (optional)",
    subtitle: "You can connect more sources later in Settings.",
    stepLabel: altStepLabel("documents"),
    items,
    multi: true,
    submitLabel: "Continue",
    skipLabel: "Skip",
    onPick: (ids) => {
      if (ids?.length) {
        const noun = ids.length === 1 ? "source" : "sources";
        postUserTurn(sessionId, `${ids.length} ${noun} connected`);
      }
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      askAltReferenceImages(sessionId);
    },
    onSkip: () => {
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      askAltReferenceImages(sessionId);
    },
    onBack: () => askAltPrevious(sessionId, "documents"),
  });
}

// Optional final step — upload reference images so generated visuals stay
// on-brand. Picking the one action opens a file dialog (data URLs → the draft's
// referenceImages, surfaced in the Playbook + the image generator); a cancelled
// dialog leaves the question open so the user can still Skip.
function askAltReferenceImages(sessionId) {
  postAssistantMessage(
    sessionId,
    "Last one, optional: add a few reference images so I keep generated visuals on-brand. Or skip.",
  );
  inlineQuestion.ask(sessionId, {
    title: "Add reference images (optional)",
    subtitle: "Logos, product shots, a brand board — I use them in the image generator.",
    stepLabel: altStepLabel("images"),
    items: [
      {
        value: "add",
        label: "Add reference images",
        caption: "Upload from your computer",
        icon: "ap-icon-multiple-images",
      },
    ],
    skipLabel: "Skip",
    onPick: () => openAltReferenceImagePicker(sessionId),
    onSkip: () => {
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      maybeOpenAltBrief(sessionId);
    },
    onBack: () => askAltDocuments(sessionId),
  });
}

// Throwaway multi-file picker → reads each image as a data URL (so it persists
// with the Playbook, unlike an ephemeral object URL) into the draft, then
// advances. Mirrors the Playbook Brand-section upload handler.
let altRefSeq = 0;
function openAltReferenceImagePicker(sessionId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) return; // cancelled — leave the question open to Skip
    let pending = files.length;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const d = drafts.get(sessionId);
        if (d) {
          if (!Array.isArray(d.referenceImages)) d.referenceImages = [];
          altRefSeq += 1;
          d.referenceImages.push({ id: `ref-${altRefSeq}`, label: file.name, url: reader.result });
        }
        pending -= 1;
        if (pending === 0) {
          const n = files.length;
          postUserTurn(sessionId, `${n} reference ${n === 1 ? "image" : "images"} added`);
          inlineQuestion.exit(sessionId);
          notify(sessionId);
          maybeOpenAltBrief(sessionId);
        }
      };
      reader.readAsDataURL(file);
    }
  });
  input.click();
}

// At the end of the ALT chat, navigate to the centered /welcome-alt/recap
// surface instead of opening the right-anchored brief panel. The brief
// panel is an editing surface; the end of a conversational flow deserves
// a dedicated result presentation (UI/UX review).
//
// Stashes the ALT sessionId in sessionStorage so the recap screen can
// re-attach to the same draft after navigation.
function maybeOpenAltBrief(sessionId) {
  // Navigate straight to the recap — it owns the branded loading
  // sequence (centered Archie loader + staged "here's what we're doing"
  // copy) and waits for the analysis to land before revealing the
  // Playbook. No in-chat "Reading your site" notice: the loading moment
  // belongs on the recap surface, not as a stray chat pill.
  try {
    window.sessionStorage.setItem("welcomeAltSessionId", sessionId);
  } catch {
    /* ignore */
  }
  // Use the hash router — context-builder doesn't import navigate()
  // directly to avoid a cycle with the router module.
  window.location.hash = "#/welcome-alt/recap";
}

export function save(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return;
  const name = (d.name || "").trim();
  if (!name) return; // Save button is disabled in this state; defensive.
  const payload = {
    name,
    color: d.color,
    websiteUrl: d.websiteUrl,
    sourceType: d.sourceType || null,
    sourceUrl: d.sourceUrl || d.websiteUrl || "",
    sourceFile: d.sourceFile || null,
    sourcePlatform: d.sourcePlatform || null,
    connectedSocials: Array.isArray(d.connectedSocials) ? d.connectedSocials.slice() : [],
    selectedProfileId: d.selectedProfileId || null,
    businessSummary: d.businessSummary,
    briefSummary: d.businessSummary, // mirror to legacy field for backwards-read compat
    audience: d.audience,
    audienceProblems: d.audienceProblems,
    tones: d.tones,
    contentStyle: d.contentStyle,
    objective: d.objective,
    contentAction: d.contentAction,
    ctaLinks: d.ctaLinks.filter((l) => l.checked),
    cta: d.ctaLinks.find((l) => l.checked)?.url || "",
    voiceProfile: d.voiceProfile || null,
    imageVoice: d.imageVoice && Array.isArray(d.imageVoice.websites) ? d.imageVoice : { websites: [] },
    // New 3-section model fields (previously dropped on save).
    signatureHooks: Array.isArray(d.signatureHooks) ? d.signatureHooks.filter((s) => (s || "").trim()) : [],
    closingPatterns: Array.isArray(d.closingPatterns) ? d.closingPatterns.filter((s) => (s || "").trim()) : [],
    formattingStyle: d.formattingStyle || "",
    visualStyle: d.visualStyle || "",
    brandPersonality: d.brandPersonality || "",
    brandTypography: d.brandTypography ? { ...d.brandTypography } : null,
    brandColors: Array.isArray(d.brandColors) ? d.brandColors.map((c) => ({ ...c })) : [],
    brandLogos: Array.isArray(d.brandLogos) ? d.brandLogos.map((l) => ({ ...l })) : [],
    brandLogo: d.brandLogo || "",
    imageDefaults: { ...(d.imageDefaults || {}) },
    referenceImages: Array.isArray(d.referenceImages)
      ? d.referenceImages.map((i) => ({ ...i, networks: Array.isArray(i.networks) ? [...i.networks] : [] }))
      : [],
    // Competitors survive the save with their pending flag — an unaccepted
    // suggestion stays pending on the saved Playbook rather than being dropped
    // or silently adopted. The store deep-copies socials and stamps missing ids.
    competitors: Array.isArray(d.competitors)
      ? d.competitors.map((c) => ({ ...c, socials: Array.isArray(c.socials) ? c.socials.map((s) => ({ ...s })) : [] }))
      : [],
    dismissedCompetitors: Array.isArray(d.dismissedCompetitors) ? d.dismissedCompetitors.slice() : [],
    updatedAt: "just now",
  };

  // Multilingual model — context-builder edits a single (primary) language's
  // voice. Preserve any secondary-language voice already saved on the context
  // and write the edited hooks/closings into the primary entry. The store
  // re-derives the flat mirror (signatureHooks/closingPatterns/cta) from here.
  const primaryLanguage = d.primaryLanguage || d.language || DEFAULT_LANGUAGE;
  const existing = d.editingId ? getContextById(d.editingId) : null;
  // Merge the existing context's voice (preserve secondary languages on edit)
  // with the draft's own voiceByLanguage — the latter holds this session's
  // per-language edits (and the primary entry the recap seeded from analysis).
  const baseVbl = {
    ...(existing && existing.voiceByLanguage && typeof existing.voiceByLanguage === "object"
      ? cloneVoiceByLanguage(existing.voiceByLanguage)
      : {}),
    ...(d.voiceByLanguage && typeof d.voiceByLanguage === "object" ? cloneVoiceByLanguage(d.voiceByLanguage) : {}),
  };
  // Languages come from the draft first (the onboarding language step / edits),
  // then any already saved on the context, else just the primary. addContext /
  // updateContext normalize this and fill empty voice entries per language.
  const draftLangs = Array.isArray(d.languages) && d.languages.length ? d.languages.slice() : null;
  const languages =
    draftLangs ||
    (Array.isArray(existing?.languages) && existing.languages.length ? existing.languages.slice() : [primaryLanguage]);
  // Only seed the primary entry from the flat analysis fields when there's no
  // per-language entry at all — never overwrite an entry the user edited (which
  // would resurrect hooks they deleted).
  if (!baseVbl[primaryLanguage]) {
    baseVbl[primaryLanguage] = {
      signatureHooks: payload.signatureHooks.slice(),
      closingPatterns: payload.closingPatterns.slice(),
      cta: "",
      ctaLabels: {},
    };
  }
  // Drop empty lines from every language entry.
  Object.values(baseVbl).forEach((e) => {
    if (Array.isArray(e.signatureHooks)) e.signatureHooks = e.signatureHooks.filter((s) => (s || "").trim());
    if (Array.isArray(e.closingPatterns)) e.closingPatterns = e.closingPatterns.filter((s) => (s || "").trim());
  });
  payload.languages = languages.includes(primaryLanguage) ? languages : [primaryLanguage, ...languages];
  payload.primaryLanguage = primaryLanguage;
  payload.voiceByLanguage = baseVbl;

  const saved = d.editingId ? updateContext(d.editingId, payload) : addContext(payload);
  // A brand you just created is the brand you are in. Only on creation: editing
  // the fiche you are already scoped to must not re-point the app, and editing
  // another one from /contexts is not a request to switch.
  if (!d.editingId && isWorkspaceMode() && saved) setActivePlaybook(saved.id);
  const onComplete = d.onComplete;
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  rightPanel.closeContextBriefPanelSilently?.();
  if (onComplete) onComplete(saved);
  return saved;
}
