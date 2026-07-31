// Content Research — the research form. Routes /research/new AND
// /research/:id/settings.
//
// ONE component serves both. Exactly three things differ — the header, the
// cancel affordance, and the save label — and they are resolved once in mode()
// rather than branched through the render. Two components would mean every
// future change to a source card, a toggle or the footer had to be made twice,
// and the second copy is the one that gets forgotten.
//
//   | thing   | create                  | settings                |
//   |---------|-------------------------|-------------------------|
//   | header  | "New content research"  | "Feed settings" + back  |
//   | save    | "Save research"         | "Save changes"          |
//   | on save | append → loader → feed  | return to feed          |
//
// Source gating: only Competitor sources is live. Every other toggle opens the
// "Need that source?" feedback modal and leaves the switch untouched — the
// sources aren't built, and a switch that flips without doing anything is worse
// than one that explains itself.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=282";
import { isFlagOn } from "../feature-flags.js?v=16";
import { getContexts, getContextById } from "../contexts-store.js?v=44";
import { getLaneById, addLane, updateLane } from "../research-store.js?v=2";
import { openNeedSource } from "../components/research-modals.js?v=3";
import {
  RESEARCH_SOURCES,
  CADENCES,
  DEFAULT_ENABLED_IDS,
  DEFAULT_CADENCE,
  isLiveSource,
} from "../research-catalog.js?v=2";

// The in-flight draft. Ephemeral by definition — it only becomes a lane on save,
// so it lives here rather than in the store. Cancel just drops it.
let draft = null;
let laneId = null;

let boundTarget = null;
let boundClick = null;
let boundInput = null;

function mode() {
  return laneId ? "settings" : "create";
}

export function renderResearchForm(params, target) {
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  // /research/new has no :id; /research/:id/settings does. That single fact is
  // what selects the mode — no separate entry point, no flag argument.
  laneId = params && params.id ? params.id : null;

  if (laneId) {
    const lane = getLaneById(laneId);
    // A stale deep link to a deleted lane's settings has nowhere to go.
    if (!lane) {
      navigate("/research");
      return;
    }
    draft = { ...lane, sources: lane.sources.slice() };
  } else {
    draft = {
      name: "",
      playbookId: "",
      sources: DEFAULT_ENABLED_IDS.slice(),
      cadence: DEFAULT_CADENCE,
      notify: true,
      showTrending: true,
    };
  }

  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  return teardown;
}

function teardown() {
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundInput) {
    boundTarget.removeEventListener("input", boundInput);
    boundTarget.removeEventListener("change", boundInput);
  }
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen research-form">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

/** Both name and Playbook are required; the save button is tinted until then. */
function isComplete() {
  return !!draft.name.trim() && !!draft.playbookId;
}

function renderPage() {
  const settings = mode() === "settings";
  return html`<header class="research-form__topbar">
      ${raw(
        settings
          ? html`<button type="button" class="ap-icon-button ghost grey" data-form-back aria-label="Back to research">
              <i class="ap-icon-arrow-left" aria-hidden="true"></i>
            </button>`
          : "",
      )}
      <h2 class="research-form__topbar-title">${settings ? "Feed settings" : "New content research"}</h2>
    </header>
    <div class="research-form__body">
      <div class="research-form__inner">${raw(renderScope())} ${raw(renderSources())} ${raw(renderOther())}</div>
    </div>
    ${raw(renderFooter())}`;
}

function renderSectionLabel(text) {
  return html`<h3 class="research-form__section-label">${text}</h3>`;
}

function renderScope() {
  const contexts = getContexts();
  const selected = getContextById(draft.playbookId);
  return html`<section class="research-form__section">
    ${raw(renderSectionLabel("Research scope"))}
    <div class="research-form__card research-form__card--stack">
      <label class="research-form__field">
        <span class="research-form__field-label">Research name</span>
        <input
          type="text"
          class="research-form__input"
          placeholder="e.g. Lost dog recovery research"
          value="${escapeAttr(draft.name)}"
          data-form-name
        />
      </label>
      <label class="research-form__field">
        <span class="research-form__field-label">Linked Playbook</span>
        <select class="ap-select research-form__select" data-form-playbook>
          <option value="" ${raw(!selected ? " selected" : "")}>Select a Playbook</option>
          ${raw(
            contexts
              .map(
                (c) =>
                  html`<option value="${escapeAttr(c.id)}" ${raw(draft.playbookId === c.id ? " selected" : "")}>
                    ${c.name}
                  </option>`,
              )
              .join(""),
          )}
        </select>
      </label>
    </div>
  </section>`;
}

function renderSources() {
  return html`<section class="research-form__section">
    ${raw(renderSectionLabel("Research sources"))}
    <div class="research-form__sources">${raw(RESEARCH_SOURCES.map(renderSourceCard).join(""))}</div>
  </section>`;
}

function renderSourceCard(source) {
  const on = draft.sources.includes(source.id);
  const anchor = source.playbookAnchor;
  const pb = getContextById(draft.playbookId);

  // The Playbook link only makes sense once a Playbook is chosen — before that
  // there is nothing to open, so it's withheld rather than shown dead.
  const anchorRow =
    anchor && pb
      ? html`<a class="research-source__link" href="#/playbook/${encodeURIComponent(pb.id)}?section=${anchor}">
          <span>Edit my ${anchor} in the Playbook</span>
          <i class="ap-icon-arrow-right" aria-hidden="true"></i>
        </a>`
      : "";

  const toolRow = source.tools
    ? html`<div class="research-source__tools">
        ${raw(source.tools.map((t) => html`<span class="ap-tag grey mini">${t.name}</span>`).join(""))}
        <button type="button" class="research-source__add-tool" data-form-add-tool="${escapeAttr(source.id)}">
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add tool</span>
        </button>
      </div>`
    : "";

  return html`<article class="research-source" data-source-id="${escapeAttr(source.id)}">
    <div class="research-source__head">
      <span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"><i class="${source.icon}"></i></span>
      <span class="research-source__name">${source.name}</span>
      <!-- The DS toggle: the i element is the switch and the input is the real
           checkbox. Both are implicit children the CSS-UI layer styles directly,
           so no wrapper elements. The DS hides the input itself, which is why
           nothing here needs a visually-hidden helper on it. -->
      <label class="ap-toggle-container">
        <input type="checkbox" data-form-source="${escapeAttr(source.id)}" ${raw(on ? " checked" : "")} />
        <i aria-hidden="true"></i>
        <span class="sr-only">Enable ${source.name}</span>
      </label>
    </div>
    ${raw(anchorRow)}${raw(toolRow)}
    <div class="research-source__how">
      <span class="research-source__how-label">How this source works</span>
      <!-- Plain prose. This was a greyed-out read-only textarea once and read as
           a broken input; do not reintroduce a disabled field here. -->
      <p class="research-source__how-body">${source.howItWorks}</p>
    </div>
  </article>`;
}

function renderOther() {
  return html`<section class="research-form__section">
    ${raw(renderSectionLabel("Other settings"))}
    <div class="research-form__card">
      <h4 class="research-form__setting-title">Refresh frequency</h4>
      <p class="research-form__setting-desc">
        How often I scan your sources for new research. More frequent scans keep you close to live trends; less frequent
        ones return a more aggregated, high-level overview.
      </p>
      <!-- Segmented control composed from primitives: the installed DS ships no
           segmented-control CSS-UI class (0 occurrences in ds/css-ui/index.css),
           so this is a sanctioned compose rather than an invented component.
           role=radiogroup keeps the semantics a native segmented control would. -->
      <div class="research-segmented" role="radiogroup" aria-label="Refresh frequency">
        ${raw(
          CADENCES.map(
            (c) =>
              html`<button
                type="button"
                class="research-segmented__option${raw(draft.cadence === c.id ? " is-selected" : "")}"
                role="radio"
                aria-checked="${draft.cadence === c.id ? "true" : "false"}"
                data-form-cadence="${escapeAttr(c.id)}"
              >
                ${c.label}
              </button>`,
          ).join(""),
        )}
      </div>
    </div>
    ${raw(
      renderSwitchCard(
        "notify",
        "Notify me about new research",
        "Get notified after a new research scan with new content ideas.",
        draft.notify,
      ),
    )}
    ${raw(
      renderSwitchCard(
        "showTrending",
        "Show trending topics",
        "Surface a banner for topics running above their usual volume baseline.",
        draft.showTrending,
      ),
    )}
  </section>`;
}

function renderSwitchCard(key, title, desc, on) {
  return html`<div class="research-form__card research-form__card--switch">
    <div class="research-form__switch-text">
      <h4 class="research-form__setting-title">${title}</h4>
      <p class="research-form__setting-desc">${desc}</p>
    </div>
    <label class="ap-toggle-container">
      <input type="checkbox" data-form-switch="${escapeAttr(key)}" ${raw(on ? " checked" : "")} />
      <i aria-hidden="true"></i>
      <span class="sr-only">${title}</span>
    </label>
  </div>`;
}

function renderFooter() {
  const ready = isComplete();
  return html`<footer class="research-form__footer">
    <button type="button" class="ap-button stroked grey" data-form-cancel><span>Cancel</span></button>
    <button
      type="button"
      class="ap-button primary blue research-form__save${raw(ready ? "" : "")}"
      data-form-save
      ${raw(ready ? "" : 'aria-disabled="true"')}
    >
      <span>${mode() === "settings" ? "Save changes" : "Save research"}</span>
    </button>
  </footer>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

/** Where Cancel and the back button both go. */
function exitPath() {
  return mode() === "settings" ? `/research/${encodeURIComponent(laneId)}` : "/research";
}

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    if (event.target.closest("[data-form-back]") || event.target.closest("[data-form-cancel]")) {
      navigate(exitPath());
      return;
    }

    const cadence = event.target.closest("[data-form-cadence]");
    if (cadence) {
      draft.cadence = cadence.dataset.formCadence;
      paint(target);
      return;
    }

    const addTool = event.target.closest("[data-form-add-tool]");
    if (addTool) {
      // The tool picker isn't built; the source itself isn't live either, so the
      // honest response is the same feedback modal.
      openNeedSource({ sourceId: addTool.dataset.formAddTool });
      return;
    }

    const save = event.target.closest("[data-form-save]");
    if (save) {
      // aria-disabled rather than the disabled attribute, so the control stays
      // focusable and screen-reader-announced; the guard lives here instead.
      if (!isComplete()) return;
      if (mode() === "settings") {
        updateLane(laneId, draft);
        navigate(`/research/${encodeURIComponent(laneId)}`);
      } else {
        const lane = addLane(draft);
        // ?fresh=1 tells the feed this arrival is a save, so it runs the
        // generating loader. Selecting a lane from the list does the same.
        navigate(`/research/${encodeURIComponent(lane.id)}?fresh=1`);
      }
      return;
    }
  };
  target.addEventListener("click", boundClick);

  boundInput = (event) => {
    const name = event.target.closest("[data-form-name]");
    if (name) {
      draft.name = name.value;
      // Only the footer's enabled state depends on the name, so repaint that
      // alone — a full repaint would steal focus from the field being typed in.
      refreshFooter(target);
      return;
    }

    const pb = event.target.closest("[data-form-playbook]");
    if (pb) {
      draft.playbookId = pb.value;
      // Full repaint here: choosing a Playbook reveals the per-source
      // "Edit my competitors" links, which depend on it.
      paint(target);
      return;
    }

    const source = event.target.closest("[data-form-source]");
    if (source) {
      const id = source.dataset.formSource;
      if (!isLiveSource(id)) {
        // Not built yet. Bounce the checkbox back and collect intent instead —
        // the modal is the feature here, not the toggle.
        source.checked = draft.sources.includes(id);
        openNeedSource({ sourceId: id });
        return;
      }
      draft.sources = source.checked ? [...new Set([...draft.sources, id])] : draft.sources.filter((x) => x !== id);
      return;
    }

    const sw = event.target.closest("[data-form-switch]");
    if (sw) {
      draft[sw.dataset.formSwitch] = sw.checked;
      return;
    }
  };
  target.addEventListener("input", boundInput);
  target.addEventListener("change", boundInput);
}

// Swap just the footer, so typing the research name doesn't blur the input.
function refreshFooter(target) {
  const footer = target.querySelector(".research-form__footer");
  if (!footer) return;
  footer.outerHTML = renderFooter();
}
