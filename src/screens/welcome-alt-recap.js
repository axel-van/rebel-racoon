// First Time User ALT — Playbook reveal. Reached at the end of the
// 3-question chat flow (context-builder.startAlt). This is a curated,
// celebratory presentation of what Archie captured — NOT a re-skin of
// the editing panel. The brief panel is an *editing* surface; the end of
// a conversational flow deserves a "voilà ce qu'on a construit ensemble"
// moment with clear hierarchy, brand presence, and per-section refine.
//
// Layout (top → bottom):
//   • Hero — brand monogram (captured accent), eyebrow, headline, the
//     voice descriptor pill, a short lead.
//   • Brand overview — name + site + business summary.
//   • Strategy — audience / content style / objective / action, re-curated
//     into four icon-led stat cards.
//   • Voice — featured writing-style lead + a compact trait grid.
//   • Visual identity — condensed brand snapshot (palette + type), the
//     "hybrid" staging of the captured brand. No raw hex / px handoff noise.
//   • Essentials — language + active CTA links.
//   • Sticky footer — Fine-tune Playbook + Enter Archie.
//
// State flow: contextBuilder.maybeOpenAltBrief stashes the ALT sessionId
// in sessionStorage under WELCOME_ALT_KEY, then navigates here. We read
// the draft via getDraft(sid), render. "Enter Archie" → save(sid) fires
// the draft's onComplete (switch-to-returning + reload, set on session
// mount). "Fine-tune" / per-section "Refine" save the playbook then open
// the conversational editor on the matching section.

import { html, raw, escapeHtml as esc } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { getDraft, isAnalysisReady, save, patchDraft } from "../context-builder.js?v=45";
import { launch as launchPlaybookEditor, refineField } from "../playbook-editor.js?v=10";

const WELCOME_ALT_KEY = "welcomeAltSessionId";
const POLL_INTERVAL_MS = 400;

// Maps a recap section to the conversational editor's targeted sub-flow.
const REFINE_FIELD = {
  strategy: "brief",
  voice: "voice",
  branding: "branding",
  essentials: "cta",
};

let pollTimer = null;

export function renderWelcomeAltRecap(_params, target) {
  document.body.classList.add("onboarding");
  const sid = readSessionId();
  if (!sid || !getDraft(sid)) {
    // No active draft — refreshed past the timeout or arrived without
    // going through the chat. Send back to the ALT entry.
    navigate("/welcome-alt");
    return () => {};
  }

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

  const handler = (event) => onClick(event, sid);
  target.addEventListener("click", handler);

  return () => {
    stopPolling();
    target.removeEventListener("click", handler);
  };
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

// ── Fragment renderers ───────────────────────────────────────────────────

function renderSectionHead(title, field, hint) {
  const refine = REFINE_FIELD[field]
    ? `<button type="button" class="recap__refine" data-recap-refine="${field}">
         <i class="ap-icon-sparkles" aria-hidden="true"></i><span>Refine</span>
       </button>`
    : "";
  return `
    <div class="recap__section-head">
      <div class="recap__section-heading">
        <h2 class="recap__section-title">${esc(title)}</h2>
        ${hint ? `<p class="recap__section-hint">${esc(hint)}</p>` : ""}
      </div>
      ${refine}
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

function renderStrategy(draft) {
  const cells = [
    { icon: "ap-icon-multiple-users", label: "Audience", caption: "Who we write for", values: draft.audience },
    { icon: "ap-icon-pen", label: "Content style", caption: "How posts read", values: draft.contentStyle },
    { icon: "ap-icon-target", label: "Objective", caption: "What we optimise for", values: draft.objective },
    {
      icon: "ap-icon-megaphone",
      label: "Drives action",
      caption: "What posts push toward",
      values: draft.contentAction,
    },
  ];
  return `
    <section class="recap__section">
      ${renderSectionHead("What Archie will create", "strategy", "The strategy behind every post.")}
      <div class="recap__grid recap__grid--strategy">
        ${cells
          .map(
            (c) => `
            <article class="recap__stat">
              <span class="recap__stat-icon"><i class="${c.icon}" aria-hidden="true"></i></span>
              <div class="recap__stat-body">
                <h3 class="recap__stat-label">${esc(c.label)}</h3>
                <p class="recap__stat-caption">${esc(c.caption)}</p>
                ${renderChips(c.values)}
              </div>
            </article>
          `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderVoice(draft) {
  const vp = draft.voiceProfile || {};
  const lead = vp.writingStyle || "";
  const traits = [
    { label: "Vocabulary", text: vp.vocabulary },
    { label: "Sentence structure", text: vp.sentenceStructure },
    { label: "Personality", text: vp.personality },
    { label: "Unique traits", text: vp.uniqueTraits },
  ].filter((t) => t.text);
  if (!lead && !traits.length) return "";
  return `
    <section class="recap__section">
      ${renderSectionHead("How you sound", "voice", "The voice Archie writes in.")}
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
      ${renderSectionHead("Visual identity", "branding", "Pulled straight from your site.")}
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

function renderEssentials(draft) {
  const language = draft.language || "";
  const ctas = Array.isArray(draft.ctaLinks) ? draft.ctaLinks.filter((l) => l.checked) : [];
  if (!language && !ctas.length) return "";
  return `
    <section class="recap__section recap__section--essentials">
      ${renderSectionHead("Essentials", "essentials")}
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

function renderOverview(draft) {
  const url = prettyUrl(draft.websiteUrl);
  const summary = draft.businessSummary || "";
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

function paint(target, sid) {
  const draft = getDraft(sid);
  const ready = isAnalysisReady(sid);
  const body = ready
    ? [
        renderHero(draft),
        renderOverview(draft),
        renderStrategy(draft),
        renderVoice(draft),
        renderBrandSnapshot(draft),
        renderEssentials(draft),
      ]
        .filter(Boolean)
        .join("")
    : renderPending();

  target.innerHTML = html`
    <section class="welcome-screen welcome-screen--reveal">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">BETA</span>
      </header>
      <div class="welcome-screen__body recap">${raw(body)}</div>
      <footer class="recap__footer">
        <button type="button" class="ap-button stroked grey" data-welcome-finetune ${ready ? "" : "disabled"}>
          <i class="ap-icon-sparkles"></i>
          <span>Fine-tune Playbook</span>
        </button>
        <button type="button" class="ap-button primary orange" data-welcome-done ${ready ? "" : "disabled"}>
          <span>Enter Archie</span>
          <i class="ap-icon-arrow-right"></i>
        </button>
      </footer>
    </section>
  `;
}

// ── Actions ──────────────────────────────────────────────────────────────

// Persist the draft as a Context WITHOUT triggering the ALT flow's
// switch-to-returning reload, then return the saved context so the caller
// can open the editor. The reload is reserved for the "Enter Archie" path;
// refine/fine-tune need the page to stay put so the editor can launch.
function saveForRefine(sid) {
  patchDraft(sid, { onComplete: null });
  const saved = save(sid);
  clearSessionId();
  return saved;
}

function onClick(event, sid) {
  const refineBtn = event.target.closest("[data-recap-refine]");
  if (refineBtn) {
    const field = REFINE_FIELD[refineBtn.dataset.recapRefine];
    const saved = saveForRefine(sid);
    if (!saved || !field) return;
    document.body.classList.remove("onboarding");
    refineField(saved.id, field, "/");
    return;
  }

  if (event.target.closest("[data-welcome-finetune]")) {
    const saved = saveForRefine(sid);
    if (!saved) return;
    document.body.classList.remove("onboarding");
    launchPlaybookEditor(saved.id, "/");
    return;
  }

  if (event.target.closest("[data-welcome-done]")) {
    const saved = save(sid);
    if (!saved) return;
    clearSessionId();
    // save() fires the ALT onComplete (switch-to-returning + reload +
    // dashboard nav). Nothing else to do here.
    return;
  }
}
