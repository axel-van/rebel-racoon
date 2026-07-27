// Research — pure render helpers.
//
// Same contract as connectors-view.js and screens/session/thread-turns.js:
// PURE. No store reads, no DOM, no side effects — everything arrives through
// the `state` argument. That's what lets the finding card render in two places
// (the /research feed and the "Read the research" modal footer) without either
// surface importing the other.
//
// Screen state shape (built by screens/research.js):
//   {
//     findings: Finding[],        // already filtered to the active Playbook
//     dismissedCount: number,
//     showDismissed: boolean,
//     playbooks: [{ id, name }],  // for the picker; hidden when length < 2
//     contextId: string,
//     config: { enabledSourceIds, cadence, notify },
//     scanning: boolean,
//     lastScanAt: string | null,
//     sources: RESEARCH_SOURCES,  // the catalog, passed in to stay pure
//     cadences: CADENCES,
//   }

import { html, raw } from "./utils.js?v=21";
import { renderEmptyState } from "./components/empty-state.js?v=1";

// ── Small pieces ──────────────────────────────────────────────────────────

function findSource(state, sourceId) {
  return (state.sources || []).find((s) => s.id === sourceId) || null;
}

function cadenceAdverb(state) {
  const c = (state.cadences || []).find((x) => x.id === state.config?.cadence);
  return c ? c.adverb : "weekly";
}

// The tinted source glyph. `accent` is a semantic key, resolved to
// `--research-accent` by a `.research-badge--<accent>` class in the stylesheet
// — never a hex here.
function renderBadge(source, { size = "md" } = {}) {
  if (!source) return "";
  return html`<span class="research-badge research-badge--${source.accent} research-badge--${size}" aria-hidden="true"
    ><i class="${source.icon}"></i
  ></span>`;
}

// ── Page chrome ───────────────────────────────────────────────────────────

// "2 sources · refreshes weekly · last scan 5h ago". The cadence shows up as
// prose because that's all it drives — it is not a timer.
function renderSubline(state) {
  const count = (state.config?.enabledSourceIds || []).length;
  const bits = [`${count} ${count === 1 ? "source" : "sources"}`, `refreshes ${cadenceAdverb(state)}`];
  if (state.lastScanAt) bits.push(`last scan ${state.lastScanAt}`);
  return bits.join(" · ");
}

// The Playbook picker — a DS .ap-select over the native <details> disclosure,
// the same shape the top-posts toolbar uses. Hidden when there's only one
// Playbook: a picker with a single option is noise.
function renderPlaybookPicker(state) {
  const list = state.playbooks || [];
  if (list.length < 2) return "";
  const active = list.find((p) => p.id === state.contextId) || list[0];
  const options = list
    .map((p) => {
      const on = p.id === active.id;
      return html`<div
        class="ap-select-option${raw(on ? " selected" : "")}"
        data-research-playbook="${p.id}"
        role="option"
        aria-selected="${raw(on ? "true" : "false")}"
      >
        <span class="ap-select-option-text">${p.name}</span>
        ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");
  return html`<details class="ap-select research-view__playbook">
    <summary class="ap-select-trigger">
      <span class="ap-select-inline-label">Playbook</span>
      <span class="ap-select-value">${active.name}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Playbook">
      <div class="ap-select-options">${raw(options)}</div>
    </div>
  </details>`;
}

// Grey, not orange: the orange on this page belongs to the one primary action
// per card. A header full of brand colour flattens that hierarchy.
function renderScanButton(state) {
  if (state.scanning) {
    return html`<button type="button" class="ap-button stroked grey" disabled>
      <span class="ap-loader blue size-16" aria-hidden="true"
        ><svg>
          <circle></circle>
          <circle></circle></svg
      ></span>
      <span>Scanning…</span>
    </button>`;
  }
  return html`<button type="button" class="ap-button stroked grey" data-research-scan>
    <i class="ap-icon-refresh"></i>
    <span>Run a scan</span>
  </button>`;
}

// ── The finding card ──────────────────────────────────────────────────────

/**
 * One finding. `variant: "modal"` drops the headline and summary (the modal
 * header already carries them) and keeps only the action row, so both
 * surfaces share one set of data-* hooks and one handler.
 */
export function renderFindingCard(finding, source, { variant = "feed" } = {}) {
  if (!finding) return "";
  const dismissed = finding.status === "dismissed";
  const used = finding.status === "used";
  const actions = dismissed
    ? html`<div class="research-card__actions research-card__actions--dismissed">
        <span class="research-card__dismissed-note">Dismissed — I won't suggest this again.</span>
        <button type="button" class="ap-link standalone small" data-research-restore="${finding.id}">
          Bring it back
        </button>
      </div>`
    : html`<div class="research-card__actions">
        ${raw(
          used
            ? html`<span class="ap-status green"><span>Turned into ideas</span></span>`
            : html`<span class="ap-split-button primary orange research-card__split">
                <button type="button" data-research-use="${finding.id}">
                  <i class="ap-icon-check"></i>
                  <span>Turn into ideas</span>
                </button>
                <button
                  type="button"
                  data-research-menu="${finding.id}"
                  aria-label="More ways to use this finding"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  <i class="ap-icon-chevron-down"></i>
                </button>
                ${raw(renderUseMenu(finding))}
              </span>`,
        )}
        ${raw(
          used
            ? ""
            : html`<button type="button" class="ap-button ghost grey" data-research-dismiss="${finding.id}">
                <i class="ap-icon-close"></i>
                <span>Dismiss</span>
              </button>`,
        )}
        <button type="button" class="ap-link standalone small research-card__read" data-research-open="${finding.id}">
          <i class="ap-icon-bar-graph"></i>
          <span>Read the research</span>
        </button>
      </div>`;

  if (variant === "modal") {
    return html`<div class="research-card__foot research-card__foot--modal">${raw(actions)}</div>`;
  }

  return html`<article
    class="ap-card research-card${raw(dismissed ? " research-card--dismissed" : "")}${raw(
      used ? " research-card--used" : "",
    )}"
    data-research-card="${finding.id}"
  >
    <header class="research-card__head">
      ${raw(renderBadge(source))}
      <span class="research-card__origin">
        <span class="research-card__source">${source ? source.name : "Research"}</span>
        <span class="research-card__time">· ${finding.scannedAt}</span>
      </span>
      ${raw(finding.status === "new" ? html`<span class="ap-tag blue mini research-card__new">New</span>` : "")}
    </header>

    <h3 class="research-card__headline">${finding.headline}</h3>
    <p class="research-card__summary">${finding.summary}</p>

    <div class="research-card__meta">
      <span class="research-card__meta-label">Research type</span>
      <span class="ap-tag grey">${finding.researchType}</span>
      ${raw(
        finding.posts?.length
          ? html`<span class="research-card__evidence"
              >${finding.posts.length} source ${raw(finding.posts.length === 1 ? "post" : "posts")}</span
            >`
          : "",
      )}
    </div>

    <div class="research-card__foot">${raw(actions)}</div>
  </article>`;
}

// The split button's second half. Two options, both things the primary can't
// express: send it to a specific chat, or skip the Idea step entirely.
function renderUseMenu(finding) {
  return html`<div
    class="ap-action-dropdown research-card__menu"
    role="menu"
    hidden
    data-research-menu-for="${finding.id}"
  >
    <button type="button" role="menuitem" class="ap-action-dropdown-item" data-research-use-in="${finding.id}">
      <i class="ap-icon-single-chat-bubble"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">Turn into ideas in…</span>
        </div>
      </div>
    </button>
    <button type="button" role="menuitem" class="ap-action-dropdown-item" data-research-draft="${finding.id}">
      <i class="ap-icon-pen"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">Draft a post now</span>
        </div>
      </div>
    </button>
  </div>`;
}

// ── Feed ──────────────────────────────────────────────────────────────────

function renderFeedEmpty(state) {
  const noSources = (state.config?.enabledSourceIds || []).length === 0;
  if (noSources) {
    return renderEmptyState({
      icon: "ap-icon-feature-listening",
      title: "No research sources on",
      body: "Pick what I should watch — competitors, creators, what people say about you — and I'll start bringing findings back.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-research-tab="sources"><span>Choose my sources</span></button>`,
      wrapperClass: "research-view__empty research-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-feature-listening",
    title: "Nothing yet",
    body: `I'm watching ${(state.config?.enabledSourceIds || []).length} sources and refresh ${cadenceAdverb(state)}. Run a scan if you don't want to wait.`,
    actionHtml: `<button type="button" class="ap-button primary blue" data-research-scan><i class="ap-icon-refresh"></i><span>Run a scan</span></button>`,
    wrapperClass: "research-view__empty research-view__empty--rich",
  });
}

export function renderFeedBody(state) {
  const list = state.findings || [];
  // Returns an HTML STRING in every branch — the caller assigns it straight to
  // innerHTML, and raw() is only meaningful inside an html`` template.
  if (list.length === 0 && !state.showDismissed) return renderFeedEmpty(state);

  const cards = list.map((f) => renderFindingCard(f, findSource(state, f.sourceId))).join("");
  const toggle =
    state.dismissedCount > 0
      ? html`<div class="research-view__dismissed">
          <button type="button" class="ap-link small" data-research-toggle-dismissed>
            ${raw(state.showDismissed ? "Hide dismissed" : `Show dismissed (${state.dismissedCount})`)}
          </button>
        </div>`
      : "";

  return html`<div class="research-view__feed">${raw(cards)}</div>
    ${raw(toggle)}`;
}

// ── The page ──────────────────────────────────────────────────────────────

export function renderResearchPage(state) {
  return html`
    <div class="research-view__page">
      <header class="research-view__head">
        <div class="research-view__head-text">
          <h1 class="research-view__title">Research</h1>
          <p class="research-view__sub">${renderSubline(state)}</p>
        </div>
        <div class="research-view__head-actions">
          ${raw(renderPlaybookPicker(state))} ${raw(renderScanButton(state))}
        </div>
      </header>

      <div class="research-view__body" data-research-body>${raw(renderFeedBody(state))}</div>
    </div>
  `;
}

export { renderBadge, cadenceAdverb, findSource };
