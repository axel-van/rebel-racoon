// Tiny shared primitive for the in-memory stores. Each store used to
// re-implement the same subscribe/notify boilerplate:
//
//   const subscribers = new Set();
//   export function subscribe(fn) {
//     subscribers.add(fn);
//     return () => subscribers.delete(fn);
//   }
//   function notify() {
//     for (const fn of subscribers) {
//       try { fn(snapshot); }
//       catch (err) { console.warn("[store] subscriber threw", err); }
//     }
//   }
//
// createNotifier(label) returns { subscribe, notify, count } so a store
// can drop ~15 lines of boilerplate and gain a consistent error log
// prefix.
//
// The notifier is dumb on purpose — `notify(snapshot)` runs every
// subscriber with the same value. Per-session fan-out (library, posts,
// assistant, …) lives outside the notifier, in the store-local
// `Map(sessionId → Set<fn>)` shape.

export function createNotifier(label) {
  const subscribers = new Set();
  return {
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    notify(snapshot) {
      for (const fn of subscribers) {
        try {
          fn(snapshot);
        } catch (err) {
          console.warn(`[${label}] subscriber threw`, err);
        }
      }
    },
    get count() {
      return subscribers.size;
    },
  };
}
