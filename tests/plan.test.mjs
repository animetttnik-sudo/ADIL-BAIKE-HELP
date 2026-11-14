// Импорт плана из заметки: парсер (scripts/parse-plan.mjs) и логика импорта (src/lib/planImport.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePlan, blockSum, monthIndex } from '../scripts/parse-plan.mjs';
import { PLAN_BLOCKS, PLAN_ID } from '../src/lib/plan2026.js';
import {
  applyImport, checkPlan, previewImport, normTitle, groupPaydayOf, autoAddedRecurring, autoAddedLeft, removeExpenses,
} from '../src/lib/planImport.js';
import { expensesInPeriod } from '../src/lib/totals.js';
import { seedMonth } from '../src/lib/periods.js';
import { defaultState } from './fixtureState.mjs';

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

const sumOf = (list) => list.reduce((a, e) => a + Number(e.amount || 0), 0);
const paidLines = PLAN_BLOCKS.flatMap((b) => b.items).filter((x) => x.paid);
function allPaidPresent(app) {
  const pool = [...app.expenses];
  return paidLines.every((x) => {
    const i = pool.findIndex(
      (e) => e.date === x.date && e.amount === x.amount && normTitle(e.title) === normTitle(x.title) && e.status === 'paid'
    );
    if (i >= 0) pool.splice(i, 1);
    return i >= 0;
  });
}

test('импорт на стартовых данных: каждая строка — одно действие, ✅ все оплачены, итоги = заметка', () => {
  const app = defaultState();
  const pv = previewImport(app, PLAN_BLOCKS);
  assert.equal(pv.lines.length, 88);
  assert.deepEqual(
    { add: pv.add.length, mark: pv.markPaid.length, replace: pv.replace.length, same: pv.same.length, keep: pv.keep.length },
    { add: 78, mark: 3, replace: 1, same: 6, keep: 0 }
  );
  // 26 сент М+: в заметке 2833 ✅, в приложении старый постоянный 5667 → замена
  assert.equal(pv.replace[0].plan.amount, 2833);
  assert.equal(pv.replace[0].existing.amount, 5667);
  const next = applyImport(app, PLAN_BLOCKS, makeId, PLAN_ID, '2026-10-22T00:00:00Z');
  assert.equal(paidLines.length, 18);
  assert.ok(allPaidPresent(next));
  for (const b of PLAN_BLOCKS) {
    assert.equal(sumOf(expensesInPeriod(next.expenses, b.payday)), blockSum(b), b.payday);
  }
  assert.ok(next.expenses.filter((e) => e.src === 'plan').every((e) => !('type' in e) || e.type === 'recurring'));
  assert.ok(!next.expenses.some((e) => e.src === 'plan' && e.type === 'unexpected'));
  assert.equal(next.plan.id, PLAN_ID);
  // идемпотентно
  const again = previewImport(next, PLAN_BLOCKS);
  assert.equal(again.changes, 0);
  assert.equal(again.same.length, 88);
  assert.deepEqual(applyImport(next, PLAN_BLOCKS, makeId, PLAN_ID, 'x').expenses, next.expenses);
});

test('замену можно выключить: старый остаётся, строка — «оставить как есть»', () => {
  const pv = previewImport(defaultState(), PLAN_BLOCKS, { replace: false });
  assert.equal(pv.replace.length, 0);
  assert.equal(pv.keep.length, 1);
});

test('старые данные с автодобавленными постоянными: импорт + чистка → итоги = заметка', () => {
  // как на телефоне: правила recurring и досеянные ими расходы во всех месяцах плана
  const rules = [
    { id: 'r1', title: 'О!Банк', amount: 1387, day: 7 },
    { id: 'r2', title: 'Вайфай', amount: 1350, day: 13 },
    { id: 'r3', title: 'Мбанк', amount: 5075, day: 15 },
    { id: 'r4', title: 'О!Банк', amount: 1385, day: 21 },
    { id: 'r5', title: 'М+', amount: 5667, day: 26 },
  ];
  const app = { ...defaultState(), recurring: rules };
  let k = 0;
  for (let y = 2026, m = 9; y * 12 + m <= 2027 * 12 + 8; m === 11 ? ((m = 0), y++) : m++) {
    for (const r of rules) {
      app.expenses.push({ id: `a${++k}`, date: `${y}-${String(m + 1).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`, amount: r.amount, title: r.title, type: 'recurring', status: null });
    }
  }
  // ручной «постоянный», уже отмеченный, — не трогаем
  app.expenses.push({ id: 'man', date: '2026-11-26', amount: 5667, title: 'М+', type: 'recurring', status: 'paid' });
  const auto0 = autoAddedRecurring(app);
  assert.equal(auto0.length, k + 2); // + сентябрьские О!Банк 1385 и М+ 5667 из стартовых данных
  const pv = previewImport(app, PLAN_BLOCKS);
  assert.ok(pv.replace.length > 0);
  const left = autoAddedLeft(app, pv);
  let next = applyImport(app, PLAN_BLOCKS, makeId, PLAN_ID);
  assert.ok(allPaidPresent(next));
  // оставшиеся автодобавленные — ровно те, что превью обещало показать
  assert.deepEqual(autoAddedRecurring(next).map((e) => e.id).sort(), left.map((e) => e.id).sort());
  next = removeExpenses(next, autoAddedRecurring(next).map((e) => e.id));
  assert.ok(next.expenses.some((e) => e.id === 'man'));
  assert.ok(allPaidPresent(next));
  for (const b of PLAN_BLOCKS) {
    const list = expensesInPeriod(next.expenses, b.payday).filter((e) => e.id !== 'man');
    assert.equal(sumOf(list), blockSum(b), b.payday);
  }
  assert.equal(previewImport(next, PLAN_BLOCKS).changes, 0);
});
