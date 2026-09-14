// ---- Insights — the ONE Highcharts touchpoint ---------------------------------
//
// Every chart in the app is built here: the three Insights layouts call the
// builders below and mount the result with renderChart(). Nothing else imports
// Highcharts (grep "highcharts" → this file only), so the vendored build is
// upgraded in one place and the theme is applied once.
//
// Two families live side by side, on purpose:
//   · Highcharts specs — the trend curve (areaspline + target + post markers)
//     and the sparkline. Anything with a time axis or a tooltip.
//   · Pure SVG strings — the progress ring and the bar. A ring is a shape, not
//     a chart: it has no axis, no hover, and painting it through a charting
//     library costs a container, a resize listener and 80 KB of runtime for two
//     circles. They take their colour from CSS classes (.app-ring--on-track …)
//     so they follow the tokens without JS.
//
// Colours: Highcharts paints SVG attributes and cannot resolve var(), so the
// --app-chart-* tokens (styles/tokens.css) are read ONCE via getComputedStyle
// and cached. The tier → colour map is the same one the DS status pill uses
// (on-track green, at-risk tagOrange, off-track red) so a curve and the pill
// above it can never disagree.
//
// Lifecycle gotcha: Highcharts keeps a reference and a window resize listener
// per chart. A host that replaces its innerHTML without destroying first leaks
// both. The shell calls destroyChartsIn(host) before every paint and on
// teardown — layouts never destroy on their own.

import Highcharts from "../../../vendor/highcharts/highcharts-12.4.0.esm.js?v=1163";

// ── Tokens ────────────────────────────────────────────────────────────────

const tokenCache = new Map();

function token(name) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v) tokenCache.set(name, v);
  return v;
}

// Chart chrome reads the DS caption style — its smallest step, and the floor
// for any text in a chart. These are functions, not consts: the tokens can only
// be read once the stylesheets are in, and a spec builder may run before any
// theme has been applied.
const captionSize = () => token("--sys-text-style-caption-size") || "12px";
const captionLine = () => token("--sys-text-style-caption-line-height") || "16px";

const TIER_TOKEN = {
  "on-track": "on-track",
  "at-risk": "at-risk",
  "off-track": "off-track",
  collecting: "neutral",
  parked: "neutral",
};

/** A chart colour by name — "on-track" | "at-risk" | "off-track" | "neutral" | "target" | "grid" | "axis" | 1..6. */
export function chartColor(name) {
  return token(`--app-chart-${name}`);
}

/** The stroke + soft fill pair for a tier (unknown / null → neutral). */
export function tierColor(tier) {
  const base = TIER_TOKEN[tier] || "neutral";
  return { stroke: chartColor(base), soft: chartColor(`${base}-soft`) };
}

// ── Theme ─────────────────────────────────────────────────────────────────

let themed = false;

// The theme is the platform's, not one of our own: every value below that has a
// counterpart in `ChartOptions.DEFAULT_OPTIONS` (@agorapulse/ui-charts v22, the
// base every Reports and ROI chart is built on) takes the platform's value, so
// a curve here is framed like a curve there. The package itself is Angular
// components — unusable from a CSS-UI prototype — so this mirrors its options
// rather than importing them; the divergences left are marked ⚠️ with a reason.
export function applyTheme() {
  if (themed) return;
  themed = true;
  const font = token("--ref-font-family") || "Averta, sans-serif";
  const white = token("--ref-color-white") || "#FFFFFF";
  const ink = token("--ref-color-grey-100") || "#212E44";
  Highcharts.setOptions({
    chart: {
      backgroundColor: "transparent",
      style: { fontFamily: `${font}, Averta, sans-serif` },
      spacing: [8, 0, 0, 0],
      animation: { duration: 400 },
    },
    // The DS categorical palette, in its fixed order (`ChartColors.DATA_COLORS`
    // / `getDataColor(n)`). Position-assigned and wrapping after ten, exactly
    // as the package does it.
    colors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => chartColor(`data-${i}`)),
    credits: { enabled: false },
    title: { text: undefined },
    legend: { enabled: false },
    accessibility: { enabled: false },
    time: { useUTC: false },
    lang: { thousandsSep: "," },
    xAxis: {
      type: "datetime",
      lineColor: chartColor("axis-line"),
      gridLineColor: chartColor("grid"),
      tickColor: chartColor("axis-line"),
      tickLength: 0,
      // Prod draws both grids at 1px. This screen ran with no vertical grid at
      // all, which read cleaner in isolation and wrong beside a Reports chart.
      gridLineWidth: 1,
      labels: { style: { color: chartColor("axis"), fontSize: captionSize() } },
    },
    yAxis: {
      title: { text: null },
      gridLineColor: chartColor("grid"),
      lineColor: chartColor("axis-line"),
      gridLineWidth: 1,
      // A reach of 14,800 has no half — prod's default, and it also stops a
      // short window inventing decimal ticks.
      allowDecimals: false,
      labels: { style: { color: chartColor("axis"), fontSize: captionSize() } },
    },
    // A WHITE tooltip with ink text, 4px, no border, and the platform's barely
    // there shadow — this was a dark ink bubble with white text, the one piece
    // of chart chrome that looked like another product.
    tooltip: {
      backgroundColor: white,
      borderWidth: 0,
      borderRadius: 4,
      shadow: { color: "#000000", offsetX: 0, offsetY: 2, opacity: 0.02, width: 6 },
      useHTML: true,
      padding: Number.parseInt(token("--ref-spacing-xxs") || "8", 10),
      style: { color: ink, fontSize: captionSize(), lineHeight: captionLine() },
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
        marker: { enabled: false },
        // `inactive: 0.2` is the platform's: hovering one series fades the
        // others instead of leaving the reader to pick it out.
        states: { hover: { brightness: 0, lineWidthPlus: 0, halo: { size: 6 } }, inactive: { opacity: 0.2 } },
      },
    },
  });
}

// ── Formatting ────────────────────────────────────────────────────────────

function compact(n, unit = "") {
  if (n == null) return "—";
  const abs = Math.abs(n);
  let s;
  if (abs >= 1_000_000) s = `${Math.round(n / 100_000) / 10}M`;
  else if (abs >= 10_000) s = `${Math.round(n / 1000)}K`;
  else if (abs >= 1000) s = `${Math.round(n / 100) / 10}K`;
  else s = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  return `${s}${unit}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function gradient(stroke) {
  return {
    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
    stops: [
      [0, `${stroke}40`],
      [1, `${stroke}00`],
    ],
  };
}

// Round a floor down to a clean figure so the axis starts on a readable tick.
function floorNice(v) {
  if (v <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.floor(v / mag) * mag;
}

// Highcharts' own %e space-pads the day ("Jun  4"), which reads as a typo in a
// tick row. One formatter, used by the axis and the tooltips alike.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateLabel(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Specs ─────────────────────────────────────────────────────────────────

/**
 * The trend curve of one measure over its window.
 * @param {object} series  — a model.js measure series ({ points, target, requiredPace, postMarkers, unit })
 * @param {object} opts    — { tier, metricLabel, target=true, postMarkers=true, height=200, compact=false }
 */
export function trendSpec(
  series,
  { tier, metricLabel = "", target = true, postMarkers = true, height = 200, compact: isCompact = false } = {},
) {
  const color = tierColor(tier);
  const unit = series.unit || "";
  const list = [
    {
      type: "areaspline",
      name: metricLabel || "Value",
      data: series.points,
      color: color.stroke,
      // 4px is the DS spline's own line weight (`ChartSplineOptions`); the
      // compact variant stays at 2, because 4 across a 104px card curve is a
      // ribbon and the platform has no chart that small to copy.
      lineWidth: isCompact ? 2 : 4,
      fillColor: gradient(color.stroke),
      threshold: null,
      connectNulls: false,
      zIndex: 2,
      marker: { enabled: false, symbol: "circle", radius: 3, fillColor: color.stroke },
      states: { hover: { lineWidth: 2 } },
    },
  ];
  if (series.requiredPace) {
    const [x0, y0, x1, y1] = series.requiredPace;
    list.push({
      type: "line",
      name: "Required pace",
      data: [
        [x0, y0],
        [x1, y1],
      ],
      color: chartColor("neutral"),
      dashStyle: "ShortDot",
      lineWidth: 1,
      enableMouseTracking: false,
      zIndex: 1,
    });
  }
  if (postMarkers && series.postMarkers?.length) {
    list.push({
      type: "scatter",
      name: "Posts with Archie",
      data: series.postMarkers.map((p) => ({ x: p.ms, y: p.value, custom: p })),
      color: color.stroke,
      marker: {
        enabled: true,
        symbol: "circle",
        radius: isCompact ? 4 : 5,
        fillColor: token("--ref-color-white") || "#fff",
        lineColor: color.stroke,
        lineWidth: 2,
      },
      zIndex: 5,
      states: { hover: { halo: { size: 8 } } },
    });
  }

  const plotLines = [];
  if (target && series.target != null) {
    plotLines.push({
      value: series.target,
      color: chartColor("target"),
      dashStyle: "Dash",
      width: 1,
      zIndex: 3,
      label: isCompact
        ? undefined
        : {
            text: `Target ${compact(series.target, unit)}`,
            align: "right",
            x: -4,
            y: -6,
            style: { color: chartColor("axis"), fontSize: captionSize() },
          },
    });
  }

  return {
    chart: { type: "areaspline", height, spacing: isCompact ? [4, 0, 0, 0] : [12, 4, 4, 4] },
    xAxis: {
      type: "datetime",
      // Weekly ticks, not "whatever fits in 90px". A 30-day window read every
      // two days is 15 labels the eye has to filter; read by the week it is
      // five, and the reader already thinks in weeks.
      tickInterval: WEEK_MS,
      labels: { enabled: !isCompact, formatter: ({ value }) => dateLabel(value) },
      lineWidth: isCompact ? 0 : 1,
      // The theme turns the vertical grid on for a full chart (prod's default);
      // a card curve keeps none — at 104px they'd be most of what you see.
      gridLineWidth: isCompact ? 0 : 1,
      crosshair: isCompact ? false : { width: 1, color: chartColor("axis-line"), dashStyle: "Dash", snap: true },
    },
    yAxis: {
      labels: { enabled: !isCompact, formatter: ({ value }) => compact(value, unit) },
      gridLineWidth: isCompact ? 0 : 1,
      min: series.min != null ? floorNice(series.min * 0.9) : undefined,
      softMax: series.max != null ? Math.ceil(series.max * 1.06) : undefined,
      startOnTick: false,
      endOnTick: false,
      plotLines,
    },
    tooltip: {
      shared: false,
      formatter() {
        const p = this.point;
        if (p.custom?.postId) {
          const c = p.custom;
          return `<div style="max-width:220px"><div style="opacity:.7">${esc(c.networkLabel)} · ${esc(c.date)}</div><div style="margin:4px 0 6px;white-space:normal">${esc(c.excerpt)}</div><strong>${esc(c.contributionLabel)}</strong></div>`;
        }
        return `<div style="opacity:.7">${dateLabel(p.x)}</div><strong>${compact(p.y, unit)}</strong> ${esc(metricLabel)}`;
      },
    },
    series: list,
  };
}

/** A bare sparkline — no axes, no tooltip, no markers. */
export function sparklineSpec(series, { tier, height = 36 } = {}) {
  const color = tierColor(tier);
  const past = series.points.filter((p) => p[1] != null);
  return {
    chart: { type: "areaspline", height, spacing: [2, 0, 2, 0], margin: [2, 0, 2, 0] },
    xAxis: { visible: false },
    yAxis: {
      visible: false,
      min: series.min != null ? floorNice(series.min * 0.9) : undefined,
      plotLines:
        series.target != null
          ? [{ value: series.target, color: chartColor("target"), dashStyle: "Dash", width: 1, zIndex: 3 }]
          : [],
    },
    tooltip: { enabled: false },
    series: [
      {
        type: "areaspline",
        data: past,
        color: color.stroke,
        lineWidth: 1.5,
        fillColor: gradient(color.stroke),
        threshold: null,
        enableMouseTracking: false,
        marker: { enabled: false },
      },
    ],
  };
}

// ── Mounting ──────────────────────────────────────────────────────────────

const charts = new Map();

/** Mount a spec into a node. The node must be in the DOM (Highcharts measures it). */
export function renderChart(node, options) {
  if (!node || !options) return null;
  applyTheme();
  const previous = charts.get(node);
  if (previous) previous.destroy();
  const chart = Highcharts.chart(node, options);
  charts.set(node, chart);
  return chart;
}

/** Destroy every chart mounted inside root (or every chart, with no root). */
export function destroyChartsIn(root = null) {
  for (const [node, chart] of charts) {
    if (root && !root.contains(node)) continue;
    try {
      chart.destroy();
    } catch {
      /* already gone with its node */
    }
    charts.delete(node);
  }
}

export function reflowChartsIn(root = null) {
  for (const [node, chart] of charts) {
    if (root && !root.contains(node)) continue;
    chart.reflow();
  }
}

/** Mount every `[data-ins-chart]` placeholder under root from a spec map { id → options }. */
export function mountCharts(root, specs) {
  root.querySelectorAll("[data-ins-chart]").forEach((node) => {
    const spec = specs.get(node.dataset.insChart);
    if (spec) renderChart(node, spec);
  });
}

// ── Pure SVG ──────────────────────────────────────────────────────────────

const clampPct = (p) => Math.max(0, Math.min(100, Math.round(p ?? 0)));

/**
 * A progress ring. Colour comes from the tier class (.app-ring--on-track …),
 * so it follows the tokens without any JS colour lookup.
 */
export function ringSvg(progress, tier, { size = 48, stroke = 5, label = true, pending = false, name = "" } = {}) {
  const p = pending ? 0 : clampPct(progress);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (c * p) / 100;
  const fontSize = Math.round(size * (size >= 80 ? 0.24 : 0.28));
  const text = pending ? "—" : `${p}%`;
  // The name says WHAT is at 42% — "42% of target" alone is unreadable to a
  // screen reader — and a pending ring must not claim 0%: it has no figure yet.
  const aria = pending ? "No figure yet" : `${p}% of target${name ? ` on ${esc(name)}` : ""}`;
  return `<svg class="app-ring app-ring--${esc(tier || "collecting")}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${aria}">
    <circle class="app-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" />
    <circle class="app-ring__arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" />
    ${label ? `<text class="app-ring__label" x="50%" y="50%" dy="0.36em" text-anchor="middle" font-size="${fontSize}" font-weight="700">${text}</text>` : ""}
  </svg>`;
}

/** A thin progress bar, tier-coloured by class. */
/**
 * A thin progress bar, tier-coloured by class. Hidden from assistive tech: every
 * call site prints the same percentage as text right beside it, so a
 * role="progressbar" here would either repeat that or — as it did — announce
 * "50%, progress bar" with no way to know 50% of what.
 */
export function progressBar(progress, tier, { pending = false } = {}) {
  const p = pending ? 0 : clampPct(progress);
  return `<div class="app-bar app-bar--${esc(tier || "collecting")}" aria-hidden="true"><span class="app-bar__fill" style="width:${p}%"></span></div>`;
}
