import { route, setAfterRender, start } from "./router.js?v=21";
import { initTopbar, renderTopbar } from "./components/topbar.js?v=36";
import { initSidebar, renderSidebar } from "./components/sidebar.js?v=28";
import { init as initRightPanel } from "./components/right-panel.js?v=40";
import { init as initScheduleModal } from "./components/schedule-modal.js?v=20";
import { initUserModeChip } from "./components/user-mode-chip.js?v=21";
import { init as initBugReportModal } from "./components/bug-report-modal.js?v=21";
import { init as initFeedbackModal } from "./components/feedback-modal.js?v=24";
import { init as initGenerateImageModal } from "./components/generate-image-modal.js?v=20";
import { init as initSettingsDrawer } from "./components/settings-drawer.js?v=22";
import { init as initChatPickerModal } from "./components/chat-picker-modal.js?v=21";
import { init as initAddSourceModal } from "./components/add-source-modal.js?v=21";
import { init as initConfirmModal } from "./components/confirm-modal.js?v=20";
import { renderDashboard } from "./screens/dashboard.js?v=42";
import { renderSession } from "./screens/session.js?v=68";
import { renderSources } from "./screens/sources.js?v=26";
import { renderIdeas } from "./screens/ideas.js?v=24";
import { renderContexts } from "./screens/contexts.js?v=26";
import { renderContextNew } from "./screens/context-new.js?v=20";
// Route table.
// Every screen is responsible for calling renderTopbar() itself so the crumb
// stays in sync with the active context.
route("/", renderDashboard);
route("/session/:id", renderSession);
route("/sources", renderSources);
route("/ideas", renderIdeas);
route("/contexts", renderContexts);
route("/contexts/new", renderContextNew);

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
initSettingsDrawer();
initChatPickerModal();
initAddSourceModal();
initConfirmModal();

// Re-render the sidebar on every route change so the active conversation row
// stays highlighted.
setAfterRender(() => renderSidebar());

start();
