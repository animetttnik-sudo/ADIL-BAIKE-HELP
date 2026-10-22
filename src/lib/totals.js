/**
 * Суммы по зарплате для «Расходов» (чистые функции — экран и тесты).
 * Статусы расхода в zp_app_v1: 'paid' (✓ оплачено), 'missed' (✕ не платим/отменён),
 * null/нет (без отметки). ✕ НЕ входит в план — его не нужно оплачивать.
 */
import { PAYDAYS, addDays } from './periods.js';

export const isPaid = (e) => e?.status === 'paid';
export const isCancelled = (e) => e?.status === 'missed';
const amt = (e) => Number(e?.amount) || 0;

/** Расходы, которые экран показывает под зарплатой p: дата в [p, следующая зарплата). */
export function expensesInPeriod(expenses, p) {
  const nextP = PAYDAYS.find((x) => x > p) || addDays(p, 14);
  return (expenses || []).filter((e) => e.date >= p && e.date < nextP).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * planned   — к оплате всего (без ✕)
 * paid      — уже оплачено (✓)
 * remaining — осталось оплатить = planned − paid  ← большая цифра карточки
 * cancelled — сумма ✕ (для подписи)
 * free      — заработано − planned: сколько останется после всех платежей
 */
export function paydayTotals(list, earned = 0) {
  let planned = 0;
  let paid = 0;
  let cancelled = 0;
  let open = 0;
  for (const e of list || []) {
    if (isCancelled(e)) {
      cancelled += amt(e);
      continue;
    }
    planned += amt(e);
    if (isPaid(e)) paid += amt(e);
    else open += 1;
  }
  return { planned, paid, remaining: planned - paid, cancelled, open, free: earned - planned, earned };
}

/** Следующий статус по тапу: пусто/✕ → ✓, ✓ → пусто. */
export const toggledStatus = (status) => (status === 'paid' ? null : 'paid');
