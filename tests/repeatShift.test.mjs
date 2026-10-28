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

test('конец периода занят — первый свободный день периода, а не занятый', () => {
  const shifts = [
    { id: 1, date: per.start, title: 'ночь касса' },
    { id: 2, date: '2026-11-06', title: 'ночь касса' },
  ];
  // запасная дата = начало периода, но оно занято
  assert.equal(repeatShiftDraft(shifts, P, per.start, '2026-11-10').date, '2026-10-25');
});

test('последняя в периоде — смена из расчёта: следующий день после неё', () => {
  const shifts = [
    { id: 1, date: '2026-10-01', title: 'ночь касса' },
    { id: 2, date: '2026-10-24', title: 'день касса', source: 'calc' },
  ];
  assert.equal(repeatShiftDraft(shifts, P, per.start, '2026-10-26').date, '2026-10-25');
});

test('весь период занят — запасная дата', () => {
  const shifts = [];
  for (let d = per.start, i = 0; d <= per.end; i++) {
    shifts.push({ id: i, date: d, title: 'x' });
    const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); d = dt.toISOString().slice(0, 10);
  }
  assert.equal(repeatShiftDraft(shifts, P, 'FB', '2026-11-10').date, 'FB');
});
