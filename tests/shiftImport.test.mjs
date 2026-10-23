// Импорт смен из заметки: разбор точной заметки пользователя, излишек, перенос, идемпотентность, связь с «Расчётом»
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseShifts } from '../src/lib/shiftParse.js';
import { applyShiftImport, previewShiftImport } from '../src/lib/shiftImport.js';
import { SHIFTS_NOTE, SHIFTS_NOTE_REF } from '../src/lib/shiftsNote.js';
import { adjOf, carryOf, payTotals, shiftNet, shiftTotals, shiftsInPeriod, surplusOf, withCarry, withShortage } from '../src/lib/shifts.js';
import { syncCalcShifts } from '../src/lib/link.js';
import { DEFAULT_RATES } from '../src/lib/calc.js';
import { PAYDAYS, defaultState, normalizeApp, paydayForDate, seedShiftPaydays, workPeriod } from '../src/lib/periods.js';

const NOTE = readFileSync(new URL('../scripts/shifts.txt', import.meta.url), 'utf8');
const parsed = () => parseShifts(NOTE, { ref: SHIFTS_NOTE_REF });
let n = 0;
const mkId = () => `i${++n}`;
const base = (mode = 'study') => ({ ...defaultState(), shifts: [], removed: [], settings: { ...defaultState().settings, mode } });

test('встроенная заметка = scripts/shifts.txt', () => {
  assert.equal(SHIFTS_NOTE, NOTE);
});

test('разбор точной заметки: 5 зарплат, 31 смена, недостачи, излишек, перенос', () => {
  const r = parsed();
  assert.deepEqual(r.unparsed, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.blocks.map((b) => b.payday), ['2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27', '2026-12-11']);
  // заголовок совпадает с графиком приложения
  for (const b of r.blocks) {
    assert.equal(b.headerPayday, b.payday);
    assert.deepEqual({ start: b.start, end: b.end }, { start: workPeriod(b.payday).start, end: workPeriod(b.payday).end });
    for (const s of b.shifts) assert.equal(paydayForDate(s.date), b.payday, s.date);
  }
  assert.equal(r.blocks.reduce((a, b) => a + b.shifts.length, 0), 31);
  const [o16, o30, n13, n27, d11] = r.blocks;

  assert.equal(o16.shifts.length, 7);
  assert.deepEqual(
    o16.shifts.filter((s) => s.date === '2026-09-26').map((s) => [s.title, s.place]),
    [['день ряд', 'Аламедин'], ['ночь ряд', '']]
  );
  assert.deepEqual(o16.shifts.filter((s) => s.adj).map((s) => s.adj), [2430, 64, 492, 1182]);
  assert.deepEqual(o16.shifts.find((s) => s.date === '2026-10-02'), {
    date: '2026-10-02', time: 'day', role: 'kass', title: 'день касса', place: '', adj: 64, text: '2 - день касса - 64',
  });
  assert.equal(o16.carry, 0);

  assert.equal(o30.shifts.length, 6);
  assert.deepEqual(o30.shifts.map((s) => [s.date.slice(5), s.title, s.adj]), [
    ['10-10', 'день касса', 2406],
    ['10-14', 'ночь ряд', 0],
    ['10-16', 'ночь ряд', 0],
    ['10-17', 'день ряд', -300], // +300 — излишек
    ['10-18', 'день касса', 58],
    ['10-20', 'день касса', 0], // «касса -» — без суммы
  ]);
  assert.equal(o30.carry, 3927);

  for (const b of [n13, n27, d11]) {
    assert.equal(b.shifts.length, 6);
    assert.ok(b.shifts.every((s) => s.title === 'ночь касса' && !s.adj && !s.place));
  }
  // 24-6 нояб.: 24–31 — октябрь, 1 и 6 — ноябрь
  assert.deepEqual(n13.shifts.map((s) => s.date), ['2026-10-24', '2026-10-25', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-06']);
  assert.deepEqual(d11.shifts.map((s) => s.date), ['2026-11-21', '2026-11-22', '2026-11-27', '2026-11-28', '2026-11-29', '2026-12-04']);
});

test('разбор: несовпадение с графиком, мусорные строки, перенос со знаком', () => {
  const r = parseShifts('10-23 окт. Зп 31 октябрь\n10 - день касса -1 000\nчто-то непонятное\n+500 с прошлой зп\n25 - ночь касса', { ref: '2026-10-23' });
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].payday, '2026-10-30');
  assert.equal(r.blocks[0].carry, -500);
  assert.equal(r.blocks[0].shifts[0].adj, 1000);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /31\.10\.2026/);
  assert.deepEqual(r.unparsed.map((u) => u.text), ['что-то непонятное', '25 - ночь касса']);
  // смена до заголовка
  assert.equal(parseShifts('5 - ночь касса').unparsed.length, 1);
});

test('излишек и перенос: к выплате = заработано − недостача + излишек − с прошлой зп', () => {
  const list = [
    { date: '2026-10-10', amount: 3000, shortage: 2406 },
    { date: '2026-10-17', amount: 2000, shortage: -300 },
  ];
  const t = shiftTotals(list, 3927);
  assert.equal(t.earned, 5000);
  assert.equal(t.short, 2406);
  assert.equal(t.surplus, 300);
  assert.equal(t.carry, 3927);
  assert.equal(t.net, 5000 - 2406 + 300 - 3927);
  assert.equal(shiftNet(list[1]), 2300);
  assert.equal(surplusOf(list[1]), 300);
  assert.equal(withShortage({ id: 'a' }, -300).shortage, -300);
  let st = withCarry(base(), '2026-10-30', 3927);
  assert.equal(carryOf(st, '2026-10-30'), 3927);
  assert.equal(withCarry(st, '2026-10-30', 3927), st);
  assert.deepEqual(withCarry(st, '2026-10-30', '').carry, {});
  // старые данные без carry
  assert.equal(carryOf(normalizeApp({ settings: {}, custom: {}, expenses: [], shifts: [], removed: [] }), '2026-10-30'), 0);
});

test('импорт в чистое приложение: итоги по зарплатам; повторный импорт ничего не меняет', () => {
  const r = parsed();
  let st = seedShiftPaydays(base('study'), r.blocks.map((b) => b.payday));
  const pv = previewShiftImport(st, r);
  assert.equal(pv.rows.length, 31);
  st = applyShiftImport(st, r, mkId);
  const tot = Object.fromEntries(r.blocks.map((b) => [b.payday, payTotals(st, b.payday)]));
  assert.deepEqual(
    Object.values(tot).map((t) => [t.count, t.short, t.surplus, t.carry]),
    [
      [7, 4168, 0, 0],
      [6, 2464, 300, 3927],
      [6, 0, 0, 0],
      [6, 0, 0, 0],
      [6, 0, 0, 0],
    ]
  );
  // будущие — без сумм
  assert.ok(shiftsInPeriod(st.shifts, '2026-12-11').every((s) => s.amount == null));
  // 26 сен — две смены
  assert.deepEqual(
    st.shifts.filter((s) => s.date === '2026-09-26').map((s) => [s.title, s.place || '']).sort(),
    [['день ряд', 'Аламедин'], ['ночь ряд', '']]
  );
  // пустые дни, которых нет в заметке (11 и 23 окт), убраны и не досеются снова
  assert.ok(!st.shifts.some((s) => s.date === '2026-10-11' || s.date === '2026-10-23'));
  assert.ok(st.removed.includes('2026-10-11'));
  assert.equal(seedShiftPaydays(st, ['2026-10-30']), st);
  // идемпотентность
  assert.equal(previewShiftImport(st, r).changes, 0);
  assert.equal(applyShiftImport(st, r, mkId), st);
  const again = applyShiftImport(st, parsed(), mkId);
  assert.equal(again.shifts.length, st.shifts.length);
  // режим «работа» (заготовка на каждый день) — тоже 31 смена и идемпотентно
  let w = seedShiftPaydays(base('work'), r.blocks.map((b) => b.payday));
  w = applyShiftImport(w, r, mkId);
  assert.equal(r.blocks.reduce((a, b) => a + shiftsInPeriod(w.shifts, b.payday).length, 0), 31);
  assert.equal(previewShiftImport(w, r).changes, 0);
  // без «убрать пустые» — заготовки остаются
  const keep = applyShiftImport(seedShiftPaydays(base('study'), ['2026-10-30']), r, mkId, { clear: false });
  assert.ok(keep.shifts.some((s) => s.date === '2026-10-11'));
});

test('импорт поверх введённого: сумму из «Расчёта» не трогает, дописывает недостачу, не дублирует', () => {
  const r = parsed();
  const D = '2026-10-10';
  let st = seedShiftPaydays(base('study'), ['2026-10-30']);
  const calc = { rates: { ...DEFAULT_RATES }, days: { [D]: { counts: { bb: [10] }, staff: 3, role: 'kass', time: 'day', mentor: false, stops: false } } };
  st = syncCalcShifts(st, calc, paydayForDate, mkId);
  const linked = st.shifts.find((s) => s.source === 'calc');
  assert.equal(linked.date, D);
  const amt = linked.amount;
  // ручная смена с суммой и своей недостачей
  st = { ...st, shifts: [...st.shifts, { id: 'm', date: '2026-10-18', title: 'день касса', amount: 2800, shortage: 100, payday: '2026-10-30' }] };
  st = st.shifts.some((s) => s.date === '2026-10-18' && s.id !== 'm') ? { ...st, shifts: st.shifts.filter((s) => !(s.date === '2026-10-18' && s.id !== 'm')) } : st;
  const pv = previewShiftImport(st, r);
  const row = (d) => pv.rows.find((x) => x.p.date === d);
  assert.equal(row(D).kind, 'shortage');
  assert.equal(row(D).existing.id, linked.id);
  assert.equal(row('2026-10-18').kind, 'same');
  assert.deepEqual(row('2026-10-18').conflict, { app: 100, note: 58 });
  st = applyShiftImport(st, r, mkId);
  const l2 = st.shifts.filter((s) => s.date === D);
  assert.equal(l2.length, 1);
  assert.equal(l2[0].amount, amt);
  assert.equal(l2[0].shortage, 2406);
  assert.equal(l2[0].source, 'calc');
  assert.equal(st.shifts.find((s) => s.id === 'm').shortage, 100);
  assert.equal(previewShiftImport(st, r).changes, 0);
  // пересчёт расчёта: та же смена, недостача на месте
  const st2 = syncCalcShifts(st, { ...calc, days: { [D]: { ...calc.days[D], counts: { bb: [20] } } } }, paydayForDate, mkId);
  assert.equal(st2.shifts.filter((s) => s.date === D).length, 1);
  assert.equal(adjOf(st2.shifts.find((s) => s.date === D)), 2406);
});

test('две смены в день: расчёт привязывается к смене того же времени', () => {
  const r = parsed();
  let st = applyShiftImport(seedShiftPaydays(base('study'), ['2026-10-16']), r, mkId);
  const D = '2026-09-26';
  const day = (time) => ({ counts: { bb: [10] }, staff: 3, role: 'ryad', time, mentor: false, stops: false });
  for (const time of ['day', 'night']) {
    const s2 = syncCalcShifts(st, { rates: { ...DEFAULT_RATES }, days: { [D]: day(time) } }, paydayForDate, mkId);
    const on = s2.shifts.filter((s) => s.date === D);
    assert.equal(on.length, 2, time);
    const l = on.find((s) => s.source === 'calc');
    assert.ok(l.title.startsWith(time === 'day' ? 'день' : 'ночь'));
    if (time === 'day') assert.equal(l.place, 'Аламедин');
    assert.equal(on.filter((s) => s.source !== 'calc')[0].amount, null);
    // сброс — обе на месте, как были
    const s3 = syncCalcShifts(s2, { rates: { ...DEFAULT_RATES }, days: {} }, paydayForDate, mkId);
    assert.deepEqual(
      s3.shifts.filter((s) => s.date === D).map((s) => s.title).sort(),
      ['день ряд', 'ночь ряд']
    );
  }
});

test('все зарплаты заметки есть в графике приложения', () => {
  for (const p of ['2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27', '2026-12-11']) assert.ok(PAYDAYS.includes(p), p);
});
