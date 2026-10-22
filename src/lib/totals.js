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
 * Итоги одной зарплаты (единственный источник правды для карточки, шапок групп и «Итого»):
 *  total     — «Расходы за зарплату»: все расходы, что сейчас лежат в этой зарплате
 *              (перенесённые отсюда уже имеют новую дату и сюда не входят, перенесённые сюда — входят);
 *  paid      — «Оплачено»: сумма отмеченных ✓;
 *  remaining — остаток = total − paid (на карточке красным «−remaining»);
 *  count / open — число расходов / неотмеченных; earned — заработано за смены (вторичная строка).
 */
export function paydayTotals(list, earned = 0) {
  let total = 0;
  let paid = 0;
  let open = 0;
  let count = 0;
  for (const e of list || []) {
    count += 1;
    total += amt(e);
    if (isPaid(e)) paid += amt(e);
    else open += 1;
  }
  return { total, paid, remaining: total - paid, count, open, earned };
}

/** Итоги месяца = сумма итогов его зарплат (те же правила, что у каждой карточки). */
export function monthTotals(expenses, paydays) {
  const per = (paydays || []).map((p) => ({ payday: p, ...paydayTotals(expensesInPeriod(expenses, p)) }));
  const sum = (k) => per.reduce((a, t) => a + t[k], 0);
  return { total: sum('total'), paid: sum('paid'), remaining: sum('remaining'), count: sum('count'), open: sum('open'), per };
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

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0));

/**
 * Всё, что показывает карточка «К зарплате», из paydayTotals — одной чистой функцией, без кэшей.
 * mode: 'due' — есть неотмеченные (красный «−remaining»), 'done' — всё оплачено, 'empty' — расходов нет.
 */
export function summaryView(t) {
  const mode = t.total <= 0 && t.count === 0 ? 'empty' : t.remaining > 0 || t.open > 0 ? 'due' : 'done';
  return {
    mode,
    big: mode === 'due' ? `−${fmt(t.remaining)}` : mode === 'done' ? 'Всё оплачено' : fmt(0),
    bigTone: mode === 'due' ? 'bad' : 'good',
    tag:
      mode === 'due'
        ? `${t.open} ${plural(t.open, 'не оплачен', 'не оплачены', 'не оплачены')}`
        : mode === 'done'
          ? 'всё оплачено'
          : 'нет расходов',
    tagTone: mode === 'due' ? 'bad' : 'good',
    progress: t.total > 0 ? Math.min(1, t.paid / t.total) : mode === 'done' ? 1 : 0,
    total: fmt(t.total),
    paid: fmt(t.paid),
    earned: t.earned > 0 ? fmt(t.earned) : null,
  };
}

/** Строка месяца: «всего X · оплачено Z · −остаток» (или «всё оплачено»). */
export function monthView(m) {
  return {
    total: fmt(m.total),
    paid: fmt(m.paid),
    rest: m.remaining > 0 ? `−${fmt(m.remaining)}` : m.count > 0 ? 'всё оплачено' : '—',
    restTone: m.remaining > 0 ? 'bad' : 'good',
    progress: m.total > 0 ? Math.min(1, m.paid / m.total) : 0,
  };
}
