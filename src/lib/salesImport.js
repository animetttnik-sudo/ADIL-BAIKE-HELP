/**
 * «Импорт PDF» в «Расчёте кассы»: строки отчёта продаж (СТмах → Microsoft Print to PDF) →
 * позиции кассы, напитки и зерновой кофе. Чистые функции — тесты в tests/salesImport.test.mjs.
 *
 * parseSalesLines(lines) → [{ name, qty, raw }] — строки «название … количество [цена сумма]»;
 *   заголовки, даты, «Итого/Всего», строки без букв или без количества — пропускаются.
 * matchProduct(name) → { group: 'calc'|'drink'|'coffee'|'sauce'|'cups', key, label, calcId? } или null.
 *   calcId — куда пишется в расчёт дня (позиция кассы, «Зерн.кофе», строка напитка/соуса/стаканов).
 * buildImport(lines) → { calc, drinks, coffee, sauces, cups, unknown } (сложены по key).
 */
import { CALC_ITEMS } from './calc.js';
import { drinkRowId, sortDrinks } from './extras.js';

// ── нормализация ──────────────────────────────────────────────────────────
// латинские буквы-двойники внутри русских слов и наоборот (СТмах печатает вперемешку)
const LAT2CYR = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };
const CYR2LAT = { а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'h', в: 'b' };
const isCyr = (ch) => /[а-яё]/.test(ch);
const isLat = (ch) => /[a-z]/.test(ch);

/** Нижний регистр, ё→е, двойники по большинству букв слова, пунктуация → пробел. */
export function norm(s) {
  const low = String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`’]/g, '')
    .replace(/[‐-―_–—]/g, '-');
  return low
    .split(/(\s+)/)
    .map((w) => {
      const c = [...w].filter(isCyr).length;
      const l = [...w].filter(isLat).length;
      if (c && l) return c >= l ? [...w].map((ch) => LAT2CYR[ch] || ch).join('') : [...w].map((ch) => CYR2LAT[ch] || ch).join('');
      return w;
    })
    .join('')
    .replace(/[^0-9a-zа-я.,%\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Транслит RU→латиница (для сравнения «бест бургер» ~ «best burger»). */
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const translit = (s) => [...s].map((ch) => (TR[ch] !== undefined ? TR[ch] : ch)).join('');

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ── строки отчёта ─────────────────────────────────────────────────────────
// \b в JS не работает с кириллицей — граница слова через пробел/конец
const SKIP = /^(итого|итог|всего|total|сумма|сум|наименование|название|товар|кол во|количество|цена|продажи|отчет|смена|кассир|касса|дата|время|чек|возврат|скидк\S*|оплат\S*|наличн\S*|безнал\S*|страница|page|ндс|нсп)(\s|$)/i;
const NUM = /^[-+]?\d+(?:[.,]\d+)?$/;
const UNIT = /^(л|l|лит|литр|литра|мл|ml|г|гр|g|кг|kg|шт|шт\.|pcs)$/i;
const toNum = (t) => Number(String(t).replace(',', '.'));

/** Разбор одной строки → { name, qty } или null. */
export function parseSalesLine(line, opts = {}) {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw || !/[a-zа-яё]/i.test(raw)) return null;
  if (/\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}:\d{2}/.test(raw) && !/(мл|ml|л|l)\b/i.test(raw)) return null; // дата/время
  if (SKIP.test(norm(raw))) return null;
  // «× 2», «x2», «2 шт», «= 180» → отдельные токены
  const toks = raw
    .replace(/(\s\d+(?:[.,]\d+)?)\s*(шт\.?|pcs)\s*$/i, '$1')
    .replace(/[×*]/g, ' x ')
    .replace(/=/g, ' = ')
    .replace(/\b[xх](\d)/gi, 'x $1')
    .split(' ')
    .filter(Boolean);
  // хвост чисел: с конца, пока токены — числа/знаки (x, =, сом)
  let i = toks.length;
  const tail = [];
  while (i > 0) {
    const t = toks[i - 1];
    if (NUM.test(t)) tail.unshift(toNum(t));
    else if (/^(x|х|=|сом|som|kgs|с)$/i.test(t)) {
      /* знак — пропускаем */
    } else break;
    i--;
  }
  let nameToks = toks.slice(0, i);
  // число сразу перед единицей (0,5 л) — уже в имени; голый объём «0,5»/«1,0» в начале хвоста перед количеством — тоже имя
  while (tail.length >= 2 && /^(0[.,]5|\.5|1[.,]0+|1[.,]5|0[.,]33|0[.,]25)$/.test(toks[i]) ) {
    nameToks = [...nameToks, toks[i]];
    tail.shift();
    i++;
  }
  // «Американо 350 2 …» — голое 350 (объём зернового кофе) перед числами, если оно не «кол-во × цена = сумма»
  if (toks[i] === '350' && tail.length >= 2) {
    const fits3 = tail.length === 3 && Math.abs(tail[0] * tail[1] - tail[2]) <= Math.max(1, tail[2] * 0.01);
    const fits2 = tail.length === 2 && tail[1] >= tail[0];
    if (!fits3 && !fits2) {
      nameToks = [...nameToks, toks[i]];
      tail.shift();
      i++;
    }
  }
  if (!nameToks.length || !tail.length) return null;
  const name = nameToks.join(' ').replace(/[\s.:;,-]+$/, '').trim();
  if (!/[a-zа-яё]/i.test(name) || UNIT.test(name)) return null;
  let qty = tail[0];
  // «кол-во цена сумма» или «цена кол-во сумма»: берём пару, произведение которой ≈ сумма
  if (tail.length >= 3) {
    const [a, b, c] = tail.slice(-3);
    // по умолчанию «кол-во цена сумма»; если в шапке «цена» стоит раньше «кол-во» — наоборот
    if (Math.abs(a * b - c) <= Math.max(1, c * 0.01)) qty = opts.priceFirst ? b : a;
  } else if (tail.length === 2) {
    // «кол-во сумма» (обычно) — первое; если первое дробное с копейками, а второе целое маленькое — второе
    qty = Number.isInteger(tail[0]) || tail[0] % 1 === 0 ? tail[0] : tail[1];
  }
  if (!(qty > 0) || qty > 100000) return null;
  return { name, qty: Math.round(qty * 1000) / 1000, raw };
}

/** Порядок колонок по шапке: «Цена … Кол-во» → priceFirst. */
export function headerOrder(lines) {
  for (const l of lines || []) {
    const n = norm(l);
    const q = n.search(/(^|\s)(кол во|количество|кол|qty)(\s|$)/);
    const p = n.search(/(^|\s)(цена|price)(\s|$)/);
    if (q >= 0 && p >= 0) return { priceFirst: p < q };
  }
  return { priceFirst: false };
}

export const parseSalesLines = (lines) => {
  const opts = headerOrder(lines);
  return (lines || []).map((l) => parseSalesLine(l, opts)).filter(Boolean);
};

// ── объём ─────────────────────────────────────────────────────────────────
/** 0.5 | 1 | null и имя без объёма. */
export function sizeOf(n) {
  const s = ` ${n} `;
  const half = /(^|[^\d.,])(0[.,]5|\.5)\s*(л|l|литр\w*)?(?=[^\d]|$)|(^|\D)500\s*(мл|ml)(?=\W|$)/;
  const one = /(^|[^\d.,])1([.,]0+)?\s*(л|l|литр\w*)(?=[^a-zа-я]|$)|(^|[^\d.,])1[.,]0+(?=\s|$)|(^|\D)1000\s*(мл|ml)(?=\W|$)/;
  if (half.test(s)) return { size: 0.5, rest: s.replace(half, ' ').replace(/\s+/g, ' ').trim() };
  if (one.test(s)) return { size: 1, rest: s.replace(one, ' ').replace(/\s+/g, ' ').trim() };
  return { size: null, rest: n };
}

// ── справочник ────────────────────────────────────────────────────────────
const has = (n, list) => list.some((a) => (a.length <= 3 ? new RegExp(`(^|\\s)${a}(\\s|$)`).test(n) : n.includes(a)));

const SODA = [
  { key: 'colaZero', label: 'Кола Зеро', test: (n) => has(n, ['zero', 'зеро', 'зиро']) && has(n, ['cola', 'кола', 'coca', 'кока', 'coke', 'кок']) },
  { key: 'cola', label: 'Кола', test: (n) => has(n, ['cola', 'кола', 'coca', 'кока', 'coke', 'кок кол']) },
  { key: 'fanta', label: 'Фанта', test: (n) => has(n, ['fanta', 'фанта', 'фант']) },
  { key: 'sprite', label: 'Спрайт', test: (n) => has(n, ['sprite', 'спрайт', 'спрайд']) },
];
const FUSE_NAMES = ['fuse', 'fuze', 'фьюс', 'фьюз', 'фьюсти', 'фьюзти', 'фузти', 'фуз ти', 'фьюс ти', 'фьюз ти'];
const FUSE_FLAV = [
  ['strawberry', 'клубника', ['клубн', 'strawb', 'клубник']],
  ['peach', 'персик', ['перс', 'peach']],
  ['mango', 'манго', ['манго', 'mango']],
  ['chamomile', 'ромашка', ['ромаш', 'chamom', 'camom']],
];
const PULPY_NAMES = ['pulpy', 'палпи', 'пулпи', 'пико', 'piko', 'pico', 'пикo'];
const PULPY_FLAV = [
  ['orange', 'апельсин', ['апельс', 'orange', 'апелс']],
  ['grape', 'виноград', ['виногр', 'grape']],
];
const BONAQUA = ['bonaqua', 'bon aqua', 'бонаква', 'бон аква', 'бонакуа', 'бон аквa'];

const COFFEE = [
  ['latte', 'Латте', ['латте', 'лате', 'latte', 'late']],
  ['cappuccino', 'Капучино', ['капучино', 'капуччино', 'cappuccino', 'capuccino', 'cappucino', 'капучин']],
  ['americano', 'Американо', ['американо', 'americano', 'amerikano']],
  ['raf', 'Раф', ['раф', 'raf']],
  ['mocha', 'Мокко', ['мокко', 'мока', 'mocha', 'mokko', 'mocca']],
  ['flatwhite', 'Флэт уайт', ['флэт уайт', 'флет уайт', 'флэт', 'flat white', 'flatwhite']],
  ['espresso', 'Эспрессо', ['эспрессо', 'эспресо', 'espresso', 'expresso']],
  ['cocoa', 'Какао', ['какао', 'cocoa', 'kakao']],
  ['tea', 'Чай', ['чай', 'tea']],
];

/** Синонимы позиций кассы (СТмах сокращает: «best ch», «best bur»). Остальное — по названию из CALC_ITEMS. */
const CALC_ALIASES = {
  bb: ['best burger', 'бест бургер', 'бест бурге', 'best bur', 'бестбургер'],
  bc: ['best cheese', 'best cheeseburger', 'бест чиз', 'бест чизбургер', 'best chees', 'бест чиза'],
  prime: ['prime', 'прайм', 'прайм бургер', 'prime burger'],
  special: ['special', 'спешл', 'спешиал', 'спешал', 'special burger'],
  bigG: ['биг говядина', 'биг гов', 'big beef', 'биг бургер говядина'],
  bigK: ['биг курица', 'биг кур', 'big chicken', 'биг бургер курица'],
  gipper: ['гиппер', 'гипер', 'hipper', 'gipper'],
  crispy: ['криспи', 'crispy', 'криспи бургер'],
  fri: ['фри', 'картофель фри', 'картошка фри', 'fries', 'french fries', 'фри стандарт'],
  hdClassic: ['хот дог класс', 'хот дог классический', 'хотдог класс', 'hot dog classic', 'хот-дог класс'],
  hdCheese: ['хот дог сырный', 'хотдог сырный', 'hot dog cheese', 'хот-дог сырный'],
  cheesemax: ['чизмакс', 'чиз макс', 'cheesemax', 'cheese max'],
  chili: ['чили', 'chili', 'chilli'],
  kurSyr: ['курица сыр', 'курица с сыром'],
  tg: ['тести говядина', 'тести гов', 'tasty beef'],
  tk: ['тести курица', 'тести кур', 'tasty chicken'],
  coffee: ['кофе'],
  cocoa: ['какао'],
  beans: ['зерн кофе', 'зерновой кофе', 'зерн.кофе'],
};
const CALC_INDEX = CALC_ITEMS.map((it) => {
  const names = [it.name, ...(CALC_ALIASES[it.id] || [])].map(norm);
  return { id: it.id, label: it.name, names, lat: names.map(translit) };
});

/** Каждое слово ввода — начало соответствующего слова варианта (усечённые названия кассы). */
const prefixMatch = (inp, alias) => {
  const a = inp.split(' ');
  const b = alias.split(' ');
  return a.length === b.length && a.every((w, i) => b[i].startsWith(w) && (w.length >= 2 || w === b[i]));
};

function matchCalc(n) {
  const nl = translit(n);
  let best = null;
  for (const it of CALC_INDEX) {
    for (let k = 0; k < it.names.length; k++) {
      const a = it.names[k];
      const al = it.lat[k];
      let score = null;
      if (n === a || nl === al) score = 0;
      else if (a.length > 3 && (prefixMatch(n, a) || prefixMatch(nl, al))) score = 1;
      else if (a.length >= 5 && n.length >= 5) {
        const d = Math.min(lev(n, a), lev(nl, al));
        if (d <= (a.length >= 10 ? 2 : 1)) score = 1 + d;
      }
      if (score != null && (!best || score < best.score)) best = { score, it };
    }
  }
  return best ? { group: 'calc', key: `calc:${best.it.id}`, label: best.it.label, calcId: best.it.id } : null;
}

// соусы — порядок С Ч Б К: [ключ, название, id строки, полные слова, корни (только рядом со словом «соус»)]
const SAUCES = [
  ['cheese', 'Сырный', 'sc_cheese', ['сырный', 'cheese', 'сыр'], ['сыр', 'chees']],
  ['garlic', 'Чесночный', 'sc_garlic', ['чесночный', 'garlic'], ['чесн', 'garl']],
  ['bbq', 'Барбекю', 'sc_bbq', ['барбекю', 'барбекью', 'bbq', 'barbecue', 'barbeque'], ['барбек', 'bbq', 'barbe']],
  ['ketchup', 'Кетчуп', 'sc_ketchup', ['кетчуп', 'кетчап', 'ketchup'], ['кетч', 'кетчап', 'ketch']],
];
const SAUCE_WORDS = /(^|\s)(соус\S*|sauce\S*|дип|dip)(?=\s|$)/;
const PORTION = /(^|\s)\d+\s*(г|гр|g|мл|ml)(?=\s|$)/g;
/**
 * Соус: «Соус сырный», «Cheese sauce 25г» — по корню; одно слово без «соус» («Сырный», «Кетчуп», «BBQ»,
 * «Чесноч.») — только полное слово или его начало (≥3 букв), чтобы «Cheeseburger»/«Хот дог сырный» не стали соусом.
 */
function matchSauce(n) {
  const withWord = SAUCE_WORDS.test(n);
  const rest = n.replace(SAUCE_WORDS, ' ').replace(PORTION, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const toks = rest.split(' ').filter(Boolean);
  let f;
  if (withWord) f = SAUCES.find(([, , , full, roots]) => toks.some((t) => full.includes(t) || roots.some((r) => t.startsWith(r))));
  else if (toks.length === 1) {
    const t = toks[0];
    f = SAUCES.find(([, , , full]) => full.some((w) => w === t || (t.length >= 3 && w.length > 3 && w.startsWith(t))));
  }
  return f ? { group: 'sauce', key: `sauce:${f[0]}`, label: f[1], calcId: f[2] } : null;
}

const withRow = (m) => ({ ...m, calcId: drinkRowId(m.key) });

/** Распознать название позиции отчёта. */
export function matchProduct(name) {
  const n0 = norm(name);
  if (!n0) return null;
  // «Стаканы одноразовые» — так и пишутся
  if (/(стакан\S*\s+одноразов|одноразов\S*\s+стакан)/.test(n0)) {
    return { group: 'cups', key: 'cups:disp', label: 'Стаканы одноразовые', calcId: 'cupsDisp' };
  }
  // зерновой кофе: «350мл» в конце или просто число 350 в названии
  if (/(^|\D)350(\D|$)/.test(n0)) {
    const base = n0.replace(/350\s*(мл|ml|m l)\.?/g, '').trim();
    const c = COFFEE.find(([, , al]) => has(base, al));
    const pretty = c ? c[1] : String(name).replace(/\s*350\s*(мл|ml)?\.?\s*/i, ' ').trim().replace(/^./, (x) => x.toUpperCase());
    return { group: 'coffee', key: `coffee:${c ? c[0] : norm(pretty)}`, label: `${pretty} 350мл`, calcId: 'beans' };
  }
  const sauce = matchSauce(n0);
  if (sauce) return sauce;
  const { size, rest } = sizeOf(n0);
  const n = rest;
  if (has(n, FUSE_NAMES)) {
    const f = FUSE_FLAV.find(([, , al]) => has(n, al));
    return withRow({ group: 'drink', key: `fuse:${f ? f[0] : '?'}`, label: `Фьюсти${f ? ` ${f[1]}` : ''} 0,5` });
  }
  if (has(n, PULPY_NAMES)) {
    const f = PULPY_FLAV.find(([, , al]) => has(n, al));
    return withRow({ group: 'drink', key: `pulpy:${f ? f[0] : '?'}`, label: `Пико${f ? ` ${f[1]}` : ''} 0,5` });
  }
  if (has(n, BONAQUA)) return withRow({ group: 'drink', key: 'bonaqua:0.5', label: 'Бон аква 0,5' });
  const soda = SODA.find((d) => d.test(n));
  if (soda) {
    const sz = size === 1 ? '1л' : size === 0.5 ? '0,5' : '';
    return withRow({ group: 'drink', key: `${soda.key}:${size || '?'}`, label: sz ? `${soda.label} ${sz}` : `${soda.label} (объём?)` });
  }
  return matchCalc(n0);
}

/** Строки PDF → сгруппированный результат импорта. */
export function buildImport(lines) {
  const rows = parseSalesLines(lines);
  const acc = { calc: new Map(), drink: new Map(), coffee: new Map(), sauce: new Map(), cups: new Map() };
  const unknown = [];
  for (const r of rows) {
    const m = matchProduct(r.name);
    // напиток без объёма/вкуса некуда записать — пусть будет виден в «Не распознано»
    if (!m || (m.group === 'drink' && !m.calcId)) {
      unknown.push({ name: r.name, qty: r.qty });
      continue;
    }
    const g = acc[m.group];
    const cur = g.get(m.key);
    if (cur) cur.qty += r.qty;
    else g.set(m.key, { ...m, qty: r.qty });
  }
  const list = (g) => [...g.values()].map((x) => ({ ...x, qty: Math.round(x.qty * 1000) / 1000 }));
  return {
    calc: list(acc.calc),
    drinks: sortDrinks(list(acc.drink)),
    coffee: list(acc.coffee),
    sauces: list(acc.sauce),
    cups: list(acc.cups),
    unknown,
    rows: rows.length,
  };
}

/**
 * Количества для расчёта дня (заменяют подсчёт — повторный импорт не удваивает): позиции кассы, напитки,
 * соусы, одноразовые стаканы — как в отчёте; зерновой кофе — сумма всех «… 350» в «Зерн.кофе»
 * (из него же — зерновые крышки и стаканы; из «Кофе» — белые крышки и стаканы кофе). { [calcId]: qty }.
 */
export function calcCountsFromImport(imp) {
  const out = {};
  for (const x of [...(imp.calc || []), ...(imp.drinks || []), ...(imp.sauces || []), ...(imp.cups || [])]) {
    if (x.calcId) out[x.calcId] = (out[x.calcId] || 0) + x.qty;
  }
  const beans = (imp.coffee || []).reduce((a, x) => a + x.qty, 0);
  if (beans) out.beans = (out.beans || 0) + beans;
  return out;
}
