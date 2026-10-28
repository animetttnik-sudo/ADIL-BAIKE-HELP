import test from 'node:test';
import assert from 'node:assert/strict';
import { removeExpense, removeShift, restoreRemoved } from '../src/lib/undo.js';

const app = {
  expenses: [{ id: 'a', date: '2026-10-01' }, { id: 'b', date: '2026-10-02' }, { id: 'c', date: '2026-10-03' }],
  shifts: [{ id: 's1', date: '2026-10-01' }, { id: 's2', date: '2026-10-02#2'.slice(0, 10) }],
  removed: ['2026-09-01'],
};

test('удалить расход и отменить — на том же месте', () => {
  const r = removeExpense(app, 'b');
  assert.deepEqual(r.app.expenses.map((x) => x.id), ['a', 'c']);
  const back = restoreRemoved(r.app, r.undo);
  assert.deepEqual(back.expenses, app.expenses);
});

test('удалить смену и отменить — дата убирается из removed', () => {
  const r = removeShift(app, 's1');
  assert.deepEqual(r.app.removed, ['2026-09-01', '2026-10-01']);
  const back = restoreRemoved(r.app, r.undo);
  assert.deepEqual(back.shifts, app.shifts);
  assert.deepEqual(back.removed, ['2026-09-01']);
});

test('дата уже была в removed — отмена её не трогает', () => {
  const a2 = { ...app, removed: ['2026-10-01'] };
  const r = removeShift(a2, 's1');
  assert.deepEqual(restoreRemoved(r.app, r.undo).removed, ['2026-10-01']);
});

test('нет такого id / повторная отмена — без изменений', () => {
  assert.equal(removeExpense(app, 'zz').undo, null);
  const r = removeExpense(app, 'a');
  const once = restoreRemoved(r.app, r.undo);
  assert.equal(restoreRemoved(once, r.undo), once);
  assert.equal(restoreRemoved(app, null), app);
});
