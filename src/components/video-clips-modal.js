// Video Clips modal — AI-suggested clips for a video source.
//
// Ported from the standalone React handoff at
// /Users/matthieu.bousendorfer/sources/video-clips-handoff to vanilla JS,
// matching the archie modal pattern (init / open / close + module-level state,
// event delegation, no framework).
//
// Public API:
//   init()                         — call once at app bootstrap; injects DOM
//   open(source, { onUseClips,     — show the modal for a video source
//                  onSaveClips })  — onSaveClips fires on every edit (sourceId, clips)
//                                  — onUseClips fires on "Draft posts from N clips"
//                                    (selectedClips, source) → host wires drafts
//   close()                        — hide, reset ephemeral state
//
// The modal has three states:
//   - Browse: 2-col grid of clip cards. Toggle selection, edit, add manually.
//   - Edit  : sticky cinematic editor pane (preview + form + pro trim) above
//             the grid, source card dimmed.
//   - Add   : a new 30s clip is inserted in the next gap and opened in edit.

import { escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";

const MODAL_ID = "videoClips";
const MIN_CLIP = 5;
const MAX_CLIP = 300;

// Network metadata for the editor pane's pill picker + the head badges.
// Network ids match what posts-store expects (it maps "x" → "twitter" itself).
const NETWORKS = [
  { id: "facebook", label: "Facebook", logo: "facebook-official.svg" },
  { id: "instagram", label: "Instagram", logo: "instagram-official.svg" },
  { id: "linkedin", label: "LinkedIn", logo: "linkedin-official.svg" },
  { id: "x", label: "X", logo: "x-official.svg" },
  { id: "tiktok", label: "TikTok", logo: "tiktok-official.svg" },
];

const NETWORK_BY_ID = NETWORKS.reduce((acc, n) => {
  acc[n.id] = n;
  return acc;
}, {});

// ── Module state ─────────────────────────────────────────────────────

let backdrop;
let modal;
let bodyEl;
let timelineEl;
let footEl;
let toolbarEl;
let initialized = false;

let currentSource = null;
let clips = []; // [{ id, start, end, title, summary, why, network, tags, hue }, …]
let selected = new Set(); // clip ids
let editingId = null; // clip id currently in edit mode, or null
let regenerating = false;

// When the modal is opened with a specific `editingClipId`, we run in
// single-clip mode: the body shows only that clip's editor pane (no
// browse list, no timeline, no toolbar, no bulk-action footer), and
// the modal closes automatically after Save / Cancel / Delete. Set in
// `open()` from `callbacks.editingClipId`, cleared in `close()`.
let singleClipMode = false;

// Edit-mode draft (live values while the user is editing — committed on Save).
let draft = null;
let draftPlayhead = 0;

// Drag state for the pro trimmer (null when not dragging).
let dragState = null;

// Host callbacks (set by open()).
let onUseCallback = null;
let onSaveCallback = null;

// ── Time helpers ─────────────────────────────────────────────────────

function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const rest = (s % 60).toString().padStart(2, "0");
  return `${m}:${rest}`;
}

function parseTime(str) {
  if (!str) return null;
  const m = String(str)
    .trim()
    .match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (secs >= 60) return null;
  return mins * 60 + secs;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortName(name) {
  if (!name) return "video";
  return name.length > 40 ? name.slice(0, 37) + "…" : name;
}

// ── HTML shell (injected once) ───────────────────────────────────────

const SHELL_HTML = `
<div class="app-modal-backdrop" id="videoClipsBackdrop" hidden></div>
<aside class="ap-dialog video-clips-modal" id="videoClipsModal" role="dialog" aria-modal="true"
       aria-labelledby="videoClipsTitle" aria-hidden="true">
  <div class="ap-dialog-header video-clips-modal__head">
    <div class="video-clips-modal__head-icon" id="videoClipsKind">MP4</div>
    <div class="video-clips-modal__head-info">
      <span class="ap-dialog-title" id="videoClipsTitle">Suggested clips</span>
      <span class="ap-dialog-subtitle" id="videoClipsSub"></span>
    </div>
  </div>

  <div class="video-clips-modal__timeline" id="videoClipsTimeline">
    <div class="vc-timeline">
      <div class="vc-timeline__bar" id="videoClipsTimelineBar"></div>
      <div class="vc-timeline__ticks" id="videoClipsTimelineTicks"></div>
    </div>
  </div>

  <div class="video-clips-modal__toolbar" id="videoClipsToolbar"></div>

  <div class="ap-dialog-content video-clips-modal__body" id="videoClipsBody"></div>

  <div class="ap-dialog-footer video-clips-modal__foot" id="videoClipsFoot"></div>

  <button type="button" class="ap-dialog-close" id="videoClipsClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
</aside>`;

// ── Faux thumbnail backgrounds ───────────────────────────────────────

function thumbBackground(hue) {
  const h = hue ?? 24;
  const bg = `linear-gradient(135deg, oklch(0.32 0.08 ${h}) 0%, oklch(0.18 0.05 ${h}) 100%)`;
  const blob1 = `radial-gradient(circle at 28% 38%, oklch(0.72 0.18 ${h}) 0%, transparent 42%)`;
  const blob2 = `radial-gradient(circle at 78% 72%, oklch(0.55 0.14 ${(h + 40) % 360}) 0%, transparent 38%)`;
  return `${blob1}, ${blob2}, ${bg}`;
}

function previewBackground(hue) {
  const h = hue ?? 24;
  const bg = `linear-gradient(135deg, oklch(0.28 0.08 ${h}) 0%, oklch(0.14 0.05 ${h}) 100%)`;
  const b1 = `radial-gradient(circle at 30% 35%, oklch(0.74 0.20 ${h}) 0%, transparent 48%)`;
  const b2 = `radial-gradient(circle at 75% 70%, oklch(0.55 0.16 ${(h + 50) % 360}) 0%, transparent 44%)`;
  const b3 = `radial-gradient(circle at 50% 88%, oklch(0.42 0.12 ${(h + 25) % 360}) 0%, transparent 36%)`;
  return `${b1}, ${b2}, ${b3}, ${bg}`;
}

// ── Render: strip timeline ───────────────────────────────────────────

function renderTimeline() {
  const duration = currentSource?.durationSec || 1;
  const barHTML = clips
    .map((c) => {
      const left = (c.start / duration) * 100;
      const width = ((c.end - c.start) / duration) * 100;
      const on = selected.has(c.id);
      const editing = c.id === editingId;
      const cls = "vc-timeline__seg" + (on ? " is-on" : "") + (editing ? " is-editing" : "");
      const title = `${fmtTime(c.start)}–${fmtTime(c.end)} · ${c.title || "Untitled clip"}`;
      return `<div class="${cls}" style="left: ${left}%; width: ${Math.max(width, 1.5)}%" title="${escapeHtml(title)}"></div>`;
    })
    .join("");

  const bar = document.getElementById("videoClipsTimelineBar");
  if (bar) bar.innerHTML = barHTML;

  const ticksEl = document.getElementById("videoClipsTimelineTicks");
  if (ticksEl) {
    ticksEl.innerHTML = `
      <span>0:00</span>
      <span>${fmtTime(duration / 4)}</span>
      <span>${fmtTime(duration / 2)}</span>
      <span>${fmtTime((3 * duration) / 4)}</span>
      <span>${fmtTime(duration)}</span>
    `;
  }
}

// ── Render: toolbar ──────────────────────────────────────────────────

function renderToolbar() {
  if (!toolbarEl) return;
  toolbarEl.innerHTML = `
    <div class="video-clips-modal__bulk">
      <button class="vc-link" data-vc-action="select-all" ${selected.size === clips.length ? "disabled" : ""}>Select all</button>
      <span class="video-clips-modal__sep"></span>
      <button class="vc-link" data-vc-action="clear" ${selected.size === 0 ? "disabled" : ""}>Clear</button>
    </div>
    <div class="video-clips-modal__toolbar-actions">
      <button class="ap-button stroked grey" data-vc-action="add-clip">
        <i class="ap-icon-plus"></i>
        <span>Add clip</span>
      </button>
      <button class="ap-button stroked grey video-clips-modal__regen${regenerating ? " is-loading" : ""}" data-vc-action="regen" ${regenerating ? "disabled" : ""}>
        <i class="ap-icon-refresh"></i>
        <span>${regenerating ? "Suggesting more…" : "Suggest more"}</span>
      </button>
    </div>
  `;
}

// ── Render: footer ───────────────────────────────────────────────────

function renderFooter() {
  if (!footEl) return;
  const total = clips.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + (c.end - c.start), 0);
  const n = selected.size;
  const ctaLabel = n === 1 ? "Draft post from 1 clip" : `Draft posts from ${n} clips`;
  footEl.innerHTML = `
    <div class="ap-dialog-footer-left">
      <div class="video-clips-modal__foot-stats">
        <strong>${n}</strong> clip${n === 1 ? "" : "s"} selected${n > 0 ? `<span class="video-clips-modal__foot-meta"> · ${fmtTime(total)} of video</span>` : ""}
      </div>
    </div>
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" data-vc-action="cancel">Cancel</button>
      <button type="button" class="ap-button primary orange" data-vc-action="use-clips" ${n === 0 || editingId ? "disabled" : ""} title="${editingId ? "Finish editing the clip first" : ""}">
        <i class="ap-icon-sparkles"></i>
        <span>${ctaLabel}</span>
      </button>
    </div>
  `;
}

// Single-clip mode footer — Delete on the left, Cancel + Save on the
// right. Same data-vc-action hooks the editor header used to expose,
// so existing handlers keep working unchanged.
function renderFooterEdit() {
  if (!footEl) return;
  footEl.innerHTML = `
    <div class="ap-dialog-footer-left">
      <button type="button" class="ap-button ghost red" data-vc-action="delete-clip" title="Delete this clip">
        <i class="ap-icon-trash"></i>
        <span>Delete</span>
      </button>
    </div>
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" data-vc-action="cancel-edit">Cancel</button>
      <button type="button" class="ap-button primary orange" data-vc-action="save-edit">
        <i class="ap-icon-check"></i>
        <span>Save changes</span>
      </button>
    </div>
  `;
}

// ── Render: a single browse-mode clip card ───────────────────────────

function clipCardHTML(clip) {
  const isSelected = selected.has(clip.id);
  const isEditingThis = editingId === clip.id;
  const cls = "vc-row" + (isSelected ? " is-on" : "") + (isEditingThis ? " is-editing" : "");
  const tags = (clip.tags || []).map((t) => `<span class="vc-row__tag">#${escapeHtml(t)}</span>`).join("");
  return `
    <div class="${cls}" data-vc-clip="${clip.id}">
      <label class="vc-row__check-wrap">
        <input type="checkbox" class="vc-row__check" ${isSelected ? "checked" : ""} data-vc-action="toggle" data-vc-clip="${clip.id}" />
        <span class="vc-row__check-box" aria-hidden="true">
          <i class="ap-icon-check"></i>
        </span>
      </label>
      <div class="vc-thumb" style="background-image: ${thumbBackground(clip.hue)}">
        <div class="vc-thumb__play"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></div>
        <div class="vc-thumb__time">${fmtTime(clip.end - clip.start)}</div>
      </div>
      <div class="vc-row__body">
        <div class="vc-row__head">
          <div class="vc-row__head-text">
            <span class="vc-row__time">${fmtTime(clip.start)} – ${fmtTime(clip.end)}</span>
            <span class="vc-row__title">${escapeHtml(clip.title || "Untitled clip")}</span>
          </div>
          <button class="ap-button stroked grey vc-row__edit-btn" data-vc-action="edit" data-vc-clip="${clip.id}" title="Edit clip">
            <i class="ap-icon-pen"></i>
            <span>Edit</span>
          </button>
        </div>
        <div class="vc-row__summary">${escapeHtml(clip.summary || "")}</div>
        <div class="vc-row__why">
          <i class="ap-icon-sparkles"></i>
          <span>${escapeHtml(clip.why || "")}</span>
        </div>
        <div class="vc-row__tags">${tags}</div>
      </div>
    </div>
  `;
}

// ── Render: editor pane (full surface, replaces the card while editing) ─

function editorPaneHTML() {
  if (!draft) return "";
  const duration = currentSource?.durationSec || 1;

  // Pro-trim thumbnails (24 hue-shifted gradient blobs).
  const baseHue = draft.hue ?? 24;
  let thumbs = "";
  for (let i = 0; i < 24; i += 1) {
    const h = (baseHue + i * 17) % 360;
    const seed = (i * 53) % 100;
    const bg = `linear-gradient(${135 + ((i * 23) % 90)}deg, oklch(0.42 0.12 ${h}) 0%, oklch(0.22 0.07 ${h}) 100%)`;
    const blob = `radial-gradient(circle at ${seed}% ${(seed * 1.7) % 100}%, oklch(0.7 0.18 ${h}) 0%, transparent 55%)`;
    thumbs += `<span class="vc-protrim__thumb" style="background-image: ${blob}, ${bg}"></span>`;
  }

  // Ruler ticks (4–12 evenly spaced).
  const tickCount = Math.min(12, Math.max(4, Math.round(duration / 120)));
  let ticks = "";
  for (let i = 0; i <= tickCount; i += 1) {
    const t = (i / tickCount) * duration;
    const pct = (i / tickCount) * 100;
    ticks += `
      <span class="vc-protrim__ruler-tick" style="left: ${pct}%">
        <span class="vc-protrim__ruler-mark"></span>
        <span class="vc-protrim__ruler-label">${fmtTime(t)}</span>
      </span>
    `;
  }

  const leftPct = (draft.start / duration) * 100;
  const widthPct = ((draft.end - draft.start) / duration) * 100;
  const playheadPct = (draftPlayhead / duration) * 100;

  const netPills = NETWORKS.map(
    (n) => `
    <button type="button" class="vc-editor__net${n.id === draft.network ? " is-on" : ""}" data-vc-action="set-network" data-vc-network="${n.id}" title="${escapeHtml(n.label)}">
      <img src="assets/video-clips/icons/${n.logo}" alt="" loading="lazy" />
      <span>${escapeHtml(n.label)}</span>
    </button>
  `,
  ).join("");

  // Edit-mode CTAs (Delete / Cancel / Save changes) live in the editor
  // header in multi-clip mode (the modal footer is taken by the bulk
  // "Draft posts from N clips" CTA). In single-clip mode the bulk
  // footer is empty, so the CTAs render there instead — see
  // renderFooter. Skip them here in that case to avoid duplication.
  const headerCtas = singleClipMode
    ? ""
    : `
        <button type="button" class="ap-button ghost red" data-vc-action="delete-clip" title="Delete this clip">
          <i class="ap-icon-trash"></i><span>Delete</span>
        </button>
        <button type="button" class="ap-button ghost grey" data-vc-action="cancel-edit">Cancel</button>
        <button type="button" class="ap-button primary orange" data-vc-action="save-edit">
          <i class="ap-icon-check"></i><span>Save changes</span>
        </button>
      `;

  return `
    <div class="vc-editor" data-vc-editor data-vc-clip="${draft.id}">
      <header class="vc-editor__head">
        <div class="vc-editor__head-eyebrow"><span class="vc-editor__head-dot"></span>Editing clip</div>
        <div class="vc-editor__head-time" data-vc-editor-time>
          <span data-vc-editor-time-start>${fmtTime(draft.start)}</span>
          <span>→</span>
          <span data-vc-editor-time-end>${fmtTime(draft.end)}</span>
          <span class="vc-editor__head-dur" data-vc-editor-time-dur>${fmtTime(draft.end - draft.start)}</span>
        </div>
        <span class="vc-editor__head-spacer"></span>
        ${headerCtas}
      </header>

      <div class="vc-editor__top">
        <div class="vc-editor__preview-col">
          <div class="vc-preview" style="background-image: ${previewBackground(draft.hue)}">
            <div class="vc-preview__grain"></div>
            <div class="vc-preview__hud-tl">REC · 4K · 30P</div>
            <div class="vc-preview__hud-tr" data-vc-editor-playtime>${fmtTime(draftPlayhead)}</div>
            <div class="vc-preview__center">
              <div class="vc-preview__play"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></div>
            </div>
            <div class="vc-preview__hud-bl" data-vc-editor-clipdur>${fmtTime(draft.end - draft.start)} · CLIP</div>
            <div class="vc-preview__hud-br">${escapeHtml((draft.network || "").toUpperCase())}</div>
            <div class="vc-preview__bars" aria-hidden="true">
              <span style="height: 32%"></span><span style="height: 64%"></span>
              <span style="height: 46%"></span><span style="height: 78%"></span>
              <span style="height: 54%"></span><span style="height: 38%"></span>
              <span style="height: 70%"></span><span style="height: 48%"></span>
            </div>
          </div>
          <div class="vc-editor__transport">
            <button class="vc-editor__transport-btn" data-vc-action="seek-start" title="Jump to clip start">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" fill="currentColor"/></svg>
            </button>
            <button class="vc-editor__transport-btn vc-editor__transport-btn--play" title="Play preview">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </button>
            <button class="vc-editor__transport-btn" data-vc-action="seek-end" title="Jump to clip end">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 6h2v12h-2V6zm-2.5 6L5 6v12l8.5-6z" fill="currentColor"/></svg>
            </button>
            <span class="vc-editor__transport-time">
              <span data-vc-editor-transport-time>${fmtTime(draftPlayhead)}</span>
              <span class="vc-editor__transport-dur"> / ${fmtTime(duration)}</span>
            </span>
            <span class="vc-editor__transport-set">
              <button class="vc-editor__set-btn" data-vc-action="set-in">Set IN</button>
              <button class="vc-editor__set-btn" data-vc-action="set-out">Set OUT</button>
            </span>
          </div>
        </div>

        <div class="vc-editor__form">
          <div class="vc-editor__field">
            <label class="vc-editor__label">Clip title</label>
            <div class="vc-editor__title-input vc-edit" contenteditable="true" data-vc-edit-field="title" data-placeholder="What this moment is about…">${escapeHtml(draft.title || "")}</div>
          </div>
          <div class="vc-editor__field">
            <label class="vc-editor__label">Summary</label>
            <div class="vc-editor__textarea vc-edit" contenteditable="true" data-vc-edit-field="summary" data-placeholder="What's in this moment — context I should remember when drafting…">${escapeHtml(draft.summary || "")}</div>
          </div>
          <div class="vc-editor__field">
            <label class="vc-editor__label"><i class="ap-icon-sparkles"></i>Why this works</label>
            <div class="vc-editor__textarea vc-editor__textarea--small vc-edit" contenteditable="true" data-vc-edit-field="why" data-placeholder="The angle that makes this clip post-worthy…">${escapeHtml(draft.why || "")}</div>
          </div>
          <div class="vc-editor__field">
            <label class="vc-editor__label">Network</label>
            <div class="vc-editor__nets">${netPills}</div>
          </div>
        </div>
      </div>

      <div class="vc-editor__timeline">
        <div class="vc-editor__timeline-head">
          <div class="vc-editor__timeline-title">Timeline · ${escapeHtml(currentSource?.filename || "")}</div>
          <div class="vc-editor__timeline-stepper">
            <span class="vc-stepper">
              <span class="vc-stepper__label">In</span>
              <input type="text" class="vc-stepper__input" data-vc-stepper="start" value="${fmtTime(draft.start)}" />
            </span>
            <span class="vc-stepper">
              <span class="vc-stepper__label">Out</span>
              <input type="text" class="vc-stepper__input" data-vc-stepper="end" value="${fmtTime(draft.end)}" />
            </span>
            <span class="vc-editor__timeline-hint">Drag handles · click track to scrub</span>
          </div>
        </div>
        <div class="vc-protrim" data-vc-protrim>
          <div class="vc-protrim__ruler">${ticks}</div>
          <div class="vc-protrim__track" data-vc-protrim-track>
            <div class="vc-protrim__thumbs">${thumbs}</div>
            <div class="vc-protrim__dim vc-protrim__dim--l" data-vc-protrim-dim-l style="width: ${leftPct}%"></div>
            <div class="vc-protrim__dim vc-protrim__dim--r" data-vc-protrim-dim-r style="left: ${leftPct + widthPct}%; right: 0"></div>
            <div class="vc-protrim__window" data-vc-protrim-window data-vc-drag="window" style="left: ${leftPct}%; width: ${widthPct}%">
              <span class="vc-protrim__win-glow"></span>
              <span class="vc-protrim__win-label vc-protrim__win-label--l" data-vc-protrim-label-l>${fmtTime(draft.start)}</span>
              <span class="vc-protrim__win-label vc-protrim__win-label--c" data-vc-protrim-label-c>${fmtTime(draft.end - draft.start)}</span>
              <span class="vc-protrim__win-label vc-protrim__win-label--r" data-vc-protrim-label-r>${fmtTime(draft.end)}</span>
            </div>
            <div class="vc-protrim__handle vc-protrim__handle--l" data-vc-drag="start" style="left: ${leftPct}%">
              <span class="vc-protrim__grip"></span>
            </div>
            <div class="vc-protrim__handle vc-protrim__handle--r" data-vc-drag="end" style="left: ${leftPct + widthPct}%">
              <span class="vc-protrim__grip"></span>
            </div>
            <div class="vc-protrim__playhead" data-vc-drag="playhead" data-vc-protrim-playhead style="left: ${playheadPct}%">
              <span class="vc-protrim__playhead-knob"></span>
              <span class="vc-protrim__playhead-line"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Render: full body ────────────────────────────────────────────────

function renderBody() {
  if (!bodyEl) return;

  // Single-clip mode: render ONLY the editor pane. No browse grid, no
  // dimmed siblings — the user is editing one clip in isolation.
  if (singleClipMode) {
    bodyEl.innerHTML = editingId
      ? `<div class="vc-rows__cell vc-rows__cell--floating is-editing vc-rows__cell--solo" data-vc-floating>${editorPaneHTML()}</div>`
      : "";
    return;
  }

  // Editor pane (sticky, only when in edit mode).
  const editorBlock = editingId
    ? `<div class="vc-rows__cell vc-rows__cell--floating is-editing" data-vc-floating>${editorPaneHTML()}</div>`
    : "";

  // Grid cards. The currently-editing clip stays in the DOM but is dimmed.
  const cards = clips
    .map((c) => {
      const cls = "vc-rows__cell" + (editingId === c.id ? " is-editing-shadow" : "");
      return `<div class="${cls}" data-vc-cell="${c.id}">${clipCardHTML(c)}</div>`;
    })
    .join("");

  bodyEl.innerHTML = `
    ${editorBlock}
    <div class="vc-rows">${cards}</div>
  `;
}

function render() {
  // Single-clip mode strips the multi-clip surfaces: the timeline at
  // the top and the bulk toolbar. The footer stays visible but switches
  // to the edit CTAs (Delete / Cancel / Save changes) instead of the
  // "Draft posts from N clips" bulk action.
  const wrapTimeline = document.getElementById("videoClipsTimeline");
  if (wrapTimeline) wrapTimeline.hidden = singleClipMode;
  if (toolbarEl) toolbarEl.hidden = singleClipMode;
  if (footEl) footEl.hidden = false;
  if (singleClipMode) renderFooterEdit();
  else {
    renderTimeline();
    renderToolbar();
    renderFooter();
  }
  renderBody();
}

// ── Event delegation ─────────────────────────────────────────────────

function onModalClick(event) {
  const actionEl = event.target.closest("[data-vc-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.vcAction;
  const clipId = actionEl.dataset.vcClip;

  if (action === "toggle") {
    if (selected.has(clipId)) selected.delete(clipId);
    else selected.add(clipId);
    // Toggling doesn't affect the editor pane, so a single render is fine
    // even if the user is in edit mode (the editor lives outside the grid).
    render();
    return;
  }

  if (action === "edit") {
    enterEdit(clipId);
    return;
  }

  if (action === "save-edit") {
    saveEdit();
    return;
  }

  if (action === "cancel-edit") {
    cancelEdit();
    return;
  }

  if (action === "delete-clip") {
    // Editor state isn't externally persisted, so a destructive delete
    // without a confirm has no recovery path. Gate on confirm-modal —
    // same pattern as bulk-delete drafts in right-panel.
    const id = editingId;
    import("./confirm-modal.js?v=22").then(({ open }) => {
      open({
        title: "Delete this clip?",
        body: "This removes the clip from the editor. You'll need to re-extract or re-create it manually.",
        confirmLabel: "Delete clip",
        cancelLabel: "Keep editing",
        danger: true,
        onConfirm: () => deleteClip(id),
      });
    });
    return;
  }

  if (action === "set-network") {
    if (!draft) return;
    draft.network = actionEl.dataset.vcNetwork;
    // Re-render the editor pane only — the rest of the modal is unaffected.
    // Cheap to just re-render the body; cursor isn't in an editable field.
    renderBody();
    return;
  }

  if (action === "select-all") {
    selected = new Set(clips.map((c) => c.id));
    render();
    return;
  }

  if (action === "clear") {
    selected = new Set();
    render();
    return;
  }

  if (action === "regen") {
    if (regenerating) return;
    regenerating = true;
    renderToolbar();
    showToast("Suggesting new clips…", { duration: 1100 });
    setTimeout(() => {
      regenerating = false;
      renderToolbar();
    }, 1100);
    return;
  }

  if (action === "add-clip") {
    addManualClip();
    return;
  }

  if (action === "set-in") {
    if (!draft) return;
    draft.start = Math.min(draft.end - MIN_CLIP, draftPlayhead);
    syncEditorAfterDrag();
    return;
  }
  if (action === "set-out") {
    if (!draft) return;
    draft.end = Math.max(draft.start + MIN_CLIP, draftPlayhead);
    syncEditorAfterDrag();
    return;
  }
  if (action === "seek-start") {
    if (!draft) return;
    draftPlayhead = draft.start;
    syncEditorAfterDrag();
    return;
  }
  if (action === "seek-end") {
    if (!draft) return;
    draftPlayhead = draft.end;
    syncEditorAfterDrag();
    return;
  }

  if (action === "use-clips") {
    if (selected.size === 0 || editingId) return;
    if (typeof onUseCallback === "function") {
      const selectedClips = clips.filter((c) => selected.has(c.id));
      onUseCallback(selectedClips, currentSource);
    }
    close();
    return;
  }

  if (action === "cancel") {
    close();
    return;
  }
}

// ── InlineEdit (contenteditable) ─────────────────────────────────────

function onModalInput(event) {
  const field = event.target.closest("[data-vc-edit-field]");
  if (field && draft) {
    const key = field.dataset.vcEditField;
    draft[key] = field.textContent;
    if (key === "title") {
      // Title also lives in the strip timeline tooltip — keep it in sync.
      renderTimeline();
    }
    return;
  }
}

function onModalKeydown(event) {
  // contenteditable: Enter on the single-line title commits & blurs.
  const field = event.target.closest("[data-vc-edit-field]");
  if (field && event.key === "Enter" && field.dataset.vcEditField === "title") {
    event.preventDefault();
    field.blur();
    return;
  }

  // Stepper arrows.
  const stepper = event.target.closest("[data-vc-stepper]");
  if (stepper && draft) {
    if (event.key === "Enter") {
      event.preventDefault();
      stepper.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 1 : -1;
      const which = stepper.dataset.vcStepper; // "start" or "end"
      stepDraft(which, delta);
    }
  }
}

function onStepperBlur(event) {
  const stepper = event.target.closest("[data-vc-stepper]");
  if (!stepper || !draft) return;
  const which = stepper.dataset.vcStepper;
  const parsed = parseTime(stepper.value);
  if (parsed == null) {
    stepper.value = fmtTime(draft[which]);
    return;
  }
  if (which === "start") {
    draft.start = clamp(parsed, 0, draft.end - MIN_CLIP);
  } else {
    draft.end = clamp(parsed, draft.start + MIN_CLIP, currentSource?.durationSec || parsed);
  }
  syncEditorAfterDrag();
}

function stepDraft(which, delta) {
  if (!draft) return;
  const duration = currentSource?.durationSec || 0;
  if (which === "start") {
    draft.start = clamp(draft.start + delta, 0, draft.end - MIN_CLIP);
  } else {
    draft.end = clamp(draft.end + delta, draft.start + MIN_CLIP, duration);
  }
  syncEditorAfterDrag();
}

// ── Drag (pro trimmer) ───────────────────────────────────────────────
// Pointer Events unify mouse + touch + pen so the handles work on
// tablets and touch laptops. Naming kept as Mousedown/Mousemove/Mouseup
// for git-blame stability; the underlying events are pointer*.

function onProtrimMousedown(event) {
  const dragEl = event.target.closest("[data-vc-drag]");
  if (!dragEl || !draft) return;
  event.preventDefault();
  event.stopPropagation();
  const kind = dragEl.dataset.vcDrag; // "start" | "end" | "window" | "playhead"
  const track = document.querySelector("[data-vc-protrim-track]");
  if (!track) return;
  const rect = track.getBoundingClientRect();
  dragState = {
    kind,
    startX: event.clientX,
    anchorStart: draft.start,
    anchorEnd: draft.end,
    anchorPlayhead: draftPlayhead,
    trackWidth: rect.width,
    rectLeft: rect.left,
  };
  document.querySelector("[data-vc-protrim]")?.classList.add("is-dragging", `is-dragging--${kind}`);
  window.addEventListener("pointermove", onProtrimMousemove);
  window.addEventListener("pointerup", onProtrimMouseup);
  window.addEventListener("pointercancel", onProtrimMouseup);
}

function onProtrimTrackClick(event) {
  // Click on empty track (not on a handle/window/playhead) → move playhead.
  if (!draft) return;
  if (dragState) return;
  if (event.target.closest("[data-vc-drag]")) return;
  if (event.target.closest("[data-vc-protrim-window]")) return;
  const track = event.currentTarget;
  const rect = track.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  const duration = currentSource?.durationSec || 0;
  draftPlayhead = clamp(ratio * duration, 0, duration);
  syncEditorAfterDrag();
}

function onProtrimMousemove(event) {
  if (!dragState || !draft) return;
  const duration = currentSource?.durationSec || 0;
  const dx = event.clientX - dragState.startX;
  const dt = (dx / dragState.trackWidth) * duration;

  if (dragState.kind === "start") {
    let s = clamp(dragState.anchorStart + dt, 0, dragState.anchorEnd - MIN_CLIP);
    let e = dragState.anchorEnd;
    if (e - s > MAX_CLIP) s = e - MAX_CLIP;
    draft.start = s;
    draft.end = e;
  } else if (dragState.kind === "end") {
    let s = dragState.anchorStart;
    let e = clamp(dragState.anchorEnd + dt, dragState.anchorStart + MIN_CLIP, duration);
    if (e - s > MAX_CLIP) e = s + MAX_CLIP;
    draft.start = s;
    draft.end = e;
  } else if (dragState.kind === "window") {
    const len = dragState.anchorEnd - dragState.anchorStart;
    const s = clamp(dragState.anchorStart + dt, 0, duration - len);
    draft.start = s;
    draft.end = s + len;
  } else if (dragState.kind === "playhead") {
    draftPlayhead = clamp(dragState.anchorPlayhead + dt, 0, duration);
  }

  syncEditorAfterDrag();
}

function onProtrimMouseup() {
  if (!dragState) return;
  dragState = null;
  document
    .querySelector("[data-vc-protrim]")
    ?.classList.remove(
      "is-dragging",
      "is-dragging--start",
      "is-dragging--end",
      "is-dragging--window",
      "is-dragging--playhead",
    );
  window.removeEventListener("pointermove", onProtrimMousemove);
  window.removeEventListener("pointerup", onProtrimMouseup);
  window.removeEventListener("pointercancel", onProtrimMouseup);
}

// Patches the in-editor DOM after a drag/seek so the contenteditable cursor
// doesn't get blown away by a full re-render. Mirrors what React would
// reconcile, but explicitly.
function syncEditorAfterDrag() {
  if (!draft) return;
  const duration = currentSource?.durationSec || 1;
  const leftPct = (draft.start / duration) * 100;
  const widthPct = ((draft.end - draft.start) / duration) * 100;
  const playheadPct = (draftPlayhead / duration) * 100;

  const win = document.querySelector("[data-vc-protrim-window]");
  if (win) {
    win.style.left = `${leftPct}%`;
    win.style.width = `${widthPct}%`;
  }
  const handleL = document.querySelector('[data-vc-drag="start"]');
  if (handleL) handleL.style.left = `${leftPct}%`;
  const handleR = document.querySelector('[data-vc-drag="end"]');
  if (handleR) handleR.style.left = `${leftPct + widthPct}%`;
  const dimL = document.querySelector("[data-vc-protrim-dim-l]");
  if (dimL) dimL.style.width = `${leftPct}%`;
  const dimR = document.querySelector("[data-vc-protrim-dim-r]");
  if (dimR) dimR.style.left = `${leftPct + widthPct}%`;
  const playhead = document.querySelector("[data-vc-protrim-playhead]");
  if (playhead) playhead.style.left = `${playheadPct}%`;

  const labelL = document.querySelector("[data-vc-protrim-label-l]");
  if (labelL) labelL.textContent = fmtTime(draft.start);
  const labelR = document.querySelector("[data-vc-protrim-label-r]");
  if (labelR) labelR.textContent = fmtTime(draft.end);
  const labelC = document.querySelector("[data-vc-protrim-label-c]");
  if (labelC) labelC.textContent = fmtTime(draft.end - draft.start);

  const headStart = document.querySelector("[data-vc-editor-time-start]");
  if (headStart) headStart.textContent = fmtTime(draft.start);
  const headEnd = document.querySelector("[data-vc-editor-time-end]");
  if (headEnd) headEnd.textContent = fmtTime(draft.end);
  const headDur = document.querySelector("[data-vc-editor-time-dur]");
  if (headDur) headDur.textContent = fmtTime(draft.end - draft.start);

  const playTime = document.querySelector("[data-vc-editor-playtime]");
  if (playTime) playTime.textContent = fmtTime(draftPlayhead);
  const transTime = document.querySelector("[data-vc-editor-transport-time]");
  if (transTime) transTime.textContent = fmtTime(draftPlayhead);
  const clipDur = document.querySelector("[data-vc-editor-clipdur]");
  if (clipDur) clipDur.textContent = `${fmtTime(draft.end - draft.start)} · CLIP`;

  const stepStart = document.querySelector('[data-vc-stepper="start"]');
  if (stepStart && document.activeElement !== stepStart) stepStart.value = fmtTime(draft.start);
  const stepEnd = document.querySelector('[data-vc-stepper="end"]');
  if (stepEnd && document.activeElement !== stepEnd) stepEnd.value = fmtTime(draft.end);

  // Strip timeline at the top reflects the live window too.
  renderTimeline();
}

// ── Edit flow ────────────────────────────────────────────────────────

function enterEdit(clipId) {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return;
  editingId = clipId;
  draft = { ...clip };
  draftPlayhead = clip.start;
  render();
  // Reset the body's scroll position so the sticky editor sits at the top
  // of the visible area. NOT scrollIntoView — that bubbles up the ancestor
  // chain and scrolls the modal itself (yes, even with overflow: hidden),
  // which pushes the modal header offscreen and leaves dead space below
  // the footer.
  if (bodyEl) bodyEl.scrollTop = 0;
}

function saveEdit() {
  if (!draft) return;
  const idx = clips.findIndex((c) => c.id === draft.id);
  if (idx !== -1) {
    clips[idx] = { ...draft };
    notifySave();
  }
  editingId = null;
  draft = null;
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

function cancelEdit() {
  editingId = null;
  draft = null;
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

function deleteClip(clipId) {
  clips = clips.filter((c) => c.id !== clipId);
  selected.delete(clipId);
  editingId = null;
  draft = null;
  notifySave();
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

function addManualClip() {
  const duration = currentSource?.durationSec || 1200;
  const sorted = [...clips].sort((a, b) => a.start - b.start);

  // Find a 35s+ gap or fall back to the middle of the source.
  let start = Math.floor(duration / 2 - 15);
  let prevEnd = 0;
  for (const c of sorted) {
    if (c.start - prevEnd >= 35) {
      start = prevEnd + 5;
      break;
    }
    prevEnd = c.end;
  }
  if (duration - prevEnd >= 35) start = prevEnd + 5;
  start = clamp(start, 0, duration - 30);

  const id = "clip_" + Math.random().toString(36).slice(2, 8);
  const fresh = {
    id,
    start,
    end: start + 30,
    title: "",
    summary: "",
    why: "",
    network: "linkedin",
    tags: [],
    hue: Math.floor(Math.random() * 360),
  };
  clips = [...clips, fresh];
  selected.add(id);
  enterEdit(id);
  notifySave();
}

function notifySave() {
  if (typeof onSaveCallback === "function" && currentSource) {
    onSaveCallback(
      currentSource.id,
      clips.map((c) => ({ ...c })),
    );
  }
}

// ── Keyboard ─────────────────────────────────────────────────────────

function onKeydownGlobal(event) {
  if (!modal?.classList.contains("open")) return;
  if (event.key === "Escape") {
    if (editingId) {
      cancelEdit();
    } else {
      close();
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", SHELL_HTML);

  backdrop = document.getElementById("videoClipsBackdrop");
  modal = document.getElementById("videoClipsModal");
  bodyEl = document.getElementById("videoClipsBody");
  timelineEl = document.getElementById("videoClipsTimelineBar");
  toolbarEl = document.getElementById("videoClipsToolbar");
  footEl = document.getElementById("videoClipsFoot");

  document.getElementById("videoClipsClose").addEventListener("click", () => close());
  backdrop.addEventListener("click", () => {
    // Backdrop click ignored while editing — protects in-progress edits.
    if (!editingId) close();
  });
  modal.addEventListener("click", onModalClick);
  modal.addEventListener("input", onModalInput);
  modal.addEventListener("keydown", onModalKeydown);
  modal.addEventListener("blur", onStepperBlur, true);
  // Drag is wired at the protrim level so handles + window + playhead are
  // all caught. Track click (for scrub) lives on the track wrapper.
  modal.addEventListener("pointerdown", (event) => {
    const trackClick = event.target.closest("[data-vc-protrim-track]");
    if (trackClick && !event.target.closest("[data-vc-drag]")) {
      // We intentionally don't call onProtrimMousedown — the click handler
      // moves the playhead instead. pointerdown on the track itself is the
      // scrub gesture.
      onProtrimTrackClick({ currentTarget: trackClick, clientX: event.clientX, target: event.target });
      return;
    }
    onProtrimMousedown(event);
  });
  document.addEventListener("keydown", onKeydownGlobal);
}

export function open(source, callbacks = {}) {
  if (!source) return;
  if (!initialized) init();
  requestOpen(MODAL_ID, close);

  currentSource = source;
  clips = (source.clips || []).map((c) => ({ ...c }));
  selected = new Set(clips.map((c) => c.id));
  editingId = null;
  draft = null;
  draftPlayhead = 0;
  regenerating = false;
  singleClipMode = false;
  onUseCallback = typeof callbacks.onUseClips === "function" ? callbacks.onUseClips : null;
  onSaveCallback = typeof callbacks.onSaveClips === "function" ? callbacks.onSaveClips : null;

  // Optional pre-positioning into edit mode for a specific clip — used by
  // the right-panel clip-card's Edit affordance. Activates single-clip
  // mode so the modal hides every multi-clip surface (browse grid,
  // timeline, bulk toolbar, bulk footer) and only shows the editor pane
  // for the target clip.
  if (callbacks.editingClipId) {
    const target = clips.find((c) => c.id === callbacks.editingClipId);
    if (target) {
      singleClipMode = true;
      editingId = target.id;
      draft = { ...target };
      draftPlayhead = target.start || 0;
    }
  }

  // Head info — file-kind badge + title + filename. The title flips to
  // "Edit clip" in single-clip mode (matches the action that opened the
  // modal); subtitle drops the multi-clip framing for a quiet filename.
  const kindEl = document.getElementById("videoClipsKind");
  if (kindEl) kindEl.textContent = (source.ext || "MP4").toUpperCase();
  const titleEl = document.getElementById("videoClipsTitle");
  if (titleEl) titleEl.textContent = singleClipMode ? "Edit clip" : "Suggested clips";
  const subEl = document.getElementById("videoClipsSub");
  if (subEl) {
    if (singleClipMode) {
      subEl.textContent = shortName(source.filename || "video");
    } else {
      const total = source.durationSec || 0;
      const file = shortName(source.filename || "video");
      subEl.textContent = `${file} · ${clips.length} ${clips.length === 1 ? "clip" : "clips"} worth posting · ${fmtTime(total)} of footage`;
    }
  }

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.classList.toggle("is-single-clip", singleClipMode);
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  render();
}

function close() {
  if (!initialized || !modal?.classList.contains("open")) return;
  modal.classList.remove("open");
  modal.classList.remove("is-single-clip");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");

  // Reset ephemeral state.
  currentSource = null;
  clips = [];
  selected = new Set();
  editingId = null;
  draft = null;
  draftPlayhead = 0;
  regenerating = false;
  dragState = null;
  singleClipMode = false;
  onUseCallback = null;
  onSaveCallback = null;

  // Restore the multi-clip surfaces that single-clip mode hid so the next
  // open() in normal mode shows them.
  const wrapTimeline = document.getElementById("videoClipsTimeline");
  if (wrapTimeline) wrapTimeline.hidden = false;
  if (toolbarEl) toolbarEl.hidden = false;
  if (footEl) footEl.hidden = false;

  notifyClose(MODAL_ID);
}
