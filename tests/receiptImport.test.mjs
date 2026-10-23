// Импорт позиций из «Отчёта по продажам» (текст Live Text) — разбор и сопоставление.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { buildImport, summarize, matchName, parseReceipt, normName } from '../src/lib/receiptImport.js';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const sum = (text, choice) => Object.fromEntries(summarize(buildImport(text).rows, choice).map((s) => [s.id, s.qty]));

// ожидаемое по фото чека 08.07 19:30 → 09.07 07:30 (уверенные строки)
const SURE = {
  bb: 5, bc: 33, prime: 3, special: 5, bigG: 7, bigK: 3, kp: 23, gpOm: 5, gp: 11, gipper: 7, gpDv: 4, kpDv: 4, gsDv: 22,
  crispy: 29, mild4: 1, mild8: 2, hot4: 2, hot8: 1, sg4: 4, sg8: 1, sk4: 3, sk8: 6, kurSyr: 4, st8: 4, fri: 40,
  hdClassic: 6, hdCheese: 9, cheesemax: 10, chili: 16,
};

for (const f of ['receipt-inline.txt', 'receipt-columns.txt']) {
  test(`чек ${f}: 62 строки, период, ночь`, () => {
    const r = buildImport(fx(f));
    assert.equal(r.items.length, 62);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.period.date, '2026-07-08');
    assert.equal(r.period.time, 'night');
    assert.ok(r.items.every((x) => Number.isInteger(x.qty)));
  });
  test(`чек ${f}: уверенные позиции`, () => {
    const r = buildImport(fx(f));
    const auto = {};
    for (const x of r.rows) if (x.status === 'auto') auto[x.id] = (auto[x.id] || 0) + x.qty;
    for (const [id, q] of Object.entries(SURE)) assert.equal(auto[id], q, id);
    // базовые без «свеж. овощей», «не острый», напитков-аналогов
    assert.equal(auto.ks, 70);
    assert.equal(auto.gs, 56);
    assert.equal(auto.ksDv, 7);
    assert.equal(auto.tg, 3);
    assert.equal(auto.tk, 10);
    assert.equal(auto.coffee, 2);
  });
  test(`чек ${f}: сомнительные — на подтверждение, напитки/соусы — не учитываются`, () => {
    const r = buildImport(fx(f));
    const check = r.rows.filter((x) => x.status === 'check').map((x) => [x.name, x.id]);
    assert.deepEqual(check, [
      ['Горячий молочный шоколад 350 мл', 'cocoa'],
      ['Двойной чизбургер кур.со свеж овоща', 'ksDv'],
      ['Двойной чизбургер курица со свеж ов', 'ksDv'],
      ['Капучино 350 мл', 'coffee'],
      ['Тэсти ролл говядина не острый', 'tg'],
      ['Чизбэргур кур.со свеж.овощами', 'ks'],
      ['Чизбургер гов.со свеж.овощами', 'gs'],
    ]);
    const skip = r.rows.filter((x) => x.status === 'skip').length;
    assert.equal(skip, 18);
    assert.equal(r.rows.filter((x) => x.status === 'unknown').length, 0);
  });
}

test('обе раскладки дают одинаковую сводку', () => {
  assert.deepEqual(sum(fx('receipt-inline.txt')), sum(fx('receipt-columns.txt')));
});

test('решение пользователя: «не учитывать» и другая позиция', () => {
  const r = buildImport(fx('receipt-inline.txt'));
  const k = (n) => r.rows.find((x) => x.name === n).key;
  const s = Object.fromEntries(
    summarize(r.rows, { [k('Капучино 350 мл')]: 'skip', [k('Чизбургер гов.со свеж.овощами')]: 'gs' }).map((x) => [x.id, x.qty])
  );
  assert.equal(s.coffee, 2);
  assert.equal(s.gs, 63);
});

test('запомненные названия применяются сразу', () => {
  const learned = { [normName('Чизбургер гов.со свеж.овощами')]: 'gs', [normName('Капучино 350 мл')]: 'skip' };
  assert.deepEqual(matchName('Чизбургер гов.со свеж.овощами', learned), { id: 'gs', status: 'auto', score: 1, via: 'learned' });
  assert.equal(matchName('Капучино 350 мл', learned).status, 'skip');
});

test('шум OCR: латиница-двойники, точки, числа-двойники', () => {
  assert.equal(matchName('Чизбургер курицa').id, 'ks'); // латинская «a»
  assert.equal(matchName('Сaмсы с кур 8шт').id, 'sk8');
  assert.equal(matchName('Чизм3кс').id, 'cheesemax');
  assert.equal(matchName('Крылья острые 8шт').id, 'hot8');
  assert.equal(matchName('Крылья не острые 8шт').id, 'mild8');
  const p = parseReceipt('Фри\nКофе\n4O.\n2');
  assert.deepEqual(p.items.map((x) => [x.name, x.qty]), [['Фри', 40], ['Кофе', 2]]);
});

test('столбцы кусками и числа раньше названий', () => {
  const p = parseReceipt('Фри\nЧизмакс\n40\n10\nЧили бургер\n16');
  assert.deepEqual(p.items.map((x) => [x.name, x.qty]), [['Фри', 40], ['Чизмакс', 10], ['Чили бургер', 16]]);
  const q = parseReceipt('40\n10\nФри\nЧизмакс');
  assert.deepEqual(q.items.map((x) => [x.name, x.qty]), [['Фри', 40], ['Чизмакс', 10]]);
});

test('не поровну — предупреждение, строка без количества', () => {
  const p = parseReceipt('Фри\nЧизмакс\n40');
  assert.equal(p.items[1].qty, null);
  assert.equal(p.warnings.length, 1);
});

test('дневная смена по времени «за»', () => {
  const p = parseReceipt('за 2026-07-09 07:30:41\nпо 2026-07-09 19:30:00\nФри 3');
  assert.equal(p.period.time, 'day');
  assert.equal(p.period.date, '2026-07-09');
});
