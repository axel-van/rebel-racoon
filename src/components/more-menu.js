// Shared "kebab" overflow-menu behaviour for cards (source / idea / clip / …).
//
// Each card used to hand-roll the same three pieces: a closeAll() that hides
// every open menu of its kind, a toggle() bound to the trigger button, and a
// pair of document-level listeners (click-outside + Escape) installed once.
// installMoreMenu() centralises all three, parameterised by the card's own
// selectors so existing markup (per-card classes + data-* hooks) is untouched.
//
// Markup contract (unchanged from before):
//   trigger:  <button data-…-more aria-controls="<menuId>" aria-expanded="…">
//   menu:     <div class="ap-action-dropdown <card>__more-menu" id="<menuId>" hidden>
//
// One open at a time within a kind; clicking another card's trigger closes
// this kind's menus too (each install's outside-click handler fires). Returns
// { closeAll } so a card with extra in-menu actions (e.g. idea-card's pin) can
// dismiss the menu after handling them.
//
// opts:
//   menuSelector        — CSS selector matching this kind's menu elements
//   triggerSelector     — CSS selector matching this kind's trigger buttons
//   closeAfterSelectors — optional in-menu action hooks that should dismiss the
//                         menu after firing (the action itself runs via the
//                         screen-level delegate; we don't preventDefault)

export function installMoreMenu({ menuSelector, triggerSelector, closeAfterSelectors = [] }) {
  function closeAll(exceptMenu) {
    document.querySelectorAll(`${menuSelector}:not([hidden])`).forEach((menu) => {
      if (menu === exceptMenu) return;
      menu.hidden = true;
      const controllingBtn = document.querySelector(`[aria-controls="${menu.id}"]`);
      if (controllingBtn) controllingBtn.setAttribute("aria-expanded", "false");
    });
  }

  function toggle(triggerBtn) {
    const menuId = triggerBtn.getAttribute("aria-controls");
    const menu = menuId ? document.getElementById(menuId) : null;
    if (!menu) return;
    const willOpen = menu.hidden;
    closeAll(willOpen ? menu : null);
    menu.hidden = !willOpen;
    triggerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(triggerSelector);
    if (trigger) {
      event.preventDefault();
      toggle(trigger);
      return;
    }
    for (const sel of closeAfterSelectors) {
      if (event.target.closest(sel)) {
        closeAll();
        return; // let the screen-level action handler run
      }
    }
    // Clicks inside an open menu shouldn't bubble-close it.
    if (event.target.closest(menuSelector)) return;
    closeAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });

  return { closeAll };
}
