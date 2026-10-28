import test from 'node:test';
import assert from 'node:assert/strict';
import { monthStats, monthAvg } from '../src/lib/analysis.js';

const paid = (x) => x.status === 'paid';

test('Анализ: пустые досеянные месяцы не показываются', () => {
  const M = monthStats(
    {
      shifts: [
        { date: '2026-10-03', title: 'ночь касса', amount: 2000 },
        { date: '2026-10-04', title: 'ночь касса', amount: 1000, shortage: 200 },
        { date: '2026-12-05', title: 'ночь касса', amount: null },
        { date: '2027-01-05', title: 'ночь касса', amount: null },
      ],
      expenses: [
        { date: '2026-11-02', amount: 500, status: 'paid' },
        { date: '2026-11-03', amount: 700, status: null },
      ],
    },
    paid
  );
  assert.deepEqual(Object.keys(M).sort(), ['2026-10', '2026-11']);
  assert.equal(M['2026-10'].e, 2800);
  assert.equal(M['2026-10'].n, 2);
  assert.equal(monthAvg(M['2026-10']), 1500);
  assert.equal(M['2026-11'].s, 500);
  assert.equal(monthAvg(M['2026-11']), 0);
});

test('Анализ: пустое состояние и битые записи', () => {
  assert.deepEqual(monthStats(null, paid), {});
  assert.deepEqual(monthStats({ shifts: [null, { date: 5 }], expenses: [null] }, paid), {});
});
