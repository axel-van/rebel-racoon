// ---- Insights · Mob · Index — the index, then the fiche ------------------------
//
// TWO LEVELS, no selector at all: a full-width index of every objective, and the
// one you click read at the page's full width behind a crumb. It is the shape
// every analytics product with goals in it ships — Asana, Monarch, Customer.io,
// Deel, HubSpot, Charma, TheyDo — and the only one of the six lectures here that
// still works at ten objectives with history behind them.
//
// WHY it exists: Cockpit spends a 340px column of full viewport height on a list
// of two or three, next to the app's own rail. This one asks whether the
// selector has to be on screen AT ALL while you read. Nothing else on the page competes with the objective once it
// is open, and the index gets the whole width to be a table instead of a gutter.
//
// ⚠️ FOURTH SHAPE for this index. Each one lost for a reason that is written
// down — read the list before drawing a fifth:
//   1. a TABLE of eight 14px columns. It hierarchised nothing: the objective's
//      name weighed exactly what the six figures beside it weighed. Cut twice,
//      the second time flatly — "le tableau n'est définitivement pas la bonne
//      représentation".
//   2. a 2×2 GRID of cards carrying figures only. Too close to Bento, the tile
//      board cut before it: "a number without its curve" (shell.js).
//   3. one FULL-WIDTH ROW per objective, all rows on one internal grid so the
//      percentages aligned down the page. Comparison worked; the row didn't —
//      across 1200px its six zones read as loosely related cells, and the user
//      preferred the row's own FOLDED state to its resting one.
//   4. this — that folded state promoted to the resting shape, two per line,
//      with the curve inside the card under the figures.
//
// So the card IS the fold: name, verdict and the way in on one line; the
// percentage and the measure it is OF under them; the trajectory beneath both.
// Nothing was invented for it — the zones and their classes are the row's own,
// which is why the fold's `@container` block was deleted rather than reworked.
//
// WHAT KEEPS IT OUT OF BENTO: **every card carries its CURVE** — `trendSpec`
// with `compact`, which keeps the dashed target line and the post markers and
// drops only the axis labels. That was the whole indictment of the tile board,
// and shape 2 above is the one that failed on it. The percentage is not
// doubled either: no ring, and no bar since the curve took the card — one
// numeral for how far along, one curve for versus what.
//
// No KPI strip above the grid, Deel-style: `tierCounts` in the head already
// says On track / At risk / Off track, and a band restating those three numbers
// is exactly the fault that got Report's ring row cut. The head carries WEIGHT
// instead (brand + counts on one line, the shared "N posts drafted" sentence)
// and not one new figure.
//
// No outer card around the grid either — a card inside a card is nested
// elevation, and the section title does that job for free.
//
// The two states key off `?objective=` — which `shell.js` hands over as
// `selectedKey`, already nullable. So "nothing selected" is a state this layout
// gets for free, and a link still lands straight on a fiche.
//
// The brand switcher lives on the INDEX only, deliberately. `playbookTitle` is
// the app's only door to the scope outside workspace mode (pieces.js), and the
// fiche is one permanently visible crumb away from it — the same escape Asana
// and Monarch give their goal pages. A second switcher on the fiche would be two
// controls that can disagree, which is the failure that note warns about.
//
// In workspace mode there is no switcher here at all — the rail is the door —
// so the band goes with it and `Objectives` takes the top of the page. See the
// two-heads note in `renderIndex`.

import {
  playbookTitle,
  pageTitle,
  tierCounts,
  statusPill,
  originMark,
  windowLine,
  trendGlyph,
  postsMovedLine,
  esc,
} from "../pieces.js?v=1181";
import { trendSpec, mountCharts } from "../charts.js?v=1181";
import { readHero, readNotice, readMeasures, readPosts } from "../read.js?v=1181";

export const id = "mob_index";
export const label = "Mob · Index";
export const title = "Mob · Index — an index of objectives, one opened at full width";
export const icon = "ap-icon-view-table";

// The fiche's curves. 300 was right when ONE chart served every measure; with
// one card per measure there are N of them stacked, so each breathes at 260 —
// still twice the height of anything that could be called a sparkline, and two
// cards plus the header land inside a laptop screen and a half.
const CHART_HEIGHT = 260;
// The card's curve. Tall enough to read a trajectory off — a 28px sparkline is
// a smudge — and short enough that two rows of cards and the head still fit
// one screen. It gets the card's full width, ~560px at two per line, which is
// more than the row's own 180px column ever had.
const CARD_CHART_HEIGHT = 96;

export function render(host, vm) {
  const { entries, rollup, ctx, selectedKey, firstPaint } = vm;
  const selected = selectedKey ? entries.find((e) => e.key === selectedKey) : null;
  const specs = new Map();

  host.innerHTML = selected
    ? renderFiche(selected, specs, firstPaint)
    : renderIndex(entries, rollup, ctx, specs, firstPaint);

  mountCharts(host, specs);
  return () => {};
}

// ── The index ─────────────────────────────────────────────────────────────

function renderIndex(entries, rollup, ctx, specs, firstPaint) {
  // Worst first — the order `model.js` already returns, so the objective asking
  // for attention is the first card and not the first one declared.
  const cards = entries
    .map((e, i) => {
      const m = e.headline;
      // The curve, at card scale: `compact` drops the axis labels and the
      // gridlines but KEEPS the dashed target line and the post markers — the
      // two things that make it a reading and not a decoration.
      const chartId = `mobindex-card-${i}`;
      if (m?.series) {
        specs.set(
          chartId,
          trendSpec(m.series, {
            tier: e.tier,
            metricLabel: m.metricLabel,
            height: CARD_CHART_HEIGHT,
            compact: true,
          }),
        );
      }

      // ── The figure zone: the comparator ─────────────────────────────────
      // The percentage and the word it is a percentage OF, on one baseline.
      // No ring and no bar: the curve below carries "versus target" with its
      // dashed line, so a bar would draw the same fact a second time — and the
      // ring printed the very number standing next to it.
      const figure = e.collecting
        ? `<span class="ins-mob_index__pct">${e.grace?.day ?? 1}<span class="ins-mob_index__unit">/${e.grace?.of ?? 7}</span></span>
           <span class="ins-mob_index__figlabel">days collected</span>`
        : `<span class="ins-mob_index__pct">${e.progress}<span class="ins-mob_index__unit">%</span></span>
           <span class="ins-mob_index__figlabel">of target</span>`;

      // ── The measure zone: what the figure is OF ──────────────────────────
      // The metric named in text — a figure without its metric named is
      // unreadable — then its two operands and the move.
      const measure = e.collecting
        ? `<span class="ins-mob_index__metric">${esc(m?.metricLabel || "No measure yet")}</span>
           <span class="ins-muted">${esc(e.soon || "Filling its first window")}</span>`
        : `<span class="ins-mob_index__metric">${esc(m?.metricLabel || "—")}</span>
           <span class="ins-mob_index__figs">
             <span class="ins-mob_index__pair"><span class="ins-num">${esc(m?.currentLabel || "—")}</span><span class="ins-mob_index__to" aria-hidden="true">→</span><span class="ins-num ins-mob_index__target">${esc(m?.targetLabel || "—")}</span></span>
             ${m ? trendGlyph(m) : ""}
           </span>`;

      return `<article class="ap-card ins-mob_index__card" data-ins-select="${esc(e.key)}" data-ins-objective="${esc(e.key)}">
        <div class="ins-mob_index__ident">
          <button type="button" class="ins-mob_index__name" data-ins-select="${esc(e.key)}">${esc(e.label)}</button>
          <span class="ins-mob_index__sub">${originMark(e, { short: true })} <span class="ins-dot" aria-hidden="true">·</span> ${esc(windowLine(e))}</span>
        </div>

        <div class="ins-mob_index__verdict">
          ${statusPill(e)}
          ${
            e.parked && e.soon
              ? `<span class="ins-mob_index__soon" title="${esc(e.soon)}"><i class="ap-icon-warning_fill ap-icon-sm" aria-hidden="true"></i></span>`
              : ""
          }
        </div>

        <i class="ap-icon-chevron-right ins-mob_index__go" aria-hidden="true"></i>

        <div class="ins-mob_index__figure">${figure}</div>

        <div class="ins-mob_index__measure">${measure}</div>

        <div class="ins-mob_index__curve">
          ${m?.series ? `<span class="ins-chart__node" data-ins-chart="${chartId}" style="height:${CARD_CHART_HEIGHT}px"></span>` : ""}
        </div>
      </article>`;
    })
    .join("");

  // The verdict counts sit with the LIST, not in a page header: they count the
  // cards below them, so they belong to the row that names those cards
  // ("Objectives 4") rather than to the row that names the brand.
  //
  // ⚠️ TWO HEADS, and which one is on screen is the WORKSPACE FLAG's answer.
  //
  // Flag ON — no band at all. `playbookTitle` renders nothing (pieces.js): the
  // rail carries the brand permanently, so a white 87px strip re-printing it
  // above the topbar's own "Insights" pushed the page's actual subject below
  // the fold of attention. So `Objectives` IS the page title — the h2 rung the
  // brand name had, with the counts beside it and the rollup's one sentence
  // under it, the way a title carries a description.
  //
  // Flag OFF — the band stays exactly as it was, because the brand name in it
  // is the only Playbook switcher the app has outside workspace mode, and
  // `Objectives` goes back to being a section title over the list.
  //
  // Either way: NOT a KPI strip — no tile, no new figure, nothing restated.
  const brand = playbookTitle(ctx);
  const head = brand
    ? `<header class="insights__band">
      <div class="insights__band-inner">
        ${brand}
        ${postsMovedLine(rollup)}
      </div>
    </header>`
    : "";
  const listhead = brand
    ? `<div class="ins-mob_index__listhead">
          <h3 class="ins-section-title">Objectives <span class="ap-counter normal grey">${entries.length}</span></h3>
          ${tierCounts(rollup)}
        </div>`
    : `<header class="ins-mob_index__pagehead">
          <div class="ins-mob_index__listhead">
            ${pageTitle("Objectives", { count: entries.length })}
            ${tierCounts(rollup)}
          </div>
          ${postsMovedLine(rollup)}
        </header>`;

  return `${head}
    <div class="ins-mob_index">
      <div class="ins-mob_index__inner${firstPaint ? " ins-reveal" : ""}">
        ${listhead}
        <div class="ins-mob_index__list">${cards}</div>
      </div>
    </div>`;
}

// ── The fiche ─────────────────────────────────────────────────────────────
//
// A PAGE HEADER, then one card per measure — prod's own arrangement for a
// report (read.js § the module header). The header goes in `.insights__band`,
// the white full-bleed strip this layout's index already uses for its own head:
// it makes the objective read as the page's subject rather than as one more
// block in the stack, which is exactly what "Brand awareness is the page title"
// means.
//
// ⚠️ THE CRUMB IS IN THE TOPBAR. It used to be the first line of this band — a
// ghost `‹ Objectives` button, on the argument that the topbar carried no back
// control. It does: `/playbook`, `/topics/settings` and the account-scope routes
// all lead with one, and the repurposing board's `‹ Change profile` is the same
// treatment. So this reading's way back is declared where the app keeps every
// other way back (`backTargetFor` in topbar.js, keyed off `?objective=`), and
// the page's first line is the objective's name — the subject, not the exit.

function renderFiche(entry, specs, firstPaint) {
  return `<header class="insights__band">
      <div class="insights__band-inner">
        ${readHero(entry)}
      </div>
    </header>
    <div class="ins-mob_index">
      <div class="ins-mob_index__inner${firstPaint ? " ins-reveal" : ""}" data-ins-objective="${esc(entry.key)}">
        ${readNotice(entry)}
        ${readMeasures(entry, specs, { idPrefix: "mobindex", height: CHART_HEIGHT })}
        ${readPosts(entry)}
      </div>
    </div>`;
}
