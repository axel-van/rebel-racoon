// Research — the digest (route /research).
//
// A recurring scan of the enabled sources delivers IDEAS, grouped into editions
// (one per scan). The research behind each idea is its justification, reachable
// through "Why this?" — never the thing the user has to triage. The ideas are
// real Ideas in the global library, so they also appear on /ideas.
//
// Gated behind the `research` flag — OFF bounces to the dashboard, the same
// shape as screens/connectors.js.
//
// The active Playbook and tab live in the hash query (`#/research?pb=…&tab=…`),
// so deep links work and the router's re-run on query-only changes repaints for
// free.
//
// NOTE ON THE "New" BADGE: markAllSeen() runs in the TEARDOWN, not on mount.
// Clearing it on arrival would zero the counter the user just clicked.

import { html, raw } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=227";
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
  setSourceEnabled,
  setCadence,
  setNotify,
  subscribe as subscribeResearch,
} from "../research-store.js?v=6";
import { getAllIdeas, getIdeaById } from "../library.js?v=54";
import { renderResearchPage, renderDigestBody, renderSourcesBody } from "../research-view.js?v=5";
import { findConnector } from "../connectors-store.js?v=31";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=14";
import { open as openResearchModal } from "../components/research-modal.js?v=9";
import { writeIdea, skipIdea, runScanAndAnnounce } from "../research-flow.js?v=7";

let unsubscribe = null;
let activeContextId = null;
// Which one-line rows the user opened. Local, not URL-worthy — a momentary
// reveal, not a place you'd link someone to.
let expanded = new Set();

export function renderResearch(_params, target) {
  if (!isFlagOn("research")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardownSubscription();

  activeContextId = resolveContextId();
  paint(target);
  unsubscribe = subscribeResearch(() => repaint(target));

  return () => {
    teardownSubscription();
    markAllSeen({ contextId: activeContextId });
    expanded = new Set();
  };
}

function teardownSubscription() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// ?pb= wins, then the default Playbook, then the first one.
function resolveContextId() {
  const wanted = parseHashParams().get("pb");
  const all = getContexts();
  if (wanted && all.some((c) => c.id === wanted)) return wanted;
  return getDefaultContext()?.id || all[0]?.id || null;
}

function resolveTab() {
  return parseHashParams().get("tab") === "sources" ? "sources" : "digest";
}

// The MCP source advertises connected tools; the catalog only carries ids.
function toolsForSources() {
  const out = {};
  for (const s of RESEARCH_SOURCES) {
    if (!s.tools) continue;
    out[s.id] = s.tools.map((id) => {
      const c = findConnector(id);
      return { id, name: c?.name || id, logo: c?.logo || "" };
    });
  }
  return out;
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
    expanded,
    tab: resolveTab(),
    playbooks: getContexts().map((c) => ({ id: c.id, name: c.name })),
    contextId,
    config: getResearchConfig(contextId),
    scanning: isScanning(contextId),
    lastScanAt: getLastScanAt(contextId),
    newCount: getNewCount({ contextId }),
    sources: RESEARCH_SOURCES,
    cadences: CADENCES,
    tools: toolsForSources(),
    connectorsOn: isFlagOn("connectors"),
    // The justification behind an idea, for the "Because …" line.
    findingFor: (ideaId) => getFinding(getIdeaById(ideaId)?.researchFindingId),
  };
}

// What the page header renders from. When only the ideas changed we patch the
// body in place — a full repaint would reset the scroll position and close the
// Playbook picker mid-interaction.
function chromeSignature(state) {
  return [
    state.contextId,
    state.tab,
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
  body.innerHTML = state.tab === "sources" ? renderSourcesBody(state) : renderDigestBody(state);
}

function bind(target) {
  const root = target.querySelector(".research-view");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("click", (event) => onClick(event, root));
}

function onClick(event, root) {
  const tabBtn = event.target.closest("[data-research-tab]");
  if (tabBtn) {
    const params = { tab: tabBtn.dataset.researchTab };
    if (activeContextId) params.pb = activeContextId;
    setHashQuery("/research", params);
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

  const why = event.target.closest("[data-research-why]");
  if (why) {
    const idea = getIdeaById(why.dataset.researchWhy);
    if (idea?.researchFindingId) openResearchModal({ findingId: idea.researchFindingId, ideaId: idea.id });
    return;
  }

  const expand = event.target.closest("[data-research-expand]");
  if (expand) {
    const id = expand.dataset.researchExpand;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    repaintBody(root);
    return;
  }

  const scan = event.target.closest("[data-research-scan]");
  if (scan) {
    runScanAndAnnounce({ contextId: activeContextId, manual: true });
    return;
  }

  // ── "What I watch" ──────────────────────────────────────────────────────
  // The whole row is the <label>, so preventDefault stops the click firing a
  // second time through the nested checkbox — the Admin popover's contract.
  const sourceRow = event.target.closest("[data-research-source]");
  if (sourceRow) {
    event.preventDefault();
    const id = sourceRow.dataset.researchSource;
    const on = (getResearchConfig(activeContextId).enabledSourceIds || []).includes(id);
    setSourceEnabled(activeContextId, id, !on);
    return;
  }

  const notifyRow = event.target.closest("[data-research-notify]");
  if (notifyRow) {
    event.preventDefault();
    setNotify(activeContextId, !getResearchConfig(activeContextId).notify);
    return;
  }

  const cadence = event.target.closest("[data-research-cadence]");
  if (cadence) {
    setCadence(activeContextId, cadence.dataset.researchCadence);
    return;
  }

  const pbLink = event.target.closest("[data-research-playbook-link]");
  if (pbLink) {
    navigate(`/playbook/${pbLink.dataset.researchPlaybookLink}`);
    return;
  }

  const addTool = event.target.closest("[data-research-add-tool]");
  if (addTool) {
    openConnectorsModal({});
    return;
  }

  const playbook = event.target.closest("[data-research-playbook]");
  if (playbook) {
    const id = playbook.dataset.researchPlaybook;
    playbook.closest("details")?.removeAttribute("open");
    if (id !== activeContextId) {
      expanded = new Set();
      setHashQuery("/research", { pb: id, tab: resolveTab() });
    }
  }
}
