/**
 * Удаление с возможностью «Отменить» (снэкбар).
 * removeExpense/removeShift возвращают новое состояние и запись для отмены;
 * restoreRemoved возвращает удалённое на то же место (если его ещё нет).
 */
export function removeExpense(app, id) {
  const i = app.expenses.findIndex((x) => x.id === id);
  if (i < 0) return { app, undo: null };
  const item = app.expenses[i];
  return {
    app: { ...app, expenses: app.expenses.filter((x) => x.id !== id) },
    undo: { kind: 'expense', item, index: i },
  };
}

/** Убрать смену; дата попадает в removed (чтобы досев не вернул пустую смену). */
export function removeShift(app, id) {
  const i = app.shifts.findIndex((x) => x.id === id);
  if (i < 0) return { app, undo: null };
  const item = app.shifts[i];
  const removed = app.removed || [];
  const had = removed.includes(item.date);
  return {
    app: { ...app, shifts: app.shifts.filter((x) => x.id !== id), removed: had ? removed : [...removed, item.date] },
    undo: { kind: 'shift', item, index: i, addedRemoved: !had },
  };
}

const insertAt = (list, index, item) => {
  const out = list.slice();
  out.splice(Math.min(Math.max(0, index), out.length), 0, item);
  return out;
};

export function restoreRemoved(app, undo) {
  if (!app || !undo || (!undo.item && undo.kind !== 'series')) return app;
  if (undo.kind === 'expense') {
    if (app.expenses.some((x) => x.id === undo.item.id)) return app;
    return { ...app, expenses: insertAt(app.expenses, undo.index, undo.item) };
  }
  if (undo.kind === 'series') {
    // постоянный платёж: вернуть удалённые расходы серии и правило
    let expenses = app.expenses;
    for (const { item, index } of undo.items || []) {
      if (!expenses.some((x) => x.id === item.id)) expenses = insertAt(expenses, index, item);
    }
    const rules = Array.isArray(app.recurring) ? app.recurring : [];
    const back = (undo.rules || []).filter((r) => !rules.some((x) => x.id === r.id));
    return { ...app, expenses, ...(back.length ? { recurring: [...rules, ...back] } : {}) };
  }
  if (undo.kind === 'shift') {
    if (app.shifts.some((x) => x.id === undo.item.id)) return app;
    let removed = app.removed || [];
    if (undo.addedRemoved) removed = removed.filter((d) => d !== undo.item.date);
    return { ...app, shifts: insertAt(app.shifts, undo.index, undo.item), removed };
  }
  return app;
}
