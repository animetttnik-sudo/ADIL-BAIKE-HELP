/**
 * Перенос данных между версиями приложения (dev-сервер ↔ опубликованное обновление).
 * Expo Go хранит AsyncStorage отдельно для каждой версии, поэтому данные переносятся
 * через буфер обмена одной JSON-строкой.
 * Чистые функции без React/RN — тесты в tests/backup.test.mjs.
 */

export const BACKUP_APP = 'smeny-backup';
export const BACKUP_V = 1;
/** Ключи приложения в AsyncStorage: zp_app_v1, zp_calc_v1 и любые будущие zp_* */
export const APP_KEY_PREFIXES = ['zp_'];
export const KNOWN_KEYS = ['zp_app_v1', 'zp_calc_v1'];

export const isAppKey = (k) => typeof k === 'string' && APP_KEY_PREFIXES.some((p) => k.startsWith(p));

/** Только ключи приложения (чужие ключи Expo/библиотек не трогаем) */
export function appKeys(keys) {
  return (keys || []).filter(isAppKey).sort();
}

/**
 * Собрать резервную копию. entries — [[key, rawString|null], ...] (как AsyncStorage.multiGet).
 * Значения кладём как есть (сырые строки), пустые пропускаем.
 */
export function makeBackup(entries, now = new Date()) {
  const data = {};
  for (const [k, v] of entries || []) {
    if (isAppKey(k) && typeof v === 'string' && v.length) data[k] = v;
  }
  return JSON.stringify({ app: BACKUP_APP, v: BACKUP_V, createdAt: new Date(now).toISOString(), data });
}

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** Сколько чего лежит в данных: расходы, смены, дни расчёта с подсчётами */
export function summarize(data) {
  const app = data && typeof data.zp_app_v1 === 'string' ? safeJson(data.zp_app_v1) : null;
  const calc = data && typeof data.zp_calc_v1 === 'string' ? safeJson(data.zp_calc_v1) : null;
  const days = calc && calc.days && typeof calc.days === 'object' ? Object.values(calc.days) : [];
  const counted = days.filter(
    (d) => d && d.counts && typeof d.counts === 'object' && Object.values(d.counts).some((v) => countOf(v) > 0)
  );
  return {
    expenses: Array.isArray(app?.expenses) ? app.expenses.length : 0,
    shifts: Array.isArray(app?.shifts) ? app.shifts.length : 0,
    calcs: counted.length,
    keys: Object.keys(data || {}).length,
  };
}
const countOf = (v) =>
  Array.isArray(v) ? v.reduce((a, x) => a + (Number(x) || 0), 0) : Number(v) || 0;

/** Русское склонение: plural(5, ['расход', 'расхода', 'расходов']) */
export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export function fmtSummary(s) {
  return [
    `${s.expenses} ${plural(s.expenses, ['расход', 'расхода', 'расходов'])}`,
    `${s.shifts} ${plural(s.shifts, ['смена', 'смены', 'смен'])}`,
    `${s.calcs} ${plural(s.calcs, ['расчёт', 'расчёта', 'расчётов'])}`,
  ].join(' · ');
}

/**
 * Разобрать текст из буфера. Терпит пробелы и лишний текст вокруг JSON
 * (например, если копия пришла через мессенджер).
 * → { ok: true, data, createdAt, summary } | { ok: false, error }
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'Буфер обмена пуст. Сначала нажмите «Скопировать все данные» в другой версии приложения.' };
  }
  const t = text.trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  const obj = a >= 0 && b > a ? safeJson(t.slice(a, b + 1)) : undefined;
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP) {
    return { ok: false, error: 'В буфере не копия данных приложения. Скопируйте её кнопкой «Скопировать все данные».' };
  }
  if (typeof obj.v !== 'number' || obj.v > BACKUP_V) {
    return { ok: false, error: 'Копия сделана более новой версией приложения. Обновите приложение и попробуйте снова.' };
  }
  const src = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? obj.data : null;
  if (!src) return { ok: false, error: 'Копия повреждена: нет данных.' };
  const data = {};
  for (const [k, v] of Object.entries(src)) {
    if (!isAppKey(k)) continue;
    if (typeof v !== 'string' || safeJson(v) === undefined) {
      return { ok: false, error: `Копия повреждена (${k}). Скопируйте данные ещё раз — целиком.` };
    }
    data[k] = v;
  }
  if (!KNOWN_KEYS.some((k) => k in data)) return { ok: false, error: 'В копии нет данных приложения.' };
  const app = data.zp_app_v1 ? safeJson(data.zp_app_v1) : null;
  if (app !== null && (typeof app !== 'object' || Array.isArray(app))) {
    return { ok: false, error: 'Копия повреждена (zp_app_v1).' };
  }
  return { ok: true, data, createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : null, summary: summarize(data) };
}

/**
 * План замены данных на устройстве: что записать и какие ключи приложения удалить
 * (их нет в копии — иначе остались бы старые данные этого устройства).
 */
export function restorePlan(data, existingKeys) {
  const set = Object.entries(data).filter(([k]) => isAppKey(k));
  const remove = appKeys(existingKeys).filter((k) => !(k in data));
  return { set, remove };
}
