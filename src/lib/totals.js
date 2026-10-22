/**
 * Суммы по зарплате и перенос расходов (чистые функции — экран и тесты).
 * Статусы расхода в zp_app_v1: 'paid' (✓ оплачено) или пусто (null / нет поля).
 * Старое значение 'missed' («не оплатил вовремя») считается неоплаченным.
 * «Не плачу» — не статус, а действие: перенос расхода на следующую зарплату.
 */
import { PAYDAYS, addDays } from './periods.js';

export const isPaid = (e) => e?.status === 'paid';
const amt = (e) => Number(e?.amount) || 0;
export const PERIOD_DAYS = 14;

/** Исходная дата расхода (до всех переносов) — для дублей импорта и досева постоянных. */
export const origDate = (e) => e?.movedFrom || e?.date;

/** Зарплата, под которой показывается расход этой даты. */
export function paydayOf(date) {
  let p = null;
  for (const x of PAYDAYS) {
    if (x <= date) p = x;
    else break;
  }
  return p;
}

/** Расходы, которые экран показывает под зарплатой p: дата в [p, следующая зарплата). */
export function expensesInPeriod(expenses, p) {
  const nextP = PAYDAYS.find((x) => x > p) || addDays(p, PERIOD_DAYS);
  return (expenses || []).filter((e) => e.date >= p && e.date < nextP).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * planned — к оплате всего; paid — оплачено (✓); unpaid — не оплачено = planned − paid
 * (большая цифра карточки, показывается как «−unpaid»); free — заработано − planned.
 */
export function paydayTotals(list, earned = 0) {
  let planned = 0;
  let paid = 0;
  let open = 0;
  for (const e of list || []) {
    planned += amt(e);
    if (isPaid(e)) paid += amt(e);
    else open += 1;
  }
  return { planned, paid, unpaid: planned - paid, open, free: earned - planned, earned };
}

/** Тап по кнопке: не ✓ → ✓, ✓ → пусто. */
export const toggledStatus = (status) => (status === 'paid' ? null : 'paid');

/**
 * «Не плачу»: переносит расход на следующую зарплату (+14 дней — тот же день внутри периода,
 * зарплаты идут строго через 14 дней от ANCHOR). id сохраняется; статус снимается;
 * movedFrom — самая первая дата, moves — сколько раз переносили.
 */
export function carryExpense(e) {
  return {
    ...e,
    date: addDays(e.date, PERIOD_DAYS),
    status: null,
    movedFrom: e.movedFrom || e.date,
    moves: (Number(e.moves) || 0) + 1,
  };
}

/** Перенос в состоянии приложения: { state, prev, next } (prev — для «Отменить»). */
export function carryInState(app, id) {
  const prev = (app.expenses || []).find((x) => x.id === id);
  if (!prev) return { state: app, prev: null, next: null };
  const next = carryExpense(prev);
  return { state: { ...app, expenses: app.expenses.map((x) => (x.id === id ? next : x)) }, prev, next };
}

/** «Отменить»: вернуть расход как был (если его не удалили за это время). */
export function undoCarry(app, prev) {
  if (!prev || !(app.expenses || []).some((x) => x.id === prev.id)) return app;
  return { ...app, expenses: app.expenses.map((x) => (x.id === prev.id ? prev : x)) };
}
