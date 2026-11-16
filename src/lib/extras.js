/**
 * «Расход» в «Расчёте»: напитки, стаканы/крышки и соусы (заполняются «Импорт PDF», правятся вручную).
 * Чистые функции — тесты в tests/extras.test.mjs. Хранятся в том же day.counts (свои id с префиксами),
 * поэтому старые расчёты не ломаются: нет значения — 0. На зарплату не влияют (computeCalc их не видит).
 *
 * Порядок в шторке «Расход»: продукция (ингредиенты) → Напитки → Стаканы и крышки → Коробки и фри → Соусы.
 */
import { itemTotal } from './calc.js';

export const DRINK_ROWS = [
  { id: 'dr_cola1', name: 'Кола 1л' },
  { id: 'dr_zero1', name: 'Кола зеро 1л' },
  { id: 'dr_fanta1', name: 'Фанта 1л' },
  { id: 'dr_sprite1', name: 'Спрайт 1л' },
  { id: 'dr_cola05', name: 'Кола 0,5' },
  { id: 'dr_zero05', name: 'Кола зеро 0,5' },
  { id: 'dr_fanta05', name: 'Фанта 0,5' },
  { id: 'dr_sprite05', name: 'Спрайт 0,5' },
  { id: 'dr_bonaqua', name: 'Бон аква 0,5' },
  { id: 'dr_fuseStr', name: 'Фьюсти клубника' },
  { id: 'dr_fusePeach', name: 'Фьюсти персик' },
  { id: 'dr_fuseMango', name: 'Фьюсти манго' },
  { id: 'dr_fuseCham', name: 'Фьюсти ромашка' },
  { id: 'dr_pikoOr', name: 'Пико апельсин' },
  { id: 'dr_pikoGr', name: 'Пико виноград' },
];

/** Порядок напитков (литровые → 0,5 → Бон аква → Фьюсти → Пико) — для превью импорта. */
export const sortDrinks = (list) => {
  const at = (x) => {
    const i = DRINK_ROWS.findIndex((d) => d.id === x.calcId);
    return i < 0 ? DRINK_ROWS.length : i;
  };
  return [...list].sort((a, b) => at(a) - at(b));
};

/** Соусы — в порядке С Ч Б К (как в списке владельца). */
export const SAUCE_ROWS = [
  { id: 'sc_cheese', name: 'С', full: 'Сырный' },
  { id: 'sc_garlic', name: 'Ч', full: 'Чесночный' },
  { id: 'sc_bbq', name: 'Б', full: 'Барбекю' },
  { id: 'sc_ketchup', name: 'К', full: 'Кетчуп' },
];

export const CUPS_DISP = { id: 'cupsDisp', name: 'Стаканы одноразовые' };

/** Все редактируемые строки «Расхода» (для шторки подсчёта по id). */
export const EXTRA_ITEMS = [...DRINK_ROWS, CUPS_DISP, ...SAUCE_ROWS.map((s) => ({ id: s.id, name: s.full }))];

/** Ключ напитка из распознавания («cola:1», «fuse:peach» …) → id строки, или null (неизвестный объём/вкус). */
const DRINK_KEY = {
  'cola:1': 'dr_cola1',
  'cola:0.5': 'dr_cola05',
  'colaZero:1': 'dr_zero1',
  'colaZero:0.5': 'dr_zero05',
  'fanta:1': 'dr_fanta1',
  'fanta:0.5': 'dr_fanta05',
  'sprite:1': 'dr_sprite1',
  'sprite:0.5': 'dr_sprite05',
  'fuse:strawberry': 'dr_fuseStr',
  'fuse:peach': 'dr_fusePeach',
  'fuse:mango': 'dr_fuseMango',
  'fuse:chamomile': 'dr_fuseCham',
  'pulpy:orange': 'dr_pikoOr',
  'pulpy:grape': 'dr_pikoGr',
  'bonaqua:0.5': 'dr_bonaqua',
};
export const drinkRowId = (key) => DRINK_KEY[key] || null;

/**
 * Стаканы и крышки: обычный «Кофе» → белая крышка + стакан кофе; зерновой (350мл) → зерновая крышка
 * + зерновой стакан; «Стаканы одноразовые» — как вписано.
 */
export function computeCups(counts = {}) {
  const c = (id) => itemTotal(counts?.[id]);
  const coffee = c('coffee');
  const beans = c('beans');
  return [
    { key: 'lidWhite', label: 'Белые крышки', value: coffee },
    { key: 'cupCoffee', label: 'Стаканы кофе', value: coffee },
    { key: 'cupsDisp', label: 'Стаканы одноразовые', value: c('cupsDisp'), id: 'cupsDisp' },
    { key: 'lidGrain', label: 'Зерновые крышки', value: beans },
    { key: 'cupGrain', label: 'Зерновые стаканы', value: beans },
  ];
}

export const computeDrinks = (counts = {}) => DRINK_ROWS.map((d) => ({ key: d.id, id: d.id, label: d.name, value: itemTotal(counts?.[d.id]) }));
export const computeSauces = (counts = {}) => SAUCE_ROWS.map((s) => ({ key: s.id, id: s.id, label: s.name, full: s.full, value: itemTotal(counts?.[s.id]) }));
