// Режимы «Учёба / Работа»: шаблоны автосмен, переключение туда и обратно, правленые не трогаются
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMode, defaultState, monthsFrom, normalizeApp, parse, seedMonth } from '../src/lib/periods.js';
import { defaultState as ownerLike } from './fixtureState.mjs';
import { BUILTIN_TEMPLATES, editTemplateDay, isPristineAuto, templatesOf, toggleTemplateDay } from '../src/lib/modeTemplates.js';

const FROM = '2026-11-16';
const dows = (app, from = FROM, to = '2026-11-29') =>
  [...new Set(app.shifts.filter((s) => s.date >= from && s.date <= to).map((s) => parse(s.date).getDay()))].sort();
const base = () => ({ ...ownerLike(), expenses: [], shifts: [], removed: [] }); // сохранение без modeTemplates

test('старые сохранения (как у владельца) — встроенный шаблон: прежнее поведение', () => {
  assert.deepEqual(templatesOf(base()), BUILTIN_TEMPLATES);
  const app = seedMonth(base(), 2026, 10);
  assert.deepEqual(dows(app), [0, 5, 6]); // учёба: пт, сб, вс
  assert.ok(app.shifts.every((s) => s.title === 'ночь касса' && s.amount === null));
  // normalizeApp не подменяет и не теряет поведение
  assert.deepEqual(templatesOf(normalizeApp(app)), BUILTIN_TEMPLATES);
});

test('новый пользователь — пустые шаблоны, сам ничего не досевается', () => {
  const app = seedMonth({ ...defaultState() }, 2026, 10);
  assert.equal(app.shifts.length, 0);
  assert.deepEqual(templatesOf(app), { study: [], work: [] });
});

test('учёба → работа → учёба: автосмены возвращаются к шаблону учёбы, правленые остаются', () => {
  let app = seedMonth(base(), 2026, 10);
  app = applyMode(app, 'work', FROM);
  assert.equal(app.settings.mode, 'work');
  // до fromDate будни не добавляются (вт 10-е)
  assert.ok(!app.shifts.some((s) => s.date === '2026-11-10'));
  assert.deepEqual(dows(app), [0, 1, 2, 3, 4, 5, 6]);
  // вручную: сумма в понедельник 16-го, место во вторник 17-го
  app = {
    ...app,
    shifts: app.shifts.map((s) =>
      s.date === '2026-11-16' ? { ...s, amount: 3000 } : s.date === '2026-11-17' ? { ...s, place: 'Аламедин' } : s
    ),
  };
  app = applyMode(app, 'study', FROM);
  assert.equal(app.settings.mode, 'study');
  const kept = app.shifts.filter((s) => s.date >= FROM && s.date <= '2026-11-29').map((s) => s.date).sort();
  assert.ok(kept.includes('2026-11-16') && kept.includes('2026-11-17'));
  // остальные будни ушли: ср 18, чт 19, пн 23 …
  for (const d of ['2026-11-18', '2026-11-19', '2026-11-23', '2026-11-24']) assert.ok(!kept.includes(d), d);
  for (const d of ['2026-11-20', '2026-11-21', '2026-11-22']) assert.ok(kept.includes(d), d);
  // смены до fromDate не трогаются (пт 13-е)
  assert.ok(app.shifts.some((s) => s.date === '2026-11-13'));
});

test('убранный пользователем день не возвращается при смене режима', () => {
  let app = { ...base(), removed: ['2026-11-21'] };
  app = applyMode(app, 'study', FROM);
  assert.ok(!app.shifts.some((s) => s.date === '2026-11-21'));
});

test('изменить шаблон: дни, тип и сумма; автосмены приводятся к нему, сумма шаблона не считается правкой', () => {
  let app = seedMonth(base(), 2026, 10);
  app = toggleTemplateDay(app, 'study', 0); // без воскресенья
  app = toggleTemplateDay(app, 'study', 3); // + среда
  app = editTemplateDay(app, 'study', 3, { title: 'день касса', amount: 2500 });
  app = applyMode(app, 'study', FROM);
  assert.deepEqual(dows(app), [3, 5, 6]);
  const wed = app.shifts.find((s) => s.date === '2026-11-18');
  assert.equal(wed.title, 'день касса');
  assert.equal(wed.amount, 2500);
  assert.ok(isPristineAuto(wed));
  // правка суммы вручную → больше не автосмена
  assert.equal(isPristineAuto({ ...wed, amount: 2600 }), false);
  // возвращаем шаблон — среда уходит, воскресенье возвращается
  app = toggleTemplateDay(toggleTemplateDay(app, 'study', 3), 'study', 0);
  app = applyMode(app, 'study', FROM);
  assert.deepEqual(dows(app), [0, 5, 6]);
  // шаблон работы владельца не изменился
  assert.deepEqual(templatesOf(app).work, BUILTIN_TEMPLATES.work);
});

test('нетронутая: только поля автосмены и пустая сумма; из «Расчёта»/с недостачей — нет', () => {
  assert.ok(isPristineAuto({ id: 'a', date: '2026-11-20', title: 'ночь касса', amount: null, payday: 'x' }));
  assert.equal(isPristineAuto({ id: 'a', date: '2026-11-20', title: 'ночь касса', amount: null, shortage: 50 }), false);
  assert.equal(isPristineAuto({ id: 'a', date: '2026-11-20', title: 'ночь касса', amount: 3000 }), false);
});

test('monthsFrom: от даты до последней смены', () => {
  assert.deepEqual(monthsFrom('2026-11-16', [{ date: '2027-01-03' }]), [[2026, 10], [2026, 11], [2027, 0]]);
  assert.deepEqual(monthsFrom('2026-12-20', []), [[2026, 11], [2027, 0]]);
});
