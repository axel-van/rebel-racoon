// Settings — the account's configuration, as a left nav and a table.
//
// ── This is the fourth attempt, and the first one that should stand ────────
// CLAUDE.md carries a rule earned from three reverts: "a settings surface must
// not AGGREGATE". The drawer, a Connectors section and /settings itself were all
// removed because they re-hosted config that belonged to an entity.
//
// The rule's second clause is what makes this one different: "…or on a route
// scoped to one FEATURE". Everything here configures the same object — the
// Playbook, and the Topic feed that belongs to it. Since the Playbook became the
// app's scope, "which brands exist and what each one listens to" is one feature
// with two views of it, not a drawer of unrelated switches. Nothing else may
// move in: if a third entry ever wants to live here and it is not a Playbook or
// its feed, that is the signal this has started aggregating again.
//
// ── Shape ─────────────────────────────────────────────────────────────────
// Lifted from the inbox's Automated-moderation settings (agorapulse/platform,
// conversation/automated-moderation): a 224px left rail of sections, a scrollable
// content pane, and a DS `.ap-table` as the thing you actually read. The tokens
// are the DS's own settings recipe (`--sys-settings-*`), so this page sizes and
// tints itself the way every settings surface in the product does.
//
// Routes: /settings (redirects) · /settings/playbooks · /settings/topic-feeds

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=431";
import { showToast } from "../components/toast.js?v=21";
import { open as openConfirm } from "../components/confirm-modal.js?v=22";
import { getContexts, getContextById, deleteContext, subscribe as subscribeContexts } from "../contexts-store.js?v=75";
import { getLanes, toggleLanePause, subscribe as subscribeLanes } from "../research-store.js?v=45";
import { getPillars, subscribe as subscribePillars } from "../pillars-store.js?v=6";
import { subscribe as subscribeBriefs } from "../briefs-store.js?v=56";
import { findCadence, findResearchSource } from "../research-catalog.js?v=20";
import { getActivePlaybookId, setActivePlaybook, subscribe as subscribeScope } from "../active-playbook.js?v=18";

// One entry per thing you can configure. Two, and it stays two — see the note at
// the top of this file about what a third one would mean.
const SECTIONS = [
  {
    id: "playbooks",
    path: "/settings/playbooks",
    label: "Playbooks",
    icon: "ap-icon-target",
  },
  {
    id: "topic-feeds",
    path: "/settings/topic-feeds",
    label: "Topic feeds",
    icon: "ap-icon-antenna",
  },
];

let unsubscribers = [];
let boundTarget = null;
let boundClick = null;

export function renderSettings(params, target) {
  const section = SECTIONS.find((s) => s.id === params.section) || SECTIONS[0];
  renderTopbar();
  teardown();
  paint(target, section);
  bind(target);
  // Every table here reads from a store that something else can change.
  unsubscribers = [
    subscribeContexts(() => paint(target, section)),
    subscribeLanes(() => paint(target, section)),
    subscribePillars(() => paint(target, section)),
    subscribeBriefs(() => paint(target, section)),
    subscribeScope(() => paint(target, section)),
  ];
  return teardown;
}

function teardown() {
  unsubscribers.forEach((fn) => fn && fn());
  unsubscribers = [];
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
}

function paint(target, section) {
  target.innerHTML = html`<section class="screen settings-view">
    ${raw(renderNav(section))}
    <div class="settings-view__pane">${raw(section.id === "playbooks" ? renderPlaybooks() : renderFeeds())}</div>
  </section>`;
}

// ─── Left nav ──────────────────────────────────────────────────────────────

function renderNav(active) {
  const rows = SECTIONS.map(
    (s) => `
      <button
        type="button"
        class="settings-nav__item ${s.id === active.id ? "is-active" : ""}"
        data-settings-go="${escapeAttr(s.path)}"
        aria-current="${s.id === active.id ? "page" : "false"}"
      >
        <i class="${s.icon}" aria-hidden="true"></i>
        <span>${s.label}</span>
      </button>`,
  ).join("");
  return `
    <aside class="settings-nav" aria-label="Settings sections">
      <div class="settings-nav__head">
        <button type="button" class="ap-icon-button transparent" data-settings-back aria-label="Back" title="Back">
          <i class="ap-icon-arrow-left"></i>
        </button>
        <span class="settings-nav__title">Settings</span>
      </div>
      <nav class="settings-nav__body">${rows}</nav>
    </aside>`;
}

// ─── Playbooks ─────────────────────────────────────────────────────────────

function renderPlaybooks() {
  const contexts = getContexts();
  const activeId = getActivePlaybookId();
  const pillars = getPillars();
  const lanes = getLanes();

  const rows = contexts
    .map((c) => {
      const pillarCount = pillars.filter((p) => p.playbookId === c.id).length;
      const lane = lanes.find((l) => l.playbookId === c.id) || null;
      const isActive = c.id === activeId;
      return `
      <tr${isActive ? ' class="selected"' : ""}>
        <td>
          <div class="ap-table-cell-content">
            <span class="settings-table__mark">${escapeAttr(initialOf(c.name))}</span>
            <span class="ap-table-cell-text-container">
              <span class="ap-table-cell-text bold">${escapeAttr(c.name)}</span>
              ${
                isActive
                  ? // The row you are working in. A Status, not a Badge: it is one
                    // value describing the whole row, which is the line
                    // choosing-components draws between the two.
                    `<span class="ap-table-cell-description">Currently active</span>`
                  : ""
              }
            </span>
          </div>
        </td>
        <td><span class="ap-table-cell-text">${pillarCount || "—"}</span></td>
        <td><span class="ap-table-cell-text">${lane ? `${lane.sources.length} ${lane.sources.length === 1 ? "source" : "sources"}` : "No feed yet"}</span></td>
        <td class="right">
          <div class="ap-table-cell-actions">
            <!-- No "Switch to". Switching brand is the rail's switcher and
                 nothing else; a second control for it here was two places doing
                 one job, and the rail's is visible from every screen. The row
                 still SHOWS which Playbook is active. -->
            <button type="button" class="ap-icon-button ghost grey" data-settings-edit-pb="${escapeAttr(c.id)}"
              title="Open Playbook" aria-label="Open ${escapeAttr(c.name)}">
              <i class="ap-icon-pen"></i>
            </button>
            <button type="button" class="ap-icon-button ghost grey settings-table__delete"
              data-settings-delete-pb="${escapeAttr(c.id)}" title="Delete" aria-label="Delete ${escapeAttr(c.name)}">
              <i class="ap-icon-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `
    ${renderPaneHead("Playbooks", `${contexts.length} ${contexts.length === 1 ? "Playbook" : "Playbooks"} · one is active at a time`, `<button type="button" class="ap-button primary blue" data-settings-new-pb><i class="ap-icon-plus"></i><span>Create Playbook</span></button>`)}
    <table class="ap-table outer-border header-background striped">
      <thead>
        <tr>
          <th>Playbook</th>
          <th>Pillars</th>
          <th>Topic feed</th>
          <th class="right"></th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4"><div class="ap-table-empty">No Playbooks yet</div></td></tr>`}
      </tbody>
    </table>`;
}

// ─── Topic feeds ───────────────────────────────────────────────────────────

function renderFeeds() {
  const contexts = getContexts();
  const lanes = getLanes();
  const activeId = getActivePlaybookId();

  // One row per PLAYBOOK, not per lane — a feed is implicit in a Playbook now,
  // so a Playbook without one is a row saying so rather than a missing line.
  const rows = contexts
    .map((c) => {
      const lane = lanes.find((l) => l.playbookId === c.id) || null;
      const cadence = lane ? findCadence(lane.cadence) : null;
      const sources = lane
        ? lane.sources
            .map((id) => findResearchSource(id))
            .filter(Boolean)
            // `name`, not `label` — research-catalog names its sources `name`,
            // and the empty chips this produced were invisible in the markup.
            .map((s) => s.name)
        : [];
      const isActive = c.id === activeId;
      const paused = !!lane?.paused;
      return `
      <tr${isActive ? ' class="selected"' : ""}>
        <td>
          <div class="ap-table-cell-content">
            <span class="settings-table__mark">${escapeAttr(initialOf(c.name))}</span>
            <span class="ap-table-cell-text bold">${escapeAttr(c.name)}</span>
          </div>
        </td>
        <td>
          ${
            sources.length
              ? `<div class="ap-table-cell-content items">${sources
                  .slice(0, 3)
                  .map((l) => `<span class="ap-tag grey"><span>${escapeAttr(l)}</span></span>`)
                  .join("")}${
                  sources.length > 3 ? `<span class="ap-table-cell-description">+${sources.length - 3}</span>` : ""
                }</div>`
              : `<span class="ap-table-cell-text">No sources yet</span>`
          }
        </td>
        <td>
          ${
            paused
              ? `<span class="ap-tag orange"><span>Paused</span></span>`
              : `<span class="ap-table-cell-text">${cadence ? escapeAttr(cadence.label) : "—"}</span>`
          }
        </td>
        <td class="right">
          <!-- Pen + pause, not pen + trash. A feed cannot be deleted here: it is
               implicit in its Playbook and would be rebuilt on the next read, so
               a bin would have been a button that undid itself. Pause says the
               same true thing — stop listening, keep what you already have — and
               it is the one you can take back. -->
          <div class="ap-table-cell-actions">
            <button type="button" class="ap-icon-button ghost grey" data-settings-edit-feed="${escapeAttr(c.id)}"
              title="Edit sources" aria-label="Edit sources for ${escapeAttr(c.name)}">
              <i class="ap-icon-pen"></i>
            </button>
            <button type="button" class="ap-icon-button ghost grey"
              data-settings-toggle-feed="${escapeAttr(c.id)}"
              title="${paused ? "Resume listening" : "Pause listening"}"
              aria-label="${paused ? "Resume" : "Pause"} listening for ${escapeAttr(c.name)}">
              <i class="${paused ? "ap-icon-play" : "ap-icon-pause"}"></i>
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `
    ${renderPaneHead("Topic feeds", "One feed per Playbook. Choose what each one listens to.", "")}
    <table class="ap-table outer-border header-background striped">
      <thead>
        <tr>
          <th>Playbook</th>
          <th>Sources</th>
          <th>Refreshed</th>
          <th class="right"></th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4"><div class="ap-table-empty">No Playbooks yet</div></td></tr>`}
      </tbody>
    </table>`;
}

function renderPaneHead(title, sub, action) {
  return `
    <header class="settings-pane__head">
      <div>
        <h1 class="ap-h2 settings-pane__title">${escapeAttr(title)}</h1>
        <p class="settings-pane__sub">${escapeAttr(sub)}</p>
      </div>
      ${action}
    </header>`;
}

function initialOf(name) {
  return String(name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    const go = event.target.closest("[data-settings-go]");
    if (go) return navigate(go.getAttribute("data-settings-go"));

    if (event.target.closest("[data-settings-back]")) return navigate("/");

    const editPb = event.target.closest("[data-settings-edit-pb]");
    if (editPb) return navigate(`/playbook/${editPb.getAttribute("data-settings-edit-pb")}`);

    if (event.target.closest("[data-settings-new-pb]")) {
      // The Playbook builder is a conversation, not a form — same entry point
      // /contexts uses, so there is one way to make a Playbook.
      try {
        window.sessionStorage.setItem("welcomeAltIntegrated", "1");
      } catch {
        /* ignore */
      }
      return navigate("/welcome-alt");
    }

    const delPb = event.target.closest("[data-settings-delete-pb]");
    if (delPb) {
      const c = getContextById(delPb.getAttribute("data-settings-delete-pb"));
      if (!c) return;
      openConfirm({
        title: "Delete this Playbook?",
        body: `“${c.name}” goes, and with it its pillars, its feed and the scope every chat in it was written under. Its chats stay.`,
        confirmLabel: "Delete Playbook",
        danger: true,
        onConfirm: () => {
          deleteContext(c.id);
          showToast(`Deleted “${c.name}”`);
        },
      });
      return;
    }

    // Pause / resume. No confirm dialog: nothing is lost and the same button
    // undoes it — a modal for a reversible switch is a speed bump, not a guard.
    const toggleFeed = event.target.closest("[data-settings-toggle-feed]");
    if (toggleFeed) {
      const pbId = toggleFeed.getAttribute("data-settings-toggle-feed");
      const c = getContextById(pbId);
      const lane = getLanes().find((l) => l.playbookId === pbId);
      if (!c || !lane) return;
      const next = toggleLanePause(lane.id);
      showToast(next?.paused ? `${c.name}'s feed paused` : `${c.name}'s feed is listening again`);
      return;
    }

    // Editing a feed's sources is the existing form. The row's Playbook becomes
    // the scope first, so the form and the rail cannot disagree about which
    // brand is being configured.
    const editFeed = event.target.closest("[data-settings-edit-feed]");
    if (editFeed) {
      const pbId = editFeed.getAttribute("data-settings-edit-feed");
      setActivePlaybook(pbId);
      const lane = getLanes().find((l) => l.playbookId === pbId);
      return navigate(lane ? `/topic-feeds/${lane.id}/settings` : "/topic-feeds/settings");
    }
  };
  target.addEventListener("click", boundClick);
}

// /settings on its own has nothing to show — it is the section list, and the
// section list is permanently on screen as the left nav.
export function renderSettingsIndex() {
  navigate(SECTIONS[0].path);
}
