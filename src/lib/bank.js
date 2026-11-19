/**
 * «Банк»: выписки MBANK (PDF «Выписка по счету №…») → операции, категории, периоды, советы.
 * Чистые функции без React — тесты в tests/bank.test.mjs.
 *
 * parseStatement(lines)      → { account, from, to, client, ops, totals } (строки — из pdfLines)
 * mergeStatement(bank, st)   → { bank, added, skipped }   — повторная загрузка не задваивает
 * catOf(op, bank)            → ключ категории с учётом ручных отметок
 * periodsOf(bank, mode)      → [{ key, start, end, title }] (mode: 'month' | 'pay')
 * summarize(bank, period)    → итоги периода по категориям
 * advice(bank, period, prev) → советы, где урезать (только необязательные траты)
 */
import { addDays, MONTHS, MONTHS_R, paydayOnOrBefore, parse } from './periods.js';

export const BANK_KEY = 'zp_bank_v1';

/** Категории. kind: own — не считается; in — пополнение; must — обязательное; opt — можно урезать; ask — ждёт отметки. */
export const CATS = {
  own: { label: 'Свои счета', kind: 'own', icon: 'swap' },
  income: { label: 'Пополнения', kind: 'in' },
  incomeTr: { label: 'Переводы мне', kind: 'in' },
  refund: { label: 'Возвраты', kind: 'in' },
  loan: { label: 'Кредиты и рассрочка', kind: 'must' },
  bills: { label: 'Связь и услуги', kind: 'must' },
  delivery: { label: 'Доставка еды', kind: 'opt' },
  cafe: { label: 'Кафе и фастфуд', kind: 'opt' },
  shops: { label: 'Магазины', kind: 'opt' },
  market: { label: 'Маркетплейсы', kind: 'opt' },
  taxi: { label: 'Такси и Яндекс Go', kind: 'opt' },
  bus: { label: 'Автобус', kind: 'opt' },
  subs: { label: 'Подписки', kind: 'opt' },
  transfer: { label: 'Переводы без отметки', kind: 'ask' },
  other: { label: 'Другое', kind: 'opt' },
};

/** Ручные отметки перевода → категория. */
export const TAGS = [
  { k: 'food', label: 'Еда', cat: 'shops' },
  { k: 'loan', label: 'Кредит', cat: 'loan' },
  { k: 'debt', label: 'Долг', cat: 'tDebt' },
  { k: 'family', label: 'Родным', cat: 'tFamily' },
  { k: 'buy', label: 'Покупка', cat: 'tBuy' },
  { k: 'gift', label: 'Подарок', cat: 'tGift' },
  { k: 'own', label: 'Свой счёт', cat: 'own' },
  { k: 'other', label: 'Другое', cat: 'other' },
];
/** Отметки для входящих переводов. */
export const IN_TAGS = [
  { k: 'income', label: 'Доход', cat: 'incomeTr' },
  { k: 'own', label: 'Свой счёт', cat: 'own' },
];
const ALL_TAGS = [...TAGS, IN_TAGS[0]];
/** Можно ли отметить операцию вручную (переводы людям и на свои номера). */
export const taggable = (op) => op.cat === 'transfer' || op.cat === 'incomeTr';
export const tagsFor = (op) => (op.amount > 0 ? IN_TAGS : TAGS);
CATS.tDebt = { label: 'Долги', kind: 'opt' };
CATS.tFamily = { label: 'Родным', kind: 'opt' };
CATS.tBuy = { label: 'Покупки у людей', kind: 'opt' };
CATS.tGift = { label: 'Подарки', kind: 'opt' };

export const emptyBank = () => ({ v: 1, accounts: {}, ops: {}, tags: {}, ownPhones: [], mode: 'pay' });

export function normalizeBank(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    v: 1,
    accounts: b.accounts && typeof b.accounts === 'object' ? b.accounts : {},
    ops: b.ops && typeof b.ops === 'object' ? b.ops : {},
    tags: b.tags && typeof b.tags === 'object' ? b.tags : {},
    ownPhones: Array.isArray(b.ownPhones) ? b.ownPhones : [],
    mode: b.mode === 'month' ? 'month' : 'pay',
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
    op.cat = autoCat(op);
    const ph = phoneOf(op);
    if (ph) op.phone = ph;
    const who = personOf(op);
    if (who) op.who = who;
    op.label = labelOf(op);
  }
  return { account, from, to, client, ops, totals };
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
  if (/o!bank/i.test(t)) return 'transfer';
  if (/перевод/i.test(t)) return 'transfer';
  if (/тулпар|tulpar/i.test(all)) return 'bus';
  const shop = (t === 'Операции по карте' ? cardMerchant(d) : quoted(d) || d).toUpperCase();
  if (/APPLE\.COM|ITUNES|SPOTIFY|NETFLIX|YOUTUBE|GOOGLE \*|ICLOUD|TELEGRAM/.test(d.toUpperCase())) return 'subs';
  if (/GLOVO|YANDEX EDA|ЯНДЕКС ЕДА|NAMBA FOOD/.test(shop)) return 'delivery';
  if (/TAXI|YANDEX\.GO|ЯНДЕКС GO|NAMBA TAXI|INDRIVE|ТАКСИ/.test(shop)) return 'taxi';
  if (/WILDBERRIES|OZON|LALAFO|ALIEXPRESS|TEMU/.test(shop)) return 'market';
  if (/KFC|BEGEMOT|БЕГЕМОТ|ЛОЖКА|BURGER|CAFE|КАФЕ|COFFEE|КОФЕ|ДОНЕР|SHAURMA|ШАУРМ|PIZZA|ПИЦЦ/.test(shop)) return 'cafe';
  if (/^(Операции по карте|Оплата по QR|Оплата по MPay)$/i.test(t)) return 'shops';
  return 'other';
}

/** Название для списка: магазин / человек / тип операции. */
export function labelOf(op) {
  const d = op.desc || '';
  if (op.cat === 'own') return 'Между своими счетами';
  if (op.cat === 'refund') return 'Возврат';
  if (op.cat === 'loan') return op.type === 'Операции по карте' ? 'Автосписание по кредиту' : op.type;
  if (op.cat === 'bills') return /годовое обслуживание/i.test(d) ? 'Обслуживание карты' : op.type;
  if (op.cat === 'bus') return 'Тулпар';
  if (op.who) return op.who;
  if (op.type === 'Операции по карте') {
    const m = cardMerchant(d);
    if (/APPLE|ITUNES|^\d{9,}$/.test(m.toUpperCase()) && /APPLE/i.test(d)) return 'Apple';
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

/** Итоговая категория: ручная отметка → свой номер → авто. */
export function catOf(op, bank) {
  const tag = bank.tags[op.id];
  if (tag) return (ALL_TAGS.find((x) => x.k === tag) || {}).cat || op.cat;
  if (isOwnAuto(op, bank)) return 'own';
  return op.cat;
}

/** Перевод на/с собственного номера (кошелёк в другом банке) — авто «Свой счёт», можно переотметить. */
export const isOwnAuto = (op, bank) =>
  !!op.phone && bank.ownPhones.includes(op.phone) && taggable(op) && /перевод/i.test(op.type);

/**
 * Свой номер телефона: входящий перевод от «Имя Ф.», совпадающего с владельцем выписки
 * («УСУПЕКОВ АДИЛ» → «Адил У.»). Такие переводы — деньги со своего кошелька в другом банке.
 */
export function ownPhonesOf(st) {
  const words = String(st.client || '').trim().split(/\s+/);
  if (words.length < 2) return [];
  const [last, first] = words;
  const re = new RegExp(`^${first}\\s+${last[0]}\\.?$`, 'i');
  const set = new Set();
  for (const op of st.ops) if (op.amount > 0 && op.phone && op.who && re.test(op.who)) set.add(op.phone);
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
    },
  };
  const ownPhones = [...new Set([...bank.ownPhones, ...ownPhonesOf(st)])];
  return { bank: { ...bank, ops, accounts, ownPhones }, added, skipped };
}

/** Убрать счёт со всеми его операциями и отметками. */
export function removeAccount(bank, num) {
  const ops = {};
  const tags = {};
  for (const [id, op] of Object.entries(bank.ops)) if (op.account !== num) ops[id] = op;
  for (const [id, t] of Object.entries(bank.tags)) if (ops[id]) tags[id] = t;
  const accounts = { ...bank.accounts };
  delete accounts[num];
  return { ...bank, ops, tags, accounts };
}

export const shortAcc = (num) => `•${String(num || '').slice(-4)}`;

// ── периоды ────────────────────────────────────────────────────────────────
/** Ключ периода для даты. pay — от зарплаты до дня перед следующей (14 дней). */
export function periodOf(date, mode) {
  if (mode === 'month') {
    const [y, m] = date.split('-').map(Number);
    const start = `${date.slice(0, 7)}-01`;
    const end = `${date.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    return { key: date.slice(0, 7), start, end, title: `${MONTHS[m - 1]} ${y}` };
  }
  const p = paydayOnOrBefore(date);
  const end = addDays(p, 13);
  return { key: p, start: p, end, title: fmtRange(p, end) };
}
function fmtRange(a, b) {
  const da = parse(a);
  const db = parse(b);
  if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS_R[db.getMonth()]}`;
  return `${da.getDate()} ${MONTHS_R[da.getMonth()]} – ${db.getDate()} ${MONTHS_R[db.getMonth()]}`;
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

// ── итоги и советы ─────────────────────────────────────────────────────────
export function opsIn(bank, period) {
  return Object.values(bank.ops)
    .filter((o) => o.date >= period.start && o.date <= period.end)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
}

export function summarize(bank, period) {
  const ops = opsIn(bank, period);
  const cats = {};
  let income = 0;
  let must = 0;
  let opt = 0;
  let ask = 0;
  let own = 0;
  for (const op of ops) {
    const c = catOf(op, bank);
    const kind = (CATS[c] || CATS.other).kind;
    if (kind === 'own') {
      own++;
      continue;
    }
    const a = op.amount;
    if (!cats[c]) cats[c] = { cat: c, label: (CATS[c] || CATS.other).label, kind, sum: 0, n: 0, ops: [] };
    cats[c].sum += Math.abs(a);
    cats[c].n++;
    cats[c].ops.push(op);
    if (kind === 'in') income += a;
    else if (a < 0) {
      if (kind === 'must') must -= a;
      else if (kind === 'ask') ask -= a;
      else opt -= a;
    } else income += a; // редкий плюс в расходной категории
  }
  const spent = must + opt + ask;
  const list = Object.values(cats).sort((a, b) => b.sum - a.sum);
  return {
    period,
    income: round(income),
    must: round(must),
    opt: round(opt),
    ask: round(ask),
    spent: round(spent),
    net: round(income - spent),
    own,
    unmarked: cats.transfer ? cats.transfer.ops : [],
    expenses: list.filter((c) => c.kind !== 'in'),
    incomes: list.filter((c) => c.kind === 'in'),
    count: ops.length,
  };
}
const round = (n) => Math.round(n * 100) / 100;

/**
 * Советы по периоду: где больше всего уходит, частые мелкие траты, подписки, такси,
 * рост к прошлому периоду, неотмеченные переводы. Только необязательные траты.
 */
export function advice(sum, prevSum) {
  const out = [];
  const opt = sum.expenses.filter((c) => c.kind === 'opt');
  const optTotal = opt.reduce((a, c) => a + c.sum, 0);
  if (sum.net < 0) out.push({ k: 'minus', tone: 'bad', title: `В минусе на ${fmt(-sum.net)} сом`, text: `Ушло ${fmt(sum.spent)}, пришло ${fmt(sum.income)}. Ниже — где проще всего урезать.` });
  const by = (k) => opt.find((c) => c.cat === k);
  const del = by('delivery');
  if (del && del.sum >= 300) {
    out.push({
      k: 'delivery',
      title: `Доставка еды: ${fmt(del.sum)} сом`,
      text: `${del.n} ${pl(del.n, 'заказ', 'заказа', 'заказов')}, в среднем ${fmt(del.sum / del.n)}. Если заказывать вдвое реже — останется около ${fmt(del.sum / 2)} сом.`,
    });
  }
  const taxi = by('taxi');
  if (taxi && taxi.sum >= 300) {
    out.push({
      k: 'taxi',
      title: `Такси и Яндекс Go: ${fmt(taxi.sum)} сом`,
      text: `${taxi.n} ${pl(taxi.n, 'поездка', 'поездки', 'поездок')}. Автобус — 17 сом: каждая поездка вместо такси экономит примерно ${fmt(Math.max(0, taxi.sum / taxi.n - 17))}.`,
    });
  }
  const subs = by('subs');
  if (subs) {
    const names = [...new Set(subs.ops.map((o) => o.label))].join(', ');
    out.push({ k: 'subs', title: `Подписки: ${fmt(subs.sum)} сом`, text: `${names}. Проверь, всем ли пользуешься: подписки списываются сами каждый месяц.` });
  }
  // мелкие частые траты в магазинах и кафе
  const small = opt
    .filter((c) => c.cat === 'shops' || c.cat === 'cafe')
    .flatMap((c) => c.ops)
    .filter((o) => -o.amount > 0 && -o.amount <= 300);
  const smallSum = small.reduce((a, o) => a - o.amount, 0);
  if (small.length >= 5) {
    out.push({
      k: 'small',
      title: `Мелкие покупки: ${small.length} раз на ${fmt(smallSum)} сом`,
      text: 'Каждая до 300 сом, но вместе набегает заметно. Это перекусы и «по мелочи» в магазинах и кафе.',
    });
  }
  const mk = by('market');
  if (mk && mk.sum >= 500) out.push({ k: 'market', title: `Маркетплейсы: ${fmt(mk.sum)} сом`, text: `${mk.n} ${pl(mk.n, 'покупка', 'покупки', 'покупок')}. Перед заказом можно выждать день — часть покупок отпадёт сама.` });
  // рост к прошлому периоду
  if (prevSum) {
    for (const c of opt) {
      const p = prevSum.expenses.find((x) => x.cat === c.cat);
      if (p && p.sum >= 300 && c.sum >= p.sum * 1.3 && c.sum - p.sum >= 300) {
        out.push({ k: `up_${c.cat}`, title: `${c.label}: +${fmt(c.sum - p.sum)} сом`, text: `В прошлом периоде было ${fmt(p.sum)}, сейчас ${fmt(c.sum)}.` });
      }
    }
  }
  if (sum.unmarked.length) {
    const s = sum.unmarked.reduce((a, o) => a - Math.min(0, o.amount), 0);
    out.push({
      k: 'unmarked',
      tone: 'info',
      title: `Не отмечено: ${sum.unmarked.length} ${pl(sum.unmarked.length, 'перевод', 'перевода', 'переводов')} на ${fmt(s)} сом`,
      text: 'Отметь, что это было, — тогда анализ будет точнее.',
    });
  }
  if (!out.length && optTotal > 0) out.push({ k: 'ok', tone: 'good', title: 'Явных лишних трат нет', text: 'Необязательные траты небольшие — так держать.' });
  return out;
}
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
const pl = (n, a, b, c) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
  return c;
};
