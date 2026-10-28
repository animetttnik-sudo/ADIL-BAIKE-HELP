import test from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, filterExpenses, filterShifts, filterCounts } from '../src/lib/listView.js';

test('dueLabel', () => {
  const T = '2026-10-29';
  assert.equal(dueLabel({ date: T, amount: 100 }, T), 'к оплате сегодня');
  assert.equal(dueLabel({ date: '2026-10-20', amount: 100 }, T), 'не оплачено');
  assert.equal(dueLabel({ date: '2026-10-01', amount: 100 }, T), null); // давно — без шума
  assert.equal(dueLabel({ date: '2026-11-01', amount: 100 }, T), null); // будущее
  assert.equal(dueLabel({ date: T, amount: 100, status: 'paid' }, T), null);
  assert.equal(dueLabel({ date: T, amount: '' }, T), null);
  assert.equal(dueLabel(null, T), null);
});

test('фильтры', () => {
  const ex = [{ status: 'paid' }, { status: null }, {}, { status: 'paid' }];
  assert.equal(filterExpenses(ex, 'unpaid').length, 2);
  assert.equal(filterExpenses(ex, 'all'), ex);
  assert.deepEqual(filterCounts(ex, 'expenses'), { total: 4, part: 2, show: true });
  const sh = [{ amount: null }, { amount: 100 }, { amount: '' , source: 'calc' }, { amount: 5 }];
  assert.equal(filterShifts(sh, 'nosum').length, 1);
  assert.equal(filterCounts(sh, 'shifts').show, true);
  assert.equal(filterCounts(sh.slice(0, 2), 'shifts').show, false);
  assert.equal(filterCounts([{ status: 'paid' }, { status: 'paid' }, { status: 'paid' }, { status: 'paid' }], 'expenses').show, false);
});
