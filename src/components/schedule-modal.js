import { html, raw } from "../utils.js?v=20";
import { showToast } from "./toast.js?v=20";
import {
  getQueue,
  getQueueOn,
  busyCountsByDay,
  dayKey,
  addToQueue,
  subscribe as subscribeQueue,
} from "../schedule-store.js?v=1";

// Schedule modal (multi-draft).
//   • 960px wide, two-column body
//   • Left  — Mode picker (Optimal / Custom) + one slot row per draft
//              (network glyph + first line + datetime input + remove)
//   • Right — Month calendar with dots on days that already have
//              scheduled posts (seeded queue + posts scheduled this
//              session). Click a day to see its existing list.
//   • Footer — Cancel + primary "Schedule N drafts"
//
// "Optimal times" uses a per-network suggested map (PER_NETWORK_OPTIMAL)
// and falls back to a generic spread. We skip slots that would collide
// with an already-busy day for the same network so the spread feels
// smart rather than naive.
//
// The mock end-to-end is the entire scope — confirm pushes new entries
// into schedule-store, marks the source posts as scheduled, fires a
// toast. Real Publishing API call is the replacement point.

const ROOT_ID = "scheduleModal";

let state = {
  open: false,
  posts: [], // [{id, network, text/preview}]
  slots: [], // [{post, when: epoch ms}]
  mode: "optimal", // 'optimal' | 'custom'
  onConfirm: null,
  status: "idle", // 'idle' | 'scheduling' | 'error'
  errorMessage: "",
  calendarMonth: null, // Date pinned to the 1st of the visible month
  focusedDayKey: null, // string from dayKey()
};

let unsubscribeQueue = null;

// DS branded network glyphs — the `-official` variants carry each
// network's brand color. The generic `ap-icon-<network>` set is grey
// and meant for inline-text usage, not for identifying a profile or
// destination in a scheduling list.
const NETWORK_ICON = {
  linkedin: "ap-icon-linkedin-official",
  twitter: "ap-icon-twitter-official",
  x: "ap-icon-x-official",
  instagram: "ap-icon-instagram-official",
  facebook: "ap-icon-facebook-official",
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

// Per-network suggested publishing windows. Each entry lists
// { dow: [0..6 sunday-first], hours: [24h]} — the optimal picker walks
// the upcoming days and finds the next dow/hour combo that isn't
// already busy for that network. These mirror the kind of static
// benchmarks a publishing tool ships with out of the box.
const PER_NETWORK_OPTIMAL = {
  linkedin: { dow: [2, 3, 4], hours: [9, 12] }, // Tue/Wed/Thu, 9 + noon
  twitter: { dow: [1, 2, 3, 4, 5], hours: [10, 14, 17] },
  x: { dow: [1, 2, 3, 4, 5], hours: [10, 14, 17] },
  instagram: { dow: [2, 4, 0], hours: [11, 19] }, // Tue/Thu/Sun
  facebook: { dow: [1, 3, 5], hours: [13, 16] }, // Mon/Wed/Fri
  tiktok: { dow: [2, 3, 4], hours: [18, 20, 22] },
};

const FALLBACK_OPTIMAL = { dow: [1, 2, 3, 4, 5], hours: [9, 13, 17] };

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
    modal.className = "schedule-modal schedule-modal--wide";
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
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const slots = optimalSlots(posts);
  state = {
    open: true,
    posts,
    mode: "optimal",
    slots,
    onConfirm: typeof onConfirm === "function" ? onConfirm : null,
    status: "idle",
    errorMessage: "",
    calendarMonth: monthStart,
    focusedDayKey: slots[0] ? dayKey(slots[0].when) : dayKey(today.getTime()),
  };
  if (!unsubscribeQueue) {
    unsubscribeQueue = subscribeQueue(() => {
      if (state.open) render();
    });
  }
  render();
}

function close() {
  state = {
    open: false,
    posts: [],
    slots: [],
    mode: "optimal",
    onConfirm: null,
    status: "idle",
    errorMessage: "",
    calendarMonth: null,
    focusedDayKey: null,
  };
  if (unsubscribeQueue) {
    unsubscribeQueue();
    unsubscribeQueue = null;
  }
  render();
}

// ── Optimal slot picker ───────────────────────────────────────────────
// Walks forward day-by-day and tries each network's preferred (dow,
// hour) cells in order. Skips a cell if the queue already has 2+ posts
// in the same day to spread load. Falls back to the generic spread if
// the network has no map. Bound is 60 days so a pathological mock can't
// loop forever.
function optimalSlots(posts) {
  const queue = getQueue();
  const busy = busyCountsByDay();
  const usedSlotKeys = new Set();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return posts.map((p, idx) => {
    const network = (p.network || "linkedin").toLowerCase();
    const map = PER_NETWORK_OPTIMAL[network] || FALLBACK_OPTIMAL;
    const offsetStart = Math.floor(idx / map.hours.length);
    for (let d = offsetStart; d < offsetStart + 60; d++) {
      const day = new Date(tomorrow);
      day.setDate(day.getDate() + d);
      if (!map.dow.includes(day.getDay())) continue;
      const dKey = dayKey(day.getTime());
      const busyOnDay = busy.get(dKey) || 0;
      if (busyOnDay >= 3) continue; // already crowded
      for (const hour of map.hours) {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);
        const slotKey = `${dKey}::${network}::${hour}`;
        if (usedSlotKeys.has(slotKey)) continue;
        const collides = queue.some((q) => q.network === network && Math.abs(q.when - slot.getTime()) < 30 * 60 * 1000);
        if (collides) continue;
        usedSlotKeys.add(slotKey);
        return { post: p, when: slot.getTime() };
      }
    }
    // Pathological fallback — schedule for tomorrow 9am + idx hours.
    const fallback = new Date(tomorrow);
    fallback.setHours(9 + idx, 0, 0, 0);
    return { post: p, when: fallback.getTime() };
  });
}

function customDefaultSlots(posts) {
  // One per day, 9am, starting tomorrow. Used as the seed when the user
  // flips to Custom mode and we want to keep the times legible while
  // they edit.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return posts.map((p, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { post: p, when: d.getTime() };
  });
}

function onClick(event) {
  if (event.target.closest("[data-schedule-close]")) {
    close();
    return;
  }
  const monthNav = event.target.closest("[data-schedule-month]");
  if (monthNav) {
    const dir = monthNav.dataset.scheduleMonth === "next" ? 1 : -1;
    const m = new Date(state.calendarMonth);
    m.setMonth(m.getMonth() + dir);
    state.calendarMonth = m;
    render();
    return;
  }
  const dayBtn = event.target.closest("[data-schedule-day]");
  if (dayBtn) {
    state.focusedDayKey = dayBtn.dataset.scheduleDay;
    render();
    return;
  }
  const removeBtn = event.target.closest("[data-schedule-remove]");
  if (removeBtn) {
    const idx = parseInt(removeBtn.dataset.scheduleRemove, 10);
    state.posts = state.posts.filter((_, i) => i !== idx);
    state.slots = state.slots.filter((_, i) => i !== idx);
    if (state.posts.length === 0) {
      close();
    } else {
      render();
    }
    return;
  }
  if (event.target.closest("[data-schedule-confirm]")) {
    if (state.status === "scheduling") return;
    confirmSchedule();
  }
}

function confirmSchedule() {
  state.status = "scheduling";
  state.errorMessage = "";
  render();

  const slots = state.slots.map((s) => ({ postId: s.post.id, when: s.when }));

  // Push into the live schedule queue so the calendar immediately
  // reflects them on the next open. This happens before onConfirm
  // because onConfirm may close the modal.
  addToQueue(
    state.slots.map((s) => ({
      id: `q-${s.post.id}-${s.when}`,
      network: s.post.network || "linkedin",
      text: extractFirstLine(s.post),
      when: s.when,
    })),
  );

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

function extractFirstLine(post) {
  const text = (post.preview || post.text || "").toString();
  // post.text may be an array of paragraphs on real drafts.
  if (Array.isArray(post.text) && post.text.length > 0) return post.text[0];
  return text.split("\n")[0] || text;
}

function onConfirmSucceeded(slots) {
  showToast(`${slots.length} ${slots.length === 1 ? "draft" : "drafts"} scheduled`);
  close();
}

function onConfirmFailed(err) {
  // eslint-disable-next-line no-console
  console.error("schedule-modal: confirm failed", err);
  state.status = "error";
  state.errorMessage = (err && err.message) || "Couldn't schedule those drafts. Try again.";
  render();
}

function onInput(event) {
  // Mode picker (radio cards) — flipping a radio rebuilds the slot
  // list under the chosen strategy and triggers a full repaint so
  // the calendar dots track the new times too.
  if (event.target.matches('input[name="schedule-mode"]')) {
    const next = event.target.value;
    if (next === state.mode) return;
    state.mode = next;
    state.slots = next === "optimal" ? optimalSlots(state.posts) : customDefaultSlots(state.posts);
    render();
    return;
  }
  const slotInput = event.target.closest("[data-schedule-slot]");
  if (slotInput) {
    const idx = parseInt(slotInput.dataset.scheduleSlot, 10);
    const ts = new Date(slotInput.value).getTime();
    if (!isNaN(ts)) {
      state.slots[idx] = { ...state.slots[idx], when: ts };
      // A manual edit implies Custom mode — flip the radio checked
      // state without a full re-render so we don't steal focus from
      // the datetime input the user is mid-edit on.
      if (state.mode !== "custom") {
        state.mode = "custom";
        const customRadio = document.querySelector('input[name="schedule-mode"][value="custom"]');
        if (customRadio) customRadio.checked = true;
      }
      // Repaint the slot label so the "scheduled for X" tag tracks.
      const row = document.querySelector(`[data-schedule-row="${idx}"]`);
      if (row) {
        const label = row.querySelector(".schedule-modal__slot-when-label");
        if (label) label.textContent = formatSlotLabel(state.slots[idx].when);
      }
    }
  }
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
  return html`
    <header class="schedule-modal__head">
      <div>
        <div class="schedule-modal__title">Schedule ${n} ${n === 1 ? "draft" : "drafts"}</div>
        <div class="schedule-modal__sub">
          Pick when each post should publish. Archie can spread them automatically across optimal times per network.
        </div>
      </div>
      <button type="button" class="ap-icon-button stroked transparent" data-schedule-close aria-label="Close (Esc)">
        <i class="ap-icon-close"></i>
      </button>
    </header>

    <div class="schedule-modal__body schedule-modal__body--split">
      <section class="schedule-modal__left" aria-label="Drafts to schedule">
        ${raw(renderModePicker())} ${raw(renderSlotList())}
      </section>
      <aside class="schedule-modal__right" aria-label="Already scheduled">${raw(renderCalendarPanel())}</aside>
    </div>

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
          class="ap-button ghost grey"
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
                `<i class="ap-icon-calendar"></i><span>${state.status === "error" ? "Try again" : `Schedule ${n} ${n === 1 ? "draft" : "drafts"}`}</span>`,
              )}
        </button>
      </div>
    </footer>
  `;
}

function renderModePicker() {
  // DS `.ap-radio-card.card` — interactive card with a leading radio
  // indicator, native role="radio" semantics via <input type="radio">,
  // and a built-in selected state that paints the border accent blue.
  return `
    <div class="schedule-modal__modes" role="radiogroup" aria-label="Scheduling mode">
      <label class="ap-radio-card card schedule-modal__mode">
        <input
          type="radio"
          name="schedule-mode"
          value="optimal"
          ${state.mode === "optimal" ? "checked" : ""}
        />
        <div>
          <div class="ap-radio-card-header">
            <i class="ap-icon-sparkles" aria-hidden="true"></i>
            <span class="ap-radio-card-title">Optimal times</span>
          </div>
          <span>Spread across each network's best hours</span>
        </div>
      </label>
      <label class="ap-radio-card card schedule-modal__mode">
        <input
          type="radio"
          name="schedule-mode"
          value="custom"
          ${state.mode === "custom" ? "checked" : ""}
        />
        <div>
          <div class="ap-radio-card-header">
            <i class="ap-icon-pen" aria-hidden="true"></i>
            <span class="ap-radio-card-title">Custom</span>
          </div>
          <span>Pick each time below</span>
        </div>
      </label>
    </div>
  `;
}

function renderSlotList() {
  const rows = state.slots
    .map((s, i) => {
      const network = (s.post.network || "linkedin").toLowerCase();
      const text = extractFirstLine(s.post);
      return `
        <div class="schedule-modal__slot" data-schedule-row="${i}">
          <div class="schedule-modal__slot-post">
            <div class="schedule-modal__slot-head">
              <i class="${NETWORK_ICON[network] || "ap-icon-megaphone"}" aria-hidden="true"></i>
              <span class="schedule-modal__slot-net">${NETWORK_NAME[network] || network}</span>
              <span class="schedule-modal__slot-when-label">${escapeText(formatSlotLabel(s.when))}</span>
            </div>
            <div class="schedule-modal__slot-text">${escapeText(text)}</div>
          </div>
          <div class="schedule-modal__slot-when">
            <div class="ap-input-group">
              <input
                type="datetime-local"
                value="${toLocalInput(s.when)}"
                data-schedule-slot="${i}"
                aria-label="Scheduled time"
              />
            </div>
            <button
              type="button"
              class="ap-icon-button stroked transparent schedule-modal__slot-remove"
              data-schedule-remove="${i}"
              aria-label="Remove from batch"
              title="Remove from batch"
            >
              <i class="ap-icon-close"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
  return `<div class="schedule-modal__slots">${rows}</div>`;
}

// ── Calendar (month grid) ─────────────────────────────────────────────
function renderCalendarPanel() {
  const month = state.calendarMonth;
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const busy = busyCountsByDay();
  const slotCounts = new Map();
  for (const slot of state.slots) {
    const k = dayKey(slot.when);
    slotCounts.set(k, (slotCounts.get(k) || 0) + 1);
  }
  // Build the visible 6×7 grid starting at the Sunday before the 1st of
  // the month so weeks render consistently.
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday
  const todayKey = dayKey(Date.now());

  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const k = dayKey(d.getTime());
    const inMonth = d.getMonth() === month.getMonth();
    const isToday = k === todayKey;
    const isFocused = k === state.focusedDayKey;
    const existing = busy.get(k) || 0;
    const queued = slotCounts.get(k) || 0;
    const dotClass = queued > 0 ? "is-queued" : existing > 0 ? "is-existing" : "";
    cells += `
      <button
        type="button"
        class="schedule-modal__day ${inMonth ? "" : "is-out"} ${isToday ? "is-today" : ""} ${isFocused ? "is-focused" : ""}"
        data-schedule-day="${k}"
        aria-label="${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — ${existing + queued} scheduled"
      >
        <span class="schedule-modal__day-num">${d.getDate()}</span>
        ${existing + queued > 0 ? `<span class="schedule-modal__day-dot ${dotClass}"></span>` : ""}
      </button>
    `;
  }

  return `
    <header class="schedule-modal__cal-head">
      <button
        type="button"
        class="ap-icon-button stroked transparent"
        data-schedule-month="prev"
        aria-label="Previous month"
      >
        <i class="ap-icon-chevron-left"></i>
      </button>
      <span class="schedule-modal__cal-title">${monthLabel}</span>
      <button
        type="button"
        class="ap-icon-button stroked transparent"
        data-schedule-month="next"
        aria-label="Next month"
      >
        <i class="ap-icon-chevron-right"></i>
      </button>
    </header>
    <div class="schedule-modal__cal-dow" aria-hidden="true">
      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
    </div>
    <div class="schedule-modal__cal-grid" role="grid">${cells}</div>
    ${renderDayList()}
  `;
}

function renderDayList() {
  const key = state.focusedDayKey;
  if (!key) return "";
  const focusedDate = parseDayKey(key);
  const heading = focusedDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const existing = getQueueOn(focusedDate.getTime());
  const inThisBatch = state.slots
    .filter((s) => dayKey(s.when) === key)
    .map((s) => ({
      id: `slot-${s.post.id}`,
      network: (s.post.network || "linkedin").toLowerCase(),
      text: extractFirstLine(s.post),
      when: s.when,
      isBatch: true,
    }));

  const combined = inThisBatch.concat(existing.map((e) => ({ ...e, isBatch: false }))).sort((a, b) => a.when - b.when);

  if (combined.length === 0) {
    return `
      <div class="schedule-modal__day-list">
        <div class="schedule-modal__day-list-head">${heading} <span class="muted">nothing scheduled</span></div>
        <div class="schedule-modal__day-list-empty">No posts on this day — a good window to schedule.</div>
      </div>
    `;
  }

  const items = combined
    .map((entry) => {
      const network = entry.network || "linkedin";
      return `
        <li class="schedule-modal__day-item ${entry.isBatch ? "is-batch" : ""}">
          <span class="schedule-modal__day-time">${formatTime(entry.when)}</span>
          <i class="${NETWORK_ICON[network] || "ap-icon-megaphone"} schedule-modal__day-icon" aria-hidden="true"></i>
          <span class="schedule-modal__day-text">${escapeText(entry.text)}</span>
          ${entry.isBatch ? `<span class="ap-status blue no-dot schedule-modal__day-tag">This batch</span>` : ""}
        </li>
      `;
    })
    .join("");

  return `
    <div class="schedule-modal__day-list">
      <div class="schedule-modal__day-list-head">
        ${heading}
        <span class="muted">${combined.length} scheduled</span>
      </div>
      <ul class="schedule-modal__day-list-items">${items}</ul>
    </div>
  `;
}

function parseDayKey(key) {
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatSlotLabel(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `· ${date} · ${formatTime(ts)}`;
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
