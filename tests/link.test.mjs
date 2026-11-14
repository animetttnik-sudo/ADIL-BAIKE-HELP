import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCalcShifts, calcPayForDay, isLinkedShift } from '../src/lib/link.js';
import { DEFAULT_RATES } from '../src/lib/calc.js';
import { seedMonth, normalizeApp, paydayForDate, money, periodsTouchingMonth } from '../src/lib/periods.js';
import { defaultState } from './fixtureState.mjs';

let n = 0;
const mkId = () => `id${++n}`;
const day = (counts, extra = {}) => ({ counts, staff: 3, role: 'kass', time: 'night', mentor: false, stops: false, ...extra });
const calcOf = (days) => ({ rates: { ...DEFAULT_RATES }, days });
const sync = (app, calc) => syncCalcShifts(app, calc, paydayForDate, mkId);
const base = (shifts) => ({ ...defaultState(), shifts, removed: [] });

test('новая связанная смена создаётся, когда есть количества', () => {
  const c = calcOf({ '2026-09-16': day({ bb: [10] }) });
  const out = sync(base([]), c);
  assert.equal(out.shifts.length, 1);
  const s = out.shifts[0];
  assert.equal(s.source, 'calc');
  assert.equal(s.calcDate, '2026-09-16');
  assert.equal(s.title, 'ночь касса');
  assert.equal(s.amount, calcPayForDay(c.days['2026-09-16'], c.rates));
  assert.equal(s.payday, paydayForDate('2026-09-16'));
});

test('пустой день расчёта смену не создаёт; без изменений — тот же объект', () => {
  const app = base([]);
  assert.equal(sync(app, calcOf({ '2026-09-16': day({ bb: [0] }) })), app);
  const c = calcOf({ '2026-09-16': day({ bb: [3] }) });
  const once = sync(app, c);
  assert.equal(sync(once, c), once);
});

test('живое обновление суммы и названия, смена не дублируется', () => {
  const a = sync(base([]), calcOf({ '2026-09-16': day({ bb: [3] }) }));
  const c2 = calcOf({ '2026-09-16': day({ bb: [30] }, { role: 'ryad', time: 'day', mentor: true }) });
  const b = sync(a, c2);
  assert.equal(b.shifts.length, 1);
  assert.equal(b.shifts[0].id, a.shifts[0].id);
  assert.equal(b.shifts[0].title, 'день ряд');
  assert.equal(b.shifts[0].amount, calcPayForDay(c2.days['2026-09-16'], c2.rates));
  assert.notEqual(b.shifts[0].amount, a.shifts[0].amount);
});

test('сброс расчёта убирает созданную смену', () => {
  const a = sync(base([]), calcOf({ '2026-09-16': day({ bb: [3] }) }));
  const b = sync(a, calcOf({}));
  assert.equal(b.shifts.length, 0);
});

test('пустая заготовка перенимается и возвращается при сбросе', () => {
  const ph = { id: 'p1', date: '2026-09-18', title: 'ночь касса', amount: null, payday: '2026-10-02' };
  const a = sync(base([ph]), calcOf({ '2026-09-18': day({ bb: [5] }) }));
  assert.equal(a.shifts.length, 1);
  assert.equal(a.shifts[0].id, 'p1');
  assert.ok(isLinkedShift(a.shifts[0]));
  const b = sync(a, calcOf({}));
  assert.deepEqual(b.shifts, [ph]);
});

test('миграция: смена от старой кнопки (та же дата/сумма) связывается, а не дублируется', () => {
  const c = calcOf({ '2026-09-19': day({ bb: [12] }, { role: 'ryad', time: 'day' }) });
  const amt = calcPayForDay(c.days['2026-09-19'], c.rates);
  const old = { id: 'o1', date: '2026-09-19', title: 'день ряд', amount: amt, payday: '2026-10-02' };
  const out = sync(base([old]), c);
  assert.equal(out.shifts.length, 1);
  assert.equal(out.shifts[0].id, 'o1');
  assert.equal(out.shifts[0].source, 'calc');
  assert.equal(out.shifts[0].calcFrom, undefined); // при сбросе уйдёт, как и раньше созданная кнопкой
});

test('ручная смена с суммой не трогается — остаются обе', () => {
  const man = { id: 'm1', date: '2026-09-20', title: 'ночь касса', amount: 2500, payday: '2026-10-02' };
  const out = sync(base([man]), calcOf({ '2026-09-20': day({ bb: [12] }) }));
  assert.equal(out.shifts.length, 2);
  assert.deepEqual(out.shifts[0], man);
  assert.ok(isLinkedShift(out.shifts[1]));
  assert.deepEqual(sync(out, calcOf({})).shifts, [man]);
});

test('старый формат zp_app_v1 грузится: нормализация, досев, связывание, итоги', () => {
  // как сохраняла самая первая версия: без removed/custom/recurring, смены без source
  const old = JSON.parse(JSON.stringify({
    settings: { mode: 'work', hue: 210 },
    expenses: [{ id: 'e1', date: '2026-09-07', amount: 1387, title: 'О!Банк', type: 'recurring', status: 'paid' }],
    shifts: [
      { id: 's1', date: '2026-09-12', title: 'ночь касса', amount: null, payday: '2026-10-02' },
      { id: 's2', date: '2026-09-13', title: 'ночь касса', amount: '3000', payday: '2026-10-02' },
    ],
  }));
  const app = normalizeApp(old);
  assert.deepEqual(app.removed, []);
  assert.equal(app.custom.bg, null);
  assert.equal(app.settings.hue, 210);
  const seeded = seedMonth(app, 2026, 8);
  assert.ok(seeded.shifts.length > 2);
  const out = sync(seeded, calcOf({ '2026-09-12': day({ bb: [4] }) }));
  const s1 = out.shifts.find((s) => s.id === 's1');
  assert.ok(isLinkedShift(s1));
  assert.equal(out.shifts.find((s) => s.id === 's2').amount, '3000');
  const earned = out.shifts.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  assert.equal(earned, 3000 + s1.amount);
  assert.equal(typeof money(earned), 'string');
  // уже нормальное состояние возвращается как есть
  assert.equal(normalizeApp(app), app);
  assert.ok(periodsTouchingMonth(2026, 8).length >= 2);
});

test('битый/пустой zp_app_v1 → состояние по умолчанию', () => {
  assert.ok(Array.isArray(normalizeApp(null).shifts));
  assert.ok(Array.isArray(normalizeApp({ shifts: 5 }).shifts));
});
