/**
 * «Постоянные платежи»: правило в state.recurring повторяет расход каждый месяц
 * в то же число до даты untilDate (включительно).
 *
 * Правило: { id, title, amount, day, dayOfMonth, startDate, untilDate, months: ['YYYY-MM', …] }
 *  - day = dayOfMonth (day — старое имя поля, по нему узнаёт расходы «Удалить автодобавленные»);
 *  - months — месяцы, где правило уже отработало (добавило расход или нашло такой же).
 *    Благодаря этому удалённый вручную расход досев не вернёт.
 * Расход от правила: { id, date, amount, title, type: 'recurring', status: null, rid }.
 *
 * Старые правила (без untilDate) — следы прежней функции: ничего не досевают.
 * Модуль без импортов — его подключает periods.js (seedMonth).
 */
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const normT = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s.\-_«»"']/g, '');

/** Правило активно (новое, с датой «до»). */
export const isActiveRule = (r) =>
  !!r && typeof r === 'object' && typeof r.untilDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.untilDate) && !r.stopped;

export const rulesOf = (app) => (Array.isArray(app?.recurring) ? app.recurring : []);

/** Дата повтора в месяце (y, m 0-based): день правила, но не позже последнего дня месяца (31 → 28/30). */
export function ruleDateIn(rule, y, m) {
  const d = Math.min(Number(rule.dayOfMonth ?? rule.day) || 1, lastDay(y, m));
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/**
 * Создать правило и первый расход на дату date. Возвращает новое состояние.
 * untilDate раньше date поднимается до date.
 */
export function addRecurring(app, { date, amount, title, untilDate }, makeId) {
  const day = Number(date.slice(8, 10));
  const until = untilDate && untilDate >= date ? untilDate : date;
  const rule = {
    id: makeId(),
    title,
    amount,
    day,
    dayOfMonth: day,
    startDate: date,
    untilDate: until,
    months: [date.slice(0, 7)],
  };
  const exp = { id: makeId(), date, amount, title, type: 'recurring', status: null, rid: rule.id };
  return { ...app, expenses: [...app.expenses, exp], recurring: [...rulesOf(app), rule] };
}

const od = (e) => e.movedFrom || e.date;

/** Такой же платёж уже есть в этом месяце (от правила, из плана или введён вручную). */
function hasSame(expenses, rule, monthKey) {
  const n = normT(rule.title);
  return expenses.some((e) => {
    if (!e || typeof e.date !== 'string') return false;
    if (e.rid === rule.id && (e.date.startsWith(monthKey) || od(e).startsWith(monthKey))) return true;
    if (!(e.date.startsWith(monthKey) || od(e).startsWith(monthKey))) return false;
    if (Number(e.amount) !== Number(rule.amount)) return false;
    return n ? normT(e.title) === n : !normT(e.title) && Number(od(e).slice(8, 10)) === Number(rule.dayOfMonth ?? rule.day);
  });
}

/**
 * Досев постоянных платежей в месяце (y, m). Мутирует next.expenses/next.recurring (копии из seedMonth).
 * Возвращает true, если что-то поменялось.
 */
export function seedRecurringMonth(next, y, m, makeId) {
  const rules = rulesOf(next);
  if (!rules.some(isActiveRule)) return false;
  const key = `${y}-${pad(m + 1)}`;
  let changed = false;
  const out = rules.map((r) => {
    if (!isActiveRule(r)) return r;
    const months = Array.isArray(r.months) ? r.months : [];
    if (months.includes(key)) return r;
    const date = ruleDateIn(r, y, m);
    if ((r.startDate && date < r.startDate) || date > r.untilDate) return r;
    if (!hasSame(next.expenses, r, key)) {
      next.expenses.push({ id: makeId(), date, amount: r.amount, title: r.title, type: 'recurring', status: null, rid: r.id });
    }
    changed = true;
    return { ...r, months: [...months, key] };
  });
  if (changed) next.recurring = out;
  return changed;
}

/** Правило, к которому относится расход (по rid). */
export const ruleOfExpense = (app, e) => (e && e.rid ? rulesOf(app).find((r) => r.id === e.rid) || null : null);

/** Тот же платёж: то же название (без регистра/пробелов), та же сумма и то же число месяца. */
const sameAs = (e) => {
  const n = normT(e.title);
  const dd = Number(od(e).slice(8, 10));
  return (x) =>
    (!!e.rid && x.rid === e.rid) ||
    (normT(x.title) === n && Number(x.amount) === Number(e.amount) && Number(od(x).slice(8, 10)) === dd);
};

/**
 * Расходы, которые удалит «Этот и следующие»: этот + все последующие неоплаченные такие же —
 * того же правила (по rid) или с тем же названием, суммой и числом месяца (старые «постоянные»,
 * строки импортированного плана, введённые вручную). Прошлые и оплаченные остаются.
 */
export function seriesToRemove(app, id) {
  const e = (app.expenses || []).find((x) => x.id === id);
  if (!e) return [];
  const same = sameAs(e);
  return app.expenses.filter((x) => x.id === e.id || (x.status !== 'paid' && od(x) >= od(e) && same(x)));
}

/** Правила, которые надо снять вместе с серией: правило расхода (rid) и любые с тем же названием, суммой и числом. */
function rulesFor(app, e) {
  const n = normT(e.title);
  const dd = Number(od(e).slice(8, 10));
  return rulesOf(app).filter(
    (r) =>
      r &&
      ((e.rid && r.id === e.rid) ||
        (normT(r.title) === n && Number(r.amount) === Number(e.amount) && Number(r.dayOfMonth ?? r.day) === dd))
  );
}

/**
 * Есть что удалять «сериями»: у расхода есть правило, или впереди есть такие же неоплаченные,
 * или это старый «постоянный» (type recurring). Тогда в удалении есть выбор «Только этот / Этот и следующие».
 */
export const isSeries = (app, e) =>
  !!e && (rulesFor(app, e).length > 0 || e.type === 'recurring' || seriesToRemove(app, e.id).length > 1);

/**
 * Удалить платёж серии + будущие неоплаченные и снять правило (новые не появятся).
 * Возвращает { app, undo } — undo восстанавливает всё (restoreRemoved, kind 'series').
 */
export function removeSeries(app, id) {
  const e = (app.expenses || []).find((x) => x.id === id);
  if (!e) return { app, undo: null };
  const items = seriesToRemove(app, id);
  const ids = new Set(items.map((x) => x.id));
  const rules = rulesOf(app);
  const dropRules = rulesFor(app, e);
  const dropIds = new Set(dropRules.map((r) => r.id));
  const indexes = app.expenses.map((x, i) => (ids.has(x.id) ? i : -1)).filter((i) => i >= 0);
  const next = { ...app, expenses: app.expenses.filter((x) => !ids.has(x.id)) };
  if (dropIds.size) next.recurring = rules.filter((r) => !dropIds.has(r.id));
  return {
    app: next,
    undo: { kind: 'series', items: indexes.map((i) => ({ item: app.expenses[i], index: i })), rules: dropRules },
  };
}
