// ---- Insights · Mob · Side — full width, the facts on the right ----------------
//
// One page, no left rail. The objective's NAME is the selector, and the narrow
// column moves to the right where it carries FACTS instead of navigation — which
// is what Monarch, Plane and Adaline do with theirs. The curve gets the wide
// side, which is the half Cockpit was starving: a 7-column table and a 300px
// chart were living in the smaller of two columns while a list of three rows
// held the bigger one.
//
// So the trade this lecture tests: a right column is affordable because it holds
// things you GLANCE at (the window, the provenance, how many measures, what is
// missing) and it can stick to the top of the scroll. A left column holding
// navigation is not, because navigation for three items is a dropdown.
//
// The head is two lines, Monarch's own: the brand above, the objective below.
// The Playbook's name is not decoration there — outside workspace mode
// `playbookTitle` is the ONLY door to the scope in the whole app (pieces.js), so
// a lecture that dropped it would make its brand unchangeable.
//
// In workspace mode that line renders nothing and the head is one line: the
// objective's name, which is this page's real subject. Nothing to branch on —
// the empty string just leaves the column.
//
// The verbs stay in the head, never in the column: a 300px column grows
// full-width buttons, and a button is never full-width here.

import { playbookTitle, objectiveTitle, objectiveActions, esc } from "../pieces.js?v=1232";
import { mountCharts } from "../charts.js?v=1232";
import { readLede, readNotice, readMeasures, readPosts, readFacts } from "../read.js?v=1232";

export const id = "mob_side";
export const label = "Mob · Side";
export const title = "Mob · Side — the read at full width, the facts on the right";
export const icon = "ap-icon-view-grid";

// One card per measure, so each curve takes 260 rather than the 300 a single
// shared chart could afford (read.js § one measure, one report card).
const CHART_HEIGHT = 260;

export function render(host, vm) {
  const { entries, rollup, ctx, selectedKey, firstPaint } = vm;
  const selected = entries.find((e) => e.key === selectedKey) || entries[0];
  const specs = new Map();

  host.innerHTML = `<header class="insights__band">
      <div class="insights__band-inner">
        <div class="ins-mob_side__head">
          <div class="ins-mob_side__titles">
            ${playbookTitle(ctx)}
            ${objectiveTitle(entries, selected)}
          </div>
          ${objectiveActions(selected)}
        </div>
        ${readLede(selected)}
      </div>
    </header>
    <div class="ins-mob_side">
      <div class="ins-mob_side__inner${firstPaint ? " ins-reveal" : ""}" data-ins-objective="${esc(selected.key)}">
        <div class="ins-mob_side__main">
          <!-- No page header to render here: this lecture's own band already
               names the objective (as a picker) and holds its verbs, and the
               facts column on the right carries the window, the provenance and
               the counts. So the main column is exactly the measure cards. -->
          ${readNotice(selected)}
          ${readMeasures(selected, specs, { idPrefix: "mobside", height: CHART_HEIGHT })}
          ${readPosts(selected)}
        </div>
        <div class="ins-mob_side__aside">
          ${readFacts(selected, rollup)}
        </div>
      </div>
    </div>`;

  mountCharts(host, specs);
  return () => {};
}
