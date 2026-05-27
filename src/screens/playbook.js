// Playbook detail — view + per-card edit of a saved Playbook (Context),
// reusing the shared playbook-view engine in "library" mode. Reached from
// the /contexts cards. Runs inside the app shell (no onboarding chrome, no
// loader); edits save straight into the contexts-store, and the footer
// returns to the Playbooks list.

import { navigate } from "../router.js?v=30";
import { escapeHtml as esc } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=58";
import { getContextById, updateContext } from "../contexts-store.js?v=28";
import { mount, snapshotEditable } from "../playbook-view.js?v=2";

export function renderPlaybook(params, target) {
  const id = params.id;
  renderTopbar();

  if (!getContextById(id)) {
    navigate("/contexts");
    return () => {};
  }

  return mount(target, {
    mode: "library",
    getData: () => getContextById(id),
    isReady: () => true,
    // Edits mutate the live Context in place; commit persists + notifies.
    commit: () => {
      const ctx = getContextById(id);
      if (ctx) updateContext(id, { ...snapshotEditable(ctx), updatedAt: "just now" });
    },
    revert: (snapshot) => updateContext(id, snapshot),
    showTop: false,
    hero: {
      eyebrow: "Playbook",
      title: (d) => d.name || "Playbook",
      lead: (d) => `Everything below is what Archie uses to write for <strong>${esc(d.name || "your brand")}</strong>.`,
    },
    editHint: "Hover any card and hit the pencil to edit it — your changes save as you go.",
    // No footer — the "Back to Playbooks" control lives in the topbar.
  });
}
