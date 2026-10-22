/**
 * «Импорт плана»: добавляет расходы из плана (src/lib/plan2026.js) в zp_app_v1.
 * Существующие расходы не трогаем. Формат расхода прежний
 * { id, date, amount, title, type, status } + необязательный src: 'plan'.
 * На уровне состояния — необязательное поле plan { id, importedAt, months }:
 * в эти месяцы seedMonth больше не досеивает «Постоянные платежи»
 * (план — полный список месяца, иначе были бы дубли с другими суммами).
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

/**
 * Что добавится. Дубль — та же дата + сумма + название (без учёта регистра/пробелов:
 * «Вай фай» = «Вайфай»). «Похожий» — то же название и (та же дата, или та же сумма
 * в пределах 7 дней): обычно это уже досеянный постоянный платёж — тоже пропускаем,
 * но показываем в превью. Каждый существующий расход «закрывает» не больше одного пункта.
 */
export function previewImport(app, blocks) {
  const used = new Set();
  const add = [];
  const dups = [];
  const similar = [];
  const existing = app.expenses || [];
  for (const x of planItems(blocks)) {
    const n = normTitle(x.title);
    const exact = existing.find(
      (e) => !used.has(e.id) && od(e) === x.date && Number(e.amount) === x.amount && normTitle(e.title) === n
    );
    if (exact) {
      used.add(exact.id);
      dups.push({ plan: x, existing: exact });
      continue;
    }
    const near = existing.find(
      (e) =>
        !used.has(e.id) &&
        normTitle(e.title) === n &&
        (od(e) === x.date || (Number(e.amount) === x.amount && dayDiff(od(e), x.date) <= 7))
    );
    if (near) {
      used.add(near.id);
      similar.push({ plan: x, existing: near });
      continue;
    }
    add.push(x);
  }
  const byMonth = {};
  for (const b of blocks) byMonth[b.month] = byMonth[b.month] || { add: 0, sum: 0, skip: 0 };
  add.forEach((x) => {
    byMonth[x.month].add += 1;
    byMonth[x.month].sum += x.amount;
  });
  [...dups, ...similar].forEach((d) => (byMonth[d.plan.month].skip += 1));
  return { add, dups, similar, byMonth, months: Object.keys(byMonth).sort() };
}

export function applyImport(app, blocks, makeId, planId, now = new Date().toISOString()) {
  const pv = previewImport(app, blocks);
  const rec = new Set((app.recurring || []).map((r) => normTitle(r.title)));
  const added = pv.add.map((x) => ({
    id: makeId(),
    date: x.date,
    amount: x.amount,
    title: x.title,
    type: rec.has(normTitle(x.title)) ? 'recurring' : 'unexpected',
    status: x.paid ? 'paid' : null,
    src: 'plan',
  }));
  return {
    ...app,
    expenses: [...app.expenses, ...added],
    plan: { id: planId, importedAt: now, months: pv.months, added: added.length },
  };
}

export const monthTitle = (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
export { addDays };
