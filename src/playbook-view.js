// Shared Playbook view + per-card editor. Renders the curated reveal
// (hero · overview · strategy · voice · visual identity · essentials) and
// the inline per-card edit machine. Driven by a `cfg` adapter so the same
// surface powers two contexts:
//   • onboarding (welcome-alt-recap) — a context-builder DRAFT, with a
//     staged loader and an "Enter Archie" finish.
//   • library (/playbook/:id)        — a saved Context, in the app shell,
//     editing straight into the store with a "Back to Playbooks" exit.
//
// The renderers operate on a plain `data` object (draft or Context — both
// expose the same field names). Persistence + chrome + copy are injected
// via `cfg`; the edit state (editScope / snapshot) lives module-local and
// is safe because only one route renders at a time.

import { html, raw, escapeHtml as esc } from "./utils.js?v=20";

// Archie's UI and AI generation are English-only today. Other languages
// were removed (audit B8) to keep the Playbook field honest — re-add them
// here AND in components/right-panel.js LANGUAGE_OPTIONS when multilingual
// generation ships.
const LANGUAGE_OPTIONS = ["English"];

const STRATEGY_FIELDS = [
  {
    key: "audience",
    icon: "ap-icon-multiple-users",
    label: "Audience",
    caption: "Who we write for",
    placeholder: "Add an audience…",
  },
  {
    key: "contentStyle",
    icon: "ap-icon-pen",
    label: "Content style",
    caption: "How posts read",
    placeholder: "Add a style…",
  },
  {
    key: "objective",
    icon: "ap-icon-target",
    label: "Objective",
    caption: "What we optimise for",
    placeholder: "Add an objective…",
  },
  {
    key: "contentAction",
    icon: "ap-icon-megaphone",
    label: "Drives action",
    caption: "What posts push toward",
    placeholder: "Add an action…",
  },
];

const VOICE_TRAITS = [
  { key: "vocabulary", label: "Vocabulary" },
  { key: "sentenceStructure", label: "Sentence structure" },
  { key: "personality", label: "Personality" },
  { key: "uniqueTraits", label: "Unique traits" },
];

const STAGE_MS = 2400;

let mountTarget = null;
let cfg = null;
let editScope = null; // null (read) | "overview" | strategy key | "voice" | "essentials"
let snapshot = null; // deep copy of editable fields, for Cancel
let loadingTimer = null;
let loadingStage = 0;
let phase = "ready"; // "loading" | "ready"

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
//   hero: { eyebrow, title, lead },    // hero copy (lead may be raw html)
//   editHint: string | null,           // infobox message (null hides it)
//   footer(): string,                  // footer button(s) html
//   onFooter(event): boolean,          // handle footer clicks (return true if handled)
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

function ensureVoice(data) {
  if (!data.voiceProfile || typeof data.voiceProfile !== "object") data.voiceProfile = {};
  return data.voiceProfile;
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
      voiceProfile: d.voiceProfile || null,
      language: d.language || "",
      ctaLinks: d.ctaLinks || [],
    }),
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────

function cardPen(scope) {
  return `
    <div class="recap__card-actions">
      <button type="button" class="ap-icon-button transparent recap__card-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit">
        <i class="ap-icon-pen"></i>
      </button>
    </div>
  `;
}

function editActionButtons() {
  return `
    <button type="button" class="ap-icon-button transparent recap__edit-cancel" data-recap-cancel title="Cancel" aria-label="Cancel changes">
      <i class="ap-icon-close"></i>
    </button>
    <button type="button" class="ap-icon-button stroked green recap__edit-save" data-recap-save title="Save" aria-label="Save changes">
      <i class="ap-icon-check"></i>
    </button>
  `;
}

function cardEditActions() {
  return `<div class="recap__edit-actions">${editActionButtons()}</div>`;
}

function sectionPen(scope) {
  return `<button type="button" class="ap-icon-button transparent recap__section-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit"><i class="ap-icon-pen"></i></button>`;
}

function sectionEditActions() {
  return `<div class="recap__section-actions">${editActionButtons()}</div>`;
}

function renderSectionHead(title, hint, actions = "") {
  return `
    <div class="recap__section-head">
      <div class="recap__section-heading">
        <h2 class="recap__section-title">${esc(title)}</h2>
        ${hint ? `<p class="recap__section-hint">${esc(hint)}</p>` : ""}
      </div>
      ${actions}
    </div>
  `;
}

function renderChips(values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) return `<span class="recap__chip-empty">Not set yet</span>`;
  return `<div class="recap__chips">${list
    .map((v) => `<span class="ap-tag blue recap__chip">${esc(v)}</span>`)
    .join("")}</div>`;
}

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
        <button type="button" class="ap-icon-button transparent recap__chip-add-btn" data-recap-chip-add="${field}" aria-label="Add">
          <i class="ap-icon-plus"></i>
        </button>
      </span>
    </div>
  `;
}

// ── Section renderers ────────────────────────────────────────────────────

function renderHero(data) {
  const site = brandSite(data);
  const colors = site?.colors || {};
  const accent = colors.accent || colors.primary || "var(--ref-color-orange-100)";
  const primary = colors.primary || accent;
  const voiceHeadline = data.voiceProfile?.headline || "";
  const h = cfg.hero || {};
  return `
    <header class="recap__hero">
      <span class="recap__monogram" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(data.name))}</span>
      <span class="recap__eyebrow"><i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i> ${esc(h.eyebrow || "Your Playbook")}</span>
      <h1 class="recap__title">${esc(typeof h.title === "function" ? h.title(data) : h.title || "Here's your Playbook.")}</h1>
      ${
        voiceHeadline
          ? `<span class="recap__voice-tag"><i class="ap-icon-quote" aria-hidden="true"></i>${esc(voiceHeadline)}</span>`
          : ""
      }
      ${h.lead ? `<p class="recap__lead">${typeof h.lead === "function" ? h.lead(data) : h.lead}</p>` : ""}
    </header>
  `;
}

function renderEditHint() {
  if (!cfg.editHint) return "";
  return `
    <div class="ap-infobox info recap__edit-hint">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">${esc(cfg.editHint)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderOverview(data, edit) {
  const url = prettyUrl(data.websiteUrl);
  const summary = data.businessSummary || "";

  if (edit) {
    return `
      <article class="recap__overview recap__overview--edit is-editing" data-recap-editing-card>
        ${cardEditActions()}
        <div class="recap__field">
          <label class="recap__field-label" for="recap-name">Brand name</label>
          <div class="ap-input-group">
            <input id="recap-name" type="text" data-recap-name value="${esc(data.name || "")}" placeholder="Your brand name" />
          </div>
        </div>
        ${url ? `<p class="recap__overview-url"><i class="ap-icon-web" aria-hidden="true"></i> ${esc(url)}</p>` : ""}
        <div class="recap__field">
          <label class="recap__field-label" for="recap-summary">Business summary</label>
          <div class="ap-textarea-field resizable">
            <textarea id="recap-summary" data-recap-summary rows="5" placeholder="Describe your business in a few sentences…">${esc(summary)}</textarea>
          </div>
        </div>
      </article>
    `;
  }

  if (!data.name && !summary) return "";
  return `
    <article class="recap__overview">
      ${cardPen("overview")}
      <div class="recap__overview-head">
        <h2 class="recap__overview-name">${esc(data.name || "Your brand")}</h2>
        ${
          url
            ? `<a class="recap__overview-url" href="https://${esc(url)}" target="_blank" rel="noreferrer noopener"><i class="ap-icon-web" aria-hidden="true"></i> ${esc(url)}</a>`
            : ""
        }
      </div>
      ${summary ? `<p class="recap__overview-summary">${esc(summary)}</p>` : ""}
    </article>
  `;
}

function renderStrategy(data, scope) {
  return `
    <section class="recap__section">
      ${renderSectionHead("What Archie will create", "The strategy behind every post.")}
      <div class="recap__grid recap__grid--strategy">
        ${STRATEGY_FIELDS.map((c) => {
          const edit = scope === c.key;
          return `
            <article class="recap__stat ${edit ? "is-editing" : ""}" ${edit ? "data-recap-editing-card" : ""}>
              ${edit ? cardEditActions() : cardPen(c.key)}
              <span class="recap__stat-icon"><i class="${c.icon}" aria-hidden="true"></i></span>
              <div class="recap__stat-body">
                <h3 class="recap__stat-label">${esc(c.label)}</h3>
                <p class="recap__stat-caption">${esc(c.caption)}</p>
                ${edit ? renderEditChips(c.key, data[c.key], c.placeholder) : renderChips(data[c.key])}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderVoice(data, edit) {
  const vp = data.voiceProfile || {};

  if (edit) {
    return `
      <section class="recap__section is-editing" data-recap-editing-card>
        ${renderSectionHead("How you sound", "The voice Archie writes in.", sectionEditActions())}
        <div class="recap__editbox">
          <div class="recap__field">
            <label class="recap__field-label">Voice in three words</label>
            <div class="ap-input-group">
              <input type="text" data-recap-headline value="${esc(vp.headline || "")}" placeholder="e.g. Professional · data-driven · approachable" />
            </div>
          </div>
          <div class="recap__field">
            <label class="recap__field-label">Writing style</label>
            <div class="ap-textarea-field resizable">
              <textarea data-recap-voice="writingStyle" rows="3" placeholder="How the writing reads…">${esc(vp.writingStyle || "")}</textarea>
            </div>
          </div>
          <div class="recap__grid recap__grid--voice">
            ${VOICE_TRAITS.map(
              (t) => `
                <div class="recap__field">
                  <label class="recap__field-label">${esc(t.label)}</label>
                  <div class="ap-textarea-field resizable">
                    <textarea data-recap-voice="${t.key}" rows="3">${esc(vp[t.key] || "")}</textarea>
                  </div>
                </div>
              `,
            ).join("")}
          </div>
        </div>
      </section>
    `;
  }

  const lead = vp.writingStyle || "";
  const traits = VOICE_TRAITS.map((t) => ({ label: t.label, text: vp[t.key] })).filter((t) => t.text);
  if (!lead && !traits.length) return "";
  return `
    <section class="recap__section">
      ${renderSectionHead("How you sound", "The voice Archie writes in.", sectionPen("voice"))}
      ${
        lead
          ? `<blockquote class="recap__voice-lead">
               <i class="ap-icon-quote" aria-hidden="true"></i>
               <p>${esc(lead)}</p>
             </blockquote>`
          : ""
      }
      ${
        traits.length
          ? `<div class="recap__grid recap__grid--voice">
               ${traits
                 .map(
                   (t) => `
                   <article class="recap__trait">
                     <h3 class="recap__trait-label">${esc(t.label)}</h3>
                     <p class="recap__trait-text">${esc(t.text)}</p>
                   </article>
                 `,
                 )
                 .join("")}
             </div>`
          : ""
      }
    </section>
  `;
}

// Visual identity is always read-only — scraped from the site, not authored.
function renderBrandSnapshot(data) {
  const site = brandSite(data);
  if (!site) return "";
  const colors = site.colors || {};
  const accent = colors.accent || colors.primary || "var(--ref-color-orange-100)";
  const primary = colors.primary || accent;
  const swatches = [
    { label: "Primary", hex: colors.primary },
    { label: "Accent", hex: colors.accent },
    { label: "Background", hex: colors.background },
  ].filter((s) => s.hex);
  const font = site.typography?.primaryFont || "";
  const domain = site.domain || prettyUrl(data.websiteUrl);
  return `
    <section class="recap__section">
      ${renderSectionHead("Visual identity", "Pulled straight from your site.")}
      <div class="recap__brand">
        <div class="recap__brand-mark">
          <span class="recap__monogram recap__monogram--sm" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(data.name))}</span>
          <span class="recap__brand-domain">${esc(domain || "")}</span>
        </div>
        ${
          swatches.length
            ? `<div class="recap__palette">
                 ${swatches
                   .map(
                     (s) => `
                     <div class="recap__swatch">
                       <span class="recap__swatch-dot" style="background:${esc(s.hex)};"></span>
                       <span class="recap__swatch-label">${esc(s.label)}</span>
                     </div>
                   `,
                   )
                   .join("")}
               </div>`
            : ""
        }
        ${
          font
            ? `<div class="recap__type">
                 <span class="recap__type-specimen" style="font-family:'${esc(font)}', var(--sys-text-style-body-font-family);">Aa</span>
                 <span class="recap__type-name">${esc(font)}</span>
               </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderEssentials(data, edit) {
  const language = data.language || "";
  const allCtas = Array.isArray(data.ctaLinks) ? data.ctaLinks : [];

  if (edit) {
    const selected = language || "English";
    const ctaRows = allCtas
      .map((c, i) => ({ ...c, _i: i }))
      .filter((c) => c.checked)
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
      <section class="recap__section recap__section--essentials is-editing" data-recap-editing-card>
        ${renderSectionHead("Essentials", null, sectionEditActions())}
        <div class="recap__editbox">
          <div class="recap__field recap__field--language">
            <label class="recap__field-label">Language</label>
            <select class="ap-native-select" data-recap-language aria-label="Language">
              ${LANGUAGE_OPTIONS.map((o) => `<option value="${esc(o)}" ${o === selected ? "selected" : ""}>${esc(o)}</option>`).join("")}
            </select>
          </div>
          <div class="recap__field recap__field--ctas">
            <label class="recap__field-label">CTA links</label>
            <div class="recap__cta-edit-list">${ctaRows}</div>
            <button type="button" class="recap__add-link" data-recap-cta-add>
              <i class="ap-icon-plus"></i><span>Add link</span>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  const ctas = allCtas.filter((l) => l.checked);
  if (!language && !ctas.length) return "";
  return `
    <section class="recap__section recap__section--essentials">
      ${renderSectionHead("Essentials", null, sectionPen("essentials"))}
      <div class="recap__essentials">
        ${
          language
            ? `<div class="recap__essential">
                 <span class="recap__essential-label">Language</span>
                 <span class="ap-tag grey recap__chip">${esc(language)}</span>
               </div>`
            : ""
        }
        ${
          ctas.length
            ? `<div class="recap__essential recap__essential--ctas">
                 <span class="recap__essential-label">CTA links</span>
                 <ul class="recap__cta-list">
                   ${ctas
                     .map(
                       (c) => `
                       <li class="recap__cta">
                         <i class="ap-icon-link" aria-hidden="true"></i>
                         <span class="recap__cta-text">${esc(c.label || prettyUrl(c.url))}</span>
                       </li>
                     `,
                     )
                     .join("")}
                 </ul>
               </div>`
            : ""
        }
      </div>
    </section>
  `;
}

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
  const body = [
    renderHero(data),
    scope ? "" : renderEditHint(),
    renderOverview(data, scope === "overview"),
    renderStrategy(data, scope),
    renderVoice(data, scope === "voice"),
    renderBrandSnapshot(data),
    renderEssentials(data, scope === "essentials"),
  ]
    .filter(Boolean)
    .join("");

  const footerHtml = cfg.footer ? `<footer class="recap__footer">${cfg.footer()}</footer>` : "";

  mountTarget.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${modeClass} ${scope ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      ${raw(renderTop())}
      <div class="welcome-screen__body recap">${raw(body)}</div>
      ${raw(footerHtml)}
    </section>
  `;
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

function onClick(event) {
  const data = cfg.getData();
  if (!data) return;

  const penBtn = event.target.closest("[data-recap-edit-card]");
  if (penBtn) {
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
    cfg.commit?.();
    snapshot = null;
    editScope = null;
    repaint();
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

  // Footer (mode-specific) — Enter Archie / Back to Playbooks.
  cfg.onFooter?.(event);
}

// Text edits mutate the live data object WITHOUT a repaint so inputs keep
// focus mid-type.
function onInput(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  const t = event.target;
  if (t.matches("[data-recap-name]")) {
    data.name = t.value;
  } else if (t.matches("[data-recap-summary]")) {
    data.businessSummary = t.value;
  } else if (t.matches("[data-recap-headline]")) {
    ensureVoice(data).headline = t.value;
  } else if (t.matches("[data-recap-voice]")) {
    ensureVoice(data)[t.dataset.recapVoice] = t.value;
  } else if (t.matches("[data-recap-cta-field]")) {
    const idx = Number(t.dataset.recapCtaIndex);
    const field = t.dataset.recapCtaField;
    if (data.ctaLinks?.[idx]) data.ctaLinks[idx][field] = t.value;
  }
}

function onChange(event) {
  if (!editScope) return;
  const data = cfg.getData();
  if (!data) return;
  if (event.target.matches("[data-recap-language]")) {
    data.language = event.target.value;
  }
}

function onKeydown(event) {
  if (!editScope) return;
  if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(event.target.dataset.recapChipInput);
  }
}
