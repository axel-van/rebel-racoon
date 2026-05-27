// First Time User ALT — Playbook reveal. Reached at the end of the
// 3-question chat flow (context-builder.startAlt). A curated, celebratory
// presentation of what Archie captured, with an inline EDIT mode: the
// reveal flips into an editable sheet in place (no conversational editor),
// the user tweaks fields directly, then Saves back to the read view.
//
// Layout (top → bottom):
//   • Hero — brand monogram (captured accent), eyebrow, headline, the
//     voice descriptor pill, a short lead.
//   • Brand overview — name + site + business summary.
//   • Strategy — audience / content style / objective / action.
//   • Voice — featured writing-style lead + a compact trait grid.
//   • Visual identity — condensed brand snapshot (palette + type). Always
//     read-only — it's scraped from the site, not user-authored.
//   • Essentials — language + active CTA links.
//   • Sticky footer — read: Edit + Enter Archie · edit: Cancel + Save.
//
// State flow: contextBuilder.maybeOpenAltBrief stashes the ALT sessionId
// in sessionStorage under WELCOME_ALT_KEY, then navigates here. We read
// the draft via getDraft(sid), render. "Edit" snapshots the draft and
// flips every section (except visual identity) into inputs; edits mutate
// the live draft. "Save" keeps them, "Cancel" restores the snapshot.
// "Enter Archie" → save(sid) fires the draft's onComplete (switch-to-
// returning + reload, set on session mount).

import { html, raw, escapeHtml as esc } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { getDraft, isAnalysisReady, save, patchDraft } from "../context-builder.js?v=45";

const WELCOME_ALT_KEY = "welcomeAltSessionId";
const POLL_INTERVAL_MS = 400;

const LANGUAGE_OPTIONS = ["English", "Français", "Español", "Deutsch", "Italiano", "Português"];

// Strategy chip groups — order + presentation metadata. `key` matches the
// draft field; `placeholder` seeds the inline "add" input in edit mode.
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

let pollTimer = null;
let mountTarget = null;
let editing = false;
let snapshot = null; // deep copy of editable fields, for Cancel

export function renderWelcomeAltRecap(_params, target) {
  document.body.classList.add("onboarding");
  const sid = readSessionId();
  if (!sid || !getDraft(sid)) {
    // No active draft — refreshed past the timeout or arrived without
    // going through the chat. Send back to the ALT entry.
    navigate("/welcome-alt");
    return () => {};
  }

  // Fresh mount always starts in read mode.
  editing = false;
  snapshot = null;
  mountTarget = target;

  paint(target, sid);

  // Defensive — if analysis hasn't landed yet, poll until it does.
  if (!isAnalysisReady(sid)) {
    stopPolling();
    pollTimer = window.setInterval(() => {
      if (isAnalysisReady(sid)) {
        stopPolling();
        paint(target, sid);
      }
    }, POLL_INTERVAL_MS);
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
    stopPolling();
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

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
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

// ── Read-mode fragment renderers ─────────────────────────────────────────

function renderSectionHead(title, hint) {
  return `
    <div class="recap__section-head">
      <div class="recap__section-heading">
        <h2 class="recap__section-title">${esc(title)}</h2>
        ${hint ? `<p class="recap__section-hint">${esc(hint)}</p>` : ""}
      </div>
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

// Editable chip group — removable chips (DS close button) + an inline
// add input. Mutations route through onClick / onKeydown by field key.
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
        <input
          type="text"
          class="recap__chip-add-input"
          data-recap-chip-input="${field}"
          placeholder="${esc(placeholder)}"
          aria-label="${esc(placeholder)}"
        />
        <button type="button" class="recap__chip-add-btn" data-recap-chip-add="${field}" aria-label="Add">
          <i class="ap-icon-plus"></i>
        </button>
      </span>
    </div>
  `;
}

function renderStrategy(draft, edit) {
  return `
    <section class="recap__section">
      ${renderSectionHead("What Archie will create", "The strategy behind every post.")}
      <div class="recap__grid recap__grid--strategy">
        ${STRATEGY_FIELDS.map(
          (c) => `
            <article class="recap__stat">
              <span class="recap__stat-icon"><i class="${c.icon}" aria-hidden="true"></i></span>
              <div class="recap__stat-body">
                <h3 class="recap__stat-label">${esc(c.label)}</h3>
                <p class="recap__stat-caption">${esc(c.caption)}</p>
                ${edit ? renderEditChips(c.key, draft[c.key], c.placeholder) : renderChips(draft[c.key])}
              </div>
            </article>
          `,
        ).join("")}
      </div>
    </section>
  `;
}

function renderVoice(draft, edit) {
  const vp = draft.voiceProfile || {};

  if (edit) {
    return `
      <section class="recap__section">
        ${renderSectionHead("How you sound", "The voice Archie writes in.")}
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
      </section>
    `;
  }

  const lead = vp.writingStyle || "";
  const traits = VOICE_TRAITS.map((t) => ({ label: t.label, text: vp[t.key] })).filter((t) => t.text);
  if (!lead && !traits.length) return "";
  return `
    <section class="recap__section">
      ${renderSectionHead("How you sound", "The voice Archie writes in.")}
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
      <section class="recap__section recap__section--essentials">
        ${renderSectionHead("Essentials")}
        <div class="recap__essentials recap__essentials--edit">
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
      ${renderSectionHead("Essentials")}
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

function renderHero(draft, edit) {
  const site = brandSite(draft);
  const colors = site?.colors || {};
  const accent = colors.accent || colors.primary || "var(--ref-color-orange-100)";
  const primary = colors.primary || accent;
  const voiceHeadline = draft.voiceProfile?.headline || "";
  const url = prettyUrl(draft.websiteUrl);
  return `
    <header class="recap__hero">
      <span class="recap__monogram" style="--brand-accent:${esc(accent)}; --brand-primary:${esc(primary)};">${esc(initials(draft.name))}</span>
      <span class="recap__eyebrow"><i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i> ${edit ? "Editing your Playbook" : "Your Playbook"}</span>
      <h1 class="recap__title">Here's your Playbook.</h1>
      ${
        !edit && voiceHeadline
          ? `<span class="recap__voice-tag"><i class="ap-icon-quote" aria-hidden="true"></i>${esc(voiceHeadline)}</span>`
          : ""
      }
      <p class="recap__lead">
        ${
          edit
            ? "Tweak anything below, then save. Visual identity is pulled from your site and stays as-is."
            : `Built from ${url ? `<strong>${esc(url)}</strong>` : "your site"} and our chat. Everything below is what Archie will use to write posts that sound like you.`
        }
      </p>
    </header>
  `;
}

function renderOverview(draft, edit) {
  const url = prettyUrl(draft.websiteUrl);
  const summary = draft.businessSummary || "";

  if (edit) {
    return `
      <article class="recap__overview recap__overview--edit">
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

function renderPending() {
  return `
    <div class="recap__pending">
      <i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i>
      <p>Reading your site…</p>
      <p class="recap__pending-sub">Your Playbook lands in a moment.</p>
    </div>
  `;
}

function renderFooter(ready, edit) {
  if (edit) {
    return `
      <button type="button" class="ap-button stroked grey" data-recap-cancel>
        <span>Cancel</span>
      </button>
      <button type="button" class="ap-button primary orange" data-recap-save>
        <i class="ap-icon-check"></i>
        <span>Save</span>
      </button>
    `;
  }
  return `
    <button type="button" class="ap-button stroked grey" data-recap-edit ${ready ? "" : "disabled"}>
      <i class="ap-icon-pen"></i>
      <span>Edit</span>
    </button>
    <button type="button" class="ap-button primary orange" data-welcome-done ${ready ? "" : "disabled"}>
      <span>Enter Archie</span>
      <i class="ap-icon-arrow-right"></i>
    </button>
  `;
}

function paint(target, sid) {
  const draft = getDraft(sid);
  const ready = isAnalysisReady(sid);
  const edit = editing && ready;
  const body = ready
    ? [
        renderHero(draft, edit),
        renderOverview(draft, edit),
        renderStrategy(draft, edit),
        renderVoice(draft, edit),
        renderBrandSnapshot(draft),
        renderEssentials(draft, edit),
      ]
        .filter(Boolean)
        .join("")
    : renderPending();

  target.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal ${edit ? "is-editing" : ""}">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">BETA</span>
      </header>
      <div class="welcome-screen__body recap">${raw(body)}</div>
      <footer class="recap__footer">${raw(renderFooter(ready, edit))}</footer>
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

  // Enter edit mode.
  if (event.target.closest("[data-recap-edit]")) {
    snapshot = snapshotDraft(draft);
    editing = true;
    repaint(sid);
    return;
  }

  // Cancel — restore the pre-edit snapshot and leave edit mode.
  if (event.target.closest("[data-recap-cancel]")) {
    if (snapshot) patchDraft(sid, snapshot);
    snapshot = null;
    editing = false;
    repaint(sid);
    return;
  }

  // Save — trim, keep the changes, leave edit mode.
  if (event.target.closest("[data-recap-save]")) {
    if (typeof draft.name === "string") draft.name = draft.name.trim();
    if (Array.isArray(draft.ctaLinks)) {
      draft.ctaLinks = draft.ctaLinks.filter((c) => (c.label || "").trim() || (c.url || "").trim() || c.suggested);
    }
    snapshot = null;
    editing = false;
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

  // Proceed into Archie — save() fires the ALT onComplete (switch-to-
  // returning + reload + dashboard nav).
  if (event.target.closest("[data-welcome-done]")) {
    const saved = save(sid);
    if (!saved) return;
    clearSessionId();
    return;
  }
}

// Text edits mutate the live draft in place WITHOUT a repaint so inputs
// keep focus mid-type.
function onInput(event, sid) {
  if (!editing) return;
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
  if (!editing) return;
  const draft = getDraft(sid);
  if (!draft) return;
  if (event.target.matches("[data-recap-language]")) {
    draft.language = event.target.value;
  }
}

function onKeydown(event, sid) {
  if (!editing) return;
  if (event.target.matches("[data-recap-chip-input]") && event.key === "Enter") {
    event.preventDefault();
    addChip(sid, event.target.dataset.recapChipInput);
  }
}
