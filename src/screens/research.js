// Research — the findings feed (route /research).
//
// Recurring scans of the enabled research sources produce FINDINGS:
// evidence-backed insights that sit upstream of Ideas in the pipeline
// (Source → Finding → Idea → Draft → Schedule). This page is where they're
// browsable; each batch also announces itself in the active chat.
//
// Gated behind the `research` flag — OFF bounces to the dashboard, the same
// shape as screens/connectors.js.
//
// The active Playbook lives in the hash query (`#/research?pb=ctx-acme`) rather
// than in module state, so a deep link into one Playbook's feed works and the
// router's re-run on query-only changes repaints for free.
//
// NOTE ON THE "New" BADGE: markAllSeen() runs in the TEARDOWN, not on mount.
// Clearing it on arrival would make the tags disappear while the user is still
// reading the cards they were notified about.

import { html, raw } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=217";
import { navigate } from "../router.js?v=30";
import { isFlagOn } from "../feature-flags.js?v=11";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { getContexts, getDefaultContext } from "../contexts-store.js?v=38";
import { RESEARCH_SOURCES, CADENCES } from "../research-catalog.js?v=1";
import {
  getFindings,
  getNewCount,
  getResearchConfig,
  getLastScanAt,
  isScanning,
  markAllSeen,
  dismissFinding,
  restoreFinding,
  setSourceEnabled,
  setCadence,
  setNotify,
  runScan,
  subscribe as subscribeResearch,
} from "../research-store.js?v=1";
import { renderResearchPage, renderFeedBody, renderSourcesBody } from "../research-view.js?v=1";
import { showToast } from "../components/toast.js?v=20";
import { findConnector } from "../connectors-store.js?v=29";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=12";
import { open as openResearchModal } from "../components/research-modal.js?v=1";

let unsubscribe = null;
let activeContextId = null;
// Local view state — not URL-worthy: "show dismissed" is a momentary reveal,
// not a place you'd link someone to.
let showDismissed = false;

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
    // Leaving the page is what marks the batch as read — see the note above.
    markAllSeen({ contextId: activeContextId });
    showDismissed = false;
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

// "feed" unless ?tab=sources. In the URL so the "Choose my sources" empty-state
// CTA and any future in-chat "change what I scan" link are real deep links.
function resolveTab() {
  return parseHashParams().get("tab") === "sources" ? "sources" : "feed";
}

// The MCP source advertises connected tools, so resolve them through
// connectors-store — the catalog only carries ids.
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

function buildState() {
  const contextId = activeContextId;
  const all = getFindings({ contextId, includeDismissed: true });
  const dismissedCount = all.filter((f) => f.status === "dismissed").length;
  return {
    findings: showDismissed ? all : all.filter((f) => f.status !== "dismissed"),
    dismissedCount,
    showDismissed,
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
  };
}

// What the page header renders from. When only the cards changed we patch the
// body in place instead of rebuilding the page — a full repaint resets the
// scroll position and closes the Playbook picker mid-interaction.
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
  body.innerHTML = state.tab === "sources" ? renderSourcesBody(state) : renderFeedBody(state);
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
      showDismissed = false;
      setHashQuery("/research", { pb: id, tab: resolveTab() });
    }
    return;
  }

  const scan = event.target.closest("[data-research-scan]");
  if (scan) {
    startScan();
    return;
  }

  const dismiss = event.target.closest("[data-research-dismiss]");
  if (dismiss) {
    const id = dismiss.dataset.researchDismiss;
    if (dismissFinding(id)) {
      showToast("Finding dismissed", {
        action: { label: "Undo", onClick: () => restoreFinding(id) },
      });
    }
    return;
  }

  const read = event.target.closest("[data-research-open]");
  if (read) {
    openResearchModal({ findingId: read.dataset.researchOpen });
    return;
  }

  const restore = event.target.closest("[data-research-restore]");
  if (restore) {
    restoreFinding(restore.dataset.researchRestore);
    return;
  }

  const toggle = event.target.closest("[data-research-toggle-dismissed]");
  if (toggle) {
    showDismissed = !showDismissed;
    repaintBody(root);
    return;
  }

  // The split button's chevron. One menu open at a time; the document-level
  // listener below closes it on an outside click.
  const menuBtn = event.target.closest("[data-research-menu]");
  if (menuBtn) {
    const id = menuBtn.dataset.researchMenu;
    const menu = root.querySelector(`[data-research-menu-for="${id}"]`);
    const open = menu && menu.hidden;
    closeMenus(root);
    if (open) {
      menu.hidden = false;
      menuBtn.classList.add("open");
      menuBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }

  closeMenus(root);
}

function closeMenus(root) {
  root.querySelectorAll("[data-research-menu-for]").forEach((m) => {
    m.hidden = true;
  });
  root.querySelectorAll("[data-research-menu]").forEach((b) => {
    b.classList.remove("open");
    b.setAttribute("aria-expanded", "false");
  });
}

// The scan flips the header button to its loading state and then prepends
// cards — both are covered by the store's notify(), so there's nothing to
// repaint by hand here.
function startScan() {
  runScan({
    contextId: activeContextId,
    manual: true,
    onDone: (delivered) => {
      if (!delivered.length) {
        showToast("Nothing new since the last scan");
        return;
      }
      showToast(`${delivered.length} new ${delivered.length === 1 ? "finding" : "findings"}`);
    },
  });
}
