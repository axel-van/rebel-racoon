// Image Studio — a near-fullscreen modal that generates an image for a draft and
// hands it back. Two peer modes, Generate and Edit.
//
// This file is the lifecycle and nothing else: inject the shell once, open on a
// draft, subscribe, render, close. Everything the user does is elsewhere.
//
//   Module map
//     context.js        MODAL_ID / KEY / ctx / state() / FRAME_SEL / autosize
//     stage-view.js     the shell: header, mode dispatch, in-feed preview, footer
//     setup-stage.js    Generate's stage: the options half + the preview half
//     settings-view.js  the seven option rows and the controls inside them
//     references-view.js  ─┐ two of those rows, each with real internal structure
//     branding-view.js    ─┘
//     brief-blocks.js   the brief, read and edited as blocks (the Advanced pane)
//     preview-column.js the preview half: four states, one column
//     composer-view.js  the bottom composer — Edit mode only
//     tools-view.js     Edit mode's floating tool palette + its one flyout
//     edit-view.js      the edit canvas: overlays, crop box, text mini-toolbar
//     events.js         every delegated listener
//     commit.js         the paths that write to the draft
//     inline-text.js    the code that patches the DOM instead of re-rendering
//     interactions.js   file pickers + on-canvas pointer gestures
//   Plus two modules outside this directory:
//     src/image-studio.js         the state engine — UI-agnostic, all the mocks
//     src/image-studio-canvas.js  pure canvas helpers (bake / crop / text metrics)
//
// State lives entirely in the engine, keyed by KEY, and every mutation notifies
// back into renderBody() — so the render path is one-way and the whole body is
// rebuilt on any change. The exceptions, and why they have to exist, are in
// inline-text.js.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../../modal-coordinator.js?v=1180";
import { getPosts } from "../../posts-store.js?v=1180";
import { getSessionById } from "../../sessions-store.js?v=1180";
import { getContextById } from "../../contexts-store.js?v=1180";
import { MODAL_ID, KEY, ctx, state, autosize } from "./context.js?v=1180";
import { loadImg } from "../../image-studio-canvas.js?v=1180";
import { renderStudio } from "./stage-view.js?v=1180";
import { offerUndoIfNeeded, resetUndoOffers } from "./prompt-guard.js?v=1180";
import { bindStudioEvents } from "./events.js?v=1180";
import * as imageStudio from "../../image-studio.js?v=1180";

let backdrop;
let initialized = false;
let unsub = null;

const HTML = `
<div class="app-modal-backdrop isv2-backdrop" id="isv2Backdrop" hidden></div>
<aside
  class="ap-dialog isv2-modal"
  id="isv2Modal"
  role="dialog"
  aria-modal="true"
  aria-label="Generate an image"
  aria-hidden="true"
>
  <button class="ap-dialog-close isv2-close" type="button" data-img-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="isv2-body" id="isv2Body"></div>
</aside>`;

function renderBody() {
  const st = state();
  if (!st || !ctx.body) return;
  // Toggling an option row re-renders the WHOLE body (the one-way path), which replaces
  // the options scroller with a fresh node at scrollTop 0 — so a card you expanded after
  // scrolling would snap the pane back to the top, reading as the blocks "jumping".
  // Carry the scroll across the swap; `.isv2-opts` is a singleton in the body.
  const prevOptsScroll = ctx.body.querySelector(".isv2-opts")?.scrollTop ?? 0;
  ctx.body.innerHTML = renderStudio(st);
  const opts = ctx.body.querySelector(".isv2-opts");
  if (opts) opts.scrollTop = prevOptsScroll;
  // The edit composer auto-grows to whatever carried over a re-render.
  autosize(ctx.body.querySelector("[data-img-edit-prompt]"));
  // The brief blocks size to their own content, so a long section is never clipped and
  // a short one never reserves space it doesn't need — which is what lets the whole
  // brief fit beside the preview without scrolling.
  ctx.body.querySelectorAll(".isv2-bs-val").forEach(autosize);
  // A rewrite that replaced hand-written text offers one step back. It has to be
  // read off the render pass — see prompt-guard.js#offerUndoIfNeeded.
  offerUndoIfNeeded(st);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("isv2Backdrop");
  ctx.modal = document.getElementById("isv2Modal");
  ctx.body = document.getElementById("isv2Body");
  bindStudioEvents({ modal: ctx.modal, close });
  // `isOpen` doubles as a veto: while the prompt guard is up, Escape and a
  // backdrop click must NOT close the studio — that would answer "you'll lose your
  // prompt" by throwing away the whole session. The guard has its own Escape (see
  // events.js#onGuardKeydown) and swallows clicks (events.js#onClick).
  bindOverlayDismissal({
    modal: ctx.modal,
    backdrop,
    close,
    isOpen: () => ctx.modal.classList.contains("open") && !state()?.pendingSettingChange,
  });
}

export function open(postId, opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  ctx.postId = postId || null;
  ctx.sessionId = opts.sessionId || null;

  // Resolve the draft's network so the format options + default match where the
  // image will publish (a LinkedIn draft defaults to LinkedIn's ratio).
  const post = ctx.sessionId ? getPosts(ctx.sessionId).find((p) => p.id === ctx.postId) : null;
  // carouselUrls reopens an existing carousel in the results view (add / remove /
  // regenerate slides) — that is what "Edit slides" on a multi-slide draft does.
  // editImageUrl opens straight into Edit mode on a single existing image; it is
  // supported here but currently has no UI entry point, because a single image's
  // hover bar offers Change / Remove rather than an Edit that opens the studio.
  // Otherwise: the generate flow.
  const editImageUrl = opts.editImageUrl || null;
  const carouselUrls = Array.isArray(opts.carouselUrls) && opts.carouselUrls.length > 1 ? opts.carouselUrls : null;
  // Pull the session's Playbook brand reference images so generation stays
  // on-brand — the user can add their own or toggle the Playbook set off.
  const session = ctx.sessionId ? getSessionById(ctx.sessionId) : null;
  const context = session?.contextId ? getContextById(session.contextId) : null;
  imageStudio.start(KEY, {
    postId: ctx.postId,
    // The draft's copy — what "Suggest from this post" writes the brief from, so
    // the prompt Archie proposes is genuinely about this post.
    postText: Array.isArray(post?.text) ? post.text.join("\n") : post?.text || "",
    network: post?.network || null,
    formatId: post?.format || null,
    editImage: editImageUrl ? { url: editImageUrl } : null,
    carousel: carouselUrls ? { urls: carouselUrls } : null,
    // The default mark (what the Branding switch stamps) and the full set (what
    // Edit mode's "Add an image" offers) — see contexts-store#normalizeBrandLogos.
    playbookLogo: context?.brandLogo || "",
    playbookLogos: Array.isArray(context?.brandLogos) ? context.brandLogos : [],
    playbookRefs: context?.referenceImages || [],
    playbookName: context?.brandName || context?.name || "",
    playbookColors: (Array.isArray(context?.brandColors) ? context.brandColors : []).filter((c) => c && c.hex),
    // The brand's default look — three declarative criteria from the Brand section's
    // "Default look" row (image type, style preset, how to use a reference). Read,
    // never written: the studio's own chips are per-post and stop at this state.
    playbookImageDefaults: context?.imageDefaults || null,
  });
  resetUndoOffers();
  if (unsub) unsub();
  unsub = imageStudio.subscribe(KEY, renderBody);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  ctx.modal.classList.add("open");
  ctx.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();
  if (editImageUrl) {
    // Refine the working-image dims from the real image so the frame ratio and
    // the overlay bake match it (start() used a format-based guess).
    loadImg(editImageUrl)
      .then((img) => imageStudio.setEditImageDims(KEY, img.naturalWidth, img.naturalHeight))
      .catch(() => {});
  }
  // Nothing is derived on the way in. The brief is written when Generate is pressed
  // (image-studio.js#deriveNow) — the studio shows no brief before that, so a derive
  // here would be invisible work whose only effect is a dead button for two seconds.
}

function close() {
  if (!initialized) return;
  if (unsub) {
    unsub();
    unsub = null;
  }
  imageStudio.exit(KEY);
  ctx.modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  ctx.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  ctx.postId = null;
  ctx.sessionId = null;
  notifyClose(MODAL_ID);
}
