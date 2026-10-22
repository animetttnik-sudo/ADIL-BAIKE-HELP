/**
 * Расчёт смены — перенос Excel-калькулятора (Лист1) один в один.
 * Чистые функции без React/RN: используются экраном «Расчёт» и node-тестом
 * (tests/calc.test.mjs).
 *
 * Количество по позиции = сумма всех подсчётов (в Excel — столбцы C:F).
 */

export const CALC_KEY = 'zp_calc_v1';

export const CALC_GROUPS = [
  { id: 'burgers', title: 'Бургеры' },
  { id: 'classic', title: 'КП · ГП · КС · ГС' },
  { id: 'chicken', title: 'Курица и наггетсы' },
  { id: 'samsa', title: 'Самсы' },
  { id: 'rolls', title: 'Роллы' },
  { id: 'fries', title: 'Фри и хот-доги' },
  { id: 'drinks', title: 'Напитки', note: 'на зарплату не влияют' },
];

export const CALC_ITEMS = [
  { id: 'bb', name: 'best burger', group: 'burgers' },
  { id: 'bc', name: 'best cheese', group: 'burgers' },
  { id: 'prime', name: 'PRIME', group: 'burgers' },
  { id: 'special', name: 'SPECIAL', group: 'burgers' },
  { id: 'bigG', name: 'Биг Говядина', group: 'burgers' },
  { id: 'bigK', name: 'Биг Курица', group: 'burgers' },
  { id: 'gipper', name: 'Гиппер', group: 'burgers' },
  { id: 'crispy', name: 'Криспи', group: 'burgers' },
  { id: 'cheesemax', name: 'Чизмакс', group: 'burgers' },
  { id: 'chili', name: 'Чили', group: 'burgers' },

  { id: 'kp', name: 'КП', group: 'classic' },
  { id: 'gp', name: 'ГП', group: 'classic' },
  { id: 'kpOm', name: 'КП ОМ', group: 'classic' },
  { id: 'gpOm', name: 'ГП ОМ', group: 'classic' },
  { id: 'kpDv', name: 'КП ДВ', group: 'classic' },
  { id: 'gpDv', name: 'ГП ДВ', group: 'classic' },
  { id: 'ks', name: 'КС', group: 'classic' },
  { id: 'gs', name: 'ГС', group: 'classic' },
  { id: 'ksDv', name: 'КС ДВ', group: 'classic' },
  { id: 'gsDv', name: 'ГС ДВ', group: 'classic' },

  { id: 'mild4', name: 'Не Острые 4шт', group: 'chicken' },
  { id: 'mild8', name: 'Не Острые 8шт', group: 'chicken' },
  { id: 'hot4', name: 'Острые 4шт', group: 'chicken' },
  { id: 'hot8', name: 'Острые 8шт', group: 'chicken' },
  { id: 'st4', name: 'Стикенсы 4шт', group: 'chicken' },
  { id: 'st8', name: 'Стикенсы 8шт', group: 'chicken' },

  { id: 'sg4', name: 'Самсы Гов 4шт', group: 'samsa' },
  { id: 'sg8', name: 'Самсы Гов 8шт', group: 'samsa' },
  { id: 'sk4', name: 'Самсы Кур 4шт', group: 'samsa' },
  { id: 'sk8', name: 'Самсы Кур 8шт', group: 'samsa' },
  { id: 'kurSyr', name: 'Курица Сыр', group: 'samsa' },

  { id: 'tg', name: 'Тести говядина', group: 'rolls' },
  { id: 'tk', name: 'Тести курица', group: 'rolls' },

  { id: 'fri', name: 'Фри', group: 'fries' },
  { id: 'hdClassic', name: 'Хот Дог класс', group: 'fries' },
  { id: 'hdCheese', name: 'Хот Дог сырный', group: 'fries' },

  { id: 'coffee', name: 'Кофе', group: 'drinks' },
  { id: 'cocoa', name: 'Какао', group: 'drinks' },
  { id: 'beans', name: 'Зерн.кофе', group: 'drinks' },
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
];

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
export function computeCalc(counts = {}, rates = DEFAULT_RATES, staff = DEFAULT_STAFF) {
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
  const base = share + num(R.lunch);
  const pay = {
    ryadDay: base + num(R.dayBonus),
    ryadNight: base + num(R.nightBonus),
    kassDay: num(R.salary) + num(R.cashBonus) + base + num(R.dayBonus),
    kassNight: num(R.salary) + num(R.cashBonus) + base + num(R.nightBonus),
  };

  return { usage, summary, total, unit, positions, output, people, share, pay };
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
