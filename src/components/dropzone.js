// Shared file dropzone — the single dashed-border "drop a file / browse"
// box used by every upload surface (Add a source, Fill from a document,
// Bug report). Each of those modals used to ship its own markup + CSS +
// drag wiring; this collapses them into one component (`.ap-dropzone`,
// styled in ds-patches.css).
//
// Public API:
//   dropzoneHTML(opts) -> markup string
//       Drop it into a template. Inside an `html`` template, wrap with
//       raw(); inside a plain string template, interpolate directly.
//       Renders a self-contained hidden <input type=file> unless
//       `withInput: false` (for surfaces that keep an external, stable
//       input and wire drag/drop themselves — e.g. add-source).
//
//   bindDropzone(scope, { onFiles, dragClass }) -> wires the standard
//       click / keyboard / drag-drop behaviour by delegation on a stable
//       ancestor, so it survives the dropzone being re-rendered. Calls
//       onFiles(File[], dropzoneEl) on pick or drop. Use this for the
//       simple modals; surfaces with bespoke drop behaviour can skip it
//       and just reuse the markup.

const DRAG_CLASS = "is-dragover";

export function dropzoneHTML({
  id = "",
  lead = "Drag a file here, or",
  sub = "",
  accept = "",
  multiple = false,
  icon = "ap-icon-upload",
  compact = false,
  large = false,
  withInput = true,
  inputId = "",
  // Extra attributes spliced onto the root (e.g. "data-clip-studio-dropzone").
  rootAttrs = "",
  // Overrides the default aria-label (built from `lead`).
  ariaLabel = "",
  // Optional explicit "Browse files"-style button inside the box, for the
  // larger studio surfaces. When set, the inline "browse" word is dropped
  // (the button is the affordance). Shape: { label, icon, attrs }.
  action = null,
} = {}) {
  const input = withInput
    ? `<input type="file" class="ap-dropzone__input" ${multiple ? "multiple" : ""} accept="${accept}" ${inputId ? `id="${inputId}"` : ""} hidden />`
    : "";
  // With an explicit action button the title reads as a plain instruction;
  // otherwise the trailing "browse" is the click affordance.
  const title = action ? lead : `${lead} <span class="ap-dropzone__browse">browse</span>`;
  const actionBtn = action
    ? `<button type="button" class="ap-button primary blue ap-dropzone__action" ${action.attrs || ""}>
         <i class="${action.icon || "ap-icon-upload"}" aria-hidden="true"></i><span>${action.label || "Browse files"}</span>
       </button>`
    : "";
  const modifiers = `${compact ? " ap-dropzone--compact" : ""}${large ? " ap-dropzone--lg" : ""}`;
  return `
  <div class="ap-dropzone${modifiers}" data-dropzone ${id ? `id="${id}"` : ""} role="button" tabindex="0" aria-label="${ariaLabel || `${lead} browse`}" ${rootAttrs}>
    <span class="ap-dropzone__icon"><i class="${icon}" aria-hidden="true"></i></span>
    <span class="ap-dropzone__text">
      <span class="ap-dropzone__title">${title}</span>
      ${sub ? `<span class="ap-dropzone__sub">${sub}</span>` : ""}
    </span>
    ${actionBtn}
    ${input}
  </div>`;
}

export function bindDropzone(scope, { onFiles, dragClass = DRAG_CLASS } = {}) {
  if (!scope || typeof onFiles !== "function") return;
  const dzOf = (target) => (target.closest ? target.closest("[data-dropzone]") : null);

  scope.addEventListener("click", (e) => {
    const dz = dzOf(e.target);
    // The hidden input lives inside the dropzone — clicking it directly
    // would recurse into another click.
    if (!dz || e.target.closest(".ap-dropzone__input")) return;
    dz.querySelector(".ap-dropzone__input")?.click();
  });

  scope.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const dz = dzOf(e.target);
    if (!dz) return;
    e.preventDefault();
    dz.querySelector(".ap-dropzone__input")?.click();
  });

  scope.addEventListener("change", (e) => {
    if (!e.target.classList || !e.target.classList.contains("ap-dropzone__input")) return;
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(files, dzOf(e.target));
    // Reset so picking the same file again still fires change.
    e.target.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    scope.addEventListener(ev, (e) => {
      const dz = dzOf(e.target);
      if (!dz) return;
      e.preventDefault();
      dz.classList.add(dragClass);
    }),
  );
  ["dragleave", "dragend"].forEach((ev) =>
    scope.addEventListener(ev, (e) => dzOf(e.target)?.classList.remove(dragClass)),
  );
  scope.addEventListener("drop", (e) => {
    const dz = dzOf(e.target);
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove(dragClass);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) onFiles(files, dz);
  });
}
