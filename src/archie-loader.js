// Single source of truth for the prototype's loader.
//
// Every spinner in Archie — the DS `.ap-loader`, the per-component
// `*-spinner` classes, the `.archie-loader` brand loaders — renders the
// same "network-assemble" mark: an orange Agorapulse glyph revealed
// through a wave of rounded squares that scale in along a path.
//
// Why a JS injector instead of pure CSS? The mark is an animated SVG
// (SMIL). SVG animations are FROZEN when the file is used as a CSS
// `background-image` / `mask-image` — they only run for inline `<svg>`
// (or `<img>`). So we keep the existing loader *elements* (and their
// `--archie-loader-size` / `--archie-loader-color` levers in
// archie-loader.css) and just drop the animated SVG inside each one.
//
// `initArchieLoader()` sweeps the current DOM once and then watches for
// any future loader element (screens re-render their innerHTML on every
// route change, modals/panels inject lazily) — so a single call at boot
// covers the whole app with no per-call-site edits.
//
// The SVG paints with `currentColor`, so the colour is driven by the
// element's `color` (set from `--archie-loader-color` in the CSS):
// brand orange by default, white on filled CTAs, etc.

// The loader element classes that should host the animated mark. Kept in
// lockstep with the selector list in styles/components/archie-loader.css.
const LOADER_SELECTOR = [
  ".archie-loader",
  ".ap-loader",
  ".chat-bubble-source-intake__spinner",
  ".extracting-notice__spinner",
  ".drafts-card__spinner",
  ".session__composer-thinking-spinner",
  ".source-card__spinner",
  ".bug-report-modal__submit-spinner",
  ".feedback-modal__submit-spinner",
  ".gen-image-spinner",
  ".schedule-modal__spinner",
  ".add-source__file-spinner",
].join(",");

// The provided 10-network-assemble loader, recoloured to `currentColor`
// and with the mask id templated (`__MASKID__`) so each injected copy
// gets a document-unique id — duplicate ids would make every instance
// reference the first loader's mask and break when it unmounts.
const LOADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 227.15 170.03" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true"><defs><mask id="__MASKID__"><g transform="translate(99,24)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.000s" repeatCount="indefinite"/></rect></g><g transform="translate(56,64)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.114s" repeatCount="indefinite"/></rect></g><g transform="translate(20,99)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.229s" repeatCount="indefinite"/></rect></g><g transform="translate(66,144)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.343s" repeatCount="indefinite"/></rect></g><g transform="translate(113,97)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.457s" repeatCount="indefinite"/></rect></g><g transform="translate(158,53)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.571s" repeatCount="indefinite"/></rect></g><g transform="translate(204,97)"><rect x="-30.0" y="-30.0" width="60" height="60" rx="10" fill="#fff" transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;0;1;1;0;0" keyTimes="0;0.06;0.36;0.58;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1" dur="0.8s" begin="-0.686s" repeatCount="indefinite"/></rect></g></mask></defs><path d="M99,24 L56,64 L20,99 L66,144 L113,97 L158,53 L204,97" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.20"/><path d="M227.15,81.98v29.37c0,4.69-3.81,8.5-8.5,8.5h-29.37c-4.69,0-8.5-3.81-8.5-8.5v-27.11c0-4.69-3.78-8.5-8.47-8.5h-27.45c-4.69,0-8.5,3.81-8.5,8.5v26.91c0,4.69-3.78,8.47-8.47,8.47h-28.92c-4.69,0-8.5,3.81-8.5,8.5v33.89c0,4.69-3.78,8.47-8.47,8.47h-32.67c-4.69,0-8.47-3.78-8.47-8.47v-34.03c0-4.69-3.81-8.47-8.5-8.47H8.47c-4.69,0-8.47-3.81-8.47-8.5v-23.86c0-4.69,3.78-8.47,8.47-8.47h23.89c4.69,0,8.5-3.81,8.5-8.5v-14.18c0-4.69,3.78-8.5,8.47-8.5h16.07c4.69,0,8.47-3.78,8.47-8.44V8.5C73.87,3.81,77.66,0,82.34,0h32.64C119.67,0,123.46,3.81,123.46,8.5v32.11c0,4.69-3.78,8.47-8.47,8.47h-32.64c-4.69,0-8.47,3.81-8.47,8.5v14.46c0,4.69-3.81,8.5-8.5,8.5h-16.04c-4.69,0-8.47,3.78-8.47,8.47v20.05c0,4.69,3.78,8.5,8.47,8.5h32.67c4.69,0,8.47-3.81,8.47-8.5v-26.83c0-4.72,3.81-8.5,8.5-8.5h30.38c3.87,0,7-3.13,7-7v-26.94c0-4.69,3.81-8.5,8.5-8.5h27.45c4.69,0,8.47,3.81,8.47,8.5v25.22c0,4.69,3.81,8.47,8.5,8.47h29.37c4.69,0,8.5,3.81,8.5,8.5Z" fill="currentColor" mask="url(#__MASKID__)"/></svg>`;

let maskSeq = 0;

function injectInto(el) {
  // Already hosting the mark — skip (re-rendered elements come back as
  // fresh nodes without the flag, so they get re-injected naturally).
  if (el.dataset.archieLoader === "1") return;
  el.dataset.archieLoader = "1";
  maskSeq += 1;
  el.innerHTML = LOADER_SVG.replace(/__MASKID__/g, `nw-mask-${maskSeq}`);
}

function sweep(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && node.matches(LOADER_SELECTOR)) injectInto(node);
  if (node.querySelectorAll) {
    node.querySelectorAll(LOADER_SELECTOR).forEach(injectInto);
  }
}

let started = false;

export function initArchieLoader() {
  if (started) return;
  started = true;

  // Initial pass over whatever is already mounted.
  sweep(document.body);

  // Screens re-render their innerHTML on every route change and modals /
  // panels inject lazily, so watch for any loader element added later.
  // Setting our own innerHTML adds an <svg> child — but the svg matches
  // no loader class, and the host is already flagged, so there's no loop.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(sweep);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
