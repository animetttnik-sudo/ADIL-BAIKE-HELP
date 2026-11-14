/**
 * Даты, периоды и зарплаты (чистые функции, без React) — общие для App и тестов.
 */
import { seedRecurringMonth } from './recurring.js';
import { autoShift, EMPTY_TEMPLATES, entryFor, isPristineAuto } from './modeTemplates.js';
export const KEY = 'zp_app_v1';
export const ANCHOR = '2026-09-04';
export const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const MONTHS_R = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
export const DOW = ['вс','пн','вт','ср','чт','пт','сб'];

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const fmtDay = (s) => parse(s).getDate();
export const fmtShort = (s) => {
  const d = parse(s);
  return `${d.getDate()} ${MONTHS_R[d.getMonth()]}`;
};
// один форматтер на всё приложение: создавать Intl.NumberFormat на каждую сумму дорого (длинные списки)
const MONEY_FMT = new Intl.NumberFormat('ru-RU');
export const money = (n) => MONEY_FMT.format(Math.round(Number(n) || 0));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const todayIso = () => iso(new Date());

export function allPaydays(fromY, toY) {
  const list = [];
  let d = parse(ANCHOR);
  while (d.getFullYear() > fromY - 1) d.setDate(d.getDate() - 14);
  while (d.getFullYear() <= toY) {
    list.push(iso(d));
    d.setDate(d.getDate() + 14);
  }
  return list;
}
// запас на годы вперёд: после последней зарплаты списка приложение «застревало» на ней
export const PAYDAYS = allPaydays(2025, 2035);

export function paydayOnOrBefore(dateStr) {
  let last = PAYDAYS[0];
  for (const p of PAYDAYS) {
    if (p <= dateStr) last = p;
    else break;
  }
  return last;
}
export function workPeriod(payday) {
  return { start: addDays(payday, -20), end: addDays(payday, -7), payday };
}
export function paydaysInMonth(y, m) {
  const pfx = `${y}-${pad(m + 1)}`;
  return PAYDAYS.filter((p) => p.startsWith(pfx));
}
export function periodsTouchingMonth(y, m) {
  const start = `${y}-${pad(m + 1)}-01`;
  const end = iso(new Date(y, m + 1, 0));
  return PAYDAYS.map(workPeriod).filter((p) => p.start <= end && p.end >= start);
}

export function defaultState() {
  return {
    settings: { mode: 'study', hue: 145, light: 54 },
    custom: { bg: null },
    // Новый пользователь начинает с пустыми расходами и сменами (личные данные в код не зашиваем).
    expenses: [],
    shifts: [],
    removed: [],
    // шаблоны режимов: новый пользователь настраивает свои («Настройки» → «Изменить шаблон»)
    modeTemplates: { study: [...EMPTY_TEMPLATES.study], work: [...EMPTY_TEMPLATES.work] },
  };
}

/**
 * Досеивает смены для месяца (y, m).
 * Вызывается синхронно ДО рендера нового месяца/режима, чтобы список
 * не появлялся пустым и не «допрыгивал» кадром позже.
 * Возвращает тот же объект, если ничего не добавилось.
 */
export function seedMonth(state, viewY, viewM, fromDate) {
  if (!state) return state;
  let changed = false;
  const next = {
    ...state,
    expenses: [...state.expenses],
    shifts: [...state.shifts],
    settings: { ...state.settings },
    custom: { ...(state.custom || { bg: null }) },
    removed: [...(state.removed || [])],
  };
  // «Постоянные платежи»: активные правила (с датой «до») добавляют расход в то же число месяца
  if (seedRecurringMonth(next, viewY, viewM, uid)) changed = true;
  const mode = state.settings && state.settings.mode === 'work' ? 'work' : 'study';
  const have = new Set(next.shifts.map((s) => s.date));
  const gone = new Set(next.removed);
  periodsTouchingMonth(viewY, viewM).forEach((period) => {
    for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
      if (fromDate && d < fromDate) continue;
      if (gone.has(d) || have.has(d)) continue;
      // смены режима — по шаблону (дни недели, тип, сумма); без шаблона — прежнее поведение
      const entry = entryFor(state, mode, parse(d).getDay());
      if (!entry) continue;
      next.shifts.push(autoShift(uid(), d, period.payday, entry));
      have.add(d);
      changed = true;
    }
  });
  return changed ? next : state;
}

/**
 * Применить режим (и/или изменённый шаблон) с даты fromDate: нетронутые автосмены приводятся к шаблону
 * режима (лишние — убираются, тип/сумма — обновляются), недостающие дни — досеваются.
 * Правленые вручную, с суммой, из «Расчёта» и т. п. — не трогаются; убранные пользователем дни не возвращаются.
 * months — [y, m] месяцы для досева (обычно от fromDate до последней смены).
 */
export function applyMode(state, mode, fromDate, months) {
  if (!state) return state;
  const m = mode === 'work' ? 'work' : 'study';
  let next = { ...state, settings: { ...state.settings, mode: m } };
  const shifts = [];
  for (const s of state.shifts) {
    if (!s || s.date < fromDate || !isPristineAuto(s)) {
      shifts.push(s);
      continue;
    }
    const entry = entryFor(next, m, parse(s.date).getDay());
    if (!entry) continue; // режим этот день не добавляет — убираем
    const want = autoShift(s.id, s.date, s.payday, entry);
    if (s.title === want.title && (s.amount ?? null) === want.amount && s.auto && s.autoAmount === want.autoAmount) shifts.push(s);
    else shifts.push(want);
  }
  next.shifts = shifts;
  const list = months && months.length ? months : monthsFrom(fromDate, state.shifts);
  for (const [y, mm] of list) next = seedMonth(next, y, mm, fromDate);
  return next;
}

/** Месяцы от fromDate до последней смены (минимум месяц fromDate и следующий). */
export function monthsFrom(fromDate, shifts) {
  let last = fromDate;
  for (const s of shifts || []) if (s && typeof s.date === 'string' && s.date > last) last = s.date;
  const out = [];
  let y = Number(fromDate.slice(0, 4));
  let mm = Number(fromDate.slice(5, 7)) - 1;
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7)) - 1;
  let guard = 0;
  while ((y < ly || (y === ly && mm <= lm) || out.length < 2) && guard++ < 36) {
    out.push([y, mm]);
    mm += 1;
    if (mm > 11) {
      mm = 0;
      y += 1;
    }
  }
  return out;
}

/** Досеять месяцы, которые задевают периоды СМЕН этих зарплат ([p−20, p−7]) — для страниц «Смен». */
export function seedShiftPaydays(state, paydays) {
  const seen = new Set();
  let s = state;
  for (const p of paydays || []) {
    if (!p) continue;
    const per = workPeriod(p);
    for (const d of [per.start, per.end]) {
      const k = d.slice(0, 7);
      if (seen.has(k)) continue;
      seen.add(k);
      s = seedMonth(s, Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);
    }
  }
  return s;
}

/** Зарплата, к которой относится смена этой даты. */
export const paydayForDate = (date) => workPeriod(paydayOnOrBefore(addDays(date, 20))).payday;

/**
 * Приводит загруженный zp_app_v1 к ожидаемой форме (старые/неполные
 * сохранения: нет removed/custom/recurring и т. п.). Нет modeTemplates — не страшно: templatesOf
 * отдаёт встроенные шаблоны (прежнее поведение режимов), так у старых сохранений ничего не меняется. Формат не меняется —
 * только добавляются недостающие пустые поля. Тот же объект, если всё на месте.
 */
export function normalizeApp(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultState();
  // записи без даты (битые/обрезанные) ломали экран целиком — пропускаем только их
  const okItem = (x) => !!x && typeof x === 'object' && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x.date);
  const arr = (v) => (Array.isArray(v) ? v.filter(okItem) : []);
  const clean = (v) => Array.isArray(v) && v.every(okItem);
  const ok =
    clean(raw.expenses) &&
    clean(raw.shifts) &&
    Array.isArray(raw.removed) &&
    raw.settings && typeof raw.settings === 'object' &&
    raw.custom && typeof raw.custom === 'object';
  if (ok) return raw;
  return {
    ...raw,
    settings: { mode: 'study', hue: 145, light: 54, ...(raw.settings || {}) },
    custom: { bg: null, ...(raw.custom || {}) },
    expenses: arr(raw.expenses),
    shifts: arr(raw.shifts),
    removed: Array.isArray(raw.removed) ? raw.removed : [],
  };
}

/**
 * Куда отложить сохранение, которое не удалось прочитать (битый JSON), прежде чем приложение
 * начнёт писать поверх. Ключ без префикса zp_ — в «Перенос данных» не попадает и при вставке не удаляется.
 */
export const brokenKey = (key) => `broken_${key}`;

/** Досеять месяцы, которые задевают периоды этих зарплат ([p, p+13]). Тот же объект, если ничего не добавилось. */
export function seedPaydays(state, paydays) {
  const seen = new Set();
  let s = state;
  for (const p of paydays || []) {
    if (!p) continue;
    for (const d of [p, addDays(p, 13)]) {
      const k = d.slice(0, 7);
      if (seen.has(k)) continue;
      seen.add(k);
      s = seedMonth(s, Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);
    }
  }
  return s;
}
