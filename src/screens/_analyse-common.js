import { html, raw } from "../utils.js?v=20";

// Shared pieces for all three Analyse wizards.
//
// Visual model: conversational flow — AI Copilot + You bubbles in a
// scrollable chat area, with a sticky picker bar at the bottom of the screen.
// The sticky bar holds option rows and an always-visible "Something else"
// text input so the user can type a custom answer at any time.
//
// A step renderer returns:
//   {
//     body:          HTML string (chat turns + any content inside the AI bubble)
//     picker?:       { items, handler, customPlaceholder?, customHandler? } | null
//     stickyFooter?: raw HTML to render inside the sticky bar INSTEAD of a
//                    picker (used by Brand preview step for Start over / Apply)
//   }

// -- Wizard shell (conversational layout) -----------------------------------

export function wizardChrome({ body, picker = null, stickyFooter = null }) {
  return html`
    <section class="screen analyse analyse--wizard">
      <div class="analyse__chat" id="analyseChat">
        <div class="analyse__chat-inner">${raw(body)}</div>
      </div>
      <div class="analyse__sticky-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(stickyFooter != null ? stickyFooter : renderPicker(picker))}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </section>
  `;
}

// -- Chat turns -------------------------------------------------------------

export function chatTurn({ role, text, contentHtml = "" }) {
  // role = "ai" | "user"
  // Mirrors the session assistant panel layout (src/screens/session.js):
  //   AI   → [sparkle] [bubble] inline row (the :has(> .chat-turn-avatar)
  //          rule in chat.css kicks in when the avatar is a direct child)
  //   User → [You label] stacked over a blue bubble, right-aligned
  const isAi = role === "ai";
  const header = isAi
    ? `<i class="ap-icon-sparkles-mermaid chat-turn-avatar" aria-hidden="true"></i>`
    : `<span class="chat-turn-role">You</span>`;

  return `
    <div class="chat-turn chat-turn--${isAi ? "ai" : "user"}">
      ${header}
      <div class="chat-bubble chat-bubble--${isAi ? "ai" : "user"}">
        ${text ? `<p class="chat-bubble-text">${text}</p>` : ""}
        ${contentHtml || ""}
      </div>
    </div>
  `;
}

// -- Content blocks rendered INSIDE an AI bubble ----------------------------

// Figma 73:1394 renders each extracted observation as its own grey-05 card
// (border grey-10, radius-md, padding spacing-xs) inside the AI bubble
// column-flex — not as bullets with markers. One card per item.
export function bulletsBlock(bulletsList) {
  if (!bulletsList || !bulletsList.length) return "";
  return bulletsList.map((b) => `<div class="chat-bubble-card">${b}</div>`).join("");
}

export function fieldsBlock(fields) {
  if (!fields || !fields.length) return "";
  return `
    <dl class="chat-bubble-fields">
      ${fields
        .map(
          (f) => `
            <div>
              <dt>${f.label}</dt>
              <dd>${f.value}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

export function summarySections(sections, headerExtra = "") {
  const extraMarkup = headerExtra ? `<div class="chat-bubble-header-extra">${headerExtra}</div>` : "";

  const sectionsMarkup = sections
    .map(
      (s) => `
        <section class="chat-bubble-section">
          <h4>${s.title}</h4>
          <ul>${s.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
        </section>
      `,
    )
    .join("");

  return `${extraMarkup}<div class="chat-bubble-summary">${sectionsMarkup}</div>`;
}

// -- Sticky picker (option rows + optional text input) ----------------------

export function renderPicker(picker) {
  if (!picker) return "";
  const {
    items = [],
    handler,
    customPlaceholder = null,
    customValue = "",
    customHandler = null,
    multi = false,
    submitLabel = "Continue",
    title = null, // text shown at the top of the picker (mirrors the AI question)
    stepIndicator = null, // small label on the top right (e.g. "3 of 7")
    skipLabel = null, // when set, render a "Skip" button next to Submit
    // File-upload variant: when `customFile: true`, the trailing row swaps
    // from a text input to a clickable dropzone with a hidden <input
    // type="file">. Wired by session.js — change → inlineQuestion.submitFile.
    customFile = false,
    customFileAccept = "",
    customFileLabel = "Drop a file here, or click to browse",
    customFileHint = "",
    customFileIcon = "ap-icon-upload",
    // When the wizard supports going back to a previous step, the
    // header renders a small ← back button on the left.
    showBack = false,
    // Raw HTML appended to the footer row — used by the playbook editor
    // to render its Cancel + Save buttons inside the picker card
    // instead of a separate top bar.
    footerSlot = "",
    // Multi-select only: list of `value`s to render pre-checked. Used
    // by the First Time User ALT flow where the visual profile picker
    // pre-seeds the platform in connectedSocials before askSocial runs.
    defaultSelected = [],
  } = picker;
  const preset = new Set(defaultSelected);

  // Multi-select swaps the trailing chevron for a check icon (visible only
  // when the option is selected via .is-selected) so the user understands
  // the row is a toggle, not an immediate jump.
  const trailingIcon = multi
    ? `<i class="ap-icon-rounded-check analyse__option-check" aria-hidden="true"></i>`
    : `<i class="ap-icon-chevron-right analyse__option-chevron" aria-hidden="true"></i>`;

  const rows = items
    .map((it, i) => {
      const isPreset = multi && preset.has(it.value);
      // Three icon variants: avatar (DS .ap-avatar with optional network
      // badge), imgSrc (raw <img>), or icon font (default). The avatar
      // variant strips the icon container's grey background and overflow
      // clipping so the network badge in the corner stays visible.
      const iconBody = it.avatar
        ? `<div class="ap-avatar size-32" aria-hidden="true">
             ${
               it.avatar.imageUrl
                 ? `<img src="${it.avatar.imageUrl}" alt="" />`
                 : it.avatar.initials
                   ? `<span class="ap-avatar-initials">${it.avatar.initials}</span>`
                   : ""
             }
             ${it.avatar.networkIcon ? `<span class="ap-avatar-network"><i class="${it.avatar.networkIcon}"></i></span>` : ""}
           </div>`
        : it.imgSrc
          ? `<img src="${it.imgSrc}" alt="" />`
          : `<i class="${it.icon || "ap-icon-circle"}"></i>`;
      return `
        <button
          type="button"
          class="analyse__option${isPreset ? " is-selected" : ""}"
          data-${handler}="${it.value}"
          ${multi ? `aria-pressed="${isPreset ? "true" : "false"}"` : ""}
        >
          <span class="analyse__option-shortcut" aria-hidden="true">${i + 1}</span>
          <span class="analyse__option-icon${it.avatar ? " analyse__option-icon--avatar" : ""}">
            ${iconBody}
          </span>
          <span class="analyse__option-text">
            <span class="analyse__option-label">${it.label}</span>
            ${it.caption ? `<span class="muted">${it.caption}</span>` : ""}
          </span>
          ${trailingIcon}
        </button>
      `;
    })
    .join("");

  const customRow = customPlaceholder
    ? `
      <label class="analyse__option analyse__option--input" data-custom-row>
        <span class="analyse__option-shortcut" aria-hidden="true">${items.length + 1}</span>
        <span class="analyse__option-icon">
          <i class="ap-icon-pen"></i>
        </span>
        <input
          type="text"
          class="analyse__option-input"
          placeholder="${customPlaceholder}"
          value="${customValue}"
          data-${customHandler || handler}-custom
          aria-label="${customPlaceholder}"
        />
        <button
          type="button"
          class="ap-icon-button stroked analyse__option-send"
          data-${customHandler || handler}-custom-submit
          aria-label="Submit typed answer"
          tabindex="-1"
        >
          <i class="ap-icon-paper-plane"></i>
        </button>
      </label>
    `
    : "";

  // File-upload variant — full-row dropzone with a hidden <input type=file>.
  // The label wraps the input so clicking anywhere on the row opens the
  // OS file picker. Session.js binds the change event to submitFile.
  const fileRow = customFile
    ? `
      <label class="analyse__option analyse__option--file" data-custom-file-row>
        <span class="analyse__option-shortcut" aria-hidden="true">${items.length + 1}</span>
        <span class="analyse__option-icon">
          <i class="${customFileIcon}"></i>
        </span>
        <span class="analyse__option-text">
          <span class="analyse__option-label">${customFileLabel}</span>
          ${customFileHint ? `<span class="muted">${customFileHint}</span>` : ""}
        </span>
        <input
          type="file"
          class="analyse__option-file-input"
          accept="${customFileAccept}"
          data-${customHandler || handler}-custom-file
          aria-label="${customFileLabel}"
        />
        <i class="ap-icon-chevron-right analyse__option-chevron" aria-hidden="true"></i>
      </label>
    `
    : "";

  // Header — shown when the picker carries a title or a step indicator.
  // Mirrors the AI question text so the user has the full prompt in view
  // while scanning options. The step indicator (e.g. "3 of 7") sits on the
  // right and helps with multi-step wizards.
  const backBtn = showBack
    ? `<button type="button" class="analyse__picker-back ap-icon-button transparent" data-${handler}-back aria-label="Back">
         <i class="ap-icon-arrow-left"></i>
       </button>`
    : "";
  const header =
    title || stepIndicator || showBack
      ? `
        <header class="analyse__picker-header">
          ${backBtn}
          ${title ? `<h3 class="analyse__picker-title">${title}</h3>` : ""}
          ${stepIndicator ? `<span class="analyse__picker-step muted">${stepIndicator}</span>` : ""}
        </header>
      `
      : "";

  // Footer — Skip + (multi-only) Submit. Single-select pickers without a
  // skipLabel render no footer at all.
  const skipBtn = skipLabel
    ? `<button type="button" class="ap-button stroked grey" data-${handler}-skip><span>${skipLabel}</span></button>`
    : "";
  const submitBtn = multi
    ? `<button type="button" class="ap-button primary orange" data-${handler}-submit><span>${submitLabel}</span></button>`
    : "";
  const footer =
    skipBtn || submitBtn || footerSlot
      ? `<div class="analyse__options-submit">${skipBtn}${submitBtn}${footerSlot}</div>`
      : "";

  return `<div class="analyse__options${multi ? " analyse__options--multi" : ""}" ${multi ? "data-multi" : ""}>${header}${rows}${customRow}${fileRow}${footer}</div>`;
}

// -- Keyboard wiring --------------------------------------------------------
//
//   - Digits 1..9      → click the Nth option (text inputs with data-custom-row
//                        are skipped — the digit that matches the input row
//                        focuses the input instead)
//   - ArrowDown / Up   → move focus between options (including the input row)
//   - Enter (on input) → submit the typed text via onCustomSubmit
//   - Enter (outside)  → activate focused option; else activate the first
//   - Escape           → onExit
//
// Focus behavior on render: the first option gets focus so keyboard users
// always see where they are.

let currentKeyListener = null;

export function bindWizardKeyboard(target, { handler, onExit, onCustomSubmit = null, onMultiSubmit = null }) {
  unbindWizardKeyboard();

  // Multi-select pickers expose `[data-{handler}-submit]`. When present,
  // digit + click toggle the option rows instead of jumping; Enter submits.
  const isMulti = () => !!target.querySelector(`[data-${handler}-submit]`);

  const listener = (event) => {
    const activeIsInput =
      event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable;

    if (event.key === "Escape") {
      event.preventDefault();
      onExit();
      return;
    }

    const focusables = Array.from(target.querySelectorAll(`[data-${handler}], [data-${handler}-custom]`));
    if (!focusables.length) return;

    // ArrowDown/Up cycles through option rows + the input row.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const current = document.activeElement;
      const currentIdx = focusables.indexOf(current);
      let nextIdx;
      if (event.key === "ArrowDown") {
        nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, focusables.length - 1);
      } else {
        nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
      }
      focusables[nextIdx]?.focus();
      return;
    }

    // Digits — only when the user isn't typing into the input.
    // In multi-select mode, click() will toggle the option (handled by the
    // session.js click delegate) instead of advancing.
    if (/^[1-9]$/.test(event.key) && !activeIsInput) {
      const idx = Number(event.key) - 1;
      const target = focusables[idx];
      if (target) {
        event.preventDefault();
        if (target.tagName === "INPUT") target.focus();
        else target.click();
      }
      return;
    }

    // Enter — multi-select submits the current selection; single-select
    // submits typed input or activates the focused/first option.
    if (event.key === "Enter") {
      if (activeIsInput && onCustomSubmit) {
        event.preventDefault();
        const value = event.target.value.trim();
        if (value) onCustomSubmit(value);
        return;
      }
      if (isMulti() && onMultiSubmit) {
        event.preventDefault();
        const selected = Array.from(target.querySelectorAll(`[data-${handler}].is-selected`)).map(
          (el) => el.dataset[handlerCamel(handler)],
        );
        if (selected.length) onMultiSubmit(selected);
        return;
      }
      if (!activeIsInput) {
        const focused = document.activeElement;
        const inPicker = focusables.includes(focused);
        if (!inPicker) {
          event.preventDefault();
          const firstButton = focusables.find((el) => el.tagName !== "INPUT");
          if (firstButton) firstButton.click();
        }
      }
    }
  };

  function handlerCamel(h) {
    // data-wizard-answer → dataset.wizardAnswer
    return h.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  currentKeyListener = listener;
  document.addEventListener("keydown", listener);

  // (Send-icon click handling lives at the screen level — session.js and
  // context-new.js both delegate `[data-{handler}-custom-submit]` clicks
  // there. Adding it here too caused the click to fire twice: the second
  // dispatch happened AFTER the first had already swapped the inline-
  // question state, so the second submit landed on the next step's
  // picker with the stale text value as input — auto-skipping it.)

  // Focus first option on render.
  queueMicrotask(() => {
    const first = target.querySelector(`[data-${handler}]`);
    if (first) first.focus();
    // And always scroll the chat to the bottom on new step.
    const chat = target.querySelector("#analyseChat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  });
}

export function unbindWizardKeyboard() {
  if (currentKeyListener) {
    document.removeEventListener("keydown", currentKeyListener);
    currentKeyListener = null;
  }
}
