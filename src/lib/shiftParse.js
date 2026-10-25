/**
 * Разбор заметки «Смены» (как scripts/shifts.txt). Чистая функция — экран и тесты.
 *
 *   21-4 дек. Зп 11 декабрь        ← блок: смены 21 ноя – 4 дек, зарплата 11 дек
 *   Первая половина                ← просто подпись
 *   21 - ночь касса 22 - ночь касса    ← смены, можно несколько в строке
 *   26 - день Аламедин рядовой     ← место — между временем и ролью
 *   27 - ночь касса - 2430         ← недостача 2430;  «+300» — наставник (доплата);  «касса -» — без суммы
 *   -3927 депонирование            ← депонирование (также «с прошлой зп») → на зарплату этого блока; «+» прибавляет
 *
 * Месяц диапазона — у последнего дня; первый день больше последнего → предыдущий месяц.
 * Год: зарплата из заголовка — ближайшая к ref (в пределах полугода), совпадающая с графиком
 * приложения (каждые 14 дней от 2026-09-04); не совпала — ближайшая по календарю + предупреждение. Число смены — день внутри периода блока.
 * Если заголовок расходится с графиком приложения — это попадает в warnings.
 */
import { PAYDAYS, addDays, paydayForDate, workPeriod } from './periods.js';
import { shiftTitle } from './calc.js';

const MONTHS = [
  ['янв', 0], ['фев', 1], ['мар', 2], ['апр', 3], ['май', 4], ['мая', 4], ['июн', 5], ['июл', 6],
  ['авг', 7], ['сен', 8], ['окт', 9], ['ноя', 10], ['дек', 11],
];
const monthOf = (w) => {
  const t = String(w || '').toLowerCase().replace(/\.$/, '');
  for (const [k, m] of MONTHS) if (t.startsWith(k)) return m;
  return null;
};
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCMonth() === m && dt.getUTCDate() === d ? `${y}-${pad(m + 1)}-${pad(d)}` : null;
};
const toIso = (ref) => {
  if (typeof ref === 'string') return ref.slice(0, 10);
  const d = ref instanceof Date ? ref : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const fmt = (d) => `${Number(d.slice(8, 10))}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Последняя дата «day.month» не позже limit. */
function onOrBefore(day, month, limit) {
  const y = Number(limit.slice(0, 4));
  for (const yy of [y, y - 1]) {
    const d = iso(yy, month, day);
    if (d && d <= limit) return d;
  }
  return null;
}

/** Дата зарплаты «11 декабрь»: год — ближайший к ref, лучше совпадающий с графиком. */
function resolvePayday(day, month, ref) {
  const y = Number(ref.slice(0, 4));
  const cands = [y - 1, y, y + 1].map((yy) => iso(yy, month, day)).filter(Boolean);
  const near = (list) => list.sort((a, b) => daysBetween(a, ref) - daysBetween(b, ref))[0] || null;
  // год — ближайший к ref; из графика берём только в пределах полугода (иначе «31 октябрь» ушёл бы в прошлый год)
  const inSched = cands.filter((d) => PAYDAYS.includes(d) && daysBetween(d, ref) <= 183);
  return inSched.length ? { date: near(inSched), onSchedule: true } : { date: near(cands), onSchedule: false };
}

const DASH = '[-–—]';
const NUM = '(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)';
const RE_HEADER = new RegExp(
  `^\\s*(\\d{1,2})\\s*${DASH}\\s*(\\d{1,2})\\s+([а-яё]+)\\.?(?:\\s*,?\\s*зп\\s+(\\d{1,2})\\s+([а-яё]+)\\.?)?`,
  'iu'
);
const RE_PAY_ONLY = /^\s*зп\s+(\d{1,2})\s+([а-яё]+)\.?/iu;
const RE_SHIFT = new RegExp(
  `(\\d{1,2})\\s*${DASH}\\s*(день|ночь)\\s+(?:([^\\d\\n+\\-–—]+?)\\s+)?(касса|кассир|рядовой|ряд)(?![а-яё])` +
    `(?:\\s*([+\\-–—])(?:\\s*${NUM}(?!\\s*${DASH}\\s*(?:день|ночь)))?)?`,
  'giu'
);
const RE_CARRY = new RegExp(`([+\\-–—])\\s*${NUM}\\s*(?:сом\\s*)?(?:с\\s+прошл[а-яё]*\\s+зп|депонировани[а-яё]*)\\.?`, 'giu');
const RE_LABEL = /(первая|вторая)\s+половина/giu;
const num = (s) => Number(String(s).replace(/[ \u00a0]/g, ''));

/**
 * @returns {{
 *   blocks: { header, payday, headerPayday, start, end, carry, shifts: {date,time,role,title,place,adj,mentor,text}[] }[],
 *   unparsed: { text, why }[],
 *   warnings: string[],
 * }}
 *   adj — недостача (> 0, «- 2430»; 0 — нет). Импорт излишек не создаёт никогда;
 *   mentor — «+300» после смены: наставник, доплата (0 — нет);
 *   payday — зарплата приложения для смен блока (paydayForDate конца периода),
 *   headerPayday — как в заметке.
 */
export function parseShifts(text, { ref = new Date() } = {}) {
  const today = toIso(ref);
  const blocks = [];
  const unparsed = [];
  const warnings = [];
  let cur = null;
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');

  const openBlock = (header, start, end, headerPayday, paydayOk) => {
    const payday = paydayForDate(end);
    const per = workPeriod(payday);
    if (headerPayday && headerPayday !== payday) {
      warnings.push(
        `«${header}»: в заметке зп ${fmt(headerPayday)}, а по графику приложения смены ${fmt(start)}–${fmt(end)} ` +
          `идут в зп ${fmt(payday)}${paydayOk ? '' : ` (${fmt(headerPayday)} — не день зарплаты)`}.`
      );
    }
    if (per.start !== start || per.end !== end) {
      warnings.push(
        `«${header}»: период в заметке ${fmt(start)}–${fmt(end)}, по графику приложения к зп ${fmt(payday)} — ` +
          `${fmt(per.start)}–${fmt(per.end)}. Смены встанут по своим датам.`
      );
    }
    cur = { header, payday, headerPayday: headerPayday || payday, start, end, carry: 0, shifts: [] };
    blocks.push(cur);
  };

  for (const raw of lines) {
    let line = raw.replace(/\u00a0/g, ' ');
    if (!line.trim()) continue;

    // заголовок блока
    const h = line.match(RE_HEADER);
    if (h && !new RegExp(`^\\s*\\d{1,2}\\s*${DASH}\\s*(день|ночь)`, 'iu').test(line)) {
      const sd = Number(h[1]);
      const ed = Number(h[2]);
      const em = monthOf(h[3]);
      if (em != null) {
        let pay = null;
        let payOk = true;
        if (h[4] && monthOf(h[5]) != null) {
          const r = resolvePayday(Number(h[4]), monthOf(h[5]), today);
          pay = r.date;
          payOk = r.onSchedule;
        }
        // конец периода: последняя такая дата не позже зарплаты (или ближайшая к сегодня)
        let end = pay ? onOrBefore(ed, em, pay) : null;
        if (!end) {
          const y = Number(today.slice(0, 4));
          end = [y - 1, y, y + 1].map((yy) => iso(yy, em, ed)).filter(Boolean).sort((a, b) => daysBetween(a, today) - daysBetween(b, today))[0];
        }
        const start = end ? (sd > ed ? onOrBefore(sd, (em + 11) % 12, end) : onOrBefore(sd, em, end)) : null;
        if (end && start) {
          openBlock(h[0].trim().replace(/\s+/g, ' '), start, end, pay, payOk);
          line = line.slice(h.index + h[0].length);
          if (!line.trim()) continue;
        }
      }
    } else if (RE_PAY_ONLY.test(line)) {
      const m = line.match(RE_PAY_ONLY);
      const mm = monthOf(m[2]);
      if (mm != null) {
        const r = resolvePayday(Number(m[1]), mm, today);
        const per = workPeriod(r.onSchedule ? r.date : paydayForDate(addDays(r.date, -7)));
        openBlock(m[0].trim(), per.start, per.end, r.date, r.onSchedule);
        line = line.slice(m.index + m[0].length);
        if (!line.trim()) continue;
      }
    }

    let rest = line.replace(RE_LABEL, ' ');

    rest = rest.replace(RE_CARRY, (all, sign, n) => {
      if (!cur) {
        unparsed.push({ text: all.trim(), why: 'перенос до первого заголовка «дд-дд мес. Зп …»' });
        return ' ';
      }
      cur.carry += (sign === '+' ? -1 : 1) * num(n);
      return ' ';
    });

    rest = rest.replace(RE_SHIFT, (all, d, time, place, role, sign, n) => {
      if (!cur) {
        unparsed.push({ text: all.trim(), why: 'смена до первого заголовка «дд-дд мес. Зп …»' });
        return ' ';
      }
      const day = Number(d);
      let date = null;
      for (let x = cur.start; x <= cur.end; x = addDays(x, 1)) if (Number(x.slice(8, 10)) === day) date = x;
      if (!date) {
        unparsed.push({ text: all.trim(), why: `${day}-го нет в периоде ${fmt(cur.start)}–${fmt(cur.end)}` });
        return ' ';
      }
      const t = /^д/i.test(time) ? 'day' : 'night';
      const r = /^р/i.test(role) ? 'ryad' : 'kass';
      const adj = n && sign !== '+' ? num(n) : 0;
      const mentor = n && sign === '+' ? num(n) : 0;
      const pl = (place || '').trim();
      if (cur.shifts.some((s) => s.date === date && s.time === t)) {
        warnings.push(`${fmt(date)} ${time}: в заметке дважды — взята первая строка.`);
        return ' ';
      }
      cur.shifts.push({ date, time: t, role: r, title: shiftTitle(r, t), place: pl, adj, mentor, text: all.trim() });
      return ' ';
    });

    const left = rest.replace(/[\s.,;:|•·\-–—]+/g, '');
    if (left) unparsed.push({ text: raw.trim(), why: 'не похоже на смену «число - день/ночь касса/рядовой»' });
  }

  for (const b of blocks) b.shifts.sort((a, c) => a.date.localeCompare(c.date) || (a.time === 'day' ? -1 : 1));
  blocks.sort((a, b) => a.payday.localeCompare(b.payday));
  return { blocks, unparsed, warnings };
}
