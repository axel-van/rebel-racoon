// Research — the digest (route /research).
//
// A recurring scan of the enabled sources delivers IDEAS, grouped into editions
// (one per scan). The research behind each idea is its justification, reachable
// through "Why this?" — never the thing the user has to triage. The ideas are
// real Ideas in the global library — the digest is where they are listed.
//
// Gated behind the `research` flag — OFF bounces to the dashboard, the same
// shape as screens/connectors.js.
//
// Single-purpose: the digest. The config moved to /research/settings, one cog
// away — a permanent tab with a counter put something you set once a quarter at
// the same level as the ideas you read weekly.
//
// The active Playbook lives in the hash query (`#/research?pb=…`), so deep links
// work and the router's re-run on query-only changes repaints for free.
//
// NOTE ON THE "New" BADGE: markAllSeen() runs in the TEARDOWN, not on mount.
// Clearing it on arrival would zero the counter the user just clicked.

import { html, raw } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=235";
import { navigate } from "../router.js?v=30";
import { isFlagOn } from "../feature-flags.js?v=12";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { getContexts, getDefaultContext } from "../contexts-store.js?v=40";
import { RESEARCH_SOURCES, CADENCES, findResearchSource } from "../research-catalog.js?v=3";
import {
  getEditions,
  getFinding,
  getNewCount,
  getResearchConfig,
  getLastScanAt,
  isScanning,
  markAllSeen,
  subscribe as subscribeResearch,
} from "../research-store.js?v=7";
import { getAllIdeas, getIdeaById, subscribeGlobal as subscribeLibraryGlobal } from "../library.js?v=55";
import { renderResearchPage, renderDigestBody } from "../research-view.js?v=10";
import { open as openResearchModal } from "../components/research-modal.js?v=17";
import { writeIdea, skipIdea, runScanAndAnnounce } from "../research-flow.js?v=9";

let unsubscribe = null;
let unsubscribeLibrary = null;
let activeContextId = null;

export function renderResearch(_params, target) {
  if (!isFlagOn("research")) {
    navigate("/");
    return;
  }
  activeContextId = resolveContextId();

  // Back-compat: the config used to be a tab here. A link shared yesterday
  // shouldn't land on a page that lost its tab.
  if (parseHashParams().get("tab") === "sources") {
    setHashQuery("/research/settings", activeContextId ? { pb: activeContextId } : {});
    return;
  }

  renderTopbar();
  teardownSubscription();
  paint(target);
  unsubscribe = subscribeResearch(() => repaint(target));
  // The ideas live in the library, not in research-store — skipping one removes
  // it there, so the digest has to follow the pool as well.
  unsubscribeLibrary = subscribeLibraryGlobal(() => repaint(target));

  return () => {
    teardownSubscription();
    markAllSeen({ contextId: activeContextId });
  };
}

function teardownSubscription() {
  unsubscribe?.();
  unsubscribeLibrary?.();
  unsubscribe = unsubscribeLibrary = null;
}

// ?pb= wins, then the default Playbook, then the first one.
function resolveContextId() {
  const wanted = parseHashParams().get("pb");
  const all = getContexts();
  if (wanted && all.some((c) => c.id === wanted)) return wanted;
  return getDefaultContext()?.id || all[0]?.id || null;
}

// Resolve each edition's ideaIds into live ideas. Skipping an idea deletes it
// from the library, so this filter is what makes it vanish from the digest —
// and an edition whose ideas are all gone disappears with them.
function buildEditions(contextId) {
  const known = new Set(getAllIdeas({ origin: "research" }).map((i) => i.id));
  return getEditions({ contextId }).map((e) => {
    const ideas = (e.ideaIds || []).filter((id) => known.has(id)).map((id) => getIdeaById(id));
    const sourceNames = [
      ...new Set(
        (e.findingIds || [])
          .map((id) => findResearchSource(getFinding(id)?.sourceId)?.name)
          .filter(Boolean)
          // "Competitor sources" → "Competitor", so the footer reads as prose:
          // "From Competitor and Influencer."
          .map((n) => n.replace(/ sources?$/i, "")),
      ),
    ];
    return { ...e, ideas, sourceNames };
  });
}

function buildState() {
  const contextId = activeContextId;
  return {
    editions: buildEditions(contextId),
    playbooks: getContexts().map((c) => ({ id: c.id, name: c.name })),
    contextId,
    config: getResearchConfig(contextId),
    scanning: isScanning(contextId),
    lastScanAt: getLastScanAt(contextId),
    newCount: getNewCount({ contextId }),
    cadences: CADENCES,
    sources: RESEARCH_SOURCES,
    // The justification behind an idea, for the "Because …" line and the card's
    // source badge.
    findingFor: (ideaId) => getFinding(getIdeaById(ideaId)?.researchFindingId),
  };
}

// What the page header renders from. When only the ideas changed we patch the
// body in place — a full repaint would reset the scroll position and close the
// Playbook picker mid-interaction.
function chromeSignature(state) {
  return [
    state.contextId,
    state.scanning ? "scanning" : "idle",
    state.lastScanAt || "",
    (state.config.enabledSourceIds || []).join(","),
    state.config.cadence,
  ].join("|");
}

let lastChrome = null;

function paint(target) {
  const state = buildState();
  lastChrome = chromeSignature(state);
  target.innerHTML = html`<section class="screen research-view">${raw(renderResearchPage(state))}</section>`;
  bind(target);
}

function repaint(target) {
  const root = target.querySelector(".research-view");
  const state = buildState();
  if (!root || chromeSignature(state) !== lastChrome) {
    paint(target);
    return;
  }
  repaintBody(root, state);
}

function repaintBody(root, state = buildState()) {
  const body = root.querySelector("[data-research-body]");
  if (!body) return;
  body.innerHTML = renderDigestBody(state);
}

function bind(target) {
  const root = target.querySelector(".research-view");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("click", (event) => onClick(event, root));
  // The card is a role="button", so Enter/Space have to open it too — otherwise
  // it's focusable and announces as a button while doing nothing.
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-research-open-idea]");
    if (!card || card !== event.target) return;
    event.preventDefault();
    openIdeaDetail(card.dataset.researchOpenIdea);
  });
}

function onClick(event, root) {
  // The cog, and the empty state's "Choose what I watch" — both go to the
  // settings route carrying the Playbook the user is looking at.
  const toSettings = event.target.closest("[data-research-open-settings], [data-research-tab]");
  if (toSettings) {
    openSettings();
    return;
  }

  // ── The three actions on an idea ────────────────────────────────────────
  const write = event.target.closest("[data-research-write]");
  if (write) {
    writeIdea(write.dataset.researchWrite);
    return;
  }

  const skip = event.target.closest("[data-research-skip]");
  if (skip) {
    skipIdea(skip.dataset.researchSkip);
    return;
  }

  // The card itself opens the detail. Checked AFTER the two action buttons so a
  // decision never doubles as "open the modal".
  const card = event.target.closest("[data-research-open-idea]");
  if (card) {
    openIdeaDetail(card.dataset.researchOpenIdea);
    return;
  }

  const scan = event.target.closest("[data-research-scan]");
  if (scan) {
    runScanAndAnnounce({ contextId: activeContextId, manual: true });
    return;
  }

  const playbook = event.target.closest("[data-research-playbook]");
  if (playbook) {
    const id = playbook.dataset.researchPlaybook;
    playbook.closest("details")?.removeAttribute("open");
    if (id !== activeContextId) setHashQuery("/research", { pb: id });
  }
}

function openSettings() {
  setHashQuery("/research/settings", activeContextId ? { pb: activeContextId } : {});
}

// The full argument + the evidence, in the "Why this idea" modal. A modal and
// not a slide panel: the DS ships no side-drawer primitive, and the one this
// repo built was reverted for forking DS conventions (2b0abcf).
function openIdeaDetail(ideaId) {
  const idea = getIdeaById(ideaId);
  if (idea?.researchFindingId) openResearchModal({ findingId: idea.researchFindingId, ideaId: idea.id });
}
