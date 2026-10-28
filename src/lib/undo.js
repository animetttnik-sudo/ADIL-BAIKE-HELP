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
  if (!app || !undo || !undo.item) return app;
  if (undo.kind === 'expense') {
    if (app.expenses.some((x) => x.id === undo.item.id)) return app;
    return { ...app, expenses: insertAt(app.expenses, undo.index, undo.item) };
  }
  if (undo.kind === 'shift') {
    if (app.shifts.some((x) => x.id === undo.item.id)) return app;
    let removed = app.removed || [];
    if (undo.addedRemoved) removed = removed.filter((d) => d !== undo.item.date);
    return { ...app, shifts: insertAt(app.shifts, undo.index, undo.item), removed };
  }
  return app;
}
