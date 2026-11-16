// «Расход»: напитки, стаканы/крышки, соусы — порядок и вывод из подсчёта
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCups, computeDrinks, computeSauces, DRINK_ROWS, drinkRowId, EXTRA_ITEMS, SAUCE_ROWS } from '../src/lib/extras.js';
import { CALC_ITEMS } from '../src/lib/calc.js';

test('порядок строк: напитки как в списке, соусы С Ч Б К, стаканы/крышки', () => {
  assert.deepEqual(DRINK_ROWS.map((d) => d.name), [
    'Кола 1л', 'Кола зеро 1л', 'Фанта 1л', 'Спрайт 1л', 'Кола 0,5', 'Кола зеро 0,5', 'Фанта 0,5', 'Спрайт 0,5',
    'Бон аква 0,5', 'Фьюсти клубника', 'Фьюсти персик', 'Фьюсти манго', 'Фьюсти ромашка', 'Пико апельсин', 'Пико виноград',
  ]);
  assert.deepEqual(SAUCE_ROWS.map((s) => s.name), ['С', 'Ч', 'Б', 'К']);
  assert.deepEqual(computeCups({}).map((c) => c.label), ['Белые крышки', 'Стаканы кофе', 'Стаканы одноразовые', 'Зерновые крышки', 'Зерновые стаканы']);
});

test('id не пересекаются с позициями кассы; каждый ключ напитка ведёт в строку', () => {
  const ids = new Set(CALC_ITEMS.map((x) => x.id));
  for (const x of EXTRA_ITEMS) assert.ok(!ids.has(x.id), x.id);
  assert.equal(new Set(EXTRA_ITEMS.map((x) => x.id)).size, EXTRA_ITEMS.length);
  assert.equal(drinkRowId('cola:1'), 'dr_cola1');
  assert.equal(drinkRowId('fanta:?'), null);
});

test('старые расчёты без новых строк — нули; стаканы из «Кофе» и «Зерн.кофе» (подсчёты складываются)', () => {
  assert.ok(computeDrinks({ bb: [3] }).every((d) => d.value === 0));
  assert.ok(computeSauces(undefined).every((d) => d.value === 0));
  const cups = Object.fromEntries(computeCups({ coffee: [4, 2], beans: 3, cupsDisp: [10] }).map((c) => [c.key, c.value]));
  assert.deepEqual(cups, { lidWhite: 6, cupCoffee: 6, cupsDisp: 10, lidGrain: 3, cupGrain: 3 });
  assert.equal(computeDrinks({ dr_fanta1: [2, 1] }).find((d) => d.id === 'dr_fanta1').value, 3);
});

test('превью импорта: напитки в том же порядке, что и в «Расходе»', async () => {
  const { buildImport } = await import('../src/lib/salesImport.js');
  const imp = buildImport(['Пико апельсин 1', 'Бонаква 0,5 2', 'Спрайт 0,5 3', 'Фьюс персик 4', 'Кола 1л 5', 'Фанта 1л 6']);
  assert.deepEqual(imp.drinks.map((x) => x.calcId), ['dr_cola1', 'dr_fanta1', 'dr_sprite05', 'dr_bonaqua', 'dr_fusePeach', 'dr_pikoOr']);
});
