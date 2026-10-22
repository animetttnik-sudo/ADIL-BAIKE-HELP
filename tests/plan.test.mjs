// Импорт плана из заметки: парсер (scripts/parse-plan.mjs) и логика импорта (src/lib/planImport.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePlan, blockSum, monthIndex } from '../scripts/parse-plan.mjs';
import { PLAN_BLOCKS, PLAN_ID } from '../src/lib/plan2026.js';
import { applyImport, checkPlan, previewImport, normTitle, groupPaydayOf } from '../src/lib/planImport.js';
import { defaultState, seedMonth } from '../src/lib/periods.js';

const TEXT = readFileSync(new URL('../scripts/plan.txt', import.meta.url), 'utf8');
const { blocks, warnings } = parsePlan(TEXT);
let n = 0;
const makeId = () => `t${++n}`;

test('парсер: 28 зарплат, 88 расходов, без нераспознанных строк', () => {
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.equal(blocks.length, 28);
  assert.equal(blocks.reduce((a, b) => a + b.items.length, 0), 88);
  assert.equal(blocks[0].payday, '2026-09-04');
  assert.equal(blocks.at(-1).payday, '2027-09-17');
});

test('парсер: суммы по каждой зарплате', () => {
  const got = Object.fromEntries(blocks.map((b) => [b.payday, [b.items.length, blockSum(b)]]));
  assert.deepEqual(got, {
    '2026-09-04': [6, 16352], '2026-09-18': [4, 11218], '2026-10-02': [6, 12752], '2026-10-16': [3, 14218],
    '2026-10-30': [3, 11927], '2026-11-13': [4, 12739], '2026-11-27': [3, 11925], '2026-12-11': [4, 12739],
    '2026-12-25': [3, 11927], '2027-01-08': [5, 22739], '2027-01-22': [3, 20540], '2027-02-05': [4, 9206],
    '2027-02-19': [2, 10540], '2027-03-05': [3, 16425], '2027-03-19': [3, 11927], '2027-04-02': [3, 19854],
    '2027-04-16': [2, 10540], '2027-04-30': [2, 11350], '2027-05-14': [3, 14044], '2027-05-28': [1, 10000],
    '2027-06-11': [4, 15394], '2027-06-25': [2, 25000], '2027-07-09': [3, 11890], '2027-07-23': [2, 20000],
    '2027-08-06': [4, 21890], '2027-08-20': [2, 20000], '2027-09-03': [3, 11890], '2027-09-17': [1, 10000],
  });
  // совпадает с «Общ» пользователя везде, кроме трёх мест (см. отчёт)
  const off = blocks.filter((b) => b.userTotal !== blockSum(b)).map((b) => b.payday);
  assert.deepEqual(off, ['2026-09-04', '2026-09-18', '2026-10-02']);
});

test('парсер: крайние случаи строк', () => {
  const all = blocks.flatMap((b) => b.items.map((x) => ({ ...x, payday: b.payday })));
  const find = (p, f) => all.find((x) => x.payday === p && f(x));
  assert.deepEqual(find('2026-10-16', (x) => x.amount === 10000), {
    date: '2026-10-16', amount: 10000, title: 'Контракт 1', paid: false, flags: ['noDate'], payday: '2026-10-16',
    src: '1 Контракт - 10 000',
  });
  assert.equal(find('2026-10-30', (x) => x.amount === 10000).date, '2026-10-30');
  assert.equal(find('2026-11-27', (x) => x.amount === 10000).title, 'Контракт');
  const noName = find('2026-09-18', (x) => x.amount === 6000);
  assert.equal(noName.title, '');
  assert.equal(noName.paid, true);
  assert.equal(find('2026-12-25', (x) => x.title === 'О!Банк').date, '2027-01-06'); // год перекатился
  assert.equal(find('2027-04-30', (x) => x.amount === 1350).date, '2027-05-13'); // «13 Мая»
  assert.equal(find('2026-09-04', (x) => x.title === 'Мбанк').date, '2026-09-15'); // «15 сентябрь- 5075»
  assert.equal(find('2026-10-02', (x) => x.title === 'апама карыз').paid, true); // «карыз✅»
  assert.equal(monthIndex('Мая'), 4);
  assert.equal(monthIndex('Контракт'), -1);
});

test('модуль plan2026.js совпадает с выводом парсера', () => {
  const strip = (bs) => bs.map((b) => ({ ...b, items: b.items.map(({ src, ...x }) => x) }));
  assert.deepEqual(PLAN_BLOCKS, strip(blocks));
});

test('зарплаты плана = расписание приложения; каждый расход попадает под свою зарплату', () => {
  const c = checkPlan(PLAN_BLOCKS);
  assert.deepEqual(c.paydayMismatch, []);
  assert.deepEqual(c.groupMismatch, []);
  assert.equal(groupPaydayOf('2027-01-06'), '2026-12-25');
});

test('импорт: дубли пропускаются, ✅ → paid, существующие не меняются, повтор ничего не добавляет', () => {
  const app = defaultState();
  const before = JSON.stringify(app.expenses);
  const pv = previewImport(app, PLAN_BLOCKS);
  assert.equal(pv.add.length + pv.dups.length + pv.similar.length, 88);
  assert.equal(pv.dups.length, 9); // сентябрь 2026 уже есть в стартовых данных
  assert.equal(pv.similar.length, 1); // 26 сент М+: в плане 2833, в приложении 5667
  const next = applyImport(app, PLAN_BLOCKS, makeId, PLAN_ID, '2026-10-22T00:00:00Z');
  assert.equal(JSON.stringify(app.expenses), before);
  assert.deepEqual(next.expenses.slice(0, app.expenses.length), app.expenses);
  const added = next.expenses.slice(app.expenses.length);
  assert.equal(added.length, 78);
  assert.ok(added.every((e) => e.src === 'plan' && typeof e.id === 'string' && e.date && e.amount > 0));
  const oct = added.filter((e) => e.date.startsWith('2026-10') && e.status === 'paid');
  assert.equal(oct.length, 8);
  assert.equal(added.find((e) => normTitle(e.title) === 'вайфай').type, 'recurring');
  assert.equal(added.find((e) => e.title === 'Контракт 1').type, 'unexpected');
  assert.equal(next.plan.months.length, 13);
  assert.equal(previewImport(next, PLAN_BLOCKS).add.length, 0);
});

test('после импорта постоянные платежи в месяцы плана не досеиваются, вне плана — как раньше', () => {
  const app = applyImport(defaultState(), PLAN_BLOCKS, makeId, PLAN_ID);
  assert.equal(seedMonth(app, 2026, 10).expenses.length, app.expenses.length); // ноябрь 2026 — в плане
  const oct27 = seedMonth(app, 2027, 9); // октябрь 2027 — вне плана
  assert.equal(oct27.expenses.length - app.expenses.length, app.recurring.length);
  const old = defaultState(); // без поля plan — поведение прежнее
  assert.equal(seedMonth(old, 2026, 10).expenses.length - old.expenses.length, old.recurring.length);
});
