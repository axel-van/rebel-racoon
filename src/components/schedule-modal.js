import { html, raw, escapeText } from "../utils.js?v=21";
import { showToast } from "./toast.js?v=21";
import {
  getQueue,
  getQueueOn,
  busyCountsByDay,
  dayKey,
  addToQueue,
  subscribe as subscribeQueue,
} from "../schedule-store.js?v=40";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { renderProfileTag, profileForNetwork } from "../social-profiles.js?v=67";

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
  // Strategy that drives the optimal spread. `cadence` is one of the
  // CADENCES ids (the visible chips), `note` is the free-text refinement
  // ("avoid Mondays", "mornings"), `startFrom` is the day-0 epoch.
  strategy: { cadence: "weekdays", timeOfDay: null, note: "", startFrom: null },
  onConfirm: null,
  status: "idle", // 'idle' | 'scheduling' | 'error'
  errorMessage: "",
  computing: false, // "Compute best times" loading state
  // Optimal isn't "chosen" until the user computes the spread — gates the
  // Schedule button. Custom is chosen via the per-draft pickers (always ok).
  computed: false,
  // Optimal-mode disclosure: the per-draft date list is collapsed by default
  // (the strategy panel is the focus) and expands on demand / after Compute.
  slotsExpanded: false,
  calendarMonth: null, // Date pinned to the 1st of the visible month
  focusedDayKey: null, // string from dayKey()
};

let unsubscribeQueue = null;
let computeTimer = null; // pending "Compute best times" timeout
let drag = null; // active pointer drag-reorder session (multi-draft only)

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

// ── Posting cadences (the visible strategy chips) ─────────────────────
// Each cadence decides WHICH days a slot can land on; the per-network
// optimal map then decides the HOUR. `days` is a sunday-first dow set;
// `every` spaces slots N days apart from the start; `weekly` repeats the
// start day's weekday. These are the presets the user picks instead of a
// hidden dropdown — selecting one re-spreads the batch live.
const CADENCES = [
  { id: "weekdays", label: "Every weekday", days: [1, 2, 3, 4, 5] },
  { id: "thrice", label: "3× a week", days: [1, 3, 5] },
  { id: "twice", label: "Twice a week", days: [2, 4] },
  { id: "alternate", label: "Every other day", every: 2 },
  { id: "once", label: "Once a week", weekly: true },
];

const WEEKDAY_DOW = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultStartFrom() {
  // Tomorrow — never schedule a batch in the past.
  const d = startOfDay(Date.now());
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

// Free-text refinement parsing — keeps "describe your own strategy"
// functional rather than decorative. We read a time-of-day bias and any
// "avoid <weekday>" exclusions out of the note so the spread visibly
// reacts to what the user typed.
function parseTimeOfDay(note) {
  const t = (note || "").toLowerCase();
  if (/\b(mornings?|early|a\.?m\.?)\b/.test(t)) return "morning";
  if (/\b(evenings?|nights?|late|p\.?m\.?)\b/.test(t)) return "evening";
  if (/\b(afternoons?|noon|midday|lunch)\b/.test(t)) return "afternoon";
  return null;
}

function parseAvoidDays(note) {
  const t = (note || "").toLowerCase();
  const avoid = new Set();
  for (const [name, dow] of Object.entries(WEEKDAY_DOW)) {
    // "avoid mondays", "no fridays", "skip the weekend"…
    if (new RegExp(`\\b(avoid|no|skip|not?|except)\\b[^.]*\\b${name}s?\\b`).test(t)) {
      avoid.add(dow);
    }
  }
  if (/\b(weekend|weekends)\b/.test(t) && /\b(avoid|no|skip|not?|except)\b/.test(t)) {
    avoid.add(0);
    avoid.add(6);
  }
  return avoid;
}

function pickHour(hours, timeOfDay) {
  if (!hours || hours.length === 0) return 9;
  const sorted = [...hours].sort((a, b) => a - b);
  if (timeOfDay === "morning") return sorted[0];
  if (timeOfDay === "evening") return sorted[sorted.length - 1];
  if (timeOfDay === "afternoon") return sorted[Math.floor(sorted.length / 2)];
  return sorted[0];
}

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
    modal.className = "ap-dialog schedule-modal schedule-modal--wide";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", `${ROOT_ID}Title`);
    modal.hidden = true;
    document.body.appendChild(modal);
  }

  modal.addEventListener("click", onClick);
  modal.addEventListener("input", onInput);
  modal.addEventListener("change", onInput);
  // Drag-to-reorder the draft cards (multi-draft only). Delegated on the
  // modal root so it survives every re-render.
  modal.addEventListener("pointerdown", onPointerDown);
  modal.addEventListener("pointermove", onPointerMove);
  modal.addEventListener("pointerup", onPointerUp);
  modal.addEventListener("pointercancel", onPointerCancel);
  // Backdrop click + Escape go through the shared coordinator. `state.open`
  // is the canonical isOpen — the modal element's `.open` class isn't set
  // here (visibility is driven by .hidden), so we pass a custom isOpen.
  bindOverlayDismissal({
    modal,
    backdrop: scrim,
    close,
    isOpen: () => state.open,
  });
}

export function open({ posts, onConfirm }) {
  if (!posts || posts.length === 0) return;
  // Register with the coordinator first so any other overlay currently
  // up gets closed before we paint. Also snapshots the trigger element so
  // focus lands back on it after close (FIND-C). MODAL_ID == ROOT_ID since
  // the coordinator just uses it as a key.
  requestOpen(ROOT_ID, close);
  const today = new Date();
  // One frequency model for any batch size — a single draft recurs on
  // the cadence just like a batch does. Time-of-day bias is read from the
  // free-text note (each network's own best hour wins by default).
  const strategy = {
    cadence: "weekdays",
    timeOfDay: null,
    note: "",
    startFrom: defaultStartFrom(),
  };
  // Open with a single date per draft. The frequency strategy only
  // expands into a recurrence once the user hits "Compute best times" —
  // so the modal doesn't dump 8 pre-filled dates on someone who just
  // wants to schedule one post.
  const slots = spreadOneEach(posts, strategy);
  // Open the calendar on the month of the first computed date — not
  // today's month. Otherwise an end-of-month batch (which starts
  // tomorrow, i.e. next month) would open onto an empty calendar with
  // none of the batch in view.
  const firstWhen = slots[0] ? slots[0].when : today.getTime();
  const monthStart = new Date(new Date(firstWhen).getFullYear(), new Date(firstWhen).getMonth(), 1);
  state = {
    open: true,
    posts,
    mode: "optimal",
    strategy,
    slots,
    onConfirm: typeof onConfirm === "function" ? onConfirm : null,
    status: "idle",
    errorMessage: "",
    computed: false,
    slotsExpanded: false,
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
  if (computeTimer) {
    clearTimeout(computeTimer);
    computeTimer = null;
  }
  state = {
    open: false,
    posts: [],
    slots: [],
    mode: "optimal",
    strategy: { cadence: "weekdays", timeOfDay: null, note: "", startFrom: null },
    onConfirm: null,
    status: "idle",
    errorMessage: "",
    computing: false,
    computed: false,
    slotsExpanded: false,
    calendarMonth: null,
    focusedDayKey: null,
  };
  if (unsubscribeQueue) {
    unsubscribeQueue();
    unsubscribeQueue = null;
  }
  render();
  // Tell the coordinator we're gone so it can restore focus to the
  // trigger element and free its active-overlay slot.
  notifyClose(ROOT_ID);
}

// ── Optimal slot picker (strategy-driven) ─────────────────────────────
// The cadence is a *posting rhythm* for the whole calendar, not a
// per-draft frequency: walking from `startFrom`, we collect the next
// `count` days that match the pattern (cadence chip), skipping weekdays
// the note excluded AND any day that already carries a scheduled post —
// so the new dates slot in around what's already on the calendar. One day
// per draft (each draft always gets exactly one date). Bounded look-ahead
// so a pathological pattern can't loop forever.
function strategyDays(count, strategy) {
  const start = startOfDay(strategy.startFrom || defaultStartFrom());
  const cadence = CADENCES.find((c) => c.id === strategy.cadence) || CADENCES[0];
  const avoid = parseAvoidDays(strategy.note);
  const busy = busyCountsByDay(); // dayKey → count of posts already scheduled
  const startDow = start.getDay();
  const days = [];
  const cursor = new Date(start);
  for (let guard = 0; days.length < count && guard < 400; guard++) {
    const dow = cursor.getDay();
    let qualifies;
    if (cadence.every) {
      const diff = Math.round((cursor - start) / 86400000);
      qualifies = diff % cadence.every === 0;
    } else if (cadence.weekly) {
      qualifies = dow === startDow;
    } else {
      qualifies = cadence.days.includes(dow);
    }
    const alreadyBusy = (busy.get(dayKey(cursor.getTime())) || 0) > 0;
    if (qualifies && !avoid.has(dow) && !alreadyBusy) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// One date per draft — spread across the next pattern-matching, non-busy
// days (strategyDays), each at its network's best hour (biased by the
// note). This is the whole model: a draft always carries exactly one date.
function spreadOneEach(posts, strategy = state.strategy) {
  const days = strategyDays(posts.length, strategy);
  const timeOfDay = strategy.timeOfDay || parseTimeOfDay(strategy.note);
  const fallback = startOfDay(strategy.startFrom || defaultStartFrom());

  return posts.map((p, idx) => {
    const network = (p.network || "linkedin").toLowerCase();
    const map = PER_NETWORK_OPTIMAL[network] || FALLBACK_OPTIMAL;
    const hour = pickHour(map.hours, timeOfDay);
    // If the cadence couldn't yield enough distinct days, pile the
    // remainder onto the last day an hour apart so nothing silently drops.
    const baseDay = days[idx] || days[days.length - 1] || fallback;
    const slot = new Date(baseDay);
    const overflow = idx >= days.length ? idx - days.length + 1 : 0;
    slot.setHours(hour + overflow, 0, 0, 0);
    return { post: p, when: slot.getTime() };
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

// Snap the calendar to the month of the first slot so a fresh spread is
// in view at a glance.
function snapCalendarToFirst() {
  const first = state.slots[0];
  if (first) {
    state.focusedDayKey = dayKey(first.when);
    state.calendarMonth = new Date(new Date(first.when).getFullYear(), new Date(first.when).getMonth(), 1);
  }
}

// Apply the staged strategy — the work "Compute best times" commits.
// Strategy controls (chips, note, start date) only stage their values;
// nothing lands in the list until this runs. One date per draft, spread
// across the cadence around what's already scheduled.
function recomputeOptimal() {
  state.mode = "optimal";
  state.slots = spreadOneEach(state.posts, state.strategy);
  snapCalendarToFirst();
}

// Same one-date-per-draft spread — used when flipping back to Optimal mode.
function seedOneEach() {
  state.mode = "optimal";
  state.slots = spreadOneEach(state.posts, state.strategy);
  snapCalendarToFirst();
}

function onClick(event) {
  if (event.target.closest("[data-schedule-close]")) {
    close();
    return;
  }
  // Cadence chip — single-select. Picking one only stages the choice
  // (the chip lights up); the dates don't change until "Compute best
  // times" is clicked. So we just record it and repaint the chips.
  // "Review dates" disclosure (Optimal) — toggle the per-draft date list.
  if (event.target.closest("[data-schedule-slots-toggle]")) {
    state.slotsExpanded = !state.slotsExpanded;
    render();
    return;
  }
  const cadenceChip = event.target.closest("[data-schedule-cadence]");
  if (cadenceChip) {
    if (state.computing) return;
    state.strategy.cadence = cadenceChip.dataset.scheduleCadence;
    render();
    return;
  }
  // "Compute best times" — the one action that expands the staged
  // strategy (cadence + note + start date) into the recurrence. Runs a
  // short loading beat so it reads as real work, then fills the list.
  if (event.target.closest("[data-schedule-compute]")) {
    if (state.computing) return;
    const noteEl = document.getElementById("scheduleStrategyNote");
    if (noteEl) state.strategy.note = noteEl.value;
    state.computing = true;
    render();
    computeTimer = setTimeout(() => {
      computeTimer = null;
      if (!state.open) return;
      state.computing = false;
      recomputeOptimal();
      state.computed = true; // dates are now chosen → enable Schedule
      // Reveal the freshly-computed dates so the result is visible.
      state.slotsExpanded = true;
      render();
    }, 1600);
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
    const removed = state.slots[idx];
    if (!removed) return;
    state.slots = state.slots.filter((_, i) => i !== idx);
    // Dropping a draft's last remaining date removes the draft too — no
    // draft can sit in the batch with zero publish times.
    const postStillHasDate = state.slots.some((s) => s.post.id === removed.post.id);
    if (!postStillHasDate) {
      state.posts = state.posts.filter((p) => p.id !== removed.post.id);
    }
    if (state.posts.length === 0) {
      close();
    } else {
      render();
    }
    return;
  }
  // "Clear all dates" — wipe the chosen dates and return to the pristine
  // pre-compute state: back to Optimal, one date per draft, not yet computed.
  // The date list collapses, "Compute best times" goes primary and Schedule
  // disables — the same reset whether the user was in computed Optimal or in
  // Custom. (A true empty set would dead-end Custom: you can't re-add a date to
  // an empty grid, so we reset to the seed instead of leaving nothing.)
  if (event.target.closest("[data-schedule-clear]")) {
    state.mode = "optimal";
    state.slots = spreadOneEach(state.posts, state.strategy);
    state.computed = false;
    state.slotsExpanded = false;
    render();
    return;
  }
  if (event.target.closest("[data-schedule-confirm]")) {
    if (state.status === "scheduling") return;
    // Optimal must compute a spread before it counts as chosen.
    if (state.mode === "optimal" && !state.computed) return;
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
  showToast(`${slots.length} ${slots.length === 1 ? "post" : "posts"} scheduled`);
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
  // Mode picker (radio cards) — flipping to Optimal resets to one date
  // per draft (the recurrence is only expanded on "Compute best times");
  // flipping to Custom seeds an editable one-per-day spread.
  if (event.target.matches('input[name="schedule-mode"]')) {
    const next = event.target.value;
    if (next === state.mode) return;
    state.mode = next;
    if (next === "optimal") {
      seedOneEach();
      // Optimal leads with the strategy panel — collapse the date list and
      // require a fresh Compute before the spread counts as "chosen".
      state.slotsExpanded = false;
      state.computed = false;
    } else {
      state.slots = customDefaultSlots(state.posts);
    }
    render();
    return;
  }
  // Free-text strategy note — staged only; the spread reads it when the
  // user clicks "Compute best times". We don't re-render so the textarea
  // keeps focus while typing.
  if (event.target.matches("[data-schedule-note]")) {
    if (event.type !== "change") return;
    state.strategy.note = event.target.value;
    return;
  }
  // "Starting from" date — staged only; applied on "Compute best times".
  if (event.target.matches("[data-schedule-start]")) {
    const ts = new Date(`${event.target.value}T00:00:00`).getTime();
    if (!isNaN(ts)) state.strategy.startFrom = ts;
    return;
  }
  const slotInput = event.target.closest("[data-schedule-slot]");
  if (slotInput) {
    const idx = parseInt(slotInput.dataset.scheduleSlot, 10);
    const ts = new Date(slotInput.value).getTime();
    if (!isNaN(ts)) {
      state.slots[idx] = { ...state.slots[idx], when: ts };
      // A manual edit implies Custom mode. Flip the radio checked state
      // without a full re-render so we don't steal focus mid-edit; then on
      // commit (change) re-render once so the left column reconciles to the
      // Custom layout (strategy panel + review toggle drop away).
      if (state.mode !== "custom") {
        state.mode = "custom";
        const customRadio = document.querySelector('input[name="schedule-mode"][value="custom"]');
        if (customRadio) customRadio.checked = true;
        if (event.type === "change") render();
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
  const total = state.slots.length; // publish actions — a draft may carry several dates
  return html`
    <div class="ap-dialog-header">
      <span class="ap-dialog-title" id="${ROOT_ID}Title">Schedule ${n} ${n === 1 ? "draft" : "drafts"}</span>
      <span class="ap-dialog-subtitle">
        ${n === 1
          ? "Pick a posting rhythm — I'll find the best time around what's already scheduled."
          : "Pick a posting rhythm — I'll spread your drafts across the best times, around what's already scheduled."}
      </span>
    </div>

    <div class="ap-dialog-content schedule-modal__body schedule-modal__body--split">
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
      <section class="schedule-modal__left" aria-label="Drafts to schedule">
        ${raw(renderModePicker())} ${state.mode === "optimal" ? raw(renderStrategyPanel()) : ""}
        ${raw(renderSlotSection())}
      </section>
      <aside class="schedule-modal__right" aria-label="Already scheduled">${raw(renderCalendarPanel())}</aside>
    </div>

    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left">
        <button
          type="button"
          class="ap-button stroked grey schedule-modal__clear"
          data-schedule-clear
          ${state.status === "scheduling" || (state.mode === "optimal" && !state.computed) ? "disabled" : ""}
        >
          <i class="ap-icon-trash"></i><span>Clear all dates</span>
        </button>
        <span class="schedule-modal__foot-disclosure">Posts will publish to your connected accounts.</span>
      </div>
      <div class="ap-dialog-footer-right">
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
          ${state.status === "scheduling" || (state.mode === "optimal" && !state.computed) ? "disabled" : ""}
        >
          ${state.status === "scheduling"
            ? raw(`<span class="schedule-modal__spinner" aria-hidden="true"></span><span>Scheduling…</span>`)
            : raw(
                `<i class="ap-icon-calendar"></i><span>${state.status === "error" ? "Try again" : `Schedule ${total} ${total === 1 ? "post" : "posts"}`}</span>`,
              )}
        </button>
      </div>
    </div>

    <button type="button" class="ap-dialog-close" data-schedule-close aria-label="Close (Esc)">
      <i class="ap-icon-close"></i>
    </button>
  `;
}

function renderModePicker() {
  // DS `.ap-radio-card.card` — interactive card with a leading radio
  // indicator, native role="radio" semantics via <input type="radio">,
  // and a built-in selected state that paints the border accent blue.
  const multi = state.posts.length > 1;
  const optimalSub = multi ? "Spread across your posting rhythm" : "Best time for this post";
  const customSub = multi ? "Pick each time below" : "Pick the time below";
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
          <span>${optimalSub}</span>
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
          <span>${customSub}</span>
        </div>
      </label>
    </div>
  `;
}

// ── Strategy panel (Optimal mode) ─────────────────────────────────────
// The interactive replacement for a hidden "optimal time" dropdown:
//   • cadence chips (single-select, DS .ap-filter-chip / aria-pressed)
//   • a free-text "describe your own strategy" note (Archie reads it)
//   • a "Starting from" day-0 date + an explicit "Compute best times"
// Chips and the date re-spread live; the note re-spreads on blur or on
// the Compute button. Every recompute repaints the slot list + calendar.
function renderStrategyPanel() {
  const s = state.strategy;

  // One frequency model for any batch size — the cadence chips decide how
  // often each draft recurs; the free-text note refines time-of-day and
  // excludes weekdays.
  const chipLabel = "Scheduling strategy";
  const chipGroupLabel = "Posting frequency";
  const notePlaceholder = "e.g. Tuesday and Thursday mornings, avoid Mondays…";
  const chips = CADENCES.map(
    (c) => `
        <button
          type="button"
          class="ap-filter-chip schedule-modal__cadence-chip"
          data-schedule-cadence="${c.id}"
          aria-pressed="${s.cadence === c.id ? "true" : "false"}"
        >
          ${c.label}
        </button>`,
  ).join("");

  return `
    <div class="schedule-modal__strategy">
      <div class="schedule-modal__strategy-block">
        <span class="schedule-modal__strategy-label">${chipLabel}</span>
        <div class="schedule-modal__cadence" role="group" aria-label="${chipGroupLabel}">${chips}</div>
      </div>

      <div class="schedule-modal__strategy-block">
        <label class="schedule-modal__strategy-label schedule-modal__strategy-label--ai" for="scheduleStrategyNote">
          <i class="ap-icon-archie-official" aria-hidden="true"></i>
          Or describe your own strategy
        </label>
        <div class="ap-textarea-field resizable">
          <textarea
            id="scheduleStrategyNote"
            rows="2"
            placeholder="${notePlaceholder}"
            data-schedule-note
          >${escapeText(s.note)}</textarea>
        </div>
      </div>

      <div class="schedule-modal__strategy-foot">
        <div class="schedule-modal__strategy-start">
          <label class="schedule-modal__strategy-label" for="scheduleStartFrom">Starting from</label>
          <div class="ap-input-group">
            <i class="ap-icon-calendar" aria-hidden="true"></i>
            <input type="date" id="scheduleStartFrom" value="${toDateInput(s.startFrom)}" data-schedule-start />
          </div>
        </div>
        <button
          type="button"
          class="ap-button ${state.computed ? "secondary" : "primary"} blue schedule-modal__compute"
          data-schedule-compute
          ${state.computing ? "disabled" : ""}
        >
          ${
            state.computing
              ? `<span class="schedule-modal__spinner" aria-hidden="true"></span><span>Computing…</span>`
              : `<i class="ap-icon-clock" aria-hidden="true"></i><span>Compute best times</span>`
          }
        </button>
      </div>
    </div>
  `;
}

// Slots are flat [{post, when}]; a draft can still carry several publish
// times, so we group by post.id and render one compact card per draft
// holding its date-row(s). The flat-array index stays the key for
// edit/remove so the change/click handlers don't move.
function slotsForPost(postId) {
  return state.slots.map((s, idx) => ({ s, idx })).filter(({ s }) => s.post.id === postId);
}

// The per-draft date list. In Custom it's the primary surface (expanded with
// its own count header); in Optimal it's tucked inside a "Review dates"
// disclosure that already carries the count, so the inner header is dropped.
function renderSlotSection() {
  if (state.mode !== "optimal") return renderSlotList();
  // Nothing to review until "Compute best times" has produced dates.
  const disabled = !state.computed;
  return `
    <div class="schedule-modal__review">
      <button
        type="button"
        class="ap-button ghost blue schedule-modal__slots-toggle"
        data-schedule-slots-toggle
        aria-expanded="${state.slotsExpanded ? "true" : "false"}"
        ${disabled ? "disabled" : ""}
      >
        <i class="ap-icon-chevron-down schedule-modal__slots-toggle-arrow" aria-hidden="true"></i>
        <span>${state.slotsExpanded ? "Hide dates" : "Review dates"}</span>
      </button>
      ${state.slotsExpanded ? renderSlotList({ header: false }) : ""}
    </div>
  `;
}

function renderSlotList({ header = true } = {}) {
  const multi = state.posts.length > 1;
  const headerHtml = header
    ? `
    <div class="schedule-modal__slots-head">
      <span class="schedule-modal__slots-count">${state.posts.length} ${state.posts.length === 1 ? "draft" : "drafts"}</span>
      ${multi ? `<span class="schedule-modal__slots-hint muted">Drag to reorder — dates follow the order</span>` : ""}
    </div>
  `
    : "";
  const cards = state.posts
    .map((post) => {
      const network = (post.network || "linkedin").toLowerCase();
      const text = extractFirstLine(post);
      const entries = slotsForPost(post.id);
      const dateRows = entries
        .map(
          ({ s, idx }) => `
          <div class="schedule-modal__slot-date">
            <div class="ap-input-group">
              <input
                type="datetime-local"
                value="${toLocalInput(s.when)}"
                data-schedule-slot="${idx}"
                aria-label="Scheduled time"
              />
            </div>
            <button
              type="button"
              class="ap-icon-button stroked transparent schedule-modal__slot-remove"
              data-schedule-remove="${idx}"
              aria-label="Remove this date"
              title="Remove this date"
            >
              <i class="ap-icon-close"></i>
            </button>
          </div>
        `,
        )
        .join("");
      return `
        <div
          class="schedule-modal__slot ${multi ? "schedule-modal__slot--draggable" : ""}"
          data-schedule-post="${escapeText(post.id)}"
        >
          ${
            multi
              ? `<span class="schedule-modal__slot-grip" aria-hidden="true" title="Drag to reorder"><i class="ap-icon-move"></i></span>`
              : ""
          }
          <div class="schedule-modal__slot-post">
            <div class="schedule-modal__slot-head">
              ${renderProfileTag(profileForNetwork(network), { network })}
            </div>
            <div class="schedule-modal__slot-text">${escapeText(text)}</div>
          </div>
          <div class="schedule-modal__slot-dates">${dateRows}</div>
        </div>
      `;
    })
    .join("");
  return `<div class="schedule-modal__slots">${headerHtml}${cards}</div>`;
}

// ── Drag-to-reorder drafts ────────────────────────────────────────────
// Reordering the cards re-pairs each draft with the (sorted) publish dates
// by position: the new first draft takes the earliest date(s), and so on —
// the dates "follow the order" without the user re-typing them.
// Pointer-based reorder (grip handle). The grabbed card lifts and tracks the
// pointer 1:1 (no transition) while the other cards slide — with a transition
// — to open a gap at the target index. On release the card settles into the
// gap, then we commit the new order and re-pair the dates.
function onPointerDown(event) {
  if (event.button) return; // primary button / touch only
  const grip = event.target.closest(".schedule-modal__slot-grip");
  if (!grip) return;
  const card = grip.closest(".schedule-modal__slot--draggable");
  if (!card) return;
  const list = card.parentElement;
  const items = Array.from(list.querySelectorAll(".schedule-modal__slot--draggable"));
  if (items.length < 2) return;
  event.preventDefault();

  const rect = card.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const fromIndex = items.indexOf(card);
  drag = {
    card,
    list,
    items,
    fromIndex,
    toIndex: fromIndex,
    startY: event.clientY,
    step: rect.height + gap,
    pointerId: event.pointerId,
    done: false,
  };

  try {
    card.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  list.classList.add("is-reordering");
  card.classList.add("is-dragging");
  card.style.transition = "none";
  card.style.transform = "translateY(0) scale(1.02)";
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dy = event.clientY - drag.startY;
  drag.card.style.transform = `translateY(${dy}px) scale(1.02)`;

  const toIndex = Math.max(0, Math.min(drag.items.length - 1, drag.fromIndex + Math.round(dy / drag.step)));
  if (toIndex === drag.toIndex) return;
  drag.toIndex = toIndex;

  // Slide each non-grabbed card to open the gap at toIndex.
  drag.items.forEach((el, i) => {
    if (i === drag.fromIndex) return;
    let shift = 0;
    if (drag.fromIndex < toIndex && i > drag.fromIndex && i <= toIndex) shift = -drag.step;
    else if (drag.fromIndex > toIndex && i >= toIndex && i < drag.fromIndex) shift = drag.step;
    el.style.transform = shift ? `translateY(${shift}px)` : "";
  });
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  try {
    d.card.releasePointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }

  // Settle the grabbed card into the gap, then commit + re-render once.
  const rest = (d.toIndex - d.fromIndex) * d.step;
  d.card.style.transition = "transform 160ms var(--app-ease-standard, ease)";
  d.card.style.transform = `translateY(${rest}px) scale(1)`;

  const commit = () => {
    if (d.done) return;
    d.done = true;
    d.card.removeEventListener("transitionend", commit);
    if (d.fromIndex !== d.toIndex) reorderByIndex(d.fromIndex, d.toIndex);
    render(); // rebuilds in the committed order (inline transforms cleared)
  };
  d.card.addEventListener("transitionend", commit);
  setTimeout(commit, 220); // fallback if transitionend doesn't fire
}

function onPointerCancel(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  render(); // discard transforms, restore the original order
}

// Move state.posts[from] to index `to`, then re-pair the sorted publish
// dates with the new order (each draft keeps its date count; values shift so
// position drives chronology).
function reorderByIndex(from, to) {
  const posts = state.posts;
  if (from === to || from < 0 || to < 0 || from >= posts.length || to >= posts.length) return;
  const [moved] = posts.splice(from, 1);
  posts.splice(to, 0, moved);

  const countByPost = new Map();
  for (const s of state.slots) countByPost.set(s.post.id, (countByPost.get(s.post.id) || 0) + 1);
  const sortedWhen = state.slots.map((s) => s.when).sort((a, b) => a - b);
  const next = [];
  let i = 0;
  for (const post of posts) {
    const k = countByPost.get(post.id) || 0;
    for (let j = 0; j < k; j++) next.push({ post, when: sortedWhen[i++] });
  }
  state.slots = next;
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
    // Batch days (the posts being scheduled right now) read as a filled,
    // accented cell so the spread the presets produce is unmistakable.
    // Existing-queue days stay a quiet grey dot. A day can carry both —
    // show a marker for each so neither is hidden behind the other.
    const dots = [];
    if (queued > 0) dots.push(`<span class="schedule-modal__day-dot is-queued"></span>`);
    if (existing > 0) dots.push(`<span class="schedule-modal__day-dot is-existing"></span>`);
    const aria =
      queued > 0
        ? `${queued} in this batch${existing > 0 ? `, ${existing} already scheduled` : ""}`
        : `${existing} scheduled`;
    cells += `
      <button
        type="button"
        class="schedule-modal__day ${inMonth ? "" : "is-out"} ${isToday ? "is-today" : ""} ${isFocused ? "is-focused" : ""} ${queued > 0 ? "has-batch" : ""}"
        data-schedule-day="${k}"
        aria-label="${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — ${aria}"
      >
        <span class="schedule-modal__day-num">${d.getDate()}</span>
        ${dots.length ? `<span class="schedule-modal__day-dots">${dots.join("")}</span>` : ""}
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
    <div class="schedule-modal__cal-legend">
      <span class="schedule-modal__cal-legend-item schedule-modal__cal-legend-item--batch">
        <span class="schedule-modal__legend-swatch"></span>This batch
      </span>
      <span class="schedule-modal__cal-legend-item">
        <span class="schedule-modal__day-dot is-existing"></span>Already scheduled
      </span>
    </div>
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

function toDateInput(ts) {
  const d = new Date(ts || defaultStartFrom());
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
