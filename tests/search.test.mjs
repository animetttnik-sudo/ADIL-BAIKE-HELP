import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems, paydayIndexFor } from '../src/lib/search.js';
import { PAYDAYS, workPeriod } from '../src/lib/periods.js';

const ex = [
  { id: 1, date: '2026-09-07', title: 'О!Банк', amount: 1387 },
  { id: 2, date: '2026-10-13', title: 'Вайфай', amount: 1350 },
  { id: 3, date: '2026-09-13', title: 'вайфай', amount: 1350 },
  { id: 4, date: '2026-10-01', title: 'Ёлка', amount: 500 },
  null,
];

test('поиск по названию без регистра, новые сверху', () => {
  assert.deepEqual(searchItems(ex, 'ВАЙ').map((x) => x.id), [2, 3]);
  assert.deepEqual(searchItems(ex, 'елка').map((x) => x.id), [4]);
});
test('поиск по сумме', () => {
  assert.deepEqual(searchItems(ex, '1 387').map((x) => x.id), [1]);
  assert.deepEqual(searchItems(ex, '135').map((x) => x.id), [2, 3]);
});
test('пустой запрос — пусто', () => {
  assert.deepEqual(searchItems(ex, '  '), []);
});
test('страница зарплаты для найденного', () => {
  const k = paydayIndexFor('expense', PAYDAYS[10]);
  assert.equal(k, 10);
  assert.equal(paydayIndexFor('expense', '2026-09-05'), PAYDAYS.indexOf('2026-09-04'));
  const p = PAYDAYS[12];
  assert.equal(paydayIndexFor('shift', workPeriod(p).start), 12);
  assert.equal(paydayIndexFor('shift', workPeriod(p).end), 12);
  assert.equal(paydayIndexFor('shift', 'xx'), -1);
});
