// Research settings — "What I watch" (route /research/settings).
//
// The config used to be a tab next to the digest, which put something you set
// once a quarter at the same level as the ideas you read weekly. It's a page of
// its own now, reached from a discreet cog on /research.
//
// WHY ITS OWN ROUTE AND NOT A GLOBAL /settings: every attempt to aggregate
// configuration into one Settings surface in this repo has been reverted — the
// drawer (2b0abcf, the DS ships no side-drawer primitive), the Connectors
// section (8cdd7e8, it duplicated /connectors), then the route itself (6fca0b0).
// A route dedicated to one feature aggregates nothing, and it links out to
// /playbook/:id for the fields the Playbook owns (competitors, influencers)
// instead of duplicating them.
//
// THE CONFIG IS PER PLAYBOOK, and a page called settings reads as global — so
// the Playbook is named in the subtitle in prose, not only in the picker (which
// hides itself when there's a single Playbook). `?pb=` scopes the page and rides
// back to the digest, so setting Playbook B and going back doesn't land you on
// Playbook A's digest.

import { html, raw } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=236";
import { navigate } from "../router.js?v=30";
import { isFlagOn } from "../feature-flags.js?v=12";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { getContexts, getDefaultContext } from "../contexts-store.js?v=40";
import { RESEARCH_SOURCES, CADENCES } from "../research-catalog.js?v=3";
import {
  getResearchConfig,
  getLastScanAt,
  setSourceEnabled,
  setCadence,
  setNotify,
  subscribe as subscribeResearch,
} from "../research-store.js?v=7";
import { renderResearchSettingsPage, renderSourcesBody } from "../research-view.js?v=10";
import { findConnector } from "../connectors-store.js?v=31";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=14";

let unsubscribe = null;
let activeContextId = null;

export function renderResearchSettings(_params, target) {
  if (!isFlagOn("research")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();

  activeContextId = resolveContextId();
  paint(target);
  unsubscribe = subscribeResearch(() => paint(target));

  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// ?pb= wins, then the default Playbook, then the first one — same resolution as
// the digest, so a cog click carries the Playbook the user was looking at.
function resolveContextId() {
  const wanted = parseHashParams().get("pb");
  const all = getContexts();
  if (wanted && all.some((c) => c.id === wanted)) return wanted;
  return getDefaultContext()?.id || all[0]?.id || null;
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

function buildState() {
  return {
    contextId: activeContextId,
    playbooks: getContexts().map((c) => ({ id: c.id, name: c.name })),
    config: getResearchConfig(activeContextId),
    lastScanAt: getLastScanAt(activeContextId),
    sources: RESEARCH_SOURCES,
    cadences: CADENCES,
    tools: toolsForSources(),
    connectorsOn: isFlagOn("connectors"),
  };
}

function paint(target) {
  const state = buildState();
  target.innerHTML = html`<section class="screen research-view">${raw(renderResearchSettingsPage(state))}</section>`;
  bind(target);
}

// Patch the rows in place. A toggle changes the subtitle too (source count), so
// that one line is refreshed by hand rather than repainting the page and losing
// the scroll position halfway down seven rows.
function repaintBody(root) {
  const state = buildState();
  const body = root.querySelector("[data-research-body]");
  if (body) body.innerHTML = renderSourcesBody(state);
  const sub = root.querySelector(".research-view__sub");
  if (sub) {
    const name = state.playbooks.find((p) => p.id === state.contextId)?.name || "this Playbook";
    const n = (state.config.enabledSourceIds || []).length;
    const every = (state.cadences.find((c) => c.id === state.config.cadence) || {}).every || "week";
    sub.innerHTML = `${n} ${n === 1 ? "source" : "sources"} for <strong>${name}</strong>, every ${every}.`;
  }
}

function bind(target) {
  const root = target.querySelector(".research-view");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("click", (event) => onClick(event, root));
}

function onClick(event, root) {
  // The whole row is the <label>, so preventDefault stops the click firing a
  // second time through the nested checkbox — the Admin popover's contract.
  const sourceRow = event.target.closest("[data-research-source]");
  if (sourceRow) {
    event.preventDefault();
    const id = sourceRow.dataset.researchSource;
    const on = (getResearchConfig(activeContextId).enabledSourceIds || []).includes(id);
    setSourceEnabled(activeContextId, id, !on);
    repaintBody(root);
    return;
  }

  const notifyRow = event.target.closest("[data-research-notify]");
  if (notifyRow) {
    event.preventDefault();
    setNotify(activeContextId, !getResearchConfig(activeContextId).notify);
    repaintBody(root);
    return;
  }

  const cadenceChip = event.target.closest("[data-research-cadence]");
  if (cadenceChip) {
    setCadence(activeContextId, cadenceChip.dataset.researchCadence);
    repaintBody(root);
    return;
  }

  // The fields the Playbook owns live on the Playbook. Link out, never duplicate.
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
    if (id !== activeContextId) setHashQuery("/research/settings", { pb: id });
  }
}
