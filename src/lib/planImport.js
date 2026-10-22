/**
 * «Импорт плана»: добавляет расходы из плана (src/lib/plan2026.js) в zp_app_v1.
 * Существующие расходы не трогаем. Формат расхода прежний
 * { id, date, amount, title, type, status } + необязательный src: 'plan'.
 * На уровне состояния — необязательное поле plan { id, importedAt, added } (подпись в настройках;
 * старое поле months больше ничего не делает).
 */
import { PAYDAYS, addDays, parse, MONTHS } from './periods.js';

export const normTitle = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s.\-_«»"']/g, '');

/** Зарплата, под которой приложение показывает расход этой даты (как expensesForPayday). */
export function groupPaydayOf(date) {
  let p = null;
  for (const x of PAYDAYS) {
    if (x <= date) p = x;
    else break;
  }
  return p;
}

export function planItems(blocks) {
  return blocks.flatMap((b) =>
    b.items.map((x) => ({ ...x, payday: b.payday, month: b.month, ordinal: b.ordinal }))
  );
}

/** Проверки плана против расписания приложения. */
export function checkPlan(blocks) {
  const paydayMismatch = blocks.filter((b) => !PAYDAYS.includes(b.payday)).map((b) => b.payday);
  const groupMismatch = planItems(blocks).filter((x) => groupPaydayOf(x.date) !== x.payday);
  return { paydayMismatch, groupMismatch };
}

// перенесённый расход сравнивается по исходной дате — повторный импорт не вернёт оригинал
const od = (e) => e.movedFrom || e.date;
const dayDiff = (a, b) => Math.abs((parse(a) - parse(b)) / 864e5);

const isPaidE = (e) => e.status === 'paid';
/** Старый «постоянный» неоплаченный расход, введённый не импортом и не перенесённый: его можно заменить строкой плана. */
const replaceable = (e) => e.type === 'recurring' && !isPaidE(e) && !e.src && !e.movedFrom && !e.edited;

/**
 * Разбор импорта: каждая строка плана получает ровно одно действие (ничего не теряется молча):
 *  add      — такого расхода нет → добавить (✅ → оплачен);
 *  markPaid — точное совпадение (дата + сумма + название), в плане ✅, в приложении не отмечен → отметить ✓;
 *  replace  — «похожий» старый постоянный неоплаченный расход (то же название и та же дата, или
 *             та же сумма ±7 дней) → удалить его и добавить строку плана (план — источник правды);
 *             при opts.replace === false такие строки → keep (старый остаётся, строка не добавляется);
 *  same     — уже есть такой же (точное совпадение, статус не мешает) или тот же платёж,
 *             введённый вручную/оплаченный (та же сумма рядом по дате).
 * Похожий ручной/оплаченный с другой суммой — другой платёж → add. Название сравнивается без регистра и
 * пробелов («Вай фай» = «Вайфай»); пустое название — только точное совпадение. Каждый существующий
 * расход «закрывает» не больше одной строки. Повторный импорт → всё same.
 */
export function previewImport(app, blocks, opts = {}) {
  const replaceOn = opts.replace !== false;
  const items = planItems(blocks);
  const existing = app.expenses || [];
  const used = new Set();
  const res = new Array(items.length).fill(null);
  items.forEach((x, i) => {
    const n = normTitle(x.title);
    const e = existing.find(
      (y) => !used.has(y.id) && od(y) === x.date && Number(y.amount) === x.amount && normTitle(y.title) === n
    );
    if (!e) return;
    used.add(e.id);
    res[i] = { kind: x.paid && !isPaidE(e) ? 'markPaid' : 'same', plan: x, existing: e };
  });
  items.forEach((x, i) => {
    if (res[i]) return;
    const n = normTitle(x.title);
    const e = n
      ? existing.find(
          (y) =>
            !used.has(y.id) &&
            normTitle(y.title) === n &&
            (od(y) === x.date || (Number(y.amount) === x.amount && dayDiff(od(y), x.date) <= 7))
        )
      : null;
    if (!e) {
      res[i] = { kind: 'add', plan: x };
      return;
    }
    if (replaceable(e)) {
      used.add(e.id);
      res[i] = { kind: replaceOn ? 'replace' : 'keep', plan: x, existing: e };
      return;
    }
    if (Number(e.amount) === x.amount) {
      used.add(e.id); // тот же платёж, дата чуть другая
      res[i] = { kind: x.paid && !isPaidE(e) ? 'markPaid' : 'same', plan: x, existing: e };
      return;
    }
    res[i] = { kind: 'add', plan: x, near: e };
  });
  const pick = (k) => res.filter((r) => r.kind === k);
  const add = pick('add').map((r) => r.plan);
  const byMonth = {};
  for (const b of blocks) byMonth[b.month] = byMonth[b.month] || { add: 0, sum: 0, skip: 0, mark: 0, replace: 0 };
  res.forEach((r) => {
    const m = byMonth[r.plan.month];
    if (r.kind === 'add' || r.kind === 'replace') {
      m.add += 1;
      m.sum += r.plan.amount;
      if (r.kind === 'replace') m.replace += 1;
    } else if (r.kind === 'markPaid') m.mark += 1;
    else m.skip += 1;
  });
  return {
    lines: res,
    add,
    markPaid: pick('markPaid'),
    replace: pick('replace'),
    keep: pick('keep'),
    same: pick('same'),
    byMonth,
    months: Object.keys(byMonth).sort(),
    changes: add.length + res.filter((r) => r.kind === 'markPaid' || r.kind === 'replace').length,
  };
}

export function applyImport(app, blocks, makeId, planId, now = new Date().toISOString(), opts = {}) {
  const pv = previewImport(app, blocks, opts);
  const drop = new Set(pv.replace.map((r) => r.existing.id));
  const mark = new Set(pv.markPaid.map((r) => r.existing.id));
  // старый «постоянный», совпавший со строкой плана, становится строкой плана — чистка его не тронет
  const adopt = new Set([...pv.markPaid, ...pv.same].filter((r) => replaceable(r.existing)).map((r) => r.existing.id));
  const added = [...pv.add, ...pv.replace.map((r) => r.plan)].map((x) => ({
    id: makeId(),
    date: x.date,
    amount: x.amount,
    title: x.title,
    status: x.paid ? 'paid' : null,
    src: 'plan',
  }));
  return {
    ...app,
    expenses: [
      ...app.expenses
        .filter((e) => !drop.has(e.id))
        .map((e) =>
          mark.has(e.id) || adopt.has(e.id)
            ? { ...e, ...(mark.has(e.id) ? { status: 'paid' } : {}), ...(adopt.has(e.id) ? { src: 'plan' } : {}) }
            : e
        ),
      ...added,
    ],
    // отметка встроенного плана — только для подписи в настройках; импорт из заметок её не трогает
    ...(planId ? { plan: { id: planId, importedAt: now, added: added.length } } : {}),
  };
}

/**
 * Расходы, которые сами добавила старая функция «Постоянные платежи» (её больше нет).
 * Отличить их от введённых вручную можно только по совпадению с правилом из state.recurring:
 * type 'recurring', то же название, та же сумма и тот же день месяца, без src (не импорт),
 * без переноса и без правки (edited). Берём только неоплаченные — отмеченные ✓ остаются.
 * Если правило удалено, его расходы так уже не отличить — их не трогаем.
 */
export function autoAddedRecurring(app) {
  const rules = Array.isArray(app?.recurring) ? app.recurring : [];
  if (!rules.length) return [];
  return (app.expenses || []).filter(
    (e) =>
      e &&
      e.type === 'recurring' &&
      !e.src &&
      !e.movedFrom &&
      !e.edited &&
      e.status !== 'paid' &&
      typeof e.date === 'string' &&
      rules.some(
        (r) => r.title === e.title && Number(r.amount) === Number(e.amount) && Number(r.day) === Number(e.date.slice(8, 10))
      )
  );
}

/** Автодобавленные, которые останутся после этого импорта (не совпали ни с одной строкой плана). */
export function autoAddedLeft(app, pv) {
  const covered = new Set(pv.lines.filter((r) => r.existing).map((r) => r.existing.id));
  return autoAddedRecurring(app).filter((e) => !covered.has(e.id));
}

/** Удалить перечисленные автодобавленные расходы (по id). */
export function removeExpenses(app, ids) {
  const set = new Set(ids);
  if (!set.size) return app;
  return { ...app, expenses: app.expenses.filter((e) => !set.has(e.id)) };
}

export const monthTitle = (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
export { addDays };
