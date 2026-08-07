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
//   | save    | "Save topic list"       | "Save changes"          |
//   | on save | append → loader → feed  | return to feed          |
//
// Source gating: only Competitor sources is live. Every other toggle opens the
// "Need that source?" feedback modal and leaves the switch untouched — the
// sources aren't built, and a switch that flips without doing anything is worse
// than one that explains itself.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=298";
import { isFlagOn } from "../feature-flags.js?v=18";
import { getContexts, getContextById } from "../contexts-store.js?v=51";
import { getLaneById, addLane, updateLane } from "../research-store.js?v=13";
import { openNeedSource, openPlaybookList } from "../components/research-modals.js?v=28";
import {
  RESEARCH_SOURCES,
  CADENCES,
  DEFAULT_ENABLED_IDS,
  DEFAULT_CADENCE,
  isLiveSource,
} from "../research-catalog.js?v=6";

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
    // The saved list, verbatim — deliberately NOT run through seedWebsites(). An
    // existing lane's list is whatever it was saved as, so emptying it and saving
    // is how you say "don't scan any site"; re-seeding on open would resurrect the
    // URL the user just deleted. Seeded lanes carry their Playbook's site in
    // mocks.js, so the pre-fill is still there on first open.
    draft = { ...lane, sources: lane.sources.slice(), websites: lane.websites.slice() };
  } else {
    draft = {
      name: "",
      playbookId: "",
      sources: DEFAULT_ENABLED_IDS.slice(),
      cadence: DEFAULT_CADENCE,
      notify: true,
      showTrending: true,
      websites: [],
    };
  }

  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  return teardown;
}

// Put the Playbook's own site in the scan list when the list is empty, so the
// common case — "scan my site" — needs no typing.
//
// Called from exactly two places, both of which mean "you have not chosen a list
// yet": creating a lane, and pointing a lane at a different Playbook while its
// list is empty. It is NOT called when opening an existing lane's settings — see
// the note in renderResearchForm.
function seedWebsites() {
  if (draft.websites.length) return;
  const pb = getContextById(draft.playbookId);
  const url = (pb && pb.websiteUrl ? pb.websiteUrl : "").trim();
  if (url) draft.websites = [url];
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

// No in-page bordered bar. It was the last one left in the app and it duplicated
// the global topbar: it captioned the page AND carried its own back button, while
// backTargetFor() already puts a back there — pointing at this lane's feed, the
// same place Cancel goes.
//
// The heading it leaves behind is the .topics-settings__head shape, the app's only
// other settings page: a plain header inside the scrolling body, DS .ap-h1 over an
// .ap-body lead, no border and no chrome. Kept rather than dropped because the
// topbar renders EITHER a back or a title, never both (see topbar.renderTopbar), so
// with the bar gone and a back showing there would otherwise be nothing on screen
// naming what you are editing.
function renderPage() {
  const settings = mode() === "settings";
  return html`<div class="research-form__body">
      <div class="research-form__inner">
        <header class="research-form__head">
          <h1 class="ap-h1 research-form__title">${settings ? "Feed settings" : "New content ideas"}</h1>
          <p class="ap-body research-form__lead">
            ${settings
              ? "What I watch for this topic list, and how often I check it."
              : "Name it, point it at a Playbook, and pick what I should watch."}
          </p>
        </header>
        ${raw(renderScope())} ${raw(renderSources())} ${raw(renderOther())}
      </div>
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
    ${raw(renderSectionLabel("Topic list scope"))}
    <div class="research-form__card research-form__card--stack">
      <label class="research-form__field">
        <span class="research-form__field-label">Topic list name</span>
        <input
          type="text"
          class="research-form__input"
          placeholder="e.g. Lost dog recovery topics"
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
    ${raw(renderSectionLabel("Topic sources"))}
    <div class="research-form__sources">${raw(RESEARCH_SOURCES.map(renderSourceCard).join(""))}</div>
  </section>`;
}

function renderSourceCard(source) {
  const on = draft.sources.includes(source.id);
  const anchor = source.playbookAnchor;
  const pb = getContextById(draft.playbookId);

  // The Playbook link only makes sense once a Playbook is chosen — before that
  // there is nothing to open, so it's withheld rather than shown dead.
  //
  // A BUTTON opening a read-only modal, not an anchor to /playbook. Three reasons
  // the link was wrong: /playbook never honoured `?section=` so it landed at the
  // top of the page, the influencers anchor named a section that didn't exist,
  // and the competitors one was invisible whenever playbookCompetitors was off.
  // The modal also keeps the user on the form they were half-way through filling.
  const anchorRow =
    anchor && pb
      ? html`<button
          type="button"
          class="research-source__link"
          data-form-playbook-list="${escapeAttr(anchor)}"
          data-form-playbook-id="${escapeAttr(pb.id)}"
        >
          <span>Review my ${anchor} in the Playbook</span>
          <i class="ap-icon-arrow-right" aria-hidden="true"></i>
        </button>`
      : "";

  // The Brand-website scan list — editable, one row per site.
  //
  // It reads as a duplicate of the Playbook's websiteUrl and is not one: the
  // Playbook holds the brand's canonical address, this is what ONE lane scans,
  // and a lane may legitimately watch a blog, a docs site or a regional domain
  // the brand record has no business holding. The lane owns it (see
  // research-store.normalizeLane), which is also why this no longer depends on the
  // Playbook growing an editor for its own field.
  //
  // Seeded from the Playbook in seedWebsites() so the common case — "scan my
  // site" — needs no typing, and the pre-fill this card shipped with survives.
  //
  // DS input anatomy: .ap-input-group > (i + input), both implicit children the
  // CSS-UI layer styles directly, so no classes on either. The remove control is
  // a SIBLING of the group, not a child — the DS styles only `> input` and `> i`,
  // so a button inside would be unstyled and would fight the group's padding.
  const siteRows = source.showsWebsite
    ? html`<div class="research-source__sites">
        ${raw(
          draft.websites
            .map(
              (url, i) =>
                html`<div class="research-source__site-row">
                  <div class="ap-input-group">
                    <i class="ap-icon-link" aria-hidden="true"></i>
                    <input
                      type="url"
                      inputmode="url"
                      placeholder="https://example.com"
                      value="${escapeAttr(url)}"
                      aria-label="Website ${i + 1}"
                      data-form-site="${i}"
                    />
                  </div>
                  <button
                    type="button"
                    class="ap-icon-button transparent grey"
                    data-form-site-remove="${i}"
                    aria-label="Remove website ${i + 1}"
                  >
                    <i class="ap-icon-close" aria-hidden="true"></i>
                  </button>
                </div>`,
            )
            .join(""),
        )}
        ${raw(
          !draft.websites.length
            ? html`<p class="research-source__site-empty">
                ${pb ? "No website yet — add the one I should scan." : "Pick a Playbook, or add a website yourself."}
              </p>`
            : "",
        )}
        <button type="button" class="research-source__add-site" data-form-site-add>
          <i class="ap-icon-plus" aria-hidden="true"></i
          ><span>${draft.websites.length ? "Add another website" : "Add a website"}</span>
        </button>
      </div>`
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
    ${raw(anchorRow)}${raw(siteRows)}${raw(toolRow)}
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
        How often I scan your sources for new topics. More frequent scans keep you close to live trends; less frequent
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
        "Notify me about new topics",
        "Get notified after a new scan with new topics.",
        draft.notify,
      ),
    )}
    ${raw(
      renderSwitchCard(
        "showTrending",
        "Show topics that need attention",
        "Tell me in the feed when a topic is trending or its story has moved, and give them their own page.",
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
      <span>${mode() === "settings" ? "Save changes" : "Save topic list"}</span>
    </button>
  </footer>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

/** Where Cancel goes — and, deliberately, where the topbar's back goes too
 * (topbar.backTargetFor). Two exits from one screen that disagree is how a user
 * loses work. */
function exitPath() {
  return mode() === "settings" ? `/research/${encodeURIComponent(laneId)}` : "/research";
}

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    if (event.target.closest("[data-form-cancel]")) {
      navigate(exitPath());
      return;
    }

    const cadence = event.target.closest("[data-form-cadence]");
    if (cadence) {
      draft.cadence = cadence.dataset.formCadence;
      paint(target);
      return;
    }

    const pbkList = event.target.closest("[data-form-playbook-list]");
    if (pbkList) {
      openPlaybookList({
        playbookId: pbkList.dataset.formPlaybookId,
        kind: pbkList.dataset.formPlaybookList,
      });
      return;
    }

    const siteAdd = event.target.closest("[data-form-site-add]");
    if (siteAdd) {
      draft.websites = [...draft.websites, ""];
      paint(target);
      // Focus the row just added, so "Add another website" leaves the cursor
      // where the typing has to happen rather than making the user click twice.
      const rows = target.querySelectorAll("[data-form-site]");
      rows[rows.length - 1]?.focus();
      return;
    }

    const siteRemove = event.target.closest("[data-form-site-remove]");
    if (siteRemove) {
      const i = Number(siteRemove.dataset.formSiteRemove);
      draft.websites = draft.websites.filter((_, n) => n !== i);
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
      // A different Playbook means a different brand site, so offer it — but only
      // into a list that is still empty (see seedWebsites).
      seedWebsites();
      // Full repaint here: choosing a Playbook reveals the per-source
      // "Edit my competitors" links, which depend on it.
      paint(target);
      return;
    }

    const site = event.target.closest("[data-form-site]");
    if (site) {
      // No repaint: re-rendering the row on every keystroke would blur the field
      // being typed in. Nothing else on the page depends on this value, and the
      // store normalises blanks and duplicates away on save.
      draft.websites[Number(site.dataset.formSite)] = site.value;
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
