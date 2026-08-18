// Content Research — the research form. Routes /topic-feeds/new AND
// /topic-feeds/:id/settings.
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
//   | save    | "Save changes"          | "Save changes"          |  (see below)
//   | on save | append → loader → feed  | return to feed          |
//
// Source gating: only Competitors is live. Every other toggle opens the
// "Need that source?" feedback modal and leaves the switch untouched — the
// sources aren't built, and a switch that flips without doing anything is worse
// than one that explains itself.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=453";
import { isFlagOn } from "../feature-flags.js?v=23";
import { getContexts, getContextById } from "../contexts-store.js?v=79";
import { getLaneById, getLanes, addLane, updateLane } from "../research-store.js?v=49";
import { getActivePlaybookId } from "../active-playbook.js?v=44";
import { openNeedSource, openPlaybookList } from "../components/research-modals.js?v=140";
import {
  RESEARCH_SOURCES,
  CADENCES,
  DEFAULT_ENABLED_IDS,
  DEFAULT_CADENCE,
  isLiveSource,
} from "../research-catalog.js?v=21";

// The in-flight draft. Ephemeral by definition — it only becomes a lane on save,
// so it lives here rather than in the store. Cancel just drops it.
let draft = null;
let laneId = null;
// Set only by a refused save, cleared the moment a source goes back on. Never
// true on arrival: a form that opens shouting at you has judged nothing yet.
let showSourceError = false;

let boundTarget = null;
let boundClick = null;
let boundInput = null;

// SETTINGS ONLY. Feed creation is gone — a feed is implicit in a Playbook now,
// so what this form does is change which sources the Playbook's feed listens to.
// The create mode survives in this function and in the copy branches below,
// unreachable, because bringing feeds back as first-class objects would need it
// again and rebuilding it from the settings path would lose the distinctions it
// draws (the save label, the cancel target, the seeded website list).
function mode() {
  return laneId ? "settings" : "create";
}

function laneForActivePlaybook() {
  const scopeId = getActivePlaybookId();
  const mine = scopeId ? getLanes().filter((l) => l.playbookId === scopeId) : getLanes();
  return mine.length ? mine[0].id : null;
}

export function renderResearchForm(params, target) {
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  // /topic-feeds/settings carries no :id — it means "the active Playbook's feed",
  // resolved the same way the feed itself resolves it. /topic-feeds/:id/settings
  // still names one, which is what deep links and the attention page use.
  laneId = params && params.id ? params.id : laneForActivePlaybook();
  showSourceError = false;

  if (laneId) {
    const lane = getLaneById(laneId);
    // A stale deep link to a deleted lane's settings has nowhere to go.
    if (!lane) {
      navigate("/topic-feeds");
      return;
    }
    // The saved list, verbatim — deliberately NOT run through seedWebsites(). An
    // existing lane's list is whatever it was saved as, so emptying it and saving
    // is how you say "don't scan any site"; re-seeding on open would resurrect the
    // URL the user just deleted. Seeded lanes carry their Playbook's site in
    // mocks.js, so the pre-fill is still there on first open.
    draft = { ...lane, sources: lane.sources.slice(), websites: lane.websites.slice() };
  } else {
    // Neither the name nor the Playbook is asked for any more, so both are
    // derived: the brand is the app's scope, and the name follows the one
    // provisionMissingLanes() generates so a hand-made lane and an automatic one
    // are indistinguishable.
    const scopePb = getContextById(getActivePlaybookId());
    draft = {
      name: scopePb ? `${scopePb.name} · listening` : "Listening",
      playbookId: scopePb ? scopePb.id : "",
      sources: DEFAULT_ENABLED_IDS.slice(),
      cadence: DEFAULT_CADENCE,
      notify: true,
      // No switch for this any more — the "Show Topics that need attention" card
      // is gone from the form. It stays true on the lane: research-trending.js
      // and the attention entry still read it, and a new feed should behave like
      // every seeded one.
      showTrending: true,
      websites: [],
    };
    // The Playbook's own site, offered as the first row — the case the select's
    // handler used to cover.
    seedWebsites();
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

/**
 * A feed is complete once it has a Playbook — which it always does now, because
 * nothing on this page can change it and every entry point supplies one.
 *
 * It used to require a NAME too, typed into a field at the top of the page. That
 * field is gone: a feed is implicit in its Playbook, its name is generated, and
 * the only place it was ever printed is the unreachable feed-list screen. Asking
 * for a name the product never shows, and blocking Save until it was given, was
 * two costs for nothing.
 */
function isComplete() {
  return !!draft.playbookId;
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
          <!-- One heading, both modes. "New Topic feed" is gone from the copy
               because a feed is no longer something a user creates — it is
               implicit in a Playbook, and this form is where its sources get
               chosen the first time as well as every time after. The MODE still
               differs underneath (create writes a lane, settings updates one);
               only the words stopped announcing which one you are in. -->
          <!-- Title only. The lead under it read "What I watch for Agorapulse, and
               how often I check it" — a sentence in Archie's voice restating what
               the sources below already show, one scroll above them. The brand is
               named by the rail's switcher, which is on screen the whole time. -->
          <h1 class="ap-h1 research-form__title">Feed settings</h1>
        </header>
        ${raw(renderSources())} ${raw(renderOther())}
      </div>
    </div>
    ${raw(renderFooter())}`;
}

function renderSectionLabel(text) {
  return html`<h3 class="research-form__section-label">${text}</h3>`;
}

// ── Saving with nothing switched on ────────────────────────────────────────
// A feed with no sources cannot return a single topic, so it is not aquieter
// feed — it is a screen that will be empty forever, and nothing on it would say
// why. The form refuses the save and says so.
//
// The message sits with the SOURCES, not with the footer: the footer is where you
// pressed, the sources are where the fix is, and an error at the bottom of a long
// form is read after the user has already started hunting. renderSources paints
// it, so it survives every repaint; the save handler scrolls it into view, since
// on a short viewport the toggles can be a screen away from the button.
//
// DS Infobox in `error`, which is the documented banner for section-level
// feedback — not .ap-form-message, which belongs to one field and this is about
// nine of them.
function renderSources() {
  return html`<section class="research-form__section">
    ${raw(renderSectionLabel("Topic sources"))}
    ${raw(
      showSourceError
        ? html`<div class="ap-infobox error research-form__error" role="alert" data-form-error>
            <i class="ap-icon-error_fill" aria-hidden="true"></i>
            <div class="ap-infobox-content">
              <div class="ap-infobox-texts">
                <span class="ap-infobox-message">
                  Switch on at least one source. With none there is nothing to listen to, and this feed stays empty.
                </span>
              </div>
            </div>
          </div>`
        : "",
    )}
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
          <!-- "the Playbook's competitors", not "my competitors": the list belongs
               to the Playbook, and this page speaks about what the system does
               rather than in Archie's voice. -->
          <span>Review the Playbook's ${anchor}</span>
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
                ${pb ? "No website yet — add the one to scan." : "Pick a Playbook, or add a website yourself."}
              </p>`
            : "",
        )}
        <!-- A DS button, not the dashed pill this used to be. The pill was
             invented visual language for an ordinary secondary action; ghost blue
             is what the DS gives a low-weight add. -->
        <button type="button" class="ap-button ghost blue research-source__add-site" data-form-site-add>
          <i class="ap-icon-plus" aria-hidden="true"></i
          ><span>${draft.websites.length ? "Add another website" : "Add a website"}</span>
        </button>
      </div>`
    : "";

  const toolRow = source.tools
    ? html`<div class="research-source__tools">
        ${raw(source.tools.map((t) => html`<span class="ap-tag grey mini">${t.name}</span>`).join(""))}
        <button
          type="button"
          class="ap-button ghost blue research-source__add-tool"
          data-form-add-tool="${escapeAttr(source.id)}"
        >
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
        How often your sources are scanned for new Topics. More frequent scans keep you close to live trends; less
        frequent ones return a more aggregated, high-level overview.
      </p>
      <!-- The DS Segmented Control, ported into ds-patches.css from the Angular
           component's own template and SCSS. This used to be a look-alike composed
           from primitives — 1.5px borders, 10px radius, three separate boxes with
           an 8px gap — written when the CSS-UI layer had no class for it. The port
           landed for the feed's Ready-to-draft / Topics-for-later switch, and the
           two controls now come from the same place.
           role=radiogroup + role=radio is kept over the component's own
           aria-pressed: this is one setting with three values, not three toggles. -->
      <div class="ap-segmented-control research-segmented" role="radiogroup" aria-label="Refresh frequency">
        ${raw(
          CADENCES.map(
            (c) =>
              html`<button
                type="button"
                class="ap-segmented-control__segment${raw(
                  draft.cadence === c.id ? " ap-segmented-control__segment--selected" : "",
                )}"
                role="radio"
                aria-checked="${draft.cadence === c.id ? "true" : "false"}"
                data-form-cadence="${escapeAttr(c.id)}"
              >
                <span class="ap-segmented-control__label">${c.label}</span>
              </button>`,
          ).join(""),
        )}
      </div>
    </div>
    ${raw(
      renderSwitchCard(
        "notify",
        "Notify me about new Topics",
        "Send a notification after a scan that found something.",
        draft.notify,
      ),
    )}
    <!-- Pause lives here, and this is the only place it can. It was a play/pause
         button in the settings table, which no longer exists; the feed's own
         settings are where the rest of "how this feed behaves" already is.

         LAST in the section, and phrased as the thing you turn ON rather than as
         a "Listening" switch you turn off: it stops the whole feature above it,
         so it reads as the exception at the bottom rather than as one setting
         among equals at the top. Resuming is also possible from the feed itself,
         which is where you notice nothing is arriving. -->
    ${raw(
      renderSwitchCard(
        "paused",
        "Pause this feed",
        "Scanning stops. Topics already in the feed stay where they are, and nothing new arrives until this is switched back off.",
        draft.paused,
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
      <span>Save changes</span>
    </button>
  </footer>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

/** Where Cancel goes — and, deliberately, where the topbar's back goes too
 * (topbar.backTargetFor). Two exits from one screen that disagree is how a user
 * loses work. */
function exitPath() {
  // Back to THE feed — there is one, it is the active Playbook's, and it is where
  // the cog that opens this form lives. Same target as the topbar's back
  // (topbar.backTargetFor), deliberately: two exits from one screen that disagree
  // is how a user loses work.
  return "/topic-feeds";
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
      if (!draft.sources.length) {
        showSourceError = true;
        paint(target);
        target.querySelector("[data-form-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (mode() === "settings") {
        updateLane(laneId, draft);
        navigate(`/topic-feeds/${encodeURIComponent(laneId)}`);
      } else {
        const lane = addLane(draft);
        // ?fresh=1 tells the feed this arrival is a save, so it runs the
        // generating loader. Selecting a lane from the list does the same.
        navigate(`/topic-feeds/${encodeURIComponent(lane.id)}?fresh=1`);
      }
      return;
    }
  };
  target.addEventListener("click", boundClick);

  boundInput = (event) => {
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
      if (showSourceError && draft.sources.length) {
        showSourceError = false;
        paint(target);
      }
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
