// "Report a bug" dialog. Self-contained: injects HTML into <body> on init(),
// then open()/close() toggle its visibility. No store — the modal has
// ephemeral local state that resets on each open.
//
// Adapted from the shared Content Studio prototype, trimmed down to the
// pieces that make sense for Archie:
//   - category chips (Visual glitch / Wrong behavior / Feature not working /
//     Performance / Other)
//   - "What were you trying to do?" free-text
//   - "What went wrong?" required textarea
//   - Screenshot — auto-captured via html2canvas, or drag/drop upload
//   - Context footer showing the current route + time
//
// On submit we simulate a ~1.4s round-trip and flash a success state; the
// modal then closes itself. Nothing is actually posted.

import { escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";

const MODAL_ID = "bugReport";

let backdrop, modal, submitBtn, problemInput, actionInput, problemError;
let categoriesEl, previewEl, dropzoneFallback, dropzone, fileInput;
let previewImg, fileNameEl, autoBadge, capturingBadge, captureFailedBadge, contextBar;
let selectedCategory = null;
let screenshotDataUrl = null;
let initialized = false;
// Stays false until the user clicks Submit once. Avoids yelling at
// people who haven't tried yet.
let hasAttemptedSubmit = false;

const CATEGORY_LABELS = {
  visual: "Visual glitch",
  behavior: "Wrong behavior",
  broken: "Feature not working",
  performance: "Performance",
  other: "Other",
};

const HTML = `
<div class="app-modal-backdrop bug-report-modal__backdrop" id="bugReportBackdrop" hidden></div>
<aside
  class="ap-dialog bug-report-modal"
  id="bugReportModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="bugReportTitle"
  aria-describedby="bugReportDescription"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <h2 class="ap-dialog-title" id="bugReportTitle">Report a bug</h2>
    <p class="ap-dialog-subtitle" id="bugReportDescription">Share what happened. Archie attaches the screen context.</p>
  </div>
  <button class="ap-dialog-close" type="button" id="closeBugReportBtn" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <div class="bug-report-modal__fields">
      <div class="bug-field">
        <label>What type of issue?</label>
        <div class="bug-categories" id="bugCategories" role="group" aria-label="Issue type">
          <button type="button" class="bug-category-chip" data-value="visual" aria-pressed="false">Visual glitch</button>
          <button type="button" class="bug-category-chip" data-value="behavior" aria-pressed="false">Wrong behavior</button>
          <button type="button" class="bug-category-chip" data-value="broken" aria-pressed="false">Feature not working</button>
          <button type="button" class="bug-category-chip" data-value="performance" aria-pressed="false">Performance</button>
          <button type="button" class="bug-category-chip" data-value="other" aria-pressed="false">Other</button>
        </div>
      </div>

      <div class="bug-field">
        <label for="bugActionInput">What were you trying to do?</label>
        <input class="bug-input" id="bugActionInput" type="text" placeholder="e.g. Schedule a post, add a source…" />
      </div>

      <div class="bug-field">
        <label for="bugProblemInput">What went wrong? <span class="bug-field__required">*</span></label>
        <textarea class="bug-textarea" id="bugProblemInput" rows="3" required placeholder="e.g. The calendar didn't open, the button did nothing, or the state reset unexpectedly…" aria-describedby="bugProblemError"></textarea>
        <p class="form-field-error" id="bugProblemError" role="alert" hidden>Describe what went wrong before submitting.</p>
      </div>

      <div class="bug-field">
        <div class="bug-field__label-row">
          <label>Screenshot</label>
          <span class="ap-status green" id="bugAutoBadge" hidden>Auto-captured</span>
          <span class="ap-status grey" id="bugCapturingBadge" hidden>Capturing…</span>
          <span class="ap-status grey" id="bugCaptureFailedBadge" hidden>Capture unavailable — upload one manually</span>
        </div>
        <div class="bug-report-dropzone has-file" id="bugScreenshotPreview" hidden>
          <div class="bug-report-preview">
            <img id="bugPreviewImg" src="" alt="Screenshot" />
            <span class="bug-report-preview__name" id="bugFileName">Page screenshot</span>
            <button type="button" class="ap-button transparent grey bug-report-preview__remove" id="bugRemoveFileBtn">Remove</button>
          </div>
        </div>
        <div id="bugDropzoneFallback">
          <div class="bug-report-dropzone" id="bugDropzone" role="button" tabindex="0" aria-label="Upload screenshot">
            <div class="bug-report-dropzone__primary">Drop an image here or <strong class="bug-report-dropzone__browse">browse</strong></div>
            <div class="bug-report-dropzone__hint">PNG, JPG, GIF — max 10 MB</div>
          </div>
          <input type="file" id="bugFileInput" accept="image/png,image/jpeg,image/gif" hidden />
        </div>
      </div>

      <div class="bug-context" id="bugContextBar"></div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="cancelBugReportBtn">Cancel</button>
      <button type="button" class="ap-button primary orange" id="submitBugReportBtn">Submit bug report</button>
    </div>
  </div>
  <div class="bug-report-modal__success">
    <div class="bug-report-modal__success-icon">
      <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
      </svg>
    </div>
    <h3>Bug reported</h3>
    <p>Thanks for helping improve Archie. Every report gets read.</p>
  </div>
</aside>`;

function focusSafe(el) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function setScreenshot(dataUrl) {
  screenshotDataUrl = dataUrl;
  previewImg.src = dataUrl;
  fileNameEl.textContent = "Page screenshot";
  previewEl.hidden = false;
  dropzoneFallback.hidden = true;
  capturingBadge.hidden = true;
  captureFailedBadge.hidden = true;
  autoBadge.hidden = false;
}

function clearScreenshot() {
  screenshotDataUrl = null;
  previewImg.src = "";
  fileNameEl.textContent = "";
  previewEl.hidden = true;
  dropzoneFallback.hidden = false;
  autoBadge.hidden = true;
  capturingBadge.hidden = true;
  captureFailedBadge.hidden = true;
  fileInput.value = "";
}

function reset() {
  modal.classList.remove("success");
  selectedCategory = null;
  categoriesEl.querySelectorAll(".bug-category-chip").forEach((c) => c.classList.remove("selected"));
  actionInput.value = "";
  problemInput.value = "";
  setProblemInvalid(false);
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit bug report";
  clearScreenshot();
  contextBar.innerHTML = "";
  hasAttemptedSubmit = false;
}

function setProblemInvalid(invalid) {
  problemInput.classList.toggle("invalid", invalid);
  if (problemError) problemError.hidden = !invalid;
}

// html2canvas is loaded on first capture, not at page load. If it fails
// (offline, CSP, etc) we silently drop the screenshot and let the user upload
// one manually.
async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  // 3-second budget — past that the capture is dead weight and the
  // "Capturing…" badge needs to flip to "Capture unavailable" so the
  // user can upload manually instead of waiting on a stuck CDN.
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    const timer = setTimeout(() => {
      reject(new Error("html2canvas timeout"));
    }, 3000);
    s.onload = () => {
      clearTimeout(timer);
      resolve(window.html2canvas);
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error("html2canvas unavailable"));
    };
    document.head.appendChild(s);
  });
}

async function capturePageScreenshot() {
  try {
    const h2c = await loadHtml2Canvas();
    const canvas = await h2c(document.documentElement, {
      scale: 0.55,
      useCORS: true,
      logging: false,
      ignoreElements: (el) =>
        el.id === "bugReportModal" ||
        el.id === "bugReportBackdrop" ||
        el.id === "feedbackModal" ||
        el.id === "feedbackBackdrop",
    });
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

// Archie uses a hash router — the route is the context. We summarise it as
// three pills so the user can see what's going to be attached to the bug.
function currentContext() {
  const hash = window.location.hash || "#/";
  const [path, qs] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(qs || "");
  let area = "Dashboard";
  if (path.startsWith("/session/")) area = "Session";

  const tab = params.get("tab") || params.get("view");
  const focus = tab ? `${tab}` : path === "/" || path === "" ? "Home" : path.split("/").pop();

  const time = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { area, focus, time };
}

function populateContext() {
  const { area, focus, time } = currentContext();
  contextBar.innerHTML = `
    <span class="bug-context__label">Context</span>
    <span class="bug-context__pill">${escapeHtml(area)}</span>
    <span class="bug-context__pill">${escapeHtml(focus)}</span>
    <span class="bug-context__pill">${escapeHtml(time)}</span>
  `;
}

export function open() {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  populateContext();
  window.setTimeout(() => focusSafe(problemInput), 50);
  // Kick off auto-screenshot — shows the "Capturing…" badge until resolved.
  capturingBadge.hidden = false;
  captureFailedBadge.hidden = true;
  capturePageScreenshot().then((dataUrl) => {
    if (dataUrl) {
      setScreenshot(dataUrl);
    } else {
      capturingBadge.hidden = true;
      captureFailedBadge.hidden = false;
    }
  });
}

function close() {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  reset();
  notifyClose(MODAL_ID);
}

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("bugReportBackdrop");
  modal = document.getElementById("bugReportModal");
  submitBtn = document.getElementById("submitBugReportBtn");
  problemInput = document.getElementById("bugProblemInput");
  problemError = document.getElementById("bugProblemError");
  actionInput = document.getElementById("bugActionInput");
  categoriesEl = document.getElementById("bugCategories");
  previewEl = document.getElementById("bugScreenshotPreview");
  dropzoneFallback = document.getElementById("bugDropzoneFallback");
  dropzone = document.getElementById("bugDropzone");
  fileInput = document.getElementById("bugFileInput");
  previewImg = document.getElementById("bugPreviewImg");
  fileNameEl = document.getElementById("bugFileName");
  autoBadge = document.getElementById("bugAutoBadge");
  capturingBadge = document.getElementById("bugCapturingBadge");
  captureFailedBadge = document.getElementById("bugCaptureFailedBadge");
  contextBar = document.getElementById("bugContextBar");

  // Close / dismiss
  document.getElementById("closeBugReportBtn").addEventListener("click", close);
  document.getElementById("cancelBugReportBtn").addEventListener("click", close);
  bindOverlayDismissal({ modal, backdrop, close });

  // Category chips — single-select with toggle-off. Keep aria-pressed in
  // sync with the visual selected state so screen readers announce which
  // chip is active.
  categoriesEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".bug-category-chip");
    if (!chip) return;
    const wasSelected = chip.dataset.value === selectedCategory;
    categoriesEl.querySelectorAll(".bug-category-chip").forEach((c) => {
      c.classList.remove("selected");
      c.setAttribute("aria-pressed", "false");
    });
    if (!wasSelected) {
      chip.classList.add("selected");
      chip.setAttribute("aria-pressed", "true");
      selectedCategory = chip.dataset.value;
    } else {
      selectedCategory = null;
    }
  });

  // Drop-zone / file upload.
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setScreenshot(ev.target.result);
      reader.readAsDataURL(file);
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target.result);
    reader.readAsDataURL(file);
  });
  document.getElementById("bugRemoveFileBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    clearScreenshot();
  });

  problemInput.addEventListener("input", () => {
    if (problemInput.value.trim()) setProblemInvalid(false);
  });
  // Re-validate on blur, but only after the user has tried once.
  problemInput.addEventListener("blur", () => {
    if (hasAttemptedSubmit) setProblemInvalid(!problemInput.value.trim());
  });

  // Submit — no backend; mock a round-trip and show the success panel.
  submitBtn.addEventListener("click", async () => {
    hasAttemptedSubmit = true;
    const problem = problemInput.value.trim();
    if (!problem) {
      setProblemInvalid(true);
      focusSafe(problemInput);
      return;
    }
    setProblemInvalid(false);
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="bug-report-modal__submit-spinner" aria-hidden="true"></span>Submitting…`;
    // In a real app we'd post { category, action, problem, screenshot, context }.
    void {
      category: selectedCategory && CATEGORY_LABELS[selectedCategory],
      action: actionInput.value.trim(),
      problem,
      screenshot: screenshotDataUrl,
      context: currentContext(),
    };
    await new Promise((r) => setTimeout(r, 1400));
    modal.classList.add("success");
    setTimeout(close, 2200);
  });
}
