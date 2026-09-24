// Who may do what to a Playbook.
//
// A Playbook has exactly one owner and one of three scopes (doc §5.3):
//   "personal"     — only its owner sees it
//   "members"      — a FIXED list of colleagues may SEE and USE it
//   "organization" — a DYNAMIC list: everyone in the org, joiners included
//
// Whichever way it reaches you, only the OWNER may edit it.
//
// ⚠️ For two weeks this file said "there is no named sharing" and shipped two
// scopes. The doc has three, in both its versions (§5.1, §5.3, §6.1, lot L2),
// and the arbitration that removed one was never written down anywhere — so the
// doc won. The fixed-vs-dynamic distinction is the part it insists on making
// legible, which is why `members` is a real scope with a list and not an
// "organization" with a count beside it.
//
// ⚠️ The store deliberately keeps returning everything. Filtering inside
// contexts-store would make the degraded-chat banner impossible to write: a chat
// whose Playbook stopped being shared still has to name it ("this chat used
// Nutrix · product launch"), which means reading a Playbook you may no longer
// open. So the store holds the facts and this module holds the rights — every
// surface asks here, and `revokedContextFor()` is the one place allowed to look
// past the gate.

import { getContexts, getContextById } from "./contexts-store.js?v=1225";
import { isFlagOn } from "./feature-flags.js?v=1225";
import { CURRENT_USER, isManager, memberName, getMember, hasProfileAccess } from "./org.js?v=1225";
import { getConnectedProfiles } from "./social-profiles.js?v=1225";

// Single choke point. Flag OFF ⇒ the app behaves exactly as it did before
// sharing existed: one implicit user, everything visible, everything editable.
function on() {
  return isFlagOn("playbookSharing");
}

// The named recipients, defensive against a seed that never went through the
// store's normalizer.
export function recipientsOf(ctx) {
  return Array.isArray(ctx?.sharedWith) ? ctx.sharedWith : [];
}

export function isOrgShared(ctx) {
  return !!ctx && ctx.scope === "organization";
}

// A `members` Playbook with nobody in the list reaches no one — it is private
// in everything but name, so it must not count as shared (a manager's whole
// reach hangs off this predicate).
function isMemberShared(ctx) {
  return !!ctx && ctx.scope === "members" && recipientsOf(ctx).length > 0;
}

// ── The profile gate (doc §7, both of its profile rows) ───────────────
//
// A Playbook that publishes under a social profile can only reach people who
// can reach that profile — including the person who joins the org tomorrow.
// The permission is Agorapulse's, not Archie's, so it's read from org.js and
// never stored on the Playbook.
//
// FAIL OPEN when the profile can't be resolved (nothing connected, a stale id):
// an unverifiable claim must not lock a fiche, and §8 Q2's whole point is that
// a Playbook carries no private profile data in the first place.
export function tiedProfile(ctx) {
  const id = ctx?.selectedProfileId;
  if (!id) return null;
  return getConnectedProfiles().find((p) => p.id === id) || null;
}

// Why this person can't be given the Playbook — `null` when they can. Returned
// as the profile so callers can name it ("No access to @northwind.studio").
export function profileBlockFor(ctx, memberId) {
  const profile = tiedProfile(ctx);
  if (!profile) return null;
  // The owner picked the profile: they have it by construction.
  if (ctx.ownerId === memberId) return null;
  return hasProfileAccess(memberId, profile.id) ? null : profile;
}

// "Shared" = it left its owner's hands, either way. What a manager may govern.
function isShared(ctx) {
  return isOrgShared(ctx) || isMemberShared(ctx);
}

// Does it reach ME? The org list is everyone; the named list is an id lookup.
function reachesMe(ctx) {
  if (isOrgShared(ctx)) return true;
  return isMemberShared(ctx) && recipientsOf(ctx).includes(CURRENT_USER.id);
}

export function isMine(ctx) {
  if (!ctx) return false;
  if (!on()) return true;
  return ctx.ownerId === CURRENT_USER.id;
}

export function ownerOf(ctx) {
  return (ctx && getMember(ctx.ownerId)) || null;
}

export function ownerName(ctx) {
  return memberName(ctx?.ownerId);
}

// ── The rights table ──────────────────────────────────────────────────
// Owner            → everything
// Shared with me   → view / use / duplicate
// Manager, shared  → view / use / duplicate + share / hand over / delete,
//                    but NOT the content
// Someone else's personal Playbook → nothing at all

export function canView(ctx) {
  if (!ctx) return false;
  if (!on()) return true;
  if (isMine(ctx)) return true;
  // The profile gate comes before every other reach: a share that names me
  // still can't hand me a Playbook publishing under an account I can't see.
  if (profileBlockFor(ctx, CURRENT_USER.id)) return false;
  // A manager sees what the org can see — and nothing more (doc §8, Q1). Which
  // for a named share means: the fiche exists for them even though the list
  // doesn't name them, because they may have to hand it over or delete it.
  if (isShared(ctx) && isManager()) return true;
  return reachesMe(ctx);
}

// "Use" = attach it to a chat and generate with it.
function canUse(ctx) {
  return canView(ctx);
}

// The CONTENT is the owner's, and nobody else's — a shared Playbook is
// read-only for everyone it reaches, managers included (doc §5.2: "Edit the
// content → Org manager ❌"). ⚠️ This used to return true for a manager on a
// shared fiche, which put a pencil on every section of a colleague's Playbook;
// the governance moves that a manager DOES get now live in canGovern() below.
// Keeping the two apart is the whole point: "who decides what it says" and
// "who decides what becomes of it" are different questions.
export function canEdit(ctx) {
  if (!ctx) return false;
  if (!on()) return true;
  return isMine(ctx);
}

// Governance — what a manager may do to a SHARED Playbook without owning it:
// put it in front of the org (or pull it back), hand it over, delete it. Every
// one of these notifies the owner and lands in the log (doc §6.4).
export function canGovern(ctx) {
  if (!ctx) return false;
  if (!on()) return true;
  if (isMine(ctx)) return true;
  // A manager's reach stops at what the org can already see — an untouched
  // personal Playbook stays private even from them (doc §8, Q1).
  return isShared(ctx) && isManager();
}

export const canDelete = canGovern;

// Sharing and hand-over are the only two rights that don't exist at all with
// the flag off — everything else has a pre-sharing equivalent that must keep
// behaving identically, but a Share button would be a new affordance.
export function canManageSharing(ctx) {
  return on() && canGovern(ctx);
}

export const canTransfer = canManageSharing;

// True when acting on a Playbook I don't own — the case that owes its owner a
// notification (doc §6.4).
export function actingOnBehalf(ctx) {
  return on() && !!ctx && !isMine(ctx);
}

// The ownership mark, in the card's metadata corner and beside the fiche's
// name. Mine-and-private says nothing: that's the default nobody needs told.
export function accessLabel(ctx) {
  if (!on() || !ctx) return "";
  if (!isMine(ctx)) return `Shared by ${ownerName(ctx)}`;
  if (isOrgShared(ctx)) return "Shared with org";
  if (!isMemberShared(ctx)) return "";
  const n = recipientsOf(ctx).length;
  // One recipient is named — a count of 1 is a worse sentence than the name it
  // stands for, and this is the only place the reader sees the list at a glance.
  return n === 1 ? `Shared with ${memberName(recipientsOf(ctx)[0])}` : `Shared with ${n} people`;
}

// ── What the surfaces list ────────────────────────────────────────────

export function visibleContexts() {
  return getContexts().filter(canView);
}

export function usableContexts() {
  return getContexts().filter(canUse);
}

export function editableContexts() {
  return getContexts().filter(canEdit);
}

// The tombstone: what a chat can still say about a Playbook it lost. Returns
// null whenever the chat is fine, so callers can treat it as the predicate.
export function revokedContextFor(session) {
  const id = session?.contextId;
  if (!on() || !id) return null;
  const ctx = getContextById(id);
  // Deleted outright, or pulled back to personal by its owner — either way the
  // chat can no longer generate. A missing record still gets a name so the
  // banner reads like a sentence.
  if (!ctx) return { name: "a Playbook", ownerName: "its owner" };
  if (canView(ctx)) return null;
  return { name: ctx.name, ownerName: ownerName(ctx) };
}
