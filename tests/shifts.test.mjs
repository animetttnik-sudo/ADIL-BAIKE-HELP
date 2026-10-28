// «Смены» по зарплатам, недостача, связь с «Расчётом»
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  shiftsInPeriod, shiftTotals, shortageOf, shiftNet, withShortage, netForPayday, upcomingPayday, shiftPayday, shiftPagerRange,
} from '../src/lib/shifts.js';
import { syncCalcShifts, calcPayForDay } from '../src/lib/link.js';
import { DEFAULT_RATES } from '../src/lib/calc.js';
import {
  PAYDAYS, ANCHOR, workPeriod, paydayForDate, addDays, defaultState, normalizeApp, seedShiftPaydays,
} from '../src/lib/periods.js';

let n = 0;
const mkId = () => `s${++n}`;
const day = (counts, extra = {}) => ({ counts, staff: 3, role: 'kass', time: 'night', mentor: false, stops: false, ...extra });
const calcOf = (days) => ({ rates: { ...DEFAULT_RATES }, days });
const sync = (app, calc) => syncCalcShifts(app, calc, paydayForDate, mkId);

test('группировка: смена d → зарплата p, если d ∈ [p−20, p−7]; каждая смена ровно на одной странице', () => {
  const P = '2026-10-30';
  assert.deepEqual(workPeriod(P), { start: '2026-10-10', end: '2026-10-23', payday: P });
  const shifts = ['2026-10-09', '2026-10-10', '2026-10-23', '2026-10-24'].map((date, i) => ({ id: `x${i}`, date, amount: 100 }));
  assert.deepEqual(shiftsInPeriod(shifts, P).map((s) => s.date), ['2026-10-10', '2026-10-23']);
  for (const s of shifts) {
    const pages = PAYDAYS.filter((p) => shiftsInPeriod([s], p).length);
    assert.deepEqual(pages, [shiftPayday(s.date)]);
  }
  // каждый день года — ровно одна зарплата
  for (let d = '2026-09-01'; d < '2027-09-01'; d = addDays(d, 1)) {
    assert.equal(PAYDAYS.filter((p) => shiftsInPeriod([{ date: d }], p).length).length, 1, d);
  }
  assert.equal(PAYDAYS[shiftPagerRange([], ANCHOR).lo], ANCHOR);
  assert.equal(PAYDAYS[shiftPagerRange([{ date: '2026-08-01' }], ANCHOR).lo], shiftPayday('2026-08-01'));
});

test('открываемся на ближайшей предстоящей зарплате', () => {
  assert.equal(upcomingPayday('2026-10-23'), '2026-10-30');
  assert.equal(upcomingPayday('2026-10-30'), '2026-10-30');
  assert.equal(upcomingPayday('2026-10-31'), '2026-11-13');
});

test('недостача: сумма смены не меняется, вычитается только из итога зарплаты', () => {
  const list = [
    { id: 'a', date: '2026-10-10', amount: 3000 },
    { id: 'b', date: '2026-10-11', amount: '2500', shortage: 400 },
    { id: 'c', date: '2026-10-12', amount: null, shortage: 100 },
    { id: 'd', date: '2026-10-13', amount: 1000, source: 'calc' },
  ];
  const t = shiftTotals(list);
  assert.deepEqual(t, { earned: 6500, mentor: 0, short: 500, surplus: 0, carry: 0, bonusLoss: 0, net: 6000, count: 4, withSum: 3, fromCalc: 1, shortCount: 2, surplusCount: 0, mentorCount: 0 });
  assert.equal(list[1].amount, '2500'); // не мутируем
  assert.equal(shiftNet(list[1]), 2100);
  assert.equal(netForPayday(list, '2026-10-30'), 6000);
  // мусор и отрицательные — 0
  assert.equal(shortageOf({ shortage: 'abc' }), 0);
  assert.equal(shortageOf({ shortage: -5 }), 0);
  assert.equal(shortageOf({}), 0);
  // недостача больше заработка → к выплате в минус
  assert.equal(shiftTotals([{ date: '2026-10-10', amount: 100, shortage: 300 }]).net, -200);
});

test('withShortage: пусто/0 убирает поле, тот же объект без изменений', () => {
  const s = { id: 'a', amount: 100 };
  assert.equal(withShortage(s, ''), s);
  const w = withShortage(s, '250');
  assert.equal(w.shortage, 250);
  assert.equal(withShortage(w, 250), w);
  assert.ok(!('shortage' in withShortage(w, '0')));
  assert.ok(!('shortage' in withShortage(w, '')));
});

test('zp_app_v1: старые смены без поля shortage грузятся и считаются как 0', () => {
  const old = { settings: { mode: 'work' }, expenses: [], shifts: [{ id: 'o', date: '2026-10-11', title: 'ночь касса', amount: '3000', payday: '2026-10-30' }] };
  const app = normalizeApp(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(shiftTotals(shiftsInPeriod(app.shifts, '2026-10-30')), { earned: 3000, mentor: 0, short: 0, surplus: 0, carry: 0, bonusLoss: 0, net: 3000, count: 1, withSum: 1, fromCalc: 0, shortCount: 0, surplusCount: 0, mentorCount: 0 });
  // и обратно: shortage — просто доп. поле, JSON его хранит
  const saved = JSON.parse(JSON.stringify({ ...app, shifts: [withShortage(app.shifts[0], 500)] }));
  assert.equal(normalizeApp(saved).shifts[0].shortage, 500);
});

test('Расчёт → Смены: смена на нужной странице, правка расчёта обновляет, не дублирует; недостача живёт', () => {
  const D = '2026-10-16';
  let app = { ...defaultState(), shifts: [], removed: [] };
  app = sync(app, calcOf({ [D]: day({ bb: [10] }) }));
  assert.equal(app.shifts.length, 1);
  const s0 = app.shifts[0];
  assert.equal(s0.source, 'calc');
  // страница зарплаты, где её видно
  const P = shiftPayday(D);
  assert.equal(P, '2026-10-30');
  assert.deepEqual(shiftsInPeriod(app.shifts, P).map((x) => x.id), [s0.id]);
  // недостача на смене из расчёта
  app = { ...app, shifts: app.shifts.map((x) => withShortage(x, 300)) };
  const c2 = calcOf({ [D]: day({ bb: [25] }, { role: 'ryad' }) });
  app = sync(app, c2);
  assert.equal(app.shifts.length, 1);
  assert.equal(app.shifts[0].id, s0.id);
  assert.equal(app.shifts[0].amount, calcPayForDay(c2.days[D], c2.rates));
  assert.equal(app.shifts[0].shortage, 300);
  const t = shiftTotals(shiftsInPeriod(app.shifts, P));
  assert.equal(t.earned, app.shifts[0].amount);
  assert.equal(t.net, app.shifts[0].amount - 300);
  // сброс расчёта: смена без суммы остаётся с недостачей (не теряется)
  app = sync(app, calcOf({}));
  assert.equal(app.shifts.length, 1);
  assert.equal(app.shifts[0].amount, null);
  assert.equal(app.shifts[0].shortage, 300);
  assert.equal(app.shifts[0].source, undefined);
  // без недостачи — смена уходит, как раньше
  const b = sync(sync({ ...defaultState(), shifts: [], removed: [] }, calcOf({ [D]: day({ bb: [3] }) })), calcOf({}));
  assert.equal(b.shifts.length, 0);
});

test('досев страниц «Смен»: заготовки появляются в рабочем периоде зарплаты', () => {
  const base = { ...defaultState(), shifts: [], removed: [], settings: { ...defaultState().settings, mode: 'work' } };
  const P = '2027-03-05';
  const seeded = seedShiftPaydays(base, [P]);
  assert.equal(shiftsInPeriod(seeded.shifts, P).length, 14); // режим «работа» — все дни
  assert.equal(seedShiftPaydays(seeded, [P]), seeded);
});

import { shiftForecast, shiftTotals as shiftTotals2 } from '../src/lib/shifts.js';

test('средняя за смену и прогноз к выплате', () => {
  const t = shiftTotals2([
    { date: '2026-10-01', title: 'ночь касса', amount: 2000 },
    { date: '2026-10-02', title: 'ночь касса', amount: 1000, shortage: 100 },
    { date: '2026-10-03', title: 'ночь касса', amount: null, mentor: 300 },
    { date: '2026-10-04', title: 'ночь касса', amount: null },
  ]);
  const f = shiftForecast(t);
  assert.equal(f.avg, 1500);
  assert.equal(f.left, 2);
  // net = 3000 + 300 − 100 = 3200; без наставника 2900; + 2 × 1500
  assert.equal(f.forecast, 5900);
  assert.equal(shiftForecast(shiftTotals2([{ date: '2026-10-01', amount: 500 }])).forecast, null);
  assert.deepEqual(shiftForecast(shiftTotals2([])), { avg: 0, left: 0, forecast: null });
});
