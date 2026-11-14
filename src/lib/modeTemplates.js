/**
 * Шаблоны режимов «Учёба / Работа»: какие смены режим сам добавляет (день недели + тип + сумма).
 * Чистые функции — тесты в tests/modeTemplates.test.mjs. Модуль без импортов (его подключает periods.js).
 *
 * state.modeTemplates = { study: [{ dow, title, amount }], work: [...] }, dow: 0 = вс … 6 = сб.
 *  - Нет поля (старые сохранения, в т. ч. у владельца) → BUILTIN — ровно прежнее поведение:
 *    учёба — пт/сб/вс «ночь касса», работа — каждый день «ночь касса», сумма пустая.
 *  - Новый пользователь (defaultState) начинает с пустых шаблонов и настраивает свои.
 *
 * Автодобавленная смена: { id, date, title, amount, payday, auto: true[, autoAmount] }. Старые автодобавленные без auto
 * узнаются как «нетронутые»: только эти поля и пустая сумма. Правленая вручную / с суммой / недостачей /
 * из «Расчёта» / местом — не нетронутая, её режим не трогает.
 */
export const BUILTIN_TEMPLATES = {
  study: [5, 6, 0].map((dow) => ({ dow, title: 'ночь касса', amount: null })),
  work: [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, title: 'ночь касса', amount: null })),
};
export const EMPTY_TEMPLATES = { study: [], work: [] };
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // пн … вс

const AUTO_KEYS = new Set(['id', 'date', 'title', 'amount', 'payday', 'auto', 'autoAmount']);
const isEmptyAmt = (a) => a === null || a === undefined || a === '';

const cleanEntry = (e) =>
  e && Number.isInteger(e.dow) && e.dow >= 0 && e.dow <= 6
    ? { dow: e.dow, title: String(e.title || '').trim() || 'ночь касса', amount: isEmptyAmt(e.amount) ? null : Number(e.amount) || null }
    : null;

/** Шаблоны состояния (с запасным BUILTIN для старых сохранений). */
export function templatesOf(state) {
  const t = state && state.modeTemplates;
  if (!t || typeof t !== 'object') return BUILTIN_TEMPLATES;
  return {
    study: Array.isArray(t.study) ? t.study.map(cleanEntry).filter(Boolean) : [],
    work: Array.isArray(t.work) ? t.work.map(cleanEntry).filter(Boolean) : [],
  };
}

/** Шаблон режима: запись для дня недели или null. */
export function entryFor(state, mode, dow) {
  const list = templatesOf(state)[mode === 'work' ? 'work' : 'study'];
  return list.find((e) => e.dow === dow) || null;
}

/** Смена добавлена режимом и не тронута вручную. */
export function isPristineAuto(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Object.keys(s).every((k) => AUTO_KEYS.has(k))) return false;
  // пустая сумма — заготовка; сумма из шаблона — только пока она та же, что поставил режим (autoAmount)
  return isEmptyAmt(s.amount) || (s.auto === true && s.autoAmount === s.amount);
}

/** Новая автосмена по шаблону. */
export function autoShift(id, date, payday, entry) {
  const amount = isEmptyAmt(entry.amount) ? null : entry.amount;
  const s = { id, date, title: entry.title || 'ночь касса', amount, payday, auto: true };
  if (amount != null) s.autoAmount = amount;
  return s;
}

/** Поменять шаблон режима (список записей) — новое состояние. */
export function setTemplate(state, mode, list) {
  const cur = templatesOf(state);
  const key = mode === 'work' ? 'work' : 'study';
  const clean = (list || []).map(cleanEntry).filter(Boolean);
  const uniq = DOW_ORDER.map((d) => clean.find((e) => e.dow === d)).filter(Boolean);
  return { ...state, modeTemplates: { ...cur, [key]: uniq } };
}

/** Включить/выключить день недели в шаблоне режима. */
export function toggleTemplateDay(state, mode, dow) {
  const list = templatesOf(state)[mode === 'work' ? 'work' : 'study'];
  const has = list.some((e) => e.dow === dow);
  return setTemplate(state, mode, has ? list.filter((e) => e.dow !== dow) : [...list, { dow, title: 'ночь касса', amount: null }]);
}

/** Поменять тип/сумму дня в шаблоне режима. */
export function editTemplateDay(state, mode, dow, patch) {
  const list = templatesOf(state)[mode === 'work' ? 'work' : 'study'];
  return setTemplate(state, mode, list.map((e) => (e.dow === dow ? { ...e, ...patch } : e)));
}
