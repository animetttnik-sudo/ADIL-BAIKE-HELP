// Долгое нажатие на расход: сделать постоянным / одноразовым, поправить «до»
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedMonth } from '../src/lib/periods.js';
import { defaultState } from './fixtureState.mjs';
import { addRecurring, editRecurring, isRecurringExpense, makeOneTime, makeRecurring, untilOfExpense } from '../src/lib/recurring.js';

let n = 0;
const id = () => `r${++n}`;
const base = () => ({ ...defaultState(), expenses: [{ id: 'e1', date: '2026-11-05', amount: 700, title: 'Связь', status: null }], recurring: [] });
const svyaz = (app) => app.expenses.filter((e) => e.title === 'Связь').map((e) => e.date).sort();

test('одноразовый → постоянный: тот же расход, следующие месяцы досеваются до даты', () => {
  let app = makeRecurring(base(), 'e1', { date: '2026-11-05', amount: 750, title: 'Связь', untilDate: '2027-01-31' }, id);
  const e = app.expenses.find((x) => x.id === 'e1');
  assert.equal(e.amount, 750);
  assert.equal(e.type, 'recurring');
  assert.ok(isRecurringExpense(app, e));
  assert.equal(untilOfExpense(app, e, 'x'), '2027-01-31');
  for (const [y, m] of [[2026, 11], [2027, 0], [2027, 1]]) app = seedMonth(app, y, m);
  assert.deepEqual(svyaz(app), ['2026-11-05', '2026-12-05', '2027-01-05']);
  assert.equal(app.expenses.length, 3);
});

test('постоянный → одноразовый: будущие неоплаченные убираются, правило снято, прошлые/оплаченные остаются', () => {
  let app = addRecurring({ ...defaultState(), expenses: [], recurring: [] }, { date: '2026-10-05', amount: 700, title: 'Связь', untilDate: '2027-03-31' }, id);
  for (const [y, m] of [[2026, 10], [2026, 11], [2027, 0]]) app = seedMonth(app, y, m);
  const nov = app.expenses.find((e) => e.date === '2026-11-05');
  app = { ...app, expenses: app.expenses.map((e) => (e.date === '2027-01-05' ? { ...e, status: 'paid' } : e)) };
  app = makeOneTime(app, nov.id, { date: '2026-11-05', amount: 700, title: 'Связь' });
  assert.deepEqual(svyaz(app), ['2026-10-05', '2026-11-05', '2027-01-05']);
  assert.equal(app.recurring.length, 0);
  const one = app.expenses.find((e) => e.id === nov.id);
  assert.equal(one.rid, undefined);
  assert.equal(one.type, undefined);
  assert.equal(isRecurringExpense(app, one), false);
  // досев больше ничего не добавляет
  assert.deepEqual(svyaz(seedMonth(app, 2027, 1)), svyaz(app));
});

test('постоянный остаётся: правка суммы этого и даты «до» у правила', () => {
  let app = addRecurring({ ...defaultState(), expenses: [], recurring: [] }, { date: '2026-11-10', amount: 900, title: 'Интернет', untilDate: '2027-05-01' }, id);
  const e = app.expenses[0];
  app = editRecurring(app, e.id, { date: '2026-11-10', amount: 950, title: 'Интернет', untilDate: '2026-12-31' });
  assert.equal(app.expenses[0].amount, 950);
  assert.equal(app.recurring[0].untilDate, '2026-12-31');
  app = seedMonth(seedMonth(app, 2026, 11), 2027, 0);
  assert.equal(app.expenses.filter((x) => x.title === 'Интернет').length, 2);
});

test('нет такого id — без изменений', () => {
  const a = base();
  assert.equal(makeRecurring(a, 'nope', { date: '2026-11-05', amount: 1, title: 'x' }, id), a);
  assert.equal(makeOneTime(a, 'nope', { date: '2026-11-05', amount: 1, title: 'x' }), a);
  assert.equal(isRecurringExpense(a, a.expenses[0]), false);
});
