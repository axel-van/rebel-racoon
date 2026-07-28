// Shared Playbook view + per-section editor. Renders a product-grade detail
// surface — a compact identity header, a sticky section-nav rail with quick
// facts, and three section panels (Audience & goals · Voice & style · Brand) —
// plus the inline per-section edit machine. Driven by a `cfg` adapter so the
// same surface powers two contexts:
//   • onboarding (welcome-alt-recap) — a context-builder DRAFT, with a
//     staged loader and a "Save and start" finish.
//   • library (/playbook/:id)        — a saved Context, in the app shell,
//     editing straight into the store, with header actions (Start chat /
//     Edit name / Delete).
//
// The renderers operate on a plain `data` object (draft or Context — both
// expose the same field names). Persistence + chrome + copy are injected
// via `cfg`; the edit state (editScope / snapshot) lives module-local and
// is safe because only one route renders at a time.

import { html, raw, escapeHtml as esc } from "./utils.js?v=21";
import { analyzeWebsite, discoverCompetitors, competitorKey } from "./context-mock-analysis.js?v=25";
import { LANGUAGE_OPTIONS, emptyVoiceEntry } from "./languages.js?v=1";
import { isFlagOn } from "./feature-flags.js?v=15";
import { NETWORK_ICON_BY_PLATFORM, NETWORK_LABEL } from "./social-profiles.js?v=32";
import { TOPIC_SOURCES, CADENCES, DEFAULT_ENABLED_IDS, DEFAULT_CADENCE, findCadence } from "./topics-catalog.js?v=1";

// Audience & goals — chip fields (multi-value), in display order.
const GOAL_FIELDS = [
  { key: "audience", label: "Primary audience", placeholder: "Add an audience…" },
  { key: "contentStyle", label: "Content style", placeholder: "Add a style…" },
  { key: "objective", label: "Primary goal", placeholder: "Add a goal…" },
  { key: "contentAction", label: "Content action", placeholder: "Add an action…" },
];

// Voice & style — line-list fields (quoted snippets).
const LINE_FIELDS = [
  { key: "signatureHooks", label: "Signature hooks", placeholder: "A line that often opens a post…" },
  { key: "closingPatterns", label: "Closing patterns", placeholder: "A line that often ends a post…" },
];

// Competitors and Topics are appended LAST on purpose: the panel renderers
// address the first three positionally (SECTIONS[0..2]), and both read as less
// core than audience, voice and brand. Topics sits after Competitors because it
// reads them — the two competitor-driven listening sources deep-link into that
// section.
const SECTIONS = [
  { id: "pbk-sec-goals", scope: "goals", icon: "ap-icon-target", title: "Audience & goals" },
  { id: "pbk-sec-voice", scope: "voice", icon: "ap-icon-quote", title: "Voice & style" },
  { id: "pbk-sec-brand", scope: "brand", icon: "ap-icon-image", title: "Brand" },
  { id: "pbk-sec-competitors", scope: "competitors", icon: "ap-icon-buildings", title: "Competitors" },
  { id: "pbk-sec-topics", scope: "topics", icon: "ap-icon-antenna", title: "Topics" },
];

// Competitors are gated behind a feature flag (default OFF). When OFF the
// section and its rail entry disappear; the underlying data still rides along
// (the website analysis pre-fills it), exactly like multilingualPlaybook.
function competitorsOn() {
  return isFlagOn("playbookCompetitors");
}

// Same contract for Topics: flag OFF hides the section and its rail entry, but
// ctx.topics stays in the data (contexts-store normalises it either way).
function topicsOn() {
  return isFlagOn("topics");
}

// The sections this Playbook actually shows — drives the rail nav and the
// panels, so gating happens in one place.
function sectionsFor() {
  return SECTIONS.filter((s) => (s.scope !== "competitors" || competitorsOn()) && (s.scope !== "topics" || topicsOn()));
}

// Edit-mode guidance. Surfaced only while a section is being edited (one at a
// time), so the read view stays clean. Audience & goals gets a per-field hint
// (q = prompt, a = what Archie does with it); Voice & style and Brand each get
// a single "captured by Archie" banner.
const FIELD_HINTS = {
  languages: {
    q: "Which languages do you publish in?",
    a: "Pick one or more. I write posts in the language you choose — and use the native Voice examples for that language, never a translation.",
  },
  businessSummary: {
    q: "Does this describe your business correctly?",
    a: "Archie analysed your website and wrote this summary.",
  },
  audience: {
    q: "Who is your primary audience?",
    a: "Archie will tailor post topics and framing to speak directly to them.",
  },
  contentStyle: {
    q: "What content style fits your brand?",
    a: "This guides the structure and format of every post Archie writes.",
  },
  objective: {
    q: "What's your primary social media objective?",
    a: "Archie will prioritise content angles that serve this goal.",
  },
  contentAction: {
    q: "What action should your content drive?",
    a: "Archie will include relevant CTAs aligned with this action.",
  },
  ctaLinks: {
    q: "Call to action",
    a: "Archie surfaces these links when posts call for an action.",
  },
};

const SECTION_HINTS = {
  voice: {
    q: "Voice profile",
    a: "Archie captured this voice from your connected profile's recent posts.",
  },
  brand: {
    q: "Visual identity",
    a: "Archie picked these up from your site so visuals stay on-brand.",
  },
  competitors: {
    q: "Who you're up against",
    a: "Archie scans your market and proposes competitors. Add the ones that matter — a dismissed suggestion won't come back.",
  },
  topics: {
    q: "What I watch, and how often",
    a: "Archie listens to these sources and brings you the topics worth posting about. One rhythm for the whole Playbook.",
  },
};

const STAGE_MS = 2400;

let mountTarget = null;
let cfg = null;
let editScope = null; // null (read) | "goals" | "voice" | "brand" | "competitors"
let refModalIndex = null; // open reference-image detail modal (index) or null
let cmpModalIndex = null; // open competitor detail modal (index) or null
let cmpScanning = false; // "Discover competitors" scan in flight
let cmpScanTimer = null; // the scan's pending timeout
let cmpScanFoundNone = false; // last scan returned nothing new (show the note)
let refModalHost = null; // body-level portal node for the open detail modal
let snapshot = null; // deep copy of editable fields, for Cancel
let audienceCustom = false; // "Other…" picked in the Primary audience dropdown
let activeVoiceLang = null; // which language the Voice & style panel is showing/editing
let loadingTimer = null;
let loadingStage = 0;
let phase = "ready"; // "loading" | "ready"
let scrollSpy = null; // IntersectionObserver for the section-nav active state

// ── Public API ───────────────────────────────────────────────────────────

// cfg: {
//   mode: "onboarding" | "library",
//   getData(): object,                 // the live data object (draft | Context)
//   isReady(): boolean,                // analysis landed? (loader waits on it)
//   commit(): void,                    // Save — persist + notify
//   revert(snapshot): void,            // Cancel — restore editable fields
//   onPaint(): void,                   // each ready paint (e.g. reload snapshot)
//   loader: [{title,sub}] | null,      // staged loader (onboarding); null = none
//   skipLoader: boolean,               // force straight to ready
//   onIntroDone(): void,               // loader finished
//   showTop: boolean,                  // render the Archie/BETA top strip
//   headerActions(): string | null,    // html for the header action bar (library)
//   onEditName(): void,                // header name pencil (rename)
//   onToggleDefault(): void,           // header star → toggle default (library)
//   onAnalyzeVoice(): void,            // Voice & style → analyze social profiles
//   onFooter(event): boolean,          // catch-all click handler (header actions)
// }
export function mount(target, config) {
  cfg = config;
  mountTarget = target;
  editScope = null;
  snapshot = null;
  audienceCustom = false;
  cmpModalIndex = null;
  cmpScanning = false;
  cmpScanFoundNone = false;

  if (cfg.loader && !cfg.skipLoader) {
    phase = "loading";
    loadingStage = 0;
    paint();
    startLoadingSequence();
  } else {
    phase = "ready";
    paint();
  }

  const onClickH = (e) => onClick(e);
  const onInputH = (e) => onInput(e);
  const onChangeH = (e) => onChange(e);
  const onKeydownH = (e) => onKeydown(e);
  const onErrorH = (e) => onLoadError(e);
  target.addEventListener("click", onClickH);
  target.addEventListener("input", onInputH);
  target.addEventListener("change", onChangeH);
  target.addEventListener("keydown", onKeydownH);
  // Competitor favicons come from a remote service, so a domain with no icon
  // (or an offline session) has to fall back to the monogram tile. `error`
  // doesn't bubble, so this listener has to run in the CAPTURE phase — that's
  // what lets us keep the repo's "delegated handlers, no inline on*" rule.
  target.addEventListener("error", onErrorH, true);

  return () => {
    stopLoading();
    stopCompetitorScan();
    detachScrollSpy();
    target.removeEventListener("click", onClickH);
    target.removeEventListener("input", onInputH);
    target.removeEventListener("change", onChangeH);
    target.removeEventListener("keydown", onKeydownH);
    target.removeEventListener("error", onErrorH, true);
    if (refModalHost) {
      refModalHost.remove();
      refModalHost = null;
    }
    refModalIndex = null;
    cmpModalIndex = null;
    mountTarget = null;
    cfg = null;
    editScope = null;
    snapshot = null;
  };
}

function repaint() {
  if (mountTarget) paint();
}

// Repaint without losing the scroll position. paint() rebuilds the whole
// `.welcome-screen` (the scroll container), so its scrollTop resets to 0 —
// jarring for in-place toggles like the Voice language switcher. Capture the
// scroll offset and restore it onto the freshly-rendered scroller.
function repaintPreservingScroll() {
  if (!mountTarget) return;
  const top = mountTarget.querySelector(".welcome-screen")?.scrollTop ?? 0;
  paint();
  const next = mountTarget.querySelector(".welcome-screen");
  if (next) next.scrollTop = top;
}

function isReady() {
  return cfg.isReady ? cfg.isReady() : true;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── Loader ─────────────────────────────────────────────────────────────

function stopLoading() {
  if (loadingTimer) {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

function startLoadingSequence() {
  stopLoading();
  loadingTimer = window.setInterval(() => {
    if (loadingStage < cfg.loader.length - 1) {
      loadingStage += 1;
      repaint();
    } else if (isReady()) {
      stopLoading();
      cfg.onIntroDone?.();
      phase = "ready";
      repaint();
    }
    // else: hold on the final stage until the data lands.
  }, STAGE_MS);
}

// ── Data helpers ───────────────────────────────────────────────────────

function brandSite(data) {
  const sites = data?.imageVoice?.websites;
  return Array.isArray(sites) && sites.length ? sites[0] : null;
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function prettyUrl(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Default brand colours derived from the scraped site palette, so a Playbook
// that has never been hand-edited still shows named swatches the user can
// then rename / extend. Used to seed `data.brandColors` on first edit.
function deriveBrandColors(site) {
  const c = site?.colors || {};
  return [
    { name: "Primary", hex: c.primary },
    { name: "Accent", hex: c.accent },
    { name: "Background", hex: c.background },
    { name: "Text", hex: c.textPrimary },
    { name: "Link", hex: c.link },
  ].filter((s) => s.hex);
}

// The authored brand palette — user-edited `brandColors` if present, else the
// derived site palette (read-only view falls back to this).
function visualColors(data) {
  if (Array.isArray(data.brandColors) && data.brandColors.length) return data.brandColors;
  return deriveBrandColors(brandSite(data));
}

function brandFonts(data) {
  const site = brandSite(data);
  const t = data.brandTypography || {};
  return {
    headingFont: t.headingFont || site?.typography?.headingFont || site?.typography?.primaryFont || "",
    bodyFont: t.bodyFont || site?.typography?.primaryFont || "",
  };
}

// Lazily promote the derived palette / scraped fonts into editable fields the
// first time the user opens the Brand editor (alpha feedback #10).
function ensureBrand(data) {
  if (!Array.isArray(data.brandColors) || !data.brandColors.length) {
    data.brandColors = deriveBrandColors(brandSite(data));
  }
  if (!data.brandTypography || typeof data.brandTypography !== "object") {
    data.brandTypography = brandFonts(data);
  }
  if (!Array.isArray(data.referenceImages)) data.referenceImages = [];
}

// Snapshot only the user-editable fields so Cancel can restore them.
export function snapshotEditable(d) {
  return JSON.parse(
    JSON.stringify({
      name: d.name || "",
      businessSummary: d.businessSummary || "",
      audience: d.audience || [],
      contentStyle: d.contentStyle || [],
      objective: d.objective || [],
      contentAction: d.contentAction || [],
      ctaLinks: d.ctaLinks || [],
      language: d.language || "",
      languages: d.languages || [],
      primaryLanguage: d.primaryLanguage || "",
      voiceByLanguage: d.voiceByLanguage || {},
      signatureHooks: d.signatureHooks || [],
      closingPatterns: d.closingPatterns || [],
      formattingStyle: d.formattingStyle || "",
      visualStyle: d.visualStyle || "",
      voiceMode: d.voiceMode || "guided",
      voiceManual: d.voiceManual || "",
      brandPersonality: d.brandPersonality || "",
      brandTypography: d.brandTypography || null,
      brandColors: d.brandColors || [],
      referenceImages: d.referenceImages || [],
      competitors: d.competitors || [],
      dismissedCompetitors: d.dismissedCompetitors || [],
      topics: d.topics || null,
    }),
  );
}

// ── Language helpers (multilingual Playbook) ───────────────────────────────

// Multilingual Playbooks are gated behind a feature flag (default OFF). When
// OFF, a Playbook behaves single-language: only the primary language surfaces,
// no per-language voice switcher, no draft-time language question.
function multilingualOn() {
  return isFlagOn("multilingualPlaybook");
}

// The Playbook's declared languages, always a non-empty array. Collapses to
// the primary language alone when the multilingual flag is OFF (secondary
// languages stay in the data, just hidden).
function contextLanguages(data) {
  const langs = Array.isArray(data.languages) && data.languages.length ? data.languages : null;
  const primary = data.primaryLanguage || (langs && langs[0]) || data.language || "English";
  if (!multilingualOn()) return [primary];
  return langs || [primary];
}

// The language the Voice & style panel currently shows/edits — kept valid
// against the declared languages, defaulting to the primary.
function currentVoiceLang(data) {
  const langs = contextLanguages(data);
  if (!activeVoiceLang || !langs.includes(activeVoiceLang)) {
    activeVoiceLang = data.primaryLanguage && langs.includes(data.primaryLanguage) ? data.primaryLanguage : langs[0];
  }
  return activeVoiceLang;
}

// The per-language voice entry for the active language (created on demand).
// Voice examples (signatureHooks / closingPatterns / cta) are authored per
// language and NEVER machine-translated.
//
// When the entry is missing, the PRIMARY language seeds from the flat legacy
// fields — a draft fresh from the website analysis has flat signatureHooks /
// closingPatterns populated but no per-language map yet, so without this the
// recap would read "Not set yet". Secondary languages start empty (authored
// natively per language).
function voiceEntry(data) {
  const lang = currentVoiceLang(data);
  if (!data.voiceByLanguage || typeof data.voiceByLanguage !== "object") data.voiceByLanguage = {};
  if (!data.voiceByLanguage[lang]) {
    const primary = data.primaryLanguage || contextLanguages(data)[0];
    data.voiceByLanguage[lang] =
      lang === primary
        ? {
            signatureHooks: Array.isArray(data.signatureHooks) ? data.signatureHooks.slice() : [],
            closingPatterns: Array.isArray(data.closingPatterns) ? data.closingPatterns.slice() : [],
            cta: data.cta || "",
            ctaLabels: {},
          }
        : emptyVoiceEntry(data);
  }
  return data.voiceByLanguage[lang];
}

// ── Shared bits ──────────────────────────────────────────────────────────

function editActionButtons() {
  return `
    <button type="button" class="ap-button ghost grey recap__edit-cancel" data-recap-cancel>
      <span>Cancel</span>
    </button>
    <button type="button" class="ap-button primary orange recap__edit-save" data-recap-save>
      <i class="ap-icon-check"></i><span>Save changes</span>
    </button>
  `;
}

function panelPen(scope) {
  return `<button type="button" class="ap-icon-button transparent recap__panel-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit section"><i class="ap-icon-pen"></i></button>`;
}

function panelEditActions() {
  return `<div class="recap__panel-actions">${editActionButtons()}</div>`;
}

function renderPanelHead(section, edit, extraAction = "") {
  return `
    <header class="recap__panel-head">
      <span class="recap__panel-icon"><i class="${section.icon}" aria-hidden="true"></i></span>
      <h2 class="recap__panel-title">${esc(section.title)}</h2>
      ${edit ? panelEditActions() : `${extraAction}${panelPen(section.scope)}`}
    </header>
  `;
}

function renderRow(label, valueHtml) {
  return `
    <div class="recap__row">
      <span class="recap__row-label">${esc(label)}</span>
      <div class="recap__row-value">${valueHtml}</div>
    </div>
  `;
}

function renderText(text) {
  return text ? `<p class="recap__row-text">${esc(text)}</p>` : `<span class="recap__row-empty">Not set yet</span>`;
}

function renderChips(values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) return `<span class="recap__row-empty">Not set yet</span>`;
  return `<div class="recap__chips">${list
    .map((v) => `<span class="ap-tag blue recap__chip">${esc(v)}</span>`)
    .join("")}</div>`;
}

function renderQuotes(values) {
  const list = Array.isArray(values) ? values.filter((v) => (v || "").trim()) : [];
  if (!list.length) return `<span class="recap__row-empty">Not set yet</span>`;
  return `<ul class="recap__quotes">${list
    .map((v) => `<li class="recap__quote"><i class="ap-icon-quote" aria-hidden="true"></i><span>${esc(v)}</span></li>`)
    .join("")}</ul>`;
}

function renderCtaList(data) {
  const ctas = (Array.isArray(data.ctaLinks) ? data.ctaLinks : []).filter((l) => l.checked);
  if (!ctas.length) return `<span class="recap__row-empty">No links yet</span>`;
  return `<ul class="recap__cta-list">${ctas
    .map(
      (c) => `
      <li class="recap__cta">
        <i class="ap-icon-link" aria-hidden="true"></i>
        <span class="recap__cta-text">${esc(c.label || prettyUrl(c.url))}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

function renderSwatches(colors) {
  if (!colors.length) return `<span class="recap__row-empty">Not set yet</span>`;
  return `<div class="recap__swatches">${colors
    .map(
      (c) => `
      <div class="recap__swatch">
        <span class="recap__swatch-chip" style="background:${esc(c.hex || "#ffffff")};"></span>
        <span class="recap__swatch-meta">
          <span class="recap__swatch-name">${esc(c.name || "Colour")}</span>
          <span class="recap__swatch-hex">${esc((c.hex || "").toUpperCase())}</span>
        </span>
      </div>`,
    )
    .join("")}</div>`;
}

function renderTypeSpecimen(data) {
  const { headingFont, bodyFont } = brandFonts(data);
  if (!headingFont && !bodyFont) return `<span class="recap__row-empty">Not set yet</span>`;
  const cell = (role, font) => `
    <div class="recap__type-cell">
      <span class="recap__type-specimen" style="font-family:'${esc(font)}', var(--sys-text-style-body-font-family);">Ag</span>
      <span class="recap__type-meta">
        <span class="recap__type-role">${esc(role)}</span>
        <span class="recap__type-name">${esc(font || "—")}</span>
      </span>
    </div>`;
  return `<div class="recap__type-grid">${cell("Headings", headingFont)}${cell("Body", bodyFont)}</div>`;
}

// ── Edit-mode field renderers ──────────────────────────────────────────

function renderEditChips(field, values, placeholder) {
  const list = Array.isArray(values) ? values : [];
  const chips = list
    .map(
      (v, i) => `
      <span class="ap-tag blue recap__chip recap__chip--editable">
        <span>${esc(v)}</span>
        <button type="button" data-recap-chip-remove="${field}" data-recap-chip-index="${i}" aria-label="Remove ${esc(v)}">
          <i class="ap-icon-close"></i>
        </button>
      </span>
    `,
    )
    .join("");
  return `
    <div class="recap__chips recap__chips--edit">
      ${chips}
      <span class="recap__chip-add">
        <div class="ap-input-group recap__chip-add-field">
          <input type="text" data-recap-chip-input="${field}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
        </div>
        <button type="button" class="ap-icon-button stroked grey recap__chip-add-btn" data-recap-chip-add="${field}" aria-label="Add">
          <i class="ap-icon-plus"></i>
        </button>
      </span>
    </div>
  `;
}

// Primary audience is single-select. Build the option pool from Archie's
// analysed audiences (the onboarding draft carries them in
// `suggestions.audience`; a saved Playbook with a website re-derives them
// live), unioned with whatever's currently selected so nothing is ever lost.
function audienceOptionPool(data) {
  const current = Array.isArray(data.audience) ? data.audience : [];
  let analysed = data.suggestions && Array.isArray(data.suggestions.audience) ? data.suggestions.audience : [];
  if (!analysed.length && data.websiteUrl) {
    try {
      analysed = analyzeWebsite(data.websiteUrl)?.suggestions?.audience || [];
    } catch {
      analysed = [];
    }
  }
  const pool = [];
  const seen = new Set();
  const add = (v) => {
    const t = (v || "").trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    pool.push(t);
  };
  analysed.forEach(add);
  current.forEach(add);
  return pool;
}

// Single-select audience picker: Archie's analysed audiences are the options
// of a native dropdown (one choice only), with a trailing "Other…" entry that
// reveals a free-text input to define a custom audience. Built on the DS
// `.ap-select` dropdown (the same component as the Batch Studio playbook picker)
// so the single-choice nature reads as a proper dropdown. Options are addressed
// by index — the pool is recomputed deterministically on pick. `audienceCustom`
// (module-local, reset whenever the edit scope changes) tracks the "Other…" state.
function renderAudiencePicker(data) {
  const pool = audienceOptionPool(data);
  const selected = Array.isArray(data.audience) && data.audience.length ? data.audience[0] : "";
  const options = pool
    .map((v, i) => {
      const on = !audienceCustom && v.toLowerCase() === selected.toLowerCase();
      return `<div class="ap-select-option${on ? " selected" : ""}" data-recap-audience-pick="${i}" role="option" aria-selected="${on}">
          <span class="ap-select-option-text">${esc(v)}</span>
          ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const otherOption = `<div class="ap-select-option${audienceCustom ? " selected" : ""}" data-recap-audience-pick="other" role="option" aria-selected="${audienceCustom}">
      <i class="ap-icon-plus ap-select-option-icon" aria-hidden="true"></i>
      <span class="ap-select-option-text">Other — define your own…</span>
    </div>`;
  const triggerLabel = audienceCustom ? "Other — define your own…" : selected;
  return `
    <div class="recap__audience-picker">
      <details class="ap-select recap__audience-select" data-recap-audience-details>
        <summary class="ap-select-trigger">
          <span class="ap-select-value${triggerLabel ? "" : " ap-select-placeholder"}">${esc(triggerLabel || "Choose an audience")}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown" role="listbox" aria-label="Primary audience">
          <div class="ap-select-options">${options}${otherOption}</div>
        </div>
      </details>
      ${
        audienceCustom
          ? `<span class="recap__chip-add recap__audience-add">
        <div class="ap-input-group recap__chip-add-field">
          <input type="text" data-recap-audience-input placeholder="Define your audience…" aria-label="Define your audience" />
        </div>
        <button type="button" class="ap-icon-button stroked grey recap__chip-add-btn" data-recap-audience-add aria-label="Add audience">
          <i class="ap-icon-plus"></i>
        </button>
      </span>`
          : ``
      }
    </div>
  `;
}

function renderLineEditor(field, values, placeholder) {
  const list = Array.isArray(values) ? values : [];
  const rows = list
    .map(
      (v, i) => `
      <div class="recap__line-edit">
        <div class="ap-input-group recap__line-edit-field">
          <input type="text" data-recap-line-field data-recap-line-list="${field}" data-recap-line-index="${i}" value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
        </div>
        <button type="button" class="recap__cta-remove" data-recap-line-remove data-recap-line-list="${field}" data-recap-line-index="${i}" aria-label="Remove line">
          <i class="ap-icon-close"></i>
        </button>
      </div>`,
    )
    .join("");
  return `
    <div class="recap__line-list">${rows}</div>
    <button type="button" class="ap-button secondary blue recap__add-row" data-recap-line-add="${field}">
      <i class="ap-icon-plus"></i><span>Add line</span>
    </button>
  `;
}

function renderTextarea(field, value, placeholder) {
  return `
    <div class="ap-textarea-field resizable">
      <textarea data-recap-text="${field}" rows="3" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea>
    </div>
  `;
}

function renderCtaEditor(data) {
  const allCtas = Array.isArray(data.ctaLinks) ? data.ctaLinks : [];
  const rows = allCtas
    .map((c, i) => ({ ...c, _i: i }))
    .filter((c) => c.checked || c.suggested === false)
    .map(
      (c) => `
      <div class="recap__cta-edit">
        <div class="ap-input-group recap__cta-edit-label">
          <input type="text" data-recap-cta-field="label" data-recap-cta-index="${c._i}" value="${esc(c.label || "")}" placeholder="Label" aria-label="CTA label" />
        </div>
        <div class="ap-input-group recap__cta-edit-url">
          <input type="text" data-recap-cta-field="url" data-recap-cta-index="${c._i}" value="${esc(c.url || "")}" placeholder="https://…" aria-label="CTA URL" />
        </div>
        <button type="button" class="recap__cta-remove" data-recap-cta-remove="${c._i}" aria-label="Remove link">
          <i class="ap-icon-close"></i>
        </button>
      </div>
    `,
    )
    .join("");
  return `
    <div class="recap__cta-edit-list">${rows}</div>
    <button type="button" class="ap-button secondary blue recap__add-row" data-recap-cta-add>
      <i class="ap-icon-plus"></i><span>Add link</span>
    </button>
  `;
}

// Reference-image gallery (#11) — up to 10 visual references, each with
// optional usage guidance (a freeform note + target networks).
const MAX_REF_IMAGES = 10;
const REF_NETWORKS = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"];

// Read-only network mini-badges (icons only) for an image's target networks.
function renderRefNetBadges(networks) {
  const nets = Array.isArray(networks) ? networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  if (!nets.length) return "";
  return `<span class="recap__refimg-nets">${nets
    .map(
      (n) =>
        `<i class="${NETWORK_ICON_BY_PLATFORM[n]}" title="${esc(NETWORK_LABEL[n] || n)}" aria-label="${esc(NETWORK_LABEL[n] || n)}"></i>`,
    )
    .join("")}</span>`;
}

// Edit-mode network toggles — compact icon-only buttons (recognizable logos +
// a selection ring) so they stay one tidy row at any panel width. The platform
// name rides on title/aria-label.
function renderRefNetChips(networks, i) {
  const nets = Array.isArray(networks) ? networks : [];
  return `<div class="recap__refedit-nets">${REF_NETWORKS.map((n) => {
    const on = nets.includes(n);
    const label = esc(NETWORK_LABEL[n] || n);
    return `<button type="button" class="recap__refedit-net" aria-pressed="${on}" data-recap-refnet="${n}" data-recap-refimg-index="${i}" title="${label}" aria-label="${label}"><i class="${NETWORK_ICON_BY_PLATFORM[n]}" aria-hidden="true"></i></button>`;
  }).join("")}</div>`;
}

// Deterministic mock "vision" read of an image — the indications Archie surfaces
// (dominant colours + scene/subject tags). Stable per image (hashed from its
// label/seed), since the prototype has no real image analysis.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const REF_TAG_POOLS = [
  [/ui|product|screen|app|dashboard/, ["Product UI", "Screens", "Tech"]],
  [/team|people|candid|portrait|face|hiring/, ["People", "Candid", "Human"]],
  [/brand|board|palette|logo|identity/, ["Brand", "Studio", "Graphic"]],
  [/office|desk|work|laptop/, ["Workplace", "Indoor", "Lifestyle"]],
  [/nature|outdoor|landscape|mountain|city|street|scene/, ["Outdoor", "Scene", "Editorial"]],
];
const REF_TAG_FALLBACK = ["Photographic", "Editorial", "Lifestyle", "Minimal", "Vibrant", "Muted", "Candid", "Studio"];

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (n) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(0)}${to(8)}${to(4)}`;
}

// Deterministic mock signals for an image that has no stored tags/colours yet.
function refImageSignals(img) {
  const key = (img.label || img.id || img.url || "image").toLowerCase();
  const h = hashStr(key);
  const palette = [30, 50, 66, 82].map((lig, i) => {
    const hue = (((h >> (i * 5)) % 360) + 360) % 360;
    const sat = 42 + ((h >> (i * 3)) % 34);
    return hslToHex(hue, sat, lig);
  });
  let tags = null;
  for (const [re, t] of REF_TAG_POOLS) {
    if (re.test(key)) {
      tags = t;
      break;
    }
  }
  if (!tags) tags = [0, 1, 2].map((i) => REF_TAG_FALLBACK[(h >> (i * 4)) % REF_TAG_FALLBACK.length]);
  return { palette, tags: [...new Set(tags)] };
}

// An image's tags / colours — stored on the image once edited, else the mock
// signals (seeded lazily so the first edit has something to mutate).
function refTags(img) {
  return Array.isArray(img.tags) ? img.tags : refImageSignals(img).tags;
}
function refColors(img) {
  return Array.isArray(img.colors) ? img.colors : refImageSignals(img).palette;
}
// Promote the mock signals onto the image so the first edit has arrays to mutate.
function ensureRefTagsColors(img) {
  if (!Array.isArray(img.tags)) img.tags = refImageSignals(img).tags.slice();
  if (!Array.isArray(img.colors)) img.colors = refImageSignals(img).palette.slice();
}

// Gallery of reference-image thumbnails (read + edit). Cards stay a clean
// thumbnail — all detail (extracted tags/colours, notes, target networks) lives
// in the per-image modal opened on click. Edit mode adds a remove handle + Add.
function renderRefImages(data, edit) {
  const imgs = Array.isArray(data.referenceImages) ? data.referenceImages : [];
  if (!imgs.length && !edit) return `<span class="recap__row-empty">None yet</span>`;
  const cards = imgs
    .map(
      (img, i) => `
      <div class="recap__refcard">
        <button type="button" class="recap__refcard-open" data-recap-refimg-open="${i}" aria-label="${edit ? "Edit" : "View"} ${esc(img.label || "reference image")} details">
          <img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" loading="lazy" />
          <span class="recap__refcard-overlay" aria-hidden="true"><i class="ap-icon-${edit ? "pen" : "info"}"></i><span>${edit ? "Edit details" : "View details"}</span></span>
        </button>
        ${edit ? `<button type="button" class="recap__refimg-remove recap__refcard-remove" data-recap-refimg-remove="${i}" aria-label="Remove image"><i class="ap-icon-close"></i></button>` : ""}
      </div>`,
    )
    .join("");
  const addBtn =
    edit && imgs.length < MAX_REF_IMAGES
      ? `<button type="button" class="ap-button secondary blue recap__refedit-add" data-recap-refimg-add>
           <i class="ap-icon-plus"></i><span>Add reference image</span>
         </button>
         <input type="file" accept="image/*" multiple hidden data-recap-refimg-input />`
      : "";
  return `<div class="recap__refgallery">${cards}</div>${addBtn}`;
}

// Per-image detail modal — big preview + Archie's extracted indications, then
// the usage notes + target networks (editable in edit mode, read-only otherwise).
function renderRefModal(data) {
  if (refModalIndex == null) return "";
  const imgs = Array.isArray(data.referenceImages) ? data.referenceImages : [];
  const img = imgs[refModalIndex];
  if (!img) return "";
  const i = refModalIndex;
  const edit = editScope === "brand"; // editable only while the Brand section is
  const tags = refTags(img);
  const colors = refColors(img);

  const tagsBlock = edit
    ? `<div class="recap__reftags">
        ${tags
          .map(
            (t, ti) =>
              `<span class="ap-tag grey"><span>${esc(t)}</span><button type="button" data-recap-reftag-remove data-recap-refimg-index="${i}" data-recap-tag-index="${ti}" aria-label="Remove ${esc(t)}"><i class="ap-icon-close"></i></button></span>`,
          )
          .join("")}
        <input type="text" class="recap__reftag-input" data-recap-reftag-input data-recap-refimg-index="${i}" placeholder="Add tag…" aria-label="Add tag" />
      </div>`
    : `<div class="recap__reftags">${
        tags.map((t) => `<span class="ap-tag grey"><span>${esc(t)}</span></span>`).join("") ||
        `<span class="recap__refmodal-empty">None</span>`
      }</div>`;

  const colorsBlock = edit
    ? `<div class="recap__refcolors">
        ${colors
          .map(
            (c, ci) =>
              `<span class="recap__refcolor"><input type="color" class="recap__refcolor-input" value="${esc(c)}" data-recap-refcolor data-recap-refimg-index="${i}" data-recap-color-index="${ci}" aria-label="Colour ${ci + 1}" /><button type="button" class="recap__refcolor-x" data-recap-refcolor-remove data-recap-refimg-index="${i}" data-recap-color-index="${ci}" aria-label="Remove colour"><i class="ap-icon-close"></i></button></span>`,
          )
          .join("")}
        <button type="button" class="recap__refcolor-add" data-recap-refcolor-add data-recap-refimg-index="${i}" aria-label="Add colour"><i class="ap-icon-plus"></i></button>
      </div>`
    : `<div class="recap__refcolors">${
        colors
          .map((c) => `<span class="recap__refmodal-dot" style="background:${esc(c)};" title="${esc(c)}"></span>`)
          .join("") || `<span class="recap__refmodal-empty">None</span>`
      }</div>`;

  const notes = edit
    ? `<div class="ap-textarea-field resizable">
        <textarea data-recap-refnote data-recap-refimg-index="${i}" rows="3" placeholder="How &amp; when to use this image — do's &amp; don'ts, style notes…" aria-label="Usage guidance">${esc(img.note || "")}</textarea>
      </div>`
    : img.note && img.note.trim()
      ? `<p class="recap__refmodal-note">${esc(img.note)}</p>`
      : `<p class="recap__refmodal-empty">No notes yet.</p>`;
  const netsBlock = edit
    ? renderRefNetChips(img.networks, i)
    : renderRefNetBadges(img.networks) || `<span class="recap__refmodal-empty">Any network.</span>`;
  const removeBtn = edit
    ? `<button type="button" class="ap-button transparent grey" data-recap-refimg-remove="${i}"><i class="ap-icon-trash"></i><span>Remove image</span></button>`
    : "";
  // DS dialog chrome (.ap-dialog + header/close/content/footer) inside a
  // centered .app-modal-backdrop scrim.
  return `
  <div class="app-modal-backdrop recap__refmodal-backdrop" data-recap-refmodal-backdrop>
    <aside class="ap-dialog recap__refmodal" role="dialog" aria-modal="true" aria-label="Reference image">
      <div class="ap-dialog-header"><span class="ap-dialog-title">Reference image</span></div>
      <button type="button" class="ap-dialog-close" data-recap-refimg-close aria-label="Close"><i class="ap-icon-close"></i></button>
      <div class="ap-dialog-content recap__refmodal-content">
        <div class="recap__refmodal-grid">
          <div class="recap__refmodal-preview"><img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" /></div>
          <div class="recap__refmodal-panel">
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Tags</span>
              ${tagsBlock}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Dominant colours</span>
              ${colorsBlock}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Usage notes</span>
              ${notes}
            </div>
            <div class="recap__refmodal-sec">
              <span class="recap__refedit-flabel">Best for</span>
              ${netsBlock}
            </div>
          </div>
        </div>
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-left">${removeBtn}</div>
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button primary orange" data-recap-refimg-close><span>Done</span></button>
        </div>
      </div>
    </aside>
  </div>`;
}

// Per-field edit hint (Audience & goals) — prompt + what Archie does with it.
function renderFieldHint(hint) {
  if (!hint) return "";
  return `<div class="recap__field-hint"><span class="recap__field-hint-q">${esc(hint.q)}</span><span class="recap__field-hint-a">${esc(hint.a)}</span></div>`;
}

// Static Archie brand mark (same glyph as the loader, sans the SMIL pop
// animation). Paints with currentColor so the banner can tint it brand orange.
const ARCHIE_MARK_SVG = `<svg class="recap__panel-hint-icon" viewBox="0 0 227.15 170.03" aria-hidden="true"><path fill="currentColor" d="M227.15,81.98v29.37c0,4.69-3.81,8.5-8.5,8.5h-29.37c-4.69,0-8.5-3.81-8.5-8.5v-27.11c0-4.69-3.78-8.5-8.47-8.5h-27.45c-4.69,0-8.5,3.81-8.5,8.5v26.91c0,4.69-3.78,8.47-8.47,8.47h-28.92c-4.69,0-8.5,3.81-8.5,8.5v33.89c0,4.69-3.78,8.47-8.47,8.47h-32.67c-4.69,0-8.47-3.78-8.47-8.47v-34.03c0-4.69-3.81-8.47-8.5-8.47H8.47c-4.69,0-8.47-3.81-8.47-8.5v-23.86c0-4.69,3.78-8.47,8.47-8.47h23.89c4.69,0,8.5-3.81,8.5-8.5v-14.18c0-4.69,3.78-8.5,8.47-8.5h16.07c4.69,0,8.47-3.78,8.47-8.44V8.5C73.87,3.81,77.66,0,82.34,0h32.64C119.67,0,123.46,3.81,123.46,8.5v32.11c0,4.69-3.78,8.47-8.47,8.47h-32.64c-4.69,0-8.47,3.81-8.47,8.5v14.46c0,4.69-3.81,8.5-8.5,8.5h-16.04c-4.69,0-8.47,3.78-8.47,8.47v20.05c0,4.69,3.78,8.5,8.47,8.5h32.67c4.69,0,8.47-3.81,8.47-8.5v-26.83c0-4.72,3.81-8.5,8.5-8.5h30.38c3.87,0,7-3.13,7-7v-26.94c0-4.69,3.81-8.5,8.5-8.5h27.45c4.69,0,8.47,3.81,8.47,8.5v25.22c0,4.69,3.81,8.47,8.5,8.47h29.37c4.69,0,8.5,3.81,8.5,8.5Z"/></svg>`;

// Section-level edit banner (Voice & style, Brand) — where Archie sourced it.
// Butter background + the Archie mark in brand orange ("captured by Archie").
function renderSectionHint(hint) {
  if (!hint) return "";
  return `
    <div class="recap__panel-hint">
      ${ARCHIE_MARK_SVG}
      <div class="recap__panel-hint-text">
        <span class="recap__panel-hint-q">${esc(hint.q)}</span>
        <span class="recap__panel-hint-a">${esc(hint.a)}</span>
      </div>
    </div>`;
}

// ── Section panels ─────────────────────────────────────────────────────

// Read view — the declared languages as chips, the primary one marked.
function renderLanguageChips(data) {
  const langs = contextLanguages(data);
  const primary = data.primaryLanguage || langs[0];
  return `<div class="recap__chips">${langs
    .map(
      (l) =>
        `<span class="ap-tag blue recap__chip">${esc(l)}${l === primary && langs.length > 1 ? ` <span class="recap__lang-primary-tag">primary</span>` : ""}</span>`,
    )
    .join("")}</div>`;
}

// Edit view — toggle chips for language membership + a primary-language picker
// when more than one is selected. Voice examples are then authored per language
// in the Voice & style panel (never machine-translated).
function renderLanguagePicker(data) {
  const selected = contextLanguages(data);
  const primary = data.primaryLanguage || selected[0];
  // Single-language mode (flag OFF) — a plain picker fixed to the primary
  // language, matching the pre-multilingual behaviour.
  if (!multilingualOn()) {
    return `<select class="ap-native-select recap__lang-select" data-recap-primary-language aria-label="Language">
      <option value="${esc(primary)}" selected>${esc(primary)}</option>
    </select>`;
  }
  const chips = LANGUAGE_OPTIONS.map((o) => {
    const on = selected.includes(o);
    return `<button type="button" class="ap-filter-chip" aria-pressed="${on}" data-recap-lang-toggle="${esc(o)}">${esc(o)}</button>`;
  }).join("");
  const primaryPicker =
    selected.length > 1
      ? `<label class="recap__lang-primary">
           <span class="recap__lang-primary-label">Primary — the language I write in by default</span>
           <select class="ap-native-select recap__lang-select" data-recap-primary-language aria-label="Primary language">
             ${selected.map((o) => `<option value="${esc(o)}" ${o === primary ? "selected" : ""}>${esc(o)}</option>`).join("")}
           </select>
         </label>`
      : "";
  return `<div class="recap__lang-picker" data-recap-langs>${chips}</div>${primaryPicker}`;
}

function renderGoalsPanel(data, edit) {
  const section = SECTIONS[0];
  let body;
  if (edit) {
    body = [
      renderRow(
        contextLanguages(data).length > 1 ? "Languages" : "Language",
        (multilingualOn() ? renderFieldHint(FIELD_HINTS.languages) : "") + renderLanguagePicker(data),
      ),
      renderRow(
        "Business",
        renderFieldHint(FIELD_HINTS.businessSummary) +
          `<div class="ap-textarea-field resizable">
           <textarea data-recap-summary rows="4" placeholder="Describe your business in a few sentences…">${esc(data.businessSummary || "")}</textarea>
         </div>`,
      ),
      ...GOAL_FIELDS.map((f) =>
        renderRow(
          f.label,
          renderFieldHint(FIELD_HINTS[f.key]) +
            (f.key === "audience" ? renderAudiencePicker(data) : renderEditChips(f.key, data[f.key], f.placeholder)),
        ),
      ),
      renderRow("CTA links", renderFieldHint(FIELD_HINTS.ctaLinks) + renderCtaEditor(data)),
    ].join("");
  } else {
    body = [
      // Mirror the edit order: language leads the panel so the recap surfaces
      // which language(s) Archie writes in (it's the first field in edit mode).
      renderRow(contextLanguages(data).length > 1 ? "Languages" : "Language", renderLanguageChips(data)),
      renderRow("Business", renderText(data.businessSummary)),
      // Primary audience is single-select, so show it as plain text rather than
      // a one-chip row; the other goal fields stay multi-value chips.
      ...GOAL_FIELDS.map((f) =>
        renderRow(f.label, f.key === "audience" ? renderText((data.audience || [])[0]) : renderChips(data[f.key])),
      ),
      renderRow("CTA links", renderCtaList(data)),
    ].join("");
  }
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${edit ? "data-recap-editing-card" : ""}>
      ${renderPanelHead(section, edit)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// Guided ⇄ Free-form switch for the Voice & style section (edit mode).
function renderVoiceModeToggle(mode) {
  const manual = mode === "manual";
  return `
    <div class="recap__voice-mode" role="group" aria-label="Voice format">
      <button type="button" class="ap-filter-chip" aria-pressed="${!manual}" data-recap-voice-mode="guided">Guided</button>
      <button type="button" class="ap-filter-chip" aria-pressed="${manual}" data-recap-voice-mode="manual">Write it yourself</button>
    </div>`;
}

// Per-language switcher for the guided Voice examples. Only shown when the
// Playbook has more than one language — signature hooks + closing patterns are
// authored natively per language, never translated.
function renderVoiceLangSwitcher(data) {
  const langs = contextLanguages(data);
  if (langs.length < 2) return "";
  const active = currentVoiceLang(data);
  return `
    <div class="recap__voice-langs" role="group" aria-label="Voice language">
      <span class="recap__voice-langs-label">Examples for</span>
      <div class="recap__voice-langs-group">
        ${langs
          .map(
            (l) =>
              `<button type="button" class="ap-filter-chip" aria-pressed="${l === active}" data-recap-voice-lang="${esc(l)}">${esc(l)}</button>`,
          )
          .join("")}
      </div>
    </div>`;
}

function renderVoicePanel(data, edit) {
  const section = SECTIONS[1];
  const manual = data.voiceMode === "manual";
  const ve = voiceEntry(data);
  let body;
  if (edit) {
    const fields = manual
      ? `<div class="recap__manual">
           <div class="ap-textarea-field resizable">
             <textarea data-recap-text="voiceManual" rows="10" placeholder="Write your voice in your own words — how you open, your tone, the way you format posts, and anything to avoid…">${esc(data.voiceManual || "")}</textarea>
           </div>
         </div>`
      : [
          renderVoiceLangSwitcher(data),
          ...LINE_FIELDS.map((f) => renderRow(f.label, renderLineEditor(f.key, ve[f.key], f.placeholder))),
          renderRow(
            "Formatting",
            renderTextarea(
              "formattingStyle",
              data.formattingStyle,
              "How posts are structured — line breaks, lists, rhythm…",
            ),
          ),
          renderRow(
            "Visual style",
            renderTextarea("visualStyle", data.visualStyle, "Emoji use, capitalisation, hashtags, links…"),
          ),
        ].join("");
    body = renderSectionHint(SECTION_HINTS.voice) + renderVoiceModeToggle(data.voiceMode) + fields;
  } else if (manual) {
    body = renderRow("In your words", renderText(data.voiceManual));
  } else {
    body = [
      renderVoiceLangSwitcher(data),
      renderRow("Signature hooks", renderQuotes(ve.signatureHooks)),
      renderRow("Closing patterns", renderQuotes(ve.closingPatterns)),
      renderRow("Formatting", renderText(data.formattingStyle)),
      renderRow("Visual style", renderText(data.visualStyle)),
    ].join("");
  }
  // "Learn from…" — a single DS dropdown that merges the old "Learn from my
  // posts" (social profiles) and document analysis, both scoped to Voice & style.
  const analyzeBtn =
    !edit && cfg.onAnalyzeVoice
      ? `<details class="recap__panel-menu" data-recap-learn-menu>
          <summary class="ap-button ghost grey recap__panel-action recap__panel-menu-toggle">
            <i class="ap-icon-double-chat-bubbles" aria-hidden="true"></i>
            <span>Learn from…</span>
            <i class="ap-icon-chevron-down recap__menu-caret" aria-hidden="true"></i>
          </summary>
          <div class="ap-action-dropdown recap__panel-menu-pop" role="menu" aria-label="Learn voice from">
            <button type="button" class="ap-action-dropdown-item" data-recap-learn="posts" role="menuitem">
              <i class="ap-icon-double-chat-bubbles"></i>
              <div class="ap-action-dropdown-item-text"><div class="ap-action-dropdown-item-label-container"><span class="ap-action-dropdown-item-label">My posts</span></div></div>
            </button>
            <button type="button" class="ap-action-dropdown-item" data-recap-learn="documents" role="menuitem">
              <i class="ap-icon-file--text"></i>
              <div class="ap-action-dropdown-item-text"><div class="ap-action-dropdown-item-label-container"><span class="ap-action-dropdown-item-label">Documents…</span></div></div>
            </button>
          </div>
        </details>`
      : "";
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${edit ? "data-recap-editing-card" : ""}>
      ${renderPanelHead(section, edit, analyzeBtn)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

function renderBrandPanel(data, edit) {
  const section = SECTIONS[2];
  const colors = visualColors(data);
  let body;
  if (edit) {
    const fonts = data.brandTypography || brandFonts(data);
    const colorRows = (Array.isArray(data.brandColors) ? data.brandColors : [])
      .map(
        (c, i) => `
        <div class="recap__color-row">
          <span class="recap__color-swatch" data-recap-color-swatch="${i}" style="background:${esc(c.hex || "#ffffff")};"></span>
          <input type="text" class="recap__color-name" data-recap-color-field="name" data-recap-color-index="${i}" value="${esc(c.name || "")}" placeholder="Name" aria-label="Colour name" />
          <input type="text" class="recap__color-hex" data-recap-color-field="hex" data-recap-color-index="${i}" value="${esc(c.hex || "")}" placeholder="#1A1F36" aria-label="Hex value" spellcheck="false" />
          <button type="button" class="ap-icon-button transparent grey" data-recap-color-remove="${i}" aria-label="Remove colour"><i class="ap-icon-close"></i></button>
        </div>`,
      )
      .join("");
    body = [
      renderSectionHint(SECTION_HINTS.brand),
      renderRow(
        "Brand color",
        `<div class="recap__colors" data-recap-colors>${colorRows}</div>
         <button type="button" class="ap-button secondary blue recap__color-add" data-recap-color-add>
           <i class="ap-icon-plus"></i><span>Add colour</span>
         </button>`,
      ),
      renderRow(
        "Typography",
        `<div class="recap__typo-edit">
           <div class="ap-input-group">
             <input type="text" data-recap-typo="headingFont" value="${esc(fonts.headingFont || "")}" placeholder="Headings font" aria-label="Headings font" />
           </div>
           <div class="ap-input-group">
             <input type="text" data-recap-typo="bodyFont" value="${esc(fonts.bodyFont || "")}" placeholder="Body font" aria-label="Body font" />
           </div>
         </div>`,
      ),
      renderRow(
        "Personality",
        renderTextarea(
          "brandPersonality",
          data.brandPersonality,
          "How the brand comes across — its character in a few sentences…",
        ),
      ),
      // Reference images live under Brand. They're always-editable (per-image
      // modal + remove + add) regardless of the Brand section's edit state.
      renderRow("Reference images", renderRefImages(data, true)),
    ].join("");
  } else {
    body = [
      renderRow("Brand color", renderSwatches(colors)),
      renderRow("Typography", renderTypeSpecimen(data)),
      renderRow("Personality", renderText(data.brandPersonality)),
      renderRow("Reference images", renderRefImages(data, false)),
    ].join("");
  }
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${edit ? "data-recap-editing-card" : ""}>
      ${renderPanelHead(section, edit)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// ── Competitors ────────────────────────────────────────────────────────
//
// The market the brand is measured against. Archie pre-fills the list from the
// website analysis (each entry flagged `suggested`) and can scan for more on
// demand; the user prunes it and adds the ones Archie missed.
//
// A competitor's logo is never stored — it's resolved from its domain through a
// favicon service at render time, with a monogram tile as the fallback (wired
// by the capturing `error` listener in mount()).

const MAX_COMPETITORS = 12;
const CMP_SCAN_MS = 1600;

function competitorDomain(c) {
  const raw = (c?.websiteUrl || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function competitorLogoUrl(c) {
  if (c?.logo) return c.logo;
  const domain = competitorDomain(c);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : "";
}

// Deterministic monogram tint so a competitor keeps the same colour across
// repaints. Reuses the reference-image hash + HSL helpers rather than adding
// a second bit of colour maths to this file.
function competitorAccent(c) {
  const key = (c?.name || competitorDomain(c) || "competitor").toLowerCase();
  const h = hashStr(key);
  return hslToHex(h % 360, 44 + ((h >> 5) % 26), 42);
}

// Monogram letter. A leading article is skipped so names like "The category
// incumbent" / "The low-cost challenger" don't all read as the same "T".
function competitorInitial(c) {
  const source = (c?.name || competitorDomain(c) || "").trim().replace(/^(the|a|an)\s+/i, "");
  return (source.charAt(0) || "?").toUpperCase();
}

function competitorList(data) {
  if (!Array.isArray(data.competitors)) data.competitors = [];
  return data.competitors;
}

function dismissedList(data) {
  if (!Array.isArray(data.dismissedCompetitors)) data.dismissedCompetitors = [];
  return data.dismissedCompetitors;
}

// `suggested: true` is a PENDING proposal from Archie — it is NOT part of the
// Playbook until the user accepts it. Anything that counts a Playbook's
// competitors (the section's own grid, the /contexts card counter) must skip
// them; only the "Suggested by Archie" tray reads them.
function pendingCompetitors(data) {
  return competitorList(data).filter((c) => c.suggested);
}

// Logo tile — the remote favicon plus a monogram twin that onLoadError reveals
// when the favicon can't load (domain with no icon, blocked request, offline).
// A competitor with no website has nothing to resolve, so it renders monogram-only.
function renderCompetitorLogo(c, size = 36) {
  const px = Number(size) || 36;
  const url = competitorLogoUrl(c);
  const mono = `<span class="recap__cmp-logo recap__cmp-logo--mono${url ? " is-hidden" : ""}" style="--cmp-accent:${esc(
    competitorAccent(c),
  )};--cmp-logo-size:${px}px;" aria-hidden="true">${esc(competitorInitial(c))}</span>`;
  if (!url) return mono;
  return `<img class="recap__cmp-logo" src="${esc(
    url,
  )}" alt="" width="${px}" height="${px}" loading="lazy" style="--cmp-logo-size:${px}px;" data-recap-cmp-logo />${mono}`;
}

// Read-only network badges for a competitor's social profiles. Rendered as
// plain icons on the card (which is itself a button — no nested links) and as
// real links in the modal.
function competitorSocials(c) {
  return (Array.isArray(c?.socials) ? c.socials : []).filter((s) => s && NETWORK_ICON_BY_PLATFORM[s.network]);
}

function renderCompetitorNetIcons(c) {
  const socials = competitorSocials(c);
  if (!socials.length) return "";
  return `<span class="recap__cmp-nets">${socials
    .map((s) => {
      const label = esc(NETWORK_LABEL[s.network] || s.network);
      return `<i class="${NETWORK_ICON_BY_PLATFORM[s.network]}" title="${label}" aria-label="${label}"></i>`;
    })
    .join("")}</span>`;
}

function renderCompetitorNetLinks(c) {
  const socials = competitorSocials(c);
  if (!socials.length) return `<span class="recap__cmpmodal-empty">No social profiles yet.</span>`;
  return `<span class="recap__cmp-netlinks">${socials
    .map((s) => {
      const label = esc(NETWORK_LABEL[s.network] || s.network);
      return `<a class="recap__cmp-netlink" href="${esc(
        s.url,
      )}" target="_blank" rel="noopener noreferrer" title="${label}"><i class="${
        NETWORK_ICON_BY_PLATFORM[s.network]
      }" aria-hidden="true"></i><span>${label}</span></a>`;
    })
    .join("")}</span>`;
}

// One competitor card. `i` is the index into the FULL competitors array (both
// states share it) so the handlers stay index-addressed.
//
// A pending card reads as a proposal, not as a Playbook entry: dashed border,
// recessed surface, and its own Add / Dismiss row. Those two buttons must be
// SIBLINGS of the open-button (the card body is itself a <button>, so nesting
// them would be invalid HTML), hence the flex-column card container.
function renderCompetitorCard(c, i, { edit = false, pending = false } = {}) {
  const domain = competitorDomain(c);
  const desc = (c.description || "").trim();
  const name = esc(c.name || "competitor");
  const nets = renderCompetitorNetIcons(c);
  return `
    <div class="recap__cmpcard${pending ? " recap__cmpcard--suggested" : ""}">
      <button type="button" class="recap__cmpcard-open" data-recap-cmp-open="${i}" aria-label="${
        edit && !pending ? "Edit" : "View"
      } ${name} details">
        <span class="recap__cmpcard-head">
          ${renderCompetitorLogo(c, 36)}
          <span class="recap__cmpcard-id">
            <span class="recap__cmpcard-name">${esc(c.name || "Untitled competitor")}</span>
            ${domain ? `<span class="recap__cmpcard-domain">${esc(domain)}</span>` : ""}
          </span>
        </span>
        <span class="recap__cmpcard-desc${desc ? "" : " recap__cmpcard-desc--empty"}">${
          desc ? esc(desc) : "No description yet"
        }</span>
        ${nets ? `<span class="recap__cmpcard-foot">${nets}</span>` : ""}
      </button>
      ${
        pending
          ? `<div class="recap__cmpcard-actions">
               <button type="button" class="ap-button secondary blue recap__cmpcard-act" data-recap-cmp-accept="${i}">
                 <i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span>
               </button>
               <button type="button" class="ap-button ghost grey recap__cmpcard-act" data-recap-cmp-dismiss="${i}">
                 <span>Dismiss</span>
               </button>
             </div>`
          : edit
            ? `<button type="button" class="recap__refimg-remove recap__cmpcard-remove" data-recap-cmp-remove="${i}" aria-label="Remove ${name}"><i class="ap-icon-close"></i></button>`
            : ""
      }
    </div>`;
}

// Scan-in-flight state, scoped to this panel — the whole-Playbook staged loader
// would be far too heavy for a single-section action.
function renderCompetitorScan() {
  const skeletons = [0, 1, 2]
    .map(
      () => `
      <div class="recap__cmpcard recap__cmpcard--skeleton" aria-hidden="true">
        <span class="recap__cmpskel recap__cmpskel--logo"></span>
        <span class="recap__cmpskel recap__cmpskel--line"></span>
        <span class="recap__cmpskel recap__cmpskel--line is-short"></span>
      </div>`,
    )
    .join("");
  return `
    <p class="recap__cmp-scanning" role="status">
      <span class="archie-loader" aria-hidden="true"></span>
      <span>Scanning your market for competitors…</span>
    </p>
    <div class="recap__cmpgrid">${skeletons}</div>`;
}

function renderCompetitorsPanel(data, edit) {
  const section = SECTIONS[3];
  const list = competitorList(data);
  // Index into the full array, so accept/dismiss/remove stay index-addressed
  // while the two states render in separate groups.
  const indexed = list.map((c, i) => ({ c, i }));
  const active = indexed.filter(({ c }) => !c.suggested);
  const pending = indexed.filter(({ c }) => c.suggested);

  const gridOf = (entries, opts) =>
    `<div class="recap__cmpgrid">${entries.map(({ c, i }) => renderCompetitorCard(c, i, opts)).join("")}</div>`;

  // Archie's proposals live in their own tray below the Playbook's own
  // competitors — a pending suggestion is not a competitor of this brand yet.
  const pendingGroup = pending.length
    ? `<section class="recap__cmpgroup recap__cmpgroup--suggested">
         <header class="recap__cmpgroup-head">
           <span class="recap__cmpgroup-title">
             <i class="ap-icon-sparkles" aria-hidden="true"></i>
             <span>Suggested by Archie</span>
             <span class="ap-tag grey mini recap__cmpgroup-count">${pending.length}</span>
           </span>
           ${
             pending.length > 1
               ? `<button type="button" class="ap-button ghost grey recap__cmpgroup-act" data-recap-cmp-accept-all>
                    <i class="ap-icon-check" aria-hidden="true"></i><span>Add all</span>
                  </button>`
               : ""
           }
         </header>
         <p class="recap__cmpgroup-sub">Not in your Playbook yet — add the ones that matter.</p>
         ${gridOf(pending, { edit, pending: true })}
       </section>`
    : "";

  // The panel body is a flex column of padded .recap__row blocks; this section
  // has no label→value rows, so its content gets its own padded wrapper.
  let hint = "";
  let inner;
  if (cmpScanning) {
    inner = renderCompetitorScan();
  } else {
    const activeEmpty = pending.length
      ? `<p class="recap__cmp-empty">None added yet — pick from Archie's suggestions below.</p>`
      : edit
        ? `<p class="recap__cmp-empty">No competitors yet. Add the ones you know — Archie can find the rest.</p>`
        : `<p class="recap__cmp-empty">No competitors yet — Archie can scan your market and suggest a few.</p>`;
    const activeGroup = active.length ? gridOf(active, { edit, pending: false }) : activeEmpty;
    // Only label the active group when a suggestions tray sits under it —
    // a lone grid needs no heading.
    const activeBlock = pending.length
      ? `<section class="recap__cmpgroup">
           <header class="recap__cmpgroup-head">
             <span class="recap__cmpgroup-title"><span>Your competitors</span>
               <span class="ap-tag grey mini recap__cmpgroup-count">${active.length}</span>
             </span>
           </header>
           ${activeGroup}
         </section>`
      : activeGroup;

    if (edit) hint = renderSectionHint(SECTION_HINTS.competitors);
    inner = [
      activeBlock,
      edit && list.length < MAX_COMPETITORS
        ? `<button type="button" class="ap-button secondary blue recap__add-row" data-recap-cmp-add>
             <i class="ap-icon-plus"></i><span>Add competitor</span>
           </button>`
        : "",
      pendingGroup,
      !edit && cmpScanFoundNone
        ? `<p class="recap__cmp-note"><i class="ap-icon-info" aria-hidden="true"></i><span>No new competitors found. Add one by hand instead.</span></p>`
        : "",
    ].join("");
  }
  const body = `${hint}<div class="recap__cmpsec">${inner}</div>`;

  const discoverBtn =
    !edit && !cmpScanning
      ? `<button type="button" class="ap-button ghost grey recap__panel-action" data-recap-cmp-discover>
           <i class="ap-icon-sparkles" aria-hidden="true"></i>
           <span>${list.length ? "Discover more" : "Discover competitors"}</span>
         </button>`
      : "";

  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${
      edit ? "data-recap-editing-card" : ""
    }>
      ${renderPanelHead(section, edit, discoverBtn)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// Per-competitor detail modal — the card stays a summary, everything editable
// (name, website, description, social profiles) lives here. Editable while the
// Competitors section is in edit scope, read-only otherwise; same rule as the
// reference-image modal.
function renderCompetitorModal(data) {
  if (cmpModalIndex == null) return "";
  const list = competitorList(data);
  const c = list[cmpModalIndex];
  if (!c) return "";
  const i = cmpModalIndex;
  const edit = editScope === "competitors";
  const domain = competitorDomain(c);

  const nameBlock = edit
    ? `<div class="ap-input-group">
         <input type="text" data-recap-cmp-field="name" data-recap-cmp-index="${i}" value="${esc(
           c.name || "",
         )}" placeholder="Competitor name" aria-label="Competitor name" />
       </div>`
    : `<p class="recap__cmpmodal-value">${esc(c.name || "Untitled competitor")}</p>`;

  const siteBlock = edit
    ? `<div class="ap-input-group">
         <input type="text" data-recap-cmp-field="websiteUrl" data-recap-cmp-index="${i}" value="${esc(
           c.websiteUrl || "",
         )}" placeholder="https://competitor.com" aria-label="Website" spellcheck="false" />
       </div>`
    : domain
      ? `<a class="recap__cmpmodal-link" href="${esc(
          c.websiteUrl,
        )}" target="_blank" rel="noopener noreferrer"><i class="ap-icon-link" aria-hidden="true"></i><span>${esc(
          domain,
        )}</span><i class="ap-icon-external-link" aria-hidden="true"></i></a>`
      : `<span class="recap__cmpmodal-empty">No website yet.</span>`;

  const descBlock = edit
    ? `<div class="ap-textarea-field resizable">
         <textarea data-recap-cmp-field="description" data-recap-cmp-index="${i}" rows="4" placeholder="How they position, who they win with, where you differ…" aria-label="Description">${esc(
           c.description || "",
         )}</textarea>
       </div>`
    : (c.description || "").trim()
      ? `<p class="recap__cmpmodal-note">${esc(c.description)}</p>`
      : `<p class="recap__cmpmodal-empty">No description yet.</p>`;

  const socials = Array.isArray(c.socials) ? c.socials : [];
  const socialsBlock = edit
    ? `<div class="recap__cmp-socialedit">
         ${socials
           .map((s, si) => {
             const options = REF_NETWORKS.map(
               (n) =>
                 `<option value="${n}"${s.network === n ? " selected" : ""}>${esc(NETWORK_LABEL[n] || n)}</option>`,
             ).join("");
             return `
             <div class="recap__cmp-socialrow">
               <select class="ap-native-select recap__cmp-socialnet" data-recap-cmp-social-network data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" aria-label="Network">
                 ${options}
               </select>
               <div class="ap-input-group recap__cmp-socialurl">
                 <input type="text" data-recap-cmp-social-url data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" value="${esc(
                   s.url || "",
                 )}" placeholder="https://…" aria-label="Profile URL" spellcheck="false" />
               </div>
               <button type="button" class="recap__cta-remove" data-recap-cmp-social-remove data-recap-cmp-index="${i}" data-recap-cmp-social-index="${si}" aria-label="Remove profile">
                 <i class="ap-icon-close"></i>
               </button>
             </div>`;
           })
           .join("")}
         <button type="button" class="ap-button secondary blue recap__add-row" data-recap-cmp-social-add="${i}">
           <i class="ap-icon-plus"></i><span>Add profile</span>
         </button>
       </div>`
    : renderCompetitorNetLinks(c);

  const removeBtn = edit
    ? `<button type="button" class="ap-button transparent grey" data-recap-cmp-remove="${i}"><i class="ap-icon-trash"></i><span>Remove competitor</span></button>`
    : "";

  return `
  <div class="app-modal-backdrop recap__cmpmodal-backdrop" data-recap-cmpmodal-backdrop>
    <aside class="ap-dialog recap__cmpmodal" role="dialog" aria-modal="true" aria-label="Competitor">
      <div class="ap-dialog-header"><span class="ap-dialog-title">Competitor</span></div>
      <button type="button" class="ap-dialog-close" data-recap-cmp-close aria-label="Close"><i class="ap-icon-close"></i></button>
      <div class="ap-dialog-content recap__cmpmodal-content">
        <div class="recap__cmpmodal-id">
          ${renderCompetitorLogo(c, 48)}
          ${
            c.suggested
              ? `<span class="ap-tag grey mini recap__cmp-badge"><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Suggested — not added yet</span></span>`
              : ""
          }
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Name</span>
          ${nameBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Website</span>
          ${siteBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Description</span>
          ${descBlock}
        </div>
        <div class="recap__cmpmodal-sec">
          <span class="recap__refedit-flabel">Social profiles</span>
          ${socialsBlock}
        </div>
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-left">${c.suggested ? "" : removeBtn}</div>
        <div class="ap-dialog-footer-right">
          ${
            c.suggested
              ? `<button type="button" class="ap-button ghost grey" data-recap-cmp-dismiss="${i}"><span>Dismiss</span></button>
                 <button type="button" class="ap-button primary orange" data-recap-cmp-accept="${i}">
                   <i class="ap-icon-plus" aria-hidden="true"></i><span>Add to Playbook</span>
                 </button>`
              : `<button type="button" class="ap-button primary orange" data-recap-cmp-close><span>Done</span></button>`
          }
        </div>
      </div>
    </aside>
  </div>`;
}

// ── Topics — what I watch, and how often ───────────────────────────────────

// Lazy-normalise, same shape as competitorList: a draft built by the onboarding
// wizard never went through contexts-store, so it can arrive without the field.
function topicsConfig(data) {
  if (!data.topics || typeof data.topics !== "object") {
    data.topics = { enabledSourceIds: DEFAULT_ENABLED_IDS.slice(), cadence: DEFAULT_CADENCE };
  }
  if (!Array.isArray(data.topics.enabledSourceIds)) data.topics.enabledSourceIds = [];
  if (!findCadence(data.topics.cadence)) data.topics.cadence = DEFAULT_CADENCE;
  return data.topics;
}

// The cadence control. Read mode states it; edit mode offers the three options
// through a DS .ap-select built on <details> — never a bare native <select>.
function renderCadenceControl(cfgTopics, edit) {
  const active = findCadence(cfgTopics.cadence) || findCadence(DEFAULT_CADENCE);
  if (!edit) return `<p class="recap__row-text">${esc(active.label)} — I bring you topics ${esc(active.adverb)}.</p>`;
  const options = CADENCES.map((c) => {
    const on = c.id === active.id;
    return `<div class="ap-select-option${on ? " selected" : ""}" data-recap-topic-cadence="${c.id}" role="option" aria-selected="${on}">
        <span class="ap-select-option-text">${esc(c.label)}</span>
        ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
      </div>`;
  }).join("");
  return `
    <details class="ap-select recap__topics-cadence">
      <summary class="ap-select-trigger">
        <span class="ap-select-value">${esc(active.label)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Refresh cadence">
        <div class="ap-select-options">${options}</div>
      </div>
    </details>`;
}

// One card per catalog source. Read mode shows the state as a tag and dims the
// ones that are off; edit mode swaps the tag for the DS switch.
function renderTopicSourceCard(source, on, edit) {
  const state = edit
    ? `<label class="ap-toggle-container recap__topicsrc-switch">
         <input type="checkbox" data-recap-topic-source="${source.id}" ${on ? "checked" : ""} aria-label="${esc(source.name)}" />
         <i aria-hidden="true"></i>
       </label>`
    : `<span class="ap-tag ${on ? "green" : "grey"} mini">${on ? "On" : "Off"}</span>`;

  // The two competitor-driven sources read the Competitors section, so point at
  // it rather than making the user go hunting. Hidden when that section isn't
  // rendered at all — a link to a section the flag removed goes nowhere.
  const anchor =
    source.playbookAnchor === "competitors" && competitorsOn()
      ? `<button type="button" class="recap__topicsrc-link" data-recap-nav="pbk-sec-competitors">
           <span>${esc(source.playbookLinkLabel || "Edit the source")}</span><i class="ap-icon-arrow-right" aria-hidden="true"></i>
         </button>`
      : "";

  return `
    <div class="recap__topicsrc ${on ? "" : "is-off"}">
      <span class="topic-badge topic-badge--lg topic-badge--${esc(source.accent)}" aria-hidden="true">
        <i class="${source.icon}"></i>
      </span>
      <div class="recap__topicsrc-text">
        <span class="recap__topicsrc-name">${esc(source.name)}</span>
        <p class="recap__topicsrc-desc">${esc(source.description)}</p>
        ${anchor}
      </div>
      <div class="recap__topicsrc-state">${state}</div>
    </div>`;
}

function renderTopicsPanel(data, edit) {
  const section = SECTIONS[4];
  const conf = topicsConfig(data);
  const enabled = new Set(conf.enabledSourceIds);
  const onCount = TOPIC_SOURCES.filter((s) => enabled.has(s.id)).length;

  const summary =
    onCount === 0
      ? `<span class="recap__row-empty">Nothing switched on — I'm not watching anything for this Playbook.</span>`
      : `<p class="recap__row-text">${onCount} of ${TOPIC_SOURCES.length} sources on.</p>`;

  const body = [
    edit ? renderSectionHint(SECTION_HINTS.topics) : "",
    renderRow("Watching", summary),
    renderRow("Refresh", renderCadenceControl(conf, edit)),
    `<div class="recap__topicsec">
       <div class="recap__topicgrid">
         ${TOPIC_SOURCES.map((s) => renderTopicSourceCard(s, enabled.has(s.id), edit)).join("")}
       </div>
     </div>`,
  ].join("");

  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${
      edit ? "data-recap-editing-card" : ""
    }>
      ${renderPanelHead(section, edit)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// ── Header + rail ──────────────────────────────────────────────────────

function renderHeader(data) {
  const colors = visualColors(data);
  const accent = colors.find((c) => /accent/i.test(c.name))?.hex || colors[0]?.hex || "var(--ref-color-orange-100)";
  const primary = colors[0]?.hex || accent;
  const site = brandSite(data);
  const domain = site?.domain || prettyUrl(data.websiteUrl);
  const usedIn = typeof data.usedIn === "number" ? data.usedIn : null;

  const meta = [
    `<span class="recap__meta-item"><i class="ap-icon-web" aria-hidden="true"></i>${esc(contextLanguages(data).join(" · "))}</span>`,
    domain ? `<span class="recap__meta-item recap__meta-dim">${esc(domain)}</span>` : "",
    usedIn !== null ? `<span class="recap__meta-item">Used in ${usedIn} ${usedIn === 1 ? "chat" : "chats"}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const isDefault = Boolean(data.isDefault);
  const defaultStar = cfg.onToggleDefault
    ? `<button type="button" class="ap-icon-button transparent recap__name-default ${isDefault ? "is-on" : ""}" data-recap-toggle-default aria-pressed="${isDefault}" title="${isDefault ? "Default Playbook — click to unset" : "Set as default"}" aria-label="${isDefault ? "Default Playbook — click to unset" : "Set as default"}"><i class="${isDefault ? "ap-icon-star_fill" : "ap-icon-star"}"></i></button>`
    : "";

  return `
    <header class="recap__header">
      <div class="recap__id">
        <span class="recap__monogram" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(data.name))}</span>
        <div class="recap__id-text">
          <div class="recap__id-titlerow">
            <h1 class="recap__name">${esc(data.name || "Untitled Playbook")}</h1>
            ${
              cfg.onEditName
                ? `<button type="button" class="ap-icon-button transparent recap__name-edit" data-recap-edit-name title="Rename" aria-label="Rename Playbook"><i class="ap-icon-pen"></i></button>`
                : ""
            }
            ${defaultStar}
          </div>
          <div class="recap__meta">${meta}</div>
        </div>
      </div>
      ${cfg.headerActions ? `<div class="recap__header-actions">${cfg.headerActions()}</div>` : ""}
    </header>
  `;
}

function renderRail(data) {
  const nav = sectionsFor()
    .map(
      (s, i) => `
    <button type="button" class="recap__nav-link ${i === 0 ? "is-active" : ""}" data-recap-nav="${s.id}">
      <i class="${s.icon}" aria-hidden="true"></i><span>${esc(s.title)}</span>
    </button>`,
    )
    .join("");

  const colors = visualColors(data).slice(0, 6);
  const usedIn = typeof data.usedIn === "number" ? data.usedIn : null;
  const site = brandSite(data);
  const domain = site?.domain || prettyUrl(data.websiteUrl);

  const facts = [
    `<div class="recap__fact"><dt>${contextLanguages(data).length > 1 ? "Languages" : "Language"}</dt><dd>${esc(contextLanguages(data).join(", "))}</dd></div>`,
    usedIn !== null
      ? `<div class="recap__fact"><dt>Used in</dt><dd>${usedIn} ${usedIn === 1 ? "chat" : "chats"}</dd></div>`
      : "",
    data.updatedAt ? `<div class="recap__fact"><dt>Updated</dt><dd>${esc(data.updatedAt)}</dd></div>` : "",
    domain ? `<div class="recap__fact"><dt>Source</dt><dd>${esc(domain)}</dd></div>` : "",
    colors.length
      ? `<div class="recap__fact"><dt>Brand color</dt><dd><span class="recap__fact-dots">${colors
          .map((c) => `<span class="recap__fact-dot" style="background:${esc(c.hex)};"></span>`)
          .join("")}</span></dd></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <aside class="recap__rail">
      <nav class="recap__nav" aria-label="Playbook sections">${nav}</nav>
      <dl class="recap__facts">${facts}</dl>
    </aside>
  `;
}

// ── Loader + top strip ─────────────────────────────────────────────────

function renderLoading(stageIdx) {
  const stages = cfg.loader || [];
  const idx = Math.min(stageIdx, stages.length - 1);
  const stage = stages[idx] || { title: "", sub: "" };
  const steps = stages
    .map((_, i) => {
      const c = i < idx ? "is-done" : i === idx ? "is-active" : "";
      return `<span class="recap-loading__step ${c}"></span>`;
    })
    .join("");
  return `
    <div class="recap-loading">
      <span class="recap-loading__spinner archie-loader" aria-hidden="true"></span>
      <span class="recap-loading__eyebrow"><i class="ap-icon-archie-official" aria-hidden="true"></i> Crafting your Playbook</span>
      <h1 class="recap-loading__title">${esc(stage.title)}</h1>
      <p class="recap-loading__sub">${esc(stage.sub)}</p>
      <div
        class="recap-loading__steps"
        role="progressbar"
        aria-valuemin="1"
        aria-valuemax="${stages.length}"
        aria-valuenow="${idx + 1}"
        aria-label="${esc(stage.title)}"
      >${steps}</div>
    </div>
  `;
}

function renderTop() {
  if (!cfg.showTop) return "";
  return `
    <header class="welcome-screen__top">
      <span class="welcome-screen__brand">
        <i class="ap-icon-archie-official"></i>
        Archie
      </span>
      <span class="welcome-screen__chip">BETA</span>
    </header>
  `;
}

function paint() {
  cfg.onPaint?.();
  const modeClass = cfg.mode === "library" ? "welcome-screen--library" : "";

  if (phase === "loading") {
    detachScrollSpy();
    mountTarget.innerHTML = html`
      <section class="welcome-screen welcome-screen--reveal welcome-screen--loading ${modeClass}">
        <div class="welcome-screen__bg" aria-hidden="true"></div>
        ${raw(renderTop())}
        <div class="welcome-screen__body recap recap--loading">${raw(renderLoading(loadingStage))}</div>
      </section>
    `;
    return;
  }

  const data = cfg.getData();
  const scope = editScope;
  const body = `
    ${renderHeader(data)}
    <div class="recap__layout">
      ${renderRail(data)}
      <div class="recap__main">
        ${renderGoalsPanel(data, scope === "goals")}
        ${renderVoicePanel(data, scope === "voice")}
        ${renderBrandPanel(data, scope === "brand")}
        ${competitorsOn() ? renderCompetitorsPanel(data, scope === "competitors") : ""}
        ${topicsOn() ? renderTopicsPanel(data, scope === "topics") : ""}
      </div>
    </div>
    ${renderRefModal(data)}
    ${competitorsOn() ? renderCompetitorModal(data) : ""}
  `;

  mountTarget.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${modeClass} ${scope ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      ${raw(renderTop())}
      <div class="welcome-screen__body recap">${raw(body)}</div>
    </section>
  `;

  portalModal();
  attachScrollSpy();
}

// The detail modals (reference image, competitor) are rendered inside the recap
// body, but the recap scroll container / reveal transform stops their fixed
// backdrop from covering the viewport. Move whichever one is open onto <body>
// (like the app's real modals) and bind the same delegated handlers so its
// controls keep working. Only one can be open at a time — refModalIndex and
// cmpModalIndex are mutually exclusive — so one host covers both.
function portalModal() {
  if (refModalHost) {
    refModalHost.remove();
    refModalHost = null;
  }
  const modalEl = mountTarget?.querySelector(".recap__refmodal-backdrop, .recap__cmpmodal-backdrop");
  if (!modalEl) return;
  refModalHost = document.createElement("div");
  refModalHost.className = "recap__refmodal-host";
  refModalHost.appendChild(modalEl);
  refModalHost.addEventListener("click", onClick);
  refModalHost.addEventListener("input", onInput);
  refModalHost.addEventListener("change", onChange);
  refModalHost.addEventListener("keydown", onKeydown);
  refModalHost.addEventListener("error", onLoadError, true);
  document.body.appendChild(refModalHost);
}

// ── Section-nav scroll-spy ─────────────────────────────────────────────

function setActiveNav(id) {
  mountTarget?.querySelectorAll("[data-recap-nav]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.recapNav === id);
  });
}

function detachScrollSpy() {
  if (scrollSpy) {
    scrollSpy.disconnect();
    scrollSpy = null;
  }
}

function attachScrollSpy() {
  detachScrollSpy();
  if (!mountTarget) return;
  const root = mountTarget.querySelector(".welcome-screen");
  const sections = [...mountTarget.querySelectorAll(".recap__panel[id]")];
  if (!root || !sections.length || !("IntersectionObserver" in window)) return;
  scrollSpy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) setActiveNav(e.target.id);
      });
    },
    { root, rootMargin: "-15% 0px -70% 0px", threshold: 0 },
  );
  sections.forEach((s) => scrollSpy.observe(s));
}

// ── Competitor logo fallback + discovery scan ───────────────────────────

// A competitor favicon that can't load (no icon for that domain, blocked
// request, offline session) hides itself and reveals its monogram twin. Runs in
// the capture phase because `error` events don't bubble.
function onLoadError(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-recap-cmp-logo")) return;
  img.classList.add("is-hidden");
  img.nextElementSibling?.classList.remove("is-hidden");
}

function stopCompetitorScan() {
  if (cmpScanTimer) {
    window.clearTimeout(cmpScanTimer);
    cmpScanTimer = null;
  }
  cmpScanning = false;
}

// Mock "scan the market" — shows the section-scoped skeleton, then merges only
// the competitors that aren't already known (so a repeat scan is idempotent and
// removing one brings just that one back).
function startCompetitorScan() {
  const data = cfg?.getData();
  if (!data || cmpScanning) return;
  stopCompetitorScan();
  cmpScanning = true;
  cmpScanFoundNone = false;
  repaintPreservingScroll();
  cmpScanTimer = window.setTimeout(() => {
    cmpScanTimer = null;
    cmpScanning = false;
    const live = cfg?.getData();
    if (!live || !mountTarget) return;
    const existing = competitorList(live);
    // Exclude what's already on the Playbook (accepted or still pending) AND
    // everything the user dismissed — Archie never re-proposes a rejection.
    const found = discoverCompetitors(live.websiteUrl || live.sourceUrl || "", {
      exclude: [...existing, ...dismissedList(live)],
    });
    const room = Math.max(0, MAX_COMPETITORS - existing.length);
    const added = found.slice(0, room).map((c) => ({ ...c, suggested: true }));
    added.forEach((c) => existing.push(c));
    cmpScanFoundNone = added.length === 0;
    // Persist in library mode (no-op in onboarding, where the draft IS the data).
    if (added.length) cfg.commit?.();
    repaintPreservingScroll();
  }, CMP_SCAN_MS);
}

// ── Edit-mode mutations ──────────────────────────────────────────────────

function addChip(field) {
  const data = cfg.getData();
  if (!data || !mountTarget) return;
  const input = mountTarget.querySelector(`[data-recap-chip-input="${field}"]`);
  const val = (input?.value || "").trim();
  if (!val) return;
  const list = Array.isArray(data[field]) ? data[field].slice() : [];
  if (!list.some((v) => v.toLowerCase() === val.toLowerCase())) list.push(val);
  data[field] = list;
  repaint();
  mountTarget.querySelector(`[data-recap-chip-input="${field}"]`)?.focus();
}

// Single-select: replace the audience with exactly the picked value.
function setAudience(value) {
  const data = cfg.getData();
  if (!data) return;
  const t = (value || "").trim();
  if (!t) return;
  data.audience = [t];
  repaint();
}

function addAudienceCustom() {
  const data = cfg.getData();
  if (!data || !mountTarget) return;
  const input = mountTarget.querySelector("[data-recap-audience-input]");
  const val = (input?.value || "").trim();
  if (!val) return;
  audienceCustom = false;
  setAudience(val);
}

function addLine(field) {
  const data = cfg.getData();
  if (!data) return;
  // Signature hooks / closing patterns are authored per language — write into
  // the active language's voice entry, not the flat mirror.
  const entry = voiceEntry(data);
  const list = Array.isArray(entry[field]) ? entry[field].slice() : [];
  list.push("");
  entry[field] = list;
  repaint();
  const inputs = mountTarget?.querySelectorAll(`[data-recap-line-list="${field}"]`);
  inputs?.[inputs.length - 1]?.focus();
}

function onClick(event) {
  // Section-nav — scroll the panel into view (buttons, not anchors, so the
  // hash router is never triggered).
  const nav = event.target.closest("[data-recap-nav]");
  if (nav) {
    const el = mountTarget?.querySelector(`#${nav.dataset.recapNav}`);
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    setActiveNav(nav.dataset.recapNav);
    return;
  }

  // Header name pencil → rename (mode-specific handler).
  if (event.target.closest("[data-recap-edit-name]")) {
    cfg.onEditName?.();
    return;
  }

  // Header star → toggle default (library mode).
  if (event.target.closest("[data-recap-toggle-default]")) {
    cfg.onToggleDefault?.();
    return;
  }

  const data = cfg.getData();
  if (!data) return;

  const penBtn = event.target.closest("[data-recap-edit-card]");
  if (penBtn) {
    if (penBtn.dataset.recapEditCard === "brand") ensureBrand(data);
    if (penBtn.dataset.recapEditCard === "competitors") competitorList(data);
    // Normalise BEFORE snapshotting, so Cancel restores the normalised shape
    // rather than the undefined the draft may have arrived with.
    if (penBtn.dataset.recapEditCard === "topics") topicsConfig(data);
    snapshot = snapshotEditable(data);
    editScope = penBtn.dataset.recapEditCard;
    audienceCustom = false;
    repaint();
    mountTarget
      ?.querySelector(
        "[data-recap-editing-card] input, [data-recap-editing-card] textarea, [data-recap-editing-card] select",
      )
      ?.focus();
    return;
  }

  if (event.target.closest("[data-recap-cancel]")) {
    if (snapshot) cfg.revert?.(snapshot);
    snapshot = null;
    editScope = null;
    refModalIndex = null;
    cmpModalIndex = null;
    audienceCustom = false;
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-save]")) {
    if (typeof data.name === "string") data.name = data.name.trim();
    if (Array.isArray(data.ctaLinks)) {
      data.ctaLinks = data.ctaLinks.filter((c) => (c.label || "").trim() || (c.url || "").trim() || c.suggested);
    }
    // Drop empty lines from the flat mirror AND every per-language voice entry.
    ["signatureHooks", "closingPatterns"].forEach((f) => {
      if (Array.isArray(data[f])) data[f] = data[f].filter((s) => (s || "").trim());
    });
    if (data.voiceByLanguage && typeof data.voiceByLanguage === "object") {
      Object.values(data.voiceByLanguage).forEach((entry) => {
        ["signatureHooks", "closingPatterns"].forEach((f) => {
          if (Array.isArray(entry[f])) entry[f] = entry[f].filter((s) => (s || "").trim());
        });
      });
    }
    // Drop competitors left completely blank (an "Add competitor" row the user
    // opened and abandoned) and social rows with no URL. `suggested` is kept:
    // an unaccepted proposal stays pending across a Save rather than being
    // silently adopted into the Playbook.
    if (Array.isArray(data.competitors)) {
      data.competitors = data.competitors.filter(
        (c) => (c.name || "").trim() || (c.websiteUrl || "").trim() || (c.description || "").trim(),
      );
      data.competitors.forEach((c) => {
        c.socials = (Array.isArray(c.socials) ? c.socials : []).filter((s) => (s.url || "").trim());
      });
    }
    cfg.commit?.();
    snapshot = null;
    editScope = null;
    refModalIndex = null;
    cmpModalIndex = null;
    audienceCustom = false;
    repaint();
    return;
  }

  // ── Competitors ──
  if (event.target.closest("[data-recap-cmp-discover]")) {
    startCompetitorScan();
    return;
  }

  // Accept a proposal — it becomes one of the Playbook's own competitors.
  // Deliberately available in READ mode: adopting a suggestion shouldn't
  // require entering the section editor, that's the point of the tray.
  const cmpAccept = event.target.closest("[data-recap-cmp-accept]");
  if (cmpAccept) {
    const c = competitorList(data)[Number(cmpAccept.dataset.recapCmpAccept)];
    if (!c) return;
    delete c.suggested;
    cmpModalIndex = null;
    if (!editScope) cfg.commit?.(); // in edit mode the section's Save commits
    repaintPreservingScroll();
    return;
  }

  if (event.target.closest("[data-recap-cmp-accept-all]")) {
    pendingCompetitors(data).forEach((c) => delete c.suggested);
    cmpModalIndex = null;
    if (!editScope) cfg.commit?.();
    repaintPreservingScroll();
    return;
  }

  // Dismiss a proposal — drop it and remember the rejection so a later scan
  // doesn't surface it again.
  const cmpDismiss = event.target.closest("[data-recap-cmp-dismiss]");
  if (cmpDismiss) {
    const list = competitorList(data);
    const idx = Number(cmpDismiss.dataset.recapCmpDismiss);
    const c = list[idx];
    if (!c) return;
    const key = competitorKey(c);
    const dismissed = dismissedList(data);
    if (key && !dismissed.includes(key)) dismissed.push(key);
    list.splice(idx, 1);
    cmpModalIndex = null; // indices shifted — the open modal no longer means anything
    if (!editScope) cfg.commit?.();
    repaintPreservingScroll();
    return;
  }

  const cmpOpen = event.target.closest("[data-recap-cmp-open]");
  if (cmpOpen) {
    cmpModalIndex = Number(cmpOpen.dataset.recapCmpOpen);
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-cmp-close]") || event.target.matches?.("[data-recap-cmpmodal-backdrop]")) {
    cmpModalIndex = null;
    repaint();
    return;
  }

  const cmpRemove = event.target.closest("[data-recap-cmp-remove]");
  if (cmpRemove) {
    const idx = Number(cmpRemove.dataset.recapCmpRemove);
    const list = competitorList(data);
    if (idx >= 0 && idx < list.length) list.splice(idx, 1);
    cmpModalIndex = null; // the open modal's index no longer means anything
    repaintPreservingScroll();
    return;
  }

  if (event.target.closest("[data-recap-cmp-add]")) {
    const list = competitorList(data);
    if (list.length >= MAX_COMPETITORS) return;
    list.push({
      id: `cmp-new-${list.length + 1}-${Date.now().toString(36)}`,
      name: "",
      description: "",
      websiteUrl: "",
      socials: [],
    });
    cmpModalIndex = list.length - 1; // open the blank card straight away
    repaint();
    mountTarget?.querySelector("[data-recap-cmp-field='name']")?.focus();
    return;
  }

  const cmpSocialAdd = event.target.closest("[data-recap-cmp-social-add]");
  if (cmpSocialAdd) {
    const c = competitorList(data)[Number(cmpSocialAdd.dataset.recapCmpSocialAdd)];
    if (!c) return;
    if (!Array.isArray(c.socials)) c.socials = [];
    c.socials.push({ network: REF_NETWORKS[0], url: "" });
    repaint();
    const inputs = document.querySelectorAll("[data-recap-cmp-social-url]");
    inputs[inputs.length - 1]?.focus();
    return;
  }

  const cmpSocialRemove = event.target.closest("[data-recap-cmp-social-remove]");
  if (cmpSocialRemove) {
    const c = competitorList(data)[Number(cmpSocialRemove.dataset.recapCmpIndex)];
    const si = Number(cmpSocialRemove.dataset.recapCmpSocialIndex);
    if (c && Array.isArray(c.socials) && si >= 0 && si < c.socials.length) c.socials.splice(si, 1);
    repaint();
    return;
  }

  // Voice & style: switch between the guided fields and a free-form textarea.
  const voiceMode = event.target.closest("[data-recap-voice-mode]");
  if (voiceMode) {
    data.voiceMode = voiceMode.dataset.recapVoiceMode;
    repaint();
    mountTarget?.querySelector("[data-recap-text='voiceManual']")?.focus();
    return;
  }

  // Languages (Audience & goals) — toggle a language in/out of the Playbook.
  const langToggle = event.target.closest("[data-recap-lang-toggle]");
  if (langToggle) {
    const lang = langToggle.dataset.recapLangToggle;
    const langs = contextLanguages(data).slice();
    const at = langs.indexOf(lang);
    if (at >= 0) {
      if (langs.length <= 1) return; // never remove the last language
      langs.splice(at, 1);
      if (data.voiceByLanguage) delete data.voiceByLanguage[lang];
      if (data.primaryLanguage === lang) data.primaryLanguage = langs[0];
      if (activeVoiceLang === lang) activeVoiceLang = null;
    } else {
      langs.push(lang);
      if (!data.voiceByLanguage || typeof data.voiceByLanguage !== "object") data.voiceByLanguage = {};
      if (!data.voiceByLanguage[lang]) data.voiceByLanguage[lang] = emptyVoiceEntry(data);
    }
    data.languages = langs;
    if (!data.primaryLanguage || !langs.includes(data.primaryLanguage)) data.primaryLanguage = langs[0];
    repaint();
    return;
  }

  // Topics — pick the refresh cadence. Picking closes the DS .ap-select
  // <details>, same as the audience dropdown.
  const cadencePick = event.target.closest("[data-recap-topic-cadence]");
  if (cadencePick) {
    cadencePick.closest("details")?.removeAttribute("open");
    const conf = topicsConfig(data);
    const next = cadencePick.dataset.recapTopicCadence;
    if (findCadence(next)) conf.cadence = next;
    repaint();
    return;
  }

  // Voice & style — switch which language's examples are shown/edited.
  const voiceLang = event.target.closest("[data-recap-voice-lang]");
  if (voiceLang) {
    activeVoiceLang = voiceLang.dataset.recapVoiceLang;
    repaintPreservingScroll();
    return;
  }

  // Primary audience dropdown — pick an analysed option (by pool index) or
  // switch to "Other…", which reveals the free-text input. Picking closes the
  // DS .ap-select <details>.
  const audPick = event.target.closest("[data-recap-audience-pick]");
  if (audPick) {
    audPick.closest("details")?.removeAttribute("open");
    const val = audPick.dataset.recapAudiencePick;
    if (val === "other") {
      audienceCustom = true;
      repaint();
      mountTarget?.querySelector("[data-recap-audience-input]")?.focus();
    } else {
      audienceCustom = false;
      const pool = audienceOptionPool(data);
      const idx = Number(val);
      if (pool[idx] != null) setAudience(pool[idx]);
      else repaint();
    }
    return;
  }
  // Confirm a custom value typed under the "Other…" option.
  if (event.target.closest("[data-recap-audience-add]")) {
    addAudienceCustom();
    return;
  }

  const chipRemove = event.target.closest("[data-recap-chip-remove]");
  if (chipRemove) {
    const field = chipRemove.dataset.recapChipRemove;
    const idx = Number(chipRemove.dataset.recapChipIndex);
    if (Array.isArray(data[field])) data[field] = data[field].filter((_, i) => i !== idx);
    repaint();
    return;
  }

  const chipAdd = event.target.closest("[data-recap-chip-add]");
  if (chipAdd) {
    addChip(chipAdd.dataset.recapChipAdd);
    return;
  }

  // Line-list editor (signature hooks / closing patterns).
  const lineRemove = event.target.closest("[data-recap-line-remove]");
  if (lineRemove) {
    const field = lineRemove.dataset.recapLineList;
    const idx = Number(lineRemove.dataset.recapLineIndex);
    const entry = voiceEntry(data);
    if (Array.isArray(entry[field])) entry[field] = entry[field].filter((_, i) => i !== idx);
    repaint();
    return;
  }
  const lineAdd = event.target.closest("[data-recap-line-add]");
  if (lineAdd) {
    addLine(lineAdd.dataset.recapLineAdd);
    return;
  }

  const ctaRemove = event.target.closest("[data-recap-cta-remove]");
  if (ctaRemove) {
    const idx = Number(ctaRemove.dataset.recapCtaRemove);
    if (Array.isArray(data.ctaLinks)) data.ctaLinks = data.ctaLinks.filter((_, i) => i !== idx);
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-cta-add]")) {
    const ctas = Array.isArray(data.ctaLinks) ? data.ctaLinks.slice() : [];
    ctas.push({ label: "", url: "", checked: true, suggested: false });
    data.ctaLinks = ctas;
    repaint();
    const inputs = mountTarget?.querySelectorAll('[data-recap-cta-field="label"]');
    inputs?.[inputs.length - 1]?.focus();
    return;
  }

  // Brand colours — add / remove a named #hex swatch.
  const colorRemove = event.target.closest("[data-recap-color-remove]");
  if (colorRemove) {
    const idx = Number(colorRemove.dataset.recapColorRemove);
    if (Array.isArray(data.brandColors)) data.brandColors = data.brandColors.filter((_, i) => i !== idx);
    repaint();
    return;
  }
  if (event.target.closest("[data-recap-color-add]")) {
    const list = Array.isArray(data.brandColors) ? data.brandColors.slice() : [];
    list.push({ name: "", hex: "#1A1F36" });
    data.brandColors = list;
    repaint();
    const inputs = mountTarget?.querySelectorAll('[data-recap-color-field="name"]');
    inputs?.[inputs.length - 1]?.focus();
    return;
  }

  // Reference images — open the file picker / open the detail modal / close it /
  // remove a thumbnail.
  if (event.target.closest("[data-recap-refimg-add]")) {
    mountTarget?.querySelector("[data-recap-refimg-input]")?.click();
    return;
  }
  const refOpen = event.target.closest("[data-recap-refimg-open]");
  if (refOpen) {
    refModalIndex = Number(refOpen.dataset.recapRefimgOpen);
    repaintPreservingScroll();
    return;
  }
  // Close the modal (× / Done button, or a click on the backdrop itself).
  // Reference-image edits are part of the Brand section's Save/Cancel flow — no
  // separate commit here.
  if (event.target.closest("[data-recap-refimg-close]") || event.target.matches?.("[data-recap-refmodal-backdrop]")) {
    refModalIndex = null;
    repaintPreservingScroll();
    return;
  }
  const refImgRemove = event.target.closest("[data-recap-refimg-remove]");
  if (refImgRemove) {
    const idx = Number(refImgRemove.dataset.recapRefimgRemove);
    if (Array.isArray(data.referenceImages)) data.referenceImages = data.referenceImages.filter((_, i) => i !== idx);
    refModalIndex = null; // the open image may be gone / indices shifted
    repaint();
    return;
  }
  // Reference image — toggle a target network on/off (in place, no page jump).
  const refNet = event.target.closest("[data-recap-refnet]");
  if (refNet) {
    const idx = Number(refNet.dataset.recapRefimgIndex);
    const net = refNet.dataset.recapRefnet;
    const img = data.referenceImages?.[idx];
    if (img) {
      const nets = Array.isArray(img.networks) ? img.networks : [];
      const on = nets.includes(net);
      img.networks = on ? nets.filter((n) => n !== net) : [...nets, net];
      refNet.setAttribute("aria-pressed", String(!on));
    }
    return;
  }
  // Reference image — remove a detected tag.
  const tagRm = event.target.closest("[data-recap-reftag-remove]");
  if (tagRm) {
    const img = data.referenceImages?.[Number(tagRm.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.tags.splice(Number(tagRm.dataset.recapTagIndex), 1);
      repaintPreservingScroll();
    }
    return;
  }
  // Reference image — remove / add a dominant colour.
  const colorRm = event.target.closest("[data-recap-refcolor-remove]");
  if (colorRm) {
    const img = data.referenceImages?.[Number(colorRm.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors.splice(Number(colorRm.dataset.recapColorIndex), 1);
      repaintPreservingScroll();
    }
    return;
  }
  const colorAdd = event.target.closest("[data-recap-refcolor-add]");
  if (colorAdd) {
    const img = data.referenceImages?.[Number(colorAdd.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors.push("#3b4a6b");
      repaintPreservingScroll();
    }
    return;
  }

  // Footer / header actions (mode-specific) — Save and start / Start chat / etc.
  cfg.onFooter?.(event);
}

// Text edits mutate the live data object WITHOUT a repaint so inputs keep
// focus mid-type.
function onInput(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  const t = event.target;
  if (t.matches("[data-recap-summary]")) {
    data.businessSummary = t.value;
  } else if (t.matches("[data-recap-refnote]")) {
    const idx = Number(t.dataset.recapRefimgIndex);
    if (data.referenceImages?.[idx]) data.referenceImages[idx].note = t.value;
  } else if (t.matches("[data-recap-refcolor]")) {
    const img = data.referenceImages?.[Number(t.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      img.colors[Number(t.dataset.recapColorIndex)] = t.value;
    }
  } else if (t.matches("[data-recap-text]")) {
    data[t.dataset.recapText] = t.value;
  } else if (t.matches("[data-recap-typo]")) {
    if (!data.brandTypography || typeof data.brandTypography !== "object") data.brandTypography = brandFonts(data);
    data.brandTypography[t.dataset.recapTypo] = t.value;
  } else if (t.matches("[data-recap-line-field]")) {
    const list = t.dataset.recapLineList;
    const idx = Number(t.dataset.recapLineIndex);
    // Voice examples are per language — mutate the active language's entry.
    const entry = voiceEntry(data);
    if (Array.isArray(entry[list]) && entry[list][idx] !== undefined) entry[list][idx] = t.value;
  } else if (t.matches("[data-recap-cta-field]")) {
    const idx = Number(t.dataset.recapCtaIndex);
    const field = t.dataset.recapCtaField;
    if (data.ctaLinks?.[idx]) data.ctaLinks[idx][field] = t.value;
  } else if (t.matches("[data-recap-color-field]")) {
    const idx = Number(t.dataset.recapColorIndex);
    const field = t.dataset.recapColorField;
    if (data.brandColors?.[idx]) data.brandColors[idx][field] = t.value;
    if (field === "hex") {
      const sw = mountTarget?.querySelector(`[data-recap-color-swatch="${idx}"]`);
      if (sw) sw.style.background = t.value;
    }
  } else if (t.matches("[data-recap-cmp-field]")) {
    const c = data.competitors?.[Number(t.dataset.recapCmpIndex)];
    if (c) c[t.dataset.recapCmpField] = t.value;
  } else if (t.matches("[data-recap-cmp-social-url]")) {
    const c = data.competitors?.[Number(t.dataset.recapCmpIndex)];
    const s = c?.socials?.[Number(t.dataset.recapCmpSocialIndex)];
    if (s) s.url = t.value;
  }
}

let refImgCounter = 0;

function onChange(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  // Reference-image upload — read each picked image as a data URL and append,
  // capped at MAX_REF_IMAGES. Part of the Brand section's Save flow.
  if (event.target.matches("[data-recap-refimg-input]")) {
    const picked = Array.from(event.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (!picked.length) return;
    if (!Array.isArray(data.referenceImages)) data.referenceImages = [];
    const room = Math.max(0, MAX_REF_IMAGES - data.referenceImages.length);
    Promise.all(
      picked.slice(0, room).map(
        (f) =>
          new Promise((res) => {
            const reader = new FileReader();
            refImgCounter += 1;
            const id = `ref-${refImgCounter}`;
            reader.onload = () => res({ id, label: f.name, url: reader.result, networks: [] });
            reader.onerror = () => res(null);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((loaded) => {
      loaded.filter(Boolean).forEach((img) => data.referenceImages.push(img));
      repaint();
    });
    return;
  }
  // Topics — switch a listening source on or off. Repaint so the "N of 6 sources
  // on" line and the card's dimmed state follow the switch immediately.
  if (event.target.matches("[data-recap-topic-source]")) {
    const conf = topicsConfig(data);
    const id = event.target.dataset.recapTopicSource;
    const at = conf.enabledSourceIds.indexOf(id);
    if (event.target.checked && at < 0) conf.enabledSourceIds.push(id);
    else if (!event.target.checked && at >= 0) conf.enabledSourceIds.splice(at, 1);
    repaintPreservingScroll();
    return;
  }
  if (event.target.matches("[data-recap-primary-language]")) {
    const val = event.target.value;
    const langs = contextLanguages(data);
    if (langs.includes(val)) {
      data.primaryLanguage = val;
      repaint(); // refresh the "primary" tag + header/rail
    }
    return;
  }
  // Competitor social row — the network select. No repaint: the row's own
  // <select> already shows the new value, and repainting would steal focus.
  if (event.target.matches("[data-recap-cmp-social-network]")) {
    const c = data.competitors?.[Number(event.target.dataset.recapCmpIndex)];
    const s = c?.socials?.[Number(event.target.dataset.recapCmpSocialIndex)];
    if (s) s.network = event.target.value;
    return;
  }
}

function onKeydown(event) {
  if (!editScope) return;
  if (event.target.matches("[data-recap-audience-input]") && event.key === "Enter") {
    event.preventDefault();
    addAudienceCustom();
  } else if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(event.target.dataset.recapChipInput);
  } else if (event.target.matches("[data-recap-line-field]") && event.key === "Enter") {
    event.preventDefault();
    addLine(event.target.dataset.recapLineList);
  } else if (event.target.matches("[data-recap-reftag-input]") && event.key === "Enter") {
    event.preventDefault();
    const value = event.target.value.trim();
    if (!value) return;
    const data = cfg.getData();
    const img = data?.referenceImages?.[Number(event.target.dataset.recapRefimgIndex)];
    if (img) {
      ensureRefTagsColors(img);
      if (!img.tags.includes(value)) img.tags.push(value);
      repaintPreservingScroll();
      // Re-focus the (fresh) tag input so the user can keep adding.
      refModalHost?.querySelector("[data-recap-reftag-input]")?.focus();
    }
  }
}
