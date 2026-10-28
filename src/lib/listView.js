/**
 * Мелкая логика списков: подсказка «не оплачено» у расхода и быстрые фильтры страницы.
 */
const DAY = 86400000;
const t = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Неоплаченный расход, срок которого наступил (сегодня или за последние 14 дней). */
export function dueLabel(item, today) {
  if (!item || item.status === 'paid' || typeof item.date !== 'string' || !today) return null;
  if (!(Number(item.amount) > 0)) return null;
  const late = Math.round((t(today) - t(item.date)) / DAY);
  if (late < 0 || late > 14) return null;
  return late === 0 ? 'к оплате сегодня' : 'не оплачено';
}

const noSum = (s) => s.amount === null || s.amount === undefined || s.amount === '';

/** Фильтр расходов: 'all' | 'unpaid'. */
export const filterExpenses = (list, f) => (f === 'unpaid' ? list.filter((e) => e.status !== 'paid') : list);
/** Фильтр смен: 'all' | 'nosum' (своя смена без суммы). */
export const filterShifts = (list, f) => (f === 'nosum' ? list.filter((s) => noSum(s) && s.source !== 'calc') : list);

/** Показывать ли фильтр: есть из чего выбирать (обе группы непустые и список не крошечный). */
export function filterCounts(list, kind) {
  const n = kind === 'shifts' ? filterShifts(list, 'nosum').length : filterExpenses(list, 'unpaid').length;
  return { total: list.length, part: n, show: list.length >= 4 && n > 0 && n < list.length };
}
