import { route, setAfterRender, start } from "./router.js?v=21";
import { initTopbar, renderTopbar } from "./components/topbar.js?v=47";
import { initSidebar, renderSidebar } from "./components/sidebar.js?v=41";
import { init as initRightPanel } from "./components/right-panel.js?v=58";
import { init as initScheduleModal } from "./components/schedule-modal.js?v=20";
import { initUserModeChip } from "./components/user-mode-chip.js?v=21";
import { init as initBugReportModal } from "./components/bug-report-modal.js?v=21";
import { init as initFeedbackModal } from "./components/feedback-modal.js?v=24";
import { init as initGenerateImageModal } from "./components/generate-image-modal.js?v=21";
import { init as initVideoClipsModal } from "./components/video-clips-modal.js?v=1";
import { init as initSettingsDrawer } from "./components/settings-drawer.js?v=23";
import { init as initChatPickerModal } from "./components/chat-picker-modal.js?v=21";
import { init as initAddSourceModal } from "./components/add-source-modal.js?v=22";
import { init as initConfirmModal } from "./components/confirm-modal.js?v=20";
import { init as initRenameModal } from "./components/rename-modal.js?v=1";
import { init as initSearchModal } from "./components/search-modal.js?v=3";
import {
  init as initConversationStatusCard,
  render as renderConversationStatusCard,
} from "./components/conversation-status-card.js?v=10";
import { renderDashboard } from "./screens/dashboard.js?v=44";
import { renderSession } from "./screens/session.js?v=102";
import { renderIdeas } from "./screens/ideas.js?v=24";
import { renderContexts } from "./screens/contexts.js?v=31";
import { renderWelcome } from "./screens/welcome.js?v=3";
import { renderWelcomeSources } from "./screens/welcome-sources.js?v=1";
// Route table.
// Every screen is responsible for calling renderTopbar() itself so the crumb
// stays in sync with the active context.
route("/", renderDashboard);
route("/session/:id", renderSession);
route("/ideas", renderIdeas);
route("/contexts", renderContexts);
// First-time onboarding (Lot 14). /welcome is the splash; the playbook
// creation step itself runs inside a transient /session/welcome-* via the
// existing pendingStartContextBuilder handoff; /welcome/sources is the
// optional connectors step before landing on the dashboard.
route("/welcome", renderWelcome);
route("/welcome/sources", renderWelcomeSources);

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
initSettingsDrawer();
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
// Intentionally NOT applied to /session/welcome-* — the playbook creation
// step needs the standard grid so the brief panel can occupy its 3rd
// column; the sidebar and topbar render in their new-user empty state.
setAfterRender((path) => {
  renderSidebar();
  renderConversationStatusCard();
  document.body.classList.toggle("onboarding", path.startsWith("/welcome"));
});

start();
