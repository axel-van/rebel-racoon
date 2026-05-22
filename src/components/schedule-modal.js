import { html, raw } from "../utils.js?v=20";
import { showToast } from "./toast.js?v=20";

// Schedule modal (handoff §3.5).
//   • Centered, 720px wide, radius 16, shadow large
//   • Header: "Schedule {N} posts" + close
//   • Mode picker: Daily (one per day, 9am) / Optimal times / Manual
//   • Body: per-post slot row with a <input type="datetime-local"> + post
//     preview (network logo + first text line)
//   • Footer: Cancel + "Schedule {N} posts" primary
//
// Per Q9 the mock end-to-end is the entire scope — confirm flags the
// posts as scheduled in the right-panel local state and fires a toast.
// A real Publishing API call is the replacement point.

const ROOT_ID = "scheduleModal";

let state = {
  open: false,
  posts: [], // [{id, network, text}]
  slots: [], // [{post, when: epoch ms}]
  mode: "daily",
  onConfirm: null,
  // FIND-D3: track the scheduling phase so the user gets feedback while
  // the (currently mocked) confirm callback runs and so a real backend
  // failure can surface inline instead of vanishing into a no-op toast.
  status: "idle", // 'idle' | 'scheduling' | 'error'
  errorMessage: "",
};

const NETWORK_ICON = {
  linkedin: "ap-icon-linkedin",
  twitter: "ap-icon-twitter-official",
  x: "ap-icon-twitter-official",
  instagram: "ap-icon-instagram",
  facebook: "ap-icon-facebook",
  tiktok: "ap-icon-tiktok-official",
};

const NETWORK_NAME = {
  linkedin: "LinkedIn",
  twitter: "X",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function init() {
  let scrim = document.getElementById(`${ROOT_ID}Scrim`);
  let modal = document.getElementById(ROOT_ID);
  if (!modal) {
    scrim = document.createElement("div");
    scrim.id = `${ROOT_ID}Scrim`;
    scrim.className = "schedule-modal__scrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);

    modal = document.createElement("div");
    modal.id = ROOT_ID;
    modal.className = "schedule-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Schedule posts");
    modal.hidden = true;
    document.body.appendChild(modal);
  }

  scrim.addEventListener("click", () => close());
  modal.addEventListener("click", onClick);
  modal.addEventListener("input", onInput);
  modal.addEventListener("change", onInput);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) {
      close();
    }
  });
}

export function open({ posts, onConfirm }) {
  if (!posts || posts.length === 0) return;
  state = {
    open: true,
    posts,
    mode: "daily",
    slots: defaultDailySlots(posts),
    onConfirm: typeof onConfirm === "function" ? onConfirm : null,
    status: "idle",
    errorMessage: "",
  };
  render();
}

function close() {
  state = {
    open: false,
    posts: [],
    slots: [],
    mode: "daily",
    onConfirm: null,
    status: "idle",
    errorMessage: "",
  };
  render();
}

function defaultDailySlots(posts) {
  // One per day starting tomorrow at 9am.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return posts.map((p, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { post: p, when: d.getTime() };
  });
}

function optimalSlots(posts) {
  // 3 optimal hours per day, cycling through posts. Mirrors the handoff
  // optimal pattern (9am / 1pm / 5pm).
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const optimalHours = [9, 13, 17];
  return posts.map((p, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.floor(i / 3));
    d.setHours(optimalHours[i % 3], 0, 0, 0);
    return { post: p, when: d.getTime() };
  });
}

function onClick(event) {
  if (event.target.closest("[data-schedule-close]")) {
    close();
    return;
  }
  const modeBtn = event.target.closest("[data-schedule-mode]");
  if (modeBtn) {
    state.mode = modeBtn.dataset.scheduleMode;
    if (state.mode === "daily") state.slots = defaultDailySlots(state.posts);
    else if (state.mode === "optimal") state.slots = optimalSlots(state.posts);
    // Manual mode: keep current slots, user edits each row.
    render();
    return;
  }
  if (event.target.closest("[data-schedule-confirm]")) {
    if (state.status === "scheduling") return; // ignore double-click
    confirmSchedule();
  }
}

// FIND-D3: drive the confirm through a small async wrapper so we can:
//   • disable the CTA + paint the spinner while it runs
//   • catch a downstream onConfirm throw + surface an inline error
//     with retry-able state instead of silently closing on success
//
// onConfirm may itself be async (a real publishing API). We treat it as
// thenable to support both shapes.
function confirmSchedule() {
  state.status = "scheduling";
  state.errorMessage = "";
  render();

  const slots = state.slots.map((s) => ({ postId: s.post.id, when: s.when }));
  let result;
  try {
    result = state.onConfirm ? state.onConfirm(slots) : undefined;
  } catch (err) {
    onConfirmFailed(err);
    return;
  }

  if (result && typeof result.then === "function") {
    Promise.resolve(result).then(() => onConfirmSucceeded(slots), onConfirmFailed);
  } else {
    onConfirmSucceeded(slots);
  }
}

function onConfirmSucceeded(slots) {
  showToast(`${slots.length} ${slots.length === 1 ? "post" : "posts"} scheduled`);
  close();
}

function onConfirmFailed(err) {
  // eslint-disable-next-line no-console
  console.error("schedule-modal: confirm failed", err);
  state.status = "error";
  state.errorMessage = (err && err.message) || "Couldn't schedule these posts. Try again.";
  render();
}

function onInput(event) {
  const slotInput = event.target.closest("[data-schedule-slot]");
  if (slotInput) {
    const idx = parseInt(slotInput.dataset.scheduleSlot, 10);
    const ts = new Date(slotInput.value).getTime();
    if (!isNaN(ts)) {
      state.slots[idx] = { ...state.slots[idx], when: ts };
      // Manual edit implies Manual mode (otherwise the slot would be
      // recomputed on the next mode flip).
      state.mode = "manual";
      // Light repaint of just the active mode pill — avoid losing focus
      // on the input the user is currently typing into.
      syncModeOnly();
    }
  }
}

function syncModeOnly() {
  document.querySelectorAll("[data-schedule-mode]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.scheduleMode === state.mode);
  });
}

function render() {
  const scrim = document.getElementById(`${ROOT_ID}Scrim`);
  const modal = document.getElementById(ROOT_ID);
  if (!scrim || !modal) return;
  if (!state.open) {
    scrim.hidden = true;
    modal.hidden = true;
    modal.innerHTML = "";
    return;
  }
  scrim.hidden = false;
  modal.hidden = false;
  modal.innerHTML = renderInner();
}

function renderInner() {
  const n = state.posts.length;
  const rows = state.slots
    .map((s, i) => {
      const network = s.post.network || "linkedin";
      const text = (s.post.preview || s.post.text || "").toString();
      const oneLine = text.split("\n")[0] || text;
      return `
        <div class="schedule-modal__slot">
          <div class="schedule-modal__slot-when">
            <input
              type="datetime-local"
              class="ap-input"
              value="${toLocalInput(s.when)}"
              data-schedule-slot="${i}"
            />
          </div>
          <div class="schedule-modal__slot-post">
            <div class="schedule-modal__slot-head">
              <i class="${NETWORK_ICON[network] || "ap-icon-megaphone"}" aria-hidden="true"></i>
              <span class="schedule-modal__slot-net">${NETWORK_NAME[network] || network}</span>
            </div>
            <div class="schedule-modal__slot-text">${escapeText(oneLine)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  return html`
    <header class="schedule-modal__head">
      <div>
        <div class="schedule-modal__title">Schedule ${n} ${n === 1 ? "post" : "posts"}</div>
        <div class="schedule-modal__sub">
          Pick when each post should publish. Archie can spread them automatically across optimal times.
        </div>
      </div>
      <button type="button" class="ap-icon-button transparent" data-schedule-close aria-label="Close (Esc)">
        <i class="ap-icon-close"></i>
      </button>
    </header>

    <div class="schedule-modal__modes" role="tablist">
      <button
        type="button"
        class="schedule-modal__mode ${state.mode === "daily" ? "is-on" : ""}"
        data-schedule-mode="daily"
        role="tab"
        aria-selected="${state.mode === "daily"}"
      >
        <span class="schedule-modal__mode-title">Daily</span>
        <span class="schedule-modal__mode-sub">One per day, 9am</span>
      </button>
      <button
        type="button"
        class="schedule-modal__mode ${state.mode === "optimal" ? "is-on" : ""}"
        data-schedule-mode="optimal"
        role="tab"
        aria-selected="${state.mode === "optimal"}"
      >
        <span class="schedule-modal__mode-title">Optimal times</span>
        <span class="schedule-modal__mode-sub">When your audience is most active</span>
      </button>
      <button
        type="button"
        class="schedule-modal__mode ${state.mode === "manual" ? "is-on" : ""}"
        data-schedule-mode="manual"
        role="tab"
        aria-selected="${state.mode === "manual"}"
      >
        <span class="schedule-modal__mode-title">Manual</span>
        <span class="schedule-modal__mode-sub">Pick each time below</span>
      </button>
    </div>

    <div class="schedule-modal__body">${raw(rows)}</div>

    ${state.status === "error"
      ? raw(`
          <div class="ap-infobox error schedule-modal__error" role="alert">
            <i class="ap-icon-error_fill" aria-hidden="true"></i>
            <div class="ap-infobox-content">
              <div class="ap-infobox-texts">
                <span class="ap-infobox-message">${escapeText(state.errorMessage)}</span>
              </div>
            </div>
          </div>
        `)
      : ""}

    <footer class="schedule-modal__foot">
      <span class="schedule-modal__foot-disclosure"> Posts will publish to your connected accounts. </span>
      <div class="schedule-modal__foot-actions">
        <button
          type="button"
          class="ap-button transparent grey"
          data-schedule-close
          ${state.status === "scheduling" ? "disabled" : ""}
        >
          Cancel
        </button>
        <button
          type="button"
          class="ap-button primary orange"
          data-schedule-confirm
          ${state.status === "scheduling" ? "disabled" : ""}
        >
          ${state.status === "scheduling"
            ? raw(`<span class="schedule-modal__spinner" aria-hidden="true"></span><span>Scheduling…</span>`)
            : raw(
                `<i class="ap-icon-calendar"></i><span>${state.status === "error" ? "Try again" : `Schedule ${n} ${n === 1 ? "post" : "posts"}`}</span>`,
              )}
        </button>
      </div>
    </footer>
  `;
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
