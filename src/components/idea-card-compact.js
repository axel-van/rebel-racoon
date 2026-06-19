// Compact idea card — the card used by the right-panel Ideas mode and the
// conversation extraction turns, now shared so the standalone Ideas page can
// render the exact same component.
//
// Pure renderer: all interactive state is passed in, so each consumer owns
// its own feedback / why-open state and wires the data-* handlers:
//   data-rpanel-ideas-feedback (+ data-verdict)  → thumbs up / down
//   data-rpanel-idea-why-toggle                  → expand / collapse "Why"
//   data-rpanel-mention-idea                     → Mention (composer)
//   data-rpanel-use-idea                         → Draft (angle picker)
//
//   renderCompactIdeaCard(idea, sources, { verdict, whyOpen, showMention })
//     idea     — { id, kind, title, body, sourceIds[], ref, rationale }
//     sources  — full source list (linked sources resolved by id)
//     verdict  — "up" | "down" | null (active thumb)
//     whyOpen  — boolean (Why panel expanded)
//     showMention — render the Mention button (default true; false where there
//                   is no composer, e.g. the standalone Ideas page)

import { iconFor } from "../file-kinds.js?v=20";
import { escapeText, escapeAttr } from "../utils.js?v=21";

export function renderCompactIdeaCard(
  idea,
  sources = [],
  { verdict = null, whyOpen = false, showMention = true } = {},
) {
  const kind = idea.kind || "insight";
  const linkedSources = (idea.sourceIds || []).map((id) => sources.find((s) => s.id === id)).filter(Boolean);

  const thumbBtn = (side) => {
    const isActive = verdict === side;
    const icon = isActive ? `ap-icon-thumb-${side}_fill` : `ap-icon-thumb-${side}`;
    const label = side === "up" ? "Mark idea as useful" : "Mark idea as not useful";
    return `
      <button
        type="button"
        class="ap-icon-button transparent sm rpanel-ideas__thumb${isActive ? " is-active" : ""}"
        data-rpanel-ideas-feedback="${escapeAttr(idea.id)}"
        data-verdict="${side}"
        aria-pressed="${isActive}"
        aria-label="${label}"
        title="${label}"
      >
        <i class="${icon}"></i>
      </button>
    `;
  };

  const whyId = `rpanel-idea-why-${idea.id}`;
  const sourceTags = linkedSources.length
    ? linkedSources
        .map(
          (s) => `
            <span class="rpanel-ideas__source-tag" title="${escapeAttr(s.filename)}">
              <i class="${iconFor(s.kind)}" aria-hidden="true"></i>
              <span class="rpanel-ideas__source-tag-text">${escapeText(s.filename)}</span>
            </span>
          `,
        )
        .join("")
    : idea.ref
      ? `<span class="rpanel-ideas__source-tag" title="${escapeAttr(idea.ref)}">
           <i class="ap-icon-file" aria-hidden="true"></i>
           <span class="rpanel-ideas__source-tag-text">${escapeText(idea.ref)}</span>
         </span>`
      : "";

  const whyPanel = idea.rationale
    ? `
      <section class="rpanel-ideas__why" data-why-open="${whyOpen ? "true" : "false"}">
        <button
          type="button"
          class="rpanel-ideas__why-head"
          data-rpanel-idea-why-toggle="${escapeAttr(idea.id)}"
          aria-expanded="${whyOpen ? "true" : "false"}"
          aria-controls="${whyId}"
        >
          <i class="ap-icon-info rpanel-ideas__why-info" aria-hidden="true"></i>
          <span class="rpanel-ideas__why-title">Why this idea</span>
          <i class="ap-icon-chevron-${whyOpen ? "up" : "down"} rpanel-ideas__why-chevron" aria-hidden="true"></i>
        </button>
        <div id="${whyId}" class="rpanel-ideas__why-body" ${whyOpen ? "" : "hidden"}>
          <p class="rpanel-ideas__why-rationale">${escapeText(idea.rationale)}</p>
        </div>
      </section>
    `
    : "";

  const cardHead = `
    <div class="rpanel-ideas__card-head">
      <span class="ap-tag rpanel-ideas__kind rpanel-ideas__kind--${kind}">${kind}</span>
      ${
        sourceTags
          ? `<div class="rpanel-ideas__head-source">
              <span class="rpanel-ideas__source-label">Source:</span>
              ${sourceTags}
            </div>`
          : ""
      }
    </div>
  `;

  const mentionBtn = showMention
    ? `<button type="button" class="ap-button ghost blue rpanel-ideas__mention" data-rpanel-mention-idea="${escapeAttr(idea.id)}">
        <i class="ap-icon-at"></i>
        <span>Mention</span>
      </button>`
    : "";

  return `
    <article class="rpanel-ideas__card" data-idea-id="${escapeAttr(idea.id)}">
      <div class="rpanel-ideas__card-content">
        ${cardHead}
        ${idea.title ? `<h4 class="rpanel-ideas__card-title">${escapeText(idea.title)}</h4>` : ""}
        <p class="rpanel-ideas__card-body">${escapeText(idea.body || "")}</p>
        ${whyPanel}
      </div>
      <footer class="rpanel-ideas__card-actions">
        <div class="rpanel-ideas__feedback">
          ${thumbBtn("up")}
          ${thumbBtn("down")}
        </div>
        <div class="rpanel-ideas__primary">
          ${mentionBtn}
          <button type="button" class="ap-button secondary blue rpanel-ideas__use" data-rpanel-use-idea="${escapeAttr(idea.id)}">
            <i class="ap-icon-sparkles"></i>
            <span>Draft</span>
          </button>
        </div>
      </footer>
    </article>
  `;
}
