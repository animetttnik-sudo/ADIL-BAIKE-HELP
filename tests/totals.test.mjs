import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carryExpense, carryInState, expensesInPeriod, origDate, paydayOf, paydayTotals, toggledStatus, undoCarry,
} from '../src/lib/totals.js';
import { defaultState, seedMonth, PAYDAYS } from '../src/lib/periods.js';
import { applyImport, previewImport } from '../src/lib/planImport.js';
import { PLAN_BLOCKS, PLAN_ID } from '../src/lib/plan2026.js';

const L = [
  { id: 'a', date: '2026-10-02', amount: 2400, status: 'paid' },
  { id: 'b', date: '2026-10-04', amount: 540, status: null },
  { id: 'c', date: '2026-10-06', amount: 1387 }, // старый формат: без поля status
  { id: 'd', date: '2026-10-13', amount: 1350, status: 'missed' }, // старый ✕ — считается неоплаченным
  { id: 'e', date: '2026-10-16', amount: 10000, status: null }, // уже следующая зарплата
];

test('расходы под зарплатой: [зарплата, следующая зарплата)', () => {
  assert.deepEqual(expensesInPeriod(L, '2026-10-02').map((e) => e.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(expensesInPeriod(L, '2026-10-16').map((e) => e.id), ['e']);
});

test('итоги: «не оплачено» = сумма неотмеченных; ✓ её уменьшает; старый missed = не оплачен', () => {
  const list = expensesInPeriod(L, '2026-10-02');
  assert.deepEqual(paydayTotals(list, 5000), { planned: 5677, paid: 2400, unpaid: 3277, open: 3, free: -677, earned: 5000 });
  const t2 = paydayTotals(list.map((e) => (e.id === 'b' ? { ...e, status: 'paid' } : e)));
  assert.equal(t2.unpaid, 2737);
  const all = paydayTotals(list.map((e) => ({ ...e, status: 'paid' })));
  assert.equal(all.unpaid, 0);
  assert.equal(all.open, 0);
  assert.deepEqual(paydayTotals([]), { planned: 0, paid: 0, unpaid: 0, open: 0, free: 0, earned: 0 });
});

test('тап по кнопке: пусто → ✓ → пусто, старый ✕ → ✓', () => {
  assert.equal(toggledStatus(null), 'paid');
  assert.equal(toggledStatus(undefined), 'paid');
  assert.equal(toggledStatus('paid'), null);
  assert.equal(toggledStatus('missed'), 'paid');
});

test('«Не плачу»: перенос на следующую зарплату, повторный — дальше; id и исходная дата сохраняются', () => {
  const e = { id: 'x', date: '2026-09-21', amount: 1385, title: 'О!Банк', type: 'recurring', status: 'paid' };
  assert.equal(paydayOf(e.date), '2026-09-18');
  const m1 = carryExpense(e);
  assert.deepEqual(m1, { ...e, date: '2026-10-05', status: null, movedFrom: '2026-09-21', moves: 1 });
  assert.equal(paydayOf(m1.date), '2026-10-02');
  const m2 = carryExpense(m1);
  assert.equal(m2.date, '2026-10-19');
  assert.equal(paydayOf(m2.date), '2026-10-16');
  assert.equal(m2.movedFrom, '2026-09-21');
  assert.equal(m2.moves, 2);
  assert.equal(origDate(m2), '2026-09-21');
  // каждая зарплата из расписания: перенос попадает ровно в следующую
  for (let i = 0; i + 1 < PAYDAYS.length; i++) {
    for (const off of [0, 13]) {
      const d = carryExpense({ id: 'y', date: new Date(Date.parse(PAYDAYS[i]) + off * 864e5).toISOString().slice(0, 10) });
      assert.equal(paydayOf(d.date), PAYDAYS[i + 1]);
    }
  }
  // за последней зарплатой расписания — всё равно +14 дней, группа считается по запасной схеме
  const last = PAYDAYS.at(-1);
  const after = carryExpense({ id: 'z', date: last });
  assert.equal(expensesInPeriod([after], last).length, 0);
});

test('«Отменить» возвращает расход как был; удалённый не воскрешает', () => {
  const app = defaultState();
  const id = app.expenses.find((e) => e.date === '2026-09-18').id;
  const { state, prev, next } = carryInState(app, id);
  assert.equal(next.date, '2026-10-02');
  assert.deepEqual(undoCarry(state, prev).expenses, app.expenses);
  const gone = { ...state, expenses: state.expenses.filter((e) => e.id !== id) };
  assert.equal(undoCarry(gone, prev), gone);
  assert.equal(carryInState(app, 'nope').state, app);
});

test('перенос не ломает досев постоянных и повторный импорт плана', () => {
  // постоянный О!Банк 7 окт перенесли на 21 окт — октябрь не досевает его заново
  let app = seedMonth(defaultState(), 2026, 9);
  const ob = app.expenses.find((e) => e.date === '2026-10-07' && e.title === 'О!Банк');
  app = carryInState(app, ob.id).state;
  assert.equal(seedMonth(app, 2026, 9), app);
  // импорт плана, перенос пункта (дважды), повторный импорт ничего не добавляет
  let n = 0;
  let pl = applyImport(defaultState(), PLAN_BLOCKS, () => `p${++n}`, PLAN_ID);
  const it = pl.expenses.find((e) => e.src === 'plan' && e.date.startsWith('2026-11'));
  pl = carryInState(carryInState(pl, it.id).state, it.id).state;
  assert.equal(previewImport(pl, PLAN_BLOCKS).add.length, 0);
});

test('карточка: ✓ на всё → «Всё оплачено», снятие ✓ (тапом или «Без отметки») → снова красный «−X», многократно', async () => {
  const { summaryView } = await import('../src/lib/totals.js');
  const base = [
    { id: 'a', date: '2026-10-30', amount: 1387, status: null },
    { id: 'b', date: '2026-11-04', amount: 5667 }, // без поля status
  ];
  const nb = (s) => s.replace(/\s/g, ' ');
  let list = base;
  const view = () => summaryView(paydayTotals(list, 10000));
  const set = (id, status) => {
    list = list.map((e) => (e.id === id ? { ...e, status } : e));
  };
  const tap = (id) => set(id, toggledStatus(list.find((e) => e.id === id).status)); // тап по кнопке
  let v = view();
  assert.equal(v.mode, 'due');
  assert.equal(nb(v.big), '−7 054');
  assert.equal(v.bigTone, 'bad');
  assert.equal(v.progress, 0);
  for (let round = 0; round < 3; round++) {
    tap('a');
    tap('b');
    v = view();
    assert.deepEqual([v.mode, v.big, v.bigTone, v.tag, v.progress], ['done', 'Всё оплачено', 'good', 'всё оплачено', 1]);
    // снять ✓ — по очереди тапом и веером «Без отметки» (null)
    if (round % 2) tap('b');
    else set('b', null);
    v = view();
    assert.equal(v.mode, 'due');
    assert.equal(nb(v.big), '−5 667');
    assert.equal(v.bigTone, 'bad');
    assert.equal(v.sub, 'не оплачено · 1 платёж');
    assert.equal(v.tag, 'хватает');
    assert.ok(Math.abs(v.progress - 1387 / 7054) < 1e-9);
    tap('a');
    v = view();
    assert.equal(nb(v.big), '−7 054');
    assert.equal(v.progress, 0);
  }
  // старое «не оплатил вовремя» тоже снимает «всё оплачено»
  list = base.map((e) => ({ ...e, status: 'paid' }));
  assert.equal(view().mode, 'done');
  set('a', 'missed');
  assert.equal(nb(view().big), '−1 387');
  assert.equal(summaryView(paydayTotals([])).mode, 'empty');
  assert.equal(summaryView(paydayTotals(base, 1000)).tag, 'не хватает');
});
