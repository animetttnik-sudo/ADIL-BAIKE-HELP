import test from 'node:test';
import assert from 'node:assert/strict';
import { repeatShiftDraft } from '../src/lib/repeatShift.js';
import { workPeriod } from '../src/lib/periods.js';

const P = '2026-11-13';
const per = workPeriod(P); // 2026-10-24 … 2026-11-06

test('название/место — как у последней прошедшей смены, дата — следующий день', () => {
  const shifts = [
    { id: 1, date: '2026-10-24', title: 'день рядовой', place: 'А' },
    { id: 2, date: '2026-10-25', title: 'ночь касса', place: 'Б' },
    { id: 3, date: '2026-12-01', title: 'будущая', place: '' },
  ];
  const d = repeatShiftDraft(shifts, P, per.start, '2026-10-28');
  assert.deepEqual(d, { date: '2026-10-26', title: 'ночь касса', place: 'Б' });
});

test('занятые дни пропускаются; период кончился — запасная дата', () => {
  const shifts = [
    { id: 1, date: '2026-11-05', title: 'ночь касса' },
    { id: 2, date: '2026-11-06', title: 'ночь касса', source: 'calc' },
  ];
  assert.equal(repeatShiftDraft(shifts, P, 'FB', '2026-11-10').date, 'FB');
  const s2 = [{ id: 1, date: '2026-11-03', title: 'x' }, { id: 2, date: '2026-11-04', title: 'y', source: 'calc' }];
  assert.equal(repeatShiftDraft(s2, P, 'FB', '2026-11-10').date, '2026-11-05');
});

test('нет своих смен — null', () => {
  assert.equal(repeatShiftDraft([], P, 'FB', '2026-11-10'), null);
  assert.equal(repeatShiftDraft([{ date: '2026-11-01', title: 'a', source: 'calc' }], P, 'FB', '2026-11-10'), null);
});
