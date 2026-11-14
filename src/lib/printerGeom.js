/**
 * Геометрия анимации «принтера» (Смены → печать чека). Чистая функция без React/RN —
 * тесты в tests/printerGeom.test.mjs.
 *
 * Всё, от чего зависит раскладка (высота окна бумаги), считается заранее — пока вкладка открыта
 * и чек уже отрисован скрыто. В момент печати меняются только смещения (translate), без layout.
 *
 * screenH — высота экрана; safeTop — верхний отступ; bottomPad/actionsH/gapAbove — блок кнопок снизу;
 * btnH — высота кнопки-принтера; paperH — измеренная высота чека (0 — ещё не измерен);
 * originY — Y кнопки на экране в момент нажатия (null — неизвестно).
 */
export function printerGeom({ screenH, safeTop, bottomPad, actionsH, gapAbove, btnH, paperH = 0, originY = null }) {
  const destY = Math.round(Math.max(safeTop + 80, screenH - bottomPad - actionsH - gapAbove - btnH));
  const maxEject = Math.max(1, destY - safeTop);
  const h = Number.isFinite(paperH) && paperH > 0 ? Math.round(paperH) : 0;
  const ejectH = h ? Math.max(1, Math.min(h, maxEject)) : maxEject;
  const travel = Number.isFinite(originY) ? destY - Math.round(originY) : 0;
  return { destY, maxEject, ejectH, travel, scrollable: h > ejectH + 1, ready: h > 0 };
}
