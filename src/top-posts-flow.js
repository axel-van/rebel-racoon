// Published-posts repurposing conversational flow orchestrator.
//
// Launched from the "Use top performing posts" new-chat starter card
// (session.js starter click delegation → startTopPostsFlow). Runs inline in
// the current session's assistant panel so it reads as one continuous
// conversation.
//
// Arc (mirrors the product spec "select one or more posts → adapt to each
// connected network → schedule"):
//   1. startTopPostsFlow  — surface the user's winners (board screen). The user
//                           filters/sorts, then selects one or more via the
//                           per-card checkbox + bulk bar (or the per-card
//                           "Repurpose" shortcut for a single winner).
//   2. echoRepurposePicks — echo the picked post(s). session.js then drives the
//                           profile quick-picker (inline-question), the same
//                           numbered Quickpicker the draft flow uses; the data
//                           helper here (repurposeProfileItems) feeds it. The
//                           profile step is a single per-profile version stepper
//                           listing every connected profile — source-network
//                           profiles lead, tagged "· Source" and pre-set to 1
//                           version.
//   3. executeRepurpose   — thinking chip → one adapted draft per
//                           post × target profile × version → post a result turn.

import {
  postAssistantMessage,
  startPending,
  finishPending,
  postDraftResult,
  postTopPostPickTurn,
  postTopPostsWidget,
  postUserTurn,
  postUserProfilesTurn,
} from "./assistant.js?v=69";
import { getTopPosts, getTopPost } from "./top-posts-store.js?v=20";
import { addPostDraft } from "./posts-store.js?v=45";
import { addReadySource } from "./sources-stream.js?v=62";
import {
  getConnectedProfiles,
  BRAND_INITIALS,
  NETWORK_ICON_BY_PLATFORM,
  PROFILE_SEARCH_THRESHOLD,
} from "./social-profiles.js?v=37";
import { SORTS, PERIODS } from "./components/top-post-card.js?v=78";
import { showToast } from "./components/toast.js?v=20";
import * as inlineQuestion from "./inline-question.js?v=48";
import { getDefaultContext } from "./contexts-store.js?v=48";

// Cap on drafts produced in one run — post × angle × channel can multiply fast
// (e.g. 3 posts × 4 angles × 3 channels = 36). Keep the result turn scannable;
// the title flags when the set was clipped.
const MAX_DRAFTS = 10;

// Simulated "generating" delay — matches draft-flow's chip duration so the
// milker feels like the rest of the studio.
const GEN_DELAY_MS = 6000;

// Simulated "loading this profile's top posts" beat between the profile chooser
// (step 1) and the winner board.
const PROFILE_LOAD_MS = 1800;

const CHANNEL_META = {
  linkedin: { icon: "ap-icon-linkedin-official", label: "LinkedIn" },
  x: { icon: "ap-icon-twitter-official", label: "X" },
  twitter: { icon: "ap-icon-twitter-official", label: "X" },
  instagram: { icon: "ap-icon-instagram-official", label: "Instagram" },
  facebook: { icon: "ap-icon-facebook-official", label: "Facebook" },
  tiktok: { icon: "ap-icon-tiktok-official", label: "TikTok" },
  youtube: { icon: "ap-icon-youtube-official", label: "YouTube" },
};

function labelFor(network) {
  return CHANNEL_META[(network || "").toLowerCase()]?.label || network;
}

// Shared chip lifecycle (mirrors draft-flow.withPendingChip): show the thinking
// chip, wait out the simulated delay, clear it, run `work` inside try/catch so a
// downstream failure still clears the chip and offers a Retry.
function withPendingChip(sessionId, work, onError, meta = "Generating drafts") {
  const pendingId = startPending(sessionId, meta);
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    try {
      work();
    } catch (err) {
      onError(err);
    }
  }, GEN_DELAY_MS);
}

function genError(err, retry) {
  // eslint-disable-next-line no-console
  console.error("top-posts-flow: draft generation failed", err);
  showToast("Couldn't create those drafts. Try again?", {
    variant: "error",
    duration: 6000,
    action: { label: "Retry", onClick: retry },
  });
}

// The base body a winner is repurposed from — its own published copy. Repurposing
// keeps the post's message intact and adapts it per target network (below); it no
// longer re-angles the content. Run through adaptForNetwork per target channel.
function plainCopy(post) {
  return [post.excerpt];
}

// Adapt a base body to a target network's format + character constraints — the
// spec's "adapt the output to each connected network". Light, deterministic
// transforms (this is a prototype): X/Threads compress to a single punchy
// sub-280-char take; the long-form networks keep the full paragraph body.
function adaptForNetwork(textArr, network) {
  const net = (network || "").toLowerCase();
  const paras = Array.isArray(textArr) ? textArr : [textArr];
  if (net === "x" || net === "twitter") {
    // Grow from the hook, adding whole paragraphs while they fit, then clip on a
    // word boundary so the tweet never cuts mid-word.
    let out = (paras[0] || "").trim();
    for (let i = 1; i < paras.length; i += 1) {
      const next = `${out} ${paras[i].trim()}`;
      if (next.length <= 270) out = next;
      else break;
    }
    if (out.length > 280) out = `${out.slice(0, 269).replace(/\s+\S*$/, "")}…`;
    return [out];
  }
  // LinkedIn / Facebook / Instagram keep the full body (Instagram's hashtags are
  // trimmed by adaptHashtags, not here).
  return paras;
}

// Trim the source post's hashtags to what each network wears well — X stays
// terse (≤2), everyone else keeps the set.
function adaptHashtags(tags, network) {
  const net = (network || "").toLowerCase();
  const list = tags || [];
  if (net === "x" || net === "twitter") return list.slice(0, 2);
  return list;
}

// First sentence of a blob, used by the source label + the X adapter.
function firstSentence(text) {
  const m = (text || "").match(/[^.!?]*[.!?]/);
  return (m ? m[0] : text || "").trim();
}

// Provenance stamped onto every repurposed draft so the Drafts panel always
// shows where a post came from (the flow's core promise: capitalise on what
// worked). Rendered as the collapsible "Generation context" panel by
// post-card.js — a headline (the winner it was repurposed from) + the source
// post's own copy.
function repurposeContext(post) {
  const meta = CHANNEL_META[normNet(post.network)] || {};
  return {
    kind: "repurpose",
    headline: {
      icon: "ap-icon-shuffle",
      text: `Repurposed from your top ${labelFor(post.network)} post · ${post.perfBadge}`,
    },
    source: {
      icon: meta.icon || "ap-icon-file--text",
      label: `Your top ${labelFor(post.network)} post`,
      detail: post.excerpt,
    },
  };
}

// ---- Step 1: the winner-selection grid screen -------------------------
//
// Step 1 is a visual grid of post cards (a "screen"), not a numbered
// quick-picker — it takes over the assistant panel the same way Batch / Clip
// Studio do. session.js checks isPickerActive() in renderAssistantPanel, paints
// the grid via renderTopPostsPickerScreen, and routes a card / bulk-bar click
// back to session.js's startRepurposeFlow, which echoes the picks then opens
// the profiles step.
const pickerStates = new Map(); // sessionId → { stage, posts, profile, sort, period }
const pickerSubs = new Map(); // sessionId → Set<fn>
// The Playbook governing the voice of the repurposed drafts, chosen on step 1's
// account screen. Kept OUTSIDE pickerStates because step 2 (echoRepurposePicks)
// clears the picker state, but the choice must survive to executeRepurpose.
const repurposeContexts = new Map(); // sessionId → contextId | null

function notifyPicker(sessionId) {
  const subs = pickerSubs.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function isPickerActive(sessionId) {
  return pickerStates.has(sessionId);
}

export function getPickerState(sessionId) {
  return pickerStates.get(sessionId) || null;
}

export function subscribePicker(sessionId, fn) {
  if (!pickerSubs.has(sessionId)) pickerSubs.set(sessionId, new Set());
  pickerSubs.get(sessionId).add(fn);
  return () => pickerSubs.get(sessionId)?.delete(fn);
}

// The Playbook chosen on step 1 — its voice governs the repurposed drafts.
export function getContextId(sessionId) {
  return repurposeContexts.get(sessionId) || null;
}

// Pick the Playbook for this repurpose run (step 1's account screen). Notifies
// so the studio screen repaints the select with the new value.
export function setContext(sessionId, contextId) {
  repurposeContexts.set(sessionId, contextId || null);
  notifyPicker(sessionId);
}

// Change the active period filter (toolbar chip). "1m" | "3m" | "6m" | "1y".
export function setPeriod(sessionId, period) {
  const s = pickerStates.get(sessionId);
  if (!s || s.period === period) return;
  s.period = period;
  notifyPicker(sessionId);
}

// Leave the grid without picking (Esc / route change cleanup). Clears the
// inline-question that drives the profile stage too, so both stores reset
// together (see armProfilePicker).
export function exitPicker(sessionId) {
  inlineQuestion.exit(sessionId);
  repurposeContexts.delete(sessionId);
  if (!pickerStates.has(sessionId)) return;
  pickerStates.delete(sessionId);
  notifyPicker(sessionId);
}

// Change the active sort (toolbar chip click). Re-renders the board.
export function setSort(sessionId, sort) {
  const s = pickerStates.get(sessionId);
  if (!s || s.sort === sort) return;
  s.sort = sort;
  notifyPicker(sessionId);
}

// Connected social profiles offered on the account picker (step 1). This is what
// the user picks first — the spec's "select a social profile in the first place".
// Shaped as renderPicker items (value / label / caption / avatar) so step 1
// reuses the app's numbered Quickpicker rather than a bespoke card grid. `value`
// is the ACCOUNT id — unique even when several connected accounts share a network
// (the many-profiles case), so each row highlights + echoes independently; the
// picker's onPick resolves it back to an account + network. `search` folds in the
// brand name so a name query matches an @handle row. No winner count: it isn't
// known until the chosen profile's posts load.
export function getProfileChoices() {
  return getConnectedProfiles().map((a) => {
    const net = normNet(a.platform);
    return {
      value: a.id,
      network: net,
      accountId: a.id,
      label: a.handle,
      caption: [a.platformLabel, a.kind].filter(Boolean).join(" · "),
      search: [a.name, a.handle, a.platformLabel, a.kind].filter(Boolean).join(" "),
      avatar: {
        imageUrl: a.photo || null,
        initials: a.photo ? null : a.initials || BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[net] || null,
      },
    };
  });
}

// Shared arming of the account Quickpicker (studio step 1, inline step 1, and the
// period step's Back all pick the same connected accounts). Rows are keyed by
// account id; onAccount receives the resolved account (or null) + its network
// slug. A live search box appears once the connected list is long enough that a
// flat list stops being scannable.
function accountPickerOpts({ title, subtitle, single = false, onAccount }) {
  const choices = getProfileChoices();
  return {
    items: choices,
    title,
    subtitle,
    single,
    searchable: choices.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search accounts by name, handle or network…",
    onPick: (accountId) => {
      const account = getConnectedProfiles().find((a) => a.id === accountId) || null;
      onAccount(account, account ? normNet(account.platform) : normNet(accountId));
    },
  };
}

// Arm the account picker (step 1) as the *exact* in-chat picker component:
// inlineQuestion.ask() with the connected-profile choices. session.js renders
// its chrome inside the studio screen (hero + roadmap + Playbook control), and
// the screen's "Next" button confirms the highlighted account (submitSingle →
// chooseProfile). Single-select-with-confirm so the account + Playbook choices
// are validated together in one step rather than the row advancing on click.
function armProfilePicker(sessionId) {
  inlineQuestion.ask(
    sessionId,
    accountPickerOpts({
      title: "Pick an account",
      subtitle: "I'll load its top posts, ranked by engagement.",
      single: true,
      onAccount: (_account, network) => chooseProfile(sessionId, network),
    }),
  );
}

// Seed the picker at a given stage. Posts are loaded once up front; the board
// filters them to the active profile ("all" = every winner, the flag-OFF mode).
function openStage(sessionId, stage, profile = null) {
  const posts = getTopPosts();
  if (!posts.length) return;
  pickerStates.set(sessionId, {
    stage,
    posts,
    profile,
    sort: "performance",
    // Widest window by default so the board can surface the full top 20 (the
    // "Show my 20 top posts" promise); the user narrows it with the filter.
    period: "1y",
  });
  notifyPicker(sessionId);
}

// Profile chosen on the chooser screen → briefly "load" its top posts, then
// reveal the board scoped to that profile.
export function chooseProfile(sessionId, network) {
  const s = pickerStates.get(sessionId);
  if (!s) return;
  s.profile = normNet(network);
  s.stage = "loading";
  notifyPicker(sessionId);
  setTimeout(() => {
    const cur = pickerStates.get(sessionId);
    if (!cur || cur.stage !== "loading") return; // bailed / re-entered
    cur.stage = "board";
    notifyPicker(sessionId);
  }, PROFILE_LOAD_MS);
}

// Board → back to the profile chooser (step 1). Resets the profile and filters
// so the chooser opens clean.
export function backToProfiles(sessionId) {
  const s = pickerStates.get(sessionId);
  if (!s) return;
  s.stage = "profile";
  s.profile = null;
  s.sort = "performance";
  s.period = "1y";
  armProfilePicker(sessionId);
  notifyPicker(sessionId);
}

export function startTopPostsFlow(sessionId) {
  if (!getTopPosts().length) {
    // New-alt users have no published history yet — open the studio on a
    // dedicated empty state rather than a bare chat line (which reads as a dead
    // end). session.js paints the "empty" stage; Esc / "Back to chat" exits.
    pickerStates.set(sessionId, { stage: "empty", posts: [], profile: null, sort: "performance", period: "1y" });
    notifyPicker(sessionId);
    return;
  }
  // Pre-select the default Playbook so drafts already have a voice; the user can
  // switch it on step 1's account screen (setContext).
  repurposeContexts.set(sessionId, getDefaultContext()?.id || null);
  // Step 1 is the full-page profile chooser: pick a connected profile → load its
  // winners → a board scoped to that profile.
  openStage(sessionId, "profile");
  armProfilePicker(sessionId);
}

// ---- Inline (Add-menu) variant ---------------------------------------
//
// Launched from the composer Add menu (session.js), this runs the SAME
// repurpose feature but entirely IN the conversation — never the studio
// takeover. It asks for the account with the in-chat Quickpicker, then posts an
// interactive selection widget (assistant.postTopPostsWidget) instead of the
// full-page board. Once posts are confirmed, session.js hands off to the shared
// angle → scope → profile steps + executeRepurpose, unchanged.
export function startTopPostsInline(sessionId) {
  if (!getTopPosts().length) {
    postAssistantMessage(
      sessionId,
      "Once your posts start performing, I'll surface your winners here so you can spin new posts out of what already works. Publish a few and come back.",
    );
    return;
  }
  // Default the drafts' voice to the workspace default (parity with the studio,
  // which also pre-selects it; the inline flow keeps it implicit to stay short).
  repurposeContexts.set(sessionId, getDefaultContext()?.id || null);
  postAssistantMessage(sessionId, "Which account should I pull your winners from?");
  inlineQuestion.ask(
    sessionId,
    accountPickerOpts({
      title: "Pick an account",
      subtitle: "I'll pull its top posts next.",
      onAccount: (account, network) => {
        echoAccount(sessionId, account, network);
        askPeriod(sessionId, network);
      },
    }),
  );
}

// Echo the picked account as a visual profile turn so the choice stays visible
// in the conversation (matches the draft flow's profile echo).
function echoAccount(sessionId, account, network) {
  if (account) postUserProfilesTurn(sessionId, [account]);
  else postUserTurn(sessionId, labelFor(normNet(network)));
}

// The recency window to pull winners from — the same periods the studio board
// filters by (PERIODS), asked before the ranking metric so we only rank posts
// inside the window the user cares about.
const PERIOD_CHOICES = PERIODS.map((p) => ({ value: p.key, label: p.label, icon: "ap-icon-clock" }));

// Account chosen → ask which time window to pull winners from before ranking.
function askPeriod(sessionId, network) {
  postAssistantMessage(sessionId, "How far back should I look?");
  inlineQuestion.ask(sessionId, {
    items: PERIOD_CHOICES,
    title: "Time period",
    subtitle: "I'll only rank posts published in that window.",
    onPick: (periodKey) => {
      echoPeriodPick(sessionId, periodKey);
      askRankCriterion(sessionId, network, periodKey);
    },
    // Back to the account question (re-arm it without re-posting the intro).
    onBack: () =>
      inlineQuestion.ask(
        sessionId,
        accountPickerOpts({
          title: "Pick an account",
          subtitle: "I'll pull its top posts next.",
          onAccount: (account, net) => {
            echoAccount(sessionId, account, net);
            askPeriod(sessionId, net);
          },
        }),
      ),
  });
}

// Echo the chosen time window as a user text turn.
function echoPeriodPick(sessionId, periodKey) {
  const choice = PERIOD_CHOICES.find((c) => c.value === periodKey);
  postUserTurn(sessionId, choice ? choice.label : periodKey);
}

// Which metric ranks the winners — the same lenses the studio board sorts by
// (SORTS), asked up front so the widget can surface the strongest posts for the
// metric the user actually cares about (views / reach / engagement / recency).
const RANK_CHOICES = [
  { value: "performance", label: "Performance", caption: "Highest vs your average.", icon: "ap-icon-data-increase" },
  { value: "engagement", label: "Engagement rate", caption: "Most reactions per view.", icon: "ap-icon-heart" },
  { value: "reach", label: "Reach", caption: "Seen by the most people.", icon: "ap-icon-eye-on" },
];

// Window chosen → ask which metric to rank by before surfacing the winners.
function askRankCriterion(sessionId, network, period = "1m") {
  postAssistantMessage(sessionId, "How should I rank them?");
  inlineQuestion.ask(sessionId, {
    items: RANK_CHOICES,
    title: "Rank by",
    subtitle: "I'll put the strongest posts for that metric first.",
    onPick: (sortKey) => {
      echoRankPick(sessionId, sortKey);
      presentWinners(sessionId, network, sortKey, period);
    },
    // Back to the period question (re-arm it without re-posting the intro).
    onBack: () =>
      inlineQuestion.ask(sessionId, {
        items: PERIOD_CHOICES,
        title: "Time period",
        subtitle: "I'll only rank posts published in that window.",
        onPick: (periodKey) => {
          echoPeriodPick(sessionId, periodKey);
          askRankCriterion(sessionId, network, periodKey);
        },
      }),
  });
}

// Echo the chosen ranking metric as a user text turn.
function echoRankPick(sessionId, sortKey) {
  const choice = RANK_CHOICES.find((c) => c.value === sortKey);
  postUserTurn(sessionId, choice ? choice.label : sortKey);
}

// Metric chosen → brief "finding your winners" beat, then drop the interactive
// selection widget into the thread scoped to that account, sorted by the metric.
function presentWinners(sessionId, network, sortKey = "performance", period = "1m") {
  const net = normNet(network);
  const sort = SORTS.find((s) => s.key === sortKey) || SORTS[0];
  const window = PERIODS.find((p) => p.key === period) || PERIODS[0];
  const pendingId = startPending(sessionId, "Finding your top posts");
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    const postIds = getTopPosts()
      .filter((p) => normNet(p.network) === net && (p.daysAgo ?? 0) <= window.maxDays)
      .sort(sort.compare)
      .map((p) => p.id);
    postAssistantMessage(
      sessionId,
      `Here are your top ${labelFor(net)} posts by ${sort.label.toLowerCase()} — pick the ones you'd like to reuse.`,
    );
    postTopPostsWidget(sessionId, { network: net, postIds });
  }, PROFILE_LOAD_MS);
}

// ---- Step 2: echo the pick(s) ----------------------------------------
//
// Clears the board grid (it may or may not be up — the Details-modal
// "Repurpose" path calls in with the grid still active) and echoes every chosen
// winner as a compact preview card so the picks stay visible in the
// conversation. Returns the valid post ids so the caller can drive the angle
// quick-picker; the picker itself lives in session.js (inline-question), which
// owns the onPick closures the way the draft flow's profile picker does.
export function echoRepurposePicks(sessionId, postIds, { echo = true } = {}) {
  const ids = (postIds || []).filter(Boolean);
  const posts = ids.map(getTopPost).filter(Boolean);
  if (!posts.length) return [];

  if (pickerStates.has(sessionId)) {
    pickerStates.delete(sessionId);
    notifyPicker(sessionId);
  }

  // The inline widget path already shows the picks (a frozen selection card), so
  // it validates ids without posting duplicate compact echoes (`echo: false`).
  if (!echo) return posts.map((p) => p.id);

  for (const post of posts) {
    postTopPostPickTurn(sessionId, {
      network: post.network,
      excerpt: post.excerpt,
      perfBadge: post.perfBadge,
      vsAvg: post.vsAvg,
      engagementRate: post.engagementRate,
      impressions: post.impressions,
      views: post.views,
      reactions: post.reactions,
      shares: post.shares,
      saves: post.saves,
      mediaType: post.mediaType,
      image: post.image,
    });
  }
  return posts.map((p) => p.id);
}

// Normalise a network/platform slug (top posts + social accounts both use "x",
// but be defensive about a stray "twitter").
function normNet(n) {
  const s = (n || "").toLowerCase();
  return s === "twitter" ? "x" : s;
}

// Unique source networks across the picked posts — the profiles the winner(s)
// already live on, which the repurpose target picker excludes.
export function repurposeSourceNetworks(postIds) {
  const posts = (postIds || []).map(getTopPost).filter(Boolean);
  return [...new Set(posts.map((p) => normNet(p.network)).filter((n) => CHANNEL_META[n]))];
}

// The connected profile account(s) the picked winner(s) already ran on — the
// "same profile" repurpose target. Top posts are network-level (they don't pin a
// specific account), so this resolves by matching the source network(s).
export function repurposeSourceProfiles(postIds) {
  const sourceNets = repurposeSourceNetworks(postIds);
  return getConnectedProfiles().filter((p) => sourceNets.includes(normNet(p.platform)));
}

// Step 2a — the same-vs-other choice, and the ONLY step for a same-profile
// repost. A single-select Quickpicker: keep the win on the profile it ran on (a
// fresh take for the same audience) or spread it to the user's OTHER connected
// profiles. The "same" row carries an inline version counter (`counter: true`)
// so the user sets how many drafts and generates right here — no extra step;
// "other" navigates to the per-profile picker. The "same" row shows the source
// profile's own avatar when a single source resolves; "other" is disabled when
// there's nothing else connected.
export function repurposeScopeItems(postIds) {
  const sources = repurposeSourceProfiles(postIds);
  const otherCount = repurposeProfileItems(postIds, { include: "other" }).length;
  const single = sources.length === 1 ? sources[0] : null;

  const sameAvatar = single
    ? {
        imageUrl: single.photo || null,
        initials: single.photo ? null : BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[normNet(single.platform)] || null,
      }
    : null;

  return [
    {
      value: "same",
      label: single ? `Same profile — ${single.handle}` : "The same profile",
      caption: single ? "Repost a fresh take for the same audience" : "A fresh take back on each post's own profile",
      avatar: sameAvatar || undefined,
      icon: sameAvatar ? undefined : "ap-icon-refresh",
      // Inline version counter — the same-profile repost generates from right
      // here, so no dedicated follow-up step is needed.
      counter: true,
    },
    {
      value: "other",
      label: "Other profiles",
      caption: otherCount
        ? "Adapt the win for your other connected profiles"
        : "No other connected profiles to spread to",
      icon: "ap-icon-multiple-users",
      disabled: otherCount === 0,
      endNote: otherCount === 0 ? "Nothing to pick" : null,
    },
  ];
}

// Repurpose-target quick-picker items — the user's CONNECTED SOCIAL PROFILES,
// presented as profile rows (brand avatar + network badge + handle). `include`
// scopes the list to the scope choice that opened the step:
//   "other"  (default) → profiles the winner did NOT run on (spread the win)
//   "source"           → only the profile(s) the winner already ran on (repost)
//   "all"              → every profile, source(s) first and flagged "· Source"
// The "· Source" tag is only added in the mixed "all" list — in a source-only
// list the context already makes it obvious.
export function repurposeProfileItems(postIds, { include = "other" } = {}) {
  const sourceNets = repurposeSourceNetworks(postIds);
  const connected = getConnectedProfiles();
  const isSource = (p) => sourceNets.includes(normNet(p.platform));
  let ordered;
  if (include === "source") ordered = connected.filter(isSource);
  else if (include === "all") ordered = [...connected.filter(isSource), ...connected.filter((p) => !isSource(p))];
  else ordered = connected.filter((p) => !isSource(p)); // "other"
  const tagSource = include === "all";
  return ordered.map((p) => {
    const base = [p.platformLabel, p.kind].filter(Boolean).join(" · ");
    return {
      value: p.id,
      label: p.handle,
      // Flag source-network profiles so the caller can default them "on" in the
      // unified repurpose stepper (source pre-set to 1, others to 0).
      isSource: isSource(p),
      // "Source" is emphasised (own class) so it stands out from the muted
      // "Network · Kind" prefix. Caption is inserted raw by the picker renderer.
      caption: tagSource && isSource(p) ? `${base} · <span class="top-posts-source-tag">Source</span>` : base,
      // Plain-text haystack for the picker's live search (the caption carries
      // HTML, so build search text from the raw fields instead).
      search: [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" "),
      avatar: {
        imageUrl: p.photo,
        initials: p.initials || BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[normNet(p.platform)],
      },
    };
  });
}

function truncate(s, n = 60) {
  const t = (s || "").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
}

// Normalise the target argument into a `[{ network, count }]` list applied to
// every picked post. Accepts either the new per-profile shape (objects, from the
// "Other profiles" stepper where each profile carries its own draft count) or a
// bare network-slug array (each treated as count 1). Invalid networks are
// dropped; counts floor at 1. An empty result signals "each post on its own
// source network" (the "same profile" branch).
function normalizeTargets(targets) {
  return (targets || [])
    .map((t) => (typeof t === "string" ? { network: t, count: 1 } : t || {}))
    .map((t) => ({ network: (t.network || "").toLowerCase(), count: Math.max(1, Math.floor(t.count) || 1) }))
    .filter((t) => CHANNEL_META[t.network]);
}

// ---- Step 3: generate the adapted drafts ------------------------------
//
// `postIds` is the picked winners. `targets` is the profiles to publish to as
// `[{ network, count }]` — `count` is how many versions to write for that
// profile (the per-profile stepper). One draft per post × target × version,
// each body adapted to the target network. An empty `targets` means "same
// profile" — each post back on its own source network, one version. Capped at
// MAX_DRAFTS.
export function executeRepurpose(sessionId, postIds, targets) {
  const posts = (postIds || []).map(getTopPost).filter(Boolean);
  if (!posts.length) return;

  const pickedTargets = normalizeTargets(targets);
  // The Playbook chosen on step 1 governs the drafts' voice — stamp it on each.
  const contextId = repurposeContexts.get(sessionId) || null;

  withPendingChip(
    sessionId,
    () => {
      // Each repurposed post becomes a ready source so the user can later find
      // which post fed these drafts (deduped by id in sources-stream).
      for (const post of posts) {
        const meta = CHANNEL_META[normNet(post.network)] || {};
        addReadySource(sessionId, {
          id: `src-toppost-${post.id}`,
          filename: truncate(firstSentence(post.excerpt), 60),
          kind: `${meta.label || "Post"} post`,
          preview: `Repurposed${post.perfBadge ? ` · ${post.perfBadge}` : ""}`,
          iconClass: meta.icon || null,
          // Carry the winner so the Sources panel renders the real post card.
          topPost: post,
        });
      }
      const drafts = [];
      let capped = false;
      outer: for (const post of posts) {
        // No explicit targets → repost to this post's own network (one version).
        const postTargets = pickedTargets.length ? pickedTargets : [{ network: post.network, count: 1 }];
        const base = plainCopy(post);
        for (const { network, count } of postTargets) {
          for (let i = 0; i < count; i += 1) {
            if (drafts.length >= MAX_DRAFTS) {
              capped = true;
              break outer;
            }
            const draft = addPostDraft(sessionId, {
              network,
              text: adaptForNetwork(base, network),
              hashtags: adaptHashtags(post.hashtags, network),
            });
            draft.generationContext = repurposeContext(post);
            draft.contextId = contextId;
            drafts.push(draft);
          }
        }
      }
      postDraftResult(sessionId, {
        ideaTitle: repurposeTitle(posts, drafts.length, capped),
        drafts,
      });
    },
    (err) => genError(err, () => executeRepurpose(sessionId, postIds, targets)),
  );
}

// Result-turn title: names the source when it's a single winner, counts them
// otherwise, and flags a clipped set so the count never reads as "all of them".
function repurposeTitle(posts, count, capped) {
  const base =
    posts.length === 1
      ? `New takes on your top ${labelFor(posts[0].network)} post`
      : `Fresh takes on ${posts.length} of your top posts`;
  return capped ? `${base} · first ${count}` : base;
}
