// Две (и больше) смены за один день: ключи расчёта, связь со «Сменами», миграция старых данных,
// итоги зарплаты, импорт заметки, перенос данных, экспорт PDF/Фото, «Рассчитать» из меню строки.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcKey, keyDate, keySlot, compareKeys, linkKey, calcSlots, nextSlot, calcTargetFor,
  syncCalcShifts, calcPayForDay, shiftForCalcDay, withCalcDayAdj, calcDayAdj,
} from '../src/lib/link.js';
import { DEFAULT_RATES } from '../src/lib/calc.js';
import { payTotals, shiftsInPeriod, dayTotals, shiftTotals } from '../src/lib/shifts.js';
import { defaultState, paydayForDate, normalizeApp } from '../src/lib/periods.js';
import { parseShifts } from '../src/lib/shiftParse.js';
import { applyShiftImport, previewShiftImport } from '../src/lib/shiftImport.js';
import { makeBackup, parseBackup, summarize } from '../src/lib/backup.js';
import { payReport, reportHtml } from '../src/lib/payExport.js';

let n = 0;
const mkId = () => `m${++n}`;
const day = (counts, extra = {}) => ({ counts, staff: 3, role: 'kass', time: 'night', mentor: false, stops: false, ...extra });
const calcOf = (days) => ({ rates: { ...DEFAULT_RATES }, days });
const sync = (app, calc) => syncCalcShifts(app, calc, paydayForDate, mkId);
const base = (shifts = []) => ({ ...defaultState(), shifts, removed: [] });
const D = '2026-10-17';
const P = paydayForDate(D);

test('ключи расчёта: 1-я смена — сама дата (старый формат), 2-я — «дата#2»', () => {
  assert.equal(calcKey(D, 1), D);
  assert.equal(calcKey(D), D);
  assert.equal(calcKey(D, 2), `${D}#2`);
  assert.equal(keyDate(`${D}#2`), D);
  assert.equal(keySlot(D), 1);
  assert.equal(keySlot(`${D}#3`), 3);
  assert.deepEqual([`${D}#10`, `${D}#2`, D, '2026-10-16'].sort(compareKeys), ['2026-10-16', D, `${D}#2`, `${D}#10`]);
  assert.deepEqual(calcSlots({}, D), [1]);
  assert.deepEqual(calcSlots({ [D]: day({}), [`${D}#3`]: day({}), '2026-10-18#2': day({}) }, D), [1, 3]);
  assert.equal(nextSlot({ [D]: day({}) }, D), 2);
  assert.equal(linkKey({ date: D, calcDate: D }), D);
  assert.equal(linkKey({ date: D, calcDate: D, calcKey: `${D}#2` }), `${D}#2`);
});

test('старые данные (одна смена в день): загрузка без изменений и без потерь', () => {
  const c = calcOf({ [D]: day({ bb: [12] }) });
  const old = base([
    { id: 'a', date: D, title: 'ночь касса', amount: calcPayForDay(c.days[D], c.rates), payday: P, source: 'calc', calcDate: D, shortage: 120 },
    { id: 'b', date: '2026-10-18', title: 'ночь касса', amount: 1500, payday: P },
  ]);
  const raw = JSON.parse(JSON.stringify(old));
  const app = normalizeApp(raw);
  assert.equal(sync(app, c), app, 'тот же объект — ничего не переписано');
  assert.equal(app.shifts[0].calcKey, undefined);
  const t = payTotals(app, P);
  assert.equal(t.count, 2);
  assert.equal(t.earned, old.shifts[0].amount + 1500);
  assert.equal(t.short, 120);
});

test('две смены в один день: каждая своя связанная смена, итоги зарплаты считают обе', () => {
  const c = calcOf({ [D]: day({ bb: [20] }, { time: 'day' }), [`${D}#2`]: day({ bb: [30] }, { time: 'night', role: 'ryad' }) });
  const out = sync(base([]), c);
  const list = shiftsInPeriod(out.shifts, P);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((s) => [s.date, s.title, s.calcKey]), [[D, 'день касса', undefined], [D, 'ночь ряд', `${D}#2`]]);
  const a1 = calcPayForDay(c.days[D], c.rates);
  const a2 = calcPayForDay(c.days[`${D}#2`], c.rates);
  assert.deepEqual(list.map((s) => s.amount), [a1, a2]);
  const t = payTotals(out, P);
  assert.equal(t.count, 2);
  assert.equal(t.fromCalc, 2);
  assert.equal(t.earned, a1 + a2);
  assert.deepEqual(dayTotals(list)[D], { count: 2, amount: a1 + a2, net: a1 + a2 });
  // повторная синхронизация — без изменений
  assert.equal(sync(out, c), out);
  // сброс 2-й смены убирает только её
  const c1 = calcOf({ [D]: c.days[D] });
  const back = sync(out, c1);
  assert.deepEqual(back.shifts.map((s) => s.amount), [a1]);
  assert.equal(shiftTotals(shiftsInPeriod(back.shifts, P)).earned, a1);
});

test('к старому дню добавили 2-ю смену: старая связанная смена не трогается, появляется вторая', () => {
  const c0 = calcOf({ [D]: day({ bb: [12] }) });
  const s0 = sync(base([]), c0);
  const first = s0.shifts[0];
  const c = calcOf({ ...c0.days, [`${D}#2`]: day({ bb: [5] }, { time: 'day' }) });
  const s1 = sync(s0, c);
  assert.equal(s1.shifts.find((s) => s.id === first.id), first);
  assert.equal(s1.shifts.length, 2);
  assert.equal(payTotals(s1, P).earned, calcPayForDay(c.days[D], c.rates) + calcPayForDay(c.days[`${D}#2`], c.rates));
});

test('заготовки дня и ночи из заметки: каждый расчёт перенимает свою (по времени), не дублируя', () => {
  const app = base([
    { id: 'pd', date: D, title: 'день касса', amount: null, payday: P, imp: 'notes' },
    { id: 'pn', date: D, title: 'ночь ряд', amount: null, payday: P, imp: 'notes', shortage: 300 },
  ]);
  // 1-я смена — ночь, 2-я — день: 1-я не должна забрать дневную заготовку
  const c = calcOf({ [D]: day({ bb: [9] }, { time: 'night', role: 'ryad' }), [`${D}#2`]: day({ bb: [7] }, { time: 'day' }) });
  const out = sync(app, c);
  assert.equal(out.shifts.length, 2);
  const pn = out.shifts.find((s) => s.id === 'pn');
  const pd = out.shifts.find((s) => s.id === 'pd');
  assert.equal(linkKey(pn), D);
  assert.equal(linkKey(pd), `${D}#2`);
  assert.equal(pn.shortage, 300, 'недостача осталась на своей смене');
  // недостача читается/пишется в смену своего расчёта
  assert.equal(calcDayAdj(out.shifts, D, 'night'), 300);
  assert.equal(calcDayAdj(out.shifts, `${D}#2`, 'day'), 0);
  const w = withCalcDayAdj(out, `${D}#2`, c.days[`${D}#2`], 50, paydayForDate, mkId);
  assert.equal(w.shifts.find((s) => s.id === 'pd').shortage, 50);
  assert.equal(w.shifts.find((s) => s.id === 'pn').shortage, 300);
  assert.equal(shiftForCalcDay(w.shifts, `${D}#2`, 'day').id, 'pd');
  // сброс обоих — заготовки возвращаются
  const back = sync(w, calcOf({}));
  assert.deepEqual(back.shifts.map((s) => [s.id, s.title, s.amount, s.source]).sort(), [
    ['pd', 'день касса', null, undefined],
    ['pn', 'ночь ряд', null, undefined],
  ]);
});

test('импорт заметки «26 - день … / 26 - ночь …» после двух расчётов дня — ничего не ломает и не дублирует', () => {
  const note = '10-23 окт. Зп 30 октябрь\n17 - день касса - 120\n17 - ночь рядовой +300\n';
  const parsed = parseShifts(note, { ref: '2026-10-23' });
  const c = calcOf({ [D]: day({ bb: [20] }, { time: 'day' }), [`${D}#2`]: day({ bb: [30] }, { time: 'night', role: 'ryad' }) });
  const st = sync(base([]), c);
  const pv = previewShiftImport(st, parsed, { clear: false });
  assert.equal(pv.rows.filter((r) => r.kind === 'add').length, 0);
  const next = applyShiftImport(st, parsed, mkId, { clear: false });
  const list = shiftsInPeriod(next.shifts, P);
  assert.equal(list.length, 2);
  assert.equal(list[0].shortage, 120);
  assert.equal(list[1].mentor, 300);
  // суммы из расчёта не тронуты, синхронизация после импорта — без изменений
  assert.equal(sync(next, c), next);
});

test('перенос данных: две смены дня и оба расчёта переживают копию/вставку', () => {
  const c = calcOf({ [D]: day({ bb: [20] }), [`${D}#2`]: day({ bb: [30] }, { time: 'day' }) });
  const st = sync(base([]), c);
  const text = makeBackup([['zp_app_v1', JSON.stringify(st)], ['zp_calc_v1', JSON.stringify(c)]]);
  const r = parseBackup(text);
  assert.ok(r.ok);
  assert.equal(summarize(r.data).calcs, 2);
  const app2 = normalizeApp(JSON.parse(r.data.zp_app_v1));
  const calc2 = JSON.parse(r.data.zp_calc_v1);
  assert.equal(sync(app2, calc2), app2);
  assert.equal(payTotals(app2, P).earned, payTotals(st, P).earned);
});

test('«Рассчитать» из меню строки: своя смена, пустая — свободный расчёт с её ролью/временем', () => {
  const c = calcOf({ [D]: day({ bb: [20] }) });
  const st = sync(base([{ id: 'x', date: D, title: 'день ряд', amount: null, payday: P }]), c);
  const linked = st.shifts.find((s) => s.source === 'calc');
  assert.deepEqual(calcTargetFor(linked, c.days), { key: D, seed: null });
  const ph = { id: 'y', date: '2026-10-18', title: 'день ряд', amount: null };
  assert.deepEqual(calcTargetFor(ph, c.days), { key: '2026-10-18', seed: { time: 'day', role: 'ryad' } });
  // на D 1-й расчёт занят → вторая смена дня
  const other = { id: 'z', date: D, title: 'ночь касса', amount: 1000 };
  assert.deepEqual(calcTargetFor(other, c.days), { key: `${D}#2`, seed: { time: 'night', role: 'kass' } });
  assert.equal(calcTargetFor(null, c.days), null);
});

test('экспорт зарплаты: обе смены дня, итог дня, вычеты и к выплате; HTML экранирует текст', () => {
  const c = calcOf({ [D]: day({ bb: [20] }, { time: 'day' }), [`${D}#2`]: day({ bb: [30] }, { time: 'night' }) });
  let st = sync(base([{ id: 'm', date: '2026-10-18', title: 'ночь касса', amount: 1500, payday: P, place: '<Аламедин>', shortage: 600 }]), c);
  st = { ...st, carry: { [P]: 200 } };
  const r = payReport(st, P, c);
  const t = payTotals(st, P);
  assert.equal(r.count, 3);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows.filter((x) => x.date === D).length, 2);
  assert.equal(r.rows[0].dayTotal, null);
  assert.ok(r.rows[1].dayTotal && r.rows[1].dayTotal.count === 2);
  assert.equal(r.rows[1].calc.slot, 2);
  assert.ok(r.lines.some(([k]) => k === 'Недостача'));
  assert.ok(r.lines.some(([k]) => k === 'Депонирование'));
  assert.equal(r.netValue, t.net);
  const html = reportHtml(r);
  assert.ok(html.includes('К выплате'));
  assert.ok(html.includes('&lt;Аламедин&gt;'));
  assert.ok(!html.includes('<Аламедин>'));
  assert.ok(html.includes('За день · 2 смены'));
  assert.ok(html.includes('смена 2'));
});
