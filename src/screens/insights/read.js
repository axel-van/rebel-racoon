// ---- Insights — the read stack the mob_ lectures share -------------------------
//
// Both `mob_` readings (Index / Side) render THE SAME objective fiche; what
// differs is how they arrange its blocks — Index stacks them behind a crumb,
// Side deports three of them into a right-hand column. So the blocks live here,
// one function each, and the hosts compose them. (Band was the third host until
// it was deleted on 2026-09-11.) Same idea as `pieces.js`, one rung up: pieces owns the
// vocabulary (a verdict is a DS status pill, everywhere), this owns the SECTIONS
// that vocabulary is assembled into.
//
// ⚠️ Cockpit is deliberately NOT re-pointed at this module. It is the reference
// the mob_ lectures are being compared against,
// and rewriting them would invalidate the comparison — so their own copies of
// this stack stay exactly as they are. The duplication is the price of an
// intact baseline, and it ends the day one reading wins: the losers and this
// module are deleted together.
//
// THE FICHE IS A PAGE HEADER OVER ONE REPORT CARD PER MEASURE. That is prod's
// own arrangement: in Reports a page is a HEADER naming its subject and then a
// stack of `Card / Report card (to detach)` (Figma `Analytics - Shared
// components`, node 1070:7477), ONE PER METRIC — each with its own grey band
// (name · description · a white synthesis box of that metric's figures) over
// its own white body (that metric's chart).
//
// So `Brand awareness` is the page's title, and `Reach` and `Brand mentions`
// are two self-contained blocks under it. What that deletes, and it is the
// point: the five-column measures table, its counter, and the SELECTOR — with
// every measure charted in its own card there is nothing left to switch. Three
// rounds of design went into where that selector should sit (a DS tab strip
// over the chart, then rows above it, then rows below it, rejected); the answer
// turned out to be that a page with two measures doesn't need one.
//
// Pure render helpers — strings in, strings out, no listeners. Every action is
// a `data-ins-*` hook the shell dispatches (shell.js § Actions).

import { readingFor } from "./model.js?v=1170";
import { trendSpec } from "./charts.js?v=1170";
import {
  statusPill,
  measurePill,
  originMark,
  windowLine,
  trendGlyph,
  postCard,
  postsEmpty,
  proxyNote,
  objectiveActions,
  tierCounts,
  esc,
} from "./pieces.js?v=1170";

// ── The hero ──────────────────────────────────────────────────────────────
//
// The page's header plate, and the one block on this screen that is allowed to
// be a hero: the objective's name at the DS's TOP rung (h1, 24/32 — the ramp
// stops there, and a bigger step would be a number invented for one page), its
// verdict beside it, the answer in one sentence under it, and the facts that
// identify it at the caption rung below that.
//
// The hierarchy is the whole design: 24 bold navy → 16 regular grey-80 → 12
// regular grey-80. Three sizes, three weights, one ink pair — which is how this
// app ranks things ("hiérarchiser par taille, graisse, encre"), rather than by
// tinting a band or drawing a rule between rows.
//
// The verbs sit on the title's line, right-aligned, where prod's report card
// holds `Download chart`.
//
// ⚠️ THE LEDE IS PERMANENT AGAIN, and that reverses a note this file carried.
// The prose was demoted to a fallback when it was the THIRD statement of the
// same fact on one page — the hero's figure row said it in numerals, the table
// row in columns, the pill in a word. Both of those are gone from the hero: the
// numbers moved into each measure's own report card, where the figure and the
// curve that produced it are one block. So the hero has no numeral left, and a
// header that prints only a name and a coloured pill says nothing about how the
// objective is doing. One sentence at the top, the numbers in the cards below:
// that is a hierarchy, not a repetition — and it is prod's own anatomy, whose
// report card carries a description under its title (Figma 1069:7931).

export function readHero(entry, { actions = true } = {}) {
  const n = entry.measures.length;
  return `<header class="ins-read__hero">
    <div class="ins-read__herotop">
      <div class="ins-read__title"><h2>${esc(entry.label)}</h2>${statusPill(entry)}</div>
      ${actions ? objectiveActions(entry) : ""}
    </div>
    ${readLede(entry)}
    <p class="ins-read__meta">${originMark(entry)} <span class="ins-dot" aria-hidden="true">·</span> ${esc(windowLine(entry))} <span class="ins-dot" aria-hidden="true">·</span> ${n} measure${n === 1 ? "" : "s"}</p>
  </header>`;
}

/**
 * The objective's answer, in one sentence. Exported on its own because the
 * hosts place it differently: the hero has it as its description line, and
 * Side — whose head is a picker, not a title — hangs it under that.
 *
 * `readingFor` (model.js) is the only string in the app that says what is
 * happening to an objective in words, and the states with nothing to measure
 * yet are the ones that need it most ("No verdict yet — engagement rate is
 * still filling its first window").
 */
export function readLede(entry) {
  return `<p class="ins-read__lede">${esc(readingFor(entry))}</p>`;
}

/**
 * The one banner an objective can carry: the missing connection behind a proxy
 * measure. It is the only thing on the page that says WHY a number is standing
 * in for another, and no figure carries that — so it is unconditional whenever
 * the objective is parked.
 *
 * ⚠️ It does NOT belong in the hero. An `.ap-infobox warning` inside the header
 * plate turns the page's identity into an alert, and the plate's whole job is to
 * say what this objective IS. The hosts put it at the top of the content column
 * instead, where the reader meets it just before the measures it explains.
 */
export function readNotice(entry) {
  return entry.parked ? proxyNote(entry) : "";
}

// ── One measure, one report card ──────────────────────────────────────────
//
// The block, transcribed from Figma `Analytics - Shared components` →
// `Card / Report card (to detach)` (1070:7477) and its head
// `Card / Title+synthesis` (1069:7931), with the geometry read off the file
// rather than guessed: band padding 24, the white synthesis box inset in it at
// padding 16, its cells separated by a 1px × 40 rule with 24 either side.
//
// The card is ONE measure:
//   • band — the metric's name at the h3 rung (the objective owns h1, one rung
//     up, in the page header), its scope in prod's description slot, its state
//     pill where prod holds `Download chart`;
//   • the synthesis box — `Progress` as the 38px numeral (the platform's
//     `.main-data`, borrowed from `Card / Key metrics` 432:6310, whose `Value`
//     is a big figure), then `Current`, `Target` and `Variation`, one fact per
//     cell, prod's label-over-value. The four labels read as a row because the
//     cells are top-aligned, and they are all NOUNS — `Progress`, not "of
//     target", which only reads right AFTER its figure, not above it;
//   • body — that measure's curve, full width, and nothing else.
//
// ⚠️ No sub-title over the chart. Prod has one (`Engagement overview` under
// `Engagement`), which is prod naming the same metric twice; the card's band
// already says `Reach` forty pixels above the plot.
//
// ⚠️ The lead cell falls back to the CURRENT VALUE when a measure has no
// progress to show — `progressPct` is null for the lower-is-better metrics — and
// the `Current` cell then drops, because a big `—` over a number that is right
// there is a hole where the answer should be.
//
// `specs` is the map the host hands to `mountCharts` after the innerHTML lands;
// the chart nodes are placeholders until then, which is what keeps these
// functions free of DOM.

function synthCell(label, valueHtml) {
  return `<div class="ins-read__cell">
    <span class="ins-read__celllabel">${esc(label)}</span>
    <span class="ins-read__cellvalue">${valueHtml}</span>
  </div>`;
}

const SYNTH_SEP = `<span class="ins-read__cellsep" aria-hidden="true"></span>`;

function leadCell(label, valueHtml) {
  return `<div class="ins-read__cell ins-read__cell--lead">
    <span class="ins-read__celllabel">${esc(label)}</span>
    <span class="ins-score__value">${valueHtml}</span>
  </div>`;
}

function measureCard(entry, m, i, specs, { idPrefix, height }) {
  const id = `${idPrefix}-trend-${i}`;
  if (m.series) {
    specs.set(
      id,
      trendSpec(m.series, {
        tier: entry.collecting ? "collecting" : m.tier,
        metricLabel: m.metricLabel,
        height,
      }),
    );
  }

  // Collecting is the OBJECTIVE's state, so every one of its cards carries the
  // overlay: none of these curves has enough window behind it yet.
  const overlay = entry.collecting
    ? `<div class="ins-chart-overlay">
        <span class="ap-status grey">Collecting</span>
        <span class="ins-muted">day ${entry.grace?.day ?? 1} of ${entry.grace?.of ?? 7}</span>
      </div>`
    : "";

  const hasPct = m.progress != null;
  const cells = [
    hasPct
      ? leadCell("Progress", `${m.progress}<span class="ins-score__unit">%</span>`)
      : leadCell("Current", esc(m.currentLabel || "—")),
    hasPct ? synthCell("Current", `<span class="ins-num">${esc(m.currentLabel || "—")}</span>`) : "",
    synthCell(m.isRate ? "Hold above" : "Target", `<span class="ins-num">${esc(m.targetLabel || "—")}</span>`),
    synthCell("Variation", trendGlyph(m)),
  ].filter(Boolean);

  return `<section class="ap-card ins-read__report">
    <header class="ins-read__reportband">
      <div class="ins-read__mhead">
        <h3 class="ins-read__mtitle">${esc(m.metricLabel)}</h3>
        ${m.proxy ? `<span class="ap-badge blue">proxy</span>` : ""}
        ${measurePill(m)}
      </div>
      <p class="ins-read__mscope">${esc(m.scopeLabel || "All networks")}</p>
      <div class="ins-read__synth">${cells.join(SYNTH_SEP)}</div>
    </header>
    <div class="ins-read__reportbody">
      <div class="ins-chart ins-chart--read">
        ${m.series ? `<div class="ins-chart__node" data-ins-chart="${esc(id)}" style="height:${height}px"></div>` : `<p class="ins-posts-empty">No series for this measure.</p>`}
        ${overlay}
      </div>
    </div>
  </section>`;
}

/**
 * The measures, as one report card each — the fiche's whole body.
 *
 * ⚠️ This was a five-column DS table plus ONE 300px chart for whichever row was
 * selected, and before that two cards naming the same measures twice (a tab
 * strip over the chart, a table under it). Both versions existed because one
 * chart had to serve N measures. Giving each measure its own card removes the
 * question: no table, no counter, no selector, no `selected` row, and every
 * curve on screen at once — which is the comparison a reader of two measures
 * actually came for.
 *
 * Cockpit keeps the table and the tab strip: it is the untouched baseline.
 */
export function readMeasures(entry, specs, { idPrefix = "read", height = 260 } = {}) {
  return entry.measures.map((m, i) => measureCard(entry, m, i, specs, { idPrefix, height })).join("");
}

// ── Posts ─────────────────────────────────────────────────────────────────

export function readPosts(entry) {
  return `<section class="ap-card ins-section ins-read__card">
    <h3 class="ins-section-title">Posts drafted with Archie <span class="ap-counter normal grey">${entry.posts.length}</span></h3>
    ${entry.posts.length ? `<div class="ins-postlist top-posts-grid">${entry.posts.map((p) => postCard(p, entry)).join("")}</div>` : postsEmpty()}
  </section>`;
}

// ── Facts ─────────────────────────────────────────────────────────────────
//
// The objective's quick facts as label/value rows — what Monarch and Plane put
// in their right-hand column. It carries no button: the verbs stay in the head,
// where a reader of any of the three lectures finds them, which also keeps a
// 300px column from growing a full-width CTA.

export function readFacts(entry, rollup) {
  const c = entry.counts;
  const row = (name, value) =>
    `<div class="ins-read__fact"><span class="ins-read__factname">${esc(name)}</span><span class="ins-read__factvalue">${value}</span></div>`;
  const breakdown = [c.on ? `${c.on} on` : "", c.soft ? `${c.soft} at risk` : "", c.off ? `${c.off} off` : ""]
    .filter(Boolean)
    .join(" · ");
  return `<aside class="ap-card ins-section ins-read__facts" aria-label="Objective facts">
    ${row("Verdict", statusPill(entry))}
    ${row("Window", `<span class="ins-read__facttext">${esc(windowLine(entry))}</span>`)}
    ${row("Origin", originMark(entry, { short: true }))}
    ${row("Measures", `<span class="ins-read__facttext">${c.measures}${breakdown ? ` <span class="ins-muted">· ${esc(breakdown)}</span>` : ""}</span>`)}
    ${row("Posts", `<span class="ins-read__facttext">${c.posts}</span>`)}
    ${entry.parked ? proxyNote(entry) : ""}
    <div class="ins-read__factsfoot">
      <span class="ins-read__factname">This Playbook</span>
      ${tierCounts(rollup)}
    </div>
  </aside>`;
}
