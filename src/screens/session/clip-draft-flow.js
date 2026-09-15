// ── Draft from clips — quick picker (ratio → subtitles → accounts) ──
//
// Triggered by a clip-card "Draft" button (a single clip) or the Clips-panel
// footer CTA (several selected clips). Each step is the inline-question picker
// and every pick is echoed as a user turn. The flow asks once for an export
// ratio, then a subtitle style, then the target account(s), and finally
// generates one post draft per (clip × account) — each carrying the chosen
// ratio + subtitle style + a back-reference to its source clip — then posts a
// "N drafts to review" result card.
//
// `entries` is [{ clip, sourceName, sourceId }] — one per selected clip.
//
// Lives in its own module rather than in the 5.5k-line session screen so the
// right panel (the only external caller) imports just this flow instead of the
// whole screen. clipContext is exported alongside because the clip-studio
// finalize path in session.js builds the same generationContext object.

import { FORMATS, clipFormatItems } from "../../clip-formats.js?v=1217";
import { CLIP_SUBTITLE_ITEMS, CLIP_SUBTITLE_LABEL } from "../../clip-subtitles.js?v=1217";
import {
  getConnectedProfiles,
  buildConnectedProfileItems,
  PROFILE_SEARCH_THRESHOLD,
} from "../../social-profiles.js?v=1217";
import { requireConnectedProfiles } from "../../connect-profiles-flow.js?v=1217";
import {
  postAssistantMessage,
  postUserTurn,
  postUserProfilesTurn,
  postSelectionEcho,
  postDraftResult,
  startPending,
  finishPending,
} from "../../assistant.js?v=1217";
import * as inlineQuestion from "../../inline-question.js?v=1217";
import { addPostDraft } from "../../posts-store.js?v=1217";

// The generationContext a clip-derived draft carries — the "why this draft
// exists" header shown on the post card. Shared with session.js's clip-studio
// finalize path so both routes label a clip draft identically.
export function clipContext(clip, sourceName) {
  return {
    kind: "clip",
    headline: { icon: "ap-icon-video", text: `Clip · ${clip.title}` },
    source: {
      icon: "ap-icon-file--video",
      label: sourceName || "Video source",
      detail: clip.summary || "",
    },
  };
}

export function startClipDraftFlow(sessionId, entries) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) return;
  // Echo the picked clip(s) as a selection card before the format question.
  const first = list[0];
  postSelectionEcho(sessionId, {
    icon: "ap-icon-file--video",
    title: list.length === 1 ? first.clip?.title || "Clip" : `${list.length} clips`,
    meta: first.sourceName ? `Clip · ${first.sourceName}` : "Video clip",
  });
  askClipFormat(sessionId, list);
}

// Step 1 — which aspect ratio? All export formats are offered as visual
// proportion tiles (the target accounts aren't picked yet, so we don't filter
// by network). Items come from clip-formats.clipFormatItems() (shared with the
// handoff gallery).
function askClipFormat(sessionId, entries) {
  postAssistantMessage(sessionId, "What aspect ratio would you like for the clips?");
  inlineQuestion.ask(sessionId, {
    title: "Pick an export format",
    stepLabel: "Ratio",
    skipLabel: "Cancel",
    variant: "cards",
    items: clipFormatItems(),
    onPick: (formatId) => {
      const fmt = FORMATS[formatId];
      postUserTurn(sessionId, fmt ? `${fmt.tag} · ${fmt.label}` : formatId);
      askClipSubtitle(sessionId, entries, formatId);
    },
    onSkip: () => {},
  });
}

// Step 2 — which subtitle style? (AI-generated, burned into the video.) Shown
// as a 2-column card grid, each card CSS-rendering the style on a "MAKE IT POP"
// mock; the pick echoes back as a selection card.
function askClipSubtitle(sessionId, entries, format) {
  postAssistantMessage(sessionId, "Choose a subtitle style — I'll generate and burn them into the video.");
  inlineQuestion.ask(sessionId, {
    title: "Choose a subtitle style",
    stepLabel: "Subtitles",
    variant: "cards",
    // Fixed 3×3 grid — "No subtitles" is the first card (see CLIP_SUBTITLE_ITEMS).
    cardCols: 3,
    items: CLIP_SUBTITLE_ITEMS,
    onPick: (style) => {
      postSelectionEcho(sessionId, {
        icon: "ap-icon-closed-captions",
        title: CLIP_SUBTITLE_LABEL[style] || style,
        meta: style === "none" ? "No subtitles" : "Subtitle style",
      });
      askClipAccounts(sessionId, entries, format, style);
    },
    onBack: () => askClipFormat(sessionId, entries),
  });
}

// Step 3 — which account(s)? Multi-select, the clips' own networks preselected.
function askClipAccounts(sessionId, entries, format, style) {
  // Nothing connected (skipConnectProfiles) → ask for the connection in this
  // step's own slot, keeping Back pointing at the subtitle step, then re-enter.
  if (getConnectedProfiles().length === 0) {
    requireConnectedProfiles(sessionId, {
      stepLabel: "Accounts",
      onBack: () => askClipSubtitle(sessionId, entries, format),
      onReady: () => askClipAccounts(sessionId, entries, format, style),
    });
    return;
  }
  const connected = getConnectedProfiles();
  postAssistantMessage(sessionId, "Which account(s) should I draft for?");
  const clipNets = new Set(entries.map((e) => e.clip.network));
  const preset = connected.filter((a) => clipNets.has(a.platform)).map((a) => a.id);
  // Destination picker (not an analysis step) — every connected account is a
  // valid target, so don't gate on post history.
  const clipProfileItems = buildConnectedProfileItems({ requirePosts: false });
  inlineQuestion.ask(sessionId, {
    title: "Pick one or more connected accounts",
    stepLabel: "Accounts",
    skipLabel: "Cancel",
    multi: true,
    defaultSelected: preset,
    submitLabel: "Continue",
    // A long list of destinations gets a live search box to narrow it down.
    searchable: clipProfileItems.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search accounts by name, handle or network…",
    items: clipProfileItems,
    onPick: (ids) => {
      const accounts = (Array.isArray(ids) ? ids : [ids])
        .map((id) => connected.find((a) => a.id === id))
        .filter(Boolean);
      if (accounts.length === 0) return;
      // Echo the picked profiles via the canonical renderProfileTag — pass
      // the raw socialAccounts entries straight through.
      postUserProfilesTurn(sessionId, accounts);
      generateClipDrafts(sessionId, entries, accounts, format, style);
    },
    onBack: () => askClipSubtitle(sessionId, entries, format),
    onSkip: () => {},
  });
}

// Generate one post draft per (clip × account), then post the result card.
// Each draft's clipRef carries sourceId + clipId so the post can later open
// the source clip back in the Video Clips modal for editing.
function generateClipDrafts(sessionId, entries, accounts, format, style) {
  const pendingId = startPending(sessionId, "Generating drafts");
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    const drafts = [];
    for (const { clip, sourceName, sourceId } of entries) {
      for (const a of accounts) {
        const d = addPostDraft(sessionId, {
          network: a.platform,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: { start: clip.start, end: clip.end, sourceName, hue: clip.hue, sourceId, clipId: clip.id },
          format,
          subtitleStyle: style === "none" ? null : style,
        });
        d.generationContext = clipContext(clip, sourceName);
        drafts.push(d);
      }
    }
    const title = entries.length === 1 ? entries[0].clip.title : `${entries.length} clips`;
    postDraftResult(sessionId, { ideaTitle: title, drafts });
  }, 1600);
}
