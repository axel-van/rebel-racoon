export const FLAGS = Object.freeze([
  {
    id: "draftInlineEdit",
    label: "Inline edit on draft posts",
    default: false,
    hides:
      "Inline editing affordance + handler for draft post cards in the " +
      "right panel (introduit par le commit 1e3076e — feat(rpanel): " +
      "inline editing for draft posts).",
  },
  {
    id: "sidebarIdeas",
    label: "Ideas in left sidebar",
    default: false,
    hides: "Ideas entry in the left sidebar navigation.",
  },
  {
    id: "conversationalPlaybookEdit",
    label: "Conversational edit from /contexts",
    default: false,
    hides:
      "When ON, the pen icon on a Playbook card launches the " +
      "conversational Playbook editor (spawns /session/playbook-edit-*). " +
      "When OFF (default), it opens the brief panel directly for " +
      "in-place editing.",
  },
  {
    id: "hidePlaybookColors",
    label: "Hide playbook colors",
    default: false,
    hides:
      "When ON, hides the playbook color visuals everywhere: the top " +
      "stripe + palette dots on /contexts cards, the color dot on " +
      "sidebar conversation rows, and the color swatch picker in the " +
      "brief panel. Used to evaluate the UI without color coding.",
  },
]);
