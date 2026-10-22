// node --test tests/   — сверка с Excel-калькулятором на его же примерах
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCalc, ownPay, DEFAULT_RATES, itemTotal, CALC_ITEMS } from '../src/lib/calc.js';

// Входные данные листа (C3..C45; D42=59, D43=98 — второй подсчёт)
const SAMPLE = {
  bb: [13], bc: [49], prime: [4], special: [3], bigG: [5], bigK: [6], kp: [18], gpOm: [2], gp: [57],
  gipper: [4], gpDv: [17], kpDv: [2], gsDv: [33], ksDv: [12], crispy: [28],
  mild4: [3], mild8: [3], hot4: [2], hot8: [1], sg4: [3], sg8: [4], sk4: [2], sk8: [6], kurSyr: [2],
  st4: [3], st8: [2], tg: [12], tk: [16], fri: [79], hdClassic: [11], hdCheese: [12],
  ks: [27, 59], gs: [11, 98], cheesemax: [6], chili: [17],
};

const r2 = (x) => Math.round(x * 100) / 100;
const res = computeCalc(SAMPLE, DEFAULT_RATES, 3);

test('позиции, выработка, общее', () => {
  assert.equal(res.positions, 632);
  assert.equal(res.output, 6320);
  assert.equal(res.total, 648);
  assert.equal(res.unit, 648);
});

test('оплата по ролям (J4..J10)', () => {
  assert.equal(r2(res.pay.ryadDay), 2546.67);
  assert.equal(r2(res.pay.ryadNight), 2446.67);
  assert.equal(r2(res.pay.kassNight), 3246.67);
  assert.equal(r2(res.pay.kassDay), 3346.67);
});

test('выбор роли и галочки наставник/остановки', () => {
  assert.equal(r2(ownPay(res, DEFAULT_RATES, { role: 'kass', time: 'night' })), 3246.67);
  assert.equal(r2(ownPay(res, DEFAULT_RATES, { role: 'ryad', time: 'day' })), 2546.67);
  assert.equal(r2(ownPay(res, DEFAULT_RATES, { role: 'kass', time: 'day', mentor: true })), 3646.67);
  assert.equal(r2(ownPay(res, DEFAULT_RATES, { role: 'ryad', time: 'night', mentor: true, stops: true })), 2896.67);
});

test('расход ингредиентов (C50..C79) — как пересчитал LibreOffice', () => {
  const want = {
    'Булочки обыч': 404, 'Булочки желт': 67, 'Г': 330, 'Гг': 21, 'Г большой': 7, 'К': 138, 'Кг': 28,
    'Сыр': 340, 'Хохланд': 72, 'Сыр жареный': 4, 'Конина': 3, 'Омлет': 2, 'Стикенсы': 28, 'Не Остр': 36,
    'Острые': 16, 'Лаваш': 28, 'Сг': 44, 'Ск': 56, 'Кур Сыр': 10, 'Хот Дог': 23, 'Сосиска': 23,
    'Мясо Гов': 17, 'Мясо Кур': 22, 'Пай': 1.12, 'Лук фри': 0.045, 'Единица': 648,
  };
  for (const u of res.usage) assert.equal(u.value, want[u.label], u.label);
  assert.equal(res.usage.length, Object.keys(want).length);
});

test('сводка (J16..J33)', () => {
  const want = {
    'Бургеры': 404, 'Фри': 79, 'Chicken drops': 7, 'Крылышки': 13, 'Тэсти ролл': 28, 'Биг бургеры': 11,
    'Чили бур.': 17, 'Стейк бур.': 28, 'Самсы': 27, 'Гиппер бур.': 4, 'ХД сырный': 12, 'ХД классич.': 11,
    'С омлетом': 2, 'Сырный бургер': 4, 'Конина бургер': 3, 'Кофе': 0, 'Какао': 0, 'Зерн.кофе': 0,
  };
  for (const s of res.summary) assert.equal(s.value, want[s.label], s.label);
});

test('кофе не влияет на зарплату; сотрудники и ставки', () => {
  const withCoffee = computeCalc({ ...SAMPLE, coffee: [20], cocoa: [3] }, DEFAULT_RATES, 3);
  assert.equal(withCoffee.positions, 632);
  assert.equal(withCoffee.total, 648);
  const two = computeCalc(SAMPLE, DEFAULT_RATES, 2);
  assert.equal(two.pay.ryadDay, 3160 + 140 + 300);
  const r = computeCalc(SAMPLE, { ...DEFAULT_RATES, perItem: 12 }, 3);
  assert.equal(r.output, 632 * 12);
  assert.equal(itemTotal([59, '98', -3, 'x']), 157);
  assert.equal(computeCalc({}, DEFAULT_RATES, 3).pay.kassNight, 400 + 400 + 140 + 200);
});

test('позиции идут одним списком строго в порядке строк Excel (B3…B45, затем I18–I20)', () => {
  assert.deepEqual(
    CALC_ITEMS.map((it) => it.name),
    [
      'best burger', 'best cheese', 'PRIME', 'SPECIAL', 'Биг Говядина', 'Биг Курица', 'КП', 'ГП ОМ', 'ГП',
      'КП ОМ', 'Гиппер', 'ГП ДВ', 'КП ДВ', 'ГС ДВ', 'КС ДВ', 'Криспи', 'Не Острые 4шт', 'Не Острые 8шт',
      'Острые 4шт', 'Острые 8шт', 'Самсы Гов 4шт', 'Самсы Гов 8шт', 'Самсы Кур 4шт', 'Самсы Кур 8шт',
      'Курица Сыр', 'Стикенсы 4шт', 'Стикенсы 8шт', 'Тести говядина', 'Тести курица', 'Фри',
      'Хот Дог класс', 'Хот Дог сырный', 'КС', 'ГС', 'Чизмакс', 'Чили', 'Кофе', 'Какао', 'Зерн.кофе',
    ]
  );
  assert.equal(new Set(CALC_ITEMS.map((it) => it.id)).size, CALC_ITEMS.length);
  assert.ok(CALC_ITEMS.every((it) => !('group' in it)));
});
