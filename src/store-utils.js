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

// Per-session fan-out for the chat-scoped stores (assistant, posts,
// composer-mentions, composer-connector, …) that each hand-rolled the same
// Map(sessionId → Set<fn>) boilerplate. subscribe/notify are keyed by session;
// the caller passes the snapshot (each store computes its own). clear() flushes
// a session's subscribers with one final snapshot — e.g. [] on conversation
// delete so still-mounted DOM can tear down — then forgets them.
export function createSessionNotifier(label) {
  const subscribers = new Map();
  function flush(sessionId, snapshot) {
    const set = subscribers.get(sessionId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(snapshot);
      } catch (err) {
        console.warn(`[${label}] subscriber threw`, err);
      }
    }
  }
  return {
    subscribe(sessionId, fn) {
      if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
      subscribers.get(sessionId).add(fn);
      return () => {
        const set = subscribers.get(sessionId);
        if (set) set.delete(fn);
      };
    },
    notify(sessionId, snapshot) {
      flush(sessionId, snapshot);
    },
    clear(sessionId, finalSnapshot) {
      flush(sessionId, finalSnapshot);
      subscribers.delete(sessionId);
    },
  };
}
