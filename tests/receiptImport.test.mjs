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

test('столбцы кусками', () => {
  const p = parseReceipt('Фри\nЧизмакс\n40\n10\nЧили бургер\n16');
  assert.deepEqual(p.items.map((x) => [x.name, x.qty]), [['Фри', 40], ['Чизмакс', 10], ['Чили бургер', 16]]);
});

test('не поровну — предупреждение, строка без количества', () => {
  // как у Live Text: одиночное число — к названию прямо над ним, верхнее остаётся «?»
  const p = parseReceipt('Фри\nЧизмакс\n40');
  assert.equal(p.items[0].qty, null);
  assert.equal(p.items[1].qty, 40);
  assert.equal(p.warnings.length, 1);
});

test('дневная смена по времени «за»', () => {
  const p = parseReceipt('за 2026-07-09 07:30:41\nпо 2026-07-09 19:30:00\nФри 3');
  assert.equal(p.period.time, 'day');
  assert.equal(p.period.date, '2026-07-09');
});

// ── настоящий текст Live Text (iPhone): числа кусками, склеенные строки цифр, потерянные цифры
const TRUTH = JSON.parse(fx('receipt-truth.json'));

test('Live Text: ни одного молча неверного количества, ≥45 точных', () => {
  const r = buildImport(fx('receipt-livetext.txt'));
  assert.equal(r.rows.length, 62);
  let exact = 0;
  r.rows.forEach((x, i) => {
    if (x.qty === TRUTH[i]) exact++;
    else assert.ok(x.qty == null || x.qtyCheck, `молча неверно: ${x.name} ${x.qty} ≠ ${TRUTH[i]}`);
  });
  assert.ok(exact >= 45, `точных ${exact}`);
  assert.equal(r.period.time, 'night');
});

test('Live Text: склеенная строка «123525323511721» раскладывается точно', () => {
  const r = buildImport(fx('receipt-livetext.txt'));
  const i0 = r.rows.findIndex((x) => /^Соса-Cola \(0,5/.test(x.name));
  assert.deepEqual(r.rows.slice(i0, i0 + 13).map((x) => x.qty), [1, 2, 3, 5, 2, 5, 3, 23, 5, 11, 7, 2, 1]);
});

test('Live Text: одиночное число относится к ближайшему названию над ним', () => {
  const r = buildImport(fx('receipt-livetext.txt'));
  const q = (re) => r.rows.find((x) => re.test(x.name));
  assert.equal(q(/^Двои?й?ной чизбургер говядина/).qty, 22);
  assert.equal(q(/^Двойной гамбургер говядина/).qty, null);
  assert.equal(q(/^Двойной гамбургер курица/).qty, null);
  assert.equal(q(/^Двоиной чизбургер курица$/).qty, 7);
  assert.equal(q(/свех ов$/).qty, 1);
  assert.equal(q(/^Капучино/).qty, 2);
  assert.equal(q(/^Кола 0,5/).qty, 24);
});

test('Live Text: названия сопоставляются и без количества', () => {
  const r = buildImport(fx('receipt-livetext.txt'));
  const q = (re) => r.rows.find((x) => re.test(x.name));
  assert.equal(q(/^Двойной гамбургер говядина/).id, 'gpDv');
  assert.equal(q(/^Гамб\/ргер/).id, 'gpOm');
  assert.equal(q(/^Санси с кур 8/).id, 'sk8');
  assert.equal(q(/^Тэст и ролл/).id, 'tk');
  assert.equal(q(/^Соса-Cola/).status, 'skip');
  assert.equal(q(/^Сырний соус/).status, 'skip');
});

// ── потерянные числа в раскладке «столбцами» (каждое число отдельной строкой)
function dropNumbers(text, drop) {
  const lines = text.split('\n');
  const firstNum = lines.findIndex((l) => /^\d+$/.test(l));
  return lines.filter((l, i) => !(i >= firstNum && drop.has(i - firstNum))).join('\n');
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('столбцы с потерянными числами: никаких молча сдвинутых количеств', () => {
  const base = fx('receipt-columns.txt');
  for (let run = 0; run < 40; run++) {
    const drop = new Set();
    const k = 1 + Math.floor(rnd() * 4);
    while (drop.size < k) drop.add(Math.floor(rnd() * 62));
    const r = buildImport(dropNumbers(base, drop));
    assert.equal(r.rows.length, 62);
    r.rows.forEach((x, i) => {
      if (x.qty !== TRUTH[i]) assert.ok(x.qty == null || x.qtyCheck, `прогон ${run}, выпали ${[...drop]}: ${x.name} ${x.qty} ≠ ${TRUTH[i]}`);
    });
  }
});
