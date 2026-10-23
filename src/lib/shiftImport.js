/**
 * Импорт смен из заметки (после parseShifts). Чистые функции — экран и тесты.
 *
 * Для каждой смены заметки (дата + день/ночь):
 *  • в приложении есть смена той же даты и того же времени → «уже есть» или «обновить»:
 *    дописываются только пустые поля — недостача, наставник, место; роль (касса/ряд) — только
 *    у пустой заготовки. Сумму (тем более из «Расчёта») импорт не трогает никогда;
 *  • иначе на эту дату есть пустая заготовка (без суммы, не из расчёта) → она перенимается;
 *  • иначе → новая смена без суммы (сумма придёт из «Расчёта»).
 * «+300» после смены — наставник (поле mentor), НЕ излишек: импорт излишек не создаёт никогда.
 * Старый импорт (до этой правки) записывал «+300» как излишек (shortage −300, imp: 'notes') —
 * такая смена переводится в наставника (излишек убирается).
 * Недостача «с прошлой зп» → state.carry[зарплата блока], если там пусто.
 * clear: пустые заготовки «ночь касса» в периодах блоков на днях, которых нет в заметке, убираются
 * (дата → removed, чтобы не досеялись снова).
 * Повторный импорт той же заметки ничего не меняет.
 */
import { paydayForDate, workPeriod } from './periods.js';
import { adjOf, carryOf, mentorMark, shiftRole, shiftTime } from './shifts.js';

const noAmount = (s) => s.amount === null || s.amount === undefined || s.amount === '';
const linked = (s) => s && s.source === 'calc';
/** Пустая заготовка: без суммы, не из расчёта, без недостачи, не из импорта. */
export const isPlaceholder = (s) => !linked(s) && noAmount(s) && !adjOf(s) && !mentorMark(s) && !s.place && !s.imp;

/**
 * @returns {{
 *   rows: { p, kind: 'add'|'shortage'|'update'|'same', existing, patch, conflict, sameDate }[],
 *     (patch.shortage === null — убрать поле: старый «излишек» из импорта стал наставником)
 *   carry: { payday, value, kind: 'add'|'same', existing }[],
 *   clear: object[],
 *   paydays: { payday, count, short, mentor, carry, add, upd, same }[],
 *   changes: number,
 * }}
 */
export function previewShiftImport(state, parsed, { clear = true } = {}) {
  const shifts = (state && state.shifts) || [];
  const used = new Set();
  const rows = [];
  const all = (parsed?.blocks || []).flatMap((b) => b.shifts);
  const byDate = {};
  for (const p of all) (byDate[p.date] = byDate[p.date] || []).push(p);

  for (const d of Object.keys(byDate).sort()) {
    const ps = byDate[d];
    const ex = shifts.filter((s) => s && s.date === d);
    const match = new Map();
    // 1) та же дата и то же время; при нескольких — с той же ролью
    for (const p of ps) {
      const c = ex.filter((s) => !used.has(s.id) && shiftTime(s) === p.time);
      const e = c.find((s) => shiftRole(s) === p.role) || c[0];
      if (e) {
        used.add(e.id);
        match.set(p, e);
      }
    }
    // 2) пустая заготовка этой даты (другого времени) — перенять
    for (const p of ps) {
      if (match.has(p)) continue;
      const e = ex.find((s) => !used.has(s.id) && isPlaceholder(s));
      if (e) {
        used.add(e.id);
        match.set(p, e);
      }
    }
    for (const p of ps) {
      const e = match.get(p);
      if (!e) {
        rows.push({ p, kind: 'add', existing: null, patch: null, conflict: null, sameDate: ex.filter((s) => !used.has(s.id)) });
        continue;
      }
      const patch = {};
      if (isPlaceholder(e)) {
        if (e.title !== p.title) patch.title = p.title;
      }
      if (p.place && !e.place) patch.place = p.place;
      let conflict = null;
      const pm = p.mentor || 0;
      // старый импорт: «+N» записан как излишек −N → это наставник, излишек убрать
      const legacy = pm && e.imp === 'notes' && adjOf(e) === -pm && !mentorMark(e);
      if (legacy) patch.shortage = null;
      if (p.adj) {
        const a = adjOf(e);
        if (!a) patch.shortage = p.adj;
        else if (a !== p.adj) conflict = { app: a, note: p.adj };
      }
      if (pm) {
        const m = mentorMark(e);
        if (!m) patch.mentor = pm;
        else if (m !== pm) conflict = conflict || { mentor: m, note: pm };
      }
      // роль не совпала у «настоящей» смены (с суммой / из расчёта / из импорта) — не трогаем, только показываем
      if (!isPlaceholder(e) && shiftRole(e) && shiftRole(e) !== p.role) conflict = conflict || { role: e.title };
      const n = Object.keys(patch).length;
      if (n && !e.imp) patch.imp = 'notes';
      rows.push({
        p,
        kind: !n ? 'same' : patch.shortage ? 'shortage' : 'update',
        existing: e,
        patch: n ? patch : null,
        conflict,
        sameDate: [],
      });
    }
  }

  const carry = [];
  for (const b of parsed?.blocks || []) {
    if (!b.carry) continue;
    const cur = carryOf(state, b.payday);
    carry.push({ payday: b.payday, value: b.carry, kind: cur ? 'same' : 'add', existing: cur || 0 });
  }

  const toClear = [];
  if (clear) {
    const noteDates = new Set(all.map((p) => p.date));
    for (const b of parsed?.blocks || []) {
      const per = workPeriod(b.payday);
      for (const s of shifts) {
        if (s.date >= per.start && s.date <= per.end && !noteDates.has(s.date) && isPlaceholder(s) && s.title === 'ночь касса' && !used.has(s.id))
          toClear.push(s);
      }
    }
  }

  const P = {};
  const get = (p) => P[p] || (P[p] = { payday: p, count: 0, short: 0, mentor: 0, carry: 0, add: 0, upd: 0, same: 0, clear: 0 });
  for (const r of rows) {
    const g = get(paydayForDate(r.p.date));
    g.count += 1;
    if (r.p.adj > 0) g.short += r.p.adj;
    if (r.p.mentor) g.mentor += r.p.mentor;
    if (r.kind === 'add') g.add += 1;
    else if (r.kind === 'same') g.same += 1;
    else g.upd += 1;
  }
  for (const c of carry) get(c.payday).carry += c.value;
  for (const s of toClear) get(paydayForDate(s.date)).clear += 1;
  const changes =
    rows.filter((r) => r.kind !== 'same').length + carry.filter((c) => c.kind === 'add').length + toClear.length;
  return {
    rows,
    carry,
    clear: toClear,
    paydays: Object.values(P).sort((a, b) => a.payday.localeCompare(b.payday)),
    changes,
  };
}

/** Применить импорт (то же правило, что в превью). Тот же объект, если менять нечего. */
export function applyShiftImport(state, parsed, makeId, opts = {}) {
  const pv = previewShiftImport(state, parsed, opts);
  if (!pv.changes) return state;
  const patches = new Map(pv.rows.filter((r) => r.patch).map((r) => [r.existing.id, r.patch]));
  const drop = new Set(pv.clear.map((s) => s.id));
  const applyPatch = (s, pt) => {
    const o = { ...s, ...pt };
    if (pt.shortage === null) delete o.shortage;
    return o;
  };
  let shifts = state.shifts.filter((s) => !drop.has(s.id)).map((s) => (patches.has(s.id) ? applyPatch(s, patches.get(s.id)) : s));
  const added = new Set();
  for (const r of pv.rows) {
    if (r.kind !== 'add') continue;
    const p = r.p;
    const s = { id: makeId(), date: p.date, title: p.title, amount: null, payday: paydayForDate(p.date), imp: 'notes' };
    if (p.place) s.place = p.place;
    if (p.adj > 0) s.shortage = p.adj;
    if (p.mentor) s.mentor = p.mentor;
    shifts.push(s);
    added.add(p.date);
  }
  let removed = Array.isArray(state.removed) ? state.removed.filter((d) => !added.has(d)) : [];
  for (const s of pv.clear) if (!removed.includes(s.date)) removed.push(s.date);
  let carry = state.carry && typeof state.carry === 'object' ? state.carry : undefined;
  for (const c of pv.carry) {
    if (c.kind !== 'add') continue;
    carry = { ...(carry || {}), [c.payday]: c.value };
  }
  const next = { ...state, shifts, removed };
  if (carry) next.carry = carry;
  return next;
}
