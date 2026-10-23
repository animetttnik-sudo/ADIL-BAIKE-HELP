/**
 * «Быстрый ввод» позиций: карточки по одной в порядке строк Excel.
 * Чистая логика (без React) — шаги, разбор ввода, что сохранить.
 */

/**
 * Шаг по карточкам. dir: +1 «Далее», −1 «Назад».
 * → { index, done }: done — «Далее» на последней карточке («Готово»), ввод закрывается.
 */
export function quickStep(index, dir, count) {
  if (!(count > 0)) return { index: 0, done: true };
  const i = Math.min(Math.max(0, index | 0), count - 1);
  if (dir > 0) return i >= count - 1 ? { index: i, done: true } : { index: i + 1, done: false };
  if (dir < 0) return { index: Math.max(0, i - 1), done: false };
  return { index: i, done: false };
}

/** Набранное → подсчёты: «59» → [59], «59+98» → [59, 98]; пусто → null (значение не трогаем). */
export function quickParse(text) {
  const parts = String(text ?? '')
    .replace(/[^0-9+]/g, '')
    .split('+')
    .filter((x) => x !== '');
  if (!parts.length) return null;
  return parts.map((x) => Math.min(99999, Number(x) || 0));
}

/** Что сохранить: пустой ввод оставляет прежние подсчёты (или [0], если их не было). */
export function quickValue(prev, text) {
  const t = quickParse(text);
  if (t) return t;
  if (Array.isArray(prev) && prev.length) return prev.map((x) => Number(x) || 0);
  const n = Number(prev);
  return [Number.isFinite(n) && n > 0 ? n : 0];
}

/** Можно ли дописать «+» (новый подсчёт): есть число и нет «+» на конце. */
export const quickCanPlus = (text) => /\d$/.test(String(text ?? ''));

/** Подпись текущего значения: «157» или «59 + 98 = 157». */
export function quickShown(prev) {
  const t = Array.isArray(prev) ? prev.map((x) => Number(x) || 0) : [Number(prev) || 0];
  const sum = t.reduce((a, x) => a + x, 0);
  return t.length > 1 ? `${t.join(' + ')} = ${sum}` : String(sum);
}
