/**
 * «Анализ»: итоги по месяцам (чистые функции — экран и тесты).
 * e — заработано чистыми (shiftNet смен месяца − депонирование), s — оплачено расходов,
 * n — смен с суммой, all — смен всего. Месяцы, где нет ни заработка, ни оплат
 * (досеянные пустые смены будущих месяцев), не показываются — иначе «3 мес» показывали бы пустое будущее.
 */
import { shiftNet, carryDue, carryOf, shiftAmount } from './shifts.js';
import { workPeriod } from './periods.js';

const hasSum = (x) => x && x.amount !== null && x.amount !== undefined && x.amount !== '';

export function monthStats(state, isPaid) {
  const M = {};
  const get = (k) => M[k] || (M[k] = { e: 0, s: 0, n: 0, all: 0, gross: 0 });
  for (const x of state?.shifts || []) {
    if (!x || typeof x.date !== 'string') continue;
    const m = get(x.date.slice(0, 7));
    m.e += shiftNet(x);
    m.all += 1;
    if (hasSum(x)) {
      m.n += 1;
      m.gross += shiftAmount(x);
    }
  }
  for (const p of Object.keys(state?.carry || {})) get(workPeriod(p).end.slice(0, 7)).e -= carryDue(carryOf(state, p));
  for (const x of state?.expenses || []) {
    if (x && typeof x.date === 'string' && isPaid(x)) get(x.date.slice(0, 7)).s += Number(x.amount) || 0;
  }
  for (const k of Object.keys(M)) if (!M[k].e && !M[k].s && !M[k].n) delete M[k];
  return M;
}

/** Средняя сумма смены месяца (по сменам с суммой), 0 — нет. */
export const monthAvg = (m) => (m && m.n ? Math.round(m.gross / m.n) : 0);
