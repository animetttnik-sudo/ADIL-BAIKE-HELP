// Парсер заметок в приложении (src/lib/planParse.js) — общий со скриптом
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePlan, PLAN_REF, inferYear, stripBlocks, blockSum, paydayFor } from '../src/lib/planParse.js';
import { PLAN_BLOCKS } from '../src/lib/plan2026.js';
import { previewImport, applyImport } from '../src/lib/planImport.js';
import { defaultState } from '../src/lib/periods.js';

const TEXT = readFileSync(new URL('../scripts/plan.txt', import.meta.url), 'utf8');

test('паритет: приложение разбирает plan.txt так же, как встроенный план (2026/2027)', () => {
  const r = parsePlan(TEXT, { ref: PLAN_REF });
  assert.deepEqual(stripBlocks(r.blocks), PLAN_BLOCKS);
  assert.equal(r.unparsed.length, 0);
  // сегодняшняя дата (окт 2026) даёт те же годы
  assert.deepEqual(stripBlocks(parsePlan(TEXT, { ref: new Date(2026, 9, 22) }).blocks), PLAN_BLOCKS);
});

test('год — относительно текущей даты', () => {
  assert.equal(inferYear(8, new Date(2026, 9, 22)), 2026); // сентябрь
  assert.equal(inferYear(7, new Date(2026, 9, 22)), 2027); // август — уже следующий
  assert.equal(inferYear(0, new Date(2026, 9, 22)), 2027);
  assert.equal(inferYear(0, new Date(2027, 0, 5)), 2027);
  assert.equal(inferYear(11, new Date(2027, 0, 5)), 2026); // прошлый месяц
});

test('текст без заголовков: каждая строка с датой — к своей зарплате', () => {
  const text = [
    '15 октября - 5075 Мбанк ✅',
    '21 окт – 1385 О!Банк',
    '26.10 - 2 833 М+',
    '7 ноября 1387 О!Банк',
    '',
  ].join('\n');
  const r = parsePlan(text, { ref: new Date(2026, 9, 22) });
  assert.equal(r.unparsed.length, 0);
  const items = r.blocks.flatMap((b) => b.items.map((x) => ({ ...x, payday: b.payday })));
  assert.equal(items.length, 4);
  for (const x of items) assert.equal(x.payday, paydayFor(x.date));
  assert.deepEqual(items.map((x) => x.amount), [5075, 1385, 2833, 1387]);
  assert.equal(items[0].paid, true);
  assert.equal(items[3].title, 'О!Банк');
  assert.equal(items[3].date, '2026-11-07');
  // повторный импорт такого текста ничего не меняет
  let n = 0;
  const app = applyImport(defaultState(), r.blocks, () => `n${++n}`);
  assert.equal(previewImport(app, r.blocks).changes, 0);
  assert.equal(app.plan, undefined); // импорт из заметок не помечает встроенный план
});

test('нераспознанные строки не теряются', () => {
  const text = 'Расходы Ноябрь\n4 ноября - 1000 Адилет Аке\nкупить хлеб\n32 ноября - 500 x\n10 ноября - Вб\n\n';
  const r = parsePlan(text, { ref: new Date(2026, 9, 22) });
  assert.equal(r.blocks.reduce((a, b) => a + b.items.length, 0), 1);
  assert.deepEqual(r.unparsed.map((u) => u.text ?? u), ['купить хлеб', '32 ноября - 500 x', '10 ноября - Вб']);
  assert.equal(blockSum(r.blocks[0]), 1000);
});
