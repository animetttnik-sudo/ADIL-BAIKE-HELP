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
 *  • ручная смена С суммой не трогается никогда — остаются обе.
 */
import { computeCalc, hasCounts, ownPay, shiftTitle } from './calc.js';

export const CALC_TITLES = ['день ряд', 'ночь ряд', 'день касса', 'ночь касса'];
export const isLinkedShift = (s) => !!s && s.source === 'calc';
const noAmount = (a) => a === null || a === undefined || a === '';

/** Своя оплата за день расчёта, округлённая до сома (как money()). */
export function calcPayForDay(day, rates) {
  return Math.round(ownPay(computeCalc(day.counts, rates, day.staff), rates, day));
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
      want[d] = { amount: calcPayForDay(day, calc.rates), title: shiftTitle(day.role, day.time) };
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
      // была заготовкой → вернуть заготовку; иначе смена просто уходит
      if (s.calcFrom) out.push({ ...unlink(s), title: s.calcFrom.title, amount: null });
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
      // 2) пустая заготовка на эту дату
      i = out.findIndex((s) => free(s) && noAmount(s.amount));
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
