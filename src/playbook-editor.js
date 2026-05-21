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

import { getContextById, updateContext } from "./contexts-store.js?v=26";
import { postAssistantMessage } from "./assistant.js?v=31";
import * as inlineQuestion from "./inline-question.js?v=25";
import {
  openContextBriefPanel,
  refreshContextBriefPanel,
  closePanel as closeRightPanel,
} from "./components/right-panel.js?v=58";
import { open as openConfirmModal } from "./components/confirm-modal.js?v=20";
import { setHandoff } from "./handoff.js?v=20";
import { navigate } from "./router.js?v=21";
import { analyzeWebsite, analyzeDocument } from "./context-mock-analysis.js?v=21";

const drafts = new Map(); // sessionId → { contextId, draft, dirty, onComplete, onCancel }

// ---------- Public API ----------

export function start(sessionId, contextId, { onComplete, onCancel } = {}) {
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

  postAssistantMessage(sessionId, `Let's refine **${ctx.name}**. Pick what you'd like to change.`);
  showChipMenu(sessionId);

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
}

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

export function getContextId(sessionId) {
  return drafts.get(sessionId)?.contextId || null;
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

function showChipMenu(sessionId) {
  inlineQuestion.ask(sessionId, {
    title: "What would you like to refine?",
    stepLabel: "Editor",
    items: [
      { value: "voice", label: "Adjust voice", icon: "ap-icon-sparkles" },
      { value: "brief", label: "Refine brief", icon: "ap-icon-file" },
      { value: "branding", label: "Update branding", icon: "ap-icon-target" },
      { value: "cta", label: "Change CTAs", icon: "ap-icon-link" },
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
function askVoice(sessionId, ctx) {
  inlineQuestion.ask(sessionId, {
    title: "Adjust voice — how would you like to update it?",
    stepLabel: "Voice",
    items: [
      { value: "analyze", label: "Analyze a document", icon: "ap-icon-file" },
      { value: "edit", label: "Edit tones directly", icon: "ap-icon-pen" },
    ],
    onPick: (which) => {
      if (which === "analyze") askVoiceDocument(sessionId, ctx);
      else if (which === "edit") askVoiceTones(sessionId, ctx);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askVoiceDocument(sessionId, ctx) {
  inlineQuestion.ask(sessionId, {
    title: "Drop a brand or voice document",
    stepLabel: "Voice · Document",
    intro:
      "Brand guidelines, a tone-of-voice doc, or any past content — Archie will extract the dominant tones and voice profile.",
    customFile: true,
    customFileAccept: ".pdf,.docx,.txt,.md",
    customFileLabel: "Drop a file here, or click to browse",
    customFileHint: "PDF · DOCX · TXT · MD",
    onFile: (file) => {
      const result = analyzeDocument(file);
      const patch = {};
      if (Array.isArray(result?.tones)) patch.tones = result.tones;
      if (result?.suggestions?.voiceProfile) patch.voiceProfile = result.suggestions.voiceProfile;
      if (Object.keys(patch).length > 0) patchDraft(sessionId, patch);
      const filename = file?.name || "your document";
      postAssistantMessage(
        sessionId,
        `Voice refreshed from **${filename}** — tones: ${(patch.tones || []).join(" + ") || "—"}.`,
      );
      showChipMenu(sessionId);
    },
    onSkip: () => askVoice(sessionId, ctx),
    onBack: () => askVoice(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askVoiceTones(sessionId, ctx) {
  const current = (currentValue(sessionId, "tones") ?? ctx.tones ?? []).join(", ");
  inlineQuestion.ask(sessionId, {
    title: "What tones should the voice carry?",
    stepLabel: "Voice · Tones",
    intro: current ? `Current: **${current}**` : "",
    customPlaceholder: "e.g. conversational, sharp, warm…",
    onCustom: (text) => {
      const tones = text
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
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
  inlineQuestion.ask(sessionId, {
    title: "What's the new brief?",
    stepLabel: "Brief",
    intro: current ? `Current: ${truncate(current, 120)}` : "",
    customPlaceholder: "Two or three sentences describing the playbook…",
    onCustom: (text) => {
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
function askBranding(sessionId, ctx) {
  inlineQuestion.ask(sessionId, {
    title: "Update branding — what would you like to do?",
    stepLabel: "Branding",
    items: [
      { value: "analyze", label: "Analyze a new website", icon: "ap-icon-link" },
      { value: "edit", label: "Edit colors and fonts directly", icon: "ap-icon-pen" },
      { value: "playbook-color", label: "Change Playbook accent color", icon: "ap-icon-target" },
    ],
    onPick: (which) => {
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
  inlineQuestion.ask(sessionId, {
    title: "Which website should I analyze?",
    stepLabel: "Branding · Website",
    intro: currentUrl ? `Current: ${currentUrl}` : "",
    customPlaceholder: "https://yourbrand.com",
    onCustom: (url) => {
      const trimmed = (url || "").trim();
      if (!trimmed) return;
      const result = analyzeWebsite(trimmed);
      const imageVoice = result?.suggestions?.imageVoice;
      if (imageVoice) {
        patchDraft(sessionId, { imageVoice });
      }
      postAssistantMessage(sessionId, `Brand visual identity refreshed from **${trimmed}**.`);
      showChipMenu(sessionId);
    },
    onSkip: () => askBranding(sessionId, ctx),
    onBack: () => askBranding(sessionId, ctx),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
}

function askBrandingField(sessionId, ctx) {
  inlineQuestion.ask(sessionId, {
    title: "What would you like to edit?",
    stepLabel: "Branding · Fields",
    items: [
      { value: "color-primary", label: "Primary color", icon: "ap-icon-circle" },
      { value: "color-accent", label: "Accent color", icon: "ap-icon-circle" },
      { value: "color-background", label: "Background color", icon: "ap-icon-circle" },
      { value: "color-text", label: "Text color", icon: "ap-icon-circle" },
      { value: "color-link", label: "Link color", icon: "ap-icon-link" },
      { value: "font-primary", label: "Primary font", icon: "ap-icon-pen" },
      { value: "font-heading", label: "Heading font", icon: "ap-icon-pen" },
    ],
    onPick: (field) => askBrandingFieldValue(sessionId, ctx, field),
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
  inlineQuestion.ask(sessionId, {
    title: `New ${fieldMeta.label.toLowerCase()}`,
    stepLabel: "Branding",
    intro: fieldMeta.current ? `Current: **${fieldMeta.current}**` : "",
    customPlaceholder: fieldMeta.placeholder,
    onCustom: (text) => {
      const value = (text || "").trim();
      if (!value) return;
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

function askPlaybookColor(sessionId, ctx) {
  const current = currentValue(sessionId, "color") ?? ctx.color ?? "orange";
  inlineQuestion.ask(sessionId, {
    title: "Pick a Playbook accent color",
    stepLabel: "Branding · Accent",
    intro: `Current: **${capitalize(current)}** · drives the card swatch in the Playbooks library.`,
    items: [
      { value: "orange", label: "Orange" },
      { value: "blue", label: "Blue" },
      { value: "green", label: "Green" },
      { value: "purple", label: "Purple" },
      { value: "red", label: "Red" },
    ],
    onPick: (color) => {
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
  inlineQuestion.ask(sessionId, {
    title: "What's the primary CTA URL?",
    stepLabel: "CTAs",
    intro: current ? `Current: ${current}` : "",
    customPlaceholder: "https://…",
    onCustom: (text) => {
      const url = text.trim();
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
