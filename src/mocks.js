// All prototype data — hardcoded, no network, no persistence, no randomness.
//
// One file per domain under `mocks/`; this barrel is the single import path,
// so every consumer keeps `from "./mocks.js?v=1227"`. The domains are self-contained:
// nothing under mocks/ reads anything from a sibling, which is what makes the
// split safe to keep.

export * from "./mocks/sessions.js?v=1227";
export * from "./mocks/top-posts.js?v=1227";
export * from "./mocks/sources.js?v=1227";
export * from "./mocks/ideas.js?v=1227";
export * from "./mocks/playbooks.js?v=1227";
export * from "./mocks/topics.js?v=1227";
export * from "./mocks/posts.js?v=1227";
export * from "./mocks/threads.js?v=1227";
export * from "./mocks/schedule.js?v=1227";
export * from "./mocks/connectors.js?v=1227";
export * from "./mocks/social.js?v=1227";
export * from "./mocks/objectives.js?v=1227";
