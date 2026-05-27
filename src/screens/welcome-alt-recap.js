// First Time User ALT — Playbook reveal. Reached at the end of the
// 3-question chat flow (context-builder.startAlt). A curated, celebratory
// presentation of what Archie captured, with PER-CARD inline editing: each
// card carries a hover-reveal pencil (like the /contexts Playbook cards);
// clicking it flips just that card into an editable form while the rest
// stays read-only. Cancel restores, Save commits back to the read view.
//
// Layout (top → bottom):
//   • Hero — brand monogram (captured accent), eyebrow, headline, the
//     voice descriptor pill, a short lead.
//   • Edit hint — infobox teaching the per-card pencil affordance.
//   • Brand overview — name + site + business summary.        [editable]
//   • Strategy — audience / content style / objective / action. [each editable]
//   • Voice — featured writing-style lead + a compact trait grid. [editable]
//   • Visual identity — condensed brand snapshot (palette + type). Read-only
//     — it's scraped from the site, not user-authored.
//   • Essentials — language + active CTA links.               [editable]
//   • Sticky footer — read: Enter Archie · editing a card: Cancel + Save.
//
// State: `editScope` is null (read) or a section key. Entering edit
// snapshots the editable fields so Cancel can revert; text edits mutate
// the live draft in place (no repaint, keeps focus). "Enter Archie" →
// save(sid) fires the draft's onComplete (switch-to-returning + reload).

import { html, raw, escapeHtml as esc } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { getDraft, isAnalysisReady, save, patchDraft, restoreDraft } from "../context-builder.js?v=46";

const WELCOME_ALT_KEY = "welcomeAltSessionId";
const WELCOME_ALT_DRAFT_KEY = "welcomeAltDraft";

const LANGUAGE_OPTIONS = ["English", "Français", "Español", "Deutsch", "Italiano", "Português"];

// Strategy chip groups — order + presentation metadata. `key` doubles as
// the draft field AND the edit scope; `placeholder` seeds the add input.
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

// Voice sub-fields rendered as the trait grid (read) / textareas (edit).
const VOICE_TRAITS = [
  { key: "vocabulary", label: "Vocabulary" },
  { key: "sentenceStructure", label: "Sentence structure" },
  { key: "personality", label: "Personality" },
  { key: "uniqueTraits", label: "Unique traits" },
];

// Staged loading sequence — a deliberate ~10s "here's what Archie is
// doing" moment between the chat and the reveal. Each stage explains a
// slice of the work while the website analysis lands in the background.
const LOADING_STAGES = [
  { title: "Reading your website", sub: "Scanning your pages, copy, and brand cues." },
  { title: "Learning your voice", sub: "Capturing your tone, vocabulary, and rhythm." },
  { title: "Mapping your audience", sub: "Working out who you're for — and what moves them." },
  { title: "Building your Playbook", sub: "Turning it all into a brief every post draws from." },
];
const STAGE_MS = 2400;

let mountTarget = null;
let loadingTimer = null;
let loadingStage = 0;
let phase = "ready"; // "loading" | "ready"
let introDoneSid = null; // sid whose intro loader has already played
let editScope = null; // null (read) | "overview" | strategy key | "voice" | "essentials"
let snapshot = null; // deep copy of editable fields, for Cancel

export function renderWelcomeAltRecap(_params, target) {
  document.body.classList.add("onboarding");
  const sid = readSessionId();
  if (!sid) {
    navigate("/welcome-alt");
    return () => {};
  }

  // On reload the in-memory draft is gone — rehydrate from the persisted
  // snapshot so a refresh stays on this step instead of bouncing to the
  // chat. With no snapshot either, there's nothing to show.
  let restored = false;
  if (!getDraft(sid)) {
    const snap = readPersistedDraft(sid);
    if (snap) {
      restoreDraft(sid, snap);
      restored = true;
    } else {
      navigate("/welcome-alt");
      return () => {};
    }
  }

  // Fresh mount always starts in read mode (no card being edited).
  editScope = null;
  snapshot = null;
  mountTarget = target;

  // Skip the loader when this session was already revealed, or was just
  // restored after a reload; otherwise play the branded sequence.
  if (restored || (introDoneSid === sid && isAnalysisReady(sid))) {
    introDoneSid = sid;
    phase = "ready";
    paint(target, sid);
  } else {
    phase = "loading";
    loadingStage = 0;
    paint(target, sid);
    startLoadingSequence(sid);
  }

  const onClickH = (event) => onClick(event, sid);
  const onInputH = (event) => onInput(event, sid);
  const onChangeH = (event) => onChange(event, sid);
  const onKeydownH = (event) => onKeydown(event, sid);
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
  };
}

function repaint(sid) {
  if (mountTarget) paint(mountTarget, sid);
}

function stopLoading() {
  if (loadingTimer) {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

// Advance one stage every STAGE_MS. On the final stage, reveal as soon as
// the website analysis is ready — so the loader lasts ~10s but never
// reveals an empty Playbook.
function startLoadingSequence(sid) {
  stopLoading();
  loadingTimer = window.setInterval(() => {
    if (loadingStage < LOADING_STAGES.length - 1) {
      loadingStage += 1;
      repaint(sid);
    } else if (isAnalysisReady(sid)) {
      stopLoading();
      introDoneSid = sid;
      phase = "ready";
      repaint(sid);
    }
    // else: hold on the final stage until the analysis lands.
  }, STAGE_MS);
}

function readSessionId() {
  try {
    return window.sessionStorage.getItem(WELCOME_ALT_KEY);
  } catch {
    return null;
  }
}

function clearSessionId() {
  try {
    window.sessionStorage.removeItem(WELCOME_ALT_KEY);
  } catch {
    /* ignore */
  }
}

// Draft persistence — so a page reload stays on the recap. We stash a
// serializable snapshot of the draft (JSON.stringify drops the onComplete
// function) keyed by sid, and rehydrate it on mount when the in-memory
// Map has been cleared by the reload.
function persistDraft(sid) {
  try {
    const d = getDraft(sid);
    if (!d) return;
    window.sessionStorage.setItem(WELCOME_ALT_DRAFT_KEY, JSON.stringify({ sid, draft: d }));
  } catch {
    /* ignore */
  }
}

function readPersistedDraft(sid) {
  try {
    const raw = window.sessionStorage.getItem(WELCOME_ALT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.sid === sid ? parsed.draft : null;
  } catch {
    return null;
  }
}

function clearPersistedDraft() {
  try {
    window.sessionStorage.removeItem(WELCOME_ALT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ── Data helpers ───────────────────────────────────────────────────────

function brandSite(draft) {
  const sites = draft?.imageVoice?.websites;
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

function ensureVoice(draft) {
  if (!draft.voiceProfile || typeof draft.voiceProfile !== "object") draft.voiceProfile = {};
  return draft.voiceProfile;
}

// Snapshot only the user-editable fields so Cancel can restore them
// without disturbing scraped data (imageVoice) or flow plumbing.
function snapshotDraft(d) {
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

// Hover-reveal pencil for a card (absolute, top-right). Mirrors the
// /contexts Playbook card affordance. `scope` is the edit target.
function cardPen(scope) {
  return `
    <div class="recap__card-actions">
      <button type="button" class="ap-icon-button transparent recap__card-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit">
        <i class="ap-icon-pen"></i>
      </button>
    </div>
  `;
}

// Cancel (×) + Save (✓) icon buttons shown in place of the pencil while a
// card/section is being edited. DS icon-buttons only offer stroked
// blue/green/red + transparent, so Save uses stroked green (confirm) and
// Cancel a transparent close.
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

// Card-level edit controls — absolute top-right, replacing the pencil.
function cardEditActions() {
  return `<div class="recap__edit-actions">${editActionButtons()}</div>`;
}

// Section-level pencil (Voice, Essentials) — lives in the section head.
function sectionPen(scope) {
  return `<button type="button" class="ap-icon-button transparent recap__section-edit" data-recap-edit-card="${scope}" title="Edit" aria-label="Edit"><i class="ap-icon-pen"></i></button>`;
}

// Section-level edit controls — sit in the section head.
function sectionEditActions() {
  return `<div class="recap__section-actions">${editActionButtons()}</div>`;
}

// Section header. `penScope` (optional) renders a hover-reveal pencil on
// the right for section-level edits (Voice, Essentials).
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

// Editable chip group — removable chips (DS close button) + an inline add
// input. Mutations route through onClick / onKeydown by field key.
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

// ── Section renderers (each branches on whether it's the active scope) ────

function renderStrategy(draft, scope) {
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
                ${edit ? renderEditChips(c.key, draft[c.key], c.placeholder) : renderChips(draft[c.key])}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderVoice(draft, edit) {
  const vp = draft.voiceProfile || {};

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
function renderBrandSnapshot(draft) {
  const site = brandSite(draft);
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
  const domain = site.domain || prettyUrl(draft.websiteUrl);
  return `
    <section class="recap__section">
      ${renderSectionHead("Visual identity", "Pulled straight from your site.")}
      <div class="recap__brand">
        <div class="recap__brand-mark">
          <span class="recap__monogram recap__monogram--sm" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(draft.name))}</span>
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

function renderEssentials(draft, edit) {
  const language = draft.language || "";
  const allCtas = Array.isArray(draft.ctaLinks) ? draft.ctaLinks : [];

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

function renderHero(draft) {
  const site = brandSite(draft);
  const colors = site?.colors || {};
  const accent = colors.accent || colors.primary || "var(--ref-color-orange-100)";
  const primary = colors.primary || accent;
  const voiceHeadline = draft.voiceProfile?.headline || "";
  const url = prettyUrl(draft.websiteUrl);
  return `
    <header class="recap__hero">
      <span class="recap__monogram" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(draft.name))}</span>
      <span class="recap__eyebrow"><i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i> Your Playbook</span>
      <h1 class="recap__title">Here's your Playbook.</h1>
      ${
        voiceHeadline
          ? `<span class="recap__voice-tag"><i class="ap-icon-quote" aria-hidden="true"></i>${esc(voiceHeadline)}</span>`
          : ""
      }
      <p class="recap__lead">
        Built from ${url ? `<strong>${esc(url)}</strong>` : "your site"} and our chat. Everything below is what Archie will use to write posts that sound like you.
      </p>
    </header>
  `;
}

function renderEditHint() {
  return `
    <div class="ap-infobox info recap__edit-hint">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">This Playbook is yours to shape. Hover any card and hit the pencil to edit it — then jump into Archie.</span>
        </div>
      </div>
    </div>
  `;
}

function renderOverview(draft, edit) {
  const url = prettyUrl(draft.websiteUrl);
  const summary = draft.businessSummary || "";

  if (edit) {
    return `
      <article class="recap__overview recap__overview--edit is-editing" data-recap-editing-card>
        ${cardEditActions()}
        <div class="recap__field">
          <label class="recap__field-label" for="recap-name">Brand name</label>
          <div class="ap-input-group">
            <input id="recap-name" type="text" data-recap-name value="${esc(draft.name || "")}" placeholder="Your brand name" />
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

  if (!draft.name && !summary) return "";
  return `
    <article class="recap__overview">
      ${cardPen("overview")}
      <div class="recap__overview-head">
        <h2 class="recap__overview-name">${esc(draft.name || "Your brand")}</h2>
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

function renderLoading(stageIdx) {
  const idx = Math.min(stageIdx, LOADING_STAGES.length - 1);
  const stage = LOADING_STAGES[idx];
  const steps = LOADING_STAGES.map((_, i) => {
    const cls = i < idx ? "is-done" : i === idx ? "is-active" : "";
    return `<span class="recap-loading__step ${cls}"></span>`;
  }).join("");
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
        aria-valuemax="${LOADING_STAGES.length}"
        aria-valuenow="${idx + 1}"
        aria-label="${esc(stage.title)}"
      >${steps}</div>
    </div>
  `;
}

function renderFooter() {
  return `
    <button type="button" class="ap-button primary orange" data-welcome-done>
      <span>Enter Archie</span>
      <i class="ap-icon-arrow-right"></i>
    </button>
  `;
}

function paint(target, sid) {
  // Keep the reload snapshot fresh whenever the analysis is in hand.
  if (isAnalysisReady(sid)) persistDraft(sid);

  // Loading phase — branded centered loader, no footer.
  if (phase === "loading") {
    target.innerHTML = html`
      <section class="welcome-screen welcome-screen--reveal welcome-screen--loading">
        <div class="welcome-screen__bg" aria-hidden="true"></div>
        <header class="welcome-screen__top">
          <span class="welcome-screen__brand">
            <i class="ap-icon-sparkles-mermaid"></i>
            Archie
          </span>
          <span class="welcome-screen__chip">BETA</span>
        </header>
        <div class="welcome-screen__body recap recap--loading">${raw(renderLoading(loadingStage))}</div>
      </section>
    `;
    return;
  }

  // Ready phase — the analysis has landed (guaranteed by the loader), so
  // every section renders with content.
  const draft = getDraft(sid);
  const scope = editScope;
  const body = [
    renderHero(draft),
    scope ? "" : renderEditHint(),
    renderOverview(draft, scope === "overview"),
    renderStrategy(draft, scope),
    renderVoice(draft, scope === "voice"),
    renderBrandSnapshot(draft),
    renderEssentials(draft, scope === "essentials"),
  ]
    .filter(Boolean)
    .join("");

  target.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${scope ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">BETA</span>
      </header>
      <div class="welcome-screen__body recap">${raw(body)}</div>
      <footer class="recap__footer">${raw(renderFooter())}</footer>
    </section>
  `;
}

// ── Edit-mode mutations ──────────────────────────────────────────────────

function addChip(sid, field) {
  const draft = getDraft(sid);
  if (!draft || !mountTarget) return;
  const input = mountTarget.querySelector(`[data-recap-chip-input="${field}"]`);
  const val = (input?.value || "").trim();
  if (!val) return;
  const list = Array.isArray(draft[field]) ? draft[field].slice() : [];
  if (!list.some((v) => v.toLowerCase() === val.toLowerCase())) list.push(val);
  draft[field] = list;
  repaint(sid);
  mountTarget.querySelector(`[data-recap-chip-input="${field}"]`)?.focus();
}

function onClick(event, sid) {
  const draft = getDraft(sid);
  if (!draft) return;

  // Enter edit mode for a single card.
  const penBtn = event.target.closest("[data-recap-edit-card]");
  if (penBtn) {
    snapshot = snapshotDraft(draft);
    editScope = penBtn.dataset.recapEditCard;
    repaint(sid);
    mountTarget
      ?.querySelector(
        "[data-recap-editing-card] input, [data-recap-editing-card] textarea, [data-recap-editing-card] select",
      )
      ?.focus();
    return;
  }

  // Cancel — restore the pre-edit snapshot, back to read.
  if (event.target.closest("[data-recap-cancel]")) {
    if (snapshot) patchDraft(sid, snapshot);
    snapshot = null;
    editScope = null;
    repaint(sid);
    return;
  }

  // Save — trim, keep the changes, back to read.
  if (event.target.closest("[data-recap-save]")) {
    if (typeof draft.name === "string") draft.name = draft.name.trim();
    if (Array.isArray(draft.ctaLinks)) {
      draft.ctaLinks = draft.ctaLinks.filter((c) => (c.label || "").trim() || (c.url || "").trim() || c.suggested);
    }
    snapshot = null;
    editScope = null;
    repaint(sid);
    return;
  }

  // Remove a strategy chip.
  const chipRemove = event.target.closest("[data-recap-chip-remove]");
  if (chipRemove) {
    const field = chipRemove.dataset.recapChipRemove;
    const idx = Number(chipRemove.dataset.recapChipIndex);
    if (Array.isArray(draft[field])) draft[field] = draft[field].filter((_, i) => i !== idx);
    repaint(sid);
    return;
  }

  // Add a strategy chip.
  const chipAdd = event.target.closest("[data-recap-chip-add]");
  if (chipAdd) {
    addChip(sid, chipAdd.dataset.recapChipAdd);
    return;
  }

  // Remove a CTA link (by its index in the draft array).
  const ctaRemove = event.target.closest("[data-recap-cta-remove]");
  if (ctaRemove) {
    const idx = Number(ctaRemove.dataset.recapCtaRemove);
    if (Array.isArray(draft.ctaLinks)) draft.ctaLinks = draft.ctaLinks.filter((_, i) => i !== idx);
    repaint(sid);
    return;
  }

  // Add a new CTA link.
  if (event.target.closest("[data-recap-cta-add]")) {
    const ctas = Array.isArray(draft.ctaLinks) ? draft.ctaLinks.slice() : [];
    ctas.push({ label: "", url: "", checked: true, suggested: false });
    draft.ctaLinks = ctas;
    repaint(sid);
    const inputs = mountTarget?.querySelectorAll('[data-recap-cta-field="label"]');
    inputs?.[inputs.length - 1]?.focus();
    return;
  }

  // Proceed into Archie.
  if (event.target.closest("[data-welcome-done]")) {
    enterArchie(sid);
    return;
  }
}

// "Enter Archie" — persist the Playbook, then finish the ALT flow: become
// a returning user and reload into the populated app. The recap owns this
// (rather than the draft's onComplete) so it still works after a reload,
// where the in-memory onComplete is gone.
function enterArchie(sid) {
  patchDraft(sid, { onComplete: null });
  const saved = save(sid);
  if (!saved) return;
  clearSessionId();
  clearPersistedDraft();
  document.body.classList.remove("onboarding");
  try {
    window.localStorage.removeItem("archie-user-mode");
  } catch {
    /* ignore */
  }
  window.location.hash = "#/";
  window.location.reload();
}

// Text edits mutate the live draft in place WITHOUT a repaint so inputs
// keep focus mid-type.
function onInput(event, sid) {
  if (!editScope) return;
  const draft = getDraft(sid);
  if (!draft) return;
  const t = event.target;
  if (t.matches("[data-recap-name]")) {
    draft.name = t.value;
  } else if (t.matches("[data-recap-summary]")) {
    draft.businessSummary = t.value;
  } else if (t.matches("[data-recap-headline]")) {
    ensureVoice(draft).headline = t.value;
  } else if (t.matches("[data-recap-voice]")) {
    ensureVoice(draft)[t.dataset.recapVoice] = t.value;
  } else if (t.matches("[data-recap-cta-field]")) {
    const idx = Number(t.dataset.recapCtaIndex);
    const field = t.dataset.recapCtaField;
    if (draft.ctaLinks?.[idx]) draft.ctaLinks[idx][field] = t.value;
  }
}

function onChange(event, sid) {
  if (!editScope) return;
  const draft = getDraft(sid);
  if (!draft) return;
  if (event.target.matches("[data-recap-language]")) {
    draft.language = event.target.value;
  }
}

function onKeydown(event, sid) {
  if (!editScope) return;
  if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(sid, event.target.dataset.recapChipInput);
  }
}
