// Objective → measure coupling. An objective is a qualitative intent — a label,
// not measurable by itself; what is measurable is the MEASURE it carries:
// a metric from the native catalogue + a SCOPE (all networks, one network, or
// specific profiles of one network) + a baseline + a target + a window (the
// PP's full contract). The same metric may appear twice with two scopes —
// Reach on LinkedIn and Reach on Instagram are two measures — so a measure's
// identity is its own id, not its metric. Everything here is DERIVED at render
// time: ctx.objective stays a string[] and the objective's identity is its
// label, exactly like objective-alerts-store.
//
// The stored corrections — `data.objectiveMeasures[label]`:
//   { measures?: [ { id, metricId, scope?: { network, profileIds? },
//                    baseline?, target?, window? } ],   // materialized list
//     proxy?:   { metricId, baseline?, target? },       // parked objective
//     window?:  { type: 'rolling' | 'fixed', date? },   // objective window
//     grace?:   { day, of },                            // collecting period
//     origin?:  "user" }                                // vs proposed-by-Archie
// An absent `measures` means the coupling's defaults. The list materializes on
// the first structural correction; per-entry fields stay sparse. (Older drafts
// stored per-metric maps — metricIds/baselines/targets/measureWindows — and
// are normalized on read.)
//
// The generator contract (PP "Objectives in Archie"): an intent that binds to a
// catalogue metric is measurable; a real intent that binds to nothing is PARKED
// — shown "coming soon" with an avowed social proxy — never dropped.
//
// Alignment note (platform prototype/sc-203354-report-studio-objective-widget):
// target + targetProposed ("Suggested") and proposeTarget = baseline × 1.15
// come from that prototype, as does the window model (ROLLING | FIXED) and the
// objective verdict — a COUNT over its measures, never a weighted score.
// Identity still diverges on purpose: platform keys objectives by id, Archie
// by label — flagged in the PP handoff, not resolved here.
//
// NOTE (reconciled in Insights): OBJECTIVE_METRICS in mocks.js measures "Lead
// generation" and "Sales" through their PROXY (CTA clicks / attributed revenue)
// on the Insights side, while this catalogue parks them. Insights marks those
// cards "via proxy" by resolving the label here — one story, two surfaces.

import { NETWORK_LABEL, getConnectedProfiles } from "./social-profiles.js?v=1159";
import { getContextById } from "./contexts-store.js?v=1159";

// The connected profiles are GLOBAL (one demo account), but an objective
// belongs to a brand — a Noba Fashion objective read on tiles named
// "Northwind Studio" broke every demo. The tile carries the Playbook's own
// brand name; the global profile still supplies id and network.
function profileNameFor(p, contextId) {
  const ctx = contextId ? getContextById(contextId) : null;
  return ctx?.brandName || ctx?.name || p.name || p.handle;
}

// The metric catalogue. Each metric names a concept, not a per-network field.
// `type` — volume | rate | counter. A rate is scale-free (never split by
// profile count, target reads "hold above X"); a counter truly ADDS UP across
// networks, and `additive` (exactly the counters) is the ONLY thing that
// unlocks an "All networks" scope at creation — two networks rarely compute a
// volume the same way. Seeded coupling defaults keep their historical
// all-networks read regardless (documented compromise: the lock applies to
// what the user CREATES, not to what the crawl proposed). `lowerIsBetter`
// suppresses the progress gauge. `available: false` = real metric the
// platform can't serve yet: listed greyed "coming soon" with its proxy.
const METRICS = {
  reach: { label: "Reach", type: "volume" },
  impressions: { label: "Impressions", type: "volume" },
  mentions: { label: "Brand mentions", type: "counter", additive: true },
  followersNet: { label: "Followers net growth", type: "counter", additive: true, growth: true },
  engagementRate: { label: "Engagement rate", type: "rate" },
  comments: { label: "Comments received", type: "counter", additive: true },
  savesShares: { label: "Saves & shares", type: "counter", additive: true },
  videoViews: { label: "Video views", type: "volume" },
  videoCompletion: { label: "Completion rate", type: "rate" },
  sentiment: { label: "Sentiment score", type: "rate" },
  responseTime: { label: "Response time", type: "rate", lowerIsBetter: true },
  reviews: { label: "Reviews handled", type: "counter", additive: true },
  clicks: { label: "Link clicks", type: "counter", additive: true },
  paidReach: { label: "Paid reach", type: "volume" },
  profileVisits: { label: "Profile visits", type: "volume" },
  demoSignups: { label: "Demo sign-ups", type: "counter", additive: true },
  // Real metrics the platform can't serve yet — listed in the catalogue,
  // greyed "coming soon", each with the proxy Archie would use meanwhile.
  // Same rule for Archie and for the user: only catalogue metrics couple.
  attributedRevenue: { label: "Attributed revenue", type: "volume", available: false, proxyId: "clicks" },
  attributedSignups: { label: "Attributed sign-ups", type: "counter", available: false, proxyId: "clicks" },
};

function isRate(metricId) {
  return METRICS[metricId]?.type === "rate";
}

export function isRateMetric(metricId) {
  return isRate(metricId);
}

export function isAdditiveMetric(metricId) {
  return !!METRICS[metricId]?.additive;
}

export function metricType(metricId) {
  return METRICS[metricId]?.type || "volume";
}

// The same value, written the way a label is written. The type used to be
// shouted (`.toUpperCase()`) at three call sites; sentence case leaves it a
// fragment sitting next to capitalised neighbours, so it gets capitalised once
// here rather than three times at the point of render.
export function metricTypeLabel(metricId) {
  const t = metricType(metricId);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// The 8 catalogue families, for the measure picker and the catalog panel —
// every metric above appears in exactly one family.
// `icon` is the family's mark in the catalogue — every name checked against
// `ds/ap-icons.css`, because an `ap-icon-*` that doesn't exist paints NOTHING
// and fails silently (there is no `ap-icon-eye`: the pair is `eye-on`/`eye-off`).
export const FAMILIES = [
  {
    id: "awareness",
    label: "Awareness",
    icon: "ap-icon-megaphone",
    metricIds: ["reach", "impressions", "mentions", "profileVisits"],
  },
  { id: "growth", label: "Audience growth", icon: "ap-icon-multiple-users", metricIds: ["followersNet"] },
  {
    id: "engagement",
    label: "Engagement",
    icon: "ap-icon-heart",
    metricIds: ["engagementRate", "comments", "savesShares"],
  },
  { id: "video", label: "Video", icon: "ap-icon-video", metricIds: ["videoViews", "videoCompletion"] },
  { id: "care", label: "Reputation & care", icon: "ap-icon-star", metricIds: ["sentiment", "responseTime", "reviews"] },
  { id: "traffic", label: "Traffic", icon: "ap-icon-link", metricIds: ["clicks"] },
  { id: "paid", label: "Paid", icon: "ap-icon-dollar-sign", metricIds: ["paidReach"] },
  {
    id: "conversion",
    label: "Conversion",
    icon: "ap-icon-target",
    metricIds: ["demoSignups", "attributedRevenue", "attributedSignups"],
  },
];

// The objective's window — platform's two kinds, exactly: ROLLING (reads on
// the trailing 30 days, no end) or FIXED (ends on a date). Default: rolling.
// Defined on the objective, inherited by its measures, deviable per measure.
export const WINDOWS = [
  { id: "rolling", label: "Rolling 30-day window" },
  { id: "fixed", label: "Ends on a date" },
];

export const DEFAULT_WINDOW = { type: "rolling" };

function normalizeWindow(window) {
  if (!window) return { ...DEFAULT_WINDOW };
  if (window.type === "fixed" || window.type === "deadline") return { type: "fixed", date: window.date };
  return { type: "rolling" };
}

// Rolling is the default and reads as no caption — only a FIXED window earns
// a line on the cards and the Insights headers.
export function windowLabel(window) {
  const w = normalizeWindow(window);
  if (w.type === "fixed") return w.date ? `Ends on ${formatDay(w.date)}` : "Ends on a date";
  return "";
}

// The window as a phrase — long form for detail surfaces ("rolling 30-day
// window" / "fixed · ends Dec 31"), short for cards ("rolling 30d").
export function windowPhrase(window, { form = "long" } = {}) {
  const w = normalizeWindow(window);
  if (w.type === "fixed") {
    const day = w.date ? formatDay(w.date) : "a date";
    return form === "short" ? `ends ${day}` : `fixed · ends ${day}`;
  }
  return form === "short" ? "rolling 30d" : "rolling 30-day window";
}

function formatDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Where the suggested baseline comes from — tooltip copy, never an inline
// mention: the row shows the figure, the provenance is one hover away.
export function baselineHint(metricId) {
  return METRICS[metricId]?.growth
    ? "Suggested from your previous 30 days"
    : "Suggested from your trailing 30-day average";
}

// Pre-formatted baseline VALUES — a prototype shows, it never measures. Figures
// rhyme with the measured cards in mocks.js (OBJECTIVE_METRICS)
// wherever both exist: reach 18,400, clicks 126, followers +1,240, rate 4.1%.
const DEFAULT_BASELINES = {
  reach: "18,400",
  impressions: "84,200",
  mentions: "48",
  followersNet: "+1,240",
  engagementRate: "4.1%",
  comments: "312",
  savesShares: "190",
  videoViews: "5,600",
  videoCompletion: "38%",
  sentiment: "76",
  responseTime: "1h 42m",
  reviews: "23",
  clicks: "126",
  paidReach: "9,800",
  profileVisits: "260",
  demoSignups: "31",
};

// Proposed targets for the ALL-NETWORKS scope, pre-formatted, rhyming with
// mocks.js `goal` where a card exists (reach 20,000, clicks 150, followers
// +1,500, rate 5.0%). Scoped measures propose their target from the scoped
// baseline instead — baseline × 1.15, the platform prototype's rule. A target
// stays PROPOSED ("Suggested") until the user edits it.
const DEFAULT_TARGETS = {
  reach: "20,000",
  impressions: "95,000",
  mentions: "60",
  followersNet: "+1,500",
  engagementRate: "5.0%",
  comments: "380",
  savesShares: "240",
  videoViews: "7,000",
  videoCompletion: "45%",
  sentiment: "82",
  responseTime: "1h 15m",
  reviews: "30",
  clicks: "150",
  paidReach: "12,000",
  profileVisits: "400",
  demoSignups: "40",
};

// Per-Playbook targets layered over the defaults — Noba's Sales proxy reads
// 126 / 300 (42% of target), the design's own worked example.
const TARGETS_BY_CONTEXT = {
  "ctx-noba": { clicks: "300" },
};

// Per-Playbook baseline values layered over the defaults, keyed by context id
// then metric — hand-derived from OBJECTIVE_METRICS_BY_CONTEXT so the same
// brand tells the same story on every surface (Acme's reach slides on purpose).
const BASELINES_BY_CONTEXT = {
  "ctx-acme": { reach: "14,800" },
  "ctx-founder-voice": { reach: "12,800" },
  "ctx-customer": { reach: "10,400", clicks: "107" },
  "ctx-dwelling": { reach: "17,600" },
  "ctx-noba": { clicks: "126" },
};

// A concept metric read on ONE network — the baseline a network-scoped measure
// opens with. Plain values, keyed by the platform slugs social-profiles.js
// uses. Rows sum to the concept baseline where summing makes sense; rates and
// scores deliberately don't (two networks rarely compute one concept the same
// way). A connected network missing from a split falls back to a documented
// derivation rather than a hole.
const NETWORK_BASELINES = {
  reach: { linkedin: "9,400", instagram: "6,200", x: "2,800" },
  impressions: { linkedin: "41,300", instagram: "28,600", x: "14,300" },
  mentions: { x: "21", instagram: "15", linkedin: "12" },
  followersNet: { instagram: "+640", linkedin: "+430", x: "+170" },
  engagementRate: { instagram: "5.2%", linkedin: "3.4%", x: "2.1%" },
  comments: { instagram: "168", linkedin: "96", x: "48" },
  savesShares: { instagram: "124", linkedin: "66" },
  videoViews: { instagram: "3,400", youtube: "1,700", x: "500" },
  videoCompletion: { youtube: "41%", instagram: "35%" },
  sentiment: { linkedin: "80", instagram: "79", x: "71" },
  responseTime: { instagram: "1h 18m", x: "2h 05m" },
  reviews: { facebook: "17", instagram: "6" },
  clicks: { linkedin: "64", instagram: "38", x: "24" },
  paidReach: { instagram: "5,600", facebook: "4,200" },
};

// Per-Playbook splits, consistent with each brand's network mix (Acme
// publishes LinkedIn 71 / X 21 / Instagram 8) and with BASELINES_BY_CONTEXT
// (the Acme rows sum to its sliding 14,800 reach).
const NETWORK_BASELINES_BY_CONTEXT = {
  "ctx-acme": { reach: { linkedin: "10,500", x: "3,100", instagram: "1,200" } },
  "ctx-founder-voice": { reach: { linkedin: "9,900", x: "2,900" } },
  "ctx-customer": {
    reach: { linkedin: "6,000", instagram: "3,000", x: "1,400" },
    clicks: { linkedin: "55", instagram: "32", x: "20" },
  },
  "ctx-dwelling": { reach: { instagram: "10,900", facebook: "4,200", x: "2,500" } },
};

// Measurable couplings — category → metric(s), from "Metrics & couplings".
// Keys are the canonical labels the crawl and the seeds emit.
const COUPLINGS = {
  "Brand awareness": ["reach", "mentions"],
  "Build personal brand": ["followersNet", "engagementRate"],
  "Community building": ["engagementRate", "comments"],
  "Community engagement": ["engagementRate", "comments"],
  "Thought leadership": ["followersNet", "engagementRate"],
  "Editorial resonance": ["savesShares"],
  "Video performance": ["videoViews", "videoCompletion"],
  Reputation: ["sentiment"],
  "Brand reputation": ["sentiment"],
  "Customer care": ["responseTime", "reviews"],
  "Customer retention": ["responseTime", "sentiment"],
  Traffic: ["clicks"],
  "Drive traffic": ["clicks"],
  "Paid performance": ["paidReach"],
};

// Real intents the catalogue can't measure natively — parked, never dropped.
// `soon` says what unlocks the real measure; `proxy` is the avowed stand-in.
const PARKED = {
  "Lead generation": {
    soon: "On-site sign-ups need a Google Analytics connection.",
    proxy: "clicks",
  },
  Sales: {
    soon: "Attributed revenue needs a Google Analytics connection.",
    proxy: "clicks",
  },
  "Product adoption": {
    soon: "Product usage needs a product analytics connection.",
    proxy: "clicks",
  },
  "App downloads": {
    soon: "Store analytics are not connected yet.",
    proxy: "clicks",
  },
  "Net Promoter Score": {
    soon: "NPS needs a survey connection.",
    proxy: "sentiment",
  },
};

// A custom label typed in edit mode resolves by: exact COUPLINGS → exact PARKED
// (both case-insensitive) → first alias match → generic parked. An unknown
// intent is a real intent: it is kept, coming soon, with Engagement rate as
// the proxy. `\breach\b` keeps "Community Reached" out of Brand awareness
// ("Reached" fails the word boundary) so it falls through to Community
// building; "Grow reach" still matches.
const ALIASES = [
  [/awareness|\breach\b|impression|visib|notorie/i, "Brand awareness"],
  [/personal brand|thought leader|authority|follower/i, "Build personal brand"],
  [/communit|engag/i, "Community building"],
  [/video|watch|youtube|reel|tiktok/i, "Video performance"],
  [/net promoter|\bnps\b/i, "Net Promoter Score"],
  [/reputation|sentiment|brand health/i, "Reputation"],
  [/\bcare\b|support|response time|retention/i, "Customer care"],
  [/traffic|click|visit/i, "Traffic"],
  [/\bpaid\b|\bads?\b|campaign/i, "Paid performance"],
  [/\bsaves?\b|\bshares?\b|resonance/i, "Editorial resonance"],
  [/lead|sign.?up|conversion|demo|newsletter/i, "Lead generation"],
  [/\bsales?\b|revenue|sell|purchase/i, "Sales"],
  [/download|install|subscri|adoption/i, "Product adoption"],
];

const GENERIC_PARKED = {
  soon: "Not in the native metric catalog yet.",
  proxy: "engagementRate",
};

function findKeyInsensitive(map, label) {
  const needle = label.trim().toLowerCase();
  return Object.keys(map).find((k) => k.toLowerCase() === needle);
}

export function metricLabel(metricId) {
  return METRICS[metricId]?.label || metricId;
}

export function baselineFor(metricId, contextId) {
  const perContext = BASELINES_BY_CONTEXT[contextId] || {};
  return perContext[metricId] || DEFAULT_BASELINES[metricId];
}

// ── Parsing & formatting — the gauge's one computation ─────────────────────
// "14,800" → 14800, "4.1%" → 4.1, "+1,240" → 1240, "€8,900" → 8900,
// "1h 42m" → null. An edited target has to move the bar and a scoped baseline
// has to derive from its network's, so the bounds are parsed rather than
// authored as percents.
export function parseMetricValue(str) {
  if (typeof str !== "string") return null;
  const cleaned = str.replace(/[€$,+\s]/g, "").replace(/%$/, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// Format a derived number the way its source string was formatted.
export function formatLike(sourceStr, num) {
  if (num == null || Number.isNaN(num)) return null;
  const pct = /%$/.test(sourceStr || "");
  const signed = /^\+/.test(sourceStr || "");
  if (pct) return `${Math.round(num * 10) / 10}%`;
  const grouped = Math.round(num).toLocaleString("en-US");
  return signed ? `+${grouped}` : grouped;
}

// baseline × 1.15, rounded to a clean figure — the platform prototype's
// proposeTarget, applied to scoped measures (the all-networks targets are
// authored in DEFAULT_TARGETS).
function proposeTarget(baselineStr) {
  const value = parseMetricValue(baselineStr);
  if (value == null) return null;
  const raised = value * 1.15;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(raised)) - 1);
  return formatLike(baselineStr, Math.round(raised / magnitude) * magnitude);
}

function progressPctFor(metricId, baselineValue, target) {
  if (METRICS[metricId]?.lowerIsBetter) return null;
  const current = parseMetricValue(baselineValue);
  const goal = parseMetricValue(target);
  if (current == null || goal == null || goal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
}

// ── Scope ────────────────────────────────────────────────────────────────────
// scope = undefined (all networks) | { network } | { network, profileIds }.

export function scopeLabel(scope) {
  if (!scope?.network) return "";
  const network = NETWORK_LABEL[scope.network] || scope.network;
  const n = scope.profileIds?.length || 0;
  return n ? `${n} ${network} ${n > 1 ? "profiles" : "profile"}` : network;
}

// The baseline a scoped measure opens with. One network → its authored split
// value (a connected network missing from the split derives a quarter of the
// all-networks value — documented mock shortcut, not data). A profile subset
// → the network value split evenly across that network's profiles (rates and
// times don't split: a rate is scale-free).
function networkProfileCount(network) {
  return getConnectedProfiles().filter((p) => p.platform === network).length;
}

function scopedBaseline(metricId, contextId, scope) {
  if (!scope?.network) return baselineFor(metricId, contextId);
  const perContext = (NETWORK_BASELINES_BY_CONTEXT[contextId] || {})[metricId] || {};
  const split = NETWORK_BASELINES[metricId] || {};
  let networkValue = perContext[scope.network] || split[scope.network];
  if (!networkValue) {
    const all = baselineFor(metricId, contextId);
    networkValue = isRate(metricId) ? all : formatLike(all, (parseMetricValue(all) || 0) * 0.25) || all;
  }
  const picked = scope.profileIds?.length || 0;
  if (!picked || isRate(metricId)) return networkValue;
  const total = Math.max(picked, networkProfileCount(scope.network) || picked);
  const share = (parseMetricValue(networkValue) || 0) * (picked / total);
  return formatLike(networkValue, share) || networkValue;
}

// ── Pace & trend — the measure's two verdicts ───────────────────────────────
// Pace: the projection toward the target, derived from progress (the floors
// are the same 80/60 the tiers use). Rates have no pace — they hold a bar:
// holding (current ≥ target) or below. Trend: the direction over the window —
// mocked per metric, overridden per Playbook so the same brand tells the same
// story everywhere (rhymes with OBJECTIVE_METRICS.variationPercent).
const TRENDS = {
  reach: 12,
  impressions: 6,
  mentions: 0,
  followersNet: 6,
  engagementRate: 0,
  comments: 4,
  savesShares: 5,
  videoViews: 7,
  videoCompletion: 2,
  sentiment: 1,
  responseTime: 0,
  reviews: 3,
  clicks: 8,
  paidReach: 4,
  profileVisits: 5,
  demoSignups: 9,
};

const TRENDS_BY_CONTEXT = {
  "ctx-acme": { reach: -8 },
  "ctx-customer": { reach: -9, clicks: -6, mentions: -2 },
  "ctx-noba": { clicks: -11 },
  "ctx-founder-voice": { reach: 3 },
};

export function trendFor(metricId, contextId) {
  const pct = (TRENDS_BY_CONTEXT[contextId] || {})[metricId] ?? TRENDS[metricId] ?? 0;
  const dir = pct > 1 ? "up" : pct < -1 ? "down" : "flat";
  const label = dir === "up" ? "Up" : dir === "down" ? "Down" : "Flat";
  const tone = dir === "up" ? "green" : dir === "down" ? "red" : "yellow";
  return { dir, pct, label, tone };
}

export function paceFor(measure) {
  if (isRate(measure.metricId)) {
    const current = parseMetricValue(measure.baselineValue);
    const goal = parseMetricValue(measure.target);
    const holding = current != null && goal != null && current >= goal;
    return holding
      ? { id: "holding", label: "Holding", tone: "green" }
      : { id: "below", label: "Below", tone: "yellow" };
  }
  const pct = measure.progressPct;
  if (pct == null) return null;
  if (pct >= MEASURE_TIER_FLOORS.onTrack)
    return { id: "ahead", label: pct >= 100 ? "Ahead" : "On pace", tone: "green" };
  if (pct >= MEASURE_TIER_FLOORS.atRisk) return { id: "on-pace", label: "On pace", tone: "green" };
  return { id: "behind", label: "Behind", tone: "red" };
}

// One measure's contribution to the objective's counted verdict:
//   on   — nothing to worry about
//   soft — pace holds but the trend argues (or a rate sits below, still moving)
//   off  — behind, or below and sinking
export function measureState(measure) {
  const pace = measure.pace || paceFor(measure);
  const trend = measure.trend || trendFor(measure.metricId, null);
  if (!pace) return "on";
  if (isRate(measure.metricId)) {
    if (pace.id === "below") return trend.dir === "down" ? "off" : "soft";
    return trend.dir === "down" ? "soft" : "on";
  }
  if (pace.id === "behind") return "off";
  return trend.dir === "down" ? "soft" : "on";
}

// The configurator (catalog panel) reads these two directly: the baseline a
// scope would open with, and the target Archie would suggest for it.
export function scopedBaselineFor(metricId, contextId, scope) {
  return scopedBaseline(metricId, contextId, scope?.network ? scope : undefined);
}

export function proposeTargetFrom(metricId, baseline, contextId, scope) {
  if (scope?.network) return proposeTarget(baseline);
  return (TARGETS_BY_CONTEXT[contextId] || {})[metricId] || DEFAULT_TARGETS[metricId] || proposeTarget(baseline);
}

// ── Resolution ───────────────────────────────────────────────────────────────

// One measure entry — { id, metricId, scope?, baseline?, target?, window? } —
// resolved against its objective's window and the Playbook's mock figures.
function resolveMeasureEntry(entry, contextId, objectiveWindow) {
  const metricId = entry.metricId;
  const scope = entry.scope?.network ? entry.scope : undefined;
  const window = entry.window
    ? { ...normalizeWindow(entry.window), inherited: false }
    : { ...normalizeWindow(objectiveWindow), inherited: true };
  const suggested = scopedBaseline(metricId, contextId, scope);
  const baselineValue = entry.baseline ?? suggested;
  const perContextTarget = (TARGETS_BY_CONTEXT[contextId] || {})[metricId];
  const target = entry.target ?? (scope ? proposeTarget(suggested) : perContextTarget || DEFAULT_TARGETS[metricId]);
  const resolved = {
    id: entry.id || metricId,
    metricId,
    metricType: METRICS[metricId]?.type || "volume",
    metricLabel: metricLabel(metricId),
    scope,
    scopeLabel: scopeLabel(scope),
    baselineValue,
    baselineHint: baselineHint(metricId),
    target,
    targetProposed: entry.target == null,
    progressPct: progressPctFor(metricId, baselineValue, target),
    window,
  };
  resolved.pace = paceFor(resolved);
  resolved.trend = trendFor(metricId, contextId);
  return resolved;
}

// Older drafts stored per-metric maps; fold them into entry form on read.
function entriesFrom(override, defaultIds) {
  if (Array.isArray(override?.measures)) return override.measures;
  const ids = override?.metricIds?.length ? override.metricIds.filter((id) => METRICS[id]) : defaultIds;
  return ids.map((metricId) => ({
    id: metricId,
    metricId,
    baseline: override?.baselines?.[metricId],
    target: override?.targets?.[metricId],
    window: override?.measureWindows?.[metricId],
  }));
}

// The editor materializes the override's measure list on the first structural
// correction (duplicates make the list positional) — from the stored entries
// when present, else the coupling's defaults as fresh sparse entries.
export function materializeMeasureEntries(label, override) {
  const canonical = findKeyInsensitive(COUPLINGS, label) || (ALIASES.find(([re]) => re.test(label)) || [])[1];
  if (!canonical || !COUPLINGS[canonical]) return [];
  return entriesFrom(override, COUPLINGS[canonical]).map((e) => ({ ...e, id: e.id || e.metricId }));
}

// The grace period — X days of data before ANY verdict. A session-created
// objective starts at day 1 of 7 (override.grace, posed by objective-modal);
// the one SEEDED example is the design's own:
const GRACE_SEED = {
  "ctx-founder-voice::Thought leadership": { day: 4, of: 7 },
};

function resolveOne(label, contextId, override) {
  const canonical =
    findKeyInsensitive(COUPLINGS, label) ||
    findKeyInsensitive(PARKED, label) ||
    (ALIASES.find(([re]) => re.test(label)) || [])[1];
  const window = normalizeWindow(override?.window);
  const base = { label, window, windowLabel: windowLabel(window) };
  const grace = override?.grace || GRACE_SEED[`${contextId}::${label}`];
  if (canonical && COUPLINGS[canonical]) {
    const entries = entriesFrom(override, COUPLINGS[canonical]);
    const measures = entries.map((e) => resolveMeasureEntry(e, contextId, window));
    // Collecting: the objective exists and its measures resolve (the editor
    // still needs them), but it carries NO verdict until the grace runs out.
    if (grace) return { ...base, status: "collecting", grace, measures };
    return {
      ...base,
      status: "measured",
      measures,
    };
  }
  const parked = (canonical && PARKED[canonical]) || GENERIC_PARKED;
  const proxyEntry = override?.proxy?.metricId && METRICS[override.proxy.metricId] ? override.proxy : null;
  const entry = proxyEntry || {
    metricId: override?.proxyId && METRICS[override.proxyId] ? override.proxyId : parked.proxy,
  };
  return {
    ...base,
    status: "parked",
    soon: parked.soon,
    proxy: resolveMeasureEntry({ ...entry, id: "proxy" }, contextId, window),
  };
}

/** The one entry point: each objective label, resolved to a coupled object —
 *  measured (per measure: metric, scope, baseline, target [proposed until
 *  edited], window [objective's unless deviated], progress %) or parked
 *  (coming soon + avowed proxy, same measure shape). `contextId` may be
 *  undefined (onboarding draft). `overrides` is the user's corrections map
 *  (`data.objectiveMeasures`), keyed by label. */
export function resolveObjectives(labels, contextId, overrides = {}) {
  const list = Array.isArray(labels) ? labels.filter(Boolean) : [];
  const map = overrides && typeof overrides === "object" ? overrides : {};
  return list.map((label) => resolveOne(label, contextId, map[label]));
}

// ── The objective's verdict — a COUNT over its measures, never a score ──────
// The PP's own definition ("2 of 3 measures on track"), platform-aligned, and
// deliberately NOT the handoff's weighted roll-up ("Reach counts ×2") — the
// weights died with the counted-verdict decision. Each measure contributes
// on | soft | off (pace + trend, see measureState): all on → On track, no on
// and at least one off → Off track, anything else → At risk. An objective in
// grace ("collecting") carries no verdict at all. Derived on every render,
// never stored.
export const MEASURE_TIER_FLOORS = { atRisk: 60, onTrack: 80 };

export function measureTier(progressPct) {
  if (progressPct == null) return null;
  if (progressPct >= MEASURE_TIER_FLOORS.onTrack) return "on-track";
  if (progressPct >= MEASURE_TIER_FLOORS.atRisk) return "at-risk";
  return "off-track";
}

const VERDICT_LABELS = { "on-track": "On track", "at-risk": "At risk", "off-track": "Off track" };

export function objectiveVerdict(resolved) {
  if (resolved.status === "collecting") {
    return {
      onTrack: 0,
      total: 0,
      tier: null,
      label: null,
      phrase: `Collecting data · day ${resolved.grace.day} of ${resolved.grace.of}`,
    };
  }
  const measures = resolved.status === "measured" ? resolved.measures : [resolved.proxy];
  const states = measures.filter((m) => m.progressPct != null || isRate(m.metricId)).map((m) => measureState(m));
  const total = states.length;
  const onTrack = states.filter((st) => st === "on").length;
  const hasOff = states.some((st) => st === "off");
  const tier = total === 0 ? null : onTrack === total ? "on-track" : onTrack === 0 && hasOff ? "off-track" : "at-risk";
  return {
    onTrack,
    total,
    tier,
    label: tier ? VERDICT_LABELS[tier] : null,
    phrase: total ? `${onTrack} of ${total} measure${total > 1 ? "s" : ""} on track` : null,
  };
}

// ── The catalogue, shaped for the catalog panel (screen 2c) ─────────────────
export function catalogEntries() {
  return FAMILIES.map((f) => ({
    familyId: f.id,
    familyLabel: f.label,
    familyIcon: f.icon,
    metrics: f.metricIds.map((id) => {
      const m = METRICS[id];
      return {
        id,
        label: m.label,
        type: m.type,
        additive: !!m.additive,
        available: m.available !== false,
        proxyId: m.proxyId || null,
        proxyLabel: m.proxyId ? METRICS[m.proxyId].label : null,
      };
    }),
  }));
}
