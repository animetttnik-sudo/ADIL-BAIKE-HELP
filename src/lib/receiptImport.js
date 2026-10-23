/**
 * Импорт «Позиций» из кассового «Отчёта по продажам».
 * Текст берётся из Live Text iOS (фото → выделить всё → скопировать) и вставляется в приложение.
 * Чистые функции без React/RN — проверяются node-тестом (tests/receiptImport.test.mjs).
 *
 * Live Text отдаёт строки по-разному:
 *   (a) «название  число» в одной строке;
 *   (b) сначала столбец названий, потом столбец чисел (или кусками);
 *   (c) вперемешку.
 * Разбор: строки-пары берём сразу, «только название» и «только число» склеиваем по порядку (FIFO).
 */
import { CALC_ITEMS } from './calc.js';

export const ALIAS_KEY = 'zp_alias_v1';

// ── нормализация ──────────────────────────────────────────────────────────────
const LAT2CYR = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', n: 'п', r: 'г' };
const CYR2LAT = { а: 'a', в: 'b', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p', т: 't', х: 'x', у: 'y', и: 'u', п: 'n', г: 'r' };
const isCyr = (ch) => /[а-я]/.test(ch);
const isLat = (ch) => /[a-z]/.test(ch);

/** Слово с буквами обеих азбук (OCR путает похожие) приводим к преобладающей. */
function fixScript(w) {
  let cy = 0;
  let la = 0;
  for (const ch of w) {
    if (isCyr(ch)) cy++;
    else if (isLat(ch)) la++;
  }
  if (cy && la) {
    const map = cy >= la ? LAT2CYR : CYR2LAT;
    w = [...w].map((ch) => map[ch] || ch).join('');
  }
  // цифры-двойники внутри кириллического слова: «чизм3кс», «т0рт»
  if (cy >= la && cy) w = w.replace(/([а-я])3(?=[а-я])/g, '$1з').replace(/([а-я])0(?=[а-я])/g, '$1о');
  return w;
}

const STOP = new Set(['с', 'со', 'и', 'в', 'на', 'из', 'c']);
// сокращения и падежи, которые встречаются в кассовых названиях
const SYN = {
  кур: 'курица', курицей: 'курица', курин: 'курица', куриный: 'курица', куриная: 'курица',
  гов: 'говядина', говядиной: 'говядина', говяж: 'говядина', говяжий: 'говядина',
  острый: 'острые', острая: 'острые', острое: 'острые', острыи: 'острые',
  класс: 'классический', классич: 'классический',
  cheeseburger: 'чизбургер', burger: 'бургер', hot: 'хот', dog: 'дог',
  тэсти: 'тести', тести: 'тести', tasty: 'тести', тейсти: 'тести',
  сыром: 'сыр', сырный: 'сырный',
  крылышки: 'крылья', крыло: 'крылья',
};

/** Название → список нормализованных слов. */
export function normTokens(s) {
  const t = String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/э/g, 'е')
    .replace(/(\d)([a-zа-я])/g, '$1 $2') // «4шт» → «4 шт»
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
  if (!t) return [];
  return t
    .split(' ')
    .map(fixScript)
    .map((w) => SYN[w] || w)
    .filter((w) => w && !STOP.has(w));
}
export const normName = (s) => normTokens(s).join(' ');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const isNum = (w) => /^\d+$/.test(w);

/** Похожесть двух слов 0..1. Числа — только точное совпадение (4шт ≠ 8шт). */
function wordSim(a, b) {
  if (a === b) return 1;
  if (isNum(a) || isNum(b)) return 0;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.startsWith(s)) return 0.9; // «кур» → «курица», «гамбурге» → «гамбургер»
  if (s.length >= 3 && s.length >= l.length * 0.6 && l.startsWith(s.slice(0, 3)) && lev(s, l.slice(0, s.length)) <= 1)
    return 0.8;
  const d = lev(a, b);
  const len = Math.max(a.length, b.length);
  if (len >= 3 && d <= 1) return 0.8; // «ход» → «хот», «прим» → «прайм»
  if (len >= 6 && d <= 2) return 0.7;
  return 0;
}

/** Похожесть строки чека и алиаса 0..1 (Dice по словам). */
export function nameScore(lineToks, aliasToks) {
  if (!lineToks.length || !aliasToks.length) return 0;
  const used = new Set();
  let sum = 0;
  for (const a of aliasToks) {
    let best = 0;
    let bi = -1;
    lineToks.forEach((w, i) => {
      if (used.has(i)) return;
      const s = wordSim(a, w);
      if (s > best) {
        best = s;
        bi = i;
      }
    });
    if (bi >= 0) used.add(bi);
    else if (isNum(a)) return 0; // у алиаса число (4/8 шт), в строке его нет — точно не то
    sum += best;
  }
  // число в строке, которого нет в алиасе (8 шт против «4 шт»)
  for (let i = 0; i < lineToks.length; i++) if (!used.has(i) && isNum(lineToks[i]) && aliasToks.some(isNum)) return 0;
  let score = (2 * sum) / (lineToks.length + aliasToks.length);
  // «не острые» против «острые» — разные позиции
  if (lineToks.includes('не') !== aliasToks.includes('не')) score *= 0.8;
  return score;
}

// ── справочник: позиция → как она пишется в кассе ─────────────────────────────
// weak — товар похож, но это решение пользователя (всегда «проверьте»)
export const POS_ALIASES = {
  bb: ['best burger говядина', 'best burger', 'бест бургер'],
  bc: ['best cheeseburger говядина', 'best cheeseburger', 'best cheese', 'бест чизбургер'],
  prime: ['prime cheeseburger', 'prime', 'прайм'],
  special: ['special burger', 'special', 'спешл'],
  bigG: ['биг бургер говядина', 'биг бургер с говядиной', 'биг говядина'],
  bigK: ['биг бургер курица', 'биг бургер с курицей', 'биг курица'],
  kp: ['гамбургер курица'],
  gpOm: ['гамбургер говядина с омлетом', 'гамбургер гов с омлетом'],
  gp: ['гамбургер говядина'],
  kpOm: ['гамбургер курица с омлетом', 'гамбургер кур с омлетом'],
  gipper: ['гиппер бургер', 'гиппер'],
  gpDv: ['двойной гамбургер говядина'],
  kpDv: ['двойной гамбургер курица'],
  gsDv: ['двойной чизбургер говядина'],
  ksDv: ['двойной чизбургер курица'],
  crispy: ['криспи бургер', 'криспи'],
  mild4: ['крылья не острые 4 шт', 'не острые 4 шт'],
  mild8: ['крылья не острые 8 шт', 'не острые 8 шт'],
  hot4: ['крылья острые 4 шт', 'острые 4 шт'],
  hot8: ['крылья острые 8 шт', 'острые 8 шт'],
  sg4: ['самсы с говядиной 4 шт', 'самсы гов 4 шт'],
  sg8: ['самсы с говядиной 8 шт', 'самсы гов 8 шт'],
  sk4: ['самсы с курицей 4 шт', 'самсы кур 4 шт'],
  sk8: ['самсы с курицей 8 шт', 'самсы кур 8 шт'],
  kurSyr: ['самсы с курицей и сыром', 'курица сыр'],
  st4: ['стикенсы 4 шт'],
  st8: ['стикенсы 8 шт'],
  tg: ['тести ролл говядина', 'тести говядина'],
  tk: ['тести ролл курица', 'тести курица'],
  fri: ['фри', 'картофель фри'],
  hdClassic: ['хот дог классический', 'хот дог класс'],
  hdCheese: ['хот дог сырный'],
  ks: ['чизбургер курица'],
  gs: ['чизбургер говядина'],
  cheesemax: ['чизмакс'],
  chili: ['чили бургер', 'чили'],
  coffee: ['кофе', { n: 'капучино', weak: true }, { n: 'латте', weak: true }, { n: 'американо', weak: true }, { n: 'эспрессо', weak: true }],
  cocoa: ['какао', { n: 'горячий молочный шоколад', weak: true }, { n: 'горячий шоколад', weak: true }],
  beans: ['зерновой кофе', 'зерн кофе'],
};

/** Слова товаров, которых нет в таблице: напитки, соусы, упаковка. */
const SKIP_WORDS = [
  'coca', 'cola', 'кола', 'пепси', 'pepsi', 'спрайт', 'sprite', 'фанта', 'fanta', 'вода', 'пико', 'pico', 'фьюсти', 'fusetea',
  'горилла', 'gorilla', 'соус', 'кетчуп', 'майонез', 'стаканы', 'стакан', 'пакет', 'крышка', 'трубочка', 'салфетки', 'чай', 'сок',
  'айран', 'лимонад', 'морс', 'компот', 'энергетик', 'адреналин', 'redbull', 'шорле', 'боржоми', 'газ', 'мороженое', 'коктейль',
];
const SKIP_TOK = SKIP_WORDS.map((w) => normTokens(w)[0]).filter(Boolean);

const ALIAS_TOKS = Object.entries(POS_ALIASES).flatMap(([id, list]) =>
  list.map((a) => (typeof a === 'string' ? { id, toks: normTokens(a), weak: false } : { id, toks: normTokens(a.n), weak: !!a.weak }))
);
export const ITEM_NAME = Object.fromEntries(CALC_ITEMS.map((it) => [it.id, it.name]));

/**
 * Сопоставить строку чека с позицией.
 * learned — { [normName]: id | 'skip' } (выбор пользователя запоминается).
 * status: 'auto' — уверенно; 'skip' — не позиция; 'check' — предложение, нужно подтвердить; 'unknown' — без предложения.
 */
export function matchName(name, learned = {}) {
  const key = normName(name);
  const toks = key ? key.split(' ') : [];
  if (learned && learned[key]) {
    const v = learned[key];
    return v === 'skip' ? { id: null, status: 'skip', score: 1, via: 'learned' } : { id: v, status: 'auto', score: 1, via: 'learned' };
  }
  const best = new Map(); // id → {score, weak}
  for (const a of ALIAS_TOKS) {
    const s = nameScore(toks, a.toks);
    const cur = best.get(a.id);
    if (!cur || s > cur.score) best.set(a.id, { score: s, weak: a.weak });
  }
  const ranked = [...best.entries()].sort((x, y) => y[1].score - x[1].score);
  const [id1, b1] = ranked[0] || [null, { score: 0 }];
  const s2 = ranked[1] ? ranked[1][1].score : 0;
  const isSkip = toks.some((w) => SKIP_TOK.some((k) => wordSim(k, w) >= 0.8));
  if (b1.score >= 0.88 && b1.score - s2 >= 0.08 && !b1.weak) return { id: id1, status: 'auto', score: b1.score, via: 'alias' };
  if (isSkip) return { id: null, status: 'skip', score: 1, via: 'skip' };
  if (b1.score >= 0.5) return { id: id1, status: 'check', score: b1.score, via: b1.weak ? 'weak' : 'fuzzy' };
  return { id: null, status: 'unknown', score: b1.score, via: 'none' };
}

// ── разбор текста ─────────────────────────────────────────────────────────────
const HEADER_RE = /(^|\s)(база|отч[её]т|продаж|итого|касса|кассир|смена|чек)/i;
const DATE_RE = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2})[:.](\d{2}))?|(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T]+(\d{1,2})[:.](\d{2}))?/;
const pad = (n) => String(n).padStart(2, '0');

function readDate(line) {
  const m = line.match(DATE_RE);
  if (!m) return null;
  if (m[1]) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, h: m[4] != null ? +m[4] : null, min: m[5] != null ? +m[5] : 0 };
  return { date: `${m[8]}-${pad(m[7])}-${pad(m[6])}`, h: m[9] != null ? +m[9] : null, min: m[10] != null ? +m[10] : 0 };
}

/** Строка — одно число (с шумом OCR: «1.», «О», «l», «З»). */
function asQty(line) {
  const t = line
    .replace(/[.,:;·'"`_\-–—|]+$/g, '')
    .replace(/^[.,:;·'"`_\-–—|]+/g, '')
    .trim();
  if (!t || t.length > 4) return null;
  const fixed = t.replace(/[OoОо]/g, '0').replace(/[lIІі|]/g, '1').replace(/[Зз]/g, '3').replace(/[Бб]/g, '6');
  return /^\d{1,4}$/.test(fixed) ? Number(fixed) : null;
}

/** «Название  число» в одной строке → {name, qty}; иначе null. */
function splitPair(line) {
  // число через пробелы в конце («Кола 0,5   24»); не путать с «0,5» / «350 мл»
  let m = line.match(/^(.*?\S)\s+(\d{1,4})[.,]?\s*$/);
  if (m && !/\d[.,]$/.test(m[1]) && /[a-zа-яё)]/i.test(m[1])) return { name: m[1].trim(), qty: Number(m[2]) };
  // приклеенное к букве: «…свеж овоща1»
  m = line.match(/^(.*[a-zа-яё.])(\d{1,3})\s*$/i);
  if (m && m[1].replace(/[^a-zа-яё]/gi, '').length >= 4) return { name: m[1].trim(), qty: Number(m[2]) };
  return null;
}

/**
 * Разобрать текст отчёта.
 * → { items: [{name, qty, raw}], warnings: string[], period: {from, to, date, time} | null, layout: 'inline'|'columns'|'mixed' }
 */
export function parseReceipt(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items = [];
  const names = [];
  const nums = [];
  const warnings = [];
  let from = null;
  let to = null;
  let inline = 0;
  let split = 0;
  for (const l of lines) {
    if (/^[=\-_*~.·\s]{3,}$/.test(l)) continue;
    const d = DATE_RE.test(l) ? readDate(l) : null;
    if (d) {
      if (/^\s*по\b/i.test(l) || (from && !to)) to = d;
      else from = d;
      continue;
    }
    if (HEADER_RE.test(l) && !/\d\s*$/.test(l)) continue;
    const q = asQty(l);
    if (q != null) {
      split++;
      if (names.length) items.push({ name: names.shift(), qty: q, raw: null });
      else nums.push(q);
      continue;
    }
    if (!/[a-zа-яё]{2}/i.test(l)) continue; // мусор без букв
    const p = splitPair(l);
    if (p) {
      inline++;
      items.push({ ...p, raw: l });
      continue;
    }
    split++;
    if (nums.length) items.push({ name: l, qty: nums.shift(), raw: null });
    else names.push(l);
  }
  for (const n of names) items.push({ name: n, qty: null, raw: null });
  if (names.length || nums.length)
    warnings.push(
      `Названий и чисел не поровну: ${names.length ? `без количества ${names.length}` : ''}${names.length && nums.length ? ', ' : ''}${
        nums.length ? `лишних чисел ${nums.length}` : ''
      }. Проверьте количества.`
    );
  let period = null;
  if (from) {
    const h = from.h;
    const time = h == null ? null : h >= 15 || h < 4 ? 'night' : 'day';
    period = { from, to, date: from.date, time };
  }
  return { items, warnings, period, layout: inline && split ? 'mixed' : split ? 'columns' : 'inline' };
}

/**
 * Полный разбор: строки с сопоставлением + сводка по позициям.
 * rows: [{key, name, qty, id, status, score}] — порядок как в чеке.
 */
export function buildImport(text, learned = {}) {
  const parsed = parseReceipt(text);
  const rows = parsed.items.map((it, i) => ({ key: `r${i}`, name: it.name, qty: it.qty, ...matchName(it.name, learned) }));
  return { ...parsed, rows };
}

/** Сводка по позициям из строк (choice: {[rowKey]: id | 'skip'} — решения пользователя). */
export function summarize(rows, choice = {}) {
  const by = {};
  for (const r of rows) {
    const c = choice[r.key];
    const id = c === 'skip' ? null : c || (r.status === 'skip' || r.status === 'unknown' ? null : r.id);
    if (!id || !r.qty) continue;
    (by[id] = by[id] || []).push(r);
  }
  return CALC_ITEMS.filter((it) => by[it.id]).map((it) => ({
    id: it.id,
    name: it.name,
    lines: by[it.id],
    qty: by[it.id].reduce((a, r) => a + r.qty, 0),
  }));
}
