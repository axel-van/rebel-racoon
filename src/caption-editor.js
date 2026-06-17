// Embeddable caption editor — a subtitle-editing surface ported from
// platform-studio's video-editor playground, adapted to archie's vanilla JS +
// DS conventions. Mounted INSIDE the clips modal (the "Subtitles" tab of the
// clip editor), not as a separate full-screen surface.
//
// Layout: three panes inside the host container —
//   • Left   : flowing word-level transcript (click a word to seek, double-
//              click to edit its text) + a Speech-cleanup launcher.
//   • Center : faux video preview (the clip), a live caption box positioned /
//              styled per the current preset, dead-zone safe-area guides, and
//              a transport bar (play / scrub).
//   • Right  : tabs — Presets / Font / Effects / Cleanup.
//
// Public API:
//   mount(host, clip, source, { onChange }) — render into `host`; onChange(patch)
//       fires live on every edit with { captionState, transcript, captionsOn,
//       captionStyle, captions } so the hosting modal's draft stays in sync.
//   unmount() — stop playback, drop listeners, clear the host.
//
// No real video / ffmpeg — playback is a simulated playhead (rAF), captions
// are pure DOM/CSS. Karaoke word-sweep is intentionally omitted; emphasis is
// per-word marks + an optional static "phrase" highlight under the playhead.

import { escapeHtml } from "./utils.js?v=20";
import {
  PRESETS,
  presetById,
  defaultCaptionState,
  buildTranscript,
  deriveCues,
  stripCaptionPunctuation,
  resolveXFraction,
  resolveYFraction,
  DEAD_ZONES,
  DESIGN_WIDTH,
  detectFillers,
  detectPauses,
  videoForClip,
} from "./clip-captions.js?v=5";

const FONT_FAMILIES = [
  "Montserrat, Roboto, sans-serif",
  "Roboto, sans-serif",
  "Arial, sans-serif",
  "Georgia, serif",
  "Courier New, monospace",
];
const FONT_FAMILY_LABELS = {
  "Montserrat, Roboto, sans-serif": "Montserrat",
  "Roboto, sans-serif": "Roboto",
  "Arial, sans-serif": "Arial",
  "Georgia, serif": "Georgia",
  "Courier New, monospace": "Courier",
};

// ── Module state ─────────────────────────────────────────────────────

let host = null; // host container the editor is mounted into
let root = null; // the .cap-ed element inside host
let mounted = false;

let clip = null;
let source = null;
let onChangeCb = null;

let state = null; // CaptionState
let words = []; // transcript words [{ id, text, start, end, mark, removed }]
let cues = []; // derived chunked cues
let duration = 1;

let currentTime = 0;
let playing = false;
let rafId = null;
let lastTs = 0;

let activeTab = "presets";
let cleanupActive = false; // show filler/pause decorations in the transcript
let pausesRemoved = new Set(); // pause idx removed

let renderedCueIdx = -1;
let wordSpans = []; // [{ span, start, mark }]
let menuEl = null; // open word popover
let boxDrag = null; // caption-box drag state (null when not dragging)
let resizeDrag = null; // caption-box resize state (null when not resizing)

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(t) {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function $(sel) {
  return root ? root.querySelector(sel) : null;
}

// Flat dark video placeholder — no decorative gradients. The stage's sunken
// surface (CSS) carries the frame; the play glyph is the affordance.
function previewBg() {
  return "none";
}

function emitChange() {
  if (typeof onChangeCb !== "function") return;
  onChangeCb({
    captionState: { ...state },
    transcript: words.map((w) => ({ ...w })),
    captionsOn: state.presetId !== "none",
    captionStyle: state.presetId,
    captions: deriveSimpleCaptions(),
  });
}

// Derive the simple segment array (used by the clip-tab teaser overlay + the
// clip card) from the current cues.
function deriveSimpleCaptions() {
  return cues.map((c, i) => ({
    id: `${clip?.id || "clip"}_cap_${i}`,
    start: c.start,
    end: c.end,
    text: c.words.map((w) => stripCaptionPunctuation(w.text)).join(" "),
    emph: [],
  }));
}

// ── HTML shell (embedded, no fixed wrapper / topbar) ─────────────────

const INNER = `
<div class="cap-ed">
  <div class="cap-ed__body">
    <aside class="cap-ed__left">
      <div class="cap-ed__left-head">
        <span class="cap-ed-group-label">Transcript</span>
        <span class="cap-ed__meta" data-ce-reconcile></span>
      </div>
      <button type="button" class="cap-ed__cleanup-btn" data-ce="open-cleanup" aria-pressed="false">
        <i class="ap-icon-sparkles"></i><span>Speech cleanup</span>
        <span class="cap-ed__cleanup-count" data-ce-cleanup-count></span>
      </button>
      <div class="cap-ed__cleanup-bar" data-ce-cleanup-bar hidden></div>
      <div class="cap-ed__hint" data-ce-hint>Click to seek · double-click to edit</div>
      <div class="cap-ed__transcript" data-ce-transcript></div>
    </aside>

    <main class="cap-ed__center">
      <div class="cap-ed__stage-wrap">
        <div class="cap-ed__stage" data-ce-stage>
          <video class="cap-ed__video" data-ce-video muted loop playsinline></video>
          <div class="cap-ed__deadzones" data-ce-deadzones></div>
          <div class="cap-ed__playicon" data-ce-playicon>
            <svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          </div>
          <div class="cap-ed-box" data-ce-box></div>
          <div class="cap-ed-frame" data-ce-frame>
            <span class="cap-ed-handle cap-ed-handle--nw" data-ce-resize="nw"></span>
            <span class="cap-ed-handle cap-ed-handle--n" data-ce-resize="n"></span>
            <span class="cap-ed-handle cap-ed-handle--ne" data-ce-resize="ne"></span>
            <span class="cap-ed-handle cap-ed-handle--e" data-ce-resize="e"></span>
            <span class="cap-ed-handle cap-ed-handle--se" data-ce-resize="se"></span>
            <span class="cap-ed-handle cap-ed-handle--s" data-ce-resize="s"></span>
            <span class="cap-ed-handle cap-ed-handle--sw" data-ce-resize="sw"></span>
            <span class="cap-ed-handle cap-ed-handle--w" data-ce-resize="w"></span>
          </div>
        </div>
      </div>
      <div class="cap-ed__transport">
        <button type="button" class="cap-ed__icon-btn" data-ce="playpause" aria-label="Play / pause">
          <svg viewBox="0 0 24 24" width="16" height="16" data-ce-playglyph><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        </button>
        <span class="cap-ed__time"><span data-ce-cur>0:00</span> / <span data-ce-dur>0:00</span></span>
        <div class="cap-ed__scrub" data-ce-scrub><div class="cap-ed__scrub-fill" data-ce-scrub-fill></div></div>
      </div>
    </main>

    <aside class="cap-ed__right">
      <div class="cap-ed__tabs" role="tablist">
        <button type="button" class="cap-ed__tab" data-ce-tab="presets">Presets</button>
        <button type="button" class="cap-ed__tab" data-ce-tab="font">Font</button>
        <button type="button" class="cap-ed__tab" data-ce-tab="effects">Effects</button>
      </div>
      <div class="cap-ed__tabpanel" data-ce-tabpanel></div>
    </aside>
  </div>
</div>`;

// ── Caption box renderer (port of renderer.ts) ───────────────────────

function stageScale() {
  const stage = $("[data-ce-stage]");
  return stage && stage.clientWidth ? stage.clientWidth / DESIGN_WIDTH : 0.3;
}

function applyBoxStyle() {
  const box = $("[data-ce-box]");
  if (!box) return;
  const s = state;
  const k = stageScale();
  box.style.display = s.presetId === "none" ? "none" : "flex";
  box.style.fontFamily = s.fontFamily;
  box.style.fontSize = `${s.fontSizePx * k}px`;
  box.style.fontWeight = String(s.fontWeight);
  box.style.color = s.textColor;
  box.style.textTransform = s.uppercase ? "uppercase" : "none";
  box.style.webkitTextStroke = `${s.strokeWidthPx * k * 0.35}px ${s.strokeColor}`;
  box.style.setProperty("paint-order", "stroke fill");
  box.style.textShadow = s.shadow
    ? `${s.shadowX * k}px ${s.shadowY * k}px ${Math.max(0, s.shadowBlur) * k}px ${s.shadowColor}`
    : "none";
  box.style.fontStyle = s.italic ? "italic" : "normal";
  box.style.width = `${s.widthFraction * 100}%`;
  box.style.left = `${resolveXFraction(s) * 100}%`;
  box.style.top = `${resolveYFraction(s) * 100}%`;
  box.classList.toggle("cap-ed-box--plate", !!s.plate);
  box.style.setProperty("--cap-plate", s.plateColor || "rgba(10, 12, 16, 0.82)");
  syncFrame();
}

// Overlay the selection frame on the caption box's current bounding rect (the
// box is center-anchored + content-sized, so the frame is positioned from its
// measured rect relative to the stage).
function syncFrame() {
  const frame = $("[data-ce-frame]");
  const box = $("[data-ce-box]");
  const stage = $("[data-ce-stage]");
  if (!frame || !box || !stage) return;
  if (state.presetId === "none") {
    frame.style.display = "none";
    return;
  }
  frame.style.display = "";
  const sr = stage.getBoundingClientRect();
  const br = box.getBoundingClientRect();
  frame.style.left = `${br.left - sr.left}px`;
  frame.style.top = `${br.top - sr.top}px`;
  frame.style.width = `${br.width}px`;
  frame.style.height = `${br.height}px`;
}

function nearestCueIdx(t) {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const dist = t < c.start ? c.start - t : t - c.end;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function renderCaptionFrame(force = false) {
  const box = $("[data-ce-box]");
  if (!box) return;
  if (state.presetId === "none") {
    box.style.display = "none";
    return;
  }
  const t = currentTime;
  const liveIdx = cues.findIndex((c) => t >= c.start && t <= c.end);
  const idx = liveIdx >= 0 ? liveIdx : nearestCueIdx(t);
  box.classList.toggle("ghost", liveIdx < 0);

  if (idx !== renderedCueIdx || force) {
    renderedCueIdx = idx;
    box.innerHTML = "";
    wordSpans = [];
    const cue = idx >= 0 ? cues[idx] : null;
    if (cue) {
      const breaks = new Set((cue.lineStarts || [0]).slice(1));
      let line = null;
      cue.words.forEach((word, i) => {
        if (line === null || breaks.has(i)) {
          line = document.createElement("span");
          line.className = "cap-ed-line";
          box.appendChild(line);
        }
        const span = document.createElement("span");
        span.className = "cap-ed-word";
        span.textContent = stripCaptionPunctuation(word.text);
        line.appendChild(span);
        line.append(" ");
        wordSpans.push({ span, start: word.start, mark: word.mark });
      });
    }
  }

  // per-frame emphasis pass
  const s = state;
  const phrase = s.highlight === "phrase";
  let currentStart = -Infinity;
  if (phrase) {
    for (const w of wordSpans) if (w.start <= t && w.start > currentStart) currentStart = w.start;
  }
  for (const { span, start, mark } of wordSpans) {
    let color = "";
    if (mark === "font") color = s.manualFontColor;
    else if (phrase && start === currentStart && t >= start) color = s.highlightColor;
    span.style.color = color;
    span.style.background = mark === "h1" ? s.highlight1Color : mark === "h2" ? s.highlight2Color : "";
    span.classList.toggle("cap-ed-word-hl", mark === "h1" || mark === "h2");
  }
  // The box height tracks its content — re-sync the selection frame.
  syncFrame();
}

// ── Dead-zone guides ─────────────────────────────────────────────────

function renderDeadzones() {
  const el = $("[data-ce-deadzones]");
  if (!el) return;
  if (state.deadZones === "none") {
    el.innerHTML = "";
    return;
  }
  const z = DEAD_ZONES[state.deadZones];
  const net = state.deadZones;
  el.innerHTML = `
    <div class="cap-ed-dz cap-ed-dz--top" style="height:${z.top * 100}%"><span>${net}</span></div>
    <div class="cap-ed-dz cap-ed-dz--bottom" style="height:${z.bottom * 100}%"><span>${net}</span></div>
    <div class="cap-ed-dz cap-ed-dz--right" style="width:${z.right * 100}%;top:${z.top * 100}%;bottom:${z.bottom * 100}%"></div>
  `;
}

// ── Transcript ───────────────────────────────────────────────────────

function renderTranscript() {
  const hostEl = $("[data-ce-transcript]");
  if (!hostEl) return;
  const fillers = cleanupActive ? detectFillers(words) : [];
  const fillerIdx = new Map();
  fillers.forEach((f) => {
    for (let k = 0; k < f.count; k++) fillerIdx.set(f.startIdx + k, true);
  });
  const pauses = detectPauses(words);
  const pauseByIdx = new Map(pauses.map((p) => [p.idx, p]));

  let html = "";
  words.forEach((w, i) => {
    const pause = pauseByIdx.get(i);
    if (pause) {
      const removed = pausesRemoved.has(i);
      const cls = "cap-ed-pause" + (cleanupActive ? " is-proposed" : "") + (removed ? " is-removed" : "");
      html += `<span class="${cls}" data-ce-pause="${i}" title="${pause.dur}s pause">${pause.dur}s</span>`;
    }
    const isFiller = fillerIdx.has(i);
    const cls =
      "cap-ed-tword" +
      (w.removed ? " is-removed" : "") +
      (isFiller ? " is-filler" : "") +
      (w.mark ? " is-marked is-mark-" + w.mark : "");
    html += `<span class="${cls}" data-ce-word="${i}">${escapeHtml(w.text)}</span> `;
  });
  hostEl.innerHTML = html;
  updateActiveWord();
}

function updateActiveWord() {
  const hostEl = $("[data-ce-transcript]");
  if (!hostEl) return;
  let activeI = -1;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    if (currentTime >= words[i].start && (!next || currentTime < next.start)) {
      activeI = i;
      break;
    }
  }
  hostEl.querySelectorAll(".cap-ed-tword.is-active").forEach((e) => e.classList.remove("is-active"));
  if (activeI >= 0) {
    const el = hostEl.querySelector(`[data-ce-word="${activeI}"]`);
    if (el) {
      el.classList.add("is-active");
      if (playing) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

// ── Right panel tabs ─────────────────────────────────────────────────

function segBtns(name, current, opts) {
  return `<div class="cap-ed-seg" data-ce-seg="${name}">${opts
    .map(
      (o) =>
        `<button type="button" class="cap-ed-seg__btn${o.v === current ? " is-on" : ""}" data-ce-seg-val="${o.v}">${escapeHtml(o.label)}</button>`,
    )
    .join("")}</div>`;
}

function field(label, control, hint) {
  const lbl = `<label class="cap-ed-flabel">${escapeHtml(label)}${hint ? `<span class="cap-ed-fhint">${escapeHtml(hint)}</span>` : ""}</label>`;
  return `<div class="cap-ed-field">${lbl}${control}</div>`;
}

// Group a set of fields under a quiet section header.
function group(label, body) {
  return `<div class="cap-ed-group"><div class="cap-ed-group-label">${escapeHtml(label)}</div>${body}</div>`;
}

function colorInput(key, value) {
  return `<input type="color" class="cap-ed-color" data-ce-color="${key}" value="${value}" />`;
}

function renderPresetsTab() {
  const cards = PRESETS.map((p) => {
    const isOn = p.id === state.presetId;
    const sample =
      p.id === "none"
        ? `<span class="cap-ed-preset__none"><i class="ap-icon-eye-off"></i></span>`
        : `<span class="cap-ed-preset__sample cap-ed-preview-${p.id}">TO GET <mark>STARTED</mark></span>`;
    return `
      <button type="button" class="cap-ed-preset${isOn ? " is-on" : ""}" data-ce-preset="${p.id}">
        <span class="cap-ed-preset__frame">${sample}</span>
        <span class="cap-ed-preset__label">${escapeHtml(p.label)}</span>
      </button>`;
  }).join("");
  return `<div class="cap-ed-presets">${cards}</div>`;
}

function renderFontTab() {
  const s = state;
  const fams = FONT_FAMILIES.map(
    (f) =>
      `<option value="${escapeHtml(f)}"${f === s.fontFamily ? " selected" : ""}>${FONT_FAMILY_LABELS[f] || f}</option>`,
  ).join("");
  const weights = [
    { v: 400, label: "Regular" },
    { v: 700, label: "Bold" },
    { v: 900, label: "Black" },
  ]
    .map((w) => `<option value="${w.v}"${s.fontWeight === w.v ? " selected" : ""}>${w.label}</option>`)
    .join("");
  const toggle = (key, label, on) =>
    `<label class="ap-toggle-container cap-ed-toggle"><input type="checkbox" data-ce-toggle="${key}" ${on ? "checked" : ""} /><i></i><span>${label}</span></label>`;

  return `
    ${group(
      "Text",
      `${field("Font", `<select class="cap-ed-select" data-ce-set="fontFamily">${fams}</select>`)}
       ${field("Size", `<input type="number" class="cap-ed-num" data-ce-set="fontSizePx" min="24" max="160" value="${s.fontSizePx}" />`)}
       ${field("Weight", `<select class="cap-ed-select" data-ce-set="fontWeight">${weights}</select>`)}
       ${field("Text color", colorInput("textColor", s.textColor))}
       ${field("Uppercase", toggle("uppercase", "", s.uppercase))}`,
    )}
    ${group(
      "Outline & shadow",
      `${field("Outline color", colorInput("strokeColor", s.strokeColor))}
       ${field("Outline width", `<input type="number" class="cap-ed-num" data-ce-set="strokeWidthPx" min="0" max="24" value="${s.strokeWidthPx}" />`)}
       ${field("Shadow", toggle("shadow", "", s.shadow))}
       ${
         s.shadow
           ? `<div class="cap-ed-subfields">
               ${field("Color", colorInput("shadowColor", s.shadowColor))}
               ${field("Offset X", `<input type="number" class="cap-ed-num" data-ce-set="shadowX" min="-20" max="20" value="${s.shadowX}" />`)}
               ${field("Offset Y", `<input type="number" class="cap-ed-num" data-ce-set="shadowY" min="-20" max="20" value="${s.shadowY}" />`)}
               ${field("Blur", `<input type="number" class="cap-ed-num" data-ce-set="shadowBlur" min="0" max="40" value="${s.shadowBlur}" />`)}
             </div>`
           : ""
       }`,
    )}
    ${group(
      "Emphasis",
      `${field("Current word", colorInput("highlightColor", s.highlightColor))}
       ${field("Highlight 1", colorInput("highlight1Color", s.highlight1Color))}
       ${field("Highlight 2", colorInput("highlight2Color", s.highlight2Color))}
       ${field("Word recolor", colorInput("manualFontColor", s.manualFontColor))}`,
    )}
  `;
}

function renderEffectsTab() {
  const s = state;
  return `
    ${group(
      "Layout",
      `${field(
        "Position",
        segBtns("position", s.position, [
          { v: "auto", label: "Auto" },
          { v: "top", label: "Top" },
          { v: "middle", label: "Middle" },
          { v: "bottom", label: "Bottom" },
          ...(s.position === "custom" ? [{ v: "custom", label: "Custom" }] : []),
        ]),
      )}
       ${field(
         "Lines",
         segBtns("maxLines", s.maxLines, [
           { v: 1, label: "1" },
           { v: 2, label: "2" },
           { v: 3, label: "3" },
         ]),
       )}
       ${field("Max words", `<input type="number" class="cap-ed-num" data-ce-set="wordsPerCue" min="0" max="12" value="${s.wordsPerCue}" />`, "0 = no limit")}`,
    )}
    ${group(
      "Safe area",
      field(
        "Dead zones",
        segBtns("deadZones", s.deadZones, [
          { v: "none", label: "None" },
          { v: "tiktok", label: "TikTok" },
          { v: "reels", label: "Reels" },
          { v: "shorts", label: "Shorts" },
        ]),
      ),
    )}
  `;
}

// Speech-cleanup lives in the LEFT panel, merged with the transcript: this
// compact bar (shown under the "Speech cleanup" button) summarises what was
// found and offers bulk Remove all / Restore all. Individual removal happens
// right in the transcript — click a highlighted filler word or a pause chip.
function renderCleanupBar() {
  const bar = $("[data-ce-cleanup-bar]");
  if (!bar) return;
  bar.hidden = !cleanupActive;
  const btn = $('[data-ce="open-cleanup"]');
  if (btn) btn.setAttribute("aria-pressed", String(cleanupActive));
  if (!cleanupActive) {
    bar.innerHTML = "";
    return;
  }
  const fillers = detectFillers(words);
  const pauses = detectPauses(words);
  if (!fillers.length && !pauses.length) {
    bar.innerHTML = `<span class="cap-ed-cleanup-bar__count">Nothing to clean up</span>
      <button type="button" class="cap-ed-cleanup-bar__btn cap-ed-cleanup-bar__btn--done" data-ce-cleanup-done>Done</button>`;
    return;
  }
  const anyPending = fillers.some((f) => !words[f.startIdx].removed) || pauses.some((p) => !pausesRemoved.has(p.idx));
  bar.innerHTML = `
    <span class="cap-ed-cleanup-bar__count">${fillers.length} filler${fillers.length === 1 ? "" : "s"} · ${pauses.length} pause${pauses.length === 1 ? "" : "s"} — tap to remove</span>
    <span class="cap-ed-cleanup-bar__actions">
      <button type="button" class="cap-ed-cleanup-bar__btn" data-ce-cleanup-all="${anyPending ? "remove" : "restore"}">${anyPending ? "Remove all" : "Restore all"}</button>
      <button type="button" class="cap-ed-cleanup-bar__btn cap-ed-cleanup-bar__btn--done" data-ce-cleanup-done>Done</button>
    </span>`;
}

function renderTabPanel() {
  const panel = $("[data-ce-tabpanel]");
  if (!panel) return;
  root.querySelectorAll("[data-ce-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.ceTab === activeTab));
  if (activeTab === "presets") panel.innerHTML = renderPresetsTab();
  else if (activeTab === "font") panel.innerHTML = renderFontTab();
  else panel.innerHTML = renderEffectsTab();
}

// ── Recompute + repaint ──────────────────────────────────────────────

function recomputeCues() {
  cues = deriveCues(words, state);
  renderedCueIdx = -1;
  updateReconcile();
}

function updateReconcile() {
  const el = $("[data-ce-reconcile]");
  if (el) {
    const removed = words.filter((w) => w.removed).length + pausesRemoved.size;
    el.textContent = `${cues.length} cues · ${words.length} words${removed ? ` · ${removed} cleaned` : ""}`;
  }
  const cc = $("[data-ce-cleanup-count]");
  if (cc) {
    const n = detectFillers(words).length + detectPauses(words).length;
    cc.textContent = n ? String(n) : "";
    cc.hidden = !n;
  }
}

function repaintAll() {
  applyBoxStyle();
  renderDeadzones();
  renderCaptionFrame(true);
}

// ── Playback ─────────────────────────────────────────────────────────

function setPlaying(on) {
  playing = on;
  const glyph = $("[data-ce-playglyph]");
  if (glyph)
    glyph.innerHTML = on
      ? `<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>`
      : `<path d="M8 5v14l11-7z" fill="currentColor"/>`;
  const big = $("[data-ce-playicon]");
  if (big) big.classList.toggle("is-hidden", on);
  // Drive the real footage too (muted) — it loops independently behind the
  // captions; the synthetic playhead stays the source of truth for caption sync.
  const video = $("[data-ce-video]");
  if (video) {
    if (on) video.play().catch(() => {});
    else video.pause();
  }
  if (on) {
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick() {
  if (!playing) return;
  // The video drives the playhead — read its real currentTime each frame.
  const video = $("[data-ce-video]");
  if (video && isFinite(video.duration)) currentTime = video.currentTime;
  else currentTime = Math.min(duration, currentTime + 1 / 60); // fallback pre-metadata
  syncTime();
  rafId = requestAnimationFrame(tick);
}

function seek(t) {
  currentTime = Math.max(0, Math.min(duration, t));
  // Drive the real video (duration is now the video's, so 1:1).
  const video = $("[data-ce-video]");
  if (video && isFinite(video.duration)) {
    video.currentTime = Math.max(0, Math.min(video.duration - 0.03, currentTime));
  }
  syncTime();
}

// Re-time the synthetic transcript onto the real video's duration so caption
// timings track the actual footage. Runs once when video metadata loads.
function retimeToVideo(vDur) {
  if (!vDur || !isFinite(vDur) || vDur <= 0) return;
  const old = duration || vDur;
  if (Math.abs(old - vDur) < 0.01) return;
  const scale = vDur / old;
  words.forEach((w) => {
    w.start = +(w.start * scale).toFixed(2);
    w.end = +(w.end * scale).toFixed(2);
  });
  duration = vDur;
  recomputeCues();
  const dur = $("[data-ce-dur]");
  if (dur) dur.textContent = fmt(duration);
  renderTranscript();
  if (currentTime > duration) currentTime = 0;
  syncTime();
  emitChange();
}

function syncTime() {
  const cur = $("[data-ce-cur]");
  if (cur) cur.textContent = fmt(currentTime);
  const fill = $("[data-ce-scrub-fill]");
  if (fill) fill.style.width = `${(currentTime / duration) * 100}%`;
  renderCaptionFrame();
  updateActiveWord();
}

// ── Events ───────────────────────────────────────────────────────────

function closeMenu() {
  if (menuEl) {
    menuEl.removeEventListener("click", onMenuClick);
    menuEl.remove();
    menuEl = null;
    document.removeEventListener("pointerdown", onDocPointer, true);
  }
}

function onDocPointer(e) {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest("[data-ce-word]")) closeMenu();
}

// The word menu lives in document.body (so position:fixed is viewport-anchored
// — the modal's own transform would otherwise become the containing block), so
// it gets its own click handler rather than bubbling to the root delegate.
function onMenuClick(e) {
  const markBtn = e.target.closest("[data-ce-mark]");
  if (markBtn && menuEl) {
    const i = Number(menuEl.dataset.ceWordIdx);
    words[i].mark = markBtn.dataset.ceMark || null;
    closeMenu();
    renderTranscript();
    renderCaptionFrame(true);
    emitChange();
    return;
  }
  const wordRemove = e.target.closest("[data-ce-word-remove]");
  if (wordRemove) {
    const i = Number(wordRemove.dataset.ceWordRemove);
    words[i].removed = !words[i].removed;
    closeMenu();
    renderTranscript();
    recomputeCues();
    renderCaptionFrame(true);
    renderCleanupBar();
    emitChange();
  }
}

function openWordMenu(wordIdx, anchorEl) {
  closeMenu();
  const w = words[wordIdx];
  const dots = [
    { mark: "font", color: state.manualFontColor, label: "Font color" },
    { mark: "h1", color: state.highlight1Color, label: "Highlight 1" },
    { mark: "h2", color: state.highlight2Color, label: "Highlight 2" },
  ]
    .map(
      (d) =>
        `<button type="button" class="cap-ed-menu__item" data-ce-mark="${d.mark}">
          <span class="cap-ed-menu__dot" style="background:${d.color}"></span>${d.label}
          ${w.mark === d.mark ? '<i class="ap-icon-check cap-ed-menu__check"></i>' : ""}
        </button>`,
    )
    .join("");
  menuEl = document.createElement("div");
  menuEl.className = "cap-ed-menu";
  menuEl.innerHTML = `
    ${dots}
    <button type="button" class="cap-ed-menu__item" data-ce-mark="">Clear emphasis</button>
    <div class="cap-ed-menu__sep"></div>
    <button type="button" class="cap-ed-menu__item" data-ce-word-remove="${wordIdx}">
      <i class="ap-icon-eye-off"></i>${w.removed ? "Show in captions" : "Hide from captions"}
    </button>`;
  // Append to document.body — position:fixed must resolve against the viewport,
  // and the modal's transform would otherwise capture it as the containing block.
  menuEl.dataset.ceWordIdx = String(wordIdx);
  menuEl.addEventListener("click", onMenuClick);
  document.body.appendChild(menuEl);
  const r = anchorEl.getBoundingClientRect();
  const mw = 188;
  const mh = menuEl.offsetHeight || 200;
  // Flip above the word if there isn't room below.
  const top = r.bottom + 6 + mh > window.innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6;
  menuEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - mw - 8))}px`;
  menuEl.style.top = `${top}px`;
  document.addEventListener("pointerdown", onDocPointer, true);
}

function startWordEdit(wordIdx, span) {
  span.contentEditable = "true";
  span.classList.add("is-editing");
  span.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(range);

  const commit = () => {
    span.contentEditable = "false";
    span.classList.remove("is-editing");
    const text = span.textContent.trim();
    if (text && text !== words[wordIdx].text) {
      words[wordIdx].text = text;
      recomputeCues();
      renderCaptionFrame(true);
      emitChange();
    } else {
      span.textContent = words[wordIdx].text;
    }
    span.removeEventListener("blur", commit);
    span.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      span.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      span.textContent = words[wordIdx].text;
      span.blur();
    }
  };
  span.addEventListener("blur", commit);
  span.addEventListener("keydown", onKey);
}

function onRootClick(e) {
  const t = e.target;

  if (t.closest('[data-ce="playpause"]')) return setPlaying(!playing);

  const tabBtn = t.closest("[data-ce-tab]");
  if (tabBtn) {
    activeTab = tabBtn.dataset.ceTab;
    renderTabPanel();
    return;
  }

  // Speech cleanup toggles a mode in the LEFT panel: decorate fillers/pauses
  // in the transcript and show the cleanup bar.
  if (t.closest('[data-ce="open-cleanup"]')) {
    cleanupActive = !cleanupActive;
    renderTranscript();
    renderCleanupBar();
    return;
  }

  const cleanAll = t.closest("[data-ce-cleanup-all]");
  if (cleanAll) {
    const removed = cleanAll.dataset.ceCleanupAll === "remove";
    detectFillers(words).forEach((f) => {
      for (let k = 0; k < f.count; k++) if (words[f.startIdx + k]) words[f.startIdx + k].removed = removed;
    });
    pausesRemoved = new Set(removed ? detectPauses(words).map((p) => p.idx) : []);
    renderTranscript();
    recomputeCues();
    renderCaptionFrame(true);
    renderCleanupBar();
    emitChange();
    return;
  }
  if (t.closest("[data-ce-cleanup-done]")) {
    cleanupActive = false;
    renderTranscript();
    renderCleanupBar();
    return;
  }

  const presetBtn = t.closest("[data-ce-preset]");
  if (presetBtn) {
    applyPreset(presetBtn.dataset.cePreset);
    return;
  }

  const segVal = t.closest("[data-ce-seg-val]");
  if (segVal) {
    const seg = segVal.closest("[data-ce-seg]").dataset.ceSeg;
    let v = segVal.dataset.ceSegVal;
    if (seg === "maxLines") v = Number(v);
    state[seg] = v;
    renderTabPanel();
    recomputeCues();
    repaintAll();
    emitChange();
    return;
  }

  const wordEl = t.closest("[data-ce-word]");
  if (wordEl && !wordEl.isContentEditable) {
    const i = Number(wordEl.dataset.ceWord);
    seek(words[i].start + 0.01);
    // In cleanup mode, clicking a highlighted filler removes/restores it
    // inline (no emphasis menu).
    if (cleanupActive) {
      const f = detectFillers(words).find((x) => i >= x.startIdx && i < x.startIdx + x.count);
      if (f) {
        const target = !words[f.startIdx].removed;
        for (let k = 0; k < f.count; k++) if (words[f.startIdx + k]) words[f.startIdx + k].removed = target;
        renderTranscript();
        recomputeCues();
        renderCaptionFrame(true);
        renderCleanupBar();
        emitChange();
      }
      return;
    }
    openWordMenu(i, wordEl);
    return;
  }

  const pauseEl = t.closest("[data-ce-pause]");
  if (pauseEl) {
    const i = Number(pauseEl.dataset.cePause);
    if (pausesRemoved.has(i)) pausesRemoved.delete(i);
    else pausesRemoved.add(i);
    renderTranscript();
    renderCleanupBar();
    updateReconcile();
    emitChange();
    return;
  }

  const scrub = t.closest("[data-ce-scrub]");
  if (scrub) {
    const r = scrub.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
    return;
  }
}

function onRootDblClick(e) {
  const wordEl = e.target.closest("[data-ce-word]");
  if (wordEl) {
    closeMenu();
    startWordEdit(Number(wordEl.dataset.ceWord), wordEl);
  }
}

function onRootInput(e) {
  const numSel = e.target.closest("[data-ce-set]");
  if (numSel) {
    const key = numSel.dataset.ceSet;
    let v = numSel.value;
    if (numSel.type === "number") {
      v = Number(v);
      if (key === "widthFraction") v = Math.max(0.3, Math.min(0.98, v / 100));
    }
    if (key === "fontWeight") v = Number(v);
    state[key] = v;
    if (
      key === "fontSizePx" ||
      key === "wordsPerCue" ||
      key === "widthFraction" ||
      key === "fontFamily" ||
      key === "fontWeight"
    )
      recomputeCues();
    repaintAll();
    emitChange();
    return;
  }
  const color = e.target.closest("[data-ce-color]");
  if (color) {
    state[color.dataset.ceColor] = color.value;
    repaintAll();
    emitChange();
    return;
  }
}

function onRootChange(e) {
  const toggle = e.target.closest("[data-ce-toggle]");
  if (toggle) {
    state[toggle.dataset.ceToggle] = toggle.checked;
    renderTabPanel();
    recomputeCues();
    repaintAll();
    emitChange();
  }
}

// ── Caption-box drag (free positioning) ─────────────────────────────
// Dragging the caption box flips position to "custom" and tracks the pointer
// as a fraction of the stage, so the box can sit anywhere on the frame.

// Handle → which dimensions it drives: wx (width: +east/-west/0) and
// fy (font/height: +down/-up/0).
const RESIZE_DIRS = {
  e: { wx: 1, fy: 0 },
  w: { wx: -1, fy: 0 },
  s: { wx: 0, fy: 1 },
  n: { wx: 0, fy: -1 },
  se: { wx: 1, fy: 1 },
  sw: { wx: -1, fy: 1 },
  ne: { wx: 1, fy: -1 },
  nw: { wx: -1, fy: -1 },
};

function onBoxPointerDown(e) {
  // Resize handle takes priority over dragging the box.
  const handle = e.target.closest("[data-ce-resize]");
  const stage = $("[data-ce-stage]");
  if (handle && stage && state.presetId !== "none") {
    e.preventDefault();
    e.stopPropagation();
    const rect = stage.getBoundingClientRect();
    resizeDrag = {
      dir: RESIZE_DIRS[handle.dataset.ceResize] || { wx: 0, fy: 0 },
      startX: e.clientX,
      startY: e.clientY,
      anchorW: state.widthFraction,
      anchorFont: state.fontSizePx,
      w: rect.width || 1,
      scale: (rect.width || 1) / DESIGN_WIDTH,
    };
    $("[data-ce-frame]")?.classList.add("is-active");
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    window.addEventListener("pointercancel", onResizeUp);
    return;
  }

  const box = e.target.closest("[data-ce-box]");
  if (!box || !stage || state.presetId === "none") return;
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  boxDrag = {
    startX: e.clientX,
    startY: e.clientY,
    anchorX: resolveXFraction(state),
    anchorY: resolveYFraction(state),
    w: rect.width || 1,
    h: rect.height || 1,
  };
  box.classList.add("is-dragging");
  window.addEventListener("pointermove", onBoxPointerMove);
  window.addEventListener("pointerup", onBoxPointerUp);
  window.addEventListener("pointercancel", onBoxPointerUp);
}

function onBoxPointerMove(e) {
  if (!boxDrag) return;
  const dx = (e.clientX - boxDrag.startX) / boxDrag.w;
  const dy = (e.clientY - boxDrag.startY) / boxDrag.h;
  state.position = "custom";
  state.xFraction = Math.max(0.08, Math.min(0.92, boxDrag.anchorX + dx));
  state.yFraction = Math.max(0.06, Math.min(0.94, boxDrag.anchorY + dy));
  applyBoxStyle();
}

function onBoxPointerUp() {
  if (!boxDrag) return;
  boxDrag = null;
  $("[data-ce-box]")?.classList.remove("is-dragging");
  window.removeEventListener("pointermove", onBoxPointerMove);
  window.removeEventListener("pointerup", onBoxPointerUp);
  window.removeEventListener("pointercancel", onBoxPointerUp);
  // Reflect the now-custom position in the Effects tab + persist.
  if (activeTab === "effects") renderTabPanel();
  emitChange();
}

// Resize: side handles change width, top/bottom change size (height via font),
// corners change both.
function onResizeMove(e) {
  if (!resizeDrag) return;
  const { dir, startX, startY, anchorW, anchorFont, w, scale } = resizeDrag;
  if (dir.wx) {
    const dxFrac = (e.clientX - startX) / w;
    state.widthFraction = Math.max(0.3, Math.min(0.98, anchorW + dir.wx * 2 * dxFrac));
  }
  if (dir.fy) {
    const dyDesign = (e.clientY - startY) / scale;
    state.fontSizePx = Math.max(24, Math.min(160, Math.round(anchorFont + dir.fy * dyDesign * 0.7)));
  }
  recomputeCues();
  applyBoxStyle();
  renderCaptionFrame(true);
}

function onResizeUp() {
  if (!resizeDrag) return;
  resizeDrag = null;
  $("[data-ce-frame]")?.classList.remove("is-active");
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointerup", onResizeUp);
  window.removeEventListener("pointercancel", onResizeUp);
  emitChange();
}

function onKeydown(e) {
  if (!mounted) return;
  if (e.key === "Escape" && menuEl) {
    closeMenu();
    return;
  }
  if (e.key === " " && !e.target.closest("[contenteditable=true], input, select, textarea")) {
    e.preventDefault();
    setPlaying(!playing);
  }
}

function applyPreset(id) {
  const p = presetById(id);
  if (!p) return;
  Object.assign(state, p.apply);
  state.presetId = id;
  renderTabPanel();
  recomputeCues();
  repaintAll();
  emitChange();
}

// ── Lifecycle ────────────────────────────────────────────────────────

export function mount(hostEl, c, src, opts = {}) {
  if (!hostEl) return;
  if (mounted) unmount();
  host = hostEl;
  clip = c;
  source = src;
  onChangeCb = typeof opts.onChange === "function" ? opts.onChange : null;

  duration = Math.max(6, (c.end || 0) - (c.start || 0));
  currentTime = 0;
  playing = false;
  cleanupActive = false;
  pausesRemoved = new Set();
  activeTab = "presets";
  renderedCueIdx = -1;

  state = c.captionState ? { ...defaultCaptionState(), ...c.captionState } : defaultCaptionState();
  words = Array.isArray(c.transcript) && c.transcript.length ? c.transcript.map((w) => ({ ...w })) : buildTranscript(c);

  host.innerHTML = INNER;
  root = host.querySelector(".cap-ed");
  mounted = true;

  root.addEventListener("click", onRootClick);
  root.addEventListener("dblclick", onRootDblClick);
  root.addEventListener("input", onRootInput);
  root.addEventListener("change", onRootChange);
  root.addEventListener("pointerdown", onBoxPointerDown);
  document.addEventListener("keydown", onKeydown);

  const stage = $("[data-ce-stage]");
  if (stage) stage.style.backgroundImage = previewBg(c.hue);
  const video = $("[data-ce-video]");
  if (video) {
    video.src = videoForClip(c);
    // The real video is the time source: once its duration is known, re-time
    // the transcript onto it so captions track the actual footage.
    const onMeta = () => retimeToVideo(video.duration);
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();
  }
  const dur = $("[data-ce-dur]");
  if (dur) dur.textContent = fmt(duration);

  recomputeCues();
  renderTranscript();
  renderTabPanel();
  requestAnimationFrame(() => {
    if (!mounted) return;
    repaintAll();
    syncTime();
  });
}

export function unmount() {
  if (!mounted) return;
  setPlaying(false);
  closeMenu();
  onBoxPointerUp();
  onResizeUp();
  document.removeEventListener("keydown", onKeydown);
  if (root) {
    root.removeEventListener("click", onRootClick);
    root.removeEventListener("dblclick", onRootDblClick);
    root.removeEventListener("input", onRootInput);
    root.removeEventListener("change", onRootChange);
    root.removeEventListener("pointerdown", onBoxPointerDown);
  }
  if (host) host.innerHTML = "";
  mounted = false;
  root = null;
  host = null;
  clip = null;
  source = null;
  onChangeCb = null;
}
