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

// Archie's UI and AI generation are English-only today. Other languages
// were removed (audit B8) to keep the Playbook field honest — re-add them
// here AND in components/right-panel.js LANGUAGE_OPTIONS when multilingual
// generation ships.
const LANGUAGE_OPTIONS = ["English"];

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
];

// Edit-mode guidance. Surfaced only while a section is being edited (one at a
// time), so the read view stays clean. Audience & goals gets a per-field hint
// (q = prompt, a = what Archie does with it); Voice & style and Brand each get
// a single "captured by Archie" banner.
const FIELD_HINTS = {
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
};

const STAGE_MS = 2400;

let mountTarget = null;
let cfg = null;
let editScope = null; // null (read) | "goals" | "voice" | "brand"
let snapshot = null; // deep copy of editable fields, for Cancel
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
//   footer(): string,                  // footer button(s) html (onboarding)
//   onFooter(event): boolean,          // handle footer/header-action clicks
// }
export function mount(target, config) {
  cfg = config;
  mountTarget = target;
  editScope = null;
  snapshot = null;

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

// Reference-image gallery (#11) — up to 10 visual references.
const MAX_REF_IMAGES = 10;

function renderRefImages(data, edit) {
  const imgs = Array.isArray(data.referenceImages) ? data.referenceImages : [];
  if (!edit && !imgs.length) return `<span class="recap__row-empty">None yet</span>`;
  const thumbs = imgs
    .map(
      (img, i) => `
      <div class="recap__refimg">
        <img src="${esc(img.url)}" alt="${esc(img.label || "Reference image")}" loading="lazy" />
        ${
          edit
            ? `<button type="button" class="recap__refimg-remove" data-recap-refimg-remove="${i}" aria-label="Remove image"><i class="ap-icon-close"></i></button>`
            : ""
        }
      </div>`,
    )
    .join("");
  const addBtn =
    edit && imgs.length < MAX_REF_IMAGES
      ? `<button type="button" class="recap__refimg-add" data-recap-refimg-add aria-label="Add reference images">
           <i class="ap-icon-plus"></i><span>Add</span>
         </button>
         <input type="file" accept="image/*" multiple hidden data-recap-refimg-input />`
      : "";
  return `<div class="recap__refimgs">${thumbs}${addBtn}</div>`;
}

// Per-field edit hint (Audience & goals) — prompt + what Archie does with it.
function renderFieldHint(hint) {
  if (!hint) return "";
  return `<div class="recap__field-hint"><span class="recap__field-hint-q">${esc(hint.q)}</span><span class="recap__field-hint-a">${esc(hint.a)}</span></div>`;
}

// Section-level edit banner (Voice & style, Brand) — where Archie sourced it.
// The sparkle is an inline SVG so it can carry the Mermaid gradient (the icon
// font glyph is monochrome). Only one banner is in the DOM at a time (one
// section edits at once), so the gradient id is safe to reuse.
function renderSectionHint(hint) {
  if (!hint) return "";
  return `
    <div class="recap__panel-hint">
      <svg class="recap__panel-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="recapMermaidGrad" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
            <stop stop-color="var(--ref-color-mermaid-gradient-from)" />
            <stop offset="1" stop-color="var(--ref-color-mermaid-gradient-to)" />
          </linearGradient>
        </defs>
        <path d="M10 6 12 11 17 13 12 15 10 20 8 15 3 13 8 11Z" fill="url(#recapMermaidGrad)" />
        <path d="M18 3.5 18.8 6.2 21.5 7 18.8 7.8 18 10.5 17.2 7.8 14.5 7 17.2 6.2Z" fill="url(#recapMermaidGrad)" />
      </svg>
      <div class="recap__panel-hint-text">
        <span class="recap__panel-hint-q">${esc(hint.q)}</span>
        <span class="recap__panel-hint-a">${esc(hint.a)}</span>
      </div>
    </div>`;
}

// ── Section panels ─────────────────────────────────────────────────────

function renderGoalsPanel(data, edit) {
  const section = SECTIONS[0];
  const language = data.language || "English";
  let body;
  if (edit) {
    const selected = language;
    body = [
      renderRow(
        "Language",
        `<select class="ap-native-select recap__lang-select" data-recap-language aria-label="Language">
          ${LANGUAGE_OPTIONS.map((o) => `<option value="${esc(o)}" ${o === selected ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>`,
      ),
      renderRow(
        "Business",
        renderFieldHint(FIELD_HINTS.businessSummary) +
          `<div class="ap-textarea-field resizable">
           <textarea data-recap-summary rows="4" placeholder="Describe your business in a few sentences…">${esc(data.businessSummary || "")}</textarea>
         </div>`,
      ),
      ...GOAL_FIELDS.map((f) =>
        renderRow(f.label, renderFieldHint(FIELD_HINTS[f.key]) + renderEditChips(f.key, data[f.key], f.placeholder)),
      ),
      renderRow("CTA links", renderFieldHint(FIELD_HINTS.ctaLinks) + renderCtaEditor(data)),
    ].join("");
  } else {
    body = [
      renderRow("Business", renderText(data.businessSummary)),
      ...GOAL_FIELDS.map((f) => renderRow(f.label, renderChips(data[f.key]))),
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

function renderVoicePanel(data, edit) {
  const section = SECTIONS[1];
  const manual = data.voiceMode === "manual";
  let body;
  if (edit) {
    const fields = manual
      ? `<div class="recap__manual">
           <div class="ap-textarea-field resizable">
             <textarea data-recap-text="voiceManual" rows="10" placeholder="Write your voice in your own words — how you open, your tone, the way you format posts, and anything to avoid…">${esc(data.voiceManual || "")}</textarea>
           </div>
         </div>`
      : [
          ...LINE_FIELDS.map((f) => renderRow(f.label, renderLineEditor(f.key, data[f.key], f.placeholder))),
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
      renderRow("Signature hooks", renderQuotes(data.signatureHooks)),
      renderRow("Closing patterns", renderQuotes(data.closingPatterns)),
      renderRow("Formatting", renderText(data.formattingStyle)),
      renderRow("Visual style", renderText(data.visualStyle)),
    ].join("");
  }
  const analyzeBtn =
    !edit && cfg.onAnalyzeVoice
      ? `<button type="button" class="ap-button ghost grey recap__panel-action" data-recap-analyze-voice><i class="ap-icon-double-chat-bubbles"></i><span>Learn from my posts</span></button>`
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
      renderRow("References", renderRefImages(data, true)),
    ].join("");
  } else {
    body = [
      renderRow("Brand color", renderSwatches(colors)),
      renderRow("Typography", renderTypeSpecimen(data)),
      renderRow("Personality", renderText(data.brandPersonality)),
      ...(Array.isArray(data.referenceImages) && data.referenceImages.length
        ? [renderRow("References", renderRefImages(data, false))]
        : []),
    ].join("");
  }
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
    `<span class="recap__meta-item"><i class="ap-icon-web" aria-hidden="true"></i>${esc(data.language || "English")}</span>`,
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
    `<div class="recap__fact"><dt>Language</dt><dd>${esc(data.language || "English")}</dd></div>`,
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
      <span class="recap-loading__eyebrow"><i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i> Crafting your Playbook</span>
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
        <i class="ap-icon-sparkles-mermaid"></i>
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
      </div>
    </div>
  `;

  const footerHtml = cfg.footer ? `<footer class="recap__footer">${cfg.footer()}</footer>` : "";

  mountTarget.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${modeClass} ${scope ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      ${raw(renderTop())}
      <div class="welcome-screen__body recap">${raw(body)}</div>
      ${raw(footerHtml)}
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

function addLine(field) {
  const data = cfg.getData();
  if (!data) return;
  const list = Array.isArray(data[field]) ? data[field].slice() : [];
  list.push("");
  data[field] = list;
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

  // Voice & style section → analyze social profiles (library mode).
  if (event.target.closest("[data-recap-analyze-voice]")) {
    cfg.onAnalyzeVoice?.();
    return;
  }

  const data = cfg.getData();
  if (!data) return;

  const penBtn = event.target.closest("[data-recap-edit-card]");
  if (penBtn) {
    if (penBtn.dataset.recapEditCard === "brand") ensureBrand(data);
    snapshot = snapshotEditable(data);
    editScope = penBtn.dataset.recapEditCard;
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
    repaint();
    return;
  }

  if (event.target.closest("[data-recap-save]")) {
    if (typeof data.name === "string") data.name = data.name.trim();
    if (Array.isArray(data.ctaLinks)) {
      data.ctaLinks = data.ctaLinks.filter((c) => (c.label || "").trim() || (c.url || "").trim() || c.suggested);
    }
    ["signatureHooks", "closingPatterns"].forEach((f) => {
      if (Array.isArray(data[f])) data[f] = data[f].filter((s) => (s || "").trim());
    });
    cfg.commit?.();
    snapshot = null;
    editScope = null;
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
    if (Array.isArray(data[field])) data[field] = data[field].filter((_, i) => i !== idx);
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
    if (Array.isArray(data[list]) && data[list][idx] !== undefined) data[list][idx] = t.value;
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
  }
}

let refImgCounter = 0;

function onChange(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  if (event.target.matches("[data-recap-language]")) {
    data.language = event.target.value;
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
  if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(event.target.dataset.recapChipInput);
  } else if (event.target.matches("[data-recap-line-field]") && event.key === "Enter") {
    event.preventDefault();
    addLine(event.target.dataset.recapLineList);
  }
}
