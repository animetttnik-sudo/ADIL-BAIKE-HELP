// Постоянные платежи: правило «каждое это число до даты», досев без дублей, удаление серии
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, seedMonth, normalizeApp } from '../src/lib/periods.js';
import { addRecurring, removeSeries, seriesToRemove } from '../src/lib/recurring.js';
import { restoreRemoved } from '../src/lib/undo.js';
import { autoAddedRecurring } from '../src/lib/planImport.js';

let n = 0;
const id = () => `x${++n}`;
const base = () => ({ ...defaultState(), expenses: [], recurring: [] });
const wifi = (app) => app.expenses.filter((e) => e.title === 'Интернет');

test('правило + первый расход; досев в следующих месяцах до untilDate, без дублей', () => {
  let app = addRecurring(base(), { date: '2026-11-13', amount: 900, title: 'Интернет', untilDate: '2027-02-20' }, id);
  assert.equal(wifi(app).length, 1);
  assert.equal(app.recurring[0].dayOfMonth, 13);
  for (const [y, m] of [[2026, 10], [2026, 11], [2027, 0], [2027, 1], [2027, 2], [2026, 9]]) app = seedMonth(app, y, m);
  assert.deepEqual(wifi(app).map((e) => e.date).sort(), ['2026-11-13', '2026-12-13', '2027-01-13', '2027-02-13']);
  // повторный досев ничего не добавляет
  const again = seedMonth(seedMonth(app, 2026, 11), 2027, 0);
  assert.equal(wifi(again).length, 4);
  assert.ok(wifi(app).every((e) => e.type === 'recurring' && e.status === null));
});

test('31-е в коротком месяце → последний день; ручной такой же платёж не дублируется; удалённый не возвращается', () => {
  let app = addRecurring(base(), { date: '2027-01-31', amount: 500, title: 'Связь', untilDate: '2027-12-31' }, id);
  app = seedMonth(app, 2027, 1);
  assert.ok(app.expenses.some((e) => e.date === '2027-02-28' && e.title === 'Связь'));
  app = { ...app, expenses: [...app.expenses, { id: 'man', date: '2027-03-29', amount: 500, title: 'связь', status: 'paid' }] };
  app = seedMonth(app, 2027, 2);
  assert.equal(app.expenses.filter((e) => e.date.startsWith('2027-03')).length, 1);
  const feb = app.expenses.find((e) => e.date === '2027-02-28');
  app = { ...app, expenses: app.expenses.filter((e) => e !== feb) };
  assert.equal(seedMonth(app, 2027, 1).expenses.length, app.expenses.length);
});

test('удаление: этот + следующие неоплаченные, правило снято; оплаченные прошлые остаются; отмена', () => {
  let app = addRecurring(base(), { date: '2026-11-05', amount: 100, title: 'Интернет', untilDate: '2027-06-01' }, id);
  for (const m of [11, 0, 1, 2]) app = seedMonth(app, m === 11 ? 2026 : 2027, m);
  app = { ...app, expenses: app.expenses.map((e) => (e.date === '2026-11-05' ? { ...e, status: 'paid' } : e)) };
  const dec = wifi(app).find((e) => e.date === '2026-12-05');
  assert.equal(seriesToRemove(app, dec.id).length, 4);
  const { app: next, undo } = removeSeries(app, dec.id);
  assert.deepEqual(wifi(next).map((e) => e.date), ['2026-11-05']);
  assert.equal(next.recurring.length, 0);
  assert.equal(seedMonth(next, 2027, 4).expenses.length, next.expenses.length);
  const back = restoreRemoved(next, undo);
  assert.equal(wifi(back).length, 5);
  assert.equal(back.recurring.length, 1);
});

test('старые сейвы: правила без untilDate ничего не досевают, recurring не массив — грузится', () => {
  const old = { ...defaultState(), recurring: [{ id: 'r', title: 'О!Банк', amount: 1387, day: 7 }] };
  assert.equal(seedMonth(old, 2026, 11).expenses.length, old.expenses.length);
  const weird = normalizeApp({ ...defaultState(), recurring: 'x' });
  assert.equal(seedMonth(weird, 2026, 11).expenses.length, weird.expenses.length);
  // «Удалить автодобавленные» не трогает новые постоянные
  const app = addRecurring(base(), { date: '2026-11-07', amount: 1387, title: 'О!Банк', untilDate: '2027-01-01' }, id);
  assert.equal(autoAddedRecurring(app).length, 0);
  // старый постоянный без rid: удаление снимает следующие такие же неоплаченные и старое правило
  const st = defaultState();
  const o = { ...st, recurring: [{ id: 'r', title: 'О!Банк', amount: 1385, day: 21 }], expenses: [...st.expenses, { id: 'o2', date: '2026-10-21', amount: 1385, title: 'О!Банк', type: 'recurring', status: null }] };
  const first = o.expenses.find((e) => e.date === '2026-09-21' && e.title === 'О!Банк');
  const r = removeSeries(o, first.id).app;
  assert.ok(!r.expenses.some((e) => e.title === 'О!Банк' && e.amount === 1385));
  assert.equal(r.recurring.length, 0);
});
