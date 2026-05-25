// Transient conversational editor for an existing Playbook (Context).
// Launched from the pen icon on a `/contexts` card → confirmation modal →
// session.js mounts this flow on a `playbook-edit-{id}-{ts}` session.
//
// Hybrid UX:
//   1. Archie greeting + a 4-chip menu (Voice / Brief / Branding / CTAs).
//   2. Click a chip → mini-conversation that asks for the new value
//      (free-form text or pick from options).
//   3. The submitted value patches a per-session DRAFT (not the live
//      Context — saves are explicit).
//   4. Archie confirms the change inline and re-shows the chip menu so
//      the user can layer more refinements.
//   5. A "Save changes" button in the composer's sticky bar applies all
//      accumulated patches via `updateContext`. "Cancel" discards.
//
// The session id is unique + never registered in sessions-store, so the
// editor conversation never appears in the sidebar (transient).
//
// Conversational pattern: every step posts user + assistant turns into
// the session thread (see assistant.js postUserTurn / postAssistantMessage)
// so the picker reads as a real chat. Long-running analyses (website,
// document) flash a mermaid "Analyzing…" pill via postSystemNotice +
// markSystemNoticeReady, mirroring the context-builder creation flow.

import { getContextById, updateContext } from "./contexts-store.js?v=28";
import { postAssistantMessage, postUserTurn, postSystemNotice, markSystemNoticeReady } from "./assistant.js?v=35";
import * as inlineQuestion from "./inline-question.js?v=26";
import {
  openContextBriefPanel,
  refreshContextBriefPanel,
  closePanel as closeRightPanel,
} from "./components/right-panel.js?v=75";
import { open as openConfirmModal } from "./components/confirm-modal.js?v=20";
import { setHandoff } from "./handoff.js?v=20";
import { navigate } from "./router.js?v=30";
import { analyzeWebsite, analyzeDocument } from "./context-mock-analysis.js?v=21";

const drafts = new Map(); // sessionId → { contextId, draft, dirty, onComplete, onCancel }

// Mocked analysis delay — 1.2 s feels long enough that the mermaid pill
// registers but short enough that nobody has time to bail. Same convention
// as context-builder's website analysis (which uses 6 s for the full
// creation flow; the editor's incremental tweaks should feel snappier).
const ANALYSIS_DELAY_MS = 1200;

// ---------- Public API ----------

export function start(sessionId, contextId, { onComplete, onCancel, targetField } = {}) {
  const ctx = getContextById(contextId);
  if (!ctx) {
    onCancel?.();
    return;
  }
  drafts.set(sessionId, {
    contextId,
    draft: {},
    dirty: false,
    onComplete,
    onCancel,
  });

  // Open the brief panel on the right so the user sees the Playbook
  // they're editing as they go. `getCtx` returns the persisted Context
  // merged with the staged draft → the panel reflects in-progress
  // changes live (cf. patchDraft → refreshContextBriefPanel below).
  // `hideFooter` suppresses the panel's Close + Edit buttons since
  // the editor surfaces its own Cancel + Save changes in the picker.
  openContextBriefPanel({
    mode: "read",
    hideFooter: true,
    getCtx: () => mergedContext(sessionId),
  });

  // Targeted refine — entered from a section card's "Refine" button.
  // Skips the chip menu and jumps straight to the relevant sub-flow so
  // the user lands one click closer to the field they want to change.
  // The sub-flow's natural exit still routes back to the chip menu, so
  // the user can keep refining other sections from there.
  const targetedFlow = {
    voice: askVoice,
    brief: askBrief,
    branding: askBranding,
    cta: askCTA,
  }[targetField];
  if (targetedFlow) {
    postAssistantMessage(sessionId, `Let's refine **${ctx.name}** — ${TARGET_INTRO[targetField]}.`);
    targetedFlow(sessionId, ctx);
    return;
  }

  postAssistantMessage(sessionId, `Let's refine **${ctx.name}**. Pick what you'd like to change.`);
  showChipMenu(sessionId);
}

// Single entry point for "refine a specific section of an existing
// Playbook" — surfaces a lighter confirm modal than `launch()` (the user
// already opted in by clicking the card's Refine button), arms the same
// `pendingStartPlaybookEditor` handoff with an extra `targetField`, then
// navigates to a transient session. `session.js` picks up the targetField
// and forwards it to `start()`.
export function refineField(contextId, fieldKey, returnTo = "/contexts") {
  const ctx = getContextById(contextId);
  if (!ctx) return;
  const label = TARGET_LABEL[fieldKey] || "this section";
  openConfirmModal({
    title: `Refine ${label}?`,
    body: `Archie will open a focused chat to refine **${ctx.name}**'s ${label}. Your changes only land when you hit "Save changes".`,
    confirmLabel: "Refine with Archie",
    cancelLabel: "Cancel",
    onConfirm: () => {
      setHandoff("pendingStartPlaybookEditor", { contextId, returnTo, targetField: fieldKey });
      navigate(`/session/playbook-edit-${contextId}-${Date.now().toString(36)}`);
    },
  });
}

// Copy used in the start() intro message + the refineField confirm modal
// — kept short so the conversation feels snappy.
const TARGET_LABEL = {
  voice: "the voice",
  brief: "the brief",
  branding: "the branding",
  cta: "the CTAs",
};

const TARGET_INTRO = {
  voice: "let's adjust the voice",
  brief: "let's sharpen the brief",
  branding: "let's update the branding",
  cta: "let's revisit the CTAs",
};

// Single entry point for "launch the conversational editor" — surfaces
// the confirm modal first, then arms the handoff + mints a transient
// session id so `renderSession` mounts the editor on the next route
// change. Used by both the pen icon on the /contexts cards and the
// Edit button at the bottom of the read-mode brief panel.
export function launch(contextId, returnTo = "/contexts") {
  const ctx = getContextById(contextId);
  if (!ctx) return;
  openConfirmModal({
    title: "Launch Playbook editor?",
    body: `You'll open a chat to refine "${ctx.name}". Changes will only be saved when you click "Save changes" at the bottom.`,
    confirmLabel: "Open editor",
    cancelLabel: "Cancel",
    onConfirm: () => {
      setHandoff("pendingStartPlaybookEditor", { contextId, returnTo });
      navigate(`/session/playbook-edit-${contextId}-${Date.now().toString(36)}`);
    },
  });
}

export function isActive(sessionId) {
  return drafts.has(sessionId);
}

export function isDirty(sessionId) {
  return !!drafts.get(sessionId)?.dirty;
}

// Commit the accumulated draft to the contexts store. Returns the
// contextId so the caller (session.js Save handler) can toast/navigate.
export function save(sessionId) {
  const state = drafts.get(sessionId);
  if (!state) return null;
  if (state.dirty) {
    updateContext(state.contextId, state.draft);
  }
  const { onComplete, contextId } = state;
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  closeRightPanel();
  onComplete?.();
  return contextId;
}

// Drop the draft without saving. The caller can guard with isDirty()
// to surface a confirmation modal before discarding.
export function discard(sessionId) {
  const state = drafts.get(sessionId);
  if (!state) return;
  const onCancel = state.onCancel;
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  closeRightPanel();
  onCancel?.();
}

// Persisted Context merged with the staged draft — drives the right-
// panel's live preview as the user refines fields.
function mergedContext(sessionId) {
  const state = drafts.get(sessionId);
  const persisted = state ? getContextById(state.contextId) : null;
  if (!persisted) return null;
  return { ...persisted, ...(state.draft || {}) };
}

// ---------- Conversation flow ----------

// Cancel + Save changes buttons injected at the bottom of every picker
// card rendered by the editor (via the picker's footerSlot). Both
// right-aligned (the footer row uses `justify-content: flex-end` from
// the DS), Cancel sits to the immediate left of Save. Cancel uses the
// quiet `ghost grey` variant; Save is the primary orange.
const EDITOR_FOOTER_SLOT = `
  <button type="button" class="ap-button ghost grey" data-playbook-editor-cancel>
    <span>Cancel</span>
  </button>
  <button type="button" class="ap-button primary orange" data-playbook-editor-save>
    <span>Save changes</span>
  </button>
`;

// Labels for the chip menu — mapped twice (picker items + the user-turn
// echo posted on click) so a single source of truth keeps them in sync.
const CHIP_LABELS = {
  voice: "Adjust voice",
  brief: "Refine brief",
  branding: "Update branding",
  cta: "Change CTAs",
};

function showChipMenu(sessionId) {
  inlineQuestion.ask(sessionId, {
    title: "What would you like to refine?",
    stepLabel: "Editor",
    items: [
      { value: "voice", label: CHIP_LABELS.voice, icon: "ap-icon-sparkles" },
      { value: "brief", label: CHIP_LABELS.brief, icon: "ap-icon-file" },
      { value: "branding", label: CHIP_LABELS.branding, icon: "ap-icon-target" },
      { value: "cta", label: CHIP_LABELS.cta, icon: "ap-icon-link" },
    ],
    onPick: (value) => handleChipPick(sessionId, value),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function handleChipPick(sessionId, choice) {
  const state = drafts.get(sessionId);
  if (!state) return;
  const ctx = getContextById(state.contextId);
  if (!ctx) {
    discard(sessionId);
    return;
  }

  // Echo the click as a user-turn before branching so the conversation
  // shows what was picked.
  postUserTurn(sessionId, CHIP_LABELS[choice] || choice);

  switch (choice) {
    case "voice":
      askVoice(sessionId, ctx);
      break;
    case "brief":
      askBrief(sessionId, ctx);
      break;
    case "branding":
      askBranding(sessionId, ctx);
      break;
    case "cta":
      askCTA(sessionId, ctx);
      break;
    default:
      showChipMenu(sessionId);
  }
}

// Voice can be refined two ways: extracted from a document the user
// drops in (re-runs analyzeDocument, same as the creation wizard), or
// typed directly as a comma-separated tone list. The top-level chip
// shows a 2-option picker that branches to one or the other.
const VOICE_LABELS = {
  analyze: "Analyze a document",
  edit: "Edit tones directly",
};

function askVoice(sessionId, ctx) {
  postAssistantMessage(sessionId, "How would you like to update the voice?");
  inlineQuestion.ask(sessionId, {
    title: "Adjust voice",
    stepLabel: "Voice",
    items: [
      { value: "analyze", label: VOICE_LABELS.analyze, icon: "ap-icon-file" },
      { value: "edit", label: VOICE_LABELS.edit, icon: "ap-icon-pen" },
    ],
    onPick: (which) => {
      postUserTurn(sessionId, VOICE_LABELS[which] || which);
      if (which === "analyze") askVoiceDocument(sessionId, ctx);
      else if (which === "edit") askVoiceTones(sessionId, ctx);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askVoiceDocument(sessionId, ctx) {
  postAssistantMessage(
    sessionId,
    "Drop a brand or voice document — guidelines, a tone-of-voice doc, or past content. I'll extract the dominant tones and voice profile.",
  );
  inlineQuestion.ask(sessionId, {
    title: "Drop a brand or voice document",
    stepLabel: "Voice · Document",
    customFile: true,
    customFileAccept: ".pdf,.docx,.txt,.md",
    customFileLabel: "Drop a file here, or click to browse",
    customFileHint: "PDF · DOCX · TXT · MD",
    onFile: (file) => {
      const filename = file?.name || "your document";
      postUserTurn(sessionId, `Uploaded ${filename}`);
      runDocumentAnalysis(sessionId, file, filename);
    },
    onSkip: () => askVoice(sessionId, ctx),
    onBack: () => askVoice(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

// Mock pill for the document analysis — flips from "Analyzing your
// document — {filename}" to "Analyzed your document — {filename}" after
// the simulated delay. Same chrome as the creation flow's "Extracting
// guidelines" notice (mermaid variant).
function runDocumentAnalysis(sessionId, file, filename) {
  const noticeId = postSystemNotice(sessionId, {
    meta: "Analyzing your document",
    text: filename,
    variant: "mermaid",
  });
  window.setTimeout(() => {
    if (!drafts.has(sessionId)) return; // user bailed mid-analysis
    const result = analyzeDocument(file);
    const patch = {};
    if (Array.isArray(result?.tones)) patch.tones = result.tones;
    if (result?.suggestions?.voiceProfile) patch.voiceProfile = result.suggestions.voiceProfile;
    if (Object.keys(patch).length > 0) patchDraft(sessionId, patch);
    markSystemNoticeReady(sessionId, noticeId, {
      meta: "Analyzed your document",
      text: filename,
    });
    postAssistantMessage(
      sessionId,
      `Voice refreshed from **${filename}** — tones: ${(patch.tones || []).join(" + ") || "—"}.`,
    );
    showChipMenu(sessionId);
  }, ANALYSIS_DELAY_MS);
}

function askVoiceTones(sessionId, ctx) {
  const current = (currentValue(sessionId, "tones") ?? ctx.tones ?? []).join(", ");
  postAssistantMessage(
    sessionId,
    current ? `What tones should the voice carry? Current: **${current}**.` : "What tones should the voice carry?",
  );
  inlineQuestion.ask(sessionId, {
    title: "Edit tones",
    stepLabel: "Voice · Tones",
    customPlaceholder: "e.g. conversational, sharp, warm…",
    onCustom: (text) => {
      const tones = text
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      postUserTurn(sessionId, tones.join(", ") || text || "(empty)");
      patchDraft(sessionId, { tones });
      postAssistantMessage(sessionId, `Voice updated to **${tones.join(" + ") || "—"}**.`);
      showChipMenu(sessionId);
    },
    onSkip: () => askVoice(sessionId, ctx),
    onBack: () => askVoice(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askBrief(sessionId, ctx) {
  const current = currentValue(sessionId, "businessSummary") ?? ctx.businessSummary ?? ctx.briefSummary ?? "";
  postAssistantMessage(
    sessionId,
    current ? `What's the new brief? Current: ${truncate(current, 120)}` : "What's the new brief?",
  );
  inlineQuestion.ask(sessionId, {
    title: "Refine brief",
    stepLabel: "Brief",
    customPlaceholder: "Two or three sentences describing the playbook…",
    onCustom: (text) => {
      postUserTurn(sessionId, text || "(empty)");
      patchDraft(sessionId, { businessSummary: text });
      postAssistantMessage(sessionId, `Brief updated.`);
      showChipMenu(sessionId);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

// Branding is multi-faceted: the user can either pull a fresh visual
// identity from a website (mock analysis) or tweak individual fields
// (colors, fonts, the high-level Playbook accent). Top-level chip
// routes to a sub-picker that splits the two paths.
const BRANDING_LABELS = {
  analyze: "Analyze a new website",
  edit: "Edit colors and fonts directly",
  "playbook-color": "Change Playbook accent color",
};

function askBranding(sessionId, ctx) {
  postAssistantMessage(sessionId, "What would you like to update in the branding?");
  inlineQuestion.ask(sessionId, {
    title: "Update branding",
    stepLabel: "Branding",
    items: [
      { value: "analyze", label: BRANDING_LABELS.analyze, icon: "ap-icon-link" },
      { value: "edit", label: BRANDING_LABELS.edit, icon: "ap-icon-pen" },
      { value: "playbook-color", label: BRANDING_LABELS["playbook-color"], icon: "ap-icon-target" },
    ],
    onPick: (which) => {
      postUserTurn(sessionId, BRANDING_LABELS[which] || which);
      if (which === "analyze") askBrandingWebsite(sessionId, ctx);
      else if (which === "edit") askBrandingField(sessionId, ctx);
      else if (which === "playbook-color") askPlaybookColor(sessionId, ctx);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askBrandingWebsite(sessionId, ctx) {
  const merged = mergedImageVoice(sessionId, ctx);
  const currentUrl = merged?.websites?.[0]?.url || "";
  postAssistantMessage(
    sessionId,
    currentUrl ? `Which website should I analyze? Current: ${currentUrl}` : "Which website should I analyze?",
  );
  inlineQuestion.ask(sessionId, {
    title: "Analyze a website",
    stepLabel: "Branding · Website",
    customPlaceholder: "https://yourbrand.com",
    onCustom: (url) => {
      const trimmed = (url || "").trim();
      if (!trimmed) return;
      postUserTurn(sessionId, trimmed);
      runWebsiteAnalysis(sessionId, trimmed);
    },
    onSkip: () => askBranding(sessionId, ctx),
    onBack: () => askBranding(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

// Mock pill for the website analysis — same flip pattern as the document
// path (flips from "Analyzing the website — {url}" to "Analyzed the
// website — {url}" after the simulated delay).
function runWebsiteAnalysis(sessionId, url) {
  const noticeId = postSystemNotice(sessionId, {
    meta: "Analyzing the website",
    text: url,
    variant: "mermaid",
  });
  window.setTimeout(() => {
    if (!drafts.has(sessionId)) return;
    const result = analyzeWebsite(url);
    const imageVoice = result?.suggestions?.imageVoice;
    if (imageVoice) {
      patchDraft(sessionId, { imageVoice });
    }
    markSystemNoticeReady(sessionId, noticeId, {
      meta: "Analyzed the website",
      text: url,
    });
    postAssistantMessage(sessionId, `Brand visual identity refreshed from **${url}**.`);
    showChipMenu(sessionId);
  }, ANALYSIS_DELAY_MS);
}

const BRANDING_FIELD_LABELS = {
  "color-primary": "Primary color",
  "color-accent": "Accent color",
  "color-background": "Background color",
  "color-text": "Text color",
  "color-link": "Link color",
  "font-primary": "Primary font",
  "font-heading": "Heading font",
};

function askBrandingField(sessionId, ctx) {
  postAssistantMessage(sessionId, "Which field would you like to edit?");
  inlineQuestion.ask(sessionId, {
    title: "Edit branding field",
    stepLabel: "Branding · Fields",
    items: Object.entries(BRANDING_FIELD_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: value.startsWith("font-") ? "ap-icon-pen" : value === "color-link" ? "ap-icon-link" : "ap-icon-circle",
    })),
    onPick: (field) => {
      postUserTurn(sessionId, BRANDING_FIELD_LABELS[field] || field);
      askBrandingFieldValue(sessionId, ctx, field);
    },
    onBack: () => askBranding(sessionId, ctx),
    onSkip: () => askBranding(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askBrandingFieldValue(sessionId, ctx, field) {
  const merged = mergedImageVoice(sessionId, ctx);
  const site = merged?.websites?.[0] || {};
  const fieldMeta = {
    "color-primary": { label: "Primary color", current: site.colors?.primary, placeholder: "#1A1F36" },
    "color-accent": { label: "Accent color", current: site.colors?.accent, placeholder: "#FF6726" },
    "color-background": { label: "Background color", current: site.colors?.background, placeholder: "#FFFFFF" },
    "color-text": { label: "Text color", current: site.colors?.textPrimary, placeholder: "#1A1F36" },
    "color-link": { label: "Link color", current: site.colors?.link, placeholder: "#FF6726" },
    "font-primary": { label: "Primary font", current: site.typography?.primaryFont, placeholder: "Inter" },
    "font-heading": { label: "Heading font", current: site.typography?.headingFont, placeholder: "Inter" },
  }[field];
  if (!fieldMeta) {
    askBrandingField(sessionId, ctx);
    return;
  }
  postAssistantMessage(
    sessionId,
    fieldMeta.current
      ? `What's the new ${fieldMeta.label.toLowerCase()}? Current: **${fieldMeta.current}**.`
      : `What's the new ${fieldMeta.label.toLowerCase()}?`,
  );
  inlineQuestion.ask(sessionId, {
    title: `New ${fieldMeta.label.toLowerCase()}`,
    stepLabel: "Branding",
    customPlaceholder: fieldMeta.placeholder,
    onCustom: (text) => {
      const value = (text || "").trim();
      if (!value) return;
      postUserTurn(sessionId, value);
      const next = patchImageVoiceField(merged, field, value);
      patchDraft(sessionId, { imageVoice: next });
      postAssistantMessage(sessionId, `${fieldMeta.label} updated to **${value}**.`);
      askBrandingField(sessionId, ctx);
    },
    onBack: () => askBrandingField(sessionId, ctx),
    onSkip: () => askBrandingField(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

const COLOR_LABELS = {
  orange: "Orange",
  blue: "Blue",
  green: "Green",
  purple: "Purple",
  red: "Red",
};

function askPlaybookColor(sessionId, ctx) {
  const current = currentValue(sessionId, "color") ?? ctx.color ?? "orange";
  postAssistantMessage(
    sessionId,
    `Pick a Playbook accent color. Current: **${capitalize(current)}** · drives the card swatch in Playbooks.`,
  );
  inlineQuestion.ask(sessionId, {
    title: "Playbook accent color",
    stepLabel: "Branding · Accent",
    items: Object.entries(COLOR_LABELS).map(([value, label]) => ({ value, label })),
    onPick: (color) => {
      postUserTurn(sessionId, COLOR_LABELS[color] || color);
      patchDraft(sessionId, { color });
      postAssistantMessage(sessionId, `Playbook accent updated to **${capitalize(color)}**.`);
      showChipMenu(sessionId);
    },
    onBack: () => askBranding(sessionId, ctx),
    onSkip: () => askBranding(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

// Resolve the imageVoice the user is currently editing — the staged
// draft if present (after a partial branding edit), else the persisted
// Context's value.
function mergedImageVoice(sessionId, ctx) {
  const staged = currentValue(sessionId, "imageVoice");
  return staged ?? ctx?.imageVoice ?? { websites: [{}] };
}

// Apply a single-field patch on imageVoice immutably (shallow clones
// the websites array + the affected site's nested objects).
function patchImageVoiceField(imageVoice, field, value) {
  const websites = (imageVoice?.websites?.length ? imageVoice.websites : [{}]).map((s, i) =>
    i === 0
      ? {
          ...s,
          colors: { ...(s.colors || {}) },
          typography: { ...(s.typography || {}) },
        }
      : s,
  );
  const site = websites[0];
  switch (field) {
    case "color-primary":
      site.colors.primary = value;
      break;
    case "color-accent":
      site.colors.accent = value;
      break;
    case "color-background":
      site.colors.background = value;
      break;
    case "color-text":
      site.colors.textPrimary = value;
      break;
    case "color-link":
      site.colors.link = value;
      break;
    case "font-primary":
      site.typography.primaryFont = value;
      break;
    case "font-heading":
      site.typography.headingFont = value;
      break;
  }
  return { ...imageVoice, websites };
}

function askCTA(sessionId, ctx) {
  const current = currentValue(sessionId, "ctaLinks")?.[0]?.url ?? ctx.ctaLinks?.[0]?.url ?? "";
  postAssistantMessage(
    sessionId,
    current ? `What's the primary CTA URL? Current: ${current}` : "What's the primary CTA URL?",
  );
  inlineQuestion.ask(sessionId, {
    title: "Change CTAs",
    stepLabel: "CTAs",
    customPlaceholder: "https://…",
    onCustom: (text) => {
      const url = text.trim();
      postUserTurn(sessionId, url || "(empty)");
      patchDraft(sessionId, { ctaLinks: [{ label: "Primary CTA", url }] });
      postAssistantMessage(sessionId, `CTA updated to **${url}**.`);
      showChipMenu(sessionId);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

// ---------- Internals ----------

function patchDraft(sessionId, patch) {
  const state = drafts.get(sessionId);
  if (!state) return;
  Object.assign(state.draft, patch);
  state.dirty = true;
  // Push the change into the right-panel's live preview.
  refreshContextBriefPanel();
}

// Returns the staged draft value if the user has already patched the
// field in this session, otherwise undefined (caller falls back to the
// persisted Context value).
function currentValue(sessionId, key) {
  const draft = drafts.get(sessionId)?.draft;
  if (!draft) return undefined;
  return Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : undefined;
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function capitalize(s) {
  return (
    String(s || "")
      .charAt(0)
      .toUpperCase() + String(s || "").slice(1)
  );
}
