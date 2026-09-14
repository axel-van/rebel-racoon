// ---- Insights — the one model every layout reads -----------------------------
//
// Insights is two layouts (Report · Cockpit) over ONE derivation.
// Nothing here is stored: an objective is a label on the active Playbook plus
// the corrections the editor wrote (`ctx.objectiveMeasures[label]`), and this
// module turns that into what a layout paints — the verdict, one dense series
// per measure, the posts drafted with Archie that moved it, and the counts a
// Playbook-level hero prints. Every layout consumes the same Entry, so
// switching layout can never change what the reader is told.
//
// Determinism is the rule. The series generator has no Math.random anywhere:
// endpoints are the real numbers a measure already carries (current value,
// trend, target), the interior is a fixed noise table indexed by a hash of the
// objective's key, and the posts land on the curve as decaying bumps at their
// publish day. Two paints of one objective draw the same line; two objectives
// never draw the same one.
//
// The model holds NO state. It used to keep a set of posts the reader had
// removed from an objective; a post is attributed by Archie because it moved
// the measure, so un-attributing it asked the reader to argue with an
// observation rather than act on it. The verb is gone, and with it the set, the
// notifier it existed to fire, and the entry's removed counts.

import { getActivePlaybook } from "../../active-playbook.js?v=1184";
import {
  resolveObjectives,
  objectiveVerdict,
  measureState,
  measureTier,
  isRateMetric,
  windowPhrase,
  parseMetricValue,
  formatLike,
  metricLabel,
} from "../../objective-measures.js?v=1184";
import { TIER_LABELS, TIER_STATUS_CLASS, TIER_ORDER } from "../../objective-scoring.js?v=1184";
import { nextMoveFor } from "../../objective-flow.js?v=1184";
import { objectivePosts, objectivePostPool, TOP_POST_TODAY, TOP_POST_IMAGES } from "../../mocks.js?v=1184";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=1184";

/** The mock "today" — one anchor for the series' x-axis and the posts' dates. */
export const INSIGHTS_TODAY = TOP_POST_TODAY;

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const MAX_FUTURE_DAYS = 60;

// The tiers a layout can meet on an entry — the three verdicts plus the one
// non-verdict state. "collecting" is an objective in its grace window: it has
// measures and a curve but no judgment yet, so it sorts last and paints grey.
const STATE_ORDER = { ...TIER_ORDER, collecting: 3 };

const STATE_LABELS = { ...TIER_LABELS, collecting: "Collecting" };
const STATE_CLASS = { ...TIER_STATUS_CLASS, collecting: "grey" };

const MEASURE_STATE_TIER = { on: "on-track", soft: "at-risk", off: "off-track" };

// ── Determinism helpers ───────────────────────────────────────────────────

// FNV-1a over a string — cheap, stable, spreads short keys well.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 24 entries — coprime with the 30-point window, so the pattern never lines
// up with the weeks and never visibly repeats.
const NOISE = [
  0.32, -0.18, 0.11, -0.41, 0.27, -0.09, 0.19, -0.33, 0.06, 0.24, -0.22, 0.14, -0.05, 0.36, -0.29, 0.08, -0.15, 0.21,
  -0.38, 0.17, 0.02, -0.26, 0.31, -0.12,
];
// A post's moment on the curve: a day of ramp-up, the peak on the publish day,
// then a tail — six days wide, so it reads as a swell rather than a spike.
const BUMP_SHAPE = [0.3, 1, 0.75, 0.5, 0.3, 0.14];
const BUMP_LEAD = 1;

const smoothstep = (t) => t * t * (3 - 2 * t);

// ── Dates ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayAgoMs(daysAgo) {
  return INSIGHTS_TODAY.getTime() - daysAgo * DAY_MS;
}

/** "Jun 22" for a post N days before the mock today. */
export function shortDate(daysAgo) {
  const d = new Date(dayAgoMs(daysAgo));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - INSIGHTS_TODAY.getTime()) / DAY_MS);
}

// ── Numbers ───────────────────────────────────────────────────────────────

/** A signed percentage — "+12%", "−8%", "0%". Typographic minus, never a hyphen. */
export function signedPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "—";
  const r = Math.round(pct);
  if (r === 0) return "0%";
  return r > 0 ? `+${r}%` : `−${Math.abs(r)}%`;
}

// ── Linked posts — Archie-drafted, published, attributed to a measure ──────

const NETWORK_CYCLE = ["linkedin", "instagram", "facebook", "x"];
const GENERATED_DAYS = [4, 9, 15, 22];
const GENERATED_SHARE = [0.22, 0.14, 0.09, 0.06];
const GENERATED_MEDIA = ["text", "image", "document", "text"];

function generatedRows(entry, seed) {
  const measures = entry.measures;
  if (!measures.length) return [];
  const n = 2 + (seed % 3);
  const scoped = measures.map((m) => m.scope?.network).filter(Boolean);
  const networks = scoped.length ? [...new Set(scoped)] : NETWORK_CYCLE;
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const measure = measures[i % measures.length];
    const pool = objectivePostPool[measure.metricId] || objectivePostPool.default;
    rows.push({
      id: `ap-${slug(entry.key)}-${i + 1}`,
      network: networks[(seed + i) % networks.length],
      daysAgo: GENERATED_DAYS[i],
      mediaType: GENERATED_MEDIA[i],
      // An image post shows its picture in the row (the winners' own card), so a
      // generated one gets a poster from the same pool the winners draw from.
      image: GENERATED_MEDIA[i] === "image" ? TOP_POST_IMAGES[(seed + i) % TOP_POST_IMAGES.length] : null,
      excerpt: pool[(seed + i) % pool.length],
      metricId: measure.metricId,
      share: GENERATED_SHARE[i],
      multiple: 1.3 + ((seed + i * 7) % 9) / 10,
    });
  }
  return rows;
}

function slug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// The contribution, in PIECES as well as in prose. The sentence
// ("+3,300 reach · 1.9× median") is what a chat hand-off and a chart tooltip
// quote; the pieces are what a card's stat strip needs, where the number and
// its unit sit on two lines and cannot be one string. `amount` / `unit` are
// split off the same source rather than re-derived, so the two can never
// disagree — a mock's pre-formatted `figure` is "<number> <unit>" by
// construction (mocks/objectives.js), and the computed branch builds it that
// way too.
function contributionFor(row, measure) {
  const current = measure?.current;
  let value = row.figure || null;
  if (!value && measure && current != null) {
    const raw = current * row.share;
    const formatted = formatLike(measure.baselineValue, raw);
    const label = measure.metricLabel.toLowerCase();
    value = measure.isRate ? `${formatted} ${label}` : `+${formatted} ${label}`;
  }
  const cut = value ? value.indexOf(" ") : -1;
  const amount = cut > 0 ? value.slice(0, cut) : value;
  const unit = cut > 0 ? value.slice(cut + 1) : measure?.metricLabel || "";
  const times = Math.round(row.multiple * 10) / 10;
  const multiple = `${times}× median`;
  return {
    value,
    amount,
    unit,
    share: row.share,
    multiple,
    multipleValue: `${times}×`,
    label: value ? `${value} · ${multiple}` : multiple,
  };
}

function linkedPostsFor(entry, seed) {
  const authored = objectivePosts[entry.key];
  const rows = authored || generatedRows(entry, seed);
  const byMetric = new Map(entry.measures.map((m) => [m.metricId, m]));
  return rows
    .map((row) => {
      const measure = byMetric.get(row.metricId) || entry.measures[0] || null;
      return {
        id: row.id,
        key: entry.key,
        network: row.network,
        networkLabel: NETWORK_LABEL[row.network] || row.network,
        networkIcon: NETWORK_ICON_BY_PLATFORM[row.network] || "ap-icon-web",
        daysAgo: row.daysAgo,
        date: shortDate(row.daysAgo),
        mediaType: row.mediaType || "text",
        image: row.image || null,
        excerpt: row.excerpt,
        metricId: measure?.metricId || row.metricId,
        metricLabel: measure?.metricLabel || metricLabel(row.metricId),
        measureId: measure?.id || null,
        contribution: contributionFor(row, measure),
      };
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

// ── Series — one dense curve per measure ──────────────────────────────────

function measureSeries(measure, entry, posts, seed) {
  const current = measure.current;
  if (current == null) return null;
  const target = measure.targetNum;
  const trendPct = measure.trend?.pct ?? 0;
  const isRate = measure.isRate;

  const start = trendPct <= -100 ? current : current / (1 + trendPct / 100);
  const n = WINDOW_DAYS;
  const span = Math.abs(current - start) || Math.abs(current) * 0.06 || 1;
  const amp = Math.min(isRate ? 0.25 : Infinity, span * 0.12);

  const values = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const line = start + (current - start) * smoothstep(t);
    const noise = NOISE[(i + seed) % NOISE.length] * amp * Math.sin(Math.PI * t);
    values[i] = line + noise;
  }

  // Post moments — a bump at the publish day, decaying over three days, scaled
  // by the share of the measure this post accounts for.
  const markers = [];
  const bumpBase = (Math.abs(current - start) || Math.abs(current) * 0.1) * 0.5;
  for (const post of posts) {
    if (post.metricId !== measure.metricId) continue;
    const p = n - 1 - post.daysAgo;
    if (p < 0 || p >= n) continue;
    const share = post.contribution?.share ?? post.share ?? 0;
    const bump = isRate ? 0.4 * share : bumpBase * share;
    for (let k = 0; k < BUMP_SHAPE.length; k += 1) {
      const at = p - BUMP_LEAD + k;
      if (at >= 0 && at < n) values[at] += bump * BUMP_SHAPE[k];
    }
    markers.push({ index: p, post });
  }
  // Re-normalise so the curve still lands exactly on the real current value.
  const drift = current - values[n - 1];
  for (let i = 0; i < n; i += 1) values[i] += drift * (i / (n - 1));
  values[n - 1] = current;

  const round = isRate ? (v) => Math.round(v * 10) / 10 : (v) => Math.round(v);
  const points = values.map((v, i) => [dayAgoMs(n - 1 - i), round(Math.max(0, v))]);

  // A fixed window extends the axis to its deadline — empty days the curve has
  // yet to fill, plus the straight pace line the reader should be on.
  let requiredPace = null;
  let clipped = false;
  const daysLeft = measure.window?.type === "fixed" ? daysUntil(measure.window.date) : null;
  if (daysLeft != null && daysLeft > 0) {
    const future = Math.min(daysLeft, MAX_FUTURE_DAYS);
    clipped = daysLeft > MAX_FUTURE_DAYS;
    for (let d = 1; d <= future; d += 1) points.push([dayAgoMs(-d), null]);
    if (target != null) requiredPace = [points[0][0], round(points[0][1]), dayAgoMs(-future), target];
  }

  const finite = points.map((p) => p[1]).filter((v) => v != null);
  const postMarkers = markers.map(({ index, post }) => ({
    ms: points[index][0],
    value: points[index][1],
    postId: post.id,
    excerpt: post.excerpt,
    network: post.network,
    networkLabel: post.networkLabel,
    date: post.date,
    contributionLabel: post.contribution.label,
  }));

  return {
    kind: daysLeft != null ? "fixed" : "rolling",
    unit: isRate ? "%" : "",
    points,
    target,
    requiredPace,
    clipped,
    start: round(start),
    current,
    min: Math.min(...finite, target ?? Infinity),
    max: Math.max(...finite, target ?? -Infinity),
    postMarkers,
  };
}

// ── Measures ──────────────────────────────────────────────────────────────

function enrichMeasure(m, proxy = false) {
  const current = parseMetricValue(m.baselineValue);
  const targetNum = parseMetricValue(m.target);
  const state = measureState(m);
  const isRate = isRateMetric(m.metricId);
  const progress = m.progressPct != null ? m.progressPct : null;
  return {
    ...m,
    proxy,
    isRate,
    current,
    targetNum,
    state,
    tier: progress != null && !isRate ? measureTier(progress) : MEASURE_STATE_TIER[state],
    progress,
    currentLabel: m.baselineValue,
    targetLabel: m.target,
    series: null,
  };
}

const MEASURE_STATE_RANK = { off: 0, soft: 1, on: 2 };

/** The measure deciding the verdict — worst state first, lowest progress inside it. */
export function weakestMeasure(entry) {
  const list = entry.measures || [];
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => MEASURE_STATE_RANK[a.state] - MEASURE_STATE_RANK[b.state] || (a.progress ?? 100) - (b.progress ?? 100),
  )[0];
}

// ── Entries ───────────────────────────────────────────────────────────────

function buildEntry(ctx, resolved) {
  const label = resolved.label;
  const key = `${ctx.id}::${label}`;
  const seed = hash32(key);
  const verdict = objectiveVerdict(resolved);
  const collecting = resolved.status === "collecting";
  const parked = resolved.status === "parked";
  const tier = collecting ? "collecting" : verdict.tier || "collecting";
  const rawMeasures = parked ? [resolved.proxy] : resolved.measures || [];
  const measures = rawMeasures.map((m) => enrichMeasure(m, parked));
  const daysLeft = resolved.window?.type === "fixed" ? daysUntil(resolved.window.date) : null;

  const entry = {
    key,
    ctxId: ctx.id,
    label,
    context: ctx,
    playbookName: ctx.name,
    brandName: ctx.brandName || ctx.name,
    resolved,
    verdict,
    tier,
    tierLabel: STATE_LABELS[tier] || "Pending",
    statusClass: STATE_CLASS[tier] || "grey",
    collecting,
    parked,
    soon: resolved.soon || null,
    grace: resolved.grace || null,
    origin: ctx.objectiveMeasures?.[label]?.origin === "user" ? "user" : "archie",
    window: {
      type: resolved.window?.type || "rolling",
      date: resolved.window?.date || null,
      label: windowPhrase(resolved.window),
      short: windowPhrase(resolved.window, { form: "short" }),
      daysLeft,
    },
    measures,
    headline: null,
    progress: 0,
    posts: [],
    nextMove: null,
    counts: null,
  };

  entry.posts = linkedPostsFor(entry, seed);

  measures.forEach((m, i) => {
    m.series = measureSeries(m, entry, entry.posts, seed + i * 13);
  });

  entry.headline = weakestMeasure(entry);
  entry.progress = entry.headline?.progress ?? 0;
  entry.nextMove = nextMoveFor(entry);
  entry.counts = {
    measures: measures.length,
    on: measures.filter((m) => m.state === "on").length,
    soft: measures.filter((m) => m.state === "soft").length,
    off: measures.filter((m) => m.state === "off").length,
    posts: entry.posts.length,
  };
  return entry;
}

/** One entry per objective of the active Playbook (or the given one), worst first. */
export function objectiveEntries(ctx = getActivePlaybook()) {
  if (!ctx) return [];
  const labels = Array.isArray(ctx.objective) ? ctx.objective : [];
  if (!labels.length) return [];
  const resolvedList = resolveObjectives(labels, ctx.id, ctx.objectiveMeasures);
  return sortEntries(
    resolvedList.map((r) => buildEntry(ctx, r)),
    "risk",
  );
}

export function entryByKey(key, entries = objectiveEntries()) {
  return entries.find((e) => e.key === key) || null;
}

export function sortEntries(entries, by = "risk") {
  const list = [...entries];
  if (by === "label") return list.sort((a, b) => a.label.localeCompare(b.label));
  if (by === "progress") return list.sort((a, b) => a.progress - b.progress);
  return list.sort((a, b) => (STATE_ORDER[a.tier] ?? 3) - (STATE_ORDER[b.tier] ?? 3) || a.progress - b.progress);
}

// ── The Playbook roll-up — counts, never a verdict word ───────────────────
//
// A Playbook has no verdict (GLOSSARY: "pas de verdict au niveau du Playbook").
// The hero prints how many objectives sit in each tier and their average
// progress; `worstTier` exists for ordering only and is never rendered.
export function playbookRollup(entries, ctx = getActivePlaybook()) {
  const measured = entries.filter((e) => e.tier !== "collecting");
  const progress = measured.length
    ? Math.round(measured.reduce((sum, e) => sum + e.progress, 0) / measured.length)
    : null;
  return {
    total: entries.length,
    onTrack: entries.filter((e) => e.tier === "on-track").length,
    atRisk: entries.filter((e) => e.tier === "at-risk").length,
    offTrack: entries.filter((e) => e.tier === "off-track").length,
    collecting: entries.filter((e) => e.tier === "collecting").length,
    parked: entries.filter((e) => e.parked).length,
    measured: measured.length,
    progress,
    worstTier: entries[0]?.tier || null,
    archie: entries.filter((e) => e.origin === "archie").length,
    user: entries.filter((e) => e.origin === "user").length,
    posts: entries.reduce((sum, e) => sum + e.posts.length, 0),
    brandName: ctx?.brandName || ctx?.name || "",
    playbookName: ctx?.name || "",
  };
}

/**
 * The one-line reading of an objective, from its headline measure:
 * "Reach is at 74% of target, down 8% over the window."
 */
export function readingFor(entry) {
  const m = entry.headline;
  if (!m) return entry.soon || "No measure yet.";
  // The day count is the score's job (scoreFigure prints "4/7 days collected"),
  // so the sentence says what is being waited for instead of repeating it.
  if (entry.collecting) {
    const metric = m?.metricLabel ? m.metricLabel.toLowerCase() : "its measures";
    return `No verdict yet — ${metric} is still filling its first window.`;
  }
  const trend = m.trend || {};
  const move =
    trend.dir === "up"
      ? `up ${Math.abs(Math.round(trend.pct))}%`
      : trend.dir === "down"
        ? `down ${Math.abs(Math.round(trend.pct))}%`
        : "flat";
  const is = /(?:s|shares)$/i.test(m.metricLabel) && !/rate|score|time/i.test(m.metricLabel) ? "are" : "is";
  if (m.isRate) {
    const rel = m.current != null && m.targetNum != null && m.current >= m.targetNum ? "holding above" : "below";
    return `${m.metricLabel} ${is} ${rel} its ${m.targetLabel} target, ${move} over the window.`;
  }
  if (m.progress == null) return `${m.metricLabel} ${is} at ${m.currentLabel}, ${move} over the window.`;
  return `${m.metricLabel} ${is} at ${m.progress}% of target, ${move} over the window.`;
}
