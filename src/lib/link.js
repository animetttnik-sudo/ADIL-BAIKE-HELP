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
 *    перенимает пустую смену С ТЕМ ЖЕ временем (день/ночь), и только если такой нет — любую пустую;
 *  • несколько расчётов за один день: ключ дня расчёта в zp_calc_v1.days — calcKey(date, n):
 *    1-я смена — сама дата (как в старых сохранениях, миграция не нужна), 2-я и дальше — «дата#n».
 *    У связанной смены 2-го и дальше расчёта есть поле calcKey; calcDate — всегда чистая дата.
 */
import { computeCalc, hasCounts, ownPay, shiftTitle } from './calc.js';
import { adjOf, withShortage } from './shifts.js';

export const CALC_TITLES = ['день ряд', 'ночь ряд', 'день касса', 'ночь касса'];
export const isLinkedShift = (s) => !!s && s.source === 'calc';
const noAmount = (a) => a === null || a === undefined || a === '';

/** Ключ расчёта: смена n (1, 2, …) даты date. 1-я — сама дата (старый формат), дальше — «дата#n». */
export const calcKey = (date, slot = 1) => (Number(slot) > 1 ? `${date}#${Math.round(Number(slot))}` : date);
/** Дата ключа расчёта. */
export const keyDate = (k) => String(k || '').slice(0, 10);
/** Номер смены ключа расчёта (1 — без «#n»). */
export function keySlot(k) {
  const m = /#(\d+)$/.exec(String(k || ''));
  return m ? Math.max(1, Number(m[1])) : 1;
}
/** Порядок ключей: по дате, затем по номеру смены (числом: #2 < #10). */
export const compareKeys = (a, b) => keyDate(a).localeCompare(keyDate(b)) || keySlot(a) - keySlot(b);
/** Ключ расчёта связанной смены (старые смены — только calcDate или date). */
export const linkKey = (s) => (s ? s.calcKey || s.calcDate || s.date : null);
/** Номера смен расчёта этой даты, которые есть в days (1-я — всегда). */
export function calcSlots(days, date) {
  const set = new Set([1]);
  for (const k of Object.keys(days || {})) if (keyDate(k) === date) set.add(keySlot(k));
  return [...set].sort((a, b) => a - b);
}
/** Номер для «Ещё смена за этот день». */
export const nextSlot = (days, date) => Math.max(...calcSlots(days, date)) + 1;

/** Своя оплата за день расчёта, округлённая до сома (как money()). */
export function calcPayForDay(day, rates) {
  return Math.round(ownPay(computeCalc(day.counts, rates, day.staff, !!day.gap), rates, day));
}

function unlink(s) {
  const { source, calcDate, calcFrom, calcKey: _k, ...rest } = s;
  return rest;
}
/** Поля связи смены с расчётом k (calcKey — только у 2-й и дальше смены дня). */
function withLink(s, k, w) {
  const o = { ...s, source: 'calc', date: w.date, calcDate: w.date, amount: w.amount, title: w.title };
  if (w.slot > 1) o.calcKey = k;
  else delete o.calcKey;
  return o;
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
        date: keyDate(d),
        slot: keySlot(d),
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
    const k = linkKey(s);
    const w = want[k];
    if (!w || linked.has(k)) {
      changed = true;
      // была заготовкой → вернуть заготовку; с недостачей — остаётся днём без суммы
      // (недостача — реальный долг, расчёт её не отменяет); иначе смена просто уходит
      if (s.calcFrom) out.push({ ...unlink(s), title: s.calcFrom.title, amount: null });
      else if (Number(s.shortage) || Number(s.mentor)) out.push({ ...unlink(s), amount: null });
      continue;
    }
    linked.add(k);
    const ck = w.slot > 1 ? k : undefined;
    if (s.amount !== w.amount || s.title !== w.title || s.date !== w.date || s.calcDate !== w.date || s.calcKey !== ck) {
      out.push(withLink(s, k, w));
      changed = true;
    } else out.push(s);
  }

  const timeOf = (s) => (/^\s*день/i.test(s.title || '') ? 'day' : /^\s*ночь/i.test(s.title || '') ? 'night' : null);
  const todo = Object.keys(want).sort(compareKeys).filter((k) => !linked.has(k));
  const free = (s, d) => !isLinkedShift(s) && s.date === d;
  const adopt = (k, i) => {
    const w = want[k];
    out[i] = { ...withLink(out[i], k, w), calcFrom: { title: out[i].title } };
    linked.add(k);
    changed = true;
  };
  // 1-й проход: смена от старой кнопки (то же «расчётное» название и та же сумма) или пустая смена того же времени —
  // сначала для всех смен дня, чтобы 2-я смена не забрала заготовку, нужную 1-й
  for (const k of todo) {
    const w = want[k];
    const i = out.findIndex(
      (s) => free(s, w.date) && CALC_TITLES.includes(s.title) && !noAmount(s.amount) && Number(s.amount) === w.amount
    );
    if (i >= 0) {
      out[i] = withLink(out[i], k, w);
      linked.add(k);
      changed = true;
      continue;
    }
    const j = out.findIndex((s) => free(s, w.date) && noAmount(s.amount) && timeOf(s) === w.time);
    if (j >= 0) adopt(k, j);
  }
  // 2-й проход: любая пустая смена этой даты, иначе новая
  for (const k of todo) {
    if (linked.has(k)) continue;
    const w = want[k];
    const i = out.findIndex((s) => free(s, w.date) && noAmount(s.amount));
    if (i >= 0) adopt(k, i);
    else {
      const ns = { id: makeId(), date: w.date, title: w.title, amount: w.amount, payday: paydayFor(w.date), source: 'calc', calcDate: w.date };
      if (w.slot > 1) ns.calcKey = k;
      out.push(ns);
      linked.add(k);
      changed = true;
    }
  }
  return changed ? { ...app, shifts: out } : app;
}

const timeOfTitle = (s) =>
  /^\s*день/i.test(s?.title || '') ? 'day' : /^\s*ночь/i.test(s?.title || '') ? 'night' : null;

/**
 * Смена, к которой относится день расчёта (key — calcKey(date, n), time 'day'|'night') — тот же порядок, что
 * перенимает syncCalcShifts: связанная смена этой даты → пустая смена этой даты того же
 * времени → любая пустая смена этой даты. null — такой нет.
 * Недостача/излишек дня в «Расчёте» — ЭТО поле shortage этой смены (одна копия, не в zp_calc_v1).
 */
export function shiftForCalcDay(shifts, key, time) {
  const list = (shifts || []).filter(Boolean);
  const t = time === 'day' ? 'day' : 'night';
  const date = keyDate(key);
  return (
    list.find((s) => isLinkedShift(s) && linkKey(s) === key) ||
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
export function withCalcDayAdj(app, key, day, value, paydayFor, makeId) {
  if (!app || !Array.isArray(app.shifts)) return app;
  const time = day && day.time === 'day' ? 'day' : 'night';
  const s = shiftForCalcDay(app.shifts, key, time);
  const date = keyDate(key);
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

/**
 * Куда вести «Рассчитать» из меню смены (долгое нажатие в «Сменах»):
 *  • смена из расчёта → её расчёт (key);
 *  • другая смена → первый ещё пустой расчёт этой даты, иначе следующий («Ещё смена за этот день»);
 *    seed — роль/время из названия смены, чтобы расчёт перенял именно её (день или ночь).
 * @returns {{ key: string, seed: { role?: 'kass'|'ryad', time?: 'day'|'night' } | null }}
 */
export function calcTargetFor(shift, days) {
  if (!shift) return null;
  if (isLinkedShift(shift)) return { key: linkKey(shift), seed: null };
  const date = shift.date;
  const free = calcSlots(days, date).find((n) => !(days && days[calcKey(date, n)] && hasCounts(days[calcKey(date, n)].counts)));
  const key = calcKey(date, free || nextSlot(days, date));
  const t = String(shift.title || '').trim().toLowerCase();
  const seed = {};
  if (t.startsWith('день')) seed.time = 'day';
  else if (t.startsWith('ночь')) seed.time = 'night';
  if (/касс/.test(t)) seed.role = 'kass';
  else if (/ряд/.test(t)) seed.role = 'ryad';
  return { key, seed: Object.keys(seed).length ? seed : null };
}
