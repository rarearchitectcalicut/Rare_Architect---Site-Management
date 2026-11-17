import assert from "node:assert/strict";
import test from "node:test";
import { createNotepadStore, NOTE_LIMIT } from "../src/components/notes/notepadStore.js";

const note = (content = "", revision = 0) => ({ content, revision, updated_at: "2026-11-17T12:00:00Z" });
function harness(api = {}) {
  let timer;
  const writes = [];
  const store = createNotepadStore({ get: async () => note(), save: async (text, revision) => { writes.push({ text, revision }); return note(text, revision + 1); }, ...api }, { schedule(fn) { timer = fn; return 1; }, cancel() { timer = null; } });
  return { store, writes, tick() { const fn = timer; timer = null; fn?.(); } };
}

test("notes debounce autosave and preserve exact multiline text, including clearing", async () => {
  const h = harness(); await h.store.load();
  h.store.edit("one"); h.store.edit("  one\n\ntwo  ");
  assert.equal(h.writes.length, 0);
  h.tick(); await h.store.save();
  assert.deepEqual(h.writes, [{ text: "  one\n\ntwo  ", revision: 0 }]);
  assert.equal(h.store.dirty(), false);
  h.store.edit(""); await h.store.save();
  assert.deepEqual(h.writes[1], { text: "", revision: 1 });
  assert.equal(h.store.getSnapshot().text, "");
});

test("in-flight saves serialize newer edits without losing typed text", async () => {
  let resolveFirst;
  const writes = [];
  const h = harness({ save(text, revision) { writes.push({ text, revision }); return writes.length === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(note(text, revision + 1)); } });
  await h.store.load(); h.store.edit("first");
  const saving = h.store.save();
  h.store.edit("newer text");
  assert.equal(h.store.save(), saving);
  resolveFirst(note("first", 1));
  assert.equal(await saving, true);
  assert.deepEqual(writes, [{ text: "first", revision: 0 }, { text: "newer text", revision: 1 }]);
  assert.equal(h.store.getSnapshot().text, "newer text");
  assert.equal(h.store.dirty(), false);
});

test("save failures retain text for retry and do not claim success", async () => {
  let fail = true;
  const h = harness({ save: async (text, revision) => { if (fail) throw new Error("offline"); return note(text, revision + 1); } });
  await h.store.load(); h.store.edit("keep me");
  assert.equal(await h.store.save(), false);
  assert.equal(h.store.getSnapshot().text, "keep me");
  assert.equal(h.store.dirty(), true);
  assert.match(h.store.getSnapshot().error, /Not saved/);
  fail = false;
  assert.equal(await h.store.save(), true);
  assert.equal(h.store.dirty(), false);
});

test("conflicting devices require explicit resolution and never erase local text automatically", async () => {
  let conflict = true;
  const writes = [];
  const h = harness({ save: async (text, revision) => {
    writes.push({ text, revision });
    if (conflict) throw { response: { status: 409, data: { current: note("other device", 4) } } };
    return note(text, revision + 1);
  } });
  await h.store.load(); h.store.edit("mine");
  assert.equal(await h.store.save(), false);
  assert.equal(h.store.getSnapshot().text, "mine");
  h.store.edit("mine edited again"); h.tick(); await h.store.save();
  assert.equal(writes.length, 1);
  conflict = false;
  assert.equal(await h.store.keepMine(), true);
  assert.deepEqual(writes[1], { text: "mine edited again", revision: 4 });
  assert.equal(h.store.dirty(), false);
});

test("use saved version, lost-response recovery and fresh account stores are safe", async () => {
  const h = harness({ save: async () => { throw { response: { status: 409, data: { current: note("remote", 3) } } }; } });
  await h.store.load(); h.store.edit("local"); await h.store.save(); h.store.useSaved();
  assert.equal(h.store.getSnapshot().text, "remote");
  assert.equal(h.store.dirty(), false);
  h.store.edit("same");
  const recovered = harness({ get: async () => note(), save: async () => { throw { response: { status: 409, data: { current: note("same", 1) } } }; } });
  await recovered.store.load(); recovered.store.edit("same");
  assert.equal(await recovered.store.save(), true);
  assert.equal(recovered.store.dirty(), false);
  const another = harness(); await another.store.load();
  assert.equal(another.store.getSnapshot().text, "");
  h.store.dispose(); recovered.store.dispose(); another.store.dispose();
});

test("load failures are retryable and invalid/oversize data cannot replace notes", async () => {
  let valid = false;
  const h = harness({ get: async () => valid ? note("real text") : {} });
  assert.equal(await h.store.load(), false);
  assert.equal(h.store.getSnapshot().loaded, false);
  h.store.edit("not loaded");
  assert.equal(h.store.getSnapshot().text, "");
  valid = true;
  assert.equal(await h.store.load(), true);
  h.store.edit("x".repeat(NOTE_LIMIT + 1));
  assert.equal(h.store.getSnapshot().text, "real text");
  h.store.dispose();
});
