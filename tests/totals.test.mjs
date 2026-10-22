import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carryExpense, carryInState, expensesInPeriod, monthTotals, monthView, origDate, paydayOf, paydayTotals, summaryView,
  toggledStatus, undoCarry, defaultPayday, shouldAutoAdvance, pagerRange, paydayMode,
  toggleInState,
} from '../src/lib/totals.js';
import { defaultState, seedMonth, seedPaydays, PAYDAYS, ANCHOR } from '../src/lib/periods.js';
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

test('итоги зарплаты: всего / оплачено / остаток; старый missed = не оплачен', () => {
  const list = expensesInPeriod(L, '2026-10-02');
  assert.deepEqual(paydayTotals(list, 5000), { total: 5677, paid: 2400, remaining: 3277, count: 4, open: 3, earned: 5000 });
  assert.deepEqual(paydayTotals([]), { total: 0, paid: 0, remaining: 0, count: 0, open: 0, earned: 0 });
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

test('постоянных платежей больше нет: досев не добавляет расходы; перенос не ломает повторный импорт', () => {
  const base = defaultState();
  assert.equal(seedMonth(base, 2026, 9).expenses.length, base.expenses.length);
  // старые сохранения с правилами recurring тоже ничего не досевают
  const old = { ...base, recurring: [{ id: 'r', title: 'О!Банк', amount: 1387, day: 7 }] };
  assert.equal(seedMonth(old, 2026, 9).expenses.length, base.expenses.length);
  // импорт плана, перенос пункта (дважды), повторный импорт ничего не меняет
  let n = 0;
  let pl = applyImport(defaultState(), PLAN_BLOCKS, () => `p${++n}`, PLAN_ID);
  const it = pl.expenses.find((e) => e.src === 'plan' && e.date.startsWith('2026-11'));
  pl = carryInState(carryInState(pl, it.id).state, it.id).state;
  assert.equal(previewImport(pl, PLAN_BLOCKS).changes, 0);
});

const nb = (s) => s.replace(/\s/g, ' ');

test('карточка: тики/снятия/перенос — «Оплачено» растёт, «−остаток» тает, «Всё оплачено», снятие возвращает минус', () => {
  let app = {
    expenses: [
      { id: 'a', date: '2026-10-30', amount: 1387, status: null },
      { id: 'b', date: '2026-11-04', amount: 5667 }, // без поля status
      { id: 'c', date: '2026-11-07', amount: 1000, status: null },
      { id: 'n', date: '2026-11-13', amount: 500, status: null }, // следующая зарплата
    ],
  };
  const P = '2026-10-30';
  const view = () => summaryView(paydayTotals(expensesInPeriod(app.expenses, P), 9000));
  const set = (id, status) => {
    app = { ...app, expenses: app.expenses.map((e) => (e.id === id ? { ...e, status } : e)) };
  };
  const tap = (id) => set(id, toggledStatus(app.expenses.find((e) => e.id === id).status));
  let v = view();
  assert.deepEqual([v.mode, nb(v.big), v.bigTone, nb(v.total), v.paid, v.tag], ['due', '−8 054', 'bad', '8 054', '0', '3 не оплачены']);
  tap('a');
  v = view();
  assert.deepEqual([nb(v.big), nb(v.paid), nb(v.total)], ['−6 667', '1 387', '8 054']);
  // «Не плачу» на c: уходит в следующую зарплату целиком — здесь не считается вовсе
  app = carryInState(app, 'c').state;
  v = view();
  assert.deepEqual([nb(v.big), nb(v.total), v.tag], ['−5 667', '7 054', '1 не оплачен']);
  const next = paydayTotals(expensesInPeriod(app.expenses, '2026-11-13'));
  assert.deepEqual([next.total, next.remaining, next.count], [1500, 1500, 2]);
  for (let round = 0; round < 3; round++) {
    tap('b');
    v = view();
    assert.deepEqual([v.mode, v.big, v.bigTone, v.tag, v.progress], ['done', 'Всё оплачено', 'good', 'всё оплачено', 1]);
    if (round % 2) tap('b');
    else set('b', null); // веер «Без отметки»
    v = view();
    assert.deepEqual([v.mode, nb(v.big), v.bigTone], ['due', '−5 667', 'bad']);
    assert.ok(Math.abs(v.progress - 1387 / 7054) < 1e-9);
  }
  set('a', 'missed'); // старое «не оплатил вовремя» — тоже не оплачено
  assert.equal(nb(view().big), '−7 054');
  assert.equal(view().earned !== null, true);
  assert.equal(summaryView(paydayTotals([])).mode, 'empty');
});

test('месяц = сумма его зарплат по тем же правилам; перенос из последней зарплаты месяца уходит из месяца', () => {
  let app = {
    expenses: [
      { id: '1', date: '2026-10-02', amount: 2400, status: 'paid' },
      { id: '2', date: '2026-10-07', amount: 1387, status: null },
      { id: '3', date: '2026-10-16', amount: 10000, status: null },
      { id: '4', date: '2026-10-21', amount: 1385, status: 'paid' },
      { id: '5', date: '2026-10-30', amount: 1000, status: null },
      { id: '6', date: '2026-11-04', amount: 500, status: null }, // зарплата 30 окт — входит в октябрь
      { id: '7', date: '2026-09-30', amount: 999, status: null }, // зарплата 18 сен — не октябрь
    ],
  };
  const oct = ['2026-10-02', '2026-10-16', '2026-10-30'];
  let m = monthTotals(app.expenses, oct);
  assert.deepEqual([m.total, m.paid, m.remaining, m.count, m.open], [16672, 3785, 12887, 6, 4]);
  assert.deepEqual(m.per.map((t) => t.total), [3787, 11385, 1500]);
  let mv = monthView(m);
  assert.deepEqual([nb(mv.rest), mv.restTone], ['−12 887', 'bad']);
  // перенос внутри месяца — сумма месяца не меняется, меняется распределение
  app = carryInState(app, '2').state;
  m = monthTotals(app.expenses, oct);
  assert.equal(m.total, 16672);
  assert.deepEqual(m.per.map((t) => t.total), [2400, 12772, 1500]);
  // перенос из последней зарплаты месяца — уходит в ноябрь
  app = carryInState(app, '6').state;
  m = monthTotals(app.expenses, oct);
  assert.equal(m.total, 16172);
  // всё отметили
  app = { expenses: app.expenses.map((e) => ({ ...e, status: 'paid' })) };
  mv = monthView(monthTotals(app.expenses, oct));
  assert.deepEqual([mv.rest, mv.restTone, mv.progress], ['всё оплачено', 'good', 1]);
});

test('какую зарплату показать по умолчанию', () => {
  const today = '2026-10-22'; // период зарплаты 16 октября
  // в текущей есть неотмеченные → она
  let ex = [
    { id: '1', date: '2026-10-17', amount: 100, status: null },
    { id: '2', date: '2026-10-31', amount: 100, status: null },
  ];
  assert.equal(defaultPayday(ex, today), '2026-10-16');
  // текущая вся оплачена → ближайшая с неотмеченными (будущая раньше прошлой)
  ex = [
    { id: '0', date: '2026-10-05', amount: 100, status: null },
    { id: '1', date: '2026-10-17', amount: 100, status: 'paid' },
    { id: '2', date: '2026-10-31', amount: 100, status: null },
  ];
  assert.equal(defaultPayday(ex, today), '2026-10-30');
  // будущих нет — прошлая с долгом
  assert.equal(defaultPayday(ex.slice(0, 2), today), '2026-10-02');
  // ничего не отмечено нигде, текущая оплачена → следующая
  assert.equal(defaultPayday([ex[1]], today), '2026-10-30');
  // пусто → текущая
  assert.equal(defaultPayday([], today), '2026-10-16');
  // в день зарплаты — эта зарплата
  assert.equal(defaultPayday([], '2026-10-30'), '2026-10-30');
  // старый ✕ считается неоплаченным
  assert.equal(defaultPayday([{ id: 'm', date: '2026-10-20', amount: 5, status: 'missed' }], today), '2026-10-16');
});

test('автопереход: только due → done на той же зарплате', () => {
  const P = '2026-10-16';
  let app = {
    expenses: [
      { id: 'a', date: '2026-10-17', amount: 100, status: 'paid' },
      { id: 'b', date: '2026-10-20', amount: 200, status: null },
    ],
  };
  const snap = () => ({ payday: P, mode: paydayMode(app.expenses, P) });
  let prev = snap();
  assert.equal(prev.mode, 'due');
  // последний ✓ → переход
  app = { expenses: app.expenses.map((e) => ({ ...e, status: 'paid' })) };
  let next = snap();
  assert.equal(shouldAutoAdvance(prev, next), true);
  // сняли ✓ в паузе → done → due, перехода нет
  prev = next;
  app = { expenses: app.expenses.map((e) => (e.id === 'b' ? { ...e, status: null } : e)) };
  next = snap();
  assert.equal(shouldAutoAdvance(prev, next), false);
  // просто листаем на уже оплаченную зарплату — нет
  assert.equal(shouldAutoAdvance({ payday: '2026-10-02', mode: 'due' }, { payday: P, mode: 'done' }), false);
  assert.equal(shouldAutoAdvance(null, { payday: P, mode: 'done' }), false);
  // done → done (правка суммы) — нет; перенос последнего → пусто — нет
  assert.equal(shouldAutoAdvance({ payday: P, mode: 'done' }, { payday: P, mode: 'done' }), false);
  app = { expenses: [{ id: 'z', date: '2026-10-20', amount: 5, status: null }] };
  prev = snap();
  app = carryInState(app, 'z').state;
  assert.equal(shouldAutoAdvance(prev, snap()), false);
  // перенос последнего неотмеченного, когда остальные оплачены → всё оплачено → переход
  app = { expenses: [{ id: 'p', date: '2026-10-17', amount: 5, status: 'paid' }, { id: 'z', date: '2026-10-20', amount: 5, status: null }] };
  prev = snap();
  app = carryInState(app, 'z').state;
  assert.equal(shouldAutoAdvance(prev, snap()), true);
});

test('границы листания и досев месяцев страниц', () => {
  const r = pagerRange([], ANCHOR);
  assert.equal(PAYDAYS[r.lo], ANCHOR);
  assert.equal(r.hi, PAYDAYS.length - 1);
  assert.equal(PAYDAYS[pagerRange([{ date: '2026-08-25' }], ANCHOR).lo], '2026-08-21');
  const base = defaultState();
  const s = seedPaydays(base, ['2026-10-30']); // период 30 окт – 12 ноя: октябрь и ноябрь
  assert.equal(s.expenses.length, base.expenses.length); // постоянных платежей больше нет — расходы не досеваются
  assert.equal(seedPaydays(s, ['2026-10-30']), s); // повторно — тот же объект
});

test('тап по ✓: переключение, без лишних перерисовок, автопереход только на последнем', () => {
  const p = '2026-10-16';
  let app = { expenses: [
    { id: 'a', date: '2026-10-17', amount: 10, status: null },
    { id: 'b', date: '2026-10-20', amount: 5, status: 'missed' },
  ] };
  assert.equal(toggleInState(app, 'nope'), app);
  assert.equal(toggleInState(null, 'a'), null);
  assert.equal(toggleInState({}, 'a').expenses, undefined);
  const snap = () => ({ payday: p, mode: paydayMode(app.expenses, p) });
  let prev = snap();
  app = toggleInState(app, 'a');
  assert.equal(app.expenses[0].status, 'paid');
  assert.equal(shouldAutoAdvance(prev, snap()), false);
  prev = snap();
  app = toggleInState(app, 'b'); // legacy 'missed' → ✓
  assert.equal(app.expenses[1].status, 'paid');
  assert.equal(shouldAutoAdvance(prev, snap()), true);
  prev = snap();
  app = toggleInState(app, 'b'); // снятие ✓ — обратно «к оплате», без перехода
  assert.equal(app.expenses[1].status, null);
  assert.equal(shouldAutoAdvance(prev, snap()), false);
});
