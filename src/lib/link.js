/**
 * Связь «Расчёт» → «Смены» (чистая функция, без React).
 *
 * Для каждой даты, где в расчёте есть количества, в сменах есть ровно одна
 * связанная смена: { ...обычная смена, source: 'calc', calcDate }.
 * Поля добавочные — старые данные читаются как есть, старый код их не трогает.
 *
 *  • сумма/название связанной смены всегда = расчёт (своя оплата, округлённо);
 *  • расчёт пуст/сброшен → связанная смена убирается; если она «переняла»
 *    пустую смену-заготовку (ночь касса, без суммы), заготовка возвращается;
 *  • миграция: смена от старой кнопки «Добавить в смены» (та же дата,
 *    название «день/ночь ряд/касса», сумма = расчёту) становится связанной;
 *  • пустая заготовка на эту дату перенимается (а не дублируется);
 *  • ручная смена С суммой не трогается никогда — остаются обе;
 *  • недостача (shortage) живёт на смене: пересчёт её не меняет, сброс расчёта не теряет
 *    (излишек — отрицательная недостача — так же; отметка наставника mentor — тоже);
 *  • в один день может быть две смены (день + ночь, напр. из импорта заметки): расчёт дня
 *    перенимает пустую смену С ТЕМ ЖЕ временем (день/ночь), и только если такой нет — любую пустую.
 */
import { computeCalc, hasCounts, ownPay, shiftTitle } from './calc.js';
import { adjOf, withShortage } from './shifts.js';

export const CALC_TITLES = ['день ряд', 'ночь ряд', 'день касса', 'ночь касса'];
export const isLinkedShift = (s) => !!s && s.source === 'calc';
const noAmount = (a) => a === null || a === undefined || a === '';

/** Своя оплата за день расчёта, округлённая до сома (как money()). */
export function calcPayForDay(day, rates) {
  return Math.round(ownPay(computeCalc(day.counts, rates, day.staff, !!day.gap), rates, day));
}

function unlink(s) {
  const { source, calcDate, calcFrom, ...rest } = s;
  return rest;
}

/**
 * @param app   состояние zp_app_v1
 * @param calc  состояние zp_calc_v1 ({ rates, days })
 * @param paydayFor (date) => payday для новой смены
 * @param makeId   () => id
 * @returns тот же объект app, если ничего не изменилось
 */
export function syncCalcShifts(app, calc, paydayFor, makeId) {
  if (!app || !Array.isArray(app.shifts) || !calc) return app;
  const days = calc.days || {};
  const want = {};
  for (const d of Object.keys(days)) {
    const day = days[d];
    if (day && hasCounts(day.counts)) {
      want[d] = {
        amount: calcPayForDay(day, calc.rates),
        title: shiftTitle(day.role, day.time),
        time: day.time === 'day' ? 'day' : 'night',
      };
    }
  }

  let changed = false;
  const linked = new Set();
  const out = [];
  for (const s of app.shifts) {
    if (!isLinkedShift(s)) {
      out.push(s);
      continue;
    }
    const d = s.calcDate || s.date;
    const w = want[d];
    if (!w || linked.has(d)) {
      changed = true;
      // была заготовкой → вернуть заготовку; с недостачей — остаётся днём без суммы
      // (недостача — реальный долг, расчёт её не отменяет); иначе смена просто уходит
      if (s.calcFrom) out.push({ ...unlink(s), title: s.calcFrom.title, amount: null });
      else if (Number(s.shortage) || Number(s.mentor)) out.push({ ...unlink(s), amount: null });
      continue;
    }
    linked.add(d);
    if (s.amount !== w.amount || s.title !== w.title || s.date !== d || s.calcDate !== d) {
      out.push({ ...s, date: d, calcDate: d, amount: w.amount, title: w.title });
      changed = true;
    } else out.push(s);
  }

  for (const d of Object.keys(want).sort()) {
    if (linked.has(d)) continue;
    const w = want[d];
    const free = (s) => !isLinkedShift(s) && s.date === d;
    // 1) от старой кнопки: та же дата, «расчётное» название и та же сумма
    let i = out.findIndex(
      (s) => free(s) && CALC_TITLES.includes(s.title) && !noAmount(s.amount) && Number(s.amount) === w.amount
    );
    if (i >= 0) {
      out[i] = { ...out[i], source: 'calc', calcDate: d, amount: w.amount, title: w.title };
    } else {
      // 2) пустая смена на эту дату: сначала того же времени (день/ночь), потом любая
      const timeOf = (s) => (/^\s*день/i.test(s.title || '') ? 'day' : /^\s*ночь/i.test(s.title || '') ? 'night' : null);
      i = out.findIndex((s) => free(s) && noAmount(s.amount) && timeOf(s) === w.time);
      if (i < 0) i = out.findIndex((s) => free(s) && noAmount(s.amount));
      if (i >= 0) {
        out[i] = {
          ...out[i],
          source: 'calc',
          calcDate: d,
          calcFrom: { title: out[i].title },
          amount: w.amount,
          title: w.title,
        };
      } else {
        out.push({
          id: makeId(),
          date: d,
          title: w.title,
          amount: w.amount,
          payday: paydayFor(d),
          source: 'calc',
          calcDate: d,
        });
      }
    }
    linked.add(d);
    changed = true;
  }
  return changed ? { ...app, shifts: out } : app;
}

const timeOfTitle = (s) =>
  /^\s*день/i.test(s?.title || '') ? 'day' : /^\s*ночь/i.test(s?.title || '') ? 'night' : null;

/**
 * Смена, к которой относится день расчёта (date, time 'day'|'night') — тот же порядок, что
 * перенимает syncCalcShifts: связанная смена этой даты → пустая смена этой даты того же
 * времени → любая пустая смена этой даты. null — такой нет.
 * Недостача/излишек дня в «Расчёте» — ЭТО поле shortage этой смены (одна копия, не в zp_calc_v1).
 */
export function shiftForCalcDay(shifts, date, time) {
  const list = (shifts || []).filter(Boolean);
  const t = time === 'day' ? 'day' : 'night';
  return (
    list.find((s) => isLinkedShift(s) && (s.calcDate || s.date) === date) ||
    list.find((s) => !isLinkedShift(s) && s.date === date && noAmount(s.amount) && timeOfTitle(s) === t) ||
    list.find((s) => !isLinkedShift(s) && s.date === date && noAmount(s.amount)) ||
    null
  );
}

/** Недостача дня расчёта со знаком (> 0 недостача, < 0 излишек) — читается со смены. */
export const calcDayAdj = (shifts, date, time) => adjOf(shiftForCalcDay(shifts, date, time));

/**
 * Записать недостачу/излишек дня расчёта в смену (ту же, что читает calcDayAdj).
 * Смены нет → создаётся пустая смена этой даты (роль/время дня, без суммы, adjFromCalc) —
 * расчёт потом её перенимает (недостача остаётся на ней). Обнулили на такой созданной
 * пустой смене → она убирается. Сумму смены не трогает никогда.
 * @param day { role, time } дня расчёта
 */
export function withCalcDayAdj(app, date, day, value, paydayFor, makeId) {
  if (!app || !Array.isArray(app.shifts)) return app;
  const time = day && day.time === 'day' ? 'day' : 'night';
  const s = shiftForCalcDay(app.shifts, date, time);
  if (!s) {
    const tmp = withShortage({}, value);
    if (!tmp.shortage) return app;
    const removed = Array.isArray(app.removed) ? app.removed.filter((d) => d !== date) : app.removed;
    const ns = {
      id: makeId(),
      date,
      title: shiftTitle(day && day.role === 'ryad' ? 'ryad' : 'kass', time),
      amount: null,
      payday: paydayFor(date),
      shortage: tmp.shortage,
      adjFromCalc: true,
    };
    return { ...app, removed, shifts: [...app.shifts, ns] };
  }
  const next = withShortage(s, value);
  if (next === s) return app;
  if (!next.shortage && next.adjFromCalc && !isLinkedShift(next) && noAmount(next.amount) && !next.place && !Number(next.mentor))
    return { ...app, shifts: app.shifts.filter((x) => x !== s) };
  return { ...app, shifts: app.shifts.map((x) => (x === s ? next : x)) };
}
