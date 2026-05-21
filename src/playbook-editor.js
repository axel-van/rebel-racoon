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
} from "./components/right-panel.js?v=57";

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
  openContextBriefPanel({
    mode: "read",
    getCtx: () => mergedContext(sessionId),
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

function askVoice(sessionId, ctx) {
  const current = (currentValue(sessionId, "tones") ?? ctx.tones ?? []).join(", ");
  inlineQuestion.ask(sessionId, {
    title: "What tone should the voice carry?",
    stepLabel: "Voice",
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
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
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

function askBranding(sessionId, ctx) {
  const current = currentValue(sessionId, "color") ?? ctx.color ?? "orange";
  inlineQuestion.ask(sessionId, {
    title: "Pick a brand color",
    stepLabel: "Branding",
    intro: `Current: **${capitalize(current)}**`,
    items: [
      { value: "orange", label: "Orange" },
      { value: "blue", label: "Blue" },
      { value: "green", label: "Green" },
      { value: "purple", label: "Purple" },
      { value: "red", label: "Red" },
    ],
    onPick: (color) => {
      patchDraft(sessionId, { color });
      postAssistantMessage(sessionId, `Brand color updated to **${capitalize(color)}**.`);
      showChipMenu(sessionId);
    },
    onSkip: () => showChipMenu(sessionId),
    onBack: () => showChipMenu(sessionId),
    footerSlot: EDITOR_FOOTER_SLOT,
  });
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
