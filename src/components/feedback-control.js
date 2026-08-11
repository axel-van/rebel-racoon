// feedback-control — the shared "how's this?" control rendered on every
// Archie-generated element that takes feedback (drafts, images, clips).
//
// One control = two thumb buttons + a collapsible "what was off?" panel
// (reason chips + optional comment) revealed on a thumbs-down. All state
// lives in feedback-store.js, keyed by a `targetId` the caller mints
// (draft:<id> / image:<id>:<seed> / clip:<id>).
//
// Two render shapes share one click handler:
//   - renderFeedbackControl()  → strip variant: label + thumbs + panel in
//                                one block (drafts card footer, image modal).
//   - renderFeedbackThumbs() + renderFeedbackPanel()  → split, for the
//                                clip card where the thumbs sit in the
//                                existing footer row and the panel expands
//                                below it.
//
// onFeedbackClick(event) is the single delegated handler. Each host surface
// calls it first from its own delegation root and bails if it returns true.
// It mutates the store and updates the DOM in place (no full re-render) so
// list scroll position survives — same rationale as the clip/idea thumbs it
// replaces.

import { escapeAttr, escapeText } from "../utils.js?v=21";
import { showToast } from "./toast.js?v=21";
import { getFeedback, setVerdict, recordDetail } from "../feedback-store.js?v=2";

// "What was off?" reasons per element kind. value = stable key, label = UI.
const REASONS = {
  draft: [
    { value: "off-topic", label: "Off-topic" },
    { value: "wrong-tone", label: "Wrong tone" },
    { value: "inaccurate", label: "Inaccurate" },
    { value: "too-generic", label: "Too generic" },
    { value: "formatting", label: "Formatting" },
  ],
  image: [
    { value: "off-brand", label: "Off-brand" },
    { value: "wrong-style", label: "Wrong style" },
    { value: "low-quality", label: "Low quality" },
    { value: "mismatch", label: "Doesn't match the post" },
  ],
  clip: [
    { value: "wrong-moment", label: "Wrong moment" },
    { value: "bad-framing", label: "Bad framing" },
    { value: "low-quality", label: "Low quality" },
    { value: "off-topic", label: "Off-topic" },
  ],
};

const NOUN = { draft: "draft", image: "image", clip: "clip" };

// ── Render ──────────────────────────────────────────────────────────────

// The two thumb buttons. Reuses the DS .ap-icon-button chrome + the existing
// .rpanel-ideas__thumb active-colour flip; the active side also swaps to the
// filled icon so the state reads without relying on colour alone.
export function renderFeedbackThumbs(targetId, { kind } = {}) {
  const noun = NOUN[kind] || "result";
  const verdict = getFeedback(targetId)?.verdict || null;
  const tid = escapeAttr(targetId);
  const thumb = (side) => {
    const active = verdict === side;
    const base = side === "up" ? "ap-icon-thumb-up" : "ap-icon-thumb-down";
    const icon = active ? `${base}_fill` : base;
    const label = side === "up" ? `Mark this ${noun} as good` : `Mark this ${noun} as needing work`;
    return `
      <button
        type="button"
        class="ap-icon-button transparent sm rpanel-ideas__thumb fb__thumb${active ? " is-active" : ""}"
        data-fb-verdict="${side}"
        data-fb-for="${tid}"
        data-fb-kind="${escapeAttr(kind || "")}"
        aria-pressed="${active}"
        aria-label="${label}"
        title="${label}"
      >
        <i class="${icon}"></i>
      </button>`;
  };
  return `<div class="fb__thumbs">${thumb("up")}${thumb("down")}</div>`;
}

// The collapsible "what was off?" panel. Hidden unless the host opens it on a
// thumbs-down. Pre-checks any reasons / comment already on record so the
// panel restores its answered state if it's re-opened.
export function renderFeedbackPanel(targetId, { kind } = {}) {
  const reasons = REASONS[kind] || REASONS.draft;
  const rec = getFeedback(targetId);
  const open = rec?.verdict === "down" && (rec.reasons?.length || rec.comment);
  const picked = new Set(rec?.reasons || []);
  const tid = escapeAttr(targetId);
  const chips = reasons
    .map(
      (r) => `
      <button
        type="button"
        class="ap-filter-chip"
        data-fb-reason="${escapeAttr(r.value)}"
        aria-pressed="${picked.has(r.value)}"
      >${escapeText(r.label)}</button>`,
    )
    .join("");
  return `
    <div class="fb__panel" data-fb-panel="${tid}" ${open ? "" : "hidden"}>
      <p class="fb__panel-label">What was off?</p>
      <div class="fb__reasons">${chips}</div>
      <textarea
        class="fb__comment"
        data-fb-comment
        rows="2"
        placeholder="Anything else? (optional)"
      >${escapeText(rec?.comment || "")}</textarea>
      <div class="fb__panel-actions">
        <button type="button" class="ap-button primary blue fb__send" data-fb-send="${tid}">Send</button>
      </div>
    </div>`;
}

// Strip variant — label + thumbs + panel in one self-contained block. Used by
// the drafts card footer and the image-generation modal result state.
export function renderFeedbackControl(targetId, { kind, label = "How's this?" } = {}) {
  return `
    <div class="fb fb--strip" data-fb-target="${escapeAttr(targetId)}">
      <div class="fb__row">
        <span class="fb__label">${escapeText(label)}</span>
        ${renderFeedbackThumbs(targetId, { kind })}
      </div>
      ${renderFeedbackPanel(targetId, { kind })}
    </div>`;
}

// ── Delegated click handler ───────────────────────────────────────────────

// Returns true if it consumed the event. Hosts call:
//   if (onFeedbackClick(event)) return;
export function onFeedbackClick(event) {
  const thumb = event.target.closest("[data-fb-verdict]");
  if (thumb) {
    const targetId = thumb.dataset.fbFor;
    const kind = thumb.dataset.fbKind || "";
    const noun = NOUN[kind] || "result";
    const rec = setVerdict(targetId, thumb.dataset.fbVerdict, { kind });
    syncThumbs(targetId);
    const panel = findPanel(targetId);
    if (rec?.verdict === "down") {
      if (panel) {
        panel.hidden = false;
        panel.querySelector("[data-fb-reason]")?.focus();
      }
    } else {
      if (panel) panel.hidden = true;
      if (rec?.verdict === "up") showToast("Glad it landed — thanks!", { duration: 2600 });
    }
    return true;
  }

  const reason = event.target.closest("[data-fb-reason]");
  if (reason && reason.closest("[data-fb-panel]")) {
    const pressed = reason.getAttribute("aria-pressed") === "true";
    reason.setAttribute("aria-pressed", String(!pressed));
    return true;
  }

  const send = event.target.closest("[data-fb-send]");
  if (send) {
    const targetId = send.dataset.fbSend;
    const panel = findPanel(targetId);
    if (panel) {
      const reasons = [...panel.querySelectorAll('[data-fb-reason][aria-pressed="true"]')].map(
        (b) => b.dataset.fbReason,
      );
      const comment = panel.querySelector("[data-fb-comment]")?.value || "";
      recordDetail(targetId, { reasons, comment });
      panel.hidden = true;
    }
    showToast("Thanks — this helps me improve.", { duration: 2600 });
    return true;
  }

  return false;
}

// ── In-place DOM helpers ────────────────────────────────────────────────

// Re-sync every thumb button bound to this target (both the up and down
// button, wherever they live) to the store's current verdict.
function syncThumbs(targetId) {
  const verdict = getFeedback(targetId)?.verdict || null;
  for (const btn of document.querySelectorAll("[data-fb-verdict]")) {
    if (btn.dataset.fbFor !== targetId) continue;
    const side = btn.dataset.fbVerdict;
    const active = verdict === side;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    const i = btn.querySelector("i");
    if (i) {
      const base = side === "up" ? "ap-icon-thumb-up" : "ap-icon-thumb-down";
      i.className = active ? `${base}_fill` : base;
    }
  }
}

// targetIds contain ":" so we match by dataset value rather than build a
// CSS selector that would need escaping.
function findPanel(targetId) {
  for (const el of document.querySelectorAll("[data-fb-panel]")) {
    if (el.dataset.fbPanel === targetId) return el;
  }
  return null;
}
