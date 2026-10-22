import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expensesInPeriod, paydayTotals, toggledStatus } from '../src/lib/totals.js';

const L = [
  { id: 'a', date: '2026-10-02', amount: 2400, status: 'paid' },
  { id: 'b', date: '2026-10-04', amount: 540, status: null },
  { id: 'c', date: '2026-10-06', amount: 1387 }, // старый формат: без поля status
  { id: 'd', date: '2026-10-13', amount: 1350, status: 'missed' },
  { id: 'e', date: '2026-10-16', amount: 10000, status: null }, // уже следующая зарплата
];

test('расходы под зарплатой: [зарплата, следующая зарплата)', () => {
  assert.deepEqual(expensesInPeriod(L, '2026-10-02').map((e) => e.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(expensesInPeriod(L, '2026-10-16').map((e) => e.id), ['e']);
});

test('итоги: ✓ уменьшает «осталось», ✕ исключается из плана', () => {
  const list = expensesInPeriod(L, '2026-10-02');
  const t = paydayTotals(list, 5000);
  assert.deepEqual(t, { planned: 4327, paid: 2400, remaining: 1927, cancelled: 1350, open: 2, free: 673, earned: 5000 });
  // поставили ✓ на b — большая цифра меняется
  const t2 = paydayTotals(list.map((e) => (e.id === 'b' ? { ...e, status: 'paid' } : e)), 5000);
  assert.equal(t2.remaining, 1387);
  assert.equal(t2.paid, 2940);
  // ✕ на c — уходит из плана
  const t3 = paydayTotals(list.map((e) => (e.id === 'c' ? { ...e, status: 'missed' } : e)), 5000);
  assert.equal(t3.planned, 2940);
  assert.equal(t3.remaining, 540);
  // всё оплачено
  const t4 = paydayTotals(list.map((e) => (e.status === 'missed' ? e : { ...e, status: 'paid' })));
  assert.equal(t4.remaining, 0);
  assert.equal(t4.open, 0);
  assert.deepEqual(paydayTotals([]), { planned: 0, paid: 0, remaining: 0, cancelled: 0, open: 0, free: 0, earned: 0 });
});

test('тап по кнопке: пусто → ✓ → пусто, ✕ → ✓', () => {
  assert.equal(toggledStatus(null), 'paid');
  assert.equal(toggledStatus(undefined), 'paid');
  assert.equal(toggledStatus('paid'), null);
  assert.equal(toggledStatus('missed'), 'paid');
});
