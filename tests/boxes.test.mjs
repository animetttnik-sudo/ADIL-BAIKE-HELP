// node --test — «Коробки и фри»
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBoxes, fmtKg } from '../src/lib/boxes.js';

const val = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.value]));

test('порядок, подписи и разделители как в списке', () => {
  const rows = computeBoxes({});
  assert.deepEqual(rows.map((r) => r.label), ['Вес фри', 'Коробка фри', 'Кетчуп', 'КрБ', 'Крм', 'СтБ', 'Стм', 'СгБ', 'Сгм', 'СкБ', 'Скм', 'Коробка']);
  assert.deepEqual(rows.filter((r) => r.gap).map((r) => r.label), ['Коробка фри', 'КрБ', 'Коробка']);
  assert.ok(rows.every((r) => r.value === 0));
  assert.equal(fmtKg(0), '0 кг');
});

test('фри 40 → 5,72 кг, кетчуп = коробки фри', () => {
  const v = val(computeBoxes({ fri: [40] }));
  assert.equal(v['Вес фри'], 5.72);
  assert.equal(fmtKg(v['Вес фри']).replace(/\s/g, ' '), '5,72 кг');
  assert.equal(v['Коробка фри'], 40);
  assert.equal(v['Кетчуп'], 40);
});

test('крылья, стикенсы, самсы, коробки', () => {
  const v = val(
    computeBoxes({
      hot8: [1], mild8: [2], hot4: [3], mild4: [4], st8: [5], st4: [6],
      sg8: [7], sg4: [8], sk8: [9], kurSyr: [2], sk4: [10], special: [5], prime: [3],
    }),
  );
  assert.equal(v['КрБ'], 3);
  assert.equal(v['Крм'], 7);
  assert.equal(v['СтБ'], 5);
  assert.equal(v['Стм'], 6);
  assert.equal(v['СгБ'], 7);
  assert.equal(v['Сгм'], 8);
  assert.equal(v['СкБ'], 11);
  assert.equal(v['Скм'], 10);
  assert.equal(v['Коробка'], 8);
});

test('несколько подсчётов складываются (59+98), старые данные числом', () => {
  const v = val(computeBoxes({ fri: [59, 98], special: 4 }));
  assert.equal(v['Коробка фри'], 157);
  assert.equal(v['Вес фри'], 22.451);
  assert.equal(fmtKg(22.451).replace(/\s/g, ' '), '22,451 кг');
  assert.equal(v['Коробка'], 4);
});

test('фри 87 → 12,441 кг без округления', () => {
  const v = Object.fromEntries(computeBoxes({ fri: 87 }).map((r) => [r.label, r.value]));
  assert.equal(fmtKg(v['Вес фри']).replace(/\s/g, ' '), '12,441 кг');
});
