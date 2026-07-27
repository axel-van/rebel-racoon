// Research — pure render helpers for the digest.
//
// Same contract as connectors-view.js and screens/session/thread-turns.js:
// PURE. No store reads, no DOM, no side effects — everything arrives through
// the `state` argument.
//
// WHAT THIS RENDERS, AND WHY IT ISN'T A FEED OF CARDS
//
// The brief was "varied sources that deliver new content IDEAS at regular
// intervals". So the deliverable is an idea, and the research behind it is the
// justification — not an object the user has to triage. An earlier version had
// this backwards: a stack of identical decision cards, each carrying a source
// badge, a timestamp, a headline, a summary, a "research type" tag and three
// buttons, with "Turn into ideas" as the primary action. The user's job became
// arbitrating research instead of picking something to write.
//
// The digest inverts it. One EDITION per scan, like a newsletter issue:
//   • the strongest idea, expanded — title, why it exists, a preview, actions;
//   • the rest as one-line rows that expand on click;
//   • a provenance line, so the research is a warrant rather than content to
//     wade through.
//
// Screen state shape (built by screens/research.js):
//   {
//     editions: [{ id, at, ideas: Idea[], sourceNames: string[] }],
//     expanded: Set<ideaId>,      // rows the user opened
//     playbooks: [{ id, name }],  // picker; hidden when length < 2
//     contextId, config, scanning, lastScanAt, tab,
//     sources: RESEARCH_SOURCES, cadences: CADENCES, tools, connectorsOn,
//     findingFor(ideaId): Finding | null,
//   }

import { html, raw } from "./utils.js?v=21";
import { renderEmptyState } from "./components/empty-state.js?v=1";

// ── Small pieces ──────────────────────────────────────────────────────────

function cadence(state) {
  return (state.cadences || []).find((x) => x.id === state.config?.cadence) || null;
}

function cadenceAdverb(state) {
  return cadence(state)?.adverb || "weekly";
}

// The tinted source glyph. `accent` is a semantic key, resolved to a token pair
// by a `.research-badge--<accent>` class in the stylesheet — never a hex here.
function renderBadge(source, { size = "md" } = {}) {
  if (!source) return "";
  return html`<span class="research-badge research-badge--${source.accent} research-badge--${size}" aria-hidden="true"
    ><i class="${source.icon}"></i
  ></span>`;
}

// "Your competitors stopped…" has to read as a clause inside "Because …".
function lowerFirst(text) {
  const t = String(text || "");
  if (!t) return t;
  if (/^[A-Z]{2}/.test(t)) return t; // leave acronyms alone
  return t[0].toLowerCase() + t.slice(1);
}

// ── Page chrome ───────────────────────────────────────────────────────────

// "2 sources · every week · last scan 5h ago".
function renderSubline(state) {
  const count = (state.config?.enabledSourceIds || []).length;
  const bits = [`${count} ${count === 1 ? "source" : "sources"}`, `every ${cadence(state)?.every || "week"}`];
  if (state.lastScanAt) bits.push(`last scan ${state.lastScanAt}`);
  return bits.join(" · ");
}

// A DS .ap-select over the native <details> disclosure, the same shape the
// top-posts toolbar uses. Hidden with a single Playbook: a picker with one
// option is noise.
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

// Grey, not orange: the one orange on this page belongs to "Write it".
function renderScanButton(state) {
  if (state.scanning) {
    return html`<button type="button" class="ap-button stroked grey" disabled>
      <span class="ap-loader blue size-16" aria-hidden="true"
        ><svg>
          <circle></circle>
          <circle></circle></svg
      ></span>
      <span>Looking…</span>
    </button>`;
  }
  return html`<button type="button" class="ap-button stroked grey" data-research-scan>
    <i class="ap-icon-refresh"></i>
    <span>Look now</span>
  </button>`;
}

// ── The digest ────────────────────────────────────────────────────────────

// Why this idea exists, as Archie's reason rather than as metadata. This one
// sentence replaces what the old card spent a headline, a summary and two tags
// saying.
function reasonFor(state, idea) {
  const finding = state.findingFor?.(idea.id);
  return finding ? finding.headline : "";
}

function renderIdeaActions(idea) {
  return html`<div class="research-idea__actions">
    <button type="button" class="ap-button primary orange" data-research-write="${idea.id}">
      <i class="ap-icon-pen"></i>
      <span>Write it</span>
    </button>
    <button type="button" class="ap-button ghost grey" data-research-skip="${idea.id}">
      <span>Not for me</span>
    </button>
    <button type="button" class="ap-link standalone small research-idea__why" data-research-why="${idea.id}">
      <span>Why this?</span>
    </button>
  </div>`;
}

function renderIdeaDetail(state, idea) {
  const reason = reasonFor(state, idea);
  return html`${raw(reason ? html`<p class="research-idea__reason">Because ${raw(lowerFirst(reason))}.</p>` : "")}
    <p class="research-idea__body">${idea.body}</p>
    ${raw(renderIdeaActions(idea))}`;
}

// The lead idea of an edition — the only one that gets room.
function renderLeadIdea(state, idea) {
  return html`<article class="research-idea research-idea--lead" data-research-idea="${idea.id}">
    <h3 class="research-idea__title">${idea.title}</h3>
    ${raw(renderIdeaDetail(state, idea))}
  </article>`;
}

// Everything else — one line, expandable. Collapsed it's a title; expanded it
// becomes the same block as the lead.
function renderIdeaRow(state, idea, { expanded }) {
  return html`<article
    class="research-idea research-idea--row${raw(expanded ? " is-expanded" : "")}"
    data-research-idea="${idea.id}"
  >
    <button
      type="button"
      class="research-idea__summary"
      data-research-expand="${idea.id}"
      aria-expanded="${raw(expanded ? "true" : "false")}"
    >
      <i class="ap-icon-chevron-right research-idea__chevron" aria-hidden="true"></i>
      <span class="research-idea__row-title">${idea.title}</span>
    </button>
    ${raw(expanded ? html`<div class="research-idea__detail">${raw(renderIdeaDetail(state, idea))}</div>` : "")}
  </article>`;
}

function renderEdition(state, edition) {
  const ideas = edition.ideas || [];
  if (ideas.length === 0) return "";
  const [lead, ...rest] = ideas;
  const n = ideas.length;
  const sources = (edition.sourceNames || []).join(" and ");

  return html`<section class="research-edition" data-research-edition="${edition.id}">
    <header class="research-edition__head">
      <h2 class="research-edition__title">${edition.at === "just now" ? "Just now" : edition.at}</h2>
      <span class="research-edition__count">${n} ${raw(n === 1 ? "idea" : "ideas")}</span>
    </header>

    ${raw(renderLeadIdea(state, lead))}
    ${raw(
      rest.length
        ? html`<div class="research-edition__rest">
            ${raw(rest.map((i) => renderIdeaRow(state, i, { expanded: !!state.expanded?.has(i.id) })).join(""))}
          </div>`
        : "",
    )}
    ${raw(sources ? html`<footer class="research-edition__foot">From ${sources}.</footer>` : "")}
  </section>`;
}

function renderDigestEmpty(state) {
  const noSources = (state.config?.enabledSourceIds || []).length === 0;
  if (noSources) {
    return renderEmptyState({
      icon: "ap-icon-feature-listening",
      title: "Nothing to watch yet",
      body: "Tell me what to keep an eye on — competitors, creators, what people say about you — and I'll start sending ideas.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-research-tab="sources"><span>Choose what I watch</span></button>`,
      wrapperClass: "research-view__empty research-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-feature-listening",
    title: "Nothing yet",
    body: `I'm watching ${(state.config?.enabledSourceIds || []).length} sources and send ideas ${cadenceAdverb(state)}. Look now if you don't want to wait.`,
    actionHtml: `<button type="button" class="ap-button primary blue" data-research-scan><i class="ap-icon-refresh"></i><span>Look now</span></button>`,
    wrapperClass: "research-view__empty research-view__empty--rich",
  });
}

export function renderDigestBody(state) {
  const editions = (state.editions || []).filter((e) => (e.ideas || []).length > 0);
  if (editions.length === 0) return renderDigestEmpty(state);
  return html`<div class="research-view__digest">${raw(editions.map((e) => renderEdition(state, e)).join(""))}</div>`;
}

// ── "What I watch" tab ────────────────────────────────────────────────────

// ONE card holding seven rows, not seven cards. Seven booleans do not deserve
// seven full-width surfaces — that was the most literal thing carried over from
// the reference screenshots, and it pushed the cadence and notification settings
// below the fold. Rows are separated by a hairline; the description sits under
// the name as one clamped line, because it's what tells you what you're turning
// on.
//
// `kind`, never the id, decides what follows the description: a discreet link
// into the Playbook section that feeds this source, or the connected-tool chips.
function renderWatchRow(source, { enabled, playbookId, tools, connectorsOn }) {
  const extra =
    source.kind === "playbook" && playbookId
      ? html`<button
          type="button"
          class="ap-link small research-watch__link"
          data-research-playbook-link="${playbookId}"
        >
          ${source.playbookLinkLabel}
        </button>`
      : source.kind === "mcp" && connectorsOn
        ? renderToolChips(tools)
        : "";

  return html`<label class="research-watch__row${raw(enabled ? " is-on" : "")}" data-research-source="${source.id}">
    ${raw(renderBadge(source, { size: "sm" }))}
    <span class="research-watch__text">
      <span class="research-watch__name">${source.name}</span>
      <span class="research-watch__desc">${source.description}</span>
      ${raw(extra)}
    </span>
    <span class="ap-toggle-container research-watch__toggle" aria-hidden="true">
      <input type="checkbox" ${raw(enabled ? "checked" : "")} tabindex="-1" />
      <i></i>
    </span>
  </label>`;
}

// The connected tools feeding the MCP source. Gated on the `connectors` flag by
// the caller — this feature must not leak that one.
function renderToolChips(tools) {
  const chips = (tools || [])
    .map(
      (t) =>
        html`<span class="ap-tag mini research-watch__tool">
          ${raw(t.logo ? html`<img src="${t.logo}" alt="" class="research-watch__tool-logo" />` : "")}
          <span>${t.name}</span>
        </span>`,
    )
    .join("");
  return html`<span class="research-watch__tools">
    ${raw(chips)}
    <button type="button" class="ap-link small" data-research-add-tool>Add a tool</button>
  </span>`;
}

// Cadence and notifications, in the same column and on screen at the same time
// as the sources. Plain noun-phrase labels — the description carries the intent.
function renderOtherSettings(state) {
  const chips = (state.cadences || [])
    .map((c) => {
      const on = c.id === state.config?.cadence;
      return html`<button
        type="button"
        class="ap-filter-chip"
        data-research-cadence="${c.id}"
        aria-pressed="${raw(on ? "true" : "false")}"
      >
        ${c.label}
      </button>`;
    })
    .join("");

  return html`<div class="ap-card research-watch__settings">
    <div class="research-watch__setting">
      <span class="research-watch__text">
        <span class="research-watch__name">How often</span>
        <span class="research-watch__desc">How often I look at your sources and send ideas.</span>
      </span>
      <span class="research-watch__chips" role="group" aria-label="How often">${raw(chips)}</span>
    </div>
    <label class="research-watch__setting" data-research-notify>
      <span class="research-watch__text">
        <span class="research-watch__name">Notifications</span>
        <span class="research-watch__desc">Show a badge and a toast when new ideas land.</span>
      </span>
      <span class="ap-toggle-container research-watch__toggle" aria-hidden="true">
        <input type="checkbox" ${raw(state.config?.notify ? "checked" : "")} tabindex="-1" />
        <i></i>
      </span>
    </label>
  </div>`;
}

export function renderSourcesBody(state) {
  const enabled = new Set(state.config?.enabledSourceIds || []);
  const rows = (state.sources || [])
    .map((s) =>
      renderWatchRow(s, {
        enabled: enabled.has(s.id),
        playbookId: state.contextId,
        tools: state.tools?.[s.id] || [],
        connectorsOn: state.connectorsOn,
      }),
    )
    .join("");
  return html`<div class="research-watch">
    <div class="ap-card research-watch__list">${raw(rows)}</div>
    ${raw(renderOtherSettings(state))}
  </div>`;
}

// ── The page ──────────────────────────────────────────────────────────────

// .ap-tabs is width:100%/column by default (it's built to own a panel), so the
// inline instance is shrink-wrapped in research.css.
function renderTabs(state) {
  const tab = (id, label, count) => {
    const on = state.tab === id;
    return html`<button
      type="button"
      class="ap-tabs-tab${raw(on ? " active" : "")}"
      data-research-tab="${id}"
      role="tab"
      aria-selected="${raw(on ? "true" : "false")}"
    >
      <span>${label}</span>
      ${raw(count > 0 ? html`<span class="ap-counter normal ${raw(on ? "blue" : "grey")}">${count}</span>` : "")}
    </button>`;
  };
  const ideaCount = (state.editions || []).reduce((n, e) => n + (e.ideas || []).length, 0);
  return html`<div class="ap-tabs research-view__tabs">
    <div class="ap-tabs-nav" role="tablist" aria-label="Research views">
      ${raw(tab("digest", "Ideas", ideaCount))}
      ${raw(tab("sources", "What I watch", (state.config?.enabledSourceIds || []).length))}
    </div>
  </div>`;
}

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

      ${raw(renderTabs(state))}

      <div class="research-view__body" data-research-body>
        ${raw(state.tab === "sources" ? renderSourcesBody(state) : renderDigestBody(state))}
      </div>
    </div>
  `;
}

export { renderBadge, cadenceAdverb };
