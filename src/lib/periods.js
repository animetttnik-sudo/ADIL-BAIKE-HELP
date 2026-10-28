/**
 * Даты, периоды и зарплаты (чистые функции, без React) — общие для App и тестов.
 */
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
export const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0));
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
    // type — след старой функции «Постоянные платежи» (интерфейс его больше не показывает)
    expenses: [
      { id: uid(), date: '2026-09-04', amount: 1000, title: 'Адилет Аке', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-04', amount: 7000, title: 'апама карыз', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-07', amount: 1387, title: 'О!Банк', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-12', amount: 540, title: 'Единица', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-13', amount: 1350, title: 'Вайфай', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-15', amount: 5075, title: 'Мбанк', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-18', amount: 6000, title: '', type: 'unexpected', status: null },
      { id: uid(), date: '2026-09-21', amount: 1000, title: 'Вб', type: 'unexpected', status: null },
      { id: uid(), date: '2026-09-21', amount: 1385, title: 'О!Банк', type: 'recurring', status: null },
      { id: uid(), date: '2026-09-26', amount: 5667, title: 'М+', type: 'recurring', status: null },
    ],
    shifts: ['2026-09-12', '2026-09-13', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-25'].map((d) => ({
      id: uid(), date: d, title: 'ночь касса', amount: null, payday: '2026-10-02',
    })),
    removed: [],
  };
}

/**
 * Досеивает смены для месяца (y, m).
 * Вызывается синхронно ДО рендера нового месяца/режима, чтобы список
 * не появлялся пустым и не «допрыгивал» кадром позже.
 * Возвращает тот же объект, если ничего не добавилось.
 */
export function seedMonth(state, viewY, viewM) {
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
  // «Постоянные платежи» убраны: расходы сами больше не добавляются — только смены.
  periodsTouchingMonth(viewY, viewM).forEach((period) => {
    for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
      if (next.removed.includes(d) || next.shifts.some((s) => s.date === d)) continue;
      const dow = parse(d).getDay();
      if (state.settings.mode === 'study' && !(dow === 5 || dow === 6 || dow === 0)) continue;
      next.shifts.push({
        id: uid(),
        date: d,
        title: 'ночь касса',
        amount: null,
        payday: period.payday,
      });
      changed = true;
    }
  });
  return changed ? next : state;
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
 * сохранения: нет removed/custom/recurring и т. п.). Формат не меняется —
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
