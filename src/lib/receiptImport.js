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
    .replace(/([а-я])\/([а-я])/g, '$1у$2') // «Гамб/ргер»: OCR видит «у» как «/»
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
  if (len >= 5 && d <= 2) return 0.7; // «санси» → «самсы», «чизбергур» → «чизбургер»
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

/** Строка — только цифры (с шумом OCR: «1.», «О», «l», «З») → строка цифр; иначе null. */
function asDigits(line) {
  const t = line
    .replace(/[.,:;·'"`_\-–—|]+$/g, '')
    .replace(/^[.,:;·'"`_\-–—|]+/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!t || t.length > 60) return null;
  const fixed = t.replace(/[OoОо]/g, '0').replace(/[lIІі|]/g, '1').replace(/[Зз]/g, '3').replace(/[Бб]/g, '6');
  return /^\d+$/.test(fixed) ? fixed : null;
}

/** «Название  число» в одной строке → {name, qty}; иначе null. */
function splitPair(line) {
  // число через пробелы в конце («Кола 0,5   24»); не путать с «0,5» / «350 мл»
  let m = line.match(/^(.*?\S)\s+(\d{1,3})[.,]?\s*$/);
  if (m && !/\d[.,]$/.test(m[1]) && /[a-zа-яё)]/i.test(m[1])) return { name: m[1].trim(), qty: Number(m[2]) };
  // приклеенное к букве: «…свеж ов1»
  m = line.match(/^(.*[a-zа-яё.])(\d{1,3})\s*$/i);
  if (m && m[1].replace(/[^a-zа-яё]/gi, '').length >= 4) return { name: m[1].trim(), qty: Number(m[2]) };
  return null;
}

// ── выравнивание «столбец названий ↔ столбец чисел» ───────────────────────────
// Live Text отдаёт колонку чисел кусками: отдельными строками («5», «33») или одной склеенной строкой
// на весь кусок («123525323511721» = 1,2,3,5,2,5,3,23,5,11,7,2,1), а короткие цифры иногда теряет.
// Подбираем разбиение по вероятностям: у каждой строки ожидаемое количество m (история смен или
// типичное), q ~ лог-нормальное вокруг m. Сомнительное — помечаем, пропавшее — «?».
const SIGMA = 1.1;
const LEAD_MISS = 2.5; // у названий в начале куска цифры теряются чаще (числа идут после своего названия)
const MID_MISS = 6;
const EXTRA = 6; // лишнее число/цифра
const MARGIN = 2; // разрыв с лучшей альтернативой, ниже которого значение «проверьте»
const qCost = (q, m) => {
  const d = Math.log(q) - Math.log(Math.max(1, m));
  return (d * d) / (2 * SIGMA * SIGMA) + 0.15 * Math.log(q);
};

/**
 * names: [{m}], tokens: ['22', '123525…'] → { cost, qty: [q|null], extra }.
 * forbid: [i, q] — запретить строке i значение q (для оценки уверенности).
 */
function alignGroup(names, tokens, forbid, lenient = false) {
  const n = names.length;
  const T = tokens.length;
  const memo = new Map();
  // 1–2 одиночных числа после нескольких названий (как «22» у Live Text) — относятся к нижним названиям
  const fewTok = T <= 2 && tokens.every((x) => x.length <= 2);
  const go = (i, t, pp, st) => {
    if (i === n && t === T) return { c: 0, a: null };
    const key = ((i * 128 + t) * 64 + pp) * 2 + st;
    if (memo.has(key)) return memo.get(key);
    let best = { c: Infinity, a: null };
    const tryIt = (c, a, ni, nt, np, ns) => {
      if (c >= best.c) return;
      const r = go(ni, nt, np, ns);
      if (c + r.c < best.c) best = { c: c + r.c, a: { ...a, next: r.a } };
    };
    // строка без числа
    if (i < n) tryIt(lenient || (!st && fewTok) ? LEAD_MISS : MID_MISS, { i, q: null }, i + 1, t, pp, st);
    if (t < T) {
      const tok = tokens[t];
      const L = tok.length;
      if (i < n) {
        if (L <= 2) {
          // короткая строка — одно число
          const q = Number(tok);
          if (q > 0 && !(forbid && forbid[0] === i && forbid[1] === q)) tryIt(qCost(q, names[i].m), { i, q }, i + 1, t + 1, 0, 1);
        } else {
          for (let l = 1; l <= 3 && pp + l <= L; l++) {
            if (tok[pp] === '0') break;
            const q = Number(tok.slice(pp, pp + l));
            if (q < 1 || q > 199) continue;
            if (forbid && forbid[0] === i && forbid[1] === q) continue;
            const end = pp + l === L;
            tryIt(qCost(q, names[i].m), { i, q }, i + 1, end ? t + 1 : t, end ? 0 : pp + l, 1);
          }
        }
      }
      // лишнее: целое число без строки или хвост цифр
      if (pp === 0) tryIt(EXTRA, { x: 1 }, i, t + 1, 0, st);
      else tryIt(EXTRA * 0.7 * (L - pp), { x: L - pp }, i, t + 1, 0, st);
    }
    memo.set(key, best);
    return best;
  };
  const r = go(0, 0, 0, 0);
  const qty = Array(n).fill(null);
  let extra = 0;
  for (let a = r.a; a; a = a.next) {
    if (a.x) extra += a.x;
    else if (a.q != null) qty[a.i] = a.q;
  }
  return { cost: r.c, qty, extra };
}

function resolveGroup(items, pend, tokens, warnings, chunks) {
  if (!pend.length) {
    if (tokens.length) warnings.push(`Лишние числа без названия: ${tokens.join(', ')}.`);
    return;
  }
  const names = pend.map((k) => items[k]);
  const best = alignGroup(names, tokens);
  const long = tokens.some((t) => t.length > 2);
  const missed = best.qty.filter((q) => q == null).length;
  const digits = tokens.reduce((a, t) => a + t.length, 0);
  // склеенная строка однозначна, только если цифр ровно столько, сколько строк (все однозначные)
  const forced = long && !missed && !best.extra && digits === pend.length && !tokens.join('').includes('0');
  // гипотеза «iPhone потерял цифры» (пропуск дешёвый): раскладывает иначе — цифры, скорее всего, потеряны
  const lost = long && !forced ? alignGroup(names, tokens, null, true) : null;
  const differs = !!lost && lost.qty.some((q, ix) => q !== best.qty[ix]);
  pend.forEach((k, ix) => {
    const it = items[k];
    it.qty = best.qty[ix];
    if (it.qty == null) return;
    // всё из склеенной строки — «проверьте по фото» с подобранным значением
    if (long && !forced) {
      it.qtyCheck = true;
      it.chunk = chunks.length;
      return;
    }
    const alt = alignGroup(names, tokens, [ix, it.qty]);
    if (alt.cost - best.cost < MARGIN) it.qtyCheck = true;
  });
  if (long && !forced) {
    const a = names[0].name;
    const b = names[names.length - 1].name;
    chunks.push({ from: a, to: b, lost: !!(missed || best.extra || differs), size: pend.length });
    warnings.push(
      missed || best.extra || differs
        ? `«${a}» … «${b}»: iPhone склеил числа и, похоже, потерял часть цифр — количества подобраны примерно, сверьте с фото.`
        : `«${a}» … «${b}»: iPhone склеил числа в одну строку — количества разложены по смыслу, сверьте с фото.`
    );
  }
}

/**
 * Разобрать текст отчёта.
 * mOf(name) → ожидаемое количество строки (для выравнивания чисел).
 * → { items: [{name, qty, qtyCheck, chunk?, raw}], warnings, chunks, period, layout }
 */
export function parseReceipt(text, mOf = () => 4) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  const items = [];
  const warnings = [];
  const chunks = []; // куски со склеенными цифрами: {from, to, lost, size}
  let pend = []; // индексы строк без количества в текущем куске
  let toks = []; // числа, пришедшие после них
  let from = null;
  let to = null;
  let inline = 0;
  let split = 0;
  const flush = () => {
    if (toks.length) {
      resolveGroup(items, pend, toks, warnings, chunks);
      pend = [];
      toks = [];
    }
  };
  for (const l of lines) {
    if (!l || /^[=\-_*~.·\s]{3,}$/.test(l)) continue;
    const d = DATE_RE.test(l) ? readDate(l) : null;
    if (d) {
      if (/^\s*по\b/i.test(l) || (from && !to)) to = d;
      else from = d;
      continue;
    }
    if (HEADER_RE.test(l) && !/\d\s*$/.test(l)) continue;
    const dg = asDigits(l);
    if (dg != null) {
      split++;
      toks.push(dg);
      continue;
    }
    if (!/[a-zа-яё]{2}/i.test(l)) continue; // мусор без букв
    flush();
    const p = splitPair(l);
    if (p) {
      inline++;
      items.push({ ...p, qtyCheck: false, raw: l });
      continue;
    }
    split++;
    items.push({ name: l, qty: null, qtyCheck: false, raw: l, m: mOf(l) });
    pend.push(items.length - 1);
  }
  flush();
  for (const it of items) delete it.m;
  const miss = items.filter((x) => x.qty == null).length;
  if (miss) warnings.push(`Без количества: ${miss} — iPhone не распознал эти числа, впишите их по фото.`);
  let period = null;
  if (from) {
    const h = from.h;
    const time = h == null ? null : h >= 15 || h < 4 ? 'night' : 'day';
    period = { from, to, date: from.date, time };
  }
  return { items, warnings, chunks, period, layout: inline && split ? 'mixed' : split ? 'columns' : 'inline' };
}

// ожидаемое количество за смену, если истории нет
const TYPICAL = {
  gs: 40, ks: 40, fri: 30, bc: 20, kp: 15, crispy: 15, gsDv: 10, chili: 10, gp: 8, cheesemax: 8, ksDv: 5, tk: 5, tg: 4,
  coffee: 2, cocoa: 1, beans: 1,
};

/**
 * Полный разбор: строки с сопоставлением + сводка по позициям.
 * history — { [id]: ожидаемое количество } (медиана прошлых смен).
 * rows: [{key, name, qty, qtyCheck, id, status, score}] — порядок как в чеке.
 */
export function buildImport(text, learned = {}, history = {}) {
  const mOf = (name) => {
    const r = matchName(name, learned);
    if (r.id) return history[r.id] || TYPICAL[r.id] || 4;
    return 3; // напитки, соусы, стаканы
  };
  const parsed = parseReceipt(text, mOf);
  const rows = parsed.items.map((it, i) => ({ key: `r${i}`, ...it, ...matchName(it.name, learned) }));
  return { ...parsed, rows };
}

/** Медиана количеств по позициям из сохранённых дней «Расчёта». */
export function historyMedians(days = {}, itemTotalFn) {
  const by = {};
  for (const d of Object.values(days || {})) {
    for (const [id, v] of Object.entries(d?.counts || {})) {
      const q = itemTotalFn(v);
      if (q > 0) (by[id] = by[id] || []).push(q);
    }
  }
  const out = {};
  for (const [id, a] of Object.entries(by)) {
    a.sort((x, y) => x - y);
    out[id] = a[Math.floor(a.length / 2)];
  }
  return out;
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
