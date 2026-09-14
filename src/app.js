import { navigate, route, setAfterRender, start } from "./router.js?v=1159";
import { initArchieLoader } from "./archie-loader.js?v=1159";
import { renderInsights } from "./screens/insights/shell.js?v=1159";
import { init as initObjectiveModal } from "./components/objective-modal.js?v=1159";
import { init as initObjectiveCatalogPanel } from "./components/objective-catalog-panel.js?v=1159";
import { initTopbar, renderTopbar } from "./components/topbar.js?v=1159";
import { initSidebar, renderSidebar } from "./components/sidebar.js?v=1159";
import { isAccountScope } from "./active-playbook.js?v=1159";
import { init as initRightPanel } from "./components/right-panel.js?v=1159";
import { init as initScheduleModal } from "./components/schedule-modal.js?v=1159";
import { init as initBugReportModal } from "./components/bug-report-modal.js?v=1159";
import { init as initFeedbackModal } from "./components/feedback-modal.js?v=1159";
import { init as initImageStudio } from "./components/image-studio-v2/index.js?v=1159";
import { init as initVideoClipsModal } from "./components/video-clips-modal.js?v=1159";
import { init as initChatPickerModal } from "./components/chat-picker-modal.js?v=1159";
import { init as initAddSourceModal } from "./components/add-source-modal.js?v=1159";
import { init as initConnectorsModal } from "./components/connectors-modal.js?v=1159";
import { init as initTopicIgnoreModal } from "./components/topic-ignore-modal.js?v=1159";
import { init as initTopicHistoryModal } from "./components/topic-history-modal.js?v=1159";
import { init as initTopicPickerModal } from "./components/topic-picker-modal.js?v=1159";
import { init as initConfirmModal } from "./components/confirm-modal.js?v=1159";
import { init as initRenameModal } from "./components/rename-modal.js?v=1159";
import { init as initSaveFolderModal } from "./components/save-folder-modal.js?v=1159";
import { init as initSharePlaybookModal } from "./components/share-playbook-modal.js?v=1159";
import { init as initAnalyzeProfilesModal } from "./components/analyze-profiles-modal.js?v=1159";
import { init as initConnectAccountModal } from "./components/connect-account-modal.js?v=1159";
import { init as initFillDocumentModal } from "./components/fill-document-modal.js?v=1159";
import { init as initSearchModal } from "./components/search-modal.js?v=1159";
import { init as initTooltip } from "./components/tooltip.js?v=1159";
import {
  init as initConversationStatusCard,
  render as renderConversationStatusCard,
} from "./components/conversation-status-card.js?v=1159";
import { renderDashboard } from "./screens/dashboard.js?v=1159";
import { renderSession } from "./screens/session.js?v=1159";
import { renderHome, renderContextsRoute } from "./screens/home.js?v=1159";
import { renderTopics } from "./screens/topics.js?v=1159";
import { renderTopicsSettings } from "./screens/topics-settings.js?v=1159";
import { renderConnectors } from "./screens/connectors.js?v=1159";
import { renderWelcomeAlt } from "./screens/welcome-alt.js?v=1159";
// Settings route removed — the prototype Admin controls moved to the sidebar
// cog popover (see admin-menu.js + sidebar.js); Social accounts page dropped.
import { renderWelcomeAltRecap } from "./screens/welcome-alt-recap.js?v=1159";
import { renderPlaybook } from "./screens/playbook.js?v=1159";
import { initFigmaCapture } from "./figma-capture.js?v=1159";

// Route table.
// Every screen is responsible for calling renderTopbar() itself so the crumb
// stays in sync with the active context.
route("/", renderDashboard);
route("/session/:id", renderSession);
// The account home (flag `playbookWorkspace`) and the Playbooks catalogue are
// one screen, screens/home.js, entered by two routes. Each gates itself and
// bounces to the other's model, so a stale deep link always lands: /home is the
// hero + the two tabs, /contexts the catalogue on its own.
route("/home", renderHome);
route("/contexts", renderContextsRoute);
route("/playbook/:id", renderPlaybook);
route("/connectors", renderConnectors);
// The Topic Feed. Gated on `topicFeed` inside the screen rather than here, so a
// stale deep link bounces to / instead of rendering a dead route.
// Insights — the active brand's objectives, read two ways. ONE route: the two
// layouts are a control inside the screen, not URLs. /insights/:tab exists only
// so links from the older tabbed hub land, query kept, and it is gated by the
// same flag as the screen (which bounces home when the switch is off).
route("/insights", renderInsights);
route("/insights/:tab", () => {
  const query = window.location.hash.split("?")[1];
  navigate(query ? `/insights?${query}` : "/insights");
});
route("/topics", renderTopics);
// route() anchors its regex (^…$), so this is a distinct sibling of /topics — no
// ordering concern. The config is a settings PAGE rather than a tab on the feed:
// you set your listening sources once and then read Topics for months.
route("/topics/settings", renderTopicsSettings);
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
// Document-delegated, so every `[data-tooltip]` rendered by any screen — now or
// after the next route change — is live without registering anything.
initTooltip();
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
initImageStudio();
initVideoClipsModal();
initChatPickerModal();
initAddSourceModal();
initConnectorsModal();
initTopicIgnoreModal();
initTopicHistoryModal();
initTopicPickerModal();
initConfirmModal();
initRenameModal();
initSaveFolderModal();
initObjectiveModal();
initObjectiveCatalogPanel();
initSharePlaybookModal();
initAnalyzeProfilesModal();
initConnectAccountModal();
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
  // Account scope — the routes that live ABOVE the workspaces (the Playbooks
  // catalogue, and another brand's fiche opened from it). The shell steps back
  // to a single column with no rail: a page listing eight brands must not wear
  // the chrome of one. See active-playbook.js § Above the workspaces.
  document.body.classList.toggle("account-scope", isAccountScope(path));
});

start();

// Deep links that open a modal or a panel for the Figma screen capture.
initFigmaCapture();
