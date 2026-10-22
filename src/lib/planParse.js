/**
 * Парсер расходов из заметок iPhone (чистый JS — работает и в приложении, и в node-скрипте).
 *
 * Формат заметки (как scripts/plan.txt):
 *   Расходы Сентябрь [2027]            — блок месяца (может стоять в конце строки «Общ - … Расходы Май»)
 *   Первая зарплата 4 сентябрь         — зарплата; ниже — её расходы
 *   5 сентябрь - 540 Единица ✅         — дата, сумма, название; ✅ (✓ ✔) — оплачено
 *   Контракт - 10 000                  — без даты → в день зарплаты
 *   Общ - 11890                        — итог пользователя (не расход, только сверка)
 * Без заголовков тоже можно: «15 октября - 5075 Мбанк» попадёт под зарплату, в период которой
 * входит дата. Даты: «15 октября», «15 окт», «15.10», «15.10.2026». Всё, что не разобрано, —
 * в unparsed (превью показывает «Не распознано»), ничего не теряется молча.
 *
 * Год без явного указания: ближайший разумный относительно ref (по умолчанию — сегодня):
 * месяц попадает в окно [месяц ref − 1 … +10]. Для ref в сентябре–октябре 2026 это ровно
 * прежнее правило «сен–дек → 2026, янв–авг → 2027».
 */
import { PAYDAYS, ANCHOR, addDays } from './periods.js';

const MONTH_PREFIX = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTH_RE = '(?:янв|фев|мар|апр|ма[йяе]|июн|июл|авг|сен|окт|ноя|дек)[А-Яа-яёЁ]*';

/** «сентябрь», «Мая», «май», «окт» → 0..11, иначе -1 */
export function monthIndex(word) {
  const w = String(word || '').toLowerCase().replace('ё', 'е').replace(/\.$/, '');
  if (w.length < 3) return -1;
  for (let i = 0; i < 12; i++) {
    const p = MONTH_PREFIX[i];
    if (i === 4 ? /^ма[йяе]$/.test(w) : w.startsWith(p)) return i;
  }
  return -1;
}
const pad = (n) => String(n).padStart(2, '0');
const ORD = { первая: 1, вторая: 2, третья: 3, четвертая: 4, четвёртая: 4 };
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Год для месяца m (0..11) без явного года: окно [месяц ref − 1 … +10]. */
export function inferYear(m, ref = new Date()) {
  const r = typeof ref === 'string' ? new Date(`${ref}T12:00:00`) : ref;
  const start = r.getFullYear() * 12 + r.getMonth() - 1;
  let y = Math.floor(start / 12);
  if (y * 12 + m < start) y += 1;
  return y;
}
/** Прежнее фиксированное правило (сен–дек → 2026, янв–авг → 2027) — для совместимости. */
export const PLAN_REF = '2026-10-15'; // опорная дата заметки plan.txt (окно сен 2026 – авг 2027)
export const defaultYear = (m) => inferYear(m, PLAN_REF);

/** Дата внутри блока месяца: месяц может «перескочить» (декабрь → 6 января). */
function resolveDate(day, m, blockY, blockM) {
  let y = blockY;
  if (m - blockM < -6) y += 1;
  else if (m - blockM > 6) y -= 1;
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}
const validDate = (s) => {
  const d = new Date(`${s}T12:00:00`);
  return !isNaN(d) && toIso(d) === s;
};
const digits = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

/** Зарплата, в период которой входит дата (по расписанию приложения; вне таблицы — по шагу 14 дней). */
export function paydayFor(date) {
  if (PAYDAYS.length && date >= PAYDAYS[0] && date < addDays(PAYDAYS[PAYDAYS.length - 1], 14)) {
    let p = PAYDAYS[0];
    for (const x of PAYDAYS) {
      if (x <= date) p = x;
      else break;
    }
    return p;
  }
  const days = Math.floor((new Date(`${date}T12:00:00`) - new Date(`${ANCHOR}T12:00:00`)) / 864e5);
  return addDays(ANCHOR, Math.floor(days / 14) * 14);
}

const PAID_RE = /✅|✓|✔/g;
const HEAD_RE = new RegExp(`Расходы\\s+(?=${MONTH_RE}(?:\\s+\\d{4})?\\s*$)`, 'i');

/**
 * Левая часть строки → дата или null. ctx: { blockY, blockM } (блок месяца) или null, ref — для года.
 */
function parseDateWord(L, ctx, ref) {
  const dm = L.match(/^(\d{1,2})\s*([А-Яа-яёЁ]+\.?)$/);
  if (dm && monthIndex(dm[2]) >= 0) {
    const m = monthIndex(dm[2]);
    const s = ctx ? resolveDate(Number(dm[1]), m, ctx.blockY, ctx.blockM) : `${inferYear(m, ref)}-${pad(m + 1)}-${pad(Number(dm[1]))}`;
    return validDate(s) ? s : null;
  }
  const nm = L.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  if (nm) {
    const m = Number(nm[2]) - 1;
    if (m < 0 || m > 11) return null;
    let y = nm[3] ? Number(nm[3]) : null;
    if (y != null && y < 100) y += 2000;
    if (y == null) y = ctx ? Number(resolveDate(1, m, ctx.blockY, ctx.blockM).slice(0, 4)) : inferYear(m, ref);
    const s = `${y}-${pad(m + 1)}-${pad(Number(nm[1]))}`;
    return validDate(s) ? s : null;
  }
  return null;
}

/**
 * text → { blocks, warnings, unparsed }.
 *  blocks: [{ month, ordinal, payday, userTotal, userTotalRaw, items:[{date, amount, title, paid, flags?, src}], full? }]
 *    full: false — блок собран из строк без заголовка зарплаты (не «полный список» месяца).
 *  unparsed: строки, которые не удалось разобрать (как есть).
 */
export function parsePlan(text, opts = {}) {
  const ref = opts.ref || new Date();
  const clean = String(text || '').replace(/\u200e|\u200f|\ufeff|\r/g, '').replace(/\ufe0f/g, '');
  const blocks = [];
  const warnings = [];
  const unparsed = [];
  const loose = new Map(); // payday → блок из строк без заголовков
  let ctx = null; // блок месяца { blockY, blockM }
  let cur = null; // текущая зарплата

  const bad = (line, why) => {
    unparsed.push(line);
    warnings.push(`${why}: «${line}»`);
  };
  const looseBlock = (payday) => {
    let b = blocks.find((x) => x.payday === payday && x.full !== false && !cur) || loose.get(payday);
    if (!b) {
      b = { month: payday.slice(0, 7), ordinal: 0, payday, userTotal: null, userTotalRaw: null, items: [], full: false };
      loose.set(payday, b);
      blocks.push(b);
    }
    return b;
  };

  // «Общ - 10000 Расходы Август 2027» → две строки
  const lines = [];
  for (const raw of clean.split('\n')) {
    let rest = raw;
    for (;;) {
      const m = rest.match(HEAD_RE);
      if (!m) break;
      const before = rest.slice(0, m.index);
      if (before.trim()) lines.push(before);
      lines.push(rest.slice(m.index));
      rest = '';
      break;
    }
    if (rest) lines.push(rest);
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const hm = line.match(new RegExp(`^Расходы\\s+(${MONTH_RE})(?:\\s+(\\d{4}))?\\s*$`, 'i'));
    if (hm) {
      const blockM = monthIndex(hm[1]);
      ctx = { blockM, blockY: hm[2] ? Number(hm[2]) : inferYear(blockM, ref) };
      cur = null;
      continue;
    }
    const ph = line.match(/^(?:(\S+)\s+)?зарплата\s+(\d{1,2})\s+([А-Яа-яёЁ]+)/i);
    if (ph && monthIndex(ph[3]) >= 0) {
      const m = monthIndex(ph[3]);
      const c = ctx || { blockM: m, blockY: inferYear(m, ref) };
      const payday = resolveDate(Number(ph[2]), m, c.blockY, c.blockM);
      if (!validDate(payday)) {
        bad(line, 'неверная дата зарплаты');
        continue;
      }
      cur = {
        month: `${c.blockY}-${pad(c.blockM + 1)}`,
        ordinal: ORD[String(ph[1] || '').toLowerCase()] || 0,
        payday,
        userTotal: null,
        userTotalRaw: null,
        items: [],
      };
      cur.ctx = c;
      blocks.push(cur);
      continue;
    }
    if (/^Общ/i.test(line) || /^Итого/i.test(line)) {
      const rest = line.replace(/^(Общ|Итого)\S*\s*[-–—:]?\s*/i, '');
      const tail = rest.includes('=') ? rest.split('=').pop() : rest;
      if (cur) {
        cur.userTotal = digits(tail);
        cur.userTotalRaw = rest.trim();
      }
      continue;
    }
    const norm = line.replace(/[–—]/g, '-');
    const dash = norm.indexOf('-');
    const paid = PAID_RE.test(norm);
    PAID_RE.lastIndex = 0;
    let L;
    let R;
    if (dash >= 0) {
      L = norm.slice(0, dash).replace(PAID_RE, '').trim();
      R = norm.slice(dash + 1).replace(PAID_RE, '').trim();
    } else {
      // без тире: «15 октября 5075 Мбанк» / «15.10 5075 Мбанк»
      const nd = norm.replace(PAID_RE, '').trim().match(new RegExp(`^(\\d{1,2}\\s*${MONTH_RE}\\.?|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?)\\s+(\\d.*)$`, 'i'));
      if (!nd) {
        bad(line, 'не разобрано');
        continue;
      }
      L = nd[1].trim();
      R = nd[2].trim();
    }
    const am = R.match(/^(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:\s+|$)(.*)$/) || R.match(/^(\d[\d ]*\d|\d)(?:\s+|$)(.*)$/);
    if (!am) {
      bad(line, 'нет суммы');
      continue;
    }
    const amount = digits(am[1]);
    let title = am[2].trim();
    const flags = [];
    const cctx = cur ? cur.ctx : ctx;
    let date = parseDateWord(L, cctx, ref);
    let target = cur;
    if (!date) {
      if (/^\d{1,2}\s*[А-Яа-яёЁ]+\.?$/.test(L) && monthIndex(L.replace(/^\d+\s*/, '')) >= 0) {
        bad(line, 'неверная дата');
        continue;
      }
      if (!cur) {
        bad(line, 'нет даты и зарплаты');
        continue;
      }
      // «1 Контракт - 10 000» / «Контракт - 10000»: даты нет, слева — название
      const nm = L.match(/^(\d+)\s+(.+)$/);
      const leftName = nm ? `${nm[2]} ${nm[1]}` : L;
      title = [leftName, title].filter(Boolean).join(' ');
      date = cur.payday;
      flags.push('noDate');
    } else if (!cur) {
      target = looseBlock(paydayFor(date));
    }
    if (!amount) {
      bad(line, 'нулевая сумма');
      continue;
    }
    if (!title) flags.push('noName');
    target.items.push({ date, amount, title, paid, ...(flags.length ? { flags } : {}), src: line });
  }
  blocks.forEach((b) => delete b.ctx);
  // пустые «свободные» блоки не нужны; старые зарплаты сначала
  const out = blocks.filter((b) => b.full !== false || b.items.length);
  out.sort((a, b) => a.payday.localeCompare(b.payday));
  return { blocks: out, warnings, unparsed };
}

export const blockSum = (b) => b.items.reduce((a, x) => a + x.amount, 0);

/** Блоки без служебных полей (как в plan2026.js). */
export const stripBlocks = (bs) =>
  bs.map(({ items, full, ...b }) => ({ ...b, ...(full === false ? { full } : {}), items: items.map(({ src: _s, ...x }) => x) }));
