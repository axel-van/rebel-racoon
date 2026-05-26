import { route, setAfterRender, start } from "./router.js?v=30";
import { isFlagOn } from "./feature-flags.js?v=3";
import { initTopbar, renderTopbar } from "./components/topbar.js?v=57";
import { initSidebar, renderSidebar } from "./components/sidebar.js?v=43";
import { init as initRightPanel } from "./components/right-panel.js?v=104";
import { init as initScheduleModal } from "./components/schedule-modal.js?v=24";
import { initUserModeChip } from "./components/user-mode-chip.js?v=30";
import { init as initBugReportModal } from "./components/bug-report-modal.js?v=22";
import { init as initFeedbackModal } from "./components/feedback-modal.js?v=25";
import { init as initGenerateImageModal } from "./components/generate-image-modal.js?v=23";
import { init as initVideoClipsModal } from "./components/video-clips-modal.js?v=2";
import { init as initChatPickerModal } from "./components/chat-picker-modal.js?v=23";
import { init as initAddSourceModal } from "./components/add-source-modal.js?v=23";
import { init as initConfirmModal } from "./components/confirm-modal.js?v=21";
import { init as initRenameModal } from "./components/rename-modal.js?v=1";
import { init as initSearchModal } from "./components/search-modal.js?v=3";
import {
  init as initConversationStatusCard,
  render as renderConversationStatusCard,
} from "./components/conversation-status-card.js?v=12";
import { renderDashboard } from "./screens/dashboard.js?v=45";
import { renderSession } from "./screens/session.js?v=131";
import { renderIdeas } from "./screens/ideas.js?v=25";
import { renderContexts } from "./screens/contexts.js?v=35";
import { renderSettings } from "./screens/settings.js?v=2";
import { renderWelcome } from "./screens/welcome.js?v=5";
import { renderWelcomeSocials } from "./screens/welcome-socials.js?v=5";
import { renderWelcomeSources } from "./screens/welcome-sources.js?v=2";
import { renderWelcomeRecap } from "./screens/welcome-recap.js?v=3";
import { renderWelcomeAlt } from "./screens/welcome-alt.js?v=3";
import { renderWelcomeAltRecap } from "./screens/welcome-alt-recap.js?v=3";
import { startBackground as __captureSeedDraft } from "./context-builder.js?v=43";
import * as __capAddSource from "./components/add-source-modal.js?v=23";
import * as __capGenImage from "./components/generate-image-modal.js?v=23";
import * as __capBug from "./components/bug-report-modal.js?v=22";
import * as __capFeedback from "./components/feedback-modal.js?v=25";
import * as __capChatPicker from "./components/chat-picker-modal.js?v=23";
import * as __capSearch from "./components/search-modal.js?v=3";
import {
  openDrafts as __capOpenDrafts,
  openIdeas as __capOpenIdeas,
  openSources as __capOpenSources,
  openContextBriefPanel as __capOpenContextPanel,
} from "./components/right-panel.js?v=104";

// Figma capture helper — seed a welcome draft synchronously so the multi-step
// welcome flow (which requires sessionStorage.welcomeSessionId + a draft) renders
// instead of redirecting back to /welcome on direct capture.
if (new URLSearchParams(window.location.search).get("setup") === "welcome") {
  const sid = "capture-welcome";
  sessionStorage.setItem("welcomeSessionId", sid);
  __captureSeedDraft(sid, "https://acme-launch.example.com");
}

// Route table.
// Every screen is responsible for calling renderTopbar() itself so the crumb
// stays in sync with the active context.
route("/", renderDashboard);
route("/session/:id", renderSession);
route("/ideas", renderIdeas);
route("/contexts", renderContexts);
route("/settings", renderSettings);
// First-time onboarding — 4-screen linear flow. /welcome is the URL
// input that kicks off the background website analysis; /welcome/socials
// lists the channels the brand publishes on; /welcome/sources is the
// optional Slite/Notion/GDrive connectors; /welcome/recap is the final
// Playbook review with Fine-tune / Entrer dans Archie CTAs.
route("/welcome", renderWelcome);
route("/welcome/socials", renderWelcomeSocials);
route("/welcome/sources", renderWelcomeSources);
route("/welcome/recap", renderWelcomeRecap);
// First-time ALT — thin redirect that mints a transient
// /session/welcome-alt-{ts} session. The conversational Playbook
// builder (3-question chat: URL → profile → optional documents) runs
// inside that session in onboarding chrome. At the end of the chat,
// the user lands on /welcome-alt/recap below.
route("/welcome-alt", renderWelcomeAlt);
route("/welcome-alt/recap", renderWelcomeAltRecap);

// Boot.
initTopbar();
renderTopbar();
initSidebar();
renderSidebar();
initRightPanel();
initScheduleModal();
initUserModeChip();
// Inject modal DOM once so the topbar buttons can just toggle open/close
// without worrying about init ordering.
initBugReportModal();
initFeedbackModal();
initGenerateImageModal();
initVideoClipsModal();
initChatPickerModal();
initAddSourceModal();
initConfirmModal();
initRenameModal();
initSearchModal();
initConversationStatusCard();

// Re-render the sidebar on every route change so the active conversation row
// stays highlighted. The conversation status card also re-renders here so it
// hides when navigating away from /session/:id.
//
// The onboarding class flip is centralized here so /welcome screens get a
// full-bleed shell without each screen having to add/remove the class.
// Not applied to legacy /session/welcome-* (the linear-onboarding
// playbook-creation step keeps the standard grid for its 3rd-column
// brief panel + empty-state sidebar/topbar). It IS applied to
// /session/welcome-alt-* — the First Time User ALT flow runs the chat
// inside the onboarding chrome.
// Feature flag → body class. Driven once at boot (flag changes always
// reload the page, so we don't need to re-evaluate on every route).
document.body.classList.toggle("hide-playbook-colors", isFlagOn("hidePlaybookColors"));

setAfterRender((path) => {
  renderSidebar();
  renderConversationStatusCard();
  const isAltSession = path.startsWith("/session/welcome-alt-");
  document.body.classList.toggle("onboarding", path.startsWith("/welcome") || isAltSession);
});

start();

// Figma capture helper — programmatically open a modal after the route
// renders so it can be captured. Query: ?openModal=add-source[&tab=url|connectors]
{
  const params = new URLSearchParams(window.location.search);
  const which = params.get("openModal");
  if (which) {
    const tab = params.get("tab");
    // Defer to after first render so the topbar/sidebar/screen are mounted.
    window.setTimeout(() => {
      try {
        switch (which) {
          case "add-source":
            __capAddSource.open({ tab: tab || "upload" });
            break;
          case "generate-image":
            __capGenImage.open(null, () => {});
            break;
          case "bug":
            __capBug.open();
            break;
          case "feedback":
            __capFeedback.open();
            break;
          case "chat-picker":
            __capChatPicker.open({ ideaId: null });
            break;
          case "search":
            __capSearch.open();
            break;
        }
      } catch (err) {
        console.error("[capture] failed to open modal", which, err);
      }
    }, 600);
  }

  // Right-panel programmatic open (used by Figma capture)
  const panel = params.get("openPanel");
  if (panel) {
    window.setTimeout(() => {
      try {
        switch (panel) {
          case "drafts":
            __capOpenDrafts();
            break;
          case "ideas":
            __capOpenIdeas();
            break;
          case "sources":
            __capOpenSources();
            break;
          case "context": {
            const m = (params.get("route") || "").match(/^\/session\/([^/?]+)/);
            const sessionId = m ? m[1] : null;
            if (sessionId) __capOpenContextPanel({ sessionId, mode: "read" });
            break;
          }
        }
      } catch (err) {
        console.error("[capture] failed to open panel", panel, err);
      }
    }, 1000);
  }
}
