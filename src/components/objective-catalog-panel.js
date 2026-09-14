// The metric catalogue and the measure configurator (handoff screens 2c/2d) —
// Archie's own catalogue, exposed to the user: grouped by family, every metric
// typed (volume / rate / counter), the additive ones marked ADDS UP (the only
// ones that unlock "All networks"), the not-yet-available ones listed greyed
// COMING SOON with the proxy Archie would use — the same rule for him and for
// the user. Picking a metric slides the same surface into the configurator:
// scope first (a network acts as a shortcut — it checks its profiles, partial
// deselection allowed), the baseline computes live once the scope is set, and
// Archie's target suggestion lands right behind it. A rate holds a bar
// instead of running from→to.
//
// Two consumers, one flow: `createCatalogFlow()` returns a render/dispatch
// controller the objective modal EMBEDS (the panel is a view of that dialog,
// the design's own "the panel slides"), and `open()` wraps the same flow in a
// standalone body-level dialog for the Playbook block's edit mode.

import { escapeHtml as esc } from "../utils.js?v=1170";
import {
  NETWORK_LABEL,
  getConnectedProfiles,
  renderProfileTag,
  PROFILE_SEARCH_THRESHOLD,
} from "../social-profiles.js?v=1170";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1170";
import { getContextById } from "../contexts-store.js?v=1170";
import {
  catalogEntries,
  metricLabel,
  metricTypeLabel,
  scopedBaselineFor,
  proposeTargetFrom,
  isRateMetric,
  isAdditiveMetric,
} from "../objective-measures.js?v=1170";

const COMPUTE_MS = 900;

let flowSeq = 0;

// ── The shared flow ──────────────────────────────────────────────────────────
// state.view: "catalog" | "config". All interactions are click-driven except
// the search input (the host wires input events to handleInput).
export function createCatalogFlow({
  contextId,
  targetLabel,
  confirmLabel,
  immediate = false,
  taken = [],
  onAdd,
  onBack,
  requestRender,
}) {
  flowSeq += 1;
  const state = {
    view: "catalog",
    query: "",
    metricId: null,
    network: null, // null = all networks (additive metrics only)
    profileIds: new Set(),
    // The profile menu is a MULTI-select, so it has to survive the re-render
    // each toggle triggers — a native <details> would snap shut on every pick.
    profilesOpen: false,
    profileQuery: "",
    baselineState: "idle", // idle | computing | ready
    baseline: null,
    target: null,
    windowMode: "inherit", // inherit | custom
    timer: null,
  };

  function profilesFor(network) {
    return getConnectedProfiles().filter((p) => p.platform === network);
  }

  function scope() {
    if (!state.network) return undefined;
    const all = profilesFor(state.network);
    const picked = [...state.profileIds];
    if (!picked.length || picked.length === all.length) return { network: state.network };
    return { network: state.network, profileIds: picked };
  }

  // The baseline computes "live" the moment the scope is posed — never typed
  // before the scope is known. The spinner is the design's own beat.
  function recompute() {
    if (state.timer) window.clearTimeout(state.timer);
    state.baselineState = "computing";
    state.baseline = null;
    state.target = null;
    state.timer = window.setTimeout(() => {
      state.timer = null;
      state.baseline = scopedBaselineFor(state.metricId, contextId, scope());
      state.target = proposeTargetFrom(state.metricId, state.baseline, contextId, scope());
      state.baselineState = "ready";
      requestRender();
    }, COMPUTE_MS);
    requestRender();
  }

  function pickMetric(metricId) {
    state.view = "config";
    state.metricId = metricId;
    // Default scope: the PLAYBOOK's own network when its fiche names a profile
    // — the same answer the one-step add uses (`defaultScope`) — else the first
    // connected network as the shortcut. This view always has a network set:
    // "every connected profile" is a deliberate act here, and locked unless the
    // metric truly adds up.
    state.network = defaultScope()?.network || getConnectedProfiles()[0]?.platform || null;
    state.profileIds = new Set(profilesFor(state.network).map((p) => p.id));
    state.windowMode = "inherit";
    recompute();
  }

  // ── Adding in ONE step ────────────────────────────────────────────────
  //
  // Picking a metric ADDS it, with a scope and Archie's suggested target
  // already resolved — no configurator screen in between.
  //
  // ⚠️ That step used to be mandatory, and it asked three things the objective
  // form asks again forty pixels later: the target (the card's own `from → to`
  // fields), the scope (printed under the measure's name, and the pencil
  // changes it) and a per-measure window override (an edge case, still on the
  // pencil's path). Three screens to add one measure, two of them re-stating
  // each other. The form is where a measure is READ, so it is where it should
  // be adjusted; the catalogue's job is to answer WHICH metric.
  //
  // The 900ms "computing from your profiles…" beat goes with it: the baseline
  // and the proposal are synchronous functions (objective-measures.js), and the
  // wait was staged, not real.
  //
  // The default scope is the PLAYBOOK's own network — the profile the fiche is
  // tied to — and every profile on it. A Playbook that names no profile gets NO
  // scope, which the model reads as every network (`scope?.network` guards every
  // read of it) and the card prints as "all networks".
  //
  // ⚠️ Not `getConnectedProfiles()[0]`, which is what the configurator opened
  // on: it handed you Facebook for a LinkedIn brand. An arbitrary answer is
  // fine while a screen asks you to confirm it, and a silent wrong one the
  // moment nothing does — so the default is either MEANINGFUL (the Playbook's
  // own profile) or WIDE (everything), never a coin toss between six networks.
  function defaultScope() {
    const ctx = getContextById(contextId);
    const pinned = ctx?.selectedProfileId ? getConnectedProfiles().find((p) => p.id === ctx.selectedProfileId) : null;
    return pinned?.platform ? { network: pinned.platform } : undefined;
  }

  // The measure lands with its SCOPE and nothing else: `computing` says Archie
  // has not answered yet, and the host settles it (objective-modal.js
  // § the measure settles). Deliberately not pre-computed here — the card's own
  // loader IS the beat, so the values must arrive when the beat ends, not
  // before.
  function addNow(metricId) {
    onAdd({
      id: `m-${flowSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      metricId,
      scope: defaultScope(),
      computing: true,
    });
  }

  function computingLabel() {
    const all = profilesFor(state.network);
    const first = all.find((p) => state.profileIds.has(p.id)) || all[0];
    return `computing from ${first?.handle || first?.name || "your profiles"}…`;
  }

  // ── Views ──────────────────────────────────────────────────────────────

  // ── The catalogue: EVERYTHING VISIBLE, in two columns ─────────────────
  //
  // ⚠️ It was eight collapsed accordion CARDS, one per family, each with a count
  // and a chevron — and that was the design's own stated intent ("the catalog
  // opens as a short stack of ~8 family headers, not a wall of metrics").
  // Wrong: the whole catalogue is EIGHTEEN metrics. Collapsing 18 items behind 8
  // doors spends 450px of chrome to hide 18 words, and nobody opens eight doors
  // to find out what is behind them — a picker whose items are invisible until
  // you guess which family holds them is a picker you search or abandon.
  //
  // So: two columns of family blocks, every metric on screen, no accordion. The
  // families become quiet 12px eyebrows and the METRICS carry the weight, which
  // is the right way round — they are what the reader picks. `columns: 2` with
  // `break-inside: avoid` keeps a family whole in one column.
  //
  // WHAT WAS DROPPED, because it was said two and three times over:
  //   • the TYPE tag on every row (`Volume` twelve times, `Counter`, `Rate`).
  //     It does not change which metric you want — it changes how the target is
  //     written, which the next step SHOWS with a live figure, and the dialog's
  //     own subtitle names it there ("Followers net growth · Counter").
  //   • the green `Adds up` tag. Same thing: it only matters once a scope is on
  //     screen, and the config step's caption says it in a sentence.
  //   • the per-family COUNT. It stood in for the rows it hid; the rows are
  //     there now.
  function renderCatalog() {
    const q = state.query.trim().toLowerCase();
    const fams = catalogEntries()
      .map((family) => {
        const metrics = family.metrics.filter((m) => !q || m.label.toLowerCase().includes(q));
        if (!metrics.length) return "";
        const rows = metrics
          .map((m) => {
            // ⚠️ Already on the objective — the row says so and cannot be
            // picked. Adding is one click now (§ adding in one step), so
            // nothing stands between a double-click and two identical measures;
            // it took the configurator's three screens to make that unlikely
            // before, never impossible.
            if (taken.includes(m.id)) {
              return `
                <div class="objc__soon">
                  <span class="objc__row-name">${esc(m.label)}</span>
                  <span class="objc__soonwhy">Already measured</span>
                </div>`;
            }
            if (!m.available) {
              // A real metric the platform cannot serve yet: the name greyed, the
              // reason under it, and the proxy Archie would use instead as the
              // only control — so the row is honest about being unpickable
              // without being a dead end.
              return `
                <div class="objc__soon">
                  <span class="objc__row-name">${esc(m.label)}</span>
                  <span class="objc__soonwhy">Needs Google Analytics ·
                    <button type="button" class="ap-link standalone small" data-objc-proxy-pick="${m.proxyId}">use ${esc(m.proxyLabel || "the proxy")}</button>
                  </span>
                </div>`;
            }
            // No trailing chevron: sixteen of them sat 150px to the right of
            // their own names, a second column of glyphs with nothing between.
            // `.ap-list-panel-item` already ships the hover (blue-10) that says
            // the row is a control, and every row in a picker is one.
            return `
              <button type="button" class="ap-list-panel-item objc__row" data-objc-pick="${m.id}">
                <span class="objc__row-name">${esc(m.label)}</span>
              </button>`;
          })
          .join("");
        return `
          <section class="objc__fam">
            <h4 class="objc__famname">
              <i class="${esc(family.familyIcon || "ap-icon-chart-screen")}" aria-hidden="true"></i>${esc(family.familyLabel)}
            </h4>
            <div class="objc__famrows">${rows}</div>
          </section>`;
      })
      .join("");
    return `
      <div class="objc__search">
        <div class="ap-input-group">
          <i class="ap-icon-search" aria-hidden="true"></i>
          <input type="text" data-objc-search value="${esc(state.query)}" placeholder="Search the metric catalog…" aria-label="Search the metric catalog" />
        </div>
      </div>
      <div class="objc__cols">${fams || `<p class="objc__empty">Nothing in the catalog matches "${esc(state.query)}".</p>`}</div>`;
  }

  // A suggested target reads as a decision once you can see the jump it asks
  // for — a bare orange chip only says "Archie picked this".
  function pctDelta(baseline, target) {
    const num = (v) => {
      const cleaned = String(v ?? "")
        .replace(/[€$,+\s]/g, "")
        .replace(/%$/, "");
      return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
    };
    const b = num(baseline);
    const t = num(target);
    if (b == null || t == null || b === 0) return null;
    return Math.round(((t - b) / b) * 100);
  }

  // Two groups, a rule between them: WHERE the measure reads (networks, then
  // the profiles under the chosen one) and WHAT it reads to (the target, the
  // window). The metric name + type moved to the dialog subtitle — a
  // breadcrumb row repeating "from the metric catalog" next to a "Catalog"
  // back link was saying the same thing three times.
  function renderConfig() {
    const m = state.metricId;
    const rate = isRateMetric(m);
    const additive = isAdditiveMetric(m);
    const networks = [];
    getConnectedProfiles().forEach((p) => {
      if (!networks.includes(p.platform)) networks.push(p.platform);
    });
    const netName = state.network ? NETWORK_LABEL[state.network] || state.network : "";

    // ── ONE control: the profiles, GROUPED BY NETWORK ────────────────────
    //
    // ⚠️ This was TWO fields — `Measure on [network]` then `Profiles [multi]` —
    // and the second was the first, restated: a network IS its profiles, so the
    // reader answered the same question twice, and the network field's own
    // options had to print "LinkedIn · 3/7 profiles" to stay honest about what
    // the field below it had done. Picking profiles says which network without
    // being asked.
    //
    // The DS ships the grouped list (`.ap-select-group` + `-group-label`), so
    // this is its own primitive and not a nested menu — ADS has no flyout, and
    // sections + a divider is the documented way to group options.
    //
    // ONE NETWORK AT A TIME, because that is exactly what the model holds: a
    // measure's scope is `{ network, profileIds? }` (objective-measures.js), and
    // every read of it is guarded by `scope?.network`. So picking a profile in
    // another group MOVES the measure to that network rather than adding to it —
    // the caption says so for the metrics that cannot be summed. The
    // cross-network case keeps its own row at the top (`Every connected
    // profile`), which is the old "All networks" option and stays locked to
    // metrics that add up.
    const groups = networks.map((n) => ({ network: n, profiles: profilesFor(n) })).filter((g) => g.profiles.length);
    const allProfiles = getConnectedProfiles();
    const everyNetwork = !state.network;
    const profiles = state.network ? profilesFor(state.network) : allProfiles;
    const pickedCount = profiles.filter((p) => state.profileIds.has(p.id)).length;
    const allPicked = pickedCount === profiles.length;
    const q = state.profileQuery.trim().toLowerCase();
    const matches = (p) => !q || `${p.handle || ""} ${p.name || ""}`.toLowerCase().includes(q);
    const searchable = allProfiles.length > PROFILE_SEARCH_THRESHOLD;
    // The input is inert (tabindex -1, aria-hidden): the row's click handler owns
    // the toggle and re-renders from state, so the box never disagrees with it.
    const checkbox = (on) =>
      `<span class="ap-checkbox-container ap-select-option-checkbox" aria-hidden="true"><input type="checkbox" tabindex="-1"${on ? " checked" : ""} /><i></i></span>`;

    // The trigger says the NETWORK and the count, not a run of profile chips:
    // the network field is gone, so this is the only place the scope's network
    // is printed — and two names plus "+5" told the reader neither the network
    // nor the total.
    let triggerText;
    if (everyNetwork) triggerText = `Every connected profile · ${allProfiles.length}`;
    else if (allPicked) triggerText = `${netName} · all ${profiles.length} profile${profiles.length === 1 ? "" : "s"}`;
    else triggerText = `${netName} · ${pickedCount} of ${profiles.length} profiles`;

    const groupRows = groups
      .map((g) => {
        const shown = g.profiles.filter(matches);
        if (!shown.length) return "";
        const netAll = state.network === g.network && g.profiles.every((p) => state.profileIds.has(p.id));
        const label = NETWORK_LABEL[g.network] || g.network;
        // A whole-network row per group, for the same reason the flat list had
        // one: ticking 200 profiles by hand is not an option. Hidden while
        // searching, where "all" would mean "all of the matches".
        const allRow =
          q || g.profiles.length < 2
            ? ""
            : `<div class="ap-select-option objc__profileopt" role="option" aria-selected="${netAll}" data-objc-net-all="${esc(g.network)}">
                 ${checkbox(netAll)}<span>All ${g.profiles.length} ${esc(label)} profiles</span>
               </div>`;
        const rows = shown
          .map((pf) => {
            const on = state.network === g.network && state.profileIds.has(pf.id);
            return `
              <div class="ap-select-option objc__profileopt" role="option" aria-selected="${on}" data-objc-profile="${esc(pf.id)}">
                ${checkbox(on)}${renderProfileTag(pf)}
              </div>`;
          })
          .join("");
        return `<div class="ap-select-group"><span class="ap-select-group-label">${esc(label)}</span></div>${allRow}${rows}`;
      })
      .join("");

    // `Every connected profile` — the old "All networks", and still a deliberate
    // act: a metric that cannot be summed across networks keeps it disabled, and
    // the caption says why. Not a feature-lock (purple + padlock reads as
    // "upgrade to unlock", a promise this can never keep) — just a disabled
    // option.
    const everyRow =
      q || groups.length < 2
        ? ""
        : additive
          ? `<div class="ap-select-all objc__profileall" role="option" aria-selected="${everyNetwork}" data-objc-network="all">
               ${checkbox(everyNetwork)}<span>Every connected profile · ${allProfiles.length}</span>
             </div>
             <div class="ap-select-divider"></div>`
          : `<div class="ap-select-all objc__profileall disabled" aria-disabled="true">
               ${checkbox(false)}<span>Every connected profile</span>
             </div>
             <div class="ap-select-divider"></div>`;

    let caption;
    if (everyNetwork) caption = `Every profile on every network — the measure sums them all.`;
    else if (!additive)
      caption = `${metricLabel(m)} can’t be summed across networks: picking a profile from another one measures that network instead.`;
    else if (allPicked) caption = `Every ${netName} profile — deselect one to narrow the measure.`;
    else caption = `${pickedCount} of ${profiles.length} — the measure sums only these.`;

    const profileField =
      allProfiles.length <= 1
        ? // One profile is not a choice — a lone row you can't uncheck is a
          // control that does nothing. Show WHO it is instead, through the same
          // renderProfileTag (DS avatar + corner network badge + name) every
          // other profile surface uses.
          `<div class="objc__profile">${allProfiles[0] ? renderProfileTag(allProfiles[0]) : "—"}</div>
           <p class="objc__caption">The only profile connected.</p>`
        : `<details class="ap-select objc__select objc__profiles" data-objc-select${state.profilesOpen ? " open" : ""}>
             <summary class="ap-select-trigger" data-objc-profiles-toggle>
               <span class="ap-select-value">${esc(triggerText)}</span>
               <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
             </summary>
             <div class="ap-select-dropdown" role="listbox" aria-multiselectable="true">
               ${
                 searchable
                   ? `<div class="ap-select-search">
                        <i class="ap-icon-search ap-select-search-icon" aria-hidden="true"></i>
                        <input class="ap-select-search-input" type="text" data-objc-profile-search value="${esc(state.profileQuery)}" placeholder="Search profiles…" aria-label="Search profiles" />
                      </div>`
                   : ""
               }
               ${everyRow}
               <div class="ap-select-options">
                 ${groupRows || `<p class="ap-select-not-found">No profile matches “${esc(state.profileQuery)}”.</p>`}
               </div>
             </div>
           </details>
           <p class="objc__caption">${esc(caption)}</p>`;

    // ── What Archie computed ─────────────────────────────────────────────
    //
    // The TARGET is the one thing this view produces: the reader posed a scope,
    // Archie read the baseline off it and proposed a number. So it is the view's
    // figure — the DS's top rung (h1, 24/32, the biggest step the ramp has) on a
    // grey-05 inset, with the orange `Suggested` tag beside it because orange is
    // this app's mark for something the AI produced.
    //
    // ⚠️ It was a SENTENCE at body size — "from 3,700 today to 4,300 Suggested ·
    // +16%" — one 14px line among the three other 14px lines of the form, with
    // its two numbers in bold as the only sign that anything had been calculated.
    // The inset is the same device the objective's own report card uses for its
    // figures (insights-read.css § the synthesis box): a tint plus one big
    // numeral is how this app says "this number was computed for you".
    //
    // The small line under it carries what the figure is measured FROM, which is
    // the other half of the proposal and the thing a reader checks before
    // accepting it.
    const delta = pctDelta(state.baseline, state.target);
    const suggested = `<span class="ap-tag tagOrange">Suggested${delta != null && delta > 0 ? ` · +${delta}%` : ""}</span>`;
    let reading;
    if (state.baselineState !== "ready") {
      reading = `
        <div class="objc__proposal">
          <p class="objc__computing">
            <span class="ap-loader blue size-16" aria-hidden="true"><svg><circle></circle><circle></circle></svg></span>
            <span>${esc(computingLabel())}</span>
          </p>
        </div>`;
    } else {
      reading = `
        <div class="objc__proposal">
          <div class="objc__proposal-head">
            <span class="objc__proposal-figure">${esc(state.target || "—")}</span>
            ${suggested}
          </div>
          <p class="objc__proposal-sub">${
            rate
              ? `a bar to stay above — today ${esc(state.baseline || "—")}`
              : `from ${esc(state.baseline || "—")} today`
          }</p>
        </div>`;
    }
    // The type explainer was a boxed info note; it explains the target, so it
    // belongs under the target as helper text, not as a fourth bordered block.
    const readingCaption = rate
      ? `Today’s figure is your last 30 days. A rate has no “from” — the target is a bar to stay above.`
      : `Today’s figure is your last 30 days. A volume measure reads as progress toward its target.`;

    return `
      <div class="objc__cfg">
        <div class="objc__field">
          <span class="objc__fieldlabel">Profiles</span>
          <div class="objc__fieldbody">${profileField}</div>
        </div>
        <hr class="objc__rule" />
        <div class="objc__field">
          <span class="objc__fieldlabel">Target</span>
          <div class="objc__fieldbody">
            ${reading}
            <p class="objc__caption">${readingCaption}</p>
          </div>
        </div>
        <div class="objc__field">
          <span class="objc__fieldlabel">Window</span>
          <div class="objc__fieldbody">
            <div class="objc__chips">
              <button type="button" class="ap-filter-chip" aria-pressed="${state.windowMode === "inherit"}" data-objc-window="inherit"><span>Same as objective</span></button>
              <button type="button" class="ap-filter-chip" aria-pressed="${state.windowMode === "custom"}" data-objc-window="custom"><span>Rolling 30 days</span></button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // The dialog's own footer holds the actions in BOTH views — the config view
  // used to grow its own footer inside the scroll area, which left the real
  // .ap-dialog-footer rendering as an empty bordered band under it. The catalog
  // view had no way out at all but the X (which threw away the whole objective).
  function renderFooter() {
    if (state.view === "catalog") {
      return {
        left: "",
        right: `<button type="button" class="ap-button ghost grey" data-objc-cancel><span>Cancel</span></button>`,
      };
    }
    return {
      left: `<button type="button" class="ap-link standalone" data-objc-back><i class="ap-icon-chevron-left" aria-hidden="true"></i>Catalog</button>`,
      right: `
        <button type="button" class="ap-button ghost grey" data-objc-cancel><span>Cancel</span></button>
        <button type="button" class="ap-button primary orange" data-objc-add${state.baselineState !== "ready" ? " disabled" : ""}>
          <span>${esc(confirmLabel || `Add to ${targetLabel || "the objective"}`)}</span>
        </button>`,
    };
  }

  // The metric + its type ride in the dialog subtitle, not in a breadcrumb row.
  function subtitle() {
    return state.view === "config" ? `${metricLabel(state.metricId)} · ${metricTypeLabel(state.metricId)}` : "";
  }

  return {
    state,
    render() {
      return state.view === "catalog" ? renderCatalog() : renderConfig();
    },
    renderFooter,
    subtitle,
    // Returns true when the event was consumed by the flow.
    handleClick(event) {
      // A click anywhere but inside an open select closes it. Closing the DOM
      // node is enough for the scope select (picking re-renders it shut), but
      // the profile menu's open state is tracked, so clear that too or the next
      // render would pop it back open.
      const inSelect = event.target.closest("[data-objc-select]");
      if (!inSelect) state.profilesOpen = false;
      document.querySelectorAll("[data-objc-select][open]").forEach((d) => {
        if (d !== inSelect) d.removeAttribute("open");
      });
      // The multi-select's own toggle: drive it from state, not the native
      // <details>, so a re-render can put it back the way the user left it.
      const profilesToggle = event.target.closest("[data-objc-profiles-toggle]");
      if (profilesToggle) {
        event.preventDefault();
        state.profilesOpen = !state.profilesOpen;
        if (!state.profilesOpen) state.profileQuery = "";
        requestRender();
        return true;
      }
      const pick = event.target.closest("[data-objc-pick]");
      if (pick) {
        if (immediate) addNow(pick.dataset.objcPick);
        else pickMetric(pick.dataset.objcPick);
        return true;
      }
      const proxyPick = event.target.closest("[data-objc-proxy-pick]");
      if (proxyPick) {
        if (immediate) addNow(proxyPick.dataset.objcProxyPick);
        else pickMetric(proxyPick.dataset.objcProxyPick);
        return true;
      }
      if (event.target.closest("[data-objc-back]")) {
        if (state.timer) window.clearTimeout(state.timer);
        state.view = "catalog";
        requestRender();
        return true;
      }
      const net = event.target.closest("[data-objc-network]");
      if (net) {
        const n = net.dataset.objcNetwork;
        state.network = n === "all" ? null : n;
        state.profileIds = new Set(state.network ? profilesFor(state.network).map((p) => p.id) : []);
        recompute();
        return true;
      }
      // "All N <network> profiles" — per GROUP now, so it also sets which
      // network the measure is on. Not a two-way toggle: the scope can never be
      // empty (see below), so unchecking it would bounce straight back to all.
      const netAll = event.target.closest("[data-objc-net-all]");
      if (netAll) {
        state.network = netAll.dataset.objcNetAll;
        state.profileIds = new Set(profilesFor(state.network).map((p) => p.id));
        recompute();
        return true;
      }
      const prof = event.target.closest("[data-objc-profile]");
      if (prof) {
        const id = prof.dataset.objcProfile;
        const picked = getConnectedProfiles().find((p) => p.id === id);
        // A profile from ANOTHER network moves the measure there rather than
        // adding to the current scope: the model holds one network per measure
        // (§ the grouped control above). Its own group's ticks go with it —
        // which is what the caption warns about for the metrics that cannot be
        // summed across networks.
        if (picked && picked.platform !== state.network) {
          state.network = picked.platform;
          state.profileIds = new Set([id]);
          recompute();
          return true;
        }
        if (state.profileIds.has(id)) state.profileIds.delete(id);
        else state.profileIds.add(id);
        if (!state.profileIds.size) state.profileIds = new Set(profilesFor(state.network).map((p) => p.id));
        recompute();
        return true;
      }
      const win = event.target.closest("[data-objc-window]");
      if (win) {
        state.windowMode = win.dataset.objcWindow;
        requestRender();
        return true;
      }
      if (event.target.closest("[data-objc-add]")) {
        if (state.baselineState !== "ready") return true;
        onAdd({
          id: `m-${flowSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          metricId: state.metricId,
          scope: scope(),
          target: state.target || undefined,
          window: state.windowMode === "custom" ? { type: "rolling" } : undefined,
        });
        return true;
      }
      if (event.target.closest("[data-objc-cancel]")) {
        onBack?.();
        return true;
      }
      return false;
    },
    handleInput(event) {
      const profileSearch = event.target.closest("[data-objc-profile-search]");
      if (profileSearch) {
        state.profileQuery = profileSearch.value;
        requestRender({ preserveProfileSearch: true });
        return true;
      }
      const search = event.target.closest("[data-objc-search]");
      if (!search) return false;
      state.query = search.value;
      requestRender({ preserveSearch: true });
      return true;
    },
    dispose() {
      if (state.timer) window.clearTimeout(state.timer);
    },
  };
}

// ── Standalone wrapper (Playbook block edit mode) ────────────────────────────

const MODAL_ID = "objectiveCatalog";

let backdrop = null;
let panel = null;
let bodyEl = null;
let titleEl = null;
let subEl = null;
let footLeftEl = null;
let footRightEl = null;
let initialized = false;
let flow = null;
let onDone = null;

const SHELL = `
<div class="app-modal-backdrop objc__backdrop" id="objcBackdrop" hidden>
  <aside class="ap-dialog objc" id="objcModal" role="dialog" aria-modal="true" aria-label="Metric catalog" tabindex="-1">
    <div class="ap-dialog-header">
      <span class="ap-dialog-title" id="objcTitle">Add a measure</span>
      <span class="ap-dialog-subtitle" id="objcSub" hidden></span>
    </div>
    <button type="button" class="ap-dialog-close" data-objc-close aria-label="Close"><i class="ap-icon-close"></i></button>
    <div class="ap-dialog-content objc__content"></div>
    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left" id="objcFootLeft"></div>
      <div class="ap-dialog-footer-right" id="objcFootRight"></div>
    </div>
  </aside>
</div>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  backdrop = document.getElementById("objcBackdrop");
  panel = document.getElementById("objcModal");
  bodyEl = panel.querySelector(".objc__content");
  titleEl = document.getElementById("objcTitle");
  subEl = document.getElementById("objcSub");
  footLeftEl = document.getElementById("objcFootLeft");
  footRightEl = document.getElementById("objcFootRight");

  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-objc-close]")) {
      close();
      return;
    }
    flow?.handleClick(e);
  });
  panel.addEventListener("input", (e) => flow?.handleInput(e));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop && !backdrop.hidden) close();
  });
  window.addEventListener("hashchange", close);
  initialized = true;
}

// Typing re-renders, so the field being typed in has to be re-focused at the
// same caret. Two searchable fields now: the catalog's and the profile menu's.
export function searchSelectorFor(opts = {}) {
  if (opts.preserveProfileSearch) return "[data-objc-profile-search]";
  if (opts.preserveSearch) return "[data-objc-search]";
  return null;
}

function paint(opts = {}) {
  if (!flow) return;
  paintChrome();
  const sel = searchSelectorFor(opts);
  if (sel) {
    const el = bodyEl.querySelector(sel);
    const pos = el ? el.selectionStart : null;
    bodyEl.innerHTML = flow.render();
    const next = bodyEl.querySelector(sel);
    if (next && pos != null) {
      next.focus();
      next.setSelectionRange(pos, pos);
    }
    return;
  }
  bodyEl.innerHTML = flow.render();
}

// Title stays the task; the subtitle names the metric once one is picked.
function paintChrome() {
  const sub = flow.subtitle();
  subEl.textContent = sub;
  subEl.hidden = !sub;
  const foot = flow.renderFooter();
  footLeftEl.innerHTML = foot.left;
  footRightEl.innerHTML = foot.right;
}

export function open({ contextId, targetLabel, onAdd }) {
  init();
  requestOpen(MODAL_ID, close);
  onDone = onAdd;
  flow = createCatalogFlow({
    contextId,
    targetLabel,
    onAdd: (entry) => {
      const cb = onDone;
      close();
      cb?.(entry);
    },
    onBack: close,
    requestRender: paint,
  });
  titleEl.textContent = "Add a measure";
  paint();
  backdrop.hidden = false;
  panel.focus?.();
}

export function close() {
  if (!backdrop || backdrop.hidden) return;
  flow?.dispose();
  flow = null;
  onDone = null;
  backdrop.hidden = true;
  bodyEl.innerHTML = "";
  footLeftEl.innerHTML = "";
  footRightEl.innerHTML = "";
  subEl.hidden = true;
  notifyClose(MODAL_ID);
}
