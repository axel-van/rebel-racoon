import { html, raw } from "../utils.js?v=20";
import {
  getContexts,
  getContextById,
  addContext,
  updateContext,
  duplicateContext,
  deleteContext,
  subscribe as subscribeContexts,
} from "../contexts-store.js?v=24";
import { showToast } from "./toast.js?v=20";
import { open as openConfirmModal } from "./confirm-modal.js?v=20";

// Multi-context drawer (handoff §2.7).
//   • Slides in from the right edge, 480px wide
//   • Soft scrim behind that closes the drawer on click
//   • Left rail — list of every saved context (swatch + name + chat count)
//     + "+ New context" CTA at the top
//   • Right editor — Identity (name + color picker + isDefault toggle) +
//     Brand (single-line input) + Audience (textarea) + Brief (textarea)
//     + Tones (multi-select chips, max 3) + Do (list editor) +
//     Don't (list editor, red accent) + Default CTA (single-line input)
//   • Footer — dirty state + Close + Save (disabled until dirty)
//
// AI-assisted wizard mode (Q15) is a follow-up — today the editor is
// purely manual; the user can still launch the existing sidebar wizard
// from inside a session if they want guided fill.

const ROOT_ID = "contextDrawer";
const COLORS = ["orange", "blue", "green", "purple", "red", "yellow"];
const TONE_OPTIONS = [
  "Friendly",
  "Professional",
  "Bold",
  "Witty",
  "Inspirational",
  "Direct",
  "Conversational",
  "Authoritative",
];

let state = {
  open: false,
  focusId: null, // id of the context currently being edited
  draft: null, // local editor copy of the focused context (dirty state)
};
let unsubscribeStore = null;

export function init() {
  let scrim = document.getElementById(`${ROOT_ID}Scrim`);
  let aside = document.getElementById(ROOT_ID);
  if (!aside) {
    scrim = document.createElement("div");
    scrim.id = `${ROOT_ID}Scrim`;
    scrim.className = "context-drawer__scrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);

    aside = document.createElement("aside");
    aside.id = ROOT_ID;
    aside.className = "context-drawer";
    aside.setAttribute("aria-label", "Context manager");
    aside.hidden = true;
    document.body.appendChild(aside);
  }

  scrim.addEventListener("click", () => close({ confirm: true }));
  aside.addEventListener("click", onClick);
  aside.addEventListener("input", onInput);
  aside.addEventListener("change", onInput);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) {
      close({ confirm: true });
    }
  });
}

export function open(focusId = null) {
  const all = getContexts();
  const id = focusId || all[0]?.id || null;
  state = {
    open: true,
    focusId: id,
    draft: id ? cloneCtx(getContextById(id)) : null,
  };
  if (unsubscribeStore) unsubscribeStore();
  unsubscribeStore = subscribeContexts(() => {
    // External update (e.g. another surface mutated). Refresh the rail
    // without clobbering the user's current draft.
    if (state.open) renderDrawer();
  });
  renderDrawer();
}

export function close({ confirm = false } = {}) {
  // FIND-C2: route the dirty-discard prompt through the DS confirm-modal
  // instead of window.confirm so it matches the rest of the prototype's
  // confirmation chrome.
  if (confirm && isDirty()) {
    openConfirmModal({
      title: "Discard unsaved changes?",
      body: "Any tweaks you've made to this context will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true,
      onConfirm: () => doClose(),
    });
    return;
  }
  doClose();
}

function doClose() {
  state = { open: false, focusId: null, draft: null };
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
  renderDrawer();
}

function focusContext(id) {
  if (isDirty()) {
    openConfirmModal({
      title: "Discard unsaved changes?",
      body: "Switching to another context will drop your in-flight tweaks.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      danger: true,
      onConfirm: () => doFocusContext(id),
    });
    return;
  }
  doFocusContext(id);
}

function doFocusContext(id) {
  state.focusId = id;
  state.draft = cloneCtx(getContextById(id));
  renderDrawer();
}

function doCreateNewContext() {
  const created = addContext({ name: "Untitled context" });
  state.focusId = created.id;
  state.draft = cloneCtx(getContextById(created.id));
  renderDrawer();
}

function isDirty() {
  if (!state.draft || !state.focusId) return false;
  const original = getContextById(state.focusId);
  if (!original) return false;
  return (
    ["name", "color", "isDefault", "brandName", "audience", "briefSummary", "cta"].some(
      (k) => state.draft[k] !== original[k],
    ) ||
    !arraysEqual(state.draft.tones, original.tones) ||
    !arraysEqual(state.draft.doRules, original.doRules) ||
    !arraysEqual(state.draft.dontRules, original.dontRules)
  );
}

function arraysEqual(a, b) {
  if ((a?.length || 0) !== (b?.length || 0)) return false;
  for (let i = 0; i < (a?.length || 0); i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function cloneCtx(ctx) {
  if (!ctx) return null;
  return {
    id: ctx.id,
    name: ctx.name || "",
    color: ctx.color || "orange",
    isDefault: ctx.isDefault === true,
    brandName: ctx.brandName || "",
    audience: ctx.audience || "",
    briefSummary: ctx.briefSummary || "",
    tones: (ctx.tones || []).slice(),
    doRules: (ctx.doRules || []).slice(),
    dontRules: (ctx.dontRules || []).slice(),
    cta: ctx.cta || "",
  };
}

function onClick(event) {
  if (event.target.closest("[data-cdrawer-close]")) {
    close({ confirm: true });
    return;
  }
  if (event.target.closest("[data-cdrawer-new]")) {
    if (isDirty()) {
      openConfirmModal({
        title: "Discard unsaved changes?",
        body: "Starting a new context will drop your in-flight tweaks.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
        onConfirm: () => doCreateNewContext(),
      });
      return;
    }
    doCreateNewContext();
    return;
  }
  const railRow = event.target.closest("[data-cdrawer-focus]");
  if (railRow) {
    focusContext(railRow.dataset.cdrawerFocus);
    return;
  }
  const colorBtn = event.target.closest("[data-cdrawer-color]");
  if (colorBtn) {
    state.draft.color = colorBtn.dataset.cdrawerColor;
    renderDrawer();
    return;
  }
  const toneBtn = event.target.closest("[data-cdrawer-tone]");
  if (toneBtn) {
    const t = toneBtn.dataset.cdrawerTone;
    if (state.draft.tones.includes(t)) {
      state.draft.tones = state.draft.tones.filter((x) => x !== t);
    } else if (state.draft.tones.length < 3) {
      state.draft.tones = [...state.draft.tones, t];
    } else {
      showToast("Pick 1–3 tones — Studio blends them.");
      return;
    }
    renderDrawer();
    return;
  }
  if (event.target.closest("[data-cdrawer-add-do]")) {
    state.draft.doRules = [...state.draft.doRules, ""];
    renderDrawer();
    return;
  }
  if (event.target.closest("[data-cdrawer-add-dont]")) {
    state.draft.dontRules = [...state.draft.dontRules, ""];
    renderDrawer();
    return;
  }
  const removeDo = event.target.closest("[data-cdrawer-remove-do]");
  if (removeDo) {
    const idx = parseInt(removeDo.dataset.cdrawerRemoveDo, 10);
    state.draft.doRules = state.draft.doRules.filter((_, i) => i !== idx);
    renderDrawer();
    return;
  }
  const removeDont = event.target.closest("[data-cdrawer-remove-dont]");
  if (removeDont) {
    const idx = parseInt(removeDont.dataset.cdrawerRemoveDont, 10);
    state.draft.dontRules = state.draft.dontRules.filter((_, i) => i !== idx);
    renderDrawer();
    return;
  }
  if (event.target.closest("[data-cdrawer-save]")) {
    if (!isDirty()) return;
    updateContext(state.focusId, { ...state.draft, updatedAt: "just now" });
    showToast("Context saved");
    state.draft = cloneCtx(getContextById(state.focusId));
    renderDrawer();
    return;
  }
  if (event.target.closest("[data-cdrawer-duplicate]")) {
    const copy = duplicateContext(state.focusId);
    if (copy) {
      state.focusId = copy.id;
      state.draft = cloneCtx(getContextById(copy.id));
      showToast("Context duplicated");
      renderDrawer();
    }
    return;
  }
  if (event.target.closest("[data-cdrawer-delete]")) {
    if (getContexts().length <= 1) {
      showToast("Can't delete the last context — every chat needs one.");
      return;
    }
    const targetName = state.draft.name || "this context";
    const targetId = state.focusId;
    openConfirmModal({
      title: "Delete context?",
      body: `"${targetName}" will be removed. Chats currently referencing it will need a new context.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      danger: true,
      onConfirm: () => {
        deleteContext(targetId);
        showToast("Context deleted");
        const next = getContexts()[0];
        state.focusId = next?.id || null;
        state.draft = next ? cloneCtx(next) : null;
        renderDrawer();
      },
    });
  }
}

function onInput(event) {
  const t = event.target;
  if (!state.draft) return;
  if (t.matches("[data-cdrawer-field]")) {
    const field = t.dataset.cdrawerField;
    if (field === "isDefault") {
      state.draft.isDefault = t.checked;
    } else {
      state.draft[field] = t.value;
    }
    // Light repaint — rail name + footer dirty state. Avoid a full repaint
    // so input focus + cursor position stay alive while typing.
    syncRailNameAndDirty();
    return;
  }
  if (t.matches("[data-cdrawer-do-input]")) {
    const idx = parseInt(t.dataset.cdrawerDoInput, 10);
    state.draft.doRules[idx] = t.value;
    syncRailNameAndDirty();
    return;
  }
  if (t.matches("[data-cdrawer-dont-input]")) {
    const idx = parseInt(t.dataset.cdrawerDontInput, 10);
    state.draft.dontRules[idx] = t.value;
    syncRailNameAndDirty();
  }
}

function syncRailNameAndDirty() {
  const railName = document.querySelector(`[data-cdrawer-focus="${state.focusId}"] .context-drawer__rail-name`);
  if (railName) railName.textContent = state.draft.name || "Untitled";
  const dirtyEl = document.querySelector("[data-cdrawer-dirty]");
  if (dirtyEl) dirtyEl.textContent = isDirty() ? "Unsaved changes" : "All changes saved";
  const saveBtn = document.querySelector("[data-cdrawer-save]");
  if (saveBtn) saveBtn.disabled = !isDirty();
}

function renderDrawer() {
  const aside = document.getElementById(ROOT_ID);
  const scrim = document.getElementById(`${ROOT_ID}Scrim`);
  if (!aside || !scrim) return;
  if (!state.open) {
    aside.hidden = true;
    scrim.hidden = true;
    aside.innerHTML = "";
    return;
  }
  aside.hidden = false;
  scrim.hidden = false;
  aside.innerHTML = renderInner();
}

function renderInner() {
  const all = getContexts();
  const draft = state.draft;
  if (!draft) {
    // FIND-B7: align with the settings-drawer Contexts empty state
    // (icon + title + body + CTA) so the two surfaces read identically
    // when the user lands on either with zero contexts saved. The
    // wrapper class stays specific to the drawer for layout.
    return html`
      <div class="context-drawer__empty">
        <div class="context-drawer__empty-icon">
          <i class="ap-icon-target lg"></i>
        </div>
        <h3 class="text-subtitle">No contexts yet</h3>
        <p class="muted">
          Define brand, audience, brief and tone of voice — Archie applies it to every draft you ask it to make.
        </p>
        <div class="context-drawer__empty-action">
          <button type="button" class="ap-button primary orange" data-cdrawer-new>
            <i class="ap-icon-plus"></i><span>Create your first context</span>
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <header class="context-drawer__head">
      <div>
        <div class="context-drawer__head-title"><i class="ap-icon-target"></i> Contexts</div>
        <div class="context-drawer__head-sub">
          Define brand, audience, brief and tone — Archie applies it to every draft.
        </div>
      </div>
      <button type="button" class="ap-icon-button transparent" data-cdrawer-close aria-label="Close drawer (Esc)">
        <i class="ap-icon-close"></i>
      </button>
    </header>

    <div class="context-drawer__split">${raw(renderRail(all, draft))} ${raw(renderEditor(draft))}</div>

    <footer class="context-drawer__foot">
      <span class="context-drawer__dirty" data-cdrawer-dirty
        >${isDirty() ? "Unsaved changes" : "All changes saved"}</span
      >
      <div class="context-drawer__foot-actions">
        <button type="button" class="ap-button transparent grey" data-cdrawer-close>Close</button>
        <button type="button" class="ap-button primary orange" data-cdrawer-save ${isDirty() ? "" : "disabled"}>
          Save context
        </button>
      </div>
    </footer>
  `;
}

function renderRail(all, draft) {
  const rows = all
    .map(
      (c) => `
        <button
          type="button"
          class="context-drawer__rail-row ${c.id === draft.id ? "is-on" : ""}"
          data-cdrawer-focus="${c.id}"
        >
          <span class="context-drawer__rail-swatch context-drawer__rail-swatch--${c.color || "orange"}"></span>
          <span class="context-drawer__rail-text">
            <span class="context-drawer__rail-name">${escapeText(c.name)}</span>
            <span class="context-drawer__rail-meta">${c.usedIn || 0} ${(c.usedIn || 0) === 1 ? "chat" : "chats"}</span>
          </span>
        </button>
      `,
    )
    .join("");
  return `
    <nav class="context-drawer__rail" aria-label="All contexts">
      <button type="button" class="context-drawer__rail-new" data-cdrawer-new>
        <i class="ap-icon-plus"></i><span>New context</span>
      </button>
      <div class="context-drawer__rail-list">${rows}</div>
    </nav>
  `;
}

function renderEditor(draft) {
  const colorPicker = COLORS.map(
    (c) => `
      <button
        type="button"
        class="context-drawer__color context-drawer__color--${c} ${draft.color === c ? "is-on" : ""}"
        data-cdrawer-color="${c}"
        title="${c}"
        aria-label="Color ${c}"
      ></button>
    `,
  ).join("");
  const tonePicker = TONE_OPTIONS.map(
    (t) => `
      <button
        type="button"
        class="context-drawer__tone ${draft.tones.includes(t) ? "is-on" : ""}"
        data-cdrawer-tone="${t}"
      >${t}</button>
    `,
  ).join("");
  const doRows = (draft.doRules || [])
    .map(
      (d, i) => `
        <div class="context-drawer__row">
          <input
            class="ap-input"
            value="${escapeAttr(d)}"
            data-cdrawer-do-input="${i}"
            placeholder="Add a Do rule…"
          />
          <button type="button" class="ap-icon-button transparent" data-cdrawer-remove-do="${i}" aria-label="Remove">
            <i class="ap-icon-close"></i>
          </button>
        </div>
      `,
    )
    .join("");
  const dontRows = (draft.dontRules || [])
    .map(
      (d, i) => `
        <div class="context-drawer__row context-drawer__row--dont">
          <input
            class="ap-input"
            value="${escapeAttr(d)}"
            data-cdrawer-dont-input="${i}"
            placeholder="Add a Don't rule…"
          />
          <button type="button" class="ap-icon-button transparent" data-cdrawer-remove-dont="${i}" aria-label="Remove">
            <i class="ap-icon-close"></i>
          </button>
        </div>
      `,
    )
    .join("");

  return `
    <div class="context-drawer__editor">
      <div class="context-drawer__editor-head">
        <input
          class="context-drawer__name-input"
          value="${escapeAttr(draft.name)}"
          placeholder="Context name (e.g. Q2 launch · Acme)"
          data-cdrawer-field="name"
        />
        <div class="context-drawer__head-actions">
          <button type="button" class="ap-icon-button transparent" data-cdrawer-duplicate aria-label="Duplicate" title="Duplicate">
            <i class="ap-icon-copy"></i>
          </button>
          <button type="button" class="ap-icon-button transparent" data-cdrawer-delete aria-label="Delete" title="Delete">
            <i class="ap-icon-trash"></i>
          </button>
        </div>
      </div>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Color tag</legend>
        <div class="context-drawer__colors">${colorPicker}</div>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Brand</legend>
        <input
          class="ap-input"
          value="${escapeAttr(draft.brandName)}"
          placeholder="e.g. Acme"
          data-cdrawer-field="brandName"
        />
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Audience</legend>
        <p class="context-drawer__hint">Who you're writing for. Affects vocabulary, examples, references.</p>
        <textarea
          class="ap-textarea"
          rows="3"
          placeholder="Operators and marketing leads at 50–200-person B2B startups…"
          data-cdrawer-field="audience"
        >${escapeText(draft.audience)}</textarea>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Current brief</legend>
        <p class="context-drawer__hint">What posts in this context should accomplish. Update per campaign.</p>
        <textarea
          class="ap-textarea"
          rows="4"
          placeholder="Drive awareness for the Q2 launch…"
          data-cdrawer-field="briefSummary"
        >${escapeText(draft.briefSummary)}</textarea>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Tone of voice</legend>
        <p class="context-drawer__hint">Pick 1–3. Archie blends them.</p>
        <div class="context-drawer__tones">${tonePicker}</div>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Do</legend>
        <p class="context-drawer__hint">Patterns we always follow.</p>
        <div class="context-drawer__list">
          ${doRows}
          <button type="button" class="ap-button transparent grey" data-cdrawer-add-do>
            <i class="ap-icon-plus"></i><span>Add rule</span>
          </button>
        </div>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend context-drawer__legend--dont">Don't</legend>
        <p class="context-drawer__hint">Patterns we never use.</p>
        <div class="context-drawer__list">
          ${dontRows}
          <button type="button" class="ap-button transparent grey" data-cdrawer-add-dont>
            <i class="ap-icon-plus"></i><span>Add rule</span>
          </button>
        </div>
      </fieldset>

      <fieldset class="context-drawer__field">
        <legend class="context-drawer__legend">Default CTA</legend>
        <input
          class="ap-input"
          value="${escapeAttr(draft.cta)}"
          placeholder="Optional. Archie weaves this into drafts."
          data-cdrawer-field="cta"
        />
      </fieldset>
    </div>
  `;
}

function escapeText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(str) {
  return escapeText(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
