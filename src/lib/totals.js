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

/** Тап по кнопке статуса: переключить ✓ у расхода id. Неизвестный id — тот же объект (без перерисовки). */
export function toggleInState(state, id) {
  const list = state && Array.isArray(state.expenses) ? state.expenses : null;
  if (!list || !list.some((e) => e && e.id === id)) return state;
  return { ...state, expenses: list.map((e) => (e && e.id === id ? { ...e, status: toggledStatus(e.status) } : e)) };
}

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

/**
 * «Вернуть»: обратный перенос — на предыдущую зарплату (−14 дней). Если переносов больше нет
 * (moves ≤ 1 или дошли до movedFrom) — дата = исходная, поля movedFrom/moves убираются. Статус снимается.
 */
export function uncarryExpense(e) {
  const moves = Math.max(0, (Number(e.moves) || 0) - 1);
  const back = addDays(e.date, -PERIOD_DAYS);
  const { movedFrom, moves: _m, ...rest } = e;
  if (moves <= 0 || !movedFrom || back <= movedFrom) return { ...rest, date: movedFrom || back, status: null };
  return { ...rest, date: back, status: null, movedFrom, moves };
}

/** Возврат в состоянии приложения: { state, prev, next } (prev — для «Отменить»). */
export function uncarryInState(app, id) {
  const prev = (app.expenses || []).find((x) => x.id === id);
  if (!prev || !prev.movedFrom) return { state: app, prev: null, next: null };
  const next = uncarryExpense(prev);
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

const FMT = new Intl.NumberFormat('ru-RU');
const fmt = (n) => FMT.format(Math.round(Number(n) || 0));

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
    earnedBig: `+${fmt(Math.max(0, t.earned))}`,
    // план = все расходы зарплаты; разница с заработанным: «не хватает −X» / «сверх плана +X»
    planTotal: fmt(t.total),
    planDiff: Math.round(t.earned || 0) - Math.round(t.total || 0),
    planLine:
      t.total <= 0 && !(t.earned > 0)
        ? null
        : (() => {
            const d = Math.round(t.earned || 0) - Math.round(t.total || 0);
            return `План ${fmt(t.total)} · ${d < 0 ? `не хватает −${fmt(-d)}` : d > 0 ? `сверх плана +${fmt(d)}` : 'ровно в план'}`;
          })(),
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

// ── Пейджер зарплат ─────────────────────────────────────────────────────

/** Режим карточки зарплаты p ('due' | 'done' | 'empty') — те же правила, что у summaryView. */
export function paydayMode(expenses, p) {
  return summaryView(paydayTotals(expensesInPeriod(expenses, p))).mode;
}

/**
 * Какую зарплату показать при запуске. cur — зарплата, в периоде которой сегодня.
 * Ищем ближайшую к cur зарплату с неотмеченными расходами: cur, +1, −1, +2, −2, +3, −3
 * (при равном расстоянии — сначала будущая). Не нашли: если у cur всё оплачено — следующая,
 * иначе сама cur.
 */
export function defaultPayday(expenses, today, span = 3) {
  const cur = paydayOf(today) || PAYDAYS[0];
  const i = PAYDAYS.indexOf(cur);
  for (let d = 0; d <= span; d++) {
    for (const k of d === 0 ? [i] : [i + d, i - d]) {
      const p = PAYDAYS[k];
      if (p && paydayTotals(expensesInPeriod(expenses, p)).open > 0) return p;
    }
  }
  if (paydayMode(expenses, cur) === 'done' && PAYDAYS[i + 1]) return PAYDAYS[i + 1];
  return cur;
}

/**
 * Автопереход на следующую зарплату: только когда на ТОЙ ЖЕ показанной зарплате
 * режим сменился 'due' → 'done' (отметили последний расход), а не при листании.
 * prev/next: { payday, mode }.
 */
export function shouldAutoAdvance(prev, next) {
  return !!(prev && next && prev.payday && prev.payday === next.payday && prev.mode === 'due' && next.mode === 'done');
}

/** Границы листания: от первой зарплаты (ANCHOR или раньше, если есть более ранние расходы) до конца списка. */
export function pagerRange(expenses, anchor) {
  let first = anchor;
  for (const e of expenses || []) if (e.date && e.date < first) first = e.date;
  const lo = Math.max(0, PAYDAYS.indexOf(paydayOf(first) || PAYDAYS[0]));
  return { lo, hi: PAYDAYS.length - 1 };
}
