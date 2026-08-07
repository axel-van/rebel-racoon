import { FLAGS } from "./ff-catalog.js?v=22";

const KEY = "archie-feature-flags";

function readStoredFlags() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.warn("Invalid Archie feature flags storage; resetting.", error);
    resetFlags();
    return {};
  }
}

function getFlagDefinition(id) {
  return FLAGS.find((flag) => flag.id === id) || null;
}

export function isFlagOn(id) {
  const flag = getFlagDefinition(id);
  if (!flag) return false;
  const stored = readStoredFlags();
  return Object.prototype.hasOwnProperty.call(stored, id) ? stored[id] === true : flag.default === true;
}

export function getFlags() {
  const stored = readStoredFlags();
  return FLAGS.reduce((acc, flag) => {
    acc[flag.id] = Object.prototype.hasOwnProperty.call(stored, flag.id)
      ? stored[flag.id] === true
      : flag.default === true;
    return acc;
  }, {});
}

export function setFlag(id, value) {
  try {
    const stored = readStoredFlags();
    stored[id] = value === true;
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

function resetFlags() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
