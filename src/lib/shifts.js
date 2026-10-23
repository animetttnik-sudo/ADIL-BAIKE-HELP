/**
 * Смены по зарплатам и недостача (чистые функции — экран и тесты).
 *
 * Смена даты d относится к зарплате p, если d ∈ workPeriod(p) = [p − 20, p − 7]
 * (то же правило, что paydayForDate и строка «заработано» в «Расходах»).
 *
 * Недостача — необязательное поле смены `shortage` (сом, > 0). Сумму самой смены
 * она не уменьшает: показывается отдельно и вычитается только из итога зарплаты.
 * Старые сохранения без поля читаются как недостача 0.
 */
import { ANCHOR, PAYDAYS, paydayForDate, workPeriod } from './periods.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const hasAmount = (s) => s && s.amount !== null && s.amount !== undefined && s.amount !== '';

/** Сумма смены (пусто → 0). */
export const shiftAmount = (s) => (hasAmount(s) ? Number(s.amount) || 0 : 0);
/** Недостача смены (нет поля / мусор → 0). */
export const shortageOf = (s) => num(s?.shortage);
/** Чистыми за смену: сумма − недостача (для месячных итогов «Анализа»). */
export const shiftNet = (s) => shiftAmount(s) - shortageOf(s);

/** Смены зарплаты p, по дате. */
export function shiftsInPeriod(shifts, p) {
  const per = workPeriod(p);
  return (shifts || [])
    .filter((s) => s && s.date >= per.start && s.date <= per.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Итоги зарплаты по сменам:
 *  earned — заработано (суммы смен, недостача их не трогает);
 *  short  — недостача за зарплату; net — к выплате = earned − short;
 *  count  — смен в периоде; withSum — с суммой; fromCalc — из «Расчёта»; shortCount — с недостачей.
 */
export function shiftTotals(list) {
  let earned = 0;
  let short = 0;
  let withSum = 0;
  let fromCalc = 0;
  let shortCount = 0;
  for (const s of list || []) {
    earned += shiftAmount(s);
    if (hasAmount(s)) withSum += 1;
    if (s.source === 'calc') fromCalc += 1;
    const sh = shortageOf(s);
    if (sh) {
      short += sh;
      shortCount += 1;
    }
  }
  return { earned, short, net: earned - short, count: (list || []).length, withSum, fromCalc, shortCount };
}

/** Чистый заработок зарплаты p (earned − недостача) — его же показывают «Расходы». */
export const netForPayday = (shifts, p) => shiftTotals(shiftsInPeriod(shifts, p)).net;

/** Записать недостачу (0 / пусто — поле убирается). */
export function withShortage(s, v) {
  const n = Math.round(num(v));
  if (n) return s.shortage === n ? s : { ...s, shortage: n };
  if (!('shortage' in s)) return s;
  const { shortage: _drop, ...rest } = s;
  return rest;
}

/** Зарплата для открытия «Смен»: ближайшая предстоящая (первая ≥ сегодня). */
export function upcomingPayday(today) {
  return PAYDAYS.find((p) => p >= today) || PAYDAYS[PAYDAYS.length - 1];
}

/** Зарплата, на странице которой видна смена этой даты. */
export const shiftPayday = (date) => paydayForDate(date);

/** Границы листания «Смен»: от ANCHOR (или раньше — если есть более ранние смены) до конца списка. */
export function shiftPagerRange(shifts, anchor = ANCHOR) {
  let first = anchor;
  for (const s of shifts || []) if (s && s.date && shiftPayday(s.date) < first) first = shiftPayday(s.date);
  const lo = Math.max(0, PAYDAYS.indexOf(first));
  return { lo, hi: PAYDAYS.length - 1 };
}
