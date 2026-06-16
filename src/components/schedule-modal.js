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
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=20";
import { renderProfileTag, profileForNetwork } from "../social-profiles.js?v=2";

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
  calendarMonth: null, // Date pinned to the 1st of the visible month
  focusedDayKey: null, // string from dayKey()
};

let unsubscribeQueue = null;
let computeTimer = null; // pending "Compute best times" timeout

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
// Drives the spread off the user's chosen strategy: the cadence chip
// decides which days qualify, the free-text note refines time-of-day and
// excludes weekdays, and `startFrom` is day 0. We assign one draft per
// qualifying day in order, then set each draft's hour from its network's
// optimal window (biased by the note). Day pattern is bounded to ~1 year
// of look-ahead so a pathological note can't loop forever.
function strategyDays(count, strategy) {
  const start = startOfDay(strategy.startFrom || defaultStartFrom());
  const cadence = CADENCES.find((c) => c.id === strategy.cadence) || CADENCES[0];
  const avoid = parseAvoidDays(strategy.note);
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
    if (qualifies && !avoid.has(dow)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ── Recurrence horizon ────────────────────────────────────────────────
// The scheduling strategy is a *frequency*: each draft is republished on
// every day matching the cadence, across a ~1-month horizon from
// `startFrom`. We cap occurrences per draft so a dense cadence ("every
// weekday") can't flood the list. Same model whether there's one draft
// or many — a single draft on "Twice a week" simply gets its own series.
const RECUR_HORIZON_DAYS = 28; // ~1 month of look-ahead
const MAX_DATES_PER_DRAFT = 8; // keeps the list usable on dense cadences

// Walk the horizon and collect every day matching the cadence, skipping
// any weekday the note excluded. Bounded by both the horizon and the
// per-draft cap. Returns the shared series every draft recurs on.
function cadenceDays(strategy) {
  const start = startOfDay(strategy.startFrom || defaultStartFrom());
  const cadence = CADENCES.find((c) => c.id === strategy.cadence) || CADENCES[0];
  const avoid = parseAvoidDays(strategy.note);
  const startDow = start.getDay();
  const days = [];
  const cursor = new Date(start);
  for (let i = 0; i <= RECUR_HORIZON_DAYS && days.length < MAX_DATES_PER_DRAFT; i++) {
    const dow = cursor.getDay();
    let qualifies;
    if (cadence.every) {
      qualifies = i % cadence.every === 0;
    } else if (cadence.weekly) {
      qualifies = dow === startDow;
    } else {
      qualifies = cadence.days.includes(dow);
    }
    if (qualifies && !avoid.has(dow)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Recurrence spread: every draft lands on each cadence day, at its
// network's optimal hour (biased by the note). When several drafts share
// a day we stagger them an hour apart (capped at 22h) so they don't
// collide on the exact same timestamp.
function optimalSlots(posts, strategy = state.strategy) {
  const days = cadenceDays(strategy);
  const timeOfDay = strategy.timeOfDay || parseTimeOfDay(strategy.note);
  const fallback = startOfDay(strategy.startFrom || defaultStartFrom());
  const useDays = days.length ? days : [fallback];

  const slots = [];
  posts.forEach((p, idx) => {
    const network = (p.network || "linkedin").toLowerCase();
    const map = PER_NETWORK_OPTIMAL[network] || FALLBACK_OPTIMAL;
    const hour = Math.min(pickHour(map.hours, timeOfDay) + idx, 22);
    for (const day of useDays) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      slots.push({ post: p, when: slot.getTime() });
    }
  });
  return slots;
}

// One publish per draft, spread across the cadence days in order — the
// minimal layout "Clear all dates" collapses the recurrence back to.
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

// Appends one publish slot for a draft, one day after its latest current
// time (or tomorrow 9am if it somehow has none). Pushed to the flat slots
// array — renderSlotList groups it back under the right card.
function appendDateForPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  const times = state.slots.filter((s) => s.post.id === postId).map((s) => s.when);
  // Hard cap — a post can carry at most MAX_DATES_PER_DRAFT publish dates.
  if (times.length >= MAX_DATES_PER_DRAFT) return;
  let next;
  if (times.length) {
    next = new Date(Math.max(...times));
    next.setDate(next.getDate() + 1);
  } else {
    next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  }
  state.slots.push({ post, when: next.getTime() });
}

// "Add date to all" — append ONE shared publish date (same timestamp) to
// every draft, so the user picks a single common slot in one action
// rather than each draft drifting to its own next day. Defaults to one
// day after the latest date in the whole batch (9am), then lands on every
// draft; the user can fine-tune any individual row afterwards.
function addSharedDateToAll() {
  const all = state.slots.map((s) => s.when);
  const next = all.length ? new Date(Math.max(...all)) : new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  const when = next.getTime();
  // Skip any draft already at the per-post cap so the shared date can't
  // push a post past MAX_DATES_PER_DRAFT.
  state.posts.forEach((post) => {
    const count = state.slots.filter((s) => s.post.id === post.id).length;
    if (count < MAX_DATES_PER_DRAFT) state.slots.push({ post, when });
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

// Expand the strategy into the full recurrence — the work "Compute best
// times" commits. Strategy controls (chips, note, start date) only stage
// their values; nothing lands in the list until this runs.
function recomputeOptimal() {
  state.mode = "optimal";
  state.slots = optimalSlots(state.posts, state.strategy);
  snapCalendarToFirst();
}

// Collapse to a single date per draft — the default on open and what
// flipping back to Optimal mode resets to before a recurrence is computed.
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
  // "Add another date" (per draft) — append a slot one day after the
  // draft's latest existing time, same hour, so each new row reads as a
  // sensible next window rather than landing on top of an existing one.
  const addBtn = event.target.closest("[data-schedule-add]");
  if (addBtn) {
    appendDateForPost(addBtn.dataset.scheduleAdd);
    render();
    return;
  }
  // "Add date to all" — one shared date applied to every draft at once.
  if (event.target.closest("[data-schedule-add-all]")) {
    addSharedDateToAll();
    render();
    return;
  }
  // "Clear all dates" — collapse the recurrence back to one slot per
  // draft (optimal one-each spread, or the custom one-per-day seed).
  if (event.target.closest("[data-schedule-clear]")) {
    state.slots = state.mode === "optimal" ? spreadOneEach(state.posts) : customDefaultSlots(state.posts);
    render();
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
      // A manual edit implies Custom mode — flip the radio checked
      // state without a full re-render so we don't steal focus from
      // the datetime input the user is mid-edit on.
      if (state.mode !== "custom") {
        state.mode = "custom";
        const customRadio = document.querySelector('input[name="schedule-mode"][value="custom"]');
        if (customRadio) customRadio.checked = true;
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
          ? "Pick how often this post should publish — I'll recur it on your strategy at its network's best hours."
          : "Pick how often each post should publish. I'll recur them on your strategy at each network's best hours."}
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
        ${raw(renderSlotList())}
      </section>
      <aside class="schedule-modal__right" aria-label="Already scheduled">${raw(renderCalendarPanel())}</aside>
    </div>

    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left">
        <button
          type="button"
          class="ap-button stroked grey schedule-modal__clear"
          data-schedule-clear
          ${state.slots.length <= state.posts.length || state.status === "scheduling" ? "disabled" : ""}
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
          ${state.status === "scheduling" ? "disabled" : ""}
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
  const optimalSub = multi ? "Recur each post on your strategy" : "Recur this post on your strategy";
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
          <i class="ap-icon-sparkles" aria-hidden="true"></i>
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
          class="ap-button stroked blue schedule-modal__compute"
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

// Slots are flat [{post, when}], but a single draft can carry several
// publish times — so we group by post.id and render one card per draft,
// each holding one date-row per slot plus an "Add another date" link
// (mirrors the Figma "Add another date" affordance). The flat-array index
// stays the key for edit/remove so the change/click handlers don't move.
function slotsForPost(postId) {
  return state.slots.map((s, idx) => ({ s, idx })).filter(({ s }) => s.post.id === postId);
}

function renderSlotList() {
  const multi = state.posts.length > 1;
  // "Add date to all" is dead once every draft has hit the per-post cap.
  const allAtCap = state.posts.every((p) => slotsForPost(p.id).length >= MAX_DATES_PER_DRAFT);
  const header = `
    <div class="schedule-modal__slots-head">
      <span class="schedule-modal__slots-count">${state.posts.length} ${state.posts.length === 1 ? "draft" : "drafts"}</span>
      ${
        multi
          ? `<button type="button" class="ap-button stroked blue schedule-modal__add-all" data-schedule-add-all ${allAtCap ? "disabled" : ""}>
               <i class="ap-icon-plus"></i><span>Add date to all</span>
             </button>`
          : ""
      }
    </div>
  `;
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
        <div class="schedule-modal__slot" data-schedule-post="${escapeText(post.id)}">
          <div class="schedule-modal__slot-post">
            <div class="schedule-modal__slot-head">
              ${renderProfileTag(profileForNetwork(network), { network })}
            </div>
            <div class="schedule-modal__slot-text">${escapeText(text)}</div>
          </div>
          <div class="schedule-modal__slot-dates">${dateRows}</div>
          <button
            type="button"
            class="ap-button secondary blue schedule-modal__add-date"
            data-schedule-add="${escapeText(post.id)}"
            ${entries.length >= MAX_DATES_PER_DRAFT ? `disabled title="Up to ${MAX_DATES_PER_DRAFT} dates per post"` : ""}
          >
            <i class="ap-icon-plus"></i><span>Add another date</span>
          </button>
        </div>
      `;
    })
    .join("");
  return `<div class="schedule-modal__slots">${header}${cards}</div>`;
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
      <span class="schedule-modal__cal-legend-item">
        <span class="schedule-modal__day-dot is-queued"></span>This batch
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

function escapeText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
