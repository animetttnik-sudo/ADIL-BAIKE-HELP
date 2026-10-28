import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriter, validAppState, validCalcState } from '../src/lib/persist.js';

const mk = (failTimes = 0) => {
  const store = {};
  let calls = 0;
  const setItem = async (k, v) => {
    calls++;
    if (calls <= failTimes) throw new Error('disk');
    store[k] = v;
  };
  return { store, setItem, calls: () => calls };
};
const noSleep = async () => {};

test('пишет последнее значение по порядку', async () => {
  const s = mk();
  const w = createWriter({ setItem: s.setItem, key: 'k', validate: validAppState, sleep: noSleep });
  w.write({ expenses: [1], shifts: [] });
  w.write({ expenses: [2], shifts: [] });
  w.write({ expenses: [3], shifts: [] });
  await w.flush();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(s.store.k).expenses, [3]);
});

test('повторяет при сбое записи', async () => {
  const s = mk(2);
  const errs = [];
  const w = createWriter({ setItem: s.setItem, key: 'k', sleep: noSleep, onError: (e) => errs.push(e) });
  await (w.write({ a: 1 }), w.flush());
  assert.equal(JSON.parse(s.store.k).a, 1);
  assert.deepEqual(errs, []);
  assert.equal(w.failed, false);
});

test('если все попытки не удались — значение не теряется, пишется следующим flush', async () => {
  const s = mk(3);
  const errs = [];
  const w = createWriter({ setItem: s.setItem, key: 'k', sleep: noSleep, onError: (e) => errs.push(e) });
  w.write({ a: 1 });
  await w.flush();
  assert.equal(s.store.k, undefined);
  assert.deepEqual(errs, ['write']);
  assert.ok(w.failed && w.hasPending);
  await w.flush();
  assert.equal(JSON.parse(s.store.k).a, 1);
  assert.equal(w.failed, false);
});

test('битое/пустое состояние не пишется', async () => {
  const s = mk();
  const errs = [];
  const w = createWriter({ setItem: s.setItem, key: 'k', validate: validAppState, sleep: noSleep, onError: (e) => errs.push(e) });
  assert.equal(w.write(null), false);
  assert.equal(w.write([]), false);
  assert.equal(w.write({ expenses: [] }), false);
  await w.flush();
  assert.equal(s.calls(), 0);
  assert.deepEqual(errs, ['invalid', 'invalid', 'invalid']);
});

test('заблокированная запись ничего не пишет', async () => {
  const s = mk();
  const w = createWriter({ setItem: s.setItem, key: 'k', sleep: noSleep });
  w.block(true);
  assert.equal(w.write({ a: 1 }), false);
  await w.flush();
  assert.equal(s.calls(), 0);
});

test('validCalcState', () => {
  assert.ok(validCalcState({ days: {} }));
  assert.ok(!validCalcState({}));
  assert.ok(!validCalcState(null));
});
