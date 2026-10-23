/**
 * Расчёт смены — перенос Excel-калькулятора (Лист1) один в один.
 * Чистые функции без React/RN: используются экраном «Расчёт» и node-тестом
 * (tests/calc.test.mjs).
 *
 * Количество по позиции = сумма всех подсчётов (в Excel — столбцы C:F).
 */

export const CALC_KEY = 'zp_calc_v1';

/**
 * Позиции — ОДНИМ списком строго в порядке строк Excel (Лист1, столбец B, строки 3–45),
 * подписи как в таблице. Напитки в Excel — отдельные ячейки I18–I20, идут в конце.
 * Данные zp_calc_v1 хранятся по id (counts[id]), поэтому порядок можно менять свободно.
 */
export const CALC_ITEMS = [
  { id: 'bb', name: 'best burger' }, // B3
  { id: 'bc', name: 'best cheese' }, // B4
  { id: 'prime', name: 'PRIME' }, // B5
  { id: 'special', name: 'SPECIAL' }, // B6
  { id: 'bigG', name: 'Биг Говядина' }, // B7
  { id: 'bigK', name: 'Биг Курица' }, // B8
  { id: 'kp', name: 'КП' }, // B9
  { id: 'gpOm', name: 'ГП ОМ' }, // B10
  { id: 'gp', name: 'ГП' }, // B11
  { id: 'kpOm', name: 'КП ОМ' }, // B12
  { id: 'gipper', name: 'Гиппер' }, // B13
  { id: 'gpDv', name: 'ГП ДВ' }, // B14
  { id: 'kpDv', name: 'КП ДВ' }, // B15
  { id: 'gsDv', name: 'ГС ДВ' }, // B16
  { id: 'ksDv', name: 'КС ДВ' }, // B17
  { id: 'crispy', name: 'Криспи' }, // B18
  { id: 'mild4', name: 'Не Острые 4шт' }, // B20
  { id: 'mild8', name: 'Не Острые 8шт' }, // B21
  { id: 'hot4', name: 'Острые 4шт' }, // B22
  { id: 'hot8', name: 'Острые 8шт' }, // B23
  { id: 'sg4', name: 'Самсы Гов 4шт' }, // B25
  { id: 'sg8', name: 'Самсы Гов 8шт' }, // B26
  { id: 'sk4', name: 'Самсы Кур 4шт' }, // B27
  { id: 'sk8', name: 'Самсы Кур 8шт' }, // B28
  { id: 'kurSyr', name: 'Курица Сыр' }, // B29
  { id: 'st4', name: 'Стикенсы 4шт' }, // B31
  { id: 'st8', name: 'Стикенсы 8шт' }, // B32
  { id: 'tg', name: 'Тести говядина' }, // B34
  { id: 'tk', name: 'Тести курица' }, // B35
  { id: 'fri', name: 'Фри' }, // B37
  { id: 'hdClassic', name: 'Хот Дог класс' }, // B39
  { id: 'hdCheese', name: 'Хот Дог сырный' }, // B40
  { id: 'ks', name: 'КС' }, // B42
  { id: 'gs', name: 'ГС' }, // B43
  { id: 'cheesemax', name: 'Чизмакс' }, // B44
  { id: 'chili', name: 'Чили' }, // B45
  { id: 'coffee', name: 'Кофе', note: 'на зарплату не влияет' }, // I18
  { id: 'cocoa', name: 'Какао', note: 'на зарплату не влияет' }, // I19
  { id: 'beans', name: 'Зерн.кофе', note: 'на зарплату не влияет' }, // I20
];

/** Ставки (строка 114–115 Excel). */
export const DEFAULT_RATES = {
  salary: 400, // оклад кассира
  cashBonus: 400, // П\касса
  perItem: 10, // за одну позицию (выработка = позиции × ставка)
  mentor: 300, // наставник
  stops: 150, // мал. остановки
  lunch: 140, // обед
  dayBonus: 300, // П\ряд\день
  nightBonus: 200, // П\ряд\ночь
  // «промежутка» — сотрудник между сменами: сколько часов из смены он берёт (доля в делёжке выработки)
  gapNightH: 4.5, // часов ночной смены
  gapDayH: 2.5, // часов дневной смены
  shiftH: 12, // длина смены, ч
};

export const RATE_FIELDS = [
  ['salary', 'Оклад кассира'],
  ['cashBonus', 'Премия за кассу'],
  ['perItem', 'За одну позицию'],
  ['lunch', 'Обед'],
  ['dayBonus', 'Премия рядовая · день'],
  ['nightBonus', 'Премия рядовая · ночь'],
  ['mentor', 'Наставник'],
  ['stops', 'Мал. остановки'],
  ['gapNightH', 'Промежутка ночью, ч', 'h'],
  ['gapDayH', 'Промежутка днём, ч', 'h'],
  ['shiftH', 'Длина смены, ч', 'h'],
];

/**
 * Доля «промежутки» в делёжке выработки смены: часы промежутки / длина смены (0…1).
 * Ночь 4,5 из 12 = 0,375; день 2,5 из 12 ≈ 0,208.
 */
export function gapWeight(rates, time) {
  const R = { ...DEFAULT_RATES, ...(rates || {}) };
  const h = time === 'day' ? R.gapDayH : R.gapNightH;
  const len = num(R.shiftH) || 12;
  return Math.min(1, num(h) / len);
}

export const DEFAULT_STAFF = 3;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Сумма подсчётов позиции. Принимает массив подсчётов или число. */
export function itemTotal(v) {
  if (Array.isArray(v)) return v.reduce((a, x) => a + num(x), 0);
  return num(v);
}

/** Округление для показа дробных расходов (Пай, Лук фри): до 3 знаков, без хвостов float. */
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * counts — { [itemId]: number[] | number }
 * Возвращает расход ингредиентов, сводку, позиции, выработку и оплату по ролям.
 */
export function computeCalc(counts = {}, rates = DEFAULT_RATES, staff = DEFAULT_STAFF, gap = false) {
  const R = { ...DEFAULT_RATES, ...(rates || {}) };
  const c = (id) => itemTotal(counts[id]);

  // --- расход (C50..C81)
  const bunsReg =
    c('bb') + c('bc') + c('kp') + c('gpOm') + c('gp') + c('kpOm') + c('gpDv') + c('kpDv') +
    c('gsDv') + c('ksDv') + c('ks') + c('gs') + c('cheesemax');
  const bunsYel = c('bigG') + c('bigK') + c('gipper') + c('crispy') + c('chili') + c('prime') + c('special');
  const g = 2 * c('gpDv') + 2 * c('gsDv') + c('bb') + c('bc') + c('gpOm') + c('gp') + c('gs');
  const gg = c('gipper') + c('chili');
  const gBig = c('prime') + c('special');
  const k = 2 * c('kpDv') + 2 * c('ksDv') + c('kp') + c('kpOm') + c('ks') + c('cheesemax');
  const kg = c('crispy');
  const cheese = 2 * c('gsDv') + 2 * c('ksDv') + c('ks') + c('gs') + c('cheesemax') + c('bc');
  const hochland = 2 * c('tg') + 2 * c('tk') + c('hdCheese') + c('gipper');
  const friedCheese = c('prime');
  const horse = c('special');
  const omelet = c('gpOm') + c('kpOm');
  const sticks = 4 * c('st4') + 8 * c('st8');
  const mild = 4 * c('mild4') + 8 * c('mild8');
  const hot = 4 * c('hot4') + 8 * c('hot8');
  const lavash = c('tg') + c('tk');
  const sg = 4 * c('sg4') + 8 * c('sg8');
  const sk = 4 * c('sk4') + 8 * c('sk8');
  const kurSyr = 5 * c('kurSyr');
  const hotdog = c('hdClassic') + c('hdCheese');
  const meatG = c('bigG') + c('tg');
  const meatK = c('bigK') + c('tk');
  const pie = r3(lavash * 0.04);
  const onion = r3(c('special') * 0.015);
  const unit =
    bunsReg + bunsYel + lavash + hotdog + (sticks + mild + hot) / 4 + (sg + sk) / 4 + kurSyr / 5 + c('fri');

  const usage = [
    ['Булочки обыч', bunsReg],
    ['Булочки желт', bunsYel],
    ['Г', g],
    ['Гг', gg],
    ['Г большой', gBig],
    ['К', k],
    ['Кг', kg],
    ['Сыр', cheese],
    ['Хохланд', hochland],
    ['Сыр жареный', friedCheese],
    ['Конина', horse],
    ['Омлет', omelet],
    ['Стикенсы', sticks],
    ['Не Остр', mild],
    ['Острые', hot],
    ['Лаваш', lavash],
    ['Сг', sg],
    ['Ск', sk],
    ['Кур Сыр', kurSyr],
    ['Хот Дог', hotdog],
    ['Сосиска', hotdog],
    ['Мясо Гов', meatG],
    ['Мясо Кур', meatK],
    ['Пай', pie],
    ['Лук фри', onion],
    ['Единица', unit],
  ].map(([label, value]) => ({ label, value }));

  // --- сводка (J16..J34); inTotal — входит ли в «Общее»
  const summary = [
    ['Бургеры', bunsReg, true],
    ['Фри', c('fri'), true],
    ['Кофе', c('coffee'), false],
    ['Какао', c('cocoa'), false],
    ['Зерн.кофе', c('beans'), false],
    ['Chicken drops', sticks / 4, true],
    ['Крылышки', (mild + hot) / 4, true],
    ['Тэсти ролл', lavash, true],
    ['Биг бургеры', c('bigG') + c('bigK'), true],
    ['Чили бур.', c('chili'), true],
    ['Стейк бур.', c('crispy'), true],
    ['Самсы', (sg + sk) / 4 + kurSyr / 5, true],
    ['Гиппер бур.', c('gipper'), true],
    ['ХД сырный', c('hdCheese'), true],
    ['ХД классич.', c('hdClassic'), true],
    ['С омлетом', omelet, false],
    ['Сырный бургер', friedCheese, true],
    ['Конина бургер', horse, true],
  ].map(([label, value, inTotal]) => ({ label, value, inTotal }));
  const total = summary.reduce((a, s) => a + (s.inTotal ? s.value : 0), 0);

  // --- оплата (C115, M115, J4..J10). Заказы курицы/самс — штуками заказов, не ×4/×8.
  const positions =
    bunsReg + bunsYel + lavash + hotdog +
    c('mild4') + c('mild8') + c('hot4') + c('hot8') +
    c('sg4') + c('sg8') + c('sk4') + c('sk8') + c('kurSyr') +
    c('st4') + c('st8') + c('fri');
  const output = positions * num(R.perItem);
  const people = Math.max(1, Math.round(num(staff)) || 1);
  const share = output / people;
  // Промежутка: в Excel делится только выработка (M115 / J2); оклад, премия кассира, обед и П\ряд —
  // фиксированные суммы каждому, не из общих денег. Поэтому промежутка — дробный сотрудник
  // только в делёжке выработки: выработка / (сотрудники + доля). Его оклад 200 платит работодатель.
  const split = (time) => {
    const w = gap ? gapWeight(R, time) : 0;
    const sh = output / (people + w);
    return { weight: w, share: sh, take: output - sh * people, loss: share - sh };
  };
  const gDay = split('day');
  const gNight = split('night');
  const lunch = num(R.lunch);
  const pay = {
    ryadDay: gDay.share + lunch + num(R.dayBonus),
    ryadNight: gNight.share + lunch + num(R.nightBonus),
    kassDay: num(R.salary) + num(R.cashBonus) + gDay.share + lunch + num(R.dayBonus),
    kassNight: num(R.salary) + num(R.cashBonus) + gNight.share + lunch + num(R.nightBonus),
  };
  // gap.day / gap.night: weight — доля, share — доля выработки каждого, take — сколько промежутка
  // забирает из выработки смены всего, loss — насколько меньше выходит у каждого (и у меня)
  const gapInfo = gap ? { day: gDay, night: gNight } : null;

  return { usage, summary, total, unit, positions, output, people, share, pay, gap: gapInfo };
}

/** Зарплата для выбранной роли/смены + отмеченные бонусы. */
export function ownPay(result, rates, { role = 'kass', time = 'night', mentor = false, stops = false } = {}) {
  const R = { ...DEFAULT_RATES, ...(rates || {}) };
  const key = (role === 'ryad' ? 'ryad' : 'kass') + (time === 'day' ? 'Day' : 'Night');
  return result.pay[key] + (mentor ? num(R.mentor) : 0) + (stops ? num(R.stops) : 0);
}

/** Есть ли в подсчётах хоть одна ненулевая позиция. */
export function hasCounts(counts = {}) {
  return Object.keys(counts).some((k) => itemTotal(counts[k]) > 0);
}

export function shiftTitle(role, time) {
  return `${time === 'day' ? 'день' : 'ночь'} ${role === 'ryad' ? 'ряд' : 'касса'}`;
}
