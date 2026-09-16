// ---- Insights · Cockpit — the instrument panel --------------------------------
//
// Master–detail that fills the viewport and never scrolls as a page: a rail of
// every objective on the left — ring, name, verdict — and the selected one read
// in full on the right: the readout, the curve, the measures as a table, the
// posts as rows.
//
// The rail rows carry NO sparkline. A 34px curve in a 190px gutter cannot be
// read, and it needed the measure's name printed on top of it to mean anything,
// which put a label over a line and made the row look broken. Where it stands
// (the ring) and how it is judged (the pill) is what a row of a list owes the
// reader; the curve is the pane's job, at a size that can be read. Mob · Index
// is the other answer — there every card carries its own curve, because a card
// has the width a gutter doesn't.
//
// Best for: checking. The reader who knows their objectives and comes to
// compare them and drill into one — dense, numeric, one thing in focus. The
// selection rides in `?objective=` so a link lands on an objective.
//
// Every measure is reachable in full here, not just the weakest one: the chart
// card carries the same measure switcher the Report chapter has. It used to
// chart the headline measure and leave the others as 96px sparklines in the
// table, which meant an objective's second measure had no curve anywhere.

import { readingFor } from "../model.js?v=1224";
import { trendSpec, sparklineSpec, ringSvg, progressBar, mountCharts } from "../charts.js?v=1224";
import {
  tierCounts,
  statusPill,
  measurePill,
  originMark,
  windowLine,
  trendGlyph,
  scoreFigure,
  postCard,
  postsEmpty,
  proxyNote,
  objectiveActions,
  figure,
  playbookTitle,
  pageTitle,
  esc,
} from "../pieces.js?v=1224";

export const id = "cockpit";
export const label = "Cockpit";
export const title = "Cockpit — a rail of objectives, one read in full";
export const icon = "ap-icon-chart-screen";

const CHART_HEIGHT = 300;

export function render(host, vm) {
  const { entries, rollup, ctx, selectedKey, local, firstPaint } = vm;
  const selected = entries.find((e) => e.key === selectedKey) || entries[0];
  const specs = new Map();

  host.innerHTML = `<div class="ins-cockpit">
    ${renderRail(entries, rollup, selected, ctx)}
    ${renderPane(selected, local, specs, firstPaint)}
  </div>`;

  mountCharts(host, specs);
  return () => {};
}

// ── Rail ──────────────────────────────────────────────────────────────────

function renderRail(entries, rollup, selected, ctx) {
  const rows = entries
    .map((e) => {
      const weak = e.headline;
      const on = e === selected;
      return `<li>
        <button type="button" class="ins-cockpit-row ${on ? "is-selected" : ""}" data-ins-select="${esc(e.key)}" data-ins-objective="${esc(e.key)}"${on ? ' aria-current="true"' : ""}>
          <span class="ins-cockpit-row__ring">${ringSvg(e.progress, e.tier, { size: 44, stroke: 4, pending: e.tier === "collecting", name: weak?.metricLabel })}</span>
          <span class="ins-cockpit-row__text">
            <span class="ins-cockpit-row__name">${esc(e.label)}</span>
            <span class="ins-cockpit-row__meta">${statusPill(e, { dot: false })}</span>
          </span>
        </button>
      </li>`;
    })
    .join("");

  // The rail's head is the Playbook's name, and the name is the scope switcher
  // (pieces.js). The word "Objectives" moved to the list's own label: the rows
  // under the counts are what it named, and a screen reader gets it there.
  //
  // ⚠️ In workspace mode the name is gone (the rail above carries the brand), so
  // the word comes BACK as the head's title — the rail is a list of objectives,
  // and a column that opens on three counts and no noun says nothing. The pane
  // keeps the page's h1: the objective being read is the subject, this is its
  // index.
  const brand = playbookTitle(ctx);
  return `<aside class="ins-cockpit-rail">
    <header class="ins-cockpit-rail__head">
      ${brand || pageTitle("Objectives")}
      ${tierCounts(rollup)}
    </header>
    <ul class="ins-cockpit-rail__list" aria-label="Objectives">${rows}</ul>
    <footer class="ins-cockpit-rail__foot">
      <span class="ins-muted">${rollup.posts} post${rollup.posts === 1 ? "" : "s"} drafted with Archie</span>
    </footer>
  </aside>`;
}

// ── Pane ──────────────────────────────────────────────────────────────────

function renderPane(entry, local, specs, firstPaint) {
  if (!entry) return `<main class="ins-cockpit-pane"></main>`;

  const measures = entry.measures;
  const tabId = local.measureTab[entry.key];
  const shown = measures.find((m) => m.id === tabId) || entry.headline || measures[0];
  const chartId = "cockpit-trend";
  if (shown?.series) {
    specs.set(
      chartId,
      trendSpec(shown.series, {
        tier: entry.collecting ? "collecting" : shown.tier,
        metricLabel: shown.metricLabel,
        height: CHART_HEIGHT,
      }),
    );
  }

  const chartHead =
    measures.length > 1
      ? `<div class="ap-tabs ins-cockpit-card__tabs"><div class="ap-tabs-nav" role="tablist" aria-label="Measure" data-ins-tablist>${measures
          .map(
            (
              m,
            ) => `<button type="button" class="ap-tabs-tab ${m === shown ? "active" : ""}" role="tab" id="ins-mtab-${esc(m.id)}"
              aria-controls="ins-mpanel" aria-selected="${m === shown}" tabindex="${m === shown ? 0 : -1}"
              data-ins-measure-tab="${esc(entry.key)}" data-ins-measure="${esc(m.id)}"><span>${esc(m.metricLabel)}</span></button>`,
          )
          .join("")}</div></div>`
      : `<p class="ins-chart__name">${esc(shown?.metricLabel || "Trend")}${shown?.scopeLabel ? ` <span class="ins-muted">· ${esc(shown.scopeLabel)}</span>` : ""}</p>`;

  const overlay = entry.collecting
    ? `<div class="ins-chart-overlay">
        <span class="ap-status grey">Collecting</span>
        <span class="ins-muted">day ${entry.grace?.day ?? 1} of ${entry.grace?.of ?? 7}</span>
      </div>`
    : "";
  const parkedNote = entry.parked ? proxyNote(entry) : "";

  const head = entry.headline;
  const targetName = head?.isRate ? "hold above" : "target";

  const rows = measures
    .map((m, i) => {
      const sparkId = `cockpit-mspark-${i}`;
      if (m.series) specs.set(sparkId, sparklineSpec(m.series, { tier: m.tier, height: 30 }));
      return `<tr${m === shown ? ' class="selected"' : ""}>
        <th scope="row">
          <span class="ins-cockpit-table__metric">${esc(m.metricLabel)}${m.proxy ? ` <span class="ap-badge blue">proxy</span>` : ""}</span>
          <span class="ins-muted">${esc(m.scopeLabel || "All networks")}</span>
        </th>
        <td class="right ins-num">${esc(m.currentLabel)}</td>
        <td class="right ins-num">${esc(m.targetLabel)}</td>
        <td class="ins-cockpit-table__bar">
          ${progressBar(m.progress, m.tier, { pending: m.progress == null })}
          <span class="ins-num">${m.progress == null ? "—" : `${m.progress}%`}</span>
        </td>
        <td>${trendGlyph(m)}</td>
        <td class="ins-cockpit-table__spark">${m.series ? `<span class="ins-chart__node" data-ins-chart="${sparkId}" style="height:30px"></span>` : ""}</td>
        <td>${measurePill(m)}</td>
      </tr>`;
    })
    .join("");

  return `<main class="ins-cockpit-pane${firstPaint ? " ins-reveal" : ""}">
    <header class="ins-cockpit-pane__head">
      <div class="ins-cockpit-pane__titles">
        <div class="ins-cockpit-pane__title"><h2>${esc(entry.label)}</h2>${statusPill(entry)}</div>
        <p class="ins-cockpit-pane__meta">${originMark(entry)} <span class="ins-dot" aria-hidden="true">·</span> ${esc(windowLine(entry))} <span class="ins-dot" aria-hidden="true">·</span> ${measures.length} measure${measures.length === 1 ? "" : "s"}</p>
      </div>
      ${objectiveActions(entry)}
    </header>
    <p class="ins-cockpit-pane__reading">${esc(readingFor(entry))}</p>
    ${parkedNote}

    <div class="ap-card ins-section ins-cockpit-readout">
      ${scoreFigure(entry, { size: "xl" })}
      ${figure(esc(head?.currentLabel || "—"), "current")}
      ${figure(esc(head?.targetLabel || "—"), targetName)}
    </div>

    <section class="ap-card ins-section ins-cockpit-card">
      ${chartHead}
      <div class="ins-chart ins-chart--cockpit" id="ins-mpanel" role="tabpanel" aria-labelledby="ins-mtab-${esc(shown?.id || "")}">
        ${shown?.series ? `<div class="ins-chart__node" data-ins-chart="${chartId}" style="height:${CHART_HEIGHT}px"></div>` : ""}
        ${overlay}
      </div>
    </section>

    <section class="ap-card ins-section ins-cockpit-card">
      <h3 class="ins-section-title">Measures</h3>
      <table class="ap-table small ins-cockpit-table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col" class="right">Current</th>
            <th scope="col" class="right">Target</th>
            <th scope="col">Progress</th>
            <th scope="col">Trend</th>
            <th scope="col">Trajectory</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    <section class="ap-card ins-section ins-cockpit-card">
      <h3 class="ins-section-title">Posts drafted with Archie <span class="ap-counter normal grey">${entry.posts.length}</span></h3>
      ${entry.posts.length ? `<div class="ins-postlist top-posts-grid">${entry.posts.map((p) => postCard(p, entry)).join("")}</div>` : postsEmpty()}
    </section>
  </main>`;
}
