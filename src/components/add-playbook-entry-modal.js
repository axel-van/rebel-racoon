// Add a competitor / influencer to a Playbook.
//
// One modal for both, because the two entities differ only in the noun: a name,
// somewhere to reach them, and (for creators) a reach figure. `kind` picks the
// copy; everything else is shared.
//
//   open({ kind: "competitors" | "influencers", onAdd })
//     onAdd(entries[]) — called once on Done with everything added this session,
//                        shaped for contexts-store (name / description / reach /
//                        websiteUrl / socials[]).
//
// ── Why it stays open after each Add ───────────────────────────────────────
// Nobody adds one competitor. The handoff has an "Added this session" list for
// exactly this reason: you paste, press Add, and the row joins a list while the
// field clears for the next one. Committing on every Add and closing would make
// adding four entries a four-times-reopen job.
//
// ── Two ways in, deliberately ──────────────────────────────────────────────
// The top half is precise: pick a network, paste a URL. The bottom half is for
// when you don't have URLs — type names in plain language and I propose a
// Facebook page, an Instagram page and a website for each, every one with its own
// Add so you take only what you recognise. The proposals are DERIVED from the
// name (a slug), never fetched: this is a prototype and a fake "verified" profile
// URL would be worse than an obvious guess.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";

const MODAL_ID = "add-playbook-entry";

const KINDS = {
  competitors: {
    title: "Add a competitor",
    noun: "competitor",
    namesLabel: "List competitor names",
    namesPlaceholder: "e.g. Fi, Whistle, Jiobit — one per line or comma-separated",
    urlPlaceholder: "Paste a profile or website URL",
  },
  influencers: {
    title: "Add an influencer",
    noun: "influencer",
    namesLabel: "List influencer names",
    namesPlaceholder: "e.g. The Dogist, Loki the Wolfdog — one per line or comma-separated",
    urlPlaceholder: "Paste a profile or website URL",
  },
};

const NETWORKS = [
  { id: "facebook", label: "Facebook", icon: "ap-icon-facebook" },
  { id: "instagram", label: "Instagram", icon: "ap-icon-instagram" },
  { id: "x", label: "X", icon: "ap-icon-twitter" },
  { id: "website", label: "Website", icon: "ap-icon-web" },
];

let backdrop, panel, bodyEl, titleEl;
let initialized = false;
let spec = null;
let network = "instagram";
let added = []; // entries staged this session
let suggestions = []; // { name, options: [{network, url, taken}] }
let onAddCb = null;

const SHELL = `
<div class="app-modal-backdrop apbe__backdrop" id="apbeBackdrop" hidden></div>
<aside class="apbe" id="apbeModal" role="dialog" aria-modal="true" aria-labelledby="apbeTitle" tabindex="-1" hidden>
  <header class="apbe__head">
    <h2 class="apbe__title" id="apbeTitle"></h2>
    <button type="button" class="ap-icon-button ghost grey" data-apbe-close aria-label="Close">
      <i class="ap-icon-close" aria-hidden="true"></i>
    </button>
  </header>
  <div class="apbe__body"></div>
  <footer class="apbe__foot">
    <button type="button" class="ap-button stroked grey" data-apbe-close><span>Cancel</span></button>
    <button type="button" class="ap-button primary blue" data-apbe-done><span>Done</span></button>
  </footer>
</aside>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);

  backdrop = document.getElementById("apbeBackdrop");
  panel = document.getElementById("apbeModal");
  titleEl = panel.querySelector(".apbe__title");
  bodyEl = panel.querySelector(".apbe__body");

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", onInput);
  panel.addEventListener("keydown", onKeydown);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) close();
  });
  initialized = true;
}

export function open({ kind = "competitors", onAdd = null } = {}) {
  spec = KINDS[kind] || KINDS.competitors;
  init();
  requestOpen(MODAL_ID, close);
  network = kind === "competitors" ? "facebook" : "instagram";
  added = [];
  suggestions = [];
  onAddCb = onAdd;
  titleEl.textContent = spec.title;
  paint();
  backdrop.hidden = false;
  backdrop.classList.add("open");
  panel.hidden = false;
  panel.focus?.();
}

export function close() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  spec = null;
  added = [];
  suggestions = [];
  onAddCb = null;
  notifyClose(MODAL_ID);
}

// ── Render ─────────────────────────────────────────────────────────────────

function paint() {
  bodyEl.innerHTML = renderBody();
  // Keep the caret in the URL field between Adds — the whole point of staying
  // open is to type the next one immediately.
  const url = bodyEl.querySelector("[data-apbe-url]");
  if (url) url.focus();
}

function renderBody() {
  return html`<div class="apbe__net" role="radiogroup" aria-label="Network">
      ${raw(
        NETWORKS.map(
          (n) =>
            html`<button
              type="button"
              class="apbe__netbtn${raw(network === n.id ? " is-selected" : "")}"
              role="radio"
              aria-checked="${network === n.id ? "true" : "false"}"
              data-apbe-net="${escapeAttr(n.id)}"
            >
              <i class="${n.icon}" aria-hidden="true"></i><span>${n.label}</span>
            </button>`,
        ).join(""),
      )}
    </div>

    <div class="apbe__urlrow">
      <input type="text" class="apbe__input" placeholder="${escapeAttr(spec.urlPlaceholder)}" data-apbe-url />
      <button type="button" class="ap-button secondary blue" data-apbe-add-url><span>Add</span></button>
    </div>

    ${raw(renderAdded())}

    <div class="apbe__or"><span>OR</span></div>

    <label class="apbe__field">
      <span class="apbe__label">${spec.namesLabel}</span>
      <textarea
        class="apbe__textarea"
        rows="3"
        placeholder="${escapeAttr(spec.namesPlaceholder)}"
        data-apbe-names
      ></textarea>
    </label>
    <button type="button" class="ap-button stroked blue apbe__suggest" data-apbe-suggest>
      <i class="ap-icon-sparkles" aria-hidden="true"></i><span>Find their profiles</span>
    </button>
    ${raw(renderSuggestions())}`;
}

function renderAdded() {
  if (!added.length) return "";
  return html`<section class="apbe__added">
    <h3 class="apbe__added-title">Added this session <span class="ap-tag grey mini">${added.length}</span></h3>
    <ul class="apbe__addedlist">
      ${raw(
        added
          .map(
            (e, i) =>
              html`<li class="apbe__addedrow">
                <i class="${iconFor(e)}" aria-hidden="true"></i>
                <span class="apbe__addedname">${e.name}</span>
                <span class="apbe__addedurl">${e.websiteUrl || e.socials?.[0]?.url || ""}</span>
                <button
                  type="button"
                  class="ap-icon-button ghost grey"
                  data-apbe-undo="${i}"
                  aria-label="Remove ${escapeAttr(e.name)}"
                >
                  <i class="ap-icon-close" aria-hidden="true"></i>
                </button>
              </li>`,
          )
          .join(""),
      )}
    </ul>
  </section>`;
}

function renderSuggestions() {
  if (!suggestions.length) return "";
  return html`<section class="apbe__sugs">
    ${raw(
      suggestions
        .map(
          (s, si) =>
            html`<div class="apbe__sug">
              <span class="apbe__sug-name">${s.name}</span>
              <ul class="apbe__suglist">
                ${raw(
                  s.options
                    .map(
                      (o, oi) =>
                        html`<li class="apbe__sugrow">
                          <i
                            class="${NETWORKS.find((n) => n.id === o.network)?.icon || "ap-icon-web"}"
                            aria-hidden="true"
                          ></i>
                          <span class="apbe__sugurl">${o.url}</span>
                          ${raw(
                            o.taken
                              ? html`<span class="apbe__sugdone"
                                  ><i class="ap-icon-rounded-check" aria-hidden="true"></i
                                ></span>`
                              : html`<button
                                  type="button"
                                  class="ap-button ghost blue"
                                  data-apbe-add-sug="${si}"
                                  data-apbe-sug-opt="${oi}"
                                >
                                  <span>Add</span>
                                </button>`,
                          )}
                        </li>`,
                    )
                    .join(""),
                )}
              </ul>
            </div>`,
        )
        .join(""),
    )}
  </section>`;
}

function iconFor(entry) {
  const net = entry.socials?.[0]?.network || "website";
  return NETWORKS.find((n) => n.id === net)?.icon || "ap-icon-web";
}

// ── Behaviour ──────────────────────────────────────────────────────────────

/** A readable name out of a pasted URL: the last meaningful path or host part. */
function nameFromUrl(url) {
  const clean = String(url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0].split(".")[0];
  return last
    .replace(/^@/, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function entryFromUrl(url, net) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const name = nameFromUrl(trimmed);
  if (!name) return null;
  return net === "website"
    ? { name, description: "", reach: "", websiteUrl: href, socials: [] }
    : { name, description: "", reach: "", websiteUrl: "", socials: [{ network: net, url: href }] };
}

// Proposals are derived from the name, not fetched. A slug per network, clearly
// a guess, each individually addable — see the header note.
function slug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildSuggestions(raw) {
  const names = String(raw || "")
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const s = slug(name);
    if (!s) continue;
    out.push({
      name,
      options: [
        { network: "facebook", url: `facebook.com/${s}`, taken: false },
        { network: "instagram", url: `instagram.com/${s}`, taken: false },
        { network: "website", url: `${s}.com`, taken: false },
      ],
    });
  }
  return out;
}

function stage(entry) {
  if (!entry) return;
  // Same-name entries collapse into one, merging their socials — pasting a
  // brand's Facebook and Instagram should produce one competitor with two
  // profiles, not two competitors with the same name.
  const key = entry.name.trim().toLowerCase();
  const existing = added.find((e) => e.name.trim().toLowerCase() === key);
  if (existing) {
    for (const s of entry.socials || []) {
      if (!existing.socials.some((x) => x.url === s.url)) existing.socials.push(s);
    }
    if (!existing.websiteUrl && entry.websiteUrl) existing.websiteUrl = entry.websiteUrl;
    return;
  }
  added.push(entry);
}

function onClick(event) {
  if (event.target.closest("[data-apbe-close]")) {
    close();
    return;
  }

  const net = event.target.closest("[data-apbe-net]");
  if (net) {
    network = net.dataset.apbeNet;
    paint();
    return;
  }

  if (event.target.closest("[data-apbe-add-url]")) {
    const input = bodyEl.querySelector("[data-apbe-url]");
    const entry = entryFromUrl(input?.value, network);
    if (!entry) return;
    stage(entry);
    paint();
    return;
  }

  const undo = event.target.closest("[data-apbe-undo]");
  if (undo) {
    added.splice(Number(undo.dataset.apbeUndo), 1);
    paint();
    return;
  }

  if (event.target.closest("[data-apbe-suggest]")) {
    const text = bodyEl.querySelector("[data-apbe-names]")?.value;
    suggestions = buildSuggestions(text);
    paint();
    return;
  }

  const addSug = event.target.closest("[data-apbe-add-sug]");
  if (addSug) {
    const s = suggestions[Number(addSug.dataset.apbeAddSug)];
    const o = s?.options[Number(addSug.dataset.apbeSugOpt)];
    if (!s || !o) return;
    stage(
      o.network === "website"
        ? { name: s.name, description: "", reach: "", websiteUrl: `https://${o.url}`, socials: [] }
        : {
            name: s.name,
            description: "",
            reach: "",
            websiteUrl: "",
            socials: [{ network: o.network, url: `https://${o.url}` }],
          },
    );
    // Mark taken rather than removing the row, so the list doesn't reflow under
    // the cursor while you work down it.
    o.taken = true;
    paint();
    return;
  }

  if (event.target.closest("[data-apbe-done]")) {
    const cb = onAddCb;
    const entries = added.slice();
    close();
    if (cb && entries.length) cb(entries);
    return;
  }
}

function onInput() {
  /* fields are read on demand — nothing to sync */
}

// Enter in the URL field adds, rather than doing nothing. Matches the repeat-add
// rhythm the modal is built around.
function onKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.target.closest("[data-apbe-url]")) {
    event.preventDefault();
    bodyEl.querySelector("[data-apbe-add-url]")?.click();
  }
}
