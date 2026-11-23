/**
 * «Банк» (анализ трат Mbank): PDF-выписки по нескольким счетам → одна картина.
 * Чистые функции без React — тесты в tests/bank.test.mjs.
 *
 * Правила подсчёта (согласованы с владельцем):
 *  - приход: пополнения, переводы мне, переводы со своих счетов в ДРУГИХ банках, возвраты за курс;
 *  - расход: всё потраченное, включая переводы на свои счета в других банках;
 *  - переводы между своими счетами ВНУТРИ Mbank не считаются — отдельная строка;
 *  - «непонятные» расходы (переводы людям, QR без названия) ждут объяснения.
 */
import { addDays, MONTHS, MONTHS_R, paydayOnOrBefore, parse } from './periods.js';

export const BANK_KEY = 'zp_bank_v1';

/** Категории. kind: own — не считается; in — приход; out — расход; ask — ждёт объяснения. */
export const CATS = {
  own: { label: 'Между своими счетами', kind: 'own' },
  mbankIn: { label: 'С другого счёта Mbank', kind: 'in' }, // выписка того счёта не загружена
  mbankOut: { label: 'На другой счёт Mbank', kind: 'out' },
  income: { label: 'Пополнения', kind: 'in' },
  incomeTr: { label: 'Переводы мне', kind: 'in' },
  myBanksIn: { label: 'С моих счетов в других банках', kind: 'in' },
  refund: { label: 'Возвраты за курс', kind: 'in' },
  myBanks: { label: 'На мои счета в других банках', kind: 'out' },
  loan: { label: 'Кредиты и рассрочка', kind: 'out' },
  bills: { label: 'Связь и услуги банка', kind: 'out' },
  delivery: { label: 'Доставка еды', kind: 'out' },
  cafe: { label: 'Кафе и фастфуд', kind: 'out' },
  food: { label: 'Еда', kind: 'out' },
  shops: { label: 'Магазины', kind: 'out' },
  market: { label: 'Маркетплейсы', kind: 'out' },
  taxi: { label: 'Такси', kind: 'out' },
  bus: { label: 'Автобус', kind: 'out' },
  subs: { label: 'Подписки', kind: 'out' },
  toilet: { label: 'Туалет', kind: 'out' },
  service: { label: 'Услуги', kind: 'out' },
  buy: { label: 'Покупки', kind: 'out' },
  debt: { label: 'Долги', kind: 'out' },
  family: { label: 'Родным', kind: 'out' },
  gift: { label: 'Подарки', kind: 'out' },
  other: { label: 'Другое', kind: 'out' },
  transfer: { label: 'Перевод', kind: 'ask' },
  unknown: { label: 'Оплата по QR', kind: 'ask' },
};

/** Расходы не первой необходимости по умолчанию (список можно менять). */
export const DEFAULT_CUT = ['taxi', 'delivery', 'cafe', 'subs', 'market', 'gift'];

/** Объяснения непонятного расхода. need: нужно уточнить текстом. */
export const EXPLAIN = {
  shop: { label: 'Магазин', cat: 'shops' },
  food: { label: 'Еда', cat: 'food' },
  toilet: { label: 'Туалет', cat: 'toilet' },
  service: { label: 'Услуга', cat: 'service', need: 'Какая услуга?' },
  buy: { label: 'Покупка', cat: 'buy' },
  taxi: { label: 'Такси', cat: 'taxi' },
  cafe: { label: 'Кафе', cat: 'cafe' },
  debt: { label: 'Долг', cat: 'debt' },
  family: { label: 'Родным', cat: 'family' },
  gift: { label: 'Подарок', cat: 'gift' },
  loan: { label: 'Кредит', cat: 'loan' },
  other: { label: 'Другое', cat: 'other', need: 'Что это было?' },
};

/** Режимы цели: приход должен превышать расход на pct %. turbo — скрытый, свой процент. */
export const MODES = [
  { k: 'min', label: 'Минимальный', pct: 10 },
  { k: 'opt', label: 'Оптимальный', pct: 20 },
  { k: 'active', label: 'Активный', pct: 30 },
];
export const TURBO = { k: 'turbo', label: 'Агрессивный' };
export const YELLOW_GAP = 5; // жёлтый, если до цели осталось меньше 5 п.п.

export const emptyBank = () => normalizeBank(null);

export function normalizeBank(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const notes = b.notes && typeof b.notes === 'object' ? { ...b.notes } : {};
  // старые отметки (v1) → объяснения
  const OLD = { food: 'food', loan: 'loan', debt: 'debt', family: 'family', buy: 'buy', gift: 'gift', other: 'other' };
  if (b.tags && typeof b.tags === 'object') {
    for (const [id, t] of Object.entries(b.tags)) if (OLD[t] && !notes[id]) notes[id] = { k: OLD[t] };
  }
  const goal = b.goal && typeof b.goal === 'object' ? b.goal : {};
  const pct = Number(goal.pct);
  return {
    v: 2,
    accounts: b.accounts && typeof b.accounts === 'object' ? b.accounts : {},
    ops: b.ops && typeof b.ops === 'object' ? b.ops : {},
    notes,
    ownPhones: Array.isArray(b.ownPhones) ? b.ownPhones : [],
    mode: b.mode === 'month' ? 'month' : 'pay',
    cut: Array.isArray(b.cut) ? b.cut : DEFAULT_CUT.slice(),
    goal: {
      k: [...MODES.map((m) => m.k), TURBO.k].includes(goal.k) ? goal.k : 'opt',
      pct: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : 20,
    },
  };
}

// ── разбор выписки ─────────────────────────────────────────────────────────
const sp = (s) => String(s || '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
const OP_RE = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d) (.+?):? ([+-]) ?(\d[\d ]*,\d\d)$/;
const num = (s) => Number(String(s).replace(/ /g, '').replace(',', '.'));
const dmy = (s) => {
  const m = /(\d\d)\.(\d\d)\.(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Короткий хэш строки (стабильный id операции). */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function parseStatement(lines) {
  const L = (lines || []).map(sp).filter(Boolean);
  let account = null;
  let from = null;
  let to = null;
  let client = '';
  let open = null;
  let close = null;
  const totals = { out: null, in: null };
  const ops = [];
  let cur = null;
  let tail = false;
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    let m;
    if (!account && (m = /Выписка по сч[её]ту\s*№?\s*(\d{6,})/i.exec(s))) {
      account = m[1];
      continue;
    }
    if (!from && (m = /период с\s*(\d\d\.\d\d\.\d{4})\s*по\s*(\d\d\.\d\d\.\d{4})/i.exec(s))) {
      from = dmy(m[1]);
      to = dmy(m[2]);
      continue;
    }
    if (!client && /^Клиент(\s|$)/i.test(s)) {
      // следующая строка — «ФАМИЛИЯ ИМЯ», дальше отчество и балансы
      const nx = L[i + 2] && /^[А-ЯЁA-Z]+ [А-ЯЁA-Z]+$/.test(L[i + 2]) ? L[i + 2] : L[i + 1] || '';
      client = nx.replace(/[^А-ЯЁA-Zа-яёa-z ]/g, '').trim();
      continue;
    }
    if (open == null && !ops.length && (m = /(-?[\d ]+,\d\d)\s*KGS\s+(-?[\d ]+,\d\d)\s*KGS/i.exec(s))) {
      open = num(m[1]); // «Баланс на начало периода … Баланс на конец»
      close = num(m[2]);
      continue;
    }
    if ((m = /^Всего списаний\s+([\d ]+,\d\d)/i.exec(s))) {
      totals.out = num(m[1]);
      tail = true;
      cur = null;
      continue;
    }
    if ((m = /^Всего пополнений\s+([\d ]+,\d\d)/i.exec(s))) {
      totals.in = num(m[1]);
      continue;
    }
    if (tail) continue;
    if ((m = OP_RE.exec(s))) {
      const [, d, mo, y, hh, mm, type, sign, amt] = m;
      cur = {
        date: `${y}-${mo}-${d}`,
        time: `${hh}:${mm}`,
        type: type.replace(/:$/, '').trim(),
        amount: (sign === '-' ? -1 : 1) * num(amt),
        desc: '',
      };
      ops.push(cur);
      continue;
    }
    if (/^Дата операции(\s|$)/i.test(s)) continue; // шапка таблицы на каждой странице
    if (cur) cur.desc = cur.desc ? `${cur.desc} ${s}` : s;
  }
  // id: счёт + время + сумма + описание; одинаковые операции в одну минуту — порядковый номер
  const seen = {};
  for (const op of ops) {
    const base = `${account || '?'}|${op.date} ${op.time}|${op.amount}|${hash(op.type + '|' + op.desc)}`;
    seen[base] = (seen[base] || 0) + 1;
    op.id = `${base}#${seen[base]}`;
    op.account = account;
  }
  return { account, from, to, client, open, close, ops, totals };
}

/** Сходится ли сумма разобранных операций с итогом банка (защита от поломки формата). */
export function checkTotals(st) {
  const out = st.ops.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
  const inn = st.ops.filter((o) => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const ok = (x, t) => t == null || Math.abs(x - t) < 0.02;
  return { ok: ok(out, st.totals.out) && ok(inn, st.totals.in), out, in: inn };
}

// ── категории ──────────────────────────────────────────────────────────────
function cardMerchant(desc) {
  const parts = String(desc || '').split('\\').map((x) => x.trim()).filter(Boolean);
  return parts.length > 3 ? parts[3] : parts[parts.length - 1] || '';
}
function quoted(desc) {
  const m = /"([^"]+)"/.exec(desc || '');
  return m ? m[1].trim() : '';
}
export function phoneOf(op) {
  if (!/перевод|o!bank/i.test(op.type)) return null;
  const m = /(996\d{9})/.exec(op.desc || '');
  return m ? m[1] : null;
}
/** «Бактыгул М.» / «АИДА А.» — получатель или отправитель перевода. */
export function personOf(op) {
  const d = op.desc || '';
  let m = /996\d{9}\/\s*([^/]+?)\s*\/\s*\//.exec(d);
  if (m) return m[1].trim();
  m = /996\d{9}\/996\d{9}\/(?:O!Bank - )?([^/]+?)\/\d/.exec(d);
  if (m && !/simbank/i.test(m[1])) return m[1].trim();
  if (/simbank/i.test(d)) return 'Simbank';
  return null;
}


export function autoCat(op) {
  const t = op.type || '';
  const d = op.desc || '';
  const all = `${t} ${d}`;
  if (/между своими сч/i.test(t)) return 'own';
  if (op.amount > 0) {
    if (/возврат/i.test(d)) return 'refund';
    if (/перевод/i.test(t)) return 'incomeTr';
    return 'income';
  }
  if (/потребительск|рассрочк|погашение по кредиту/i.test(all) || /автосписание.*кредит/i.test(d)) return 'loan';
  if (/^(megaline|megacom|beeline|o!|мой дом|элсом|ксэ|газ|водоканал|тазалык)/i.test(t) && !/o!bank/i.test(t)) return 'bills';
  if (/годовое обслуживание|комиссия/i.test(d)) return 'bills';
  if (/o!bank/i.test(t) || /перевод/i.test(t)) return 'transfer';
  if (/тулпар|tulpar/i.test(all)) return 'bus';
  const shop = (t === 'Операции по карте' ? cardMerchant(d) : quoted(d) || d).toUpperCase();
  if (/APPLE\.COM|ITUNES|SPOTIFY|NETFLIX|YOUTUBE|GOOGLE \*|ICLOUD|TELEGRAM/.test(d.toUpperCase())) return 'subs';
  if (/GLOVO|YANDEX EDA|ЯНДЕКС ЕДА|NAMBA FOOD/.test(shop)) return 'delivery';
  if (/TAXI|YANDEX\.GO|ЯНДЕКС GO|NAMBA TAXI|INDRIVE|ТАКСИ/.test(shop)) return 'taxi';
  if (/WILDBERRIES|OZON|LALAFO|ALIEXPRESS|TEMU/.test(shop)) return 'market';
  if (/KFC|BEGEMOT|БЕГЕМОТ|ЛОЖКА|BURGER|CAFE|КАФЕ|COFFEE|КОФЕ|ДОНЕР|SHAURMA|ШАУРМ|PIZZA|ПИЦЦ/.test(shop)) return 'cafe';
  // QR/MPay без понятного названия получателя — непонятный
  if (/QR|MPay/i.test(t) && isNameless(op)) return 'unknown';
  if (/^(Операции по карте|Оплата по QR|Оплата по MPay)$/i.test(t)) return 'shops';
  return 'other';
}
function isNameless(op) {
  const q = quoted(op.desc);
  if (q) return false;
  const r = /Получатель: [^.]+\. ([^/]+)\//.exec(op.desc || '');
  return !(r && !/^[\dA-Z]+$/.test(r[1].trim()));
}

/** Название для списка: магазин / человек / тип операции. */
export function labelOf(op, cat = autoCat(op)) {
  const d = op.desc || '';
  const who = personOf(op);
  if (cat === 'own') return 'Между своими счетами';
  if (cat === 'refund') return 'Возврат за курс';
  if (cat === 'loan') return op.type === 'Операции по карте' ? 'Автосписание по кредиту' : op.type;
  if (cat === 'bills') return /годовое обслуживание/i.test(d) ? 'Обслуживание карты' : op.type;
  if (cat === 'bus') return 'Тулпар';
  if (cat === 'myBanks' || cat === 'myBanksIn') return /o!bank/i.test(`${op.type} ${d}`) ? 'O!Bank · мой номер' : who === 'Simbank' ? 'Simbank · мой номер' : 'Мой номер';
  if (who) return who;
  if (op.type === 'Операции по карте') {
    const m = cardMerchant(d);
    if (/APPLE/i.test(d)) return 'Apple';
    if (/SPOTIFY/i.test(d)) return 'Spotify';
    return titleCase(m);
  }
  const q = quoted(d);
  if (q) return q;
  const r = /Получатель: [^.]+\. ([^/]+)\//.exec(d);
  if (r && !/^[\dA-Z]+$/.test(r[1].trim())) return r[1].trim();
  if (/^Cash-in$/i.test(op.type)) return 'Пополнение наличными';
  if (/QR/i.test(op.type)) return 'Оплата по QR';
  return op.type;
}
const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/(^|[\s.(-])([a-zа-яё])/g, (x, a, b) => a + b.toUpperCase())
    .trim();

/**
 * Итоговый вид операции с учётом объяснений и своих номеров:
 * { ...op, cat, kind, label, note, unclear }
 */
export function viewOp(op, bank, pairs = ownPairs(bank)) {
  let cat = autoCat(op);
  // перевод между своими считается только если вторая сторона — тоже загруженный счёт
  if (cat === 'own' && !pairs.has(op.id)) cat = op.amount > 0 ? 'mbankIn' : 'mbankOut';
  const phone = phoneOf(op);
  if (phone && bank.ownPhones.includes(phone) && (cat === 'transfer' || cat === 'incomeTr')) {
    cat = op.amount > 0 ? 'myBanksIn' : 'myBanks';
  }
  let label = labelOf(op, cat);
  let note = null;
  const ex = bank.notes[op.id];
  if (ex && EXPLAIN[ex.k] && (cat === 'transfer' || cat === 'unknown')) {
    cat = EXPLAIN[ex.k].cat;
    note = ex.text ? `${EXPLAIN[ex.k].label}: ${ex.text}` : EXPLAIN[ex.k].label;
  }
  const kind = (CATS[cat] || CATS.other).kind;
  return { ...op, cat, kind, label, note, who: personOf(op), unclear: kind === 'ask' && op.amount < 0 };
}

/**
 * Пары «между своими счетами» среди загруженных выписок: списание с одного счёта и зачисление
 * на другой той же суммы в пределах 2 минут. Только такие переводы не считаются в приход/расход.
 */
const pairsCache = new WeakMap();
export function ownPairs(bank) {
  const hit = pairsCache.get(bank.ops);
  if (hit) return hit;
  const own = Object.values(bank.ops).filter((o) => autoCat(o) === 'own');
  const at = (o) => parse(o.date).getTime() + (+o.time.slice(0, 2) * 60 + +o.time.slice(3)) * 60000;
  const ins = own.filter((o) => o.amount > 0).sort((a, b) => at(a) - at(b));
  const used = new Set();
  for (const o of own.filter((x) => x.amount < 0).sort((a, b) => at(a) - at(b))) {
    const m = ins.find((i) => !used.has(i.id) && i.account !== o.account && Math.abs(i.amount + o.amount) < 0.005 && Math.abs(at(i) - at(o)) <= 120000);
    if (m) {
      used.add(m.id);
      used.add(o.id);
    }
  }
  pairsCache.set(bank.ops, used);
  return used;
}

/** Сколько денег было на загруженных счетах к началу дня date (по балансу из выписки). */
export function balanceAt(bank, date) {
  let sum = 0;
  let known = false;
  for (const a of Object.values(bank.accounts)) {
    if (a.open == null || !a.from || a.from > date) continue;
    known = true;
    sum += a.open;
    for (const o of Object.values(bank.ops)) if (o.account === a.num && o.date >= a.from && o.date < date) sum += o.amount;
  }
  return known ? round(sum) : null;
}

/**
 * Свой номер телефона: входящий перевод от «Имя Ф.», совпадающего с владельцем выписки
 * («УСУПЕКОВ АДИЛ» → «Адил У.»). Такие переводы — мои счета в других банках (считаются).
 */
export function ownPhonesOf(st) {
  const words = String(st.client || '').trim().split(/\s+/);
  if (words.length < 2) return [];
  const [last, first] = words;
  const re = new RegExp(`^${first}\\s+${last[0]}\\.?$`, 'i');
  const set = new Set();
  for (const op of st.ops) {
    const ph = phoneOf(op);
    const who = personOf(op);
    if (op.amount > 0 && ph && who && re.test(who)) set.add(ph);
  }
  return [...set];
}

/** Добавить выписку: новые операции, уже загруженные — пропустить. */
export function mergeStatement(bank, st) {
  const ops = { ...bank.ops };
  let added = 0;
  let skipped = 0;
  for (const op of st.ops) {
    if (ops[op.id]) {
      skipped++;
      continue;
    }
    ops[op.id] = op;
    added++;
  }
  const prev = bank.accounts[st.account] || {};
  const accounts = {
    ...bank.accounts,
    [st.account]: {
      num: st.account,
      from: prev.from && prev.from < st.from ? prev.from : st.from,
      to: prev.to && prev.to > st.to ? prev.to : st.to,
      open: prev.from && prev.from < st.from ? prev.open : st.open,
      close: prev.to && prev.to > st.to ? prev.close : st.close,
    },
  };
  const ownPhones = [...new Set([...bank.ownPhones, ...ownPhonesOf(st)])];
  return { bank: { ...bank, ops, accounts, ownPhones }, added, skipped };
}

/** Убрать счёт со всеми его операциями и объяснениями. */
export function removeAccount(bank, num) {
  const ops = {};
  const notes = {};
  for (const [id, op] of Object.entries(bank.ops)) if (op.account !== num) ops[id] = op;
  for (const [id, t] of Object.entries(bank.notes)) if (ops[id]) notes[id] = t;
  const accounts = { ...bank.accounts };
  delete accounts[num];
  return { ...bank, ops, notes, accounts };
}

export const shortAcc = (num) => `•${String(num || '').slice(-4)}`;

// ── объяснения: самые вероятные варианты первыми ───────────────────────────
/**
 * Порядок вариантов для непонятного расхода: сначала то, что ты уже выбирал для этого
 * же получателя (только порядок — сама отметка всегда ручная), потом по типу и сумме.
 */
export function explainOptions(v, bank) {
  const a = Math.abs(v.amount);
  let base;
  if (v.cat === 'unknown') {
    if (a <= 30) base = ['toilet', 'shop', 'food', 'buy', 'service', 'other'];
    else if (a <= 1500) base = ['shop', 'food', 'cafe', 'buy', 'service', 'taxi', 'toilet', 'other'];
    else base = ['buy', 'shop', 'service', 'food', 'other'];
  } else if (a <= 300) base = ['food', 'buy', 'service', 'taxi', 'shop', 'debt', 'gift', 'family', 'other'];
  else base = ['buy', 'debt', 'service', 'family', 'gift', 'food', 'loan', 'shop', 'other'];
  const key = v.who || v.label;
  const seen = {};
  for (const op of Object.values(bank.ops)) {
    const ex = bank.notes[op.id];
    if (!ex || op.id === v.id) continue;
    const w = personOf(op) || labelOf(op);
    if (w === key) seen[ex.k] = (seen[ex.k] || 0) + 1;
  }
  const first = Object.keys(seen).sort((x, y) => seen[y] - seen[x]);
  const all = [...first, ...base, ...Object.keys(EXPLAIN)];
  return [...new Set(all)].filter((k) => EXPLAIN[k]);
}

// ── периоды ────────────────────────────────────────────────────────────────
/** Ключ периода для даты. pay — от зарплаты до дня перед следующей (14 дней). */
export function periodOf(date, mode) {
  if (mode === 'month') {
    const [y, m] = date.split('-').map(Number);
    const start = `${date.slice(0, 7)}-01`;
    const end = `${date.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    return { key: date.slice(0, 7), start, end, title: MONTHS[m - 1], full: `${MONTHS[m - 1]} ${y}` };
  }
  const p = paydayOnOrBefore(date);
  const end = addDays(p, 13);
  const t = fmtRange(p, end);
  return { key: p, start: p, end, title: t, full: t };
}
function fmtRange(a, b) {
  const da = parse(a);
  const db = parse(b);
  if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS_R[db.getMonth()]}`;
  return `${da.getDate()} ${MONTHS_R[da.getMonth()].slice(0, 3)} – ${db.getDate()} ${MONTHS_R[db.getMonth()].slice(0, 3)}`;
}

/** Все периоды, где есть операции, от новых к старым. */
export function periodsOf(bank, mode) {
  const map = {};
  for (const op of Object.values(bank.ops)) {
    const p = periodOf(op.date, mode);
    map[p.key] = p;
  }
  return Object.values(map).sort((a, b) => (a.key < b.key ? 1 : -1));
}

// ── итоги ──────────────────────────────────────────────────────────────────
export const goalPct = (bank) => {
  const m = MODES.find((x) => x.k === bank.goal.k);
  return m ? m.pct : bank.goal.pct;
};
export const goalLabel = (bank) => (MODES.find((x) => x.k === bank.goal.k) || TURBO).label;

/** Состояние относительно цели: good / near (жёлтый) / bad (угроза). */
export function statusOf(income, spent, pct) {
  if (income <= 0) return spent > 0 ? 'bad' : 'good';
  const rate = ((income - spent) / income) * 100;
  if (rate < pct) return 'bad';
  if (rate < pct + YELLOW_GAP) return 'near';
  return 'good';
}

export function summarize(bank, period) {
  const pairs = ownPairs(bank);
  const views = Object.values(bank.ops)
    .filter((o) => o.date >= period.start && o.date <= period.end)
    .map((o) => viewOp(o, bank, pairs))
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1)); // старые → новые
  const cats = {};
  const own = [];
  const unclear = [];
  let income = 0;
  let spent = 0;
  for (const v of views) {
    if (v.kind === 'own') {
      own.push(v);
      continue;
    }
    if (v.unclear) unclear.push(v);
    if (v.amount > 0) income += v.amount;
    else spent -= v.amount;
    if (!cats[v.cat]) cats[v.cat] = { cat: v.cat, label: (CATS[v.cat] || CATS.other).label, kind: v.kind, sum: 0, n: 0, ops: [] };
    const c = cats[v.cat];
    c.sum += Math.abs(v.amount);
    c.n++;
    c.ops.push(v);
  }
  const list = Object.values(cats)
    .map((c) => ({ ...c, sum: round(c.sum), ops: c.ops.slice().reverse() }))
    .sort((a, b) => b.sum - a.sum);
  const pct = goalPct(bank);
  income = round(income);
  spent = round(spent);
  const ownIn = own.filter((v) => v.amount > 0).reduce((a, v) => a + v.amount, 0);
  const start = balanceAt(bank, period.start);
  return {
    period,
    start, // остаток на начало периода (null — неизвестен)
    end: start == null ? null : round(start + income - spent),
    fromStock: start != null && spent > income ? round(Math.min(spent - income, start)) : 0,
    mbankExt: list.some((c) => c.cat === 'mbankIn' || c.cat === 'mbankOut'),
    income,
    spent,
    net: round(income - spent),
    rate: income > 0 ? ((income - spent) / income) * 100 : null,
    pct,
    status: statusOf(income, spent, pct),
    views: views.filter((v) => v.kind !== 'own'),
    own: own.slice().reverse(),
    ownSum: round(ownIn),
    unclear: unclear.slice().reverse(),
    expenses: list.filter((c) => c.kind === 'out' || c.kind === 'ask'),
    incomes: list.filter((c) => c.kind === 'in'),
  };
}
const round = (n) => Math.round(n * 100) / 100;

/**
 * Точки графика: каждое пополнение — зелёный столбик вверх, каждый расход — красный вниз
 * (длина ∝ сумме), линия — накопленный итог (приход − расход), пунктир — цель (pct% прихода).
 * t — доля периода 0…1.
 */
export function chartOf(sum) {
  const p = sum.period;
  const t0 = parse(p.start).getTime();
  const t1 = parse(addDays(p.end, 1)).getTime();
  const span = Math.max(1, t1 - t0);
  const at = (date, time) => {
    const [hh, mm] = (time || '00:00').split(':').map(Number);
    return Math.min(1, Math.max(0, (parse(date).getTime() + (hh * 60 + mm) * 60000 - t0) / span));
  };
  const bars = [];
  // линия — итог на конец каждого дня с операциями (внутри дня приход и расход не дают ложных пиков)
  const base = sum.start || 0; // линия — деньги на счетах: от остатка на начало периода
  const line = [{ t: 0, v: base, g: base }];
  let inc = 0;
  let net = base;
  let day = null;
  for (const v of sum.views) {
    bars.push({ t: at(v.date, v.time), a: v.amount });
    if (day && v.date !== day) line.push({ t: at(day, '23:59'), v: net, g: base + (inc * sum.pct) / 100 });
    day = v.date;
    net += v.amount;
    if (v.amount > 0) inc += v.amount;
  }
  if (day) line.push({ t: at(day, '23:59'), v: net, g: base + (inc * sum.pct) / 100 });
  return { bars, line };
}

/** Расходы не первой необходимости (по списку cut). */
export function cutOf(sum, bank) {
  const set = new Set(bank.cut);
  const list = sum.expenses.filter((c) => set.has(c.cat));
  return { list, total: round(list.reduce((a, c) => a + c.sum, 0)) };
}

/**
 * Предложения: чем заменить необязательные траты и сколько это даст.
 * Первым — сколько нужно сократить, чтобы выйти на цель.
 */
export function suggestionsOf(sum, bank) {
  const out = [];
  const need = sum.income > 0 ? sum.spent - (sum.income * (100 - sum.pct)) / 100 : sum.spent;
  if (need > 0) {
    out.push({
      k: 'goal',
      tone: 'bad',
      title: `До цели ${sum.pct}% не хватает ${fmt(need)} сом`,
      text: sum.income > 0 ? `Столько нужно было потратить меньше в этом периоде.` : 'В этом периоде не было прихода.',
      save: 0,
    });
  }
  const by = (k) => sum.expenses.find((c) => c.cat === k);
  const add = (k, title, text, save) => save > 0 && out.push({ k, title, text, save: Math.round(save) });
  const taxi = by('taxi');
  if (taxi) {
    const avg = taxi.sum / taxi.n;
    add('taxi', 'Автобус вместо такси', `${taxi.n} ${pl(taxi.n, 'поездка', 'поездки', 'поездок')} в среднем по ${fmt(avg)}. Автобус — 17 сом. Половина поездок на автобусе:`, ((avg - 17) * taxi.n) / 2);
  }
  const del = by('delivery');
  if (del) add('delivery', 'Готовить или забирать самому', `Доставка: ${del.n} ${pl(del.n, 'заказ', 'заказа', 'заказов')} на ${fmt(del.sum)}. Вдвое реже:`, del.sum / 2);
  const cafe = by('cafe');
  if (cafe) add('cafe', 'Еда из дома вместо кафе', `Кафе и фастфуд: ${fmt(cafe.sum)}. Через раз брать еду с собой:`, cafe.sum / 2);
  const subs = by('subs');
  if (subs) {
    const names = [...new Set(subs.ops.map((o) => o.label))].join(', ');
    add('subs', 'Проверить подписки', `${names}. Отмени те, которыми не пользуешься:`, subs.sum / 2);
  }
  const mk = by('market');
  if (mk) add('market', 'Правило 24 часов', `Маркетплейсы: ${fmt(mk.sum)}. Положи в корзину и купи завтра — часть отпадёт:`, mk.sum / 3);
  const small = sum.views.filter((v) => (v.cat === 'shops' || v.cat === 'food') && v.amount < 0 && -v.amount <= 300);
  if (small.length >= 5) {
    const s = small.reduce((a, v) => a - v.amount, 0);
    add('small', 'Покупки по списку', `${small.length} мелких покупок до 300 сом на ${fmt(s)}. Список заранее срезает «по мелочи»:`, s / 3);
  }
  const gift = by('gift');
  if (gift) add('gift', 'Подарки — заранее и по бюджету', `Подарки: ${fmt(gift.sum)}. Заложи сумму заранее:`, gift.sum / 4);
  return out;
}
export const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
const pl = (n, a, b, c) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
  return c;
};
