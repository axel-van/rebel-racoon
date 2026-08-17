import { route, setAfterRender, start } from "./router.js?v=30";
import { isFlagOn } from "./feature-flags.js?v=22";
import { initArchieLoader } from "./archie-loader.js?v=2";
import { initTopbar, renderTopbar } from "./components/topbar.js?v=439";
import { initSidebar, renderSidebar } from "./components/sidebar.js?v=406";
import { init as initRightPanel } from "./components/right-panel.js?v=573";
import { init as initScheduleModal } from "./components/schedule-modal.js?v=94";
import { init as initBugReportModal } from "./components/bug-report-modal.js?v=24";
import { init as initFeedbackModal } from "./components/feedback-modal.js?v=26";
import { init as initImageStudioModal } from "./components/image-studio/index.js?v=109";
import { init as initImageStudioV2Modal } from "./components/image-studio-v2/index.js?v=87";
import { init as initVideoClipsModal } from "./components/video-clips-modal.js?v=92";
import { init as initChatPickerModal } from "./components/chat-picker-modal.js?v=100";
import { init as initAddSourceModal } from "./components/add-source-modal.js?v=101";
import { init as initConnectorsModal } from "./components/connectors-modal.js?v=45";
import { init as initTopicModal } from "./components/topic-modal.js?v=40";
import { init as initResearchModals } from "./components/research-modals.js?v=125";
import { init as initAddPlaybookEntryModal } from "./components/add-playbook-entry-modal.js?v=1";
import { init as initPillarModal } from "./components/pillar-modal.js?v=26";
import { init as initPillarPickerModal } from "./components/pillar-picker-modal.js?v=18";
import { init as initConfirmModal } from "./components/confirm-modal.js?v=22";
import { init as initRenameModal } from "./components/rename-modal.js?v=2";
import { init as initSaveFolderModal } from "./components/save-folder-modal.js?v=42";
import { init as initAnalyzeProfilesModal } from "./components/analyze-profiles-modal.js?v=51";
import { init as initFillDocumentModal } from "./components/fill-document-modal.js?v=5";
import { init as initSearchModal } from "./components/search-modal.js?v=48";
import {
  init as initConversationStatusCard,
  render as renderConversationStatusCard,
} from "./components/conversation-status-card.js?v=366";
import { renderDashboard } from "./screens/dashboard.js?v=91";
import { renderSession } from "./screens/session.js?v=671";
import { renderContexts } from "./screens/contexts.js?v=400";
import { renderConnectors } from "./screens/connectors.js?v=339";
import { renderTopics } from "./screens/topics.js?v=208";
import { renderTopicsSettings } from "./screens/topics-settings.js?v=213";
import { renderContentStrategy } from "./screens/content-strategy.js?v=27";
import { renderPillar } from "./screens/pillar.js?v=26";
import { renderResearchForm } from "./screens/research-form.js?v=177";
import { renderResearchFeed } from "./screens/research-feed.js?v=198";
import { renderResearchTrending } from "./screens/research-trending.js?v=180";
import { renderWelcomeAlt } from "./screens/welcome-alt.js?v=4";
// Settings route removed — the prototype Admin controls moved to the sidebar
// cog popover (see admin-menu.js + sidebar.js); Social accounts page dropped.
import { renderWelcomeAltRecap } from "./screens/welcome-alt-recap.js?v=397";
import { renderPlaybook } from "./screens/playbook.js?v=411";
import * as __capAddSource from "./components/add-source-modal.js?v=101";
import * as __capBug from "./components/bug-report-modal.js?v=24";
import * as __capFeedback from "./components/feedback-modal.js?v=26";
import * as __capChatPicker from "./components/chat-picker-modal.js?v=100";
import * as __capSearch from "./components/search-modal.js?v=48";
import {
  openDrafts as __capOpenDrafts,
  openIdeas as __capOpenIdeas,
  openSources as __capOpenSources,
  openContextBriefPanel as __capOpenContextPanel,
} from "./components/right-panel.js?v=573";

// Route table.
// Every screen is responsible for calling renderTopbar() itself so the crumb
// stays in sync with the active context.
route("/", renderDashboard);
route("/session/:id", renderSession);
route("/contexts", renderContexts);
route("/playbook/:id", renderPlaybook);
route("/connectors", renderConnectors);
route("/topics", renderTopics);
// route() anchors its regex (^…$), so this is a distinct sibling of /topics — no
// ordering concern. The config is a settings PAGE rather than a tab on the feed:
// you set your listening sources once and then read topics for months.
route("/topics/settings", renderTopicsSettings);
// Content Research. ORDER STILL MATTERS: match() returns the FIRST matching
// route, and /topic-feeds/:id would happily swallow "/topic-feeds/settings" with
// id="settings". The literal has to be registered first.
// ONE feed per Playbook: /topic-feeds renders the FEED itself, resolved from the
// rail's scope, rather than a list of feeds. The list screen (research.js) is
// unreachable and its route is gone — with a feed per Playbook there is nothing
// to list, and /contexts is where brands are managed.
//
// Creation is gone with it. A feed is implicit in a Playbook now; what a user
// changes is which sources it listens to, which is /topic-feeds/settings.
route("/topic-feeds", renderResearchFeed);
route("/topic-feeds/settings", renderResearchForm);
route("/topic-feeds/:id/settings", renderResearchForm);
route("/topic-feeds/:id/attention", renderResearchTrending);
route("/topic-feeds/:id", renderResearchFeed);
// Content strategy. Two flat routes, no ordering concern: route() anchors its
// regex, and /pillar/:id is a different first segment from /content-strategy.
// The pillar page is NOT nested under /content-strategy/:id — a pillar is an
// object with its own life (it is linked to from a topic card's menu and will be
// shareable), not a sub-view of the list.
// ⚠️ There is NO /settings route, for the FOURTH time. The last attempt argued
// it was the "aggregate" rule's second clause — one feature, two views of it —
// and it still turned into a place you go to configure things, one screen away
// from every object it was configuring. Playbooks are managed on /contexts, the
// library that already exists for them; a feed's sources are edited from that
// feed. See CLAUDE.md, "A settings surface must not aggregate".
route("/content-strategy", renderContentStrategy);
route("/pillar/:id", renderPillar);
// First-time ALT — thin redirect that mints a transient
// /session/welcome-alt-{ts} session. The conversational Playbook
// builder (3-question chat: URL → profile → optional documents) runs
// inside that session in onboarding chrome. At the end of the chat,
// the user lands on /welcome-alt/recap below.
route("/welcome-alt", renderWelcomeAlt);
route("/welcome-alt/recap", renderWelcomeAltRecap);

// Boot.
// Swap every spinner in the app for the animated network-assemble mark
// (sweeps the DOM now + watches for loaders added by later renders).
initArchieLoader();
initTopbar();
renderTopbar();
initSidebar();
renderSidebar();
initRightPanel();
initScheduleModal();
// Inject modal DOM once so the topbar buttons can just toggle open/close
// without worrying about init ordering.
initBugReportModal();
initFeedbackModal();
initImageStudioModal();
initImageStudioV2Modal();
initVideoClipsModal();
initChatPickerModal();
initAddSourceModal();
initConnectorsModal();
initTopicModal();
initResearchModals();
initAddPlaybookEntryModal();
initPillarModal();
initPillarPickerModal();
initConfirmModal();
initRenameModal();
initSaveFolderModal();
initAnalyzeProfilesModal();
initFillDocumentModal();
initSearchModal();
initConversationStatusCard();

// Re-render the sidebar on every route change so the active conversation row
// stays highlighted. The conversation status card also re-renders here so it
// hides when navigating away from /session/:id.
//
// The onboarding class flip is centralized here so the /welcome-alt screens
// get a full-bleed shell without each screen having to add/remove the class.
// It is also applied to /session/welcome-alt-* — the First Time User ALT
// flow runs the chat inside the onboarding chrome.
// Feature flag → body class. Driven once at boot (flag changes always
// reload the page, so we don't need to re-evaluate on every route).
document.body.classList.toggle("hide-playbook-colors", !isFlagOn("playbookColors"));

setAfterRender((path) => {
  renderSidebar();
  renderConversationStatusCard();
  const isAltSession = path.startsWith("/session/welcome-alt-");
  // The welcome-alt flow runs either full-bleed (first-time onboarding) or
  // integrated in the app shell — a returning user creating a Playbook keeps
  // the sidebar + topbar. The `welcomeAltIntegrated` flag (set by the
  // New-Playbook entry points, cleared on finish) drives the difference.
  let integratedCreate = false;
  try {
    integratedCreate = window.sessionStorage.getItem("welcomeAltIntegrated") === "1";
  } catch {
    /* ignore */
  }
  document.body.classList.toggle("onboarding", (path.startsWith("/welcome") || isAltSession) && !integratedCreate);
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
