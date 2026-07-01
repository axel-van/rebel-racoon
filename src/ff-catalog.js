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
    id: "playbookDefault",
    label: "Default Playbook toggle",
    default: false,
    hides:
      "When OFF (default), hides the star button next to the Playbook name on " +
      "the /playbook detail page that sets/unsets it as the default Playbook. " +
      "The default-selection logic still works internally.",
  },
  {
    id: "connectors",
    label: "Connectors (live MCP sources)",
    default: false,
    hides:
      "When OFF (default), hides everything connectors-related: the " +
      "Connectors gallery (route /connectors + sidebar nav) and modal, the " +
      "composer Add → 'Connected sources' submenu, the Sources panel 'Live " +
      "connectors' group, the Settings → Connectors section, and the " +
      "Add-source modal's Connectors tab.",
  },
  {
    id: "conversationStatusCard",
    label: "Conversation status card",
    default: true,
    hides:
      "When OFF, hides the floating conversation status card (sources / " +
      "ideas / clips / drafts summary) entirely, including its 'i' toggle " +
      "button in the session topbar.",
  },
  {
    id: "statusActionSnackbars",
    label: "Action success snackbars",
    default: true,
    hides:
      "When OFF, suppress the success snackbars that now duplicate the " +
      "persistent composer status bar: 'N drafts ready to review', " +
      "'Drafted N posts from <source>', 'N ideas ready', and the non-video " +
      "source-ready toast ('<source> ready · N ideas'). The composer status " +
      "bar (and the in-progress / video-ready toasts) stay regardless.",
  },
  {
    id: "hidePlaybookColors",
    label: "Hide playbook colors",
    default: true,
    hides:
      "When ON, hides the playbook color visuals everywhere: the top " +
      "stripe + palette dots on /contexts cards, the color dot on " +
      "sidebar conversation rows, and the color swatch picker in the " +
      "brief panel. Used to evaluate the UI without color coding.",
  },
  {
    id: "repurposeProfileFirst",
    label: "Repurposing: profile-first screen",
    default: true,
    hides:
      "When ON (default), the repurposing flow opens on a full-page profile " +
      "chooser: pick a connected profile → load its winners → a board scoped " +
      "to that profile (no profile dropdown), with a 'Change profile' back in " +
      "the topbar. When OFF, it opens straight on the board of all winners with " +
      "an in-toolbar 'All profiles' dropdown filter (the previous behaviour).",
  },
  {
    id: "leftNavAltMode",
    label: "left-nav alt mode",
    default: false,
    hides:
      "When ON, the left nav no longer auto-collapses when the right panel " +
      "opens (or on resize). The sidebar stays expanded and the chat column " +
      "narrows instead; the user can still collapse it manually.",
  },
]);
