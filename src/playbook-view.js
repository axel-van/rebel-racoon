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
import { analyzeWebsite } from "./context-mock-analysis.js?v=24";
import { LANGUAGE_OPTIONS, emptyVoiceEntry } from "./languages.js?v=1";
import { isFlagOn } from "./feature-flags.js?v=10";
import { NETWORK_ICON_BY_PLATFORM, NETWORK_LABEL } from "./social-profiles.js?v=26";

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

const SECTIONS = [
  { id: "pbk-sec-goals", scope: "goals", icon: "ap-icon-target", title: "Audience & goals" },
  { id: "pbk-sec-voice", scope: "voice", icon: "ap-icon-quote", title: "Voice & style" },
  { id: "pbk-sec-brand", scope: "brand", icon: "ap-icon-image", title: "Brand" },
  { id: "pbk-sec-refs", scope: "refs", icon: "ap-icon-multiple-images", title: "Reference images" },
];

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
  refs: {
    q: "Reference images",
    a: "I pull these into the image generator so generated visuals stay on-brand. Add as many as you like — pick which ones to use each time.",
  },
};

const STAGE_MS = 2400;

let mountTarget = null;
let cfg = null;
let editScope = null; // null (read) | "goals" | "voice" | "brand"
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
  target.addEventListener("click", onClickH);
  target.addEventListener("input", onInputH);
  target.addEventListener("change", onChangeH);
  target.addEventListener("keydown", onKeydownH);

  return () => {
    stopLoading();
    detachScrollSpy();
    target.removeEventListener("click", onClickH);
    target.removeEventListener("input", onInputH);
    target.removeEventListener("change", onChangeH);
    target.removeEventListener("keydown", onKeydownH);
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

// Edit-mode network toggle chips (reuse .ap-filter-chip, driven by aria-pressed).
function renderRefNetChips(networks, i) {
  const nets = Array.isArray(networks) ? networks : [];
  return `<div class="recap__refedit-nets">${REF_NETWORKS.map((n) => {
    const on = nets.includes(n);
    return `<button type="button" class="ap-filter-chip recap__refedit-netchip" aria-pressed="${on}" data-recap-refnet="${n}" data-recap-refimg-index="${i}"><i class="${NETWORK_ICON_BY_PLATFORM[n]}" aria-hidden="true"></i><span>${esc(NETWORK_LABEL[n] || n)}</span></button>`;
  }).join("")}</div>`;
}

function renderRefImages(data, edit) {
  const imgs = Array.isArray(data.referenceImages) ? data.referenceImages : [];
  if (!edit && !imgs.length) return `<span class="recap__row-empty">None yet</span>`;

  // Read view — a card per image: thumb + network badges + note caption.
  if (!edit) {
    const cards = imgs
      .map((img) => {
        const nets = renderRefNetBadges(img.networks);
        const note = img.note && img.note.trim() ? `<p class="recap__refimg-note">${esc(img.note)}</p>` : "";
        const meta = nets || note ? `<div class="recap__refimg-meta">${nets}${note}</div>` : "";
        return `
      <figure class="recap__refimg-card">
        <div class="recap__refimg">
          <img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" loading="lazy" />
        </div>
        ${meta}
      </figure>`;
      })
      .join("");
    return `<div class="recap__refimgs">${cards}</div>`;
  }

  // Edit view — a card per image: a fixed thumb (with remove) beside a fields
  // column (usage notes + target networks).
  const rows = imgs
    .map(
      (img, i) => `
      <div class="recap__refedit-item">
        <div class="recap__refedit-thumb">
          <img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" loading="lazy" />
          <button type="button" class="recap__refimg-remove" data-recap-refimg-remove="${i}" aria-label="Remove image"><i class="ap-icon-close"></i></button>
        </div>
        <div class="recap__refedit-body">
          <div class="recap__refedit-field">
            <span class="recap__refedit-flabel">Usage notes</span>
            <div class="ap-textarea-field resizable">
              <textarea data-recap-refnote data-recap-refimg-index="${i}" rows="2" placeholder="How &amp; when to use this image — do's &amp; don'ts, style notes…" aria-label="Usage guidance">${esc(img.note || "")}</textarea>
            </div>
          </div>
          <div class="recap__refedit-field">
            <span class="recap__refedit-flabel">Best for</span>
            ${renderRefNetChips(img.networks, i)}
          </div>
        </div>
      </div>`,
    )
    .join("");
  const addBtn =
    imgs.length < MAX_REF_IMAGES
      ? `<button type="button" class="ap-button secondary blue recap__refedit-add" data-recap-refimg-add>
           <i class="ap-icon-plus"></i><span>Add image</span>
         </button>
         <input type="file" accept="image/*" multiple hidden data-recap-refimg-input />`
      : "";
  return `<div class="recap__refedit">${rows}${addBtn}</div>`;
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
    ].join("");
  } else {
    body = [
      renderRow("Brand color", renderSwatches(colors)),
      renderRow("Typography", renderTypeSpecimen(data)),
      renderRow("Personality", renderText(data.brandPersonality)),
    ].join("");
  }
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${edit ? "data-recap-editing-card" : ""}>
      ${renderPanelHead(section, edit)}
      <div class="recap__panel-body">${body}</div>
    </section>
  `;
}

// Reference images — a dedicated section (own rail link). Archie pulls these
// into the image generator; the user picks which ones to use per generation.
function renderRefsPanel(data, edit) {
  const section = SECTIONS[3];
  const body = edit
    ? [renderSectionHint(SECTION_HINTS.refs), renderRow("Images", renderRefImages(data, true))].join("")
    : renderRow("Images", renderRefImages(data, false));
  return `
    <section class="recap__panel ${edit ? "is-editing" : ""}" id="${section.id}" ${edit ? "data-recap-editing-card" : ""}>
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
  const nav = SECTIONS.map(
    (s, i) => `
    <button type="button" class="recap__nav-link ${i === 0 ? "is-active" : ""}" data-recap-nav="${s.id}">
      <i class="${s.icon}" aria-hidden="true"></i><span>${esc(s.title)}</span>
    </button>`,
  ).join("");

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
        ${renderRefsPanel(data, scope === "refs")}
      </div>
    </div>
  `;

  mountTarget.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${modeClass} ${scope ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      ${raw(renderTop())}
      <div class="welcome-screen__body recap">${raw(body)}</div>
    </section>
  `;

  attachScrollSpy();
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
    if (penBtn.dataset.recapEditCard === "refs" && !Array.isArray(data.referenceImages)) data.referenceImages = [];
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
    cfg.commit?.();
    snapshot = null;
    editScope = null;
    audienceCustom = false;
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

  // Reference images — open the file picker / remove a thumbnail.
  if (event.target.closest("[data-recap-refimg-add]")) {
    mountTarget?.querySelector("[data-recap-refimg-input]")?.click();
    return;
  }
  const refImgRemove = event.target.closest("[data-recap-refimg-remove]");
  if (refImgRemove) {
    const idx = Number(refImgRemove.dataset.recapRefimgRemove);
    if (Array.isArray(data.referenceImages)) data.referenceImages = data.referenceImages.filter((_, i) => i !== idx);
    repaint();
    return;
  }
  // Reference image — toggle a target network on/off.
  const refNet = event.target.closest("[data-recap-refnet]");
  if (refNet) {
    const idx = Number(refNet.dataset.recapRefimgIndex);
    const net = refNet.dataset.recapRefnet;
    const img = data.referenceImages?.[idx];
    if (img) {
      const nets = Array.isArray(img.networks) ? img.networks : [];
      img.networks = nets.includes(net) ? nets.filter((n) => n !== net) : [...nets, net];
      repaint();
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
  } else if (t.matches("[data-recap-refnote]")) {
    const idx = Number(t.dataset.recapRefimgIndex);
    if (data.referenceImages?.[idx]) data.referenceImages[idx].note = t.value;
  }
}

let refImgCounter = 0;

function onChange(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  if (event.target.matches("[data-recap-primary-language]")) {
    const val = event.target.value;
    const langs = contextLanguages(data);
    if (langs.includes(val)) {
      data.primaryLanguage = val;
      repaint(); // refresh the "primary" tag + header/rail
    }
    return;
  }
  // Reference-image upload (#11) — read each picked image as a data URL and
  // append, capped at MAX_REF_IMAGES.
  if (event.target.matches("[data-recap-refimg-input]")) {
    const picked = Array.from(event.target.files || []).filter((f) => f.type.startsWith("image/"));
    if (!picked.length) return;
    if (!Array.isArray(data.referenceImages)) data.referenceImages = [];
    const room = Math.max(0, MAX_REF_IMAGES - data.referenceImages.length);
    const take = picked.slice(0, room);
    Promise.all(
      take.map(
        (f) =>
          new Promise((res) => {
            const reader = new FileReader();
            refImgCounter += 1;
            const id = `ref-${refImgCounter}`;
            reader.onload = () => res({ id, label: f.name, url: reader.result });
            reader.onerror = () => res(null);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((loaded) => {
      loaded.filter(Boolean).forEach((img) => data.referenceImages.push(img));
      repaint();
    });
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
  }
}
