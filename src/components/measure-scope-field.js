// ---- A measure's SCOPE, as a control where the card already printed it ------
//
// ⚠️ This was a SCREEN. The objective modal's measure card carried the scope as
// dead text in its supporting line ("all networks", "3 LinkedIn profiles"), and
// changing it meant the pencil → a full-dialog metric catalogue → a "Change
// measure" configurator with Profiles, Target and Window in it → confirm. Four
// steps and two views to answer a question the card was already displaying the
// answer to, reachable only from a 24px pencil glyph. "Ça n'a aucun sens de
// cacher toute cette configuration dans une modale différente difficile d'accès
// juste par le pencil" — so the text became the control, in place, and the
// pencil went away with the configurator.
//
// The other two fields of that configurator are not moved here, because they
// were already on the card twice over: the TARGET is the card's own second
// input (and its suggestion the meta line's `Suggested · +22%`), and the
// per-measure WINDOW override is rendered by the card itself — only when the
// objective's own window is fixed, since against a rolling objective the two
// options say the same thing.
//
// Pure render + a pure reducer: the host owns the open/query UI state and the
// draft, so this file holds no state and no listeners.

import { escapeHtml as esc } from "../utils.js?v=1209";
import {
  NETWORK_LABEL,
  getConnectedProfiles,
  renderProfileTag,
  PROFILE_SEARCH_THRESHOLD,
} from "../social-profiles.js?v=1209";
import { isAdditiveMetric, metricLabel } from "../objective-measures.js?v=1209";

function profilesFor(network) {
  return getConnectedProfiles().filter((p) => p.platform === network);
}

// Networks in the order the profile list names them — the same order every
// other profile surface in the app shows.
function networksInOrder() {
  const out = [];
  getConnectedProfiles().forEach((p) => {
    if (!out.includes(p.platform)) out.push(p.platform);
  });
  return out;
}

// The scope, resolved to a set of ids. A scope with no `profileIds` means EVERY
// profile of its network (that is how the model stores "all of them"), and no
// scope at all means every network — `null` here, not an empty set, so the two
// cases can never be confused for one another.
function pickedIds(scope) {
  if (!scope?.network) return null;
  const all = profilesFor(scope.network);
  return new Set(scope.profileIds?.length ? scope.profileIds : all.map((p) => p.id));
}

// The trigger says the NETWORK and the count — never a run of profile chips.
// Two handles plus "+5" told the reader neither which network the measure is on
// nor how many profiles it covers, which are the only two facts a scope has.
export function scopeTriggerText(scope) {
  const all = getConnectedProfiles();
  if (!scope?.network) return `Every connected profile · ${all.length}`;
  const netName = NETWORK_LABEL[scope.network] || scope.network;
  const profiles = profilesFor(scope.network);
  const picked = pickedIds(scope);
  const n = profiles.filter((p) => picked.has(p.id)).length;
  if (n === profiles.length) return `${netName} · all ${profiles.length} profile${profiles.length === 1 ? "" : "s"}`;
  return `${netName} · ${n} of ${profiles.length} profiles`;
}

// The inert box: the row's click handler owns the toggle and the whole field
// re-renders from the draft, so the checkbox can never disagree with the scope.
function checkbox(on) {
  return `<span class="ap-checkbox-container ap-select-option-checkbox" aria-hidden="true"><input type="checkbox" tabindex="-1"${on ? " checked" : ""} /><i></i></span>`;
}

// ── ONE control: the profiles, GROUPED BY NETWORK ──────────────────────────
//
// ⚠️ It was TWO fields — `Measure on [network]` then `Profiles [multi]` — and
// the second was the first restated: a network IS its profiles, so the reader
// answered one question twice. Picking profiles says which network without
// being asked.
//
// The DS ships the grouped list (`.ap-select-group` + `-group-label`), so this
// is its own primitive and not a nested menu — ADS has no flyout, and sections
// plus a divider is the documented way to group options.
//
// ONE NETWORK AT A TIME, because that is exactly what the model holds: a scope
// is `{ network, profileIds? }` and every read of it is guarded by
// `scope?.network`. So picking a profile in another group MOVES the measure to
// that network rather than adding to it — the note at the foot of the menu says
// so for the metrics that cannot be summed. The cross-network case keeps its
// own row at the top (`Every connected profile`), the old "All networks", and
// stays locked to metrics that add up.
export function renderScopeField({ metricId, scope, i, open = false, query = "" }) {
  const all = getConnectedProfiles();
  const triggerText = scopeTriggerText(scope);

  // One profile is not a choice — a lone row you cannot uncheck is a control
  // that does nothing. Name WHO it is instead, through the same
  // `renderProfileTag` (DS avatar + corner network badge) every other profile
  // surface uses.
  if (all.length <= 1) {
    return `<span class="objm__scopeone">${all[0] ? renderProfileTag(all[0]) : "no profile connected"}</span>`;
  }

  const additive = isAdditiveMetric(metricId);
  const groups = networksInOrder()
    .map((n) => ({ network: n, profiles: profilesFor(n) }))
    .filter((g) => g.profiles.length);
  const picked = pickedIds(scope);
  const everyNetwork = !scope?.network;
  const q = query.trim().toLowerCase();
  const matches = (p) => !q || `${p.handle || ""} ${p.name || ""}`.toLowerCase().includes(q);

  const groupRows = groups
    .map((g) => {
      const shown = g.profiles.filter(matches);
      if (!shown.length) return "";
      const onThisNet = scope?.network === g.network;
      const netAll = onThisNet && g.profiles.every((p) => picked.has(p.id));
      const label = NETWORK_LABEL[g.network] || g.network;
      // A whole-network row per group, for the same reason a flat list needed
      // one: ticking forty profiles by hand is not an option. Hidden while
      // searching, where "all" would mean "all of the matches".
      const allRow =
        q || g.profiles.length < 2
          ? ""
          : `<div class="ap-select-option objm__scopeopt" role="option" aria-selected="${netAll}" data-mscope-net-all="${esc(g.network)}">
               ${checkbox(netAll)}<span>All ${g.profiles.length} ${esc(label)} profiles</span>
             </div>`;
      const rows = shown
        .map((pf) => {
          const on = onThisNet && picked.has(pf.id);
          return `
            <div class="ap-select-option objm__scopeopt" role="option" aria-selected="${on}" data-mscope-profile="${esc(pf.id)}">
              ${checkbox(on)}${renderProfileTag(pf)}
            </div>`;
        })
        .join("");
      return `<div class="ap-select-group"><span class="ap-select-group-label">${esc(label)}</span></div>${allRow}${rows}`;
    })
    .join("");

  // `Every connected profile` stays a deliberate act: a metric that cannot be
  // summed across networks keeps it disabled. Not a feature-lock (purple + a
  // padlock reads as "upgrade to unlock", a promise this can never keep) —
  // just a disabled option, with the reason at the foot of the menu.
  //
  // ⚠️ Disabled and still TICKED when it is where the measure already is. No
  // scope at all is the model's default, so a seeded or freshly added measure
  // on a non-summable metric (Reach dedupes; the demo objective measures it)
  // legitimately sits on every network — and a menu whose trigger reads "Every
  // connected profile · 40" over an unchecked row of the same name is the UI
  // contradicting itself. So the row says where you are; disabled says you
  // cannot come back to it; the note says where picking a profile takes you.
  // A one-way door, which is what the model actually offers.
  const everyRow =
    q || groups.length < 2
      ? ""
      : additive
        ? `<div class="ap-select-all objm__scopeall" role="option" aria-selected="${everyNetwork}" data-mscope-every>
             ${checkbox(everyNetwork)}<span>Every connected profile · ${all.length}</span>
           </div>
           <div class="ap-select-divider"></div>`
        : `<div class="ap-select-all objm__scopeall disabled" aria-disabled="true" aria-selected="${everyNetwork}">
             ${checkbox(everyNetwork)}<span>Every connected profile${everyNetwork ? ` · ${all.length}` : ""}</span>
           </div>
           <div class="ap-select-divider"></div>`;

  // The note explains the row above it, so it lives in the menu — visible only
  // while the reader is making the choice it constrains, and never a caption
  // under the card competing with the measure's own supporting line.
  const note =
    additive || groups.length < 2
      ? ""
      : `<p class="objm__scopenote">${esc(metricLabel(metricId))} can’t be summed across networks — picking a profile from another one moves the measure there.</p>`;

  const searchable = all.length > PROFILE_SEARCH_THRESHOLD;

  return `
    <details class="ap-select objm__scope" data-objm-select data-mscope-i="${i}"${open ? " open" : ""}>
      <summary class="ap-select-trigger" data-mscope-toggle="${i}">
        <span class="ap-select-value">${esc(triggerText)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-multiselectable="true">
        ${
          searchable
            ? `<div class="ap-select-search">
                 <i class="ap-icon-search ap-select-search-icon" aria-hidden="true"></i>
                 <input class="ap-select-search-input" type="text" data-mscope-search value="${esc(query)}" placeholder="Search profiles…" aria-label="Search profiles" />
               </div>`
            : ""
        }
        ${everyRow}
        <div class="ap-select-options">
          ${groupRows || `<p class="ap-select-not-found">No profile matches “${esc(query)}”.</p>`}
        </div>
        ${note}
      </div>
    </details>`;
}

// ── The reducer ────────────────────────────────────────────────────────────
//
// Returns `{ scope }` when the click landed on one of the menu's rows, else
// null. `scope` is `undefined` for "every network", which is what the model
// stores — so the host assigns it straight onto the entry.
export function scopeFromClick(event, scope) {
  const every = event.target.closest("[data-mscope-every]");
  if (every) return { scope: undefined };

  const netAll = event.target.closest("[data-mscope-net-all]");
  if (netAll) return { scope: { network: netAll.dataset.mscopeNetAll } };

  const prof = event.target.closest("[data-mscope-profile]");
  if (!prof) return null;
  const id = prof.dataset.mscopeProfile;
  const picked = getConnectedProfiles().find((p) => p.id === id);
  if (!picked) return null;

  // A profile from ANOTHER network moves the measure there rather than adding
  // to the current scope: the model holds one network per measure. It arrives
  // with that one profile, because that is the profile the reader clicked.
  if (picked.platform !== scope?.network) {
    return { scope: { network: picked.platform, profileIds: [id] } };
  }

  const network = scope.network;
  const all = profilesFor(network).map((p) => p.id);
  const next = new Set(pickedIds(scope));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  // A scope can never be empty — it would measure nothing — so unticking the
  // last one means the whole network, which is also how "all of them" is
  // stored: no `profileIds` at all rather than a list of every id.
  if (!next.size || next.size === all.length) return { scope: { network } };
  return { scope: { network, profileIds: all.filter((pid) => next.has(pid)) } };
}
