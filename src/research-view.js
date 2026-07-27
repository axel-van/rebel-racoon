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
// This module serves TWO screens — the digest (screens/research.js) and the
// settings page (screens/research-settings.js). The settings renderers live here
// rather than in the settings screen because both surfaces need the same header
// chrome (the Playbook picker, the subline) and the config summary.
//
// Screen state shape (built by the screens):
//   {
//     editions: [{ id, at, ideas: Idea[], sourceNames: string[] }],   // digest
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

// Discreet on purpose. The settings used to be a permanent tab with a counter,
// which put something you revisit once a quarter at the same level as the ideas
// you read weekly — and the counter implied there was something to do there.
function renderSettingsCog(state) {
  const pb = state.contextId ? `?pb=${encodeURIComponent(state.contextId)}` : "";
  return html`<button
    type="button"
    class="ap-icon-button transparent research-view__cog"
    data-research-open-settings="${pb}"
    aria-label="Research settings"
    title="What I watch"
  >
    <i class="ap-icon-cog"></i>
  </button>`;
}

// Grey, and stroked: looking is a refresh, not a decision. The decisions on
// this page ("Write it") are blue — the convention for a list-page CTA.
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

// ── The hub ───────────────────────────────────────────────────────────────
//
// A HUB of fresh content ideas, not an archive you scroll. The first version
// stacked flat text blocks — a lead idea then one-line rows, per scan — and it
// read as one grey wall with no scannable rhythm. Cards, in a grid, with the
// tinted source badge as the visual anchor: seven distinct hues already carry
// provenance, so no second colour semantics (the `kind` tag describes the post
// FORMAT, which matters less here than where the idea came from).
//
// The card carries the idea's OWN text, never the finding's headline: 2-3 ideas
// share one finding, so that printed the same sentence on three cards in a row.
// The shared reason ("Because …") is stated once, in the modal — which is also
// where the argument and the evidence posts live. A modal and not a slide panel: the DS ships no side-drawer
// primitive, and the one this repo built was reverted for forking DS conventions.

function sourceOf(state, idea) {
  const finding = state.findingFor?.(idea.id);
  if (!finding) return null;
  return (state.sources || []).find((s) => s.id === finding.sourceId) || null;
}

// One idea. The whole card opens the detail; the footer's two buttons stop the
// propagation so a decision never doubles as "open the modal".
function renderIdeaCard(state, idea, { at = "" } = {}) {
  const source = sourceOf(state, idea);
  return html`<article class="ap-card research-card" data-research-open-idea="${idea.id}" tabindex="0" role="button">
    <header class="research-card__head">
      ${raw(renderBadge(source, { size: "sm" }))}
      <span class="research-card__source">${source ? source.name.replace(/ sources?$/i, "") : "Research"}</span>
      ${raw(at ? html`<span class="research-card__at">${at}</span>` : "")}
    </header>

    <h3 class="research-card__title">${idea.title}</h3>
    <p class="research-card__body">${idea.body}</p>

    <footer class="research-card__foot">
      <button type="button" class="ap-button secondary blue" data-research-write="${idea.id}">
        <i class="ap-icon-pen"></i>
        <span>Write it</span>
      </button>
      <button type="button" class="ap-button ghost grey" data-research-skip="${idea.id}">
        <span>Not for me</span>
      </button>
    </footer>
  </article>`;
}

// The grid. Cards carry their own arrival time in the "Earlier" block; in the
// fresh block the group heading already says it, so the card stays quiet.
function renderIdeaGrid(state, entries, { showTime }) {
  const cards = entries.map(([idea, at]) => renderIdeaCard(state, idea, { at: showTime ? at : "" })).join("");
  return html`<div class="research-hub__grid">${raw(cards)}</div>`;
}

function renderGroupHead(title, count, { lead = false } = {}) {
  return html`<header class="research-hub__group-head${raw(lead ? " research-hub__group-head--lead" : "")}">
    <h2 class="research-hub__group-title">${title}</h2>
    <span class="research-hub__group-count">${count} ${raw(count === 1 ? "idea" : "ideas")}</span>
  </header>`;
}

function renderHubEmpty(state) {
  const noSources = (state.config?.enabledSourceIds || []).length === 0;
  if (noSources) {
    return renderEmptyState({
      icon: "ap-icon-feature-listening",
      title: "Nothing to watch yet",
      body: "Tell me what to keep an eye on — competitors, creators, what people say about you — and I'll start sending ideas.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-research-open-settings><span>Choose what I watch</span></button>`,
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
  if (editions.length === 0) return renderHubEmpty(state);

  // The newest scan is the hub's subject — "fresh". Everything before it is
  // history: still available, one grid, not a stack of dated sections that turns
  // the page into an archive.
  const [latest, ...older] = editions;
  const fresh = (latest.ideas || []).map((i) => [i, latest.at]);
  const earlier = older.flatMap((e) => (e.ideas || []).map((i) => [i, e.at]));

  return html`<div class="research-hub">
    <section class="research-hub__group">
      ${raw(
        renderGroupHead(latest.at === "just now" ? "Fresh — just now" : `Fresh — ${latest.at}`, fresh.length, {
          lead: true,
        }),
      )}
      ${raw(renderIdeaGrid(state, fresh, { showTime: false }))}
    </section>

    ${raw(
      earlier.length
        ? html`<section class="research-hub__group">
            ${raw(renderGroupHead("Earlier", earlier.length))}
            ${raw(renderIdeaGrid(state, earlier, { showTime: true }))}
          </section>`
        : "",
    )}
  </div>`;
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

// The digest page. Single-purpose: the editions, and nothing else. The config
// lives on its own route, one cog away.
export function renderResearchPage(state) {
  return html`
    <div class="research-view__page">
      <header class="research-view__head">
        <div class="research-view__head-text">
          <h1 class="research-view__title">Research</h1>
          <p class="research-view__sub">${renderSubline(state)}</p>
        </div>
        <div class="research-view__head-actions">
          ${raw(renderPlaybookPicker(state))} ${raw(renderScanButton(state))} ${raw(renderSettingsCog(state))}
        </div>
      </header>

      <div class="research-view__body" data-research-body>${raw(renderDigestBody(state))}</div>
    </div>
  `;
}

// The settings page. Same chrome family as the digest, but the Playbook has to
// be UNMISSABLE here: a page called settings reads as global, and this config is
// per Playbook. So the name is in the subtitle in prose, not only in the picker
// (which hides itself when there's a single Playbook).
export function renderResearchSettingsPage(state) {
  const name = (state.playbooks || []).find((p) => p.id === state.contextId)?.name || "this Playbook";
  const count = (state.config?.enabledSourceIds || []).length;
  return html`
    <div class="research-view__page">
      <header class="research-view__head">
        <div class="research-view__head-text">
          <h1 class="research-view__title">What I watch</h1>
          <p class="research-view__sub">
            ${count} ${raw(count === 1 ? "source" : "sources")} for <strong>${name}</strong>, every
            ${cadence(state)?.every || "week"}.
          </p>
        </div>
        <div class="research-view__head-actions">${raw(renderPlaybookPicker(state))}</div>
      </header>

      <div class="research-view__body" data-research-body>${raw(renderSourcesBody(state))}</div>
    </div>
  `;
}

export { renderBadge, cadenceAdverb };
