// Minimal hash-based router.
// Routes are declared up-front; the active one re-renders into #app on hashchange.

const routes = [];
let afterRender = null;
let activeCleanup = null;

export function route(pattern, handler) {
  // Compile :param segments into a regex.
  const names = [];
  const source = pattern.replace(/:([a-z][a-zA-Z0-9_]*)/g, (_, name) => {
    names.push(name);
    return "([^/]+)";
  });
  const regex = new RegExp("^" + source + "$");
  routes.push({ pattern, regex, names, handler });
}

export function navigate(path) {
  const next = "#" + path;
  if (window.location.hash === next) {
    // Force re-render even if the hash didn't change.
    render();
  } else {
    window.location.hash = next;
  }
}

export function getPath() {
  const raw = (window.location.hash || "#/").replace(/^#/, "") || "/";
  // Strip the query string — route patterns only match the path.
  return raw.split("?")[0] || "/";
}

export function setAfterRender(fn) {
  afterRender = fn;
}

function match(path) {
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.names.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      return { handler: r.handler, params };
    }
  }
  return null;
}

export function render() {
  const path = getPath();
  const found = match(path);
  const target = document.getElementById("app");
  if (!target) return;
  if (!found) {
    // Fallback to root if the hash points nowhere.
    if (path !== "/") {
      navigate("/");
      return;
    }
    runActiveCleanup();
    target.innerHTML = '<p style="padding: var(--ref-spacing-lg)">Not found.</p>';
    return;
  }
  runActiveCleanup();
  const cleanup = found.handler(found.params, target);
  activeCleanup = typeof cleanup === "function" ? cleanup : null;
  if (afterRender) afterRender(path, found.params);
  // Scroll any scrollable regions to top on route change.
  target.scrollTop = 0;
}

function runActiveCleanup() {
  if (!activeCleanup) return;
  const cleanup = activeCleanup;
  activeCleanup = null;
  cleanup();
}

export function start() {
  window.addEventListener("hashchange", render);
  if (!window.location.hash) {
    window.location.hash = "#/";
  }
  render();
}
