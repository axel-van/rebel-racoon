// ---- Insights — the pieces every layout shares --------------------------------
//
// The layouts differ in ARRANGEMENT, never in vocabulary: the verdict is
// always the DS status pill, a linked post is always the same card, a measure's
// trend is always the same glyph. Keeping those here is what lets a reader
// switch layout and recognise every object on the other side.
//
// Pure render helpers — strings in, strings out. No listeners: every action is
// a `data-ins-*` hook the shell dispatches.

import { escapeHtml as esc } from "../../utils.js?v=1177";
import { renderTopPostCard } from "../../components/top-post-card.js?v=1177";
import { getContexts } from "../../contexts-store.js?v=1177";
import { isWorkspaceMode } from "../../active-playbook.js?v=1177";
import { progressBar } from "./charts.js?v=1177";
import { signedPct } from "./model.js?v=1177";

// ── The page's head — the scope, worn as the heading ─────────────────────
//
// Insights reads ONE Playbook, and its head is where you change which. That is
// not a decoration: the rail's own scope switcher is parked (see the commented
// block in sidebar.js), so this is the only door to the scope anywhere in the
// app, and a dashboard you cannot re-point is a dashboard of one brand.
//
// So the heading IS the scope: the Playbook's name at the h2 rung with a
// chevron after it, opening the DS select's own option list. Every layout puts
// it where it used to print the word "Objectives" — the rail's head, the band's
// title, the Report hero — and the page bar no longer carries a Playbook field.
//
// ⚠️ This is a deliberate reversal. The title-with-a-chevron was tried, dropped
// for "a title that is secretly a picker reads as neither", and the scope became
// a labelled select beside the title. The reversal is the user's call, and what
// makes it safe is that the picker is not secret: the chevron is always
// visible, the hit area lights up on hover, and the arrow turns blue — the
// interactive colour — so the heading declares itself a control. What it buys
// is the word the heading spends: "Objectives" labelled a list the counts and
// the tabs under it already name, while the brand the whole page is about was
// printed once, small, in a form field.

/**
 * The Playbook picker, as the section's heading. One Playbook → a plain
 * heading: a select with a single option cannot be used.
 *
 * ⚠️ In WORKSPACE MODE it renders NOTHING, and the hosts treat the empty string
 * as "no band". The rail carries the brand permanently, one row above the
 * topbar's own title, so a page that re-prints it spends its first 87px saying
 * what the chrome already said — and the page's own subject (`Objectives`, or
 * the objective being read) never gets the top of the screen. The hosts put
 * that subject there instead: `pageTitle()` below.
 *
 * It still renders the PICKER when the flag is off: outside workspace mode this
 * heading is the only door to the scope in the whole app, and a page with no
 * way to re-point itself is a dead end (shell.js § Empty states).
 */
export function playbookTitle(ctx) {
  const all = getContexts();
  if (isWorkspaceMode()) return "";
  if (all.length < 2) {
    return `<h2 class="ins-pbtitle__name ins-pbtitle__name--static">${esc(ctx.name)}</h2>`;
  }
  const rows = all
    .map(
      (
        c,
      ) => `<div class="ap-select-option${c.id === ctx.id ? " selected" : ""}" data-ins-scope-pick="${esc(c.id)}" role="option" aria-selected="${c.id === ctx.id}">
        <span class="ap-select-option-text">${esc(c.name)}</span>
        ${c.id === ctx.id ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
      </div>`,
    )
    .join("");
  // `aria-label="Playbook"` — one word, and it has to be there: `combobox` does
  // not take its name from its contents (checked in the tree: without it the
  // control came back nameless), and the visible label the old select had is
  // gone. It says WHAT is being chosen, never the current value — the value is
  // the heading inside, which AT reads on its own. (It used to say "Playbook —
  // currently <name>", which restated both visible strings.)
  //
  // The heading lives INSIDE the summary: `<summary>` takes heading content by
  // spec, and that keeps the page's outline intact now that the h2 and the
  // control are one element rather than two.
  return `<details class="ins-pbtitle" data-ins-scope>
    <summary class="ins-pbtitle__trigger" role="combobox" aria-label="Playbook"
      aria-haspopup="listbox" aria-expanded="false" aria-controls="insPbListbox">
      <h2 class="ins-pbtitle__name">${esc(ctx.name)}</h2>
      <i class="ap-icon-chevron-down ins-pbtitle__arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown ins-pbtitle__menu" id="insPbListbox" role="listbox" aria-label="Playbook">
      <div class="ap-select-options">${rows}</div>
    </div>
  </details>`;
}

/**
 * The page's own title, for the hosts whose band is gone.
 *
 * It takes the rung the brand name had — h2 type, `<h2>` element, since the
 * topbar owns the document's `<h1>` ("Insights") — so promoting the subject
 * changes the WORD at the top of the page and not the page's rhythm. The
 * counter is the same `.ap-counter` the section titles carry; the word and the
 * rung are declared here once, because two hosts print them.
 */
export function pageTitle(label, { count = null } = {}) {
  return `<h2 class="ins-pagetitle">${esc(label)}${count != null ? ` <span class="ap-counter normal grey">${count}</span>` : ""}</h2>`;
}

/**
 * The OBJECTIVE picker, as the read's own heading — the same construction as
 * `playbookTitle` above, one rung up the page: the objective's name at the h1
 * rung with a chevron after it, opening the other objectives of this Playbook
 * with their verdicts beside them.
 *
 * It leans on the reversal `playbookTitle`'s note documents: a title that is a
 * picker is fine as long as it is not SECRET — the chevron is always visible,
 * the hit area fills on hover, the arrow goes electric blue. Same `data-ins-scope`
 * hook, so the shell's outside-click closer (shell.js § onClick) takes it over
 * without a line of its own.
 *
 * One objective → a plain heading: a select with a single option cannot be used.
 *
 * Used by the mob_ lectures that read one objective without a list on screen.
 */
export function objectiveTitle(entries, selected) {
  if (entries.length < 2) {
    return `<h2 class="ins-objtitle__name ins-objtitle__name--static">${esc(selected.label)}</h2>`;
  }
  const rows = entries
    .map((e) => {
      const on = e.key === selected.key;
      return `<div class="ap-select-option${on ? " selected" : ""}" data-ins-select="${esc(e.key)}" role="option" aria-selected="${on}">
        <span class="ap-select-option-text">${esc(e.label)}</span>
        ${statusPill(e, { dot: false })}
        ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
      </div>`;
    })
    .join("");
  return `<details class="ins-objtitle" data-ins-scope>
    <summary class="ins-objtitle__trigger" role="combobox" aria-label="Objective"
      aria-haspopup="listbox" aria-expanded="false" aria-controls="insObjListbox">
      <h2 class="ins-objtitle__name">${esc(selected.label)}</h2>
      <i class="ap-icon-chevron-down ins-objtitle__arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown ins-objtitle__menu" id="insObjListbox" role="listbox" aria-label="Objective">
      <div class="ap-select-options">${rows}</div>
    </div>
  </details>`;
}

/**
 * How the Playbook's objectives stand, as counts — never a Playbook verdict
 * (there is none by decision).
 *
 * Two DS components, no third thing: the tier is a `.ap-status` (a dot plus a
 * one-or-two-word state, which is exactly what a tier is) and the number is a
 * `.ap-counter normal` after it (the DS's own form for a live count placed after
 * a label — these move whenever a verdict flips). It used to be a hand-made 8px
 * dot beside a bold number, which re-implemented the Status pill's ::before and
 * let the counts line drift from the verdict pills it summarises.
 */
export function tierCounts(rollup) {
  // ONE pill per state, the count inside it. It was a DS Status pill plus a
  // detached DS Counter chip — two components per state, six objects for three
  // facts, and once this row moved next to a section title that already carries
  // its own grey counter, those chips started reading as a second kind of count.
  //
  // A zero is dropped rather than shown in its tier's colour: a red "0 Off
  // track" is an alarm tint on a non-problem, and the absence of the pill says
  // the same thing. `collecting` was already handled that way — this only makes
  // the rule uniform.
  const one = (n, label, tone) => (n ? `<span class="ap-status ${tone}">${n} ${label}</span>` : "");
  return `<div class="ins-counts">
    ${one(rollup.onTrack, "On track", "green")}
    ${one(rollup.atRisk, "At risk", "tagOrange")}
    ${one(rollup.offTrack, "Off track", "red")}
    ${one(rollup.collecting, "Collecting", "grey")}
  </div>`;
}

/**
 * "14 posts drafted with Archie moved them over the window." — the one line in
 * a head that says these objectives are being WORKED and not just watched.
 *
 * Shared, because Report's hero and the Index's head say the same sentence
 * about the same number: a second copy is how two heads end up disagreeing.
 * Callers pass their own class when they already style that slot.
 */
export function postsMovedLine(rollup, { className = "" } = {}) {
  const n = rollup.posts;
  if (!n) return "";
  return `<p class="ins-postsline${className ? ` ${className}` : ""}">${n} post${n === 1 ? "" : "s"} drafted with Archie moved them over the window.</p>`;
}

// ── Verdict ───────────────────────────────────────────────────────────────

/** The DS status pill — the one way a verdict is written anywhere in the app. */
export function statusPill(entry, { dot = true } = {}) {
  return `<span class="ap-status ${esc(entry.statusClass)}${dot ? "" : " no-dot"}">${esc(entry.tierLabel)}</span>`;
}

/** A measure's own state as a smaller pill (on / soft / off → the tier words). */
export function measurePill(m) {
  const cls = { "on-track": "green", "at-risk": "tagOrange", "off-track": "red" }[m.tier] || "grey";
  const label = { "on-track": "On track", "at-risk": "At risk", "off-track": "Off track" }[m.tier] || "Pending";
  return `<span class="ap-status ${cls} no-dot">${label}</span>`;
}

// ── Provenance ────────────────────────────────────────────────────────────

/** Who set the objective — Archie (from the website analysis) or the reader. */
export function originMark(entry, { short = false } = {}) {
  if (entry.origin === "user") {
    return `<span class="ins-origin"><i class="ap-icon-user ap-icon-sm" aria-hidden="true"></i>${short ? "You" : "Set by you"}</span>`;
  }
  return `<span class="ins-origin"><i class="ap-icon-archie-official ap-icon-sm" aria-hidden="true"></i>${short ? "Archie" : "Proposed by Archie"}</span>`;
}

/** The window as a line — "Rolling 30-day window" / "Ends Dec 31 · 42 days left". */
export function windowLine(entry) {
  const w = entry.window;
  if (w.type === "fixed") {
    const left = w.daysLeft == null ? "" : w.daysLeft > 0 ? ` · ${w.daysLeft} days left` : " · window closed";
    return `${cap(w.short)}${left}`;
  }
  return cap(w.label);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// ── Trend ─────────────────────────────────────────────────────────────────

const TREND_ICON = { up: "ap-icon-data-increase", down: "ap-icon-data-decrease", flat: "ap-icon-data-stagnate" };

/**
 * The trend glyph — icon + signed %. Only a positive move is coloured (green);
 * flat and negative stay ink, the icon carries the direction.
 */
export function trendGlyph(m, { label = false } = {}) {
  const t = m.trend || { dir: "flat", pct: 0 };
  const good = t.dir === "up";
  return `<span class="ins-trend ${good ? "ins-trend--up" : ""}" title="${esc(t.label)} ${signedPct(t.pct)} over the window">
    <i class="${TREND_ICON[t.dir] || TREND_ICON.flat} ap-icon-sm" aria-hidden="true"></i><span>${signedPct(t.pct)}</span>${label ? `<span class="ins-trend__label">over the window</span>` : ""}
  </span>`;
}

// ── The score ─────────────────────────────────────────────────────────────

/**
 * How far an objective is, as one figure: the percentage, the measure it is
 * measured on, and the trend beside it. Shared, because "42% of target on Link
 * clicks, down 11%" is the same sentence in every layout — only its size moves.
 * A collecting objective has no percentage to print and says so.
 */
export function scoreFigure(entry, { size = "lg" } = {}) {
  const m = entry.headline;
  // A collecting objective has no percentage — but it does have a real number:
  // how far into its grace window it is. An em-dash in a 56px black slot reads
  // as a printing error, so the slot carries the day count and says what is
  // being waited for.
  if (entry.collecting) {
    const day = entry.grace?.day ?? 1;
    const of = entry.grace?.of ?? 7;
    const left = Math.max(0, of - day);
    return `<div class="ins-score ins-score--${size} ins-score--pending">
      <span class="ins-score__value">${day}<span class="ins-score__unit">/${of}</span></span>
      <span class="ins-score__meta">
        <span>days collected</span>
        <span>${left === 0 ? "first verdict due" : `first verdict in ${left} day${left === 1 ? "" : "s"}`}</span>
      </span>
    </div>`;
  }
  return `<div class="ins-score ins-score--${size}">
    <span class="ins-score__value">${entry.progress}<span class="ins-score__unit">%</span></span>
    <span class="ins-score__meta">
      <span>of target on ${esc(m?.metricLabel || "")}</span>
      ${m ? trendGlyph(m) : ""}
    </span>
  </div>`;
}

// ── Measures ──────────────────────────────────────────────────────────────

/**
 * An objective measured on a proxy because a connection is missing — a state
 * that needs a sentence of context. The DS component for that is the INFOBOX,
 * in its warning variant.
 *
 * ⚠️ It was a `.ap-status-card tagOrange` with `.upper` / `.flow` children, and
 * that markup rendered NOTHING: the DS's Status card is Angular-only — its spec
 * lists `ap-status` as the only CSS-UI class it has, and `.ap-status-card`,
 * `.upper` and `.flow` are in no stylesheet this app loads. Three invented
 * classes styling a component that does not exist outside Angular. (Before
 * that it was a `.ap-tag tagOrange mini`, which was three of the Tag's own
 * Don'ts in one span — a Tag names an entity a user can create, its colours
 * name an object TYPE, and `mini` is for inline references in running text.)
 *
 * Infobox was ruled out then as "page-level and dismissible". Its close button
 * is a part you leave out (`.ap-infobox-close`), and the whole point of the
 * component is a state that needs explaining — so the objection was about a
 * variant, not the component.
 *
 * No app class on it: the component brings the frame, the tone, the type, its
 * 4px left edge and its own width, and what makes this note read as scoped to
 * ONE objective is where it sits — under that objective's reading — not a box
 * narrower than the cards beside it.
 */
export function proxyNote(entry) {
  return `<div class="ap-infobox warning has-title">
    <i class="ap-icon-warning_fill" aria-hidden="true"></i>
    <div class="ap-infobox-content">
      <div class="ap-infobox-texts">
        <span class="ap-infobox-title">Needs Google Analytics</span>
        ${entry.soon ? `<span class="ap-infobox-message">${esc(entry.soon)}</span>` : ""}
      </div>
    </div>
  </div>`;
}

// ── Linked posts ──────────────────────────────────────────────────────────

/**
 * ONE post that moved this objective, as the winners BOARD draws it —
 * `renderTopPostCard` (top-post-card.js), the same component `/session`'s
 * "20 best-performing posts" grid is made of. A post should look like a post
 * wherever it is shown, and this section had grown its own compact row saying
 * the same things in a different shape.
 *
 * ⚠️ It WAS that compact row (`renderPostEchoRow`, still the chat's own shape,
 * `git log -S ins-postrow`). The row was chosen when this was "one row of
 * several" under a table; the section is now a grid of the real cards, so what
 * a post looks like is decided in one place for both surfaces.
 *
 * Three slots are ours, because they are the only things the two hosts measure
 * differently:
 *   • the stat strip — this post's contribution to the measure and its share of
 *     it, not a view count. Two columns where the board has four; the strip is
 *     built for either.
 *   • the hero figure — `1.9× median` rather than `4.3× vs average`: the
 *     comparison Archie can actually make for a post attached to a measure.
 *   • the CTA — **Repurpose**, the loop's other end, since a post that moved an
 *     objective is the best brief for the next one. Same blue primary the board
 *     gives it, carrying `data-ins-*` so this screen's own dispatch answers.
 *
 * `--neutral` keeps the multiple in INK instead of the board's green. Green
 * means "on track" on this screen, and a green multiple inside an off-track
 * objective would read as reassurance — the board has no such vocabulary to
 * collide with.
 *
 * There is NO remove: a post is on this list because Archie measured that it
 * moved the objective, and a reader cannot un-observe that.
 */
export function postCard(post, entry) {
  const c = post.contribution || {};
  // The unit comes out of the model lowercase (it is a fragment of the
  // sentence "+3,300 reach"); as a column heading beside the board's own
  // `Views` / `Reach` it takes a capital.
  const unit = c.unit || post.metricLabel || "";
  const stats = [
    [esc(c.amount || "—"), esc(unit.charAt(0).toUpperCase() + unit.slice(1))],
    [c.share != null ? `${Math.round(c.share * 100)}%` : "—", "of the measure"],
  ]
    .map(
      ([v, l]) =>
        `<div class="top-post-card__stat"><span class="top-post-card__stat-value">${v}</span><span class="top-post-card__stat-label">${l}</span></div>`,
    )
    .join("");
  return renderTopPostCard(post, {
    className: "top-post-card--neutral ins-postcard",
    statsHtml: stats,
    heroHtml: `<span class="top-post-card__hero">
        <span class="top-post-card__hero-value">${esc(c.multipleValue || "—")}</span>
        <span class="top-post-card__hero-label">vs&nbsp;median</span>
      </span>`,
    ctaHtml:
      `<button type="button" class="ap-button primary blue top-post-card__cta" data-ins-repurpose="${esc(entry.key)}" data-ins-post="${esc(post.id)}">` +
      `Repurpose</button>`,
  });
}

/** The empty case under an objective — no posts drafted with Archie yet. */
export function postsEmpty() {
  return `<p class="ins-posts-empty">No post drafted with Archie has moved this objective yet.</p>`;
}

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * The two doors every objective has: into a chat about it (the AI action —
 * orange), and into its editor (routine — stroked grey). Auto-width, always.
 *
 * SECONDARY, not primary: the DS allows one primary per screen and the topbar's
 * New objective is it. Secondary is also the right rung by its own definition —
 * "the main action of a bounded subsection" — which is what a chapter or a pane
 * is. Orange stays: this is the AI door.
 */
export function objectiveActions(entry) {
  const chatLabel = entry.nextMove?.cta || "Work on this";
  return `<div class="ins-actions">
    <button type="button" class="ap-button secondary orange" data-ins-chat="${esc(entry.key)}">
      <i class="ap-icon-sparkles" aria-hidden="true"></i><span>${esc(chatLabel)}</span>
    </button>
    <button type="button" class="ap-button stroked grey" data-ins-adjust="${esc(entry.key)}">
      <i class="ap-icon-pen" aria-hidden="true"></i><span>Adjust</span>
    </button>
  </div>`;
}

// ── Numbers ───────────────────────────────────────────────────────────────

/** A numeral with a name under it — the supporting figures beside a score. */
export function figure(value, name) {
  return `<div class="ins-figure">
    <span class="ins-figure__value">${value}</span>
    <span class="ins-figure__name">${esc(name)}</span>
  </div>`;
}

export { signedPct, esc };
